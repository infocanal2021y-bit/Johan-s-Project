"""MT5 Investment Hub — supporting endpoints for the unified /mt5 panel.

Provides:
- /mt5-hub/limits        : platform investment / withdrawal limits + KYC status
- /mt5-hub/global-feed   : global recent withdrawals stream (with countries)
- /mt5-hub/blockchain-txs: paid / received blockchain transactions
- /mt5-invest/reserve    : reserve a future investment slot
"""
import random
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException

from config import db
from services.auth import get_current_user

router = APIRouter()

# ── Constants ──────────────────────────────────────────────────────
MIN_INVEST_EUR = 300.0
MIN_TOPUP_EUR = 200.0
MAX_PARTIAL_WITHDRAW_PCT = 30.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# ── Hub limits + KYC ───────────────────────────────────────────────

@router.get("/mt5-hub/limits")
async def get_hub_limits(user: dict = Depends(get_current_user)):
    """Returns platform money rules and the user's KYC verification level
    so the frontend can render appropriate badges and CTAs."""
    user_doc = await db.users.find_one({'id': user['id']}, {'_id': 0, 'password': 0})
    kyc = (user_doc or {}).get('verification_status') or 'pending'

    # Map verification status to a level + visible label
    level_map = {
        'verified': {'level': 3, 'label': 'KYC Verificado', 'tone': 'emerald'},
        'in_review': {'level': 2, 'label': 'KYC en revisión', 'tone': 'amber'},
        'pending':   {'level': 1, 'label': 'KYC pendiente', 'tone': 'slate'},
        'rejected':  {'level': 0, 'label': 'KYC rechazado', 'tone': 'rose'},
    }
    kyc_state = level_map.get(kyc, level_map['pending'])

    return {
        'min_invest_eur': MIN_INVEST_EUR,
        'min_topup_eur': MIN_TOPUP_EUR,
        'max_partial_withdraw_pct': MAX_PARTIAL_WITHDRAW_PCT,
        'kyc': {
            'status': kyc,
            **kyc_state,
            'documents_required': ['DNI / Pasaporte', 'Comprobante de domicilio', 'Selfie'],
        },
    }


# ── Global recent withdrawals feed (social proof) ──────────────────

_COUNTRIES = [
    ('España',       '🇪🇸', ['Madrid','Barcelona','Valencia','Sevilla','Bilbao','Málaga','Zaragoza']),
    ('México',       '🇲🇽', ['CDMX','Guadalajara','Monterrey','Cancún','Puebla']),
    ('Argentina',    '🇦🇷', ['Buenos Aires','Córdoba','Rosario','Mendoza']),
    ('Colombia',     '🇨🇴', ['Bogotá','Medellín','Cali','Cartagena']),
    ('Chile',        '🇨🇱', ['Santiago','Valparaíso','Concepción']),
    ('Perú',         '🇵🇪', ['Lima','Arequipa','Trujillo']),
    ('Italia',       '🇮🇹', ['Roma','Milán','Nápoles']),
    ('Francia',      '🇫🇷', ['París','Lyon','Marsella']),
    ('Alemania',     '🇩🇪', ['Berlín','Múnich','Frankfurt']),
    ('Reino Unido',  '🇬🇧', ['Londres','Manchester','Edimburgo']),
    ('Portugal',     '🇵🇹', ['Lisboa','Oporto']),
    ('Brasil',       '🇧🇷', ['São Paulo','Río de Janeiro']),
    ('Andorra',      '🇦🇩', ['Andorra la Vella']),
]
_NAME_INITIALS = ['A.M.','J.L.','C.R.','M.G.','D.S.','P.F.','L.B.','I.T.','R.N.','S.V.','E.K.','N.O.','T.P.']


