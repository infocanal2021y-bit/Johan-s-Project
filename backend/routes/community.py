"""Community / Members directory — public-facing transparency page.

Authenticated users only (any role). Returns *safe* aggregated fields:
name, country, deposited amount, available balance, account_status,
badges, progress step. NEVER exposes email/phone/documents.

The same record is keyed by user.id (no duplicates) — if the user already
exists they are simply re-rendered with fresh aggregations on each call.
"""
import re
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query

from config import db
from services.auth import get_current_user

router = APIRouter()


# Phone prefix → country (for legacy users imported without country field)
_PHONE_PREFIX_TO_COUNTRY = [
    ('34',  'España'),       # +34
    ('351', 'Portugal'),     # +351
    ('33',  'Francia'),      # +33
    ('39',  'Italia'),       # +39
    ('49',  'Alemania'),     # +49
    ('44',  'Reino Unido'),  # +44
    ('376', 'Andorra'),      # +376
    ('52',  'México'),       # +52
    ('54',  'Argentina'),    # +54
    ('56',  'Chile'),        # +56
    ('57',  'Colombia'),     # +57
    ('58',  'Venezuela'),    # +58
    ('51',  'Perú'),         # +51
    ('55',  'Brasil'),       # +55
    ('593', 'Ecuador'),      # +593
    ('598', 'Uruguay'),      # +598
    ('595', 'Paraguay'),     # +595
    ('591', 'Bolivia'),      # +591
    ('1',   'Estados Unidos'),  # +1 (last → catch-all for NA)
]


def _infer_country_from_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = ''.join(ch for ch in str(phone) if ch.isdigit())
    if not digits:
        return None
    # Sort longest prefix first so 351 wins over 35, 376 over 37 etc.
    for prefix, country in sorted(_PHONE_PREFIX_TO_COUNTRY, key=lambda p: -len(p[0])):
        if digits.startswith(prefix):
            return country
    return None


# Country code → flag emoji (best-effort, falls back to globe)
_FLAG_BY_NAME = {
    'espana': '🇪🇸', 'españa': '🇪🇸', 'spain': '🇪🇸',
    'mexico': '🇲🇽', 'méxico': '🇲🇽',
    'argentina': '🇦🇷', 'colombia': '🇨🇴', 'chile': '🇨🇱',
    'peru': '🇵🇪', 'perú': '🇵🇪',
    'italia': '🇮🇹', 'italy': '🇮🇹',
    'francia': '🇫🇷', 'france': '🇫🇷',
    'alemania': '🇩🇪', 'germany': '🇩🇪',
    'reino unido': '🇬🇧', 'uk': '🇬🇧', 'united kingdom': '🇬🇧',
    'portugal': '🇵🇹', 'brasil': '🇧🇷', 'brazil': '🇧🇷',
    'andorra': '🇦🇩', 'estados unidos': '🇺🇸', 'usa': '🇺🇸',
    'venezuela': '🇻🇪', 'ecuador': '🇪🇨', 'uruguay': '🇺🇾',
    'paraguay': '🇵🇾', 'bolivia': '🇧🇴',
}


def _flag_for(country: Optional[str]) -> str:
    if not country:
        return '🌐'
    return _FLAG_BY_NAME.get(country.strip().lower(), '🌐')


def _public_first_name(full_name: str) -> str:
    """Return first name + last-initial (e.g. 'Juan A.') for the
    recent-withdrawals feed — keeps social proof while protecting PII."""
    if not full_name:
        return 'Cliente'
    parts = [p for p in re.split(r'\s+', full_name.strip()) if p]
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0].upper()}."


def _compute_account_status_label(user: dict, withdrawals: list) -> str:
    """Map raw doc fields to one of:
      activo | en_revision | retiro_pendiente | completado
    """
    if user.get('account_status') in ('suspended', 'rejected', 'blocked'):
        return 'en_revision'
    if not withdrawals:
        return 'activo'
    last = withdrawals[0]  # already sorted desc
    s = (last.get('status') or '').lower()
    if s == 'completed':
        return 'completado'
    if s in ('approved', 'in_transfer', 'processing'):
        return 'retiro_pendiente'
    if s in ('pending', 'in_review', 'tax_pending'):
        return 'en_revision'
    return 'activo'


