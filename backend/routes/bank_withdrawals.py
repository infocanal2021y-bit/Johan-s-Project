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
from services.email import send_email, send_email_background, get_email_template, send_withdrawal_request_received_email, send_withdrawal_stage_email
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
    'authorization_completed': {'label': 'Autorización completada', 'color': '#10b981'},
    'compliance_review':    {'label': 'Revisión cumplimiento','color': '#a78bfa'},
    'transfer_in_progress': {'label': 'Transferencia en curso','color': '#f59e0b'},
    'completed':            {'label': 'Completado',           'color': '#10b981'},
    'rejected':             {'label': 'Rechazado',            'color': '#ef4444'},
}

AUTHORIZATION_REQUIRED_EUR = 4850.0
AUTHORIZATION_CONCEPT = 'Cargo de autorización y procesamiento del retiro'


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


ABONO_WINDOW_HOURS = 72


async def auto_reject_expired_bank_withdrawals() -> dict:
    """Rechaza automáticamente los retiros bancarios cuyo abono (72h) ya expiró.

    Aplica a solicitudes confirmadas por OTP y a la espera de abono
    (status 'received' o 'conversion_done') sin haberlo completado.
    Devuelve los fondos al saldo disponible del usuario.
    """
    now = datetime.now(timezone.utc)
    cutoff_statuses = ['received', 'conversion_done']
    candidates = await db.bank_withdrawal_requests.find(
        {'status': {'$in': cutoff_statuses}},
        {'_id': 0, 'confirmation_code_hash': 0},
    ).to_list(1000)

    rejected = 0
    for rec in candidates:
        start_iso = rec.get('code_verified_at') or rec.get('updated_at') or rec.get('created_at')
        if not start_iso:
            continue
        try:
            start_dt = datetime.fromisoformat(start_iso.replace('Z', '+00:00'))
        except Exception:
            continue
        hours = (now - start_dt).total_seconds() / 3600
        if hours < ABONO_WINDOW_HOURS:
            continue

        now_iso = _now_iso()
        # Refund locked/debited funds back to available balance
        try:
            await db.multi_currency_wallets.update_one(
                {'user_id': rec['user_id']},
                {'$inc': {f"balances.{rec['from_currency']}": float(rec['from_amount'])},
                 '$set': {'last_movement_at': now_iso, 'updated_at': now_iso}},
            )
        except Exception:
            pass

        note = 'Rechazado automáticamente: el abono del cargo de autorización no se completó dentro del plazo de 72 horas.'
        tl = list(rec.get('status_timeline') or [])
        tl.append({
            'at': now_iso, 'status': 'rejected',
            'status_label': STATUS_LABELS.get('rejected', {}).get('label', 'Rechazado'),
            'actor_role': 'system', 'note': note,
        })
        await db.bank_withdrawal_requests.update_one(
            {'id': rec['id']},
            {'$set': {'status': 'rejected', 'admin_note': note, 'updated_at': now_iso, 'status_timeline': tl}},
        )
        try:
            await create_notification(
                rec['user_id'],
                f"Retiro {rec.get('reference','')} rechazado",
                f"Su retiro fue rechazado automáticamente porque el abono no se completó en el plazo de 72 h. "
                f"Los fondos ({float(rec['from_amount']):,.2f} {rec['from_currency']}) fueron devueltos a su saldo disponible.",
            )
        except Exception:
            pass
        try:
            await db.admin_notifications.insert_one({
                'id': str(uuid.uuid4()),
                'type': 'bank_withdrawal_auto_rejected',
                'user_id': rec['user_id'],
                'user_email': rec.get('user_email'),
                'user_name': rec.get('user_name'),
                'message': f"Retiro bancario {rec.get('reference','')} rechazado automáticamente (abono no completado en 72h). Fondos devueltos.",
                'read': False,
                'created_at': now_iso,
            })
        except Exception:
            pass
        rejected += 1

    if rejected:
        import logging
        logging.info(f"🧹 auto_reject_expired_bank_withdrawals: {rejected} retiros bancarios rechazados por abono expirado")
    return {'rejected': rejected}



