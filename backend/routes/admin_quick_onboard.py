"""Alta rápida de usuarios por admin: crea con contraseña temporal única y envía correo de acceso."""
import logging
import secrets
import string
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr

from config import db, APP_BASE_URL
from services.auth import get_admin_user, hash_password
from services.email import send_email_background, get_email_template
from services.notifications import create_notification

router = APIRouter()
log = logging.getLogger(__name__)
ALPHABET = string.ascii_uppercase + string.digits


def _temp_password() -> str:
    body = ''.join(secrets.choice(ALPHABET) for _ in range(6))
    return f"PLB-{body}"


class QuickUser(BaseModel):
    name: str
    email: EmailStr


class QuickOnboardIn(BaseModel):
    users: List[QuickUser]
    send_email: bool = True
    # existentes: 'notice' = aviso sin credenciales · 'reset_if_unchanged' = nueva temporal sólo si nunca la cambiaron · 'skip'
    existing_policy: str = 'reset_if_unchanged'


def _creds_html(name: str, email: str, temp: str, login_url: str) -> str:
    return f"""
    <div style="padding:28px 28px 8px;">
      <h1 style="color:#fff;font-size:22px;font-weight:700;margin:0 0 6px;">Bienvenido a LIONSBIT VERIFICACIÓN</h1>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 18px;">Hola {name}, hemos creado su acceso a la plataforma.</p>
      <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:18px 20px;margin:0 0 18px;">
        <p style="color:#7CB1E5;font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 8px;font-weight:700;">Credenciales de acceso</p>
        <p style="color:#e2e8f0;font-size:14px;margin:0 0 6px;">Usuario: <strong>{email}</strong></p>
        <p style="color:#e2e8f0;font-size:14px;margin:0;">Contraseña temporal: <strong style="font-family:monospace;font-size:16px;color:#34d399;">{temp}</strong></p>
      </div>
      <p style="color:#94a3b8;font-size:13px;margin:0 0 18px;">Por seguridad, deberá establecer una nueva contraseña en su primer inicio de sesión.</p>
      <a href="{login_url}" style="display:inline-block;background:#1973B8;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;font-size:14px;">Acceder a la plataforma</a>
    </div>"""


def _notice_html(name: str, login_url: str) -> str:
    return f"""
    <div style="padding:28px 28px 8px;">
      <h1 style="color:#fff;font-size:22px;font-weight:700;margin:0 0 6px;">Su acceso a LIONSBIT VERIFICACIÓN está activo</h1>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 18px;">Hola {name}, le recordamos que su cuenta está activa y puede acceder con su correo y su contraseña habitual.</p>
      <p style="color:#94a3b8;font-size:13px;margin:0 0 18px;">Si no recuerda su contraseña, utilice la opción <strong style="color:#e2e8f0;">"¿Olvidó su contraseña?"</strong> en la pantalla de acceso.</p>
      <a href="{login_url}" style="display:inline-block;background:#1973B8;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;font-size:14px;">Acceder a la plataforma</a>
    </div>"""


@router.post('/admin/users/quick-onboard')
async def quick_onboard(body: QuickOnboardIn, admin: dict = Depends(get_admin_user)):
    login_url = f"{APP_BASE_URL}/login"
    now = datetime.now(timezone.utc).isoformat()
    created, existing, errors = [], [], []
    for item in body.users:
        email = item.email.strip().lower()
        name = item.name.strip() or email.split('@')[0]
        try:
            user = await db.users.find_one({'email': {'$regex': f'^{email}$', '$options': 'i'}}, {'_id': 0, 'id': 1, 'name': 1, 'must_change_password': 1})
            if user:
                action = 'skipped'
                temp: Optional[str] = None
                if body.existing_policy == 'reset_if_unchanged' and user.get('must_change_password'):
                    temp = _temp_password()
                    await db.users.update_one({'id': user['id']}, {'$set': {'password': hash_password(temp), 'must_change_password': True, 'temp_password_issued_at': now, 'temp_password_issued_by': admin.get('email')}})
                    action = 'reset'
                    if body.send_email:
                        send_email_background(email, 'Sus credenciales de acceso · LIONSBIT', get_email_template(_creds_html(user.get('name') or name, email, temp, login_url), 'Credenciales de acceso'))
                elif body.existing_policy in ('notice', 'reset_if_unchanged'):
                    action = 'notified'
                    if body.send_email:
                        send_email_background(email, 'Su acceso a LIONSBIT está activo', get_email_template(_notice_html(user.get('name') or name, login_url), 'Acceso activo'))
                if action != 'skipped':
                    await create_notification(user['id'], 'Acceso a la plataforma', 'Le hemos enviado por correo la información de acceso a su cuenta.')
                existing.append({'email': email, 'name': user.get('name'), 'action': action, 'temp_password': temp})
                continue

            temp = _temp_password()
            user_id = str(uuid.uuid4())
            await db.users.insert_one({
                'id': user_id, 'name': name, 'email': email, 'phone': None, 'country': None,
                'password': hash_password(temp), 'role': 'user', 'verification_status': 'unverified',
                'account_status': 'active', 'kyc_documents': None, 'must_change_password': True,
                'created_by_admin': admin.get('email'), 'onboarding_source': 'admin_quick_onboard',
                'temp_password_issued_at': now, 'created_at': now,
            })
            from services.accounts_lifecycle import provision_full_user_finance
            await provision_full_user_finance(user_id)
            await create_notification(user_id, 'Bienvenido a LIONSBIT VERIFICACION!', 'Su cuenta ha sido creada. Complete la verificación KYC para desbloquear todas las funciones.')
            if body.send_email:
                send_email_background(email, 'Bienvenido a LIONSBIT · Sus credenciales de acceso', get_email_template(_creds_html(name, email, temp, login_url), 'Bienvenido'))
            created.append({'id': user_id, 'email': email, 'name': name, 'temp_password': temp})
        except Exception as e:
            log.exception('quick-onboard failed')
            errors.append({'email': email, 'reason': str(e)})
    await db.admin_audit_log.insert_one({'id': str(uuid.uuid4()), 'action': 'quick_onboard', 'admin_email': admin.get('email'),
                                         'created': [c['email'] for c in created], 'existing': [(e['email'], e['action']) for e in existing],
                                         'errors': errors, 'created_at': now})
    return {'created': created, 'existing': existing, 'errors': errors,
            'summary': {'created': len(created), 'existing': len(existing), 'errors': len(errors)}}
