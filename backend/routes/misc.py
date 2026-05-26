"""Utility, market data, Binance, chatbot, and miscellaneous routes"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid
import os
import logging
import httpx

from config import db, EXCHANGE_RATES, CHATBOT_FAQ, RESTRICTED_BANK_TRANSFER_EMAILS, RESEND_API_KEY, CRYPTO_WALLETS
from models import ChatMessage, FeedbackSubmission, BankTransferConfirm, AdminWalletAssign
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification, notify_admins
from services.email import send_email_background, get_email_template

router = APIRouter()

# ==================== UTILITY ROUTES ====================

@router.get("/exchange-rates")
async def get_exchange_rates():
    return EXCHANGE_RATES

@router.get("/")
async def root():
    return {"message": "LIONSBIT VERIFICACION API", "version": "2.0.0"}

# ==================== ONLINE PRESENCE / HEARTBEAT ====================

@router.post("/auth/heartbeat")
async def heartbeat(current_user: dict = Depends(get_current_user)):
    """Update user's last_active timestamp to keep them online"""
    await db.users.update_one(
        {'id': current_user['id']},
        {'$set': {'last_active': datetime.now(timezone.utc).isoformat(), 'is_online': True}}
    )
    return {'status': 'ok'}

@router.post("/auth/logout-status")
async def logout_status(current_user: dict = Depends(get_current_user)):
    """Mark user as offline on logout"""
    await db.users.update_one(
        {'id': current_user['id']},
        {'$set': {'is_online': False}}
    )
    return {'status': 'ok'}

@router.get("/admin/users/online")
async def admin_get_online_users(admin: dict = Depends(get_admin_user)):
    """Get all currently online users (active in last 2 minutes)"""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()
    
    online_users = await db.users.find(
        {'is_online': True, 'last_active': {'$gte': cutoff}},
        {'_id': 0, 'password': 0, 'hashed_password': 0}
    ).to_list(100)
    
    # Also mark users as offline if their last_active is too old
    await db.users.update_many(
        {'is_online': True, 'last_active': {'$lt': cutoff}},
        {'$set': {'is_online': False}}
    )
    
    # Get last login info for each online user
    result = []
    for user in online_users:
        last_login = await db.login_history.find_one(
            {'user_id': user['id']},
            {'_id': 0}
        )
        result.append({
            'id': user['id'],
            'name': user.get('name', 'Desconocido'),
            'email': user.get('email', ''),
            'role': user.get('role', 'user'),
            'verification_status': user.get('verification_status', 'unverified'),
            'last_active': user.get('last_active', ''),
            'login_ip': last_login.get('ip_address', '-') if last_login else '-',
            'login_location': last_login.get('location', '-') if last_login else '-',
            'login_device': f"{last_login.get('browser', '?')} / {last_login.get('device', '?')}" if last_login else '-',
            'logged_in_at': last_login.get('logged_in_at', '') if last_login else ''
        })
    
    return result

# ==================== ADMIN LOGIN HISTORY ROUTES ====================

@router.get("/admin/login-history")
async def admin_get_login_history(admin: dict = Depends(get_admin_user)):
    """Get all login history for admin panel - most recent first"""
    history = await db.login_history.find(
        {},
        {'_id': 0}
    ).sort('logged_in_at', -1).limit(200).to_list(200)
    return history

@router.get("/admin/login-history/suspicious")
async def admin_get_suspicious_logins(admin: dict = Depends(get_admin_user)):
    """Detect suspicious logins: same user from different countries within 24 hours"""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    
    # Get recent logins
    recent = await db.login_history.find(
        {'logged_in_at': {'$gte': cutoff}},
        {'_id': 0}
    ).sort('logged_in_at', -1).to_list(500)
    
    # Group by user_id and detect different countries
    user_logins = {}
    for login in recent:
        uid = login.get('user_id', '')
        if uid not in user_logins:
            user_logins[uid] = []
        user_logins[uid].append(login)
    
    suspicious = []
    for uid, logins in user_logins.items():
        countries = set()
        for l in logins:
            cc = l.get('country_code') or l.get('country', '')
            if cc and cc != '--' and cc != 'Desconocido':
                countries.add(cc)
        if len(countries) > 1:
            suspicious.append({
                'user_id': uid,
                'user_name': logins[0].get('user_name', 'Desconocido'),
                'user_email': logins[0].get('user_email', 'Desconocido'),
                'countries': list(countries),
                'logins': logins[:10],
                'alert': f"Acceso desde {len(countries)} países diferentes en 24h"
            })
    
    return suspicious


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

