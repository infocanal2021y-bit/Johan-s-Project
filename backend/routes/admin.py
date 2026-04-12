"""Admin routes: user management, withdrawals, KYC, crypto payments, notifications, activity"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid
import logging
import asyncio

from config import db, TAX_AMOUNT, MIN_TAX_PAYMENT, GOVERNMENT_TREASURY_ID, ADMIN_EMAIL
from models import (
    AdminUpdateBalance, AdminAddBalance, AdminUpdateTransactionStatus,
    AdminUpdateUserRole, AdminKYCAction, AdminSuspendUser, AdminForceRelease,
    AdminCryptoPaymentAction, AdminManualTaxPayment, AdminUpdateWithdrawalStatus
)
from services.auth import get_admin_user, generate_transaction_reference
from services.notifications import create_notification, log_system_activity
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
    """Get all users with their accounts - optimized with aggregation"""
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
    
    # Clean up accounts array to remove _id
    for user in users:
        if 'accounts' in user:
            user['accounts'] = [{k: v for k, v in acc.items() if k != '_id'} for acc in user['accounts']]
    
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

@router.post("/admin/add-balance")
async def admin_add_balance(data: AdminAddBalance, admin: dict = Depends(get_admin_user)):
    """Add balance to a user's checking account (admin_credit transaction)"""
    # Find user
    user = await db.users.find_one({'id': data.user_id}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    
    # Get user's checking account
    account = await db.accounts.find_one(
        {'user_id': data.user_id, 'account_type': 'checking'},
        {'_id': 0}
    )
    if not account:
        raise HTTPException(status_code=404, detail='Checking account not found')
    
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



# ==================== UTILITY ROUTES ====================
