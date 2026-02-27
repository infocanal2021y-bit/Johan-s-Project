from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File
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
app = FastAPI(title="VaultBank API")

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
    
    await create_notification(user_id, 'Welcome to VaultBank!', 
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
async def login(credentials: UserLogin):
    user = await db.users.find_one({'email': credentials.email}, {'_id': 0})
    if not user or not verify_password(credentials.password, user['password']):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    
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
        new_balance = account[balance_field] + tx_data.amount
        await db.accounts.update_one({'id': tx_data.account_id}, {'$set': {balance_field: new_balance}})
        
    elif tx_data.transaction_type == 'withdraw':
        if account[balance_field] < tx_data.amount:
            raise HTTPException(status_code=400, detail='Insufficient funds')
        status = 'pending'
        
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
    elements.append(Paragraph("VaultBank", title_style))
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
    elements.append(Paragraph("This is an official VaultBank transaction receipt.", footer_style))
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

@api_router.put("/admin/transaction-status")
async def admin_update_transaction_status(data: AdminUpdateTransactionStatus, admin: dict = Depends(get_admin_user)):
    if data.status not in ['completed', 'pending', 'pending_tax', 'rejected', 'under_review']:
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

# ==================== UTILITY ROUTES ====================

@api_router.get("/exchange-rates")
async def get_exchange_rates():
    return EXCHANGE_RATES

@api_router.get("/")
async def root():
    return {"message": "VaultBank API", "version": "2.0.0"}

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
