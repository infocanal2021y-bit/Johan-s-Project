from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
from fastapi.responses import StreamingResponse, Response
import io
import csv
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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Email Configuration
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'noreply@paylionsbit.es')
resend.api_key = RESEND_API_KEY

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'super-secret-banking-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# Exchange rates (static)
EXCHANGE_RATES = {
    'USD': 1.0,
    'EUR': 0.92
}

# Constants
DAILY_TRANSFER_LIMIT_EUR = 10000
UNVERIFIED_TRANSFER_LIMIT_EUR = 1000
TAX_AMOUNT = 4850.0
GOVERNMENT_TREASURY_ID = "GOVT-TREASURY-001"
FRAUD_THRESHOLD_AMOUNT = 5000
FRAUD_THRESHOLD_COUNT = 3
FRAUD_THRESHOLD_MINUTES = 5

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
# Use database name from environment if set, otherwise extract from connection string
db_name = os.environ.get('DB_NAME')
if not db_name:
    # Extract database name from MongoDB URL if present
    from urllib.parse import urlparse
    parsed = urlparse(mongo_url)
    db_name = parsed.path.strip('/') if parsed.path and parsed.path != '/' else 'lionsbit_bank'
db = client[db_name]

# Create the main app
app = FastAPI(title="LIONSBIT BANK API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    created_at: str
    verification_status: Optional[str] = 'unverified'
    account_status: Optional[str] = 'active'

class AccountResponse(BaseModel):
    id: str
    user_id: str
    account_type: str
    balance_usd: float
    balance_eur: float
    created_at: str

class TransactionCreate(BaseModel):
    account_id: str
    transaction_type: str  # deposit, withdraw, transfer
    amount: float = Field(..., gt=0)
    currency: str = Field(default='USD')
    description: Optional[str] = None
    recipient_account_id: Optional[str] = None  # For transfers

class TransactionResponse(BaseModel):
    id: str
    account_id: str
    user_id: str
    transaction_type: str
    amount: float
    currency: str
    status: str
    description: Optional[str]
    recipient_account_id: Optional[str]
    created_at: str
    tax_required: Optional[float] = None
    tax_paid: Optional[float] = None
    released_at: Optional[str] = None
    transaction_reference: Optional[str] = None

class PayTaxRequest(BaseModel):
    amount: float = Field(..., gt=0)

class AdminUpdateBalance(BaseModel):
    account_id: str
    balance_usd: float
    balance_eur: float

class AdminUpdateTransactionStatus(BaseModel):
    transaction_id: str
    status: str

class AdminUpdateUserRole(BaseModel):
    user_id: str
    role: str

class KYCSubmission(BaseModel):
    document_type: str  # passport, id_card, driver_license
    document_front: str  # base64 encoded - front of document
    document_back: str   # base64 encoded - back of document
    selfie_with_document: str  # base64 encoded - selfie holding document
    digital_signature: str  # User's full name as digital signature
    legal_consent: bool  # Must be True
    # Investment history fields
    investment_period: Optional[str] = None  # e.g., "2017-2023"
    investment_details: Optional[str] = None  # Description of investments

class AdminKYCAction(BaseModel):
    user_id: str
    action: str  # approve, reject, under_review
    rejection_reason: Optional[str] = None

class AdminSuspendUser(BaseModel):
    user_id: str
    action: str  # suspend, activate

class AdminForceRelease(BaseModel):
    transaction_id: str

class AdminAddBalance(BaseModel):
    user_id: str
    amount: float = Field(..., gt=0)
    currency: str = Field(default='USD')
    description: Optional[str] = None

class CryptoPaymentSubmission(BaseModel):
    transaction_id: str
    crypto_type: str  # BTC, ETH, USDT, LTC
    txid: str = Field(..., min_length=10)
    amount_sent: str
    proof_image: Optional[str] = None  # base64 encoded image

class AdminCryptoPaymentAction(BaseModel):
    payment_id: str
    action: str  # approve, reject
    rejection_reason: Optional[str] = None

class AdminManualTaxPayment(BaseModel):
    transaction_id: str
    amount: float = Field(..., gt=0)
    payment_method: str = Field(default='crypto')  # crypto, wire_transfer, other
    crypto_type: Optional[str] = None  # BTC, ETH, USDT
    txid: Optional[str] = None  # Transaction ID for crypto payments
    notes: Optional[str] = None

# ==================== NEW MODELS ====================

class SupportTicket(BaseModel):
    subject: str = Field(..., min_length=5, max_length=200)
    message: str = Field(..., min_length=10)
    category: str = Field(default='general')  # general, transfer, account, technical

class TicketReply(BaseModel):
    ticket_id: str
    message: str = Field(..., min_length=1)

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6)