def _compute_progress_step(user: dict, withdrawals: list) -> int:
    """1=Verificacion · 2=Impuesto · 3=Revision · 4=Transferencia · 5=Completado"""
    verified = user.get('verification_status') == 'verified'
    if not verified:
        return 1
    if not withdrawals:
        return 1  # verified but no activity yet
    last = withdrawals[0]
    s = (last.get('status') or '').lower()
    if s in ('tax_pending', 'pending_tax'):
        return 2
    if s in ('pending', 'in_review'):
        return 3
    if s in ('approved', 'in_transfer', 'processing'):
        return 4
    if s == 'completed':
        return 5
    return 2


def _compute_badges(user: dict, total_balance_eur: float, has_completed_withdrawal: bool) -> list:
    badges = []
    if user.get('verification_status') == 'verified':
        badges.append('verified')
    if has_completed_withdrawal:
        badges.append('withdrawal_processed')
    if total_balance_eur >= 50000:
        badges.append('premium')
    if user.get('interest_score') == 'hot' or user.get('partial_withdraw_unlocked'):
        badges.append('high_priority')
    return badges


@router.get("/community/members")
async def community_members(
    q: Optional[str] = Query(None, description='Free-text search on name + country'),
    status: Optional[str] = Query(None, description='Filter by account_status label'),
    country: Optional[str] = Query(None, description='Filter by country (case-insensitive contains)'),
    limit: int = Query(500, ge=1, le=2500),
    user: dict = Depends(get_current_user),
):
    """Public directory of registered members. Returns SAFE fields only."""
    # Pull users + their accounts + their last withdrawals in 1-2 round trips
    # Note: we read `phone` server-side ONLY to infer country from prefix —
    # it is NEVER returned in the API response.
    users_cur = db.users.find(
        {'role': {'$ne': 'admin'}},
        {'_id': 0, 'password': 0, 'kyc_documents': 0, 'engagement': 0,
         'reset_token': 0, 'login_history': 0,
         },
    )
    users = await users_cur.to_list(length=5000)
    user_ids = [u['id'] for u in users]

    # Aggregate balances per user
    accounts_cur = db.accounts.find(
        {'user_id': {'$in': user_ids}},
        {'_id': 0, 'user_id': 1, 'balance_eur': 1, 'balance_usd': 1, 'invested_balance_eur': 1},
    )
    balances_by_user: dict = {}
    async for a in accounts_cur:
        b = balances_by_user.setdefault(a['user_id'], {'available': 0.0, 'invested': 0.0})
        b['available'] += float(a.get('balance_eur') or 0)
        b['invested']  += float(a.get('invested_balance_eur') or 0)

    # Aggregate deposits (admin_credit + completed deposit transactions)
    deposits_cur = db.transactions.find(
        {'user_id': {'$in': user_ids},
         'transaction_type': {'$in': ['admin_credit', 'deposit', 'transfer_in']},
         'status': 'completed'},
        {'_id': 0, 'user_id': 1, 'amount': 1, 'currency': 1},
    )
    deposits_by_user: dict = {}
    async for d in deposits_cur:
        amt = float(d.get('amount') or 0)
        if (d.get('currency') or 'EUR').upper() == 'USD':
            amt = amt / 1.08  # rough EUR conversion for display
        deposits_by_user[d['user_id']] = deposits_by_user.get(d['user_id'], 0.0) + amt

    # Last withdrawal per user (for status + progress)
    wd_cur = db.transactions.find(
        {'user_id': {'$in': user_ids}, 'transaction_type': 'withdraw'},
        {'_id': 0, 'user_id': 1, 'status': 1, 'amount': 1, 'created_at': 1},
    ).sort('created_at', -1)
    withdrawals_by_user: dict = {}
    async for w in wd_cur:
        withdrawals_by_user.setdefault(w['user_id'], []).append(w)

    out = []
    for u in users:
        bal = balances_by_user.get(u['id'], {'available': 0.0, 'invested': 0.0})
        wds = withdrawals_by_user.get(u['id'], [])
        deposited = deposits_by_user.get(u['id'], 0.0)
        total_eur = bal['available'] + bal['invested']
        has_completed_wd = any((w.get('status') or '').lower() == 'completed' for w in wds)

        out.append({
            'id': u['id'],
            'is_self': u['id'] == user['id'],
            'name': u.get('name') or 'Cliente',
            'country': u.get('country_name') or u.get('country') or _infer_country_from_phone(u.get('phone')) or 'Internacional',
            'country_flag': _flag_for(u.get('country_name') or u.get('country') or _infer_country_from_phone(u.get('phone'))),
            'deposited_eur':       round(deposited, 2),
            'available_balance_eur': round(bal['available'], 2),
            'account_status':      _compute_account_status_label(u, wds),
            'progress_step':       _compute_progress_step(u, wds),
            'badges':              _compute_badges(u, total_eur, has_completed_wd),
            'has_pending_tax':     any((w.get('status') or '').lower() in ('tax_pending', 'pending_tax') for w in wds),
            'partial_withdraw_unlocked': bool(u.get('partial_withdraw_unlocked')),
            'created_at': u.get('created_at'),
        })

    # Filters
    if q:
        ql = q.lower().strip()
        out = [m for m in out if ql in m['name'].lower() or ql in m['country'].lower()]
    if status:
        out = [m for m in out if m['account_status'] == status]
    if country:
        cl = country.lower().strip()
        out = [m for m in out if cl in m['country'].lower()]

    # Sort: self first, then verified, then by deposited desc
    out.sort(key=lambda m: (not m['is_self'], 'verified' not in m['badges'], -m['deposited_eur']))
    total_filtered = len(out)
    return {
        'count': total_filtered,
        'total_in_db': len(users),
        'members': out[:limit],
        'self_id': user['id'],
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }


