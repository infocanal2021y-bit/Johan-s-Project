"""Trading Bot (Demo) — rule-based automated trading on the simulated trading demo.

Strategies:
- rsi_reversion: RSI < 30 → BUY (oversold bounce expected), RSI > 70 → SELL (overbought pullback)
- ema_crossover: EMA20 crosses above EMA50 → BUY trend; crosses below → SELL trend
- combo: RSI + EMA trend alignment (default, safest)

Risk presets map to lot size and SL/TP distance as % of price.

Every tick (60s scheduler) we:
- For each user with bot.enabled=True:
  1. Check daily loss limit & max concurrent trades
  2. Fetch synthetic candles for the user's symbol
  3. Compute indicators
  4. Apply strategy → decision {BUY, SELL, HOLD}
  5. Log decision with educational reasoning
  6. If BUY/SELL and no current position on that side → open trade (with SL/TP)
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime, timezone, timedelta
import uuid
import asyncio

from config import db
from services.auth import get_current_user
from routes.trading import BASE_PRICES, ASSET_INFO, _simulate_price, _calc_pl, _check_challenges

router = APIRouter()


# ════════ CONFIG CONSTANTS ════════

RISK_PRESETS = {
    'bajo': {
        'lot_size': {'forex': 0.05, 'commodity': 0.05, 'crypto': 0.01, 'index': 0.05, 'stock_us': 0.05, 'stock_eu': 0.05, 'stock_latam': 0.05},
        'sl_pct': 0.004,  # 0.4%
        'tp_pct': 0.008,  # 0.8%  (1:2 R/R)
        'max_concurrent': 1,
        'max_daily_loss': 100,
        'description': 'Lotes pequenos, SL ajustado. Ideal para principiantes.',
    },
    'medio': {
        'lot_size': {'forex': 0.10, 'commodity': 0.10, 'crypto': 0.02, 'index': 0.10, 'stock_us': 0.10, 'stock_eu': 0.10, 'stock_latam': 0.10},
        'sl_pct': 0.008,  # 0.8%
        'tp_pct': 0.016,  # 1.6%  (1:2)
        'max_concurrent': 2,
        'max_daily_loss': 300,
        'description': 'Lotes moderados, SL equilibrado. Perfil balanceado.',
    },
    'alto': {
        'lot_size': {'forex': 0.25, 'commodity': 0.20, 'crypto': 0.04, 'index': 0.20, 'stock_us': 0.20, 'stock_eu': 0.20, 'stock_latam': 0.20},
        'sl_pct': 0.015,  # 1.5%
        'tp_pct': 0.030,  # 3.0%  (1:2)
        'max_concurrent': 3,
        'max_daily_loss': 800,
        'description': 'Lotes grandes, movimientos amplios. Solo para experimentados.',
    },
}

STRATEGIES = {
    'rsi_reversion': {
        'name': 'Reversion a la media (RSI)',
        'desc': 'Compra cuando el RSI indica sobreventa (<30) y vende cuando indica sobrecompra (>70). Ideal en mercados laterales.',
    },
    'ema_crossover': {
        'name': 'Cruce de EMAs',
        'desc': 'Detecta cambios de tendencia. Compra cuando EMA 20 cruza por encima de EMA 50 (tendencia alcista), vende en el cruce inverso.',
    },
    'combo': {
        'name': 'Combo RSI + EMA',
        'desc': 'Solo abre posiciones si el RSI confirma y la tendencia (EMA 20 vs 50) apoya. Menos senales pero mas fiables.',
    },
}


# ════════ PYDANTIC MODELS ════════

class BotConfig(BaseModel):
    enabled: bool = False
    symbol: str = 'EURUSD'
    strategy: Literal['rsi_reversion', 'ema_crossover', 'combo'] = 'combo'
    risk_level: Literal['bajo', 'medio', 'alto'] = 'bajo'


# ════════ HELPERS ════════

def _category(symbol: str) -> str:
    return ASSET_INFO.get(symbol, {}).get('category', 'forex')


def _bot_lot(symbol: str, risk: str) -> float:
    preset = RISK_PRESETS[risk]
    return preset['lot_size'].get(_category(symbol), 0.10)


def _bot_sl_tp(entry: float, direction: str, symbol: str, risk: str):
    preset = RISK_PRESETS[risk]
    sl_pct = preset['sl_pct']
    tp_pct = preset['tp_pct']
    if direction == 'buy':
        sl = entry * (1 - sl_pct)
        tp = entry * (1 + tp_pct)
    else:
        sl = entry * (1 + sl_pct)
        tp = entry * (1 - tp_pct)
    decimals = 5 if ASSET_INFO[symbol].get('pip', 0.0001) <= 0.0001 else 2
    return round(sl, decimals), round(tp, decimals)


def _sma(values, period):
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def _ema_series(values, period):
    if len(values) < period:
        return []
    k = 2 / (period + 1)
    # seed SMA
    sma_seed = sum(values[:period]) / period
    out = [sma_seed]
    for v in values[period:]:
        out.append(v * k + out[-1] * (1 - k))
    return out  # length = len(values) - period + 1


def _rsi(values, period=14):
    if len(values) < period + 1:
        return None
    gains, losses = 0.0, 0.0
    for i in range(1, period + 1):
        diff = values[i] - values[i - 1]
        if diff > 0:
            gains += diff
        else:
            losses -= diff
    avg_gain = gains / period
    avg_loss = losses / period
    for i in range(period + 1, len(values)):
        diff = values[i] - values[i - 1]
        gain = diff if diff > 0 else 0
        loss = -diff if diff < 0 else 0
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - 100 / (1 + rs)


async def _get_closes(symbol: str, n: int = 120):
    """Generate synthetic closes quickly using _simulate_price history — but we need candles.
    For consistency, generate 'n' synthetic closes using the same seed pattern as /trading/candles.
    """
    import math
    base = BASE_PRICES[symbol]
    now_ts = datetime.now(timezone.utc).timestamp()
    tf_min = 60  # 1h candles
    price = base * (1 + math.sin(hash(symbol + 'seed') % 100) * 0.01)
    closes = []
    for i in range(n):
        t = now_ts - (n - i) * tf_min * 60
        seed_val = t / (tf_min * 60)
        trend = math.sin(seed_val * 0.05 + hash(symbol) % 37) * 0.003
        vol = math.sin(seed_val * 0.2 + hash(symbol) % 19) * 0.002
        micro = math.sin(seed_val * 1.3 + hash(symbol) % 7) * 0.001
        r = ((int(t * 1000) + hash(symbol)) % 1000) / 1000.0
        noise = (r - 0.5) * 0.003
        change = trend + vol + micro + noise
        price = price * (1 + change)
        closes.append(price)
    return closes


def _decide(strategy: str, closes: list) -> dict:
    """Apply the strategy to compute a decision. Returns dict with action, reason, details."""
    if len(closes) < 60:
        return {'action': 'hold', 'reason': 'Datos insuficientes para analizar', 'details': {}}

    rsi_val = _rsi(closes, 14)
    ema20_series = _ema_series(closes, 20)
    ema50_series = _ema_series(closes, 50)
    ema20 = ema20_series[-1] if ema20_series else None
    ema50 = ema50_series[-1] if ema50_series else None
    ema20_prev = ema20_series[-2] if len(ema20_series) >= 2 else None
    ema50_prev = ema50_series[-2] if len(ema50_series) >= 2 else None
    price = closes[-1]

    details = {
        'price': round(price, 5),
        'rsi': round(rsi_val, 2) if rsi_val is not None else None,
        'ema20': round(ema20, 5) if ema20 is not None else None,
        'ema50': round(ema50, 5) if ema50 is not None else None,
    }

    if strategy == 'rsi_reversion':
        if rsi_val is None:
            return {'action': 'hold', 'reason': 'No hay suficientes datos para calcular RSI', 'details': details}
        if rsi_val < 30:
            return {
                'action': 'buy',
                'reason': f'RSI = {rsi_val:.1f} esta en SOBREVENTA (<30). El activo podria rebotar al alza.',
                'details': details,
            }
        if rsi_val > 70:
            return {
                'action': 'sell',
                'reason': f'RSI = {rsi_val:.1f} esta en SOBRECOMPRA (>70). El activo podria corregir a la baja.',
                'details': details,
            }
        return {
            'action': 'hold',
            'reason': f'RSI = {rsi_val:.1f} en zona neutral (30-70). Esperamos una senal mas clara.',
            'details': details,
        }

    if strategy == 'ema_crossover':
        if ema20 is None or ema50 is None or ema20_prev is None or ema50_prev is None:
            return {'action': 'hold', 'reason': 'Calculando EMAs...', 'details': details}
        golden = ema20_prev <= ema50_prev and ema20 > ema50
        death = ema20_prev >= ema50_prev and ema20 < ema50
        if golden:
            return {
                'action': 'buy',
                'reason': f'Golden Cross: EMA 20 ({ema20:.5f}) cruza por ENCIMA de EMA 50 ({ema50:.5f}). Senal alcista.',
                'details': details,
            }
        if death:
            return {
                'action': 'sell',
                'reason': f'Death Cross: EMA 20 ({ema20:.5f}) cruza por DEBAJO de EMA 50 ({ema50:.5f}). Senal bajista.',
                'details': details,
            }
        trend = 'alcista' if ema20 > ema50 else 'bajista'
        return {
            'action': 'hold',
            'reason': f'Sin cruce reciente. Tendencia {trend} estable. Esperamos un cruce claro para operar.',
            'details': details,
        }

    # combo
    if rsi_val is None or ema20 is None or ema50 is None:
        return {'action': 'hold', 'reason': 'Recolectando datos tecnicos...', 'details': details}
    trend_up = ema20 > ema50
    if rsi_val < 35 and trend_up:
        return {
            'action': 'buy',
            'reason': f'COMBO alcista: RSI = {rsi_val:.1f} bajo (<35) + tendencia alcista (EMA20>EMA50). Posible rebote con viento a favor.',
            'details': details,
        }
    if rsi_val > 65 and not trend_up:
        return {
            'action': 'sell',
            'reason': f'COMBO bajista: RSI = {rsi_val:.1f} alto (>65) + tendencia bajista (EMA20<EMA50). Posible correccion con viento a favor.',
            'details': details,
        }
    trend_label = 'alcista' if trend_up else 'bajista'
    return {
        'action': 'hold',
        'reason': f'Sin confirmacion. RSI = {rsi_val:.1f}, tendencia {trend_label}. El combo requiere RSI + tendencia alineados.',
        'details': details,
    }


async def _log_decision(user_id: str, symbol: str, strategy: str, decision: dict, trade_id: str = None, skipped_reason: str = None):
    doc = {
        'id': str(uuid.uuid4()),
        'user_id': user_id,
        'symbol': symbol,
        'strategy': strategy,
        'action': decision['action'],
        'reason': decision['reason'],
        'details': decision.get('details', {}),
        'executed': trade_id is not None,
        'trade_id': trade_id,
        'skipped_reason': skipped_reason,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }
    await db.bot_decisions.insert_one(doc)


async def _run_bot_for_user(cfg: dict):
    """Execute one bot tick for a single user."""
    user_id = cfg['user_id']
    symbol = cfg.get('symbol', 'EURUSD')
    strategy = cfg.get('strategy', 'combo')
    risk = cfg.get('risk_level', 'bajo')
    preset = RISK_PRESETS[risk]

    if symbol not in BASE_PRICES:
        return

    closes = await _get_closes(symbol, 120)
    decision = _decide(strategy, closes)

    # Execute?
    if decision['action'] == 'hold':
        await _log_decision(user_id, symbol, strategy, decision)
        return

    # Check open bot trades for this user (max concurrent)
    open_bot_trades = await db.demo_trades.count_documents({
        'user_id': user_id, 'status': 'open', 'bot_trade': True
    })
    if open_bot_trades >= preset['max_concurrent']:
        await _log_decision(user_id, symbol, strategy, decision, skipped_reason=f'Limite de {preset["max_concurrent"]} operaciones concurrentes alcanzado')
        return

    # Check daily loss limit
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_closed = await db.demo_trades.find({
        'user_id': user_id, 'bot_trade': True, 'status': 'closed', 'closed_at': {'$gte': today_start}
    }, {'_id': 0, 'profit_loss': 1}).to_list(500)
    daily_pl = sum(t.get('profit_loss', 0) or 0 for t in today_closed)
    if daily_pl < -preset['max_daily_loss']:
        await _log_decision(user_id, symbol, strategy, decision, skipped_reason=f'Limite de perdida diaria alcanzado (${abs(daily_pl):.2f})')
        return

    # Check if already have a trade in same direction on this symbol
    existing_same = await db.demo_trades.find_one({
        'user_id': user_id, 'status': 'open', 'bot_trade': True,
        'symbol': symbol, 'direction': decision['action']
    }, {'_id': 0})
    if existing_same:
        await _log_decision(user_id, symbol, strategy, decision, skipped_reason=f'Ya existe una posicion {decision["action"]} abierta en {symbol}')
        return

    # Fetch account
    account = await db.demo_accounts.find_one({'user_id': user_id}, {'_id': 0})
    if not account:
        return

    # Compute entry/margin/SL/TP
    price = _simulate_price(symbol)
    entry = price['ask'] if decision['action'] == 'buy' else price['bid']
    lot = _bot_lot(symbol, risk)
    if symbol in ('BTCUSD', 'ETHUSD'):
        margin = entry * lot / account.get('leverage', 100)
    elif symbol == 'XAUUSD':
        margin = entry * lot * 100 / account.get('leverage', 100)
    else:
        margin = 100000 * lot / account.get('leverage', 100)

    if margin > account['balance']:
        await _log_decision(user_id, symbol, strategy, decision, skipped_reason='Margen insuficiente')
        return

    sl, tp = _bot_sl_tp(entry, decision['action'], symbol, risk)
    trade_id = str(uuid.uuid4())
    trade = {
        'id': trade_id, 'user_id': user_id,
        'symbol': symbol, 'direction': decision['action'],
        'lot_size': lot, 'entry_price': entry,
        'margin': round(margin, 2),
        'stop_loss': sl, 'take_profit': tp,
        'status': 'open',
        'opened_at': datetime.now(timezone.utc).isoformat(),
        'closed_at': None, 'close_price': None, 'profit_loss': None,
        'bot_trade': True, 'bot_strategy': strategy, 'bot_risk': risk,
    }
    await db.demo_trades.insert_one(trade)
    await _log_decision(user_id, symbol, strategy, decision, trade_id=trade_id)
    await _check_challenges(user_id)


async def run_bot_tick():
    """Scheduler-invoked: iterate all users with bot enabled and run one tick each."""
    try:
        cursor = db.bot_config.find({'enabled': True}, {'_id': 0})
        configs = await cursor.to_list(1000)
        for cfg in configs:
            try:
                await _run_bot_for_user(cfg)
            except Exception as e:
                # best-effort; don't stop the whole batch
                await db.bot_errors.insert_one({
                    'id': str(uuid.uuid4()),
                    'user_id': cfg.get('user_id'),
                    'error': str(e),
                    'at': datetime.now(timezone.utc).isoformat(),
                })
            await asyncio.sleep(0.05)
    except Exception:
        pass


# ════════ ROUTES ════════

DEFAULT_CONFIG = {
    'enabled': False,
    'symbol': 'EURUSD',
    'strategy': 'combo',
    'risk_level': 'bajo',
}


@router.get("/trading/bot/config")
async def get_bot_config(current_user: dict = Depends(get_current_user)):
    cfg = await db.bot_config.find_one({'user_id': current_user['id']}, {'_id': 0})
    if not cfg:
        cfg = {**DEFAULT_CONFIG, 'user_id': current_user['id']}
    return {
        **cfg,
        'risk_presets': RISK_PRESETS,
        'strategies': STRATEGIES,
        'available_symbols': list(BASE_PRICES.keys()),
    }


@router.put("/trading/bot/config")
async def update_bot_config(data: BotConfig, current_user: dict = Depends(get_current_user)):
    user_id = current_user['id']
    if data.symbol not in BASE_PRICES:
        raise HTTPException(400, 'Activo no disponible')
    now = datetime.now(timezone.utc).isoformat()
    existing = await db.bot_config.find_one({'user_id': user_id}, {'_id': 0})
    doc = {
        'user_id': user_id,
        'enabled': data.enabled,
        'symbol': data.symbol,
        'strategy': data.strategy,
        'risk_level': data.risk_level,
        'updated_at': now,
    }
    if data.enabled and (not existing or not existing.get('enabled')):
        doc['started_at'] = now
    elif existing and existing.get('started_at') and data.enabled:
        doc['started_at'] = existing['started_at']

    await db.bot_config.update_one({'user_id': user_id}, {'$set': doc}, upsert=True)
    return {**doc, 'success': True}


@router.get("/trading/bot/status")
async def get_bot_status(current_user: dict = Depends(get_current_user)):
    user_id = current_user['id']
    cfg = await db.bot_config.find_one({'user_id': user_id}, {'_id': 0}) or {**DEFAULT_CONFIG, 'user_id': user_id}
    open_trades = await db.demo_trades.count_documents({'user_id': user_id, 'status': 'open', 'bot_trade': True})

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_closed = await db.demo_trades.find({
        'user_id': user_id, 'bot_trade': True, 'status': 'closed', 'closed_at': {'$gte': today_start}
    }, {'_id': 0, 'profit_loss': 1}).to_list(500)
    daily_pl = round(sum(t.get('profit_loss', 0) or 0 for t in today_closed), 2)
    daily_trades = len(today_closed)

    last_decision = await db.bot_decisions.find_one(
        {'user_id': user_id}, {'_id': 0}, sort=[('timestamp', -1)]
    )
    preset = RISK_PRESETS.get(cfg.get('risk_level', 'bajo'), RISK_PRESETS['bajo'])

    return {
        'config': cfg,
        'preset': preset,
        'open_trades': open_trades,
        'daily_pl': daily_pl,
        'daily_trades': daily_trades,
        'daily_loss_used_pct': round(min(100, (abs(daily_pl) / preset['max_daily_loss']) * 100), 1) if daily_pl < 0 else 0,
        'last_decision': last_decision,
        'is_running': bool(cfg.get('enabled')),
    }


@router.get("/trading/bot/decisions")
async def get_bot_decisions(limit: int = 50, current_user: dict = Depends(get_current_user)):
    decisions = await db.bot_decisions.find(
        {'user_id': current_user['id']}, {'_id': 0}
    ).sort('timestamp', -1).limit(min(limit, 200)).to_list(200)
    return decisions


@router.get("/trading/bot/performance")
async def get_bot_performance(current_user: dict = Depends(get_current_user)):
    user_id = current_user['id']
    closed = await db.demo_trades.find(
        {'user_id': user_id, 'bot_trade': True, 'status': 'closed'}, {'_id': 0}
    ).sort('closed_at', -1).to_list(1000)
    total = len(closed)
    wins = sum(1 for t in closed if (t.get('profit_loss') or 0) > 0)
    losses = sum(1 for t in closed if (t.get('profit_loss') or 0) < 0)
    total_pl = round(sum(t.get('profit_loss', 0) or 0 for t in closed), 2)
    best = max((t.get('profit_loss', 0) or 0 for t in closed), default=0)
    worst = min((t.get('profit_loss', 0) or 0 for t in closed), default=0)
    open_trades = await db.demo_trades.find(
        {'user_id': user_id, 'bot_trade': True, 'status': 'open'}, {'_id': 0}
    ).to_list(100)
    return {
        'total_trades': total,
        'wins': wins,
        'losses': losses,
        'win_rate': round((wins / total * 100), 1) if total else 0,
        'total_profit_loss': total_pl,
        'best_trade': round(best, 2),
        'worst_trade': round(worst, 2),
        'open_trades': open_trades,
        'recent_closed': closed[:20],
    }


@router.post("/trading/bot/reset")
async def reset_bot(current_user: dict = Depends(get_current_user)):
    user_id = current_user['id']
    # Close any open bot trades at current market
    open_bot = await db.demo_trades.find({'user_id': user_id, 'status': 'open', 'bot_trade': True}, {'_id': 0}).to_list(100)
    for t in open_bot:
        price = _simulate_price(t['symbol'])
        close_price = price['bid'] if t['direction'] == 'buy' else price['ask']
        pl = _calc_pl(t, close_price)
        await db.demo_trades.update_one({'id': t['id']}, {'$set': {
            'status': 'closed', 'close_price': close_price, 'profit_loss': pl,
            'closed_at': datetime.now(timezone.utc).isoformat(),
            'close_reason': 'bot_reset',
        }})
        await db.demo_accounts.update_one({'user_id': user_id}, {'$inc': {'balance': pl}})
    await db.bot_decisions.delete_many({'user_id': user_id})
    await db.bot_config.update_one({'user_id': user_id}, {'$set': {'enabled': False}}, upsert=True)
    return {'success': True, 'closed': len(open_bot)}


@router.post("/trading/bot/run-once")
async def run_once(current_user: dict = Depends(get_current_user)):
    """Manual tick — run the bot immediately for this user (for testing/educational)."""
    user_id = current_user['id']
    cfg = await db.bot_config.find_one({'user_id': user_id}, {'_id': 0})
    if not cfg or not cfg.get('enabled'):
        raise HTTPException(400, 'El bot debe estar activado para ejecutar una decision manual')
    await _run_bot_for_user(cfg)
    last = await db.bot_decisions.find_one({'user_id': user_id}, {'_id': 0}, sort=[('timestamp', -1)])
    return {'success': True, 'last_decision': last}
