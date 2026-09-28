"""Transacciones autorizadas: listado para todos los usuarios + controles admin."""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from services.auth import get_current_user, get_admin_user
from services import authorized_transactions as svc

router = APIRouter()


@router.get("/authorized-transactions")
async def list_authorized_transactions(user: dict = Depends(get_current_user)):
    items = await db.authorized_transactions.find(
        {}, {'_id': 0, 'id': 1, 'sequence': 1, 'username': 1, 'status': 1, 'status_label': 1,
             'authorized_amount': 1, 'paid_amount': 1, 'currency': 1, 'published_at': 1},
    ).sort('sequence', 1).to_list(length=svc.TOTAL_PLANNED)
    data = await svc.summary()
    data['items'] = items
    if user.get('role') not in ('admin', 'superadmin'):
        data['config'] = {'next_batch_at': data['config'].get('next_batch_at')}
    return data


class ConfigPatch(BaseModel):
    paused: Optional[bool] = None
    batch_size: Optional[int] = None
    interval_hours: Optional[float] = None
    next_batch_at: Optional[str] = None


@router.get("/admin/authorized-transactions/config")
async def admin_get_config(admin: dict = Depends(get_admin_user)):
    return await svc.summary()


@router.put("/admin/authorized-transactions/config")
async def admin_update_config(patch: ConfigPatch, admin: dict = Depends(get_admin_user)):
    upd = {}
    if patch.paused is not None:
        upd['paused'] = patch.paused
    if patch.batch_size is not None:
        if not 1 <= patch.batch_size <= 10:
            raise HTTPException(400, 'batch_size debe estar entre 1 y 10')
        upd['batch_size'] = patch.batch_size
    if patch.interval_hours is not None:
        if not 1 <= patch.interval_hours <= 168:
            raise HTTPException(400, 'interval_hours debe estar entre 1 y 168')
        upd['interval_hours'] = patch.interval_hours
    if patch.next_batch_at is not None:
        try:
            datetime.fromisoformat(patch.next_batch_at.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(400, 'next_batch_at inválido (ISO 8601)')
        upd['next_batch_at'] = patch.next_batch_at.replace('Z', '+00:00')
    if not upd:
        raise HTTPException(400, 'Nada que actualizar')
    upd['updated_by'] = admin.get('email')
    await svc.save_config(upd)
    return await svc.summary()


@router.post("/admin/authorized-transactions/publish-now")
async def admin_publish_now(admin: dict = Depends(get_admin_user)):
    created = await svc.publish_next_batch(force=True)
    if not created:
        raise HTTPException(400, 'Ya se incorporaron los 70 usuarios')
    data = await svc.summary()
    data['created'] = [c['username'] for c in created]
    return data


@router.post("/admin/authorized-transactions/reset")
async def admin_reset(admin: dict = Depends(get_admin_user)):
    res = await db.authorized_transactions.delete_many({})
    await svc.save_config({'next_batch_at': None, 'last_batch_at': None, 'started_at': None,
                           'updated_by': admin.get('email')})
    return {'ok': True, 'deleted': res.deleted_count}
