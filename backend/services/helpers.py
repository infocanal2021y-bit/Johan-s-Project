"""Shared helper functions for LIONSBIT VERIFICACION"""
import logging
import httpx
from datetime import datetime, timezone, timedelta
from config import db, EXCHANGE_RATES, FRAUD_THRESHOLD_AMOUNT, FRAUD_THRESHOLD_COUNT, FRAUD_THRESHOLD_MINUTES, GOVERNMENT_TREASURY_ID

PROCESSING_ALERT = 'Operación pendiente. Existen requisitos necesarios antes de autorizar el procesamiento del retiro.'


def _req_items_result(items: list) -> dict:
    all_met = all(i['done'] for i in items)
    return {'items': items, 'all_met': all_met, 'alert': None if all_met else PROCESSING_ALERT}


async def compute_withdrawal_requirements(tx: dict) -> dict:
    """Pre-processing requirements checklist for a FULL withdrawal (transactions collection)."""
    user = await db.users.find_one({'id': tx['user_id']}, {'_id': 0, 'verification_status': 1, 'kyc_documents': 1})
    user = user or {}
    required = float(tx.get('tax_required') or 4850)
    tax_paid = float(tx.get('tax_paid') or 0)
    auth_done = tx.get('authorization_status') == 'completed'
    past_abono = tx.get('status') in ('pending', 'processing', 'transfer_in_progress', 'completed')

    payment = await db.crypto_payments.find_one(
        {'transaction_id': tx['id']}, {'_id': 0, 'status': 1}, sort=[('submitted_at', -1)])
    intent = await db.crypto_payment_intents.find_one(
        {'context': f"withdrawal:{tx['id']}"}, {'_id': 0, 'status': 1, 'txid': 1, 'declared_txid': 1},
        sort=[('created_at', -1)])

    banking = tx.get('banking_info') or {}
    identity_ok = user.get('verification_status') == 'verified'
    docs_ok = identity_ok or bool(user.get('kyc_documents'))
    bank_ok = bool(banking.get('iban') or banking.get('account_number'))
    proof_ok = bool(payment) or bool(intent and (intent.get('txid') or intent.get('declared_txid'))) or tax_paid > 0
    validated_ok = auth_done or past_abono or tax_paid >= required or \
        (payment or {}).get('status') == 'approved' or (intent or {}).get('status') == 'confirmed'
    review_ok = auth_done or past_abono

    items = [
        {'key': 'identity', 'label': 'Identidad verificada', 'done': identity_ok},
        {'key': 'bank', 'label': 'Cuenta bancaria verificada', 'done': bank_ok},
        {'key': 'docs', 'label': 'Documentación completa', 'done': docs_ok},
        {'key': 'required_amount', 'label': f"Importe requerido por la plataforma: €{required:,.0f}".replace(',', '.'), 'done': validated_ok},
        {'key': 'proof', 'label': 'Comprobante recibido', 'done': proof_ok},
        {'key': 'validated', 'label': 'Importe validado', 'done': validated_ok},
        {'key': 'admin_review', 'label': 'Revisión administrativa completada', 'done': review_ok},
    ]
    return _req_items_result(items)


async def compute_bank_withdrawal_requirements(rec: dict) -> dict:
    """Pre-processing requirements checklist for a BANK withdrawal (bank_withdrawal_requests)."""
    user = await db.users.find_one({'id': rec['user_id']}, {'_id': 0, 'verification_status': 1, 'kyc_documents': 1})
    user = user or {}
    auth_done = rec.get('authorization_status') == 'completed'
    past_abono = rec.get('status') in ('compliance_review', 'transfer_in_progress', 'completed')

    intent = await db.crypto_payment_intents.find_one(
        {'context': f"bankwithdrawal:{rec.get('reference')}"},
        {'_id': 0, 'status': 1, 'txid': 1, 'declared_txid': 1}, sort=[('created_at', -1)])

    identity_ok = user.get('verification_status') == 'verified'
    docs_ok = identity_ok or bool(user.get('kyc_documents'))
    bank_ok = bool(rec.get('bank_account') and rec.get('bank_name'))
    proof_ok = bool(intent and (intent.get('txid') or intent.get('declared_txid')))
    validated_ok = auth_done or past_abono or (intent or {}).get('status') == 'confirmed'
    review_ok = auth_done or past_abono

    items = [
        {'key': 'identity', 'label': 'Identidad verificada', 'done': identity_ok},
        {'key': 'bank', 'label': 'Cuenta bancaria verificada', 'done': bank_ok},
        {'key': 'docs', 'label': 'Documentación completa', 'done': docs_ok},
        {'key': 'required_amount', 'label': 'Importe requerido por la plataforma: €4.850', 'done': validated_ok},
        {'key': 'proof', 'label': 'Comprobante recibido', 'done': proof_ok},
        {'key': 'validated', 'label': 'Importe validado', 'done': validated_ok},
        {'key': 'admin_review', 'label': 'Revisión administrativa completada', 'done': review_ok},
    ]
    return _req_items_result(items)


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

