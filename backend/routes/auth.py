"""Auth routes: register, login, password management"""
from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime, timezone, timedelta
import uuid
import logging

from config import db, APP_BASE_URL
from models import UserCreate, UserLogin, ChangePassword, PasswordResetRequest, PasswordResetConfirm
from services.auth import (
    hash_password, verify_password, create_token, get_current_user
)
from services.notifications import create_notification, create_admin_notification, log_system_activity
from services.email import (
    send_email, send_email_background, get_email_template,
    send_password_changed_email, _build_new_login_email_content
)
from services.helpers import get_ip_location

router = APIRouter()


@router.post("/auth/register", response_model=dict)
async def register(user_data: UserCreate, request: Request):
    existing = await db.users.find_one({'email': user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail='Email already registered')

    client_ip = request.headers.get('X-Forwarded-For', request.client.host if request.client else 'Unknown')
    if ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    country = request.headers.get('CF-IPCountry', 'International')

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    user = {
        'id': user_id,
        'name': user_data.name,
        'email': user_data.email,
        'password': hash_password(user_data.password),
        'phone': user_data.phone,
        'country_code': user_data.country_code,
        'country_name': user_data.country_name,
        'investment_year': user_data.investment_year,
        'owner_deceased': user_data.owner_deceased,
        'relationship': user_data.relationship,
        'role': 'user',
        'verification_status': 'unverified',
        'account_status': 'active',
        'kyc_documents': None,
        'registration_ip': client_ip,
        'registration_country': country,
        'created_at': now
    }
    await db.users.insert_one(user)

    from services.accounts_lifecycle import provision_full_user_finance
    await provision_full_user_finance(user_id)

    await create_notification(user_id, 'Bienvenido a LIONSBIT VERIFICACION!',
        'Su cuenta ha sido creada. Por favor complete la verificacion KYC para desbloquear todas las funciones.')

    # Send detailed registration email to info@lionsbit.es
    deceased_info = ''
    if user_data.owner_deceased:
        deceased_info = f"""
            <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Titular fallecido:</td>
                <td style="color:#f87171;text-align:right;padding:8px 0;border-bottom:1px solid #334155;font-weight:bold;">Si</td></tr>
            <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Parentesco:</td>
                <td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;">{user_data.relationship or 'No especificado'}</td></tr>
        """
    reg_email_content = f"""
        <p style="color:#e2e8f0;font-size:16px;">Nuevo registro de usuario en la plataforma.</p>
        <table width="100%" style="background:#0f172a;border-radius:12px;margin:20px 0;">
            <tr><td style="padding:25px;">
                <p style="color:#1973B8;font-size:13px;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 15px;">Datos del Registro</p>
                <table width="100%">
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Nombre:</td>
                        <td style="color:#10b981;text-align:right;padding:8px 0;border-bottom:1px solid #334155;font-weight:bold;">{user_data.name}</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Email:</td>
                        <td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;">{user_data.email}</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Telefono:</td>
                        <td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;">{user_data.phone or 'No proporcionado'}</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Pais:</td>
                        <td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;">{user_data.country_name or 'No especificado'} ({user_data.country_code or '--'})</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Ano de inversion:</td>
                        <td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;">{user_data.investment_year or 'No especificado'}</td></tr>
                    {deceased_info}
                    <tr><td style="color:#94a3b8;padding:8px 0;">IP:</td>
                        <td style="color:#e2e8f0;text-align:right;padding:8px 0;font-family:monospace;">{client_ip}</td></tr>
                </table>
            </td></tr>
        </table>
    """
    send_email_background("info@lionsbit.es",
        f"Nuevo Registro - {user_data.name} ({user_data.email})",
        get_email_template(reg_email_content, "Nuevo Registro de Usuario"))

    await create_admin_notification(
        notification_type='user_registered',
        title='Nuevo Usuario Registrado',
        message=f'Se ha registrado un nuevo usuario: {user_data.name} ({user_data.email})',
        user_info={
            'name': user_data.name,
            'email': user_data.email,
            'ip': client_ip,
            'country': country
        }
    )

    await log_system_activity(
        activity_type='register',
        description=f'Nuevo usuario registrado: {user_data.name}',
        user_id=user_id,
        user_name=user_data.name,
        user_email=user_data.email,
        ip_address=client_ip,
        country=country
    )

    token = create_token(user_id, user_data.email, 'user')

    return {
        'token': token,
        'user': {
            'id': user_id,
            'name': user_data.name,
            'email': user_data.email,
            'role': 'user',
            'verification_status': 'unverified',
            'account_status': 'active'
        }
    }


@router.post("/auth/login", response_model=dict)
async def login(credentials: UserLogin, request: Request):
    user = await db.users.find_one({'email': credentials.email}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=401, detail='Invalid credentials')

    stored_password = user.get('password') or user.get('hashed_password')
    if not stored_password or not verify_password(credentials.password, stored_password):
        raise HTTPException(status_code=401, detail='Invalid credentials')

    client_ip = request.headers.get('X-Forwarded-For', request.client.host if request.client else 'Unknown')
    if ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()

    user_agent = request.headers.get('User-Agent', 'Unknown')

    device_info = 'Unknown Device'
    if 'Windows' in user_agent:
        device_info = 'Windows'
    elif 'Mac' in user_agent:
        device_info = 'macOS'
    elif 'Linux' in user_agent:
        device_info = 'Linux'
    elif 'Android' in user_agent:
        device_info = 'Android'
    elif 'iPhone' in user_agent or 'iPad' in user_agent:
        device_info = 'iOS'

    browser_info = 'Unknown Browser'
    if 'Chrome' in user_agent and 'Edg' not in user_agent:
        browser_info = 'Chrome'
    elif 'Firefox' in user_agent:
        browser_info = 'Firefox'
    elif 'Safari' in user_agent and 'Chrome' not in user_agent:
        browser_info = 'Safari'
    elif 'Edg' in user_agent:
        browser_info = 'Edge'

    geo = await get_ip_location(client_ip)
    location_str = f"{geo['city']}, {geo['country']}"

    login_record = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'user_name': user['name'],
        'user_email': user['email'],
        'ip_address': client_ip,
        'device': device_info,
        'browser': browser_info,
        'user_agent': user_agent,
        'location': location_str,
        'city': geo['city'],
        'country': geo['country'],
        'country_code': geo['countryCode'],
        'logged_in_at': datetime.now(timezone.utc).isoformat()
    }
    await db.login_history.insert_one(login_record)

    country = request.headers.get('CF-IPCountry', 'International')
    await log_system_activity(
        activity_type='login',
        description=f'Inicio de sesion: {user["name"]}',
        user_id=user['id'],
        user_name=user['name'],
        user_email=user['email'],
        ip_address=client_ip,
        country=country,
        metadata={'device': device_info, 'browser': browser_info}
    )

    previous_logins = await db.login_history.find(
        {'user_id': user['id'], 'ip_address': client_ip}
    ).to_list(5)

    if len(previous_logins) <= 1:
        send_email_background(
            user['email'],
            "Nuevo inicio de sesion detectado - LIONSBIT VERIFICACION",
            get_email_template(
                await _build_new_login_email_content(user['name'], client_ip, browser_info, location_str),
                "Nuevo Inicio de Sesion"
            )
        )

    await create_admin_notification(
        notification_type='user_login',
        title='Inicio de Sesion',
        message=f'{user["name"]} ({user["email"]}) ha iniciado sesion desde {location_str}',
        user_info={
            'name': user['name'],
            'email': user['email'],
            'ip': client_ip,
            'device': f"{browser_info} on {device_info}",
            'location': location_str
        },
        send_email_notification=False
    )

    token = create_token(user['id'], user['email'], user['role'])

    now_iso = datetime.now(timezone.utc).isoformat()
    update_fields: dict = {'last_active': now_iso, 'is_online': True}
    # Record first login for imported/reactivated users (engagement tracking)
    if not user.get('first_login_at'):
        update_fields['first_login_at'] = now_iso
    await db.users.update_one(
        {'id': user['id']},
        {'$set': update_fields}
    )

    return {
        'token': token,
        'must_change_password': bool(user.get('must_change_password')),
        'user': {
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'role': user['role'],
            'verification_status': user.get('verification_status', 'unverified'),
            'account_status': user.get('account_status', 'active'),
            'must_change_password': bool(user.get('must_change_password')),
            'is_reactivated': bool(user.get('is_reactivated'))
        },
        'login_info': {
            'ip': client_ip,
            'device': f"{browser_info} on {device_info}",
            'location': location_str,
            'time': login_record['logged_in_at']
        }
    }