# ==================== INVESTING.COM RSS NEWS ====================

import feedparser
from xml.etree import ElementTree

RSS_FEEDS = {
    'general': 'https://www.investing.com/rss/news_25.rss',
    'crypto': 'https://www.investing.com/rss/news_301.rss',
    'forex': 'https://www.investing.com/rss/news_1.rss',
    'economy': 'https://www.investing.com/rss/news_14.rss',
}

_news_cache = {}

def _parse_rss_date(date_str):
    """Parse RSS date string to ISO format"""
    try:
        dt = datetime.strptime(date_str.strip(), "%Y-%m-%d %H:%M:%S")
        return dt.replace(tzinfo=timezone.utc).isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()

@router.get("/market/news")
async def get_market_news(category: str = "general"):
    """Get market news from Investing.com RSS feeds (cached 300s)"""
    if category not in RSS_FEEDS:
        category = "general"

    now = datetime.now(timezone.utc).timestamp()
    cache_key = f"rss_{category}"

    if cache_key in _news_cache and (now - _news_cache.get(f'{cache_key}_ts', 0)) < 300:
        return _news_cache[cache_key]

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                RSS_FEEDS[category],
                headers={'User-Agent': 'Mozilla/5.0 (LIONSBIT/1.0)'}
            )
            if resp.status_code == 200:
                root = ElementTree.fromstring(resp.text)
                items = root.findall('.//item')
                result = []
                for item in items[:30]:
                    title = item.findtext('title', '')
                    link = item.findtext('link', '')
                    pub_date = item.findtext('pubDate', '')
                    author = item.findtext('author', 'Investing.com')
                    image = ''
                    enclosure = item.find('enclosure')
                    if enclosure is not None:
                        image = enclosure.get('url', '')

                    result.append({
                        'id': hash(link),
                        'headline': title,
                        'summary': '',
                        'source': author,
                        'url': link,
                        'image': image,
                        'category': category,
                        'datetime_iso': _parse_rss_date(pub_date),
                        'related': '',
                    })

                _news_cache[cache_key] = result
                _news_cache[f'{cache_key}_ts'] = now
                return result
            else:
                logging.warning(f"RSS feed status {resp.status_code} for {category}")
                return _news_cache.get(cache_key) or []
    except Exception as e:
        logging.error(f"RSS news error: {e}")
        return _news_cache.get(cache_key) or []


@router.get("/market/news/image-proxy")
async def proxy_news_image(url: str = Query(...)):
    """Proxy external news images to avoid CORS/referrer blocking"""
    if not url or not url.startswith('https://i-invdn-com.investing.com/'):
        from fastapi import Response
        return Response(status_code=400)
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://www.investing.com/'
            })
            if resp.status_code == 200:
                from fastapi.responses import Response as FastResponse
                content_type = resp.headers.get('content-type', 'image/jpeg')
                return FastResponse(
                    content=resp.content,
                    media_type=content_type,
                    headers={'Cache-Control': 'public, max-age=86400'}
                )
    except Exception:
        pass
    from fastapi import Response
    return Response(status_code=404)




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


# ==================== CHATBOT ROUTES ====================


# ─── Bank Transfer Payment Confirmation ───

@router.get("/payments/bank-transfer-access")
async def check_bank_transfer_access(current_user: dict = Depends(get_current_user)):
    """Check if user has access to bank transfer method"""
    has_access = current_user['email'].lower() not in RESTRICTED_BANK_TRANSFER_EMAILS
    return {'has_access': has_access}

