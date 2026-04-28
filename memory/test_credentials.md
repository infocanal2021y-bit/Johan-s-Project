# LIONSBIT — Test Credentials

## Admin (full access)
- **Email:** `admi@paylionsbit.es`
- **Password:** `LionsBit2026!`
- Role: `admin`
- Account status: `active`
- Verification status: `verified`
- Accounts: 2 (checking 25.585 EUR + savings 49.900 EUR → total 75.485 EUR)
- `must_change_password`: `false`

## Client-Import temporary password
Imported legacy clients receive the temporary password `lionsbit2.0` via the reactivation email.
On first login they're redirected to `/force-password-change` and must set a new one.

## Notes
- Backend URL: `REACT_APP_BACKEND_URL` in `/app/frontend/.env`
- DB: MongoDB at `MONGO_URL`, DB name from `DB_NAME` in `/app/backend/.env`
