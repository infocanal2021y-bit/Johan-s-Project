"""Market data routes"""
from fastapi import APIRouter, HTTPException, Depends, Query
import os, logging
import httpx
from services.auth import get_current_user

router = APIRouter()

# ==================== MARKET DATA (CoinGecko) ====================

_market_cache = {'data': None, 'timestamp': 0, 'global': None, 'global_ts': 0, 'trending': None, 'trending_ts': 0}

COINGECKO_HEADERS = {'Accept': 'application/json', 'User-Agent': 'LIONSBIT/1.0'}

@router.get("/market/crypto")
async def get_market_crypto():
    """Get top 50 cryptocurrencies from CoinGecko (cached 120s)"""
    now = datetime.now(timezone.utc).timestamp()
    if _market_cache['data'] and (now - _market_cache['timestamp']) < 120:
        return _market_cache['data']
    
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=COINGECKO_HEADERS) as client:
            resp = await client.get(
                "https://api.coingecko.com/api/v3/coins/markets",
                params={
                    'vs_currency': 'usd',
                    'order': 'market_cap_desc',
                    'per_page': 50,
                    'page': 1,
                    'sparkline': 'false',
                    'price_change_percentage': '24h,7d'
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                _market_cache['data'] = data
                _market_cache['timestamp'] = now
                return data
            elif resp.status_code == 429:
                logging.warning("CoinGecko rate limited for /coins/markets")
            else:
                logging.warning(f"CoinGecko markets status {resp.status_code}")
            return _market_cache['data'] or []
    except Exception as e:
        logging.error(f"CoinGecko markets error: {e}")
        return _market_cache['data'] or []

@router.get("/market/global")
async def get_market_global():
    """Get global crypto market data from CoinGecko (cached 180s)"""
    now = datetime.now(timezone.utc).timestamp()
    if _market_cache['global'] and (now - _market_cache['global_ts']) < 180:
        return _market_cache['global']
    
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=COINGECKO_HEADERS) as client:
            resp = await client.get("https://api.coingecko.com/api/v3/global")
            if resp.status_code == 200:
                data = resp.json().get('data', {})
                _market_cache['global'] = data
                _market_cache['global_ts'] = now
                return data
            return _market_cache['global'] or {}
    except Exception as e:
        logging.error(f"CoinGecko global error: {e}")
        return _market_cache['global'] or {}

@router.get("/market/trending")
async def get_market_trending():
    """Get trending coins from CoinGecko (cached 600s)"""
    now = datetime.now(timezone.utc).timestamp()
    if _market_cache['trending'] and (now - _market_cache['trending_ts']) < 600:
        return _market_cache['trending']
    
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=COINGECKO_HEADERS) as client:
            resp = await client.get("https://api.coingecko.com/api/v3/search/trending")
            if resp.status_code == 200:
                data = resp.json()
                _market_cache['trending'] = data
                _market_cache['trending_ts'] = now
                return data
            return _market_cache['trending'] or {'coins': [], 'categories': []}
    except Exception as e:
        logging.error(f"CoinGecko trending error: {e}")
        return _market_cache['trending'] or {'coins': [], 'categories': []}

# ==================== FINNHUB NEWS ====================

FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "")
_news_cache = {'general': None, 'general_ts': 0, 'crypto': None, 'crypto_ts': 0}

@router.get("/market/news")
async def get_market_news(category: str = "general"):
    """Get market news from Finnhub (cached 300s). category: general, crypto, forex, merger"""
    if category not in ("general", "crypto", "forex", "merger"):
        category = "general"
    
    cache_key = category
    now = datetime.now(timezone.utc).timestamp()
    
    if cache_key not in _news_cache:
        _news_cache[cache_key] = None
        _news_cache[f'{cache_key}_ts'] = 0
    
    if _news_cache.get(cache_key) and (now - _news_cache.get(f'{cache_key}_ts', 0)) < 300:
        return _news_cache[cache_key]
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://finnhub.io/api/v1/news",
                params={'category': category, 'token': FINNHUB_API_KEY}
            )
            if resp.status_code == 200:
                articles = resp.json()
                result = []
                for a in articles[:30]:
                    result.append({
                        'id': a.get('id'),
                        'headline': a.get('headline', ''),
                        'summary': a.get('summary', ''),
                        'source': a.get('source', ''),
                        'url': a.get('url', ''),
                        'image': a.get('image', ''),
                        'category': a.get('category', category),
                        'datetime': a.get('datetime', 0),
                        'related': a.get('related', ''),
                    })
                _news_cache[cache_key] = result
                _news_cache[f'{cache_key}_ts'] = now
                return result
            elif resp.status_code == 429:
                logging.warning("Finnhub rate limited")
            else:
                logging.warning(f"Finnhub news status {resp.status_code}")
            return _news_cache.get(cache_key) or []
    except Exception as e:
        logging.error(f"Finnhub news error: {e}")
        return _news_cache.get(cache_key) or []


