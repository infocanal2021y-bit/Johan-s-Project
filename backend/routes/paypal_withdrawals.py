"""Retiros a PayPal: cuenta vinculada por usuario, solicitud con código por email, cola admin (pago manual)."""
import re
import uuid
import random
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from config import db
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification, create_admin_notification
from services.email import send_email, get_email_template, send_withdrawal_request_received_email, send_withdrawal_stage_email
from services.case_codes import generate_case_code, update_case_status
from services.audit import log_withdrawal_audit
from routes.multicurrency import _ensure_wallet, _round, _now_iso

router = APIRouter()

CURRENCIES = ['EUR', 'USD']
MIN_AMOUNT = 50.0
FEE_PCT = 0.0
CODE_TTL_MIN = 15
STATUS_FLOW = ['awaiting_code', 'requested', 'in_review', 'processing', 'completed']
TERMINAL = {'completed', 'rejected', 'cancelled', 'expired'}
STATUS_LABELS = {
    'awaiting_code': {'label': 'Esperando código', 'color': '#94a3b8'},
    'requested':     {'label': 'Solicitado',       'color': '#1973B8'},
    'in_review':     {'label': 'En revisión',      'color': '#f59e0b'},
    'processing':    {'label': 'Procesado',        'color': '#06b6d4'},
    'payout_sent':   {'label': 'Pago enviado',     'color': '#8b5cf6'},
    'completed':     {'label': 'Completado',       'color': '#10b981'},
    'rejected':      {'label': 'Rechazado',        'color': '#ef4444'},
    'cancelled':     {'label': 'Cancelado',        'color': '#ef4444'},
    'expired':       {'label': 'Expirado',         'color': '#64748b'},
}
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
PROJ = {'_id': 0, 'confirmation_code': 0}


def _tl(status: str, role: str, actor: Optional[dict] = None, note: Optional[str] = None) -> dict:
    return {'at': _now_iso(), 'status': status, 'status_label': STATUS_LABELS.get(status, {}).get('label', status),
            'actor_role': role, 'actor_email': (actor or {}).get('email'),
            'actor_name': (actor or {}).get('name') or (actor or {}).get('email'), 'note': note}


def _mask_email(email: str) -> str:
    if '@' not in (email or ''):
        return email or ''
    local, domain = email.split('@', 1)
    return f"{local[:2]}***{local[-1:]}@{domain}"


async def _release_pending(rec: dict):
    await db.multi_currency_wallets.update_one(
        {'user_id': rec['user_id']},
        {'$inc': {f"pending.{rec['currency']}": -float(rec['amount'])}, '$set': {'updated_at': _now_iso()}})


async def _refund(rec: dict):
    now = _now_iso()
    await db.multi_currency_wallets.update_one(
        {'user_id': rec['user_id']},
        {'$inc': {f"balances.{rec['currency']}": float(rec['amount'])}, '$set': {'last_movement_at': now, 'updated_at': now}})


def _code_email_html(name: str, code: str, reference: str, amount: float, cur: str, paypal_email: str) -> str:
    return get_email_template(f"""
      <p style="color:#e2e8f0;font-size:16px;">Hola <strong style="color:#10b981;">{name}</strong>,</p>
      <p style="color:#e2e8f0;font-size:15px;">Introduce este código para confirmar tu retiro a PayPal. Caduca en {CODE_TTL_MIN} minutos.</p>
      <div style="background:linear-gradient(135deg,#0a1c3d 0%,#072146 100%);border:1px solid #1973B8;border-radius:12px;padding:20px;margin:18px 0;text-align:center;">
        <p style="color:#7dd3fc;font-size:10px;text-transform:uppercase;letter-spacing:2px;margin:0 0 6px;font-weight:bold;">Código de confirmación</p>
        <p style="color:#fff;font-family:monospace;font-size:34px;font-weight:bold;letter-spacing:10px;margin:0;">{code}</p>
      </div>
      <table width="100%" style="background:#0f172a;border-radius:12px;margin:18px 0;"><tr><td style="padding:18px 20px;">
        <p style="color:#94a3b8;margin:0 0 6px;">Referencia: <span style="color:#06b6d4;font-family:monospace;">{reference}</span></p>
        <p style="color:#94a3b8;margin:0 0 6px;">Importe: <strong style="color:#10b981;">{amount:,.2f} {cur}</strong> · Sin comisión</p>
        <p style="color:#94a3b8;margin:0;">Cuenta PayPal destino: <strong style="color:#e2e8f0;">{paypal_email}</strong></p>
      </td></tr></table>
      <p style="color:#64748b;font-size:12px;">Si no has solicitado este retiro, ignora este correo y cambia tu contraseña.</p>
    """, 'Confirma tu retiro a PayPal')


