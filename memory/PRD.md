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
- APIs: Resend, CoinGecko, Investing.com RSS, Binance US, TradingView

## Code Architecture (Post-Modularization Apr 12, 2026)
```
/app/backend/
  config.py          - DB, constants, SafeJSONResponse, CRYPTO_WALLETS, CHATBOT_FAQ
  models.py          - All Pydantic models
  server.py          - App setup, CORS, startup, scheduler (616 lines)
  services/
    auth.py          - hash_password, verify_password, create_token, get_current_user, get_admin_user
    notifications.py - create_notification, notify_admins, create_admin_notification, send_admin_alert_email, log_system_activity
    email.py         - All email template functions + send_email via Resend
    helpers.py       - get_ip_location, get_daily_transfer_total, check_fraud_pattern, ensure_government_treasury
    gamification.py  - LEVEL_CONFIG, ACHIEVEMENTS_DEF, calculate_user_level, get_next_level_info, check_and_unlock_achievements
    scoring.py       - process_user_scoring, process_user_reminders
  routes/
    __init__.py      - register_routes() registers all routers
    auth.py          - /auth/register, /auth/login, /auth/me, /auth/change-password, /auth/request-password-reset, /auth/reset-password
    accounts.py      - /accounts, /accounts/summary, /accounts/invest, /user/level, /user/achievements, /user/activity
    transactions.py  - /transactions, /withdrawals/history, /transactions/{id}/pay-tax, /crypto-wallets, /transactions/{id}/pay-tax-crypto
    admin.py         - /admin/users, /admin/withdrawals, /admin/kyc, /admin/crypto-payments, /admin/balance, /admin/notifications, /admin/activity
    support.py       - /support/tickets, /support/payment-issue, /admin/support/tickets, /kyc/submit, /kyc/status
    misc.py          - /exchange-rates, /market/*, /binance/*, /chatbot/message, /feedback, /payments/bank-transfer-*
    notifications.py - /notifications, /notifications/{id}/read, /notifications/read-all

/app/frontend/
  src/
    components/
      dashboard/OdometerValue.jsx  - BBVA-style animated balance display
      layout/Sidebar.jsx           - Navigation with dropdown menus
      ChatBot.jsx                  - WhatsApp support integration
    pages/
      WithdrawMethodsPage.jsx      - Payment methods with provider cards
    index.css, tailwind.config.js  - BBVA Blue (#14549C) color scheme, Outfit font
```

## Credentials
- Admin: admi@paylionsbit.es / LionsBit2026!

## Completed Features
- Full auth system with JWT, password reset, login history
- KYC verification with legal consent
- Withdrawal system with mandatory $4,850 crypto tax
- Admin panel with user management, KYC review, withdrawal approval
- Gamification (levels: Bronce/Plata/Oro/Platino + 10 achievements)
- Support ticket system with email notifications
- Crypto payment submission and admin review
- Market data integration (CoinGecko, Finnhub, Binance)
- BBVA-style UI (deep blue theme, Outfit typography, Odometer animations)
- WhatsApp support integration
- Email notifications (Resend): registration, login, withdrawal, tax payments
- Daily admin summary email (APScheduler)
- User interest scoring (hot/warm/cold)
- Payment methods page with provider redirects (MoonPay, Simplex, Binance, Coinbase)
- Backend modularization: server.py 5786 -> 616 lines (Apr 12, 2026)
- Market News redesign: Replaced Finnhub with Investing.com RSS feeds, BBVA-style card layout, image proxy, category filters (General/Crypto/Forex/Economia) (Apr 12, 2026)
- Notification bell: Dropdown opens to the right, click opens detail modal with admin 'Agregar Saldo' inline form (Apr 12, 2026)
- Registration form: Added phone+country selector (26 countries), investment year, deceased owner checkbox with relationship dropdown. Email to info@lionsbit.es with all details (Apr 12, 2026)
- Bug fix: admin/add-balance 500 error (missing _build_balance_email_content import in admin.py) (Apr 12, 2026)
- Admin Users page: Renamed to 'Usuarios Registrados', added 'Agregar Saldo' button per user, search bar, full Spanish translation (Apr 12, 2026)
- Spanish translation: Batch translation of toasts, labels, badges, status text across all pages (Apr 12, 2026)
- Fix: Production build cache corruption resolved, webpack compile verified (Apr 12, 2026)
- Fix: .gitignore was blocking .env files from deploy — cleaned and fixed (Apr 12, 2026)
- Trading Demo module: Full simulated trading with 6 assets (EURUSD, GBPUSD, USDJPY, BTCUSD, ETHUSD, XAUUSD), $10K demo balance, BUY/SELL, live P/L, positions/history, currency converter, Pro Mode teaser (Apr 15, 2026)