# ==================== BINANCE INTEGRATION ====================

BINANCE_API_URL = "https://api.binance.us/api/v3"
_binance_cache = {
    'prices': None, 'prices_ts': 0,
    'tickers': None, 'tickers_ts': 0,
}

# Symbols we track for wallets
TRACKED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'DOTUSDT', 'AVAXUSDT', 'LINKUSDT']
SYMBOL_TO_COIN = {
    'BTCUSDT': {'coin': 'BTC', 'name': 'Bitcoin', 'icon': 'bitcoin'},
    'ETHUSDT': {'coin': 'ETH', 'name': 'Ethereum', 'icon': 'ethereum'},
    'BNBUSDT': {'coin': 'BNB', 'name': 'BNB', 'icon': 'bnb'},
    'SOLUSDT': {'coin': 'SOL', 'name': 'Solana', 'icon': 'solana'},
    'XRPUSDT': {'coin': 'XRP', 'name': 'Ripple', 'icon': 'xrp'},
    'ADAUSDT': {'coin': 'ADA', 'name': 'Cardano', 'icon': 'cardano'},
    'DOGEUSDT': {'coin': 'DOGE', 'name': 'Dogecoin', 'icon': 'doge'},
    'DOTUSDT': {'coin': 'DOT', 'name': 'Polkadot', 'icon': 'polkadot'},
    'AVAXUSDT': {'coin': 'AVAX', 'name': 'Avalanche', 'icon': 'avalanche'},
    'LINKUSDT': {'coin': 'LINK', 'name': 'Chainlink', 'icon': 'chainlink'},
}

@router.get("/binance/prices")
async def get_binance_prices():
    """Get real-time prices from Binance public API (cached 30s)"""
    now = datetime.now(timezone.utc).timestamp()
    if _binance_cache['prices'] and (now - _binance_cache['prices_ts']) < 30:
        return _binance_cache['prices']
    try:
        symbols_str = '["' + '","'.join(TRACKED_SYMBOLS) + '"]'
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            resp = await http_client.get(f"{BINANCE_API_URL}/ticker/price",
                params={'symbols': symbols_str})
            if resp.status_code == 200:
                data = resp.json()
                result = {}
                for item in data:
                    sym = item['symbol']
                    if sym in SYMBOL_TO_COIN:
                        coin_info = SYMBOL_TO_COIN[sym]
                        result[coin_info['coin']] = {
                            'symbol': sym,
                            'coin': coin_info['coin'],
                            'name': coin_info['name'],
                            'price': float(item['price']),
                        }
                _binance_cache['prices'] = result
                _binance_cache['prices_ts'] = now
                return result
            return _binance_cache['prices'] or {}
    except Exception as e:
        logging.error(f"Binance prices error: {e}")
        return _binance_cache['prices'] or {}

@router.get("/binance/tickers")
async def get_binance_tickers():
    """Get 24h ticker data from Binance (cached 60s)"""
    now = datetime.now(timezone.utc).timestamp()
    if _binance_cache['tickers'] and (now - _binance_cache['tickers_ts']) < 60:
        return _binance_cache['tickers']
    try:
        symbols_str = '["' + '","'.join(TRACKED_SYMBOLS) + '"]'
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            resp = await http_client.get(f"{BINANCE_API_URL}/ticker/24hr",
                params={'symbols': symbols_str})
            if resp.status_code == 200:
                data = resp.json()
                result = {}
                for item in data:
                    sym = item['symbol']
                    if sym in SYMBOL_TO_COIN:
                        coin_info = SYMBOL_TO_COIN[sym]
                        result[coin_info['coin']] = {
                            'symbol': sym,
                            'coin': coin_info['coin'],
                            'name': coin_info['name'],
                            'price': float(item['lastPrice']),
                            'price_change': float(item['priceChange']),
                            'price_change_pct': float(item['priceChangePercent']),
                            'high_24h': float(item['highPrice']),
                            'low_24h': float(item['lowPrice']),
                            'volume': float(item['volume']),
                            'quote_volume': float(item['quoteVolume']),
                        }
                _binance_cache['tickers'] = result
                _binance_cache['tickers_ts'] = now
                return result
            return _binance_cache['tickers'] or {}
    except Exception as e:
        logging.error(f"Binance tickers error: {e}")
        return _binance_cache['tickers'] or {}

