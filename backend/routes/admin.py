"""Admin routes: user management, withdrawals, KYC, crypto payments, notifications, activity"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid
import os
import logging
import asyncio

from config import db, TAX_AMOUNT, MIN_TAX_PAYMENT, GOVERNMENT_TREASURY_ID, ADMIN_EMAIL
from models import (
    AdminUpdateBalance, AdminAddBalance, AdminDebitBalance, AdminUpdateTransactionStatus,
    AdminUpdateUserRole, AdminKYCAction, AdminSuspendUser, AdminForceRelease,
    AdminCryptoPaymentAction, AdminManualTaxPayment, AdminUpdateWithdrawalStatus
)
from services.auth import get_admin_user, generate_transaction_reference
from services.notifications import create_notification, log_system_activity
from services.accounts_lifecycle import ensure_user_accounts, compute_user_balance_summary, provision_full_user_finance
from services.email import (
    send_email, send_email_background, get_email_template,
    send_balance_added_email, send_withdrawal_status_email,
    send_tax_payment_received_email, _build_balance_email_content
)
from services.helpers import ensure_government_treasury

router = APIRouter()

# ==================== ADMIN ROUTES ====================

@router.get("/admin/users")
async def admin_get_users(admin: dict = Depends(get_admin_user)):
    """Get all users with their accounts + computed health status.

    Health is a single-glance indicator for the admin:
      • green  → all good (accounts ok + verified + has logged in)
      • yellow → has accounts but pending action (KYC pending OR no login OR must_change_password)
      • red    → critical: missing internal accounts OR account_status='suspended'/'rejected'
    """
    users = await db.users.aggregate([
        {'$project': {'_id': 0, 'password': 0}},
        {'$limit': 1000},
        {'$lookup': {
            'from': 'accounts',
            'localField': 'id',
            'foreignField': 'user_id',
            'as': 'accounts'
        }},
        {'$addFields': {
            'total_balance_usd': {'$sum': '$accounts.balance_usd'},
            'total_balance_eur': {'$sum': '$accounts.balance_eur'}
        }}
    ]).to_list(1000)

    # Clean up accounts array to remove _id + compute health per user
    for user in users:
        if 'accounts' in user:
            user['accounts'] = [{k: v for k, v in acc.items() if k != '_id'} for acc in user['accounts']]

        types = {a.get('account_type') for a in user.get('accounts', [])}
        has_checking = 'checking' in types
        has_savings  = 'savings' in types
        verified     = user.get('verification_status') == 'verified'
        logged_in    = bool(user.get('first_login_at') or user.get('last_active'))
        must_change  = bool(user.get('must_change_password'))
        suspended    = user.get('account_status') in ('suspended', 'rejected', 'blocked')

        reasons = []
        if not has_checking: reasons.append('Falta checking account')
        if not has_savings:  reasons.append('Falta savings account')
        if suspended:        reasons.append(f"Cuenta {user.get('account_status')}")
        if not verified:     reasons.append('KYC pendiente')
        if not logged_in:    reasons.append('Sin acceso registrado')
        if must_change:      reasons.append('Cambio de contraseña pendiente')

        if not has_checking or suspended:
            level = 'red'
        elif reasons:
            level = 'yellow'
        else:
            level = 'green'

        user['health'] = {
            'level':   level,
            'reasons': reasons,
            'flags': {
                'has_checking': has_checking,
                'has_savings':  has_savings,
                'verified':     verified,
                'logged_in':    logged_in,
                'must_change_password': must_change,
                'suspended':    suspended,
            },
        }

    return users

@router.get("/admin/transactions")
async def admin_get_transactions(
    status: Optional[str] = None,
    admin: dict = Depends(get_admin_user)
):
    """Get all transactions - optimized with aggregation"""
    match_query = {}
    if status:
        match_query['status'] = status
    
    transactions = await db.transactions.aggregate([
        {'$match': match_query},
        {'$sort': {'created_at': -1}},
        {'$limit': 1000},
        {'$lookup': {
            'from': 'users',
            'localField': 'user_id',
            'foreignField': 'id',
            'as': 'user_data'
        }},
        {'$unwind': {'path': '$user_data', 'preserveNullAndEmptyArrays': True}},
        {'$addFields': {
            'user': {
                'id': '$user_data.id',
                'name': '$user_data.name',
                'email': '$user_data.email'
            }
        }},
        {'$project': {'_id': 0, 'user_data': 0}}
    ]).to_list(1000)
    
    return transactions

@router.get("/admin/withdrawals/pending")
async def admin_get_pending_withdrawals(admin: dict = Depends(get_admin_user)):
    """Get pending withdrawals - optimized with aggregation"""
    withdrawals = await db.transactions.aggregate([
        {'$match': {'transaction_type': 'withdraw', 'status': 'pending'}},
        {'$sort': {'created_at': -1}},
        {'$limit': 1000},
        {'$lookup': {
            'from': 'users',
            'localField': 'user_id',
            'foreignField': 'id',
            'as': 'user_data'
        }},
        {'$unwind': {'path': '$user_data', 'preserveNullAndEmptyArrays': True}},
        {'$addFields': {
            'user': {
                'id': '$user_data.id',
                'name': '$user_data.name',
                'email': '$user_data.email',
                'verification_status': '$user_data.verification_status'
            }
        }},
        {'$project': {'_id': 0, 'user_data': 0}}
    ]).to_list(1000)
    
    return withdrawals

@router.post("/admin/withdrawals/approve/{transaction_id}")
async def admin_approve_withdrawal(transaction_id: str, admin: dict = Depends(get_admin_user)):
    tx = await db.transactions.find_one({'id': transaction_id, 'status': 'pending'}, {'_id': 0})
    if not tx:
        raise HTTPException(status_code=404, detail='Pending withdrawal not found')
    
    account = await db.accounts.find_one({'id': tx['account_id']}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    balance_field = f'balance_{tx["currency"].lower()}'
    
    if account[balance_field] < tx['amount']:
        await db.transactions.update_one({'id': transaction_id}, {'$set': {'status': 'rejected'}})
        await create_notification(tx['user_id'], 'Withdrawal Rejected', 
            'Your withdrawal was rejected due to insufficient funds.')
        raise HTTPException(status_code=400, detail='Insufficient funds - withdrawal rejected')
    
    new_balance = account[balance_field] - tx['amount']
    await db.accounts.update_one({'id': tx['account_id']}, {'$set': {balance_field: new_balance}})
    await db.transactions.update_one({'id': transaction_id}, {'$set': {'status': 'completed'}})
    
    await create_notification(tx['user_id'], 'Withdrawal Approved',
        f'Your withdrawal of {tx["amount"]} {tx["currency"]} has been approved.')
    
    # Send email notification
    user = await db.users.find_one({'id': tx['user_id']}, {'_id': 0})
    if user:
        await send_withdrawal_status_email(
            user_email=user['email'],
            user_name=user['name'],
            amount=tx['amount'],
            currency=tx['currency'],
            status='completed'
        )
    
    return {'message': 'Withdrawal approved', 'transaction_id': transaction_id}

@router.post("/admin/withdrawals/reject/{transaction_id}")
async def admin_reject_withdrawal(transaction_id: str, admin: dict = Depends(get_admin_user)):
    tx = await db.transactions.find_one({'id': transaction_id, 'status': 'pending'}, {'_id': 0})
    if not tx:
        raise HTTPException(status_code=404, detail='Pending withdrawal not found')
    
    await db.transactions.update_one({'id': transaction_id}, {'$set': {'status': 'rejected'}})
    
    await create_notification(tx['user_id'], 'Withdrawal Rejected',
        f'Your withdrawal of {tx["amount"]} {tx["currency"]} has been rejected.')
    
    # Send email notification
    user = await db.users.find_one({'id': tx['user_id']}, {'_id': 0})
    if user:
        await send_withdrawal_status_email(
            user_email=user['email'],
            user_name=user['name'],
            amount=tx['amount'],
            currency=tx['currency'],
            status='rejected',
            reason='Withdrawal request was rejected by administrator'
        )
    
    return {'message': 'Withdrawal rejected', 'transaction_id': transaction_id}

@router.put("/admin/withdrawals/update-status")
async def admin_update_withdrawal_status(data: AdminUpdateWithdrawalStatus, admin: dict = Depends(get_admin_user)):
    """Update withdrawal status with the new flow: pending -> processing -> transfer_in_progress -> completed"""
    valid_statuses = ['pending', 'processing', 'transfer_in_progress', 'completed', 'rejected']
    
    if data.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f'Estado inválido. Debe ser uno de: {", ".join(valid_statuses)}')
    
    tx = await db.transactions.find_one({'id': data.transaction_id, 'transaction_type': 'withdraw'}, {'_id': 0})
    if not tx:
        raise HTTPException(status_code=404, detail='Retiro no encontrado')
    
    # Get user info
    user = await db.users.find_one({'id': tx['user_id']}, {'_id': 0, 'password': 0})
    
    # If completing the withdrawal, deduct from account
    if data.status == 'completed' and tx['status'] != 'completed':
        account = await db.accounts.find_one({'id': tx['account_id']}, {'_id': 0})
        if not account:
            raise HTTPException(status_code=404, detail='Cuenta no encontrada')
        
        balance_field = f'balance_{tx["currency"].lower()}'
        
        if account[balance_field] < tx['amount']:
            raise HTTPException(status_code=400, detail='Fondos insuficientes - no se puede completar el retiro')
        
        # Deduct balance
        new_balance = account[balance_field] - tx['amount']
        await db.accounts.update_one({'id': tx['account_id']}, {'$set': {balance_field: new_balance}})
    
    # Update status
    update_data = {'status': data.status}
    if data.status == 'completed':
        update_data['completed_at'] = datetime.now(timezone.utc).isoformat()
    if data.status == 'rejected' and data.rejection_reason:
        update_data['rejection_reason'] = data.rejection_reason
    
    await db.transactions.update_one({'id': data.transaction_id}, {'$set': update_data})
    
    # Status messages in Spanish
    status_messages = {
        'pending': 'Pendiente de Aprobación',
        'processing': 'Procesando',
        'transfer_in_progress': 'Transferencia en Proceso',
        'completed': 'Completado',
        'rejected': 'Rechazado'
    }
    
    # Create notification for user
    await create_notification(
        tx['user_id'], 
        f'Retiro - {status_messages[data.status]}',
        f'Su retiro de {tx["amount"]} {tx["currency"]} ahora está: {status_messages[data.status]}'
    )
    
    # Send email notification
    if user:
        await send_withdrawal_status_email(
            user_email=user['email'],
            user_name=user['name'],
            amount=tx['amount'],
            currency=tx['currency'],
            status=data.status,
            reason=data.rejection_reason if data.status == 'rejected' else None
        )
    
    return {
        'message': f'Estado actualizado a: {status_messages[data.status]}',
        'transaction_id': data.transaction_id,
        'new_status': data.status
    }

@router.get("/admin/withdrawals/all")
async def admin_get_all_withdrawals(admin: dict = Depends(get_admin_user)):
    """Get all withdrawals with all statuses for admin management - optimized with aggregation"""
    withdrawals = await db.transactions.aggregate([
        {'$match': {'transaction_type': 'withdraw'}},
        {'$sort': {'created_at': -1}},
        {'$limit': 1000},
        {'$lookup': {
            'from': 'users',
            'localField': 'user_id',
            'foreignField': 'id',
            'as': 'user_data'
        }},
        {'$unwind': {'path': '$user_data', 'preserveNullAndEmptyArrays': True}},
        {'$addFields': {
            'user': {
                'id': '$user_data.id',
                'name': '$user_data.name',
                'email': '$user_data.email',
                'verification_status': '$user_data.verification_status'
            }
        }},
        {'$project': {'_id': 0, 'user_data': 0}}
    ]).to_list(1000)
    
    return withdrawals

@router.get("/admin/withdrawals/{transaction_id}/details")
async def admin_get_withdrawal_details(transaction_id: str, admin: dict = Depends(get_admin_user)):
    """Get expanded details for a specific withdrawal including user balance and withdrawal history"""
    tx = await db.transactions.find_one({'id': transaction_id, 'transaction_type': 'withdraw'}, {'_id': 0})
    if not tx:
        raise HTTPException(status_code=404, detail='Retiro no encontrado')
    
    user = await db.users.find_one({'id': tx['user_id']}, {'_id': 0, 'password': 0})
    account = await db.accounts.find_one({'user_id': tx['user_id'], 'account_type': 'checking'}, {'_id': 0})
    
    history = await db.transactions.find(
        {'user_id': tx['user_id'], 'transaction_type': 'withdraw'},
        {'_id': 0, 'id': 1, 'amount': 1, 'currency': 1, 'status': 1, 'created_at': 1}
    ).sort('created_at', -1).to_list(20)
    
    return {
        'transaction': tx,
        'user': {
            'name': user.get('name', '') if user else '',
            'email': user.get('email', '') if user else '',
            'verification_status': user.get('verification_status', 'pending') if user else 'pending',
        },
        'balance': {
            'available_usd': account.get('balance_usd', 0) if account else 0,
            'available_eur': account.get('balance_eur', 0) if account else 0,
        },
        'banking_info': tx.get('banking_info', {}),
        'withdrawal_history': history
    }

@router.post("/admin/withdrawals/{transaction_id}/reactivate")
async def admin_reactivate_withdrawal(transaction_id: str, admin: dict = Depends(get_admin_user)):
    """Reactivate a rejected withdrawal - sets status back to pending"""
    tx = await db.transactions.find_one({'id': transaction_id, 'transaction_type': 'withdraw'}, {'_id': 0})
    if not tx:
        raise HTTPException(status_code=404, detail='Retiro no encontrado')
    if tx.get('status') != 'rejected':
        raise HTTPException(status_code=400, detail='Solo se pueden reactivar retiros rechazados')
    
    now = datetime.now(timezone.utc).isoformat()
    await db.transactions.update_one(
        {'id': transaction_id},
        {'$set': {'status': 'pending', 'rejection_reason': None, 'reactivated_at': now, 'updated_at': now}}
    )
    
    await create_notification(tx['user_id'], 'Retiro Reactivado',
        f'Su retiro de {tx["amount"]} {tx["currency"]} ha sido reactivado y esta pendiente de aprobacion.')
    
    # Send email notification
    user = await db.users.find_one({'id': tx['user_id']}, {'_id': 0})
    if user:
        await send_withdrawal_status_email(
            user_email=user['email'],
            user_name=user['name'],
            amount=tx['amount'],
            currency=tx['currency'],
            status='pending'
        )
    
    return {'message': 'Retiro reactivado exitosamente', 'transaction_id': transaction_id}



@router.put("/admin/balance")
async def admin_update_balance(data: AdminUpdateBalance, admin: dict = Depends(get_admin_user)):
    account = await db.accounts.find_one({'id': data.account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    await db.accounts.update_one(
        {'id': data.account_id},
        {'$set': {'balance_usd': data.balance_usd, 'balance_eur': data.balance_eur}}
    )
    
    return {'message': 'Balance updated', 'account_id': data.account_id}


@router.post("/admin/backfill-accounts")
async def admin_backfill_accounts(admin: dict = Depends(get_admin_user)):
    """Bulk self-heal: scan every user and create the missing checking +
    savings accounts. Idempotent. Returns a per-role/per-import summary."""
    users_cur = db.users.find({}, {'_id': 0, 'id': 1, 'email': 1, 'role': 1, 'is_reactivated': 1})
    users = await users_cur.to_list(length=20000)

    created_checking = 0
    created_savings = 0
    already_complete = 0
    errors = []
    by_segment = {'reactivated': 0, 'regular': 0, 'admin': 0}

    for u in users:
        try:
            had_checking = await db.accounts.count_documents({'user_id': u['id'], 'account_type': 'checking'}) > 0
            had_savings  = await db.accounts.count_documents({'user_id': u['id'], 'account_type': 'savings'}) > 0
            if had_checking and had_savings:
                already_complete += 1
                continue
            await provision_full_user_finance(u['id'])
            if not had_checking:
                created_checking += 1
            if not had_savings:
                created_savings += 1

            seg = 'admin' if u.get('role') == 'admin' else ('reactivated' if u.get('is_reactivated') else 'regular')
            by_segment[seg] = by_segment.get(seg, 0) + 1
        except Exception as e:
            errors.append({'user_id': u.get('id'), 'email': u.get('email'), 'reason': str(e)})

    return {
        'total_users':         len(users),
        'already_complete':    already_complete,
        'created_checking':    created_checking,
        'created_savings':     created_savings,
        'by_segment':          by_segment,
        'errors':              errors,
    }


@router.get("/admin/users/{user_id}/balance-summary")
async def admin_user_balance_summary(user_id: str, admin: dict = Depends(get_admin_user)):
    """Quick summary card for an admin viewing a user — auto-heals if any
    internal account is missing (so the page never shows nulls)."""
    user = await db.users.find_one({'id': user_id}, {'_id': 0, 'password': 0})
    if not user:
        raise HTTPException(404, 'User not found')
    await ensure_user_accounts(user_id)
    summary = await compute_user_balance_summary(user_id)
    return {
        'user': {
            'id': user['id'], 'email': user.get('email'), 'name': user.get('name'),
            'role': user.get('role'), 'verification_status': user.get('verification_status'),
            'account_status': user.get('account_status'),
            'is_reactivated': bool(user.get('is_reactivated')),
            'import_group': user.get('import_group'),
        },
        **summary,
    }


# ==================== Manual user creation + bulk health-notify ====================

from pydantic import BaseModel, EmailStr
from services.auth import hash_password


class AdminManualUserCreate(BaseModel):
    name: str
    email: EmailStr
    password: Optional[str] = None  # default 'lionsbit2.0' if not provided
    phone: Optional[str] = None
    country_code: Optional[str] = None
    country_name: Optional[str] = None
    seed_balance_eur: Optional[float] = 0.0
    seed_balance_usd: Optional[float] = 0.0
    role: Optional[str] = 'user'
    force_password_change: Optional[bool] = True


@router.post("/admin/users/manual-create")
async def admin_manual_create_user(data: AdminManualUserCreate, admin: dict = Depends(get_admin_user)):
    """Create a single user manually from the admin panel — guarantees the
    full financial structure (checking + savings + wallet + KYC defaults +
    seed history) is created atomically. Never raises 'Checking account
    not found' for the new user.
    """
    if await db.users.find_one({'email': data.email}):
        raise HTTPException(400, 'Email already registered')

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    raw_password = data.password or os.environ.get('DEFAULT_USER_PASSWORD', 'lionsbit2.0')

    user_doc = {
        'id': user_id,
        'name': data.name,
        'email': data.email,
        'password': hash_password(raw_password),
        'phone': data.phone,
        'country_code': data.country_code,
        'country_name': data.country_name,
        'role': data.role or 'user',
        'verification_status': 'unverified',
        'account_status': 'active',
        'kyc_status': 'pending',
        'kyc_documents': None,
        'must_change_password': bool(data.force_password_change),
        'created_at': now,
        'created_by_admin': admin['id'],
        'created_by_admin_name': admin.get('name'),
    }
    await db.users.insert_one(user_doc)

    provisioned = await provision_full_user_finance(
        user_id,
        seed_balance_eur=float(data.seed_balance_eur or 0.0),
        seed_balance_usd=float(data.seed_balance_usd or 0.0),
    )

    # Onboarding step 1 — welcome + temp password (idempotent, fire-and-forget Resend)
    from services.onboarding_funnel import send_onboarding_step1
    await send_onboarding_step1(user_id, temp_password=raw_password if data.force_password_change else None)

    await log_system_activity(
        activity_type='admin_manual_user_create',
        description=f'Admin {admin["name"]} creó manualmente al usuario {data.name} ({data.email})',
        user_id=user_id,
        user_name=data.name,
        user_email=data.email,
        metadata={'seed_eur': data.seed_balance_eur, 'seed_usd': data.seed_balance_usd},
    )

    return {
        'message': 'Usuario creado y estructura financiera provisionada',
        'user_id': user_id,
        'temporary_password': raw_password if data.force_password_change else None,
        'provisioned': provisioned,
    }


def _user_health_level(user: dict, account_types: set) -> str:
    has_checking = 'checking' in account_types
    suspended    = user.get('account_status') in ('suspended', 'rejected', 'blocked')
    if not has_checking or suspended:
        return 'red'
    verified     = user.get('verification_status') == 'verified'
    logged_in    = bool(user.get('first_login_at') or user.get('last_active'))
    must_change  = bool(user.get('must_change_password'))
    has_savings  = 'savings' in account_types
    if not (has_savings and verified and logged_in and not must_change):
        return 'yellow'
    return 'green'


class AdminBulkNotifyByHealth(BaseModel):
    level: str                # 'green' | 'yellow' | 'red'
    subject: str
    intro: Optional[str] = ''
    dry_run: Optional[bool] = False


@router.post("/admin/users/bulk-notify-by-health")
async def admin_bulk_notify_by_health(data: AdminBulkNotifyByHealth, admin: dict = Depends(get_admin_user)):
    """Send a re-engagement email + in-app notification to every user
    whose health bucket matches `level`. Returns counts; if dry_run=true
    only returns the target list without sending."""
    if data.level not in ('green', 'yellow', 'red'):
        raise HTTPException(400, 'level debe ser green | yellow | red')
    if not data.subject or not data.subject.strip():
        raise HTTPException(400, 'subject es obligatorio')

    users = await db.users.find({}, {'_id': 0, 'password': 0}).to_list(20000)
    accounts_cur = db.accounts.find({}, {'_id': 0, 'user_id': 1, 'account_type': 1})
    accounts = await accounts_cur.to_list(50000)

    types_by_user: dict = {}
    for a in accounts:
        types_by_user.setdefault(a['user_id'], set()).add(a.get('account_type'))

    targets = []
    for u in users:
        if u.get('role') == 'admin':
            continue
        if not u.get('email'):
            continue
        lvl = _user_health_level(u, types_by_user.get(u['id'], set()))
        if lvl == data.level:
            targets.append({'id': u['id'], 'email': u['email'], 'name': u.get('name') or 'Cliente'})

    if data.dry_run:
        return {'level': data.level, 'count': len(targets), 'sample': targets[:5]}

    sent = 0
    failed = 0
    intro_html = (data.intro or '').strip()
    for t in targets:
        try:
            await create_notification(t['id'], data.subject, intro_html or 'Tiene una notificación de su asesor LIONSBIT.')
            html_body = f"""
                <p style="color:#e2e8f0;font-size:15px;">Estimado/a {t['name']},</p>
                <p style="color:#cbd5e1;font-size:14px;line-height:1.6;">{intro_html or 'Le contactamos desde el departamento de cumplimiento de LIONSBIT.'}</p>
                <p style="color:#94a3b8;font-size:13px;margin-top:24px;">Equipo LIONSBIT VERIFICACION</p>
            """
            send_email_background(t['email'], data.subject, get_email_template(html_body, data.subject))
            sent += 1
        except Exception as e:
            failed += 1
            logging.warning(f'[bulk-notify] failed for {t["email"]}: {e}')

    await log_system_activity(
        activity_type='admin_bulk_health_notify',
        description=f'Admin {admin["name"]} notificó a {sent} usuarios bucket {data.level}',
        metadata={'level': data.level, 'sent': sent, 'failed': failed, 'subject': data.subject},
    )

    return {'level': data.level, 'sent': sent, 'failed': failed, 'target_count': len(targets)}


@router.post("/admin/onboarding/run-funnel")
async def admin_run_onboarding_funnel(admin: dict = Depends(get_admin_user)):
    """Manually trigger the onboarding email funnel (steps 2 & 3).
    Useful for ops debugging — the same job runs hourly from APScheduler."""
    from services.onboarding_funnel import run_onboarding_funnel_tick
    return await run_onboarding_funnel_tick()


@router.post("/admin/add-balance")
async def admin_add_balance(data: AdminAddBalance, admin: dict = Depends(get_admin_user)):
    """Add balance to a user's checking account (admin_credit transaction).
    Auto-provisions the checking account if it doesn't exist (e.g. legacy
    imported users) — never returns 'Checking account not found' for a
    valid user.
    """
    # Find user
    user = await db.users.find_one({'id': data.user_id}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    # Ensure checking account exists (self-heal for imported users)
    from services.accounts_lifecycle import ensure_checking_account
    account = await ensure_checking_account(data.user_id)
    
    currency = data.currency.upper()
    balance_field = f'balance_{currency.lower()}'
    
    # Update balance
    new_balance = account[balance_field] + data.amount
    await db.accounts.update_one(
        {'id': account['id']},
        {'$set': {balance_field: new_balance}}
    )
    
    # Create admin_credit transaction record
    now = datetime.now(timezone.utc).isoformat()
    tx_id = str(uuid.uuid4())
    
    transaction = {
        'id': tx_id,
        'account_id': account['id'],
        'user_id': data.user_id,
        'transaction_type': 'admin_credit',
        'amount': data.amount,
        'currency': currency,
        'status': 'completed',
        'description': data.description or f'Administrative credit by {admin["name"]}',
        'recipient_account_id': None,
        'transaction_reference': generate_transaction_reference(),
        'admin_id': admin['id'],
        'admin_name': admin['name'],
        'created_at': now
    }
    await db.transactions.insert_one(transaction)
    
    # Notify user
    await create_notification(
        data.user_id,
        'Saldo Agregado',
        f'Un administrador ha añadido {data.amount} {currency} a su cuenta.'
    )
    
    # Send email notification in background (non-blocking)
    html = get_email_template(
        await _build_balance_email_content(user['name'], data.amount, currency, new_balance),
        "Saldo Agregado"
    )
    send_email_background(user['email'], f"Saldo agregado a su cuenta - LIONSBIT VERIFICACION", html)
    
    # Log system activity in background
    asyncio.create_task(log_system_activity(
        activity_type='deposit',
        description=f'Saldo agregado por admin: ${data.amount:,.2f} {currency} a {user["name"]}',
        user_id=data.user_id,
        user_name=user['name'],
        user_email=user['email'],
        metadata={'amount': data.amount, 'currency': currency, 'admin': admin['name']}
    ))
    
    return {
        'message': 'Balance added successfully',
        'transaction_id': tx_id,
        'user_id': data.user_id,
        'amount': data.amount,
        'currency': currency,
        'new_balance': new_balance
    }

@router.get("/admin/credits")
async def admin_get_credits(admin: dict = Depends(get_admin_user)):
    """Get all admin_credit transactions - optimized with aggregation"""
    credits = await db.transactions.aggregate([
        {'$match': {'transaction_type': 'admin_credit'}},
        {'$sort': {'created_at': -1}},
        {'$limit': 500},
        {'$lookup': {
            'from': 'users',
            'localField': 'user_id',
            'foreignField': 'id',
            'as': 'user_data'
        }},
        {'$unwind': {'path': '$user_data', 'preserveNullAndEmptyArrays': True}},
        {'$addFields': {
            'user': {
                'id': '$user_data.id',
                'name': '$user_data.name',
                'email': '$user_data.email'
            }
        }},
        {'$project': {'_id': 0, 'user_data': 0}}
    ]).to_list(500)
    
    return credits

@router.post("/admin/debit-balance")
async def admin_debit_balance(data: AdminDebitBalance, admin: dict = Depends(get_admin_user)):
    """Debit (deduct) balance from a user's checking account with a mandatory reason.
    Creates an 'admin_debit' transaction with full audit trail and notifies the user.
    """
    # Find user
    user = await db.users.find_one({'id': data.user_id}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')

    reason = (data.reason or '').strip()
    if len(reason) < 3:
        raise HTTPException(status_code=400, detail='El motivo es obligatorio (min. 3 caracteres)')

    # Ensure checking account exists
    from services.accounts_lifecycle import ensure_checking_account
    account = await ensure_checking_account(data.user_id)

    currency = data.currency.upper()
    if currency not in ('USD', 'EUR'):
        raise HTTPException(status_code=400, detail='Moneda invalida. Solo USD o EUR')
    balance_field = f'balance_{currency.lower()}'

    current_balance = float(account.get(balance_field) or 0)
    if current_balance < data.amount:
        raise HTTPException(
            status_code=400,
            detail=f'Fondos insuficientes. Saldo actual: {current_balance:,.2f} {currency}'
        )

    # Deduct balance
    new_balance = current_balance - data.amount
    await db.accounts.update_one(
        {'id': account['id']},
        {'$set': {balance_field: new_balance}}
    )

    # Create admin_debit transaction record with reason
    now = datetime.now(timezone.utc).isoformat()
    tx_id = str(uuid.uuid4())
    transaction = {
        'id': tx_id,
        'account_id': account['id'],
        'user_id': data.user_id,
        'transaction_type': 'admin_debit',
        'amount': data.amount,
        'currency': currency,
        'status': 'completed',
        'description': f'Débito administrativo: {reason}',
        'reason': reason,
        'balance_before': current_balance,
        'balance_after': new_balance,
        'recipient_account_id': None,
        'transaction_reference': generate_transaction_reference(),
        'admin_id': admin['id'],
        'admin_name': admin.get('name'),
        'admin_email': admin.get('email'),
        'created_at': now
    }
    await db.transactions.insert_one(transaction)

    # In-app notification
    await create_notification(
        data.user_id,
        'Débito en su cuenta',
        f'Se ha debitado {data.amount:,.2f} {currency} de su cuenta. Motivo: {reason}'
    )

    # Email notification (background, non-blocking) with reason
    if data.notify_user:
        currency_symbol = '$' if currency == 'USD' else '€'
        date_str = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
        html_content = f"""
            <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
                Estimado/a <strong style="color: #f59e0b;">{user['name']}</strong>,
            </p>
            <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6;">
                Le informamos que se ha realizado un <strong style="color:#f87171;">débito</strong> sobre su cuenta LIONSBIT VERIFICACION.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
                <tr>
                    <td style="padding: 25px;">
                        <p style="color: #94a3b8; font-size: 13px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Detalles del débito</p>
                        <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                                <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto debitado:</td>
                                <td style="color: #f87171; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 18px;">
                                    -{currency_symbol}{data.amount:,.2f} {currency}
                                </td>
                            </tr>
                            <tr>
                                <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Fecha:</td>
                                <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{date_str}</td>
                            </tr>
                            <tr>
                                <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Referencia:</td>
                                <td style="color: #06b6d4; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-family: monospace;">{transaction['transaction_reference']}</td>
                            </tr>
                            <tr>
                                <td style="color: #94a3b8; padding: 8px 0;">Saldo actual:</td>
                                <td style="color: #06b6d4; font-weight: bold; text-align: right; padding: 8px 0; font-size: 18px;">{currency_symbol}{new_balance:,.2f} {currency}</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>

            <div style="background: rgba(245, 158, 11, 0.1); border-left: 4px solid #f59e0b; padding: 18px; border-radius: 8px; margin: 20px 0;">
                <p style="color: #fbbf24; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">Motivo del débito</p>
                <p style="color: #fde68a; font-size: 15px; line-height: 1.6; margin: 0;">{reason}</p>
            </div>

            <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin-top: 24px;">
                Si usted considera que este débito es incorrecto, por favor contacte inmediatamente a nuestro equipo de soporte respondiendo a este correo o desde la sección <strong>Soporte</strong> de su panel.
            </p>
        """
        html = get_email_template(html_content, "Débito en su cuenta")
        send_email_background(
            user['email'],
            f"Débito realizado: {currency_symbol}{data.amount:,.2f} {currency} - LIONSBIT VERIFICACION",
            html
        )

    # Log system activity
    asyncio.create_task(log_system_activity(
        activity_type='admin_debit',
        description=f'Débito admin: {currency} {data.amount:,.2f} a {user["name"]}. Motivo: {reason}',
        user_id=data.user_id,
        user_name=user['name'],
        user_email=user['email'],
        metadata={
            'amount': data.amount,
            'currency': currency,
            'reason': reason,
            'admin': admin.get('name'),
            'balance_before': current_balance,
            'balance_after': new_balance,
            'transaction_reference': transaction['transaction_reference'],
        }
    ))

    return {
        'message': 'Débito realizado correctamente',
        'transaction_id': tx_id,
        'transaction_reference': transaction['transaction_reference'],
        'user_id': data.user_id,
        'amount': data.amount,
        'currency': currency,
        'reason': reason,
        'balance_before': current_balance,
        'balance_after': new_balance,
    }


class AdminBulkDebitPayload(BaseModel):
    amount: float = 25.0
    currencies: Optional[list] = None  # ['USD', 'EUR'] default both
    reason: str = 'Mantenimiento de cuenta'
    notify_user: bool = True
    dry_run: bool = False
    exclude_admins: bool = True
    confirm_token: str  # must equal "DEBIT-ALL-CONFIRM" to execute


@router.post("/admin/bulk-debit")
async def admin_bulk_debit(payload: AdminBulkDebitPayload, admin: dict = Depends(get_admin_user)):
    """Bulk debit ALL users (excluding admins by default) by a fixed amount, separately
    in each currency they hold. Skips users with insufficient funds gracefully.

    Each debit is atomic per-(user, currency) and creates a normal admin_debit transaction
    so they all show up in /admin/admin-ops and the audit trail.

    REQUIRES `confirm_token` == "DEBIT-ALL-CONFIRM" to actually execute (safety guard).
    Use `dry_run: true` to preview the impact without writing anything.
    """
    if payload.confirm_token != 'DEBIT-ALL-CONFIRM' and not payload.dry_run:
        raise HTTPException(
            status_code=400,
            detail='confirm_token debe ser "DEBIT-ALL-CONFIRM" para ejecutar (o use dry_run=true)'
        )
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail='amount debe ser > 0')

    reason = (payload.reason or '').strip() or 'Mantenimiento de cuenta'
    currencies = [c.upper() for c in (payload.currencies or ['USD', 'EUR']) if c.upper() in ('USD', 'EUR')]
    if not currencies:
        currencies = ['USD', 'EUR']

    from services.accounts_lifecycle import ensure_checking_account

    # Build user list. Exclude admins by default.
    user_filter = {}
    if payload.exclude_admins:
        user_filter['role'] = {'$ne': 'admin'}
    users = await db.users.find(user_filter, {'_id': 0, 'password': 0}).to_list(20000)

    summary = {
        'amount': payload.amount,
        'currencies': currencies,
        'reason': reason,
        'notify_user': payload.notify_user,
        'dry_run': payload.dry_run,
        'total_users_evaluated': len(users),
        'debits_planned': 0,
        'debits_executed': 0,
        'sum_debited_usd': 0.0,
        'sum_debited_eur': 0.0,
        'skipped_insufficient_funds': 0,
        'skipped_no_account': 0,
        'failed': 0,
        'failures': [],
        'started_at': datetime.now(timezone.utc).isoformat(),
    }

    # Snapshot per-user email/balance buffer so we can send ONE consolidated email
    # with both currencies when applicable.
    user_email_buffer: dict = {}

    for user in users:
        uid = user.get('id')
        if not uid:
            continue
        try:
            account = await ensure_checking_account(uid)
        except Exception as exc:
            summary['skipped_no_account'] += 1
            summary['failures'].append({'user_id': uid, 'reason': f'no_account: {exc}'})
            continue

        for cur in currencies:
            balance_field = f'balance_{cur.lower()}'
            current_balance = float(account.get(balance_field) or 0)
            if current_balance < payload.amount:
                summary['skipped_insufficient_funds'] += 1
                continue

            summary['debits_planned'] += 1
            if payload.dry_run:
                continue

            # --- Execute debit ---
            new_balance = current_balance - payload.amount
            await db.accounts.update_one(
                {'id': account['id']},
                {'$set': {balance_field: new_balance}}
            )
            # Refresh local snapshot so subsequent currency in same loop has correct numbers
            account[balance_field] = new_balance

            now = datetime.now(timezone.utc).isoformat()
            tx_id = str(uuid.uuid4())
            tx_ref = generate_transaction_reference()
            transaction = {
                'id': tx_id,
                'account_id': account['id'],
                'user_id': uid,
                'transaction_type': 'admin_debit',
                'amount': payload.amount,
                'currency': cur,
                'status': 'completed',
                'description': f'Débito masivo administrativo: {reason}',
                'reason': reason,
                'balance_before': current_balance,
                'balance_after': new_balance,
                'recipient_account_id': None,
                'transaction_reference': tx_ref,
                'admin_id': admin['id'],
                'admin_name': admin.get('name'),
                'admin_email': admin.get('email'),
                'bulk_operation': True,
                'created_at': now,
            }
            await db.transactions.insert_one(transaction)

            # In-app notification (per-currency)
            await create_notification(
                uid,
                'Débito en su cuenta',
                f'Se ha debitado {payload.amount:,.2f} {cur} de su cuenta. Motivo: {reason}'
            )

            summary['debits_executed'] += 1
            if cur == 'USD':
                summary['sum_debited_usd'] += payload.amount
            else:
                summary['sum_debited_eur'] += payload.amount

            # Buffer for consolidated email
            buf = user_email_buffer.setdefault(uid, {
                'user': user, 'lines': [], 'refs': [],
            })
            buf['lines'].append({
                'amount': payload.amount,
                'currency': cur,
                'new_balance': new_balance,
                'reference': tx_ref,
            })
            buf['refs'].append(tx_ref)

    # Send consolidated email per user (one email even if both USD+EUR debited)
    if payload.notify_user and not payload.dry_run:
        for uid, buf in user_email_buffer.items():
            user = buf['user']
            lines_html = ''
            for line in buf['lines']:
                sym = '$' if line['currency'] == 'USD' else '€'
                lines_html += f"""
                <tr>
                    <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto debitado:</td>
                    <td style="color: #f87171; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 16px;">
                        -{sym}{line['amount']:,.2f} {line['currency']}
                    </td>
                </tr>
                <tr>
                    <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Saldo actual:</td>
                    <td style="color: #06b6d4; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{sym}{line['new_balance']:,.2f} {line['currency']}</td>
                </tr>
                <tr>
                    <td style="color: #94a3b8; padding: 8px 0 16px 0; border-bottom: 1px solid #334155;">Referencia:</td>
                    <td style="color: #06b6d4; text-align: right; padding: 8px 0 16px 0; font-family: monospace; font-size: 12px; border-bottom: 1px solid #334155;">{line['reference']}</td>
                </tr>
                """
            content = f"""
                <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
                    Estimado/a <strong style="color: #f59e0b;">{user.get('name', 'cliente')}</strong>,
                </p>
                <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6;">
                    Le informamos que se ha realizado un <strong style="color:#f87171;">débito por mantenimiento de cuenta</strong> en su cuenta LIONSBIT VERIFICACION.
                </p>

                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
                    <tr><td style="padding: 25px;">
                        <p style="color: #94a3b8; font-size: 13px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Detalles del movimiento</p>
                        <table width="100%" cellpadding="0" cellspacing="0">{lines_html}</table>
                    </td></tr>
                </table>

                <div style="background: rgba(245, 158, 11, 0.1); border-left: 4px solid #f59e0b; padding: 18px; border-radius: 8px; margin: 20px 0;">
                    <p style="color: #fbbf24; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">Motivo</p>
                    <p style="color: #fde68a; font-size: 15px; line-height: 1.6; margin: 0;">{reason}</p>
                </div>

                <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin-top: 24px;">
                    Si considera que este débito es incorrecto, contáctenos respondiendo a este correo o desde la sección <strong>Soporte</strong> de su panel.
                </p>
            """
            html = get_email_template(content, "Débito por mantenimiento de cuenta")
            send_email_background(
                user.get('email'),
                f"Débito por mantenimiento de cuenta - LIONSBIT VERIFICACION",
                html,
            )

    summary['finished_at'] = datetime.now(timezone.utc).isoformat()
    summary['emails_sent'] = len(user_email_buffer) if (payload.notify_user and not payload.dry_run) else 0

    # Round
    summary['sum_debited_usd'] = round(summary['sum_debited_usd'], 2)
    summary['sum_debited_eur'] = round(summary['sum_debited_eur'], 2)
    # Limit failures dump
    summary['failures'] = summary['failures'][:50]

    # Audit log of the bulk operation itself
    if not payload.dry_run:
        await db.system_activities.insert_one({
            'id': str(uuid.uuid4()),
            'type': 'bulk_admin_debit',
            'description': f"Débito masivo: {summary['debits_executed']} ops · USD ${summary['sum_debited_usd']:,.2f} + EUR €{summary['sum_debited_eur']:,.2f} · motivo: {reason}",
            'admin_id': admin.get('id'),
            'admin_name': admin.get('name'),
            'metadata': {
                'amount': payload.amount,
                'currencies': currencies,
                'reason': reason,
                'totals': {
                    'executed': summary['debits_executed'],
                    'skipped_insufficient': summary['skipped_insufficient_funds'],
                    'skipped_no_account': summary['skipped_no_account'],
                },
            },
            'created_at': datetime.now(timezone.utc).isoformat(),
        })

    return summary



@router.get("/admin/users/{user_id}/admin-transactions")
async def admin_get_user_admin_transactions(user_id: str, admin: dict = Depends(get_admin_user)):
    """Get full ledger of admin_credit + admin_debit operations for a given user (audit trail)."""
    user = await db.users.find_one({'id': user_id}, {'_id': 0, 'password': 0})
    if not user:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')

    txs = await db.transactions.find(
        {
            'user_id': user_id,
            'transaction_type': {'$in': ['admin_credit', 'admin_debit']}
        },
        {'_id': 0}
    ).sort('created_at', -1).to_list(500)

    totals = {'credit_usd': 0.0, 'credit_eur': 0.0, 'debit_usd': 0.0, 'debit_eur': 0.0}
    for tx in txs:
        bucket = 'credit' if tx.get('transaction_type') == 'admin_credit' else 'debit'
        cur = (tx.get('currency') or 'USD').lower()
        key = f'{bucket}_{cur}'
        if key in totals:
            totals[key] += float(tx.get('amount') or 0)

    return {
        'user': {
            'id': user.get('id'),
            'name': user.get('name'),
            'email': user.get('email'),
        },
        'transactions': txs,
        'totals': totals,
        'count': len(txs),
    }


@router.put("/admin/transaction-status")
async def admin_update_transaction_status(data: AdminUpdateTransactionStatus, admin: dict = Depends(get_admin_user)):
    # Valid statuses for different transaction types
    valid_statuses = [
        'completed', 
        'pending', 
        'pending_tax',      # Tax payment required
        'under_review',     # Under review by admin
        'processing',       # Transfer/withdrawal in process
        'rejected', 
        'crypto_payment_under_review'
    ]
    
    if data.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f'Invalid status. Valid statuses: {", ".join(valid_statuses)}')
    
    # Get transaction to check type
    transaction = await db.transactions.find_one({'id': data.transaction_id}, {'_id': 0})
    if not transaction:
        raise HTTPException(status_code=404, detail='Transaction not found')
    
    result = await db.transactions.update_one(
        {'id': data.transaction_id},
        {'$set': {'status': data.status, 'status_updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    # Create notification for user about status change
    status_messages = {
        'pending': 'Your transaction is pending approval.',
        'pending_tax': 'Your transaction requires tax payment.',
        'under_review': 'Your transaction is under review.',
        'processing': 'Your transaction is being processed.',
        'completed': 'Your transaction has been completed.',
        'rejected': 'Your transaction has been rejected.'
    }
    
    if data.status in status_messages:
        await create_notification(
            transaction['user_id'],
            f'{transaction["transaction_type"].capitalize()} Status Update',
            f'{status_messages[data.status]} Reference: {transaction.get("transaction_reference", transaction["id"][:8])}'
        )
    
    return {'message': 'Transaction status updated', 'transaction_id': data.transaction_id, 'new_status': data.status}

@router.put("/admin/user-role")
async def admin_update_user_role(data: AdminUpdateUserRole, admin: dict = Depends(get_admin_user)):
    if data.role not in ['admin', 'user']:
        raise HTTPException(status_code=400, detail='Invalid role')
    
    result = await db.users.update_one(
        {'id': data.user_id},
        {'$set': {'role': data.role}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail='User not found')
    
    return {'message': 'User role updated', 'user_id': data.user_id}

@router.post("/admin/kyc/action")
async def admin_kyc_action(data: AdminKYCAction, admin: dict = Depends(get_admin_user)):
    """Approve, reject, or set KYC verification to under review"""
    user = await db.users.find_one({'id': data.user_id}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    
    action_timestamp = datetime.now(timezone.utc).isoformat()
    
    if data.action == 'approve':
        update_data = {
            'verification_status': 'verified',
            'kyc_documents.status': 'approved',
            'kyc_documents.reviewed_at': action_timestamp,
            'kyc_documents.reviewed_by': admin['email']
        }
        await db.users.update_one({'id': data.user_id}, {'$set': update_data})
        
        # Update in kyc_submissions collection too
        await db.kyc_submissions.update_one(
            {'user_id': data.user_id},
            {'$set': {'status': 'approved', 'reviewed_at': action_timestamp, 'reviewed_by': admin['email']}}
        )
        
        await create_notification(data.user_id, 'KYC Approved',
            'Congratulations! Your identity verification has been approved. You now have full access to all features.')
        return {'message': 'KYC approved', 'user_id': data.user_id, 'status': 'approved'}
    
    elif data.action == 'under_review':
        update_data = {
            'verification_status': 'pending_verification',
            'kyc_documents.status': 'under_review',
            'kyc_documents.review_started_at': action_timestamp
        }
        await db.users.update_one({'id': data.user_id}, {'$set': update_data})
        
        await db.kyc_submissions.update_one(
            {'user_id': data.user_id},
            {'$set': {'status': 'under_review', 'review_started_at': action_timestamp}}
        )
        
        await create_notification(data.user_id, 'KYC Under Review',
            'Your verification documents are currently being reviewed. We will notify you once the review is complete.')
        return {'message': 'KYC marked as under review', 'user_id': data.user_id, 'status': 'under_review'}
    
    elif data.action == 'reject':
        rejection_reason = data.rejection_reason or 'Documents did not meet verification requirements'
        update_data = {
            'verification_status': 'rejected',
            'kyc_documents.status': 'rejected',
            'kyc_documents.rejection_reason': rejection_reason,
            'kyc_documents.rejected_at': action_timestamp,
            'kyc_documents.reviewed_by': admin['email']
        }
        await db.users.update_one({'id': data.user_id}, {'$set': update_data})
        
        await db.kyc_submissions.update_one(
            {'user_id': data.user_id},
            {'$set': {'status': 'rejected', 'rejection_reason': rejection_reason, 'rejected_at': action_timestamp}}
        )
        
        await create_notification(data.user_id, 'KYC Rejected',
            f'Your identity verification was rejected. Reason: {rejection_reason}. Please submit new documents.')
        return {'message': 'KYC rejected', 'user_id': data.user_id, 'status': 'rejected', 'reason': rejection_reason}
    
    raise HTTPException(status_code=400, detail='Invalid action. Use: approve, under_review, or reject')

# Get all KYC submissions for admin
@router.get("/admin/kyc/submissions")
async def admin_get_kyc_submissions(admin: dict = Depends(get_admin_user)):
    """Get all KYC submissions with full legal records - optimized with aggregation"""
    submissions = await db.kyc_submissions.aggregate([
        {'$sort': {'submitted_at': -1}},
        {'$limit': 100},
        {'$lookup': {
            'from': 'users',
            'localField': 'user_id',
            'foreignField': 'id',
            'as': 'user_info'
        }},
        {'$unwind': {'path': '$user_info', 'preserveNullAndEmptyArrays': True}},
        {'$addFields': {
            'user_name': '$user_info.name',
            'user_email': '$user_info.email'
        }},
        {'$project': {'_id': 0, 'user_info': 0}}
    ]).to_list(100)
    
    return submissions

@router.post("/admin/user/suspend")
async def admin_suspend_user(data: AdminSuspendUser, admin: dict = Depends(get_admin_user)):
    """Suspend or activate user account"""
    user = await db.users.find_one({'id': data.user_id}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    
    if data.action == 'suspend':
        await db.users.update_one(
            {'id': data.user_id},
            {'$set': {'account_status': 'suspended'}}
        )
        await create_notification(data.user_id, 'Account Suspended',
            'Your account has been suspended. Contact support for assistance.')
        return {'message': 'User suspended', 'user_id': data.user_id}
    
    elif data.action == 'activate':
        await db.users.update_one(
            {'id': data.user_id},
            {'$set': {'account_status': 'active'}}
        )
        await create_notification(data.user_id, 'Account Activated',
            'Your account has been reactivated. You can now use all features.')
        return {'message': 'User activated', 'user_id': data.user_id}
    
    raise HTTPException(status_code=400, detail='Invalid action')

@router.post("/admin/transfer/force-release")
async def admin_force_release(data: AdminForceRelease, admin: dict = Depends(get_admin_user)):
    """Force release a pending transfer"""
    tx = await db.transactions.find_one({'id': data.transaction_id}, {'_id': 0})
    if not tx:
        raise HTTPException(status_code=404, detail='Transaction not found')
    
    if tx['transaction_type'] != 'transfer':
        raise HTTPException(status_code=400, detail='Only transfers can be force released')
    
    if tx['status'] == 'completed':
        raise HTTPException(status_code=400, detail='Transfer already completed')
    
    currency = tx['currency']
    balance_field = f'balance_{currency.lower()}'
    
    # Credit recipient
    recipient = await db.accounts.find_one({'id': tx['recipient_account_id']}, {'_id': 0})
    if recipient:
        new_recipient_balance = recipient[balance_field] + tx['amount']
        await db.accounts.update_one(
            {'id': tx['recipient_account_id']},
            {'$set': {balance_field: new_recipient_balance}}
        )
    
    # Update transaction
    await db.transactions.update_one(
        {'id': data.transaction_id},
        {'$set': {
            'status': 'completed',
            'released_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    await create_notification(tx['user_id'], 'Transfer Force Released',
        f'Your transfer has been manually released by admin. Reference: {tx.get("transaction_reference", "")}')
    
    return {'message': 'Transfer force released', 'transaction_id': data.transaction_id}

@router.get("/admin/treasury")
async def admin_get_treasury(admin: dict = Depends(get_admin_user)):
    """Get Government Treasury balance"""
    treasury = await ensure_government_treasury()
    treasury_updated = await db.accounts.find_one({'id': GOVERNMENT_TREASURY_ID}, {'_id': 0})
    return treasury_updated

@router.post("/admin/daily-summary")
async def admin_trigger_daily_summary(admin: dict = Depends(get_admin_user)):
    """Manually trigger the daily activity summary email"""
    await process_daily_admin_summary()
    return {'message': 'Resumen diario enviado exitosamente'}


@router.get("/admin/kyc/pending")
async def admin_get_pending_kyc(admin: dict = Depends(get_admin_user)):
    """Get users with pending KYC"""
    users = await db.users.find(
        {'verification_status': 'pending_verification'},
        {'_id': 0, 'password': 0}
    ).to_list(1000)
    return users

# ==================== ADMIN CRYPTO PAYMENT ROUTES ====================

@router.get("/admin/crypto-payments/pending")
async def admin_get_pending_crypto_payments(admin: dict = Depends(get_admin_user)):
    """Get all pending crypto tax payments for review"""
    payments = await db.crypto_payments.find(
        {'status': 'under_review'},
        {'_id': 0}
    ).sort('submitted_at', -1).to_list(1000)
    
    # Enrich with user and transaction info
    for payment in payments:
        user = await db.users.find_one(
            {'id': payment['user_id']},
            {'_id': 0, 'password': 0}
        )
        transaction = await db.transactions.find_one(
            {'id': payment['transaction_id']},
            {'_id': 0}
        )
        payment['user'] = {'id': user.get('id'), 'name': user.get('name'), 'email': user.get('email')} if user else None
        payment['transaction'] = {'amount': transaction.get('amount'), 'currency': transaction.get('currency'), 'transaction_reference': transaction.get('transaction_reference'), 'tax_required': transaction.get('tax_required')} if transaction else None
    
    return payments

@router.post("/admin/crypto-payments/action")
async def admin_crypto_payment_action(
    data: AdminCryptoPaymentAction,
    admin: dict = Depends(get_admin_user)
):
    """Approve or reject a crypto tax payment"""
    payment = await db.crypto_payments.find_one(
        {'id': data.payment_id},
        {'_id': 0}
    )
    
    if not payment:
        raise HTTPException(status_code=404, detail='Crypto payment not found')
    
    if payment['status'] != 'under_review':
        raise HTTPException(status_code=400, detail='Payment is not under review')
    
    now = datetime.now(timezone.utc).isoformat()
    
    if data.action == 'approve':
        # Get the original transaction
        transaction = await db.transactions.find_one(
            {'id': payment['transaction_id']},
            {'_id': 0}
        )
        
        if not transaction:
            raise HTTPException(status_code=404, detail='Original transaction not found')
        
        # Release the transfer to recipient
        currency = transaction['currency']
        balance_field = f'balance_{currency.lower()}'
        
        recipient = await db.accounts.find_one(
            {'id': transaction['recipient_account_id']},
            {'_id': 0}
        )
        
        if recipient:
            new_recipient_balance = recipient[balance_field] + transaction['amount']
            await db.accounts.update_one(
                {'id': transaction['recipient_account_id']},
                {'$set': {balance_field: new_recipient_balance}}
            )
        
        # Update transaction status
        await db.transactions.update_one(
            {'id': payment['transaction_id']},
            {'$set': {
                'status': 'completed',
                'released_at': now,
                'tax_paid_crypto': payment['amount_sent'],
                'crypto_type': payment['crypto_type'],
                'crypto_txid': payment['txid']
            }}
        )
        
        # Update crypto payment status
        await db.crypto_payments.update_one(
            {'id': data.payment_id},
            {'$set': {
                'status': 'approved',
                'reviewed_at': now,
                'reviewed_by': admin['id']
            }}
        )
        
        # Create history record
        history_record = {
            'id': str(uuid.uuid4()),
            'type': 'crypto_tax_payment_approved',
            'payment_id': data.payment_id,
            'transaction_id': payment['transaction_id'],
            'user_id': payment['user_id'],
            'admin_id': admin['id'],
            'admin_name': admin['name'],
            'crypto_type': payment['crypto_type'],
            'txid': payment['txid'],
            'amount_sent': payment['amount_sent'],
            'created_at': now
        }
        await db.payment_history.insert_one(history_record)
        
        # Notify user
        await create_notification(
            payment['user_id'],
            'Crypto Payment Approved',
            f'Your {payment["crypto_type"]} tax payment has been approved. Transfer released!'
        )
        
        return {'message': 'Crypto payment approved and transfer released', 'status': 'approved'}
    
    elif data.action == 'reject':
        # Update crypto payment status
        await db.crypto_payments.update_one(
            {'id': data.payment_id},
            {'$set': {
                'status': 'rejected',
                'reviewed_at': now,
                'reviewed_by': admin['id'],
                'rejection_reason': data.rejection_reason or 'Payment could not be verified'
            }}
        )
        
        # Revert transaction to pending_tax
        await db.transactions.update_one(
            {'id': payment['transaction_id']},
            {'$set': {'status': 'pending_tax'}}
        )
        
        # Notify user
        reason = data.rejection_reason or 'Payment could not be verified'
        await create_notification(
            payment['user_id'],
            'Crypto Payment Rejected',
            f'Your {payment["crypto_type"]} payment was rejected. Reason: {reason}'
        )
        
        return {'message': 'Crypto payment rejected', 'status': 'rejected', 'reason': reason}
    
    else:
        raise HTTPException(status_code=400, detail='Invalid action. Use "approve" or "reject"')

@router.get("/admin/crypto-payments/history")
async def admin_get_crypto_payments_history(admin: dict = Depends(get_admin_user)):
    """Get all crypto payment history"""
    payments = await db.crypto_payments.find(
        {},
        {'_id': 0, 'proof_image': 0}
    ).sort('submitted_at', -1).to_list(1000)
    
    # Enrich with user info
    for payment in payments:
        user = await db.users.find_one(
            {'id': payment['user_id']},
            {'_id': 0, 'name': 1, 'email': 1}
        )
        payment['user'] = user
    
    return payments

@router.get("/admin/crypto-payments/stats")
async def admin_get_crypto_stats(admin: dict = Depends(get_admin_user)):
    """Get comprehensive crypto payment statistics"""
    from datetime import timedelta
    
    all_payments = await db.crypto_payments.find({}, {'_id': 0, 'proof_image': 0}).to_list(10000)
    
    # Initialize stats
    stats = {
        'total_payments': len(all_payments),
        'by_status': {'under_review': 0, 'approved': 0, 'rejected': 0},
        'by_crypto': {},
        'recent_trend': [],
        'top_users': [],
        'approval_rate': 0,
        'avg_processing_time': None
    }
    
    # Process payments
    crypto_totals = {'BTC': {'count': 0, 'approved': 0}, 'ETH': {'count': 0, 'approved': 0}, 
                    'USDT': {'count': 0, 'approved': 0}, 'LTC': {'count': 0, 'approved': 0}}
    user_counts = {}
    processing_times = []
    
    for payment in all_payments:
        # Status counts
        status = payment.get('status', 'under_review')
        stats['by_status'][status] = stats['by_status'].get(status, 0) + 1
        
        # Crypto type counts
        crypto = payment.get('crypto_type', 'BTC')
        if crypto not in crypto_totals:
            crypto_totals[crypto] = {'count': 0, 'approved': 0}
        crypto_totals[crypto]['count'] += 1
        if status == 'approved':
            crypto_totals[crypto]['approved'] += 1
        
        # User counts
        user_id = payment.get('user_id')
        if user_id:
            user_counts[user_id] = user_counts.get(user_id, 0) + 1
        
        # Processing time (for approved/rejected)
        if payment.get('reviewed_at') and payment.get('submitted_at'):
            try:
                submitted = datetime.fromisoformat(payment['submitted_at'].replace('Z', '+00:00'))
                reviewed = datetime.fromisoformat(payment['reviewed_at'].replace('Z', '+00:00'))
                diff = (reviewed - submitted).total_seconds() / 3600  # hours
                processing_times.append(diff)
            except:
                pass
    
    # Calculate by crypto stats
    for crypto, data in crypto_totals.items():
        if data['count'] > 0:
            stats['by_crypto'][crypto] = {
                'total': data['count'],
                'approved': data['approved'],
                'rate': round((data['approved'] / data['count']) * 100, 1)
            }
    
    # Approval rate
    total_processed = stats['by_status'].get('approved', 0) + stats['by_status'].get('rejected', 0)
    if total_processed > 0:
        stats['approval_rate'] = round((stats['by_status'].get('approved', 0) / total_processed) * 100, 1)
    
    # Average processing time
    if processing_times:
        stats['avg_processing_time'] = round(sum(processing_times) / len(processing_times), 2)
    
    # Top users
    top_user_ids = sorted(user_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    for user_id, count in top_user_ids:
        user = await db.users.find_one({'id': user_id}, {'_id': 0, 'name': 1, 'email': 1})
        if user:
            stats['top_users'].append({
                'name': user.get('name'),
                'email': user.get('email'),
                'payment_count': count
            })
    
    # Recent trend (last 30 days)
    now = datetime.now(timezone.utc)
    for i in range(30):
        day = now - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        
        day_payments = [p for p in all_payments 
                       if p.get('submitted_at') and 
                       day_start <= datetime.fromisoformat(p['submitted_at'].replace('Z', '+00:00')) < day_end]
        
        stats['recent_trend'].append({
            'date': day_start.strftime('%Y-%m-%d'),
            'count': len(day_payments),
            'approved': len([p for p in day_payments if p.get('status') == 'approved'])
        })
    
    stats['recent_trend'].reverse()  # Oldest first
    
    return stats

# ==================== ADMIN MANUAL TAX PAYMENT ====================

@router.post("/admin/tax-payment")
async def admin_add_manual_tax_payment(
    data: AdminManualTaxPayment,
    admin: dict = Depends(get_admin_user)
):
    """Admin manually registers a tax payment received from user (crypto or other methods)"""
    
    # Find the transaction
    transaction = await db.transactions.find_one({'id': data.transaction_id}, {'_id': 0})
    
    if not transaction:
        raise HTTPException(status_code=404, detail='Transacción no encontrada')
    
    if transaction['status'] != 'pending_tax':
        raise HTTPException(status_code=400, detail='Esta transacción no requiere pago de impuesto')
    
    # Validate minimum payment
    if data.amount < MIN_TAX_PAYMENT:
        raise HTTPException(status_code=400, detail=f'El pago mínimo es ${MIN_TAX_PAYMENT:.2f} USD')
    
    # Get user info
    user = await db.users.find_one({'id': transaction['user_id']}, {'_id': 0, 'password': 0})
    if not user:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Calculate new tax paid amount
    current_tax_paid = transaction.get('tax_paid', 0)
    tax_required = transaction.get('tax_required', TAX_AMOUNT)
    new_tax_paid = min(current_tax_paid + data.amount, tax_required)  # Don't exceed required
    remaining = max(0, tax_required - new_tax_paid)
    
    # Record the manual payment
    manual_payment_record = {
        'id': str(uuid.uuid4()),
        'transaction_id': data.transaction_id,
        'user_id': transaction['user_id'],
        'amount': data.amount,
        'payment_method': data.payment_method,
        'crypto_type': data.crypto_type,
        'txid': data.txid,
        'notes': data.notes,
        'registered_by': admin['id'],
        'registered_by_name': admin['name'],
        'created_at': now
    }
    await db.manual_tax_payments.insert_one(manual_payment_record)
    
    # Update transaction
    update_fields = {
        'tax_paid': new_tax_paid,
        'last_tax_payment_at': now
    }
    
    # Check if tax is fully paid
    if new_tax_paid >= tax_required:
        if transaction['transaction_type'] == 'withdraw':
            update_fields['status'] = 'under_review'
            update_fields['tax_completed_at'] = now
            
            await create_notification(
                transaction['user_id'],
                'Impuesto Completado - Retiro en Revisión',
                f'El impuesto de su retiro de {transaction["amount"]} {transaction["currency"]} ha sido completado. Su retiro está ahora en revisión.'
            )
            
            # Send email notification
            await send_withdrawal_status_email(
                user['email'], user['name'], 
                transaction['amount'], transaction['currency'], 
                'under_review'
            )
        
        elif transaction['transaction_type'] == 'transfer':
            # Release the transfer
            recipient = await db.accounts.find_one(
                {'id': transaction['recipient_account_id']},
                {'_id': 0}
            )
            
            if recipient:
                currency = transaction['currency']
                balance_field = f'balance_{currency.lower()}'
                new_recipient_balance = recipient[balance_field] + transaction['amount']
                await db.accounts.update_one(
                    {'id': transaction['recipient_account_id']},
                    {'$set': {balance_field: new_recipient_balance}}
                )
            
            update_fields['status'] = 'completed'
            update_fields['released_at'] = now
            
            await create_notification(
                transaction['user_id'],
                'Transferencia Liberada',
                f'Su transferencia de {transaction["amount"]} {transaction["currency"]} ha sido liberada.'
            )
    else:
        # Partial payment notification
        await create_notification(
            transaction['user_id'],
            'Abono al Impuesto Recibido',
            f'Hemos registrado un abono de ${data.amount:.2f} USD a su impuesto. Restante: ${remaining:.2f} USD'
        )
        
        # Send email for partial payment
        await send_tax_payment_received_email(
            user['email'], user['name'],
            data.amount, tax_required, new_tax_paid,
            transaction['amount'], transaction['currency']
        )
    
    await db.transactions.update_one({'id': data.transaction_id}, {'$set': update_fields})
    
    # Log system activity for tax payment
    await log_system_activity(
        activity_type='tax_payment',
        description=f'Pago de impuesto registrado: ${data.amount:,.2f} USD para {user["name"]}',
        user_id=transaction['user_id'],
        user_name=user['name'],
        user_email=user['email'],
        metadata={
            'amount': data.amount,
            'method': data.payment_method,
            'crypto_type': data.crypto_type,
            'admin': admin['name']
        }
    )
    
    return {
        'message': 'Pago de impuesto registrado exitosamente',
        'payment_id': manual_payment_record['id'],
        'tax_paid': new_tax_paid,
        'tax_required': tax_required,
        'remaining': remaining,
        'status': update_fields.get('status', 'pending_tax')
    }

@router.get("/admin/pending-withdrawals")
async def admin_get_pending_withdrawals_detailed(admin: dict = Depends(get_admin_user)):
    """Get all withdrawals with pending tax payments with detailed info"""
    
    transactions = await db.transactions.find(
        {
            'transaction_type': 'withdraw',
            'status': {'$in': ['pending_tax', 'under_review', 'processing']}
        },
        {'_id': 0}
    ).sort('created_at', -1).to_list(1000)
    
    enriched = []
    for tx in transactions:
        # Get user info
        user = await db.users.find_one({'id': tx['user_id']}, {'_id': 0, 'password': 0})
        
        # Get manual payment history
        manual_payments = await db.manual_tax_payments.find(
            {'transaction_id': tx['id']},
            {'_id': 0}
        ).to_list(100)
        
        # Get crypto payment history
        crypto_payments = await db.crypto_payments.find(
            {'transaction_id': tx['id']},
            {'_id': 0, 'proof_image': 0}
        ).to_list(100)
        
        # Calculate time since creation
        created_at = datetime.fromisoformat(tx['created_at'].replace('Z', '+00:00'))
        hours_since_creation = (datetime.now(timezone.utc) - created_at).total_seconds() / 3600
        hours_remaining = max(0, 72 - hours_since_creation)
        
        enriched.append({
            **tx,
            'user': {
                'id': user['id'],
                'name': user['name'],
                'email': user['email']
            } if user else None,
            'manual_payments': manual_payments,
            'crypto_payments': crypto_payments,
            'total_payments_count': len(manual_payments) + len(crypto_payments),
            'hours_since_creation': round(hours_since_creation, 1),
            'hours_remaining': round(hours_remaining, 1),
            'is_expiring_soon': hours_remaining < 24
        })
    
    return enriched

@router.get("/admin/manual-payments")
async def admin_get_manual_payments(admin: dict = Depends(get_admin_user)):
    """Get all manual tax payments history"""
    payments = await db.manual_tax_payments.find({}, {'_id': 0}).sort('created_at', -1).to_list(1000)
    
    # Enrich with user and transaction info
    for payment in payments:
        user = await db.users.find_one({'id': payment['user_id']}, {'_id': 0, 'name': 1, 'email': 1})
        tx = await db.transactions.find_one({'id': payment['transaction_id']}, {'_id': 0, 'amount': 1, 'currency': 1, 'transaction_reference': 1})
        payment['user'] = user
        payment['transaction'] = tx
    
    return payments

# ==================== ADMIN NOTIFICATIONS & ACTIVITY MONITOR ====================

@router.get("/admin/notifications")
async def admin_get_notifications(admin: dict = Depends(get_admin_user)):
    """Get all admin notifications"""
    notifications = await db.admin_notifications.find(
        {},
        {'_id': 0}
    ).sort('created_at', -1).to_list(100)
    return notifications

@router.put("/admin/notifications/{notification_id}/read")
async def admin_mark_notification_read(notification_id: str, admin: dict = Depends(get_admin_user)):
    """Mark admin notification as read"""
    await db.admin_notifications.update_one(
        {'id': notification_id},
        {'$set': {'read': True}}
    )
    return {'message': 'Notification marked as read'}

@router.put("/admin/notifications/read-all")
async def admin_mark_all_notifications_read(admin: dict = Depends(get_admin_user)):
    """Mark all admin notifications as read"""
    await db.admin_notifications.update_many(
        {'read': False},
        {'$set': {'read': True}}
    )
    return {'message': 'All notifications marked as read'}

@router.get("/admin/notifications/unread-count")
async def admin_get_unread_count(admin: dict = Depends(get_admin_user)):
    """Get count of unread admin notifications"""
    count = await db.admin_notifications.count_documents({'read': False})
    return {'unread_count': count}

@router.get("/admin/activity")
async def admin_get_activity(
    admin: dict = Depends(get_admin_user),
    limit: int = 100,
    activity_type: str = None
):
    """Get system activity log"""
    query = {}
    if activity_type:
        query['type'] = activity_type
    
    activities = await db.system_activity.find(
        query,
        {'_id': 0}
    ).sort('created_at', -1).to_list(limit)
    
    return activities

@router.get("/admin/activity/stats")
async def admin_get_activity_stats(admin: dict = Depends(get_admin_user)):
    """Get activity statistics"""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    
    # Get today's activities
    today_activities = await db.system_activity.find(
        {'created_at': {'$gte': today_start.isoformat()}},
        {'_id': 0}
    ).to_list(1000)
    
    # Get this week's activities
    week_activities = await db.system_activity.find(
        {'created_at': {'$gte': week_start.isoformat()}},
        {'_id': 0}
    ).to_list(1000)
    
    # Count by type
    today_by_type = {}
    for activity in today_activities:
        t = activity['type']
        today_by_type[t] = today_by_type.get(t, 0) + 1
    
    week_by_type = {}
    for activity in week_activities:
        t = activity['type']
        week_by_type[t] = week_by_type.get(t, 0) + 1
    
    # Total counts
    total_users = await db.users.count_documents({'role': 'user'})
    total_transactions = await db.transactions.count_documents({})
    pending_kyc = await db.users.count_documents({'verification_status': {'$in': ['pending', 'under_review']}})
    pending_withdrawals = await db.transactions.count_documents({
        'transaction_type': 'withdraw',
        'status': {'$in': ['pending_tax', 'under_review', 'processing']}
    })
    
    return {
        'today': {
            'total': len(today_activities),
            'by_type': today_by_type
        },
        'this_week': {
            'total': len(week_activities),
            'by_type': week_by_type
        },
        'totals': {
            'users': total_users,
            'transactions': total_transactions,
            'pending_kyc': pending_kyc,
            'pending_withdrawals': pending_withdrawals
        }
    }


@router.get("/admin/activity/frequent-users")
async def admin_frequent_users(admin: dict = Depends(get_admin_user)):
    """Get users ranked by login frequency (last 30 days)"""
    now = datetime.now(timezone.utc)
    thirty_days_ago = (now - timedelta(days=30)).isoformat()

    # Aggregate logins per user in last 30 days
    login_activities = await db.system_activity.find(
        {'type': 'login', 'created_at': {'$gte': thirty_days_ago}},
        {'_id': 0, 'user_id': 1, 'user_name': 1, 'user_email': 1, 'created_at': 1}
    ).to_list(5000)

    user_logins = {}
    for act in login_activities:
        uid = act.get('user_id')
        if not uid:
            continue
        if uid not in user_logins:
            user_logins[uid] = {
                'user_id': uid,
                'user_name': act.get('user_name', ''),
                'user_email': act.get('user_email', ''),
                'login_count': 0,
                'last_login': act.get('created_at', '')
            }
        user_logins[uid]['login_count'] += 1
        if act.get('created_at', '') > user_logins[uid]['last_login']:
            user_logins[uid]['last_login'] = act['created_at']

    ranked = sorted(user_logins.values(), key=lambda x: x['login_count'], reverse=True)
    return ranked[:20]


# ==================== BROADCAST / MASS NOTIFICATION ====================

@router.post("/admin/broadcast")
async def admin_broadcast_message(data: dict, admin: dict = Depends(get_admin_user)):
    """Send an in-app notification and/or email to all registered users (excluding admins).

    Expected payload:
    {
      "title": str,
      "message": str,
      "send_in_app": bool,
      "send_email": bool,
      "audience": "all" | "kyc_verified" | "withdrawers"  (default "all")
    }
    """
    title = (data.get('title') or '').strip()
    message = (data.get('message') or '').strip()
    send_in_app = bool(data.get('send_in_app', True))
    send_email_flag = bool(data.get('send_email', False))
    audience = data.get('audience', 'all')

    if not title or not message:
        raise HTTPException(status_code=400, detail='Titulo y mensaje son obligatorios')
    if len(title) > 200:
        raise HTTPException(status_code=400, detail='Titulo demasiado largo (max 200)')
    if len(message) > 5000:
        raise HTTPException(status_code=400, detail='Mensaje demasiado largo (max 5000)')
    if not send_in_app and not send_email_flag:
        raise HTTPException(status_code=400, detail='Debe seleccionar al menos un canal')

    # Build audience query
    query = {'role': {'$ne': 'admin'}}
    if audience == 'kyc_verified':
        query['kyc_status'] = 'approved'
    elif audience == 'withdrawers':
        # users who have at least one withdraw transaction
        withdrawer_ids = await db.transactions.distinct('user_id', {'type': 'withdraw'})
        query['id'] = {'$in': withdrawer_ids}

    users = await db.users.find(query, {'_id': 0, 'id': 1, 'email': 1, 'name': 1}).to_list(100000)

    in_app_count = 0
    email_count = 0

    # In-app notifications: bulk insert for speed
    if send_in_app and users:
        now_iso = datetime.now(timezone.utc).isoformat()
        docs = [{
            'id': str(uuid.uuid4()),
            'user_id': u['id'],
            'title': title,
            'message': message,
            'read': False,
            'created_at': now_iso,
            'broadcast': True,
        } for u in users]
        if docs:
            await db.notifications.insert_many(docs)
            in_app_count = len(docs)

    # Emails: fire-and-forget background tasks
    if send_email_flag and users:
        # Build email HTML
        formatted = message.replace('\n', '<br/>')
        content = f"""
            <p style=\"color: #e2e8f0; font-size: 16px; line-height: 1.6;\">Estimado cliente,</p>
            <p style=\"color: #e2e8f0; font-size: 15px; line-height: 1.75; white-space: pre-wrap;\">{formatted}</p>
            <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin: 25px 0;\">
                <tr><td align=\"center\">
                    <a href=\"https://paylionsbit.es\" style=\"display: inline-block; background: linear-gradient(135deg, #14549C, #0b3f75); color: white; text-decoration: none; padding: 14px 35px; border-radius: 8px; font-weight: bold;\">Acceder a la plataforma</a>
                </td></tr>
            </table>
            <p style=\"color: #64748b; font-size: 12px; margin-top: 25px;\">Atentamente,<br/>Equipo de Soporte - LIONSBIT VERIFICACION</p>
        """
        html = get_email_template(content, title)
        for u in users:
            if u.get('email'):
                send_email_background(u['email'], f"{title} - LIONSBIT VERIFICACION", html)
                email_count += 1

    # Log activity
    await log_system_activity(
        activity_type='admin_broadcast',
        description=f"Difusion: {title}",
        user_id=admin.get('id'),
        user_name=admin.get('name'),
        user_email=admin.get('email'),
        metadata={
            'audience': audience,
            'recipients': len(users),
            'in_app_sent': in_app_count,
            'emails_queued': email_count,
            'send_in_app': send_in_app,
            'send_email': send_email_flag,
        }
    )

    return {
        'success': True,
        'recipients': len(users),
        'in_app_sent': in_app_count,
        'emails_queued': email_count,
    }


@router.get("/admin/broadcast/history")
async def admin_get_broadcast_history(admin: dict = Depends(get_admin_user)):
    """Return history of past broadcasts (latest 50)."""
    history = await db.system_activity.find(
        {'type': 'admin_broadcast'},
        {'_id': 0}
    ).sort('created_at', -1).limit(50).to_list(50)
    return history



# ==================== HEALTH / INTEGRATIONS DASHBOARD ====================

@router.get("/admin/health")
async def admin_health(admin: dict = Depends(get_admin_user)):
    """Aggregate health status of all integrations: MongoDB, Resend, Scheduler.

    Used by the admin Health dashboard to surface silent failures in real time.
    """
    from config import RESEND_API_KEY
    import time

    # ---- MongoDB ping & basic stats
    mongo_info: dict = {'status': 'down', 'latency_ms': None, 'error': None,
                        'collections': {}}
    try:
        t0 = time.perf_counter()
        await db.command('ping')
        mongo_info['latency_ms'] = round((time.perf_counter() - t0) * 1000, 1)
        mongo_info['status'] = 'up'
        # Lightweight counts for key collections
        for coll in ('users', 'transactions', 'demo_accounts', 'notifications',
                     'email_logs', 'system_activity'):
            try:
                mongo_info['collections'][coll] = await db[coll].estimated_document_count()
            except Exception:
                mongo_info['collections'][coll] = None
    except Exception as e:
        mongo_info['error'] = str(e)[:300]

    # ---- Resend: key + last emails
    resend_info: dict = {
        'status': 'disabled',
        'key_configured': bool(RESEND_API_KEY),
        'stats_24h': {'sent': 0, 'failed': 0, 'skipped': 0},
        'recent': [],
        'last_failure': None,
    }
    if RESEND_API_KEY:
        resend_info['status'] = 'configured'

    try:
        since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        cursor = db.email_logs.find(
            {'created_at': {'$gte': since}},
            {'_id': 0}
        )
        logs_24h = await cursor.to_list(length=2000)
        for log in logs_24h:
            s = log.get('status', 'unknown')
            if s in resend_info['stats_24h']:
                resend_info['stats_24h'][s] += 1
        # Last 20 overall
        resend_info['recent'] = await db.email_logs.find(
            {}, {'_id': 0}
        ).sort('created_at', -1).limit(20).to_list(20)
        # Latest failure for spotlight
        last_fail = await db.email_logs.find_one(
            {'status': 'failed'}, {'_id': 0}, sort=[('created_at', -1)]
        )
        resend_info['last_failure'] = last_fail
        # If we've had any success in the last 24h, mark as healthy
        if resend_info['stats_24h']['sent'] > 0 and RESEND_API_KEY:
            resend_info['status'] = 'healthy'
        elif resend_info['stats_24h']['failed'] > 0 and resend_info['stats_24h']['sent'] == 0:
            resend_info['status'] = 'degraded'
    except Exception as e:
        resend_info['error'] = str(e)[:300]

    # ---- Scheduler (APScheduler)
    scheduler_info: dict = {'status': 'unknown', 'jobs': [], 'error': None}
    try:
        import server as server_mod  # import lazy to avoid circular at startup
        sched = getattr(server_mod, 'scheduler', None)
        if sched is None:
            scheduler_info['status'] = 'not_found'
        else:
            scheduler_info['status'] = 'running' if sched.running else 'stopped'
            jobs_list = []
            for j in sched.get_jobs():
                nxt = j.next_run_time.isoformat() if j.next_run_time else None
                jobs_list.append({
                    'id': j.id,
                    'name': j.name or j.id,
                    'next_run_at': nxt,
                    'trigger': str(j.trigger),
                })
            scheduler_info['jobs'] = jobs_list
    except Exception as e:
        scheduler_info['error'] = str(e)[:300]

    # ---- Trading Bot global status (quick snapshot)
    bot_info: dict = {'users_with_bot': 0, 'active_bots': 0, 'error': None}
    try:
        bot_info['users_with_bot'] = await db.bot_configs.estimated_document_count()
        bot_info['active_bots'] = await db.bot_configs.count_documents({'enabled': True})
    except Exception as e:
        bot_info['error'] = str(e)[:300]

    # ---- Telegram alerts status (read-only visibility for admins)
    telegram_info: dict = {'configured': False, 'alert_level': None}
    try:
        from services.alerts import is_configured as telegram_is_configured, TELEGRAM_ALERT_LEVEL
        telegram_info['configured'] = telegram_is_configured()
        telegram_info['alert_level'] = TELEGRAM_ALERT_LEVEL
    except Exception:
        pass

    # ---- Overall verdict
    overall = 'healthy'
    if mongo_info['status'] != 'up':
        overall = 'down'
    elif resend_info['status'] == 'degraded' or scheduler_info['status'] not in ('running', 'unknown'):
        overall = 'degraded'

    return {
        'overall': overall,
        'checked_at': datetime.now(timezone.utc).isoformat(),
        'mongo': mongo_info,
        'resend': resend_info,
        'scheduler': scheduler_info,
        'trading_bot': bot_info,
        'telegram': telegram_info,
    }


# ==================== UTILITY ROUTES ====================


# ==================== ADMIN OPERATIONS LEDGER (debits + credits with filters + CSV) ====================

import csv
import io
from fastapi.responses import StreamingResponse


def _build_admin_ops_filter(
    type_: str,
    date_from: Optional[str],
    date_to: Optional[str],
    admin_id: Optional[str],
    user_search: Optional[str],
    currency: Optional[str],
    min_amount: Optional[float],
    max_amount: Optional[float],
    reason_contains: Optional[str],
):
    """Build a MongoDB filter dict for admin_credit/admin_debit queries."""
    if type_ in ('debit', 'admin_debit'):
        types = ['admin_debit']
    elif type_ in ('credit', 'admin_credit'):
        types = ['admin_credit']
    else:
        types = ['admin_credit', 'admin_debit']

    flt: dict = {'transaction_type': {'$in': types}}

    if date_from or date_to:
        date_filter = {}
        if date_from:
            date_filter['$gte'] = date_from
        if date_to:
            d = date_to
            if len(d) == 10:
                d = f'{d}T23:59:59.999999+00:00'
            date_filter['$lte'] = d
        flt['created_at'] = date_filter

    if admin_id:
        flt['admin_id'] = admin_id

    if currency and currency.upper() in ('USD', 'EUR'):
        flt['currency'] = currency.upper()

    if min_amount is not None:
        flt.setdefault('amount', {})
        flt['amount']['$gte'] = float(min_amount)
    if max_amount is not None:
        flt.setdefault('amount', {})
        flt['amount']['$lte'] = float(max_amount)

    if reason_contains:
        flt['$or'] = [
            {'reason': {'$regex': reason_contains, '$options': 'i'}},
            {'description': {'$regex': reason_contains, '$options': 'i'}},
        ]

    return flt, (user_search or '').strip().lower()


async def _query_admin_ops(flt: dict, user_search_lower: str, skip: int = 0, limit: int = 200):
    """Aggregate transactions joining users, applying user_search post-filter."""
    pipeline = [
        {'$match': flt},
        {'$sort': {'created_at': -1}},
        {'$lookup': {
            'from': 'users',
            'localField': 'user_id',
            'foreignField': 'id',
            'as': '_user',
        }},
        {'$unwind': {'path': '$_user', 'preserveNullAndEmptyArrays': True}},
        {'$addFields': {
            'user_name': '$_user.name',
            'user_email': '$_user.email',
        }},
        {'$project': {'_id': 0, '_user': 0}},
    ]
    cursor = db.transactions.aggregate(pipeline)
    results = await cursor.to_list(length=20000)

    if user_search_lower:
        results = [
            r for r in results
            if user_search_lower in (r.get('user_name') or '').lower()
            or user_search_lower in (r.get('user_email') or '').lower()
        ]

    total = len(results)
    paginated = results[skip: skip + limit]
    return paginated, total, results


@router.get("/admin/admin-ops")
async def admin_get_admin_ops(
    admin: dict = Depends(get_admin_user),
    type: str = Query('all', description="all | debit | credit"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    admin_id: Optional[str] = Query(None),
    user_search: Optional[str] = Query(None),
    currency: Optional[str] = Query(None),
    min_amount: Optional[float] = Query(None),
    max_amount: Optional[float] = Query(None),
    reason_contains: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
):
    flt, user_search_lower = _build_admin_ops_filter(
        type, date_from, date_to, admin_id, user_search,
        currency, min_amount, max_amount, reason_contains,
    )
    paginated, total, full = await _query_admin_ops(flt, user_search_lower, skip, limit)

    totals = {
        'count_credit': 0, 'count_debit': 0,
        'sum_credit_usd': 0.0, 'sum_credit_eur': 0.0,
        'sum_debit_usd': 0.0, 'sum_debit_eur': 0.0,
        'net_usd': 0.0, 'net_eur': 0.0,
    }
    for r in full:
        cur = (r.get('currency') or 'USD').lower()
        amt = float(r.get('amount') or 0)
        if r.get('transaction_type') == 'admin_debit':
            totals['count_debit'] += 1
            totals[f'sum_debit_{cur}'] = totals.get(f'sum_debit_{cur}', 0.0) + amt
        else:
            totals['count_credit'] += 1
            totals[f'sum_credit_{cur}'] = totals.get(f'sum_credit_{cur}', 0.0) + amt
    totals['net_usd'] = round(totals['sum_credit_usd'] - totals['sum_debit_usd'], 2)
    totals['net_eur'] = round(totals['sum_credit_eur'] - totals['sum_debit_eur'], 2)
    for k in ('sum_credit_usd', 'sum_credit_eur', 'sum_debit_usd', 'sum_debit_eur'):
        totals[k] = round(totals[k], 2)

    admin_options = []
    seen = set()
    for r in full:
        aid = r.get('admin_id')
        if aid and aid not in seen:
            seen.add(aid)
            admin_options.append({
                'admin_id': aid,
                'admin_name': r.get('admin_name') or 'Admin',
                'admin_email': r.get('admin_email') or '',
            })

    return {
        'rows': paginated,
        'total': total,
        'totals': totals,
        'admin_options': admin_options,
        'pagination': {'skip': skip, 'limit': limit, 'has_more': (skip + limit) < total},
    }


@router.get("/admin/admin-ops/export.csv")
async def admin_export_admin_ops_csv(
    admin: dict = Depends(get_admin_user),
    type: str = Query('all'),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    admin_id: Optional[str] = Query(None),
    user_search: Optional[str] = Query(None),
    currency: Optional[str] = Query(None),
    min_amount: Optional[float] = Query(None),
    max_amount: Optional[float] = Query(None),
    reason_contains: Optional[str] = Query(None),
):
    flt, user_search_lower = _build_admin_ops_filter(
        type, date_from, date_to, admin_id, user_search,
        currency, min_amount, max_amount, reason_contains,
    )
    _, _, rows = await _query_admin_ops(flt, user_search_lower, skip=0, limit=20000)

    buf = io.StringIO()
    buf.write('\ufeff')  # UTF-8 BOM for Excel
    writer = csv.writer(buf, delimiter=',', quoting=csv.QUOTE_MINIMAL, lineterminator='\n')
    writer.writerow([
        'Fecha (UTC)', 'Tipo', 'Usuario', 'Email Usuario', 'Monto', 'Moneda',
        'Motivo', 'Admin', 'Email Admin', 'Saldo Antes', 'Saldo Despues', 'Referencia',
    ])
    for r in rows:
        is_debit = r.get('transaction_type') == 'admin_debit'
        signed_amount = -float(r.get('amount') or 0) if is_debit else float(r.get('amount') or 0)
        writer.writerow([
            r.get('created_at', ''),
            'DEBITO' if is_debit else 'CREDITO',
            r.get('user_name') or '',
            r.get('user_email') or '',
            f'{signed_amount:.2f}',
            r.get('currency') or '',
            (r.get('reason') or r.get('description') or '').replace('\n', ' ').strip(),
            r.get('admin_name') or '',
            r.get('admin_email') or '',
            f'{float(r.get("balance_before") or 0):.2f}' if r.get('balance_before') is not None else '',
            f'{float(r.get("balance_after") or 0):.2f}' if r.get('balance_after') is not None else '',
            r.get('transaction_reference') or '',
        ])

    csv_bytes = buf.getvalue().encode('utf-8')
    today = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')
    filename = f'admin_ops_{today}.csv'

    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type='text/csv; charset=utf-8',
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
            'Cache-Control': 'no-store',
        },
    )


# ==================== MAINTENANCE MODE TOGGLE ====================

from pydantic import BaseModel as _BM


class MaintenanceToggle(_BM):
    enabled: bool
    message: Optional[str] = None
    estimated_end: Optional[str] = None


@router.post("/admin/maintenance")
async def admin_set_maintenance(payload: MaintenanceToggle, admin: dict = Depends(get_admin_user)):
    """Enable / disable platform-wide maintenance mode.
    When enabled, frontend shows a banner and degrades gracefully.
    Stored in `system_flags` collection so it survives restarts.
    """
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        'key': 'maintenance',
        'enabled': bool(payload.enabled),
        'message': (payload.message or '').strip() or 'Mantenimiento programado en curso',
        'started_at': now if payload.enabled else None,
        'estimated_end': payload.estimated_end,
        'toggled_by': admin.get('id'),
        'toggled_at': now,
    }
    await db.system_flags.update_one({'key': 'maintenance'}, {'$set': doc}, upsert=True)
    return {'status': 'ok', **doc}


@router.get("/admin/maintenance")
async def admin_get_maintenance(admin: dict = Depends(get_admin_user)):
    doc = await db.system_flags.find_one({'key': 'maintenance'}, {'_id': 0})
    return doc or {'enabled': False}

# ==================== SYSTEM STATUS PANEL ====================

@router.get("/admin/system-status")
async def admin_system_status(admin: dict = Depends(get_admin_user)):
    """Aggregated system status for the admin panel."""
    import time as _ts
    now = datetime.now(timezone.utc)
    since_24h = (now - timedelta(hours=24)).isoformat()
    since_1h = (now - timedelta(hours=1)).isoformat()

    # DB ping
    t0 = _ts.perf_counter()
    try:
        await db.command('ping')
        db_latency = round((_ts.perf_counter() - t0) * 1000, 2)
        db_ok = True
    except Exception as exc:
        db_latency = -1
        db_ok = False
        logging.error(f'[system-status] DB ping failed: {exc}')

    # Maintenance flag
    maint = await db.system_flags.find_one({'key': 'maintenance'}, {'_id': 0})

    # Admin request logs — recent + counters
    recent_logs = await db.admin_request_logs.find(
        {}, {'_id': 0}
    ).sort('created_at', -1).limit(50).to_list(50)

    errors_24h = await db.admin_request_logs.count_documents({
        'created_at': {'$gte': since_24h},
        'status': {'$gte': 500},
    })
    requests_1h = await db.admin_request_logs.count_documents({
        'created_at': {'$gte': since_1h},
    })
    requests_24h = await db.admin_request_logs.count_documents({
        'created_at': {'$gte': since_24h},
    })

    # Average latency last hour (best-effort aggregation)
    avg_latency = 0
    try:
        pipeline = [
            {'$match': {'created_at': {'$gte': since_1h}}},
            {'$group': {'_id': None, 'avg': {'$avg': '$elapsed_ms'}}},
        ]
        async for r in db.admin_request_logs.aggregate(pipeline):
            avg_latency = round(float(r.get('avg') or 0), 1)
    except Exception:
        pass

    # Recent client errors (frontend → backend)
    client_errors = await db.client_errors.find(
        {}, {'_id': 0}
    ).sort('created_at', -1).limit(20).to_list(20)
    client_errors_24h_count = await db.client_errors.count_documents({
        'created_at': {'$gte': since_24h},
    })

    return {
        'timestamp': now.isoformat(),
        'db': {'ok': db_ok, 'latency_ms': db_latency},
        'maintenance': maint or {'enabled': False},
        'admin_requests': {
            'last_50': recent_logs,
            'errors_24h': errors_24h,
            'count_1h': requests_1h,
            'count_24h': requests_24h,
            'avg_latency_1h_ms': avg_latency,
        },
        'client_errors': {
            'recent': client_errors,
            'count_24h': client_errors_24h_count,
        },
    }


# ==================== UNIFIED PROOFS VIEWER ====================

@router.get("/admin/proofs")
async def admin_list_proofs(
    admin: dict = Depends(get_admin_user),
    type: str = Query('all', description="all | crypto | bank | mt5 | partial-unlock"),
    limit: int = Query(100, ge=1, le=500),
):
    """Unified listing of every uploaded proof (crypto payments, bank transfers,
    MT5 deposits, partial unlock TX hashes). Returns lightweight metadata —
    use GET /api/admin/proofs/{type}/{id} to fetch full base64 file.
    """
    items = []

    # Crypto payments
    if type in ('all', 'crypto'):
        rows = await db.crypto_payments.aggregate([
            {'$sort': {'created_at': -1}},
            {'$limit': limit},
            {'$project': {
                '_id': 0, 'id': 1, 'user_id': 1, 'amount_sent': 1, 'crypto_type': 1,
                'txid': 1, 'status': 1, 'created_at': 1,
                'has_file': {'$cond': [{'$and': [
                    {'$ne': [{'$ifNull': ['$proof_image', None]}, None]},
                    {'$ne': ['$proof_image', '']}
                ]}, True, False]}
            }}
        ]).to_list(limit)
        for r in rows:
            items.append({
                'id': r.get('id'),
                'type': 'crypto',
                'type_label': 'Pago Crypto',
                'user_id': r.get('user_id'),
                'amount': r.get('amount_sent'),
                'currency': r.get('crypto_type'),
                'reference': r.get('txid'),
                'status': r.get('status'),
                'has_file': bool(r.get('has_file')),
                'created_at': r.get('created_at'),
            })

    # Bank transfer confirmations
    if type in ('all', 'bank'):
        rows = await db.bank_transfer_confirmations.aggregate([
            {'$sort': {'created_at': -1}},
            {'$limit': limit},
            {'$project': {
                '_id': 0, 'id': 1, 'user_id': 1, 'amount': 1, 'currency': 1,
                'reference': 1, 'status': 1, 'created_at': 1, 'proof_filename': 1,
                'has_file': {'$cond': [{'$and': [
                    {'$ne': [{'$ifNull': ['$proof_file', None]}, None]},
                    {'$ne': ['$proof_file', '']}
                ]}, True, False]}
            }}
        ]).to_list(limit)
        for r in rows:
            items.append({
                'id': r.get('id'),
                'type': 'bank',
                'type_label': 'Transferencia Bancaria',
                'user_id': r.get('user_id'),
                'amount': r.get('amount'),
                'currency': r.get('currency') or 'EUR',
                'reference': r.get('reference'),
                'status': r.get('status'),
                'has_file': bool(r.get('has_file')),
                'proof_filename': r.get('proof_filename'),
                'created_at': r.get('created_at'),
            })

    # MT5 invest deposits
    if type in ('all', 'mt5'):
        rows = await db.mt5_invest_deposits.aggregate([
            {'$match': {'proof_url': {'$ne': None}}},
            {'$sort': {'created_at': -1}},
            {'$limit': limit},
            {'$project': {
                '_id': 0, 'id': 1, 'user_id': 1, 'amount_eur': 1,
                'tx_hash': 1, 'status': 1, 'created_at': 1,
                'has_file': {'$cond': [{'$and': [
                    {'$ne': [{'$ifNull': ['$proof_url', None]}, None]},
                    {'$ne': ['$proof_url', '']}
                ]}, True, False]}
            }}
        ]).to_list(limit)
        for r in rows:
            items.append({
                'id': r.get('id'),
                'type': 'mt5',
                'type_label': 'Depósito MT5 Invest',
                'user_id': r.get('user_id'),
                'amount': r.get('amount_eur'),
                'currency': 'EUR',
                'reference': r.get('tx_hash'),
                'status': r.get('status'),
                'has_file': bool(r.get('has_file')),
                'created_at': r.get('created_at'),
            })

    # Partial unlock TX hashes (no file, just hash)
    if type in ('all', 'partial-unlock'):
        rows = await db.partial_withdraw_unlocks.find(
            {'last_tx_hash': {'$exists': True, '$ne': None}}, {'_id': 0}
        ).sort('updated_at', -1).limit(limit).to_list(limit)
        for r in rows:
            items.append({
                'id': r.get('id'),
                'type': 'partial-unlock',
                'type_label': 'Desbloqueo 40% (TX Hash)',
                'user_id': r.get('user_id'),
                'amount': r.get('total_paid_eur'),
                'currency': 'EUR',
                'reference': r.get('last_tx_hash'),
                'status': 'completed' if r.get('completed_at') else 'partial',
                'has_file': False,
                'created_at': r.get('updated_at') or r.get('created_at'),
            })

    # Sort by created_at desc, hydrate user name/email
    def _sort_key(x):
        v = x.get('created_at')
        if v is None:
            return ''
        # Datetime objects -> ISO string for stable sorting
        try:
            return v.isoformat() if hasattr(v, 'isoformat') else str(v)
        except Exception:
            return str(v)
    items.sort(key=_sort_key, reverse=True)
    items = items[:limit]

    user_ids = list({i['user_id'] for i in items if i.get('user_id')})
    users = await db.users.find({'id': {'$in': user_ids}}, {'_id': 0, 'id': 1, 'name': 1, 'email': 1}).to_list(2000)
    umap = {u['id']: u for u in users}
    for i in items:
        u = umap.get(i.get('user_id'))
        i['user_name'] = u.get('name') if u else None
        i['user_email'] = u.get('email') if u else None

    return {'items': items, 'count': len(items)}


@router.get("/admin/proofs/{ptype}/{pid}/file")
async def admin_get_proof_file(ptype: str, pid: str, admin: dict = Depends(get_admin_user)):
    """Return the base64 file (data URI) for inline viewing in the admin panel."""
    collection_map = {
        'crypto': ('crypto_payments', 'proof_image'),
        'bank': ('bank_transfer_confirmations', 'proof_file'),
        'mt5': ('mt5_invest_deposits', 'proof_url'),
    }
    if ptype not in collection_map:
        raise HTTPException(status_code=404, detail='Tipo de comprobante invalido')
    col_name, field = collection_map[ptype]
    doc = await db[col_name].find_one({'id': pid}, {'_id': 0, field: 1, 'proof_filename': 1})
    if not doc:
        raise HTTPException(status_code=404, detail='Comprobante no encontrado')
    raw = doc.get(field)
    if not raw:
        raise HTTPException(status_code=404, detail='Sin archivo asociado')

    # Already data URI? return as-is. Else build one.
    if isinstance(raw, str) and raw.startswith('data:'):
        data_uri = raw
    else:
        # Bank transfer stores raw base64 without prefix
        filename = doc.get('proof_filename') or 'proof.bin'
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'bin'
        mime_map = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp', 'pdf': 'application/pdf'}
        mime = mime_map.get(ext, 'application/octet-stream')
        data_uri = f'data:{mime};base64,{raw}'

    return {'data_uri': data_uri, 'filename': doc.get('proof_filename')}

