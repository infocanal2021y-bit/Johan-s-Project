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
- Each card has logo, name, description
- Bank dropdowns expand on click showing individual banks
- All methods show "Proximamente" modal (stubs for future activation)
- Dark fintech design with hover effects and responsive grid

### Crypto Payment System
- Multi-crypto selector: BTC, ETH, BNB, USDT with dynamic QR codes
- "Problema con el pago" button with pre-filled report dialog
- Payment issue dialog includes: TX Hash input, proof image upload, message
- Payment inactivity popup (90s) offering help
- Dual-email support: info@lionsbit.es & info@paylionsbit.es
- Proof of payment upload (image + TXID hash)

### Investment Wallet System
- Popup intercepts withdrawal flow: "Desea invertir parte de su saldo?"
- Min 300 EUR investment, deducted from checking to savings
- Dashboard "Wallet de Inversion" section with: saldo, estado, historial

### Binance Wallet / Activos
- Uses REAL user balances converted to crypto equivalents via Binance prices
- Allocation: BTC 40%, ETH 25%, BNB 12%, SOL 8%, XRP 5%, ADA 3%, DOGE 2%, DOT 2%, AVAX 2%, LINK 1%
- Distribution donut chart, Top 5 assets, equivalents table

### ChatBot & Support
- FAQ chatbot with keyword matching (9 topics)
- Ticket creation directly from chat
- Support ticket system with dual-email routing

### Gamification / Achievements
- Bronce, Plata, Oro, Platino levels
- 10 achievements across 5 categories, auto-detection, celebration popup

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

## Backlog
- P2: Refactor monolithic server.py (~5500 lines) into modular architecture
- P2: Email notifications for withdrawal status changes
- P3: Fix SPA crash/reload loop with browser translation

---
Last Updated: April 9, 2026
