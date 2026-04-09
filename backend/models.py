"""All Pydantic models for request/response validation."""
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    verification_status: str = 'pending'
    account_status: str = 'active'
    created_at: str = ''

class AccountResponse(BaseModel):
    id: str
    user_id: str
    account_type: str
    balance_usd: float = 0.0
    balance_eur: float = 0.0
    is_frozen: bool = False

class BankingInfo(BaseModel):
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    routing_number: Optional[str] = None
    swift_code: Optional[str] = None
    iban: Optional[str] = None
    account_holder: Optional[str] = None
    country: Optional[str] = None
    bank_address: Optional[str] = None

class TransactionCreate(BaseModel):
    from_account_id: str
    to_account_id: Optional[str] = None
    amount: float
    currency: str = 'USD'
    transaction_type: str
    description: str = ''
    banking_info: Optional[BankingInfo] = None
    payment_method: str = Field(default='crypto')

class TransactionResponse(BaseModel):
    id: str
    from_account_id: str
    to_account_id: Optional[str] = None
    amount: float
    currency: str
    transaction_type: str
    status: str
    description: str
    created_at: str

class PayTaxRequest(BaseModel):
    transaction_id: str
    amount: float

class AdminUpdateBalance(BaseModel):
    account_id: str
    new_balance_usd: Optional[float] = None
    new_balance_eur: Optional[float] = None

class AdminUpdateTransactionStatus(BaseModel):
    transaction_id: str
    status: str
    rejection_reason: Optional[str] = None

class AdminUpdateUserRole(BaseModel):
    user_id: str
    new_role: str

class KYCSubmission(BaseModel):
    document_type: str
    document_number: str
    full_name: str
    date_of_birth: str
    address: str
    phone: str
    front_image: Optional[str] = None
    back_image: Optional[str] = None
    selfie_image: Optional[str] = None

class AdminKYCAction(BaseModel):
    submission_id: str
    action: str
    notes: Optional[str] = None

class AdminSuspendUser(BaseModel):
    user_id: str
    action: str

class AdminForceRelease(BaseModel):
    transfer_id: str

class AdminAddBalance(BaseModel):
    user_id: str
    amount: float
    currency: str = 'USD'
    description: Optional[str] = None

class CryptoPaymentSubmission(BaseModel):
    transaction_id: str
    crypto_type: str
    network: Optional[str] = None
    amount_sent: float
    sender_wallet: Optional[str] = None
    tx_hash: Optional[str] = None
    proof_image: Optional[str] = None

class AdminCryptoPaymentAction(BaseModel):
    payment_id: str
    action: str
    notes: Optional[str] = None

class AdminManualTaxPayment(BaseModel):
    transaction_id: str
    amount: float
    crypto_type: Optional[str] = 'admin_manual'
    notes: Optional[str] = None
    reference_number: Optional[str] = None
    proof_image: Optional[str] = None

class AdminUpdateWithdrawalStatus(BaseModel):
    transaction_id: str
    status: str
    notes: Optional[str] = None
    rejection_reason: Optional[str] = None

class SupportTicket(BaseModel):
    subject: str
    message: str
    category: str = 'general'

class TicketReply(BaseModel):
    message: str

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

class ChangePassword(BaseModel):
    current_password: str
    new_password: str

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
