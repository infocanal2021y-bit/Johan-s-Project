"""Bank Withdrawals · Fase 2.

User flow:
1. POST /bank-withdrawal/initiate — validates balance, locks funds, generates 6-digit
   confirmation code, sends it via email. Status: `awaiting_code`.
2. POST /bank-withdrawal/{id}/confirm-code {code} — verifies the 6-digit code,
   completes the conversion + debits the wallet, sets status=`received`, kicks off
   the timeline.
3. GET /bank-withdrawal/list — user's history.
4. GET /bank-withdrawal/{id} — single request with full timeline.

Admin flow:
- GET /admin/bank-withdrawals?status=... — queue with KPIs.
- POST /admin/bank-withdrawals/{id}/advance {to_status, note?} — move forward.
- POST /admin/bank-withdrawals/{id}/complete {proof_url?, note?} — finalize.
- POST /admin/bank-withdrawals/{id}/reject {note} — reject + refund.

Status machine:
  awaiting_code → received → conversion_done → compliance_review →
  transfer_in_progress → completed
                                 ↘ rejected (refund triggered)

Each transition appends a row to `status_timeline[]`:
  {at, status, actor_role, actor_email, note}
"""
import uuid
import random
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from config import db
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification
from services.email import send_email_background, get_email_template
from services.case_codes import generate_case_code, update_case_status
from routes.multicurrency import (
    SUPPORTED_CURRENCIES, CURRENCY_META, DEFAULT_FEE_PCT,
    _convert_rate, _ensure_wallet, _round, _now_iso,
)


router = APIRouter()


# ── Status machine ────────────────────────────────────────────────
STATUS_FLOW = [
    'awaiting_code',
    'received',
    'conversion_done',
    'compliance_review',
    'transfer_in_progress',
    'completed',
]
TERMINAL = {'completed', 'rejected'}


STATUS_LABELS = {
    'awaiting_code':        {'label': 'Esperando código',     'color': '#94a3b8'},
    'received':             {'label': 'Solicitud recibida',   'color': '#1973B8'},
    'conversion_done':      {'label': 'Conversión procesada', 'color': '#06b6d4'},
    'compliance_review':    {'label': 'Revisión cumplimiento','color': '#a78bfa'},
    'transfer_in_progress': {'label': 'Transferencia en curso','color': '#f59e0b'},
    'completed':            {'label': 'Completado',           'color': '#10b981'},
    'rejected':             {'label': 'Rechazado',            'color': '#ef4444'},
}


# Minimum data per country (for the form)
COUNTRY_BANKS = {
    'ES': {'name': 'España', 'flag': '🇪🇸', 'currency': 'EUR', 'banks': ['CaixaBank', 'Santander', 'BBVA', 'Banco Sabadell', 'ING', 'Bankinter']},
    'US': {'name': 'Estados Unidos', 'flag': '🇺🇸', 'currency': 'USD', 'banks': ['Chase', 'Bank of America', 'Wells Fargo', 'Citi', 'US Bank']},
    'GB': {'name': 'Reino Unido', 'flag': '🇬🇧', 'currency': 'GBP', 'banks': ['HSBC', 'Barclays', 'Lloyds', 'NatWest', 'Santander UK']},
    'DO': {'name': 'República Dominicana', 'flag': '🇩🇴', 'currency': 'DOP', 'banks': ['Banreservas', 'Popular Dominicano', 'BHD León', 'Santa Cruz', 'Scotiabank RD']},
    'MX': {'name': 'México', 'flag': '🇲🇽', 'currency': 'MXN', 'banks': ['BBVA México', 'Banamex', 'Santander México', 'Banorte', 'HSBC México']},
    'CO': {'name': 'Colombia', 'flag': '🇨🇴', 'currency': 'COP', 'banks': ['Bancolombia', 'Davivienda', 'BBVA Colombia', 'Banco de Bogotá', 'AV Villas']},
}


def _gen_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def _gen_reference() -> str:
    return f"WD-{datetime.now(timezone.utc).strftime('%y%m%d')}-{uuid.uuid4().hex[:6].upper()}"


