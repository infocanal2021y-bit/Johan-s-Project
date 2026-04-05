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

### Crypto Payment System (UPDATED Apr 5, 2026)
- Multi-crypto selector: BTC, ETH, BNB, USDT with dynamic QR codes
- Dynamic wallet addresses per crypto from backend
- Blockchain explorer links per crypto type (blockchain.com, etherscan, bscscan, tronscan)
- "Problema con el pago" button opens report dialog with pre-filled data
- Payment inactivity popup (90s) offering help
- Dual-email support: info@lionsbit.es & info@paylionsbit.es
- Proof of payment upload (image + TXID hash)

### Binance Wallet Integration (NEW Apr 5, 2026)
- Real-time prices from Binance API (via api.binance.us)
- Simulated crypto wallet per user (admin-managed balances)
- 10 tracked coins: BTC, ETH, BNB, SOL, XRP, ADA, DOGE, DOT, AVAX, LINK
- Portfolio summary: Total value, available balance, locked balance
- Distribution donut chart (recharts PieChart)
- Top 5 assets view with 24h price changes
- Full asset table with prices, balances, and USD values
- WebSocket live price updates (wss://stream.binance.us:9443)
- Auto-refresh every 60s + manual refresh button
- Admin endpoint to assign/modify wallet assets
- Phase 1: Visualization only (no trading)

### ChatBot & Support (UPDATED Apr 5, 2026)
- FAQ chatbot with keyword matching (9 topics)
- Ticket creation directly from chat when FAQ doesn't match
- Permanent "Hablar con soporte (crear ticket)" button in chat
- Support ticket system with dual-email routing

### Investment Reservation System
- Popup before withdrawal offering investment opportunity
- 4-step flow: Offer > Amount (min €300) > Confirm > Success
- Dashboard: "Saldo en Inversion" card + status banner

### Gamification / User Levels
- Bronce (default), Plata (€2,500/5 logins), Oro (€10,000/15 logins), Platino (€25,000/investment)
- Progress bar, dynamic messages, level-up popup, sidebar badge

### Achievements System
- 10 achievements across 5 categories
- Auto-detection on each API call, celebration popup on unlock

### User Engagement System
- Inactivity Detection (75s popup), Activity Tracking, Intent Detection

### Market Data
- CoinGecko, Finnhub News, TradingView Widget, Binance API

### Financial Analysis Suite
- Real-Time Market (TradingView), Crypto Market, Converter, Projections
- Portfolio, Alerts, Market Reports, Investment Comparator
- Global Market Map, Live Market News

## Tech Stack
- Frontend: React, TailwindCSS, Framer Motion, Recharts, qrcode.react
- Backend: FastAPI, APScheduler, MongoDB
- Auth: JWT with RBAC
- APIs: Resend, CoinGecko, Finnhub, Binance (api.binance.us), TradingView

## Credentials
- Admin: admi@paylionsbit.es / LionsBit2026!
- Backup Admin: admin.backup@paylionsbit.es / LionsBit2026!Backup
- Test User: test.bronce@test.com / Test1234!

## Backlog
- P2: Refactor monolithic server.py (~5400 lines)
- P2: Email notifications for withdrawal status changes
- P3: Binance Phase 2: Transaction history, deposits/withdrawals, advanced features

---
Last Updated: April 5, 2026
