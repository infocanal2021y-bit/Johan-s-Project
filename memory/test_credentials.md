# LIONSBIT — Test Credentials

## Admin (full access)
- **Email:** `admi@paylionsbit.es`
- **Password:** `LionsBit2026!`
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

## Notes
- Backend URL: `REACT_APP_BACKEND_URL` in `/app/frontend/.env`
- DB: MongoDB at `MONGO_URL`, DB name from `DB_NAME` in `/app/backend/.env`
- Login endpoint returns field `token` (not `access_token`).

## Admin 2FA (desde Sep 2, 2026)
- El login de admin (`admi@paylionsbit.es` / `LionsBit2026!`) ahora requiere 2FA por email (código de 6 dígitos).
- Flujo: `POST /api/auth/login` → `{requires_2fa, challenge_id}` → `POST /api/auth/verify-2fa {challenge_id, code}` → `{token}`.
- **Para testing (preview):** el código se registra en los logs del backend: `grep "ADMIN 2FA code" /var/log/supervisor/backend.*.log | tail -1`
- Toggle: `POST /api/admin/security/2fa {enabled: true/false}` (o el switch en /admin/action-center). Por defecto: ACTIVADO.
- Los usuarios normales NO usan 2FA (login directo con token).
