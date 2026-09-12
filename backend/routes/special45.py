"""Retiro Especial +45.

Modalidad exclusiva para usuarios de 45 años o más con perfil verificado y KYC
aprobado. Abono de autorización: €1.800. Máximo €10.000 por solicitud. Una única
solicitud activa. La titularidad del destino (banco o wallet BTC) debe validarse
antes de aprobar; si no coincide, queda 'Pendiente de validación'.
"""
import logging
import re
import unicodedata
import uuid
from datetime import datetime, timezone, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification, create_admin_notification
from services.security_lock import get_security_lock
from routes.btc_withdrawals import validate_btc_address, mask_btc_address

router = APIRouter()

FEE_EUR = 1800.0
MAX_EUR = 10000.0
MIN_AGE = 45
ACTIVE_STATUSES = ['solicitado', 'pendiente_validacion', 'en_revision', 'aprobado', 'procesando']
STATUS_LABELS = {
    'solicitado': 'Solicitado',
    'pendiente_validacion': 'Pendiente de validación',
    'en_revision': 'En revisión',
    'aprobado': 'Aprobado',
    'procesando': 'Procesando',
    'completado': 'Completado',
    'rechazado': 'Rechazado',
}
IBAN_RE = re.compile(r'^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$')


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _age_from_dob(dob: str) -> int:
    d = date.fromisoformat(dob)
    today = date.today()
    return today.year - d.year - ((today.month, today.day) < (d.month, d.day))


def _norm_name(s: str) -> str:
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return ' '.join(sorted(re.sub(r'[^a-z ]', ' ', s).split()))


def _names_match(holder: str, user_name: str) -> bool:
    h, u = _norm_name(holder), _norm_name(user_name)
    if not h or not u:
        return False
    hs, us = set(h.split()), set(u.split())
    return len(hs & us) >= min(2, len(us))


def _kyc_ok(user: dict) -> bool:
    return (user.get('kyc_status') or '') in ('approved', 'verified', 'completed')


def _verified_ok(user: dict) -> bool:
    return (user.get('verification_status') or '') in ('verified', 'approved')


async def _active_request(user_id: str) -> Optional[dict]:
    return await db.special45_requests.find_one(
        {'user_id': user_id, 'status': {'$in': ACTIVE_STATUSES}}, {'_id': 0})


def _timeline(req: dict, status: str, actor: str, note: str = '') -> list:
    tl = req.get('timeline') or []
    tl.append({'status': status, 'label': STATUS_LABELS.get(status, status),
               'at': _now(), 'by': actor, 'note': note})
    return tl


# ══════════════ Usuario ══════════════

