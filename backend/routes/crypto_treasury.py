"""Crypto Treasury: depósitos de usuario (BTC/USDT) + vista admin unificada de operaciones cripto."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from config import db
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification, create_admin_notification
from services.crypto_provider import NETWORKS, STATUSES, STATUS_LABELS, network_meta, get_provider

router = APIRouter()
COL = 'crypto_treasury_ops'


def _now():
    return datetime.now(timezone.utc).isoformat()


def _public(op: dict) -> dict:
    op.pop('_id', None)
    op['status_label'] = STATUS_LABELS.get(op.get('status'), op.get('status'))
    return op


# ───────────── USUARIO ─────────────
@router.get('/crypto-treasury/assets')
async def treasury_assets(user: dict = Depends(get_current_user)):
    provider = get_provider()
    assets = []
    for coin, nets in NETWORKS.items():
        networks = []
        for n in nets:
            try:
                address = await provider.get_deposit_address(user['id'], coin, n['id'])
            except NotImplementedError:
                address = None
            networks.append({**n, 'address': address, 'available': bool(address)})
        assets.append({'coin': coin, 'name': 'Bitcoin' if coin == 'BTC' else 'Tether USD', 'networks': networks})
    return {'provider': provider.name, 'assets': assets, 'statuses': STATUS_LABELS}


class DepositIn(BaseModel):
    coin: str
    network: str
    amount: float = Field(..., gt=0)
    txid: Optional[str] = Field(None, max_length=120)
    note: Optional[str] = Field(None, max_length=300)


@router.post('/crypto-treasury/deposits', status_code=201)
async def create_deposit(body: DepositIn, user: dict = Depends(get_current_user)):
    coin = body.coin.upper()
    meta = network_meta(coin, body.network)
    if not meta:
        raise HTTPException(400, 'Moneda o red no válida')
    if body.amount < meta['min_deposit']:
        raise HTTPException(400, f"Importe mínimo {meta['min_deposit']} {coin}")
    if body.txid and await db[COL].find_one({'txid': body.txid.strip()}):
        raise HTTPException(409, 'Ese TXID ya está registrado')
    try:
        address = await get_provider().get_deposit_address(user['id'], coin, body.network)
    except NotImplementedError:
        address = None
    if not address:
        raise HTTPException(503, 'Red no disponible en este momento')
    now = _now()
    op = {
        'id': str(uuid.uuid4()), 'type': 'deposit', 'user_id': user['id'], 'user_email': user.get('email'), 'user_name': user.get('name'),
        'coin': coin, 'network': body.network, 'network_label': meta['label'], 'address': address,
        'amount': round(body.amount, 8), 'txid': (body.txid or '').strip() or None, 'note': body.note,
        'status': 'pending', 'confirmations': 0, 'required_confirmations': meta['confirmations'],
        'provider': get_provider().name, 'provider_ref': None,
        'status_history': [{'status': 'pending', 'at': now, 'by': 'user'}], 'created_at': now, 'updated_at': now,
    }
    await db[COL].insert_one(op)
    await create_admin_notification(
        notification_type='crypto_deposit', title='Nuevo depósito cripto',
        message=f"{user.get('name')} ({user.get('email')}) declara un depósito de {op['amount']} {coin} vía {meta['label']}" + (f" · TXID {op['txid'][:12]}…" if op['txid'] else ''),
        user_info={'name': user.get('name'), 'email': user.get('email')},
        metadata={'operation_id': op['id'], 'link': '/admin/crypto-treasury'}, send_email_notification=False)
    await create_notification(user['id'], 'Depósito registrado',
        f"Hemos registrado tu depósito de {op['amount']} {coin} ({meta['label']}). Estado: Pendiente. Te avisaremos cuando se confirme.",
        metadata={'type': 'crypto_deposit', 'operation_id': op['id'], 'link': '/depositar-crypto'})
    return _public(op)


@router.get('/crypto-treasury/deposits')
async def my_deposits(user: dict = Depends(get_current_user)):
    items = await db[COL].find({'user_id': user['id'], 'type': 'deposit'}, {'_id': 0}).sort('created_at', -1).to_list(200)
    return {'items': [_public(i) for i in items], 'count': len(items)}


# ───────────── ADMIN ─────────────
def _map_btc_withdrawal(w: dict) -> dict:
    return {'id': w['id'], 'source': 'btc_withdrawal_requests', 'type': 'withdrawal', 'user_id': w.get('user_id'), 'user_email': w.get('user_email'),
            'user_name': w.get('user_name'), 'coin': 'BTC', 'network_label': 'Bitcoin', 'amount': w.get('amount_btc'), 'amount_eur': w.get('amount_eur'),
            'address': w.get('wallet_address') or w.get('destination_address'), 'txid': w.get('txid') or w.get('send_txid'),
            'status': w.get('status'), 'status_label': w.get('status_label') or w.get('status'), 'created_at': w.get('created_at'), 'editable': False}


def _map_crypto_payment(p: dict) -> dict:
    return {'id': p['id'], 'source': 'crypto_payments', 'type': 'movement', 'user_id': p.get('user_id'), 'user_email': p.get('user_email'),
            'user_name': p.get('user_name'), 'coin': (p.get('crypto_type') or '').upper(), 'network_label': p.get('network'), 'amount': p.get('amount_sent'),
            'address': p.get('wallet_address'), 'txid': p.get('txid'), 'status': p.get('status'), 'status_label': p.get('status'),
            'created_at': p.get('submitted_at'), 'editable': False}


@router.get('/admin/crypto-treasury/operations')
async def admin_operations(status: Optional[str] = None, coin: Optional[str] = None, type: Optional[str] = None,
                           limit: int = Query(300, le=1000), admin: dict = Depends(get_admin_user)):
    ops = [_public({**o, 'source': COL, 'editable': True}) for o in await db[COL].find({}, {'_id': 0}).sort('created_at', -1).to_list(limit)]
    btc_wd = [_map_btc_withdrawal(w) for w in await db.btc_withdrawal_requests.find({}, {'_id': 0}).sort('created_at', -1).to_list(limit)]
    pays = [_map_crypto_payment(p) for p in await db.crypto_payments.find({}, {'_id': 0, 'proof_image': 0}).sort('submitted_at', -1).to_list(limit)]
    items = ops + btc_wd + pays
    uids = {i['user_id'] for i in items if i.get('user_id') and not i.get('user_email')}
    if uids:
        users = {u['id']: u async for u in db.users.find({'id': {'$in': list(uids)}}, {'_id': 0, 'id': 1, 'email': 1, 'name': 1})}
        for i in items:
            if not i.get('user_email') and i.get('user_id') in users:
                i['user_email'] = users[i['user_id']].get('email'); i['user_name'] = users[i['user_id']].get('name')
    if status:
        items = [i for i in items if (i.get('status') or '').lower() == status.lower()]
    if coin:
        items = [i for i in items if i.get('coin') == coin.upper()]
    if type:
        items = [i for i in items if i.get('type') == type]
    items.sort(key=lambda i: i.get('created_at') or '', reverse=True)
    summary = {c: {'deposits': 0, 'withdrawals': 0, 'movements': 0, 'pending': 0} for c in ('BTC', 'USDT')}
    for i in ops + btc_wd + pays:
        s = summary.get(i.get('coin'))
        if s is None:
            continue
        s['deposits' if i['type'] == 'deposit' else 'withdrawals' if i['type'] == 'withdrawal' else 'movements'] += 1
        if (i.get('status') or '') in ('pending', 'confirming', 'pending_review', 'processing'):
            s['pending'] += 1
    return {'items': items[:limit], 'count': len(items), 'summary': summary, 'statuses': STATUS_LABELS, 'provider': get_provider().name}


class StatusIn(BaseModel):
    status: str
    note: Optional[str] = Field(None, max_length=500)
    txid: Optional[str] = Field(None, max_length=120)
    confirmations: Optional[int] = Field(None, ge=0)


@router.put('/admin/crypto-treasury/operations/{op_id}/status')
async def admin_update_status(op_id: str, body: StatusIn, admin: dict = Depends(get_admin_user)):
    if body.status not in STATUSES:
        raise HTTPException(400, 'Estado no válido')
    op = await db[COL].find_one({'id': op_id}, {'_id': 0})
    if not op:
        raise HTTPException(404, 'Operación no encontrada')
    now = _now()
    upd = {'status': body.status, 'updated_at': now, 'reviewed_by': admin.get('email'), 'admin_note': body.note}
    if body.txid:
        upd['txid'] = body.txid.strip()
    if body.confirmations is not None:
        upd['confirmations'] = body.confirmations
    await db[COL].update_one({'id': op_id}, {'$set': upd, '$push': {'status_history': {'status': body.status, 'at': now, 'by': admin.get('email'), 'note': body.note}}})
    label = STATUS_LABELS[body.status]
    await create_notification(op['user_id'], f"Depósito {label.lower()}",
        f"Tu depósito de {op['amount']} {op['coin']} ({op['network_label']}) ha pasado a estado: {label}." + (f" Nota: {body.note}" if body.note else ''),
        metadata={'type': 'crypto_deposit_status', 'operation_id': op_id, 'status': body.status, 'link': '/depositar-crypto'})
    return _public({**op, **upd})
