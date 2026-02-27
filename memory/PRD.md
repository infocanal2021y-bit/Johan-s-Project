# LIONSBIT BANK - Online Banking System PRD

## Original Problem Statement
Create a full-stack web application that simulates a professional online banking system with comprehensive features including authentication, transactions, admin panel, KYC verification, anti-fraud, and more.

## Branding
- **Name:** LIONSBIT BANK
- **Tagline:** Private Digital Banking Platform
- **Meta Description:** MAGILL AND COMPANY BANK - Secure International Digital Banking Platform

## Tech Stack
- **Frontend**: React + TailwindCSS + Framer Motion + Chart.js
- **Backend**: FastAPI (Python) + ReportLab (PDF)
- **Database**: MongoDB
- **Authentication**: JWT with bcrypt password hashing
- **UI Components**: Shadcn/UI

## User Personas
1. **Regular User**: Banking operations, KYC verification, transfers with tax system
2. **Admin User**: Full control over users, KYC approvals, transaction management, treasury

## What's Been Implemented (Feb 27, 2026)

### Phase 1 - Core Banking (Complete)
- [x] JWT authentication (register, login)
- [x] User dashboard with balance cards
- [x] Checking/Savings accounts with multi-currency
- [x] Withdraw, Transfer operations
- [x] Transfer tax system ($4,850 per transfer)
- [x] Transaction history with CSV export

### Phase 2 - Professional Extensions (Complete)
- [x] KYC Verification System (unverified → pending → verified)
- [x] Daily transfer limit: €10,000
- [x] Unverified user limit: €1,000 per transfer
- [x] Internal notifications with bell icon
- [x] Government Treasury account (collects all taxes)
- [x] PDF receipt generation for completed transfers
- [x] Dashboard charts (Chart.js - 30 days)
- [x] Anti-fraud detection (3+ transfers >€5,000 in 5min = under_review)
- [x] Enhanced admin panel (suspend users, force release, KYC approval)
- [x] Unique transaction references (TRX-YYYY-XXXXXX)
- [x] Visual improvements (progress bars, status badges)

### Phase 3 - Admin-Only Deposits (Complete - Feb 27, 2026)
- [x] Removed user deposit functionality
- [x] Admin-only balance management via POST /api/admin/add-balance
- [x] Admin Credits page at /admin/credits with user list and history
- [x] Transactions logged as 'admin_credit' type
- [x] User notifications when admin adds balance
- [x] Sidebar updated: no "Deposit" for users, "Add Balance" for admins

### Phase 4 - Crypto Tax Payment System (Complete - Feb 27, 2026)
- [x] Corporate crypto wallets configured (BTC, ETH, USDT, LTC)
- [x] Crypto payment section in tax dialog (only when status=pending_tax)
- [x] QR codes generated dynamically for each crypto address
- [x] Copy address button functionality
- [x] Payment form: TXID, amount, proof image upload
- [x] Backend validation: ownership, no duplicate submissions, image size limit
- [x] New transaction status: crypto_payment_under_review
- [x] Admin panel: /admin/crypto-payments for reviewing payments
- [x] Admin actions: Approve (releases transfer), Reject (returns to pending_tax)
- [x] Payment history tracking with admin attribution
- [x] User notifications on submission, approval, rejection
- [x] Both EUR and Crypto payment options coexist
- [x] **Crypto Analytics Dashboard** (/admin/crypto-stats) with:
  - Total payments, approval rate, avg processing time
  - Status breakdown (approved/rejected/under review)
  - Payment trend chart (last 14 days)
  - Cryptocurrency distribution doughnut chart
  - Approval rate by crypto bar chart
  - Top users by payment count
  - Cryptocurrency breakdown cards

### Admin Features
- [x] User management (view, edit balances, change roles)
- [x] Suspend/Activate users
- [x] KYC approval/rejection
- [x] View pending withdrawals
- [x] Force release transfers
- [x] View Government Treasury balance
- [x] Transaction status management
- [x] Add Balance to users (admin_credit)

## API Endpoints (v2.0)

### Auth & KYC
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- POST /api/kyc/submit
- GET /api/kyc/status

### Accounts & Transactions
- GET /api/accounts
- GET /api/accounts/summary/total
- POST /api/transactions
- GET /api/transactions
- GET /api/transactions/stats
- GET /api/transactions/export/csv
- GET /api/transactions/{id}/receipt
- POST /api/transactions/{id}/pay-tax

### Notifications
- GET /api/notifications
- PUT /api/notifications/{id}/read
- PUT /api/notifications/read-all

### Admin
- GET /api/admin/users
- GET /api/admin/transactions
- GET /api/admin/withdrawals/pending
- POST /api/admin/withdrawals/approve/{id}
- POST /api/admin/withdrawals/reject/{id}
- PUT /api/admin/balance
- PUT /api/admin/user-role
- POST /api/admin/kyc/action
- POST /api/admin/user/suspend
- POST /api/admin/transfer/force-release
- GET /api/admin/treasury
- GET /api/admin/kyc/pending
- POST /api/admin/add-balance (admin-only deposits)
- GET /api/admin/credits (admin credit history)
- GET /api/admin/crypto-payments/pending (NEW - pending crypto payments)
- POST /api/admin/crypto-payments/action (NEW - approve/reject)
- GET /api/admin/crypto-payments/{id}/proof (NEW - view proof image)
- GET /api/admin/crypto-payments/history (NEW - all crypto payments)

### Crypto
- GET /api/crypto-wallets (corporate wallet addresses)
- POST /api/transactions/{id}/pay-tax-crypto (submit crypto payment)
- GET /api/transactions/{id}/crypto-payment (check payment status)
- GET /api/admin/crypto-payments/stats (comprehensive statistics)

## Constants
- TAX_AMOUNT: $4,850 per transfer
- DAILY_TRANSFER_LIMIT: €10,000
- UNVERIFIED_TRANSFER_LIMIT: €1,000
- FRAUD_THRESHOLD: 3+ transfers > €5,000 in 5 minutes

## Next Action Items
1. Backend refactoring: Split server.py into modules (models, routes, services)
2. Email notifications for important events
3. Two-factor authentication (2FA)
4. Transaction categories and analytics
5. Mobile app version
