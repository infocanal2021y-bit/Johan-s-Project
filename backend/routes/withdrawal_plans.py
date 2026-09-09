"""Planes de retiro programado / dividido por tramos.

El usuario define monto total y frecuencia; el sistema genera tramos de máx.
€15.000 con su calendario. Requiere aprobación admin antes de activarse.
"""
import logging
import math
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from config import db
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification, notify_admins

router = APIRouter()

TRANCHE_MAX_EUR = 15000.0
FREQ_DAYS = {'semanal': 7, 'quincenal': 14, 'mensual': 30}
PLAN_LABELS = {'pendiente_aprobacion': 'Pendiente de aprobación', 'activo': 'Activo',
               'rechazado': 'Rechazado', 'completado': 'Completado', 'cancelado': 'Cancelado'}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_tranches(total: float, frequency: str, start: datetime) -> list:
    n = max(math.ceil(total / TRANCHE_MAX_EUR), 1)
    step = FREQ_DAYS[frequency]
    tranches, remaining = [], total
    for i in range(n):
        amt = min(TRANCHE_MAX_EUR, remaining)
        remaining -= amt
        tranches.append({'n': i + 1, 'amount_eur': round(amt, 2),
                         'due_date': (start + timedelta(days=step * i)).date().isoformat(),
                         'status': 'pendiente', 'executed_at': None, 'executed_by': None})
    return tranches


def _view(p: dict) -> dict:
    p = dict(p)
    p['status_label'] = PLAN_LABELS.get(p['status'], p['status'])
    p['next_tranche'] = next((t for t in p.get('tranches', []) if t['status'] == 'pendiente'), None)
    p['executed_count'] = sum(1 for t in p.get('tranches', []) if t['status'] == 'ejecutado')
    return p


class PlanBody(BaseModel):
    total_eur: float
    frequency: str
    start_date: Optional[str] = None


@router.get('/withdrawal-plan')
async def my_plans(user: dict = Depends(get_current_user)):
    rows = await db.withdrawal_plans.find(
        {'user_id': user['id']}, {'_id': 0}).sort('created_at', -1).to_list(10)
    return {'plans': [_view(p) for p in rows], 'tranche_max_eur': TRANCHE_MAX_EUR}


@router.post('/withdrawal-plan')
async def create_plan(body: PlanBody, user: dict = Depends(get_current_user)):
    if body.total_eur <= 0:
        raise HTTPException(400, 'Monto total inválido.')
    if body.frequency not in FREQ_DAYS:
        raise HTTPException(400, 'Frecuencia inválida: semanal, quincenal o mensual.')
    if await db.withdrawal_plans.find_one(
            {'user_id': user['id'], 'status': {'$in': ['pendiente_aprobacion', 'activo']}}):
        raise HTTPException(400, 'Ya tiene un plan de retiros pendiente o activo.')
    try:
        start = datetime.fromisoformat(body.start_date) if body.start_date \
            else datetime.now(timezone.utc) + timedelta(days=7)
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(400, 'Fecha de inicio inválida.')
    tranches = _build_tranches(body.total_eur, body.frequency, start)
    doc = {'id': str(uuid.uuid4()), 'user_id': user['id'], 'user_name': user.get('name'),
           'user_email': user.get('email'), 'total_eur': round(body.total_eur, 2),
           'tranche_max_eur': TRANCHE_MAX_EUR, 'frequency': body.frequency,
           'start_date': start.date().isoformat(), 'status': 'pendiente_aprobacion',
           'tranches': tranches, 'created_at': _now(), 'approved_by': None,
           'approved_at': None, 'rejection_reason': None}
    await db.withdrawal_plans.insert_one(doc)
    doc.pop('_id', None)
    await notify_admins('Nuevo plan de retiros por tramos',
                        f"{user.get('name')} solicitó un plan de €{body.total_eur:,.2f} "
                        f"en {len(tranches)} tramos ({body.frequency}). Requiere aprobación.")
    await create_notification(user['id'], 'Plan de retiros solicitado',
                              f'Su plan de €{body.total_eur:,.2f} en {len(tranches)} tramos quedó '
                              f'pendiente de aprobación administrativa.', {'type': 'withdrawal_plan'})
    return {'ok': True, 'plan': _view(doc)}


