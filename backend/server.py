from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

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
db = client[os.environ['DB_NAME']]

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
    document_data: str  # base64 encoded
    selfie_data: str    # base64 encoded

class AdminKYCAction(BaseModel):
    user_id: str
    action: str  # approve, reject

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
async def register(user_data: UserCreate):
    existing = await db.users.find_one({'email': user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail='Email already registered')
    
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
    
    await create_notification(user_id, 'Welcome to LIONSBIT BANK!', 
        'Your account has been created. Please complete KYC verification to unlock all features.')
    
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
    if not user or not verify_password(credentials.password, user['password']):
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
    
    return {'message': 'Password changed successfully'}

@api_router.post("/auth/request-password-reset")
async def request_password_reset(data: PasswordResetRequest):
    """Request password reset link (MOCK - shows in admin panel)"""
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
    
    # In production, send email. For now, log it and show in admin
    reset_link = f"/reset-password?token={reset_token}"
    logger.info(f"[MOCK EMAIL] Password reset link for {data.email}: {reset_link}")
    
    # Create admin notification
    await db.admin_notifications.insert_one({
        'id': str(uuid.uuid4()),
        'type': 'password_reset_request',
        'user_email': data.email,
        'reset_link': reset_link,
        'reset_token': reset_token,
        'created_at': datetime.now(timezone.utc).isoformat()
    })
    
    return {'message': 'If the email exists, a reset link has been sent', 'mock_link': reset_link}

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
async def create_ticket(ticket: SupportTicket, current_user: dict = Depends(get_current_user)):
    """Create a new support ticket"""
    ticket_id = str(uuid.uuid4())
    ticket_number = f"TKT-{datetime.now().strftime('%Y%m%d')}-{ticket_id[:6].upper()}"
    
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
        'Ticket Created',
        f'Your support ticket {ticket_number} has been created. We will respond shortly.'
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
async def submit_kyc(kyc_data: KYCSubmission, current_user: dict = Depends(get_current_user)):
    """Submit KYC documents for verification"""
    if current_user.get('verification_status') == 'verified':
        raise HTTPException(status_code=400, detail='Already verified')
    
    kyc_documents = {
        'document_type': kyc_data.document_type,
        'document_data': kyc_data.document_data,
        'selfie_data': kyc_data.selfie_data,
        'submitted_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.update_one(
        {'id': current_user['id']},
        {'$set': {
            'verification_status': 'pending_verification',
            'kyc_documents': kyc_documents
        }}
    )
    
    await create_notification(current_user['id'], 'KYC Submitted',
        'Your verification documents have been submitted and are under review.')
    
    await notify_admins('New KYC Submission',
        f'User {current_user["name"]} ({current_user["email"]}) submitted KYC documents.')
    
    return {'message': 'KYC documents submitted successfully', 'status': 'pending_verification'}

@api_router.get("/kyc/status")
async def get_kyc_status(current_user: dict = Depends(get_current_user)):
    """Get current KYC verification status"""
    return {
        'verification_status': current_user.get('verification_status', 'unverified'),
        'has_documents': current_user.get('kyc_documents') is not None
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
        status = 'pending'
        
        # Create notification about withdrawal in process
        await create_notification(current_user['id'], 'Withdrawal In Process',
            f'Your withdrawal request of {tx_data.amount} {currency} is being processed. You will be notified once approved.')
        
        # Log withdrawal request for admin notification
        await db.admin_notifications.insert_one({
            'id': str(uuid.uuid4()),
            'type': 'withdrawal_request',
            'user_id': current_user['id'],
            'user_email': current_user['email'],
            'user_name': current_user['name'],
            'amount': tx_data.amount,
            'currency': currency,
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

@api_router.post("/transactions/{transaction_id}/pay-tax")
async def pay_tax(transaction_id: str, tax_payment: PayTaxRequest, current_user: dict = Depends(get_current_user)):
    transaction = await db.transactions.find_one(
        {'id': transaction_id, 'user_id': current_user['id']},
        {'_id': 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail='Transaction not found')
    
    if transaction['transaction_type'] != 'transfer':
        raise HTTPException(status_code=400, detail='Tax payment only applies to transfers')
    
    if transaction['status'] != 'pending_tax':
        raise HTTPException(status_code=400, detail='This transfer does not require tax payment')
    
    account = await db.accounts.find_one(
        {'user_id': current_user['id'], 'account_type': 'checking'},
        {'_id': 0}
    )
    
    if not account:
        raise HTTPException(status_code=404, detail='Checking account not found')
    
    currency = transaction['currency']
    balance_field = f'balance_{currency.lower()}'
    
    if account[balance_field] < tax_payment.amount:
        raise HTTPException(status_code=400, detail='Insufficient funds to pay tax')
    
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
    
    update_fields = {'tax_paid': new_tax_paid}
    
    await create_notification(current_user['id'], 'Tax Payment Received',
        f'Tax payment of {tax_payment.amount} {currency} processed. Reference: {transaction.get("transaction_reference", "")}')
    
    if new_tax_paid >= tax_required:
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
        
        update_fields['status'] = 'completed'
        update_fields['released_at'] = datetime.now(timezone.utc).isoformat()
        
        await create_notification(current_user['id'], 'Transfer Released',
            f'Transfer of {transaction["amount"]} {currency} has been released to recipient. Reference: {transaction.get("transaction_reference", "")}')
    
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
    
    if transaction['transaction_type'] != 'transfer':
        raise HTTPException(status_code=400, detail='Tax payment only applies to transfers')
    
    if transaction['status'] not in ['pending_tax']:
        raise HTTPException(status_code=400, detail='This transfer does not require tax payment or is already under review')
    
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
    
    return {'message': 'Withdrawal approved', 'transaction_id': transaction_id}

@api_router.post("/admin/withdrawals/reject/{transaction_id}")
async def admin_reject_withdrawal(transaction_id: str, admin: dict = Depends(get_admin_user)):
    tx = await db.transactions.find_one({'id': transaction_id, 'status': 'pending'}, {'_id': 0})
    if not tx:
        raise HTTPException(status_code=404, detail='Pending withdrawal not found')
    
    await db.transactions.update_one({'id': transaction_id}, {'$set': {'status': 'rejected'}})
    
    await create_notification(tx['user_id'], 'Withdrawal Rejected',
        f'Your withdrawal of {tx["amount"]} {tx["currency"]} has been rejected.')
    
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
        'Balance Added',
        f'An administrator has added {data.amount} {currency} to your account.'
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
    if data.status not in ['completed', 'pending', 'pending_tax', 'rejected', 'under_review', 'crypto_payment_under_review']:
        raise HTTPException(status_code=400, detail='Invalid status')
    
    result = await db.transactions.update_one(
        {'id': data.transaction_id},
        {'$set': {'status': data.status}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail='Transaction not found')
    
    return {'message': 'Transaction status updated', 'transaction_id': data.transaction_id}

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
    """Approve or reject KYC verification"""
    user = await db.users.find_one({'id': data.user_id}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    
    if data.action == 'approve':
        await db.users.update_one(
            {'id': data.user_id},
            {'$set': {'verification_status': 'verified'}}
        )
        await create_notification(data.user_id, 'KYC Approved',
            'Your identity verification has been approved. You now have full access to all features.')
        return {'message': 'KYC approved', 'user_id': data.user_id}
    
    elif data.action == 'reject':
        await db.users.update_one(
            {'id': data.user_id},
            {'$set': {'verification_status': 'unverified', 'kyc_documents': None}}
        )
        await create_notification(data.user_id, 'KYC Rejected',
            'Your identity verification was rejected. Please resubmit your documents.')
        return {'message': 'KYC rejected', 'user_id': data.user_id}
    
    raise HTTPException(status_code=400, detail='Invalid action')

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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
