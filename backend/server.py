from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from typing import List, Optional
import os
import logging
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
from fastapi.responses import StreamingResponse, Response, JSONResponse
import io
import csv
import json
import base64
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
import resend
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from bson import ObjectId
import httpx

from config import (
    db, client, ROOT_DIR, RESEND_API_KEY, SENDER_EMAIL, ADMIN_EMAIL,
    JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_HOURS,
    EXCHANGE_RATES, DAILY_TRANSFER_LIMIT_EUR, UNVERIFIED_TRANSFER_LIMIT_EUR,
    TAX_AMOUNT, GOVERNMENT_TREASURY_ID, FRAUD_THRESHOLD_AMOUNT,
    FRAUD_THRESHOLD_COUNT, FRAUD_THRESHOLD_MINUTES,
    ADMIN_ACCOUNTS, RESTRICTED_BANK_TRANSFER_EMAILS, APP_BASE_URL,
    CRYPTO_WALLETS, SUPPORT_EMAILS, CHATBOT_FAQ,
    MongoJSONEncoder, SafeJSONResponse, sanitize_mongo_doc, strip_id
)
from models import (
    UserCreate, UserLogin, UserResponse, AccountResponse, BankingInfo,
    TransactionCreate, TransactionResponse, PayTaxRequest,
    AdminUpdateBalance, AdminUpdateTransactionStatus, AdminUpdateUserRole,
    KYCSubmission, AdminKYCAction, AdminSuspendUser, AdminForceRelease,
    AdminAddBalance, CryptoPaymentSubmission, AdminCryptoPaymentAction,
    AdminManualTaxPayment, AdminUpdateWithdrawalStatus,
    SupportTicket, TicketReply, PasswordResetRequest, PasswordResetConfirm,
    ChangePassword, PaymentIssueReport, BankTransferConfirm,
    InvestmentRequest, ActivityEvent, AdminWalletAssign, ChatMessage,
    FeedbackSubmission
)
from services.auth import (
    security, hash_password, verify_password, create_token,
    generate_transaction_reference, get_current_user, get_admin_user
)
from services.notifications import create_notification, notify_admins
from services.scoring import process_user_scoring, process_user_reminders

# ==================== APP SETUP ====================
resend.api_key = RESEND_API_KEY

app = FastAPI(title="LIONSBIT VERIFICACION API", default_response_class=SafeJSONResponse)
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== ADMIN NOTIFICATION SYSTEM ====================

async def create_admin_notification(
    notification_type: str,
    title: str,
    message: str,
    user_info: dict = None,
    metadata: dict = None,
    send_email_notification: bool = True
):
    """Create a notification for all admins and optionally send email"""
    now = datetime.now(timezone.utc).isoformat()
    
    notification = {
        'id': str(uuid.uuid4()),
        'type': notification_type,  # user_registered, kyc_submitted, withdrawal_request, etc.
        'title': title,
        'message': message,
        'user_info': user_info,  # {name, email, ip, country}
        'metadata': metadata,
        'read': False,
        'created_at': now
    }
    
    await db.admin_notifications.insert_one(notification)
    
    # Also add to bell notifications for all admins
    admins = await db.users.find({'role': 'admin'}, {'_id': 0, 'id': 1, 'email': 1}).to_list(100)
    for admin in admins:
        await create_notification(admin['id'], title, message)
    
    # Send email to admin
    if send_email_notification and RESEND_API_KEY:
        await send_admin_alert_email(notification_type, title, message, user_info, metadata)
    
    return notification

async def send_admin_alert_email(notification_type: str, title: str, message: str, user_info: dict = None, metadata: dict = None):
    """Send alert email to admin"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    
    type_icons = {
        'user_registered': '👤',
        'kyc_submitted': '📋',
        'withdrawal_request': '💸',
        'tax_payment': '💰',
        'support_ticket': '🎫',
        'login': '🔑',
        'balance_added': '💵'
    }
    icon = type_icons.get(notification_type, '🔔')
    
    user_details = ""
    if user_info:
        user_details = f"""
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 15px;">
            <tr>
                <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Usuario:</td>
                <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-weight: bold;">{user_info.get('name', 'N/A')}</td>
            </tr>
            <tr>
                <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Email:</td>
                <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{user_info.get('email', 'N/A')}</td>
            </tr>
            <tr>
                <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">IP:</td>
                <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-family: monospace;">{user_info.get('ip', 'N/A')}</td>
            </tr>
            <tr>
                <td style="color: #94a3b8; padding: 8px 0;">País:</td>
                <td style="color: #e2e8f0; text-align: right; padding: 8px 0;">{user_info.get('country', 'N/A')}</td>
            </tr>
        </table>
        """
    
    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            <strong style="color: #10b981;">Administrador</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            {message}
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">{icon} {title}</p>
                    {user_details}
                    <p style="color: #64748b; font-size: 12px; margin-top: 15px; text-align: right;">
                        {date_str}
                    </p>
                </td>
            </tr>
        </table>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0;">
            <tr>
                <td align="center">
                    <a href="{APP_BASE_URL}/admin/activity" style="display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: white; text-decoration: none; padding: 14px 35px; border-radius: 8px; font-weight: bold;">
                        Ver Panel de Actividad
                    </a>
                </td>
            </tr>
        </table>
    """
    
    html = get_email_template(content, f"{icon} Alerta del Sistema")
    await send_email(ADMIN_EMAIL, f"{icon} {title} - LIONSBIT VERIFICACION Admin", html)

async def log_system_activity(
    activity_type: str,
    description: str,
    user_id: str = None,
    user_name: str = None,
    user_email: str = None,
    ip_address: str = None,
    country: str = None,
    metadata: dict = None
):
    """Log system activity for admin monitoring"""
    activity = {
        'id': str(uuid.uuid4()),
        'type': activity_type,  # register, login, kyc, withdrawal, tax_payment, deposit, support_ticket
        'description': description,
        'user_id': user_id,
        'user_name': user_name,
        'user_email': user_email,
        'ip_address': ip_address,
        'country': country,
        'metadata': metadata,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.system_activity.insert_one(activity)
    return activity

# ==================== EMAIL SERVICE ====================

async def send_email(to_email: str, subject: str, html_content: str):
    """Send email using Resend API"""
    if not RESEND_API_KEY:
        logging.warning("RESEND_API_KEY not configured, email not sent")
        return None
    
    try:
        params = {
            "from": f"LIONSBIT VERIFICACION <{SENDER_EMAIL}>",
            "to": [to_email],
            "subject": subject,
            "html": html_content
        }
        
        # Run sync SDK in thread to keep FastAPI non-blocking
        result = await asyncio.to_thread(resend.Emails.send, params)
        logging.info(f"Email sent to {to_email}: {subject}")
        return result
    except Exception as e:
        logging.error(f"Failed to send email to {to_email}: {str(e)}")
        return None

def send_email_background(to_email: str, subject: str, html_content: str):
    """Fire-and-forget email sending - does not block the response"""
    asyncio.create_task(_send_email_safe(to_email, subject, html_content))

async def _send_email_safe(to_email: str, subject: str, html_content: str):
    """Safe wrapper for background email sending"""
    try:
        await send_email(to_email, subject, html_content)
    except Exception as e:
        logging.error(f"Background email failed for {to_email}: {str(e)}")

# ==================== IP GEOLOCATION ====================
_geo_cache = {}

async def get_ip_location(ip_address: str) -> dict:
    """Get city/country from IP address using ip-api.com (free, no key needed)"""
    if not ip_address or ip_address in ('Unknown', '127.0.0.1', 'localhost'):
        return {'city': 'Desconocido', 'country': 'Desconocido', 'countryCode': '--'}
    
    # Check cache
    if ip_address in _geo_cache:
        return _geo_cache[ip_address]
    
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"http://ip-api.com/json/{ip_address}?fields=status,country,countryCode,city,query")
            if resp.status_code == 200:
                data = resp.json()
                if data.get('status') == 'success':
                    result = {
                        'city': data.get('city', 'Desconocido'),
                        'country': data.get('country', 'Desconocido'),
                        'countryCode': data.get('countryCode', '--')
                    }
                    _geo_cache[ip_address] = result
                    return result
    except Exception as e:
        logging.warning(f"Geolocation failed for {ip_address}: {e}")
    
    return {'city': 'Desconocido', 'country': 'Desconocido', 'countryCode': '--'}

def get_email_template(content: str, title: str = "LIONSBIT VERIFICACION"):
    """Generate HTML email template"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
            <tr>
                <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1e293b; border-radius: 16px; overflow: hidden;">
                        <!-- Header -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #10b981, #06b6d4); padding: 30px; text-align: center;">
                                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">{title}</h1>
                            </td>
                        </tr>
                        <!-- Content -->
                        <tr>
                            <td style="padding: 40px 30px;">
                                {content}
                            </td>
                        </tr>
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #0f172a; padding: 20px 30px; text-align: center;">
                                <p style="color: #64748b; font-size: 12px; margin: 0;">
                                    Este es un correo automático de LIONSBIT VERIFICACION.<br>
                                    Por favor no responda a este mensaje.
                                </p>
                                <p style="color: #64748b; font-size: 12px; margin: 10px 0 0 0;">
                                    © 2026 LIONSBIT VERIFICACION. Todos los derechos reservados.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

async def send_balance_added_email(user_email: str, user_name: str, amount: float, currency: str, new_balance: float):
    """Send email notification when balance is added"""
    content = await _build_balance_email_content(user_name, amount, currency, new_balance)
    html = get_email_template(content, "Saldo Agregado")
    await send_email(user_email, "Saldo agregado a su cuenta - LIONSBIT VERIFICACION", html)

async def _build_balance_email_content(user_name: str, amount: float, currency: str, new_balance: float):
    """Build HTML content for balance added email"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    currency_symbol = "$" if currency == "USD" else "€"
    
    return f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Le informamos que se ha agregado saldo a su cuenta.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Detalles de la operación</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto agregado:</td>
                            <td style="color: #10b981; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 18px;">{currency_symbol}{amount:,.2f} {currency}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Fecha:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{date_str}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Saldo actual:</td>
                            <td style="color: #06b6d4; font-weight: bold; text-align: right; padding: 8px 0; font-size: 18px;">{currency_symbol}{new_balance:,.2f} {currency}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <p style="color: #f87171; font-size: 14px; line-height: 1.6; background-color: rgba(248, 113, 113, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #f87171;">
            Si usted no reconoce esta operación, por favor contacte inmediatamente a nuestro equipo de soporte.
        </p>
    """

async def send_withdrawal_status_email(user_email: str, user_name: str, amount: float, currency: str, status: str, reason: str = None):
    """Send email notification for withdrawal status changes"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    currency_symbol = "$" if currency == "USD" else "€"
    
    status_config = {
        'pending': {'title': 'Pendiente de Aprobación', 'color': '#f59e0b', 'message': 'Su solicitud de retiro ha sido recibida y está pendiente de aprobación por un administrador.'},
        'pending_tax': {'title': 'Impuesto Pendiente', 'color': '#f97316', 'message': 'Su retiro requiere el pago de impuestos antes de ser procesado.'},
        'under_review': {'title': 'Retiro en Revisión', 'color': '#8b5cf6', 'message': 'Su solicitud de retiro está siendo revisada por nuestro equipo.'},
        'processing': {'title': 'Procesando', 'color': '#06b6d4', 'message': 'Su retiro ha sido aprobado y está siendo procesado.'},
        'transfer_in_progress': {'title': 'Transferencia en Proceso', 'color': '#3b82f6', 'message': 'La transferencia bancaria está en proceso. Recibirá los fondos pronto.'},
        'completed': {'title': 'Completado', 'color': '#10b981', 'message': '¡Su retiro ha sido completado exitosamente! Los fondos han sido transferidos a su cuenta bancaria.'},
        'rejected': {'title': 'Rechazado', 'color': '#ef4444', 'message': f'Su solicitud de retiro ha sido rechazada. Razón: {reason or "Contacte a soporte"}'},
    }
    
    config = status_config.get(status, status_config['pending'])
    
    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            {config['message']}
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Detalles del retiro</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto:</td>
                            <td style="color: #e2e8f0; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 18px;">{currency_symbol}{amount:,.2f} {currency}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Estado:</td>
                            <td style="color: {config['color']}; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{config['title']}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Fecha:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0;">{date_str}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    """
    
    html = get_email_template(content, config['title'])
    await send_email(user_email, f"📤 {config['title']} - LIONSBIT VERIFICACION", html)

async def send_password_changed_email(user_email: str, user_name: str):
    """Send email notification when password is changed"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    
    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Le informamos que su contraseña ha sido cambiada exitosamente.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px; text-align: center;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0;">Fecha del cambio:</p>
                    <p style="color: #e2e8f0; font-size: 18px; margin: 10px 0 0 0; font-weight: bold;">{date_str}</p>
                </td>
            </tr>
        </table>
        
        <p style="color: #f87171; font-size: 14px; line-height: 1.6; background-color: rgba(248, 113, 113, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #f87171;">
            ⚠️ Si usted no realizó este cambio, por favor contacte inmediatamente a nuestro equipo de soporte y considere cambiar su contraseña.
        </p>
    """
    
    html = get_email_template(content, "Contraseña Actualizada")
    await send_email(user_email, "🔐 Contraseña cambiada - LIONSBIT VERIFICACION", html)

async def send_new_login_email(user_email: str, user_name: str, ip_address: str, browser: str, location: str):
    """Send email notification for new login from unknown IP"""
    content = await _build_new_login_email_content(user_name, ip_address, browser, location)
    html = get_email_template(content, "Nuevo Inicio de Sesión")
    await send_email(user_email, "Nuevo acceso detectado - LIONSBIT VERIFICACION", html)

async def _build_new_login_email_content(user_name: str, ip_address: str, browser: str, location: str):
    """Build HTML content for new login email"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    return f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Se ha detectado un nuevo inicio de sesión en su cuenta.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Detalles del acceso</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Dirección IP:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-family: monospace;">{ip_address}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Navegador:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{browser}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Ubicación:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{location}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Fecha:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0;">{date_str}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <p style="color: #f87171; font-size: 14px; line-height: 1.6; background-color: rgba(248, 113, 113, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #f87171;">
            Si usted no realizó este acceso, por favor cambie su contraseña inmediatamente y contacte a nuestro equipo de soporte.
        </p>
    """

async def send_transfer_completed_email(user_email: str, user_name: str, amount: float, currency: str, recipient: str):
    """Send email notification when transfer is completed"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    currency_symbol = "$" if currency == "USD" else "€"
    
    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Su transferencia ha sido completada exitosamente.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Detalles de la transferencia</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto:</td>
                            <td style="color: #10b981; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 18px;">{currency_symbol}{amount:,.2f} {currency}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Destinatario:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{recipient}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Fecha:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0;">{date_str}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    """
    
    html = get_email_template(content, "Transferencia Completada")
    await send_email(user_email, "✅ Transferencia completada - LIONSBIT VERIFICACION", html)

