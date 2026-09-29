"""Emergent-managed Google sign-in. Coexists with JWT email/password auth (issues the same app JWT)."""
import logging
import uuid
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from config import db
from services.notifications import create_notification, create_admin_notification
from routes.auth import _finalize_login, _start_admin_2fa, _admin_2fa_enabled

router = APIRouter()
log = logging.getLogger(__name__)

EMERGENT_SESSION_URL = 'https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data'
SESSION_DAYS = 7
COOKIE = 'session_token'


class GoogleSessionIn(BaseModel):
    session_id: str


def _set_cookie(response: Response, token: str):
    response.set_cookie(COOKIE, token, max_age=SESSION_DAYS * 86400, httponly=True, secure=True, samesite='none', path='/')


async def _fetch_session_data(session_id: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(EMERGENT_SESSION_URL, headers={'X-Session-ID': session_id})
    except httpx.HTTPError as e:
        log.error(f'google-auth: session-data request failed: {e}')
        raise HTTPException(503, 'No se pudo validar la sesión de Google. Inténtelo de nuevo.')
    if r.status_code != 200:
        raise HTTPException(401, 'Sesión de Google inválida o caducada')
    data = r.json()
    if not data.get('email'):
        raise HTTPException(401, 'Google no devolvió un email válido')
    return data


async def _get_or_create_user(data: dict, request: Request) -> tuple[dict, bool]:
    email = data['email'].strip().lower()
    user = await db.users.find_one({'email': {'$regex': f'^{email}$', '$options': 'i'}}, {'_id': 0})
    now = datetime.now(timezone.utc).isoformat()
    google_fields = {
        'google_id': data.get('id'),
        'picture': data.get('picture'),
        'google_linked_at': now,
    }
    if user:
        await db.users.update_one({'id': user['id']}, {
            '$set': google_fields,
            '$addToSet': {'auth_providers': 'google'},
        })
        user.update(google_fields)
        return user, False

    client_ip = request.headers.get('X-Forwarded-For', request.client.host if request.client else 'Unknown')
    if ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    user_id = str(uuid.uuid4())
    user = {
        'id': user_id,
        'name': data.get('name') or email.split('@')[0],
        'email': email,
        'password': None,
        'phone': None,
        'role': 'user',
        'verification_status': 'unverified',
        'account_status': 'active',
        'kyc_documents': None,
        'registration_ip': client_ip,
        'registration_country': request.headers.get('CF-IPCountry', 'International'),
        'auth_providers': ['google'],
        'created_at': now,
        **google_fields,
    }
    await db.users.insert_one(user)
    user.pop('_id', None)

    from services.accounts_lifecycle import provision_full_user_finance
    await provision_full_user_finance(user_id)
    await create_notification(user_id, 'Bienvenido a LIONSBIT VERIFICACION!',
        'Su cuenta ha sido creada con Google. Por favor complete la verificacion KYC para desbloquear todas las funciones.')
    await create_admin_notification(
        notification_type='new_registration',
        title='Nuevo registro (Google)',
        message=f"{user['name']} ({email}) se ha registrado con Google",
        user_info={'name': user['name'], 'email': email, 'ip': client_ip},
        send_email_notification=False,
    )
    return user, True


@router.post('/auth/google/session')
async def google_session(body: GoogleSessionIn, request: Request, response: Response):
    """Exchange the Emergent session_id (URL fragment) for the app JWT. Called ONLY from our frontend."""
    session_id = body.session_id.strip()
    if not session_id:
        raise HTTPException(400, 'session_id requerido')
    data = await _fetch_session_data(session_id)
    user, created = await _get_or_create_user(data, request)

    if user.get('account_status') in ('blocked', 'suspended', 'archived'):
        raise HTTPException(403, 'Cuenta bloqueada. Contacte con soporte.')

    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    session_token = data.get('session_token') or str(uuid.uuid4())
    await db.user_sessions.insert_one({
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'session_token': session_token,
        'provider': 'google',
        'expires_at': expires.isoformat(),
        'created_at': datetime.now(timezone.utc).isoformat(),
    })
    _set_cookie(response, session_token)

    if user.get('role') in ('admin', 'superadmin') and await _admin_2fa_enabled():
        result = await _start_admin_2fa(user)
        result['login_method'] = 'google'
        return result

    result = await _finalize_login(user, request)
    result['login_method'] = 'google'
    result['new_user'] = created
    return result


@router.post('/auth/google/logout')
async def google_logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE)
    if token:
        await db.user_sessions.delete_one({'session_token': token})
    response.delete_cookie(COOKIE, path='/', secure=True, samesite='none')
    return {'ok': True}
