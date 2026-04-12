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
  - Changed button text to "Confirmar pago realizado"
  - Highlighted reference field with amber border and validation note
- Complete Withdrawal Flow:
  - New CompleteWithdrawalPage at /complete-withdrawal/:transactionId
  - Method selection screen: Transferencia Bancaria or Criptomonedas
  - Bank transfer: full data + 3 Wise payment links + proof upload
  - Criptomonedas: BTC, BTC_LEGACY, ETH, BNB, USDT wallet addresses with copy buttons
  - "Completar proceso" button in TransactionsPage for processing withdrawals
  - Enabled Criptomonedas in WithdrawMethodsPage (replaced "proximamente" message)
- Bitcoin Outputs Verification Page:
  - New /api/bitcoin/outputs endpoint fetching real blockchain data (blockchain.info)
  - Filters outputs in $40K-$110K USD range with BTC price from CoinGecko
  - Professional table with expandable rows showing full hash, recipient, state
  - Each row links to Blockchair for independent verification
  - Search by hash/address/block, refresh button, 2-min cache
  - Stats cards: BTC price, block height, outputs count, USD range

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
- P2: Continue server.py refactoring (move routes to /routes/ modules)
- P3: Email notifications when withdrawal status changes

### Feb 2026
- P1: Chat Inteligente fully verified and enhanced
  - Integrated support phone +447400757168 (WhatsApp link in footer and bot responses)
  - 7 FAQ categories: retiros, impuestos, tiempos, pagos mínimos, verificación KYC, info LIONSBIT, soporte
  - Ticket creation flow integrated within chatbot
  - Client-side FAQ matching with keyword scoring
  - Floating widget visible globally on all authenticated pages
  - 100% test pass rate (14/14 tests, iteration_22)
- BBVA Color & Typography Overhaul
  - Primary: #1973B8, Deep: #004481, Light: #49A2E0 (replacing emerald green)
  - Typography: Source Sans 3 (body) + Outfit (numbers) - closest to Benton Sans BBVA
  - Updated: tailwind.config.js, index.css, App.css, and 8+ files with hardcoded rgba
  - Semantic green preserved for USDT, deposits, success states
  - 100% test pass rate (18/18 tests, iteration_23)
- OdometerValue Animation (BBVA-style slot machine digits)
  - Component: OdometerValue.jsx - each digit slides independently 0→target
  - Applied to 12 files: BalanceCard, DashboardPage, AccountsPage, CryptoMarketPage, BitcoinOutputsPage, InvestmentSimulatorPage, PortfolioPage, TransactionChart, AdminDashboardPage, AdminTreasuryPage, WithdrawPage
  - 100% test pass rate (14/14 tests, iteration_24)

---
Last Updated: February 2026