@router.post("/payments/bank-transfer-confirm")
async def confirm_bank_transfer(data: BankTransferConfirm, current_user: dict = Depends(get_current_user)):
    """Record bank transfer confirmation with proof upload + email notifications"""
    if current_user['email'].lower() in RESTRICTED_BANK_TRANSFER_EMAILS:
        raise HTTPException(status_code=403, detail='No tiene acceso a este metodo de pago')
    
    # Validate file if provided
    if data.proof_file and data.proof_filename:
        allowed_ext = ('.jpg', '.jpeg', '.png', '.pdf')
        if not data.proof_filename.lower().endswith(allowed_ext):
            raise HTTPException(status_code=400, detail='Formato de archivo no permitido. Use JPG, PNG o PDF.')
        # Check base64 size (~5MB limit -> ~6.7MB base64)
        if len(data.proof_file) > 7_000_000:
            raise HTTPException(status_code=400, detail='Archivo demasiado grande. Maximo 5MB.')
    
    record_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    now_formatted = datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')
    
    record = {
        'id': record_id,
        'user_id': current_user['id'],
        'user_name': current_user['name'],
        'user_email': current_user['email'],
        'type': 'bank_transfer',
        'reference': data.reference,
        'amount': 4850,
        'currency': 'EUR',
        'status': 'pending_verification',
        'comment': data.comment,
        'proof_filename': data.proof_filename,
        'has_proof': bool(data.proof_file),
        'bank_details': {
            'holder': 'Juan Gomez',
            'iban': 'ES22 2100 1935 5701 0100 9946',
            'swift': 'CAIXESBBXXX',
            'bank': 'CaixaBank',
            'role': 'Agente autorizado',
        },
        'created_at': now,
        'updated_at': now
    }
    
    # Store proof file separately if provided (keep main record lean)
    if data.proof_file:
        await db.bank_transfer_proofs.insert_one({
            'payment_id': record_id,
            'filename': data.proof_filename,
            'data': data.proof_file,
            'created_at': now
        })
    
    await db.bank_transfer_payments.insert_one(record)
    
    # Notification to user
    await create_notification(current_user['id'], 'Comprobante Recibido',
        f'Su comprobante de transferencia bancaria (Ref: {data.reference}) ha sido recibido. Estado: Pendiente de verificacion.')
    
    # Notification to admins
    admins = await db.users.find({'role': 'admin'}, {'_id': 0, 'id': 1}).to_list(10)
    for admin in admins:
        await create_notification(admin['id'], 'Nueva Transferencia Bancaria',
            f'{current_user["name"]} ({current_user["email"]}) ha enviado comprobante de transferencia. Referencia: {data.reference}. Monto: 4850 EUR.')
    
    # ── Email copy to info@paylionsbit.es with attached proof ──
    from services.proof_forwarder import forward_proof_to_admin
    await forward_proof_to_admin(
        proof_type='Transferencia Bancaria',
        user=current_user,
        proof_file_b64=data.proof_file,
        proof_filename=data.proof_filename,
        fields={
            'Monto': '4850 EUR',
            'Referencia': data.reference,
            'IBAN destino': 'ES22 2100 1935 5701 0100 9946',
            'ID Comprobante': record_id,
        },
        comment=data.comment,
    )

    # ── Confirmation email to user ──
    user_email_content = f"""
        <p style="color:#e2e8f0;font-size:16px;">Hemos recibido tu comprobante de transferencia bancaria.</p>
        <table width="100%" style="background:#0f172a;border-radius:12px;margin:20px 0;">
            <tr><td style="padding:25px;">
                <p style="color:#10b981;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">Resumen</p>
                <table width="100%">
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Monto:</td><td style="color:#f59e0b;text-align:right;padding:8px 0;border-bottom:1px solid #334155;font-weight:bold;">4850 EUR</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Referencia:</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;font-family:monospace;">{data.reference}</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;">Estado:</td><td style="color:#f59e0b;text-align:right;padding:8px 0;font-weight:bold;">Pendiente de verificacion</td></tr>
                </table>
            </td></tr>
        </table>
        <p style="color:#94a3b8;font-size:14px;">Sera verificado en un plazo de 1 a 3 dias habiles.</p>
    """
    user_html = get_email_template(user_email_content, "Comprobante Recibido")
    send_email_background(current_user['email'], "Comprobante recibido - LIONSBIT VERIFICACION", user_html)
    
    return {'message': 'Comprobante enviado correctamente. Pendiente de verificacion.', 'id': record_id, 'status': 'pending_verification'}


