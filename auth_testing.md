# Auth-Gated App Testing Playbook (Emergent Google Auth)

This app issues its own JWT after exchanging the Emergent `session_id`. Flow:
1. Login/Register page → "Continuar con Google" → `https://auth.emergentagent.com/?redirect={origin}/dashboard`
2. Returns to `{origin}/dashboard#session_id=...` → `AppShell` renders `AuthCallback` (reads `useLocation().hash`)
3. `POST /api/auth/google/session {session_id}` → backend calls Emergent `/auth/v1/env/oauth/session-data` (X-Session-ID) → finds/creates user by email → stores `user_sessions` + httpOnly cookie → returns the same `{token, user}` as `/api/auth/login` (or `requires_2fa` for admins with 2FA).
4. Frontend stores `token` in localStorage (existing JWT flow) and navigates to `/dashboard`.

## Test without a real Google account
Emergent session-data cannot be mocked from outside; test the exchange with a fake `session_id` → expect 401 "Sesión de Google inválida o caducada".
Test the callback UI by visiting `/dashboard#session_id=fake` → AuthCallback shows the error card with "Volver al inicio de sesión".
Existing JWT login continues to work: `POST /api/auth/login`.

## Test with an existing JWT (auth-gated pages)
curl -X POST "$API/api/auth/login" -H "Content-Type: application/json" -d '{"email":"manclic@yahoo.es","password":"FX2026"}'
curl "$API/api/auth/me" -H "Authorization: Bearer <token>"

## Cleanup
db.user_sessions.deleteMany({provider:'google', session_token:/test_session/})