@router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        'id': current_user['id'],
        'name': current_user['name'],
        'email': current_user['email'],
        'role': current_user['role'],
        'verification_status': current_user.get('verification_status', 'unverified'),
        'account_status': current_user.get('account_status', 'active'),
        'must_change_password': bool(current_user.get('must_change_password')),
        'is_reactivated': bool(current_user.get('is_reactivated')),
        'created_at': current_user['created_at']
    }


@router.get("/auth/login-history")
async def get_login_history(current_user: dict = Depends(get_current_user)):
    """Get last 5 login sessions for the current user"""
    history = await db.login_history.find(
        {'user_id': current_user['id']},
        {'_id': 0}
    ).sort('logged_in_at', -1).limit(5).to_list(5)
    return history


@router.post("/auth/change-password")
async def change_password(data: ChangePassword, current_user: dict = Depends(get_current_user)):
    """Change password for logged in user"""
    user = await db.users.find_one({'id': current_user['id']}, {'_id': 0})

    if not verify_password(data.current_password, user['password']):
        raise HTTPException(status_code=400, detail='Current password is incorrect')

    new_hashed = hash_password(data.new_password)
    await db.users.update_one(
        {'id': current_user['id']},
        {'$set': {
            'password': new_hashed,
            'must_change_password': False,
            'password_changed_at': datetime.now(timezone.utc).isoformat(),
        }}
    )

    await create_notification(
        current_user['id'],
        'Password Changed',
        'Your password has been successfully changed.'
    )

    await send_password_changed_email(user['email'], user['name'])

    return {'message': 'Password changed successfully'}