@router.get("/admin/bank-transfer/proof")
async def admin_get_bank_transfer_proof(
    reference: Optional[str] = None,
    payment_id: Optional[str] = None,
    admin: dict = Depends(get_admin_user),
):
    """Locate a bank transfer proof by reference or payment_id. Returns the file
    as a data URI plus payment metadata so the admin can verify the upload
    directly from a notification.
    """
    if not reference and not payment_id:
        raise HTTPException(status_code=400, detail='Indique reference o payment_id')

    query = {}
    if payment_id:
        query['id'] = payment_id
    else:
        query['reference'] = reference.strip()

    payment = await db.bank_transfer_payments.find_one(
        query,
        {'_id': 0, 'id': 1, 'user_id': 1, 'user_name': 1, 'user_email': 1,
         'reference': 1, 'amount': 1, 'currency': 1, 'status': 1,
         'proof_filename': 1, 'has_proof': 1, 'created_at': 1, 'comment': 1,
         'proof_reviewed_at': 1, 'proof_reviewed_by': 1, 'proof_reviewed_by_name': 1}
    )
    if not payment:
        raise HTTPException(status_code=404, detail='Transferencia no encontrada')

    proof = await db.bank_transfer_proofs.find_one(
        {'payment_id': payment['id']},
        {'_id': 0, 'data': 1, 'filename': 1}
    )

    data_uri = None
    filename = payment.get('proof_filename')
    if proof and proof.get('data'):
        filename = proof.get('filename') or filename or 'comprobante.bin'
        raw = proof['data']
        if isinstance(raw, str) and raw.startswith('data:'):
            data_uri = raw
        else:
            ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'bin'
            mime_map = {
                'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                'png': 'image/png', 'webp': 'image/webp', 'pdf': 'application/pdf',
            }
            mime = mime_map.get(ext, 'application/octet-stream')
            data_uri = f'data:{mime};base64,{raw}'

    return {
        'payment': payment,
        'data_uri': data_uri,
        'filename': filename,
        'has_file': bool(data_uri),
    }


@router.post("/admin/bank-transfer/proof/mark-viewed")
async def admin_mark_bank_transfer_proof_viewed(
    payload: dict,
    admin: dict = Depends(get_admin_user),
):
    """Persist that an admin viewed (reviewed) a bank-transfer proof so the
    audit trail is real. Idempotent: if already viewed, returns the existing
    timestamp without overwriting it. Accepts {reference} or {payment_id}.
    """
    reference = (payload or {}).get('reference')
    payment_id = (payload or {}).get('payment_id')
    if not reference and not payment_id:
        raise HTTPException(status_code=400, detail='Indique reference o payment_id')

    query = {}
    if payment_id:
        query['id'] = payment_id
    else:
        query['reference'] = reference.strip()

    payment = await db.bank_transfer_payments.find_one(
        query, {'_id': 0, 'id': 1, 'proof_reviewed_at': 1, 'proof_reviewed_by': 1, 'proof_reviewed_by_name': 1}
    )
    if not payment:
        raise HTTPException(status_code=404, detail='Transferencia no encontrada')

    # Idempotent
    if payment.get('proof_reviewed_at'):
        return {
            'ok': True,
            'already_reviewed': True,
            'proof_reviewed_at': payment.get('proof_reviewed_at'),
            'proof_reviewed_by': payment.get('proof_reviewed_by'),
            'proof_reviewed_by_name': payment.get('proof_reviewed_by_name'),
        }

    now = datetime.now(timezone.utc).isoformat()
    admin_id = admin.get('id')
    admin_name = admin.get('name') or admin.get('email')
    await db.bank_transfer_payments.update_one(
        {'id': payment['id']},
        {'$set': {
            'proof_reviewed_at': now,
            'proof_reviewed_by': admin_id,
            'proof_reviewed_by_name': admin_name,
        }}
    )
    return {
        'ok': True,
        'already_reviewed': False,
        'proof_reviewed_at': now,
        'proof_reviewed_by': admin_id,
        'proof_reviewed_by_name': admin_name,
    }



