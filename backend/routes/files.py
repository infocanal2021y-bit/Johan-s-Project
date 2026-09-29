"""Secure file delivery for Emergent Object Storage (owner or admin only)."""
import base64
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
import jwt

from config import db
from services.auth import get_current_user, get_admin_user, JWT_SECRET, JWT_ALGORITHM
from services import object_storage as objstore

router = APIRouter()
ADMIN_ROLES = ('admin', 'superadmin')


async def _user_from_header_or_query(authorization: Optional[str], auth: Optional[str]) -> dict:
    token = None
    if authorization and authorization.lower().startswith('bearer '):
        token = authorization.split(' ', 1)[1]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(401, 'No autenticado')
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(401, 'Token inválido o caducado')
    user = await db.users.find_one({'id': payload.get('user_id')}, {'_id': 0, 'id': 1, 'role': 1, 'email': 1})
    if not user:
        raise HTTPException(401, 'Usuario no encontrado')
    return user


def _authorize(rec: dict, user: dict):
    if rec['user_id'] != user['id'] and user.get('role') not in ADMIN_ROLES:
        raise HTTPException(403, 'Sin permiso para este archivo')


@router.get('/files/{file_id}')
async def download_file(file_id: str, authorization: Optional[str] = Header(None), auth: Optional[str] = Query(None),
                        download: bool = Query(False)):
    """Streams the file. Accepts `Authorization: Bearer` or `?auth=<jwt>` (for <img src>)."""
    user = await _user_from_header_or_query(authorization, auth)
    rec = await objstore.get_file_record(file_id)
    if not rec:
        raise HTTPException(404, 'Archivo no encontrado')
    _authorize(rec, user)
    try:
        data, ct, _ = await objstore.read_file(file_id)
    except Exception:
        raise HTTPException(503, 'Almacenamiento no disponible en este momento')
    headers = {'Cache-Control': 'private, max-age=300'}
    if download:
        headers['Content-Disposition'] = f'attachment; filename="{rec["original_filename"]}"'
    return Response(content=data, media_type=ct, headers=headers)


@router.get('/files/{file_id}/data-uri')
async def file_data_uri(file_id: str, user: dict = Depends(get_current_user)):
    rec = await objstore.get_file_record(file_id)
    if not rec:
        raise HTTPException(404, 'Archivo no encontrado')
    _authorize(rec, user)
    data, ct, _ = await objstore.read_file(file_id)
    return {'id': file_id, 'filename': rec['original_filename'], 'content_type': ct, 'size': rec['size'],
            'data_uri': f"data:{ct};base64,{base64.b64encode(data).decode('ascii')}"}


@router.get('/files/{file_id}/meta')
async def file_meta(file_id: str, user: dict = Depends(get_current_user)):
    rec = await objstore.get_file_record(file_id)
    if not rec:
        raise HTTPException(404, 'Archivo no encontrado')
    _authorize(rec, user)
    return rec


@router.get('/admin/files')
async def admin_list_files(kind: Optional[str] = None, user_id: Optional[str] = None, limit: int = Query(100, le=500),
                           admin: dict = Depends(get_admin_user)):
    flt = {'is_deleted': False}
    if kind:
        flt['kind'] = kind
    if user_id:
        flt['user_id'] = user_id
    items = await db.files.find(flt, {'_id': 0}).sort('created_at', -1).limit(limit).to_list(length=limit)
    total_size = sum(int(i.get('size') or 0) for i in items)
    return {'items': items, 'count': len(items), 'total_size': total_size}


@router.delete('/admin/files/{file_id}')
async def admin_delete_file(file_id: str, admin: dict = Depends(get_admin_user)):
    if not await objstore.soft_delete(file_id, admin.get('email')):
        raise HTTPException(404, 'Archivo no encontrado')
    return {'ok': True}