# ══════════════════════════════════════════════════════════════════
#  CONFIG / METADATA
# ══════════════════════════════════════════════════════════════════

def _code_email_html(user_name: str, code: str, case_code: str, from_amount: float,
                     from_cur: str, net_out: float, to_cur: str, bank_name: str,
                     bank_holder: str, country: str) -> str:
    content = f"""
        <p style="color:#e2e8f0;font-size:16px;">Hola <strong style="color:#1973B8;">{user_name}</strong>,</p>
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
            Resumen: <strong style="color:#fff">{from_amount:,.2f} {from_cur}</strong> →
            <strong style="color:#10b981">{_round(net_out, to_cur):,.2f} {to_cur}</strong>
            a {bank_name} (titular: {bank_holder}).
        </p>
        <div style="background:linear-gradient(135deg,#0a1c3d 0%,#072146 100%);border:1px solid #1973B8;border-radius:12px;padding:16px;margin:20px 0;text-align:center;">
            <p style="color:#7dd3fc;font-size:10px;text-transform:uppercase;letter-spacing:2px;margin:0 0 4px 0;font-weight:bold;">Tu caso PLB</p>
            <p style="color:#fff;font-family:monospace;font-size:18px;font-weight:bold;letter-spacing:2px;margin:0;">{case_code or '—'}</p>
            <p style="color:#94a3b8;font-size:11px;margin:6px 0 0 0;">Cita este código en cualquier contacto con soporte.</p>
        </div>
        <p style="color:#f59e0b;font-size:12px;background:rgba(245,158,11,0.1);padding:14px;border-radius:8px;border-left:4px solid #f59e0b;margin-top:24px;">
            ⏱ Este código expira en <strong>15 minutos</strong>. Si no fuiste tú, ignora este email y
            contacta inmediatamente a soporte.
        </p>
    """
    return get_email_template(content, "Código de confirmación · Retiro")


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

    # Send code via email (awaited so we can report delivery status to the UI)
    email_sent = False
    try:
        html = _code_email_html(
            user.get('name') or user.get('email'), code, case_code,
            amount, from_cur, net_out, to_cur, bank_name, bank_holder, country,
        )
        result = await send_email(user.get('email'), f"🔐 Código {code} · Confirma tu retiro · LIONSBIT", html)
        email_sent = result is not None
    except Exception:
        pass

    await db.bank_withdrawal_requests.update_one(
        {'id': req_id},
        {'$set': {'last_code_sent_at': _now_iso(), 'last_code_email_sent': email_sent}}
    )

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
        'email_sent': email_sent,
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


