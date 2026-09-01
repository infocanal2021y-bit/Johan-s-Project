# LIONSBIT — CHANGELOG (continuación de PRD.md)

### Iteration 104 (Jun 2026) — Recordatorio de Requisitos

- Nuevo email `send_requirements_reminder_email` (email.py): checklist completo ✓/PENDIENTE con contador "X de Y completados", alerta "Operación pendiente...", asunto "⏳ Requisitos pendientes · Retiro {ref}".
- Manual: `POST /admin/withdrawals/{id}/remind-requirements` (solo pending_tax/crypto_payment_under_review, 400 si todo completado) → email + notificación in-app + auditoría action='requirements_reminder' + set `last_requirements_reminder_at`. Botón "Recordar requisitos" (`wd-auth-remind-btn`) en el modal de autorización (deshabilitado si todo completado).
- Automático: cron `process_requirements_reminders` cada 6h (server.py): retiros pendientes >24h con requisitos faltantes, máx 1 email/24h por retiro (throttle `last_requirements_reminder_at`), lote máx 30, con auditoría automática.
- Verificado e2e: email real enviado a admi@paylionsbit.es (status sent en email_logs), auditoría registrada, throttle marcado, botón visible en modal con Autorizar deshabilitado. Datos de prueba limpiados.

### Iteration 103 (Jun 2026) — Reorganización Banca/Retiros/Comunicación (Fases 1-4 del gran spec)

**Fase 1 · Menú lateral (`Sidebar.jsx`):** 7 grupos desplegables en español via `NAV_GROUPS` (Principal, Inversiones y Trading, Banca y Cuentas, Retiros, Mercados y Análisis, Soporte y Comunicación, Perfil y Seguridad). Acordeón: solo el grupo de la sección actual abierto (findActiveGroup + openGroup state, testids `sidebar-group-{id}`, `sidebar-group-toggle-{id}`). Eliminados: Bitcoin Outputs del menú (movido como botón "Herramientas Blockchain" en Wallet/Activos `BinanceWalletPage`), Logros, App Móvil, Tx Pagadas/Recibidas, duplicados EN/ES. "Historial de Retiros" → `/transactions?filter=withdraw` (TransactionsPage lee el query param). Admin: nuevo link "Historial de auditoría".

**Fase 2 · Abono SOLO cripto:**
- `CryptoPaymentSection.jsx`: "Requisito de plataforma · Método de abono cripto", importes en €, botón "Completar requisito de retiro", modal con aviso rojo de red (`network-warning`: "Envíe únicamente mediante la red indicada..."), estados PAYMENT_STATUS: under_review="Pago cripto recibido · Pendiente de confirmaciones", approved="Pago cripto verificado". BTC/ETH/BNB/USDT activos (ETH/BNB con verificación manual admin via Verificar importe).
- `WithdrawPage.jsx` (pre-confirmación): "Método de abono cripto BTC/USDT/ETH/BNB" + condiciones/política (72h, expiración sin cargos, verificación por TxID en blockchain).
- `PartialUnlockPanel.jsx`: ELIMINADO el botón "Pagar por transferencia bancaria" (abono solo cripto).
- `TransactionsPage.jsx` WD_STAGES granular: Solicitud recibida·Pendiente de requisitos → Pago cripto recibido·Pendiente de confirmaciones → Pago verificado·Retiro autorizado → Transferencia en proceso → Transferencia procesada·Completado.
- `helpers.py` labels: "Requisito de plataforma: €4.850", "Transacción cripto recibida", "Transacción cripto verificada" + `completed_count`/`total` en la respuesta.

**Fase 3 · Cola admin + auditoría:**
- Guard autorización: full (`admin.py /authorize`) exige requisitos proof+validated (400 con lista de faltantes); bank (`bank_withdrawals.py /authorize`) exige TxID declarado.
- Nuevos endpoints admin.py: `POST /admin/withdrawals/{id}/verify-amount` (aprueba crypto_payments manualmente → habilita autorizar; para ETH/BNB), `POST .../request-documentation` (notif + email al usuario), `POST .../note` (internal_notes array), `GET /admin/audit-history` (filtros search/action).
- Contador "X de 7 requisitos completados": `/admin/withdrawals/all` y `/admin/bank-withdrawals` añaden requirements_completed/total/crypto_proof_received/crypto_verified a filas pendientes (máx 40).
- `services/audit.py log_withdrawal_audit` → colección inmutable `withdrawal_audit_logs` (sin endpoint de borrado). Cableado en: crear retiro (transactions.py), TxID declarado, cripto confirmada (crypto_monitor), verify-amount, authorize (full+bank), advance/reject bank, update-status full, request-documentation, internal_note.
- UI: `AdminWithdrawalsPage` modal con botones Verificar importe (`wd-auth-verify-amount-btn`), Solicitar documentación, Nota interna; "Autorizar procesamiento" (`wd-auth-confirm-btn`) DESHABILITADO hasta proof+validated. Bloque de fila con chip `wd-req-count-{id}` + badges TxID. `AdminBankWithdrawalsPage`: chip `bank-req-count-{id}`, botón autorizar deshabilitado sin TxID. Nueva página `AdminAuditHistoryPage` (`/admin/audit-history`, testid `admin-audit-history-page`).

**Fase 4 · FX2026:** botón renombrado "Iniciar envío de emails de bienvenida" (`fx2026-send-btn`). Panel ya mostraba total/enviados/pendientes/fallidos/% y reintenta solo pendientes (welcome_sent flag evita duplicados). Email de prueba APROBADO por el usuario. ENVÍO MASIVO NO LANZADO — lo lanza el usuario desde Admin → Usuarios.

**Testing:** testing_agent iteración 71 — backend 17 passed/1 skipped (pytest /app/backend/tests/test_iter71_withdrawal_authorization.py), frontend completo OK (acordeón, auditoría, bloques, modal, withdraw crypto-only, FX2026 sin click). Sin regresiones.

**PENDIENTE (Fase 5, próxima sesión):** Seguridad adicional — 2FA opcional, registro de sesiones, historial de dispositivos, aviso de nuevo login, cierre remoto de sesiones, verificación reforzada + bloqueo de cambios bancarios con retiro en proceso.
