# LIONSBIT VERIFICACION - Product Requirements Document

## Original Problem Statement
Professional financial information and verification platform. Provides informational tools for financial analysis and digital verification services. Platform is exclusively informational — not enabled for real investments.

## Core Features

### Authentication & User Management
- JWT auth with admin/user roles, auto-created admin accounts
- Password reset via Resend, login history with IP geolocation (ip-api.com)
- Online presence system (heartbeat 30s), suspicious access detection

### Banking & Withdrawals
- Multi-currency accounts (USD/EUR), admin-only deposits
- Withdrawal with $4,850 USD mandatory tax, min $200 partial payments
- Auto-rejection after 72h, email reminders every 15h

### Bitcoin Tax Payment System
- BTC address validation (Legacy/SegWit/Bech32)
- Wallet links: Trust Wallet, Binance, Coinbase, Exodus, Blockchain
- Buy crypto: MoonPay, Simplex
- TXID tracking with blockchain.com explorer links
- Tax progress bar (Requerido/Abonado/Restante)
- Email notifications on payment creation and completion

### CoinGecko Market Data Integration
- **GET /api/market/crypto**: Top 50 coins (cached 120s)
- **GET /api/market/global**: Total market cap, volume, BTC dominance, active cryptos (cached 180s)
- **GET /api/market/trending**: Trending coins and categories (cached 600s)
- Rate limiting handled with server-side caching
- `/crypto-market` page: Global stats panel + searchable market table

### Finnhub Live News Integration (NEW Apr 3)
- **GET /api/market/news?category=general|crypto|forex|merger**: Real-time news articles (cached 300s)
- 4 category tabs: General, Crypto, Forex, Fusiones
- News cards with images, headlines, summaries, source, timestamps, external links
- `/live-news` page: Full news feed with category filtering

### Staggered Email Notification System
- APScheduler job every 60 seconds, 20 users per batch
- Only users with balance > 0
- 48h cooldown (no resend before 48h)
- All sends logged in `email_notifications_log` collection

### Chat Inteligente (FAQ Chatbot)
- Floating widget, 9 FAQ categories, zero API cost

### Admin Panel
- User management, KYC verification, withdrawal dashboard
- Login history with suspicious access detection
- Online users monitoring (auto-refresh 15s)
- Activity monitor, support tickets
- Balance/credits management (Gestión de Saldos)

### Support System
- Ticket creation sends email to info@paylionsbit.es + user confirmation
- Admin notifications (bell icon)

### Financial Analysis Suite
- Real-Time Market (TradingView), Crypto Market (CoinGecko), Converter
- Projections, Portfolio, Alerts, Market Reports
- Investment Comparator, Global Market Map, Live Market News (Finnhub)

## Tech Stack
- **Frontend:** React, TailwindCSS, Framer Motion, Chart.js
- **Backend:** FastAPI, APScheduler
- **Database:** MongoDB
- **Auth:** JWT with RBAC
- **Email:** Resend API (staggered 20/min)
- **Market Data:** CoinGecko API (free tier, server-cached)
- **News:** Finnhub API (free tier, server-cached 300s)
- **Geolocation:** ip-api.com
- **Widgets:** TradingView Advanced Chart

## Credentials
- **Admin:** admi@paylionsbit.es / LionsBit2026!
- **Backup Admin:** admin.backup@paylionsbit.es / LionsBit2026!Backup

## Completed Features (Chronological)
- Core auth, banking, KYC, admin panel
- Withdrawal system with tax payments
- Bitcoin tax payment UI with wallet links
- CoinGecko market data integration
- FAQ Chatbot
- Login tracking & online users monitoring
- Support ticketing system
- Staggered email notifications (APScheduler)
- Mobile optimization
- SPA translation crash fix
- MongoDB ObjectId serialization fix
- Finnhub live news integration (Apr 3, 2026)

## Backlog
- P2: Refactor monolithic server.py (~4600 lines) into modular structure
- P2: Email notifications on withdrawal status changes

---
Last Updated: April 3, 2026
