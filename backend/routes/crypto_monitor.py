"""Monitor de pagos cripto — detección automática en blockchain (BTC vía mempool.space, USDT TRC20 vía TronGrid)."""
import uuid
import logging
import asyncio
import httpx
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from config import db, CRYPTO_WALLETS
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification
from services.email import send_crypto_payment_status_email

router = APIRouter()

COINS = {
    'BTC': {'enabled': True, 'required_conf': 2, 'explorer': 'https://mempool.space/tx/'},
    'BTC_LEGACY': {'enabled': True, 'required_conf': 2, 'explorer': 'https://mempool.space/tx/'},
    'USDT': {'enabled': True, 'required_conf': 19, 'explorer': 'https://tronscan.org/#/transaction/'},
    'ETH': {'enabled': False, 'required_conf': 12, 'explorer': 'https://etherscan.io/tx/'},
    'BNB': {'enabled': False, 'required_conf': 12, 'explorer': 'https://bscscan.com/tx/'},
}
AMOUNT_TOLERANCE = 0.01
INTENT_TTL_HOURS = 24
ACTIVE_STATUSES = ['waiting', 'detected', 'confirming']

STATUS_LABELS = {
    'waiting': 'Esperando pago',
    'detected': 'Pago detectado',
    'confirming': 'Confirmando',
    'confirmed': 'Confirmado',
    'incident': 'Incidencia',
    'expired': 'Expirado',
    'cancelled': 'Cancelado',
    'rejected': 'Rechazado',
}


def _now():
    return datetime.now(timezone.utc)


def _tl(status, note=None):
    return {'at': _now().isoformat(), 'status': status, 'note': note}


# ─── Public config ───

@router.get("/crypto-monitor/config")
async def get_monitor_config(user: dict = Depends(get_current_user)):
    coins = []
    for key, w in CRYPTO_WALLETS.items():
        meta = COINS.get(key, {'enabled': False, 'required_conf': 12, 'explorer': ''})
        coins.append({
            'key': key,
            'name': w['name'],
            'network': w['network'],
            'address': w['address'] if meta['enabled'] else None,
            'enabled': meta['enabled'],
            'required_confirmations': meta['required_conf'],
            'explorer': meta['explorer'],
        })
    return {'coins': coins, 'amount_tolerance_pct': AMOUNT_TOLERANCE * 100, 'status_labels': STATUS_LABELS}


# ─── User intents ───

class IntentCreate(BaseModel):
    coin: str
    expected_amount: float
    declared_txid: Optional[str] = None
    context: Optional[str] = None


@router.post("/crypto-monitor/intents")
async def create_intent(payload: IntentCreate, user: dict = Depends(get_current_user)):
    coin = payload.coin
    if coin not in COINS or coin not in CRYPTO_WALLETS:
        raise HTTPException(status_code=400, detail='Moneda no válida')
    if not COINS[coin]['enabled']:
        raise HTTPException(status_code=400, detail='Esta red aún no está habilitada para verificación automática')
    if payload.expected_amount <= 0:
        raise HTTPException(status_code=400, detail='El monto debe ser mayor a 0')

    txid = (payload.declared_txid or '').strip() or None
    if txid:
        existing = await db.crypto_payment_intents.find_one(
            {'$or': [{'txid': txid}, {'declared_txid': txid}], 'status': {'$nin': ['cancelled', 'rejected']}}
        )
        if existing:
            raise HTTPException(status_code=409, detail='Este TXID ya está registrado en otro pago (posible duplicado)')

    now = _now()
    intent = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'user_email': user['email'],
        'user_name': user.get('name') or user['email'],
        'coin': coin,
        'coin_name': CRYPTO_WALLETS[coin]['name'],
        'network': CRYPTO_WALLETS[coin]['network'],
        'address': CRYPTO_WALLETS[coin]['address'],
        'expected_amount': payload.expected_amount,
        'declared_txid': txid,
        'context': payload.context,
        'status': 'waiting',
        'txid': None,
        'confirmations': 0,
        'required_confirmations': COINS[coin]['required_conf'],
        'detected_amount': None,
        'incident_type': None,
        'incident_note': None,
        'notified_detected': False,
        'notified_confirmed': False,
        'timeline': [_tl('waiting', 'Pago declarado por el usuario')],
        'created_at': now.isoformat(),
        'updated_at': now.isoformat(),
        'expires_at': (now + timedelta(hours=INTENT_TTL_HOURS)).isoformat(),
    }
    await db.crypto_payment_intents.insert_one({**intent})
    asyncio.create_task(check_crypto_payments())
    return {k: v for k, v in intent.items() if k != '_id'}


