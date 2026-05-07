"""Community / Members directory — public-facing transparency page.

Authenticated users only (any role). Returns *safe* aggregated fields:
name, country, deposited amount, available balance, account_status,
badges, progress step. NEVER exposes email/phone/documents.

The same record is keyed by user.id (no duplicates) — if the user already
exists they are simply re-rendered with fresh aggregations on each call.
"""
import re
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException

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


def _compute_account_status_label(user: dict, withdrawals: list, estado: Optional[str] = None) -> str:
    """Map raw doc fields to one of:
      activo | en_revision | retiro_pendiente | completado

    Priority:
      1. Hard suspensions always read as `en_revision`.
      2. The canonical `estado_actual` (when supplied) drives the label so the
         5-stage state machine and the 4 chip filters stay aligned.
      3. Legacy fallback derived from the latest withdrawal status.
    """
    if user.get('account_status') in ('suspended', 'rejected', 'blocked'):
        return 'en_revision'

    # Canonical state machine takes precedence — keeps chip filters in sync
    # with the timeline shown on each card.
    if estado:
        if estado in ('impuesto', 'revision'):
            return 'en_revision'
        if estado == 'transferencia':
            return 'retiro_pendiente'
        if estado in ('retirado', 'completado'):
            return 'completado'
        if estado == 'verificacion':
            return 'activo'

    # Legacy fallback — last withdrawal drives it
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
    """1=Verificacion · 2=Impuesto · 3=Revision · 4=Transferencia · 5=Retirado.
    Admin can override the derived step via `community_step_override` on the
    user doc — used by `/admin/community/advance` to manually walk a user
    through the process for compliance demos / phone-walk-throughs.
    """
    override = user.get('community_step_override')
    if isinstance(override, int) and 1 <= override <= 5:
        return override

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


# ════════════════════════════════════════════════════════
#  Canonical state machine
#  estado_actual is the public string label used by the UI.
#  Single source of truth derived from the numeric step + flags.
# ════════════════════════════════════════════════════════
ESTADO_BY_STEP = {
    1: 'verificacion',
    2: 'impuesto',
    3: 'revision',
    4: 'transferencia',
    5: 'retirado',
}
ESTADO_PROGRESS_PCT = {
    'verificacion':  20,
    'impuesto':      40,
    'revision':      60,
    'transferencia': 80,
    'retirado':      100,
    'completado':    100,
}


def _compute_estado_actual(user: dict, step: int, has_completed_withdrawal: bool) -> str:
    """Derive `estado_actual` from the numeric step + transaction history.

    `retirado` = at step 5 (final stage of the funnel).
    `completado` = the user has at least one fully-completed withdrawal AND
    the partial-withdraw flag is set, i.e. the cycle has fully finished.
    """
    # Explicit override stored on the user doc takes priority for ops/admin walk-throughs
    override_label = user.get('estado_actual')
    if isinstance(override_label, str) and override_label in ESTADO_PROGRESS_PCT:
        return override_label

    if step >= 5 and has_completed_withdrawal:
        # Fully completed the cycle (deposit + verified + withdraw cleared)
        return 'completado'
    return ESTADO_BY_STEP.get(step, 'verificacion')


def _compute_estado_progress_pct(estado: str) -> int:
    return ESTADO_PROGRESS_PCT.get(estado, 0)


def _compute_badges(user: dict, total_balance_eur: float, has_completed_withdrawal: bool, estado: str = '', deposited_eur: float = 0.0, withdrawn_eur: float = 0.0) -> list:
    """Auto-activate user-facing badges based on the canonical estado + cycle data.

    - `verified`              — when verification_status == 'verified' OR estado has progressed past `verificacion`
    - `withdrawal_processed`  — when has_completed_withdrawal OR estado in ('retirado','completado')
    - `capital_recovered`     — when withdrawn_eur ≥ 0.65 × deposited_eur (cycle effectively closed)
    - `premium`               — total_balance ≥ €50k
    - `high_priority`         — interest_score == 'hot' OR partial_withdraw_unlocked OR estado == 'impuesto'
    """
    badges = []
    progressed_past_verif = estado in ('impuesto', 'revision', 'transferencia', 'retirado', 'completado')
    if user.get('verification_status') == 'verified' or progressed_past_verif:
        badges.append('verified')
    if has_completed_withdrawal or estado in ('retirado', 'completado'):
        badges.append('withdrawal_processed')
    if deposited_eur > 0 and withdrawn_eur >= 0.65 * deposited_eur:
        badges.append('capital_recovered')
    if total_balance_eur >= 50000:
        badges.append('premium')
    if user.get('interest_score') == 'hot' or user.get('partial_withdraw_unlocked') or estado == 'impuesto':
        badges.append('high_priority')
    return badges