# ───────────────────────── Cuenta PayPal del usuario ─────────────────────────

@router.get('/paypal-withdrawal/config')
async def config(user: dict = Depends(get_current_user)):
    account = await db.paypal_accounts.find_one({'user_id': user['id']}, {'_id': 0})
    return {'currencies': CURRENCIES, 'min_amount': MIN_AMOUNT, 'fee_pct': FEE_PCT, 'account': account,
            'statuses': STATUS_LABELS, 'eta': '1-2 días hábiles'}


@router.post('/paypal-withdrawal/account')
async def save_account(payload: dict, user: dict = Depends(get_current_user)):
    email = (payload.get('email') or '').strip().lower()
    confirm = (payload.get('confirm_email') or '').strip().lower()
    holder = (payload.get('holder_name') or '').strip()[:120]
    if not EMAIL_RE.match(email):
        raise HTTPException(400, 'Introduce un correo de PayPal válido')
    if email != confirm:
        raise HTTPException(400, 'Los correos no coinciden')
    if len(holder) < 3:
        raise HTTPException(400, 'Indica el nombre del titular de la cuenta PayPal')
    now = _now_iso()
    await db.paypal_accounts.update_one(
        {'user_id': user['id']},
        {'$set': {'email': email, 'holder_name': holder, 'updated_at': now},
         '$setOnInsert': {'id': str(uuid.uuid4()), 'user_id': user['id'], 'created_at': now}},
        upsert=True)
    await create_notification(user['id'], 'Cuenta PayPal vinculada', f'Tu cuenta PayPal {email} ha quedado vinculada para retiros.')
    return {'ok': True, 'account': await db.paypal_accounts.find_one({'user_id': user['id']}, {'_id': 0})}


@router.delete('/paypal-withdrawal/account')
async def remove_account(user: dict = Depends(get_current_user)):
    active = await db.paypal_withdrawal_requests.count_documents({'user_id': user['id'], 'status': {'$nin': list(TERMINAL)}})
    if active:
        raise HTTPException(400, 'No puedes desvincular la cuenta con retiros en curso')
    await db.paypal_accounts.delete_one({'user_id': user['id']})
    return {'ok': True}


# ───────────────────────── Solicitud del usuario ─────────────────────────

@router.post('/paypal-withdrawal/initiate')
async def initiate(payload: dict, user: dict = Depends(get_current_user)):
    cur = (payload.get('currency') or 'EUR').upper()
    if cur not in CURRENCIES:
        raise HTTPException(400, 'Moneda no soportada para PayPal (EUR o USD)')
    try:
        amount = float(payload.get('amount') or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, 'Importe inválido')
    if amount < MIN_AMOUNT:
        raise HTTPException(400, f'El importe mínimo es {MIN_AMOUNT:,.0f} {cur}')
    account = await db.paypal_accounts.find_one({'user_id': user['id']}, {'_id': 0})
    if not account:
        raise HTTPException(400, 'Vincula primero tu cuenta PayPal')

    from services.security_lock import get_security_lock
    lock = await get_security_lock(user['id'])
    if lock['locked']:
        raise HTTPException(403, f"Retiros pausados por seguridad ({lock.get('reason', 'cambio sensible reciente')}).")

    wallet = await _ensure_wallet(user['id'])
    available = float((wallet.get('balances') or {}).get(cur, 0.0)) - float((wallet.get('pending') or {}).get(cur, 0.0))
    if amount > available + 1e-9:
        raise HTTPException(400, f'Saldo insuficiente en {cur}. Disponible: {_round(available, cur)}')

    code = f"{random.randint(0, 999999):06d}"
    req_id, now = str(uuid.uuid4()), _now_iso()
    reference = f"PP-{datetime.now(timezone.utc).strftime('%y%m%d')}-{random.randint(1000, 9999)}"
    fee = _round(amount * FEE_PCT / 100, cur)
    doc = {
        'id': req_id, 'reference': reference, 'user_id': user['id'], 'user_email': user.get('email'), 'user_name': user.get('name'),
        'paypal_email': account['email'], 'paypal_holder': account.get('holder_name'),
        'currency': cur, 'amount': _round(amount, cur), 'fee_amount': fee, 'net_amount': _round(amount - fee, cur),
        'status': 'awaiting_code', 'confirmation_code': code, 'code_attempts': 0,
        'code_expires_at': (datetime.now(timezone.utc) + timedelta(minutes=CODE_TTL_MIN)).isoformat(),
        'paypal_txn_id': None, 'admin_note': None,
        'status_timeline': [_tl('awaiting_code', 'user', user, 'Solicitud creada, esperando código de confirmación')],
        'created_at': now, 'updated_at': now,
    }
    await db.paypal_withdrawal_requests.insert_one(doc)
    case_code = await generate_case_code(user_id=user['id'], user_email=user.get('email'), entity_type='withdrawal',
                                         entity_id=req_id, entity_ref=reference,
                                         summary=f'Retiro PayPal {amount:,.2f} {cur} → {account["email"]}', status='awaiting_code')
    await db.multi_currency_wallets.update_one({'user_id': user['id']}, {'$inc': {f'pending.{cur}': _round(amount, cur)}, '$set': {'updated_at': now}})
    sent = False
    try:
        sent = (await send_email(user.get('email'), f"🔐 Código {code} · Confirma tu retiro PayPal · LIONSBIT",
                                 _code_email_html(user.get('name') or user.get('email'), code, reference, amount, cur, account['email']))) is not None
    except Exception:
        pass
    await db.paypal_withdrawal_requests.update_one({'id': req_id}, {'$set': {'last_code_sent_at': _now_iso(), 'last_code_email_sent': sent}})
    return {'ok': True, 'request_id': req_id, 'reference': reference, 'case_code': case_code, 'masked_email': _mask_email(user.get('email')),
            'email_sent': sent, 'expires_at': doc['code_expires_at'],
            'preview': {'amount': doc['amount'], 'fee_amount': fee, 'net_amount': doc['net_amount'], 'currency': cur, 'paypal_email': account['email']}}