@router.get("/crypto-monitor/intents/my")
async def my_intents(user: dict = Depends(get_current_user)):
    intents = await db.crypto_payment_intents.find(
        {'user_id': user['id']}, {'_id': 0}
    ).sort('created_at', -1).to_list(20)
    return {'intents': intents}


@router.post("/crypto-monitor/intents/{intent_id}/cancel")
async def cancel_intent(intent_id: str, user: dict = Depends(get_current_user)):
    rec = await db.crypto_payment_intents.find_one({'id': intent_id, 'user_id': user['id']})
    if not rec:
        raise HTTPException(status_code=404, detail='Pago no encontrado')
    if rec['status'] != 'waiting':
        raise HTTPException(status_code=400, detail='Solo se pueden cancelar pagos en espera')
    await db.crypto_payment_intents.update_one({'id': intent_id}, {
        '$set': {'status': 'cancelled', 'updated_at': _now().isoformat()},
        '$push': {'timeline': _tl('cancelled', 'Cancelado por el usuario')},
    })
    return {'ok': True}


# ─── Blockchain fetchers ───

async def _fetch_btc_txs(client: httpx.AsyncClient, address: str):
    """Returns (candidates, tip_height). candidate: {txid, amount, time, confirmations}."""
    r = await client.get(f'https://mempool.space/api/address/{address}/txs')
    r.raise_for_status()
    txs = r.json()
    tip_r = await client.get('https://mempool.space/api/blocks/tip/height')
    tip = int(tip_r.text)
    out = []
    for tx in txs:
        amount = sum(v['value'] for v in tx.get('vout', []) if v.get('scriptpubkey_address') == address) / 1e8
        if amount <= 0:
            continue
        st = tx.get('status', {})
        conf = (tip - st['block_height'] + 1) if st.get('confirmed') else 0
        ts = st.get('block_time') or int(_now().timestamp())
        out.append({'txid': tx['txid'], 'amount': amount, 'time': ts, 'confirmations': conf})
    return out


async def _fetch_usdt_txs(client: httpx.AsyncClient, address: str):
    r = await client.get(
        f'https://api.trongrid.io/v1/accounts/{address}/transactions/trc20',
        params={'only_to': 'true', 'limit': 50},
    )
    r.raise_for_status()
    data = r.json().get('data', [])
    now_block = None
    out = []
    for tx in data:
        if tx.get('token_info', {}).get('symbol') != 'USDT':
            continue
        amount = int(tx['value']) / (10 ** int(tx['token_info'].get('decimals', 6)))
        txid = tx['transaction_id']
        ts = int(tx['block_timestamp'] / 1000)
        conf = 0
        try:
            if now_block is None:
                nb = await client.post('https://api.trongrid.io/wallet/getnowblock')
                now_block = nb.json()['block_header']['raw_data']['number']
            ti = await client.post('https://api.trongrid.io/wallet/gettransactioninfobyid', json={'value': txid})
            block_num = ti.json().get('blockNumber')
            if block_num:
                conf = max(0, now_block - block_num)
        except Exception:
            conf = max(0, int((_now().timestamp() - ts) / 3))
        out.append({'txid': txid, 'amount': amount, 'time': ts, 'confirmations': conf})
    return out


# ─── Core checker ───

async def _process_confirmed_intent(intent):
    """Auto-avanza el retiro asociado cuando el pago cripto se confirma."""
    ctx = intent.get('context') or ''
    if ctx.startswith('bankwithdrawal:'):
        await _advance_bank_withdrawal(intent, ctx.split(':', 1)[1])
        return
    if not ctx.startswith('withdrawal:'):
        return
    tx_id = ctx.split(':', 1)[1]
    tx = await db.transactions.find_one({'id': tx_id})
    if not tx or tx.get('transaction_type') != 'withdraw' or tx.get('status') != 'pending_tax':
        return
    now = _now().isoformat()
    ref = tx.get('transaction_reference') or tx_id[:12]
    await db.transactions.update_one({'id': tx_id}, {
        '$set': {'status': 'pending', 'tax_paid': tx.get('tax_required', 0), 'tax_completed_at': now},
        '$push': {'status_timeline': {
            'at': now, 'status': 'pending',
            'status_label': 'Impuesto completado · Pago cripto confirmado en blockchain',
            'actor_role': 'system',
        }},
    })
    try:
        await create_notification(
            intent['user_id'], 'Retiro avanzado automáticamente',
            f'Su pago cripto fue confirmado en blockchain y su retiro {ref} avanzó a: Pendiente de aprobación.',
        )
    except Exception:
        pass
    await db.admin_notifications.insert_one({
        'id': str(uuid.uuid4()),
        'type': 'withdrawal_auto_advanced',
        'user_id': intent['user_id'],
        'user_email': intent['user_email'],
        'user_name': intent['user_name'],
        'message': f'Retiro {ref} avanzado automáticamente: pago cripto confirmado ({intent["detected_amount"]} {intent["coin_name"]}, TXID {str(intent.get("txid"))[:16]}...)',
        'intent_id': intent['id'],
        'read': False,
        'created_at': now,
    })
    logging.info(f'crypto monitor: retiro {ref} auto-avanzado por pago confirmado (intent {intent["id"]})')


