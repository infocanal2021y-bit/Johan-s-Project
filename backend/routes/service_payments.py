"""Pagos de servicios autorizados vía Stripe (checkout seguro + webhook firmado).

Precios definidos SOLO en el servidor (lookup_key). No toca usuarios, saldos ni retiros.
"""
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel, Field

from config import db
from services.auth import get_current_user, get_admin_user

router = APIRouter()
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
TAX_MODE = "full"  # España (SMP soportado) — fallback automático a calc_only si ineligible


def _now():
    return datetime.now(timezone.utc).isoformat()


def _fmt_amount(cents: int, cur: str) -> str:
    sym = '€' if cur == 'eur' else '$'
    i, d = divmod(int(cents or 0), 100)
    return f"{sym}{format(i, ',').replace(',', '.')},{d:02d}"


async def _list_catalog() -> list:
    out = []
    for p in stripe.Price.list(active=True, limit=100, expand=['data.product']).auto_paging_iter():
        prod = p.product
        if not getattr(prod, 'metadata', {}).get('managed_by') == 'emergent':
            continue
        out.append({'lookup_key': p.lookup_key, 'name': prod.name, 'currency': p.currency,
                    'amount': p.unit_amount, 'amount_label': _fmt_amount(p.unit_amount, p.currency),
                    'product_id': prod.metadata.get('emergent_product_id')})
    out.sort(key=lambda x: (x['product_id'] or '', x['currency']))
    return out


@router.get('/service-payments/catalog')
async def catalog(user: dict = Depends(get_current_user)):
    return {'services': await _list_catalog()}


class CheckoutBody(BaseModel):
    lookup_key: str
    origin_url: str
    quantity: int = Field(1, ge=1, le=10)


@router.post('/service-payments/checkout')
async def create_checkout(body: CheckoutBody, user: dict = Depends(get_current_user)):
    prices = stripe.Price.list(lookup_keys=[body.lookup_key], active=True, limit=1,
                               expand=['data.product']).data
    if not prices:
        raise HTTPException(400, 'Servicio no disponible.')
    price = prices[0]
    kwargs = dict(
        line_items=[{'price': price.id, 'quantity': body.quantity}],
        mode='payment',
        success_url=f"{body.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{body.origin_url}/payment/cancel",
        metadata={'user_id': user['id'], 'lookup_key': body.lookup_key},
    )
    try:
        if TAX_MODE == 'full':
            try:
                session = stripe.checkout.Session.create(**kwargs, managed_payments={'enabled': True})
            except stripe.error.InvalidRequestError as e:
                msg = (e.user_message or '').lower()
                if 'managed payments' in msg or 'ineligible' in msg:
                    session = stripe.checkout.Session.create(
                        **kwargs, automatic_tax={'enabled': True}, billing_address_collection='required')
                else:
                    raise
        else:
            session = stripe.checkout.Session.create(**kwargs)
    except stripe.error.StripeError as e:
        logging.error(f'stripe checkout error: {e}')
        raise HTTPException(502, 'No se pudo iniciar el pago. Inténtelo de nuevo.')
    await db.payment_transactions.insert_one({
        'session_id': session.id, 'user_id': user['id'], 'user_name': user.get('name'),
        'user_email': user.get('email'), 'lookup_key': body.lookup_key,
        'service_name': price.product.name if hasattr(price, 'product') else body.lookup_key,
        'amount': (price.unit_amount or 0) * body.quantity, 'currency': price.currency,
        'status': 'initiated', 'payment_status': 'pending', 'receipt_sent': False,
        'created_at': _now(), 'updated_at': _now(),
    })
    return {'checkout_url': session.url, 'session_id': session.id}


async def _mark_paid(session_id: str, extra: Optional[dict] = None):
    res = await db.payment_transactions.update_one(
        {'session_id': session_id, 'payment_status': {'$ne': 'paid'}},
        {'$set': {'status': 'completed', 'payment_status': 'paid', 'updated_at': _now(),
                  **(extra or {})}})
    if res.modified_count == 0:
        return
    tx = await db.payment_transactions.find_one({'session_id': session_id}, {'_id': 0})
    if not tx or tx.get('receipt_sent'):
        return
    await db.payment_transactions.update_one({'session_id': session_id}, {'$set': {'receipt_sent': True}})
    try:
        from services.notifications import create_notification, create_admin_notification
        await create_notification(tx['user_id'], 'Pago confirmado',
                                  f"Su pago de {_fmt_amount(tx['amount'], tx['currency'])} "
                                  f"({tx.get('service_name')}) fue confirmado. Gracias.",
                                  {'type': 'service_payment', 'session_id': session_id})
        await create_admin_notification(
            notification_type='tax_payment', title='Pago de servicio recibido (Stripe)',
            message=f"{tx.get('user_name')} pagó {_fmt_amount(tx['amount'], tx['currency'])} — {tx.get('service_name')}.",
            user_info={'name': tx.get('user_name'), 'email': tx.get('user_email')},
            metadata={'session_id': session_id})
        if tx.get('user_email'):
            import asyncio
            from services.email import send_email, get_email_template
            content = f"""
                <p style="color:#e2e8f0;font-size:16px;">Hola <strong style="color:#f59e0b;">{tx.get('user_name') or ''}</strong>,</p>
                <p style="color:#e2e8f0;font-size:15px;line-height:1.6;">Hemos recibido su pago correctamente. Este es su recibo:</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;border-radius:12px;margin:20px 0;">
                    <tr><td style="padding:22px;">
                        <p style="color:#f59e0b;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px 0;font-weight:bold;">✅ Recibo de pago</p>
                        <table width="100%" cellpadding="0" cellspacing="0">
                            <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Servicio</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;font-weight:bold;">{tx.get('service_name')}</td></tr>
                            <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Importe</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;font-weight:bold;">{_fmt_amount(tx['amount'], tx['currency'])}</td></tr>
                            <tr><td style="color:#94a3b8;padding:8px 0;">Referencia</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;font-family:monospace;font-size:11px;">{session_id[:28]}…</td></tr>
                        </table>
                    </td></tr>
                </table>
                <p style="color:#94a3b8;font-size:12px;">Pago procesado de forma segura por Stripe.</p>
            """
            asyncio.create_task(send_email(tx['user_email'], '✅ Recibo de pago · LIONSBIT',
                                           get_email_template(content, 'Recibo de pago')))
    except Exception as e:
        logging.warning(f'service payment receipt failed: {e}')