@router.get('/special45/config')
async def special45_config(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({'id': user['id']}, {'_id': 0, 'kyc_status': 1, 'verification_status': 1, 'name': 1})
    active = await _active_request(user['id'])
    reasons = []
    if not _verified_ok(u or {}):
        reasons.append('Su perfil debe estar verificado.')
    if not _kyc_ok(u or {}):
        reasons.append('Su KYC debe estar aprobado.')
    if active:
        reasons.append('Ya tiene una solicitud +45 activa. No es posible crear otra hasta que finalice.')
    return {
        'fee_eur': FEE_EUR, 'max_eur': MAX_EUR, 'min_age': MIN_AGE,
        'eligible': len(reasons) == 0, 'reasons': reasons,
        'kyc_ok': _kyc_ok(u or {}), 'verified_ok': _verified_ok(u or {}),
        'active_request': active,
    }


class InitiateBody(BaseModel):
    amount_eur: float
    date_of_birth: str  # YYYY-MM-DD
    destination_type: str  # 'bank' | 'btc'
    bank_holder: Optional[str] = None
    bank_iban: Optional[str] = None
    bank_name: Optional[str] = None
    btc_address: Optional[str] = None


@router.post('/special45/initiate')
async def special45_initiate(body: InitiateBody, user: dict = Depends(get_current_user)):
    u = await db.users.find_one({'id': user['id']}, {'_id': 0})
    if not _verified_ok(u):
        raise HTTPException(403, 'El Retiro Especial +45 requiere perfil verificado.')
    if not _kyc_ok(u):
        raise HTTPException(403, 'El Retiro Especial +45 requiere KYC aprobado.')
    if await _active_request(user['id']):
        raise HTTPException(409, 'Ya tiene una solicitud de Retiro Especial +45 pendiente o en proceso.')

    lock = await get_security_lock(user['id'])
    if lock['locked']:
        hrs = lock['remaining_seconds'] // 3600
        raise HTTPException(403, f"Retiros pausados por seguridad ({lock.get('reason', 'cambio sensible reciente')}). "
                                 f"Tiempo restante: {hrs}h.")

    if body.amount_eur <= 0:
        raise HTTPException(400, 'El importe debe ser mayor a 0.')
    if body.amount_eur > MAX_EUR:
        raise HTTPException(400, f'El máximo por solicitud es €{MAX_EUR:,.0f}.')

    try:
        age = _age_from_dob(body.date_of_birth)
    except ValueError:
        raise HTTPException(400, 'Fecha de nacimiento inválida (formato AAAA-MM-DD).')
    if age < MIN_AGE:
        raise HTTPException(403, f'Esta modalidad es exclusiva para usuarios de {MIN_AGE} años o más.')
    if age > 110:
        raise HTTPException(400, 'Fecha de nacimiento inválida.')

    ownership_validated = False
    ownership_note = ''
    dest = {}
    if body.destination_type == 'bank':
        holder = (body.bank_holder or '').strip()
        iban = re.sub(r'\s+', '', (body.bank_iban or '')).upper()
        if not holder or not iban:
            raise HTTPException(400, 'Titular e IBAN son obligatorios.')
        if not IBAN_RE.match(iban):
            raise HTTPException(400, 'IBAN con formato inválido.')
        ownership_validated = _names_match(holder, u.get('name', ''))
        ownership_note = ('Titular coincide con el perfil.' if ownership_validated
                          else 'El titular no coincide con el nombre del perfil — requiere validación manual.')
        dest = {'bank_holder': holder, 'bank_iban': iban, 'bank_name': (body.bank_name or '').strip()}
    elif body.destination_type == 'btc':
        v = validate_btc_address((body.btc_address or '').strip())
        if not v['valid']:
            raise HTTPException(400, f"Dirección BTC inválida: {v.get('error', '')}")
        trusted = await db.btc_wallet_whitelist.find_one(
            {'user_id': user['id'], 'address': v['address'], 'status': 'trusted'}, {'_id': 0, 'label': 1})
        ownership_validated = bool(trusted)
        ownership_note = (f"Wallet en lista blanca de confianza ({trusted['label']})." if trusted
                          else 'Wallet fuera de la lista blanca — requiere validación manual de titularidad.')
        dest = {'btc_address': v['address'], 'btc_address_type': v['type_label']}
    else:
        raise HTTPException(400, 'Destino inválido: use bank o btc.')

    status = 'solicitado' if ownership_validated else 'pendiente_validacion'
    doc = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'], 'user_name': u.get('name'), 'user_email': u.get('email'),
        'amount_eur': round(float(body.amount_eur), 2),
        'fee_eur': FEE_EUR, 'fee_informed': False, 'fee_info': None,
        'date_of_birth': body.date_of_birth, 'declared_age': age, 'dob_verified': False,
        'destination_type': body.destination_type, **dest,
        'ownership_validated': ownership_validated, 'ownership_note': ownership_note,
        'status': status, 'admin_note': '',
        'created_at': _now(), 'updated_at': _now(),
    }
    doc['timeline'] = _timeline(doc, status, 'usuario', ownership_note)
    await db.special45_requests.insert_one(doc)
    doc.pop('_id', None)

    await create_notification(
        user['id'], 'Retiro Especial +45 registrado',
        f"Su solicitud de €{doc['amount_eur']:,.2f} fue registrada"
        + (' y está pendiente de validación de titularidad.' if status == 'pendiente_validacion' else '.')
        + f" Recuerde completar el abono de autorización de €{FEE_EUR:,.0f}.",
        {'type': 'special45', 'request_id': doc['id']})
    await create_admin_notification(
        notification_type='withdrawal_request',
        title='Nueva solicitud Retiro Especial +45',
        message=f"{u.get('name')} ({age} años declarados) solicitó €{doc['amount_eur']:,.2f} → "
                f"{'IBAN ' + dest.get('bank_iban', '')[:8] + '…' if body.destination_type == 'bank' else 'BTC ' + mask_btc_address(dest.get('btc_address', ''))}. "
                f"{ownership_note}",
        user_info={'name': u.get('name'), 'email': u.get('email')},
        metadata={'request_id': doc['id'], 'amount_eur': doc['amount_eur']})
    return {'ok': True, 'request': {**doc, 'status_label': STATUS_LABELS[status]}}


@router.get('/special45/mine')
async def special45_mine(user: dict = Depends(get_current_user)):
    rows = await db.special45_requests.find({'user_id': user['id']}, {'_id': 0}).to_list(20)
    rows.sort(key=lambda r: r['created_at'], reverse=True)
    for r in rows:
        r['status_label'] = STATUS_LABELS.get(r['status'], r['status'])
        if r.get('btc_address'):
            r['btc_address_masked'] = mask_btc_address(r['btc_address'])
    return {'requests': rows}


class AbonoBody(BaseModel):
    message: Optional[str] = None
    txid: Optional[str] = None
    coin_used: Optional[str] = None