@router.get("/community/self")
async def community_self(user: dict = Depends(get_current_user)):
    """Lightweight projection of the current user's community state.

    Used by the LiveWithdrawalNotifier to adapt its behaviour to the user's
    own status (e.g. boost frequency for impuesto users, slow down for
    completed accounts).
    """
    # Pull the user's withdrawals to derive step + estado
    wds = await db.transactions.find(
        {'user_id': user['id'], 'transaction_type': 'withdraw'},
        {'_id': 0, 'status': 1, 'amount': 1, 'created_at': 1},
    ).sort('created_at', -1).to_list(20)
    has_completed_wd = any((w.get('status') or '').lower() == 'completed' for w in wds)
    step = _compute_progress_step(user, wds)
    estado = _compute_estado_actual(user, step, has_completed_wd)
    return {
        'estado_actual': estado,
        'progress_step': step,
        'progress_pct':  _compute_estado_progress_pct(estado),
        'has_pending_tax': any(
            (w.get('status') or '').lower() in ('tax_pending', 'pending_tax') for w in wds
        ) or estado == 'impuesto',
        'partial_withdraw_unlocked': bool(user.get('partial_withdraw_unlocked')),
        'verification_status': user.get('verification_status') or 'pending',
    }


@router.get("/community/members")
async def community_members(
    q: Optional[str] = Query(None, description='Free-text search on name + country'),
    status: Optional[str] = Query(None, description='Filter by account_status label'),
    country: Optional[str] = Query(None, description='Filter by country (case-insensitive contains)'),
    limit: int = Query(120, ge=1, le=500),
    offset: int = Query(0, ge=0, description='Skip this many records before returning'),
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
        withdrawn_eur = sum(float(w.get('amount') or 0) for w in wds if (w.get('status') or '').lower() == 'completed')

        step = _compute_progress_step(u, wds)
        estado = _compute_estado_actual(u, step, has_completed_wd)
        progress_pct = _compute_estado_progress_pct(estado)

        out.append({
            'id': u['id'],
            'is_self': u['id'] == user['id'],
            'name': u.get('name') or 'Cliente',
            'country': u.get('country_name') or u.get('country') or _infer_country_from_phone(u.get('phone')) or 'Internacional',
            'country_flag': _flag_for(u.get('country_name') or u.get('country') or _infer_country_from_phone(u.get('phone'))),
            'deposited_eur':       round(deposited, 2),
            'available_balance_eur': round(bal['available'], 2),
            'withdrawn_eur':       round(withdrawn_eur, 2),
            'account_status':      _compute_account_status_label(u, wds, estado),
            'progress_step':       step,
            'estado_actual':       estado,
            'progress_pct':        progress_pct,
            'badges':              _compute_badges(u, total_eur, has_completed_wd, estado, deposited, withdrawn_eur),
            'has_pending_tax':     any((w.get('status') or '').lower() in ('tax_pending', 'pending_tax') for w in wds) or estado == 'impuesto',
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
    page = out[offset:offset + limit]

    # Global status counts (BEFORE q/status/country filtering) so chips always
    # display the real DB-wide totals regardless of current search.
    status_counts = {'activo': 0, 'en_revision': 0, 'retiro_pendiente': 0, 'completado': 0}
    for u in users:
        wds = withdrawals_by_user.get(u['id'], [])
        has_completed_wd = any((w.get('status') or '').lower() == 'completed' for w in wds)
        step = _compute_progress_step(u, wds)
        estado = _compute_estado_actual(u, step, has_completed_wd)
        lbl = _compute_account_status_label(u, wds, estado)
        status_counts[lbl] = status_counts.get(lbl, 0) + 1

    return {
        'count': total_filtered,
        'total_in_db': len(users),
        'returned': len(page),
        'offset': offset,
        'limit': limit,
        'has_more': (offset + len(page)) < total_filtered,
        'status_counts': status_counts,
        'members': page,
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

    # Build per-user deposit + total-withdrawn aggregates for expanded card detail
    deposit_agg = db.transactions.aggregate([
        {'$match': {'user_id': {'$in': user_ids}, 'transaction_type': {'$in': ['deposit', 'admin_credit']}, 'status': 'completed'}},
        {'$group': {'_id': '$user_id', 'total': {'$sum': '$amount'}}},
    ])
    deposits_by_user = {d['_id']: float(d.get('total') or 0) async for d in deposit_agg}

    withdraw_agg = db.transactions.aggregate([
        {'$match': {'user_id': {'$in': user_ids}, 'transaction_type': 'withdraw', 'status': 'completed'}},
        {'$group': {'_id': '$user_id', 'total': {'$sum': '$amount'}}},
    ])
    withdrawn_by_user = {d['_id']: float(d.get('total') or 0) async for d in withdraw_agg}

    items = []
    for r in rows[:limit]:
        u = user_map.get(r['user_id'])
        if not u:
            continue
        country = u.get('country_name') or u.get('country') or 'Internacional'
        amt = float(r.get('amount') or 0)
        if (r.get('currency') or 'EUR').upper() == 'USD':
            amt = amt / 1.08
        deposited = deposits_by_user.get(r['user_id'], 0.0)
        total_withdrawn = withdrawn_by_user.get(r['user_id'], 0.0)
        is_completed = (r.get('status') or '').lower() == 'completed'
        items.append({
            'id': f"{r['user_id'][:8]}-{r.get('created_at','')[-8:]}",
            'user_short_id': f"LB-{r['user_id'][:8].upper()}",
            'name_public': _public_first_name(u.get('name') or 'Cliente'),
            'country': country,
            'country_flag': _flag_for(country),
            'amount_eur': round(amt, 2),
            'deposited_eur': round(deposited, 2),
            'total_withdrawn_eur': round(total_withdrawn, 2),
            'date': r.get('completed_at') or r.get('created_at'),
            'status': r.get('status'),
            'estado_actual': 'completado' if is_completed else 'transferencia',
            'progress_pct': 100 if is_completed else 80,
        })

    return {
        'count': len(items),
        'items': items,
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }


@router.get("/community/stats")
async def community_stats(user: dict = Depends(get_current_user)):
    """Platform-wide aggregates for the community page (animated counter,
    Hall of Fame, etc.). Cached client-side; safe to poll every 60s."""
    # Total withdrawn (EUR equivalent) + unique users who completed a withdrawal
    wd_cur = db.transactions.find(
        {'transaction_type': 'withdraw', 'status': 'completed'},
        {'_id': 0, 'amount': 1, 'currency': 1, 'user_id': 1, 'created_at': 1, 'completed_at': 1},
    )
    rows = await wd_cur.to_list(50000)
    total_withdrawn_eur = 0.0
    full_withdrawer_user_ids: set = set()
    for r in rows:
        amt = float(r.get('amount') or 0)
        if (r.get('currency') or 'EUR').upper() == 'USD':
            amt = amt / 1.08
        total_withdrawn_eur += amt
        if r.get('user_id'):
            full_withdrawer_user_ids.add(r['user_id'])

    # ════════════════════════════════════════════════════════════════
    # TOTAL PAGADO — taxes paid by clients to access withdrawals
    #   • €4.850 per user that completed a full withdrawal (final tax)
    #   • €2.660 per user that only unlocked the partial 40% gate
    #     (counted ONLY if they have not yet completed a full withdrawal,
    #      to avoid double-counting people who paid both)
    # ════════════════════════════════════════════════════════════════
    TAX_FULL_EUR = 4850.0
    TAX_PARTIAL_EUR = 2660.0

    full_withdrawer_count = len(full_withdrawer_user_ids)
    tax_full_total = full_withdrawer_count * TAX_FULL_EUR

    partial_only_count = await db.users.count_documents({
        'partial_withdraw_unlocked': True,
        'id': {'$nin': list(full_withdrawer_user_ids)},
    })
    tax_partial_total = partial_only_count * TAX_PARTIAL_EUR
    total_tax_paid_eur = tax_full_total + tax_partial_total

    # ════════════════════════════════════════════════════════════════
    # Sparkline 7d — cumulative tax_paid running total per day (UTC).
    # We bucket each completed withdrawal by its completion day, then
    # walk the last 7 days appending the running total × €4.850.
    # ════════════════════════════════════════════════════════════════
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    days_window = [today - timedelta(days=i) for i in range(6, -1, -1)]  # 7 buckets, oldest → newest
    seen_users: set = set()
    daily_new_users: dict = {d.date().isoformat(): 0 for d in days_window}
    older_users: set = set()  # users whose retirement is BEFORE the 7-day window
    window_start_iso = days_window[0].isoformat()
    for r in rows:
        uid = r.get('user_id')
        if not uid or uid in seen_users:
            continue
        seen_users.add(uid)
        completed_at = r.get('completed_at') or r.get('created_at') or ''
        if completed_at < window_start_iso:
            older_users.add(uid)
            continue
        day_key = completed_at[:10]  # YYYY-MM-DD
        if day_key in daily_new_users:
            daily_new_users[day_key] += 1
    # Build cumulative series, baseline = users that retired before the window
    cumulative = len(older_users)
    tax_paid_history_7d = []
    for d in days_window:
        cumulative += daily_new_users.get(d.date().isoformat(), 0)
        tax_paid_history_7d.append({
            'date': d.date().isoformat(),
            'tax_paid_eur': round(cumulative * TAX_FULL_EUR + tax_partial_total, 2),
        })

    # Hall of Fame — top 5 withdrawals last 30 days (by amount EUR-eq)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    monthly_rows = [r for r in rows if (r.get('completed_at') or r.get('created_at') or '') >= cutoff]
    for r in monthly_rows:
        a = float(r.get('amount') or 0)
        if (r.get('currency') or 'EUR').upper() == 'USD':
            a = a / 1.08
        r['_eur'] = a
    monthly_rows.sort(key=lambda x: -x.get('_eur', 0))
    top5 = monthly_rows[:5]

    # Resolve user names + countries for top5
    if top5:
        user_ids = [r['user_id'] for r in top5]
        users_cur = db.users.find(
            {'id': {'$in': user_ids}},
            {'_id': 0, 'id': 1, 'name': 1, 'country': 1, 'country_name': 1, 'phone': 1},
        )
        user_map = {u['id']: u async for u in users_cur}
    else:
        user_map = {}

    hall_of_fame = []
    for r in top5:
        u = user_map.get(r['user_id'])
        if not u:
            continue
        country = u.get('country_name') or u.get('country') or _infer_country_from_phone(u.get('phone')) or 'Internacional'
        hall_of_fame.append({
            'name_public': _public_first_name(u.get('name') or 'Cliente'),
            'country': country,
            'country_flag': _flag_for(country),
            'amount_eur': round(r['_eur'], 2),
            'date': r.get('completed_at') or r.get('created_at'),
        })

    # Active country distribution (top 5)
    countries: dict = {}
    users_all = db.users.find(
        {'role': {'$ne': 'admin'}},
        {'_id': 0, 'country_name': 1, 'country': 1, 'phone': 1},
    )
    async for u in users_all:
        c = u.get('country_name') or u.get('country') or _infer_country_from_phone(u.get('phone')) or 'Internacional'
        countries[c] = countries.get(c, 0) + 1
    top_countries = sorted(countries.items(), key=lambda x: -x[1])[:5]

    return {
        'total_withdrawn_eur': round(total_withdrawn_eur, 2),
        'total_tax_paid_eur': round(total_tax_paid_eur, 2),
        'tax_full_count': full_withdrawer_count,
        'tax_partial_count': partial_only_count,
        'tax_paid_history_7d': tax_paid_history_7d,
        # Backwards compatible alias — older clients expecting `total_deposited_eur`
        # now receive the new tax-paid figure here so the KPI keeps populating.
        'total_deposited_eur': round(total_tax_paid_eur, 2),
        'completed_withdrawals_count': len(rows),
        'hall_of_fame': hall_of_fame,
        'top_countries': [{'country': c, 'flag': _flag_for(c), 'count': n} for c, n in top_countries],
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }


# ============================================================
# Admin: walk users through the 5-stage progress manually
# ============================================================
from services.auth import get_admin_user

PROGRESS_STAGE_LABELS = {
    1: 'Verificación', 2: 'Impuesto', 3: 'Revisión', 4: 'Transferencia', 5: 'Retirado',
}


@router.get("/admin/community/progress-queue")
async def admin_progress_queue(admin: dict = Depends(get_admin_user)):
    """List of all non-admin users with their current community progress
    step, sorted by step ASC (so the 'Verificación' bucket appears first)."""
    users_cur = db.users.find(
        {'role': {'$ne': 'admin'}},
        {'_id': 0, 'id': 1, 'name': 1, 'country': 1, 'country_name': 1, 'phone': 1,
         'verification_status': 1, 'community_step_override': 1, 'community_step_updated_at': 1},
    )
    users = await users_cur.to_list(length=5000)
    user_ids = [u['id'] for u in users]
    wd_cur = db.transactions.find(
        {'user_id': {'$in': user_ids}, 'transaction_type': 'withdraw'},
        {'_id': 0, 'user_id': 1, 'status': 1, 'created_at': 1},
    ).sort('created_at', -1)
    by_user: dict = {}
    async for w in wd_cur:
        by_user.setdefault(w['user_id'], []).append(w)

    out = []
    for u in users:
        step = _compute_progress_step(u, by_user.get(u['id'], []))
        country = u.get('country_name') or u.get('country') or _infer_country_from_phone(u.get('phone')) or 'Internacional'
        out.append({
            'id': u['id'],
            'name': u.get('name') or 'Cliente',
            'country': country,
            'country_flag': _flag_for(country),
            'step': step,
            'step_label': PROGRESS_STAGE_LABELS.get(step, '—'),
            'has_override': u.get('community_step_override') is not None,
            'last_advanced_at': u.get('community_step_updated_at'),
        })
    out.sort(key=lambda x: (x['step'], x['name']))
    return {'count': len(out), 'items': out, 'updated_at': datetime.now(timezone.utc).isoformat()}


@router.post("/admin/community/advance/{user_id}")
async def admin_advance_step(user_id: str, admin: dict = Depends(get_admin_user)):
    """Bump a user's community_step_override by 1 (max 5). Idempotent on
    the cap. Useful for compliance demos / walking through the 5 stages."""
    user = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not user:
        raise HTTPException(404, 'Usuario no encontrado')

    # Compute current step (using override if present, else derived)
    wds_cur = db.transactions.find(
        {'user_id': user_id, 'transaction_type': 'withdraw'},
        {'_id': 0, 'status': 1, 'created_at': 1},
    ).sort('created_at', -1)
    wds = await wds_cur.to_list(20)
    current = _compute_progress_step(user, wds)
    next_step = min(5, current + 1)

    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {'id': user_id},
        {'$set': {
            'community_step_override': next_step,
            'community_step_updated_at': now,
            'community_step_updated_by': admin.get('email'),
        }},
    )

    # In-app notification so the user sees real-time progress on next refresh
    from services.notifications import create_notification
    label = PROGRESS_STAGE_LABELS.get(next_step, str(next_step))
    if next_step == 5:
        title = 'Su retiro ha sido procesado'
        body = 'Felicitaciones — su proceso de verificación está completo y su retiro ha sido marcado como retirado.'
    else:
        title = f'Etapa avanzada · {label}'
        body = f'Su cuenta ha sido aprobada para la etapa {next_step}/5: {label}.'
    try:
        await create_notification(user_id, title, body)
    except Exception:
        pass

    return {'user_id': user_id, 'previous_step': current, 'new_step': next_step, 'label': label}


@router.post("/admin/community/set-step/{user_id}")
async def admin_set_step(user_id: str, step: int, admin: dict = Depends(get_admin_user)):
    """Force-set a user to a specific step (1-5). Used to seed initial state
    or correct mistakes."""
    if step < 1 or step > 5:
        raise HTTPException(400, 'step debe estar entre 1 y 5')
    user = await db.users.find_one({'id': user_id}, {'_id': 0, 'id': 1})
    if not user:
        raise HTTPException(404, 'Usuario no encontrado')
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {'id': user_id},
        {'$set': {
            'community_step_override': step,
            'community_step_updated_at': now,
            'community_step_updated_by': admin.get('email'),
        }},
    )
    return {'user_id': user_id, 'step': step, 'label': PROGRESS_STAGE_LABELS.get(step)}


@router.post("/admin/community/set-estado/{user_id}")
async def admin_set_estado(user_id: str, estado: str, admin: dict = Depends(get_admin_user)):
    """Set a user's `estado_actual` directly by its canonical name.

    Valid values: verificacion, impuesto, revision, transferencia, retirado, completado.
    Internally we keep the numeric `community_step_override` in sync to stay
    backward-compatible with the existing admin advance/reset endpoints, and we
    additionally persist `estado_actual` on the user doc so the UI can read it
    without recomputation.
    """
    if estado not in ESTADO_PROGRESS_PCT:
        raise HTTPException(400, f'estado inválido. Permitidos: {list(ESTADO_PROGRESS_PCT.keys())}')

    # Reverse map (estado → numeric step)
    step_for_estado = {v: k for k, v in ESTADO_BY_STEP.items()}
    step = step_for_estado.get(estado, 5 if estado in ('completado',) else 1)

    user = await db.users.find_one({'id': user_id}, {'_id': 0, 'id': 1})
    if not user:
        raise HTTPException(404, 'Usuario no encontrado')

    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {'id': user_id},
        {'$set': {
            'estado_actual': estado,
            'community_step_override': step,
            'community_step_updated_at': now,
            'community_step_updated_by': admin.get('email'),
        }},
    )

    # Audit
    try:
        await db.system_activity_log.insert_one({
            'id': str(uuid.uuid4()),
            'kind': 'community_estado_set',
            'user_id': user_id,
            'estado': estado,
            'step': step,
            'admin': admin.get('email'),
            'at': now,
        })
    except Exception:
        pass

    return {
        'user_id': user_id,
        'estado_actual': estado,
        'step': step,
        'progress_pct': ESTADO_PROGRESS_PCT[estado],
    }


@router.post("/admin/community/reset/{user_id}")
async def admin_reset_step(user_id: str, admin: dict = Depends(get_admin_user)):
    """Remove the override so the step reverts to the derived value."""
    await db.users.update_one(
        {'id': user_id},
        {'$unset': {
            'community_step_override': '',
            'community_step_updated_at': '',
            'community_step_updated_by': '',
            'estado_actual': '',
        }},
    )
    return {'user_id': user_id, 'reset': True}


# ====== Daily auto-advance scheduler endpoints ===============================

@router.post("/admin/community/auto-advance/run")
async def admin_run_auto_advance(admin: dict = Depends(get_admin_user)):
    """Manually trigger the daily auto-advance tick. Forces a run even if
    today's job already executed (scheduler-mode triggers do skip)."""
    from services.community_auto_advance import run_community_auto_advance_tick
    return await run_community_auto_advance_tick(triggered_by=admin.get('email') or 'manual')


@router.get("/admin/community/auto-advance/log")
async def admin_get_auto_advance_log(
    limit: int = Query(30, ge=1, le=180),
    admin: dict = Depends(get_admin_user),
):
    """Return the last N daily runs + current pool status."""
    from services.community_auto_advance import get_recent_runs, get_pool_status
    runs = await get_recent_runs(limit)
    pool = await get_pool_status()
    return {'runs': runs, 'pool': pool}


@router.post("/admin/community/bootstrap-demo")
async def admin_bootstrap_demo(admin: dict = Depends(get_admin_user)):
    """Idempotent bootstrap of the community social-proof demo pools.

    Use this AFTER deploying to production to populate the empty database
    with the same 80 completed + 35 in-process demo users that exist in
    preview. Safe to call multiple times (matches by email).
    """
    from services.community_demo_bootstrap import bootstrap_community_demo
    result = await bootstrap_community_demo()
    return {'status': 'ok', **result}


# ==================== COMMUNITY SHARE EVENTS (anonymous tracking) ====================

from fastapi import Request
from pydantic import BaseModel

# Allowed share channels (whitelist to avoid garbage in DB)
_ALLOWED_SHARE_CHANNELS = {'whatsapp', 'twitter', 'telegram', 'native', 'copy'}


class ShareEvent(BaseModel):
    item_id: str
    channel: str
    name_public: Optional[str] = None
    country: Optional[str] = None
    amount_eur: Optional[float] = 0.0
    capital_recovered: Optional[bool] = False


@router.post("/community/share-event")
async def community_record_share_event(payload: ShareEvent, request: Request):
    """Anonymous endpoint. Records that a user clicked a share button on a
    Recent Withdrawals card. NO authentication required (frontend fires-and-forgets).
    Used for engagement analytics — what content drives most social proof.
    """
    if payload.channel not in _ALLOWED_SHARE_CHANNELS:
        raise HTTPException(status_code=400, detail=f'Invalid channel. Allowed: {sorted(_ALLOWED_SHARE_CHANNELS)}')
    if not payload.item_id or len(payload.item_id) > 200:
        raise HTTPException(status_code=400, detail='Invalid item_id')

    # Capture lightweight context (no PII)
    ip = request.client.host if request.client else None
    forwarded = request.headers.get('x-forwarded-for')
    if forwarded:
        ip = forwarded.split(',')[0].strip()
    ua = request.headers.get('user-agent', '')[:300]

    doc = {
        'id': str(uuid.uuid4()),
        'item_id': payload.item_id,
        'channel': payload.channel,
        'name_public': (payload.name_public or '')[:80],
        'country': (payload.country or '')[:80],
        'amount_eur': float(payload.amount_eur or 0.0),
        'capital_recovered': bool(payload.capital_recovered),
        'ip': ip,
        'user_agent': ua,
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.community_share_events.insert_one(doc)
    except Exception as exc:
        logging.warning(f'[community_share_events] insert failed: {exc}')
        # Never fail the user-facing share — return ok regardless
        return {'status': 'logged_locally'}

    return {'status': 'ok', 'event_id': doc['id']}


@router.get("/admin/community/share-stats")
async def admin_community_share_stats(admin: dict = Depends(get_admin_user)):
    """Engagement analytics for the Recent Withdrawals share buttons.
    Returns total shares, breakdown by channel, top shared items, country
    distribution, capital_recovered ratio, and a 14-day daily trend.
    """
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=14)).isoformat()

    events = await db.community_share_events.find(
        {},
        {'_id': 0}
    ).sort('created_at', -1).to_list(20000)

    total = len(events)

    by_channel: dict = {ch: 0 for ch in _ALLOWED_SHARE_CHANNELS}
    by_country: dict = {}
    by_item: dict = {}
    capital_recovered_count = 0
    amount_sum = 0.0
    daily: dict = {}

    for ev in events:
        ch = ev.get('channel') or 'unknown'
        by_channel[ch] = by_channel.get(ch, 0) + 1

        country = ev.get('country') or 'Sin país'
        by_country[country] = by_country.get(country, 0) + 1

        item_id = ev.get('item_id') or 'unknown'
        if item_id not in by_item:
            by_item[item_id] = {
                'item_id': item_id,
                'name_public': ev.get('name_public') or '',
                'country': country,
                'amount_eur': ev.get('amount_eur') or 0.0,
                'capital_recovered': bool(ev.get('capital_recovered')),
                'count': 0,
                'channels': {},
            }
        by_item[item_id]['count'] += 1
        by_item[item_id]['channels'][ch] = by_item[item_id]['channels'].get(ch, 0) + 1

        if ev.get('capital_recovered'):
            capital_recovered_count += 1
        amount_sum += float(ev.get('amount_eur') or 0.0)

        # Daily bucket (last 14 days)
        created = ev.get('created_at', '')
        if created and created >= since:
            day_key = created[:10]  # YYYY-MM-DD
            daily[day_key] = daily.get(day_key, 0) + 1

    # Top 10 items by share count
    top_items = sorted(by_item.values(), key=lambda x: x['count'], reverse=True)[:10]

    # Top 10 countries
    top_countries = sorted(
        [{'country': k, 'count': v} for k, v in by_country.items()],
        key=lambda x: x['count'], reverse=True
    )[:10]

    # 14-day series
    series = []
    for i in range(14):
        d = (now - timedelta(days=13 - i)).strftime('%Y-%m-%d')
        series.append({'date': d, 'count': daily.get(d, 0)})

    capital_recovered_ratio = round((capital_recovered_count / total) * 100, 1) if total else 0
    avg_amount = round(amount_sum / total, 2) if total else 0

    return {
        'total': total,
        'by_channel': by_channel,
        'top_items': top_items,
        'top_countries': top_countries,
        'capital_recovered_count': capital_recovered_count,
        'capital_recovered_ratio_pct': capital_recovered_ratio,
        'avg_amount_eur': avg_amount,
        'daily_14d': series,
        'last_event_at': events[0].get('created_at') if events else None,
    }