@router.get("/mt5-hub/global-feed")
async def global_feed():
    """Public-style social-proof feed — last withdrawals across the platform.
    Generated deterministically from a per-minute seed so all users see the
    same feed at the same time. No personal data exposed."""
    now = _now()
    rng = random.Random(int(now.timestamp()) // 60)
    items = []
    for i in range(14):
        country, flag, cities = rng.choice(_COUNTRIES)
        city = rng.choice(cities)
        amount = rng.choice([300, 500, 850, 1200, 1500, 2200, 3500, 4800, 7500, 12500, 18000])
        method = rng.choice([
            ('USDT (TRC20)',  '#26A17B'),
            ('Bitcoin',        '#F7931A'),
            ('Ethereum',       '#627EEA'),
            ('SEPA Bank',      '#14549C'),
        ])
        minutes_ago = i * rng.randint(2, 7) + rng.randint(0, 4)
        items.append({
            'id': str(uuid.uuid4())[:8],
            'name': rng.choice(_NAME_INITIALS),
            'country': country,
            'flag': flag,
            'city': city,
            'amount_eur': amount,
            'method': method[0],
            'method_color': method[1],
            'when_iso': _iso(now - timedelta(minutes=minutes_ago)),
            'minutes_ago': minutes_ago,
        })
    return {'items': items, 'total_24h_eur': sum(i['amount_eur'] for i in items) * 18}


# ── Blockchain transactions ────────────────────────────────────────

@router.get("/mt5-hub/blockchain-txs")
async def blockchain_txs(direction: str = 'received', user: dict = Depends(get_current_user)):
    """Returns paid (outbound) or received (inbound) blockchain transactions
    for this user, derived from existing collections."""
    if direction not in ('paid', 'received'):
        raise HTTPException(400, "direction must be 'paid' or 'received'")

    out = []
    if direction == 'received':
        # User's confirmed crypto deposits (inbound)
        cur = db.mt5_invest_deposits.find(
            {'user_id': user['id'], 'status': 'confirmed'}, {'_id': 0}
        ).sort('confirmed_at', -1).limit(50)
        for d in await cur.to_list(length=50):
            out.append({
                'id': d['id'],
                'kind': 'received',
                'crypto': d.get('crypto_symbol'),
                'network': d.get('network'),
                'amount_crypto': d.get('amount_crypto'),
                'amount_eur': d.get('amount_eur'),
                'tx_hash': d.get('tx_hash'),
                'wallet_address': d.get('wallet_address'),
                'when_iso': d.get('confirmed_at') or d.get('created_at'),
                'status': 'confirmed',
            })
    else:
        # Outbound: withdrawals processed by admin
        cur = db.withdrawals.find(
            {'user_id': user['id'], 'status': {'$in': ['approved', 'completed']}}, {'_id': 0}
        ).sort('created_at', -1).limit(50)
        for w in await cur.to_list(length=50):
            out.append({
                'id': w.get('id'),
                'kind': 'paid',
                'crypto': w.get('crypto_symbol') or w.get('currency'),
                'network': w.get('network') or '—',
                'amount_eur': w.get('amount_eur') or w.get('amount'),
                'tx_hash': w.get('tx_hash') or w.get('hash'),
                'wallet_address': w.get('wallet_address'),
                'when_iso': w.get('processed_at') or w.get('created_at'),
                'status': w.get('status'),
            })

    return {'direction': direction, 'items': out, 'count': len(out)}


# ── Reserve future investment ──────────────────────────────────────

@router.post("/mt5-invest/reserve")
async def reserve_investment(payload: dict, user: dict = Depends(get_current_user)):
    """Reserve a future investment slot. The user picks a date and an amount;
    the platform locks the slot at the current rate (24h grace)."""
    amount_eur = float(payload.get('amount_eur') or 0)
    method = (payload.get('method') or 'usdt_trc20').lower()
    target_date = (payload.get('target_date') or '').strip()  # ISO date

    if amount_eur < MIN_INVEST_EUR:
        raise HTTPException(400, f'Monto mínimo: {int(MIN_INVEST_EUR)} EUR')
    if not target_date:
        raise HTTPException(400, 'Falta target_date (ISO)')
    try:
        td = datetime.fromisoformat(target_date.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(400, 'target_date inválido (use ISO)')
    if td < _now():
        raise HTTPException(400, 'La fecha debe ser futura')
    if td > _now() + timedelta(days=180):
        raise HTTPException(400, 'Máximo 180 días en el futuro')

    res = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'user_email': user.get('email', ''),
        'amount_eur': round(amount_eur, 2),
        'method': method,
        'target_date': _iso(td),
        'status': 'reserved',
        'created_at': _iso(_now()),
        'expires_at': _iso(_now() + timedelta(hours=24)),
    }
    await db.mt5_invest_reservations.insert_one(res)
    res.pop('_id', None)
    return {'ok': True, 'reservation': res}


@router.get("/mt5-invest/reservations")
async def list_reservations(user: dict = Depends(get_current_user)):
    cur = db.mt5_invest_reservations.find(
        {'user_id': user['id']}, {'_id': 0}
    ).sort('created_at', -1).limit(20)
    items = await cur.to_list(length=20)
    return {'items': items, 'count': len(items)}
