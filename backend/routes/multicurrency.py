"""Multi-Currency Wallet · Fase 1.

Modelo: cada usuario tiene un wallet multi-divisa con 7 monedas
(EUR, USD, GBP, DOP, MXN, COP, BTC). Las tasas se almacenan como factor relativo
a EUR (EUR=1.0). El admin las edita manualmente desde /admin/multi-currency/rates.

Conversiones:
- Preview: POST /multi-currency/preview → {rate, fee_pct, fee_amount, total_out}
- Confirm: POST /multi-currency/convert → ejecuta la operación atómicamente
  (deduce monto de origen, acredita destino, persiste fila en `currency_conversions`).

Colecciones MongoDB:
- multi_currency_wallets: {id, user_id, balances{EUR,USD,...}, pending{EUR,...}, last_movement_at, created_at, updated_at}
- exchange_rates_admin: {pair: 'EUR_USD', rate: 1.08, updated_at, updated_by}
- currency_conversions: {id, user_id, from_currency, to_currency, amount_in, amount_out, rate, fee_pct, fee_amount, status, created_at}
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from config import db
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification
from services.email import send_email_background, get_email_template
from services.exchange_rates_live import (
    get_live_rate,
    get_all_live_rates,
    refresh_live_rates,
    LIVE_CURRENCIES,
    LIVE_API_NAME,
)


router = APIRouter()

# ── Currencies ────────────────────────────────────────────────────
SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'DOP', 'MXN', 'COP', 'BTC']

CURRENCY_META = {
    'EUR': {'symbol': '€', 'name': 'Euro',            'flag': '🇪🇺', 'decimals': 2, 'color': '#1973B8'},
    'USD': {'symbol': '$', 'name': 'Dólar EE.UU.',    'flag': '🇺🇸', 'decimals': 2, 'color': '#10B981'},
    'GBP': {'symbol': '£', 'name': 'Libra Esterlina', 'flag': '🇬🇧', 'decimals': 2, 'color': '#8B5CF6'},
    'DOP': {'symbol': 'RD$', 'name': 'Peso Dominicano','flag': '🇩🇴', 'decimals': 2, 'color': '#F59E0B'},
    'MXN': {'symbol': 'MX$', 'name': 'Peso Mexicano',  'flag': '🇲🇽', 'decimals': 2, 'color': '#EF4444'},
    'COP': {'symbol': 'COL$','name': 'Peso Colombiano','flag': '🇨🇴', 'decimals': 0, 'color': '#06B6D4'},
    'BTC': {'symbol': '₿', 'name': 'Bitcoin',         'flag': '🪙',  'decimals': 8, 'color': '#F7931A'},
}

# Default rates relative to EUR (1 EUR = X target). Admin can override per pair.
DEFAULT_RATE_TO_EUR = {
    'EUR': 1.0,
    'USD': 1.08,
    'GBP': 0.85,
    'DOP': 68.50,
    'MXN': 22.10,
    'COP': 4500.0,
    'BTC': 0.000015,  # 1 EUR ≈ 0.000015 BTC (BTC≈€66k)
}

# Conversion fee default (admin can override per pair later if needed)
DEFAULT_FEE_PCT = 0.5  # 0.5%


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _round(amount: float, currency: str) -> float:
    dec = CURRENCY_META.get(currency, {}).get('decimals', 2)
    return round(amount, dec)


async def _get_rate_to_eur(currency: str) -> float:
    """Returns how many `currency` units equal 1 EUR.
    Resolution order: admin override → live API cache → hard-coded fallback.
    """
    if currency == 'EUR':
        return 1.0
    pair = f'EUR_{currency}'
    doc = await db.exchange_rates_admin.find_one({'pair': pair}, {'_id': 0, 'rate': 1})
    if doc and doc.get('rate') and doc['rate'] > 0:
        return float(doc['rate'])
    # Try live rates (cached, refreshed every 30 min)
    if currency in LIVE_CURRENCIES:
        live = await get_live_rate(currency)
        if live and live.get('rate') and live['rate'] > 0:
            return float(live['rate'])
    return float(DEFAULT_RATE_TO_EUR.get(currency, 1.0))


async def _resolve_rate_with_meta(currency: str) -> dict:
    """Like _get_rate_to_eur, but also returns the source + timestamp.

    Returns: `{rate, source: 'admin'|'live'|'fallback', fetched_at, updated_by?}`
    """
    if currency == 'EUR':
        return {'rate': 1.0, 'source': 'live', 'fetched_at': _now_iso()}
    pair = f'EUR_{currency}'
    doc = await db.exchange_rates_admin.find_one({'pair': pair}, {'_id': 0})
    if doc and doc.get('rate') and doc['rate'] > 0:
        return {
            'rate': float(doc['rate']),
            'source': 'admin',
            'fetched_at': doc.get('updated_at'),
            'updated_by': doc.get('updated_by'),
        }
    if currency in LIVE_CURRENCIES:
        live = await get_live_rate(currency)
        if live and live.get('rate') and live['rate'] > 0:
            return {
                'rate': float(live['rate']),
                'source': 'live',
                'fetched_at': live.get('fetched_at'),
                'provider': live.get('source') or LIVE_API_NAME,
            }
    return {
        'rate': float(DEFAULT_RATE_TO_EUR.get(currency, 1.0)),
        'source': 'fallback',
        'fetched_at': None,
    }


async def _convert_rate(from_cur: str, to_cur: str) -> float:
    """Get effective rate `from_cur → to_cur` via EUR pivot."""
    if from_cur == to_cur:
        return 1.0
    r_from = await _get_rate_to_eur(from_cur)  # 1 EUR = r_from from_cur
    r_to = await _get_rate_to_eur(to_cur)       # 1 EUR = r_to to_cur
    # 1 from_cur = (1/r_from) EUR = (r_to / r_from) to_cur
    return r_to / r_from


async def _ensure_wallet(user_id: str) -> dict:
    """Idempotently creates a multi-currency wallet for the user."""
    wallet = await db.multi_currency_wallets.find_one({'user_id': user_id}, {'_id': 0})
    if wallet:
        # Self-heal: ensure all supported currencies exist as keys
        balances = wallet.get('balances') or {}
        pending = wallet.get('pending') or {}
        missing = False
        for c in SUPPORTED_CURRENCIES:
            if c not in balances:
                balances[c] = 0.0
                missing = True
            if c not in pending:
                pending[c] = 0.0
                missing = True
        if missing:
            await db.multi_currency_wallets.update_one(
                {'user_id': user_id},
                {'$set': {'balances': balances, 'pending': pending, 'updated_at': _now_iso()}},
            )
            wallet['balances'] = balances
            wallet['pending'] = pending
        return wallet

    # Seed with EUR equal to whatever the user already has in their checking account.
    seed_eur = 0.0
    try:
        checking = await db.accounts.find_one(
            {'user_id': user_id, 'account_type': 'checking'}, {'_id': 0, 'balance_eur': 1}
        )
        if checking and checking.get('balance_eur'):
            seed_eur = float(checking['balance_eur'])
    except Exception:
        pass

    doc = {
        'id': str(uuid.uuid4()),
        'user_id': user_id,
        'balances': {c: 0.0 for c in SUPPORTED_CURRENCIES},
        'pending': {c: 0.0 for c in SUPPORTED_CURRENCIES},
        'last_movement_at': None,
        'created_at': _now_iso(),
        'updated_at': _now_iso(),
    }
    if seed_eur > 0:
        doc['balances']['EUR'] = round(seed_eur, 2)
    await db.multi_currency_wallets.insert_one(doc)
    doc.pop('_id', None)
    return doc


# ══════════════════════════════════════════════════════════════════
#  USER ENDPOINTS
# ══════════════════════════════════════════════════════════════════

@router.get("/multi-currency/accounts")
async def get_accounts(user: dict = Depends(get_current_user)):
    """Return the user's multi-currency wallet enriched with metadata + last
    conversion timestamp per currency (read from `currency_conversions`).
    """
    wallet = await _ensure_wallet(user['id'])
    balances = wallet.get('balances') or {}
    pending = wallet.get('pending') or {}

    # Last movement per currency
    last_per_cur: dict = {}
    cur = db.currency_conversions.find(
        {'user_id': user['id']}, {'_id': 0, 'from_currency': 1, 'to_currency': 1, 'created_at': 1}
    ).sort('created_at', -1).limit(200)
    async for r in cur:
        for k in (r.get('from_currency'), r.get('to_currency')):
            if k and k not in last_per_cur:
                last_per_cur[k] = r['created_at']

    accounts = []
    for c in SUPPORTED_CURRENCIES:
        meta = CURRENCY_META[c]
        accounts.append({
            'currency': c,
            'symbol': meta['symbol'],
            'name': meta['name'],
            'flag': meta['flag'],
            'decimals': meta['decimals'],
            'color': meta['color'],
            'balance': _round(float(balances.get(c, 0.0)), c),
            'pending': _round(float(pending.get(c, 0.0)), c),
            'last_movement_at': last_per_cur.get(c),
            'status': 'active',
        })
    return {'accounts': accounts, 'wallet_id': wallet['id'], 'updated_at': wallet.get('updated_at')}


@router.get("/multi-currency/rates")
async def get_rates(user: dict = Depends(get_current_user)):
    """Live rates table with provenance per currency.

    Each entry contains: `{rate, source, fetched_at}` where source ∈
    `'admin'` (manual override) · `'live'` (open.er-api.com cache) ·
    `'fallback'` (hard-coded). Triggers a best-effort refresh of the live
    cache if it has expired.
    """
    # Best-effort refresh; non-blocking on failure
    try:
        await refresh_live_rates(force=False)
    except Exception:
        pass

    out_rates: dict = {}
    sources: dict = {}
    overrides_ts: dict = {}
    providers: dict = {}

    for c in SUPPORTED_CURRENCIES:
        meta = await _resolve_rate_with_meta(c)
        out_rates[c] = meta['rate']
        sources[c] = meta['source']
        if meta.get('fetched_at'):
            overrides_ts[c] = meta['fetched_at']
        if meta.get('provider'):
            providers[c] = meta['provider']

    # Find next refresh ETA (min expires_at across live cache)
    next_refresh = None
    live_rows = await db.exchange_rates_live.find(
        {}, {'_id': 0, 'expires_at': 1}
    ).sort('expires_at', 1).limit(1).to_list(1)
    if live_rows:
        next_refresh = live_rows[0].get('expires_at')

    return {
        'base': 'EUR',
        'rates': out_rates,
        'sources': sources,
        'updated_at_per_currency': overrides_ts,
        'providers': providers,
        'live_provider': LIVE_API_NAME,
        'next_refresh_at': next_refresh,
        'fee_pct_default': DEFAULT_FEE_PCT,
        'currencies': SUPPORTED_CURRENCIES,
        'meta': CURRENCY_META,
    }


@router.post("/multi-currency/rates/refresh")
async def refresh_rates(user: dict = Depends(get_current_user)):
    """Force-refresh live FX cache. Throttled by upstream API; returns status."""
    result = await refresh_live_rates(force=True)
    return result


@router.post("/multi-currency/preview")
async def preview_conversion(payload: dict, user: dict = Depends(get_current_user)):
    """Compute conversion preview without touching balances.

    Body: `{from_currency, to_currency, amount}`
    Returns: `{from_currency, to_currency, amount_in, rate, fee_pct, fee_amount, amount_out, rate_at}`.
    """
    from_cur = (payload.get('from_currency') or '').upper()
    to_cur = (payload.get('to_currency') or '').upper()
    if from_cur not in SUPPORTED_CURRENCIES or to_cur not in SUPPORTED_CURRENCIES:
        raise HTTPException(400, 'Moneda no soportada')
    if from_cur == to_cur:
        raise HTTPException(400, 'Las monedas de origen y destino deben ser distintas')

    try:
        amount = float(payload.get('amount') or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, 'Monto inválido')
    if amount <= 0:
        raise HTTPException(400, 'El monto debe ser mayor a 0')

    rate = await _convert_rate(from_cur, to_cur)
    fee_pct = DEFAULT_FEE_PCT
    gross_out = amount * rate
    fee_amount = gross_out * (fee_pct / 100.0)
    net_out = gross_out - fee_amount

    return {
        'from_currency': from_cur,
        'to_currency': to_cur,
        'amount_in': _round(amount, from_cur),
        'rate': rate,
        'fee_pct': fee_pct,
        'fee_amount': _round(fee_amount, to_cur),
        'gross_out': _round(gross_out, to_cur),
        'amount_out': _round(net_out, to_cur),
        'rate_at': _now_iso(),
    }


@router.post("/multi-currency/convert")
async def execute_conversion(payload: dict, user: dict = Depends(get_current_user)):
    """Execute a confirmed conversion. Re-validates the rate server-side to
    prevent client tampering. Atomically deducts source / credits destination.
    """
    from_cur = (payload.get('from_currency') or '').upper()
    to_cur = (payload.get('to_currency') or '').upper()
    if from_cur not in SUPPORTED_CURRENCIES or to_cur not in SUPPORTED_CURRENCIES:
        raise HTTPException(400, 'Moneda no soportada')
    if from_cur == to_cur:
        raise HTTPException(400, 'Las monedas de origen y destino deben ser distintas')

    try:
        amount = float(payload.get('amount') or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, 'Monto inválido')
    if amount <= 0:
        raise HTTPException(400, 'El monto debe ser mayor a 0')

    wallet = await _ensure_wallet(user['id'])
    available = float((wallet.get('balances') or {}).get(from_cur, 0.0))
    if amount > available + 1e-9:
        raise HTTPException(400, f'Saldo insuficiente en {from_cur}. Disponible: {_round(available, from_cur)}')

    rate = await _convert_rate(from_cur, to_cur)
    fee_pct = DEFAULT_FEE_PCT
    gross_out = amount * rate
    fee_amount = gross_out * (fee_pct / 100.0)
    net_out = gross_out - fee_amount

    now = _now_iso()
    conv_id = str(uuid.uuid4())

    # Atomic update: $inc on both currencies. MongoDB guarantees in-doc atomicity.
    upd = await db.multi_currency_wallets.update_one(
        {'user_id': user['id'], f'balances.{from_cur}': {'$gte': amount - 1e-9}},
        {
            '$inc': {
                f'balances.{from_cur}': -amount,
                f'balances.{to_cur}':   _round(net_out, to_cur),
            },
            '$set': {'last_movement_at': now, 'updated_at': now},
        },
    )
    if upd.matched_count == 0:
        # Race-condition guard (balance changed between read and update)
        raise HTTPException(409, 'El saldo cambió durante la conversión. Vuelve a intentar.')

    conversion = {
        'id': conv_id,
        'user_id': user['id'],
        'user_email': user.get('email'),
        'user_name': user.get('name'),
        'from_currency': from_cur,
        'to_currency': to_cur,
        'amount_in': _round(amount, from_cur),
        'rate': rate,
        'fee_pct': fee_pct,
        'fee_amount': _round(fee_amount, to_cur),
        'gross_out': _round(gross_out, to_cur),
        'amount_out': _round(net_out, to_cur),
        'status': 'completed',
        'reference': f'CONV-{datetime.now(timezone.utc).strftime("%y%m%d")}-{conv_id[:6].upper()}',
        'created_at': now,
    }
    await db.currency_conversions.insert_one(conversion)
    conversion.pop('_id', None)

    # In-app notification
    try:
        await create_notification(
            user['id'],
            'Conversión completada',
            f"Conversión: {_round(amount, from_cur)} {from_cur} → {_round(net_out, to_cur)} {to_cur} "
            f"(tasa {rate:.6f}, comisión {fee_pct}%).",
        )
    except Exception:
        pass

    # Email notification (fire-and-forget)
    try:
        content = f"""
            <p style="color:#e2e8f0;font-size:16px;">
                Estimado/a <strong style="color:#1973B8;">{user.get('name') or user.get('email')}</strong>,
            </p>
            <p style="color:#e2e8f0;font-size:16px;">
                Su conversión ha sido procesada correctamente.
            </p>
            <table width="100%" style="background:#0f172a;border-radius:12px;margin:20px 0;">
                <tr><td style="padding:25px;">
                    <p style="color:#1973B8;font-size:13px;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 12px 0;">Detalles</p>
                    <table width="100%">
                        <tr><td style="color:#94a3b8;padding:7px 0;border-bottom:1px solid #334155;">Origen:</td>
                            <td style="color:#e2e8f0;text-align:right;padding:7px 0;border-bottom:1px solid #334155;font-family:monospace;">
                                {_round(amount, from_cur)} {from_cur}</td></tr>
                        <tr><td style="color:#94a3b8;padding:7px 0;border-bottom:1px solid #334155;">Destino:</td>
                            <td style="color:#10b981;text-align:right;padding:7px 0;border-bottom:1px solid #334155;font-weight:bold;font-family:monospace;">
                                {_round(net_out, to_cur)} {to_cur}</td></tr>
                        <tr><td style="color:#94a3b8;padding:7px 0;border-bottom:1px solid #334155;">Tipo de cambio:</td>
                            <td style="color:#e2e8f0;text-align:right;padding:7px 0;border-bottom:1px solid #334155;font-family:monospace;">
                                1 {from_cur} = {rate:.6f} {to_cur}</td></tr>
                        <tr><td style="color:#94a3b8;padding:7px 0;border-bottom:1px solid #334155;">Comisión ({fee_pct}%):</td>
                            <td style="color:#f59e0b;text-align:right;padding:7px 0;border-bottom:1px solid #334155;font-family:monospace;">
                                -{_round(fee_amount, to_cur)} {to_cur}</td></tr>
                        <tr><td style="color:#94a3b8;padding:7px 0;">Referencia:</td>
                            <td style="color:#06b6d4;text-align:right;padding:7px 0;font-family:monospace;">
                                {conversion['reference']}</td></tr>
                    </table>
                </td></tr>
            </table>
        """
        html = get_email_template(content, "Conversión completada")
        send_email_background(user.get('email'), f"Conversión {from_cur} → {to_cur} completada · LIONSBIT", html)
    except Exception:
        pass

    fresh = await db.multi_currency_wallets.find_one({'user_id': user['id']}, {'_id': 0})
    return {'ok': True, 'conversion': conversion, 'wallet': fresh}


@router.get("/multi-currency/conversions")
async def get_my_conversions(limit: int = 50, user: dict = Depends(get_current_user)):
    """User's conversion history (most recent first)."""
    limit = max(1, min(limit, 200))
    cur = db.currency_conversions.find(
        {'user_id': user['id']}, {'_id': 0}
    ).sort('created_at', -1).limit(limit)
    items = await cur.to_list(length=limit)
    return {'items': items, 'count': len(items)}


