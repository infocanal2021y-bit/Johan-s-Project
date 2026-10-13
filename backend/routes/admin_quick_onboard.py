"""Alta rápida de usuarios por admin: crea con contraseña temporal única, enlace de activación y correo de acceso."""
import logging
import secrets
import string
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from config import db, APP_BASE_URL, ADMIN_EMAIL
from services.auth import get_admin_user, hash_password
from services.email import send_email, get_email_template
from services.notifications import create_notification, notify_admins

router = APIRouter()
log = logging.getLogger(__name__)
ALPHABET = string.ascii_uppercase + string.digits
ACTIVATION_DAYS = 7


def _temp_password() -> str:
    body = ''.join(secrets.choice(ALPHABET) for _ in range(6))
    return f"PLB-{body}"


class QuickUser(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None


class QuickOnboardIn(BaseModel):
    users: List[QuickUser]
    send_email: bool = True
    # existentes: 'notice' = aviso sin credenciales · 'reset_if_unchanged' = nueva temporal sólo si nunca la cambiaron
    # · 'activation_link' = enlace seguro de activación sin modificar su registro · 'skip'
    existing_policy: str = 'reset_if_unchanged'


async def _activation_token(user_id: str, email: str, admin_email: str) -> str:
    token = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await db.password_resets.insert_one({
        'id': str(uuid.uuid4()), 'user_id': user_id, 'email': email, 'token': token,
        'purpose': 'activation', 'issued_by': admin_email,
        'expires_at': (now + timedelta(days=ACTIVATION_DAYS)).isoformat(),
        'used': False, 'created_at': now.isoformat(),
    })
    return token


def _header_html() -> str:
    return f"""
      <div style="text-align:center;margin:0 0 18px;">
        <img src="{APP_BASE_URL}/lionsbit-logo.jpg" alt="LIONSBIT" width="72" height="72" style="border-radius:16px;display:inline-block;" />
        <p style="color:#7CB1E5;font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin:10px 0 0;font-weight:700;">Paylionsbit · Verificación</p>
      </div>"""


def _activation_block(activation_url: str) -> str:
    return f"""
      <div style="text-align:center;margin:0 0 18px;">
        <a href="{activation_url}" style="display:inline-block;background:#1973B8;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:10px;font-size:14px;">Activar mi cuenta</a>
        <p style="color:#64748b;font-size:11px;margin:10px 0 0;">Enlace individual y seguro · caduca en {ACTIVATION_DAYS} días</p>
      </div>
      <p style="color:#64748b;font-size:11px;word-break:break-all;background:#0f172a;padding:10px;border-radius:8px;font-family:monospace;margin:0 0 18px;">{activation_url}</p>"""


def _creds_html(name: str, email: str, temp: str, login_url: str, activation_url: str) -> str:
    return f"""
    <div style="padding:28px 28px 8px;">
      {_header_html()}
      <h1 style="color:#fff;font-size:22px;font-weight:700;margin:0 0 6px;">Bienvenido a LIONSBIT VERIFICACIÓN</h1>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 18px;">Hola {name}, hemos creado su acceso a la plataforma. Active su cuenta con el enlace seguro y establezca su contraseña personal.</p>
      {_activation_block(activation_url)}
      <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:18px 20px;margin:0 0 18px;">
        <p style="color:#7CB1E5;font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 8px;font-weight:700;">Credenciales temporales (alternativa)</p>
        <p style="color:#e2e8f0;font-size:14px;margin:0 0 6px;">Usuario: <strong>{email}</strong></p>
        <p style="color:#e2e8f0;font-size:14px;margin:0;">Contraseña temporal: <strong style="font-family:monospace;font-size:16px;color:#34d399;">{temp}</strong></p>
      </div>
      <p style="color:#94a3b8;font-size:13px;margin:0 0 18px;">Por seguridad, si accede con la contraseña temporal deberá establecer una nueva en su primer inicio de sesión.</p>
      <a href="{login_url}" style="color:#7CB1E5;font-size:13px;">Ir a la pantalla de acceso</a>
    </div>"""


def _activation_only_html(name: str, email: str, login_url: str, activation_url: str) -> str:
    return f"""
    <div style="padding:28px 28px 8px;">
      {_header_html()}
      <h1 style="color:#fff;font-size:22px;font-weight:700;margin:0 0 6px;">Active su cuenta en LIONSBIT VERIFICACIÓN</h1>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 18px;">Hola {name}, su cuenta (<strong style="color:#e2e8f0;">{email}</strong>) está lista. Pulse el enlace seguro para establecer su contraseña personal y acceder a la plataforma.</p>
      {_activation_block(activation_url)}
      <p style="color:#94a3b8;font-size:13px;margin:0 0 18px;">Si ya dispone de una contraseña, puede acceder directamente desde la pantalla de inicio de sesión.</p>
      <a href="{login_url}" style="color:#7CB1E5;font-size:13px;">Ir a la pantalla de acceso</a>
    </div>"""


def _notice_html(name: str, login_url: str) -> str:
    return f"""
    <div style="padding:28px 28px 8px;">
      {_header_html()}
      <h1 style="color:#fff;font-size:22px;font-weight:700;margin:0 0 6px;">Su acceso a LIONSBIT VERIFICACIÓN está activo</h1>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 18px;">Hola {name}, le recordamos que su cuenta está activa y puede acceder con su correo y su contraseña habitual.</p>
      <p style="color:#94a3b8;font-size:13px;margin:0 0 18px;">Si no recuerda su contraseña, utilice la opción <strong style="color:#e2e8f0;">"¿Olvidó su contraseña?"</strong> en la pantalla de acceso.</p>
      <a href="{login_url}" style="display:inline-block;background:#1973B8;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;font-size:14px;">Acceder a la plataforma</a>
    </div>"""


async def _deliver(enabled: bool, to_email: str, subject: str, html: str) -> dict:
    if not enabled:
        return {'status': 'not_sent'}
    try:
        result = await send_email(to_email, subject, html)
        if result is None:
            return {'status': 'skipped', 'error': 'servicio de correo no configurado'}
        rid = result.get('id') if isinstance(result, dict) else getattr(result, 'id', None)
        return {'status': 'sent', 'provider_id': rid}
    except Exception as e:
        return {'status': 'failed', 'error': str(e)[:300]}


def _admin_report_html(admin_name: str, created: list, existing: list, errors: list) -> str:
    def row(label, value, sub=''):
        return f"<tr><td style='padding:6px 10px;color:#94a3b8;font-size:12px;border-bottom:1px solid #1e293b;'>{label}</td><td style='padding:6px 10px;color:#e2e8f0;font-size:12px;border-bottom:1px solid #1e293b;'>{value}<br/><span style='color:#64748b;font-size:11px;'>{sub}</span></td></tr>"
    rows = ''.join(row('Creado', f"{c['name']} · {c['email']}", f"correo: {c['email_status']}") for c in created)
    rows += ''.join(row('Existente', f"{e.get('name') or ''} · {e['email']}", f"acción: {e['action']} · correo: {e['email_status']}") for e in existing)
    rows += ''.join(row('Error', e['email'], e['reason']) for e in errors)
    return f"""
    <div style="padding:28px 28px 8px;">
      {_header_html()}
      <h1 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 6px;">Informe de alta de usuarios</h1>
      <p style="color:#94a3b8;font-size:13px;margin:0 0 16px;">Ejecutado por {admin_name}. Creados: {len(created)} · Existentes: {len(existing)} · Errores: {len(errors)}.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:10px;">{rows}</table>
    </div>"""


@router.post('/admin/users/quick-onboard')
async def quick_onboard(body: QuickOnboardIn, admin: dict = Depends(get_admin_user)):
    login_url = f"{APP_BASE_URL}/login"
    now = datetime.now(timezone.utc).isoformat()
    admin_email = admin.get('email')
    created, existing, errors = [], [], []
    for item in body.users:
        email = item.email.strip().lower()
        name = item.name.strip() or email.split('@')[0]
        try:
            user = await db.users.find_one({'email': {'$regex': f'^{email}$', '$options': 'i'}}, {'_id': 0, 'id': 1, 'name': 1, 'must_change_password': 1})
            if user:
                action, temp, mail = 'skipped', None, {'status': 'not_sent'}
                uname = user.get('name') or name
                if body.existing_policy == 'activation_link':
                    token = await _activation_token(user['id'], email, admin_email)
                    activation_url = f"{APP_BASE_URL}/reset-password?token={token}"
                    action = 'activation_link'
                    mail = await _deliver(body.send_email, email, 'Active su cuenta · LIONSBIT VERIFICACIÓN', get_email_template(_activation_only_html(uname, email, login_url, activation_url), 'Activación de cuenta'))
                elif body.existing_policy == 'reset_if_unchanged' and user.get('must_change_password'):
                    temp = _temp_password()
                    await db.users.update_one({'id': user['id']}, {'$set': {'password': hash_password(temp), 'must_change_password': True, 'temp_password_issued_at': now, 'temp_password_issued_by': admin_email}})
                    token = await _activation_token(user['id'], email, admin_email)
                    action = 'reset'
                    mail = await _deliver(body.send_email, email, 'Sus credenciales de acceso · LIONSBIT', get_email_template(_creds_html(uname, email, temp, login_url, f"{APP_BASE_URL}/reset-password?token={token}"), 'Credenciales de acceso'))
                elif body.existing_policy in ('notice', 'reset_if_unchanged'):
                    action = 'notified'
                    mail = await _deliver(body.send_email, email, 'Su acceso a LIONSBIT está activo', get_email_template(_notice_html(uname, login_url), 'Acceso activo'))
                if action != 'skipped':
                    await create_notification(user['id'], 'Acceso a la plataforma', 'Le hemos enviado por correo la información de acceso a su cuenta.')
                existing.append({'id': user['id'], 'email': email, 'name': user.get('name'), 'action': action, 'temp_password': temp,
                                 'must_change_password': bool(user.get('must_change_password')), 'email_status': mail['status'], 'email_error': mail.get('error')})
                continue

            temp = _temp_password()
            user_id = str(uuid.uuid4())
            await db.users.insert_one({
                'id': user_id, 'name': name, 'email': email, 'phone': (item.phone or '').strip() or None, 'country': None,
                'password': hash_password(temp), 'role': 'user', 'verification_status': 'unverified',
                'account_status': 'active', 'kyc_documents': None, 'must_change_password': True,
                'created_by_admin': admin_email, 'onboarding_source': 'admin_quick_onboard',
                'temp_password_issued_at': now, 'created_at': now,
            })
            from services.accounts_lifecycle import provision_full_user_finance
            await provision_full_user_finance(user_id)
            await create_notification(user_id, 'Bienvenido a LIONSBIT VERIFICACION!', 'Su cuenta ha sido creada. Complete la verificación KYC para desbloquear todas las funciones.')
            token = await _activation_token(user_id, email, admin_email)
            mail = await _deliver(body.send_email, email, 'Bienvenido a LIONSBIT · Active su cuenta', get_email_template(_creds_html(name, email, temp, login_url, f"{APP_BASE_URL}/reset-password?token={token}"), 'Bienvenido'))
            created.append({'id': user_id, 'email': email, 'name': name, 'temp_password': temp, 'email_status': mail['status'], 'email_error': mail.get('error')})
        except Exception as e:
            log.exception('quick-onboard failed')
            errors.append({'email': email, 'reason': str(e)})

    await db.admin_audit_log.insert_one({'id': str(uuid.uuid4()), 'action': 'quick_onboard', 'admin_email': admin_email,
                                         'created': [{k: c[k] for k in ('email', 'email_status')} for c in created],
                                         'existing': [{k: e[k] for k in ('email', 'action', 'email_status')} for e in existing],
                                         'errors': errors, 'created_at': now})
    summary_txt = f"Alta de usuarios: {len(created)} creados, {len(existing)} existentes, {len(errors)} errores."
    await notify_admins('Informe de alta de usuarios', summary_txt)
    admin_mail = {'status': 'not_sent'}
    if body.send_email and ADMIN_EMAIL:
        admin_mail = await _deliver(True, ADMIN_EMAIL, 'Informe de alta de usuarios · LIONSBIT', get_email_template(_admin_report_html(admin.get('name') or admin_email, created, existing, errors), 'Informe administrativo'))
    return {'created': created, 'existing': existing, 'errors': errors, 'admin_report_email': admin_mail,
            'summary': {'created': len(created), 'existing': len(existing), 'errors': len(errors)}}


def _token_state(tok: Optional[dict]) -> str:
    if not tok:
        return 'none'
    if tok.get('used'):
        return 'used'
    return 'expired' if tok['expires_at'] < datetime.now(timezone.utc).isoformat() else 'valid'


@router.get('/admin/users/invitations')
async def list_invitations(admin: dict = Depends(get_admin_user)):
    """Seguimiento de usuarios invitados: estado de activación, último token y último correo."""
    token_ids = await db.password_resets.distinct('user_id', {'purpose': 'activation'})
    users = await db.users.find(
        {'$or': [{'onboarding_source': 'admin_quick_onboard'}, {'id': {'$in': token_ids}}]},
        {'_id': 0, 'id': 1, 'name': 1, 'email': 1, 'phone': 1, 'created_at': 1, 'must_change_password': 1,
         'activated_at': 1, 'last_login': 1, 'created_by_admin': 1, 'temp_password_issued_at': 1},
    ).sort('created_at', -1).to_list(500)
    if not users:
        return {'count': 0, 'items': []}
    ids = [u['id'] for u in users]
    emails = [u['email'] for u in users]
    latest_tok = {}
    async for t in db.password_resets.find({'purpose': 'activation', 'user_id': {'$in': ids}}, {'_id': 0}).sort('created_at', -1):
        latest_tok.setdefault(t['user_id'], t)
    latest_mail = {}
    async for m in db.email_logs.find({'to_email': {'$in': emails}}, {'_id': 0, 'to_email': 1, 'subject': 1, 'status': 1, 'created_at': 1}).sort('created_at', -1):
        latest_mail.setdefault(m['to_email'], m)
    items = []
    for u in users:
        tok = latest_tok.get(u['id'])
        activated = bool(u.get('activated_at')) or (u.get('must_change_password') is False)
        items.append({
            'user_id': u['id'], 'name': u.get('name'), 'email': u['email'], 'phone': u.get('phone'),
            'created_at': u.get('created_at'), 'invited_by': u.get('created_by_admin') or (tok or {}).get('issued_by'),
            'invited_at': (tok or {}).get('created_at') or u.get('temp_password_issued_at') or u.get('created_at'),
            'activation': 'activated' if activated else ('expired' if _token_state(tok) == 'expired' else 'pending'),
            'activated_at': u.get('activated_at'), 'last_login': u.get('last_login'),
            'token_state': _token_state(tok), 'token_expires_at': (tok or {}).get('expires_at'),
            'last_email': latest_mail.get(u['email']),
        })
    return {'count': len(items), 'items': items}


@router.post('/admin/users/invitations/{user_id}/resend')
async def resend_invitation(user_id: str, admin: dict = Depends(get_admin_user)):
    """Genera un nuevo enlace de activación (7 días) y reenvía el correo. No modifica el registro del usuario."""
    user = await db.users.find_one({'id': user_id}, {'_id': 0, 'id': 1, 'name': 1, 'email': 1, 'activated_at': 1, 'must_change_password': 1})
    if not user:
        raise HTTPException(404, 'Usuario no encontrado')
    if user.get('activated_at') or user.get('must_change_password') is False:
        raise HTTPException(400, 'El usuario ya activó su cuenta')
    await db.password_resets.update_many({'user_id': user_id, 'purpose': 'activation', 'used': False}, {'$set': {'used': True, 'superseded': True}})
    token = await _activation_token(user_id, user['email'], admin.get('email'))
    login_url = f"{APP_BASE_URL}/login"
    mail = await _deliver(True, user['email'], 'Active su cuenta · LIONSBIT VERIFICACIÓN',
                          get_email_template(_activation_only_html(user.get('name') or user['email'], user['email'], login_url, f"{APP_BASE_URL}/reset-password?token={token}"), 'Activación de cuenta'))
    await db.admin_audit_log.insert_one({'id': str(uuid.uuid4()), 'action': 'resend_activation', 'admin_email': admin.get('email'),
                                         'user_id': user_id, 'email': user['email'], 'email_status': mail['status'],
                                         'created_at': datetime.now(timezone.utc).isoformat()})
    return {'ok': mail['status'] == 'sent', 'email': user['email'], 'email_status': mail['status'], 'email_error': mail.get('error')}
