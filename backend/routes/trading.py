"""Trading Demo routes: simulated trading module"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
import random
import math

from config import db
from services.auth import get_current_user

router = APIRouter()

# Simulated market prices with realistic base values
BASE_PRICES = {
    'EURUSD': 1.0862, 'GBPUSD': 1.2714, 'USDJPY': 154.32,
    'BTCUSD': 67420.0, 'ETHUSD': 3215.0, 'XAUUSD': 2345.50,
}

ASSET_INFO = {
    'EURUSD': {'name': 'Euro / US Dollar', 'pip': 0.0001, 'spread': 0.00012, 'category': 'forex'},
    'GBPUSD': {'name': 'British Pound / US Dollar', 'pip': 0.0001, 'spread': 0.00015, 'category': 'forex'},
    'USDJPY': {'name': 'US Dollar / Japanese Yen', 'pip': 0.01, 'spread': 0.015, 'category': 'forex'},
    'BTCUSD': {'name': 'Bitcoin / US Dollar', 'pip': 0.01, 'spread': 35.0, 'category': 'crypto'},
    'ETHUSD': {'name': 'Ethereum / US Dollar', 'pip': 0.01, 'spread': 2.5, 'category': 'crypto'},
    'XAUUSD': {'name': 'Gold / US Dollar', 'pip': 0.01, 'spread': 0.35, 'category': 'commodity'},
}

# In-memory price cache with movement simulation
_price_cache = {}
_price_ts = 0


def _simulate_price(symbol: str):
    """Generate realistic price movement"""
    base = BASE_PRICES.get(symbol, 100.0)
    info = ASSET_INFO.get(symbol, {})

    now = datetime.now(timezone.utc).timestamp()
    seed = now / 5.0  # changes every 5 seconds

    # Multi-frequency oscillation for realism
    wave1 = math.sin(seed * 0.3 + hash(symbol) % 100) * 0.0008
    wave2 = math.sin(seed * 1.1 + hash(symbol) % 50) * 0.0003
    wave3 = math.sin(seed * 3.7 + hash(symbol) % 25) * 0.0001
    noise = (random.random() - 0.5) * 0.0002

    change_pct = wave1 + wave2 + wave3 + noise
    bid = base * (1 + change_pct)
    spread = info.get('spread', 0.0001)
    ask = bid + spread

    # Round appropriately
    if symbol == 'USDJPY':
        bid = round(bid, 3)
        ask = round(ask, 3)
    elif symbol in ('BTCUSD', 'ETHUSD'):
        bid = round(bid, 2)
        ask = round(ask, 2)
    elif symbol == 'XAUUSD':
        bid = round(bid, 2)
        ask = round(ask, 2)
    else:
        bid = round(bid, 5)
        ask = round(ask, 5)

    daily_change = round(change_pct * 100, 3)
    return {'bid': bid, 'ask': ask, 'change_pct': daily_change}


class OpenTradeRequest(BaseModel):
    symbol: str
    direction: str  # 'buy' or 'sell'
    lot_size: float = 0.1
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None


class CloseTradeRequest(BaseModel):
    trade_id: str


@router.get("/trading/prices")
async def get_all_prices(current_user: dict = Depends(get_current_user)):
    """Get simulated prices for all trading pairs"""
    prices = {}
    for symbol in BASE_PRICES:
        p = _simulate_price(symbol)
        prices[symbol] = {
            **p,
            **ASSET_INFO[symbol],
            'symbol': symbol,
        }
    return prices


@router.get("/trading/account")
async def get_trading_account(current_user: dict = Depends(get_current_user)):
    """Get or create demo trading account for user"""
    user_id = current_user['id']
    account = await db.demo_accounts.find_one({'user_id': user_id}, {'_id': 0})

    if not account:
        account = {
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'balance': 10000.0,
            'initial_balance': 10000.0,
            'currency': 'USD',
            'leverage': 100,
            'created_at': datetime.now(timezone.utc).isoformat(),
        }
        await db.demo_accounts.insert_one(account)

    # Calculate equity from open positions
    open_trades = await db.demo_trades.find(
        {'user_id': user_id, 'status': 'open'}, {'_id': 0}
    ).to_list(200)

    floating_pl = 0.0
    margin_used = 0.0

    for trade in open_trades:
        price = _simulate_price(trade['symbol'])
        current = price['bid'] if trade['direction'] == 'buy' else price['ask']
        pl = _calc_pl(trade, current)
        floating_pl += pl
        margin_used += trade.get('margin', 0)

    equity = account['balance'] + floating_pl
    free_margin = equity - margin_used
    margin_level = (equity / margin_used * 100) if margin_used > 0 else 0

    return {
        'id': account['id'],
        'balance': round(account['balance'], 2),
        'equity': round(equity, 2),
        'margin_used': round(margin_used, 2),
        'free_margin': round(free_margin, 2),
        'margin_level': round(margin_level, 2),
        'floating_pl': round(floating_pl, 2),
        'initial_balance': account.get('initial_balance', 10000.0),
        'currency': 'USD',
        'leverage': account.get('leverage', 100),
        'open_trades': len(open_trades),
    }


def _calc_pl(trade, current_price):
    """Calculate P/L for a trade"""
    entry = trade['entry_price']
    lots = trade['lot_size']
    symbol = trade['symbol']

    if symbol == 'USDJPY':
        pip_value = (0.01 / current_price) * (lots * 100000)
        pips = (current_price - entry) / 0.01
    elif symbol in ('BTCUSD', 'ETHUSD'):
        pip_value = lots
        pips = current_price - entry
    elif symbol == 'XAUUSD':
        pip_value = lots * 100
        pips = current_price - entry
    else:
        pip_value = lots * 100000 * 0.0001
        pips = (current_price - entry) / 0.0001

    if trade['direction'] == 'sell':
        pips = -pips

    return round(pips * pip_value if symbol in ('USDJPY',) else pips * pip_value if symbol not in ('BTCUSD', 'ETHUSD', 'XAUUSD') else pips * lots, 2)


@router.post("/trading/open")
async def open_trade(data: OpenTradeRequest, current_user: dict = Depends(get_current_user)):
    """Open a new demo trade"""
    user_id = current_user['id']

    if data.symbol not in BASE_PRICES:
        raise HTTPException(400, 'Activo no disponible')
    if data.direction not in ('buy', 'sell'):
        raise HTTPException(400, 'Direccion invalida')
    if data.lot_size < 0.01 or data.lot_size > 10.0:
        raise HTTPException(400, 'Tamano de lote invalido (0.01 - 10.0)')

    account = await db.demo_accounts.find_one({'user_id': user_id}, {'_id': 0})
    if not account:
        raise HTTPException(400, 'Cuenta demo no encontrada')

    price = _simulate_price(data.symbol)
    entry_price = price['ask'] if data.direction == 'buy' else price['bid']

    # Calculate margin
    if data.symbol in ('BTCUSD', 'ETHUSD'):
        margin = entry_price * data.lot_size / account.get('leverage', 100)
    elif data.symbol == 'XAUUSD':
        margin = entry_price * data.lot_size * 100 / account.get('leverage', 100)
    else:
        margin = 100000 * data.lot_size / account.get('leverage', 100)

    if margin > account['balance']:
        raise HTTPException(400, 'Margen insuficiente')

    trade = {
        'id': str(uuid.uuid4()),
        'user_id': user_id,
        'symbol': data.symbol,
        'direction': data.direction,
        'lot_size': data.lot_size,
        'entry_price': entry_price,
        'margin': round(margin, 2),
        'stop_loss': data.stop_loss,
        'take_profit': data.take_profit,
        'status': 'open',
        'opened_at': datetime.now(timezone.utc).isoformat(),
        'closed_at': None,
        'close_price': None,
        'profit_loss': None,
    }
    await db.demo_trades.insert_one(trade)

    return {
        'message': f'Operacion {data.direction.upper()} abierta',
        'trade': {k: v for k, v in trade.items() if k != '_id'},
    }


@router.post("/trading/close")
async def close_trade(data: CloseTradeRequest, current_user: dict = Depends(get_current_user)):
    """Close an open demo trade"""
    user_id = current_user['id']
    trade = await db.demo_trades.find_one(
        {'id': data.trade_id, 'user_id': user_id, 'status': 'open'}, {'_id': 0}
    )
    if not trade:
        raise HTTPException(404, 'Operacion no encontrada')

    price = _simulate_price(trade['symbol'])
    close_price = price['bid'] if trade['direction'] == 'buy' else price['ask']
    pl = _calc_pl(trade, close_price)

    await db.demo_trades.update_one(
        {'id': data.trade_id},
        {'$set': {
            'status': 'closed',
            'close_price': close_price,
            'profit_loss': pl,
            'closed_at': datetime.now(timezone.utc).isoformat(),
        }}
    )

    await db.demo_accounts.update_one(
        {'user_id': user_id},
        {'$inc': {'balance': pl}}
    )

    return {'message': 'Operacion cerrada', 'profit_loss': pl, 'close_price': close_price}


@router.get("/trading/positions")
async def get_open_positions(current_user: dict = Depends(get_current_user)):
    """Get all open positions with live P/L"""
    user_id = current_user['id']
    trades = await db.demo_trades.find(
        {'user_id': user_id, 'status': 'open'}, {'_id': 0}
    ).sort('opened_at', -1).to_list(100)

    result = []
    for t in trades:
        price = _simulate_price(t['symbol'])
        current = price['bid'] if t['direction'] == 'buy' else price['ask']
        pl = _calc_pl(t, current)
        result.append({**t, 'current_price': current, 'profit_loss': pl})

    return result


@router.get("/trading/history")
async def get_trade_history(current_user: dict = Depends(get_current_user)):
    """Get closed trades history"""
    user_id = current_user['id']
    trades = await db.demo_trades.find(
        {'user_id': user_id, 'status': 'closed'}, {'_id': 0}
    ).sort('closed_at', -1).to_list(200)
    return trades


@router.post("/trading/reset")
async def reset_demo_account(current_user: dict = Depends(get_current_user)):
    """Reset demo account to initial balance"""
    user_id = current_user['id']
    await db.demo_trades.delete_many({'user_id': user_id})
    await db.demo_accounts.update_one(
        {'user_id': user_id},
        {'$set': {'balance': 10000.0}}
    )
    return {'message': 'Cuenta demo reiniciada', 'balance': 10000.0}


@router.get("/trading/convert")
async def convert_currency(
    amount: float = 100,
    from_currency: str = 'USD',
    to_currency: str = 'EUR',
    current_user: dict = Depends(get_current_user)
):
    """Convert between currencies using simulated rates"""
    rates_to_usd = {
        'USD': 1.0,
        'EUR': 1.0 / _simulate_price('EURUSD')['bid'],
        'GBP': 1.0 / _simulate_price('GBPUSD')['bid'],
        'JPY': _simulate_price('USDJPY')['bid'],
    }
    if from_currency not in rates_to_usd or to_currency not in rates_to_usd:
        raise HTTPException(400, 'Divisa no soportada')

    # Convert: from -> USD -> to
    if from_currency == 'USD':
        usd_amount = amount
    elif from_currency == 'JPY':
        usd_amount = amount / rates_to_usd['JPY']
    else:
        usd_amount = amount * (1.0 / rates_to_usd[from_currency])

    if to_currency == 'USD':
        result = usd_amount
    elif to_currency == 'JPY':
        result = usd_amount * rates_to_usd['JPY']
    else:
        result = usd_amount * rates_to_usd[to_currency]

    return {
        'from': from_currency,
        'to': to_currency,
        'amount': amount,
        'result': round(result, 4),
        'rate': round(result / amount, 6) if amount > 0 else 0,
    }
