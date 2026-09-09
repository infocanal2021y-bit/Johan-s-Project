"""Retiros en Bitcoin (BTC) + direcciones BTC de recepción.

Flujo usuario: solicitud (monto EUR + dirección BTC validada) → abono €4,850 →
envío de comprobante → validación admin → envío BTC con TXID verificable.
La validación de dirección solo confirma el FORMATO, nunca el propietario.
"""
import hashlib
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from config import db
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification, notify_admins

router = APIRouter()

FEE_EUR = 4850.0
DEFAULT_ADDRESS = '1CzpZ62XwYA1wf72qSjffqCVCqx7PhPVbd'

BTC_STATUSES = [
    'solicitado', 'pendiente_abono', 'pendiente_validacion', 'en_revision',
    'aprobado', 'procesando', 'enviado', 'completado',
    'validacion_rechazada', 'accion_requerida', 'retiro_rechazado',
]
STATUS_LABELS = {
    'solicitado': 'Solicitado',
    'pendiente_abono': 'Pendiente de abono',
    'pendiente_validacion': 'Pendiente de validación',
    'en_revision': 'En revisión',
    'aprobado': 'Aprobado',
    'procesando': 'Procesando',
    'enviado': 'Enviado',
    'completado': 'Completado',
    'validacion_rechazada': 'Validación rechazada',
    'accion_requerida': 'Acción requerida por el usuario',
    'retiro_rechazado': 'Retiro rechazado',
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def mask_btc_address(addr: str) -> str:
    if not addr or len(addr) < 12:
        return addr or ''
    return f"{addr[:6]}…{addr[-4:]}"


# ══════════════ Validación de dirección BTC (formato, longitud, checksum) ══════════════

_B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'


def _b58decode(s: str) -> bytes:
    n = 0
    for ch in s:
        idx = _B58.find(ch)
        if idx == -1:
            raise ValueError('carácter Base58 inválido')
        n = n * 58 + idx
    data = n.to_bytes((n.bit_length() + 7) // 8, 'big')
    pad = len(s) - len(s.lstrip('1'))
    return b'\x00' * pad + data


def _validate_base58(addr: str) -> Optional[str]:
    if not (26 <= len(addr) <= 35):
        return None
    try:
        raw = _b58decode(addr)
    except ValueError:
        return None
    if len(raw) != 25:
        return None
    payload, checksum = raw[:-4], raw[-4:]
    if hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4] != checksum:
        return None
    version = payload[0]
    if version == 0x00:
        return 'legacy'      # direcciones 1...
    if version == 0x05:
        return 'p2sh'        # direcciones 3...
    return None


_BECH_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
_BECH32_CONST = 1
_BECH32M_CONST = 0x2bc830a3


def _bech32_polymod(values):
    gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
    chk = 1
    for v in values:
        b = chk >> 25
        chk = (chk & 0x1ffffff) << 5 ^ v
        for i in range(5):
            chk ^= gen[i] if ((b >> i) & 1) else 0
    return chk


def _bech32_hrp_expand(hrp):
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]


def _validate_bech32(addr: str) -> Optional[str]:
    if addr != addr.lower() and addr != addr.upper():
        return None  # mayúsculas/minúsculas mezcladas: inválido
    a = addr.lower()
    pos = a.rfind('1')
    if pos < 1 or pos + 7 > len(a) or len(a) > 90:
        return None
    hrp, data_part = a[:pos], a[pos + 1:]
    if hrp != 'bc':
        return None
    try:
        data = [_BECH_CHARSET.index(c) for c in data_part]
    except ValueError:
        return None
    if len(data) < 7:
        return None
    checksum_ok_const = _bech32_polymod(_bech32_hrp_expand(hrp) + data)
    witver = data[0]
    if witver > 16:
        return None
    # convertir payload 5→8 bits (sin checksum: últimos 6 símbolos)
    acc, bits, program = 0, 0, []
    for v in data[1:-6]:
        acc = (acc << 5) | v
        bits += 5
        if bits >= 8:
            bits -= 8
            program.append((acc >> bits) & 0xFF)
    if bits >= 5 or (bits and ((acc << (8 - bits)) & 0xFF)):
        return None
    if len(program) < 2 or len(program) > 40:
        return None
    if witver == 0:
        if checksum_ok_const != _BECH32_CONST or len(program) not in (20, 32):
            return None
        return 'segwit'      # bc1q...
    if witver == 1:
        if checksum_ok_const != _BECH32M_CONST or len(program) != 32:
            return None
        return 'taproot'     # bc1p...
    return None