async def _advance_bank_withdrawal(intent, reference):
    """Avanza un retiro bancario a revisión de cumplimiento cuando su abono cripto se confirma."""
    rec = await db.bank_withdrawal_requests.find_one({'reference': reference})
    if not rec or rec.get('status') not in ('conversion_done', 'received', 'awaiting_code'):
        return
    now = _now().isoformat()
    tl = list(rec.get('status_timeline') or [])
    tl.append({'at': now, 'status': 'compliance_review', 'actor': 'system',
               'note': 'Abono verificado en blockchain · retiro autorizado a revisión de cumplimiento'})
    await db.bank_withdrawal_requests.update_one({'id': rec['id']}, {
        '$set': {'status': 'compliance_review', 'updated_at': now, 'status_timeline': tl},
    })
    try:
        await create_notification(
            intent['user_id'], 'Abono verificado · Retiro autorizado',
            f'Su abono para el retiro {reference} fue confirmado en blockchain. Su retiro avanza a revisión de cumplimiento.',
        )
    except Exception:
        pass
    await db.admin_notifications.insert_one({
        'id': str(uuid.uuid4()),
        'type': 'withdrawal_auto_advanced',
        'user_id': intent['user_id'],
        'user_email': intent['user_email'],
        'user_name': intent['user_name'],
        'message': f'Retiro bancario {reference} avanzado automáticamente: abono cripto confirmado ({intent["detected_amount"]} {intent["coin_name"]}, TXID {str(intent.get("txid"))[:16]}...)',
        'intent_id': intent['id'],
        'read': False,
        'created_at': now,
    })
    logging.info(f'crypto monitor: retiro bancario {reference} auto-avanzado (intent {intent["id"]})')


async def _notify(intent, variant, note=None):
    labels = {
        'detected': ('Pago detectado en blockchain',
                     f"Su pago de {intent['detected_amount']} {intent['coin_name']} fue detectado. TXID: {intent['txid'][:20]}... Esperando confirmaciones."),
        'confirmed': ('Pago confirmado',
                      f"Su pago de {intent['detected_amount']} {intent['coin_name']} ha sido confirmado en la blockchain ({intent['confirmations']} confirmaciones)."),
        'incident': ('Incidencia con su pago cripto',
                     note or 'Se detectó una incidencia con su pago. Nuestro equipo lo revisará.'),
        'expired': ('Pago cripto expirado',
                    'No se detectó su pago en 24h. Si ya pagó, contacte a soporte con su TXID.'),
    }
    title, msg = labels[variant]
    if variant == 'confirmed':
        try:
            await _process_confirmed_intent(intent)
        except Exception as e:
            logging.error(f'crypto monitor: auto-advance failed: {e}')
    try:
        await create_notification(intent['user_id'], title, msg)
    except Exception:
        pass
    asyncio.create_task(send_crypto_payment_status_email(
        user_email=intent['user_email'],
        user_name=intent['user_name'],
        variant=variant,
        coin_name=intent['coin_name'],
        network=intent['network'],
        amount_text=f"{intent.get('detected_amount') or intent['expected_amount']} {intent['coin_name']}",
        txid=intent.get('txid') or intent.get('declared_txid'),
        confirmations=intent.get('confirmations', 0),
        required=intent['required_confirmations'],
        note=note,
    ))


async def _flag_incident(intent, incident_type, note):
    await db.crypto_payment_intents.update_one({'id': intent['id']}, {
        '$set': {
            'status': 'incident', 'incident_type': incident_type, 'incident_note': note,
            'updated_at': _now().isoformat(),
        },
        '$push': {'timeline': _tl('incident', note)},
    })
    intent['status'] = 'incident'
    await _notify(intent, 'incident', note)
    await db.admin_notifications.insert_one({
        'id': str(uuid.uuid4()),
        'type': 'crypto_payment_incident',
        'user_id': intent['user_id'],
        'user_email': intent['user_email'],
        'user_name': intent['user_name'],
        'message': f"Incidencia ({incident_type}) en pago {intent['coin_name']}: {note}",
        'intent_id': intent['id'],
        'read': False,
        'created_at': _now().isoformat(),
    })


