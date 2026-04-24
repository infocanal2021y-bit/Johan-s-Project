"""MT5 Professional Investment — crypto-funded MT5 account top-ups.

Users deposit EUR via BTC / USDT (TRC20) / ETH (ERC20). Admin confirms the
transaction → funds move into the linked MT5 account → trading is unlocked.

Collections:
- mt5_invest_deposits { id, user_id, user_email, method, amount_eur,
                        amount_crypto, crypto_symbol, network, wallet_address,
                        tx_hash, proof_url, status, created_at, confirmed_at,
                        admin_note }
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import Optional
import uuid
import httpx

from config import db
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification
from services.email import (
    send_mt5_invest_confirmed_email,
    send_mt5_invest_rejected_email,
)


router = APIRouter()


# ======================================================================
# Deposit methods (real-looking demo wallets — replace in production)
# ======================================================================

MIN_EUR = 300.0

DEPOSIT_METHODS = {
    'usdt_trc20': {
        'key': 'usdt_trc20',
        'crypto_symbol': 'USDT',
        'name': 'USDT (Tron Network)',
        'network': 'TRC20',
        'network_full': 'Tron (TRC-20)',
        'wallet_address': 'TXwBxF3p5rz9dWwLsVyUvGJ2XhRyK8eQmP',
        'confirmations_required': 1,
        'avg_confirmation_min': 2,
        'fee_eur_est': 1.0,
        'recommended': True,
        'color': '#26A17B',
        'icon_url': 'https://cryptologos.cc/logos/tether-usdt-logo.svg',
        'note': 'Recomendado · rápida confirmación y comisiones bajas',
    },
    'btc': {
        'key': 'btc',
        'crypto_symbol': 'BTC',
        'name': 'Bitcoin',
        'network': 'BTC',
        'network_full': 'Bitcoin (Native)',
        'wallet_address': 'bc1qlionsbitmt5x7k3n4pu8hq9y2vtrt7w6l9v8fsz',
        'confirmations_required': 2,
        'avg_confirmation_min': 30,
        'fee_eur_est': 8.5,
        'recommended': False,
        'color': '#F7931A',
        'icon_url': 'https://cryptologos.cc/logos/bitcoin-btc-logo.svg',
        'note': 'Red Bitcoin — confirmación 20-40 min',
    },
    'eth': {
        'key': 'eth',
        'crypto_symbol': 'ETH',
        'name': 'Ethereum',
        'network': 'ERC20',
        'network_full': 'Ethereum (ERC-20)',
        'wallet_address': '0xA3b4C5d6E7f8901234567890LionsbitMT5Invest',
        'confirmations_required': 12,
        'avg_confirmation_min': 5,
        'fee_eur_est': 4.5,
        'recommended': False,
        'color': '#627EEA',
        'icon_url': 'https://cryptologos.cc/logos/ethereum-eth-logo.svg',
        'note': 'Red Ethereum — confirmación 3-8 min',
    },
}


# ======================================================================
# Helpers
# ======================================================================

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


async def _fetch_crypto_rate_eur() -> dict:
    """Fetch latest BTC / ETH / USDT prices in EUR from CoinGecko (no key needed).
    Returns dict like {'btc': 61500.4, 'eth': 3200.2, 'usdt': 0.92} (EUR per 1 unit).
    Falls back to static rates on any network error so the app never breaks."""
    fallback = {'btc': 61500.0, 'eth': 3200.0, 'usdt': 0.92}
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(
                'https://api.coingecko.com/api/v3/simple/price',
                params={
                    'ids': 'bitcoin,ethereum,tether',
                    'vs_currencies': 'eur',
                },
            )
            if r.status_code != 200:
                return fallback
            data = r.json()
            return {
                'btc':  float(data.get('bitcoin',  {}).get('eur', fallback['btc'])),
                'eth':  float(data.get('ethereum', {}).get('eur', fallback['eth'])),
                'usdt': float(data.get('tether',   {}).get('eur', fallback['usdt'])),
            }
    except Exception:
        return fallback


def _crypto_amount(method_key: str, amount_eur: float, rates: dict) -> tuple[float, str]:
    """Convert EUR amount to crypto amount given method and live rates."""
    if method_key == 'btc':
        return round(amount_eur / max(rates['btc'], 1), 8), 'BTC'
    if method_key == 'eth':
        return round(amount_eur / max(rates['eth'], 1), 6), 'ETH'
    if method_key == 'usdt_trc20':
        return round(amount_eur / max(rates['usdt'], 0.01), 2), 'USDT'
    return 0.0, ''


# ======================================================================
# Endpoints
# ======================================================================

@router.get("/mt5-invest/methods")
async def list_methods(user: dict = Depends(get_current_user)):
    """Return available crypto deposit methods + live EUR conversion preview
    for the minimum amount (300 EUR)."""
    rates = await _fetch_crypto_rate_eur()
    methods = []
    for m in DEPOSIT_METHODS.values():
        crypto_amt, symbol = _crypto_amount(m['key'], MIN_EUR, rates)
        methods.append({
            **m,
            'min_eur': MIN_EUR,
            'min_crypto_preview': crypto_amt,
            'rate_eur': (rates['btc'] if m['key'] == 'btc'
                         else rates['eth'] if m['key'] == 'eth'
                         else rates['usdt']),
        })
    return {
        'methods': methods,
        'min_eur': MIN_EUR,
        'rates_updated_at': _iso(_now()),
        'disclaimer': (
            'Las inversiones realizadas mediante BTC, USDT y ETH son procesadas '
            'bajo infraestructura MetaTrader 5 (MT5) y brokers regulados '
            'internacionalmente, garantizando trazabilidad, seguridad y ejecución '
            'profesional de operaciones financieras.'
        ),
    }


@router.post("/mt5-invest/deposit")
async def create_deposit(payload: dict, user: dict = Depends(get_current_user)):
    """Create a new pending deposit intent. Returns the wallet address + crypto
    amount the user should send. Status starts at 'pending_payment'."""
    method_key = (payload.get('method') or '').lower()
    amount_eur = float(payload.get('amount_eur') or 0)

    method = DEPOSIT_METHODS.get(method_key)
    if not method:
        raise HTTPException(400, 'Método no válido')
    if amount_eur < MIN_EUR:
        raise HTTPException(400, f'Monto mínimo: {int(MIN_EUR)} EUR')
    if amount_eur > 500_000:
        raise HTTPException(400, 'Monto fuera de rango (máximo 500,000 EUR)')

    rates = await _fetch_crypto_rate_eur()
    crypto_amt, symbol = _crypto_amount(method_key, amount_eur, rates)

    dep = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'user_email': user.get('email', ''),
        'method': method_key,
        'method_name': method['name'],
        'crypto_symbol': symbol,
        'network': method['network'],
        'wallet_address': method['wallet_address'],
        'amount_eur': round(amount_eur, 2),
        'amount_crypto': crypto_amt,
        'rate_eur': (rates['btc'] if method_key == 'btc'
                     else rates['eth'] if method_key == 'eth'
                     else rates['usdt']),
        'confirmations_required': method['confirmations_required'],
        'tx_hash': None,
        'proof_url': None,
        'status': 'pending_payment',
        'status_label': 'Esperando pago',
        'admin_note': None,
        'created_at': _iso(_now()),
        'confirmed_at': None,
    }
    await db.mt5_invest_deposits.insert_one(dep)
    dep.pop('_id', None)
    return {'ok': True, 'deposit': dep}


@router.post("/mt5-invest/deposit/{dep_id}/proof")
async def submit_proof(dep_id: str, payload: dict, user: dict = Depends(get_current_user)):
    """User submits tx hash and / or base64 proof image. Status -> under_review."""
    tx_hash = (payload.get('tx_hash') or '').strip()
    proof_url = (payload.get('proof_url') or '').strip()
    if not tx_hash and not proof_url:
        raise HTTPException(400, 'Proporciona un TX hash o una imagen de comprobante')
    if tx_hash and len(tx_hash) < 10:
        raise HTTPException(400, 'TX hash demasiado corto')
    if proof_url and len(proof_url) > 2_500_000:
        raise HTTPException(400, 'Imagen demasiado grande (máx 2.5MB)')

    dep = await db.mt5_invest_deposits.find_one(
        {'id': dep_id, 'user_id': user['id']}, {'_id': 0}
    )
    if not dep:
        raise HTTPException(404, 'Depósito no encontrado')
    if dep['status'] in ('confirmed', 'rejected'):
        raise HTTPException(400, 'El depósito ya fue procesado')

    update = {
        'tx_hash': tx_hash or dep.get('tx_hash'),
        'proof_url': proof_url or dep.get('proof_url'),
        'status': 'under_review',
        'status_label': 'Verificando en blockchain',
        'submitted_at': _iso(_now()),
    }
    await db.mt5_invest_deposits.update_one({'id': dep_id}, {'$set': update})
    dep.update(update)
    return {'ok': True, 'deposit': dep}


@router.get("/mt5-invest/deposits")
async def list_deposits(user: dict = Depends(get_current_user)):
    cur = db.mt5_invest_deposits.find(
        {'user_id': user['id']}, {'_id': 0}
    ).sort('created_at', -1).limit(100)
    items = await cur.to_list(length=100)

    total_confirmed_eur = sum(
        d.get('amount_eur', 0) for d in items if d.get('status') == 'confirmed'
    )
    pending_count = sum(1 for d in items if d.get('status') in ('pending_payment', 'under_review'))

    return {
        'deposits': items,
        'total_confirmed_eur': round(total_confirmed_eur, 2),
        'pending_count': pending_count,
        'has_confirmed': total_confirmed_eur > 0,
    }


@router.get("/mt5-invest/summary")
async def invest_summary(user: dict = Depends(get_current_user)):
    """Unified dashboard data for the investment section."""
    # Deposits
    dep_cur = db.mt5_invest_deposits.find(
        {'user_id': user['id']}, {'_id': 0}
    ).sort('created_at', -1).limit(30)
    deps = await dep_cur.to_list(length=30)
    total_invested = sum(d.get('amount_eur', 0) for d in deps if d.get('status') == 'confirmed')
    has_confirmed = total_invested > 0

    # MT5 account state (if exists)
    mt5_acc = await db.mt5_accounts.find_one({'user_id': user['id']}, {'_id': 0})

    # Operation counts / history
    open_count = await db.mt5_operations.count_documents({'user_id': user['id'], 'status': 'open'})
    closed_count = await db.mt5_operations.count_documents({'user_id': user['id'], 'status': 'closed'})
    closed_cur = db.mt5_operations.find(
        {'user_id': user['id'], 'status': 'closed'}, {'_id': 0}
    ).sort('close_time', -1).limit(10)
    recent_closed = await closed_cur.to_list(length=10)
    total_profit = sum((o.get('profit', 0) or 0) for o in recent_closed)

    return {
        'total_invested_eur': round(total_invested, 2),
        'has_confirmed_deposit': has_confirmed,
        'recent_deposits': deps[:10],
        'mt5_account': {
            'login': mt5_acc.get('login') if mt5_acc else None,
            'server': mt5_acc.get('server') if mt5_acc else None,
            'balance': mt5_acc.get('balance', 0) if mt5_acc else 0,
            'equity': mt5_acc.get('equity', 0) if mt5_acc else 0,
            'profit': mt5_acc.get('profit', 0) if mt5_acc else 0,
            'status': 'active' if mt5_acc else 'pending',
        },
        'operations': {
            'open': open_count,
            'closed': closed_count,
            'recent_pl': round(total_profit, 2),
            'recent_closed': recent_closed,
        },
    }


# ── Admin confirmation flow ─────────────────────────────────────────

@router.post("/mt5-invest/admin/{dep_id}/confirm")
async def admin_confirm(dep_id: str, payload: Optional[dict] = None, user: dict = Depends(get_admin_user)):
    """Admin confirms a deposit → moves funds into the MT5 account of that user."""
    dep = await db.mt5_invest_deposits.find_one({'id': dep_id}, {'_id': 0})
    if not dep:
        raise HTTPException(404, 'Depósito no encontrado')
    if dep['status'] == 'confirmed':
        raise HTTPException(400, 'Depósito ya confirmado')

    note = ((payload or {}).get('admin_note') or '').strip()[:200]
    await db.mt5_invest_deposits.update_one(
        {'id': dep_id},
        {'$set': {
            'status': 'confirmed',
            'status_label': 'Confirmado · fondos acreditados',
            'confirmed_at': _iso(_now()),
            'admin_note': note or None,
        }},
    )

    # Credit funds into MT5 account (EUR ≈ USD for demo purposes)
    usd_amount = dep['amount_eur']
    existing = await db.mt5_accounts.find_one({'user_id': dep['user_id']}, {'_id': 0})
    if existing:
        await db.mt5_accounts.update_one(
            {'user_id': dep['user_id']},
            {'$inc': {
                'balance': usd_amount,
                'equity': usd_amount,
                'free_margin': usd_amount,
                'initial_balance': usd_amount,
            }},
        )
    # Also credit the user's checking USD wallet (single source of truth for balance)
    await db.accounts.update_one(
        {'user_id': dep['user_id'], 'account_type': 'checking'},
        {'$inc': {'balance_usd': usd_amount, 'balance_eur': dep['amount_eur']}},
    )
    # Journal entry
    await db.mt5_journal.insert_one({
        'id': str(uuid.uuid4()),
        'user_id': dep['user_id'],
        'kind': 'funds',
        'text': f"Depósito {dep['crypto_symbol']} {dep['amount_crypto']} ({dep['network']}) confirmado · +${usd_amount:.2f}",
        'meta': {'deposit_id': dep_id},
        'created_at': _iso(_now()),
    })

    # In-app notification
    await create_notification(
        user_id=dep['user_id'],
        title='Depósito acreditado',
        message=f"Su depósito de €{dep['amount_eur']:.2f} ({dep['crypto_symbol']}) ha sido verificado. Los fondos ya están disponibles en su cuenta MT5.",
    )

    # Institutional email via Resend
    mt5_login = existing.get('login', 0) if existing else 0
    user_doc = await db.users.find_one({'id': dep['user_id']}, {'_id': 0, 'password': 0})
    user_name = (user_doc or {}).get('name') or (user_doc or {}).get('full_name') or dep.get('user_email', '').split('@')[0] or 'cliente'
    await send_mt5_invest_confirmed_email(
        user_email=dep.get('user_email', ''),
        user_name=user_name,
        amount_eur=dep['amount_eur'],
        crypto_symbol=dep['crypto_symbol'],
        amount_crypto=dep['amount_crypto'],
        network=dep['network'],
        mt5_login=mt5_login,
        tx_hash=dep.get('tx_hash'),
    )

    return {'ok': True, 'deposit_id': dep_id, 'credited_usd': usd_amount}


@router.post("/mt5-invest/admin/{dep_id}/reject")
async def admin_reject(dep_id: str, payload: Optional[dict] = None, user: dict = Depends(get_admin_user)):
    note = ((payload or {}).get('admin_note') or 'Rechazado por administración').strip()[:200]
    dep = await db.mt5_invest_deposits.find_one({'id': dep_id}, {'_id': 0})
    if not dep:
        raise HTTPException(404, 'Depósito no encontrado')
    if dep.get('status') == 'confirmed':
        raise HTTPException(400, 'Depósito ya confirmado · no se puede rechazar')

    await db.mt5_invest_deposits.update_one(
        {'id': dep_id},
        {'$set': {
            'status': 'rejected',
            'status_label': 'Rechazado',
            'admin_note': note,
            'rejected_at': _iso(_now()),
        }},
    )

    # In-app notification
    await create_notification(
        user_id=dep['user_id'],
        title='Depósito no validado',
        message=f"Su depósito de €{dep['amount_eur']:.2f} ({dep['crypto_symbol']}) no pudo ser validado. Motivo: {note}",
    )

    # Institutional email via Resend
    user_doc = await db.users.find_one({'id': dep['user_id']}, {'_id': 0, 'password': 0})
    user_name = (user_doc or {}).get('name') or (user_doc or {}).get('full_name') or dep.get('user_email', '').split('@')[0] or 'cliente'
    await send_mt5_invest_rejected_email(
        user_email=dep.get('user_email', ''),
        user_name=user_name,
        amount_eur=dep['amount_eur'],
        crypto_symbol=dep['crypto_symbol'],
        network=dep['network'],
        admin_note=note,
    )

    return {'ok': True}


@router.get("/mt5-invest/admin/pending")
async def admin_list_pending(user: dict = Depends(get_admin_user)):
    cur = db.mt5_invest_deposits.find(
        {'status': {'$in': ['pending_payment', 'under_review']}}, {'_id': 0}
    ).sort('created_at', -1).limit(200)
    items = await cur.to_list(length=200)
    return {'pending': items, 'count': len(items)}