TYPE_LABELS = {'legacy': 'Legacy (P2PKH)', 'p2sh': 'Script (P2SH)',
               'segwit': 'SegWit nativo (bc1q)', 'taproot': 'Taproot (bc1p)'}


def validate_btc_address(addr: str) -> dict:
    addr = (addr or '').strip()
    if not addr:
        return {'valid': False, 'reason': 'Dirección vacía'}
    if addr[0] in ('1', '3'):
        t = _validate_base58(addr)
    elif addr.lower().startswith('bc1'):
        t = _validate_bech32(addr)
    else:
        t = None
    if not t:
        return {'valid': False,
                'reason': 'La dirección no supera la validación de formato, longitud o checksum de Bitcoin.'}
    return {'valid': True, 'type': t, 'type_label': TYPE_LABELS[t], 'address': addr,
            'note': 'Validación de formato únicamente: no confirma la identidad del propietario de la billetera.'}


# ══════════════ Cotización EUR→BTC + comisión de red (cache 60s) ══════════════

_quote_cache = {'at': 0.0, 'rate': None, 'fee_rate': None}
_TX_VBYTES = 141


async def _get_market_data():
    if time.time() - _quote_cache['at'] < 60 and _quote_cache['rate']:
        return _quote_cache['rate'], _quote_cache['fee_rate']
    rate, fee_rate = _quote_cache['rate'] or 100000.0, _quote_cache['fee_rate'] or 5
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get('https://api.coingecko.com/api/v3/simple/price',
                                 params={'ids': 'bitcoin', 'vs_currencies': 'eur'})
            if r.status_code == 200:
                rate = float(r.json()['bitcoin']['eur'])
            f = await client.get('https://mempool.space/api/v1/fees/recommended')
            if f.status_code == 200:
                fee_rate = int(f.json().get('halfHourFee') or 5)
    except Exception as e:
        logging.warning(f'btc quote fetch failed: {e}')
    _quote_cache.update({'at': time.time(), 'rate': rate, 'fee_rate': fee_rate})
    return rate, fee_rate


async def build_quote(amount_eur: float) -> dict:
    rate, fee_rate = await _get_market_data()
    amount_btc = amount_eur / rate
    network_fee_btc = round(fee_rate * _TX_VBYTES / 1e8, 8)
    return {
        'amount_eur': round(amount_eur, 2),
        'btc_rate_eur': round(rate, 2),
        'amount_btc': round(amount_btc, 8),
        'network_fee_btc': network_fee_btc,
        'network_fee_rate_sat_vb': fee_rate,
        'net_btc': round(max(amount_btc - network_fee_btc, 0), 8),
        'quoted_at': _now(),
        'estimate': True,
    }


# ══════════════ Direcciones BTC de recepción ══════════════

async def ensure_btc_addresses():
    """Siembra idempotente: dirección SafePal nueva + la BTC existente de platform_wallets.
    Solo se siembran direcciones que superen la validación de checksum."""
    existing = await db.btc_receiving_addresses.count_documents({})
    if (validate_btc_address(DEFAULT_ADDRESS)['valid']
            and await db.btc_receiving_addresses.find_one({'address': DEFAULT_ADDRESS}) is None):
        await db.btc_receiving_addresses.insert_one({
            'id': str(uuid.uuid4()), 'address': DEFAULT_ADDRESS, 'type': 'legacy',
            'network': 'Bitcoin', 'wallet_label': 'SafePal', 'enabled': True,
            'is_default': True, 'created_at': _now(), 'created_by': 'system',
        })
    if existing == 0:
        pw = await db.platform_wallets.find_one({'coin': 'BTC'}, {'_id': 0})
        legacy_addr = (pw or {}).get('address', '').strip()
        if legacy_addr and legacy_addr != DEFAULT_ADDRESS:
            v = validate_btc_address(legacy_addr)
            await db.btc_receiving_addresses.insert_one({
                'id': str(uuid.uuid4()), 'address': legacy_addr,
                'type': v.get('type', 'desconocido'), 'network': 'Bitcoin',
                'wallet_label': 'Wallet BTC principal', 'enabled': bool(pw.get('enabled')),
                'is_default': False, 'created_at': _now(), 'created_by': 'system',
            })


