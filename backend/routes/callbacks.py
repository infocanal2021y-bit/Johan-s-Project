"""Citas de llamada: el usuario deja teléfono, fecha/hora y motivo para que un agente le llame."""
import re
import uuid
from datetime import datetime, timezone, date, time as dtime
from zoneinfo import ZoneInfo
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification, create_admin_notification

router = APIRouter()

MADRID = ZoneInfo('Europe/Madrid')
ACTIVE_STATUSES = ['pendiente', 'reprogramada', 'no_contesta']
STATUS_LABELS = {
    'pendiente': 'Pendiente',
    'llamado': 'Llamado',
    'no_contesta': 'No contesta',
    'reprogramada': 'Reprogramada',
    'cancelada': 'Cancelada',
}
REASONS = ['Retiros', 'Verificación / KYC', 'Abonos y pagos', 'Estado de mi cuenta', 'Otro']
PHONE_RE = re.compile(r'^\+?[0-9]{7,15}$')
SLOTS = [f'{h:02d}:{m:02d}' for h in range(9, 18) for m in (0, 30)]  # 09:00 → 17:30


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_slot(d_str: str, t_str: str):
    try:
        d = date.fromisoformat(d_str)
    except ValueError:
        raise HTTPException(400, 'Fecha inválida (formato AAAA-MM-DD).')
    if t_str not in SLOTS:
        raise HTTPException(400, 'Hora inválida. Horario de atención: L-V de 09:00 a 18:00 (hora España).')
    if d.weekday() >= 5:
        raise HTTPException(400, 'Solo atendemos llamadas de lunes a viernes.')
    hh, mm = map(int, t_str.split(':'))
    slot_dt = datetime.combine(d, dtime(hh, mm), tzinfo=MADRID)
    if slot_dt <= datetime.now(MADRID):
        raise HTTPException(400, 'La fecha y hora elegidas ya pasaron. Elija un horario futuro.')
    return d, t_str


def _timeline(doc: dict, status: str, actor: str, note: str = '') -> list:
    tl = doc.get('timeline') or []
    tl.append({'status': status, 'label': STATUS_LABELS.get(status, status),
               'at': _now(), 'by': actor, 'note': note})
    return tl


async def _active_appointment(user_id: str) -> Optional[dict]:
    return await db.callback_appointments.find_one(
        {'user_id': user_id, 'status': {'$in': ACTIVE_STATUSES}}, {'_id': 0})


# ══════════════ Usuario ══════════════

@router.get('/callbacks/config')
async def callbacks_config(user: dict = Depends(get_current_user)):
    active = await _active_appointment(user['id'])
    return {
        'reasons': REASONS, 'slots': SLOTS,
        'hours': 'Lunes a viernes, de 09:00 a 18:00 (hora España)',
        'active_appointment': active,
        'can_request': active is None,
    }


class RequestBody(BaseModel):
    phone: str
    date: str  # YYYY-MM-DD
    time: str  # HH:MM
    reason: str
    notes: Optional[str] = None


@router.post('/callbacks/request')
async def callbacks_request(body: RequestBody, user: dict = Depends(get_current_user)):
    if await _active_appointment(user['id']):
        raise HTTPException(409, 'Ya tiene una cita de llamada activa. Cancélela o espere a que el agente le llame.')

    phone = re.sub(r'[\s\-().]', '', body.phone or '')
    if not PHONE_RE.match(phone):
        raise HTTPException(400, 'Número de teléfono inválido. Incluya el prefijo, ej: +34600123456.')
    reason = (body.reason or '').strip()
    if reason not in REASONS:
        raise HTTPException(400, 'Motivo de llamada inválido.')
    _validate_slot(body.date, body.time)

    u = await db.users.find_one({'id': user['id']}, {'_id': 0, 'name': 1, 'email': 1})
    doc = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'], 'user_name': (u or {}).get('name'), 'user_email': (u or {}).get('email'),
        'phone': phone, 'date': body.date, 'time': body.time,
        'reason': reason, 'notes': (body.notes or '').strip()[:500],
        'status': 'pendiente', 'admin_note': '',
        'created_at': _now(), 'updated_at': _now(),
    }
    doc['timeline'] = _timeline(doc, 'pendiente', 'usuario', f'Cita solicitada para {body.date} a las {body.time}.')
    await db.callback_appointments.insert_one(doc)
    doc.pop('_id', None)

    await create_notification(
        user['id'], 'Cita de llamada registrada',
        f'Un agente le llamará al {phone} el {body.date} a las {body.time} (hora España). '
        f'Motivo: {reason}. Mantenga su teléfono disponible.',
        {'type': 'callback', 'appointment_id': doc['id']})
    await create_admin_notification(
        notification_type='callback_request',
        title='Nueva cita de llamada solicitada',
        message=f"{doc['user_name']} ({doc['user_email']}) pide que un agente le llame al {phone} "
                f"el {body.date} a las {body.time} (hora España). Motivo: {reason}."
                + (f" Nota: {doc['notes']}" if doc['notes'] else ''),
        user_info={'name': doc['user_name'], 'email': doc['user_email']},
        metadata={'appointment_id': doc['id'], 'phone': phone, 'date': body.date, 'time': body.time})
    return {'ok': True, 'appointment': {**doc, 'status_label': STATUS_LABELS['pendiente']}}


