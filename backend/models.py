"""All Pydantic models for request/response validation."""
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional


class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6)
    phone: Optional[str] = None
    country_code: Optional[str] = None
    country_name: Optional[str] = None
    investment_year: Optional[str] = None
    owner_deceased: Optional[bool] = False
    relationship: Optional[str] = None

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

class BankingInfo(BaseModel):
    account_holder: str
    iban: Optional[str] = None
    account_number: Optional[str] = None
    swift_code: Optional[str] = None
    routing_number: Optional[str] = None
    bank_name: str
    bank_country: str
    bank_city: Optional[str] = None
    account_type: Optional[str] = None

class TransactionCreate(BaseModel):
    account_id: str
    transaction_type: str  # deposit, withdraw, transfer
    amount: float = Field(..., gt=0)
    currency: str = Field(default='USD')
    description: Optional[str] = None
    recipient_account_id: Optional[str] = None  # For transfers
    banking_info: Optional[BankingInfo] = None  # For withdrawals

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
    investment_period: Optional[str] = None
    investment_details: Optional[str] = None

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

class AdminDebitBalance(BaseModel):
    user_id: str
    amount: float = Field(..., gt=0)
    currency: str = Field(default='USD')
    reason: str = Field(..., min_length=3)  # Motivo obligatorio
    notify_user: Optional[bool] = True

class CryptoPaymentSubmission(BaseModel):
    transaction_id: str
    crypto_type: str  # BTC, ETH, USDT, LTC
    network: Optional[str] = None  # BTC, ERC20, TRC20
    txid: str = Field(..., min_length=10)
    amount_sent: str
    btc_address: Optional[str] = None
    proof_image: Optional[str] = None  # base64 encoded image

class AdminCryptoPaymentAction(BaseModel):
    payment_id: str
    action: str  # approve, reject
    rejection_reason: Optional[str] = None

class AdminManualTaxPayment(BaseModel):
    transaction_id: str
    amount: float = Field(..., gt=0)
    payment_method: str = Field(default='crypto')
    crypto_type: Optional[str] = None
    txid: Optional[str] = None
    notes: Optional[str] = None

class AdminUpdateWithdrawalStatus(BaseModel):
    transaction_id: str
    status: str  # pending, processing, transfer_in_progress, completed, rejected
    rejection_reason: Optional[str] = None

class SupportTicket(BaseModel):
    subject: str = Field(..., min_length=5, max_length=200)
    message: str = Field(..., min_length=10)
    category: str = Field(default='general')

class TicketReply(BaseModel):
    ticket_id: Optional[str] = None
    message: str = Field(..., min_length=1)

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6)

class ChangePassword(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)

class PaymentIssueReport(BaseModel):
    transaction_id: str
    crypto_type: Optional[str] = None
    network: Optional[str] = None
    amount: Optional[str] = None
    wallet_address: Optional[str] = None
    tx_hash: Optional[str] = None
    message: str
    proof_image: Optional[str] = None

class BankTransferConfirm(BaseModel):
    reference: str
    comment: Optional[str] = None
    proof_file: Optional[str] = None
    proof_filename: Optional[str] = None

class InvestmentRequest(BaseModel):
    account_id: str
    amount: float
    currency: str = 'EUR'

class ActivityEvent(BaseModel):
    event_type: str  # page_visit, button_click, session_active
    page: Optional[str] = None
    details: Optional[str] = None

class AdminWalletAssign(BaseModel):
    user_id: str
    coin: str
    available: float = Field(..., ge=0)
    locked: float = Field(default=0, ge=0)

class ChatMessage(BaseModel):
    message: str

class FeedbackSubmission(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None
    category: Optional[str] = None
