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

### 5. KYC Verification System
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

### 6. Professional Typography
- **Font:** Inter (Google Fonts) across entire application
- **Tabular Numbers:** `font-variant-numeric: tabular-nums` for financial values
- **Hierarchy:**
  - Titles: font-weight 700, letter-spacing -0.02em
  - Amounts/Balances: font-weight 600, 36px primary, 20px secondary
  - Labels: font-weight 400, 14px
  - Descriptions: font-weight 300 (light)
- **Number Spacing:** letter-spacing 0.02em for financial numbers
- **Professional fintech appearance** similar to Wise, Revolut, Stripe

### 7. Admin Activity Monitor (NEW - March 16, 2026)
**Monitor en tiempo real de toda la actividad del sistema:**
- **Estadísticas en vivo:** Usuarios totales, Actividad hoy, KYC pendientes, Retiros pendientes
- **Tipos de eventos monitoreados:**
  - Registros de usuarios
  - Inicios de sesión
  - Verificaciones KYC enviadas
  - Solicitudes de retiro
  - Pagos de impuestos
  - Saldos agregados por admin
  - Tickets de soporte
- **Información por evento:** Usuario, email, IP, país aproximado, fecha/hora
- **Auto-refresh cada 30 segundos**
- **Filtro por tipo de evento**

### 8. Admin Notification System (NEW - March 16, 2026)
**Notificaciones automáticas al admin:**
- **Nuevo usuario registrado:** nombre, email, IP, país
- **KYC enviado:** nombre, email, tipo documento
- **Solicitud de retiro:** monto, moneda
- **Ticket de soporte:** asunto, categoría
- **Métodos de notificación:**
  - Icono de campana en panel admin (badge con contador)
  - Email automático al administrador
- **Colección MongoDB:** `admin_notifications`

### 9. System Activity Logging
- **Colección MongoDB:** `system_activity`
- Registra toda la actividad de la plataforma
- Incluye metadatos (IP, país, dispositivo, etc.)
- Historial completo para auditoría

### 10. Admin Panel Features
- User management
- Transaction management
- KYC verification review
- **Activity Monitor** (nuevo)
- **Pending Withdrawals Dashboard:**
  - User info, withdrawal amount
  - Tax required/paid/remaining
  - Payment history (manual + crypto)
  - Time remaining before 72h expiry
  - Manual tax payment registration
  - Status change controls

### 11. Support System
- Ticket-based support for users
- Admin ticket management
- Reply functionality

### 12. Email Notifications (Resend)
- Balance added
- Withdrawal status changes
- Password changes
- New IP login alerts
- Tax payment reminders (every 15 hours)
- Auto-rejection notifications
- Admin alerts (new users, KYC, tickets)

### 13. Scheduler (APScheduler)
- Tax payment reminders every 15 hours
- Auto-rejection job every 1 hour (checks for 72h expiry)

## Tech Stack
- **Frontend:** React, TailwindCSS, Framer Motion, Chart.js
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Authentication:** JWT with RBAC
- **Email:** Resend API
- **Scheduler:** APScheduler
- **Typography:** Inter (Google Fonts)

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
- `admin_notifications` - Admin-specific notifications (NEW)
- `system_activity` - System activity log (NEW)
- `login_history` - User login records

## Key API Endpoints
- `/api/auth/login`, `/api/auth/register`
- `/api/kyc/submit`, `/api/kyc/status`
- `/api/transactions`, `/api/withdraw`
- `/api/admin/pending-withdrawals`
- `/api/admin/tax-payment`
- `/api/admin/kyc/pending`, `/api/admin/kyc/action`
- `/api/admin/activity` (NEW)
- `/api/admin/activity/stats` (NEW)
- `/api/admin/notifications` (NEW)

## Credentials
- **Admin:** admi@paylionsbit.es / LionsBit2026!
- **Backup Admin:** admin.backup@paylionsbit.es / LionsBit2026!Backup

## Deployment
- Custom domain: paylionsbit.es
- Frontend uses relative API paths (`/api`)
- Cloudflare DNS configured

---
Last Updated: March 16, 2026
