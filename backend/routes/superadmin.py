"""Superadministrador: edición sin restricciones del perfil de usuario.

- Solo el rol 'superadmin' accede a estos endpoints.
- Los cambios NO envían emails, notificaciones ni avisos al usuario (silencioso).
- Cada modificación queda registrada en una auditoría interna (superadmin_audit_log)
  con actor, fecha/hora y valores anterior/nuevo por campo.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from config import db
from services.auth import get_superadmin_user, hash_password

router = APIRouter()

FORBIDDEN_FIELDS = {'_id', 'id'}
SENSITIVE_MASK = {'password'}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _display_doc(u: dict) -> dict:
    out = dict(u)
    out.pop('_id', None)
    if 'password' in out:
        out['password'] = '__HASHED__'
    return out


@router.get('/superadmin/users')
async def superadmin_search_users(q: str = Query('', max_length=100),
                                  sa: dict = Depends(get_superadmin_user)):
    query = {}
    if q.strip():
        rx = {'$regex': q.strip(), '$options': 'i'}
        query = {'$or': [{'email': rx}, {'name': rx}, {'id': q.strip()}]}
    rows = await db.users.find(query, {'_id': 0, 'id': 1, 'name': 1, 'email': 1, 'role': 1,
                                       'account_status': 1, 'verification_status': 1}).to_list(20)
    return {'users': rows}


@router.get('/superadmin/users/{user_id}/full')
async def superadmin_user_full(user_id: str, sa: dict = Depends(get_superadmin_user)):
    u = await db.users.find_one({'id': user_id})
    if not u:
        raise HTTPException(404, 'Usuario no encontrado')
    return {'user': _display_doc(u)}


class UpdatesBody(BaseModel):
    updates: Dict[str, Any]
    note: Optional[str] = None


@router.put('/superadmin/users/{user_id}')
async def superadmin_edit_user(user_id: str, body: UpdatesBody,
                               sa: dict = Depends(get_superadmin_user)):
    u = await db.users.find_one({'id': user_id})
    if not u:
        raise HTTPException(404, 'Usuario no encontrado')
    if not body.updates:
        raise HTTPException(400, 'Sin cambios que aplicar.')

    sets, unsets, changes = {}, {}, []
    for field, value in body.updates.items():
        if field in FORBIDDEN_FIELDS:
            raise HTTPException(400, f"El campo '{field}' no puede modificarse.")
        old = u.get(field)
        if field == 'password':
            if not str(value or '').strip():
                continue
            sets['password'] = hash_password(str(value))
            changes.append({'field': 'password', 'old': '***', 'new': '*** (nueva contraseña establecida)'})
            continue
        if value is None and field in u:
            unsets[field] = ''
            changes.append({'field': field, 'old': old, 'new': None})
        else:
            if old == value:
                continue
            sets[field] = value
            changes.append({'field': field, 'old': old, 'new': value})

    if not changes:
        return {'ok': True, 'changes': [], 'message': 'Sin diferencias respecto a los valores actuales.'}

    ops = {}
    if sets:
        ops['$set'] = sets
    if unsets:
        ops['$unset'] = unsets
    await db.users.update_one({'id': user_id}, ops)

    # Auditoría interna únicamente — SIN notificaciones ni emails al usuario
    await db.superadmin_audit_log.insert_one({
        'id': str(uuid.uuid4()),
        'actor_id': sa.get('id'), 'actor_email': sa.get('email'), 'actor_name': sa.get('name'),
        'target_user_id': user_id, 'target_email': u.get('email'), 'target_name': u.get('name'),
        'changes': changes, 'note': (body.note or '').strip(),
        'at': _now(),
    })

    fresh = await db.users.find_one({'id': user_id})
    return {'ok': True, 'changes': changes, 'user': _display_doc(fresh)}


@router.get('/superadmin/audit-log')
async def superadmin_audit_log(user_id: Optional[str] = None, limit: int = Query(50, le=200),
                               sa: dict = Depends(get_superadmin_user)):
    q = {'target_user_id': user_id} if user_id else {}
    rows = await db.superadmin_audit_log.find(q, {'_id': 0}).sort('at', -1).to_list(limit)
    return {'entries': rows}
