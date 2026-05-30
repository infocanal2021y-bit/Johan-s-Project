"""Vault Blockchain · Fase 4.

Simulated blockchain certification for user documents. Each upload generates
an immutable SHA-256 hash + timestamp + an audit chain that links to the
previous document via `chain_prev_hash`, creating a tamper-evident ledger.

In production this would be anchored to a real blockchain (Ethereum, Polygon,
Hedera Hashgraph). For now, the audit chain proves integrity locally:
recomputing the hash of any record's content + prev_hash and comparing to
the stored value detects any tampering.

Status flow: `pending → certified | rejected` (admin-controlled).

Collections:
- vault_documents: {id, user_id, name, category, mime, size_bytes,
  content_b64, sha256, chain_prev_hash, chain_index, status, certified_at,
  certified_by, admin_note, created_at}
"""
import base64
import hashlib
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from config import db
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification


router = APIRouter()
log = logging.getLogger(__name__)


MAX_FILE_BYTES = 8 * 1024 * 1024  # 8 MB
SUPPORTED_CATEGORIES = ['kyc', 'contract', 'proof', 'invoice', 'statement', 'other']
GENESIS_HASH = '0' * 64


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _decode_b64(b64: str) -> bytes:
    """Accept either raw base64 or a data URI (`data:<mime>;base64,...`)."""
    if not b64:
        raise HTTPException(400, 'Archivo vacío')
    if ',' in b64 and b64.lstrip().startswith('data:'):
        b64 = b64.split(',', 1)[1]
    try:
        return base64.b64decode(b64, validate=True)
    except Exception as e:
        raise HTTPException(400, f'Archivo base64 inválido: {e}')


async def _get_last_chain_hash() -> tuple[str, int]:
    """Returns (prev_hash, prev_index). Genesis if no docs yet."""
    last = await db.vault_documents.find_one(
        {}, {'_id': 0, 'sha256': 1, 'chain_index': 1, 'chain_prev_hash': 1},
        sort=[('chain_index', -1)],
    )
    if not last:
        return GENESIS_HASH, -1
    # Chain hash = sha256(prev_chain_hash + sha256_of_content)
    composite = (last.get('chain_prev_hash') or GENESIS_HASH) + last['sha256']
    chain_link = _sha256(composite.encode())
    return chain_link, int(last.get('chain_index', 0))


def _shorten(h: str, prefix: int = 8, suffix: int = 4) -> str:
    return f"{h[:prefix].upper()}…{h[-suffix:].upper()}"


# ══════════════════════════════════════════════════════════════════
#  USER ENDPOINTS
# ══════════════════════════════════════════════════════════════════

@router.post("/vault/documents/upload")
async def upload_document(payload: dict, user: dict = Depends(get_current_user)):
    """Upload a document; server computes SHA-256 + links to chain.

    Body: `{name, category, mime, content_b64}` (b64 may be a data-URI).
    Returns the freshly-created doc (without `content_b64`).
    """
    name = (payload.get('name') or '').strip()[:200]
    category = (payload.get('category') or 'other').lower()
    mime = (payload.get('mime') or 'application/octet-stream')[:120]
    content_b64 = payload.get('content_b64')

    if not name:
        raise HTTPException(400, 'Nombre requerido')
    if category not in SUPPORTED_CATEGORIES:
        raise HTTPException(400, f"Categoría inválida (use: {', '.join(SUPPORTED_CATEGORIES)})")

    raw = _decode_b64(content_b64)
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(400, f'Archivo demasiado grande (máx {MAX_FILE_BYTES // (1024 * 1024)} MB)')
    if len(raw) < 1:
        raise HTTPException(400, 'Archivo vacío')

    sha = _sha256(raw)
    prev_link, prev_idx = await _get_last_chain_hash()

    doc = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'user_email': user.get('email'),
        'user_name': user.get('name'),
        'name': name,
        'category': category,
        'mime': mime,
        'size_bytes': len(raw),
        'content_b64': base64.b64encode(raw).decode('ascii'),
        'sha256': sha,
        'chain_prev_hash': prev_link,
        'chain_index': prev_idx + 1,
        'status': 'pending',
        'certified_at': None,
        'certified_by': None,
        'admin_note': None,
        'created_at': _now_iso(),
    }
    await db.vault_documents.insert_one(doc)

    # Return without content for lightweight responses
    response_doc = {k: v for k, v in doc.items() if k != 'content_b64'}
    response_doc.pop('_id', None)
    response_doc['sha256_short'] = _shorten(sha)
    response_doc['chain_prev_hash_short'] = _shorten(prev_link)

    return {'ok': True, 'document': response_doc}


@router.get("/vault/documents")
async def list_my_documents(user: dict = Depends(get_current_user)):
    cur = db.vault_documents.find(
        {'user_id': user['id']},
        {'_id': 0, 'content_b64': 0},
    ).sort('created_at', -1).limit(200)
    items = await cur.to_list(length=200)
    for it in items:
        it['sha256_short'] = _shorten(it['sha256'])
        it['chain_prev_hash_short'] = _shorten(it.get('chain_prev_hash') or GENESIS_HASH)
    return {'items': items, 'count': len(items)}


@router.get("/vault/documents/{doc_id}")
async def get_document_meta(doc_id: str, user: dict = Depends(get_current_user)):
    doc = await db.vault_documents.find_one(
        {'id': doc_id, 'user_id': user['id']},
        {'_id': 0, 'content_b64': 0},
    )
    if not doc:
        raise HTTPException(404, 'Documento no encontrado')
    doc['sha256_short'] = _shorten(doc['sha256'])
    doc['chain_prev_hash_short'] = _shorten(doc.get('chain_prev_hash') or GENESIS_HASH)
    return doc