async def _enabled_btc_addresses() -> list:
    await ensure_btc_addresses()
    rows = await db.btc_receiving_addresses.find({'enabled': True}, {'_id': 0}).to_list(20)
    rows.sort(key=lambda r: (not r.get('is_default'), r.get('created_at') or ''))
    return rows


# ══════════════ Helpers de solicitud ══════════════

async def _get_request_or_404(request_id: str, user_id: Optional[str] = None) -> dict:
    q = {'id': request_id}
    if user_id:
        q['user_id'] = user_id
    doc = await db.btc_withdrawal_requests.find_one(q, {'_id': 0})
    if not doc:
        raise HTTPException(404, 'Solicitud de retiro BTC no encontrada')
    return doc


async def _set_status(request_id: str, status: str, by: str, extra: Optional[dict] = None):
    updates = {'status': status, 'updated_at': _now()}
    if extra:
        updates.update(extra)
    await db.btc_withdrawal_requests.update_one(
        {'id': request_id},
        {'$set': updates,
         '$push': {'status_history': {'status': status, 'label': STATUS_LABELS[status],
                                      'at': _now(), 'by': by}}},
    )


def _public_view(doc: dict) -> dict:
    doc = dict(doc)
    doc['status_label'] = STATUS_LABELS.get(doc['status'], doc['status'])
    doc['btc_address_masked'] = mask_btc_address(doc.get('btc_address', ''))
    if doc.get('txid'):
        doc['txid_explorer_url'] = f"https://mempool.space/es/tx/{doc['txid']}"
    return doc


# ══════════════ Endpoints usuario ══════════════

@router.get('/btc/validate-address')
async def btc_validate_address(address: str = Query(...), user: dict = Depends(get_current_user)):
    return validate_btc_address(address)


@router.get('/btc-withdrawal/quote')
async def btc_quote(amount_eur: float = Query(..., gt=0), user: dict = Depends(get_current_user)):
    return await build_quote(amount_eur)


@router.get('/btc-withdrawal/payment-info')
async def btc_payment_info(user: dict = Depends(get_current_user)):
    """Direcciones para el abono de €4,850: BTC (SafePal por defecto) + otras cryptos activas."""
    btc_addrs = await _enabled_btc_addresses()
    others = await db.platform_wallets.find(
        {'enabled': True, 'coin': {'$ne': 'BTC'}},
        {'_id': 0, 'coin': 1, 'address': 1, 'network': 1},
    ).to_list(10)
    return {
        'fee_eur': FEE_EUR,
        'concept': 'Abono de procesamiento y liberación del retiro en Bitcoin',
        'conditions': 'El abono es obligatorio para iniciar la validación del retiro. '
                      'Una vez verificado el pago, la solicitud pasa a revisión y el BTC se envía '
                      'a la dirección confirmada. Envíe únicamente por la red indicada en cada dirección.',
        'btc_addresses': [{**a, 'coin': 'BTC'} for a in btc_addrs],
        'other_coins': others,
    }


class InitiateBody(BaseModel):
    amount_eur: float
    btc_address: str
    address_confirmed: bool