@router.post('/special45/{request_id}/submit-abono')
async def special45_submit_abono(request_id: str, body: AbonoBody, user: dict = Depends(get_current_user)):
    req = await db.special45_requests.find_one({'id': request_id, 'user_id': user['id']}, {'_id': 0})
    if not req:
        raise HTTPException(404, 'Solicitud no encontrada')
    if req['status'] in ('completado', 'rechazado'):
        raise HTTPException(400, 'La solicitud ya está finalizada.')
    info = {'message': (body.message or '').strip(), 'txid': (body.txid or '').strip(),
            'coin_used': (body.coin_used or '').strip(), 'at': _now()}
    await db.special45_requests.update_one(
        {'id': request_id},
        {'$set': {'fee_informed': True, 'fee_info': info, 'updated_at': _now()}})
    await create_admin_notification(
        notification_type='crypto_abono',
        title='Abono informado — Retiro Especial +45',
        message=f"{req['user_name']} informó el abono de €{FEE_EUR:,.0f} de su Retiro +45 "
                f"de €{req['amount_eur']:,.2f}."
                + (f" TXID: {info['txid'][:24]}…" if info['txid'] else ''),
        user_info={'name': req['user_name'], 'email': req['user_email']},
        metadata={'request_id': request_id})
    return {'ok': True}


# ══════════════ Admin ══════════════

@router.get('/admin/special45')
async def admin_special45_list(status: Optional[str] = None, admin: dict = Depends(get_admin_user)):
    q = {'status': status} if status else {}
    rows = await db.special45_requests.find(q, {'_id': 0}).to_list(300)
    rows.sort(key=lambda r: r['created_at'], reverse=True)
    counts = {}
    for s in STATUS_LABELS:
        counts[s] = await db.special45_requests.count_documents({'status': s})
    for r in rows:
        r['status_label'] = STATUS_LABELS.get(r['status'], r['status'])
        if r.get('btc_address'):
            r['btc_address_masked'] = mask_btc_address(r['btc_address'])
    return {'requests': rows, 'counts': counts, 'statuses': STATUS_LABELS}


class OwnershipBody(BaseModel):
    validated: bool
    note: Optional[str] = None
    dob_verified: Optional[bool] = None


@router.post('/admin/special45/{request_id}/validate-ownership')
async def admin_special45_ownership(request_id: str, body: OwnershipBody, admin: dict = Depends(get_admin_user)):
    req = await db.special45_requests.find_one({'id': request_id}, {'_id': 0})
    if not req:
        raise HTTPException(404, 'Solicitud no encontrada')
    note = (body.note or '').strip() or ('Titularidad validada por el equipo.' if body.validated
                                         else 'Titularidad NO validada — datos no coinciden.')
    new_status = 'en_revision' if body.validated else 'pendiente_validacion'
    updates = {'ownership_validated': body.validated, 'ownership_note': note,
               'status': new_status, 'updated_at': _now(),
               'timeline': _timeline(req, new_status, f"admin ({admin.get('email')})", note)}
    if body.dob_verified is not None:
        updates['dob_verified'] = bool(body.dob_verified)
    await db.special45_requests.update_one({'id': request_id}, {'$set': updates})
    await create_notification(
        req['user_id'], 'Retiro Especial +45 — validación de titularidad',
        ('La titularidad de su destino fue validada correctamente. Su solicitud pasa a revisión.'
         if body.validated else
         'No pudimos validar la titularidad de su destino. Su solicitud queda pendiente de validación; '
         'el equipo puede solicitarle documentación adicional.'),
        {'type': 'special45', 'request_id': request_id})
    return {'ok': True, 'status': new_status}


class StatusBody(BaseModel):
    status: str
    note: Optional[str] = None


@router.post('/admin/special45/{request_id}/status')
async def admin_special45_status(request_id: str, body: StatusBody, admin: dict = Depends(get_admin_user)):
    if body.status not in STATUS_LABELS:
        raise HTTPException(400, 'Estado inválido')
    req = await db.special45_requests.find_one({'id': request_id}, {'_id': 0})
    if not req:
        raise HTTPException(404, 'Solicitud no encontrada')
    if body.status in ('aprobado', 'procesando', 'completado') and not req.get('ownership_validated'):
        raise HTTPException(400, 'No se puede aprobar: la titularidad del destino aún no está validada. '
                                 'La solicitud debe permanecer en Pendiente de validación.')
    note = (body.note or '').strip()
    await db.special45_requests.update_one(
        {'id': request_id},
        {'$set': {'status': body.status, 'admin_note': note, 'updated_at': _now(),
                  'timeline': _timeline(req, body.status, f"admin ({admin.get('email')})", note)}})
    await create_notification(
        req['user_id'], 'Actualización de su Retiro Especial +45',
        f"Su solicitud de €{req['amount_eur']:,.2f} pasó al estado: {STATUS_LABELS[body.status]}."
        + (f' Nota del equipo: {note}' if note else ''),
        {'type': 'special45', 'request_id': request_id})
    return {'ok': True, 'status': body.status}
