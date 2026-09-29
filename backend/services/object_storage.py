"""Emergent Object Storage: secure file & media storage for uploads (KYC, proofs, vault…).

Files are stored at `{APP_NAME}/{kind}/{user_id}/{uuid}.{ext}` and referenced in `db.files`.
Legacy base64 fields keep working: a stored reference is a marker `objstore:{file_id}` and can be
resolved back to bytes / data-URI with `resolve_marker()`.
"""
import base64
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx

from config import db

log = logging.getLogger(__name__)

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "paylionsbit"
MARKER = 'objstore:'
MAX_BYTES = 12 * 1024 * 1024

MIME_EXT = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv', 'application/json': 'json',
}

storage_key: Optional[str] = None


async def init_storage(force: bool = False) -> str:
    global storage_key
    if storage_key and not force:
        return storage_key
    if not EMERGENT_KEY:
        raise RuntimeError('EMERGENT_LLM_KEY no configurada')
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY})
        r.raise_for_status()
        storage_key = r.json()["storage_key"]
    log.info('[objstore] storage initialized')
    return storage_key


async def _put(path: str, data: bytes, content_type: str) -> dict:
    key = await init_storage()
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, content=data)
        if r.status_code == 404:
            key = await init_storage(force=True)
            r = await client.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, content=data)
        r.raise_for_status()
        return r.json()


async def _get(path: str) -> tuple[bytes, str]:
    key = await init_storage()
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key})
        if r.status_code == 404:
            key = await init_storage(force=True)
            r = await client.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key})
        r.raise_for_status()
        return r.content, r.headers.get("Content-Type", "application/octet-stream")


def decode_data_uri(value: str) -> tuple[bytes, str]:
    """Accept a data-URI or raw base64. Returns (bytes, mime)."""
    mime = 'application/octet-stream'
    b64 = value.strip()
    if b64.startswith('data:') and ',' in b64:
        header, b64 = b64.split(',', 1)
        mime = header[5:].split(';', 1)[0] or mime
    return base64.b64decode(b64), mime


async def store_bytes(data: bytes, content_type: str, *, user_id: str, kind: str, original_name: str = '',
                      source: str = '', ref_id: str = '') -> dict:
    """Upload bytes to object storage and register the file. Returns the `files` record."""
    if len(data) > MAX_BYTES:
        raise ValueError(f'Archivo demasiado grande (máx {MAX_BYTES // (1024 * 1024)} MB)')
    ext = MIME_EXT.get(content_type) or (original_name.rsplit('.', 1)[-1].lower() if '.' in original_name else 'bin')
    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/{kind}/{user_id}/{file_id}.{ext}"
    result = await _put(path, data, content_type or 'application/octet-stream')
    record = {
        'id': file_id,
        'user_id': user_id,
        'kind': kind,
        'source': source,
        'ref_id': ref_id,
        'storage_path': result.get('path', path),
        'original_filename': original_name or f'{file_id}.{ext}',
        'content_type': content_type or 'application/octet-stream',
        'size': result.get('size', len(data)),
        'etag': result.get('etag'),
        'is_deleted': False,
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    await db.files.insert_one({**record})
    record.pop('_id', None)
    return record


async def store_data_uri(value: str, **kw) -> dict:
    data, mime = decode_data_uri(value)
    return await store_bytes(data, mime, **kw)


def marker(file_id: str) -> str:
    return f'{MARKER}{file_id}'


def is_marker(value) -> bool:
    return isinstance(value, str) and value.startswith(MARKER)


async def get_file_record(file_id: str) -> Optional[dict]:
    return await db.files.find_one({'id': file_id, 'is_deleted': False}, {'_id': 0})


async def read_file(file_id: str) -> tuple[bytes, str, dict]:
    rec = await get_file_record(file_id)
    if not rec:
        raise FileNotFoundError(file_id)
    data, ct = await _get(rec['storage_path'])
    return data, rec.get('content_type') or ct, rec


async def resolve_marker(value, as_data_uri: bool = True):
    """If `value` is an objstore marker, fetch it and return a data-URI (or bytes). Otherwise return as-is."""
    if not is_marker(value):
        return value
    data, ct, _ = await read_file(value[len(MARKER):])
    if not as_data_uri:
        return data
    return f"data:{ct};base64,{base64.b64encode(data).decode('ascii')}"


async def soft_delete(file_id: str, by: str) -> bool:
    r = await db.files.update_one({'id': file_id, 'is_deleted': False},
                                  {'$set': {'is_deleted': True, 'deleted_at': datetime.now(timezone.utc).isoformat(), 'deleted_by': by}})
    return r.modified_count > 0
