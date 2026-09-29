"""Universal User Search (resolver por nombre/email/ID/IBAN/TXID/referencia) + Ficha Usuario 360° (admin)."""
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from config import db
from services.auth import get_admin_user

router = APIRouter()

SAFE_USER_FIELDS = {'_id': 0, 'password': 0, 'hashed_password': 0, 'kyc_documents': 0}
IDENT_MIN = 6

# (colección, campos identificadores, etiqueta)
IDENTIFIER_SOURCES = [
    ('transactions', ['transaction_reference', 'id'], 'referencia'),
    ('crypto_payments', ['txid', 'transaction_id'], 'txid'),
    ('crypto_payment_intents', ['txid', 'id'], 'txid'),
    ('manual_tax_payments', ['txid'], 'txid'),
    ('mt5_invest_deposits', ['tx_hash', 'id'], 'txid'),
    ('btc_withdrawal_requests', ['txid', 'send_txid', 'fee_txid', 'reference', 'id'], 'txid'),
    ('bank_withdrawal_requests', ['bank_account', 'reference', 'id'], 'iban'),
    ('bank_transfer_payments', ['reference', 'id'], 'referencia'),
    ('payment_transactions', ['session_id'], 'stripe'),
    ('support_tickets', ['ticket_number', 'id'], 'ticket'),
    ('cases', ['code', 'entity_ref'], 'expediente'),
    ('callback_appointments', ['phone'], 'teléfono'),
]


def _clean_ident(q: str) -> str:
    return re.sub(r'\s+', '', q)


async def resolve_users(q: str, limit: int = 10) -> list[dict]:
    """Devuelve usuarios que coinciden por datos propios o por identificadores de sus operaciones."""
    query = q.strip()
    pattern = re.escape(query)
    found: dict[str, dict] = {}

    direct = await db.users.find(
        {'$or': [
            {'name': {'$regex': pattern, '$options': 'i'}},
            {'email': {'$regex': pattern, '$options': 'i'}},
            {'id': {'$regex': f'^{pattern}', '$options': 'i'}},
            {'banking_info.iban': {'$regex': pattern, '$options': 'i'}},
            {'phone': {'$regex': pattern, '$options': 'i'}},
        ]},
        {'_id': 0, 'id': 1, 'name': 1, 'email': 1, 'role': 1, 'verification_status': 1, 'account_status': 1},
    ).limit(limit).to_list(length=limit)
    ql = query.lower()
    for u in direct:
        by = 'email' if ql in (u.get('email') or '').lower() else 'id' if (u.get('id') or '').lower().startswith(ql) else 'nombre'
        found[u['id']] = {**u, 'matched_by': by, 'match_value': u.get('email') if by == 'email' else u.get('id')[:8] if by == 'id' else u.get('name')}

    ident = _clean_ident(query)
    if len(ident) >= IDENT_MIN and len(found) < limit:
        ipat = re.escape(ident)
        for col, fields, label in IDENTIFIER_SOURCES:
            if len(found) >= limit:
                break
            docs = await db[col].find(
                {'$or': [{f: {'$regex': ipat, '$options': 'i'}} for f in fields]},
                {'_id': 0, 'user_id': 1, **{f: 1 for f in fields}},
            ).limit(5).to_list(length=5)
            for d in docs:
                uid = d.get('user_id')
                if not uid or uid in found:
                    continue
                u = await db.users.find_one({'id': uid}, {'_id': 0, 'id': 1, 'name': 1, 'email': 1, 'role': 1, 'verification_status': 1, 'account_status': 1})
                if not u:
                    continue
                val = next((str(d[f]) for f in fields if d.get(f) and ident.lower() in str(d[f]).lower()), ident)
                found[uid] = {**u, 'matched_by': label, 'match_value': val if len(val) <= 40 else f'{val[:14]}…{val[-8:]}'}
    return list(found.values())[:limit]


@router.get('/admin/search/users')
async def admin_universal_user_search(q: str = Query(..., min_length=2, max_length=120), admin: dict = Depends(get_admin_user)):
    users = await resolve_users(q)
    return {'users': users, 'count': len(users)}


async def _many(col: str, flt: dict, proj: Optional[dict] = None, sort: str = 'created_at', limit: int = 50):
    p = {'_id': 0}
    if proj:
        p.update(proj)
    return await db[col].find(flt, p).sort(sort, -1).limit(limit).to_list(length=limit)


@router.get('/admin/users/{user_id}/360')
async def admin_user_360(user_id: str, admin: dict = Depends(get_admin_user)):
    user = await db.users.find_one({'id': user_id}, SAFE_USER_FIELDS)
    if not user:
        raise HTTPException(404, 'Usuario no encontrado')
    f = {'user_id': user_id}
    no_blob = {'content_b64': 0, 'document_front': 0, 'document_back': 0, 'selfie_with_document': 0, 'digital_signature': 0, 'proof_image': 0}

    accounts = await _many('accounts', f, sort='created_at', limit=20)
    mcw = await db.multi_currency_wallets.find_one(f, {'_id': 0})
    transactions = await _many('transactions', f, limit=100)
    bank_wd = await _many('bank_withdrawal_requests', f, {'confirmation_code_hash': 0})
    btc_wd = await _many('btc_withdrawal_requests', f)
    plans = await _many('withdrawal_plans', f)
    special45 = await _many('special45_requests', f)
    crypto_payments = await _many('crypto_payments', f, {'proof_image': 0}, sort='submitted_at')
    intents = await _many('crypto_payment_intents', f)
    manual_tax = await _many('manual_tax_payments', f)
    stripe = await _many('payment_transactions', f)
    bank_transfers = await _many('bank_transfer_payments', f)
    mt5_deposits = await _many('mt5_invest_deposits', f)
    mt5_account = await db.mt5_accounts.find_one(f, {'_id': 0})
    kyc = await _many('kyc_submissions', f, no_blob, sort='submitted_at', limit=10)
    fiscal = await _many('fiscal_documents', f, no_blob)
    vault = await _many('vault_documents', f, no_blob)
    bank_certs = await _many('bank_certificate_requests', f)
    tickets = await _many('support_tickets', f, limit=30)
    callbacks = await _many('callback_appointments', f)
    cases = await _many('cases', f)
    logins = await _many('login_history', f, sort='logged_in_at', limit=25)
    notif_unread = await db.notifications.count_documents({**f, 'read': False})
    authorized = await _many('authorized_transactions', {'username': user.get('name')}, limit=5)

    balance_eur = sum(float(a.get('balance_eur') or 0) + float(a.get('invested_balance_eur') or 0) for a in accounts)
    balance_usd = sum(float(a.get('balance_usd') or 0) for a in accounts)
    withdrawals_full = [t for t in transactions if t.get('transaction_type') in ('withdraw', 'withdrawal')]

    return {
        'user': user,
        'summary': {
            'balance_eur': round(balance_eur, 2),
            'balance_usd': round(balance_usd, 2),
            'transactions': len(transactions),
            'withdrawals': len(withdrawals_full) + len(bank_wd) + len(btc_wd) + len(special45),
            'payments': len(crypto_payments) + len(stripe) + len(bank_transfers) + len(mt5_deposits) + len(manual_tax),
            'documents': len(kyc) + len(fiscal) + len(vault) + len(bank_certs),
            'tickets_open': sum(1 for t in tickets if t.get('status') not in ('closed', 'resolved', 'cerrado')),
            'tickets': len(tickets),
            'cases': len(cases),
            'notifications_unread': notif_unread,
            'last_login': logins[0].get('logged_in_at') if logins else None,
        },
        'accounts': accounts,
        'multi_currency_wallet': mcw,
        'mt5_account': mt5_account,
        'transactions': transactions,
        'withdrawals': {'full': withdrawals_full, 'bank': bank_wd, 'btc': btc_wd, 'plans': plans, 'special45': special45},
        'payments': {'crypto': crypto_payments, 'intents': intents, 'manual_tax': manual_tax, 'stripe': stripe,
                     'bank_transfers': bank_transfers, 'mt5_deposits': mt5_deposits},
        'documents': {'kyc': kyc, 'fiscal': fiscal, 'vault': vault, 'bank_certificates': bank_certs},
        'support': {'tickets': tickets, 'callbacks': callbacks, 'cases': cases},
        'access': {'logins': logins},
        'authorized_transactions': authorized,
    }