# ─── Bitcoin Outputs Verification ───
_btc_outputs_cache = {'data': None, 'ts': 0}

@router.get("/bitcoin/outputs")
async def get_bitcoin_outputs():
    """Fetch recent large Bitcoin outputs for transaction verification"""
    import time as _time
    now = _time.time()
    # Cache for 2 minutes
    if _btc_outputs_cache['data'] and (now - _btc_outputs_cache['ts']) < 120:
        return _btc_outputs_cache['data']

    outputs = []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Get BTC price
            price_resp = await client.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
            btc_price = 72000  # fallback
            if price_resp.status_code == 200:
                btc_price = price_resp.json().get('bitcoin', {}).get('usd', 72000)

            # Get latest block hash
            latest_resp = await client.get('https://blockchain.info/latestblock', headers={'User-Agent': 'Mozilla/5.0'})
            if latest_resp.status_code != 200:
                raise Exception('Failed to get latest block')
            latest = latest_resp.json()
            block_hash = latest['hash']
            block_height = latest['height']

            # Fetch last 2 blocks for more data
            for offset in range(2):
                bh = block_hash if offset == 0 else None
                if offset > 0:
                    prev_resp = await client.get(f'https://blockchain.info/rawblock/{block_hash}', headers={'User-Agent': 'Mozilla/5.0'})
                    if prev_resp.status_code == 200:
                        bh = prev_resp.json().get('prev_block')
                    else:
                        break
                if not bh:
                    break

                block_resp = await client.get(f'https://blockchain.info/rawblock/{bh}', headers={'User-Agent': 'Mozilla/5.0'})
                if block_resp.status_code != 200:
                    break
                block_data = block_resp.json()
                block_time = block_data.get('time', 0)
                block_hash = block_data.get('prev_block', '')

                for tx in block_data.get('tx', []):
                    for out_idx, out in enumerate(tx.get('out', [])):
                        value_btc = out.get('value', 0) / 1e8
                        value_usd = value_btc * btc_price
                        # Filter: $40,000 - $110,000 USD range
                        if 40000 <= value_usd <= 110000:
                            outputs.append({
                                'block_id': block_data.get('height', block_height - offset),
                                'transaction_hash': tx.get('hash', ''),
                                'index': out_idx,
                                'time': datetime.fromtimestamp(block_time, tz=timezone.utc).isoformat(),
                                'value_btc': round(value_btc, 8),
                                'value_usd': round(value_usd, 2),
                                'recipient': out.get('addr', 'Unknown'),
                                'is_spent': out.get('spent', False),
                                'script_hex': out.get('script', '')[:40] + '...' if out.get('script') else '',
                            })

                        if len(outputs) >= 50:
                            break
                    if len(outputs) >= 50:
                        break
                if len(outputs) >= 50:
                    break

        # Sort by time desc
        outputs.sort(key=lambda x: x['time'], reverse=True)
        result = {
            'outputs': outputs[:50],
            'btc_price': btc_price,
            'block_height': block_height,
            'total_found': len(outputs),
            'filter': {'min_usd': 40000, 'max_usd': 110000},
            'source': 'blockchain.info',
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        _btc_outputs_cache['data'] = result
        _btc_outputs_cache['ts'] = now
        return result

    except Exception as e:
        logging.error(f"Bitcoin outputs fetch error: {e}")
        if _btc_outputs_cache['data']:
            return _btc_outputs_cache['data']
        return {
            'outputs': [],
            'btc_price': 0,
            'block_height': 0,
            'total_found': 0,
            'filter': {'min_usd': 40000, 'max_usd': 110000},
            'source': 'blockchain.info',
            'error': str(e),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }



@router.post("/chatbot/message")
async def chatbot_message(data: ChatMessage):
    """Process chatbot message and return FAQ response"""
    message = data.message.lower()
    
    best_match = None
    best_score = 0
    
    for faq in CHATBOT_FAQ.values():
        score = sum(len(kw) for kw in faq['keywords'] if kw in message)
        if score > best_score:
            best_score = score
            best_match = faq
    
    if best_match and best_score > 0:
        return {'response': best_match['answer'], 'matched': True}
    
    return {
        'response': 'No encontré una respuesta exacta. Intente con palabras clave como: retiro, impuesto, verificación, tiempo, soporte. O cree un ticket de soporte para atención personalizada.',
        'matched': False
    }


# ─── Feedback System ───

@router.post("/feedback")
async def submit_feedback(data: FeedbackSubmission, current_user: dict = Depends(get_current_user)):
    """Submit user feedback (rating + comment)"""
    feedback = {
        'id': str(uuid.uuid4()),
        'user_id': current_user['id'],
        'user_email': current_user['email'],
        'user_name': current_user.get('name', ''),
        'rating': data.rating,
        'comment': data.comment,
        'category': data.category or 'general',
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.feedback.insert_one(feedback)

    # Notify admins of new feedback
    stars = data.rating * '\u2605' + (5 - data.rating) * '\u2606'
    await notify_admins('Nuevo Feedback',
        f'{current_user.get("name", current_user["email"])} dejo feedback: {stars} ({data.rating}/5)')

    return {'message': 'Feedback enviado correctamente', 'id': feedback['id']}


@router.get("/feedback/mine")
async def get_my_feedback(current_user: dict = Depends(get_current_user)):
    """Get current user's feedback history"""
    feedbacks = await db.feedback.find(
        {'user_id': current_user['id']}, {'_id': 0}
    ).sort('created_at', -1).to_list(50)
    return feedbacks


@router.get("/admin/feedback")
async def get_all_feedback(admin: dict = Depends(get_admin_user)):
    """Get all feedback for admin dashboard"""
    feedbacks = await db.feedback.find({}, {'_id': 0}).sort('created_at', -1).to_list(200)

    # Stats
    total = len(feedbacks)
    if total > 0:
        avg_rating = sum(f['rating'] for f in feedbacks) / total
        distribution = {i: sum(1 for f in feedbacks if f['rating'] == i) for i in range(1, 6)}
    else:
        avg_rating = 0
        distribution = {i: 0 for i in range(1, 6)}

    return {
        'feedbacks': feedbacks,
        'stats': {
            'total': total,
            'average_rating': round(avg_rating, 1),
            'distribution': distribution
        }
    }


# ==================== CLIENT ERROR CAPTURE (anon) ====================

from pydantic import BaseModel as _CEBaseModel
from fastapi import Request as _CEReq


class ClientErrorPayload(_CEBaseModel):
    message: str
    stack: str | None = None
    url: str | None = None
    user_agent: str | None = None
    component: str | None = None
    severity: str | None = 'error'


@router.post('/client-errors')
async def report_client_error(payload: ClientErrorPayload, request: _CEReq):
    """Receives frontend errors (no auth required — fire-and-forget from browser).
    Used for Sentry-lite style monitoring. Rate-limited via length caps.
    """
    try:
        ip = request.headers.get('x-forwarded-for', '').split(',')[0].strip() or (
            request.client.host if request.client else None
        )
        doc = {
            'id': str(uuid.uuid4()),
            'message': (payload.message or '')[:1000],
            'stack': (payload.stack or '')[:3000],
            'url': (payload.url or '')[:500],
            'user_agent': (payload.user_agent or '')[:300],
            'component': (payload.component or '')[:120],
            'severity': payload.severity if payload.severity in ('error', 'warning', 'info') else 'error',
            'ip': ip,
            'created_at': datetime.now(timezone.utc).isoformat(),
        }
        await db.client_errors.insert_one(doc)
        return {'status': 'logged'}
    except Exception as exc:
        logging.warning(f'[client-errors] insert failed: {exc}')
        return {'status': 'failed_silently'}


# Include the router in the main app
# register_routes(api_router)  # Disabled: modularization in progress
