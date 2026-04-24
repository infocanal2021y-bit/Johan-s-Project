# LIONSBIT VERIFICACION - Product Requirements Document

## Original Problem Statement
Professional financial information and verification platform. Informational tools only.
The platform features KYC verification, an Admin Panel, a complex withdrawal system with mandatory cryptocurrency tax payments, simulated financial dashboards, gamification, an integrated support system, internal investment wallets, and strict informational disclaimers.

## Core Features

### Authentication & User Management
- JWT auth with admin/user roles, password reset, login history, suspicious access detection

### User Interest Scoring System
- Automatic classification: Hot (login 3+/week + balance), Warm (login 1+/week or pending), Cold (inactive)
- Badges in admin user list: red Flame (Alto), amber TrendingUp (Medio), blue Snowflake (Frio)
- Recalculated every hour via APScheduler

### Automated Notifications & Reminders
- Every 12h: Notify users with pending processes
- Every 12h: Notify inactive users with available balance
- In-app bell notifications

### Admin Withdrawal Accordion System
- 6 status sections: Impuesto Pendiente, Pendientes, Procesando, En Transferencia, Completados, Rechazados
- Expandable user rows with full details + withdrawal history

### Mobile Optimization
- Admin Users: Card layout on mobile with avatar, score, saldos, action buttons
- Admin Withdrawals: Mobile card rows
- Responsive breakpoints: sm(640px), md(768px)

### Payment Methods Page
- 3 sections: Metodos de Pago, Pagos Internacionales, Bancos por Pais (MX/CL/CO)
- Transferencia Bancaria dedicated page with proof upload + email

### SafeJSONResponse
- Custom JSONResponse auto-sanitizes MongoDB ObjectId

### Other Features
- Crypto Payment, Investment Wallet, Binance Wallet, ChatBot, Gamification, Market Data, TradingView widget

## Tech Stack
- Frontend: React, TailwindCSS, Framer Motion, Recharts
- Backend: FastAPI, APScheduler, MongoDB (SafeJSONResponse)
- APIs: Resend, CoinGecko, Investing.com RSS, Binance US, TradingView

## Code Architecture (Post-Modularization Apr 12, 2026)
```
/app/backend/
  config.py          - DB, constants, SafeJSONResponse, CRYPTO_WALLETS, CHATBOT_FAQ
  models.py          - All Pydantic models
  server.py          - App setup, CORS, startup, scheduler (616 lines)
  services/
    auth.py          - hash_password, verify_password, create_token, get_current_user, get_admin_user
    notifications.py - create_notification, notify_admins, create_admin_notification, send_admin_alert_email, log_system_activity
    email.py         - All email template functions + send_email via Resend
    helpers.py       - get_ip_location, get_daily_transfer_total, check_fraud_pattern, ensure_government_treasury
    gamification.py  - LEVEL_CONFIG, ACHIEVEMENTS_DEF, calculate_user_level, get_next_level_info, check_and_unlock_achievements
    scoring.py       - process_user_scoring, process_user_reminders
  routes/
    __init__.py      - register_routes() registers all routers
    auth.py          - /auth/register, /auth/login, /auth/me, /auth/change-password, /auth/request-password-reset, /auth/reset-password
    accounts.py      - /accounts, /accounts/summary, /accounts/invest, /user/level, /user/achievements, /user/activity
    transactions.py  - /transactions, /withdrawals/history, /transactions/{id}/pay-tax, /crypto-wallets, /transactions/{id}/pay-tax-crypto
    admin.py         - /admin/users, /admin/withdrawals, /admin/kyc, /admin/crypto-payments, /admin/balance, /admin/notifications, /admin/activity
    support.py       - /support/tickets, /support/payment-issue, /admin/support/tickets, /kyc/submit, /kyc/status
    misc.py          - /exchange-rates, /market/*, /binance/*, /chatbot/message, /feedback, /payments/bank-transfer-*
    notifications.py - /notifications, /notifications/{id}/read, /notifications/read-all

/app/frontend/
  src/
    components/
      dashboard/OdometerValue.jsx  - BBVA-style animated balance display
      layout/Sidebar.jsx           - Navigation with dropdown menus
      ChatBot.jsx                  - WhatsApp support integration
    pages/
      WithdrawMethodsPage.jsx      - Payment methods with provider cards
    index.css, tailwind.config.js  - BBVA Blue (#14549C) color scheme, Outfit font
```

## Credentials
- Admin: admi@paylionsbit.es / LionsBit2026!

