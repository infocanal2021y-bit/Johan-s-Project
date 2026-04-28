"""Onboarding email funnel for admin-created users.

3-step automated sequence:
  • Step 1 (immediate, called from admin manual-create endpoint):
        Welcome + temp password
  • Step 2 (24h later if `first_login_at` still null):
        "Your account hasn't been accessed yet"
  • Step 3 (72h later if logged in but `verification_status != 'verified'`):
        "Complete your KYC in 3 minutes"

All steps are idempotent — they record `onboarding_email_{1,2,3}_sent_at` on
the user doc and skip if already set. Steps 2 and 3 run from APScheduler
every hour (`run_onboarding_funnel_tick`).
"""
import os
import logging
from datetime import datetime, timezone, timedelta

from config import db
from services.email import send_email_background, get_email_template
from services.notifications import create_notification

APP_BASE_URL = os.environ.get('APP_BASE_URL', 'https://lionsbit.es')


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _email_step1_html(name: str, temp_password: str | None) -> str:
    pwd_block = ''
    if temp_password:
        pwd_block = f"""
            <div style="background:#0f172a;border:1px solid #06b6d4;border-radius:12px;padding:18px;margin:24px 0;">
                <p style="color:#22d3ee;font-size:11px;font-family:monospace;letter-spacing:2px;margin:0 0 8px;text-transform:uppercase;">Contrasena temporal</p>
                <p style="color:#a5f3fc;font-size:22px;font-family:monospace;font-weight:bold;letter-spacing:3px;margin:0;">{temp_password}</p>
                <p style="color:#94a3b8;font-size:12px;margin:10px 0 0;">Debera cambiarla obligatoriamente en su primer acceso.</p>
            </div>
        """
    return f"""
        <p style="color:#e2e8f0;font-size:16px;line-height:1.6;">
            Bienvenido/a a <strong style="color:#10b981;">LIONSBIT VERIFICACION</strong>, {name}.
        </p>
        <p style="color:#cbd5e1;font-size:14px;line-height:1.6;">
            Su cuenta ha sido creada por nuestro equipo y esta lista para usarse.
            Toda su estructura financiera (cuenta corriente, ahorro, wallet de cripto, KYC y historial inicial)
            ya fue provisionada automaticamente.
        </p>
        {pwd_block}
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:30px 0;">
            <tr><td align="center">
                <a href="{APP_BASE_URL}/login" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#10b981);color:white;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:bold;font-size:15px;">
                    Acceder a mi cuenta &rarr;
                </a>
            </td></tr>
        </table>
        <p style="color:#94a3b8;font-size:12px;line-height:1.6;">
            Si tiene alguna duda, responda a este correo y nuestro equipo le atendera.
        </p>
    """


def _email_step2_html(name: str) -> str:
    return f"""
        <p style="color:#e2e8f0;font-size:16px;line-height:1.6;">
            Estimado/a {name},
        </p>
        <p style="color:#cbd5e1;font-size:14px;line-height:1.6;">
            Notamos que aun no ha accedido a su cuenta de <strong style="color:#22d3ee;">LIONSBIT VERIFICACION</strong>.
            Su cuenta esta totalmente operativa y le esperamos.
        </p>
        <div style="background:#1e293b;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:8px;margin:20px 0;">
            <p style="color:#fbbf24;font-size:13px;margin:0;font-weight:bold;">Accion recomendada</p>
            <p style="color:#e2e8f0;font-size:13px;margin:6px 0 0;">Inicie sesion para completar su perfil y desbloquear todas las funciones.</p>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
            <tr><td align="center">
                <a href="{APP_BASE_URL}/login" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#10b981);color:white;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:bold;font-size:15px;">
                    Acceder ahora &rarr;
                </a>
            </td></tr>
        </table>
        <p style="color:#94a3b8;font-size:12px;line-height:1.6;">
            Si ya no esta interesado/a, ignore este mensaje y no recibira mas correos automaticos.
        </p>
    """


def _email_step3_html(name: str) -> str:
    return f"""
        <p style="color:#e2e8f0;font-size:16px;line-height:1.6;">
            Estimado/a {name},
        </p>
        <p style="color:#cbd5e1;font-size:14px;line-height:1.6;">
            Para activar la totalidad de su cuenta y poder operar retiros e inversiones,
            es necesario completar la <strong style="color:#22d3ee;">verificacion KYC</strong> &mdash;
            un proceso de 3 minutos exigido por la regulacion europea (MiFID II).
        </p>
        <div style="background:#0f172a;border:1px solid #10b981;border-radius:12px;padding:18px;margin:22px 0;">
            <p style="color:#22d3ee;font-size:11px;font-family:monospace;letter-spacing:2px;margin:0 0 10px;text-transform:uppercase;">Lo que necesita</p>
            <ul style="color:#e2e8f0;font-size:13px;margin:0;padding-left:20px;line-height:1.8;">
                <li>Documento de identidad (DNI / pasaporte)</li>
                <li>Una selfie sosteniendo el documento</li>
                <li>Justificante de domicilio reciente (opcional)</li>
            </ul>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
            <tr><td align="center">
                <a href="{APP_BASE_URL}/verification" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#10b981);color:white;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:bold;font-size:15px;">
                    Completar verificacion &rarr;
                </a>
            </td></tr>
        </table>
        <p style="color:#94a3b8;font-size:12px;line-height:1.6;">
            Hasta que su KYC sea aprobado, los retiros estaran limitados.
            Una vez verificado, su cuenta tendra acceso completo en menos de 24h.
        </p>
    """


