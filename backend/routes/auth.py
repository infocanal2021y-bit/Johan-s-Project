"""Auth routes"""
from fastapi import APIRouter, HTTPException, Depends, status, Request
from datetime import datetime, timezone, timedelta
import uuid, logging, re
import bcrypt, jwt
from config import db, JWT_SECRET, JWT_EXPIRATION_HOURS, ADMIN_EMAIL, strip_id
from models import UserCreate, UserLogin, ChangePassword, PasswordResetRequest, PasswordResetConfirm
from services.auth import get_current_user, get_admin_user, create_token
from services.notifications import create_notification, notify_admins
from services.email import (
    send_email, send_email_background, get_email_template,
    send_password_changed_email, send_new_login_email, _build_new_login_email_content
)
from services.helpers import get_ip_location

router = APIRouter()

# ==================== AUTH ROUTES ====================

@router.post("/auth/register", response_model=dict)
async def register(user_data: UserCreate, request: Request):
    existing = await db.users.find_one({'email': user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail='Email already registered')
    
    # Capture registration info
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
        'role': 'user',
        'verification_status': 'unverified',
        'account_status': 'active',
        'kyc_documents': None,
        'registration_ip': client_ip,
        'registration_country': country,
        'created_at': now
    }
    await db.users.insert_one(user)
    
    for acc_type in ['checking', 'savings']:
        account = {
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'account_type': acc_type,
            'balance_usd': 0.0,
            'balance_eur': 0.0,
            'created_at': now
        }
        await db.accounts.insert_one(account)
    
    await create_notification(user_id, '¡Bienvenido a LIONSBIT VERIFICACION!', 
        'Su cuenta ha sido creada. Por favor complete la verificación KYC para desbloquear todas las funciones.')
    
    # Notify admin about new user registration
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
    
    # Log system activity
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
    
    # Handle both 'password' and 'hashed_password' fields for backwards compatibility
    stored_password = user.get('password') or user.get('hashed_password')
    if not stored_password or not verify_password(credentials.password, stored_password):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    
    # Capture login info
    client_ip = request.headers.get('X-Forwarded-For', request.client.host if request.client else 'Unknown')
    if ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    # Parse device info from user agent
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
    
    # Save login history with geolocation
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
    
    # Log system activity for login
    country = request.headers.get('CF-IPCountry', 'International')
    await log_system_activity(
        activity_type='login',
        description=f'Inicio de sesión: {user["name"]}',
        user_id=user['id'],
        user_name=user['name'],
        user_email=user['email'],
        ip_address=client_ip,
        country=country,
        metadata={'device': device_info, 'browser': browser_info}
    )
    
    # Check if this is a new IP and send email notification
    previous_logins = await db.login_history.find(
        {'user_id': user['id'], 'ip_address': client_ip}
    ).to_list(5)
    
    if len(previous_logins) <= 1:  # First time logging in from this IP
        send_email_background(
            user['email'],
            "Nuevo inicio de sesión detectado - LIONSBIT VERIFICACION",
            get_email_template(
                await _build_new_login_email_content(user['name'], client_ip, browser_info, location_str),
                "Nuevo Inicio de Sesión"
            )
        )
    
    # Notify admins about user login
    await create_admin_notification(
        notification_type='user_login',
        title='Inicio de Sesión',
        message=f'{user["name"]} ({user["email"]}) ha iniciado sesión desde {location_str}',
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
    
    # Mark user as online
    await db.users.update_one(
        {'id': user['id']},
        {'$set': {'last_active': datetime.now(timezone.utc).isoformat(), 'is_online': True}}
    )
    
    return {
        'token': token,
        'user': {
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'role': user['role'],
            'verification_status': user.get('verification_status', 'unverified'),
            'account_status': user.get('account_status', 'active')
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
        {'$set': {'password': new_hashed}}
    )
    
    await create_notification(
        current_user['id'],
        'Password Changed',
        'Your password has been successfully changed.'
    )
    
    # Send email notification
    await send_password_changed_email(user['email'], user['name'])
    
    return {'message': 'Password changed successfully'}

@router.post("/auth/request-password-reset")
async def request_password_reset(data: PasswordResetRequest):
    """Request password reset link - sends real email"""
    user = await db.users.find_one({'email': data.email}, {'_id': 0})
    
    if not user:
        # Don't reveal if email exists
        return {'message': 'If the email exists, a reset link has been sent'}
    
    # Generate reset token
    reset_token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    
    # Save reset request
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
    
    # Generate reset link - use dynamic domain from environment
    reset_link = f"{APP_BASE_URL}/reset-password?token={reset_token}"
    
    # Send email with reset link
    await send_password_reset_email(user['email'], user['name'], reset_link, reset_token)
    
    return {'message': 'If the email exists, a reset link has been sent'}

async def send_password_reset_email(user_email: str, user_name: str, reset_link: str, token: str):
    """Send password reset email"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    
    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Hemos recibido una solicitud para restablecer la contraseña de su cuenta.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
            <tr>
                <td align="center">
                    <a href="{reset_link}" style="display: inline-block; background: linear-gradient(135deg, #10b981, #06b6d4); color: white; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                        Restablecer Contraseña
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
                        ⏰ Este enlace expira en <strong>1 hora</strong>.
                    </p>
                    <p style="color: #94a3b8; font-size: 13px; margin: 10px 0 0 0;">
                        Fecha de solicitud: {date_str}
                    </p>
                </td>
            </tr>
        </table>
        
        <p style="color: #f87171; font-size: 14px; line-height: 1.6; background-color: rgba(248, 113, 113, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #f87171;">
            ⚠️ Si usted no solicitó restablecer su contraseña, puede ignorar este correo. Su contraseña no será cambiada.
        </p>
    """
    
    html = get_email_template(content, "Restablecer Contraseña")
    await send_email(user_email, "🔐 Restablecer contraseña - LIONSBIT VERIFICACION", html)

@router.post("/auth/reset-password")
async def reset_password(data: PasswordResetConfirm):
    """Reset password using token"""
    reset_request = await db.password_resets.find_one({
        'token': data.token,
        'used': False
    }, {'_id': 0})
    
    if not reset_request:
        raise HTTPException(status_code=400, detail='Invalid or expired reset token')
    
    # Check if expired
    expires_at = datetime.fromisoformat(reset_request['expires_at'].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail='Reset token has expired')
    
    # Update password
    new_hashed = hash_password(data.new_password)
    await db.users.update_one(
        {'id': reset_request['user_id']},
        {'$set': {'password': new_hashed}}
    )
    
    # Mark token as used
    await db.password_resets.update_one(
        {'token': data.token},
        {'$set': {'used': True}}
    )
    
    return {'message': 'Password has been reset successfully'}
