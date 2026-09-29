# LIONSBIT — Test Credentials

## Admin (full access)
- **Email:** `info@paylionsbit.es`
- **Password:** `Juan1949.` (con punto final)
- **Role:** `superadmin` (desde Jun 2026 — acceso total + Editor Superadmin en /admin/super-editor; sus ediciones NO notifican al usuario y quedan en superadmin_audit_log)
- Cambiado el 09/Jun/2026 a petición del usuario (antes: admi@paylionsbit.es / LionsBit2026!)
- Las alertas email al admin (retiros, abonos cripto) van a ADMIN_EMAIL=info@paylionsbit.es

## Admin secundario (rol admin, SIN acceso superadmin)
- **Email:** `admin.backup@paylionsbit.es`
- **Password:** `LionsBit2026!Backup`
- Role: `admin`
- Account status: `active`
- Verification status: `verified`
- Accounts: 2 (checking 25.585 EUR + savings 49.900 EUR → total 75.485 EUR)
- `must_change_password`: `false`

## Bulk-imported users (FX2026 batch — Aug 2026)
Users imported from `Todos_Nombres_Correos_Telefonos.xlsx` have `import_source='fx2026_xlsx'`.
- **Password (all):** `FX2026`
- Country: España (ES)
- Sample logins (verified): `manclic@yahoo.es` / `FX2026`, `way3058@gmail.com` / `FX2026`
- 624 created, 377 already existed (skipped, keep their own passwords — e.g. `gsalazar1@gmail.com` is NOT FX2026).

## Client-Import temporary password
Imported legacy clients receive the temporary password `lionsbit2.0` via the reactivation email.
On first login they're redirected to `/force-password-change` and must set a new one.

## PRODUCCIÓN (paylionsbit.es) — credenciales distintas
- Producción NO tiene el deploy nuevo (bloqueado por filtro await_phishing de Emergent desde antes del cambio de credenciales del 09/Jun/2026).
- Admin en producción: `admi@paylionsbit.es` / `LionsBit2026!` (verificado 17/Sep/2026, devuelve token superadmin).
- `info@paylionsbit.es` NO existe en producción hasta que se pueda redesplegar.

## Notes
- Backend URL: `REACT_APP_BACKEND_URL` in `/app/frontend/.env`
- DB: MongoDB at `MONGO_URL`, DB name from `DB_NAME` in `/app/backend/.env`
- Login endpoint returns field `token` (not `access_token`).

## Admin 2FA (desde Sep 2, 2026)
- El login de admin (`info@paylionsbit.es` / `Juan1949.`) ahora requiere 2FA por email (código de 6 dígitos).
- Flujo: `POST /api/auth/login` → `{requires_2fa, challenge_id}` → `POST /api/auth/verify-2fa {challenge_id, code}` → `{token}`.
- **Para testing (preview):** el código se registra en los logs del backend: `grep "ADMIN 2FA code" /var/log/supervisor/backend.*.log | tail -1`
- Toggle: `POST /api/admin/security/2fa` (o switch en /admin/action-center). Por defecto: DESACTIVADO (petición del usuario, Sep 2 2026). Login admin directo con token.
- Los usuarios normales NO usan 2FA (login directo con token).


## Google Sign-In (Emergent-managed OAuth) — añadido Iteration 112
- Sin contraseñas gestionadas por la app. Cualquier cuenta Google puede entrar; se vincula por email a un usuario existente (mantiene su rol) o crea un usuario nuevo con rol `user`.
- Admin/superadmin con Google: si el 2FA de admin está activo, se pide el código por email igual que en el login normal.
- Prueba sin Google: visitar `/dashboard#session_id=fake` → tarjeta de error "Sesión de Google inválida o caducada".
