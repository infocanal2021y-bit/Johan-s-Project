# LIONSBIT VERIFICACION - Product Requirements Document

## Original Problem Statement
Professional financial information and verification platform. Informational tools only.

## Core Features

### Authentication & User Management
- JWT auth with admin/user roles, password reset, login history, suspicious access detection

### Banking & Withdrawals
- Multi-currency accounts (USD/EUR), admin-only deposits
- $4,850 USD mandatory tax, $200 min partial payments

### Admin Withdrawal Accordion System (NEW - Apr 9, 2026)
- 6 status sections as accordions: Impuesto Pendiente, Pendientes, Procesando, En Transferencia, Completados, Rechazados
- Table inside each section: Usuario, Email, Monto, Banco, Fecha, Acciones
- Expandable user rows: Nombre, Email, IBAN, Saldos USD/EUR, Historial de Retiros
- Rejected section: Motivo del rechazo, Reactivar retiro, Agregar saldo buttons
- Status advancement: pending→processing→transfer_in_progress→completed
- Reject with reason dialog
- Framer Motion accordion animations

### Payment Methods Page
- 3 sections: Metodos de Pago, Pagos Internacionales, Bancos por Pais (MX/CL/CO)
- Transferencia Bancaria: detailed bank info + proof upload modal
- Access restriction for marinini28@gmail.com

### Interactive Notifications
- Click notification → detail modal, mark as read, mark all as read

### Crypto Payment System
- Multi-crypto QR, payment issue dialog with TX Hash + proof upload

### SafeJSONResponse (Bug Fix - Apr 9, 2026)
- Custom JSONResponse class auto-sanitizes MongoDB ObjectId and removes _id fields
- Fixes production deployment serialization errors

### Other Features
- Investment Wallet, Binance Wallet, ChatBot, Gamification, Market Data

## Tech Stack
- Frontend: React, TailwindCSS, Framer Motion, Recharts
- Backend: FastAPI, APScheduler, MongoDB (SafeJSONResponse)
- APIs: Resend, CoinGecko, Finnhub, Binance US, TradingView

## Credentials
- Admin: admi@paylionsbit.es / LionsBit2026!
- Backup: admin.backup@paylionsbit.es / LionsBit2026!Backup
- Test: test.bronce@test.com / Test1234!
- Restricted: marinini28@gmail.com / Marina2026!

## Backlog
- P2: Refactor server.py (~5700 lines)
- P3: Fix SPA translation crash

---
Last Updated: April 9, 2026
