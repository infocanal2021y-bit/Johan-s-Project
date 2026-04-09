# LIONSBIT VERIFICACION - Product Requirements Document

## Original Problem Statement
Professional financial information and verification platform. Informational tools only.

## Core Features

### Authentication & User Management
- JWT auth with admin/user roles, password reset, login history, suspicious access detection

### User Interest Scoring System (NEW - Apr 9, 2026)
- Automatic classification: Hot (login 3+/week + balance), Warm (login 1+/week or pending), Cold (inactive)
- Badges in admin user list: red Flame (Alto), amber TrendingUp (Medio), blue Snowflake (Frio)
- Recalculated every hour via APScheduler
- Score data: logins_7d, balance, days_inactive, has_pending_withdrawal

### Automated Notifications & Reminders (NEW - Apr 9, 2026)
- Every 12h: Notify users with pending processes
- Every 12h: Notify inactive users with available balance
- In-app bell notifications (not just email)

### Admin Withdrawal Accordion System
- 6 status sections: Impuesto Pendiente, Pendientes, Procesando, En Transferencia, Completados, Rechazados
- Expandable user rows with full details + withdrawal history
- Reactivar retiro + Agregar saldo for rejected

### Mobile Optimization (NEW - Apr 9, 2026)
- Admin Users: Card layout on mobile with avatar, score, saldos, action buttons
- Admin Withdrawals: Mobile card rows with name, email, amount, actions
- Responsive breakpoints: sm(640px), md(768px)

### Payment Methods Page
- 3 sections: Metodos de Pago, Pagos Internacionales, Bancos por Pais (MX/CL/CO)
- Transferencia Bancaria dedicated page with proof upload + email

### SafeJSONResponse
- Custom JSONResponse auto-sanitizes MongoDB ObjectId

### Other Features
- Crypto Payment, Investment Wallet, Binance Wallet, ChatBot, Gamification, Market Data

## Tech Stack
- Frontend: React, TailwindCSS, Framer Motion, Recharts
- Backend: FastAPI, APScheduler, MongoDB (SafeJSONResponse)
- APIs: Resend, CoinGecko, Finnhub, Binance US, TradingView

## Credentials
- Admin: admi@paylionsbit.es / LionsBit2026!
- Backup: admin.backup@paylionsbit.es / LionsBit2026!Backup
- Test: test.bronce@test.com / Test1234!
- Restricted: marinini28@gmail.com / Marina2026!

## Backlog
- P2: Refactor server.py (~5800 lines)
- P3: Fix SPA translation crash

---
Last Updated: April 9, 2026