@router.get("/binance/wallet")
async def get_binance_wallet(current_user: dict = Depends(get_current_user)):
    """Get user's wallet with REAL balances converted to crypto equivalents using live Binance prices"""
    # Get user's REAL platform balances
    accounts = await db.accounts.find({'user_id': current_user['id']}, {'_id': 0}).to_list(10)
    checking = next((a for a in accounts if a['account_type'] == 'checking'), None)
    savings = next((a for a in accounts if a['account_type'] == 'savings'), None)

    available_usd = checking.get('balance_usd', 0) if checking else 0
    available_eur = checking.get('balance_eur', 0) if checking else 0
    locked_usd = savings.get('balance_usd', 0) if savings else 0
    locked_eur = savings.get('balance_eur', 0) if savings else 0

    total_usd = available_usd + locked_usd

    # Fetch live prices from Binance
    prices = await get_binance_tickers()

    # Allocation percentages for the simulated crypto distribution
    ALLOCATION = [
        {'coin': 'BTC', 'name': 'Bitcoin', 'pct': 0.40},
        {'coin': 'ETH', 'name': 'Ethereum', 'pct': 0.25},
        {'coin': 'BNB', 'name': 'BNB', 'pct': 0.12},
        {'coin': 'SOL', 'name': 'Solana', 'pct': 0.08},
        {'coin': 'XRP', 'name': 'Ripple', 'pct': 0.05},
        {'coin': 'ADA', 'name': 'Cardano', 'pct': 0.03},
        {'coin': 'DOGE', 'name': 'Dogecoin', 'pct': 0.02},
        {'coin': 'DOT', 'name': 'Polkadot', 'pct': 0.02},
        {'coin': 'AVAX', 'name': 'Avalanche', 'pct': 0.02},
        {'coin': 'LINK', 'name': 'Chainlink', 'pct': 0.01},
    ]

    enriched_assets = []
    for alloc in ALLOCATION:
        coin = alloc['coin']
        price_data = prices.get(coin, {})
        price = price_data.get('price', 0)
        if price <= 0:
            continue

        # Calculate equivalent crypto amount from user's USD balance
        alloc_usd = total_usd * alloc['pct']
        crypto_qty = alloc_usd / price

        # Split available/locked proportionally
        avail_ratio = available_usd / total_usd if total_usd > 0 else 1
        avail_qty = crypto_qty * avail_ratio
        locked_qty = crypto_qty * (1 - avail_ratio)

        enriched_assets.append({
            'coin': coin,
            'name': alloc['name'],
            'available': round(avail_qty, 8),
            'locked': round(locked_qty, 8),
            'total': round(crypto_qty, 8),
            'price': price,
            'price_change_pct': price_data.get('price_change_pct', 0),
            'high_24h': price_data.get('high_24h', 0),
            'low_24h': price_data.get('low_24h', 0),
            'value_usd': round(alloc_usd, 2),
            'available_value_usd': round(alloc_usd * avail_ratio, 2),
            'locked_value_usd': round(alloc_usd * (1 - avail_ratio), 2),
        })

    distribution = []
    for a in enriched_assets:
        pct = (a['value_usd'] / total_usd * 100) if total_usd > 0 else 0
        distribution.append({'coin': a['coin'], 'name': a['name'], 'value': a['value_usd'], 'percentage': round(pct, 2)})

    return {
        'total_value_usd': round(total_usd, 2),
        'total_available_usd': round(available_usd, 2),
        'total_locked_usd': round(locked_usd, 2),
        'total_available_eur': round(available_eur, 2),
        'total_locked_eur': round(locked_eur, 2),
        'assets': enriched_assets,
        'distribution': distribution,
        'top_assets': enriched_assets[:5],
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }

@router.post("/admin/wallet/assign")
async def admin_assign_wallet_asset(data: AdminWalletAssign, admin: dict = Depends(get_admin_user)):
    """Admin assigns/updates a crypto asset in a user's simulated wallet"""
    wallet = await db.crypto_wallets_sim.find_one({'user_id': data.user_id}, {'_id': 0})
    if not wallet:
        wallet = {
            'id': str(uuid.uuid4()),
            'user_id': data.user_id,
            'assets': [],
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }
        await db.crypto_wallets_sim.insert_one(wallet)

    assets = wallet.get('assets', [])
    coin_name = SYMBOL_TO_COIN.get(f"{data.coin}USDT", {}).get('name', data.coin)
    found = False
    for asset in assets:
        if asset['coin'] == data.coin:
            asset['available'] = data.available
            asset['locked'] = data.locked
            found = True
            break
    if not found:
        assets.append({'coin': data.coin, 'name': coin_name, 'available': data.available, 'locked': data.locked})

    await db.crypto_wallets_sim.update_one(
        {'user_id': data.user_id},
        {'$set': {'assets': assets, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    return {'message': f'{data.coin} asignado a wallet del usuario'}


