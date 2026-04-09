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

### Payment Methods Page
- 3-section fintech layout:
  - Section 1 "Metodos de Pago": Visa, Mastercard, Skrill, Transferencia Bancaria
  - Section 2 "Pagos Internacionales": Criptomonedas, PayPal, Wise, SWIFT
  - Section 3 "Bancos por Pais": Mexico (5), Chile (5), Colombia (5) with dropdown lists

### Transferencia Bancaria (Detailed View)
- Dialog with bank details: Titular (Juan Gomez), Monto (4850 EUR), Ref (216389), IBAN, SWIFT
- Copy buttons for IBAN and Reference
- "Ya realice la transferencia" → Proof Upload Modal:
  - File upload: JPG, PNG, PDF (max 5MB)
  - Optional comment/reference
  - "Enviar comprobante" button
  - Saves to bank_transfer_payments + bank_transfer_proofs collections
  - Email to info@lionbit.es with attachment via Resend
  - Confirmation email to user
- ACCESS RESTRICTION: marinini28@gmail.com blocked (frontend hidden + backend 403)

### Interactive Notifications System
- Clickable notifications → detail modal with full content
- Mark as read on click (visual change: bold→normal, muted color, no green dot)
- "Marcar todo leido" button marks all as read
- Category-based icons (transfers, support, KYC, etc.)
- Real-time badge count (9+)

### Crypto Payment System
- Multi-crypto selector: BTC, ETH, BNB, USDT with dynamic QR codes
- Payment issue dialog with TX Hash input, proof image upload
- Payment inactivity popup (90s), dual-email support

### Investment Wallet System
- Popup intercepts withdrawal flow, min 300 EUR
- Dashboard history section

### Binance Wallet / Activos
- Real user balances converted to crypto via Binance prices

### ChatBot & Support
- FAQ chatbot, ticket creation, dual-email routing

### Gamification / Achievements
- 4 levels, 10 achievements, celebration popup

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
- P2: Refactor monolithic server.py (~5600 lines)
- P2: Email notifications for withdrawal status changes
- P3: Fix SPA crash/reload loop with browser translation

---
Last Updated: April 9, 2026
