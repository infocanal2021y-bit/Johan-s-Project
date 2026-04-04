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

### Investment Reservation System
- Popup before withdrawal offering investment opportunity
- 4-step flow: Offer > Amount (min €300) > Confirm > Success
- Deducts from checking, adds to savings
- Dashboard: "Saldo en Inversion" card + status banner

### Gamification / User Levels System (NEW)
- **Bronce** (Default): Basic access, standard processing
- **Plata** (€2,500 or 5+ logins): Priority processing, higher limits
- **Oro** (€10,000 or 15+ logins): Express processing, no limits, badge
- **Platino** (€25,000 or active investment): Max priority, early access, dedicated support
- Progress bar to next level with "Te faltan €X" message
- Dynamic messages: close to level-up, low activity nudges
- Level-up popup with celebration animation
- Badge in sidebar next to username
- Investment balance counts for level progression
- Auto notifications on level-up

### User Engagement System
- Inactivity Detection: 75s idle timer shows help popup
- Activity Tracking: Page visits, clicks, session duration
- Activity Score: low/medium/high based on 7-day data
- Intent Detection: Dynamic CTAs (2-3+ withdraw visits = stronger messages)
- Incomplete Process Tracking + Multichannel Follow-up (email 1h, notification 24h)

### Market Data
- CoinGecko: Top coins, global stats, trending
- Finnhub: Real-time news (General, Crypto, Forex, Merger)
- TradingView Advanced Chart Widget

### Other Features
- Bitcoin Tax Payment System (BTC validation, wallet links, TXID tracking)
- FAQ Chatbot (9 categories), Support Ticketing
- Background Jobs: APScheduler (tax reminders, auto-rejection, balance notifications, incomplete followups)

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
- Test User (Bronce): test.bronce@test.com / Test1234!

## Backlog
- P2: Refactor monolithic server.py (~4900 lines) into modules

---
Last Updated: April 4, 2026