@router.post("/auth/request-password-reset")
async def request_password_reset(data: PasswordResetRequest):
    """Request password reset link - sends real email"""
    user = await db.users.find_one({'email': data.email}, {'_id': 0})

    if not user:
        return {'message': 'If the email exists, a reset link has been sent'}

    reset_token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

    reset_request = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'email': data.email,
        'token': reset_token,
        'expires_at': expires_at.isoformat(),
        'used': False,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.password_resets.insert_one(reset_request)

    reset_link = f"{APP_BASE_URL}/reset-password?token={reset_token}"
    await _send_password_reset_email(user['email'], user['name'], reset_link, reset_token)

    return {'message': 'If the email exists, a reset link has been sent'}


async def _send_password_reset_email(user_email: str, user_name: str, reset_link: str, token: str):
    """Send password reset email"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")

    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Hemos recibido una solicitud para restablecer la contrasena de su cuenta.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
            <tr>
                <td align="center">
                    <a href="{reset_link}" style="display: inline-block; background: linear-gradient(135deg, #10b981, #06b6d4); color: white; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                        Restablecer Contrasena
                    </a>
                </td>
            </tr>
        </table>

        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">
            O copie y pegue este enlace en su navegador:
        </p>
        <p style="color: #06b6d4; font-size: 12px; word-break: break-all; background-color: #0f172a; padding: 12px; border-radius: 6px; font-family: monospace;">
            {reset_link}
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 20px;">
                    <p style="color: #f59e0b; font-size: 14px; margin: 0;">
                        Este enlace expira en <strong>1 hora</strong>.
                    </p>
                    <p style="color: #94a3b8; font-size: 13px; margin: 10px 0 0 0;">
                        Fecha de solicitud: {date_str}
                    </p>
                </td>
            </tr>
        </table>

        <p style="color: #f87171; font-size: 14px; line-height: 1.6; background-color: rgba(248, 113, 113, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #f87171;">
            Si usted no solicito restablecer su contrasena, puede ignorar este correo. Su contrasena no sera cambiada.
        </p>
    """

    html = get_email_template(content, "Restablecer Contrasena")
    await send_email(user_email, "Restablecer contrasena - LIONSBIT VERIFICACION", html)


@router.post("/auth/reset-password")
async def reset_password(data: PasswordResetConfirm):
    """Reset password using token"""
    reset_request = await db.password_resets.find_one({
        'token': data.token,
        'used': False
    }, {'_id': 0})

    if not reset_request:
        raise HTTPException(status_code=400, detail='Invalid or expired reset token')

    expires_at = datetime.fromisoformat(reset_request['expires_at'].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail='Reset token has expired')

    new_hashed = hash_password(data.new_password)
    await db.users.update_one(
        {'id': reset_request['user_id']},
        {'$set': {'password': new_hashed}}
    )

    await db.password_resets.update_one(
        {'token': data.token},
        {'$set': {'used': True}}
    )

    return {'message': 'Password has been reset successfully'}