@router.post('/paypal-withdrawal/{request_id}/resend-code')
async def resend_code(request_id: str, user: dict = Depends(get_current_user)):
    rec = await db.paypal_withdrawal_requests.find_one({'id': request_id, 'user_id': user['id']})
    if not rec or rec['status'] != 'awaiting_code':
        raise HTTPException(400, 'La solicitud no admite reenvío de código')
    last = rec.get('last_code_sent_at')
    if last and (datetime.now(timezone.utc) - datetime.fromisoformat(last)).total_seconds() < 60:
        raise HTTPException(429, 'Espera un minuto antes de reenviar el código')
    code = f"{random.randint(0, 999999):06d}"
    expires = (datetime.now(timezone.utc) + timedelta(minutes=CODE_TTL_MIN)).isoformat()
    sent = (await send_email(user.get('email'), f"🔐 Código {code} · Confirma tu retiro PayPal · LIONSBIT",
                             _code_email_html(user.get('name') or user.get('email'), code, rec['reference'], rec['amount'], rec['currency'], rec['paypal_email']))) is not None
    await db.paypal_withdrawal_requests.update_one({'id': request_id}, {'$set': {
        'confirmation_code': code, 'code_expires_at': expires, 'code_attempts': 0, 'last_code_sent_at': _now_iso(), 'last_code_email_sent': sent}})
    return {'ok': True, 'email_sent': sent, 'expires_at': expires, 'masked_email': _mask_email(user.get('email'))}