@router.post("/bank-withdrawal/{request_id}/resend-code")
async def resend_code(request_id: str, user: dict = Depends(get_current_user)):
    """Regenerate the 6-digit confirmation code, reset expiry and re-send it by email.

    Only for the request owner while status='awaiting_code'. Rate-limited to
    one resend per 60 seconds.
    """
    rec = await db.bank_withdrawal_requests.find_one({'id': request_id, 'user_id': user['id']})
    if not rec:
        raise HTTPException(404, 'Solicitud no encontrada')
    if rec['status'] != 'awaiting_code':
        raise HTTPException(400, f"Esta solicitud ya está en estado: {rec['status']}")

    last_sent = rec.get('last_code_sent_at')
    if last_sent:
        elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(last_sent.replace('Z', '+00:00'))).total_seconds()
        if elapsed < 60:
            raise HTTPException(429, f'Espera {int(60 - elapsed)}s antes de reenviar el código.')

    code = _gen_code()
    code_expires_at = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    now = _now_iso()

    case_row = await db.cases.find_one({'entity_type': 'withdrawal', 'entity_id': request_id}, {'_id': 0, 'case_code': 1})
    html = _code_email_html(
        user.get('name') or user.get('email'), code,
        (case_row or {}).get('case_code'),
        rec['from_amount'], rec['from_currency'], rec['net_to_amount'], rec['to_currency'],
        rec['bank_name'], rec['bank_holder'], rec['country'],
    )
    result = await send_email(user.get('email'), f"🔐 Código {code} · Confirma tu retiro · LIONSBIT", html)
    email_sent = result is not None

    update = {
        'code_expires_at': code_expires_at,
        'code_attempts': 0,
        'last_code_sent_at': now,
        'last_code_email_sent': email_sent,
        'updated_at': now,
    }
    if email_sent:
        # Only rotate the active code if the new one actually reached the outbox
        update['confirmation_code_hash'] = code
    await db.bank_withdrawal_requests.update_one(
        {'id': request_id},
        {'$set': update,
         '$push': {'status_timeline': _timeline_entry(
             'awaiting_code', 'user', user,
             'Código reenviado por email' if email_sent else 'Reenvío de código falló (email no entregado)')}},
    )

    if not email_sent:
        return {
            'ok': False, 'sent': False,
            'message': 'No se pudo enviar el email en este momento. Inténtalo de nuevo en unos minutos o contacta a soporte.',
        }

    masked = (user.get('email') or '')
    if '@' in masked:
        local, domain = masked.split('@', 1)
        masked = (local[:2] + '***' + local[-1:]) + '@' + domain
    return {'ok': True, 'sent': True, 'masked_email': masked, 'expires_at': code_expires_at}


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

    # Confirmation email: "Hemos recibido su solicitud de retiro"
    import asyncio as _asyncio
    _asyncio.create_task(send_withdrawal_request_received_email(
        user_email=user.get('email'),
        user_name=user.get('name') or user.get('email'),
        reference=rec['reference'],
        requested_at=now,
        amount_text=f"{amount:,.2f} {from_cur}",
        net_text=f"{float(rec['net_to_amount']):,.2f} {to_cur}",
        fee_text=f"{float(rec['fx_fee_amount']):,.2f} {to_cur} ({rec['fx_fee_pct']}% conversión)",
        method_text=f"{rec['bank_name']} · {rec.get('country_name', '')}".strip(' ·'),
        status_text=STATUS_LABELS.get('conversion_done', {}).get('label', 'Conversión completada'),
    ))

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


@router.get("/admin/bank-withdrawals/{request_id}/authorization-info")
async def admin_authorization_info(request_id: str, admin: dict = Depends(get_admin_user)):
    """Full detail for the authorization modal: amounts, concept, status, date, payment method."""
    rec = await db.bank_withdrawal_requests.find_one(
        {'id': request_id}, {'_id': 0, 'confirmation_code_hash': 0}
    )
    if not rec:
        raise HTTPException(404, 'Solicitud no encontrada')

    intent = await db.crypto_payment_intents.find_one(
        {'context': f"bankwithdrawal:{rec.get('reference')}"},
        {'_id': 0, 'coin': 1, 'coin_name': 1, 'network': 1, 'status': 1,
         'txid': 1, 'declared_txid': 1, 'detected_amount': 1, 'created_at': 1},
        sort=[('created_at', -1)],
    )
    if intent:
        payment_method = {
            'type': 'crypto',
            'label': f"Cripto · {intent.get('coin_name') or intent.get('coin')} ({intent.get('network', '')})".strip(),
            'status': intent.get('status'),
            'txid': intent.get('txid') or intent.get('declared_txid'),
            'detected_amount': intent.get('detected_amount'),
            'declared_at': intent.get('created_at'),
        }
    else:
        payment_method = {'type': 'crypto', 'label': 'Cripto (BTC/USDT)', 'status': 'not_declared',
                          'txid': None, 'detected_amount': None, 'declared_at': None}

    return {
        'id': rec['id'],
        'reference': rec.get('reference'),
        'user_name': rec.get('user_name'),
        'user_email': rec.get('user_email'),
        'requested_amount': rec.get('from_amount'),
        'requested_currency': rec.get('from_currency'),
        'net_to_amount': rec.get('net_to_amount'),
        'to_currency': rec.get('to_currency'),
        'required_eur': AUTHORIZATION_REQUIRED_EUR,
        'concept': AUTHORIZATION_CONCEPT,
        'status': rec.get('status'),
        'status_label': STATUS_LABELS.get(rec.get('status'), {}).get('label', rec.get('status')),
        'created_at': rec.get('created_at'),
        'bank_name': rec.get('bank_name'),
        'payment_method': payment_method,
        'authorization': {
            'status': rec.get('authorization_status') or 'pending',
            'authorized_at': rec.get('authorized_at'),
            'authorized_by_name': rec.get('authorized_by_name'),
        },
    }