@router.get('/payments/status/{session_id}')
async def payment_status(session_id: str):
    rec = await db.payment_transactions.find_one({'session_id': session_id}, {'_id': 0})
    if not rec:
        raise HTTPException(404, 'Transaction not found')
    if rec.get('payment_status') != 'paid':
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == 'paid' or s.status == 'complete':
                await _mark_paid(session_id, {'stripe_payment_intent_id': s.payment_intent})
                rec = await db.payment_transactions.find_one({'session_id': session_id}, {'_id': 0})
        except stripe.error.StripeError:
            pass
    return {'session_id': rec['session_id'], 'status': rec['status'],
            'payment_status': rec['payment_status']}


@router.post('/stripe/webhook')
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get('stripe-signature', '')
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except (stripe.error.SignatureVerificationError, ValueError):
        raise HTTPException(400, 'Invalid signature')
    obj, t = event['data']['object'], event['type']
    if t == 'checkout.session.completed':
        await _mark_paid(obj['id'], {'stripe_payment_intent_id': obj.get('payment_intent')})
    elif t == 'checkout.session.async_payment_succeeded':
        await _mark_paid(obj['id'])
    elif t == 'checkout.session.async_payment_failed':
        await db.payment_transactions.update_one({'session_id': obj['id']},
            {'$set': {'status': 'failed', 'payment_status': 'failed', 'updated_at': _now()}})
    elif t == 'checkout.session.expired':
        await db.payment_transactions.update_one({'session_id': obj['id']},
            {'$set': {'status': 'expired', 'payment_status': 'expired', 'updated_at': _now()}})
    elif t == 'charge.refunded':
        await db.payment_transactions.update_one(
            {'stripe_payment_intent_id': obj.get('payment_intent')},
            {'$set': {'status': 'refunded', 'payment_status': 'refunded', 'updated_at': _now()}})
    return {'status': 'ok'}


# ══════════════ Admin ══════════════

@router.get('/admin/service-payments')
async def admin_payments(status: Optional[str] = Query(None), admin: dict = Depends(get_admin_user)):
    q = {'payment_status': status} if status else {}
    rows = await db.payment_transactions.find(q, {'_id': 0}).sort('created_at', -1).to_list(200)
    counts = {}
    for s in ('pending', 'paid', 'failed', 'expired', 'refunded'):
        counts[s] = await db.payment_transactions.count_documents({'payment_status': s})
    total_paid_eur = 0
    async for r in db.payment_transactions.find({'payment_status': 'paid', 'currency': 'eur'}, {'_id': 0, 'amount': 1}):
        total_paid_eur += r.get('amount', 0)
    return {'transactions': rows, 'counts': counts, 'total_paid_eur_cents': total_paid_eur,
            'catalog': await _list_catalog()}


class NewServiceBody(BaseModel):
    name: str
    lookup_key: str
    amount_cents: int = Field(gt=0, le=10000000)
    currency: str = Field(pattern='^(eur|usd)$')


@router.post('/admin/service-payments/catalog')
async def admin_add_service(body: NewServiceBody, admin: dict = Depends(get_admin_user)):
    if stripe.Price.list(lookup_keys=[body.lookup_key], active=True, limit=1).data:
        raise HTTPException(409, 'Ya existe un servicio con ese lookup_key.')
    product = stripe.Product.create(name=body.name.strip(), tax_code='txcd_10000000',
                                    metadata={'managed_by': 'emergent',
                                              'emergent_product_id': body.lookup_key})
    stripe.Price.create(product=product.id, unit_amount=body.amount_cents, currency=body.currency,
                        lookup_key=body.lookup_key, transfer_lookup_key=True)
    return {'ok': True}


@router.post('/admin/service-payments/{session_id}/refund')
async def admin_refund(session_id: str, admin: dict = Depends(get_admin_user)):
    tx = await db.payment_transactions.find_one({'session_id': session_id}, {'_id': 0})
    if not tx or tx.get('payment_status') != 'paid' or not tx.get('stripe_payment_intent_id'):
        raise HTTPException(400, 'Solo se pueden reembolsar pagos completados.')
    stripe.Refund.create(payment_intent=tx['stripe_payment_intent_id'])
    return {'ok': True, 'message': 'Reembolso solicitado; el estado se sincronizará vía webhook.'}