@router.post('/btc-withdrawal/initiate')
async def btc_initiate(body: InitiateBody, user: dict = Depends(get_current_user)):
    if body.amount_eur <= 0:
        raise HTTPException(400, 'Monto inválido')
    if not body.address_confirmed:
        raise HTTPException(400, 'Debe confirmar que la dirección Bitcoin introducida es correcta.')
    v = validate_btc_address(body.btc_address)
    if not v['valid']:
        raise HTTPException(400, v.get('reason', 'Dirección Bitcoin inválida'))
    active = await db.btc_withdrawal_requests.find_one(
        {'user_id': user['id'],
         'status': {'$nin': ['completado', 'retiro_rechazado']}},
        {'_id': 0, 'id': 1})
    if active:
        raise HTTPException(400, 'Ya tiene una solicitud de retiro BTC activa.')

    quote = await build_quote(body.amount_eur)
    btc_addrs = await _enabled_btc_addresses()
    default_recv = btc_addrs[0]['address'] if btc_addrs else DEFAULT_ADDRESS
    now = _now()
    doc = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'user_name': user.get('name'),
        'user_email': user.get('email'),
        'amount_eur': round(body.amount_eur, 2),
        'btc_address': v['address'],
        'address_type': v['type'],
        'address_type_label': v['type_label'],
        'quote': quote,
        'fee_eur': FEE_EUR,
        'fee_receiving_address': default_recv,
        'status': 'pendiente_abono',
        'status_history': [
            {'status': 'solicitado', 'label': STATUS_LABELS['solicitado'], 'at': now, 'by': user.get('email')},
            {'status': 'pendiente_abono', 'label': STATUS_LABELS['pendiente_abono'], 'at': now, 'by': 'system'},
        ],
        'submissions': [],
        'admin_notes': [],
        'rejection_reason': None,
        'action_required_message': None,
        'btc_sent': None,
        'txid': None,
        'sent_at': None,
        'created_at': now,
        'updated_at': now,
    }
    await db.btc_withdrawal_requests.insert_one(doc)
    doc.pop('_id', None)
    await notify_admins('Nueva solicitud de retiro BTC',
                        f"{user.get('name')} solicitó retiro de €{body.amount_eur:,.2f} en Bitcoin "
                        f"({mask_btc_address(v['address'])}).")
    await create_notification(user['id'], 'Retiro Bitcoin solicitado',
                              f'Su solicitud de retiro de €{body.amount_eur:,.2f} en BTC fue registrada. '
                              f'Complete el abono de €{FEE_EUR:,.0f} para continuar el proceso.',
                              {'type': 'btc_withdrawal', 'request_id': doc['id']})
    return {'ok': True, 'request': _public_view(doc)}


class SubmitInfoBody(BaseModel):
    message: str
    fee_txid: Optional[str] = None
    coin_used: Optional[str] = None
    address_used: Optional[str] = None


@router.post('/btc-withdrawal/{request_id}/submit-info')
async def btc_submit_info(request_id: str, body: SubmitInfoBody, user: dict = Depends(get_current_user)):
    doc = await _get_request_or_404(request_id, user_id=user['id'])
    if doc['status'] not in ('pendiente_abono', 'accion_requerida', 'validacion_rechazada'):
        raise HTTPException(400, 'La solicitud no admite envío de información en su estado actual.')
    if not body.message.strip() and not (body.fee_txid or '').strip():
        raise HTTPException(400, 'Incluya la información o comprobante del abono.')
    submission = {
        'id': str(uuid.uuid4()),
        'message': body.message.strip(),
        'fee_txid': (body.fee_txid or '').strip() or None,
        'coin_used': (body.coin_used or '').upper() or None,
        'address_used': (body.address_used or '').strip() or None,
        'at': _now(),
    }
    await db.btc_withdrawal_requests.update_one(
        {'id': request_id}, {'$push': {'submissions': submission}})
    await _set_status(request_id, 'pendiente_validacion', user.get('email'),
                      {'action_required_message': None})
    await notify_admins('Retiro BTC: información recibida',
                        f"{user.get('name')} envió comprobante/información del abono "
                        f"(retiro €{doc['amount_eur']:,.2f}). Pendiente de validación.")
    fresh = await _get_request_or_404(request_id)
    return {'ok': True, 'request': _public_view(fresh)}


@router.get('/btc-withdrawal/list')
async def btc_list(user: dict = Depends(get_current_user)):
    rows = await db.btc_withdrawal_requests.find(
        {'user_id': user['id']}, {'_id': 0}).sort('created_at', -1).to_list(20)
    return {'requests': [_public_view(r) for r in rows]}


@router.get('/btc-withdrawal/{request_id}')
async def btc_detail(request_id: str, user: dict = Depends(get_current_user)):
    doc = await _get_request_or_404(request_id, user_id=user['id'])
    return {'request': _public_view(doc)}


# ══════════════ Endpoints admin: solicitudes ══════════════

@router.get('/admin/btc-withdrawals')
async def admin_btc_list(status: Optional[str] = Query(None), admin: dict = Depends(get_admin_user)):
    q = {'status': status} if status else {}
    rows = await db.btc_withdrawal_requests.find(q, {'_id': 0}).sort('created_at', -1).to_list(200)
    counts = {}
    async for g in db.btc_withdrawal_requests.aggregate([
            {'$group': {'_id': '$status', 'n': {'$sum': 1}}}]):
        counts[g['_id']] = g['n']
    return {'requests': [_public_view(r) for r in rows],
            'counts': counts, 'status_labels': STATUS_LABELS}