@router.get('/callbacks/mine')
async def callbacks_mine(user: dict = Depends(get_current_user)):
    rows = await db.callback_appointments.find({'user_id': user['id']}, {'_id': 0}).to_list(30)
    rows.sort(key=lambda r: r['created_at'], reverse=True)
    for r in rows:
        r['status_label'] = STATUS_LABELS.get(r['status'], r['status'])
    return {'appointments': rows}


@router.post('/callbacks/{appointment_id}/cancel')
async def callbacks_cancel(appointment_id: str, user: dict = Depends(get_current_user)):
    doc = await db.callback_appointments.find_one({'id': appointment_id, 'user_id': user['id']}, {'_id': 0})
    if not doc:
        raise HTTPException(404, 'Cita no encontrada')
    if doc['status'] not in ACTIVE_STATUSES:
        raise HTTPException(400, 'Esta cita ya está finalizada.')
    await db.callback_appointments.update_one(
        {'id': appointment_id},
        {'$set': {'status': 'cancelada', 'updated_at': _now(),
                  'timeline': _timeline(doc, 'cancelada', 'usuario', 'Cancelada por el usuario.')}})
    return {'ok': True}


# ══════════════ Admin ══════════════

@router.get('/admin/callbacks')
async def admin_callbacks_list(status: Optional[str] = None, admin: dict = Depends(get_admin_user)):
    q = {'status': status} if status else {}
    rows = await db.callback_appointments.find(q, {'_id': 0}).to_list(500)
    rows.sort(key=lambda r: (r['status'] not in ACTIVE_STATUSES, r.get('date', ''), r.get('time', '')))
    counts = {}
    for s in STATUS_LABELS:
        counts[s] = await db.callback_appointments.count_documents({'status': s})
    for r in rows:
        r['status_label'] = STATUS_LABELS.get(r['status'], r['status'])
    return {'appointments': rows, 'counts': counts, 'statuses': STATUS_LABELS}


class StatusBody(BaseModel):
    status: str
    note: Optional[str] = None
    new_date: Optional[str] = None
    new_time: Optional[str] = None


@router.post('/admin/callbacks/{appointment_id}/status')
async def admin_callbacks_status(appointment_id: str, body: StatusBody, admin: dict = Depends(get_admin_user)):
    if body.status not in STATUS_LABELS:
        raise HTTPException(400, 'Estado inválido')
    doc = await db.callback_appointments.find_one({'id': appointment_id}, {'_id': 0})
    if not doc:
        raise HTTPException(404, 'Cita no encontrada')

    note = (body.note or '').strip()
    updates = {'status': body.status, 'admin_note': note, 'updated_at': _now()}
    if body.status == 'reprogramada' and body.new_date and body.new_time:
        _validate_slot(body.new_date, body.new_time)
        updates['date'] = body.new_date
        updates['time'] = body.new_time
        note = note or f'Reprogramada para el {body.new_date} a las {body.new_time}.'
    updates['timeline'] = _timeline(doc, body.status, f"admin ({admin.get('email')})", note)
    await db.callback_appointments.update_one({'id': appointment_id}, {'$set': updates})

    user_msgs = {
        'llamado': 'Su cita de llamada fue completada. Gracias por su tiempo.',
        'no_contesta': f"Intentamos llamarle al {doc['phone']} y no fue posible contactarle. "
                       'Un agente volverá a intentarlo o puede reprogramar la cita.',
        'reprogramada': f"Su cita de llamada fue reprogramada para el {updates.get('date', doc['date'])} "
                        f"a las {updates.get('time', doc['time'])} (hora España).",
        'cancelada': 'Su cita de llamada fue cancelada.',
        'pendiente': 'Su cita de llamada vuelve a estar pendiente.',
    }
    await create_notification(
        doc['user_id'], 'Actualización de su cita de llamada',
        user_msgs[body.status] + (f' Nota del equipo: {note}' if note and body.status != 'reprogramada' else ''),
        {'type': 'callback', 'appointment_id': appointment_id})
    return {'ok': True, 'status': body.status}
