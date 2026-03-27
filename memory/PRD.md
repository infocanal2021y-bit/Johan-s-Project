# LIONSBIT VERIFICACION - Product Requirements Document

## Original Problem Statement
Build a professional financial information and verification platform named "LIONSBIT VERIFICACION" (formerly "LIONSBIT BANK"). The platform provides informational tools for financial analysis and digital verification services.

**Important Notice:** This is an informational platform only. It is not enabled for real investments.

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
- **Legal disclaimer visible at bottom**

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

### 5. KYC Verification System
- User submits: Document type, front/back images, selfie holding document, digital signature, legal consent
- Admin panel: Document review, legal record, approve/reject with reason

### 6. Professional Typography
- Font: Inter (Google Fonts)
- Tabular numbers for financial values
- Professional fintech appearance

### 7. Admin Activity Monitor
- Real-time stats: Total users, Today activity, Pending KYC, Pending withdrawals
- Event types: Registrations, logins, KYC, withdrawals, tax payments, balance additions, support tickets
- Auto-refresh every 30 seconds, filter by event type

### 8. Admin Notification System
- Automatic notifications for: New user, KYC submitted, Withdrawal request, Support ticket
- Bell icon with badge counter, email notifications

### 9. System Activity Logging
- MongoDB collection: `system_activity`
- Complete audit trail

### 10. Admin Panel Features
- User management, Transaction management, KYC verification review
- Activity Monitor, Pending Withdrawals Dashboard
- Manual tax payment registration, Status change controls

### 11. Support System
- Ticket-based support for users
- Admin ticket management with reply functionality

### 12. Email Notifications (Resend)
- Balance added, Withdrawal status changes, Password changes
- New IP login alerts, Tax payment reminders (every 15 hours)
- Auto-rejection notifications, Admin alerts

### 13. Scheduler (APScheduler)
- Tax payment reminders every 15 hours
- Auto-rejection job every 1 hour (checks for 72h expiry)

### 14. Chat Inteligente (FAQ Chatbot) - NEW March 27, 2026
- **Floating chat widget** on all dashboard pages (bottom-right corner)
- **Predefined FAQ responses** covering: withdrawals, tax payment, processing times, minimum payments, KYC verification, platform info, support, transfers, cryptocurrency
- **Quick suggestion buttons** for common questions
- **Keyword matching** with accent-insensitive search
- **Typing indicator** animation for natural feel
- **Backend API**: POST /api/chatbot/message
- **No LLM dependency** - pure FAQ-based, zero API cost

### 15. SPA Translation Crash Fix - NEW March 27, 2026
- **DOM patching** for Node.prototype.removeChild and insertBefore
- Handles browser translation extensions that inject `<font>` / `<span>` nodes
- **ErrorBoundary** enhanced to ignore DOM manipulation errors
- **Console error suppression** for translation-related DOM errors

### 16. ObjectId Serialization Safety - NEW March 27, 2026
- Custom MongoDB JSON encoder handling ObjectId
- `strip_id()` utility function for response sanitization
- Most queries already had `_id: 0` projections

### 17. Financial Analysis Suite
- Real-Time Market (TradingView widget), Crypto Market, Converter
- Projections (formerly Simulator), Portfolio, Alerts
- Market Reports, Investment Comparator, Global Market Map, Live Market News
- All pages include legal disclaimers

## Tech Stack
- **Frontend:** React, TailwindCSS, Framer Motion, Chart.js
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Authentication:** JWT with RBAC
- **Email:** Resend API
- **Scheduler:** APScheduler
- **Typography:** Inter (Google Fonts)
- **Widgets:** TradingView Advanced Chart Widget

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
- `admin_notifications` - Admin-specific notifications
- `system_activity` - System activity log
- `login_history` - User login records

## Key API Endpoints
- `/api/auth/login`, `/api/auth/register`
- `/api/kyc/submit`, `/api/kyc/status`
- `/api/transactions`, `/api/withdraw`
- `/api/admin/pending-withdrawals`
- `/api/admin/tax-payment`
- `/api/admin/kyc/pending`, `/api/admin/kyc/action`
- `/api/admin/activity`, `/api/admin/activity/stats`
- `/api/admin/notifications`
- `/api/chatbot/message` (NEW)
- `/api/withdrawals/history`

## Credentials
- **Admin:** admi@paylionsbit.es / LionsBit2026!
- **Backup Admin:** admin.backup@paylionsbit.es / LionsBit2026!Backup

## Deployment
- Custom domain: paylionsbit.es
- Frontend uses relative API paths (`/api`)
- Cloudflare DNS configured

---
Last Updated: March 27, 2026