@router.get('/admin/btc-withdrawals/{request_id}')
async def admin_btc_detail(request_id: str, admin: dict = Depends(get_admin_user)):
    doc = await _get_request_or_404(request_id)
    return {'request': _public_view(doc)}


class ReasonBody(BaseModel):
    reason: str
    final: bool = False


@router.post('/admin/btc-withdrawals/{request_id}/validate')
async def admin_btc_validate(request_id: str, admin: dict = Depends(get_admin_user)):
    doc = await _get_request_or_404(request_id)
    await _set_status(request_id, 'en_revision', admin.get('email'))
    await create_notification(doc['user_id'], 'Abono validado — retiro BTC en revisión',
                              'Su abono fue validado correctamente. Su retiro en Bitcoin pasó a revisión.',
                              {'type': 'btc_withdrawal', 'request_id': request_id})
    return {'ok': True, 'status': 'en_revision'}


@router.post('/admin/btc-withdrawals/{request_id}/reject')
async def admin_btc_reject(request_id: str, body: ReasonBody, admin: dict = Depends(get_admin_user)):
    if not body.reason.strip():
        raise HTTPException(400, 'Indique el motivo del rechazo.')
    doc = await _get_request_or_404(request_id)
    new_status = 'retiro_rechazado' if body.final else 'validacion_rechazada'
    await _set_status(request_id, new_status, admin.get('email'),
                      {'rejection_reason': body.reason.strip()})
    await create_notification(doc['user_id'],
                              'Retiro BTC rechazado' if body.final else 'Validación rechazada — retiro BTC',
                              f'Motivo: {body.reason.strip()}',
                              {'type': 'btc_withdrawal', 'request_id': request_id})
    return {'ok': True, 'status': new_status}


class MessageBody(BaseModel):
    message: str


@router.post('/admin/btc-withdrawals/{request_id}/request-resubmission')
async def admin_btc_request_resubmission(request_id: str, body: MessageBody,
                                         admin: dict = Depends(get_admin_user)):
    if not body.message.strip():
        raise HTTPException(400, 'Indique qué debe completar el usuario.')
    doc = await _get_request_or_404(request_id)
    await _set_status(request_id, 'accion_requerida', admin.get('email'),
                      {'action_required_message': body.message.strip()})
    await create_notification(doc['user_id'], 'Acción requerida — retiro Bitcoin',
                              f'Debe completar el proceso nuevamente: {body.message.strip()}',
                              {'type': 'btc_withdrawal', 'request_id': request_id})
    return {'ok': True, 'status': 'accion_requerida'}


class StatusBody(BaseModel):
    status: str


@router.post('/admin/btc-withdrawals/{request_id}/status')
async def admin_btc_set_status(request_id: str, body: StatusBody, admin: dict = Depends(get_admin_user)):
    if body.status not in BTC_STATUSES:
        raise HTTPException(400, f"Estado inválido. Opciones: {', '.join(BTC_STATUSES)}")
    doc = await _get_request_or_404(request_id)
    await _set_status(request_id, body.status, admin.get('email'))
    await create_notification(doc['user_id'], 'Actualización de su retiro Bitcoin',
                              f"Su retiro pasó al estado: {STATUS_LABELS[body.status]}.",
                              {'type': 'btc_withdrawal', 'request_id': request_id})
    return {'ok': True, 'status': body.status}


class RegisterSendBody(BaseModel):
    btc_amount: float
    txid: str


@router.post('/admin/btc-withdrawals/{request_id}/register-send')
async def admin_btc_register_send(request_id: str, body: RegisterSendBody,
                                  admin: dict = Depends(get_admin_user)):
    txid = body.txid.strip().lower()
    if len(txid) != 64 or any(c not in '0123456789abcdef' for c in txid):
        raise HTTPException(400, 'TXID inválido: debe ser hexadecimal de 64 caracteres.')
    if body.btc_amount <= 0:
        raise HTTPException(400, 'Monto BTC inválido.')
    doc = await _get_request_or_404(request_id)
    await _set_status(request_id, 'enviado', admin.get('email'),
                      {'btc_sent': round(body.btc_amount, 8), 'txid': txid, 'sent_at': _now()})
    await create_notification(doc['user_id'], 'BTC enviado — retiro Bitcoin',
                              f"Se enviaron {body.btc_amount:.8f} BTC a {mask_btc_address(doc['btc_address'])}. "
                              f"TXID: {txid[:16]}… Verifíquelo en el explorador desde su panel.",
                              {'type': 'btc_withdrawal', 'request_id': request_id})
    return {'ok': True, 'status': 'enviado', 'txid': txid}


