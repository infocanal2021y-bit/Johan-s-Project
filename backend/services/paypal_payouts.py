"""PayPal Payouts API (httpx). Credenciales en .env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE (sandbox|live), PAYPAL_WEBHOOK_ID."""
import os
import logging
import time
from typing import Optional

import httpx

log = logging.getLogger(__name__)

BASE_URLS = {'sandbox': 'https://api-m.sandbox.paypal.com', 'live': 'https://api-m.paypal.com'}
# Estados de ítem PayPal → acción interna
ITEM_SUCCESS = {'SUCCESS'}
ITEM_FAILED = {'FAILED', 'RETURNED', 'BLOCKED', 'REFUNDED', 'REVERSED', 'DENIED', 'CANCELED'}
ITEM_PENDING = {'PENDING', 'UNCLAIMED', 'ONHOLD', 'NEW'}
_token_cache = {'token': None, 'exp': 0.0}


def settings() -> dict:
    mode = (os.environ.get('PAYPAL_MODE') or 'sandbox').lower()
    cid, sec = os.environ.get('PAYPAL_CLIENT_ID', '').strip(), os.environ.get('PAYPAL_CLIENT_SECRET', '').strip()
    return {'mode': mode if mode in BASE_URLS else 'sandbox', 'configured': bool(cid and sec),
            'client_id': cid, 'secret': sec, 'webhook_id': os.environ.get('PAYPAL_WEBHOOK_ID', '').strip(),
            'base_url': os.environ.get('PAYPAL_API_BASE') or BASE_URLS.get(mode, BASE_URLS['sandbox'])}


class PayPalError(Exception):
    def __init__(self, message: str, name: str = None, status: int = None, details=None):
        super().__init__(message)
        self.name, self.status, self.details = name, status, details


def _raise(resp: httpx.Response):
    try:
        body = resp.json()
    except Exception:
        body = {'message': resp.text[:300]}
    details = body.get('details') or []
    msg = body.get('message') or body.get('error_description') or f'PayPal HTTP {resp.status_code}'
    if details:
        msg += ' · ' + '; '.join(f"{d.get('issue') or d.get('field') or ''} {d.get('description') or ''}".strip() for d in details[:3])
    raise PayPalError(msg, name=body.get('name') or body.get('error'), status=resp.status_code, details=details)


async def get_token(client: httpx.AsyncClient, s: dict) -> str:
    if _token_cache['token'] and time.time() < _token_cache['exp'] - 60:
        return _token_cache['token']
    r = await client.post(f"{s['base_url']}/v1/oauth2/token", data={'grant_type': 'client_credentials'},
                          auth=(s['client_id'], s['secret']), headers={'Accept': 'application/json'})
    if r.status_code >= 400:
        _raise(r)
    data = r.json()
    _token_cache.update(token=data['access_token'], exp=time.time() + int(data.get('expires_in', 3000)))
    return data['access_token']


async def create_payout(*, reference: str, receiver_email: str, amount: float, currency: str, note: str, request_id: str) -> dict:
    """Envía un payout de un solo ítem. `request_id` se usa como PayPal-Request-Id (idempotencia)."""
    s = settings()
    if not s['configured']:
        raise PayPalError('PayPal Payouts no está configurado (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)', name='NOT_CONFIGURED')
    body = {
        'sender_batch_header': {'sender_batch_id': reference, 'recipient_type': 'EMAIL',
                                'email_subject': 'Has recibido un pago de LIONSBIT',
                                'email_message': note},
        'items': [{'recipient_type': 'EMAIL', 'receiver': receiver_email, 'sender_item_id': reference,
                   'note': note, 'amount': {'value': f"{amount:.2f}", 'currency': currency.upper()}}],
    }
    async with httpx.AsyncClient(timeout=30) as client:
        token = await get_token(client, s)
        r = await client.post(f"{s['base_url']}/v1/payments/payouts", json=body,
                              headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json',
                                       'PayPal-Request-Id': request_id})
        if r.status_code >= 400:
            _raise(r)
        data = r.json()
    hdr = data.get('batch_header') or {}
    return {'payout_batch_id': hdr.get('payout_batch_id'), 'batch_status': hdr.get('batch_status'), 'raw': data}


async def get_batch(payout_batch_id: str) -> dict:
    """Estado del batch y de su (único) ítem."""
    s = settings()
    if not s['configured']:
        raise PayPalError('PayPal Payouts no está configurado', name='NOT_CONFIGURED')
    async with httpx.AsyncClient(timeout=30) as client:
        token = await get_token(client, s)
        r = await client.get(f"{s['base_url']}/v1/payments/payouts/{payout_batch_id}",
                             headers={'Authorization': f'Bearer {token}'})
        if r.status_code >= 400:
            _raise(r)
        data = r.json()
    hdr = data.get('batch_header') or {}
    items = data.get('items') or []
    item = items[0] if items else {}
    err = item.get('errors') or {}
    return {
        'batch_status': hdr.get('batch_status'),
        'item_status': item.get('transaction_status'),
        'payout_item_id': item.get('payout_item_id'),
        'transaction_id': item.get('transaction_id'),
        'fee': (item.get('payout_item_fee') or {}).get('value'),
        'error': (err.get('message') or '') + ((' · ' + err.get('name')) if err.get('name') else ''),
        'time_processed': item.get('time_processed'),
        'raw': data,
    }


async def verify_webhook(headers: dict, body: dict) -> bool:
    """Verifica la firma con /v1/notifications/verify-webhook-signature. Sin PAYPAL_WEBHOOK_ID devuelve False."""
    s = settings()
    if not s['configured'] or not s['webhook_id']:
        return False
    h = {k.lower(): v for k, v in headers.items()}
    payload = {
        'auth_algo': h.get('paypal-auth-algo'), 'cert_url': h.get('paypal-cert-url'),
        'transmission_id': h.get('paypal-transmission-id'), 'transmission_sig': h.get('paypal-transmission-sig'),
        'transmission_time': h.get('paypal-transmission-time'), 'webhook_id': s['webhook_id'], 'webhook_event': body,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        token = await get_token(client, s)
        r = await client.post(f"{s['base_url']}/v1/notifications/verify-webhook-signature", json=payload,
                              headers={'Authorization': f'Bearer {token}'})
        if r.status_code >= 400:
            log.warning('PayPal webhook verify failed: %s', r.text[:200])
            return False
        return (r.json().get('verification_status') == 'SUCCESS')


def classify(item_status: Optional[str], batch_status: Optional[str]) -> str:
    """'success' | 'failed' | 'pending'."""
    st = (item_status or '').upper()
    if st in ITEM_SUCCESS:
        return 'success'
    if st in ITEM_FAILED or (batch_status or '').upper() in ('DENIED', 'CANCELED'):
        return 'failed'
    return 'pending'
