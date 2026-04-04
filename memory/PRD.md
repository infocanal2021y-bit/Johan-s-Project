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
- Dashboard: "Saldo en Inversion" card + status banner

### Gamification / User Levels
- Bronce (default), Plata (€2,500/5 logins), Oro (€10,000/15 logins), Platino (€25,000/investment)
- Progress bar, dynamic messages, level-up popup, sidebar badge
- Investment counts for level progression

### Achievements System (NEW)
- 10 achievements across 5 categories:
  - **Basicos**: Primer Acceso, Identidad Verificada
  - **Transacciones**: Primer Retiro
  - **Inversion**: Primera Inversion, Inversor Comprometido (7+ dias)
  - **Actividad**: Racha 5 Dias, Usuario Activo (10+ accesos/mes)
  - **Niveles**: Nivel Plata, Nivel Oro, Nivel Platino
- Auto-detection on each API call
- Celebration popup on new unlock
- Progress bar: X/10 (XX% completado)
- Locked (gray/lock) vs Unlocked (gold/date) visual states
- Notifications on unlock

### User Engagement System
- Inactivity Detection (75s popup), Activity Tracking, Intent Detection
- Incomplete Process Follow-up (email 1h, notification 24h)

### Market Data
- CoinGecko, Finnhub News, TradingView Widget

### Other
- Bitcoin Tax Payment, FAQ Chatbot, Support Ticketing
- Background Jobs: APScheduler (tax, rejection, notifications, followups)

## Tech Stack
- Frontend: React, TailwindCSS, Framer Motion
- Backend: FastAPI, APScheduler, MongoDB
- Auth: JWT with RBAC
- APIs: Resend, CoinGecko, Finnhub

## Credentials
- Admin: admi@paylionsbit.es / LionsBit2026!
- Test User: test.bronce@test.com / Test1234!

## Backlog
- P2: Refactor monolithic server.py (~5000 lines)

---
Last Updated: April 4, 2026