@router.get("/vault/documents/{doc_id}/verify")
async def verify_document(doc_id: str, user: dict = Depends(get_current_user)):
    """Recompute SHA-256 of stored content and compare to stored hash.
    Returns `{integrity_ok, computed_hash, stored_hash, certified_at, certified_by}`.
    """
    doc = await db.vault_documents.find_one({'id': doc_id, 'user_id': user['id']})
    if not doc:
        raise HTTPException(404, 'Documento no encontrado')
    raw = base64.b64decode(doc['content_b64'])
    computed = _sha256(raw)
    return {
        'integrity_ok': computed == doc['sha256'],
        'computed_hash': computed,
        'stored_hash': doc['sha256'],
        'chain_prev_hash': doc.get('chain_prev_hash'),
        'chain_index': doc.get('chain_index'),
        'certified_at': doc.get('certified_at'),
        'certified_by': doc.get('certified_by'),
        'verified_at': _now_iso(),
    }


@router.get("/vault/documents/{doc_id}/download")
async def download_document(doc_id: str, user: dict = Depends(get_current_user)):
    """Return the raw file as a data URI for download/preview."""
    doc = await db.vault_documents.find_one({'id': doc_id, 'user_id': user['id']})
    if not doc:
        raise HTTPException(404, 'Documento no encontrado')
    return {
        'name': doc['name'],
        'mime': doc['mime'],
        'data_uri': f"data:{doc['mime']};base64,{doc['content_b64']}",
        'size_bytes': doc['size_bytes'],
    }


# ══════════════════════════════════════════════════════════════════
#  ADMIN
# ══════════════════════════════════════════════════════════════════

@router.get("/admin/vault/documents")
async def admin_list_documents(status: Optional[str] = None, admin: dict = Depends(get_admin_user)):
    q: dict = {}
    if status and status != 'all':
        q['status'] = status
    cur = db.vault_documents.find(q, {'_id': 0, 'content_b64': 0}).sort('created_at', -1).limit(500)
    items = await cur.to_list(length=500)

    counts = {}
    async for row in db.vault_documents.aggregate([{'$group': {'_id': '$status', 'n': {'$sum': 1}}}]):
        counts[row['_id']] = row['n']

    for it in items:
        it['sha256_short'] = _shorten(it['sha256'])
        it['chain_prev_hash_short'] = _shorten(it.get('chain_prev_hash') or GENESIS_HASH)

    return {'items': items, 'counts': counts, 'count': len(items)}


@router.post("/admin/vault/documents/{doc_id}/certify")
async def admin_certify(doc_id: str, payload: dict, admin: dict = Depends(get_admin_user)):
    doc = await db.vault_documents.find_one({'id': doc_id})
    if not doc:
        raise HTTPException(404, 'Documento no encontrado')
    if doc['status'] != 'pending':
        raise HTTPException(400, f"El documento ya está en estado: {doc['status']}")

    note = (payload.get('note') or '').strip()[:300] or None
    now = _now_iso()
    await db.vault_documents.update_one(
        {'id': doc_id},
        {'$set': {
            'status': 'certified',
            'certified_at': now,
            'certified_by': admin.get('email'),
            'certified_by_name': admin.get('name') or admin.get('email'),
            'admin_note': note,
        }},
    )

    try:
        await create_notification(
            doc['user_id'],
            'Documento certificado · Vault',
            f'Tu documento "{doc["name"]}" ha sido certificado e inmutabilizado en el Vault Blockchain. '
            f'Hash: {_shorten(doc["sha256"])}',
        )
    except Exception:
        pass
    return {'ok': True}


@router.post("/admin/vault/documents/{doc_id}/reject")
async def admin_reject(doc_id: str, payload: dict, admin: dict = Depends(get_admin_user)):
    note = (payload.get('note') or '').strip()[:300]
    if not note:
        raise HTTPException(400, 'Motivo de rechazo requerido')

    doc = await db.vault_documents.find_one({'id': doc_id})
    if not doc:
        raise HTTPException(404, 'Documento no encontrado')
    if doc['status'] != 'pending':
        raise HTTPException(400, f"El documento ya está en estado: {doc['status']}")

    now = _now_iso()
    await db.vault_documents.update_one(
        {'id': doc_id},
        {'$set': {
            'status': 'rejected',
            'certified_at': now,
            'certified_by': admin.get('email'),
            'admin_note': note,
        }},
    )
    try:
        await create_notification(
            doc['user_id'],
            'Documento rechazado · Vault',
            f'Tu documento "{doc["name"]}" fue rechazado. Motivo: {note}',
        )
    except Exception:
        pass
    return {'ok': True}


@router.get("/vault/chain/audit")
async def chain_audit(user: dict = Depends(get_current_user)):
    """Public-style audit of the user's documents: returns the chain links
    so an external party can validate integrity without seeing content."""
    cur = db.vault_documents.find(
        {'user_id': user['id']},
        {'_id': 0, 'id': 1, 'name': 1, 'sha256': 1, 'chain_prev_hash': 1,
         'chain_index': 1, 'created_at': 1, 'status': 1, 'certified_at': 1},
    ).sort('chain_index', 1)
    items = await cur.to_list(length=500)
    return {'chain': items, 'count': len(items), 'genesis': GENESIS_HASH}
