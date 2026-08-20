"""FX2026 batch: admin endpoints to import bundled users and send the welcome
email (credentials + app link) on whatever environment the code runs on
(preview or production after redeploy). Fully idempotent."""
import asyncio
import json
import logging
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from config import db, APP_BASE_URL
from services.auth import get_admin_user, hash_password
from services.accounts_lifecycle import provision_full_user_finance
from services.notifications import create_notification
from services.email import send_email, get_email_template

router = APIRouter()

DATA_PATH = '/app/backend/data/fx2026_users.json'
BATCH_TAG = 'fx2026_xlsx'
PASSWORD = 'FX2026'

_send_state = {'running': False, 'sent': 0, 'failed': 0, 'total': 0, 'started_at': None, 'finished_at': None}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _welcome_html(name: str, email: str) -> str:
    login_url = f"{APP_BASE_URL}/login"
    content = f"""
        <h2 style="color: #10b981; margin: 0 0 20px 0;">Bienvenido a LIONSBIT VERIFICACION</h2>
        <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">Estimado/a <strong style="color: white;">{name}</strong>,</p>
        <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">
            Su cuenta ha sido creada correctamente en nuestra plataforma de verificación y gestión financiera.
            A continuación encontrará sus credenciales de acceso:
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; margin: 25px 0;">
            <tr><td style="padding: 20px 25px;">
                <p style="color: #64748b; font-size: 12px; margin: 0; text-transform: uppercase; letter-spacing: 1px;">Usuario</p>
                <p style="color: white; font-size: 16px; margin: 5px 0 15px 0; font-family: monospace;">{email}</p>
                <p style="color: #64748b; font-size: 12px; margin: 0; text-transform: uppercase; letter-spacing: 1px;">Contrase&ntilde;a temporal</p>
                <p style="color: #06b6d4; font-size: 20px; margin: 5px 0 0 0; font-family: monospace; font-weight: bold;">FX2026</p>
            </td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 10px 0 25px 0;">
            <a href="{login_url}" style="display: inline-block; background: linear-gradient(135deg, #10b981, #06b6d4); color: white; text-decoration: none; padding: 14px 40px; border-radius: 10px; font-size: 16px; font-weight: bold;">
                Acceder a mi cuenta
            </a>
        </td></tr></table>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
            O copie este enlace en su navegador: <a href="{login_url}" style="color: #06b6d4;">{login_url}</a>
        </p>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
            Por su seguridad, le recomendamos cambiar la contrase&ntilde;a desde su perfil tras el primer inicio de sesi&oacute;n
            y completar la verificaci&oacute;n KYC para desbloquear todas las funciones.
        </p>
    """
    return get_email_template(content)


@router.post("/admin/fx2026/import")
async def fx2026_import(admin: dict = Depends(get_admin_user)):
    """Idempotent import of the bundled FX2026 users into THIS environment's DB."""
    with open(DATA_PATH) as f:
        rows = json.load(f)

    created, skipped = 0, 0
    now = _now()
    for r in rows:
        existing = await db.users.find_one(
            {'email': {'$regex': f'^{re.escape(r["email"])}$', '$options': 'i'}},
            {'_id': 0, 'id': 1}
        )
        if existing:
            skipped += 1
            continue
        user_id = str(uuid.uuid4())
        await db.users.insert_one({
            'id': user_id,
            'name': r['name'],
            'email': r['email'],
            'password': hash_password(PASSWORD),
            'phone': r.get('phone'),
            'country_code': 'ES',
            'country_name': 'España',
            'investment_year': None,
            'owner_deceased': False,
            'relationship': None,
            'role': 'user',
            'verification_status': 'unverified',
            'account_status': 'active',
            'kyc_documents': None,
            'registration_ip': 'bulk-import',
            'registration_country': 'España',
            'import_source': BATCH_TAG,
            'created_at': now,
        })
        await provision_full_user_finance(user_id)
        await create_notification(
            user_id,
            'Bienvenido a LIONSBIT VERIFICACION!',
            'Su cuenta ha sido creada. Por favor complete la verificacion KYC para desbloquear todas las funciones.'
        )
        created += 1

    total = await db.users.count_documents({'import_source': BATCH_TAG})
    return {'created': created, 'skipped_existing': skipped, 'batch_total_in_db': total}


async def _send_welcome_batch(users):
    _send_state.update({'running': True, 'sent': 0, 'failed': 0, 'total': len(users), 'started_at': _now(), 'finished_at': None})
    for u in users:
        try:
            result = await send_email(u['email'], 'Sus credenciales de acceso — LIONSBIT VERIFICACION', _welcome_html(u['name'], u['email']))
            if result is not None:
                await db.users.update_one({'id': u['id']}, {'$set': {'fx2026_welcome_sent_at': _now()}})
                _send_state['sent'] += 1
            else:
                _send_state['failed'] += 1
        except Exception as e:
            logging.error(f"fx2026 welcome failed for {u['email']}: {e}")
            _send_state['failed'] += 1
        await asyncio.sleep(0.6)  # Resend rate limit ~2 req/s
    _send_state['running'] = False
    _send_state['finished_at'] = _now()
    logging.info(f"fx2026 welcome batch done: {_send_state}")


@router.post("/admin/fx2026/send-welcome")
async def fx2026_send_welcome(data: dict = None, admin: dict = Depends(get_admin_user)):
    """Send the welcome email (FX2026 credentials + app link) to batch users.

    Body options:
      {"test_email": "x@y.com"}  -> send ONE test email only, no state changes.
      {}                          -> send to every batch user not yet welcomed (background).
    """
    data = data or {}
    test_email = (data.get('test_email') or '').strip()
    if test_email:
        result = await send_email(test_email, 'Sus credenciales de acceso — LIONSBIT VERIFICACION', _welcome_html('Usuario de Prueba', test_email))
        return {'test': True, 'to': test_email, 'sent': result is not None}

    if _send_state['running']:
        return {'started': False, 'reason': 'batch already running', 'progress': _send_state}

    pending = await db.users.find(
        {'import_source': BATCH_TAG, 'fx2026_welcome_sent_at': {'$exists': False}},
        {'_id': 0, 'id': 1, 'name': 1, 'email': 1}
    ).to_list(2000)
    if not pending:
        return {'started': False, 'reason': 'no pending users', 'progress': _send_state}

    asyncio.create_task(_send_welcome_batch(pending))
    return {'started': True, 'pending': len(pending), 'estimated_minutes': round(len(pending) * 0.7 / 60, 1)}


@router.get("/admin/fx2026/status")
async def fx2026_status(admin: dict = Depends(get_admin_user)):
    imported = await db.users.count_documents({'import_source': BATCH_TAG})
    welcomed = await db.users.count_documents({'import_source': BATCH_TAG, 'fx2026_welcome_sent_at': {'$exists': True}})
    return {
        'imported_in_this_db': imported,
        'welcome_sent': welcomed,
        'welcome_pending': imported - welcomed,
        'send_progress': _send_state,
    }
