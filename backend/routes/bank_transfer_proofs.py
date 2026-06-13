"""Bank Transfer Proof — user uploads bank transfer receipt for partial-unlock 40% activation.

Flow:
1. User opens "Pagar por transferencia bancaria" modal → sees treasury IBAN.
2. User uploads proof (image base64) + holder_name + reference + amount.
3. Backend stores in `treasury_transfer_proofs` with status='in_review' + auto TRF-YYYY-XXXXXX.
4. Admin reviews in /admin/bank-transfers panel.
5. Approve → amount is appended to parent partial_unlock's `payments` array (counts toward 2,660 EUR).
6. Reject → user receives notification and can re-submit.

Collection: `treasury_transfer_proofs`
"""
import uuid
import base64
import hashlib
import secrets
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request

from config import db
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification, create_admin_notification
from services.case_codes import generate_case_code


router = APIRouter()

MIN_AMOUNT_EUR = 500.0
MAX_PROOF_BYTES = 5 * 1024 * 1024  # 5 MB
REVIEW_SLA_HOURS = '24-48 h laborables'

TREASURY_BANK_ACCOUNT = {
    'holder': 'LIONSBIT VERIFICACIÓN, S.L.',
    'authorized': 'Juan Gómez',
    'bank': 'BBVA España',
    'iban': 'ES79 0182 1234 5612 3456 7890',
    'bic': 'BBVAESMMXXX',
    'country': 'España',
    'currency': 'EUR',
    'reference_hint': 'Incluya su código TRF o nombre completo en el concepto',
    'review_sla': REVIEW_SLA_HOURS,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gen_tracking_ref() -> str:
    year = datetime.now(timezone.utc).year
    n = ''.join(secrets.choice('0123456789') for _ in range(6))
    return f'TRF-{year}-{n}'


def _hash_proof(b64: str) -> str:
    # ignore data URL prefix
    raw = b64.split(',')[-1][:4096]  # first 4kb is enough for fingerprint
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def _client_ip(req: Optional[Request]) -> Optional[str]:
    if not req:
        return None
    fwd = req.headers.get('x-forwarded-for') or req.headers.get('x-real-ip')
    if fwd:
        return fwd.split(',')[0].strip()
    return req.client.host if req.client else None


# ──────────────────────── USER ROUTES ────────────────────────

@router.get("/bank-transfer-proofs/treasury-account")
async def get_treasury_account(user: dict = Depends(get_current_user)):
    return TREASURY_BANK_ACCOUNT


@router.get("/bank-transfer-proofs/me")
async def list_my_proofs(user: dict = Depends(get_current_user)):
    cursor = db.treasury_transfer_proofs.find(
        {'user_id': user['id']},
        sort=[('submitted_at', -1)],
    )
    proofs = []
    async for p in cursor:
        proofs.append({
            'id': p.get('id'),
            'tracking_ref': p.get('tracking_ref'),
            'case_code': p.get('case_code'),
            'amount_eur': p.get('amount_eur'),
            'holder_name': p.get('holder_name'),
            'reference': p.get('reference'),
            'status': p.get('status'),
            'reject_reason': p.get('reject_reason'),
            'proof_filename': p.get('proof_filename'),
            'proof_mime': p.get('proof_mime'),
            'submitted_at': p.get('submitted_at'),
            'reviewed_at': p.get('reviewed_at'),
            'unlock_id': p.get('unlock_id'),
        })
    return {'proofs': proofs}


@router.get("/bank-transfer-proofs/me/{proof_id}/file")
async def user_download_own_proof(proof_id: str, user: dict = Depends(get_current_user)):
    p = await db.treasury_transfer_proofs.find_one({'id': proof_id, 'user_id': user['id']})
    if not p:
        raise HTTPException(404, 'No encontrado')
    return {
        'proof_b64': p.get('proof_b64'),
        'proof_mime': p.get('proof_mime'),
        'proof_filename': p.get('proof_filename'),
    }


@router.post("/bank-transfer-proofs/submit")
async def submit_proof(payload: dict, request: Request, user: dict = Depends(get_current_user)):
    """User submits a bank transfer proof toward the 2,660 EUR activation."""
    amount = payload.get('amount_eur')
    holder = (payload.get('holder_name') or '').strip()
    reference = (payload.get('reference') or '').strip()
    proof_b64 = (payload.get('proof_b64') or '').strip()
    proof_mime = (payload.get('proof_mime') or 'image/jpeg').strip()
    proof_filename = (payload.get('proof_filename') or 'comprobante').strip()

    try:
        amount_f = float(amount)
    except (TypeError, ValueError):
        raise HTTPException(400, 'Monto inválido')
    if amount_f < MIN_AMOUNT_EUR:
        raise HTTPException(400, f'El monto mínimo es €{int(MIN_AMOUNT_EUR)}')
    if not holder or len(holder) < 3:
        raise HTTPException(400, 'Nombre del titular obligatorio')
    if not reference or len(reference) < 2:
        raise HTTPException(400, 'Referencia obligatoria')
    if not proof_b64:
        raise HTTPException(400, 'Comprobante requerido')

    try:
        raw = base64.b64decode(proof_b64.split(',')[-1])
    except Exception:
        raise HTTPException(400, 'Comprobante con formato inválido')
    if len(raw) > MAX_PROOF_BYTES:
        raise HTTPException(400, 'Comprobante supera 5MB')

    # ── Duplicate detection ──
    proof_hash = _hash_proof(proof_b64)
    existing = await db.treasury_transfer_proofs.find_one({
        'user_id': user['id'],
        'proof_hash': proof_hash,
        'status': {'$in': ['in_review', 'approved']},
    })
    if existing:
        raise HTTPException(
            409,
            f'Ya existe una solicitud en revisión con este mismo comprobante (Ref: {existing.get("tracking_ref")}).',
        )

    record = await db.partial_withdraw_unlocks.find_one(
        {'user_id': user['id'], 'status': {'$in': ['pending_payment', 'in_review']}},
        sort=[('created_at', -1)],
    )
    if not record:
        raise HTTPException(404, 'No hay una solicitud activa de desbloqueo')

    now = _now_iso()
    proof_id = str(uuid.uuid4())
    tracking_ref = _gen_tracking_ref()

    # Ensure uniqueness of tracking_ref (extremely unlikely collision, but cheap)
    for _ in range(3):
        if not await db.treasury_transfer_proofs.find_one({'tracking_ref': tracking_ref}):
            break
        tracking_ref = _gen_tracking_ref()

    case_code = await generate_case_code(
        entity_type='bank_transfer_proof',
        entity_id=proof_id,
        user_id=user['id'],
        user_email=user.get('email'),
        summary=f'Transferencia bancaria · €{amount_f:.2f} EUR',
    )

    ip = _client_ip(request)
    ua = (request.headers.get('user-agent') or '')[:300]

    doc = {
        'id': proof_id,
        'tracking_ref': tracking_ref,
        'user_id': user['id'],
        'user_email': user.get('email'),
        'user_name': user.get('full_name') or user.get('name'),
        'unlock_id': record['id'],
        'amount_eur': round(amount_f, 2),
        'holder_name': holder,
        'reference': reference,
        'proof_b64': proof_b64,
        'proof_mime': proof_mime,
        'proof_filename': proof_filename,
        'proof_hash': proof_hash,
        'status': 'in_review',
        'reject_reason': None,
        'case_code': case_code,
        'submitted_at': now,
        'updated_at': now,
        'audit': {
            'submitted_ip': ip,
            'submitted_ua': ua,
            'submitted_at': now,
        },
    }
    await db.treasury_transfer_proofs.insert_one(doc)

    # Notifications
    try:
        await create_admin_notification(
            title='Nuevo comprobante de transferencia bancaria',
            message=f'{user.get("email")} envió €{amount_f:.2f} EUR · {tracking_ref}',
            link='/admin/bank-transfers',
            severity='info',
        )
    except Exception:
        pass
    try:
        await create_notification(
            user_id=user['id'],
            title='Comprobante recibido',
            message=f'Hemos recibido tu transferencia ({tracking_ref}). Tiempo estimado de validación: {REVIEW_SLA_HOURS}.',
            link='/withdraw',
            severity='info',
        )
    except Exception:
        pass

    return {
        'ok': True,
        'proof_id': proof_id,
        'tracking_ref': tracking_ref,
        'case_code': case_code,
        'status': 'in_review',
        'review_sla': REVIEW_SLA_HOURS,
    }


# ──────────────────────── ADMIN ROUTES ────────────────────────

@router.get("/admin/bank-transfer-proofs")
async def admin_list(
    status: Optional[str] = None,
    q: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user: dict = Depends(get_admin_user),
):
    query: dict = {}
    if status:
        query['status'] = status
    if amount_min is not None:
        query.setdefault('amount_eur', {})['$gte'] = float(amount_min)
    if amount_max is not None:
        query.setdefault('amount_eur', {})['$lte'] = float(amount_max)
    if date_from:
        query.setdefault('submitted_at', {})['$gte'] = date_from
    if date_to:
        query.setdefault('submitted_at', {})['$lte'] = date_to
    if q:
        rx = {'$regex': q, '$options': 'i'}
        query['$or'] = [
            {'user_email': rx},
            {'user_name': rx},
            {'tracking_ref': rx},
            {'case_code': rx},
            {'reference': rx},
            {'holder_name': rx},
        ]

    cursor = db.treasury_transfer_proofs.find(query, sort=[('submitted_at', -1)]).limit(500)
    out: List[dict] = []
    async for p in cursor:
        out.append({
            'id': p.get('id'),
            'tracking_ref': p.get('tracking_ref'),
            'case_code': p.get('case_code'),
            'user_id': p.get('user_id'),
            'user_email': p.get('user_email'),
            'user_name': p.get('user_name'),
            'unlock_id': p.get('unlock_id'),
            'amount_eur': p.get('amount_eur'),
            'holder_name': p.get('holder_name'),
            'reference': p.get('reference'),
            'proof_mime': p.get('proof_mime'),
            'proof_filename': p.get('proof_filename'),
            'status': p.get('status'),
            'reject_reason': p.get('reject_reason'),
            'submitted_at': p.get('submitted_at'),
            'reviewed_at': p.get('reviewed_at'),
            'reviewed_by_email': p.get('reviewed_by_email'),
            'audit': p.get('audit'),
        })
    return {'proofs': out, 'total': len(out)}


@router.get("/admin/bank-transfer-proofs/{proof_id}/file")
async def admin_get_file(proof_id: str, user: dict = Depends(get_admin_user)):
    p = await db.treasury_transfer_proofs.find_one({'id': proof_id})
    if not p:
        raise HTTPException(404, 'No encontrado')
    return {
        'proof_b64': p.get('proof_b64'),
        'proof_mime': p.get('proof_mime'),
        'proof_filename': p.get('proof_filename'),
    }


@router.post("/admin/bank-transfer-proofs/{proof_id}/approve")
async def admin_approve(proof_id: str, request: Request, user: dict = Depends(get_admin_user)):
    p = await db.treasury_transfer_proofs.find_one({'id': proof_id})
    if not p:
        raise HTTPException(404, 'Comprobante no encontrado')
    if p.get('status') != 'in_review':
        raise HTTPException(400, f'Estado inválido: {p.get("status")}')

    now = _now_iso()
    amount_eur = float(p.get('amount_eur') or 0)
    unlock_id = p.get('unlock_id')
    ip = _client_ip(request)

    payment_entry = {
        'id': str(uuid.uuid4()),
        'amount_eur': amount_eur,
        'tx_hash': f'BANK-{p.get("tracking_ref") or proof_id[:8].upper()}',
        'method': 'bank_transfer',
        'bank_transfer_proof_id': proof_id,
        'tracking_ref': p.get('tracking_ref'),
        'holder_name': p.get('holder_name'),
        'reference': p.get('reference'),
        'submitted_at': p.get('submitted_at'),
        'approved_at': now,
        'approved_by': user.get('id'),
    }
    unlock = await db.partial_withdraw_unlocks.find_one({'id': unlock_id})
    if unlock:
        existing = unlock.get('payments') or []
        new_total = sum(float(x.get('amount_eur') or 0) for x in existing) + amount_eur
        from routes.partial_unlock import REQUIRED_EUR
        completed = new_total + 0.01 >= REQUIRED_EUR

        update: dict = {
            '$push': {'payments': payment_entry},
            '$set': {'updated_at': now},
        }
        if completed and unlock.get('status') == 'pending_payment':
            in_review_count = await db.partial_withdraw_unlocks.count_documents({'status': 'in_review'})
            update['$set'].update({'status': 'in_review', 'priority_rank': in_review_count + 1})

        await db.partial_withdraw_unlocks.update_one({'id': unlock_id}, update)

    audit_patch = {
        'audit.approved_at': now,
        'audit.approved_by': user.get('id'),
        'audit.approved_by_email': user.get('email'),
        'audit.approved_ip': ip,
    }
    await db.treasury_transfer_proofs.update_one(
        {'id': proof_id},
        {'$set': {
            'status': 'approved',
            'reviewed_at': now,
            'reviewed_by': user.get('id'),
            'reviewed_by_email': user.get('email'),
            'updated_at': now,
            **audit_patch,
        }},
    )

    try:
        await create_notification(
            user_id=p['user_id'],
            title='Transferencia aprobada',
            message=f'Tu transferencia de €{amount_eur:.2f} ({p.get("tracking_ref")}) fue aprobada y aplicada a tu desbloqueo.',
            link='/withdraw',
            severity='success',
        )
    except Exception:
        pass

    return {'ok': True, 'status': 'approved'}


@router.post("/admin/bank-transfer-proofs/{proof_id}/reject")
async def admin_reject(proof_id: str, request: Request, payload: Optional[dict] = None, user: dict = Depends(get_admin_user)):
    p = await db.treasury_transfer_proofs.find_one({'id': proof_id})
    if not p:
        raise HTTPException(404, 'Comprobante no encontrado')
    if p.get('status') != 'in_review':
        raise HTTPException(400, f'Estado inválido: {p.get("status")}')

    reason = ((payload or {}).get('reason') or '').strip()
    if not reason or len(reason) < 5:
        raise HTTPException(400, 'Motivo de rechazo obligatorio (mínimo 5 caracteres)')

    now = _now_iso()
    ip = _client_ip(request)
    await db.treasury_transfer_proofs.update_one(
        {'id': proof_id},
        {'$set': {
            'status': 'rejected',
            'reject_reason': reason,
            'reviewed_at': now,
            'reviewed_by': user.get('id'),
            'reviewed_by_email': user.get('email'),
            'updated_at': now,
            'audit.rejected_at': now,
            'audit.rejected_by': user.get('id'),
            'audit.rejected_by_email': user.get('email'),
            'audit.rejected_ip': ip,
            'audit.rejected_reason': reason,
        }},
    )

    try:
        await create_notification(
            user_id=p['user_id'],
            title='Transferencia rechazada',
            message=f'Tu transferencia ({p.get("tracking_ref")}) fue rechazada. Motivo: {reason}. Puedes subir un nuevo comprobante.',
            link='/withdraw',
            severity='warning',
        )
    except Exception:
        pass

    return {'ok': True, 'status': 'rejected'}