async def _apply_match(intent, cand):
    """Assign tx to intent, validate amount, set status by confirmations."""
    expected = intent['expected_amount']
    detected = cand['amount']
    intent['txid'] = cand['txid']
    intent['detected_amount'] = detected
    intent['confirmations'] = cand['confirmations']

    if detected < expected * (1 - AMOUNT_TOLERANCE):
        await db.crypto_payment_intents.update_one({'id': intent['id']}, {'$set': {
            'txid': cand['txid'], 'detected_amount': detected, 'confirmations': cand['confirmations'],
        }})
        await _flag_incident(
            intent, 'incomplete',
            f"Pago incompleto: se detectaron {detected} de {expected} {intent['coin_name']} esperados (TXID {cand['txid'][:16]}...)",
        )
        return

    required = intent['required_confirmations']
    if cand['confirmations'] >= required:
        new_status = 'confirmed'
    elif cand['confirmations'] > 0:
        new_status = 'confirming'
    else:
        new_status = 'detected'

    note = None
    if detected > expected * (1 + AMOUNT_TOLERANCE):
        note = f"Monto superior al declarado ({detected} vs {expected})"

    await db.crypto_payment_intents.update_one({'id': intent['id']}, {
        '$set': {
            'txid': cand['txid'], 'detected_amount': detected, 'confirmations': cand['confirmations'],
            'status': new_status, 'incident_note': note, 'updated_at': _now().isoformat(),
        },
        '$push': {'timeline': _tl(new_status, f"TXID {cand['txid'][:20]}... · {cand['confirmations']} confirmaciones")},
    })
    intent['status'] = new_status
    if not intent.get('notified_detected'):
        await db.crypto_payment_intents.update_one({'id': intent['id']}, {'$set': {'notified_detected': True}})
        await _notify(intent, 'detected')
    if new_status == 'confirmed' and not intent.get('notified_confirmed'):
        await db.crypto_payment_intents.update_one({'id': intent['id']}, {'$set': {'notified_confirmed': True}})
        await _notify(intent, 'confirmed')


async def _update_confirmations(intent, cand):
    required = intent['required_confirmations']
    conf = cand['confirmations']
    new_status = 'confirmed' if conf >= required else ('confirming' if conf > 0 else 'detected')
    changed = new_status != intent['status'] or conf != intent.get('confirmations', 0)
    if not changed:
        return
    update = {'$set': {'confirmations': conf, 'status': new_status, 'updated_at': _now().isoformat()}}
    if new_status != intent['status']:
        update['$push'] = {'timeline': _tl(new_status, f'{conf} confirmaciones')}
    await db.crypto_payment_intents.update_one({'id': intent['id']}, update)
    intent['confirmations'] = conf
    if new_status == 'confirmed' and not intent.get('notified_confirmed'):
        await db.crypto_payment_intents.update_one({'id': intent['id']}, {'$set': {'notified_confirmed': True}})
        intent['status'] = new_status
        await _notify(intent, 'confirmed')


_check_lock = asyncio.Lock()


async def check_crypto_payments():
    """Job principal: vigila la blockchain para todos los intents activos."""
    if _check_lock.locked():
        return
    async with _check_lock:
        try:
            await _run_check()
        except Exception as e:
            logging.error(f'crypto monitor check failed: {e}')