async def send_withdrawal_tax_pending_email(user_email: str, user_name: str, withdrawal_amount: float, currency: str, tax_required: float, tax_paid: float):
    """Send email when withdrawal is pending tax payment"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    currency_symbol = "$" if currency == "USD" else "€"
    remaining = tax_required - tax_paid
    
    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Su solicitud de retiro ha sido recibida y está en espera de pago de impuesto.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Detalles del Retiro</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto solicitado:</td>
                            <td style="color: #e2e8f0; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 18px;">{currency_symbol}{withdrawal_amount:,.2f} {currency}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Estado:</td>
                            <td style="color: #f97316; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">Impuesto Pendiente</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, rgba(249,115,22,0.1), rgba(234,88,12,0.1)); border: 1px solid rgba(249,115,22,0.3); border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #f97316; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">💰 Impuesto Requerido</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Impuesto total:</td>
                            <td style="color: #f97316; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 20px;">${tax_required:,.2f} USD</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Pagado:</td>
                            <td style="color: #10b981; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">${tax_paid:,.2f} USD</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Restante:</td>
                            <td style="color: #ef4444; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">${remaining:,.2f} USD</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Abono mínimo:</td>
                            <td style="color: #06b6d4; text-align: right; padding: 8px 0;">$200.00 USD</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6;">
            Para procesar su retiro, debe completar el pago del impuesto mediante criptomonedas. 
            Puede realizar abonos parciales de <strong>$200 USD</strong> o más hasta completar el monto total.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0;">
            <tr>
                <td align="center">
                    <a href="{APP_BASE_URL}/transactions" style="display: inline-block; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                        Abonar Impuesto
                    </a>
                </td>
            </tr>
        </table>
        
        <p style="color: #94a3b8; font-size: 13px;">
            Fecha de solicitud: {date_str}
        </p>
    """
    
    html = get_email_template(content, "Retiro Pendiente - Impuesto Requerido")
    await send_email(user_email, "⏳ Retiro pendiente - Pague su impuesto - LIONSBIT VERIFICACION", html)

async def send_tax_payment_received_email(user_email: str, user_name: str, payment_amount: float, tax_required: float, tax_paid: float, withdrawal_amount: float, currency: str):
    """Send email when tax payment is received"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    remaining = tax_required - tax_paid
    progress_percent = (tax_paid / tax_required) * 100
    currency_symbol = "$" if currency == "USD" else "€"
    
    status_text = "Impuesto Completado - En Revisión" if remaining <= 0 else "Abono Recibido"
    status_color = "#10b981" if remaining <= 0 else "#f97316"
    
    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Hemos recibido su abono al impuesto de retiro.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Detalles del Abono</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Abono recibido:</td>
                            <td style="color: #10b981; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 18px;">+${payment_amount:,.2f} USD</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Estado:</td>
                            <td style="color: {status_color}; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{status_text}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Fecha:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0;">{date_str}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0;">Progreso del Impuesto</p>
                    <div style="background-color: #1e293b; border-radius: 8px; height: 20px; overflow: hidden;">
                        <div style="background: linear-gradient(90deg, #10b981, #06b6d4); height: 100%; width: {min(100, progress_percent):.0f}%;"></div>
                    </div>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 15px;">
                        <tr>
                            <td style="color: #94a3b8; padding: 4px 0;">Total pagado:</td>
                            <td style="color: #10b981; text-align: right; padding: 4px 0;">${tax_paid:,.2f} USD</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 4px 0;">Restante:</td>
                            <td style="color: {'#10b981' if remaining <= 0 else '#ef4444'}; text-align: right; padding: 4px 0;">${max(0, remaining):,.2f} USD</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        {"<p style='color: #10b981; font-size: 16px; background-color: rgba(16,185,129,0.1); padding: 15px; border-radius: 8px; text-align: center;'>✅ ¡Impuesto completado! Su retiro de " + currency_symbol + str(withdrawal_amount) + " " + currency + " está ahora en revisión.</p>" if remaining <= 0 else "<p style='color: #94a3b8; font-size: 14px;'>Continue realizando abonos para completar el impuesto y liberar su retiro.</p>"}
    """
    
    html = get_email_template(content, "Abono al Impuesto Recibido")
    await send_email(user_email, f"💰 Abono recibido - {'Impuesto completado' if remaining <= 0 else 'Progreso actualizado'} - LIONSBIT VERIFICACION", html)

async def send_tax_reminder_email(user_email: str, user_name: str, withdrawal_amount: float, currency: str, tax_required: float, tax_paid: float, hours_remaining: float):
    """Send reminder email for pending tax payment"""
    currency_symbol = "$" if currency == "USD" else "€"
    remaining_tax = tax_required - tax_paid
    
    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Este es un recordatorio de que su retiro tiene impuesto pendiente de pago.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, rgba(239,68,68,0.1), rgba(220,38,38,0.1)); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px; text-align: center;">
                    <p style="color: #ef4444; font-size: 14px; margin: 0; text-transform: uppercase; letter-spacing: 1px;">⏰ Tiempo Restante</p>
                    <p style="color: #ef4444; font-size: 36px; margin: 10px 0; font-weight: bold;">{hours_remaining:.0f} horas</p>
                    <p style="color: #94a3b8; font-size: 13px; margin: 0;">antes del rechazo automático</p>
                </td>
            </tr>
        </table>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Detalles del Retiro</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto del retiro:</td>
                            <td style="color: #e2e8f0; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{currency_symbol}{withdrawal_amount:,.2f} {currency}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Impuesto requerido:</td>
                            <td style="color: #f97316; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">${tax_required:,.2f} USD</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Pagado:</td>
                            <td style="color: #10b981; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">${tax_paid:,.2f} USD</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Restante:</td>
                            <td style="color: #ef4444; font-weight: bold; text-align: right; padding: 8px 0; font-size: 18px;">${remaining_tax:,.2f} USD</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0;">
            <tr>
                <td align="center">
                    <a href="{APP_BASE_URL}/transactions" style="display: inline-block; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                        Pagar Impuesto Ahora
                    </a>
                </td>
            </tr>
        </table>
        
        <p style="color: #f87171; font-size: 14px; line-height: 1.6; background-color: rgba(248, 113, 113, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #f87171;">
            ⚠️ <strong>Importante:</strong> Si el impuesto no se paga antes de las {hours_remaining:.0f} horas restantes, su retiro será rechazado automáticamente y los fondos permanecerán en su cuenta.
        </p>
    """
    
    html = get_email_template(content, "Recordatorio - Impuesto Pendiente")
    await send_email(user_email, f"⚠️ RECORDATORIO: Impuesto pendiente - {hours_remaining:.0f}h restantes - LIONSBIT VERIFICACION", html)

async def send_withdrawal_rejected_email(user_email: str, user_name: str, withdrawal_amount: float, currency: str, reason: str):
    """Send email when withdrawal is automatically rejected"""
    currency_symbol = "$" if currency == "USD" else "€"
    
    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Le informamos que su solicitud de retiro ha sido rechazada.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, rgba(239,68,68,0.1), rgba(220,38,38,0.1)); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px; text-align: center;">
                    <p style="color: #ef4444; font-size: 48px; margin: 0;">❌</p>
                    <p style="color: #ef4444; font-size: 20px; margin: 10px 0; font-weight: bold;">Retiro Rechazado</p>
                </td>
            </tr>
        </table>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto solicitado:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{currency_symbol}{withdrawal_amount:,.2f} {currency}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Motivo:</td>
                            <td style="color: #ef4444; text-align: right; padding: 8px 0;">{reason}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">
            Los fondos permanecen en su cuenta. Si desea realizar un nuevo retiro, puede hacerlo desde su panel de control.
        </p>
        
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">
            Si tiene alguna pregunta, por favor contacte a nuestro equipo de soporte.
        </p>
    """
    
    html = get_email_template(content, "Retiro Rechazado")
    await send_email(user_email, "❌ Su retiro ha sido rechazado - LIONSBIT VERIFICACION", html)

async def get_daily_transfer_total(user_id: str) -> float:
    """Get total EUR transfers for today"""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    transfers = await db.transactions.find({
        'user_id': user_id,
        'transaction_type': 'transfer',
        'created_at': {'$gte': today_start.isoformat()}
    }, {'_id': 0, 'amount': 1, 'currency': 1}).to_list(1000)
    
    total_eur = 0
    for tx in transfers:
        amount = tx.get('amount', 0)
        currency = tx.get('currency', 'USD')
        if currency == 'USD':
            total_eur += amount * EXCHANGE_RATES['EUR']
        else:
            total_eur += amount
    
    return total_eur

async def check_fraud_pattern(user_id: str, amount: float) -> bool:
    """Check if user has suspicious transfer pattern"""
    five_minutes_ago = (datetime.now(timezone.utc) - timedelta(minutes=FRAUD_THRESHOLD_MINUTES)).isoformat()
    
    count = await db.transactions.count_documents({
        'user_id': user_id,
        'transaction_type': 'transfer',
        'amount': {'$gt': FRAUD_THRESHOLD_AMOUNT},
        'created_at': {'$gte': five_minutes_ago}
    })
    
    # Including current transfer
    if count >= FRAUD_THRESHOLD_COUNT - 1 and amount > FRAUD_THRESHOLD_AMOUNT:
        return True
    return False

async def ensure_government_treasury():
    """Ensure Government Treasury account exists"""
    treasury = await db.accounts.find_one({'id': GOVERNMENT_TREASURY_ID}, {'_id': 0})
    if not treasury:
        treasury = {
            'id': GOVERNMENT_TREASURY_ID,
            'user_id': 'SYSTEM',
            'account_type': 'government_treasury',
            'name': 'Government Treasury',
            'balance_usd': 0.0,
            'balance_eur': 0.0,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        await db.accounts.insert_one(treasury)
    return treasury

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=dict)
async def register(user_data: UserCreate, request: Request):
    existing = await db.users.find_one({'email': user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail='Email already registered')
    
    # Capture registration info
    client_ip = request.headers.get('X-Forwarded-For', request.client.host if request.client else 'Unknown')
    if ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    country = request.headers.get('CF-IPCountry', 'International')
    
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    user = {
        'id': user_id,
        'name': user_data.name,
        'email': user_data.email,
        'password': hash_password(user_data.password),
        'role': 'user',
        'verification_status': 'unverified',
        'account_status': 'active',
        'kyc_documents': None,
        'registration_ip': client_ip,
        'registration_country': country,
        'created_at': now
    }
    await db.users.insert_one(user)
    
    for acc_type in ['checking', 'savings']:
        account = {
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'account_type': acc_type,
            'balance_usd': 0.0,
            'balance_eur': 0.0,
            'created_at': now
        }
        await db.accounts.insert_one(account)
    
    await create_notification(user_id, '¡Bienvenido a LIONSBIT VERIFICACION!', 
        'Su cuenta ha sido creada. Por favor complete la verificación KYC para desbloquear todas las funciones.')
    
    # Notify admin about new user registration
    await create_admin_notification(
        notification_type='user_registered',
        title='Nuevo Usuario Registrado',
        message=f'Se ha registrado un nuevo usuario: {user_data.name} ({user_data.email})',
        user_info={
            'name': user_data.name,
            'email': user_data.email,
            'ip': client_ip,
            'country': country
        }
    )
    
    # Log system activity
    await log_system_activity(
        activity_type='register',
        description=f'Nuevo usuario registrado: {user_data.name}',
        user_id=user_id,
        user_name=user_data.name,
        user_email=user_data.email,
        ip_address=client_ip,
        country=country
    )
    
    token = create_token(user_id, user_data.email, 'user')
    
    return {
        'token': token,
        'user': {
            'id': user_id,
            'name': user_data.name,
            'email': user_data.email,
            'role': 'user',
            'verification_status': 'unverified',
            'account_status': 'active'
        }
    }

@api_router.post("/auth/login", response_model=dict)
async def login(credentials: UserLogin, request: Request):
    user = await db.users.find_one({'email': credentials.email}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=401, detail='Invalid credentials')
    
    # Handle both 'password' and 'hashed_password' fields for backwards compatibility
    stored_password = user.get('password') or user.get('hashed_password')
    if not stored_password or not verify_password(credentials.password, stored_password):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    
    # Capture login info
    client_ip = request.headers.get('X-Forwarded-For', request.client.host if request.client else 'Unknown')
    if ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    # Parse device info from user agent
    device_info = 'Unknown Device'
    if 'Windows' in user_agent:
        device_info = 'Windows'
    elif 'Mac' in user_agent:
        device_info = 'macOS'
    elif 'Linux' in user_agent:
        device_info = 'Linux'
    elif 'Android' in user_agent:
        device_info = 'Android'
    elif 'iPhone' in user_agent or 'iPad' in user_agent:
        device_info = 'iOS'
    
    browser_info = 'Unknown Browser'
    if 'Chrome' in user_agent and 'Edg' not in user_agent:
        browser_info = 'Chrome'
    elif 'Firefox' in user_agent:
        browser_info = 'Firefox'
    elif 'Safari' in user_agent and 'Chrome' not in user_agent:
        browser_info = 'Safari'
    elif 'Edg' in user_agent:
        browser_info = 'Edge'
    
    # Save login history with geolocation
    geo = await get_ip_location(client_ip)
    location_str = f"{geo['city']}, {geo['country']}"
    
    login_record = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'user_name': user['name'],
        'user_email': user['email'],
        'ip_address': client_ip,
        'device': device_info,
        'browser': browser_info,
        'user_agent': user_agent,
        'location': location_str,
        'city': geo['city'],
        'country': geo['country'],
        'country_code': geo['countryCode'],
        'logged_in_at': datetime.now(timezone.utc).isoformat()
    }
    await db.login_history.insert_one(login_record)
    
    # Log system activity for login
    country = request.headers.get('CF-IPCountry', 'International')
    await log_system_activity(
        activity_type='login',
        description=f'Inicio de sesión: {user["name"]}',
        user_id=user['id'],
        user_name=user['name'],
        user_email=user['email'],
        ip_address=client_ip,
        country=country,
        metadata={'device': device_info, 'browser': browser_info}
    )
    
    # Check if this is a new IP and send email notification
    previous_logins = await db.login_history.find(
        {'user_id': user['id'], 'ip_address': client_ip}
    ).to_list(5)
    
    if len(previous_logins) <= 1:  # First time logging in from this IP
        send_email_background(
            user['email'],
            "Nuevo inicio de sesión detectado - LIONSBIT VERIFICACION",
            get_email_template(
                await _build_new_login_email_content(user['name'], client_ip, browser_info, location_str),
                "Nuevo Inicio de Sesión"
            )
        )
    
    token = create_token(user['id'], user['email'], user['role'])
    
    # Mark user as online
    await db.users.update_one(
        {'id': user['id']},
        {'$set': {'last_active': datetime.now(timezone.utc).isoformat(), 'is_online': True}}
    )
    
    return {
        'token': token,
        'user': {
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'role': user['role'],
            'verification_status': user.get('verification_status', 'unverified'),
            'account_status': user.get('account_status', 'active')
        },
        'login_info': {
            'ip': client_ip,
            'device': f"{browser_info} on {device_info}",
            'location': location_str,
            'time': login_record['logged_in_at']
        }
    }

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        'id': current_user['id'],
        'name': current_user['name'],
        'email': current_user['email'],
        'role': current_user['role'],
        'verification_status': current_user.get('verification_status', 'unverified'),
        'account_status': current_user.get('account_status', 'active'),
        'created_at': current_user['created_at']
    }