@router.get("/community/recent-withdrawals")
async def community_recent_withdrawals(
    limit: int = Query(15, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    """Live feed of recent verified withdrawals for social proof."""
    wd_cur = db.transactions.find(
        {'transaction_type': 'withdraw',
         'status': {'$in': ['completed', 'in_transfer', 'approved']}},
        {'_id': 0, 'user_id': 1, 'amount': 1, 'currency': 1, 'status': 1,
         'created_at': 1, 'completed_at': 1},
    ).sort('created_at', -1).limit(limit * 2)
    rows = await wd_cur.to_list(length=limit * 2)

    if not rows:
        return {'count': 0, 'items': [], 'updated_at': datetime.now(timezone.utc).isoformat()}

    user_ids = list({r['user_id'] for r in rows})
    users_cur = db.users.find(
        {'id': {'$in': user_ids}},
        {'_id': 0, 'id': 1, 'name': 1, 'country_name': 1, 'country': 1},
    )
    user_map = {u['id']: u async for u in users_cur}

    items = []
    for r in rows[:limit]:
        u = user_map.get(r['user_id'])
        if not u:
            continue
        country = u.get('country_name') or u.get('country') or 'Internacional'
        amt = float(r.get('amount') or 0)
        if (r.get('currency') or 'EUR').upper() == 'USD':
            amt = amt / 1.08
        items.append({
            'id': f"{r['user_id'][:8]}-{r.get('created_at','')[-8:]}",
            'name_public': _public_first_name(u.get('name') or 'Cliente'),
            'country': country,
            'country_flag': _flag_for(country),
            'amount_eur': round(amt, 2),
            'date': r.get('completed_at') or r.get('created_at'),
            'status': r.get('status'),
        })

    return {
        'count': len(items),
        'items': items,
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }
