"""Balance metrics: public credited-funds indicator + admin zero-balance user management"""
import re
import time
import uuid
from datetime import datetime, timezone

from config import db
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.auth import get_admin_user
from services.notifications import log_system_activity

router = APIRouter()

CONFIG_KEY = 'credited_funds_config'
_cache = {'data': None, 'ts': 0}
CACHE_TTL = 60


class CreditedFundsConfig(BaseModel):
    mode: str  # 'auto' | 'manual'
    manual_total: float | None = None
    manual_users_count: int | None = None


class ZeroBalanceAction(BaseModel):
    user_ids: list[str]
    reason: str


class ZeroBalanceRestore(BaseModel):
    user_ids: list[str]


class ZeroBalanceAddBalance(BaseModel):
    user_ids: list[str]
    amount: float
    currency: str = 'EUR'
    description: str | None = None
    notify_email: bool = False


async def _compute_auto_metrics() -> dict:
    pipeline = [
        {'$match': {'role': {'$ne': 'admin'}}},
        {'$lookup': {'from': 'accounts', 'localField': 'id', 'foreignField': 'user_id', 'as': 'accs'}},
        {'$addFields': {'total': {'$add': [
            {'$sum': {'$map': {'input': '$accs', 'as': 'a', 'in': {'$ifNull': ['$$a.balance_eur', 0]}}}},
            {'$sum': {'$map': {'input': '$accs', 'as': 'a', 'in': {'$ifNull': ['$$a.invested_balance_eur', 0]}}}},
        ]}}},
        {'$match': {'total': {'$gt': 0.009}}},
        {'$group': {'_id': None, 'total_credited': {'$sum': '$total'}, 'users_count': {'$sum': 1}}},
    ]
    rows = await db.users.aggregate(pipeline).to_list(1)
    if not rows:
        return {'total_credited': 0.0, 'users_count': 0}
    return {
        'total_credited': round(float(rows[0]['total_credited']), 2),
        'users_count': int(rows[0]['users_count']),
    }


@router.get("/public/credited-funds")
async def public_credited_funds():
    """Public indicator: total funds credited in favor of platform users."""
    now = time.time()
    if _cache['data'] and (now - _cache['ts']) < CACHE_TTL:
        return _cache['data']

    config = await db.system_flags.find_one({'key': CONFIG_KEY}, {'_id': 0}) or {}
    mode = config.get('mode', 'auto')

    if mode == 'manual' and config.get('manual_total') is not None:
        result = {
            'total_credited': round(float(config['manual_total']), 2),
            'users_count': int(config.get('manual_users_count') or 0),
            'mode': 'manual',
            'last_updated': config.get('updated_at') or datetime.now(timezone.utc).isoformat(),
        }
    else:
        metrics = await _compute_auto_metrics()
        result = {
            **metrics,
            'mode': 'auto',
            'last_updated': datetime.now(timezone.utc).isoformat(),
        }

    result['currency'] = 'EUR'
    _cache['data'] = result
    _cache['ts'] = now
    return result


@router.get("/admin/credited-funds-config")
async def admin_get_credited_funds_config(admin: dict = Depends(get_admin_user)):
    config = await db.system_flags.find_one({'key': CONFIG_KEY}, {'_id': 0}) or {'mode': 'auto'}
    auto = await _compute_auto_metrics()
    return {'config': config, 'auto_metrics': auto}


@router.post("/admin/credited-funds-config")
async def admin_set_credited_funds_config(data: CreditedFundsConfig, admin: dict = Depends(get_admin_user)):
    if data.mode not in ('auto', 'manual'):
        raise HTTPException(status_code=400, detail='Modo inválido')
    if data.mode == 'manual' and (data.manual_total is None or data.manual_total < 0):
        raise HTTPException(status_code=400, detail='Debe indicar un total manual válido')

    update = {
        'key': CONFIG_KEY,
        'mode': data.mode,
        'manual_total': data.manual_total,
        'manual_users_count': data.manual_users_count,
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'updated_by': admin.get('id'),
        'updated_by_name': admin.get('name'),
    }
    await db.system_flags.update_one({'key': CONFIG_KEY}, {'$set': update}, upsert=True)
    _cache['data'] = None
    await log_system_activity(
        'credited_funds_config',
        f"Indicador público de fondos actualizado a modo {data.mode}" + (
            f" (total manual: {data.manual_total:,.2f} EUR)" if data.mode == 'manual' else ""),
        user_id=admin.get('id'), user_name=admin.get('name'), user_email=admin.get('email'),
    )
    return {'message': 'Configuración guardada', 'config': update}


@router.get("/admin/zero-balance-users")
async def admin_zero_balance_users(
    search: str | None = None,
    status: str | None = None,
    limit: int = 3500,
    admin: dict = Depends(get_admin_user),
):
    """List users whose total balance (available + invested, EUR) is zero."""
    limit = max(1, min(limit, 5000))
    match: dict = {'role': {'$ne': 'admin'}}
    if search and search.strip():
        term = re.escape(search.strip())
        match['$or'] = [
            {'name': {'$regex': term, '$options': 'i'}},
            {'email': {'$regex': term, '$options': 'i'}},
        ]
    if status and status != 'all':
        match['account_status'] = status

    pipeline = [
        {'$match': match},
        {'$lookup': {'from': 'accounts', 'localField': 'id', 'foreignField': 'user_id', 'as': 'accs'}},
        {'$addFields': {'total_eur': {'$add': [
            {'$sum': {'$map': {'input': '$accs', 'as': 'a', 'in': {'$ifNull': ['$$a.balance_eur', 0]}}}},
            {'$sum': {'$map': {'input': '$accs', 'as': 'a', 'in': {'$ifNull': ['$$a.invested_balance_eur', 0]}}}},
        ]}}},
        {'$match': {'total_eur': {'$lte': 0.009}}},
        {'$project': {
            '_id': 0, 'id': 1, 'name': 1, 'email': 1, 'account_status': 1,
            'created_at': 1, 'last_active': 1, 'first_login_at': 1,
            'archived_at': 1, 'archive_reason': 1, 'archived_by_name': 1,
            'total_eur': 1, 'accounts_count': {'$size': '$accs'},
        }},
        {'$sort': {'created_at': -1}},
        {'$limit': limit},
    ]
    users = await db.users.aggregate(pipeline).to_list(limit)
    stats = {
        'total': len(users),
        'archived': sum(1 for u in users if u.get('account_status') == 'archived'),
        'active': sum(1 for u in users if u.get('account_status') not in ('archived', 'suspended')),
        'never_logged_in': sum(1 for u in users if not (u.get('first_login_at') or u.get('last_active'))),
    }
    return {'users': users, 'stats': stats}


@router.post("/admin/zero-balance-users/archive")
async def admin_archive_zero_balance_users(data: ZeroBalanceAction, admin: dict = Depends(get_admin_user)):
    """Archive (deactivate) zero-balance users in bulk, with validation + traceability."""
    if not data.user_ids:
        raise HTTPException(status_code=400, detail='Debe seleccionar al menos un usuario')
    if not data.reason or len(data.reason.strip()) < 5:
        raise HTTPException(status_code=400, detail='Debe indicar un motivo (mínimo 5 caracteres)')
    if len(data.user_ids) > 500:
        raise HTTPException(status_code=400, detail='Máximo 500 usuarios por lote')

    now = datetime.now(timezone.utc).isoformat()
    archived, skipped = [], []

    for uid in data.user_ids:
        user = await db.users.find_one({'id': uid}, {'_id': 0, 'id': 1, 'name': 1, 'email': 1, 'role': 1})
        if not user or user.get('role') == 'admin':
            skipped.append({'user_id': uid, 'reason': 'no encontrado o admin'})
            continue
        accs = await db.accounts.find({'user_id': uid}, {'_id': 0, 'balance_eur': 1, 'invested_balance_eur': 1}).to_list(20)
        total = sum(float(a.get('balance_eur') or 0) + float(a.get('invested_balance_eur') or 0) for a in accs)
        if total > 0.009:
            skipped.append({'user_id': uid, 'reason': f'saldo no es cero ({total:.2f} EUR)'})
            continue
        await db.users.update_one({'id': uid}, {'$set': {
            'account_status': 'archived',
            'archived_at': now,
            'archive_reason': data.reason.strip(),
            'archived_by': admin.get('id'),
            'archived_by_name': admin.get('name'),
        }})
        await db.zero_balance_actions.insert_one({
            'id': str(uuid.uuid4()),
            'action': 'archive',
            'user_id': uid,
            'user_name': user.get('name'),
            'user_email': user.get('email'),
            'reason': data.reason.strip(),
            'admin_id': admin.get('id'),
            'admin_name': admin.get('name'),
            'created_at': now,
        })
        archived.append(uid)

    if archived:
        await log_system_activity(
            'zero_balance_archive',
            f"{len(archived)} usuario(s) con saldo cero archivados. Motivo: {data.reason.strip()}",
            user_id=admin.get('id'), user_name=admin.get('name'), user_email=admin.get('email'),
            metadata={'user_ids': archived, 'skipped': skipped},
        )
    _cache['data'] = None
    return {'message': f'{len(archived)} usuario(s) archivados', 'archived': archived, 'skipped': skipped}


@router.post("/admin/zero-balance-users/restore")
async def admin_restore_zero_balance_users(data: ZeroBalanceRestore, admin: dict = Depends(get_admin_user)):
    """Restore archived users back to active status, with traceability."""
    if not data.user_ids:
        raise HTTPException(status_code=400, detail='Debe seleccionar al menos un usuario')

    now = datetime.now(timezone.utc).isoformat()
    restored = []
    for uid in data.user_ids:
        user = await db.users.find_one({'id': uid, 'account_status': 'archived'}, {'_id': 0, 'id': 1, 'name': 1, 'email': 1})
        if not user:
            continue
        await db.users.update_one({'id': uid}, {'$set': {'account_status': 'active'},
                                                '$unset': {'archived_at': '', 'archive_reason': '', 'archived_by': '', 'archived_by_name': ''}})
        await db.zero_balance_actions.insert_one({
            'id': str(uuid.uuid4()),
            'action': 'restore',
            'user_id': uid,
            'user_name': user.get('name'),
            'user_email': user.get('email'),
            'admin_id': admin.get('id'),
            'admin_name': admin.get('name'),
            'created_at': now,
        })
        restored.append(uid)

    if restored:
        await log_system_activity(
            'zero_balance_restore',
            f"{len(restored)} usuario(s) archivados restaurados a estado activo",
            user_id=admin.get('id'), user_name=admin.get('name'), user_email=admin.get('email'),
            metadata={'user_ids': restored},
        )
    return {'message': f'{len(restored)} usuario(s) restaurados', 'restored': restored}


@router.post("/admin/zero-balance-users/add-balance")
async def admin_zero_balance_add_balance(data: ZeroBalanceAddBalance, admin: dict = Depends(get_admin_user)):
    """Credit balance to one or many zero-balance users in a single batch."""
    from pymongo import UpdateOne
    from services.accounts_lifecycle import _new_account_doc
    from services.auth import generate_transaction_reference
    from services.email import (
        _build_balance_email_content,
        get_email_template,
        send_email_background,
    )

    if not data.user_ids:
        raise HTTPException(status_code=400, detail='Debe seleccionar al menos un usuario')
    if len(data.user_ids) > 3000:
        raise HTTPException(status_code=400, detail='Máximo 3000 usuarios por lote')
    if not data.amount or data.amount <= 0:
        raise HTTPException(status_code=400, detail='El importe debe ser mayor que 0')
    currency = (data.currency or 'EUR').upper()
    if currency not in ('EUR', 'USD'):
        raise HTTPException(status_code=400, detail='Moneda inválida. Solo EUR o USD')

    user_ids = list(dict.fromkeys(data.user_ids))
    users = await db.users.find(
        {'id': {'$in': user_ids}, 'role': {'$ne': 'admin'}},
        {'_id': 0, 'id': 1, 'name': 1, 'email': 1},
    ).to_list(len(user_ids))
    users_by_id = {u['id']: u for u in users}
    valid_ids = list(users_by_id.keys())
    if not valid_ids:
        raise HTTPException(status_code=404, detail='Ningún usuario válido encontrado')

    accounts = await db.accounts.find(
        {'user_id': {'$in': valid_ids}, 'account_type': 'checking'},
        {'_id': 0, 'id': 1, 'user_id': 1},
    ).to_list(len(valid_ids))
    acc_by_user = {a['user_id']: a for a in accounts}

    missing = [uid for uid in valid_ids if uid not in acc_by_user]
    if missing:
        new_docs = [_new_account_doc(uid, 'checking') for uid in missing]
        await db.accounts.insert_many(new_docs)
        for doc in new_docs:
            acc_by_user[doc['user_id']] = {'id': doc['id'], 'user_id': doc['user_id']}

    now = datetime.now(timezone.utc).isoformat()
    balance_field = f'balance_{currency.lower()}'
    description = (data.description or '').strip() or f'Crédito administrativo por {admin["name"]}'

    updates, transactions, notifications, traces = [], [], [], []
    for uid in valid_ids:
        acc = acc_by_user[uid]
        updates.append(UpdateOne({'id': acc['id']}, {'$inc': {balance_field: data.amount}}))
        transactions.append({
            'id': str(uuid.uuid4()),
            'account_id': acc['id'],
            'user_id': uid,
            'transaction_type': 'admin_credit',
            'amount': data.amount,
            'currency': currency,
            'status': 'completed',
            'description': description,
            'recipient_account_id': None,
            'transaction_reference': generate_transaction_reference(),
            'admin_id': admin['id'],
            'admin_name': admin['name'],
            'created_at': now,
        })
        notifications.append({
            'id': str(uuid.uuid4()),
            'user_id': uid,
            'title': 'Saldo Agregado',
            'message': f'Un administrador ha añadido {data.amount:,.2f} {currency} a su cuenta.',
            'read': False,
            'created_at': now,
        })
        traces.append({
            'id': str(uuid.uuid4()),
            'action': 'add_balance',
            'user_id': uid,
            'user_name': users_by_id[uid].get('name'),
            'user_email': users_by_id[uid].get('email'),
            'reason': f'+{data.amount:,.2f} {currency} · {description}',
            'admin_id': admin.get('id'),
            'admin_name': admin.get('name'),
            'created_at': now,
        })

    await db.accounts.bulk_write(updates)
    await db.transactions.insert_many(transactions)
    await db.notifications.insert_many(notifications)
    await db.zero_balance_actions.insert_many(traces)

    if data.notify_email:
        for uid in valid_ids:
            u = users_by_id[uid]
            html = get_email_template(
                await _build_balance_email_content(u.get('name'), data.amount, currency, data.amount),
                "Saldo Agregado",
            )
            send_email_background(u['email'], "Saldo agregado a su cuenta - LIONSBIT VERIFICACION", html)

    await log_system_activity(
        'zero_balance_add_balance',
        f"Saldo agregado en lote: +{data.amount:,.2f} {currency} a {len(valid_ids)} usuario(s) con saldo cero. Concepto: {description}",
        user_id=admin.get('id'), user_name=admin.get('name'), user_email=admin.get('email'),
        metadata={'user_ids': valid_ids, 'amount': data.amount, 'currency': currency},
    )
    _cache['data'] = None
    skipped = [uid for uid in user_ids if uid not in users_by_id]
    return {
        'message': f'Saldo agregado a {len(valid_ids)} usuario(s)',
        'credited': len(valid_ids),
        'amount': data.amount,
        'currency': currency,
        'total_credited': round(data.amount * len(valid_ids), 2),
        'skipped': skipped,
        'emails_sent': len(valid_ids) if data.notify_email else 0,
    }


@router.get("/admin/zero-balance-users/audit-log")
async def admin_zero_balance_audit_log(limit: int = 100, admin: dict = Depends(get_admin_user)):
    limit = max(1, min(limit, 500))
    logs = await db.zero_balance_actions.find({}, {'_id': 0}).sort('created_at', -1).to_list(limit)
    return {'logs': logs}