@api_router.get("/auth/login-history")
async def get_login_history(current_user: dict = Depends(get_current_user)):
    """Get last 5 login sessions for the current user"""
    history = await db.login_history.find(
        {'user_id': current_user['id']},
        {'_id': 0}
    ).sort('logged_in_at', -1).limit(5).to_list(5)
    return history

@api_router.post("/auth/change-password")
async def change_password(data: ChangePassword, current_user: dict = Depends(get_current_user)):
    """Change password for logged in user"""
    user = await db.users.find_one({'id': current_user['id']}, {'_id': 0})
    
    if not verify_password(data.current_password, user['password']):
        raise HTTPException(status_code=400, detail='Current password is incorrect')
    
    new_hashed = hash_password(data.new_password)
    await db.users.update_one(
        {'id': current_user['id']},
        {'$set': {'password': new_hashed}}
    )
    
    await create_notification(
        current_user['id'],
        'Password Changed',
        'Your password has been successfully changed.'
    )
    
    # Send email notification
    await send_password_changed_email(user['email'], user['name'])
    
    return {'message': 'Password changed successfully'}

@api_router.post("/auth/request-password-reset")
async def request_password_reset(data: PasswordResetRequest):
    """Request password reset link - sends real email"""
    user = await db.users.find_one({'email': data.email}, {'_id': 0})
    
    if not user:
        # Don't reveal if email exists
        return {'message': 'If the email exists, a reset link has been sent'}
    
    # Generate reset token
    reset_token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    
    # Save reset request
    reset_request = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'email': data.email,
        'token': reset_token,
        'expires_at': expires_at.isoformat(),
        'used': False,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.password_resets.insert_one(reset_request)
    
    # Generate reset link - use dynamic domain from environment
    reset_link = f"{APP_BASE_URL}/reset-password?token={reset_token}"
    
    # Send email with reset link
    await send_password_reset_email(user['email'], user['name'], reset_link, reset_token)
    
    return {'message': 'If the email exists, a reset link has been sent'}

async def send_password_reset_email(user_email: str, user_name: str, reset_link: str, token: str):
    """Send password reset email"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    
    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Hemos recibido una solicitud para restablecer la contraseña de su cuenta.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
            <tr>
                <td align="center">
                    <a href="{reset_link}" style="display: inline-block; background: linear-gradient(135deg, #10b981, #06b6d4); color: white; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                        Restablecer Contraseña
                    </a>
                </td>
            </tr>
        </table>
        
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">
            O copie y pegue este enlace en su navegador:
        </p>
        <p style="color: #06b6d4; font-size: 12px; word-break: break-all; background-color: #0f172a; padding: 12px; border-radius: 6px; font-family: monospace;">
            {reset_link}
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 20px;">
                    <p style="color: #f59e0b; font-size: 14px; margin: 0;">
                        ⏰ Este enlace expira en <strong>1 hora</strong>.
                    </p>
                    <p style="color: #94a3b8; font-size: 13px; margin: 10px 0 0 0;">
                        Fecha de solicitud: {date_str}
                    </p>
                </td>
            </tr>
        </table>
        
        <p style="color: #f87171; font-size: 14px; line-height: 1.6; background-color: rgba(248, 113, 113, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #f87171;">
            ⚠️ Si usted no solicitó restablecer su contraseña, puede ignorar este correo. Su contraseña no será cambiada.
        </p>
    """
    
    html = get_email_template(content, "Restablecer Contraseña")
    await send_email(user_email, "🔐 Restablecer contraseña - LIONSBIT VERIFICACION", html)

@api_router.post("/auth/reset-password")
async def reset_password(data: PasswordResetConfirm):
    """Reset password using token"""
    reset_request = await db.password_resets.find_one({
        'token': data.token,
        'used': False
    }, {'_id': 0})
    
    if not reset_request:
        raise HTTPException(status_code=400, detail='Invalid or expired reset token')
    
    # Check if expired
    expires_at = datetime.fromisoformat(reset_request['expires_at'].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail='Reset token has expired')
    
    # Update password
    new_hashed = hash_password(data.new_password)
    await db.users.update_one(
        {'id': reset_request['user_id']},
        {'$set': {'password': new_hashed}}
    )
    
    # Mark token as used
    await db.password_resets.update_one(
        {'token': data.token},
        {'$set': {'used': True}}
    )
    
    return {'message': 'Password has been reset successfully'}

# ==================== SUPPORT TICKET ROUTES ====================

@api_router.post("/support/tickets")
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

@api_router.post("/support/payment-issue")
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

@api_router.get("/support/tickets")
async def get_my_tickets(current_user: dict = Depends(get_current_user)):
    """Get all tickets for current user"""
    tickets = await db.support_tickets.find(
        {'user_id': current_user['id']},
        {'_id': 0}
    ).sort('created_at', -1).to_list(100)
    return tickets

@api_router.get("/support/tickets/{ticket_id}")
async def get_ticket(ticket_id: str, current_user: dict = Depends(get_current_user)):
    """Get specific ticket"""
    ticket = await db.support_tickets.find_one(
        {'id': ticket_id, 'user_id': current_user['id']},
        {'_id': 0}
    )
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    return ticket

@api_router.post("/support/tickets/{ticket_id}/reply")
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

@api_router.get("/admin/support/tickets")
async def admin_get_all_tickets(admin: dict = Depends(get_admin_user)):
    """Get all support tickets (admin)"""
    tickets = await db.support_tickets.find(
        {},
        {'_id': 0}
    ).sort('created_at', -1).to_list(1000)
    return tickets

@api_router.post("/admin/support/tickets/{ticket_id}/reply")
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

@api_router.put("/admin/support/tickets/{ticket_id}/status")
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

@api_router.get("/admin/password-resets")
async def admin_get_password_resets(admin: dict = Depends(get_admin_user)):
    """Get pending password reset requests (MOCK)"""
    resets = await db.admin_notifications.find(
        {'type': 'password_reset_request'},
        {'_id': 0}
    ).sort('created_at', -1).to_list(100)
    return resets

# ==================== KYC ROUTES ====================

@api_router.post("/kyc/submit")
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

@api_router.get("/kyc/status")
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

# ==================== ACCOUNT ROUTES ====================

@api_router.get("/accounts", response_model=List[AccountResponse])
async def get_accounts(current_user: dict = Depends(get_current_user)):
    accounts = await db.accounts.find({'user_id': current_user['id']}, {'_id': 0}).to_list(100)
    return [AccountResponse(**acc) for acc in accounts]

@api_router.get("/accounts/summary/total")
async def get_account_summary(current_user: dict = Depends(get_current_user)):
    accounts = await db.accounts.find({'user_id': current_user['id']}, {'_id': 0}).to_list(100)
    
    total_usd = sum(acc['balance_usd'] for acc in accounts)
    total_eur = sum(acc['balance_eur'] for acc in accounts)
    
    savings = next((acc for acc in accounts if acc['account_type'] == 'savings'), None)
    invested_usd = savings['balance_usd'] if savings else 0
    invested_eur = savings['balance_eur'] if savings else 0
    
    checking = next((acc for acc in accounts if acc['account_type'] == 'checking'), None)
    available_usd = checking['balance_usd'] if checking else 0
    available_eur = checking['balance_eur'] if checking else 0
    
    return {
        'total': {'usd': total_usd, 'eur': total_eur},
        'available': {'usd': available_usd, 'eur': available_eur},
        'invested': {'usd': invested_usd, 'eur': invested_eur},
        'accounts': accounts
    }

@api_router.get("/accounts/investment-history")
async def get_investment_history(current_user: dict = Depends(get_current_user)):
    """Get investment reservation history for current user"""
    investments = await db.transactions.find(
        {'user_id': current_user['id'], 'transaction_type': 'investment_reserve'},
        {'_id': 0}
    ).sort('created_at', -1).to_list(100)

    savings = await db.accounts.find_one(
        {'user_id': current_user['id'], 'account_type': 'savings'}, {'_id': 0}
    )
    total_invested_eur = savings.get('balance_eur', 0) if savings else 0
    total_invested_usd = savings.get('balance_usd', 0) if savings else 0

    return {
        'total_invested_eur': round(total_invested_eur, 2),
        'total_invested_usd': round(total_invested_usd, 0),
        'status': 'Fondos reservados' if (total_invested_eur > 0 or total_invested_usd > 0) else 'Sin inversiones',
        'count': len(investments),
        'history': [{
            'id': inv.get('id'),
            'amount': inv.get('amount', 0),
            'currency': inv.get('currency', 'EUR'),
            'status': inv.get('status', 'completed'),
            'description': inv.get('description', ''),
            'type': 'Reserva para inversion',
            'created_at': inv.get('created_at'),
        } for inv in investments],
    }

