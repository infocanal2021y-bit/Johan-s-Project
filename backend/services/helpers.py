"""Shared helper functions for LIONSBIT VERIFICACION"""
import logging
import httpx
from datetime import datetime, timezone, timedelta
from config import db, FRAUD_THRESHOLD_AMOUNT, FRAUD_THRESHOLD_COUNT, FRAUD_THRESHOLD_MINUTES, GOVERNMENT_TREASURY_ID

# ==================== IP GEOLOCATION ====================
_geo_cache = {}

async def get_ip_location(ip_address: str) -> dict:
    """Get city/country from IP address using ip-api.com (free, no key needed)"""
    if not ip_address or ip_address in ('Unknown', '127.0.0.1', 'localhost'):
        return {'city': 'Desconocido', 'country': 'Desconocido', 'countryCode': '--'}
    
    # Check cache
    if ip_address in _geo_cache:
        return _geo_cache[ip_address]
    
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"http://ip-api.com/json/{ip_address}?fields=status,country,countryCode,city,query")
            if resp.status_code == 200:
                data = resp.json()
                if data.get('status') == 'success':
                    result = {
                        'city': data.get('city', 'Desconocido'),
                        'country': data.get('country', 'Desconocido'),
                        'countryCode': data.get('countryCode', '--')
                    }
                    _geo_cache[ip_address] = result
                    return result
    except Exception as e:
        logging.warning(f"Geolocation failed for {ip_address}: {e}")
    
    return {'city': 'Desconocido', 'country': 'Desconocido', 'countryCode': '--'}


async def get_daily_transfer_total(user_id: str) -> float:
    """Get total EUR transfers for today"""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    transfers = await db.transactions.find({
        'user_id': user_id,
        'transaction_type': 'transfer',
        'created_at': {'$gte': today_start.isoformat()}
    }, {'_id': 0, 'amount': 1, 'currency': 1}).to_list(1000)
    
    total_eur = 0
    for tx in transfers:
        amount = tx.get('amount', 0)
        currency = tx.get('currency', 'USD')
        if currency == 'USD':
            total_eur += amount * EXCHANGE_RATES['EUR']
        else:
            total_eur += amount
    
    return total_eur


async def check_fraud_pattern(user_id: str, amount: float) -> bool:
    """Check if user has suspicious transfer pattern"""
    five_minutes_ago = (datetime.now(timezone.utc) - timedelta(minutes=FRAUD_THRESHOLD_MINUTES)).isoformat()
    
    count = await db.transactions.count_documents({
        'user_id': user_id,
        'transaction_type': 'transfer',
        'amount': {'$gt': FRAUD_THRESHOLD_AMOUNT},
        'created_at': {'$gte': five_minutes_ago}
    })
    
    # Including current transfer
    if count >= FRAUD_THRESHOLD_COUNT - 1 and amount > FRAUD_THRESHOLD_AMOUNT:
        return True
    return False


async def ensure_government_treasury():
    """Ensure Government Treasury account exists"""
    treasury = await db.accounts.find_one({'id': GOVERNMENT_TREASURY_ID}, {'_id': 0})
    if not treasury:
        treasury = {
            'id': GOVERNMENT_TREASURY_ID,
            'user_id': 'SYSTEM',
            'account_type': 'government_treasury',
            'name': 'Government Treasury',
            'balance_usd': 0.0,
            'balance_eur': 0.0,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        await db.accounts.insert_one(treasury)
    return treasury