def _timeline_entry(status: str, actor_role: str, actor: Optional[dict] = None, note: Optional[str] = None) -> dict:
    return {
        'at': _now_iso(),
        'status': status,
        'status_label': STATUS_LABELS.get(status, {}).get('label', status),
        'actor_role': actor_role,
        'actor_email': (actor or {}).get('email'),
        'actor_name': (actor or {}).get('name') or (actor or {}).get('email'),
        'note': note,
    }


# ══════════════════════════════════════════════════════════════════
#  CONFIG / METADATA
# ══════════════════════════════════════════════════════════════════

@router.get("/bank-withdrawal/config")
async def get_config(user: dict = Depends(get_current_user)):
    """Returns countries + suggested banks + ETA per status (for the wizard)."""
    return {
        'countries': COUNTRY_BANKS,
        'status_labels': STATUS_LABELS,
        'status_flow': STATUS_FLOW,
        'eta': {
            'received':             '0 min',
            'conversion_done':      '~5 min',
            'compliance_review':    '1-3 h',
            'transfer_in_progress': '1-2 días hábiles',
            'completed':            '2-5 días hábiles',
        },
        'fee_pct': DEFAULT_FEE_PCT,
    }


# ══════════════════════════════════════════════════════════════════
#  USER ENDPOINTS
# ══════════════════════════════════════════════════════════════════