class ChangePassword(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)

# Corporate Crypto Wallets (Fixed addresses for tax payments)
CRYPTO_WALLETS = {
    'BTC': {
        'address': 'bc1q5qaunggmt6ckrhw928g3v0fkzuklnwveflfred',
        'network': 'Bitcoin (Native SegWit)',
        'name': 'Bitcoin'
    },
    'ETH': {
        'address': '0x0F81928fc5a41bA7A65BaCEB971028fe9ac0674f',
        'network': 'Ethereum (ERC20)',
        'name': 'Ethereum'
    },
    'USDT': {
        'address': 'TP6mjP8s2vXAN8NuxfPiBZUq88Z6oznHCx',
        'network': 'Tron (TRC20)',
        'name': 'Tether USDT'
    },
    'LTC': {
        'address': 'ltc1qtaa2re5wfzj8fwxnykumrdamrn77apradd83d6',
        'network': 'Litecoin',
        'name': 'Litecoin'
    }
}

# ==================== HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        'user_id': user_id,
        'email': email,
        'role': role,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def generate_transaction_reference():
    """Generate unique transaction reference: TRX-YYYY-XXXXXX"""
    year = datetime.now(timezone.utc).year
    unique_part = uuid.uuid4().hex[:6].upper()
    return f"TRX-{year}-{unique_part}"

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({'id': payload['user_id']}, {'_id': 0})
        if not user:
            raise HTTPException(status_code=401, detail='User not found')
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid token')

