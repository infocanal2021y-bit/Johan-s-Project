# LIONSBIT VERIFICACION - Product Requirements Document

## Original Problem Statement
Professional financial information and verification platform named "LIONSBIT VERIFICACION". Provides informational tools for financial analysis and digital verification services.

**Important:** Platform is exclusively informational. Not enabled for real investments.

## Core Features Implemented

### Authentication & User Management
- JWT-based auth with admin/user roles, auto-created admin accounts
- Password reset via email (Resend), login history tracking with IP geolocation
- Online presence system (heartbeat every 30s)

### User Dashboard & Banking
- Multi-currency accounts (USD/EUR), transaction history
- Withdrawal system with mandatory $4,850 USD tax
- Banking form (holder name, IBAN, bank selection)

### Bitcoin Tax Payment System (NEW)
- **BTC Address Validation**: Supports Legacy (1...), SegWit (3...), Bech32 (bc1...)
- **Wallet Provider Links**: Trust Wallet, Binance, Coinbase, Exodus, Blockchain (open in new tab)
- **Buy Crypto**: MoonPay, Simplex with "¿No tienes Bitcoin? Compra aquí de forma segura"
- **TXID Tracking**: Generated on payment, stored with user, amount, status
- **Blockchain Explorer**: "Ver transacción" button → blockchain.com/explorer/transactions/btc/{TXID}
- **Payment States**: Pendiente → Confirmando (0-3 confirmaciones) → Confirmado
- **Tax Progress**: Shows Requerido ($4,850), Abonado, Restante
- **Email Notifications**: On payment creation, status change, completion
- **Messages**: "Transacciones verificables en blockchain pública" + "No se pueden revertir"

### Chat Inteligente (FAQ Chatbot)
- Floating widget on all pages, 9 FAQ categories
- Keyword matching, typing indicator, zero API cost

### Login Tracking & Admin Panel
- IP geolocation via ip-api.com, admin login history panel
- Suspicious access detection (different countries in 24h)
- Admin page: /admin/login-history

### Online Users Monitoring
- Real-time connected users for admin
- Heartbeat every 30s, 2-min timeout for offline
- Admin page: /admin/online-users (auto-refresh 15s)

### Support System with Email
- Ticket creation sends email to info@paylionsbit.es
- Confirmation email to user
- Admin notifications (bell icon)

### KYC Verification
- Document upload, selfie, digital signature
- Admin review panel

### Financial Analysis Suite
- Real-Time Market (TradingView), Crypto Market, Converter
- Projections, Portfolio, Alerts, Market Reports
- Investment Comparator, Global Market Map, Live Market News

## Tech Stack
- **Frontend:** React, TailwindCSS, Framer Motion, Chart.js
- **Backend:** FastAPI (Python), APScheduler
- **Database:** MongoDB
- **Auth:** JWT with RBAC
- **Email:** Resend API
- **Geolocation:** ip-api.com
- **Widgets:** TradingView Advanced Chart

## Credentials
- **Admin:** admi@paylionsbit.es / LionsBit2026!
- **Backup Admin:** admin.backup@paylionsbit.es / LionsBit2026!Backup

---
Last Updated: April 2, 2026
