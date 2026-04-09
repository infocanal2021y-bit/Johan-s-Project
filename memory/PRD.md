# LIONSBIT VERIFICACION - Product Requirements Document

## Original Problem Statement
Professional financial information and verification platform. Provides informational tools for financial analysis and digital verification services. Exclusively informational — not enabled for real investments.

## Core Features

### Authentication & User Management
- JWT auth with admin/user roles, auto-created admin accounts
- Password reset via Resend, login history with IP geolocation
- Online presence system (heartbeat 30s), suspicious access detection

### Banking & Withdrawals
- Multi-currency accounts (USD/EUR), admin-only deposits
- Withdrawal with $4,850 USD mandatory tax, min $200 partial payments
- International bank support: IBAN (Europe) + Account Number (worldwide, 55+ countries)

### Payment Methods Page (UPDATED Apr 9, 2026)
- 3-section fintech layout:
  - Section 1 "Metodos de Pago": Visa, Mastercard, Skrill, Transferencia Bancaria
  - Section 2 "Pagos Internacionales": Criptomonedas, PayPal, Wise, SWIFT
  - Section 3 "Bancos por Pais": Mexico (5 banks), Chile (5 banks), Colombia (5 banks) with dropdown lists

### Transferencia Bancaria (NEW - Apr 9, 2026)
- Opens detailed dialog with bank transfer info:
  - Titular: Juan Antonio Gomez Bernet
  - Monto: 4850 EUR
  - Referencia obligatoria: 216389
  - IBAN: BE73 9053 1376 1560
  - SWIFT/BIC: TRWIBEB1XXX
  - Direccion: Wise, Brussels, Belgium
- Copy buttons for IBAN and Referencia
- "Ya realice el pago" button → status "Pendiente de verificacion"
- Records saved in bank_transfer_payments collection
- ACCESS RESTRICTION: marinini28@gmail.com cannot see or use this method (hidden frontend + 403 backend)

### Crypto Payment System
- Multi-crypto selector: BTC, ETH, BNB, USDT with dynamic QR codes
- Payment issue dialog with TX Hash input, proof image upload
- Payment inactivity popup (90s), dual-email support

### Investment Wallet System
- Popup intercepts withdrawal flow
- Min 300 EUR investment, dashboard history

### Binance Wallet / Activos
- Real user balances converted to crypto equivalents via Binance prices

### ChatBot & Support
- FAQ chatbot, ticket creation, dual-email routing

### Gamification / Achievements
- Bronce, Plata, Oro, Platino levels
- 10 achievements across 5 categories

### Market Data
- CoinGecko, Finnhub News, TradingView Widget, Binance API

## Tech Stack
- Frontend: React, TailwindCSS, Framer Motion, Recharts, qrcode.react
- Backend: FastAPI, APScheduler, MongoDB
- Auth: JWT with RBAC
- APIs: Resend, CoinGecko, Finnhub, Binance US, TradingView

## Credentials
- Admin: admi@paylionsbit.es / LionsBit2026!
- Backup Admin: admin.backup@paylionsbit.es / LionsBit2026!Backup
- Test User: test.bronce@test.com / Test1234!
- Restricted User: marinini28@gmail.com / Marina2026!

## Backlog
- P2: Refactor monolithic server.py (~5500 lines)
- P2: Email notifications for withdrawal status changes
- P3: Fix SPA crash/reload loop with browser translation

---
Last Updated: April 9, 2026
