"""Trading Demo routes: simulated trading module"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import random
import math

from config import db
from services.auth import get_current_user

router = APIRouter()

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

CHALLENGES = [
    # ── Retos tutoriales / misiones educativas ──
    {'id': 'first_trade', 'name': 'Primer Paso', 'desc': 'Abre tu primera operacion', 'target': 1, 'type': 'trades_opened', 'xp': 20, 'badge': 'Novato', 'category': 'tutorial', 'order': 1},
    {'id': 'trade_with_sl', 'name': 'Protege tu Capital', 'desc': 'Abre una operacion con Stop Loss configurado', 'target': 1, 'type': 'trade_with_sl', 'xp': 40, 'badge': 'Prudente', 'category': 'tutorial', 'order': 2},
    {'id': 'trade_with_sltp', 'name': 'Plan Completo', 'desc': 'Abre una operacion con Stop Loss y Take Profit', 'target': 1, 'type': 'trade_with_sltp', 'xp': 60, 'badge': 'Estratega', 'category': 'tutorial', 'order': 3},
    {'id': 'first_win', 'name': 'Primera Victoria', 'desc': 'Cierra tu primera operacion con ganancia', 'target': 1, 'type': 'first_win', 'xp': 100, 'badge': 'Ganador', 'category': 'tutorial', 'order': 4},
    {'id': 'close_by_tp', 'name': 'Disciplina Ejecutada', 'desc': 'Deja que un Take Profit se active automaticamente', 'target': 1, 'type': 'tp_triggered', 'xp': 80, 'badge': 'Paciente', 'category': 'tutorial', 'order': 5},
    {'id': 'close_by_sl', 'name': 'Leccion Aprendida', 'desc': 'Un Stop Loss protegio tu capital (aceptar una perdida pequena es parte del oficio)', 'target': 1, 'type': 'sl_triggered', 'xp': 60, 'badge': 'Resiliente', 'category': 'tutorial', 'order': 6},
    # ── Retos de progresion ──
    {'id': 'streak_3', 'name': '3 Ganadoras', 'desc': 'Gana 3 operaciones consecutivas', 'target': 3, 'type': 'win_streak', 'xp': 50, 'badge': 'Racha', 'category': 'progress'},
    {'id': 'streak_5', 'name': '5 Ganadoras', 'desc': 'Gana 5 operaciones consecutivas', 'target': 5, 'type': 'win_streak', 'xp': 150, 'badge': 'En Fuego', 'category': 'progress'},
    {'id': 'profit_500', 'name': 'Ganancia $500', 'desc': 'Acumula $500 en ganancias', 'target': 500, 'type': 'total_profit', 'xp': 100, 'badge': 'Rentable', 'category': 'progress'},
    {'id': 'profit_2000', 'name': 'Ganancia $2,000', 'desc': 'Acumula $2,000 en ganancias', 'target': 2000, 'type': 'total_profit', 'xp': 300, 'badge': 'Experto', 'category': 'progress'},
    {'id': 'trades_10', 'name': '10 Operaciones', 'desc': 'Completa 10 operaciones', 'target': 10, 'type': 'total_trades', 'xp': 30, 'badge': 'Activo', 'category': 'progress'},
    {'id': 'trades_50', 'name': '50 Operaciones', 'desc': 'Completa 50 operaciones', 'target': 50, 'type': 'total_trades', 'xp': 200, 'badge': 'Veterano', 'category': 'progress'},
    {'id': 'drawdown_10', 'name': 'Control de Riesgo', 'desc': 'No pierdas mas del 10% del balance en una semana', 'target': 10, 'type': 'max_drawdown', 'xp': 200, 'badge': 'Disciplinado', 'category': 'progress'},
    {'id': 'multi_asset', 'name': 'Diversificado', 'desc': 'Opera en 4 activos diferentes', 'target': 4, 'type': 'unique_assets', 'xp': 80, 'badge': 'Diverso', 'category': 'progress'},
]

LEARNING_MODULES = [
    {'id': 'intro', 'title': 'Que es el Trading', 'duration': '3 min', 'level': 'basico',
     'content': 'El trading consiste en comprar y vender activos financieros (divisas, criptomonedas, materias primas) con el objetivo de obtener beneficios a partir de las fluctuaciones de sus precios. En esta plataforma demo, puedes practicar sin arriesgar dinero real.\n\n**Conceptos clave:**\n- **Comprar (Long):** Apuestas a que el precio sube\n- **Vender (Short):** Apuestas a que el precio baja\n- **Lote:** La cantidad que operas\n- **P/L:** Tu ganancia o perdida'},
    {'id': 'sl_tp', 'title': 'Stop Loss y Take Profit', 'duration': '4 min', 'level': 'basico',
     'content': 'Las ordenes de proteccion son fundamentales para gestionar el riesgo.\n\n**Stop Loss (SL):**\nCierra automaticamente tu operacion cuando la perdida alcanza un nivel predefinido. Es tu red de seguridad.\n\n**Take Profit (TP):**\nCierra automaticamente tu operacion cuando la ganancia alcanza tu objetivo. Asegura tus beneficios.\n\n**Ejemplo:**\nCompras EUR/USD a 1.0850:\n- Stop Loss: 1.0820 (pierdes 30 pips max)\n- Take Profit: 1.0910 (ganas 60 pips)'},
    {'id': 'risk', 'title': 'Gestion de Riesgo', 'duration': '5 min', 'level': 'intermedio',
     'content': 'La regla de oro: nunca arriesgues mas del 1-2% de tu balance en una sola operacion.\n\n**Regla del 1%:**\nCon $10,000 de balance, tu perdida maxima por operacion deberia ser $100.\n\n**Ratio Riesgo/Beneficio:**\nBusca operaciones donde el beneficio potencial sea al menos 2x la perdida potencial (ratio 1:2).\n\n**Diversificacion:**\nNo concentres todo en un solo activo.'},
    {'id': 'analysis', 'title': 'Analisis Tecnico Basico', 'duration': '6 min', 'level': 'intermedio',
     'content': 'Las velas japonesas muestran 4 datos: apertura, cierre, maximo y minimo.\n\n**Vela Verde:** El precio cerro mas alto de donde abrio (alcista)\n**Vela Roja:** El precio cerro mas bajo de donde abrio (bajista)\n\n**Patrones basicos:**\n- **Doji:** Indecision del mercado\n- **Martillo:** Posible cambio de tendencia\n- **Envolvente:** Fuerte movimiento en una direccion'},
    {'id': 'psychology', 'title': 'Psicologia del Trading', 'duration': '4 min', 'level': 'avanzado',
     'content': 'El mayor enemigo del trader es su mente.\n\n**Errores comunes:**\n- **FOMO:** Entrar tarde por miedo a perderselo\n- **Revenge trading:** Operar por frustacion despues de perder\n- **Overtrading:** Operar demasiado sin estrategia\n\n**Disciplina:**\n- Define tu estrategia ANTES de operar\n- Respeta siempre tu stop loss\n- Acepta las perdidas como parte del proceso\n- Lleva un diario de operaciones'},
]


def _simulate_price(symbol: str):
    base = BASE_PRICES.get(symbol, 100.0)
    info = ASSET_INFO.get(symbol, {})
    now = datetime.now(timezone.utc).timestamp()
    seed = now / 5.0
    wave1 = math.sin(seed * 0.3 + hash(symbol) % 100) * 0.0008
    wave2 = math.sin(seed * 1.1 + hash(symbol) % 50) * 0.0003
    wave3 = math.sin(seed * 3.7 + hash(symbol) % 25) * 0.0001
    noise = (random.random() - 0.5) * 0.0002
    change_pct = wave1 + wave2 + wave3 + noise
    bid = base * (1 + change_pct)
    spread = info.get('spread', 0.0001)
    ask = bid + spread
    if symbol == 'USDJPY':
        bid, ask = round(bid, 3), round(ask, 3)
    elif symbol in ('BTCUSD', 'ETHUSD', 'XAUUSD'):
        bid, ask = round(bid, 2), round(ask, 2)
    else:
        bid, ask = round(bid, 5), round(ask, 5)
    return {'bid': bid, 'ask': ask, 'change_pct': round(change_pct * 100, 3)}


def _calc_pl(trade, current_price):
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


class OpenTradeRequest(BaseModel):
    symbol: str
    direction: str
    lot_size: float = 0.1
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None


class CloseTradeRequest(BaseModel):
    trade_id: str


# ══════════════════ PRICES & CANDLES ══════════════════

@router.get("/trading/prices")
async def get_all_prices(current_user: dict = Depends(get_current_user)):
    prices = {}
    for symbol in BASE_PRICES:
        p = _simulate_price(symbol)
        prices[symbol] = {**p, **ASSET_INFO[symbol], 'symbol': symbol}
    return prices


@router.get("/trading/candles")
async def get_candles(symbol: str = "EURUSD", timeframe: str = "1h", current_user: dict = Depends(get_current_user)):
    if symbol not in BASE_PRICES:
        raise HTTPException(400, 'Activo no disponible')
    tf_minutes = {'1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440}.get(timeframe, 60)
    num_candles = 200
    base = BASE_PRICES[symbol]
    now = datetime.now(timezone.utc)
    candles = []
    price = base * (1 + math.sin(hash(symbol + 'seed') % 100) * 0.01)
    for i in range(num_candles):
        t = now.timestamp() - (num_candles - i) * tf_minutes * 60
        seed_val = t / (tf_minutes * 60)
        trend = math.sin(seed_val * 0.05 + hash(symbol) % 37) * 0.003
        vol = math.sin(seed_val * 0.2 + hash(symbol) % 19) * 0.002
        micro = math.sin(seed_val * 1.3 + hash(symbol) % 7) * 0.001
        change = trend + vol + micro
        r = ((int(t * 1000) + hash(symbol)) % 1000) / 1000.0
        noise = (r - 0.5) * 0.003
        change += noise
        open_p = price
        close_p = open_p * (1 + change)
        body = abs(close_p - open_p)
        high_p = max(open_p, close_p) + body * (0.3 + r * 0.7)
        low_p = min(open_p, close_p) - body * (0.3 + (1 - r) * 0.7)
        if symbol == 'USDJPY':
            candles.append({'time': int(t), 'open': round(open_p, 3), 'high': round(high_p, 3), 'low': round(low_p, 3), 'close': round(close_p, 3), 'volume': round(abs(change) * 100000 + 500 + r * 1500, 2)})
        elif symbol in ('BTCUSD', 'ETHUSD', 'XAUUSD'):
            candles.append({'time': int(t), 'open': round(open_p, 2), 'high': round(high_p, 2), 'low': round(low_p, 2), 'close': round(close_p, 2), 'volume': round(abs(change) * 50000 + 300 + r * 800, 2)})
        else:
            candles.append({'time': int(t), 'open': round(open_p, 5), 'high': round(high_p, 5), 'low': round(low_p, 5), 'close': round(close_p, 5), 'volume': round(abs(change) * 200000 + 1000 + r * 3000, 2)})
        price = close_p
    return {'symbol': symbol, 'timeframe': timeframe, 'candles': candles}


# ══════════════════ ACCOUNT ══════════════════

@router.get("/trading/account")
async def get_trading_account(current_user: dict = Depends(get_current_user)):
    user_id = current_user['id']
    account = await db.demo_accounts.find_one({'user_id': user_id}, {'_id': 0})
    if not account:
        account = {
            'id': str(uuid.uuid4()), 'user_id': user_id,
            'balance': 10000.0, 'initial_balance': 10000.0,
            'currency': 'USD', 'leverage': 100,
            'created_at': datetime.now(timezone.utc).isoformat(),
        }
        await db.demo_accounts.insert_one(account)

    open_trades = await db.demo_trades.find({'user_id': user_id, 'status': 'open'}, {'_id': 0}).to_list(200)
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
        'id': account['id'], 'balance': round(account['balance'], 2),
        'equity': round(equity, 2), 'margin_used': round(margin_used, 2),
        'free_margin': round(free_margin, 2), 'margin_level': round(margin_level, 2),
        'floating_pl': round(floating_pl, 2),
        'initial_balance': account.get('initial_balance', 10000.0),
        'currency': 'USD', 'leverage': account.get('leverage', 100),
        'open_trades': len(open_trades),
    }


# ══════════════════ TRADING OPS ══════════════════

@router.post("/trading/open")
async def open_trade(data: OpenTradeRequest, current_user: dict = Depends(get_current_user)):
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

    if data.symbol in ('BTCUSD', 'ETHUSD'):
        margin = entry_price * data.lot_size / account.get('leverage', 100)
    elif data.symbol == 'XAUUSD':
        margin = entry_price * data.lot_size * 100 / account.get('leverage', 100)
    else:
        margin = 100000 * data.lot_size / account.get('leverage', 100)

    if margin > account['balance']:
        raise HTTPException(400, 'Margen insuficiente')

    trade = {
        'id': str(uuid.uuid4()), 'user_id': user_id,
        'symbol': data.symbol, 'direction': data.direction,
        'lot_size': data.lot_size, 'entry_price': entry_price,
        'margin': round(margin, 2),
        'stop_loss': data.stop_loss, 'take_profit': data.take_profit,
        'status': 'open',
        'opened_at': datetime.now(timezone.utc).isoformat(),
        'closed_at': None, 'close_price': None, 'profit_loss': None,
    }
    await db.demo_trades.insert_one(trade)
    # Check tutorial challenges on open (first_trade, trade_with_sl, trade_with_sltp)
    newly_unlocked = await _check_challenges(user_id)
    return {
        'message': f'Operacion {data.direction.upper()} abierta',
        'trade': {k: v for k, v in trade.items() if k != '_id'},
        'newly_unlocked': newly_unlocked,
    }


@router.post("/trading/close")
async def close_trade(data: CloseTradeRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user['id']
    trade = await db.demo_trades.find_one({'id': data.trade_id, 'user_id': user_id, 'status': 'open'}, {'_id': 0})
    if not trade:
        raise HTTPException(404, 'Operacion no encontrada')

    price = _simulate_price(trade['symbol'])
    close_price = price['bid'] if trade['direction'] == 'buy' else price['ask']
    pl = _calc_pl(trade, close_price)
    close_reason = 'manual'

    await db.demo_trades.update_one({'id': data.trade_id}, {'$set': {
        'status': 'closed', 'close_price': close_price, 'profit_loss': pl,
        'closed_at': datetime.now(timezone.utc).isoformat(), 'close_reason': close_reason,
    }})
    await db.demo_accounts.update_one({'user_id': user_id}, {'$inc': {'balance': pl}})

    # Check challenges after close
    newly_unlocked = await _check_challenges(user_id)

    return {'message': 'Operacion cerrada', 'profit_loss': pl, 'close_price': close_price, 'newly_unlocked': newly_unlocked}


@router.get("/trading/positions")
async def get_open_positions(current_user: dict = Depends(get_current_user)):
    user_id = current_user['id']
    trades = await db.demo_trades.find({'user_id': user_id, 'status': 'open'}, {'_id': 0}).sort('opened_at', -1).to_list(100)
    result = []
    for t in trades:
        price = _simulate_price(t['symbol'])
        current = price['bid'] if t['direction'] == 'buy' else price['ask']
        pl = _calc_pl(t, current)
        # Check SL/TP hits
        sl_hit = False
        tp_hit = False
        if t.get('stop_loss'):
            if t['direction'] == 'buy' and current <= t['stop_loss']:
                sl_hit = True
            elif t['direction'] == 'sell' and current >= t['stop_loss']:
                sl_hit = True
        if t.get('take_profit'):
            if t['direction'] == 'buy' and current >= t['take_profit']:
                tp_hit = True
            elif t['direction'] == 'sell' and current <= t['take_profit']:
                tp_hit = True

        # Auto-close if SL/TP hit
        if sl_hit or tp_hit:
            close_price = t['stop_loss'] if sl_hit else t['take_profit']
            close_pl = _calc_pl(t, close_price)
            await db.demo_trades.update_one({'id': t['id']}, {'$set': {
                'status': 'closed', 'close_price': close_price, 'profit_loss': close_pl,
                'closed_at': datetime.now(timezone.utc).isoformat(),
                'close_reason': 'stop_loss' if sl_hit else 'take_profit',
            }})
            await db.demo_accounts.update_one({'user_id': user_id}, {'$inc': {'balance': close_pl}})
            await _check_challenges(user_id)
            continue

        result.append({**t, 'current_price': current, 'profit_loss': pl})
    return result


@router.get("/trading/history")
async def get_trade_history(current_user: dict = Depends(get_current_user)):
    user_id = current_user['id']
    trades = await db.demo_trades.find({'user_id': user_id, 'status': 'closed'}, {'_id': 0}).sort('closed_at', -1).to_list(200)
    return trades


@router.post("/trading/reset")
async def reset_demo_account(current_user: dict = Depends(get_current_user)):
    user_id = current_user['id']
    await db.demo_trades.delete_many({'user_id': user_id})
    await db.demo_accounts.update_one({'user_id': user_id}, {'$set': {'balance': 10000.0}})
    await db.trading_challenges.delete_many({'user_id': user_id})
    return {'message': 'Cuenta demo reiniciada', 'balance': 10000.0}


@router.get("/trading/convert")
async def convert_currency(amount: float = 100, from_currency: str = 'USD', to_currency: str = 'EUR', current_user: dict = Depends(get_current_user)):
    rates_to_usd = {'USD': 1.0, 'EUR': 1.0 / _simulate_price('EURUSD')['bid'], 'GBP': 1.0 / _simulate_price('GBPUSD')['bid'], 'JPY': _simulate_price('USDJPY')['bid']}
    if from_currency not in rates_to_usd or to_currency not in rates_to_usd:
        raise HTTPException(400, 'Divisa no soportada')
    if from_currency == 'USD': usd_amount = amount
    elif from_currency == 'JPY': usd_amount = amount / rates_to_usd['JPY']
    else: usd_amount = amount * (1.0 / rates_to_usd[from_currency])
    if to_currency == 'USD': result = usd_amount
    elif to_currency == 'JPY': result = usd_amount * rates_to_usd['JPY']
    else: result = usd_amount * rates_to_usd[to_currency]
    return {'from': from_currency, 'to': to_currency, 'amount': amount, 'result': round(result, 4), 'rate': round(result / amount, 6) if amount > 0 else 0}


# ══════════════════ STATS & PROFILE ══════════════════

@router.get("/trading/stats")
async def get_trading_stats(current_user: dict = Depends(get_current_user)):
    """Weekly trading report + trader profile"""
    user_id = current_user['id']
    all_closed = await db.demo_trades.find({'user_id': user_id, 'status': 'closed'}, {'_id': 0}).sort('closed_at', -1).to_list(500)

    if not all_closed:
        return {'total_trades': 0, 'win_rate': 0, 'best_trade': 0, 'worst_trade': 0,
                'total_profit': 0, 'total_loss': 0, 'net_pl': 0, 'avg_pl': 0,
                'profile': 'Sin datos', 'risk_level': 'Desconocido', 'avg_lot': 0,
                'favorite_asset': None, 'win_streak': 0, 'current_streak': 0,
                'weekly_trades': 0, 'weekly_pl': 0, 'weekly_wins': 0}

    wins = [t for t in all_closed if (t.get('profit_loss') or 0) > 0]
    losses = [t for t in all_closed if (t.get('profit_loss') or 0) <= 0]
    pls = [t.get('profit_loss', 0) for t in all_closed]

    total_profit = sum(p for p in pls if p > 0)
    total_loss = sum(p for p in pls if p < 0)
    net_pl = sum(pls)
    best = max(pls) if pls else 0
    worst = min(pls) if pls else 0

    # Win streak
    max_streak = 0
    current = 0
    for t in reversed(all_closed):
        if (t.get('profit_loss') or 0) > 0:
            current += 1
            max_streak = max(max_streak, current)
        else:
            current = 0

    # Current streak from latest
    current_streak = 0
    for t in all_closed:
        if (t.get('profit_loss') or 0) > 0:
            current_streak += 1
        else:
            break

    # Favorite asset
    assets = {}
    for t in all_closed:
        assets[t['symbol']] = assets.get(t['symbol'], 0) + 1
    fav = max(assets, key=assets.get) if assets else None

    # Avg lot
    avg_lot = round(sum(t['lot_size'] for t in all_closed) / len(all_closed), 2)

    # Profile
    win_rate = round(len(wins) / len(all_closed) * 100, 1)
    if avg_lot >= 0.5 and win_rate < 55:
        profile = 'Agresivo'
    elif avg_lot <= 0.15 and win_rate >= 50:
        profile = 'Conservador'
    elif win_rate >= 60:
        profile = 'Estrategico'
    else:
        profile = 'Moderado'

    risk_level = 'Alto' if avg_lot >= 0.5 else 'Medio' if avg_lot >= 0.2 else 'Bajo'

    # Weekly stats
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    weekly = [t for t in all_closed if (t.get('closed_at') or '') >= week_ago]
    weekly_wins = len([t for t in weekly if (t.get('profit_loss') or 0) > 0])
    weekly_pl = sum(t.get('profit_loss', 0) for t in weekly)

    return {
        'total_trades': len(all_closed), 'win_rate': win_rate,
        'best_trade': round(best, 2), 'worst_trade': round(worst, 2),
        'total_profit': round(total_profit, 2), 'total_loss': round(total_loss, 2),
        'net_pl': round(net_pl, 2), 'avg_pl': round(net_pl / len(all_closed), 2),
        'profile': profile, 'risk_level': risk_level, 'avg_lot': avg_lot,
        'favorite_asset': fav, 'win_streak': max_streak, 'current_streak': current_streak,
        'weekly_trades': len(weekly), 'weekly_pl': round(weekly_pl, 2), 'weekly_wins': weekly_wins,
    }


# ══════════════════ CHALLENGES ══════════════════

async def _check_challenges(user_id: str):
    """Check and unlock trading challenges. Returns list of newly unlocked challenges."""
    all_trades = await db.demo_trades.find({'user_id': user_id}, {'_id': 0}).to_list(1000)
    all_closed = [t for t in all_trades if t.get('status') == 'closed']
    existing = await db.trading_challenges.find({'user_id': user_id}, {'_id': 0}).to_list(100)
    unlocked_ids = {c['challenge_id'] for c in existing}
    newly_unlocked = []

    for ch in CHALLENGES:
        if ch['id'] in unlocked_ids:
            continue

        completed = False

        # ── Tutorial mission types ──
        if ch['type'] == 'trades_opened':
            completed = len(all_trades) >= ch['target']

        elif ch['type'] == 'trade_with_sl':
            completed = any(t.get('stop_loss') for t in all_trades)

        elif ch['type'] == 'trade_with_sltp':
            completed = any(t.get('stop_loss') and t.get('take_profit') for t in all_trades)

        elif ch['type'] == 'first_win':
            completed = any((t.get('profit_loss') or 0) > 0 for t in all_closed)

        elif ch['type'] == 'tp_triggered':
            completed = any(t.get('close_reason') == 'take_profit' for t in all_closed)

        elif ch['type'] == 'sl_triggered':
            completed = any(t.get('close_reason') == 'stop_loss' for t in all_closed)

        # ── Progress types ──
        elif ch['type'] == 'win_streak':
            streak = 0
            for t in reversed(all_closed):
                if (t.get('profit_loss') or 0) > 0:
                    streak += 1
                    if streak >= ch['target']:
                        completed = True
                        break
                else:
                    streak = 0

        elif ch['type'] == 'total_profit':
            total_p = sum(t.get('profit_loss', 0) for t in all_closed if (t.get('profit_loss') or 0) > 0)
            completed = total_p >= ch['target']

        elif ch['type'] == 'total_trades':
            completed = len(all_closed) >= ch['target']

        elif ch['type'] == 'unique_assets':
            unique = len(set(t['symbol'] for t in all_closed))
            completed = unique >= ch['target']

        elif ch['type'] == 'max_drawdown':
            week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            weekly_loss = abs(sum(t.get('profit_loss', 0) for t in all_closed if (t.get('closed_at') or '') >= week_ago and (t.get('profit_loss') or 0) < 0))
            completed = len(all_closed) >= 5 and weekly_loss <= 1000  # 10% of 10k

        if completed:
            await db.trading_challenges.insert_one({
                'id': str(uuid.uuid4()), 'user_id': user_id,
                'challenge_id': ch['id'], 'completed_at': datetime.now(timezone.utc).isoformat(),
            })
            newly_unlocked.append(ch)

    return newly_unlocked


@router.get("/trading/challenges")
async def get_challenges(current_user: dict = Depends(get_current_user)):
    user_id = current_user['id']
    completed = await db.trading_challenges.find({'user_id': user_id}, {'_id': 0}).to_list(100)
    completed_ids = {c['challenge_id']: c['completed_at'] for c in completed}

    result = []
    for ch in CHALLENGES:
        result.append({
            **ch,
            'completed': ch['id'] in completed_ids,
            'completed_at': completed_ids.get(ch['id']),
        })
    return result


# ══════════════════ RISK SIMULATOR ══════════════════

@router.get("/trading/risk-simulate")
async def simulate_risk(
    symbol: str = "EURUSD", direction: str = "buy", lot_size: float = 0.1,
    stop_loss: Optional[float] = None, take_profit: Optional[float] = None,
    current_user: dict = Depends(get_current_user)
):
    """Pre-trade risk analysis"""
    if symbol not in BASE_PRICES:
        raise HTTPException(400, 'Activo no disponible')

    price = _simulate_price(symbol)
    entry = price['ask'] if direction == 'buy' else price['bid']

    account = await db.demo_accounts.find_one({'user_id': current_user['id']}, {'_id': 0})
    balance = account['balance'] if account else 10000.0

    # Calculate margin
    if symbol in ('BTCUSD', 'ETHUSD'):
        margin = entry * lot_size / 100
    elif symbol == 'XAUUSD':
        margin = entry * lot_size * 100 / 100
    else:
        margin = 100000 * lot_size / 100

    # Scenarios
    scenarios = []
    for pct in [-5, -2, -1, -0.5, 0.5, 1, 2, 5]:
        sim_price = entry * (1 + pct / 100)
        if direction == 'sell':
            sim_pl = _calc_pl({'entry_price': entry, 'lot_size': lot_size, 'symbol': symbol, 'direction': direction}, sim_price)
        else:
            sim_pl = _calc_pl({'entry_price': entry, 'lot_size': lot_size, 'symbol': symbol, 'direction': direction}, sim_price)
        scenarios.append({'change_pct': pct, 'price': round(sim_price, 5 if symbol not in ('USDJPY', 'BTCUSD', 'ETHUSD', 'XAUUSD') else 2), 'pl': round(sim_pl, 2), 'balance_after': round(balance + sim_pl, 2)})

    # SL/TP risk
    sl_loss = None
    tp_gain = None
    if stop_loss:
        sl_loss = round(_calc_pl({'entry_price': entry, 'lot_size': lot_size, 'symbol': symbol, 'direction': direction}, stop_loss), 2)
    if take_profit:
        tp_gain = round(_calc_pl({'entry_price': entry, 'lot_size': lot_size, 'symbol': symbol, 'direction': direction}, take_profit), 2)

    risk_pct = round(abs(sl_loss) / balance * 100, 2) if sl_loss else None
    rr_ratio = round(abs(tp_gain / sl_loss), 2) if sl_loss and tp_gain and sl_loss != 0 else None

    return {
        'entry_price': entry, 'margin': round(margin, 2),
        'margin_pct': round(margin / balance * 100, 2),
        'balance': round(balance, 2),
        'scenarios': scenarios,
        'sl_loss': sl_loss, 'tp_gain': tp_gain,
        'risk_pct': risk_pct, 'rr_ratio': rr_ratio,
    }


# ══════════════════ LEARNING ══════════════════

@router.get("/trading/learning")
async def get_learning_modules(current_user: dict = Depends(get_current_user)):
    user_id = current_user['id']
    progress = await db.trading_learning.find({'user_id': user_id}, {'_id': 0}).to_list(20)
    completed_ids = {p['module_id'] for p in progress}
    result = []
    for m in LEARNING_MODULES:
        result.append({**m, 'completed': m['id'] in completed_ids})
    return result


@router.post("/trading/learning/{module_id}/complete")
async def complete_learning_module(module_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user['id']
    if not any(m['id'] == module_id for m in LEARNING_MODULES):
        raise HTTPException(404, 'Modulo no encontrado')
    existing = await db.trading_learning.find_one({'user_id': user_id, 'module_id': module_id})
    if not existing:
        await db.trading_learning.insert_one({
            'id': str(uuid.uuid4()), 'user_id': user_id, 'module_id': module_id,
            'completed_at': datetime.now(timezone.utc).isoformat(),
        })
    return {'message': 'Modulo completado'}


# ══════════════════ REPLAY MODE ══════════════════

@router.get("/trading/replay")
async def get_replay_candles(symbol: str = "BTCUSD", speed: int = 50, current_user: dict = Depends(get_current_user)):
    """Get historical candles for replay mode - returns all 200 candles, frontend controls reveal speed"""
    if symbol not in BASE_PRICES:
        raise HTTPException(400, 'Activo no disponible')

    base = BASE_PRICES[symbol]
    candles = []
    price = base * 0.95
    # Generate a more volatile history for replay to be interesting
    for i in range(200):
        seed = i * 0.1
        trend = math.sin(seed * 0.08 + hash(symbol + 'replay') % 50) * 0.005
        vol = math.sin(seed * 0.4 + hash(symbol + 'replay') % 20) * 0.003
        noise = ((hash(str(i) + symbol + 'r') % 1000) / 1000.0 - 0.5) * 0.004
        change = trend + vol + noise

        open_p = price
        close_p = open_p * (1 + change)
        r = ((hash(str(i) + symbol) % 1000) / 1000.0)
        body = abs(close_p - open_p)
        high_p = max(open_p, close_p) + body * (0.2 + r * 0.8)
        low_p = min(open_p, close_p) - body * (0.2 + (1 - r) * 0.8)

        t = int(datetime.now(timezone.utc).timestamp()) - (200 - i) * 3600

        if symbol in ('BTCUSD', 'ETHUSD', 'XAUUSD'):
            candles.append({'time': t, 'open': round(open_p, 2), 'high': round(high_p, 2), 'low': round(low_p, 2), 'close': round(close_p, 2)})
        elif symbol == 'USDJPY':
            candles.append({'time': t, 'open': round(open_p, 3), 'high': round(high_p, 3), 'low': round(low_p, 3), 'close': round(close_p, 3)})
        else:
            candles.append({'time': t, 'open': round(open_p, 5), 'high': round(high_p, 5), 'low': round(low_p, 5), 'close': round(close_p, 5)})

        price = close_p

    return {'symbol': symbol, 'candles': candles, 'total': len(candles)}
