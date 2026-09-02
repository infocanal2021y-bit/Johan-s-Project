"""Notification services: in-app notifications, admin alerts, and system activity logging."""
import uuid
import logging
from datetime import datetime, timezone
from config import db, RESEND_API_KEY, ADMIN_EMAIL, APP_BASE_URL


async def create_notification(user_id: str, title: str, message: str, metadata: dict = None):
    notification = {
        'id': str(uuid.uuid4()),
        'user_id': user_id,
        'title': title,
        'message': message,
        'metadata': metadata or None,
        'read': False,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification)
    return notification


async def notify_admins(title: str, message: str):
    admins = await db.users.find({'role': 'admin'}, {'_id': 0}).to_list(100)
    for admin in admins:
        await create_notification(admin['id'], title, message)


async def create_admin_notification(
    notification_type: str,
    title: str,
    message: str,
    user_info: dict = None,
    metadata: dict = None,
    send_email_notification: bool = True
):
    """Create a notification for all admins and optionally send email"""
    now = datetime.now(timezone.utc).isoformat()

    notification = {
        'id': str(uuid.uuid4()),
        'type': notification_type,
        'title': title,
        'message': message,
        'user_info': user_info,
        'metadata': metadata,
        'read': False,
        'created_at': now
    }

    await db.admin_notifications.insert_one(notification)

    admins = await db.users.find({'role': 'admin'}, {'_id': 0, 'id': 1, 'email': 1}).to_list(100)
    mirror_meta = {**(metadata or {}), 'type': notification_type}
    for admin in admins:
        await create_notification(admin['id'], title, message, metadata=mirror_meta)

    if send_email_notification and RESEND_API_KEY:
        await send_admin_alert_email(notification_type, title, message, user_info, metadata)

    return notification


async def send_admin_alert_email(notification_type: str, title: str, message: str, user_info: dict = None, metadata: dict = None):
    """Send alert email to admin"""
    from services.email import send_email, get_email_template

    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")

    type_icons = {
        'user_registered': '\U0001f464',
        'kyc_submitted': '\U0001f4cb',
        'withdrawal_request': '\U0001f4b8',
        'tax_payment': '\U0001f4b0',
        'support_ticket': '\U0001f3ab',
        'login': '\U0001f511',
        'balance_added': '\U0001f4b5'
    }
    icon = type_icons.get(notification_type, '\U0001f514')

    user_details = ""
    if user_info:
        user_details = f"""
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 15px;">
            <tr>
                <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Usuario:</td>
                <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-weight: bold;">{user_info.get('name', 'N/A')}</td>
            </tr>
            <tr>
                <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Email:</td>
                <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{user_info.get('email', 'N/A')}</td>
            </tr>
            <tr>
                <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">IP:</td>
                <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-family: monospace;">{user_info.get('ip', 'N/A')}</td>
            </tr>
            <tr>
                <td style="color: #94a3b8; padding: 8px 0;">País:</td>
                <td style="color: #e2e8f0; text-align: right; padding: 8px 0;">{user_info.get('country', 'N/A')}</td>
            </tr>
        </table>
        """

    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            <strong style="color: #10b981;">Administrador</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            {message}
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">{icon} {title}</p>
                    {user_details}
                    <p style="color: #64748b; font-size: 12px; margin-top: 15px; text-align: right;">
                        {date_str}
                    </p>
                </td>
            </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0;">
            <tr>
                <td align="center">
                    <a href="{APP_BASE_URL}/admin/activity" style="display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: white; text-decoration: none; padding: 14px 35px; border-radius: 8px; font-weight: bold;">
                        Ver Panel de Actividad
                    </a>
                </td>
            </tr>
        </table>
    """

    html = get_email_template(content, f"{icon} Alerta del Sistema")
    await send_email(ADMIN_EMAIL, f"{icon} {title} - LIONSBIT VERIFICACION Admin", html)


async def log_system_activity(
    activity_type: str,
    description: str,
    user_id: str = None,
    user_name: str = None,
    user_email: str = None,
    ip_address: str = None,
    country: str = None,
    metadata: dict = None
):
    """Log system activity for admin monitoring"""
    activity = {
        'id': str(uuid.uuid4()),
        'type': activity_type,
        'description': description,
        'user_id': user_id,
        'user_name': user_name,
        'user_email': user_email,
        'ip_address': ip_address,
        'country': country,
        'metadata': metadata,
        'created_at': datetime.now(timezone.utc).isoformat()
    }

    await db.system_activity.insert_one(activity)
    return activity
