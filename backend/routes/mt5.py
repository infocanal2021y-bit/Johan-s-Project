"""MT5 (MetaTrader 5) integration layer for LIONSBIT.

Simulated professional-grade MT5 account exposed to users. Designed to mirror
what a real MT5 bridge would return (AccountInfoDouble, HistoryOrdersGetByTicket,
PositionsGetByTicket, etc.) but backed by MongoDB.

Collections:
- mt5_accounts       { user_id (unique), login, server, broker_key, leverage,
                       balance, equity, free_margin, margin_used, margin_level,
                       currency, trading_allowed, account_status, created_at,
                       last_sync }
- mt5_operations     { id, user_id, ticket (int), symbol, direction (buy|sell),
                       lot, open_price, close_price, open_time, close_time,
                       profit, swap, commission, status (open|closed),
                       comment }
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone, timedelta
from typing import Optional
import random
import uuid

from config import db
from services.auth import get_current_user


router = APIRouter()


# ======================================================================
# Brokers catalogue (hardcoded — real regulated brokers, public info)
# ======================================================================

BROKERS = {
    'icmarkets': {
        'key': 'icmarkets',
        'name': 'IC Markets Global',
        'legal_name': 'International Capital Markets Pty Ltd',
        'regulator': 'ASIC (Australia) · CySEC (EU)',
        'license_number': 'AFSL 335692 · CIF 362/18',
        'country': 'Australia',
        'year_founded': 2007,
        'website': 'https://www.icmarkets.com/global/en/regulation',
        'license_url': 'https://asic.gov.au/online-services/search-asics-registers/',
        'server': 'ICMarketsSC-Demo',
        'rating': 9.5,
        'description': 'Broker regulado con ejecución ECN bajo licencia ASIC y CySEC.',
    },
    'pepperstone': {
        'key': 'pepperstone',
        'name': 'Pepperstone',
        'legal_name': 'Pepperstone Group Limited',
        'regulator': 'FCA (UK) · ASIC · CySEC · DFSA',
        'license_number': 'FCA 684312 · ASIC 414530',
        'country': 'Reino Unido',
        'year_founded': 2010,
        'website': 'https://pepperstone.com/en-gb/about-pepperstone/regulation/',
        'license_url': 'https://register.fca.org.uk/s/firm?id=001b000000Mxt1gAAB',
        'server': 'Pepperstone-Live01',
        'rating': 9.3,
        'description': 'Broker FCA con spreads Razor ECN y ejecución NDD.',
    },
    'admiral': {
        'key': 'admiral',
        'name': 'Admirals (Admiral Markets)',
        'legal_name': 'Admirals Group AS',
        'regulator': 'FCA · EFSA · CySEC · ASIC · JSC',
        'license_number': 'FCA 595450 · EFSA 4.1-1/46',
        'country': 'Estonia',
        'year_founded': 2001,
        'website': 'https://admiralmarkets.com/about-us/regulation',
        'license_url': 'https://register.fca.org.uk/s/firm?id=001b000000MfqUWAAZ',
        'server': 'AdmiralsGroup-Demo',
        'rating': 9.1,
        'description': 'Broker UE con cobertura FCA. Operativo desde 2001.',
    },
}

DEFAULT_BROKER = 'icmarkets'


# ======================================================================
# Asset universe (subset of trading_demo for realistic operations history)
# ======================================================================

MT5_ASSETS = [
    {'symbol': 'EURUSD', 'name': 'EUR/USD',   'pip': 0.0001, 'base_price': 1.0875},
    {'symbol': 'GBPUSD', 'name': 'GBP/USD',   'pip': 0.0001, 'base_price': 1.2680},
    {'symbol': 'USDJPY', 'name': 'USD/JPY',   'pip': 0.01,   'base_price': 150.25},
    {'symbol': 'XAUUSD', 'name': 'XAU/USD',   'pip': 0.01,   'base_price': 2340.50},
    {'symbol': 'XAGUSD', 'name': 'XAG/USD',   'pip': 0.001,  'base_price': 27.85},
    {'symbol': 'BTCUSD', 'name': 'BTC/USD',   'pip': 0.01,   'base_price': 67500.00},
    {'symbol': 'ETHUSD', 'name': 'ETH/USD',   'pip': 0.01,   'base_price': 3450.00},
    {'symbol': 'USOIL',  'name': 'WTI Oil',   'pip': 0.01,   'base_price': 78.40},
    {'symbol': 'US500',  'name': 'S&P 500',   'pip': 0.1,    'base_price': 5850.0},
    {'symbol': 'NAS100', 'name': 'Nasdaq 100','pip': 0.1,    'base_price': 20150.0},
]


# ======================================================================
# Helpers
# ======================================================================

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


async def _ensure_account(user_id: str, user_email: str) -> dict:
    """Get-or-create the MT5 account for this user."""
    acc = await db.mt5_accounts.find_one({'user_id': user_id}, {'_id': 0})
    if acc:
        return acc

    # Seed a realistic demo MT5 account
    login = random.randint(50_000_000, 99_999_999)
    initial_balance = 10_000.00
    broker = BROKERS[DEFAULT_BROKER]

    acc = {
        'user_id': user_id,
        'login': login,
        'server': broker['server'],
        'broker_key': DEFAULT_BROKER,
        'leverage': 500,
        'currency': 'USD',
        'initial_balance': initial_balance,
        'balance': initial_balance,
        'equity': initial_balance,
        'free_margin': initial_balance,
        'margin_used': 0.0,
        'margin_level': 0.0,  # 0 when no positions; else % = equity/margin_used*100
        'profit': 0.0,
        'trading_allowed': True,
        'account_status': 'active',
        'owner_email': user_email,
        'created_at': _iso(_now()),
        'last_sync': _iso(_now()),
    }
    await db.mt5_accounts.insert_one(acc)
    acc.pop('_id', None)

    # Seed realistic operation history
    await _seed_operations(user_id, login)
    # Recompute stats after seed
    acc = await _recompute_account(user_id)
    return acc


async def _seed_operations(user_id: str, login: int):
    """Seed ~8 closed ops + 2 open ops with realistic prices and small profits."""
    now = _now()
    ops: list[dict] = []

    # Closed operations — last 30 days, bias slightly positive (net +$1.5k-ish)
    for i in range(8):
        a = random.choice(MT5_ASSETS)
        direction = random.choice(['buy', 'sell'])
        lot = round(random.choice([0.05, 0.1, 0.2, 0.25, 0.5]), 2)
        entry = a['base_price'] * random.uniform(0.995, 1.005)
        # 65% winning
        is_winner = random.random() < 0.65
        pip_move = random.randint(8, 60)
        pip_value = a['pip']
        if direction == 'buy':
            exit_ = entry + (pip_move * pip_value if is_winner else -pip_move * pip_value)
        else:
            exit_ = entry - (pip_move * pip_value if is_winner else -pip_move * pip_value)

        # Profit calculation (simplified)
        price_diff = (exit_ - entry) if direction == 'buy' else (entry - exit_)
        usd_value_per_lot = 100_000 if a['symbol'] in ('EURUSD', 'GBPUSD') else 10_000
        profit = round(price_diff * lot * usd_value_per_lot / (a['base_price'] if 'USD' in a['symbol'][3:] else 1), 2)
        # Sanity bound
        profit = max(-380.0, min(560.0, profit))
        if is_winner and profit < 0:
            profit = abs(profit)
        if not is_winner and profit > 0:
            profit = -abs(profit)

        open_time = now - timedelta(days=random.randint(1, 30), hours=random.randint(0, 23))
        close_time = open_time + timedelta(hours=random.randint(2, 48))

        ops.append({
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'ticket': login + 1000 + i,
            'symbol': a['symbol'],
            'symbol_name': a['name'],
            'direction': direction,
            'lot': lot,
            'open_price': round(entry, 5),
            'close_price': round(exit_, 5),
            'open_time': _iso(open_time),
            'close_time': _iso(close_time),
            'profit': profit,
            'swap': round(random.uniform(-3.5, 1.2), 2),
            'commission': round(-lot * 7.0, 2),
            'status': 'closed',
            'comment': 'LIONSBIT MT5 Bridge',
        })

    # Open operations — 2 with small floating PnL
    for i in range(2):
        a = random.choice(MT5_ASSETS)
        direction = random.choice(['buy', 'sell'])
        lot = round(random.choice([0.1, 0.2, 0.3]), 2)
        entry = a['base_price'] * random.uniform(0.997, 1.003)
        open_time = now - timedelta(hours=random.randint(1, 18))
        ops.append({
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'ticket': login + 2000 + i,
            'symbol': a['symbol'],
            'symbol_name': a['name'],
            'direction': direction,
            'lot': lot,
            'open_price': round(entry, 5),
            'close_price': None,
            'open_time': _iso(open_time),
            'close_time': None,
            'profit': 0.0,  # recalculated at _recompute_account
            'swap': round(random.uniform(-2.0, 0.5), 2),
            'commission': round(-lot * 7.0, 2),
            'status': 'open',
            'comment': 'LIONSBIT MT5 Bridge',
        })

    if ops:
        await db.mt5_operations.insert_many(ops)


async def _recompute_account(user_id: str) -> dict:
    """Recompute live equity, margin_used, margin_level and free_margin.
    Called on read endpoints to give users fresh numbers without storing drift."""
    acc = await db.mt5_accounts.find_one({'user_id': user_id}, {'_id': 0})
    if not acc:
        return {}

    closed_cursor = db.mt5_operations.find(
        {'user_id': user_id, 'status': 'closed'}, {'_id': 0}
    )
    closed_ops = await closed_cursor.to_list(length=500)
    net_closed = sum((op.get('profit', 0) + op.get('swap', 0) + op.get('commission', 0)) for op in closed_ops)

    open_cursor = db.mt5_operations.find(
        {'user_id': user_id, 'status': 'open'}, {'_id': 0}
    )
    open_ops = await open_cursor.to_list(length=100)

    # Floating PnL on open: simulate small drift since open_time, persist on op.profit
    floating = 0.0
    total_margin_used = 0.0
    for op in open_ops:
        asset = next((a for a in MT5_ASSETS if a['symbol'] == op['symbol']), None)
        if not asset:
            continue
        # Simulated current price drifts around base_price with ±0.3% from open
        current = asset['base_price'] * random.uniform(0.998, 1.002)
        diff = (current - op['open_price']) if op['direction'] == 'buy' else (op['open_price'] - current)
        usd_value_per_lot = 100_000 if op['symbol'] in ('EURUSD', 'GBPUSD') else 10_000
        fp = round(diff * op['lot'] * usd_value_per_lot / (asset['base_price'] if 'USD' in op['symbol'][3:] else 1), 2)
        fp = max(-200.0, min(300.0, fp))
        floating += fp
        # Persist the floating profit so frontend sees something stable between calls
        await db.mt5_operations.update_one(
            {'id': op['id']}, {'$set': {'profit': fp}}
        )
        # Margin approx: contract_size * lot * price / leverage
        contract_size = 100_000 if asset['symbol'] in ('EURUSD', 'GBPUSD') else 100
        margin = contract_size * op['lot'] * asset['base_price'] / max(acc.get('leverage', 500), 1)
        total_margin_used += margin

    balance = round(acc.get('initial_balance', 10_000.0) + net_closed, 2)
    equity = round(balance + floating, 2)
    margin_level = round((equity / total_margin_used * 100), 2) if total_margin_used > 0 else 0.0
    free_margin = round(equity - total_margin_used, 2)

    update = {
        'balance': balance,
        'equity': equity,
        'profit': round(floating, 2),
        'margin_used': round(total_margin_used, 2),
        'margin_level': margin_level,
        'free_margin': free_margin,
        'last_sync': _iso(_now()),
    }
    await db.mt5_accounts.update_one({'user_id': user_id}, {'$set': update})
    acc.update(update)
    return acc


# ======================================================================
# Endpoints
# ======================================================================

@router.get("/mt5/account")
async def get_account(user: dict = Depends(get_current_user)):
    acc = await _ensure_account(user['id'], user.get('email', ''))
    # Fresh numbers
    acc = await _recompute_account(user['id'])
    acc.pop('_id', None)
    broker = BROKERS.get(acc.get('broker_key', DEFAULT_BROKER), BROKERS[DEFAULT_BROKER])
    return {
        **acc,
        'broker': broker,
    }


@router.get("/mt5/broker")
async def get_broker(user: dict = Depends(get_current_user)):
    acc = await _ensure_account(user['id'], user.get('email', ''))
    broker = BROKERS.get(acc.get('broker_key', DEFAULT_BROKER), BROKERS[DEFAULT_BROKER])
    return {
        **broker,
        'verification_status': 'verified',
        'linked_account_login': acc['login'],
        'linked_account_server': acc['server'],
    }


@router.get("/mt5/operations")
async def get_operations(
    status: Optional[str] = None,
    limit: int = 50,
    user: dict = Depends(get_current_user),
):
    """status=open|closed|None (all)"""
    query: dict = {'user_id': user['id']}
    if status in ('open', 'closed'):
        query['status'] = status

    # Keep account fresh (so open PnL is recent)
    await _recompute_account(user['id'])

    cursor = db.mt5_operations.find(query, {'_id': 0})
    ops = await cursor.to_list(length=min(limit, 500))

    # Sort: open first, then closed by close_time desc
    open_ops = [o for o in ops if o['status'] == 'open']
    closed_ops = sorted(
        [o for o in ops if o['status'] == 'closed'],
        key=lambda o: o.get('close_time') or '',
        reverse=True,
    )

    total_profit = sum(
        (o.get('profit', 0) + o.get('swap', 0) + o.get('commission', 0))
        for o in closed_ops
    )

    return {
        'open': open_ops,
        'closed': closed_ops,
        'open_count': len(open_ops),
        'closed_count': len(closed_ops),
        'total_closed_profit': round(total_profit, 2),
    }


@router.post("/mt5/sync")
async def sync_account(user: dict = Depends(get_current_user)):
    """Manual resync button from the UI."""
    await _ensure_account(user['id'], user.get('email', ''))
    acc = await _recompute_account(user['id'])
    acc.pop('_id', None)
    return {
        'ok': True,
        'synced_at': _iso(_now()),
        'balance': acc['balance'],
        'equity': acc['equity'],
        'profit': acc['profit'],
    }


@router.get("/mt5/summary")
async def get_summary(user: dict = Depends(get_current_user)):
    """One-shot endpoint for the main page (fewer roundtrips on mobile)."""
    acc = await _ensure_account(user['id'], user.get('email', ''))
    acc = await _recompute_account(user['id'])
    acc.pop('_id', None)

    broker_key = acc.get('broker_key', DEFAULT_BROKER)
    broker = BROKERS.get(broker_key, BROKERS[DEFAULT_BROKER])

    # Last 6 ops quick
    recent_cursor = db.mt5_operations.find(
        {'user_id': user['id']}, {'_id': 0}
    ).sort('open_time', -1).limit(6)
    recent = await recent_cursor.to_list(length=6)

    open_count = await db.mt5_operations.count_documents({'user_id': user['id'], 'status': 'open'})
    closed_count = await db.mt5_operations.count_documents({'user_id': user['id'], 'status': 'closed'})

    return {
        'account': acc,
        'broker': {
            **broker,
            'verification_status': 'verified',
        },
        'counts': {'open': open_count, 'closed': closed_count},
        'recent_operations': recent,
    }