async def send_onboarding_step1(user_id: str, temp_password: str | None = None) -> None:
    """Step 1 — sent immediately from /admin/users/manual-create.
    Idempotent: only sends if `onboarding_email_1_sent_at` is null."""
    user = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not user or user.get('onboarding_email_1_sent_at'):
        return
    name = user.get('name') or 'Cliente'
    email = user.get('email')
    if not email:
        return
    html = get_email_template(_email_step1_html(name, temp_password), 'Bienvenido a LIONSBIT VERIFICACION')
    send_email_background(email, 'Bienvenido a LIONSBIT VERIFICACION - Su cuenta esta lista', html)
    await create_notification(user_id, 'Bienvenido a LIONSBIT', 'Su cuenta ha sido creada y su estructura financiera esta lista. Inicie sesion para comenzar.')
    await db.users.update_one({'id': user_id}, {'$set': {'onboarding_email_1_sent_at': _now_iso()}})
    logging.info(f'[onboarding] step1 sent to {email}')


async def _process_step2() -> int:
    """Step 2 — for admin-created users >24h ago who never logged in."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    cursor = db.users.find({
        'created_by_admin': {'$exists': True, '$ne': None},
        'created_at': {'$lte': cutoff},
        'first_login_at': {'$in': [None, '', False]},
        'onboarding_email_2_sent_at': {'$in': [None, '']},
        # Don't re-engage suspended/rejected accounts
        'account_status': {'$nin': ['suspended', 'rejected', 'blocked']},
    }, {'_id': 0, 'id': 1, 'name': 1, 'email': 1})
    sent = 0
    async for user in cursor:
        try:
            email = user.get('email')
            if not email:
                continue
            name = user.get('name') or 'Cliente'
            html = get_email_template(_email_step2_html(name), 'Su cuenta sigue esperandole')
            send_email_background(email, 'Su cuenta LIONSBIT sigue esperandole', html)
            await create_notification(user['id'], 'Active su cuenta', 'Su cuenta esta lista, solo falta su primer acceso.')
            await db.users.update_one({'id': user['id']}, {'$set': {'onboarding_email_2_sent_at': _now_iso()}})
            sent += 1
        except Exception as e:
            logging.warning(f'[onboarding] step2 failed for {user.get("email")}: {e}')
    return sent


async def _process_step3() -> int:
    """Step 3 — for admin-created users who logged in >72h ago but not verified."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=72)).isoformat()
    cursor = db.users.find({
        'created_by_admin': {'$exists': True, '$ne': None},
        'first_login_at': {'$lte': cutoff},
        'verification_status': {'$ne': 'verified'},
        'onboarding_email_3_sent_at': {'$in': [None, '']},
        'account_status': {'$nin': ['suspended', 'rejected', 'blocked']},
    }, {'_id': 0, 'id': 1, 'name': 1, 'email': 1})
    sent = 0
    async for user in cursor:
        try:
            email = user.get('email')
            if not email:
                continue
            name = user.get('name') or 'Cliente'
            html = get_email_template(_email_step3_html(name), 'Complete su verificacion KYC')
            send_email_background(email, 'Complete su verificacion KYC en 3 minutos', html)
            await create_notification(user['id'], 'Complete su KYC', 'Verifique su identidad para desbloquear retiros e inversiones.')
            await db.users.update_one({'id': user['id']}, {'$set': {'onboarding_email_3_sent_at': _now_iso()}})
            sent += 1
        except Exception as e:
            logging.warning(f'[onboarding] step3 failed for {user.get("email")}: {e}')
    return sent


async def run_onboarding_funnel_tick() -> dict:
    """Scheduler entrypoint — runs hourly. Returns {step2, step3} counts.
    Idempotent: each user receives each step at most once."""
    logging.info('[onboarding] funnel tick start')
    step2 = await _process_step2()
    step3 = await _process_step3()
    logging.info(f'[onboarding] funnel tick done · step2={step2} step3={step3}')
    return {'step2_sent': step2, 'step3_sent': step3}