# ══════════════════════════════════════════════════════════════════
#  ADMIN ENDPOINTS
# ══════════════════════════════════════════════════════════════════

@router.get("/admin/multi-currency/rates")
async def admin_list_rates(admin: dict = Depends(get_admin_user)):
    """Admin view of all rate overrides (with defaults shown when missing)."""
    docs = await db.exchange_rates_admin.find({}, {'_id': 0}).to_list(50)
    by_pair = {d['pair']: d for d in docs if d.get('pair')}
    out = []
    for c in SUPPORTED_CURRENCIES:
        if c == 'EUR':
            continue
        pair = f'EUR_{c}'
        d = by_pair.get(pair)
        out.append({
            'currency': c,
            'pair': pair,
            'rate': float(d['rate']) if d and d.get('rate') else float(DEFAULT_RATE_TO_EUR[c]),
            'default_rate': float(DEFAULT_RATE_TO_EUR[c]),
            'is_override': bool(d),
            'updated_at': (d or {}).get('updated_at'),
            'updated_by': (d or {}).get('updated_by'),
        })
    return {'items': out, 'fee_pct_default': DEFAULT_FEE_PCT}


@router.put("/admin/multi-currency/rates/{currency}")
async def admin_set_rate(currency: str, payload: dict, admin: dict = Depends(get_admin_user)):
    """Set/override the EUR→`currency` rate. Body: `{rate: number}`."""
    currency = (currency or '').upper()
    if currency == 'EUR' or currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(400, 'Moneda no soportada')
    try:
        rate = float(payload.get('rate'))
    except (TypeError, ValueError):
        raise HTTPException(400, 'Tasa inválida')
    if rate <= 0:
        raise HTTPException(400, 'La tasa debe ser mayor a 0')

    pair = f'EUR_{currency}'
    now = _now_iso()
    await db.exchange_rates_admin.update_one(
        {'pair': pair},
        {'$set': {
            'pair': pair,
            'rate': rate,
            'updated_at': now,
            'updated_by': admin.get('email'),
            'updated_by_name': admin.get('name') or admin.get('email'),
        }},
        upsert=True,
    )
    return {'ok': True, 'pair': pair, 'rate': rate, 'updated_at': now}


