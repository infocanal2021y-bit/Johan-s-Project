"""Bloqueo temporal de retiros tras cambios sensibles (contraseña, email, wallet)."""
import asyncio
from datetime import datetime, timezone, timedelta
from config import db
from services.notifications import create_notification, notify_admins


async def _lock_hours() -> int:
    doc = await db.platform_settings.find_one({'id': 'btc_security'}, {'_id': 0})
    return int((doc or {}).get('lock_hours', 48))


async def apply_security_lock(user_id: str, reason: str) -> dict:
    hours = await _lock_hours()
    until = (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()
    await db.users.update_one(
        {'id': user_id},
        {'$set': {'withdrawal_lock_until': until, 'withdrawal_lock_reason': reason}})
    await create_notification(
        user_id, 'Bloqueo de seguridad activado',
        f'Por su seguridad, tras el {reason} los retiros quedan pausados durante {hours} horas. '
        f'Si no fue usted, contacte a soporte inmediatamente.',
        {'type': 'security_lock'})
    u = await db.users.find_one({'id': user_id}, {'_id': 0, 'name': 1, 'email': 1})
    await notify_admins('Bloqueo de seguridad activado',
                        f"{(u or {}).get('name')} ({(u or {}).get('email')}): "
                        f"retiros pausados {hours}h por {reason}.")
    _send_lock_email(u, reason, hours)
    return {'lock_until': until, 'hours': hours, 'reason': reason}


def _send_lock_email(u: dict, reason: str, hours: int):
    from services.email import send_email, get_email_template
    if not u or not u.get('email'):
        return
    content = f"""
        <p style="color:#e2e8f0;font-size:16px;">Hola <strong style="color:#f59e0b;">{u.get('name') or ''}</strong>,</p>
        <p style="color:#e2e8f0;font-size:15px;line-height:1.6;">
            Hemos detectado un <strong>{reason}</strong> en su cuenta. Como medida de seguridad,
            los retiros quedan <strong style="color:#f59e0b;">pausados durante {hours} horas</strong>.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;border-radius:12px;margin:20px 0;">
            <tr><td style="padding:22px;">
                <p style="color:#f59e0b;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin:0 0 10px 0;font-weight:bold;">🔒 Bloqueo temporal de retiros</p>
                <p style="color:#e2e8f0;font-size:14px;margin:0;">Motivo: {reason}<br/>Duración: {hours} horas</p>
            </td></tr>
        </table>
        <p style="color:#94a3b8;font-size:13px;line-height:1.6;">
            Si usted no realizó este cambio, contacte inmediatamente a nuestro equipo de soporte.
            Podrá solicitar una verificación adicional para levantar el bloqueo antes de tiempo.
        </p>
    """
    html = get_email_template(content, 'Bloqueo de seguridad')
    asyncio.create_task(send_email(u['email'], '🔒 Bloqueo temporal de retiros por seguridad · LIONSBIT', html))


async def get_security_lock(user_id: str) -> dict:
    u = await db.users.find_one(
        {'id': user_id},
        {'_id': 0, 'withdrawal_lock_until': 1, 'withdrawal_lock_reason': 1,
         'btc_withdrawal_lock_until': 1}) or {}
    candidates = []
    if u.get('withdrawal_lock_until'):
        candidates.append((u['withdrawal_lock_until'],
                           u.get('withdrawal_lock_reason') or 'cambio de seguridad reciente'))
    if u.get('btc_withdrawal_lock_until'):
        candidates.append((u['btc_withdrawal_lock_until'], 'registro de nueva wallet BTC'))
    if not candidates:
        return {'locked': False}
    until, reason = max(candidates, key=lambda c: c[0])
    now = datetime.now(timezone.utc)
    try:
        dt = datetime.fromisoformat(until)
    except (ValueError, TypeError):
        return {'locked': False}
    if dt <= now:
        return {'locked': False}
    return {'locked': True, 'lock_until': until, 'reason': reason,
            'remaining_seconds': int((dt - now).total_seconds())}
