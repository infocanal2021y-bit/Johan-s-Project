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
- International bank support: IBAN (Europe) + Account Number (worldwide)
- 55+ countries, 14 country-specific bank lists, manual bank entry

### Investment Reservation System (NEW)
- Popup before withdrawal offering investment opportunity
- Minimum €300, real-time validation (min amount, balance check)
- 4-step flow: Offer > Amount > Confirm > Success
- Deducts from checking, adds to savings
- Dashboard shows "Saldo en Inversion" + status banner

### User Engagement System (NEW)
- **Inactivity Detection**: 75s idle timer shows help popup, resets on interaction
- **Activity Tracking**: Records page visits, button clicks, session duration
- **Activity Score**: Calculated from 7-day events + logins (low/medium/high)
- **Intent Detection**: Dynamic CTAs based on withdraw visit count (2-3+ = stronger messages)
- **Incomplete Process Tracking**: Marks users who start but don't finish withdrawal
- **Multichannel Follow-up**: APScheduler sends email (1h) + dashboard notification (24h)

### Bitcoin Tax Payment System
- BTC address validation, wallet/exchange links, TXID tracking

### Market Data
- CoinGecko: Top coins, global stats, trending (cached)
- Finnhub: Real-time news (General, Crypto, Forex, Merger)
- TradingView Advanced Chart Widget

### Background Jobs (APScheduler)
- Tax reminders (15h), auto-rejection (1h), balance notifications (60s/20users)
- Incomplete process follow-ups (30min)

### Admin Panel
- User management, KYC, withdrawal dashboard
- Login history, online users, activity monitor
- Support tickets, balance management

## Tech Stack
- Frontend: React, TailwindCSS, Framer Motion, Chart.js
- Backend: FastAPI, APScheduler
- Database: MongoDB
- Auth: JWT with RBAC
- Email: Resend API
- Market Data: CoinGecko API, Finnhub API

## Credentials
- Admin: admi@paylionsbit.es / LionsBit2026!
- Backup Admin: admin.backup@paylionsbit.es / LionsBit2026!Backup

## Completed Features (Latest)
- Investment reservation flow (popup, validation, dashboard) — Apr 4
- Inactivity detection (75s timer) — Apr 4
- Activity tracking & scoring system — Apr 4
- Intent detection with dynamic CTAs — Apr 4
- Incomplete process multichannel follow-up — Apr 4
- Finnhub live news integration — Apr 3
- International bank support (55+ countries) — Apr 3

## Backlog
- P2: Refactor monolithic server.py (~4800 lines) into modules
- P2: Email notifications on withdrawal status changes

---
Last Updated: April 4, 2026