@router.post("/bank-withdrawal/initiate")
async def initiate(payload: dict, user: dict = Depends(get_current_user)):
    """Validates balance and bank fields, locks the amount as `pending`, sends
    a 6-digit code via email. Returns the draft request_id + masked email.
    """
    from_cur = (payload.get('from_currency') or '').upper()
    country = (payload.get('country') or '').upper()
    bank_name = (payload.get('bank_name') or '').strip()[:120]
    bank_holder = (payload.get('bank_holder') or '').strip()[:160]
    bank_account = (payload.get('bank_account') or '').strip()[:64]
    bank_swift = (payload.get('bank_swift') or '').strip()[:32] or None

    if from_cur not in SUPPORTED_CURRENCIES:
        raise HTTPException(400, 'Moneda origen no soportada')
    if country not in COUNTRY_BANKS:
        raise HTTPException(400, 'País no soportado')
    if not bank_name or not bank_holder or not bank_account:
        raise HTTPException(400, 'Banco, titular y número de cuenta/IBAN son obligatorios')
    if len(bank_account) < 6:
        raise HTTPException(400, 'Número de cuenta/IBAN demasiado corto')

    try:
        amount = float(payload.get('amount') or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, 'Monto inválido')
    if amount <= 0:
        raise HTTPException(400, 'El monto debe ser mayor a 0')

    to_cur = COUNTRY_BANKS[country]['currency']
    wallet = await _ensure_wallet(user['id'])
    available = float((wallet.get('balances') or {}).get(from_cur, 0.0))
    pending = float((wallet.get('pending') or {}).get(from_cur, 0.0))
    if amount > (available - pending) + 1e-9:
        raise HTTPException(400, f'Saldo insuficiente en {from_cur}. Disponible: {_round(available - pending, from_cur)}')

    rate = await _convert_rate(from_cur, to_cur)
    fee_pct = DEFAULT_FEE_PCT
    gross_out = amount * rate
    fee_amount = gross_out * (fee_pct / 100.0)
    net_out = gross_out - fee_amount

    code = _gen_code()
    code_expires_at = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    req_id = str(uuid.uuid4())
    reference = _gen_reference()
    now = _now_iso()

    doc = {
        'id': req_id,
        'reference': reference,
        'user_id': user['id'],
        'user_email': user.get('email'),
        'user_name': user.get('name'),
        'from_currency': from_cur,
        'to_currency': to_cur,
        'from_amount': _round(amount, from_cur),
        'fx_rate': rate,
        'fx_fee_pct': fee_pct,
        'fx_fee_amount': _round(fee_amount, to_cur),
        'gross_out': _round(gross_out, to_cur),
        'net_to_amount': _round(net_out, to_cur),
        'country': country,
        'country_name': COUNTRY_BANKS[country]['name'],
        'country_flag': COUNTRY_BANKS[country]['flag'],
        'bank_name': bank_name,
        'bank_holder': bank_holder,
        'bank_account': bank_account,
        'bank_swift': bank_swift,
        'status': 'awaiting_code',
        'confirmation_code_hash': code,           # plain for now (in-app code)
        'code_expires_at': code_expires_at,
        'code_attempts': 0,
        'code_verified_at': None,
        'admin_note': None,
        'proof_url': None,
        'status_timeline': [
            _timeline_entry('awaiting_code', 'user', user, 'Solicitud creada, esperando código de confirmación')
        ],
        'created_at': now,
        'updated_at': now,
    }
    await db.bank_withdrawal_requests.insert_one(doc)

    # Allocate unified PLB case code
    case_code = await generate_case_code(
        user_id=user['id'],
        user_email=user.get('email'),
        entity_type='withdrawal',
        entity_id=req_id,
        entity_ref=reference,
        summary=f'Retiro {amount:,.2f} {from_cur} → {COUNTRY_BANKS[country]["name"]}',
        status='awaiting_code',
    )

    # Reserve funds: $inc pending balance
    await db.multi_currency_wallets.update_one(
        {'user_id': user['id']},
        {'$inc': {f'pending.{from_cur}': _round(amount, from_cur)},
         '$set': {'updated_at': now}},
    )

    # Send code via email
    try:
        content = f"""
            <p style="color:#e2e8f0;font-size:16px;">Hola <strong style="color:#1973B8;">{user.get('name') or user.get('email')}</strong>,</p>
            <p style="color:#e2e8f0;font-size:15px;">
                Hemos recibido tu solicitud de retiro a {COUNTRY_BANKS[country]['flag']} {COUNTRY_BANKS[country]['name']}.
                Confirma con el código:
            </p>
            <div style="text-align:center;margin:30px 0;">
                <div style="display:inline-block;background:#072146;border:2px solid #1973B8;border-radius:14px;padding:24px 38px;">
                    <p style="color:#7CB1E5;font-size:11px;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px 0;">Tu código</p>
                    <p style="color:#fff;font-family:monospace;font-size:36px;font-weight:bold;letter-spacing:8px;margin:0;">{code}</p>
                </div>
            </div>
            <p style="color:#cbd5e1;font-size:13px;line-height:1.6;">
                Resumen: <strong style="color:#fff">{amount:,.2f} {from_cur}</strong> →
                <strong style="color:#10b981">{_round(net_out, to_cur):,.2f} {to_cur}</strong>
                a {bank_name} (titular: {bank_holder}).
            </p>
            <p style="color:#f59e0b;font-size:12px;background:rgba(245,158,11,0.1);padding:14px;border-radius:8px;border-left:4px solid #f59e0b;margin-top:24px;">
                ⏱ Este código expira en <strong>15 minutos</strong>. Si no fuiste tú, ignora este email y
                contacta inmediatamente a soporte.
            </p>
        """
        html = get_email_template(content, "Código de confirmación · Retiro")
        send_email_background(user.get('email'), f"🔐 Código {code} · Confirma tu retiro · LIONSBIT", html)
    except Exception:
        pass

    masked = (user.get('email') or '')
    if '@' in masked:
        local, domain = masked.split('@', 1)
        masked = (local[:2] + '***' + local[-1:]) + '@' + domain

    return {
        'ok': True,
        'request_id': req_id,
        'reference': reference,
        'case_code': case_code,
        'masked_email': masked,
        'expires_at': code_expires_at,
        'preview': {
            'from_amount': _round(amount, from_cur),
            'from_currency': from_cur,
            'to_amount': _round(net_out, to_cur),
            'to_currency': to_cur,
            'rate': rate,
            'fee_pct': fee_pct,
            'fee_amount': _round(fee_amount, to_cur),
        },
    }