async def get_admin_user(current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin access required')
    return current_user

async def create_notification(user_id: str, title: str, message: str):
    """Create a notification for a user"""
    notification = {
        'id': str(uuid.uuid4()),
        'user_id': user_id,
        'title': title,
        'message': message,
        'read': False,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification)
    return notification

async def notify_admins(title: str, message: str):
    """Notify all admin users"""
    admins = await db.users.find({'role': 'admin'}, {'_id': 0}).to_list(100)
    for admin in admins:
        await create_notification(admin['id'], title, message)

# ==================== ADMIN NOTIFICATION SYSTEM ====================

ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admi@paylionsbit.es')

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
                    <a href="https://paylionsbit.es/admin/activity" style="display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: white; text-decoration: none; padding: 14px 35px; border-radius: 8px; font-weight: bold;">
                        Ver Panel de Actividad
                    </a>
                </td>
            </tr>
        </table>
    """
    
    html = get_email_template(content, f"{icon} Alerta del Sistema")
    await send_email(ADMIN_EMAIL, f"{icon} {title} - LIONSBIT BANK Admin", html)

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
            "from": f"LIONSBIT BANK <{SENDER_EMAIL}>",
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

def get_email_template(content: str, title: str = "LIONSBIT BANK"):
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
                                    Este es un correo automático de LIONSBIT BANK.<br>
                                    Por favor no responda a este mensaje.
                                </p>
                                <p style="color: #64748b; font-size: 12px; margin: 10px 0 0 0;">
                                    © 2026 LIONSBIT BANK. Todos los derechos reservados.
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
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    currency_symbol = "$" if currency == "USD" else "€"
    
    content = f"""
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
            ⚠️ Si usted no reconoce esta operación, por favor contacte inmediatamente a nuestro equipo de soporte.
        </p>
    """
    
    html = get_email_template(content, "Saldo Agregado")
    await send_email(user_email, "💰 Saldo agregado a su cuenta - LIONSBIT BANK", html)

async def send_withdrawal_status_email(user_email: str, user_name: str, amount: float, currency: str, status: str, reason: str = None):
    """Send email notification for withdrawal status changes"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    currency_symbol = "$" if currency == "USD" else "€"
    
    status_config = {
        'pending': {'title': 'Retiro Solicitado', 'color': '#f59e0b', 'message': 'Su solicitud de retiro ha sido recibida y está pendiente de revisión.'},
        'pending_tax': {'title': 'Impuesto Pendiente', 'color': '#f97316', 'message': 'Su retiro requiere el pago de impuestos antes de ser procesado.'},
        'under_review': {'title': 'Retiro en Revisión', 'color': '#8b5cf6', 'message': 'Su solicitud de retiro está siendo revisada por nuestro equipo.'},
        'processing': {'title': 'Retiro en Proceso', 'color': '#06b6d4', 'message': 'Su retiro está siendo procesado y será completado pronto.'},
        'completed': {'title': 'Retiro Completado', 'color': '#10b981', 'message': '¡Su retiro ha sido completado exitosamente!'},
        'rejected': {'title': 'Retiro Rechazado', 'color': '#ef4444', 'message': f'Su solicitud de retiro ha sido rechazada. Razón: {reason or "Contacte a soporte"}'},
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
    await send_email(user_email, f"📤 {config['title']} - LIONSBIT BANK", html)

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
    await send_email(user_email, "🔐 Contraseña cambiada - LIONSBIT BANK", html)

async def send_new_login_email(user_email: str, user_name: str, ip_address: str, browser: str, location: str):
    """Send email notification for new login from unknown IP"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    
    content = f"""
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
            ⚠️ Si usted no realizó este acceso, por favor cambie su contraseña inmediatamente y contacte a nuestro equipo de soporte.
        </p>
    """
    
    html = get_email_template(content, "Nuevo Inicio de Sesión")
    await send_email(user_email, "🔔 Nuevo acceso detectado - LIONSBIT BANK", html)

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
    await send_email(user_email, "✅ Transferencia completada - LIONSBIT BANK", html)

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
                    <a href="https://paylionsbit.es/transactions" style="display: inline-block; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">
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
    await send_email(user_email, "⏳ Retiro pendiente - Pague su impuesto - LIONSBIT BANK", html)

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
    await send_email(user_email, f"💰 Abono recibido - {'Impuesto completado' if remaining <= 0 else 'Progreso actualizado'} - LIONSBIT BANK", html)

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
                    <a href="https://paylionsbit.es/transactions" style="display: inline-block; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">
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
    await send_email(user_email, f"⚠️ RECORDATORIO: Impuesto pendiente - {hours_remaining:.0f}h restantes - LIONSBIT BANK", html)

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
    await send_email(user_email, "❌ Su retiro ha sido rechazado - LIONSBIT BANK", html)

async def get_daily_transfer_total(user_id: str) -> float:
    """Get total EUR transfers for today"""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    transfers = await db.transactions.find({
        'user_id': user_id,
        'transaction_type': 'transfer',
        'created_at': {'$gte': today_start.isoformat()}
    }, {'_id': 0}).to_list(1000)
    
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
    
    recent_large_transfers = await db.transactions.find({
        'user_id': user_id,
        'transaction_type': 'transfer',
        'amount': {'$gt': FRAUD_THRESHOLD_AMOUNT},
        'created_at': {'$gte': five_minutes_ago}
    }, {'_id': 0}).to_list(100)
    
    # Including current transfer
    if len(recent_large_transfers) >= FRAUD_THRESHOLD_COUNT - 1 and amount > FRAUD_THRESHOLD_AMOUNT:
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
    
    await create_notification(user_id, '¡Bienvenido a LIONSBIT BANK!', 
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
    
    # Save login history
    login_record = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'ip_address': client_ip,
        'device': device_info,
        'browser': browser_info,
        'user_agent': user_agent,
        'location': 'Spain',  # Default, can be enhanced with IP geolocation
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
        await send_new_login_email(
            user_email=user['email'],
            user_name=user['name'],
            ip_address=client_ip,
            browser=browser_info,
            location='Spain'
        )
    
    token = create_token(user['id'], user['email'], user['role'])
    
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
            'location': 'Spain',
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
    
    # Generate reset link - use production domain
    reset_link = f"https://paylionsbit.es/reset-password?token={reset_token}"
    
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
    await send_email(user_email, "🔐 Restablecer contraseña - LIONSBIT BANK", html)

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
    
    return {'message': 'Ticket created successfully', 'ticket_number': ticket_number, 'id': ticket_id}

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

@api_router.get("/accounts/{account_id}", response_model=AccountResponse)
async def get_account(account_id: str, current_user: dict = Depends(get_current_user)):
    account = await db.accounts.find_one({'id': account_id, 'user_id': current_user['id']}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    return AccountResponse(**account)

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
        if account[balance_field] < tx_data.amount:
            raise HTTPException(status_code=400, detail='Insufficient funds')
        
        # Withdrawals require tax payment first
        status = 'pending_tax'
        
        # Create notification about withdrawal tax requirement
        await create_notification(current_user['id'], 'Withdrawal Tax Required',
            f'Your withdrawal request of {tx_data.amount} {currency} requires a tax payment of ${TAX_AMOUNT:.2f} USD before processing. You can pay in installments of $200 USD or more.')
        
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
    
    # Withdrawals also require tax payment
    if tx_data.transaction_type == 'withdraw':
        transaction['tax_required'] = TAX_AMOUNT
        transaction['tax_paid'] = 0.0
        transaction['released_at'] = None
        
        # Notify admin about withdrawal request
        await create_admin_notification(
            notification_type='withdrawal_request',
            title='Nueva Solicitud de Retiro',
            message=f'{current_user["name"]} ha solicitado un retiro de ${tx_data.amount:,.2f} {tx_data.currency}',
            user_info={
                'name': current_user['name'],
                'email': current_user['email'],
                'ip': 'N/A',
                'country': 'N/A'
            },
            metadata={'amount': tx_data.amount, 'currency': tx_data.currency, 'tax_required': TAX_AMOUNT}
        )
        
        # Log system activity
        await log_system_activity(
            activity_type='withdrawal',
            description=f'Solicitud de retiro: ${tx_data.amount:,.2f} {tx_data.currency}',
            user_id=current_user['id'],
            user_name=current_user['name'],
            user_email=current_user['email'],
            metadata={'amount': tx_data.amount, 'currency': tx_data.currency}
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

@api_router.get("/transactions/{transaction_id}/receipt")
async def get_transaction_receipt(transaction_id: str, current_user: dict = Depends(get_current_user)):
    """Generate PDF receipt for completed transfer"""
    transaction = await db.transactions.find_one(
        {'id': transaction_id, 'user_id': current_user['id']},
        {'_id': 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail='Transaction not found')
    
    if transaction['status'] != 'completed':
        raise HTTPException(status_code=400, detail='Receipt only available for completed transactions')
    
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
    
    elements = []
    
    # Header
    elements.append(Paragraph("LIONSBIT BANK", title_style))
    elements.append(Paragraph("Transfer Receipt", styles['Heading2']))
    elements.append(Spacer(1, 20))
    
    # Transaction details
    data = [
        ['Reference:', transaction.get('transaction_reference', transaction['id'][:8])],
        ['Date:', transaction['created_at'][:19].replace('T', ' ')],
        ['Type:', transaction['transaction_type'].upper()],
        ['Amount:', f"{transaction['amount']:.2f} {transaction['currency']}"],
        ['Status:', transaction['status'].upper()],
        ['Tax Paid:', f"${transaction.get('tax_paid', 0):.2f}"],
        ['Recipient Account:', transaction.get('recipient_account_id', 'N/A')[:12] + '...'],
        ['Released At:', transaction.get('released_at', 'N/A')[:19].replace('T', ' ') if transaction.get('released_at') else 'N/A']
    ]
    
    table = Table(data, colWidths=[2*inch, 4*inch])
    table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#64748b')),
        ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#1e293b')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('LINEBELOW', (0, 0), (-1, -2), 0.5, colors.HexColor('#e2e8f0')),
    ]))
    elements.append(table)
    
    elements.append(Spacer(1, 40))
    
    # Footer
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#94a3b8')
    )
    elements.append(Paragraph("This is an official LIONSBIT BANK transaction receipt.", footer_style))
    elements.append(Paragraph(f"Generated on {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    
    return Response(
        content=buffer.getvalue(),
        media_type='application/pdf',
        headers={
            'Content-Disposition': f'attachment; filename=receipt_{transaction.get("transaction_reference", transaction_id[:8])}.pdf'
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
        raise HTTPException(status_code=400, detail='A crypto payment is already under review for this transaction')
    
    # Validate crypto type
    if payment.crypto_type not in CRYPTO_WALLETS:
        raise HTTPException(status_code=400, detail='Invalid cryptocurrency type')
    
    # Validate proof image size (max 5MB base64)
    if payment.proof_image and len(payment.proof_image) > 7000000:
        raise HTTPException(status_code=400, detail='Proof image too large (max 5MB)')
    
    # Create crypto payment record
    now = datetime.now(timezone.utc).isoformat()
    payment_id = str(uuid.uuid4())
    
    crypto_payment = {
        'id': payment_id,
        'transaction_id': transaction_id,
        'user_id': current_user['id'],
        'crypto_type': payment.crypto_type,
        'wallet_address': CRYPTO_WALLETS[payment.crypto_type]['address'],
        'network': CRYPTO_WALLETS[payment.crypto_type]['network'],
        'txid': payment.txid,
        'amount_sent': payment.amount_sent,
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
        'Crypto Payment Submitted',
        f'Your {payment.crypto_type} payment is under review. TXID: {payment.txid[:20]}...'
    )
    
    return {
        'message': 'Crypto payment submitted for review',
        'payment_id': payment_id,
        'status': 'under_review'
    }

@api_router.get("/transactions/{transaction_id}/crypto-payment")
async def get_crypto_payment_status(
    transaction_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get crypto payment status for a transaction"""
    # Verify ownership
    transaction = await db.transactions.find_one(
        {'id': transaction_id, 'user_id': current_user['id']},
        {'_id': 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail='Transaction not found')
    
    payment = await db.crypto_payments.find_one(
        {'transaction_id': transaction_id},
        {'_id': 0, 'proof_image': 0}  # Exclude large image data
    )
    
    return payment

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
    users = await db.users.find({}, {'_id': 0, 'password': 0}).to_list(1000)
    
    for user in users:
        accounts = await db.accounts.find({'user_id': user['id']}, {'_id': 0}).to_list(100)
        user['accounts'] = accounts
        user['total_balance_usd'] = sum(acc['balance_usd'] for acc in accounts)
        user['total_balance_eur'] = sum(acc['balance_eur'] for acc in accounts)
    
    return users

@api_router.get("/admin/transactions")
async def admin_get_transactions(
    status: Optional[str] = None,
    admin: dict = Depends(get_admin_user)
):
    query = {}
    if status:
        query['status'] = status
    
    transactions = await db.transactions.find(query, {'_id': 0}).sort('created_at', -1).to_list(1000)
    
    for tx in transactions:
        user = await db.users.find_one({'id': tx['user_id']}, {'_id': 0, 'password': 0})
        tx['user'] = user
    
    return transactions

@api_router.get("/admin/withdrawals/pending")
async def admin_get_pending_withdrawals(admin: dict = Depends(get_admin_user)):
    withdrawals = await db.transactions.find(
        {'transaction_type': 'withdraw', 'status': 'pending'},
        {'_id': 0}
    ).sort('created_at', -1).to_list(1000)
    
    for w in withdrawals:
        user = await db.users.find_one({'id': w['user_id']}, {'_id': 0, 'password': 0})
        w['user'] = user
    
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
    
    # Send email notification
    await send_balance_added_email(
        user_email=user['email'],
        user_name=user['name'],
        amount=data.amount,
        currency=currency,
        new_balance=new_balance
    )
    
    # Log system activity for admin deposit
    await log_system_activity(
        activity_type='deposit',
        description=f'Saldo agregado por admin: ${data.amount:,.2f} {currency} a {user["name"]}',
        user_id=data.user_id,
        user_name=user['name'],
        user_email=user['email'],
        metadata={'amount': data.amount, 'currency': currency, 'admin': admin['name']}
    )
    
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
    """Get all admin_credit transactions"""
    credits = await db.transactions.find(
        {'transaction_type': 'admin_credit'},
        {'_id': 0}
    ).sort('created_at', -1).to_list(1000)
    
    # Enrich with user info
    for credit in credits:
        user = await db.users.find_one({'id': credit['user_id']}, {'_id': 0, 'password': 0})
        credit['user'] = user
    
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
    """Get all KYC submissions with full legal records"""
    submissions = await db.kyc_submissions.find({}, {'_id': 0}).sort('submitted_at', -1).to_list(100)
    
    # Enrich with user info
    for sub in submissions:
        user = await db.users.find_one({'id': sub.get('user_id')}, {'_id': 0, 'name': 1, 'email': 1})
        if user:
            sub['user_name'] = user.get('name')
            sub['user_email'] = user.get('email')
    
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
    return {"message": "LIONSBIT BANK API", "version": "2.0.0"}

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
    
    scheduler.start()
    logging.info("📅 Scheduler started: Tax reminders (15h) and auto-rejections (1h)")

async def process_tax_reminders():
    """Send reminder emails for withdrawals with pending tax"""
    logging.info("🔔 Running tax reminder job...")
    
    try:
        # Find all withdrawals with pending tax
        pending_withdrawals = await db.transactions.find({
            'transaction_type': 'withdraw',
            'status': 'pending_tax'
        }, {'_id': 0}).to_list(1000)
        
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
        
        # Find withdrawals older than 72 hours with pending tax
        expired_withdrawals = await db.transactions.find({
            'transaction_type': 'withdraw',
            'status': 'pending_tax',
            'created_at': {'$lt': cutoff_time.isoformat()}
        }, {'_id': 0}).to_list(1000)
        
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
    
    # List of admin accounts to create/verify
    admin_accounts = [
        {
            'email': 'admi@paylionsbit.es',
            'password': 'LionsBit2026!',
            'name': 'Admin Principal'
        },
        {
            'email': 'admin.backup@paylionsbit.es',
            'password': 'LionsBit2026!Backup',
            'name': 'Admin Respaldo'
        }
    ]
    
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
