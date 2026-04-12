"""Support ticket routes"""
from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime, timezone
import uuid, logging
from config import db, strip_id
from models import SupportTicket, PaymentIssueReport, TicketReply, KYCSubmission
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification
from services.email import send_email_background, get_email_template

router = APIRouter()

# ==================== SUPPORT TICKET ROUTES ====================

@router.post("/support/tickets")
async def create_ticket(ticket: SupportTicket, request: Request, current_user: dict = Depends(get_current_user)):
    """Create a new support ticket"""
    ticket_id = str(uuid.uuid4())
    ticket_number = f"TKT-{datetime.now().strftime('%Y%m%d')}-{ticket_id[:6].upper()}"
    
    # Capture IP
    client_ip = request.headers.get('X-Forwarded-For', request.client.host if request.client else 'Unknown')
    if ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    country = request.headers.get('CF-IPCountry', 'International')
    
    new_ticket = {
        'id': ticket_id,
        'ticket_number': ticket_number,
        'user_id': current_user['id'],
        'user_name': current_user['name'],
        'user_email': current_user['email'],
        'subject': ticket.subject,
        'message': ticket.message,
        'category': ticket.category,
        'status': 'open',  # open, in_progress, resolved, closed
        'replies': [],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.support_tickets.insert_one(new_ticket)
    
    await create_notification(
        current_user['id'],
        'Ticket Creado',
        f'Su ticket de soporte {ticket_number} ha sido creado. Responderemos pronto.'
    )
    
    # Notify admin about new support ticket
    await create_admin_notification(
        notification_type='support_ticket',
        title='Nuevo Ticket de Soporte',
        message=f'{current_user["name"]} ha creado un ticket de soporte: "{ticket.subject}"',
        user_info={
            'name': current_user['name'],
            'email': current_user['email'],
            'ip': client_ip,
            'country': country
        },
        metadata={'ticket_number': ticket_number, 'subject': ticket.subject, 'category': ticket.category}
    )
    
    # Send email to info@paylionsbit.es with ticket details (background)
    admin_email_content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Se ha recibido un nuevo mensaje de soporte.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Detalles del Ticket #{ticket_number}</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Nombre:</td>
                            <td style="color: #10b981; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{current_user['name']}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Email:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{current_user['email']}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Asunto:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{ticket.subject}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Categoría:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{ticket.category}</td>
                        </tr>
                    </table>
                    <div style="margin-top: 20px; padding: 15px; background-color: #1e293b; border-radius: 8px; border-left: 4px solid #10b981;">
                        <p style="color: #94a3b8; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase;">Mensaje:</p>
                        <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin: 0;">{ticket.message}</p>
                    </div>
                </td>
            </tr>
        </table>
    """
    send_email_background("info@paylionsbit.es", f"Nuevo Ticket de Soporte #{ticket_number} - {ticket.subject}", get_email_template(admin_email_content, "Nuevo Mensaje de Soporte"))
    send_email_background("info@lionbit.es", f"Nuevo Ticket de Soporte #{ticket_number} - {ticket.subject}", get_email_template(admin_email_content, "Nuevo Mensaje de Soporte"))
    
    # Send confirmation email to user (background)
    user_confirm_content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{current_user['name']}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Su solicitud ha sido enviada correctamente. Nuestro equipo de soporte se pondra en contacto con usted.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Copia de su solicitud</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Numero de Ticket:</td>
                            <td style="color: #10b981; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{ticket_number}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Nombre:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{current_user['name']}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Email:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{current_user['email']}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">ID de Usuario:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{current_user['id'][:12]}...</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Asunto:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{ticket.subject}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Fecha y Hora:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}</td>
                        </tr>
                    </table>
                    <div style="margin-top: 20px; padding: 15px; background-color: #1e293b; border-radius: 8px; border-left: 4px solid #10b981;">
                        <p style="color: #94a3b8; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase;">Su Mensaje:</p>
                        <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin: 0;">{ticket.message}</p>
                    </div>
                </td>
            </tr>
        </table>
        <p style="color: #94a3b8; font-size: 14px;">Puede revisar el estado de su ticket desde la seccion de Soporte en la plataforma.</p>
        <p style="color: #64748b; font-size: 12px;">Correos de soporte: info@lionbit.es | info@paylionsbit.es</p>
    """
    send_email_background(current_user['email'], f"Solicitud recibida - Ticket #{ticket_number}", get_email_template(user_confirm_content, "Solicitud de Soporte Recibida"))
    
    # Log system activity
    await log_system_activity(
        activity_type='support_ticket',
        description=f'Ticket de soporte creado: {ticket.subject}',
        user_id=current_user['id'],
        user_name=current_user['name'],
        user_email=current_user['email'],
        ip_address=client_ip,
        country=country,
        metadata={'ticket_number': ticket_number, 'category': ticket.category}
    )
    
    return {'message': 'Su solicitud ha sido enviada correctamente. Nuestro equipo de soporte se pondra en contacto con usted.', 'ticket_number': ticket_number, 'id': ticket_id}

@router.post("/support/payment-issue")
async def report_payment_issue(report: PaymentIssueReport, current_user: dict = Depends(get_current_user)):
    """Report a payment issue - creates ticket with pre-filled data + marks transaction as under_review"""
    ticket_id = str(uuid.uuid4())
    ticket_number = f"PAY-{datetime.now().strftime('%Y%m%d')}-{ticket_id[:6].upper()}"
    
    # Mark transaction payment as under_review
    tx = await db.transactions.find_one({'id': report.transaction_id, 'user_id': current_user['id']})
    if tx and tx.get('crypto_payments'):
        for payment in tx['crypto_payments']:
            if payment.get('status') == 'pending':
                payment['status'] = 'under_review'
        await db.transactions.update_one(
            {'id': report.transaction_id},
            {'$set': {'crypto_payments': tx['crypto_payments']}}
        )
    
    payment_details = f"""
Tipo de Cripto: {report.crypto_type or 'N/A'}
Red: {report.network or 'N/A'}
Monto: {report.amount or 'N/A'}
Direccion Wallet: {report.wallet_address or 'N/A'}
Hash de Transaccion: {report.tx_hash or 'N/A'}
ID de Transaccion: {report.transaction_id}
ID de Usuario: {current_user['id']}
"""
    
    new_ticket = {
        'id': ticket_id,
        'ticket_number': ticket_number,
        'user_id': current_user['id'],
        'user_name': current_user['name'],
        'user_email': current_user['email'],
        'subject': f'Problema con pago - {report.crypto_type or "Crypto"}',
        'message': f'{report.message}\n\n--- Datos del Pago ---\n{payment_details}',
        'category': 'payment_issue',
        'status': 'open',
        'replies': [],
        'payment_context': {
            'transaction_id': report.transaction_id,
            'crypto_type': report.crypto_type,
            'network': report.network,
            'amount': report.amount,
            'wallet_address': report.wallet_address,
            'tx_hash': report.tx_hash,
            'proof_image': report.proof_image,
        },
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.support_tickets.insert_one(new_ticket)
    
    await create_notification(current_user['id'], 'Reporte de Pago Enviado',
        f'Su reporte #{ticket_number} ha sido creado. Estamos revisando su caso.')
    
    # Send to both support emails
    email_content = f"""
        <p style="color:#e2e8f0;font-size:16px;">Reporte de problema con pago recibido.</p>
        <table width="100%" style="background:#0f172a;border-radius:12px;margin:20px 0;">
            <tr><td style="padding:25px;">
                <p style="color:#f59e0b;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Reporte #{ticket_number}</p>
                <table width="100%">
                    <tr><td style="color:#94a3b8;padding:6px 0;border-bottom:1px solid #334155;">Usuario:</td><td style="color:#10b981;text-align:right;padding:6px 0;border-bottom:1px solid #334155;">{current_user['name']} ({current_user['email']})</td></tr>
                    <tr><td style="color:#94a3b8;padding:6px 0;border-bottom:1px solid #334155;">Cripto:</td><td style="color:#e2e8f0;text-align:right;padding:6px 0;border-bottom:1px solid #334155;">{report.crypto_type or 'N/A'} ({report.network or 'N/A'})</td></tr>
                    <tr><td style="color:#94a3b8;padding:6px 0;border-bottom:1px solid #334155;">Monto:</td><td style="color:#e2e8f0;text-align:right;padding:6px 0;border-bottom:1px solid #334155;">{report.amount or 'N/A'}</td></tr>
                    <tr><td style="color:#94a3b8;padding:6px 0;border-bottom:1px solid #334155;">TX Hash:</td><td style="color:#e2e8f0;text-align:right;padding:6px 0;border-bottom:1px solid #334155;word-break:break-all;font-size:12px;">{report.tx_hash or 'No proporcionado'}</td></tr>
                </table>
                <div style="margin-top:15px;padding:12px;background:#1e293b;border-radius:8px;border-left:4px solid #f59e0b;">
                    <p style="color:#94a3b8;font-size:12px;margin:0 0 5px;">Mensaje:</p>
                    <p style="color:#e2e8f0;font-size:14px;margin:0;">{report.message}</p>
                </div>
            </td></tr>
        </table>
    """
    for email in SUPPORT_EMAILS:
        send_email_background(email, f"Reporte de Pago #{ticket_number}", get_email_template(email_content, "Problema con Pago"))
    
    # User confirmation
    send_email_background(current_user['email'], f"Reporte de pago recibido - #{ticket_number}", get_email_template(f"""
        <p style="color:#e2e8f0;font-size:16px;">Estimado/a <strong style="color:#10b981;">{current_user['name']}</strong>,</p>
        <p style="color:#e2e8f0;">Su reporte de problema con pago ha sido recibido. Nuestro equipo de soporte se pondra en contacto con usted.</p>
        <p style="color:#94a3b8;font-size:14px;">Ticket: <strong style="color:#f59e0b;">{ticket_number}</strong></p>
        <p style="color:#64748b;font-size:12px;">Correos de soporte: info@lionbit.es | info@paylionsbit.es</p>
    """, "Reporte de Pago Recibido"))
    
    return {'message': 'Su reporte ha sido enviado. La transaccion ha sido marcada como En Revision.', 'ticket_number': ticket_number}

@router.get("/support/tickets")
async def get_my_tickets(current_user: dict = Depends(get_current_user)):
    """Get all tickets for current user"""
    tickets = await db.support_tickets.find(
        {'user_id': current_user['id']},
        {'_id': 0}
    ).sort('created_at', -1).to_list(100)
    return tickets

@router.get("/support/tickets/{ticket_id}")
async def get_ticket(ticket_id: str, current_user: dict = Depends(get_current_user)):
    """Get specific ticket"""
    ticket = await db.support_tickets.find_one(
        {'id': ticket_id, 'user_id': current_user['id']},
        {'_id': 0}
    )
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    return ticket

@router.post("/support/tickets/{ticket_id}/reply")
async def reply_to_ticket(ticket_id: str, reply: TicketReply, current_user: dict = Depends(get_current_user)):
    """Add reply to ticket (user)"""
    ticket = await db.support_tickets.find_one(
        {'id': ticket_id, 'user_id': current_user['id']},
        {'_id': 0}
    )
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    
    new_reply = {
        'id': str(uuid.uuid4()),
        'message': reply.message,
        'from_admin': False,
        'author_name': current_user['name'],
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.support_tickets.update_one(
        {'id': ticket_id},
        {
            '$push': {'replies': new_reply},
            '$set': {'updated_at': datetime.now(timezone.utc).isoformat()}
        }
    )
    
    return {'message': 'Reply added successfully'}

# ==================== ADMIN SUPPORT ROUTES ====================

@router.get("/admin/support/tickets")
async def admin_get_all_tickets(admin: dict = Depends(get_admin_user)):
    """Get all support tickets (admin)"""
    tickets = await db.support_tickets.find(
        {},
        {'_id': 0}
    ).sort('created_at', -1).to_list(1000)
    return tickets

@router.post("/admin/support/tickets/{ticket_id}/reply")
async def admin_reply_to_ticket(ticket_id: str, reply: TicketReply, admin: dict = Depends(get_admin_user)):
    """Admin reply to ticket"""
    ticket = await db.support_tickets.find_one({'id': ticket_id}, {'_id': 0})
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    
    new_reply = {
        'id': str(uuid.uuid4()),
        'message': reply.message,
        'from_admin': True,
        'author_name': f"Support ({admin['name']})",
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.support_tickets.update_one(
        {'id': ticket_id},
        {
            '$push': {'replies': new_reply},
            '$set': {
                'updated_at': datetime.now(timezone.utc).isoformat(),
                'status': 'in_progress'
            }
        }
    )
    
    # Notify user
    await create_notification(
        ticket['user_id'],
        'New Reply on Ticket',
        f'Support has replied to your ticket {ticket["ticket_number"]}'
    )
    
    return {'message': 'Reply added successfully'}

@router.put("/admin/support/tickets/{ticket_id}/status")
async def admin_update_ticket_status(ticket_id: str, status: str, admin: dict = Depends(get_admin_user)):
    """Update ticket status"""
    if status not in ['open', 'in_progress', 'resolved', 'closed']:
        raise HTTPException(status_code=400, detail='Invalid status')
    
    ticket = await db.support_tickets.find_one({'id': ticket_id}, {'_id': 0})
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    
    await db.support_tickets.update_one(
        {'id': ticket_id},
        {'$set': {'status': status, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    await create_notification(
        ticket['user_id'],
        'Ticket Status Updated',
        f'Your ticket {ticket["ticket_number"]} status changed to: {status}'
    )
    
    return {'message': f'Ticket status updated to {status}'}

@router.get("/admin/password-resets")
async def admin_get_password_resets(admin: dict = Depends(get_admin_user)):
    """Get pending password reset requests (MOCK)"""
    resets = await db.admin_notifications.find(
        {'type': 'password_reset_request'},
        {'_id': 0}
    ).sort('created_at', -1).to_list(100)
    return resets

# ==================== KYC ROUTES ====================

@router.post("/kyc/submit")
async def submit_kyc(kyc_data: KYCSubmission, request: Request, current_user: dict = Depends(get_current_user)):
    """Submit KYC documents for verification with legal consent"""
    if current_user.get('verification_status') == 'verified':
        raise HTTPException(status_code=400, detail='Already verified')
    
    # Validate legal consent
    if not kyc_data.legal_consent:
        raise HTTPException(status_code=400, detail='Legal consent is required to submit verification')
    
    # Validate digital signature
    if not kyc_data.digital_signature or len(kyc_data.digital_signature.strip()) < 3:
        raise HTTPException(status_code=400, detail='Digital signature (full name) is required')
    
    # Capture user activity info for legal records
    client_ip = request.headers.get('X-Forwarded-For', request.headers.get('X-Real-IP', request.client.host if request.client else 'unknown'))
    if ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    # Detect browser from user agent
    browser = 'Unknown'
    if 'Chrome' in user_agent:
        browser = 'Chrome'
    elif 'Firefox' in user_agent:
        browser = 'Firefox'
    elif 'Safari' in user_agent:
        browser = 'Safari'
    elif 'Edge' in user_agent:
        browser = 'Edge'
    elif 'Opera' in user_agent:
        browser = 'Opera'
    
    # Get approximate country from IP (simplified - in production use GeoIP service)
    country = 'Unknown'
    try:
        # Simple IP geolocation based on common ranges
        if client_ip.startswith('2.'):
            country = 'Europe'
        elif client_ip.startswith('8.') or client_ip.startswith('12.'):
            country = 'United States'
        elif client_ip.startswith('200.') or client_ip.startswith('201.'):
            country = 'Latin America'
        else:
            country = 'International'
    except:
        pass
    
    submission_timestamp = datetime.now(timezone.utc).isoformat()
    
    # Build complete KYC record with legal information
    kyc_documents = {
        'id': str(uuid.uuid4()),
        'document_type': kyc_data.document_type,
        'document_front': kyc_data.document_front,
        'document_back': kyc_data.document_back,
        'selfie_with_document': kyc_data.selfie_with_document,
        'digital_signature': kyc_data.digital_signature,
        'legal_consent_accepted': True,
        'legal_consent_text': 'Declaro bajo mi responsabilidad que soy el titular legítimo de la información y documentos enviados. Entiendo que proporcionar datos falsos o utilizar la identidad de otra persona sin autorización puede constituir fraude y dar lugar a acciones legales.',
        'investment_period': kyc_data.investment_period,
        'investment_details': kyc_data.investment_details,
        'submitted_at': submission_timestamp,
        'status': 'pending',  # pending, under_review, approved, rejected
        # Legal activity record
        'legal_record': {
            'ip_address': client_ip,
            'user_agent': user_agent,
            'browser': browser,
            'country_approximate': country,
            'timestamp': submission_timestamp,
            'user_id': current_user['id'],
            'user_email': current_user['email'],
            'user_name': current_user['name']
        }
    }
    
    await db.users.update_one(
        {'id': current_user['id']},
        {'$set': {
            'verification_status': 'pending_verification',
            'kyc_documents': kyc_documents
        }}
    )
    
    # Also store in a separate KYC submissions collection for admin panel
    await db.kyc_submissions.insert_one({
        **kyc_documents,
        'user_id': current_user['id'],
        '_user_email': current_user['email'],
        '_user_name': current_user['name']
    })
    
    await create_notification(current_user['id'], 'KYC Enviado',
        'Sus documentos de verificación han sido enviados y están en revisión. Le notificaremos cuando se complete la revisión.')
    
    # Notify admin about new KYC submission
    await create_admin_notification(
        notification_type='kyc_submitted',
        title='Nueva Verificación KYC',
        message=f'El usuario {current_user["name"]} ha enviado documentos KYC para verificación.',
        user_info={
            'name': current_user['name'],
            'email': current_user['email'],
            'ip': client_ip,
            'country': country
        },
        metadata={'document_type': kyc_data.document_type, 'has_selfie': bool(kyc_data.selfie_with_document)}
    )
    
    # Log system activity
    await log_system_activity(
        activity_type='kyc',
        description=f'Verificación KYC enviada: {current_user["name"]}',
        user_id=current_user['id'],
        user_name=current_user['name'],
        user_email=current_user['email'],
        ip_address=client_ip,
        country=country,
        metadata={'document_type': kyc_data.document_type}
    )
    
    return {
        'message': 'KYC documents submitted successfully',
        'status': 'pending',
        'submission_id': kyc_documents['id'],
        'submitted_at': submission_timestamp
    }

@router.get("/kyc/status")
async def get_kyc_status(current_user: dict = Depends(get_current_user)):
    """Get current KYC verification status"""
    kyc_docs = current_user.get('kyc_documents', {})
    return {
        'verification_status': current_user.get('verification_status', 'unverified'),
        'has_documents': current_user.get('kyc_documents') is not None,
        'kyc_status': kyc_docs.get('status', 'none') if kyc_docs else 'none',
        'submitted_at': kyc_docs.get('submitted_at') if kyc_docs else None,
        'rejection_reason': kyc_docs.get('rejection_reason') if kyc_docs else None
    }

