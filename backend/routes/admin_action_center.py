"""Centro de acciones administrativas + analítica semanal de pagos cripto.

- GET /admin/action-center: acciones que requieren autorización del admin +
  notificaciones categorizadas (Requieren acción / Pendientes de revisión / Informativas).
- GET /admin/crypto-monitor/weekly: evolución semanal (EUR) de pagos cripto detectados.
"""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends

from config import db
from services.auth import get_admin_user
from services.helpers import compute_withdrawal_requirements

router = APIRouter()

# Categorización de notificaciones admin.
REQUIRES_ACTION = {
    'withdrawal_request', 'crypto_payment_incident', 'kyc_submitted', 'kyc',
    'new_iban', 'bank_account_change', 'document_uploaded', 'fiscal_document',
    'support_ticket', 'ready_for_authorization', 'ready_for_review',
}
PENDING_REVIEW = {
    'crypto_payment_under_review', 'proof_uploaded', 'withdrawal_auto_advanced',
    'partial_payment', 'user_login',
}


def _bucket(ntype: str) -> str:
    if ntype in REQUIRES_ACTION:
        return 'requires_action'
    if ntype in PENDING_REVIEW:
        return 'pending_review'
    return 'informative'


@router.get('/admin/action-center')
async def action_center(admin: dict = Depends(get_admin_user)):
    # 1) Retiros listos para autorizar (requisitos completos, sin autorizar aún).
    candidates = await db.transactions.find(
        {'transaction_type': 'withdraw',
         'status': {'$in': ['pending_tax', 'crypto_payment_under_review']},
         'authorization_status': {'$ne': 'completed'}},
        {'_id': 0},
    ).sort('created_at', -1).to_list(100)

    actions = []
    for tx in candidates:
        reqs = await compute_withdrawal_requirements(tx)
        rmap = {i['key']: i['done'] for i in reqs['items']}
        if rmap.get('proof') and rmap.get('validated'):
            actions.append({
                'type': 'authorize_withdrawal',
                'label': 'Autorizar retiro',
                'entity_id': tx['id'],
                'reference': tx.get('transaction_reference'),
                'user_email': tx.get('user_email') or '',
                'amount': tx.get('amount'),
                'currency': tx.get('currency'),
                'created_at': tx.get('created_at'),
                'link': '/admin/withdrawals',
            })

    # 2) Incidencias cripto (requieren revisión/decisión).
    incidents = await db.crypto_payment_intents.find(
        {'status': 'incident'}, {'_id': 0},
    ).sort('updated_at', -1).to_list(50)
    for it in incidents:
        actions.append({
            'type': 'review_incident',
            'label': 'Revisar incidencia cripto',
            'entity_id': it['id'],
            'reference': (it.get('txid') or it.get('declared_txid') or '')[:16],
            'user_email': it.get('user_email') or '',
            'amount': it.get('detected_amount'),
            'currency': it.get('coin'),
            'created_at': it.get('updated_at'),
            'link': '/admin/crypto-monitor',
        })

    # 3) Documentos fiscales pendientes de revisión.
    fiscal_pending = await db.fiscal_documents.find(
        {'status': 'pending_review'}, {'_id': 0, 'content_b64': 0},
    ).sort('created_at', -1).to_list(50)
    for fd in fiscal_pending:
        actions.append({
            'type': 'review_fiscal_document',
            'label': 'Revisar documento fiscal',
            'entity_id': fd['id'],
            'reference': (fd.get('name') or '')[:28],
            'user_email': fd.get('user_email') or '',
            'amount': None,
            'currency': None,
            'created_at': fd.get('created_at'),
            'link': '/admin/fiscal-documents',
        })

    # 4) TxID pendientes de validación (detectados/confirmando).
    to_validate = await db.crypto_payment_intents.find(
        {'status': {'$in': ['detected', 'confirming']}}, {'_id': 0},
    ).sort('updated_at', -1).to_list(50)
    for it in to_validate:
        actions.append({
            'type': 'validate_txid',
            'label': 'Validar TxID',
            'entity_id': it['id'],
            'reference': (it.get('txid') or it.get('declared_txid') or '')[:16],
            'user_email': it.get('user_email') or '',
            'amount': it.get('detected_amount'),
            'currency': it.get('coin'),
            'created_at': it.get('updated_at'),
            'link': '/admin/crypto-monitor',
        })

    # Notificaciones categorizadas (no leídas).
    notifs = await db.admin_notifications.find(
        {'read': {'$ne': True}}, {'_id': 0},
    ).sort('created_at', -1).to_list(300)
    buckets = {'requires_action': [], 'pending_review': [], 'informative': []}
    for n in notifs:
        buckets[_bucket(n.get('type', ''))].append(n)

    return {
        'actions': actions,
        'actions_count': len(actions),
        'notifications': {k: v[:25] for k, v in buckets.items()},
        'counts': {
            'requires_action': len(buckets['requires_action']),
            'pending_review': len(buckets['pending_review']),
            'informative': len(buckets['informative']),
        },
    }


@router.get('/admin/crypto-monitor/weekly')
async def crypto_weekly(admin: dict = Depends(get_admin_user)):
    """EUR total de pagos cripto detectados por semana (últimas 8 semanas)."""
    now = datetime.now(timezone.utc)
    # Inicio de la semana actual (lunes).
    start_current = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    weeks = []
    for i in range(7, -1, -1):
        ws = start_current - timedelta(weeks=i)
        we = ws + timedelta(weeks=1)
        weeks.append({'start': ws, 'end': we,
                      'label': ws.strftime('%d/%m'), 'eur': 0.0, 'count': 0})

    earliest = weeks[0]['start'].isoformat()
    docs = await db.crypto_payment_intents.find(
        {'txid': {'$ne': None},
         'updated_at': {'$gte': earliest},
         'status': {'$in': ['detected', 'confirming', 'confirmed', 'incident']}},
        {'_id': 0, 'eur_equivalent': 1, 'updated_at': 1},
    ).to_list(2000)

    for d in docs:
        try:
            ts = datetime.fromisoformat(d['updated_at'])
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        for w in weeks:
            if w['start'] <= ts < w['end']:
                w['eur'] += float(d.get('eur_equivalent') or 0)
                w['count'] += 1
                break

    series = [{'week': w['label'], 'eur': round(w['eur'], 2), 'count': w['count']} for w in weeks]
    return {
        'series': series,
        'total_eur': round(sum(w['eur'] for w in weeks), 2),
        'total_count': sum(w['count'] for w in weeks),
    }