@router.post("/bank-withdrawal/{request_id}/confirm-code")
async def confirm_code(request_id: str, payload: dict, user: dict = Depends(get_current_user)):
    code = (payload.get('code') or '').strip()
    if not code or len(code) != 6 or not code.isdigit():
        raise HTTPException(400, 'Código inválido. Debe ser 6 dígitos.')

    rec = await db.bank_withdrawal_requests.find_one({'id': request_id, 'user_id': user['id']})
    if not rec:
        raise HTTPException(404, 'Solicitud no encontrada')
    if rec['status'] != 'awaiting_code':
        raise HTTPException(400, f"Esta solicitud ya está en estado: {rec['status']}")
    if (rec.get('code_attempts') or 0) >= 5:
        raise HTTPException(429, 'Demasiados intentos. Inicia una nueva solicitud.')

    expires = datetime.fromisoformat(rec['code_expires_at'].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expires:
        await db.bank_withdrawal_requests.update_one(
            {'id': request_id},
            {'$set': {'status': 'rejected', 'admin_note': 'Código expirado', 'updated_at': _now_iso()},
             '$push': {'status_timeline': _timeline_entry('rejected', 'system', None, 'Código expirado sin confirmar')}},
        )
        # Release reserved funds
        await _release_pending(rec)
        raise HTTPException(400, 'El código ha expirado. Inicia una nueva solicitud.')

    if code != rec.get('confirmation_code_hash'):
        await db.bank_withdrawal_requests.update_one(
            {'id': request_id}, {'$inc': {'code_attempts': 1}, '$set': {'updated_at': _now_iso()}},
        )
        raise HTTPException(400, f'Código incorrecto. Intentos restantes: {5 - (rec.get("code_attempts") or 0) - 1}')

    # Code OK → debit balance, release pending, mark conversion done, kick off timeline
    from_cur = rec['from_currency']
    to_cur = rec['to_currency']
    amount = float(rec['from_amount'])
    now = _now_iso()

    upd = await db.multi_currency_wallets.update_one(
        {'user_id': user['id'], f'balances.{from_cur}': {'$gte': amount - 1e-9}},
        {'$inc': {
            f'balances.{from_cur}': -amount,
            f'pending.{from_cur}': -amount,
         },
         '$set': {'last_movement_at': now, 'updated_at': now}},
    )
    if upd.matched_count == 0:
        raise HTTPException(409, 'El saldo cambió durante la confirmación. Vuelve a iniciar la solicitud.')

    new_timeline = list(rec.get('status_timeline') or [])
    new_timeline.append(_timeline_entry('received', 'user', user, 'Código confirmado'))
    new_timeline.append(_timeline_entry('conversion_done', 'system', None,
        f'Conversión: {amount} {from_cur} → {rec["net_to_amount"]} {to_cur}'))

    await db.bank_withdrawal_requests.update_one(
        {'id': request_id},
        {'$set': {
            'status': 'conversion_done',
            'code_verified_at': now,
            'confirmation_code_hash': None,  # burn it
            'updated_at': now,
            'status_timeline': new_timeline,
        }},
    )

    # Notify admins via in-app + email to admin inbox
    try:
        await create_notification(
            user['id'],
            'Retiro confirmado',
            f'Tu retiro {rec["reference"]} se procesa: {amount} {from_cur} → {rec["net_to_amount"]} {to_cur} '
            f'a {rec["bank_name"]}. Tiempo estimado: 2-5 días hábiles.',
        )
    except Exception:
        pass

    # Audit conversion in currency_conversions for unified history
    await db.currency_conversions.insert_one({
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'user_email': user.get('email'),
        'user_name': user.get('name'),
        'from_currency': from_cur,
        'to_currency': to_cur,
        'amount_in': amount,
        'rate': rec['fx_rate'],
        'fee_pct': rec['fx_fee_pct'],
        'fee_amount': rec['fx_fee_amount'],
        'gross_out': rec['gross_out'],
        'amount_out': rec['net_to_amount'],
        'status': 'completed',
        'kind': 'bank_withdrawal',
        'bank_withdrawal_id': request_id,
        'reference': rec['reference'],
        'created_at': now,
    })

    # Sync unified case status
    await update_case_status(
        entity_type='withdrawal',
        entity_id=request_id,
        status='conversion_done',
        summary=f'Retiro {amount:,.2f} {from_cur} → {rec["bank_name"]}',
    )

    fresh = await db.bank_withdrawal_requests.find_one(
        {'id': request_id}, {'_id': 0, 'confirmation_code_hash': 0}
    )
    # Include the case code in the response so the wizard can show it on success
    case_row = await db.cases.find_one(
        {'entity_type': 'withdrawal', 'entity_id': request_id},
        {'_id': 0, 'code': 1},
    )
    return {
        'ok': True,
        'request': fresh,
        'reference': rec.get('reference'),
        'case_code': (case_row or {}).get('code'),
    }


async def _release_pending(rec: dict):
    """Return locked funds to the user's available balance."""
    try:
        await db.multi_currency_wallets.update_one(
            {'user_id': rec['user_id']},
            {'$inc': {f"pending.{rec['from_currency']}": -float(rec['from_amount'])},
             '$set': {'updated_at': _now_iso()}},
        )
    except Exception:
        pass


@router.get("/bank-withdrawal/list")
async def list_my_withdrawals(limit: int = 50, user: dict = Depends(get_current_user)):
    limit = max(1, min(limit, 200))
    cur = db.bank_withdrawal_requests.find(
        {'user_id': user['id']},
        {'_id': 0, 'confirmation_code_hash': 0},
    ).sort('created_at', -1).limit(limit)
    items = await cur.to_list(length=limit)
    return {'items': items, 'count': len(items)}


@router.get("/bank-withdrawal/{request_id}")
async def get_my_withdrawal(request_id: str, user: dict = Depends(get_current_user)):
    rec = await db.bank_withdrawal_requests.find_one(
        {'id': request_id, 'user_id': user['id']},
        {'_id': 0, 'confirmation_code_hash': 0},
    )
    if not rec:
        raise HTTPException(404, 'Solicitud no encontrada')
    return rec


# ══════════════════════════════════════════════════════════════════
#  ADMIN ENDPOINTS
# ══════════════════════════════════════════════════════════════════

@router.get("/admin/bank-withdrawals")
async def admin_queue(status: Optional[str] = None, limit: int = 100, admin: dict = Depends(get_admin_user)):
    limit = max(1, min(limit, 500))
    q: dict = {}
    if status and status != 'all':
        q['status'] = status

    cur = db.bank_withdrawal_requests.find(
        q, {'_id': 0, 'confirmation_code_hash': 0}
    ).sort('created_at', -1).limit(limit)
    items = await cur.to_list(length=limit)

    counts = {}
    async for row in db.bank_withdrawal_requests.aggregate(
        [{'$group': {'_id': '$status', 'n': {'$sum': 1}}}]
    ):
        counts[row['_id']] = row['n']
    return {'items': items, 'count': len(items), 'counts': counts}


@router.post("/admin/bank-withdrawals/{request_id}/advance")
async def admin_advance(request_id: str, payload: dict, admin: dict = Depends(get_admin_user)):
    """Move the request to the NEXT logical status. Body may include {note}."""
    rec = await db.bank_withdrawal_requests.find_one({'id': request_id})
    if not rec:
        raise HTTPException(404, 'Solicitud no encontrada')
    if rec['status'] in TERMINAL:
        raise HTTPException(400, f"Esta solicitud está en estado terminal: {rec['status']}")
    if rec['status'] == 'awaiting_code':
        raise HTTPException(400, 'El usuario debe confirmar el código primero')

    try:
        idx = STATUS_FLOW.index(rec['status'])
    except ValueError:
        raise HTTPException(400, f"Estado inválido: {rec['status']}")
    if idx + 1 >= len(STATUS_FLOW):
        raise HTTPException(400, 'Ya está en la última etapa antes de completar')

    next_status = STATUS_FLOW[idx + 1]
    note = (payload.get('note') or '').strip()[:300] or None
    now = _now_iso()

    await db.bank_withdrawal_requests.update_one(
        {'id': request_id},
        {'$set': {'status': next_status, 'updated_at': now},
         '$push': {'status_timeline': _timeline_entry(next_status, 'admin', admin, note)}},
    )

    try:
        await create_notification(
            rec['user_id'],
            f"Retiro {rec['reference']} actualizado",
            f"Tu retiro pasó a: {STATUS_LABELS[next_status]['label']}.",
        )
    except Exception:
        pass

    fresh = await db.bank_withdrawal_requests.find_one(
        {'id': request_id}, {'_id': 0, 'confirmation_code_hash': 0}
    )
    return {'ok': True, 'request': fresh}


@router.post("/admin/bank-withdrawals/{request_id}/complete")
async def admin_complete(request_id: str, payload: dict, admin: dict = Depends(get_admin_user)):
    rec = await db.bank_withdrawal_requests.find_one({'id': request_id})
    if not rec:
        raise HTTPException(404, 'Solicitud no encontrada')
    if rec['status'] in TERMINAL:
        raise HTTPException(400, f"Esta solicitud ya está en estado terminal: {rec['status']}")

    proof_url = (payload.get('proof_url') or '').strip()[:500] or None
    note = (payload.get('note') or '').strip()[:300] or None
    now = _now_iso()

    await db.bank_withdrawal_requests.update_one(
        {'id': request_id},
        {'$set': {
            'status': 'completed',
            'completed_at': now,
            'proof_url': proof_url,
            'updated_at': now,
         },
         '$push': {'status_timeline': _timeline_entry('completed', 'admin', admin, note)}},
    )

    try:
        await create_notification(
            rec['user_id'],
            f"✅ Retiro {rec['reference']} completado",
            f"Tu retiro de {rec['net_to_amount']} {rec['to_currency']} a {rec['bank_name']} ha sido completado.",
        )
        # User email
        content = f"""
            <p style="color:#e2e8f0;font-size:16px;">Estimado/a <strong style="color:#10b981;">{rec.get('user_name') or rec.get('user_email')}</strong>,</p>
            <p style="color:#e2e8f0;font-size:15px;">Su retiro a {rec['country_flag']} {rec['bank_name']} ha sido <strong style="color:#10b981;">completado</strong>.</p>
            <table width="100%" style="background:#0f172a;border-radius:12px;margin:18px 0;">
                <tr><td style="padding:20px;">
                    <p style="color:#10b981;font-size:13px;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 10px 0;">Detalles</p>
                    <p style="color:#94a3b8;">Monto recibido: <strong style="color:#10b981;">{rec['net_to_amount']:,.2f} {rec['to_currency']}</strong></p>
                    <p style="color:#94a3b8;">Banco: {rec['bank_name']}</p>
                    <p style="color:#94a3b8;">Titular: {rec['bank_holder']}</p>
                    <p style="color:#94a3b8;">Referencia: <span style="color:#06b6d4;font-family:monospace;">{rec['reference']}</span></p>
                </td></tr>
            </table>
        """
        html = get_email_template(content, "Retiro completado")
        send_email_background(rec.get('user_email'), f"✅ Retiro {rec['reference']} completado · LIONSBIT", html)
    except Exception:
        pass

    fresh = await db.bank_withdrawal_requests.find_one(
        {'id': request_id}, {'_id': 0, 'confirmation_code_hash': 0}
    )
    return {'ok': True, 'request': fresh}


@router.post("/admin/bank-withdrawals/{request_id}/reject")
async def admin_reject(request_id: str, payload: dict, admin: dict = Depends(get_admin_user)):
    note = (payload.get('note') or '').strip()[:300]
    if not note:
        raise HTTPException(400, 'Motivo de rechazo requerido')

    rec = await db.bank_withdrawal_requests.find_one({'id': request_id})
    if not rec:
        raise HTTPException(404, 'Solicitud no encontrada')
    if rec['status'] in TERMINAL:
        raise HTTPException(400, f"Esta solicitud ya está en estado terminal: {rec['status']}")

    now = _now_iso()

    # Refund: if funds were already debited (status past awaiting_code), credit back.
    if rec['status'] not in ('awaiting_code',):
        await db.multi_currency_wallets.update_one(
            {'user_id': rec['user_id']},
            {'$inc': {f"balances.{rec['from_currency']}": float(rec['from_amount'])},
             '$set': {'last_movement_at': now, 'updated_at': now}},
        )
    else:
        # Still in pending — release the lock instead
        await _release_pending(rec)

    await db.bank_withdrawal_requests.update_one(
        {'id': request_id},
        {'$set': {'status': 'rejected', 'admin_note': note, 'rejected_at': now, 'updated_at': now},
         '$push': {'status_timeline': _timeline_entry('rejected', 'admin', admin, note)}},
    )

    try:
        await create_notification(
            rec['user_id'],
            f"⚠️ Retiro {rec['reference']} rechazado",
            f"Motivo: {note}. Los fondos han sido devueltos a tu saldo {rec['from_currency']}.",
        )
    except Exception:
        pass

    fresh = await db.bank_withdrawal_requests.find_one(
        {'id': request_id}, {'_id': 0, 'confirmation_code_hash': 0}
    )
    return {'ok': True, 'request': fresh}