@router.post("/admin/bank-withdrawals/{request_id}/authorize")
async def admin_authorize(request_id: str, payload: dict, admin: dict = Depends(get_admin_user)):
    """Admin confirms the 4,850 EUR authorization charge was received and verified.
    Sets authorization_status='completed' and advances the withdrawal to
    compliance_review ('Retiro autorizado para procesamiento'), recording who
    confirmed and when in the status timeline."""
    rec = await db.bank_withdrawal_requests.find_one({'id': request_id})
    if not rec:
        raise HTTPException(404, 'Solicitud no encontrada')
    if rec.get('authorization_status') == 'completed':
        raise HTTPException(400, 'La autorización ya fue completada')
    if rec['status'] not in ('received', 'conversion_done'):
        raise HTTPException(400, f"La autorización sólo aplica a retiros pendientes de abono (estado actual: {rec['status']})")

    note = (payload.get('note') or '').strip()[:300] or None
    now = _now_iso()

    auth_note = f"Abono de {AUTHORIZATION_REQUIRED_EUR:,.2f} € recibido y verificado · confirmado por {admin.get('name')}"
    if note:
        auth_note += f" · {note}"

    tl_auth = _timeline_entry('authorization_completed', 'admin', admin, auth_note)
    tl_advance = _timeline_entry('compliance_review', 'admin', admin, 'Retiro autorizado para procesamiento')

    await db.bank_withdrawal_requests.update_one(
        {'id': request_id},
        {'$set': {
            'status': 'compliance_review',
            'authorization_status': 'completed',
            'authorized_at': now,
            'authorized_by': admin.get('id'),
            'authorized_by_name': admin.get('name'),
            'updated_at': now,
        },
         '$push': {'status_timeline': {'$each': [tl_auth, tl_advance]}}},
    )

    try:
        await create_notification(
            rec['user_id'],
            f"Retiro {rec['reference']} · Autorización completada",
            'Su abono fue recibido y verificado correctamente. Su retiro ha sido autorizado para procesamiento.',
        )
    except Exception:
        pass

    import asyncio as _asyncio
    _asyncio.create_task(send_withdrawal_stage_email(
        user_email=rec.get('user_email'),
        user_name=rec.get('user_name') or rec.get('user_email'),
        reference=rec['reference'],
        status_label='Autorización completada · Retiro autorizado para procesamiento',
        status_color='#10b981',
        amount_text=f"{float(rec['net_to_amount']):,.2f} {rec['to_currency']}",
        bank_text=f"{rec['bank_name']} · {rec.get('country_name', '')}".strip(' ·'),
        eta_text='1-3 horas',
        note=None,
        cta_path='/wallet/bank-withdrawal',
    ))

    fresh = await db.bank_withdrawal_requests.find_one(
        {'id': request_id}, {'_id': 0, 'confirmation_code_hash': 0}
    )
    return {'ok': True, 'request': fresh}


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

    _eta = {
        'received': 'Procesamiento inmediato',
        'conversion_done': '~5 min',
        'compliance_review': '1-3 horas',
        'transfer_in_progress': '1-2 días hábiles',
        'completed': '2-5 días hábiles',
    }
    import asyncio as _asyncio
    _asyncio.create_task(send_withdrawal_stage_email(
        user_email=rec.get('user_email'),
        user_name=rec.get('user_name') or rec.get('user_email'),
        reference=rec['reference'],
        status_label=STATUS_LABELS[next_status]['label'],
        status_color=STATUS_LABELS[next_status]['color'],
        amount_text=f"{float(rec['net_to_amount']):,.2f} {rec['to_currency']}",
        bank_text=f"{rec['bank_name']} · {rec.get('country_name', '')}".strip(' ·'),
        eta_text=_eta.get(next_status),
        note=note,
        cta_path='/wallet/bank-withdrawal',
    ))

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
        # Fetch PLB case code for this withdrawal so the email shows it
        case_row = await db.cases.find_one(
            {'entity_type': 'withdrawal', 'entity_id': request_id},
            {'_id': 0, 'code': 1},
        )
        case_code_display = (case_row or {}).get('code') or rec['reference']
        # Sync case status to completed
        await update_case_status(
            entity_type='withdrawal',
            entity_id=request_id,
            status='completed',
            summary=f"Retiro completado · {rec['net_to_amount']} {rec['to_currency']} → {rec['bank_name']}",
        )
        # User email
        content = f"""
            <p style="color:#e2e8f0;font-size:16px;">Estimado/a <strong style="color:#10b981;">{rec.get('user_name') or rec.get('user_email')}</strong>,</p>
            <p style="color:#e2e8f0;font-size:15px;">Su retiro a {rec['country_flag']} {rec['bank_name']} ha sido <strong style="color:#10b981;">completado</strong>.</p>
            <div style="background:linear-gradient(135deg,#0a1c3d 0%,#072146 100%);border:1px solid #1973B8;border-radius:12px;padding:16px;margin:18px 0;text-align:center;">
                <p style="color:#7dd3fc;font-size:10px;text-transform:uppercase;letter-spacing:2px;margin:0 0 4px 0;font-weight:bold;">Caso PLB</p>
                <p style="color:#fff;font-family:monospace;font-size:18px;font-weight:bold;letter-spacing:2px;margin:0;">{case_code_display}</p>
            </div>
            <table width="100%" style="background:#0f172a;border-radius:12px;margin:18px 0;">
                <tr><td style="padding:20px;">
                    <p style="color:#10b981;font-size:13px;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 10px 0;">Detalles</p>
                    <p style="color:#94a3b8;">Monto recibido: <strong style="color:#10b981;">{rec['net_to_amount']:,.2f} {rec['to_currency']}</strong></p>
                    <p style="color:#94a3b8;">Banco: {rec['bank_name']}</p>
                    <p style="color:#94a3b8;">Titular: {rec['bank_holder']}</p>
                    <p style="color:#94a3b8;">Referencia interna: <span style="color:#06b6d4;font-family:monospace;">{rec['reference']}</span></p>
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

    import asyncio as _asyncio
    _asyncio.create_task(send_withdrawal_stage_email(
        user_email=rec.get('user_email'),
        user_name=rec.get('user_name') or rec.get('user_email'),
        reference=rec['reference'],
        status_label=STATUS_LABELS['rejected']['label'],
        status_color=STATUS_LABELS['rejected']['color'],
        amount_text=f"{float(rec['from_amount']):,.2f} {rec['from_currency']}",
        bank_text=f"{rec['bank_name']} · {rec.get('country_name', '')}".strip(' ·'),
        note=note,
        rejected=True,
        cta_path='/wallet/bank-withdrawal',
    ))

    fresh = await db.bank_withdrawal_requests.find_one(
        {'id': request_id}, {'_id': 0, 'confirmation_code_hash': 0}
    )
    return {'ok': True, 'request': fresh}
