# LIONSBIT VERIFICACION - Product Requirements Document

## Original Problem Statement
Professional financial information and verification platform. Informational tools only.
The platform features KYC verification, an Admin Panel, a complex withdrawal system with mandatory cryptocurrency tax payments, simulated financial dashboards, gamification, an integrated support system, internal investment wallets, and strict informational disclaimers.

## Core Features

### Authentication & User Management
- JWT auth with admin/user roles, password reset, login history, suspicious access detection

### User Interest Scoring System
- Automatic classification: Hot (login 3+/week + balance), Warm (login 1+/week or pending), Cold (inactive)
- Badges in admin user list: red Flame (Alto), amber TrendingUp (Medio), blue Snowflake (Frio)
- Recalculated every hour via APScheduler

### Automated Notifications & Reminders
- Every 12h: Notify users with pending processes
- Every 12h: Notify inactive users with available balance
- In-app bell notifications

### Admin Withdrawal Accordion System
- 6 status sections: Impuesto Pendiente, Pendientes, Procesando, En Transferencia, Completados, Rechazados
- Expandable user rows with full details + withdrawal history

### Mobile Optimization
- Admin Users: Card layout on mobile with avatar, score, saldos, action buttons
- Admin Withdrawals: Mobile card rows
- Responsive breakpoints: sm(640px), md(768px)

### Payment Methods Page
- 3 sections: Metodos de Pago, Pagos Internacionales, Bancos por Pais (MX/CL/CO)
- Transferencia Bancaria dedicated page with proof upload + email

### SafeJSONResponse
- Custom JSONResponse auto-sanitizes MongoDB ObjectId

### Other Features
- Crypto Payment, Investment Wallet, Binance Wallet, ChatBot, Gamification, Market Data, TradingView widget

## Tech Stack
- Frontend: React, TailwindCSS, Framer Motion, Recharts
- Backend: FastAPI, APScheduler, MongoDB (SafeJSONResponse)
- APIs: Resend, CoinGecko, Finnhub, Binance US, TradingView

## Code Architecture (Post-Refactor Apr 10, 2026)
```
/app/backend/
  config.py     - DB, constants, SafeJSONResponse, CRYPTO_WALLETS, CHATBOT_FAQ
  models.py     - All Pydantic models (UserCreate, TransactionCreate, ChatMessage, etc.)
  services/
    auth.py           - hash_password, verify_password, create_token, get_current_user, get_admin_user
    notifications.py  - create_notification, notify_admins
    scoring.py        - process_user_scoring, process_user_reminders
  server.py     - Routes, email service, admin notifications (~5394 lines, down from 5840)
  routes/       - (empty, for future use)
```

## Credentials
- Admin: admi@paylionsbit.es / LionsBit2026!
- Backup: admin.backup@paylionsbit.es / LionsBit2026!Backup
- Test: test.bronce@test.com / Test1234!
- Restricted: marinini28@gmail.com / Marina2026!

## Completed Work

### Apr 10, 2026
- P0: Backend refactoring - removed 447 lines of duplicate code from server.py
  - Moved Pydantic models to models.py
  - Moved auth helpers to services/auth.py
  - Moved notification helpers to services/notifications.py
  - Moved constants (CRYPTO_WALLETS, CHATBOT_FAQ, etc.) to config.py
  - 100% test pass rate (21/21 tests)
- P1: Fixed SPA crash/reload with browser translation
  - Changed lang="en" to lang="es"
  - Added MutationObserver to prevent Google Translate DOM mutations from crashing React
- Improved BankTransferPage:
  - Added "Opciones de pago en linea" section with 3 Wise payment links
  - Buttons open in new tab with modern card-style hover effects
  - Changed button text to "Confirmar pago realizado"
  - Highlighted reference field with amber border and validation note
  - Added informational text about payment options

### Earlier Sessions
- Connected routing for InvestmentComparatorPage, GlobalMarketMapPage, LiveMarketNewsPage
- Updated compliance: "Simulator" -> "Projections", refined legal disclaimers
- Created "Historial de Retiros" in user Settings
- Added tax notices ($4,850 and $200 minimum) on Withdraw page
- Mobile Optimization of toasts and dashboard
- Integrated TradingView widget
- Bank Transfer with receipt upload + email notifications
- Notification Bell system
- Admin Accordion withdrawals
- APScheduler auto scoring
- Mobile-optimized Admin panels

## Backlog
- P1: Implement "Chat inteligente" (Intelligent Support Chatbot) - automate FAQs
- P2: Continue server.py refactoring (move routes to /routes/ modules)
- P3: Email notifications when withdrawal status changes

---
Last Updated: April 10, 2026