async def _run_check():
    intents = await db.crypto_payment_intents.find(
        {'status': {'$in': ACTIVE_STATUSES}}, {'_id': 0}
    ).to_list(200)
    if not intents:
        return

    now = _now()
    # Expiry
    for it in [i for i in intents if i['status'] == 'waiting']:
        if now > datetime.fromisoformat(it['expires_at']):
            await db.crypto_payment_intents.update_one({'id': it['id']}, {
                '$set': {'status': 'expired', 'updated_at': now.isoformat()},
                '$push': {'timeline': _tl('expired', 'Sin pago detectado en 24h')},
            })
            it['status'] = 'expired'
            await _notify(it, 'expired')
    intents = [i for i in intents if i['status'] in ACTIVE_STATUSES]
    if not intents:
        return

    # Fetch candidates per address (one API call per unique address)
    addresses = {}
    for it in intents:
        addresses.setdefault((it['coin'], it['address']), [])
    candidates_by_addr = {}
    async with httpx.AsyncClient(timeout=20) as client:
        for (coin, addr) in addresses:
            try:
                if coin in ('BTC', 'BTC_LEGACY'):
                    candidates_by_addr[(coin, addr)] = await _fetch_btc_txs(client, addr)
                elif coin == 'USDT':
                    candidates_by_addr[(coin, addr)] = await _fetch_usdt_txs(client, addr)
                else:
                    candidates_by_addr[(coin, addr)] = []
            except Exception as e:
                logging.warning(f'crypto monitor: fetch failed for {coin} {addr}: {e}')
                candidates_by_addr[(coin, addr)] = None

    used_txids = set()
    async for doc in db.crypto_payment_intents.find(
        {'txid': {'$ne': None}, 'status': {'$nin': ['cancelled', 'rejected']}}, {'_id': 0, 'txid': 1}
    ):
        used_txids.add(doc['txid'])

    for it in intents:
        cands = candidates_by_addr.get((it['coin'], it['address']))
        if cands is None:
            continue

        if it.get('txid'):
            cand = next((c for c in cands if c['txid'] == it['txid']), None)
            if cand:
                await _update_confirmations(it, cand)
            continue

        if it.get('declared_txid'):
            cand = next((c for c in cands if c['txid'] == it['declared_txid']), None)
            if cand:
                if cand['txid'] in used_txids:
                    await _flag_incident(
                        it, 'duplicate',
                        f"TXID duplicado: la transacción {cand['txid'][:16]}... ya está asignada a otro pago",
                    )
                else:
                    used_txids.add(cand['txid'])
                    await _apply_match(it, cand)
            continue

        created_ts = datetime.fromisoformat(it['created_at']).timestamp()
        expected = it['expected_amount']
        match = next((
            c for c in cands
            if c['txid'] not in used_txids
            and c['time'] >= created_ts - 900
            and abs(c['amount'] - expected) <= expected * AMOUNT_TOLERANCE
        ), None)
        if match:
            used_txids.add(match['txid'])
            await _apply_match(it, match)


# ─── Admin panel ───

@router.get("/admin/crypto-monitor")
async def admin_list(status_group: str = 'all', admin: dict = Depends(get_admin_user)):
    groups = {
        'pending': {'status': {'$in': ['waiting', 'detected', 'confirming']}},
        'confirmed': {'status': 'confirmed'},
        'incidents': {'status': {'$in': ['incident', 'expired', 'rejected']}},
        'all': {},
    }
    q = groups.get(status_group, {})
    intents = await db.crypto_payment_intents.find(q, {'_id': 0}).sort('created_at', -1).to_list(200)
    stats = {}
    for key, gq in groups.items():
        if key != 'all':
            stats[key] = await db.crypto_payment_intents.count_documents(gq)
    stats['total'] = await db.crypto_payment_intents.count_documents({})
    return {'intents': intents, 'stats': stats, 'status_labels': STATUS_LABELS}


class ResolvePayload(BaseModel):
    action: str
    note: Optional[str] = None


@router.post("/admin/crypto-monitor/{intent_id}/resolve")
async def admin_resolve(intent_id: str, payload: ResolvePayload, admin: dict = Depends(get_admin_user)):
    rec = await db.crypto_payment_intents.find_one({'id': intent_id}, {'_id': 0})
    if not rec:
        raise HTTPException(status_code=404, detail='Pago no encontrado')
    if payload.action not in ('confirm', 'reject'):
        raise HTTPException(status_code=400, detail='Acción no válida')
    new_status = 'confirmed' if payload.action == 'confirm' else 'rejected'
    note = payload.note or f'Resolución manual del administrador: {new_status}'
    await db.crypto_payment_intents.update_one({'id': intent_id}, {
        '$set': {'status': new_status, 'incident_note': note, 'updated_at': _now().isoformat()},
        '$push': {'timeline': _tl(new_status, note)},
    })
    rec['status'] = new_status
    if new_status == 'confirmed':
        rec['detected_amount'] = rec.get('detected_amount') or rec['expected_amount']
        rec['confirmations'] = rec.get('confirmations', 0)
        await _notify(rec, 'confirmed')
    else:
        await _notify(rec, 'incident', note)
    return {'ok': True, 'status': new_status}


@router.get("/admin/crypto-monitor/alerts")
async def admin_alerts(admin: dict = Depends(get_admin_user)):
    """Historial de avisos de pagos e incidencias cripto con hora exacta."""
    alerts = await db.admin_notifications.find(
        {'type': {'$in': ['crypto_payment_incident', 'withdrawal_auto_advanced']}},
        {'_id': 0},
    ).sort('created_at', -1).to_list(50)
    return {'alerts': alerts}


@router.post("/admin/crypto-monitor/run-check")
async def admin_run_check(admin: dict = Depends(get_admin_user)):
    await check_crypto_payments()
    return {'ok': True}