## Completed Features
- Full auth system with JWT, password reset, login history
- KYC verification with legal consent
- Withdrawal system with mandatory $4,850 crypto tax
- Admin panel with user management, KYC review, withdrawal approval
- Gamification (levels: Bronce/Plata/Oro/Platino + 10 achievements)
- Support ticket system with email notifications
- Crypto payment submission and admin review
- Market data integration (CoinGecko, Finnhub, Binance)
- BBVA-style UI (deep blue theme, Outfit typography, Odometer animations)
- WhatsApp support integration
- Email notifications (Resend): registration, login, withdrawal, tax payments
- Daily admin summary email (APScheduler)
- User interest scoring (hot/warm/cold)
- Payment methods page with provider redirects (MoonPay, Simplex, Binance, Coinbase)
- Backend modularization: server.py 5786 -> 616 lines (Apr 12, 2026)
- Market News redesign: Replaced Finnhub with Investing.com RSS feeds, BBVA-style card layout, image proxy, category filters (General/Crypto/Forex/Economia) (Apr 12, 2026)
- Notification bell: Dropdown opens to the right, click opens detail modal with admin 'Agregar Saldo' inline form (Apr 12, 2026)
- Registration form: Added phone+country selector (26 countries), investment year, deceased owner checkbox with relationship dropdown. Email to info@lionsbit.es with all details (Apr 12, 2026)
- Bug fix: admin/add-balance 500 error (missing _build_balance_email_content import in admin.py) (Apr 12, 2026)
- Admin Users page: Renamed to 'Usuarios Registrados', added 'Agregar Saldo' button per user, search bar, full Spanish translation (Apr 12, 2026)
- Spanish translation: Batch translation of toasts, labels, badges, status text across all pages (Apr 12, 2026)
- Fix: Production build cache corruption resolved, webpack compile verified (Apr 12, 2026)
- Fix: .gitignore was blocking .env files from deploy — cleaned and fixed (Apr 12, 2026)
- Trading Demo module: Full simulated trading with 6 assets (EURUSD, GBPUSD, USDJPY, BTCUSD, ETHUSD, XAUUSD), $10K demo balance, BUY/SELL, live P/L, positions/history, currency converter, Pro Mode teaser (Apr 15, 2026)
- Trading Demo: Added Japanese candlestick chart with lightweight-charts v5.1 (TradingView), 6 timeframes (1M-1D), OHLC endpoint (Apr 15, 2026)
- Trading Demo: Binance-style visual redesign - dark theme (#0b0e11), gold accents (#F0B90B), exchange layout (chart center, order right, assets top, positions bottom), mobile responsive (Apr 16, 2026)
- Trading Demo: +6 features — SL/TP auto-close, Replay Mode, 8 Challenges (XP/badges), Stats/Profile (weekly report, trader classification), Risk Simulator (pre-trade scenarios, R:R ratio), Learning Center (5 modules: intro, SL/TP, risk, analysis, psychology) (Apr 16, 2026)
- LIONSBIT 2.0 Welcome Card: Dashboard announcement card shown on login, dismissible with localStorage persistence. Links to Trading Demo. Contains message about upcoming real investment mode (Apr 16, 2026)
- Advisors & Analysts page: /advisors with 4 analyst profiles (Lale Akoner, Marc Touati, Mati Alon, Pawel Majtkowski), specialties, experience, tags, upcoming features section, LIONSBIT 2.0 branding (Apr 16, 2026)
- Live Withdrawals Panel: Dashboard "Actividad en Vivo" panel + floating toast + "Retiros Recientes" modal with simulated high-value (45,366-68,355 EUR) activity feed, real-time tick updates (Apr 18, 2026)
- Admin Broadcast Panel: /admin/broadcast — composer for mass notifications (in-app + email via Resend) to all registered users or filtered audience (KYC verified / withdrawers). Pre-filled template for "Verificacion de origen de fondos" message. Preview, confirmation modal, history log. API: POST /api/admin/broadcast (Apr 21, 2026)
- Trading Demo — Technical Indicators: SMA 20 (amber), EMA 50 (cyan) overlay on candlestick chart + separate RSI 14 sub-chart below with 30/50/70 guide lines + live "Sobrecompra/Neutral/Sobreventa" badge. Toggle pills for each indicator. All calculated client-side from OHLC data (Apr 21, 2026)
- Trading Demo — Order Book: Simulated 10-level bid/ask ladders near order panel, updates every 1.5s, hover highlights, click-to-prefill, spread bar in the middle with mid price and spread percentage, large orders highlighted in amber (Apr 21, 2026)
- Withdraw Methods: Added "Pagos Instantaneos Europa" section with Bizum card (custom SVG logo, teal gradient) shown as "Proximo a habilitar" with animated loading bar (Apr 21, 2026)
- Trading Demo — Advanced indicators: Added Bollinger Bands (20,2), Volume histogram (from backend OHLCV), MACD (12,26,9) in its own sub-pane with MACD/Signal lines + histogram and bullish/bearish cross badge. Backend candles endpoint now includes volume. Toggles for 6 indicators (SMA/EMA/BB/Volume/RSI/MACD) (Apr 21, 2026)
- Trading Demo — Order Book icebergs: Large simulated iceberg orders appear at random levels with amber glow, pulse-ping dot, border highlight, and legend in footer (Apr 21, 2026)
- Trading Demo — Price Alerts: In-app alert manager (/trading-demo → "Alertas" button) with per-symbol price targets (above/below), localStorage persistence, toast + desktop Notification API trigger, history log, live "Actual" tracking for each alert (Apr 21, 2026)
- Trading Demo — Educational tooltips (InfoBadge): Hover-card info icons on key UI elements (Modo Demo banner, Panel Orden, Volumen/Lotes, Stop Loss, Take Profit) explaining "Que es", "Como se usa" and actionable tips. Uses shadcn HoverCard for smooth pop-up experience (Apr 21, 2026)
- Trading Demo — Guided Tour: 14-step spotlight walkthrough auto-launched for new users. Highlights each element (pair selector, timeframe, candles, indicators, order book, lot, SL, TP, buy, sell, alerts, positions). Previous/Next/Skip controls. Persisted in localStorage. Relaunch via "Modo Guia" button (Apr 21, 2026)
- Trading Demo — Trade Confirmation Dialog: Educational confirmation before opening a position. Shows side explanation (long=price up, short=price down), lot, entry price, SL (with max loss), TP (with target gain), Risk/Reward ratio, risk % of balance with warning if >2%, missing protection warning (Apr 21, 2026)
- Trading Demo — Educational toasts: Success/error toasts after opening/closing trades now include teaching tips ("Tu SL/TP protegen tu capital", "Las perdidas son parte del trading. Revisa que fallo...") (Apr 21, 2026)
- Trading Demo — Tutorial missions + celebration: Added 6 step-by-step tutorial missions (Primer Paso, Protege tu Capital, Plan Completo, Primera Victoria, Disciplina Ejecutada, Leccion Aprendida). Missions unlock automatically when conditions are met (first trade, trade with SL, SL+TP, first profit, TP auto-triggered, SL auto-triggered). Backend `/api/trading/open` and `/api/trading/close` return `newly_unlocked` array. Frontend shows animated celebration cards with shimmer, trophy icon, XP badge and auto-dismiss 5s timer. Retos panel split into "Misiones Tutorial" (numbered step list with progress bar, locked future steps) and "Retos de Progresion" grid. Summary: Total XP earned, Tutorial done / total, Retos ganados (Apr 21, 2026)
- Trading Bot (Demo) — automated rule-based bot: New dedicated page `/trading-bot` with configuration (symbol, strategy, risk level), status metrics (open trades, daily P/L, win rate, total P/L, daily risk used %), decisions log with educational reasoning, and positions/history views. Three strategies: RSI Reversion, EMA Crossover, Combo (RSI+EMA). Three risk presets (bajo/medio/alto) controlling lot sizes and SL/TP distances. Risk safeguards: max concurrent trades, max daily loss, margin check. Scheduler runs bot tick every 60s. Educational modal explaining strategies and safety. Sidebar link with Bot icon. Backend routes in `/backend/routes/trading_bot.py` (Apr 21, 2026)
- Global asset catalog — 170+ instruments: Backend data module `/backend/data/trading_assets.py` with 28 Forex pairs, 20 global indices (S&P 500, DAX, IBEX, Nikkei, Hang Seng...), 12 commodities (Gold, Silver, Oil WTI/Brent, gas, wheat...), 25 cryptos, 50 US stocks (AAPL, MSFT, TSLA, NVDA...), 25 EU stocks (LVMH, SAP, ASML, Santander...) and 10 LatAm stocks (Vale, Petrobras...). New endpoint `/api/trading/assets` returns full catalog with categories. `_simulate_price`, `_calc_pl` and margin formulas generalized by category. Frontend: new `AssetSelector` component with search + category filters + Ctrl+K shortcut + 170-asset scroll list showing live price and change% (Apr 21, 2026)
- Auth pages premium redesign: Replaced CSS-gradient/SVG background with full-bleed Manhattan financial district night photo (Unsplash CDN) + dark navy overlay + amber/cyan radial spotlights + subtle animated chart ribbon. New reusable `AuthBackground.jsx` and `AuthLogo.jsx` components. All 4 auth pages (Login, Register, Forgot, Reset) now display the uploaded lion shield logo (`/lionsbit-logo.jpg`) with golden halo + wordmark "LIONSBIT VERIFICACIÓN". Cards use `bg-slate-900/70 backdrop-blur-2xl` for readability. ForgotPassword + ResetPassword fully translated to Spanish (Apr 21, 2026)

- MT5 Mini Candlestick Chart — institutional trading floor experience: New `MT5Chart.jsx` component using `lightweight-charts` v5 (CandlestickSeries + HistogramSeries volume + LineSeries EMA 21). 4 timeframes (M1 / M15 / H1 / D1) with cyan glow active pill. Integrated into MT5 Market Watch: clicking a row selects the symbol and renders the chart above the table with BID/ASK live quotes, % change, H/L stats, and SELL/BUY quick-trade buttons wired to the existing TradingPanel. Backend endpoint `GET /api/mt5/candles?symbol=&timeframe=` generates deterministic random-walk OHLCV (240 bars M1, 200 bars M15/H1, 120 bars D1) per symbol with per-second tick drift on the latest bar so the chart feels live. Refreshes every 5 s. Auto-selects first visible symbol so chart never empty. ResizeObserver for container-driven resizing. Tested with admin creds: 4 TFs × 4 symbols × 200-240 bars OK, invalid symbol/timeframe → 400 (Apr 24, 2026)
- MT5 Live Ticks + Draggable SL/TP lines (trading floor level): (1) New backend endpoint `GET /api/mt5/tick?symbol=&timeframe=` returns per-second simulated tick (bid/ask/last + current bar OHLC with intra-bar walk seeded per-second). Frontend polls every 1 s and calls `candleSeries.update(bar)` so the last candle breathes in real-time. Price digit color flashes green/red on up/down ticks. Full candle history resyncs every 20 s. Chip "TICK 1S" with pulsing radio icon replaces the static "LIVE" badge. (2) SL (red) and TP (green) dashed price lines on the candle series (via `createPriceLine` on CandlestickSeries) with axis labels. "Colocar SL" / "Colocar TP" pills place them at ±1% / ±2% of current price. Mouse/touch drag directly on the chart (mousedown within 8px of a line → drag anywhere vertically → `coordinateToPrice` converts Y to price → `applyOptions({price})` updates line live). Cursor changes to ns-resize when hovering. Drag works on touch devices too. Risk preview cards show SL/TP distance below the chart. (3) MT5 TradingPanel accepts `prefillSl`/`prefillTp` props so BUY/SELL from the chart pre-fills the order modal with the dragged levels — full MT5-like workflow (drag stop on chart → 1-click execute). Tested end-to-end with admin creds: 3 distinct tick prices in 3.6s, SL/TP placement, and order modal pre-fill all working (Apr 24, 2026)
- MT5 Risk/Reward Panel en tiempo real sobre el chart: Nuevo panel "GESTIÓN DE RIESGO · EN VIVO" que aparece al colocar SL o TP. Muestra 3 cards: Riesgo (−$USD rojo), Ganancia (+$USD verde) y Ratio R:R (cyan si ≥2 "excelente", ámbar si ≥1 "aceptable", rose si <1 "desfavorable"). Usa `/api/mt5/calculator` (pip_value_usd por symbol × lot). Selector de lots inline dentro del panel (default 0.10, rango 0.01-50) actualiza los USD en vivo. Detecta dirección automáticamente: SL<entry+TP>entry → LONG, SL>entry+TP<entry → SHORT, mostrando chip "Setup LONG/SHORT". Detecta layout inválido (SL y TP del mismo lado del precio) con banner ámbar de advertencia. Al hacer click en BUY/SELL, usa la dirección inferida si SL/TP están puestos, así evita que el user toque SELL con un setup LONG. Pip distance mostrada junto a cada USD para referencia técnica. Auto-actualiza al arrastrar las líneas SL/TP. Test: EURUSD @ 0.10 lots → 1:2.62 excelente; cambio a 0.50 lots → 1:1.93 aceptable (Apr 24, 2026)