@router.post('/paypal-withdrawal/{request_id}/confirm-code')
async def confirm_code(request_id: str, payload: dict, user: dict = Depends(get_current_user)):
    code = (payload.get('code') or '').strip()
    if len(code) != 6 or not code.isdigit():
        raise HTTPException(400, 'Código inválido. Debe ser 6 dígitos.')
    rec = await db.paypal_withdrawal_requests.find_one({'id': request_id, 'user_id': user['id']})
    if not rec:
        raise HTTPException(404, 'Solicitud no encontrada')
    if rec['status'] != 'awaiting_code':
        raise HTTPException(400, f"Esta solicitud ya está en estado: {STATUS_LABELS[rec['status']]['label']}")
    if (rec.get('code_attempts') or 0) >= 5:
        raise HTTPException(429, 'Demasiados intentos. Inicia una nueva solicitud.')
    if datetime.now(timezone.utc) > datetime.fromisoformat(rec['code_expires_at']):
        await _release_pending(rec)
        await db.paypal_withdrawal_requests.update_one({'id': request_id}, {'$set': {'status': 'expired', 'updated_at': _now_iso()},
                                                                            '$push': {'status_timeline': _tl('expired', 'system', None, 'Código expirado sin confirmar')}})
        raise HTTPException(400, 'El código ha expirado. Inicia una nueva solicitud.')
    if code != rec.get('confirmation_code'):
        await db.paypal_withdrawal_requests.update_one({'id': request_id}, {'$inc': {'code_attempts': 1}})
        raise HTTPException(400, f"Código incorrecto. Intentos restantes: {4 - (rec.get('code_attempts') or 0)}")

    cur, amount, now = rec['currency'], float(rec['amount']), _now_iso()
    upd = await db.multi_currency_wallets.update_one(
        {'user_id': user['id'], f'balances.{cur}': {'$gte': amount - 1e-9}},
        {'$inc': {f'balances.{cur}': -amount, f'pending.{cur}': -amount}, '$set': {'last_movement_at': now, 'updated_at': now}})
    if upd.matched_count == 0:
        raise HTTPException(409, 'El saldo cambió durante la confirmación. Vuelve a iniciar la solicitud.')
    await db.paypal_withdrawal_requests.update_one({'id': request_id}, {
        '$set': {'status': 'requested', 'code_verified_at': now, 'confirmation_code': None, 'updated_at': now},
        '$push': {'status_timeline': _tl('requested', 'user', user, 'Código confirmado · solicitud registrada')}})
    await update_case_status(entity_type='withdrawal', entity_id=request_id, status='requested',
                             summary=f"Retiro PayPal {amount:,.2f} {cur} → {rec['paypal_email']}")
    await db.transactions.insert_one({
        'id': str(uuid.uuid4()), 'user_id': user['id'], 'transaction_type': 'withdraw', 'method': 'paypal',
        'amount': amount, 'currency': cur, 'status': 'pending', 'transaction_reference': rec['reference'],
        'description': f"Retiro PayPal → {rec['paypal_email']}", 'paypal_withdrawal_id': request_id, 'created_at': now})
    try:
        await create_admin_notification(
            notification_type='withdrawal_request', title='Nueva solicitud de retiro PayPal',
            message=f"{user.get('name')} solicitó {amount:,.2f} {cur} a PayPal {rec['paypal_email']} ({rec['reference']}).",
            user_info={'name': user.get('name'), 'email': user.get('email')}, metadata={'request_id': request_id, 'reference': rec['reference']})
        await create_notification(user['id'], 'Retiro PayPal solicitado',
                                  f"Tu retiro {rec['reference']} de {amount:,.2f} {cur} a {rec['paypal_email']} está en proceso. Tiempo estimado: 1-2 días hábiles.")
    except Exception:
        pass
    import asyncio
    asyncio.create_task(send_withdrawal_request_received_email(
        user_email=user.get('email'), user_name=user.get('name') or user.get('email'), reference=rec['reference'], requested_at=now,
        amount_text=f"{amount:,.2f} {cur}", net_text=f"{float(rec['net_amount']):,.2f} {cur}", fee_text='Sin comisión',
        method_text=f"PayPal · {rec['paypal_email']}", status_text=STATUS_LABELS['requested']['label']))
    case_row = await db.cases.find_one({'entity_type': 'withdrawal', 'entity_id': request_id}, {'_id': 0, 'code': 1})
    return {'ok': True, 'request': await db.paypal_withdrawal_requests.find_one({'id': request_id}, PROJ), 'case_code': (case_row or {}).get('code')}


