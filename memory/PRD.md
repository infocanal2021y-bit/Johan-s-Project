# LIONSBIT BANK - Product Requirements Document

## Original Problem Statement
Build a professional online banking system named "LIONSBIT BANK" with comprehensive financial management features.

## Core Features Implemented

### 1. Authentication & User Management
- JWT-based authentication with admin and user roles
- Auto-created admin accounts with verified status
- Password reset flow with email verification (Resend integration)
- Login history tracking (IP, location, device)
- Show/hide password feature on all password fields

### 2. User Dashboard
- Multi-currency account balances (USD/EUR)
- Transaction history with filtering
- Personal information display
- Real-time notifications (bell icon)

### 3. Transaction System
- **Admin-Only Deposits:** Only admins can add funds via `admin_credit`
- **Transfers:** Users can transfer funds between accounts
- **Withdrawals with Tax System:**
  - Fixed tax of $4,850 USD per withdrawal
  - Withdrawal enters `pending_tax` state until tax is fully paid
  - Tax payment via cryptocurrency only (no "Pay with Balance")
  - Partial payments (abonos) with minimum $200 USD
  - UI shows: Required, Paid, Remaining amounts
  - Admin panel for manual crypto payment registration
  - Auto-rejection after 72 hours if tax not paid
  - Email reminders every 15 hours for pending tax

### 4. Withdrawal States
- `pending_tax` - Awaiting tax payment
- `under_review` - Tax paid, admin reviewing
- `processing` - Admin approved, processing
- `completed` - Withdrawal complete
- `rejected` - Rejected by admin or auto-rejected

### 5. KYC Verification System (Updated March 16, 2026)
- **User submits:**
  - Document type (Passport, DNI/Cédula, Driver's License)
  - Document front side image
  - Document back side image
  - **Selfie holding document** (face + document clearly visible)
  - Digital signature (full legal name)
  - Legal consent checkbox
  - Investment history (optional)
- **Admin panel shows:**
  - All 3 documents (front, back, selfie)
  - Legal record (IP, country, browser, timestamp)
  - User information and signature
  - Approve/Reject buttons with rejection reason

### 6. Admin Panel Features
- User management
- Transaction management
- KYC verification review
- **Pending Withdrawals Dashboard:**
  - User info, withdrawal amount
  - Tax required/paid/remaining
  - Payment history (manual + crypto)
  - Time remaining before 72h expiry
  - Manual tax payment registration
  - Status change controls

### 7. Support System
- Ticket-based support for users
- Admin ticket management
- Reply functionality

### 8. Email Notifications (Resend)
- Balance added
- Withdrawal status changes
- Password changes
- New IP login alerts
- Tax payment reminders (every 15 hours)
- Auto-rejection notifications

### 9. Scheduler (APScheduler)
- Tax payment reminders every 15 hours
- Auto-rejection job every 1 hour (checks for 72h expiry)

## Tech Stack
- **Frontend:** React, TailwindCSS, Framer Motion, Chart.js
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Authentication:** JWT with RBAC
- **Email:** Resend API
- **Scheduler:** APScheduler

## Database Collections
- `users` - User accounts with KYC documents
- `accounts` - Bank accounts
- `transactions` - All transactions
- `manual_tax_payments` - Admin-registered tax payments
- `crypto_payments` - User crypto payment submissions
- `support_tickets` - Support tickets
- `password_resets` - Password reset tokens
- `notifications` - In-app notifications
- `kyc_submissions` - KYC submission records

## Key API Endpoints
- `/api/auth/login`, `/api/auth/register`
- `/api/kyc/submit`, `/api/kyc/status`
- `/api/transactions`, `/api/withdraw`
- `/api/admin/pending-withdrawals`
- `/api/admin/tax-payment`
- `/api/admin/kyc/pending`, `/api/admin/kyc/action`

## Credentials
- **Admin:** admi@paylionsbit.es / LionsBit2026!
- **Backup Admin:** admin.backup@paylionsbit.es / LionsBit2026!Backup

## Deployment
- Custom domain: paylionsbit.es
- Frontend uses relative API paths (`/api`)
- Cloudflare DNS configured

---
Last Updated: March 16, 2026