@router.delete("/admin/multi-currency/rates/{currency}")
async def admin_reset_rate(currency: str, admin: dict = Depends(get_admin_user)):
    """Remove the admin override and revert to the default rate."""
    currency = (currency or '').upper()
    if currency == 'EUR' or currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(400, 'Moneda no soportada')
    pair = f'EUR_{currency}'
    result = await db.exchange_rates_admin.delete_one({'pair': pair})
    return {'ok': True, 'pair': pair, 'deleted': result.deleted_count}


@router.get("/admin/multi-currency/conversions")
async def admin_list_conversions(limit: int = 100, admin: dict = Depends(get_admin_user)):
    """Admin: full conversion log across all users."""
    limit = max(1, min(limit, 500))
    cur = db.currency_conversions.find({}, {'_id': 0}).sort('created_at', -1).limit(limit)
    items = await cur.to_list(length=limit)
    return {'items': items, 'count': len(items)}


@router.post("/admin/multi-currency/credit")
async def admin_credit_balance(payload: dict, admin: dict = Depends(get_admin_user)):
    """Admin: credit/debit a user's multi-currency balance.

    Body: `{user_id, currency, amount, note?}` (amount can be negative for debit).
    """
    user_id = payload.get('user_id')
    currency = (payload.get('currency') or '').upper()
    if not user_id:
        raise HTTPException(400, 'user_id requerido')
    if currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(400, 'Moneda no soportada')
    try:
        amount = float(payload.get('amount') or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, 'Monto inválido')
    if amount == 0:
        raise HTTPException(400, 'El monto no puede ser 0')

    user_doc = await db.users.find_one({'id': user_id}, {'_id': 0, 'id': 1, 'email': 1, 'name': 1})
    if not user_doc:
        raise HTTPException(404, 'Usuario no encontrado')

    await _ensure_wallet(user_id)
    if amount < 0:
        cur_balance = (await db.multi_currency_wallets.find_one(
            {'user_id': user_id}, {'_id': 0, f'balances.{currency}': 1}
        ) or {}).get('balances', {}).get(currency, 0)
        if cur_balance + amount < 0:
            raise HTTPException(400, f'Saldo insuficiente. Disponible: {cur_balance}')

    now = _now_iso()
    await db.multi_currency_wallets.update_one(
        {'user_id': user_id},
        {'$inc': {f'balances.{currency}': _round(amount, currency)},
         '$set': {'last_movement_at': now, 'updated_at': now}},
    )

    # Audit log
    await db.currency_conversions.insert_one({
        'id': str(uuid.uuid4()),
        'user_id': user_id,
        'user_email': user_doc.get('email'),
        'user_name': user_doc.get('name'),
        'from_currency': None,
        'to_currency': currency,
        'amount_in': 0,
        'amount_out': _round(amount, currency),
        'rate': 1.0,
        'fee_pct': 0,
        'fee_amount': 0,
        'status': 'completed',
        'kind': 'admin_credit' if amount > 0 else 'admin_debit',
        'admin_email': admin.get('email'),
        'admin_name': admin.get('name') or admin.get('email'),
        'note': (payload.get('note') or '')[:300] or None,
        'reference': f"ADM-{datetime.now(timezone.utc).strftime('%y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
        'created_at': now,
    })

    try:
        await create_notification(
            user_id,
            'Saldo multidivisa actualizado',
            f"Tu saldo en {currency} fue {'acreditado' if amount > 0 else 'debitado'} por {_round(abs(amount), currency)} {currency} "
            f"por el administrador.",
        )
    except Exception:
        pass
    return {'ok': True}