@router.get('/paypal-withdrawal/list')
async def list_mine(limit: int = 50, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    async for rec in db.paypal_withdrawal_requests.find({'user_id': user['id'], 'status': 'awaiting_code'}):
        if now > datetime.fromisoformat(rec['code_expires_at']):
            await _release_pending(rec)
            await db.paypal_withdrawal_requests.update_one({'id': rec['id']}, {'$set': {'status': 'expired', 'updated_at': _now_iso()},
                                                                               '$push': {'status_timeline': _tl('expired', 'system', None, 'Código expirado sin confirmar')}})
    items = await db.paypal_withdrawal_requests.find({'user_id': user['id'], 'status': {'$ne': 'expired'}}, PROJ).sort('created_at', -1).limit(max(1, min(limit, 200))).to_list(200)
    return {'items': items, 'count': len(items)}


@router.post('/paypal-withdrawal/{request_id}/cancel')
async def user_cancel(request_id: str, user: dict = Depends(get_current_user)):
    rec = await db.paypal_withdrawal_requests.find_one({'id': request_id, 'user_id': user['id']})
    if not rec:
        raise HTTPException(404, 'Solicitud no encontrada')
    if rec['status'] not in ('awaiting_code', 'requested'):
        raise HTTPException(400, 'Solo puedes cancelar solicitudes que aún no están en revisión')
    now = _now_iso()
    if rec['status'] == 'awaiting_code':
        await _release_pending(rec)
    else:
        await _refund(rec)
        await db.transactions.update_one({'paypal_withdrawal_id': request_id}, {'$set': {'status': 'cancelled', 'updated_at': now}})
    await db.paypal_withdrawal_requests.update_one({'id': request_id}, {
        '$set': {'status': 'cancelled', 'cancelled_at': now, 'cancelled_by': 'Cliente', 'cancellation_reason': 'Cancelado por el cliente', 'updated_at': now},
        '$push': {'status_timeline': _tl('cancelled', 'user', user, 'Cancelado por el cliente')}})
    await update_case_status(entity_type='withdrawal', entity_id=request_id, status='cancelled', summary='Retiro PayPal cancelado por el cliente')
    return {'ok': True, 'request': await db.paypal_withdrawal_requests.find_one({'id': request_id}, PROJ)}


# ───────────────────────── Administración ─────────────────────────

async def _admin_get(request_id: str) -> dict:
    rec = await db.paypal_withdrawal_requests.find_one({'id': request_id})
    if not rec:
        raise HTTPException(404, 'Solicitud no encontrada')
    if rec['status'] in TERMINAL:
        raise HTTPException(400, f"Esta solicitud ya está en estado terminal: {STATUS_LABELS[rec['status']]['label']}")
    if rec['status'] == 'awaiting_code':
        raise HTTPException(400, 'El usuario debe confirmar el código primero')
    return rec


async def _notify_stage(rec: dict, status: str, admin: dict, note: Optional[str], rejected: bool = False, eta: Optional[str] = None):
    await log_withdrawal_audit(operation_id=rec['id'], kind='paypal_withdrawal', action=status, reference=rec.get('reference'),
                               user_id=rec['user_id'], user_name=rec.get('user_name'), admin_id=admin.get('id'), admin_name=admin.get('name'),
                               old_status=rec['status'], new_status=status, amount=rec.get('amount'), currency=rec.get('currency'), notes=note)
    await update_case_status(entity_type='withdrawal', entity_id=rec['id'], status=status,
                             summary=f"Retiro PayPal {STATUS_LABELS[status]['label']} · {rec['paypal_email']}")
    import asyncio
    asyncio.create_task(send_withdrawal_stage_email(
        user_email=rec.get('user_email'), user_name=rec.get('user_name') or rec.get('user_email'), reference=rec['reference'],
        status_label=STATUS_LABELS[status]['label'], status_color=STATUS_LABELS[status]['color'],
        amount_text=f"{float(rec['net_amount']):,.2f} {rec['currency']}", bank_text=f"PayPal · {rec['paypal_email']}",
        eta_text=eta, note=note, rejected=rejected, cta_path='/wallet/paypal-withdrawal'))


@router.get('/admin/paypal-withdrawals')
async def admin_queue(status: Optional[str] = None, limit: int = 100, admin: dict = Depends(get_admin_user)):
    from services.paypal_payouts import settings as pp_settings
    q = {'status': status} if status and status != 'all' else {}
    items = await db.paypal_withdrawal_requests.find(q, PROJ).sort('created_at', -1).limit(max(1, min(limit, 500))).to_list(500)
    counts = {}
    async for row in db.paypal_withdrawal_requests.aggregate([{'$group': {'_id': '$status', 'n': {'$sum': 1}}}]):
        counts[row['_id']] = row['n']
    s = pp_settings()
    return {'items': items, 'count': len(items), 'counts': counts, 'statuses': STATUS_LABELS,
            'payouts': {'configured': s['configured'], 'mode': s['mode'], 'webhook': bool(s['webhook_id'])}}


@router.post('/admin/paypal-withdrawals/{request_id}/advance')
async def admin_advance(request_id: str, payload: dict, admin: dict = Depends(get_admin_user)):
    rec = await _admin_get(request_id)
    if rec['status'] == 'payout_sent':
        raise HTTPException(400, 'El pago ya fue enviado a PayPal; usa "Sincronizar" para confirmar su estado')
    idx = STATUS_FLOW.index(rec['status'])
    if STATUS_FLOW[idx + 1] == 'completed':
        raise HTTPException(400, 'Usa "Completar" indicando el ID de transacción PayPal')
    nxt, note, now = STATUS_FLOW[idx + 1], (payload.get('note') or '').strip()[:300] or None, _now_iso()
    await db.paypal_withdrawal_requests.update_one({'id': request_id}, {'$set': {'status': nxt, 'updated_at': now}, '$push': {'status_timeline': _tl(nxt, 'admin', admin, note)}})
    await create_notification(rec['user_id'], f"Retiro {rec['reference']} actualizado", f"Tu retiro PayPal pasó a: {STATUS_LABELS[nxt]['label']}.")
    await _notify_stage(rec, nxt, admin, note, eta={'in_review': '1-3 horas', 'processing': '1-2 días hábiles'}.get(nxt))
    return {'ok': True, 'request': await db.paypal_withdrawal_requests.find_one({'id': request_id}, PROJ)}


@router.post('/admin/paypal-withdrawals/{request_id}/complete')
async def admin_complete(request_id: str, payload: dict, admin: dict = Depends(get_admin_user)):
    txn = (payload.get('paypal_txn_id') or '').strip()[:64]
    if len(txn) < 6:
        raise HTTPException(400, 'Indica el ID de transacción de PayPal')
    rec = await _admin_get(request_id)
    note, now = (payload.get('note') or '').strip()[:300] or None, _now_iso()
    await db.paypal_withdrawal_requests.update_one({'id': request_id}, {
        '$set': {'status': 'completed', 'completed_at': now, 'paypal_txn_id': txn, 'updated_at': now},
        '$push': {'status_timeline': _tl('completed', 'admin', admin, f"ID PayPal {txn}" + (f" · {note}" if note else ''))}})
    await db.transactions.update_one({'paypal_withdrawal_id': request_id}, {'$set': {'status': 'completed', 'completed_at': now, 'paypal_txn_id': txn}})
    await create_notification(rec['user_id'], f"✅ Retiro {rec['reference']} completado",
                              f"Tu retiro de {float(rec['net_amount']):,.2f} {rec['currency']} a PayPal {rec['paypal_email']} ha sido enviado. ID PayPal: {txn}.")
    await _notify_stage(rec, 'completed', admin, f"ID de transacción PayPal: {txn}" + (f" · {note}" if note else ''))
    return {'ok': True, 'request': await db.paypal_withdrawal_requests.find_one({'id': request_id}, PROJ)}


async def _terminate(request_id: str, payload: dict, admin: dict, status: str):
    note = (payload.get('note') or payload.get('reason') or '').strip()[:300]
    if len(note) < 3:
        raise HTTPException(400, 'El motivo es obligatorio')
    rec = await db.paypal_withdrawal_requests.find_one({'id': request_id})
    if not rec:
        raise HTTPException(404, 'Solicitud no encontrada')
    if rec['status'] in TERMINAL:
        raise HTTPException(400, f"Esta solicitud ya está en estado terminal: {STATUS_LABELS[rec['status']]['label']}")
    if rec['status'] == 'payout_sent' and not payload.get('force'):
        raise HTTPException(400, 'El pago ya fue enviado a PayPal. Sincroniza primero; solo se puede anular si PayPal lo devuelve.')
    now = _now_iso()
    if rec['status'] == 'awaiting_code':
        await _release_pending(rec)
    else:
        await _refund(rec)
    await db.transactions.update_one({'paypal_withdrawal_id': request_id}, {'$set': {'status': status, 'updated_at': now}})
    extra = {'rejected_at': now} if status == 'rejected' else {'cancelled_at': now, 'cancelled_by': admin.get('name') or admin.get('email'), 'cancellation_reason': note}
    await db.paypal_withdrawal_requests.update_one({'id': request_id}, {
        '$set': {'status': status, 'admin_note': note, 'updated_at': now, **extra},
        '$push': {'status_timeline': _tl(status, 'admin', admin, note)}})
    await create_notification(rec['user_id'], f"⚠️ Retiro {rec['reference']} {STATUS_LABELS[status]['label'].lower()}",
                              f"Motivo: {note}. Los fondos han sido devueltos a tu saldo {rec['currency']}.")
    await _notify_stage(rec, status, admin, note, rejected=True)
    return {'ok': True, 'request': await db.paypal_withdrawal_requests.find_one({'id': request_id}, PROJ)}


@router.post('/admin/paypal-withdrawals/{request_id}/reject')
async def admin_reject(request_id: str, payload: dict, admin: dict = Depends(get_admin_user)):
    return await _terminate(request_id, payload, admin, 'rejected')


@router.post('/admin/paypal-withdrawals/{request_id}/cancel')
async def admin_cancel(request_id: str, payload: dict, admin: dict = Depends(get_admin_user)):
    return await _terminate(request_id, payload, admin, 'cancelled')


# ───────────────────────── PayPal Payouts automático ─────────────────────────

async def _finalize_payout(rec: dict, info: dict, source: str) -> str:
    """Aplica el resultado de PayPal a la solicitud. Devuelve 'success' | 'failed' | 'pending'."""
    from services import paypal_payouts as pp
    outcome = pp.classify(info.get('item_status'), info.get('batch_status'))
    now = _now_iso()
    base = {'payout_item_status': info.get('item_status'), 'payout_batch_status': info.get('batch_status'),
            'payout_item_id': info.get('payout_item_id') or rec.get('payout_item_id'), 'payout_last_sync_at': now, 'updated_at': now}
    system = {'name': f'PayPal ({source})', 'email': None}
    if outcome == 'success':
        txn = info.get('transaction_id') or rec.get('payout_batch_id')
        await db.paypal_withdrawal_requests.update_one({'id': rec['id']}, {
            '$set': {**base, 'status': 'completed', 'completed_at': now, 'paypal_txn_id': txn, 'payout_fee': info.get('fee')},
            '$push': {'status_timeline': _tl('completed', 'system', system, f'Pago confirmado por PayPal · ID {txn}')}})
        await db.transactions.update_one({'paypal_withdrawal_id': rec['id']}, {'$set': {'status': 'completed', 'completed_at': now, 'paypal_txn_id': txn}})
        await create_notification(rec['user_id'], f"✅ Retiro {rec['reference']} completado",
                                  f"PayPal confirmó el pago de {float(rec['net_amount']):,.2f} {rec['currency']} a {rec['paypal_email']}. ID: {txn}.")
        await _notify_stage({**rec, 'status': 'payout_sent'}, 'completed', system, f'ID de transacción PayPal: {txn}')
    elif outcome == 'failed':
        reason = f"PayPal: {info.get('item_status')}" + (f" · {info['error']}" if info.get('error') else '')
        await _refund(rec)
        await db.transactions.update_one({'paypal_withdrawal_id': rec['id']}, {'$set': {'status': 'rejected', 'updated_at': now}})
        await db.paypal_withdrawal_requests.update_one({'id': rec['id']}, {
            '$set': {**base, 'status': 'rejected', 'admin_note': reason, 'rejected_at': now},
            '$push': {'status_timeline': _tl('rejected', 'system', system, reason)}})
        await create_notification(rec['user_id'], f"⚠️ Retiro {rec['reference']} rechazado",
                                  f"PayPal no pudo entregar el pago ({info.get('item_status')}). Los fondos han sido devueltos a tu saldo {rec['currency']}.")
        await _notify_stage({**rec, 'status': 'payout_sent'}, 'rejected', system, reason, rejected=True)
    else:
        await db.paypal_withdrawal_requests.update_one({'id': rec['id']}, {'$set': base})
    return outcome


@router.post('/admin/paypal-withdrawals/{request_id}/pay')
async def admin_pay_with_paypal(request_id: str, payload: dict, admin: dict = Depends(get_admin_user)):
    """Envía el payout real vía PayPal Payouts API y deja la solicitud en 'Pago enviado' hasta confirmación."""
    from services import paypal_payouts as pp
    rec = await _admin_get(request_id)
    if rec['status'] not in ('in_review', 'processing'):
        raise HTTPException(400, 'El pago automático solo está disponible en estados En revisión o Procesado')
    if rec.get('payout_batch_id'):
        raise HTTPException(400, 'Ya existe un payout enviado para esta solicitud; usa "Sincronizar"')
    note = (payload.get('note') or '').strip()[:300] or None
    try:
        res = await pp.create_payout(reference=rec['reference'], receiver_email=rec['paypal_email'], amount=float(rec['net_amount']),
                                     currency=rec['currency'], note=f"Retiro LIONSBIT {rec['reference']}", request_id=rec['id'])
    except pp.PayPalError as e:
        await db.paypal_withdrawal_requests.update_one({'id': request_id}, {'$set': {'payout_last_error': str(e), 'updated_at': _now_iso()},
                                                                            '$push': {'status_timeline': _tl(rec['status'], 'admin', admin, f'Intento de pago PayPal fallido: {e}')}})
        raise HTTPException(502 if e.name != 'NOT_CONFIGURED' else 400, str(e))
    now = _now_iso()
    s = pp.settings()
    await db.paypal_withdrawal_requests.update_one({'id': request_id}, {
        '$set': {'status': 'payout_sent', 'payout_batch_id': res['payout_batch_id'], 'payout_batch_status': res['batch_status'],
                 'payout_mode': s['mode'], 'payout_sent_at': now, 'payout_sent_by': admin.get('name') or admin.get('email'), 'payout_last_error': None, 'updated_at': now},
        '$push': {'status_timeline': _tl('payout_sent', 'admin', admin, f"Payout enviado a PayPal ({s['mode']}) · batch {res['payout_batch_id']}" + (f' · {note}' if note else ''))}})
    await create_notification(rec['user_id'], f"Retiro {rec['reference']} · pago enviado",
                              f"Hemos enviado {float(rec['net_amount']):,.2f} {rec['currency']} a tu cuenta PayPal {rec['paypal_email']}. Te avisaremos cuando PayPal lo confirme.")
    await _notify_stage(rec, 'payout_sent', admin, note, eta='Minutos (confirmación de PayPal)')
    fresh = await db.paypal_withdrawal_requests.find_one({'id': request_id})
    outcome = 'pending'
    try:
        outcome = await _finalize_payout(fresh, await pp.get_batch(res['payout_batch_id']), 'sync')
    except pp.PayPalError:
        pass
    return {'ok': True, 'outcome': outcome, 'request': await db.paypal_withdrawal_requests.find_one({'id': request_id}, PROJ)}


@router.post('/admin/paypal-withdrawals/{request_id}/sync')
async def admin_sync_payout(request_id: str, admin: dict = Depends(get_admin_user)):
    from services import paypal_payouts as pp
    rec = await db.paypal_withdrawal_requests.find_one({'id': request_id})
    if not rec or not rec.get('payout_batch_id'):
        raise HTTPException(400, 'Esta solicitud no tiene un payout de PayPal asociado')
    if rec['status'] != 'payout_sent':
        return {'ok': True, 'outcome': 'already_final', 'request': await db.paypal_withdrawal_requests.find_one({'id': request_id}, PROJ)}
    try:
        outcome = await _finalize_payout(rec, await pp.get_batch(rec['payout_batch_id']), 'sync')
    except pp.PayPalError as e:
        raise HTTPException(502, str(e))
    return {'ok': True, 'outcome': outcome, 'request': await db.paypal_withdrawal_requests.find_one({'id': request_id}, PROJ)}


async def poll_pending_payouts() -> dict:
    """Job programado: consulta a PayPal los payouts en 'Pago enviado'."""
    from services import paypal_payouts as pp
    if not pp.settings()['configured']:
        return {'skipped': True}
    done = {'success': 0, 'failed': 0, 'pending': 0, 'errors': 0}
    async for rec in db.paypal_withdrawal_requests.find({'status': 'payout_sent', 'payout_batch_id': {'$ne': None}}):
        try:
            done[await _finalize_payout(rec, await pp.get_batch(rec['payout_batch_id']), 'sondeo')] += 1
        except Exception:
            done['errors'] += 1
    return done


@router.post('/paypal/webhook')
async def paypal_webhook(request: Request):
    """Webhook de PayPal (PAYMENT.PAYOUTS-ITEM.* / PAYMENT.PAYOUTSBATCH.*). Verifica firma si hay PAYPAL_WEBHOOK_ID."""
    from services import paypal_payouts as pp
    body = await request.json()
    verified = await pp.verify_webhook(dict(request.headers), body)
    event_type = body.get('event_type', '')
    resource = body.get('resource') or {}
    batch_id = (resource.get('payout_batch_id') or (resource.get('batch_header') or {}).get('payout_batch_id'))
    await db.paypal_webhook_events.insert_one({'id': str(uuid.uuid4()), 'event_id': body.get('id'), 'event_type': event_type,
                                               'batch_id': batch_id, 'verified': verified, 'received_at': _now_iso()})
    if not verified:
        return {'ok': True, 'verified': False}
    if batch_id and event_type.startswith('PAYMENT.PAYOUTS'):
        rec = await db.paypal_withdrawal_requests.find_one({'payout_batch_id': batch_id, 'status': 'payout_sent'})
        if rec:
            try:
                await _finalize_payout(rec, await pp.get_batch(batch_id), 'webhook')
            except pp.PayPalError:
                pass
    return {'ok': True, 'verified': True}