class NoteBody(BaseModel):
    note: str


@router.post('/admin/btc-withdrawals/{request_id}/notes')
async def admin_btc_add_note(request_id: str, body: NoteBody, admin: dict = Depends(get_admin_user)):
    if not body.note.strip():
        raise HTTPException(400, 'Nota vacía.')
    await _get_request_or_404(request_id)
    note = {'id': str(uuid.uuid4()), 'note': body.note.strip(),
            'by': admin.get('email'), 'at': _now()}
    await db.btc_withdrawal_requests.update_one(
        {'id': request_id}, {'$push': {'admin_notes': note}, '$set': {'updated_at': _now()}})
    return {'ok': True, 'note': note}


# ══════════════ Endpoints admin: direcciones BTC ══════════════

@router.get('/admin/btc-addresses')
async def admin_btc_addresses(admin: dict = Depends(get_admin_user)):
    await ensure_btc_addresses()
    rows = await db.btc_receiving_addresses.find({}, {'_id': 0}).sort('created_at', 1).to_list(50)
    usage = {}
    async for g in db.btc_withdrawal_requests.aggregate([
            {'$unwind': '$submissions'},
            {'$match': {'submissions.address_used': {'$ne': None}}},
            {'$group': {'_id': '$submissions.address_used', 'n': {'$sum': 1}}}]):
        usage[g['_id']] = g['n']
    default_usage = {}
    async for g in db.btc_withdrawal_requests.aggregate([
            {'$group': {'_id': '$fee_receiving_address', 'n': {'$sum': 1}}}]):
        default_usage[g['_id']] = g['n']
    for r in rows:
        r['payments_count'] = usage.get(r['address'], 0)
        r['assigned_requests'] = default_usage.get(r['address'], 0)
    return {'addresses': rows}


class NewAddressBody(BaseModel):
    address: str
    wallet_label: str
    enabled: bool = True


@router.post('/admin/btc-addresses')
async def admin_add_btc_address(body: NewAddressBody, admin: dict = Depends(get_admin_user)):
    v = validate_btc_address(body.address)
    if not v['valid']:
        raise HTTPException(400, v.get('reason', 'Dirección BTC inválida'))
    if await db.btc_receiving_addresses.find_one({'address': v['address']}):
        raise HTTPException(400, 'Esa dirección ya está registrada.')
    doc = {'id': str(uuid.uuid4()), 'address': v['address'], 'type': v['type'],
           'network': 'Bitcoin', 'wallet_label': body.wallet_label.strip() or 'Wallet BTC',
           'enabled': bool(body.enabled), 'is_default': False,
           'created_at': _now(), 'created_by': admin.get('email')}
    await db.btc_receiving_addresses.insert_one(doc)
    doc.pop('_id', None)
    return {'ok': True, 'address': doc}


class EditAddressBody(BaseModel):
    enabled: Optional[bool] = None
    wallet_label: Optional[str] = None
    is_default: Optional[bool] = None


@router.put('/admin/btc-addresses/{address_id}')
async def admin_edit_btc_address(address_id: str, body: EditAddressBody,
                                 admin: dict = Depends(get_admin_user)):
    doc = await db.btc_receiving_addresses.find_one({'id': address_id}, {'_id': 0})
    if not doc:
        raise HTTPException(404, 'Dirección no encontrada')
    updates = {}
    if body.enabled is not None:
        updates['enabled'] = bool(body.enabled)
    if body.wallet_label is not None:
        if not body.wallet_label.strip():
            raise HTTPException(400, 'La etiqueta no puede estar vacía.')
        updates['wallet_label'] = body.wallet_label.strip()
    if body.is_default:
        await db.btc_receiving_addresses.update_many({}, {'$set': {'is_default': False}})
        updates['is_default'] = True
        updates['enabled'] = True
    if not updates:
        raise HTTPException(400, 'Nada que actualizar.')
    updates['updated_at'] = _now()
    updates['updated_by'] = admin.get('email')
    await db.btc_receiving_addresses.update_one({'id': address_id}, {'$set': updates})
    fresh = await db.btc_receiving_addresses.find_one({'id': address_id}, {'_id': 0})
    return {'ok': True, 'address': fresh}
