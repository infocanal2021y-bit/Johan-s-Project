# LIONSBIT VERIFICACION - Product Requirements Document

## Original Problem Statement
Professional financial information and verification platform. Provides informational tools for financial analysis and digital verification services. Platform is exclusively informational — not enabled for real investments.

## Core Features

### Authentication & User Management
- JWT auth with admin/user roles, auto-created admin accounts
- Password reset via Resend, login history with IP geolocation
- Online presence system (heartbeat 30s), suspicious access detection

### Banking & Withdrawals
- Multi-currency accounts (USD/EUR), admin-only deposits
- Withdrawal with $4,850 USD mandatory tax, min $200 partial payments
- **International bank support**: IBAN (Europe) + Account Number (worldwide)
- 55+ countries supported across all continents
- Country-specific bank lists for: ES, MX, CO, AR, CL, PE, EC, US, BR, GB, DE, FR, IT, PT
- Manual bank entry for unlisted banks ("Mi banco no aparece")
- SWIFT/BIC code + Routing Number support

### Bitcoin Tax Payment System
- BTC address validation, wallet/exchange links, TXID tracking, blockchain explorer

### Market Data
- **CoinGecko**: Top coins, global stats, trending (cached server-side)
- **Finnhub**: Real-time financial news with categories (General, Crypto, Forex, Merger)
- TradingView Advanced Chart Widget

### Staggered Email Notifications
- APScheduler job (20 users/min, 48h cooldown)

### Chat Inteligente (FAQ Chatbot)
- Floating widget, 9 FAQ categories

### Admin Panel
- User management, KYC, withdrawal dashboard
- Login history, online users monitoring
- Activity monitor, support tickets, balance management

## Tech Stack
- **Frontend:** React, TailwindCSS, Framer Motion, Chart.js
- **Backend:** FastAPI, APScheduler
- **Database:** MongoDB
- **Auth:** JWT with RBAC
- **Email:** Resend API
- **Market Data:** CoinGecko API, Finnhub API
- **Geolocation:** ip-api.com
- **Widgets:** TradingView Advanced Chart

## Credentials
- **Admin:** admi@paylionsbit.es / LionsBit2026!
- **Backup Admin:** admin.backup@paylionsbit.es / LionsBit2026!Backup

## Completed Features
- Core auth, banking, KYC, admin panel
- Withdrawal system with tax payments + Bitcoin payment UI
- International bank support (55+ countries, 14 country bank lists) — Apr 3
- Finnhub live news integration — Apr 3
- CoinGecko market data integration
- FAQ Chatbot, Login tracking, Online users monitoring
- Support ticketing, Staggered email notifications
- Mobile optimization, SPA translation fix, ObjectId serialization fix

## Backlog
- P2: Refactor monolithic server.py (~4600 lines)
- P2: Email notifications on withdrawal status changes

---
Last Updated: April 3, 2026