@api_router.get("/accounts/{account_id}", response_model=AccountResponse)
async def get_account(account_id: str, current_user: dict = Depends(get_current_user)):
    account = await db.accounts.find_one({'id': account_id, 'user_id': current_user['id']}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    return AccountResponse(**account)

# ==================== INVESTMENT RESERVATION ====================

@api_router.post("/accounts/invest")
async def reserve_investment(req: InvestmentRequest, current_user: dict = Depends(get_current_user)):
    """Reserve funds from checking to savings as 'investment reservation'"""
    if req.amount < 300:
        raise HTTPException(status_code=400, detail='El monto minimo de inversion es €300')
    
    account = await db.accounts.find_one({'id': req.account_id, 'user_id': current_user['id'], 'account_type': 'checking'}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Cuenta corriente no encontrada')
    
    balance_field = 'balance_eur' if req.currency == 'EUR' else 'balance_usd'
    if account[balance_field] < req.amount:
        raise HTTPException(status_code=400, detail='Saldo insuficiente')
    
    # Deduct from checking
    await db.accounts.update_one(
        {'id': req.account_id},
        {'$inc': {balance_field: -req.amount}}
    )
    
    # Add to savings
    savings = await db.accounts.find_one({'user_id': current_user['id'], 'account_type': 'savings'}, {'_id': 0})
    if savings:
        await db.accounts.update_one(
            {'id': savings['id']},
            {'$inc': {balance_field: req.amount}}
        )
    
    # Log transaction
    tx_id = str(uuid.uuid4())
    await db.transactions.insert_one({
        'id': tx_id,
        'user_id': current_user['id'],
        'account_id': req.account_id,
        'transaction_type': 'investment_reserve',
        'amount': req.amount,
        'currency': req.currency,
        'status': 'completed',
        'description': f'Reserva de inversion: {req.amount} {req.currency}',
        'created_at': datetime.now(timezone.utc).isoformat(),
    })
    
    await create_notification(current_user['id'], 'Inversion Reservada',
        f'Ha reservado {req.amount} {req.currency} para la seccion de inversion futura.')
    
    return {'message': 'Fondos reservados para inversion', 'amount': req.amount, 'currency': req.currency}

# ==================== USER ACTIVITY TRACKING ====================

# ==================== ACHIEVEMENTS SYSTEM ====================

ACHIEVEMENTS_DEF = [
    {'id': 'first_login', 'name': 'Primer Acceso', 'desc': 'Iniciar sesion por primera vez', 'icon': '🏆', 'category': 'basico'},
    {'id': 'kyc_verified', 'name': 'Identidad Verificada', 'desc': 'Completar verificacion KYC', 'icon': '🔐', 'category': 'basico'},
    {'id': 'first_investment', 'name': 'Primera Inversion', 'desc': 'Reservar fondos por primera vez', 'icon': '💰', 'category': 'inversion'},
    {'id': 'first_withdrawal', 'name': 'Primer Retiro', 'desc': 'Solicitar primer retiro', 'icon': '📤', 'category': 'transacciones'},
    {'id': 'streak_5', 'name': 'Racha de 5 Dias', 'desc': 'Acceder 5 dias consecutivos', 'icon': '🔥', 'category': 'actividad'},
    {'id': 'active_user', 'name': 'Usuario Activo', 'desc': '10+ accesos en un mes', 'icon': '⭐', 'category': 'actividad'},
    {'id': 'committed_investor', 'name': 'Inversor Comprometido', 'desc': 'Mantener inversion por 7+ dias', 'icon': '💎', 'category': 'inversion'},
    {'id': 'level_plata', 'name': 'Nivel Plata', 'desc': 'Alcanzar nivel Plata', 'icon': '🥈', 'category': 'niveles'},
    {'id': 'level_oro', 'name': 'Nivel Oro', 'desc': 'Alcanzar nivel Oro', 'icon': '🥇', 'category': 'niveles'},
    {'id': 'level_platino', 'name': 'Nivel Platino', 'desc': 'Alcanzar nivel Platino', 'icon': '💠', 'category': 'niveles'},
]

async def check_and_unlock_achievements(user_id: str):
    """Check all achievement conditions and unlock new ones. Returns list of newly unlocked."""
    existing = await db.achievements.find({'user_id': user_id}, {'_id': 0}).to_list(100)
    unlocked_ids = {a['achievement_id'] for a in existing}
    newly_unlocked = []
    
    user = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not user:
        return []
    
    async def unlock(ach_id):
        if ach_id not in unlocked_ids:
            await db.achievements.insert_one({
                'user_id': user_id,
                'achievement_id': ach_id,
                'unlocked_at': datetime.now(timezone.utc).isoformat(),
            })
            ach_def = next((a for a in ACHIEVEMENTS_DEF if a['id'] == ach_id), None)
            if ach_def:
                newly_unlocked.append(ach_def)
                await create_notification(user_id, f'Logro desbloqueado: {ach_def["name"]}!',
                    f'{ach_def["icon"]} {ach_def["desc"]}')
    
    # 1. first_login - always true if user exists
    await unlock('first_login')
    
    # 2. kyc_verified
    if user.get('verification_status') == 'verified':
        await unlock('kyc_verified')
    
    # 3. first_investment
    inv_tx = await db.transactions.find_one({'user_id': user_id, 'transaction_type': 'investment_reserve'})
    if inv_tx:
        await unlock('first_investment')
    
    # 4. first_withdrawal
    wd_tx = await db.transactions.find_one({'user_id': user_id, 'transaction_type': 'withdraw'})
    if wd_tx:
        await unlock('first_withdrawal')
    
    # 5. streak_5 - 5 consecutive days with login
    since_7d = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    logins = await db.login_history.find(
        {'user_id': user_id, 'timestamp': {'$gte': since_7d}},
        {'_id': 0, 'timestamp': 1}
    ).to_list(200)
    if logins:
        login_days = sorted(set(l['timestamp'][:10] for l in logins if isinstance(l.get('timestamp'), str)))
        max_streak = 1
        current_streak = 1
        for i in range(1, len(login_days)):
            try:
                d1 = datetime.fromisoformat(login_days[i-1])
                d2 = datetime.fromisoformat(login_days[i])
                if (d2 - d1).days == 1:
                    current_streak += 1
                    max_streak = max(max_streak, current_streak)
                else:
                    current_streak = 1
            except Exception:
                pass
        if max_streak >= 5:
            await unlock('streak_5')
    
    # 6. active_user - 10+ logins in 30 days
    since_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    login_count = await db.login_history.count_documents({
        'user_id': user_id, 'timestamp': {'$gte': since_30d}
    })
    if login_count >= 10:
        await unlock('active_user')
    
    # 7. committed_investor - investment for 7+ days
    first_inv = await db.transactions.find_one(
        {'user_id': user_id, 'transaction_type': 'investment_reserve'},
        sort=[('created_at', 1)]
    )
    if first_inv and first_inv.get('created_at'):
        try:
            inv_date = datetime.fromisoformat(first_inv['created_at'].replace('Z', '+00:00'))
            if (datetime.now(timezone.utc) - inv_date).days >= 7:
                await unlock('committed_investor')
        except Exception:
            pass
    
    # 8-10. Level achievements
    level = user.get('gamification_level', 'bronce')
    level_order = LEVEL_CONFIG.get(level, {}).get('order', 0)
    if level_order >= 1:
        await unlock('level_plata')
    if level_order >= 2:
        await unlock('level_oro')
    if level_order >= 3:
        await unlock('level_platino')
    
    return newly_unlocked

@api_router.get("/user/achievements")
async def get_user_achievements(current_user: dict = Depends(get_current_user)):
    """Get all achievements with unlocked status"""
    # Check and potentially unlock new ones
    newly_unlocked = await check_and_unlock_achievements(current_user['id'])
    
    unlocked = await db.achievements.find({'user_id': current_user['id']}, {'_id': 0}).to_list(100)
    unlocked_map = {a['achievement_id']: a['unlocked_at'] for a in unlocked}
    
    result = []
    for ach in ACHIEVEMENTS_DEF:
        result.append({
            'id': ach['id'],
            'name': ach['name'],
            'desc': ach['desc'],
            'icon': ach['icon'],
            'category': ach['category'],
            'unlocked': ach['id'] in unlocked_map,
            'unlocked_at': unlocked_map.get(ach['id']),
        })
    
    total = len(ACHIEVEMENTS_DEF)
    completed = sum(1 for a in result if a['unlocked'])
    
    return {
        'achievements': result,
        'total': total,
        'completed': completed,
        'progress': round((completed / total) * 100) if total > 0 else 0,
        'newly_unlocked': newly_unlocked,
    }

# ==================== GAMIFICATION / USER LEVELS ====================

LEVEL_CONFIG = {
    'bronce': {'min_balance': 0, 'min_logins': 0, 'label': 'Bronce', 'icon': '🥉', 'order': 0,
               'benefits': ['Acceso basico a la plataforma', 'Tiempo de procesamiento estandar']},
    'plata': {'min_balance': 2500, 'min_logins': 5, 'label': 'Plata', 'icon': '🥈', 'order': 1,
              'benefits': ['Procesamiento prioritario', 'Limites de retiro mas altos', 'Soporte preferente']},
    'oro': {'min_balance': 10000, 'min_logins': 15, 'label': 'Oro', 'icon': '🥇', 'order': 2,
            'benefits': ['Procesamiento express', 'Sin limites de retiro', 'Badge visible en perfil', 'Alertas avanzadas']},
    'platino': {'min_balance': 25000, 'min_logins': 0, 'label': 'Platino', 'icon': '💎', 'order': 3,
                'benefits': ['Maxima prioridad', 'Acceso anticipado a nuevas funciones', 'Soporte dedicado', 'Beneficios exclusivos']},
}

def calculate_user_level(total_balance_eur: float, login_count: int, has_investment: bool):
    """Calculate user level based on balance + logins + investment"""
    # Platino: balance >= 25000 OR active investment with balance >= 25000
    if total_balance_eur >= 25000 or (has_investment and total_balance_eur >= 25000):
        return 'platino'
    # Oro: balance >= 10000 OR 15+ logins
    if total_balance_eur >= 10000 or login_count >= 15:
        return 'oro'
    # Plata: balance >= 2500 OR 5+ logins
    if total_balance_eur >= 2500 or login_count >= 5:
        return 'plata'
    return 'bronce'

def get_next_level_info(current_level: str, total_balance_eur: float, login_count: int):
    """Get progress toward next level"""
    levels = ['bronce', 'plata', 'oro', 'platino']
    idx = levels.index(current_level)
    if idx >= len(levels) - 1:
        return None  # Already max level
    
    next_lvl = levels[idx + 1]
    cfg = LEVEL_CONFIG[next_lvl]
    
    balance_needed = max(0, cfg['min_balance'] - total_balance_eur)
    logins_needed = max(0, cfg['min_logins'] - login_count) if cfg['min_logins'] > 0 else None
    
    # Progress percentage (based on balance toward next level)
    if cfg['min_balance'] > 0:
        prev_min = LEVEL_CONFIG[current_level]['min_balance']
        range_total = cfg['min_balance'] - prev_min
        progress_amount = total_balance_eur - prev_min
        balance_progress = min(100, max(0, (progress_amount / range_total) * 100)) if range_total > 0 else 0
    else:
        balance_progress = 0
    
    # Login progress
    if cfg['min_logins'] > 0:
        prev_logins = LEVEL_CONFIG[current_level].get('min_logins', 0)
        range_logins = cfg['min_logins'] - prev_logins
        login_progress = min(100, max(0, ((login_count - prev_logins) / range_logins) * 100)) if range_logins > 0 else 0
    else:
        login_progress = 0
    
    overall_progress = max(balance_progress, login_progress)
    
    return {
        'next_level': next_lvl,
        'next_label': cfg['label'],
        'next_icon': cfg['icon'],
        'balance_needed': round(balance_needed, 2),
        'logins_needed': logins_needed,
        'progress': round(overall_progress, 1),
        'next_benefits': cfg['benefits'],
    }

@api_router.get("/user/level")
async def get_user_level(current_user: dict = Depends(get_current_user)):
    """Get user's gamification level, progress, and dynamic messages"""
    # Calculate total balance (checking + savings)
    accounts = await db.accounts.find({'user_id': current_user['id']}, {'_id': 0}).to_list(100)
    total_eur = sum(acc.get('balance_eur', 0) for acc in accounts)
    total_usd = sum(acc.get('balance_usd', 0) for acc in accounts)
    
    savings = next((acc for acc in accounts if acc['account_type'] == 'savings'), None)
    has_investment = (savings and (savings.get('balance_eur', 0) > 0 or savings.get('balance_usd', 0) > 0))
    investment_eur = savings.get('balance_eur', 0) if savings else 0
    
    # Count logins in last 30 days
    since_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    login_count = await db.login_history.count_documents({
        'user_id': current_user['id'],
        'timestamp': {'$gte': since_30d}
    })
    
    current_level = calculate_user_level(total_eur, login_count, has_investment)
    next_info = get_next_level_info(current_level, total_eur, login_count)
    cfg = LEVEL_CONFIG[current_level]
    
    # Check for level-up
    stored_level = current_user.get('gamification_level', 'bronce')
    leveled_up = False
    if LEVEL_CONFIG[current_level]['order'] > LEVEL_CONFIG.get(stored_level, LEVEL_CONFIG['bronce'])['order']:
        leveled_up = True
        await db.users.update_one(
            {'id': current_user['id']},
            {'$set': {'gamification_level': current_level}}
        )
        await create_notification(
            current_user['id'],
            f'Has subido a nivel {cfg["label"]}!',
            f'Felicidades! Ahora eres nivel {cfg["label"]} {cfg["icon"]}. Disfruta de tus nuevos beneficios.'
        )
    elif stored_level != current_level:
        await db.users.update_one(
            {'id': current_user['id']},
            {'$set': {'gamification_level': current_level}}
        )
    
    # Dynamic message
    message = None
    if next_info:
        if next_info['progress'] >= 80:
            message = f'Estas muy cerca de subir a {next_info["next_label"]}!'
        elif next_info['progress'] >= 50:
            message = f'Te faltan €{next_info["balance_needed"]:,.0f} para alcanzar {next_info["next_label"]}'
        elif next_info['progress'] < 20:
            message = 'Completa tu proceso para mejorar tus beneficios'
    
    return {
        'level': current_level,
        'label': cfg['label'],
        'icon': cfg['icon'],
        'benefits': cfg['benefits'],
        'order': cfg['order'],
        'total_balance_eur': round(total_eur, 2),
        'investment_eur': round(investment_eur, 2),
        'login_count_30d': login_count,
        'has_investment': bool(has_investment),
        'next': next_info,
        'leveled_up': leveled_up,
        'message': message,
    }

# ==================== USER ACTIVITY TRACKING ====================

@api_router.post("/user/activity")
async def track_activity(event: ActivityEvent, current_user: dict = Depends(get_current_user)):
    """Track user activity events for dynamic messaging"""
    await db.user_activity.insert_one({
        'user_id': current_user['id'],
        'event_type': event.event_type,
        'page': event.page,
        'details': event.details,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    })
    return {'status': 'ok'}

@api_router.get("/user/activity-score")
async def get_activity_score(current_user: dict = Depends(get_current_user)):
    """Calculate user engagement score based on recent activity"""
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    
    events = await db.user_activity.find({
        'user_id': current_user['id'],
        'timestamp': {'$gte': since}
    }, {'_id': 0}).to_list(500)
    
    login_count = await db.login_history.count_documents({
        'user_id': current_user['id'],
        'timestamp': {'$gte': since}
    })
    
    withdraw_visits = sum(1 for e in events if e.get('page') == '/withdraw')
    total_interactions = len(events)
    
    # Score: low (<5 interactions), medium (5-15), high (>15)
    score = 'low'
    if total_interactions > 15 or login_count > 5:
        score = 'high'
    elif total_interactions > 5 or login_count > 2:
        score = 'medium'
    
    return {
        'score': score,
        'login_count': login_count,
        'withdraw_visits': withdraw_visits,
        'total_interactions': total_interactions,
    }

# ==================== INCOMPLETE PROCESS TRACKING ====================

@api_router.post("/user/mark-incomplete-process")
async def mark_incomplete_process(current_user: dict = Depends(get_current_user)):
    """Mark that user started withdrawal but didn't complete"""
    existing = await db.incomplete_processes.find_one({
        'user_id': current_user['id'],
        'resolved': False
    })
    if existing:
        await db.incomplete_processes.update_one(
            {'user_id': current_user['id'], 'resolved': False},
            {'$set': {'last_seen': datetime.now(timezone.utc).isoformat()}}
        )
    else:
        await db.incomplete_processes.insert_one({
            'user_id': current_user['id'],
            'email': current_user['email'],
            'name': current_user.get('name', ''),
            'resolved': False,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'last_seen': datetime.now(timezone.utc).isoformat(),
            'email_sent': False,
            'notification_sent': False,
        })
    return {'status': 'ok'}

@api_router.post("/user/resolve-incomplete-process")
async def resolve_incomplete_process(current_user: dict = Depends(get_current_user)):
    """Mark incomplete process as resolved (user completed withdrawal)"""
    await db.incomplete_processes.update_many(
        {'user_id': current_user['id'], 'resolved': False},
        {'$set': {'resolved': True, 'resolved_at': datetime.now(timezone.utc).isoformat()}}
    )
    return {'status': 'ok'}

# ==================== TRANSACTION ROUTES ====================

@api_router.post("/transactions")
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
        
        if account[balance_field] < tx_data.amount:
            raise HTTPException(status_code=400, detail='Fondos insuficientes')
        
        # Validate banking info is provided
        if not tx_data.banking_info:
            raise HTTPException(status_code=400, detail='La información bancaria es requerida para retiros')
        
        # Withdrawals require tax payment before admin approval
        status = 'pending_tax'
        transaction_reference = generate_transaction_reference()
        
        # Create notification about withdrawal request and tax requirement
        await create_notification(current_user['id'], 'Solicitud de Retiro - Impuesto Pendiente',
            f'Su solicitud de retiro de {tx_data.amount} {currency} ha sido recibida. Para procesar su retiro, debe abonar el impuesto requerido. Referencia: {transaction_reference}')
        
        # Log withdrawal request for admin notification
        await db.admin_notifications.insert_one({
            'id': str(uuid.uuid4()),
            'type': 'withdrawal_request',
            'user_id': current_user['id'],
            'user_email': current_user['email'],
            'user_name': current_user['name'],
            'amount': tx_data.amount,
            'currency': currency,
            'status': 'pending_tax',
            'created_at': datetime.now(timezone.utc).isoformat()
        })
        
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
            title='Nueva Solicitud de Retiro - Impuesto Pendiente',
            message=f'{current_user["name"]} ha solicitado un retiro de ${tx_data.amount:,.2f} {tx_data.currency}. Impuesto pendiente de pago.',
            user_info={
                'name': current_user['name'],
                'email': current_user['email'],
                'ip': 'N/A',
                'country': 'N/A'
            },
            metadata={
                'amount': tx_data.amount, 
                'currency': tx_data.currency,
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
    
    # Return transaction without MongoDB _id field
    return {k: v for k, v in transaction.items() if k != '_id'}

@api_router.get("/transactions")
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

@api_router.get("/transactions/all")
async def get_all_transactions(current_user: dict = Depends(get_current_user)):
    transactions = await db.transactions.find(
        {'user_id': current_user['id']},
        {'_id': 0}
    ).sort('created_at', -1).to_list(1000)
    
    return transactions

@api_router.get("/transactions/stats")
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

@api_router.get("/transactions/export/csv")
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

@api_router.get("/withdrawals/history")
async def get_withdrawal_history(current_user: dict = Depends(get_current_user)):
    """Get user's withdrawal history grouped by date with privacy-safe data"""
    from collections import defaultdict
    
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

@api_router.get("/transactions/{transaction_id}/receipt")
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

# Minimum tax payment amount
MIN_TAX_PAYMENT = 200.0

@api_router.post("/transactions/{transaction_id}/pay-tax")
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
        raise HTTPException(status_code=400, detail=f'Minimum tax payment is ${MIN_TAX_PAYMENT:.2f} USD')
    
    account = await db.accounts.find_one(
        {'user_id': current_user['id'], 'account_type': 'checking'},
        {'_id': 0}
    )
    
    if not account:
        raise HTTPException(status_code=404, detail='Checking account not found')
    
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
    
    # Check if tax is fully paid
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
            
            await create_notification(current_user['id'], 'Tax Payment Complete - Withdrawal Processing',
                f'Tax payment complete! Your withdrawal of {transaction["amount"]} {transaction["currency"]} is now being processed. You will be notified once approved.')
            
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
    
    await db.transactions.update_one({'id': transaction_id}, {'$set': update_fields})
    
    updated_tx = await db.transactions.find_one({'id': transaction_id}, {'_id': 0})
    return updated_tx

# ==================== CRYPTO TAX PAYMENT ROUTES ====================

@api_router.get("/crypto-wallets")
async def get_crypto_wallets():
    """Get corporate crypto wallet addresses for tax payments"""
    return CRYPTO_WALLETS

@api_router.post("/transactions/{transaction_id}/pay-tax-crypto")
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
    
    # Update transaction status
    await db.transactions.update_one(
        {'id': transaction_id},
        {'$set': {'status': 'crypto_payment_under_review'}}
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
    
    # Send email to admin (background)
    admin_email = f"""
        <p style="color: #e2e8f0; font-size: 16px;">Nuevo pago crypto registrado.</p>
        <table width="100%" style="background-color: #0f172a; border-radius: 12px; margin: 20px 0;">
            <tr><td style="padding: 25px;">
                <table width="100%">
                    <tr><td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Usuario:</td>
                        <td style="color: #10b981; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-weight: bold;">{current_user['name']}</td></tr>
                    <tr><td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Email:</td>
                        <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{current_user['email']}</td></tr>
                    <tr><td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto:</td>
                        <td style="color: #f97316; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-weight: bold;">${payment.amount_sent} USD</td></tr>
                    <tr><td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Crypto:</td>
                        <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{payment.crypto_type}</td></tr>
                    <tr><td style="color: #94a3b8; padding: 8px 0;">TXID:</td>
                        <td style="color: #e2e8f0; text-align: right; padding: 8px 0; font-family: monospace; font-size: 12px;">{payment.txid}</td></tr>
                </table>
            </td></tr>
        </table>
    """
    send_email_background("info@paylionsbit.es", f"Nuevo Pago Crypto - ${payment.amount_sent} USD - {current_user['name']}", get_email_template(admin_email, "Pago Crypto Recibido"))
    
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

@api_router.get("/transactions/{transaction_id}/crypto-payment")
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

@api_router.get("/admin/crypto-payments/{payment_id}/proof")
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

@api_router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    notifications = await db.notifications.find(
        {'user_id': current_user['id']},
        {'_id': 0}
    ).sort('created_at', -1).limit(50).to_list(50)
    
    unread_count = await db.notifications.count_documents({
        'user_id': current_user['id'],
        'read': False
    })
    
    return {
        'notifications': notifications,
        'unread_count': unread_count
    }

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.notifications.update_one(
        {'id': notification_id, 'user_id': current_user['id']},
        {'$set': {'read': True}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail='Notification not found')
    
    return {'message': 'Notification marked as read'}

@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    await db.notifications.update_many(
        {'user_id': current_user['id'], 'read': False},
        {'$set': {'read': True}}
    )
    return {'message': 'All notifications marked as read'}

# ==================== ADMIN ROUTES ====================

@api_router.get("/admin/users")
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

@api_router.get("/admin/transactions")
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

@api_router.get("/admin/withdrawals/pending")
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

@api_router.post("/admin/withdrawals/approve/{transaction_id}")
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

@api_router.post("/admin/withdrawals/reject/{transaction_id}")
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

@api_router.put("/admin/withdrawals/update-status")
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

@api_router.get("/admin/withdrawals/all")
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

@api_router.get("/admin/withdrawals/{transaction_id}/details")
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

@api_router.post("/admin/withdrawals/{transaction_id}/reactivate")
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



@api_router.put("/admin/balance")
async def admin_update_balance(data: AdminUpdateBalance, admin: dict = Depends(get_admin_user)):
    account = await db.accounts.find_one({'id': data.account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    await db.accounts.update_one(
        {'id': data.account_id},
        {'$set': {'balance_usd': data.balance_usd, 'balance_eur': data.balance_eur}}
    )
    
    return {'message': 'Balance updated', 'account_id': data.account_id}

@api_router.post("/admin/add-balance")
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

@api_router.get("/admin/credits")
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

@api_router.put("/admin/transaction-status")
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

@api_router.put("/admin/user-role")
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

@api_router.post("/admin/kyc/action")
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
@api_router.get("/admin/kyc/submissions")
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

@api_router.post("/admin/user/suspend")
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

@api_router.post("/admin/transfer/force-release")
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

@api_router.get("/admin/treasury")
async def admin_get_treasury(admin: dict = Depends(get_admin_user)):
    """Get Government Treasury balance"""
    treasury = await ensure_government_treasury()
    treasury_updated = await db.accounts.find_one({'id': GOVERNMENT_TREASURY_ID}, {'_id': 0})
    return treasury_updated

@api_router.get("/admin/kyc/pending")
async def admin_get_pending_kyc(admin: dict = Depends(get_admin_user)):
    """Get users with pending KYC"""
    users = await db.users.find(
        {'verification_status': 'pending_verification'},
        {'_id': 0, 'password': 0}
    ).to_list(1000)
    return users

# ==================== ADMIN CRYPTO PAYMENT ROUTES ====================

@api_router.get("/admin/crypto-payments/pending")
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

@api_router.post("/admin/crypto-payments/action")
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

@api_router.get("/admin/crypto-payments/history")
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

@api_router.get("/admin/crypto-payments/stats")
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

@api_router.post("/admin/tax-payment")
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

@api_router.get("/admin/pending-withdrawals")
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

@api_router.get("/admin/manual-payments")
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

@api_router.get("/admin/notifications")
async def admin_get_notifications(admin: dict = Depends(get_admin_user)):
    """Get all admin notifications"""
    notifications = await db.admin_notifications.find(
        {},
        {'_id': 0}
    ).sort('created_at', -1).to_list(100)
    return notifications

@api_router.put("/admin/notifications/{notification_id}/read")
async def admin_mark_notification_read(notification_id: str, admin: dict = Depends(get_admin_user)):
    """Mark admin notification as read"""
    await db.admin_notifications.update_one(
        {'id': notification_id},
        {'$set': {'read': True}}
    )
    return {'message': 'Notification marked as read'}

@api_router.put("/admin/notifications/read-all")
async def admin_mark_all_notifications_read(admin: dict = Depends(get_admin_user)):
    """Mark all admin notifications as read"""
    await db.admin_notifications.update_many(
        {'read': False},
        {'$set': {'read': True}}
    )
    return {'message': 'All notifications marked as read'}

@api_router.get("/admin/notifications/unread-count")
async def admin_get_unread_count(admin: dict = Depends(get_admin_user)):
    """Get count of unread admin notifications"""
    count = await db.admin_notifications.count_documents({'read': False})
    return {'unread_count': count}

@api_router.get("/admin/activity")
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

@api_router.get("/admin/activity/stats")
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

# ==================== UTILITY ROUTES ====================

@api_router.get("/exchange-rates")
async def get_exchange_rates():
    return EXCHANGE_RATES

@api_router.get("/")
async def root():
    return {"message": "LIONSBIT VERIFICACION API", "version": "2.0.0"}

# ==================== ONLINE PRESENCE / HEARTBEAT ====================

@api_router.post("/auth/heartbeat")
async def heartbeat(current_user: dict = Depends(get_current_user)):
    """Update user's last_active timestamp to keep them online"""
    await db.users.update_one(
        {'id': current_user['id']},
        {'$set': {'last_active': datetime.now(timezone.utc).isoformat(), 'is_online': True}}
    )
    return {'status': 'ok'}

@api_router.post("/auth/logout-status")
async def logout_status(current_user: dict = Depends(get_current_user)):
    """Mark user as offline on logout"""
    await db.users.update_one(
        {'id': current_user['id']},
        {'$set': {'is_online': False}}
    )
    return {'status': 'ok'}

@api_router.get("/admin/users/online")
async def admin_get_online_users(admin: dict = Depends(get_admin_user)):
    """Get all currently online users (active in last 2 minutes)"""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()
    
    online_users = await db.users.find(
        {'is_online': True, 'last_active': {'$gte': cutoff}},
        {'_id': 0, 'password': 0, 'hashed_password': 0}
    ).to_list(100)
    
    # Also mark users as offline if their last_active is too old
    await db.users.update_many(
        {'is_online': True, 'last_active': {'$lt': cutoff}},
        {'$set': {'is_online': False}}
    )
    
    # Get last login info for each online user
    result = []
    for user in online_users:
        last_login = await db.login_history.find_one(
            {'user_id': user['id']},
            {'_id': 0}
        )
        result.append({
            'id': user['id'],
            'name': user.get('name', 'Desconocido'),
            'email': user.get('email', ''),
            'role': user.get('role', 'user'),
            'verification_status': user.get('verification_status', 'unverified'),
            'last_active': user.get('last_active', ''),
            'login_ip': last_login.get('ip_address', '-') if last_login else '-',
            'login_location': last_login.get('location', '-') if last_login else '-',
            'login_device': f"{last_login.get('browser', '?')} / {last_login.get('device', '?')}" if last_login else '-',
            'logged_in_at': last_login.get('logged_in_at', '') if last_login else ''
        })
    
    return result

# ==================== ADMIN LOGIN HISTORY ROUTES ====================

@api_router.get("/admin/login-history")
async def admin_get_login_history(admin: dict = Depends(get_admin_user)):
    """Get all login history for admin panel - most recent first"""
    history = await db.login_history.find(
        {},
        {'_id': 0}
    ).sort('logged_in_at', -1).limit(200).to_list(200)
    return history

@api_router.get("/admin/login-history/suspicious")
async def admin_get_suspicious_logins(admin: dict = Depends(get_admin_user)):
    """Detect suspicious logins: same user from different countries within 24 hours"""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    
    # Get recent logins
    recent = await db.login_history.find(
        {'logged_in_at': {'$gte': cutoff}},
        {'_id': 0}
    ).sort('logged_in_at', -1).to_list(500)
    
    # Group by user_id and detect different countries
    user_logins = {}
    for login in recent:
        uid = login.get('user_id', '')
        if uid not in user_logins:
            user_logins[uid] = []
        user_logins[uid].append(login)
    
    suspicious = []
    for uid, logins in user_logins.items():
        countries = set()
        for l in logins:
            cc = l.get('country_code') or l.get('country', '')
            if cc and cc != '--' and cc != 'Desconocido':
                countries.add(cc)
        if len(countries) > 1:
            suspicious.append({
                'user_id': uid,
                'user_name': logins[0].get('user_name', 'Desconocido'),
                'user_email': logins[0].get('user_email', 'Desconocido'),
                'countries': list(countries),
                'logins': logins[:10],
                'alert': f"Acceso desde {len(countries)} países diferentes en 24h"
            })
    
    return suspicious


# ==================== MARKET DATA (CoinGecko) ====================

_market_cache = {'data': None, 'timestamp': 0, 'global': None, 'global_ts': 0, 'trending': None, 'trending_ts': 0}

COINGECKO_HEADERS = {'Accept': 'application/json', 'User-Agent': 'LIONSBIT/1.0'}

@api_router.get("/market/crypto")
async def get_market_crypto():
    """Get top 50 cryptocurrencies from CoinGecko (cached 120s)"""
    now = datetime.now(timezone.utc).timestamp()
    if _market_cache['data'] and (now - _market_cache['timestamp']) < 120:
        return _market_cache['data']
    
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=COINGECKO_HEADERS) as client:
            resp = await client.get(
                "https://api.coingecko.com/api/v3/coins/markets",
                params={
                    'vs_currency': 'usd',
                    'order': 'market_cap_desc',
                    'per_page': 50,
                    'page': 1,
                    'sparkline': 'false',
                    'price_change_percentage': '24h,7d'
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                _market_cache['data'] = data
                _market_cache['timestamp'] = now
                return data
            elif resp.status_code == 429:
                logging.warning("CoinGecko rate limited for /coins/markets")
            else:
                logging.warning(f"CoinGecko markets status {resp.status_code}")
            return _market_cache['data'] or []
    except Exception as e:
        logging.error(f"CoinGecko markets error: {e}")
        return _market_cache['data'] or []

@api_router.get("/market/global")
async def get_market_global():
    """Get global crypto market data from CoinGecko (cached 180s)"""
    now = datetime.now(timezone.utc).timestamp()
    if _market_cache['global'] and (now - _market_cache['global_ts']) < 180:
        return _market_cache['global']
    
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=COINGECKO_HEADERS) as client:
            resp = await client.get("https://api.coingecko.com/api/v3/global")
            if resp.status_code == 200:
                data = resp.json().get('data', {})
                _market_cache['global'] = data
                _market_cache['global_ts'] = now
                return data
            return _market_cache['global'] or {}
    except Exception as e:
        logging.error(f"CoinGecko global error: {e}")
        return _market_cache['global'] or {}

@api_router.get("/market/trending")
async def get_market_trending():
    """Get trending coins from CoinGecko (cached 600s)"""
    now = datetime.now(timezone.utc).timestamp()
    if _market_cache['trending'] and (now - _market_cache['trending_ts']) < 600:
        return _market_cache['trending']
    
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=COINGECKO_HEADERS) as client:
            resp = await client.get("https://api.coingecko.com/api/v3/search/trending")
            if resp.status_code == 200:
                data = resp.json()
                _market_cache['trending'] = data
                _market_cache['trending_ts'] = now
                return data
            return _market_cache['trending'] or {'coins': [], 'categories': []}
    except Exception as e:
        logging.error(f"CoinGecko trending error: {e}")
        return _market_cache['trending'] or {'coins': [], 'categories': []}

# ==================== FINNHUB NEWS ====================

FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "")
_news_cache = {'general': None, 'general_ts': 0, 'crypto': None, 'crypto_ts': 0}

@api_router.get("/market/news")
async def get_market_news(category: str = "general"):
    """Get market news from Finnhub (cached 300s). category: general, crypto, forex, merger"""
    if category not in ("general", "crypto", "forex", "merger"):
        category = "general"
    
    cache_key = category
    now = datetime.now(timezone.utc).timestamp()
    
    if cache_key not in _news_cache:
        _news_cache[cache_key] = None
        _news_cache[f'{cache_key}_ts'] = 0
    
    if _news_cache.get(cache_key) and (now - _news_cache.get(f'{cache_key}_ts', 0)) < 300:
        return _news_cache[cache_key]
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://finnhub.io/api/v1/news",
                params={'category': category, 'token': FINNHUB_API_KEY}
            )
            if resp.status_code == 200:
                articles = resp.json()
                result = []
                for a in articles[:30]:
                    result.append({
                        'id': a.get('id'),
                        'headline': a.get('headline', ''),
                        'summary': a.get('summary', ''),
                        'source': a.get('source', ''),
                        'url': a.get('url', ''),
                        'image': a.get('image', ''),
                        'category': a.get('category', category),
                        'datetime': a.get('datetime', 0),
                        'related': a.get('related', ''),
                    })
                _news_cache[cache_key] = result
                _news_cache[f'{cache_key}_ts'] = now
                return result
            elif resp.status_code == 429:
                logging.warning("Finnhub rate limited")
            else:
                logging.warning(f"Finnhub news status {resp.status_code}")
            return _news_cache.get(cache_key) or []
    except Exception as e:
        logging.error(f"Finnhub news error: {e}")
        return _news_cache.get(cache_key) or []


# ==================== BINANCE INTEGRATION ====================

BINANCE_API_URL = "https://api.binance.us/api/v3"
_binance_cache = {
    'prices': None, 'prices_ts': 0,
    'tickers': None, 'tickers_ts': 0,
}

# Symbols we track for wallets
TRACKED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'DOTUSDT', 'AVAXUSDT', 'LINKUSDT']
SYMBOL_TO_COIN = {
    'BTCUSDT': {'coin': 'BTC', 'name': 'Bitcoin', 'icon': 'bitcoin'},
    'ETHUSDT': {'coin': 'ETH', 'name': 'Ethereum', 'icon': 'ethereum'},
    'BNBUSDT': {'coin': 'BNB', 'name': 'BNB', 'icon': 'bnb'},
    'SOLUSDT': {'coin': 'SOL', 'name': 'Solana', 'icon': 'solana'},
    'XRPUSDT': {'coin': 'XRP', 'name': 'Ripple', 'icon': 'xrp'},
    'ADAUSDT': {'coin': 'ADA', 'name': 'Cardano', 'icon': 'cardano'},
    'DOGEUSDT': {'coin': 'DOGE', 'name': 'Dogecoin', 'icon': 'doge'},
    'DOTUSDT': {'coin': 'DOT', 'name': 'Polkadot', 'icon': 'polkadot'},
    'AVAXUSDT': {'coin': 'AVAX', 'name': 'Avalanche', 'icon': 'avalanche'},
    'LINKUSDT': {'coin': 'LINK', 'name': 'Chainlink', 'icon': 'chainlink'},
}

@api_router.get("/binance/prices")
async def get_binance_prices():
    """Get real-time prices from Binance public API (cached 30s)"""
    now = datetime.now(timezone.utc).timestamp()
    if _binance_cache['prices'] and (now - _binance_cache['prices_ts']) < 30:
        return _binance_cache['prices']
    try:
        symbols_str = '["' + '","'.join(TRACKED_SYMBOLS) + '"]'
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            resp = await http_client.get(f"{BINANCE_API_URL}/ticker/price",
                params={'symbols': symbols_str})
            if resp.status_code == 200:
                data = resp.json()
                result = {}
                for item in data:
                    sym = item['symbol']
                    if sym in SYMBOL_TO_COIN:
                        coin_info = SYMBOL_TO_COIN[sym]
                        result[coin_info['coin']] = {
                            'symbol': sym,
                            'coin': coin_info['coin'],
                            'name': coin_info['name'],
                            'price': float(item['price']),
                        }
                _binance_cache['prices'] = result
                _binance_cache['prices_ts'] = now
                return result
            return _binance_cache['prices'] or {}
    except Exception as e:
        logging.error(f"Binance prices error: {e}")
        return _binance_cache['prices'] or {}

@api_router.get("/binance/tickers")
async def get_binance_tickers():
    """Get 24h ticker data from Binance (cached 60s)"""
    now = datetime.now(timezone.utc).timestamp()
    if _binance_cache['tickers'] and (now - _binance_cache['tickers_ts']) < 60:
        return _binance_cache['tickers']
    try:
        symbols_str = '["' + '","'.join(TRACKED_SYMBOLS) + '"]'
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            resp = await http_client.get(f"{BINANCE_API_URL}/ticker/24hr",
                params={'symbols': symbols_str})
            if resp.status_code == 200:
                data = resp.json()
                result = {}
                for item in data:
                    sym = item['symbol']
                    if sym in SYMBOL_TO_COIN:
                        coin_info = SYMBOL_TO_COIN[sym]
                        result[coin_info['coin']] = {
                            'symbol': sym,
                            'coin': coin_info['coin'],
                            'name': coin_info['name'],
                            'price': float(item['lastPrice']),
                            'price_change': float(item['priceChange']),
                            'price_change_pct': float(item['priceChangePercent']),
                            'high_24h': float(item['highPrice']),
                            'low_24h': float(item['lowPrice']),
                            'volume': float(item['volume']),
                            'quote_volume': float(item['quoteVolume']),
                        }
                _binance_cache['tickers'] = result
                _binance_cache['tickers_ts'] = now
                return result
            return _binance_cache['tickers'] or {}
    except Exception as e:
        logging.error(f"Binance tickers error: {e}")
        return _binance_cache['tickers'] or {}

@api_router.get("/binance/wallet")
async def get_binance_wallet(current_user: dict = Depends(get_current_user)):
    """Get user's wallet with REAL balances converted to crypto equivalents using live Binance prices"""
    # Get user's REAL platform balances
    accounts = await db.accounts.find({'user_id': current_user['id']}, {'_id': 0}).to_list(10)
    checking = next((a for a in accounts if a['account_type'] == 'checking'), None)
    savings = next((a for a in accounts if a['account_type'] == 'savings'), None)

    available_usd = checking.get('balance_usd', 0) if checking else 0
    available_eur = checking.get('balance_eur', 0) if checking else 0
    locked_usd = savings.get('balance_usd', 0) if savings else 0
    locked_eur = savings.get('balance_eur', 0) if savings else 0

    total_usd = available_usd + locked_usd

    # Fetch live prices from Binance
    prices = await get_binance_tickers()

    # Allocation percentages for the simulated crypto distribution
    ALLOCATION = [
        {'coin': 'BTC', 'name': 'Bitcoin', 'pct': 0.40},
        {'coin': 'ETH', 'name': 'Ethereum', 'pct': 0.25},
        {'coin': 'BNB', 'name': 'BNB', 'pct': 0.12},
        {'coin': 'SOL', 'name': 'Solana', 'pct': 0.08},
        {'coin': 'XRP', 'name': 'Ripple', 'pct': 0.05},
        {'coin': 'ADA', 'name': 'Cardano', 'pct': 0.03},
        {'coin': 'DOGE', 'name': 'Dogecoin', 'pct': 0.02},
        {'coin': 'DOT', 'name': 'Polkadot', 'pct': 0.02},
        {'coin': 'AVAX', 'name': 'Avalanche', 'pct': 0.02},
        {'coin': 'LINK', 'name': 'Chainlink', 'pct': 0.01},
    ]

    enriched_assets = []
    for alloc in ALLOCATION:
        coin = alloc['coin']
        price_data = prices.get(coin, {})
        price = price_data.get('price', 0)
        if price <= 0:
            continue

        # Calculate equivalent crypto amount from user's USD balance
        alloc_usd = total_usd * alloc['pct']
        crypto_qty = alloc_usd / price

        # Split available/locked proportionally
        avail_ratio = available_usd / total_usd if total_usd > 0 else 1
        avail_qty = crypto_qty * avail_ratio
        locked_qty = crypto_qty * (1 - avail_ratio)

        enriched_assets.append({
            'coin': coin,
            'name': alloc['name'],
            'available': round(avail_qty, 8),
            'locked': round(locked_qty, 8),
            'total': round(crypto_qty, 8),
            'price': price,
            'price_change_pct': price_data.get('price_change_pct', 0),
            'high_24h': price_data.get('high_24h', 0),
            'low_24h': price_data.get('low_24h', 0),
            'value_usd': round(alloc_usd, 2),
            'available_value_usd': round(alloc_usd * avail_ratio, 2),
            'locked_value_usd': round(alloc_usd * (1 - avail_ratio), 2),
        })

    distribution = []
    for a in enriched_assets:
        pct = (a['value_usd'] / total_usd * 100) if total_usd > 0 else 0
        distribution.append({'coin': a['coin'], 'name': a['name'], 'value': a['value_usd'], 'percentage': round(pct, 2)})

    return {
        'total_value_usd': round(total_usd, 2),
        'total_available_usd': round(available_usd, 2),
        'total_locked_usd': round(locked_usd, 2),
        'total_available_eur': round(available_eur, 2),
        'total_locked_eur': round(locked_eur, 2),
        'assets': enriched_assets,
        'distribution': distribution,
        'top_assets': enriched_assets[:5],
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }

@api_router.post("/admin/wallet/assign")
async def admin_assign_wallet_asset(data: AdminWalletAssign, admin: dict = Depends(get_admin_user)):
    """Admin assigns/updates a crypto asset in a user's simulated wallet"""
    wallet = await db.crypto_wallets_sim.find_one({'user_id': data.user_id}, {'_id': 0})
    if not wallet:
        wallet = {
            'id': str(uuid.uuid4()),
            'user_id': data.user_id,
            'assets': [],
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }
        await db.crypto_wallets_sim.insert_one(wallet)

    assets = wallet.get('assets', [])
    coin_name = SYMBOL_TO_COIN.get(f"{data.coin}USDT", {}).get('name', data.coin)
    found = False
    for asset in assets:
        if asset['coin'] == data.coin:
            asset['available'] = data.available
            asset['locked'] = data.locked
            found = True
            break
    if not found:
        assets.append({'coin': data.coin, 'name': coin_name, 'available': data.available, 'locked': data.locked})

    await db.crypto_wallets_sim.update_one(
        {'user_id': data.user_id},
        {'$set': {'assets': assets, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    return {'message': f'{data.coin} asignado a wallet del usuario'}


# ==================== CHATBOT ROUTES ====================


# ─── Bank Transfer Payment Confirmation ───

@api_router.get("/payments/bank-transfer-access")
async def check_bank_transfer_access(current_user: dict = Depends(get_current_user)):
    """Check if user has access to bank transfer method"""
    has_access = current_user['email'].lower() not in RESTRICTED_BANK_TRANSFER_EMAILS
    return {'has_access': has_access}

@api_router.post("/payments/bank-transfer-confirm")
async def confirm_bank_transfer(data: BankTransferConfirm, current_user: dict = Depends(get_current_user)):
    """Record bank transfer confirmation with proof upload + email notifications"""
    if current_user['email'].lower() in RESTRICTED_BANK_TRANSFER_EMAILS:
        raise HTTPException(status_code=403, detail='No tiene acceso a este metodo de pago')
    
    # Validate file if provided
    if data.proof_file and data.proof_filename:
        allowed_ext = ('.jpg', '.jpeg', '.png', '.pdf')
        if not data.proof_filename.lower().endswith(allowed_ext):
            raise HTTPException(status_code=400, detail='Formato de archivo no permitido. Use JPG, PNG o PDF.')
        # Check base64 size (~5MB limit -> ~6.7MB base64)
        if len(data.proof_file) > 7_000_000:
            raise HTTPException(status_code=400, detail='Archivo demasiado grande. Maximo 5MB.')
    
    record_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    now_formatted = datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')
    
    record = {
        'id': record_id,
        'user_id': current_user['id'],
        'user_name': current_user['name'],
        'user_email': current_user['email'],
        'type': 'bank_transfer',
        'reference': data.reference,
        'amount': 4850,
        'currency': 'EUR',
        'status': 'pending_verification',
        'comment': data.comment,
        'proof_filename': data.proof_filename,
        'has_proof': bool(data.proof_file),
        'bank_details': {
            'holder': 'Juan Gomez',
            'iban': 'BE73 9053 1376 1560',
            'swift': 'TRWIBEB1XXX',
        },
        'created_at': now,
        'updated_at': now
    }
    
    # Store proof file separately if provided (keep main record lean)
    if data.proof_file:
        await db.bank_transfer_proofs.insert_one({
            'payment_id': record_id,
            'filename': data.proof_filename,
            'data': data.proof_file,
            'created_at': now
        })
    
    await db.bank_transfer_payments.insert_one(record)
    
    # Notification to user
    await create_notification(current_user['id'], 'Comprobante Recibido',
        f'Su comprobante de transferencia bancaria (Ref: {data.reference}) ha sido recibido. Estado: Pendiente de verificacion.')
    
    # Notification to admins
    admins = await db.users.find({'role': 'admin'}, {'_id': 0, 'id': 1}).to_list(10)
    for admin in admins:
        await create_notification(admin['id'], 'Nueva Transferencia Bancaria',
            f'{current_user["name"]} ({current_user["email"]}) ha enviado comprobante de transferencia. Referencia: {data.reference}. Monto: 4850 EUR.')
    
    # ── Email to info@lionbit.es ──
    admin_email_content = f"""
        <p style="color:#e2e8f0;font-size:16px;">Se ha recibido un nuevo comprobante de transferencia bancaria.</p>
        <table width="100%" style="background:#0f172a;border-radius:12px;margin:20px 0;">
            <tr><td style="padding:25px;">
                <p style="color:#10b981;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">Datos de la Transferencia</p>
                <table width="100%">
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Nombre:</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;">{current_user['name']}</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Email:</td><td style="color:#10b981;text-align:right;padding:8px 0;border-bottom:1px solid #334155;">{current_user['email']}</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Monto:</td><td style="color:#f59e0b;text-align:right;padding:8px 0;border-bottom:1px solid #334155;font-weight:bold;">4850 EUR</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Referencia:</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;font-family:monospace;">{data.reference}</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Fecha:</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;">{now_formatted}</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Comprobante:</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;">{'Adjunto' if data.proof_file else 'No proporcionado'}</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;">Comentario:</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;">{data.comment or 'Sin comentario'}</td></tr>
                </table>
            </td></tr>
        </table>
    """
    admin_html = get_email_template(admin_email_content, "Nuevo Comprobante de Transferencia")
    
    # Build email params with optional attachment
    email_params = {
        "from": f"LIONSBIT VERIFICACION <{SENDER_EMAIL}>",
        "to": ["info@lionbit.es"],
        "subject": "Nuevo comprobante de transferencia recibido",
        "html": admin_html
    }
    
    if data.proof_file and data.proof_filename:
        import base64 as b64module
        # Extract raw base64 from data URI
        raw_b64 = data.proof_file
        if ',' in raw_b64:
            raw_b64 = raw_b64.split(',', 1)[1]
        email_params["attachments"] = [{
            "filename": data.proof_filename,
            "content": raw_b64
        }]
    
    if RESEND_API_KEY:
        try:
            await asyncio.to_thread(resend.Emails.send, email_params)
        except Exception as e:
            logging.error(f"Failed to send admin transfer email: {e}")
    
    # ── Confirmation email to user ──
    user_email_content = f"""
        <p style="color:#e2e8f0;font-size:16px;">Hemos recibido tu comprobante de transferencia bancaria.</p>
        <table width="100%" style="background:#0f172a;border-radius:12px;margin:20px 0;">
            <tr><td style="padding:25px;">
                <p style="color:#10b981;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">Resumen</p>
                <table width="100%">
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Monto:</td><td style="color:#f59e0b;text-align:right;padding:8px 0;border-bottom:1px solid #334155;font-weight:bold;">4850 EUR</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Referencia:</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;font-family:monospace;">{data.reference}</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;">Estado:</td><td style="color:#f59e0b;text-align:right;padding:8px 0;font-weight:bold;">Pendiente de verificacion</td></tr>
                </table>
            </td></tr>
        </table>
        <p style="color:#94a3b8;font-size:14px;">Sera verificado en un plazo de 1 a 3 dias habiles.</p>
    """
    user_html = get_email_template(user_email_content, "Comprobante Recibido")
    send_email_background(current_user['email'], "Comprobante recibido - LIONSBIT VERIFICACION", user_html)
    
    return {'message': 'Comprobante enviado correctamente. Pendiente de verificacion.', 'id': record_id, 'status': 'pending_verification'}


# ─── Bitcoin Outputs Verification ───
_btc_outputs_cache = {'data': None, 'ts': 0}

@api_router.get("/bitcoin/outputs")
async def get_bitcoin_outputs():
    """Fetch recent large Bitcoin outputs for transaction verification"""
    import time as _time
    now = _time.time()
    # Cache for 2 minutes
    if _btc_outputs_cache['data'] and (now - _btc_outputs_cache['ts']) < 120:
        return _btc_outputs_cache['data']

    outputs = []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Get BTC price
            price_resp = await client.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
            btc_price = 72000  # fallback
            if price_resp.status_code == 200:
                btc_price = price_resp.json().get('bitcoin', {}).get('usd', 72000)

            # Get latest block hash
            latest_resp = await client.get('https://blockchain.info/latestblock', headers={'User-Agent': 'Mozilla/5.0'})
            if latest_resp.status_code != 200:
                raise Exception('Failed to get latest block')
            latest = latest_resp.json()
            block_hash = latest['hash']
            block_height = latest['height']

            # Fetch last 2 blocks for more data
            for offset in range(2):
                bh = block_hash if offset == 0 else None
                if offset > 0:
                    prev_resp = await client.get(f'https://blockchain.info/rawblock/{block_hash}', headers={'User-Agent': 'Mozilla/5.0'})
                    if prev_resp.status_code == 200:
                        bh = prev_resp.json().get('prev_block')
                    else:
                        break
                if not bh:
                    break

                block_resp = await client.get(f'https://blockchain.info/rawblock/{bh}', headers={'User-Agent': 'Mozilla/5.0'})
                if block_resp.status_code != 200:
                    break
                block_data = block_resp.json()
                block_time = block_data.get('time', 0)
                block_hash = block_data.get('prev_block', '')

                for tx in block_data.get('tx', []):
                    for out_idx, out in enumerate(tx.get('out', [])):
                        value_btc = out.get('value', 0) / 1e8
                        value_usd = value_btc * btc_price
                        # Filter: $40,000 - $110,000 USD range
                        if 40000 <= value_usd <= 110000:
                            outputs.append({
                                'block_id': block_data.get('height', block_height - offset),
                                'transaction_hash': tx.get('hash', ''),
                                'index': out_idx,
                                'time': datetime.fromtimestamp(block_time, tz=timezone.utc).isoformat(),
                                'value_btc': round(value_btc, 8),
                                'value_usd': round(value_usd, 2),
                                'recipient': out.get('addr', 'Unknown'),
                                'is_spent': out.get('spent', False),
                                'script_hex': out.get('script', '')[:40] + '...' if out.get('script') else '',
                            })

                        if len(outputs) >= 50:
                            break
                    if len(outputs) >= 50:
                        break
                if len(outputs) >= 50:
                    break

        # Sort by time desc
        outputs.sort(key=lambda x: x['time'], reverse=True)
        result = {
            'outputs': outputs[:50],
            'btc_price': btc_price,
            'block_height': block_height,
            'total_found': len(outputs),
            'filter': {'min_usd': 40000, 'max_usd': 110000},
            'source': 'blockchain.info',
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        _btc_outputs_cache['data'] = result
        _btc_outputs_cache['ts'] = now
        return result

    except Exception as e:
        logging.error(f"Bitcoin outputs fetch error: {e}")
        if _btc_outputs_cache['data']:
            return _btc_outputs_cache['data']
        return {
            'outputs': [],
            'btc_price': 0,
            'block_height': 0,
            'total_found': 0,
            'filter': {'min_usd': 40000, 'max_usd': 110000},
            'source': 'blockchain.info',
            'error': str(e),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }



@api_router.post("/chatbot/message")
async def chatbot_message(data: ChatMessage):
    """Process chatbot message and return FAQ response"""
    message = data.message.lower()
    
    best_match = None
    best_score = 0
    
    for faq in CHATBOT_FAQ.values():
        score = sum(len(kw) for kw in faq['keywords'] if kw in message)
        if score > best_score:
            best_score = score
            best_match = faq
    
    if best_match and best_score > 0:
        return {'response': best_match['answer'], 'matched': True}
    
    return {
        'response': 'No encontré una respuesta exacta. Intente con palabras clave como: retiro, impuesto, verificación, tiempo, soporte. O cree un ticket de soporte para atención personalizada.',
        'matched': False
    }


# ─── Feedback System ───

@api_router.post("/feedback")
async def submit_feedback(data: FeedbackSubmission, current_user: dict = Depends(get_current_user)):
    """Submit user feedback (rating + comment)"""
    feedback = {
        'id': str(uuid.uuid4()),
        'user_id': current_user['id'],
        'user_email': current_user['email'],
        'user_name': current_user.get('name', ''),
        'rating': data.rating,
        'comment': data.comment,
        'category': data.category or 'general',
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.feedback.insert_one(feedback)

    # Notify admins of new feedback
    stars = data.rating * '\u2605' + (5 - data.rating) * '\u2606'
    await notify_admins('Nuevo Feedback',
        f'{current_user.get("name", current_user["email"])} dejo feedback: {stars} ({data.rating}/5)')

    return {'message': 'Feedback enviado correctamente', 'id': feedback['id']}


@api_router.get("/feedback/mine")
async def get_my_feedback(current_user: dict = Depends(get_current_user)):
    """Get current user's feedback history"""
    feedbacks = await db.feedback.find(
        {'user_id': current_user['id']}, {'_id': 0}
    ).sort('created_at', -1).to_list(50)
    return feedbacks


@api_router.get("/admin/feedback")
async def get_all_feedback(admin: dict = Depends(get_admin_user)):
    """Get all feedback for admin dashboard"""
    feedbacks = await db.feedback.find({}, {'_id': 0}).sort('created_at', -1).to_list(200)

    # Stats
    total = len(feedbacks)
    if total > 0:
        avg_rating = sum(f['rating'] for f in feedbacks) / total
        distribution = {i: sum(1 for f in feedbacks if f['rating'] == i) for i in range(1, 6)}
    else:
        avg_rating = 0
        distribution = {i: 0 for i in range(1, 6)}

    return {
        'feedbacks': feedbacks,
        'stats': {
            'total': total,
            'average_rating': round(avg_rating, 1),
            'distribution': distribution
        }
    }


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    await ensure_government_treasury()
    await ensure_admin_users()
    # Start the scheduler for tax reminders and auto-rejection
    start_scheduler()

# ==================== SCHEDULER FOR TAX REMINDERS ====================

scheduler = AsyncIOScheduler()

def start_scheduler():
    """Start the background scheduler for tax payment reminders and auto-rejection"""
    # Run every 15 hours for reminders
    scheduler.add_job(
        process_tax_reminders,
        IntervalTrigger(hours=15),
        id='tax_reminders',
        name='Send tax payment reminders',
        replace_existing=True
    )
    
    # Run every hour to check for 72-hour auto-rejection
    scheduler.add_job(
        process_auto_rejections,
        IntervalTrigger(hours=1),
        id='auto_rejections',
        name='Auto-reject expired withdrawals',
        replace_existing=True
    )
    
    # Run every 60 seconds to send balance notifications (20 users per batch)
    scheduler.add_job(
        process_balance_notifications,
        IntervalTrigger(seconds=60),
        id='balance_notifications',
        name='Send balance available notifications (20/min)',
        replace_existing=True
    )
    
    # Run every 30 minutes to check incomplete processes
    scheduler.add_job(
        process_incomplete_followups,
        IntervalTrigger(minutes=30),
        id='incomplete_followups',
        name='Follow up on incomplete processes',
        replace_existing=True
    )

    # Run every hour to recalculate user scoring
    scheduler.add_job(
        process_user_scoring,
        IntervalTrigger(hours=1),
        id='user_scoring',
        name='Recalculate user interest scoring',
        replace_existing=True
    )
    
    # Run every 12 hours to send process reminders
    scheduler.add_job(
        process_user_reminders,
        IntervalTrigger(hours=12),
        id='user_reminders',
        name='Send process completion reminders (12h)',
        replace_existing=True
    )

    
    scheduler.start()
    logging.info("Scheduler started: Tax reminders (15h), auto-rejections (1h), balance notifications (60s), incomplete process follow-ups (30min)")

async def process_incomplete_followups():
    """Send follow-up emails (1h) and notifications (24h) for incomplete processes"""
    logging.info("Running incomplete process follow-up job...")
    try:
        now = datetime.now(timezone.utc)
        one_hour_ago = (now - timedelta(hours=1)).isoformat()
        one_day_ago = (now - timedelta(hours=24)).isoformat()
        
        RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
        
        # 1h: Send email reminder
        processes_1h = await db.incomplete_processes.find({
            'resolved': False,
            'email_sent': False,
            'created_at': {'$lte': one_hour_ago}
        }, {'_id': 0}).to_list(20)
        
        for proc in processes_1h:
            if RESEND_API_KEY:
                try:
                    import httpx as _httpx
                    async with _httpx.AsyncClient(timeout=10.0) as client:
                        await client.post("https://api.resend.com/emails", headers={
                            "Authorization": f"Bearer {RESEND_API_KEY}",
                            "Content-Type": "application/json"
                        }, json={
                            "from": os.environ.get("FROM_EMAIL", "noreply@paylionsbit.es"),
                            "to": [proc['email']],
                            "subject": "Su proceso de retiro esta pendiente - LIONSBIT",
                            "html": f"""
                            <div style='font-family:Arial;padding:20px;'>
                            <h2>Hola {proc.get('name', '')},</h2>
                            <p>Notamos que inicio un proceso de retiro pero no lo ha completado.</p>
                            <p>Ingrese a su cuenta para continuar con su proceso de retiro.</p>
                            <p style='color:#888;font-size:12px;'>LIONSBIT VERIFICACION - Plataforma de Verificacion Digital</p>
                            </div>"""
                        })
                except Exception as e:
                    logging.error(f"Failed to send incomplete process email: {e}")
            
            await db.incomplete_processes.update_one(
                {'user_id': proc['user_id'], 'resolved': False},
                {'$set': {'email_sent': True}}
            )
        
        if processes_1h:
            logging.info(f"Sent {len(processes_1h)} incomplete process reminder emails")
        
        # 24h: Create dashboard notification
        processes_24h = await db.incomplete_processes.find({
            'resolved': False,
            'notification_sent': False,
            'created_at': {'$lte': one_day_ago}
        }, {'_id': 0}).to_list(50)
        
        for proc in processes_24h:
            await create_notification(
                proc['user_id'],
                'Proceso de Retiro Pendiente',
                'Tiene un proceso de retiro sin completar. Ingrese a la seccion de retiros para finalizarlo.'
            )
            await db.incomplete_processes.update_one(
                {'user_id': proc['user_id'], 'resolved': False},
                {'$set': {'notification_sent': True}}
            )
        
        if processes_24h:
            logging.info(f"Sent {len(processes_24h)} incomplete process dashboard notifications")
    
    except Exception as e:
        logging.error(f"Incomplete followup job error: {e}")

async def process_balance_notifications():
    """Send staggered email notifications to users with balance > 0 (20 users/min)"""
    logging.info("📧 Running balance notification job...")
    
    try:
        cutoff_48h = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
        
        # Get users with balance > 0 who haven't been notified in 48h
        users_with_balance = await db.accounts.aggregate([
            {'$match': {'$or': [
                {'balance_usd': {'$gt': 0}},
                {'balance_eur': {'$gt': 0}}
            ]}},
            {'$lookup': {
                'from': 'users',
                'localField': 'user_id',
                'foreignField': 'id',
                'as': 'user'
            }},
            {'$unwind': '$user'},
            {'$match': {'user.role': 'user'}},
            {'$project': {
                '_id': 0,
                'user_id': 1,
                'user_name': '$user.name',
                'user_email': '$user.email',
                'balance_usd': 1,
                'balance_eur': 1,
                'account_type': 1
            }}
        ]).to_list(500)
        
        # Filter out users already notified in last 48h
        eligible = []
        for u in users_with_balance:
            last_notif = await db.email_notifications_log.find_one(
                {'user_id': u['user_id'], 'type': 'balance_available', 'sent_at': {'$gte': cutoff_48h}},
                {'_id': 0}
            )
            if not last_notif:
                eligible.append(u)
        
        if not eligible:
            logging.info("📧 No users eligible for balance notification")
            return
        
        # Take only first 20 (batch of 20 per minute)
        batch = eligible[:20]
        logging.info(f"📧 Sending balance notifications to {len(batch)} users (of {len(eligible)} eligible)")
        
        for user in batch:
            try:
                balance_usd = user.get('balance_usd', 0)
                balance_eur = user.get('balance_eur', 0)
                total_display = f"${balance_usd:,.2f} USD" if balance_usd > 0 else f"€{balance_eur:,.2f} EUR"
                
                content = f"""
                    <p style="color: #e2e8f0; font-size: 16px;">
                        Estimado/a <strong style="color: #10b981;">{user['user_name']}</strong>,
                    </p>
                    <p style="color: #e2e8f0; font-size: 16px;">
                        Le informamos que tiene saldo disponible para retirar en su cuenta LIONSBIT VERIFICACION.
                    </p>
                    <table width="100%" style="background-color: #0f172a; border-radius: 12px; margin: 20px 0;">
                        <tr><td style="padding: 25px; text-align: center;">
                            <p style="color: #94a3b8; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin: 0;">Saldo Disponible</p>
                            <p style="color: #10b981; font-size: 32px; font-weight: bold; margin: 10px 0; font-family: monospace;">{total_display}</p>
                            <p style="color: #94a3b8; font-size: 13px;">Puede solicitar un retiro desde la plataforma.</p>
                        </td></tr>
                    </table>
                """
                
                html = get_email_template(content, "Saldo Disponible para Retiro")
                send_email_background(user['user_email'], "Tiene saldo disponible para retirar - LIONSBIT VERIFICACION", html)
                
                # Log the notification
                await db.email_notifications_log.insert_one({
                    'id': str(uuid.uuid4()),
                    'user_id': user['user_id'],
                    'user_email': user['user_email'],
                    'type': 'balance_available',
                    'status': 'sent',
                    'sent_at': datetime.now(timezone.utc).isoformat(),
                    'metadata': {'balance_usd': balance_usd, 'balance_eur': balance_eur}
                })
                
            except Exception as e:
                logging.error(f"📧 Failed to notify {user.get('user_email')}: {e}")
                await db.email_notifications_log.insert_one({
                    'id': str(uuid.uuid4()),
                    'user_id': user['user_id'],
                    'user_email': user.get('user_email', ''),
                    'type': 'balance_available',
                    'status': 'failed',
                    'sent_at': datetime.now(timezone.utc).isoformat(),
                    'error': str(e)
                })
        
        logging.info(f"📧 Balance notification batch complete: {len(batch)} sent")
        
    except Exception as e:
        logging.error(f"📧 Balance notification job error: {e}")

async def process_tax_reminders():
    """Send reminder emails for withdrawals with pending tax"""
    logging.info("🔔 Running tax reminder job...")
    
    try:
        # Find all withdrawals with pending tax - optimized projection
        pending_withdrawals = await db.transactions.find({
            'transaction_type': 'withdraw',
            'status': 'pending_tax'
        }, {'_id': 0, 'id': 1, 'user_id': 1, 'created_at': 1, 'amount': 1, 'currency': 1, 'tax_required': 1, 'tax_paid': 1, 'last_reminder_sent': 1}).to_list(1000)
        
        reminders_sent = 0
        for tx in pending_withdrawals:
            try:
                # Calculate hours since creation
                created_at = datetime.fromisoformat(tx['created_at'].replace('Z', '+00:00'))
                hours_since = (datetime.now(timezone.utc) - created_at).total_seconds() / 3600
                hours_remaining = max(0, 72 - hours_since)
                
                # Only send reminder if not about to expire (handled by auto-rejection)
                # and if it's been at least 12 hours since creation
                if hours_remaining > 6 and hours_since > 12:
                    # Get user info
                    user = await db.users.find_one({'id': tx['user_id']}, {'_id': 0, 'password': 0})
                    if user:
                        # Check last reminder sent time
                        last_reminder = tx.get('last_reminder_sent')
                        should_send = True
                        
                        if last_reminder:
                            last_reminder_dt = datetime.fromisoformat(last_reminder.replace('Z', '+00:00'))
                            hours_since_last = (datetime.now(timezone.utc) - last_reminder_dt).total_seconds() / 3600
                            # Don't send if we sent one in the last 12 hours
                            should_send = hours_since_last >= 12
                        
                        if should_send:
                            await send_tax_reminder_email(
                                user['email'], user['name'],
                                tx['amount'], tx['currency'],
                                tx.get('tax_required', TAX_AMOUNT),
                                tx.get('tax_paid', 0),
                                hours_remaining
                            )
                            
                            # Update last reminder sent time
                            await db.transactions.update_one(
                                {'id': tx['id']},
                                {'$set': {'last_reminder_sent': datetime.now(timezone.utc).isoformat()}}
                            )
                            reminders_sent += 1
                            logging.info(f"📧 Sent tax reminder to {user['email']} for tx {tx['id']}")
            
            except Exception as e:
                logging.error(f"Error sending reminder for tx {tx.get('id')}: {str(e)}")
        
        logging.info(f"✅ Tax reminder job completed. Sent {reminders_sent} reminders.")
    
    except Exception as e:
        logging.error(f"❌ Error in tax reminder job: {str(e)}")

async def process_auto_rejections():
    """Auto-reject withdrawals where tax hasn't been paid within 72 hours"""
    logging.info("⏰ Running auto-rejection job...")
    
    try:
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=72)
        
        # Find withdrawals older than 72 hours with pending tax - optimized projection
        expired_withdrawals = await db.transactions.find({
            'transaction_type': 'withdraw',
            'status': 'pending_tax',
            'created_at': {'$lt': cutoff_time.isoformat()}
        }, {'_id': 0, 'id': 1, 'user_id': 1, 'amount': 1, 'currency': 1}).to_list(1000)
        
        rejections_processed = 0
        for tx in expired_withdrawals:
            try:
                # Get user info
                user = await db.users.find_one({'id': tx['user_id']}, {'_id': 0, 'password': 0})
                
                # Reject the withdrawal
                await db.transactions.update_one(
                    {'id': tx['id']},
                    {'$set': {
                        'status': 'rejected',
                        'rejection_reason': 'Impuesto no pagado dentro de 72 horas',
                        'rejected_at': datetime.now(timezone.utc).isoformat(),
                        'auto_rejected': True
                    }}
                )
                
                # Create notification
                await create_notification(
                    tx['user_id'],
                    'Retiro Rechazado Automáticamente',
                    f'Su retiro de {tx["amount"]} {tx["currency"]} ha sido rechazado porque el impuesto no fue pagado dentro de 72 horas. Los fondos permanecen en su cuenta.'
                )
                
                # Send email
                if user:
                    await send_withdrawal_rejected_email(
                        user['email'], user['name'],
                        tx['amount'], tx['currency'],
                        'Impuesto no pagado dentro de 72 horas'
                    )
                
                rejections_processed += 1
                logging.info(f"❌ Auto-rejected withdrawal {tx['id']} for user {tx['user_id']}")
            
            except Exception as e:
                logging.error(f"Error auto-rejecting tx {tx.get('id')}: {str(e)}")
        
        logging.info(f"✅ Auto-rejection job completed. Processed {rejections_processed} rejections.")
    
    except Exception as e:
        logging.error(f"❌ Error in auto-rejection job: {str(e)}")

async def ensure_admin_users():
    """Ensure admin users exist on startup with verified status"""
    
    # Load admin credentials from environment variables
    admin_accounts = [
        {
            'email': os.environ.get('ADMIN_PRIMARY_EMAIL', ''),
            'password': os.environ.get('ADMIN_PRIMARY_PASSWORD', ''),
            'name': 'Admin Principal'
        },
        {
            'email': os.environ.get('ADMIN_BACKUP_EMAIL', ''),
            'password': os.environ.get('ADMIN_BACKUP_PASSWORD', ''),
            'name': 'Admin Respaldo'
        }
    ]
    
    # Filter out empty credentials
    admin_accounts = [a for a in admin_accounts if a['email'] and a['password']]
    
    for admin_data in admin_accounts:
        existing = await db.users.find_one({'email': admin_data['email']})
        
        if existing:
            # Ensure admin has correct role and verified status
            updates_needed = {}
            if existing.get('role') != 'admin':
                updates_needed['role'] = 'admin'
            if existing.get('verification_status') != 'verified':
                updates_needed['verification_status'] = 'verified'
            if existing.get('account_status') != 'active':
                updates_needed['account_status'] = 'active'
            # Fix: migrate hashed_password to password field
            if existing.get('hashed_password') and not existing.get('password'):
                updates_needed['password'] = existing.get('hashed_password')
            
            if updates_needed:
                await db.users.update_one(
                    {'email': admin_data['email']},
                    {'$set': updates_needed}
                )
                print(f"✅ Updated {admin_data['email']} - role: admin, verification: verified")
        else:
            # Create new admin user
            user_id = str(uuid.uuid4())
            hashed_pw = hash_password(admin_data['password'])
            
            user = {
                'id': user_id,
                'name': admin_data['name'],
                'email': admin_data['email'],
                'password': hashed_pw,
                'role': 'admin',
                'verification_status': 'verified',
                'account_status': 'active',
                'kyc_documents': {
                    'status': 'approved',
                    'verified_at': datetime.now(timezone.utc).isoformat(),
                    'note': 'Administrator account - automatically verified'
                },
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            
            await db.users.insert_one(user)
            
            # Create accounts for admin with initial balance
            checking = {
                'id': str(uuid.uuid4()),
                'user_id': user_id,
                'account_type': 'checking',
                'account_number': f"LB{uuid.uuid4().hex[:10].upper()}",
                'balance_usd': 100000.0,
                'balance_eur': 50000.0,
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            
            savings = {
                'id': str(uuid.uuid4()),
                'user_id': user_id,
                'account_type': 'savings',
                'account_number': f"LB{uuid.uuid4().hex[:10].upper()}",
                'balance_usd': 50000.0,
                'balance_eur': 25000.0,
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            
            await db.accounts.insert_many([checking, savings])
            print(f"✅ Created admin: {admin_data['email']} (verified, active)")




@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown()
    client.close()