@router.post('/withdrawal-plan/{plan_id}/cancel')
async def cancel_plan(plan_id: str, user: dict = Depends(get_current_user)):
    p = await db.withdrawal_plans.find_one({'id': plan_id, 'user_id': user['id']}, {'_id': 0})
    if not p:
        raise HTTPException(404, 'Plan no encontrado')
    if p['status'] != 'pendiente_aprobacion':
        raise HTTPException(400, 'Solo se pueden cancelar planes pendientes de aprobación.')
    await db.withdrawal_plans.update_one({'id': plan_id}, {'$set': {'status': 'cancelado'}})
    return {'ok': True}


# ── Admin ──

@router.get('/admin/withdrawal-plans')
async def admin_plans(status: Optional[str] = Query(None), admin: dict = Depends(get_admin_user)):
    q = {'status': status} if status else {}
    rows = await db.withdrawal_plans.find(q, {'_id': 0}).sort('created_at', -1).to_list(200)
    return {'plans': [_view(p) for p in rows], 'labels': PLAN_LABELS}


@router.post('/admin/withdrawal-plans/{plan_id}/approve')
async def admin_approve_plan(plan_id: str, admin: dict = Depends(get_admin_user)):
    p = await db.withdrawal_plans.find_one({'id': plan_id}, {'_id': 0})
    if not p:
        raise HTTPException(404, 'Plan no encontrado')
    await db.withdrawal_plans.update_one(
        {'id': plan_id}, {'$set': {'status': 'activo', 'approved_by': admin.get('email'),
                                   'approved_at': _now()}})
    await create_notification(p['user_id'], 'Plan de retiros aprobado',
                              f'Su plan de €{p["total_eur"]:,.2f} en {len(p["tranches"])} tramos fue '
                              f'aprobado. Primer tramo: {p["tranches"][0]["due_date"]}.',
                              {'type': 'withdrawal_plan'})
    return {'ok': True, 'status': 'activo'}


class ReasonBody(BaseModel):
    reason: str


@router.post('/admin/withdrawal-plans/{plan_id}/reject')
async def admin_reject_plan(plan_id: str, body: ReasonBody, admin: dict = Depends(get_admin_user)):
    p = await db.withdrawal_plans.find_one({'id': plan_id}, {'_id': 0})
    if not p:
        raise HTTPException(404, 'Plan no encontrado')
    await db.withdrawal_plans.update_one(
        {'id': plan_id}, {'$set': {'status': 'rechazado', 'rejection_reason': body.reason.strip()}})
    await create_notification(p['user_id'], 'Plan de retiros rechazado',
                              f'Motivo: {body.reason.strip()}', {'type': 'withdrawal_plan'})
    return {'ok': True, 'status': 'rechazado'}


@router.post('/admin/withdrawal-plans/{plan_id}/tranches/{n}/execute')
async def admin_execute_tranche(plan_id: str, n: int, admin: dict = Depends(get_admin_user)):
    p = await db.withdrawal_plans.find_one({'id': plan_id}, {'_id': 0})
    if not p:
        raise HTTPException(404, 'Plan no encontrado')
    if p['status'] != 'activo':
        raise HTTPException(400, 'El plan no está activo.')
    tr = next((t for t in p['tranches'] if t['n'] == n), None)
    if not tr:
        raise HTTPException(404, 'Tramo no encontrado')
    if tr['status'] == 'ejecutado':
        raise HTTPException(400, 'El tramo ya fue ejecutado.')
    await db.withdrawal_plans.update_one(
        {'id': plan_id, 'tranches.n': n},
        {'$set': {'tranches.$.status': 'ejecutado', 'tranches.$.executed_at': _now(),
                  'tranches.$.executed_by': admin.get('email')}})
    fresh = await db.withdrawal_plans.find_one({'id': plan_id}, {'_id': 0})
    all_done = all(t['status'] == 'ejecutado' for t in fresh['tranches'])
    if all_done:
        await db.withdrawal_plans.update_one({'id': plan_id}, {'$set': {'status': 'completado'}})
    await create_notification(p['user_id'], f'Tramo {n} de su plan ejecutado',
                              f'Se ejecutó el tramo {n} por €{tr["amount_eur"]:,.2f}.'
                              + (' Su plan quedó completado.' if all_done else ''),
                              {'type': 'withdrawal_plan'})
    logging.info(f'plan {plan_id} tramo {n} ejecutado por {admin.get("email")}')
    return {'ok': True, 'completed': all_done}
