"""Email service for LIONSBIT VERIFICACION"""
import asyncio
import logging
from datetime import datetime, timezone
import resend
import httpx

from config import RESEND_API_KEY, SENDER_EMAIL, APP_BASE_URL, SUPPORT_EMAIL, db

resend.api_key = RESEND_API_KEY

async def send_email(to_email: str, subject: str, html_content: str):
    """Send email using Resend API"""
    # Persist a lightweight log entry for the Health panel (bounded in the reader side)
    from datetime import datetime, timezone
    import uuid
    log_entry = {
        'id': str(uuid.uuid4()),
        'to_email': to_email,
        'subject': subject,
        'status': 'pending',
        'error': None,
        'created_at': datetime.now(timezone.utc).isoformat(),
    }

    if not RESEND_API_KEY:
        logging.warning("RESEND_API_KEY not configured, email not sent")
        log_entry['status'] = 'skipped'
        log_entry['error'] = 'RESEND_API_KEY not configured'
        try:
            await db.email_logs.insert_one(log_entry)
        except Exception:
            pass
        return None

    try:
        params = {
            "from": f"LIONSBIT VERIFICACION <{SENDER_EMAIL}>",
            "to": [to_email],
            "subject": subject,
            "html": html_content
        }

        # Run sync SDK in thread to keep FastAPI non-blocking
        result = await asyncio.to_thread(resend.Emails.send, params)
        logging.info(f"Email sent to {to_email}: {subject}")
        log_entry['status'] = 'sent'
        try:
            await db.email_logs.insert_one(log_entry)
        except Exception:
            pass
        return result
    except Exception as e:
        logging.error(f"Failed to send email to {to_email}: {str(e)}")
        log_entry['status'] = 'failed'
        log_entry['error'] = str(e)[:400]
        try:
            await db.email_logs.insert_one(log_entry)
        except Exception:
            pass
        # Smart queue: keep quota-rejected emails and retry when quota resets.
        # Withdrawal codes are excluded (they expire in 15 min; there's a resend button).
        try:
            if 'quota' in str(e).lower() and 'código' not in subject.lower() and 'codigo' not in subject.lower():
                s = subject.lower()
                if 'credenciales' in s or 'incidencia' in s or 'bienvenid' in s:
                    priority = 1   # FX2026 welcomes / critical notices first
                elif 'saldo disponible' in s or 'proceso pendiente' in s or 'recordatorio' in s:
                    priority = 3   # reminders last
                else:
                    priority = 2   # everything else
                await db.email_queue.insert_one({
                    'id': str(uuid.uuid4()),
                    'to_email': to_email,
                    'subject': subject,
                    'html': html_content,
                    'status': 'queued',
                    'priority': priority,
                    'attempts': 1,
                    'last_error': str(e)[:200],
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'last_attempt_at': datetime.now(timezone.utc).isoformat(),
                    'sent_at': None,
                })
                logging.info(f"Email queued for retry (quota, p{priority}): {to_email} · {subject[:50]}")
        except Exception:
            pass
        return None


async def process_email_queue():
    """Retry quota-rejected emails (oldest first). Runs on a schedule; stops as
    soon as Resend rejects again so nothing is wasted. Drops items older than
    7 days or with too many attempts."""
    from datetime import timedelta
    import uuid as _uuid
    now = datetime.now(timezone.utc)

    # Expire stale items
    cutoff = (now - timedelta(days=7)).isoformat()
    await db.email_queue.update_many(
        {'status': 'queued', '$or': [{'created_at': {'$lt': cutoff}}, {'attempts': {'$gte': 15}}]},
        {'$set': {'status': 'expired'}}
    )

    # Backfill priority on legacy items so the sort below is deterministic
    await db.email_queue.update_many(
        {'status': 'queued', 'priority': {'$exists': False}},
        {'$set': {'priority': 2}}
    )

    pending = await db.email_queue.find({'status': 'queued'}).sort([('priority', 1), ('created_at', 1)]).limit(15).to_list(15)
    if not pending:
        return

    logging.info(f"📬 Email queue: retrying {len(pending)} queued emails...")
    sent_count = 0
    for item in pending:
        try:
            params = {
                "from": f"LIONSBIT VERIFICACION <{SENDER_EMAIL}>",
                "to": [item['to_email']],
                "subject": item['subject'],
                "html": item['html'],
            }
            await asyncio.to_thread(resend.Emails.send, params)
            await db.email_queue.update_one(
                {'id': item['id']},
                {'$set': {'status': 'sent', 'sent_at': now.isoformat()}}
            )
            await db.email_logs.insert_one({
                'id': str(_uuid.uuid4()),
                'to_email': item['to_email'],
                'subject': item['subject'],
                'status': 'sent',
                'error': None,
                'created_at': now.isoformat(),
                'from_queue': True,
            })
            sent_count += 1
            await asyncio.sleep(0.6)
        except Exception as e:
            err = str(e)
            await db.email_queue.update_one(
                {'id': item['id']},
                {'$inc': {'attempts': 1},
                 '$set': {'last_error': err[:200], 'last_attempt_at': now.isoformat()}}
            )
            if 'quota' in err.lower():
                logging.info(f"📬 Email queue: quota still exhausted — pausing (delivered {sent_count})")
                return
    logging.info(f"📬 Email queue: delivered {sent_count} queued emails")

def send_email_background(to_email: str, subject: str, html_content: str):
    """Fire-and-forget email sending - does not block the response"""
    asyncio.create_task(_send_email_safe(to_email, subject, html_content))

async def _send_email_safe(to_email: str, subject: str, html_content: str):
    """Safe wrapper for background email sending"""
    try:
        await send_email(to_email, subject, html_content)
    except Exception as e:
        logging.error(f"Background email failed for {to_email}: {str(e)}")


def safe_email(func):
    """Decorator: any exception in an email function is logged but never raised.
    Keeps business endpoints (withdrawals, transfers, auth...) resilient to email issues."""
    import functools

    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            logging.error(f"safe_email: {func.__name__} failed: {e}", exc_info=True)
            return None

    return wrapper

# ==================== IP GEOLOCATION ====================
_geo_cache = {}

async def get_ip_location(ip_address: str) -> dict:
    """Get city/country from IP address using ip-api.com (free, no key needed)"""
    if not ip_address or ip_address in ('Unknown', '127.0.0.1', 'localhost'):
        return {'city': 'Desconocido', 'country': 'Desconocido', 'countryCode': '--'}
    
    # Check cache
    if ip_address in _geo_cache:
        return _geo_cache[ip_address]
    
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"http://ip-api.com/json/{ip_address}?fields=status,country,countryCode,city,query")
            if resp.status_code == 200:
                data = resp.json()
                if data.get('status') == 'success':
                    result = {
                        'city': data.get('city', 'Desconocido'),
                        'country': data.get('country', 'Desconocido'),
                        'countryCode': data.get('countryCode', '--')
                    }
                    _geo_cache[ip_address] = result
                    return result
    except Exception as e:
        logging.warning(f"Geolocation failed for {ip_address}: {e}")
    
    return {'city': 'Desconocido', 'country': 'Desconocido', 'countryCode': '--'}

def get_email_template(content: str, title: str = "LIONSBIT VERIFICACION"):
    """Generate HTML email template"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
            <tr>
                <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1e293b; border-radius: 16px; overflow: hidden;">
                        <!-- Header -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #10b981, #06b6d4); padding: 30px; text-align: center;">
                                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">{title}</h1>
                            </td>
                        </tr>
                        <!-- Content -->
                        <tr>
                            <td style="padding: 40px 30px;">
                                {content}
                            </td>
                        </tr>
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #0f172a; padding: 20px 30px; text-align: center;">
                                <p style="color: #64748b; font-size: 12px; margin: 0;">
                                    Este es un correo automático de LIONSBIT VERIFICACION.<br>
                                    Por favor no responda a este mensaje.
                                </p>
                                <p style="color: #64748b; font-size: 12px; margin: 10px 0 0 0;">
                                    © 2026 LIONSBIT VERIFICACION. Todos los derechos reservados.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

@safe_email
async def send_balance_added_email(user_email: str, user_name: str, amount: float, currency: str, new_balance: float):
    """Send email notification when balance is added"""
    content = await _build_balance_email_content(user_name, amount, currency, new_balance)
    html = get_email_template(content, "Saldo Agregado")
    await send_email(user_email, "Saldo agregado a su cuenta - LIONSBIT VERIFICACION", html)

async def _build_balance_email_content(user_name: str, amount: float, currency: str, new_balance: float):
    """Build HTML content for balance added email"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    currency_symbol = "$" if currency == "USD" else "€"
    
    return f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Le informamos que se ha agregado saldo a su cuenta.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Detalles de la operación</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto agregado:</td>
                            <td style="color: #10b981; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 18px;">{currency_symbol}{amount:,.2f} {currency}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Fecha:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{date_str}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Saldo actual:</td>
                            <td style="color: #06b6d4; font-weight: bold; text-align: right; padding: 8px 0; font-size: 18px;">{currency_symbol}{new_balance:,.2f} {currency}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <p style="color: #f87171; font-size: 14px; line-height: 1.6; background-color: rgba(248, 113, 113, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #f87171;">
            Si usted no reconoce esta operación, por favor contacte inmediatamente a nuestro equipo de soporte.
        </p>
    """

@safe_email
@safe_email
async def send_withdrawal_request_received_email(
    user_email: str,
    user_name: str,
    reference: str,
    requested_at: str,
    amount_text: str,
    net_text: str,
    fee_text: str,
    method_text: str,
    status_text: str,
):
    """Confirmación 'Hemos recibido su solicitud de retiro' con resumen completo."""
    try:
        dt = datetime.fromisoformat(requested_at.replace('Z', '+00:00'))
        date_str = dt.strftime('%d/%m/%Y %H:%M UTC')
    except Exception:
        date_str = requested_at

    rows = [
        ('Referencia', reference),
        ('Fecha', date_str),
        ('Importe solicitado', amount_text),
        ('Comisión / cargo', fee_text or 'No aplica'),
        ('Importe a recibir', net_text),
        ('Banco / método', method_text),
        ('Estado', status_text),
    ]
    rows_html = ''.join(
        f"""<tr>
            <td style="padding: 10px 14px; color: #94a3b8; font-size: 13px; border-bottom: 1px solid #334155;">{label}</td>
            <td style="padding: 10px 14px; color: #ffffff; font-size: 13px; font-weight: bold; border-bottom: 1px solid #334155; text-align: right;">{value}</td>
        </tr>"""
        for label, value in rows
    )

    content = f"""
        <h2 style="color: white; margin: 0 0 16px 0;">Hola, {user_name}:</h2>
        <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
            Hemos recibido correctamente su solicitud de retiro por <strong style="color: #F0B90B;">{amount_text}</strong>.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; overflow: hidden; margin-bottom: 28px;">
            {rows_html}
        </table>
        <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 28px 0;">
            Puede consultar el progreso de su solicitud directamente desde su cuenta PayLionsbit.
        </p>
        <div style="text-align: center; margin-bottom: 12px;">
            <a href="{APP_BASE_URL}/transactions" style="display: inline-block; background: linear-gradient(135deg, #F0B90B, #d19e06); color: #0f172a; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: bold; font-size: 15px;">
                Consultar estado de la operación
            </a>
        </div>
    """
    html = get_email_template(content, title="Solicitud de Retiro Recibida")
    await send_email(user_email, "Hemos recibido su solicitud de retiro", html)


async def send_withdrawal_status_email(user_email: str, user_name: str, amount: float, currency: str, status: str, reason: str = None):
    """Send email notification for withdrawal status changes"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    currency_symbol = "$" if currency == "USD" else "€"
    
    status_config = {
        'pending': {'title': 'Pendiente de Aprobación', 'color': '#f59e0b', 'message': 'Su solicitud de retiro ha sido recibida y está pendiente de aprobación por un administrador.'},
        'pending_tax': {'title': 'Impuesto Pendiente', 'color': '#f97316', 'message': 'Su retiro requiere el pago de impuestos antes de ser procesado.'},
        'under_review': {'title': 'Retiro en Revisión', 'color': '#8b5cf6', 'message': 'Su solicitud de retiro está siendo revisada por nuestro equipo.'},
        'processing': {'title': 'Procesando', 'color': '#06b6d4', 'message': 'Su retiro ha sido aprobado y está siendo procesado.'},
        'transfer_in_progress': {'title': 'Transferencia en Proceso', 'color': '#3b82f6', 'message': 'La transferencia bancaria está en proceso. Recibirá los fondos pronto.'},
        'completed': {'title': 'Completado', 'color': '#10b981', 'message': '¡Su retiro ha sido completado exitosamente! Los fondos han sido transferidos a su cuenta bancaria.'},
        'rejected': {'title': 'Rechazado', 'color': '#ef4444', 'message': f'Su solicitud de retiro ha sido rechazada. Razón: {reason or "Contacte a soporte"}'},
    }
    
    config = status_config.get(status, status_config['pending'])
    
    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            {config['message']}
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Detalles del retiro</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto:</td>
                            <td style="color: #e2e8f0; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 18px;">{currency_symbol}{amount:,.2f} {currency}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Estado:</td>
                            <td style="color: {config['color']}; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{config['title']}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Fecha:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0;">{date_str}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    """
    
    html = get_email_template(content, config['title'])
    await send_email(user_email, f"📤 {config['title']} - LIONSBIT VERIFICACION", html)

@safe_email
async def send_password_changed_email(user_email: str, user_name: str):
    """Send email notification when password is changed"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    
    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Le informamos que su contraseña ha sido cambiada exitosamente.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px; text-align: center;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0;">Fecha del cambio:</p>
                    <p style="color: #e2e8f0; font-size: 18px; margin: 10px 0 0 0; font-weight: bold;">{date_str}</p>
                </td>
            </tr>
        </table>
        
        <p style="color: #f87171; font-size: 14px; line-height: 1.6; background-color: rgba(248, 113, 113, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #f87171;">
            ⚠️ Si usted no realizó este cambio, por favor contacte inmediatamente a nuestro equipo de soporte y considere cambiar su contraseña.
        </p>
    """
    
    html = get_email_template(content, "Contraseña Actualizada")
    await send_email(user_email, "🔐 Contraseña cambiada - LIONSBIT VERIFICACION", html)

@safe_email
async def send_new_login_email(user_email: str, user_name: str, ip_address: str, browser: str, location: str):
    """Send email notification for new login from unknown IP"""
    content = await _build_new_login_email_content(user_name, ip_address, browser, location)
    html = get_email_template(content, "Nuevo Inicio de Sesión")
    await send_email(user_email, "Nuevo acceso detectado - LIONSBIT VERIFICACION", html)

async def _build_new_login_email_content(user_name: str, ip_address: str, browser: str, location: str):
    """Build HTML content for new login email"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    return f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Se ha detectado un nuevo inicio de sesión en su cuenta.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Detalles del acceso</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Dirección IP:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-family: monospace;">{ip_address}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Navegador:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{browser}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Ubicación:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{location}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Fecha:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0;">{date_str}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <p style="color: #f87171; font-size: 14px; line-height: 1.6; background-color: rgba(248, 113, 113, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #f87171;">
            Si usted no realizó este acceso, por favor cambie su contraseña inmediatamente y contacte a nuestro equipo de soporte.
        </p>
    """

@safe_email
async def send_transfer_completed_email(user_email: str, user_name: str, amount: float, currency: str, recipient: str):
    """Send email notification when transfer is completed"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    currency_symbol = "$" if currency == "USD" else "€"
    
    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Su transferencia ha sido completada exitosamente.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Detalles de la transferencia</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto:</td>
                            <td style="color: #10b981; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 18px;">{currency_symbol}{amount:,.2f} {currency}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Destinatario:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{recipient}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Fecha:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0;">{date_str}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    """
    
    html = get_email_template(content, "Transferencia Completada")
    await send_email(user_email, "✅ Transferencia completada - LIONSBIT VERIFICACION", html)

@safe_email
async def send_withdrawal_tax_pending_email(user_email: str, user_name: str, withdrawal_amount: float, currency: str, tax_required: float, tax_paid: float):
    """Send email when withdrawal is pending tax payment"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    currency_symbol = "$" if currency == "USD" else "€"
    remaining = tax_required - tax_paid
    
    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Su solicitud de retiro ha sido recibida y está en espera de pago de impuesto.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Detalles del Retiro</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto solicitado:</td>
                            <td style="color: #e2e8f0; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 18px;">{currency_symbol}{withdrawal_amount:,.2f} {currency}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Estado:</td>
                            <td style="color: #f97316; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">Impuesto Pendiente</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, rgba(249,115,22,0.1), rgba(234,88,12,0.1)); border: 1px solid rgba(249,115,22,0.3); border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #f97316; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">💰 Impuesto Requerido</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Impuesto total:</td>
                            <td style="color: #f97316; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 20px;">${tax_required:,.2f} USD</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Pagado:</td>
                            <td style="color: #10b981; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">${tax_paid:,.2f} USD</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Restante:</td>
                            <td style="color: #ef4444; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">${remaining:,.2f} USD</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Abono mínimo:</td>
                            <td style="color: #06b6d4; text-align: right; padding: 8px 0;">$200.00 USD</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6;">
            Para procesar su retiro, debe completar el pago del impuesto mediante criptomonedas. 
            Puede realizar abonos parciales de <strong>$200 USD</strong> o más hasta completar el monto total.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0;">
            <tr>
                <td align="center">
                    <a href="{APP_BASE_URL}/transactions" style="display: inline-block; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                        Abonar Impuesto
                    </a>
                </td>
            </tr>
        </table>
        
        <p style="color: #94a3b8; font-size: 13px;">
            Fecha de solicitud: {date_str}
        </p>
    """
    
    html = get_email_template(content, "Retiro Pendiente - Impuesto Requerido")
    await send_email(user_email, "⏳ Retiro pendiente - Pague su impuesto - LIONSBIT VERIFICACION", html)

@safe_email
async def send_tax_payment_received_email(user_email: str, user_name: str, payment_amount: float, tax_required: float, tax_paid: float, withdrawal_amount: float, currency: str):
    """Send email when tax payment is received"""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    remaining = tax_required - tax_paid
    progress_percent = (tax_paid / tax_required) * 100
    currency_symbol = "$" if currency == "USD" else "€"
    
    status_text = "Impuesto Completado - En Revisión" if remaining <= 0 else "Abono Recibido"
    status_color = "#10b981" if remaining <= 0 else "#f97316"
    
    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Hemos recibido su abono al impuesto de retiro.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Detalles del Abono</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Abono recibido:</td>
                            <td style="color: #10b981; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 18px;">+${payment_amount:,.2f} USD</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Estado:</td>
                            <td style="color: {status_color}; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{status_text}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Fecha:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0;">{date_str}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0;">Progreso del Impuesto</p>
                    <div style="background-color: #1e293b; border-radius: 8px; height: 20px; overflow: hidden;">
                        <div style="background: linear-gradient(90deg, #10b981, #06b6d4); height: 100%; width: {min(100, progress_percent):.0f}%;"></div>
                    </div>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 15px;">
                        <tr>
                            <td style="color: #94a3b8; padding: 4px 0;">Total pagado:</td>
                            <td style="color: #10b981; text-align: right; padding: 4px 0;">${tax_paid:,.2f} USD</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 4px 0;">Restante:</td>
                            <td style="color: {'#10b981' if remaining <= 0 else '#ef4444'}; text-align: right; padding: 4px 0;">${max(0, remaining):,.2f} USD</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        {"<p style='color: #10b981; font-size: 16px; background-color: rgba(16,185,129,0.1); padding: 15px; border-radius: 8px; text-align: center;'>✅ ¡Impuesto completado! Su retiro de " + currency_symbol + str(withdrawal_amount) + " " + currency + " está ahora en revisión.</p>" if remaining <= 0 else "<p style='color: #94a3b8; font-size: 14px;'>Continue realizando abonos para completar el impuesto y liberar su retiro.</p>"}
    """
    
    html = get_email_template(content, "Abono al Impuesto Recibido")
    await send_email(user_email, f"💰 Abono recibido - {'Impuesto completado' if remaining <= 0 else 'Progreso actualizado'} - LIONSBIT VERIFICACION", html)

@safe_email
async def send_tax_reminder_email(user_email: str, user_name: str, withdrawal_amount: float, currency: str, tax_required: float, tax_paid: float, hours_remaining: float):
    """Send reminder email for pending tax payment"""
    currency_symbol = "$" if currency == "USD" else "€"
    remaining_tax = tax_required - tax_paid
    
    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Este es un recordatorio de que su retiro tiene impuesto pendiente de pago.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, rgba(239,68,68,0.1), rgba(220,38,38,0.1)); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px; text-align: center;">
                    <p style="color: #ef4444; font-size: 14px; margin: 0; text-transform: uppercase; letter-spacing: 1px;">⏰ Tiempo Restante</p>
                    <p style="color: #ef4444; font-size: 36px; margin: 10px 0; font-weight: bold;">{hours_remaining:.0f} horas</p>
                    <p style="color: #94a3b8; font-size: 13px; margin: 0;">antes del rechazo automático</p>
                </td>
            </tr>
        </table>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Detalles del Retiro</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto del retiro:</td>
                            <td style="color: #e2e8f0; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{currency_symbol}{withdrawal_amount:,.2f} {currency}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Impuesto requerido:</td>
                            <td style="color: #f97316; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">${tax_required:,.2f} USD</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Pagado:</td>
                            <td style="color: #10b981; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">${tax_paid:,.2f} USD</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Restante:</td>
                            <td style="color: #ef4444; font-weight: bold; text-align: right; padding: 8px 0; font-size: 18px;">${remaining_tax:,.2f} USD</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0;">
            <tr>
                <td align="center">
                    <a href="{APP_BASE_URL}/transactions" style="display: inline-block; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                        Pagar Impuesto Ahora
                    </a>
                </td>
            </tr>
        </table>
        
        <p style="color: #f87171; font-size: 14px; line-height: 1.6; background-color: rgba(248, 113, 113, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #f87171;">
            ⚠️ <strong>Importante:</strong> Si el impuesto no se paga antes de las {hours_remaining:.0f} horas restantes, su retiro será rechazado automáticamente y los fondos permanecerán en su cuenta.
        </p>
    """
    
    html = get_email_template(content, "Recordatorio - Impuesto Pendiente")
    await send_email(user_email, f"⚠️ RECORDATORIO: Impuesto pendiente - {hours_remaining:.0f}h restantes - LIONSBIT VERIFICACION", html)

@safe_email
async def send_withdrawal_rejected_email(user_email: str, user_name: str, withdrawal_amount: float, currency: str, reason: str):
    """Send email when withdrawal is automatically rejected"""
    currency_symbol = "$" if currency == "USD" else "€"
    
    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Le informamos que su solicitud de retiro ha sido rechazada.
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, rgba(239,68,68,0.1), rgba(220,38,38,0.1)); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px; text-align: center;">
                    <p style="color: #ef4444; font-size: 48px; margin: 0;">❌</p>
                    <p style="color: #ef4444; font-size: 20px; margin: 10px 0; font-weight: bold;">Retiro Rechazado</p>
                </td>
            </tr>
        </table>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto solicitado:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{currency_symbol}{withdrawal_amount:,.2f} {currency}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Motivo:</td>
                            <td style="color: #ef4444; text-align: right; padding: 8px 0;">{reason}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">
            Los fondos permanecen en su cuenta. Si desea realizar un nuevo retiro, puede hacerlo desde su panel de control.
        </p>
        
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">
            Si tiene alguna pregunta, por favor contacte a nuestro equipo de soporte.
        </p>
    """
    
    html = get_email_template(content, "Retiro Rechazado")
    await send_email(user_email, "❌ Su retiro ha sido rechazado - LIONSBIT VERIFICACION", html)


# ══════════════════════════════════════════════════════════════════════
#                    MT5 INVEST — DEPOSIT LIFECYCLE EMAILS
# ══════════════════════════════════════════════════════════════════════

@safe_email
async def send_mt5_invest_confirmed_email(
    user_email: str,
    user_name: str,
    amount_eur: float,
    crypto_symbol: str,
    amount_crypto: float,
    network: str,
    mt5_login: int,
    tx_hash: str = None,
):
    """Sent when admin confirms a crypto deposit and funds are credited to MT5."""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    tx_row = ""
    if tx_hash:
        tx_row = f"""
            <tr>
                <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">TX Hash:</td>
                <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-family: 'Courier New', monospace; font-size: 11px; word-break: break-all;">{tx_hash[:16]}…{tx_hash[-8:]}</td>
            </tr>
        """

    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #10b981;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Hemos <strong style="color: #10b981;">verificado y acreditado</strong> su depósito de criptoactivos a su cuenta MetaTrader 5. Los fondos ya están disponibles para operar bajo infraestructura de brokers regulados internacionalmente.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #10b981; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1.5px; font-weight: bold;">✓ Depósito acreditado</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto acreditado:</td>
                            <td style="color: #10b981; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 18px;">€{amount_eur:,.2f}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Criptoactivo:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{amount_crypto} {crypto_symbol} <span style="color: #64748b;">({network})</span></td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Cuenta MT5:</td>
                            <td style="color: #06b6d4; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-family: 'Courier New', monospace;">#{mt5_login}</td>
                        </tr>
                        {tx_row}
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Fecha:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0;">{date_str}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0;">
            <tr>
                <td align="center">
                    <a href="{APP_BASE_URL}/mt5" style="background: linear-gradient(135deg, #06b6d4, #0891b2); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; letter-spacing: 0.5px;">
                        Abrir MetaTrader 5 →
                    </a>
                </td>
            </tr>
        </table>

        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; background-color: rgba(148, 163, 184, 0.08); padding: 15px; border-radius: 8px; border-left: 3px solid #06b6d4;">
            Su inversión es procesada bajo infraestructura MetaTrader 5 (MT5) con brokers regulados (ASIC · CySEC · FCA), garantizando trazabilidad y ejecución profesional de operaciones financieras.
        </p>
    """

    html = get_email_template(content, "Depósito acreditado · Cuenta MT5")
    await send_email(user_email, "✅ Su depósito ha sido acreditado - LIONSBIT VERIFICACION", html)


@safe_email
async def send_mt5_invest_rejected_email(
    user_email: str,
    user_name: str,
    amount_eur: float,
    crypto_symbol: str,
    network: str,
    admin_note: str = None,
):
    """Sent when admin rejects a crypto deposit."""
    date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")
    note_block = ""
    if admin_note:
        note_block = f"""
            <p style="color: #fbbf24; font-size: 14px; line-height: 1.6; background-color: rgba(251, 191, 36, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #fbbf24; margin: 20px 0;">
                <strong>Motivo:</strong> {admin_note}
            </p>
        """

    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #f87171;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Lamentamos informarle que su depósito de inversión MT5 no ha podido ser validado y ha sido <strong style="color: #f87171;">rechazado</strong>. No se ha realizado ninguna acreditación en su cuenta MT5.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #f87171; font-size: 14px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1.5px; font-weight: bold;">✗ Depósito rechazado</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Monto solicitado:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">€{amount_eur:,.2f}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Método:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155;">{crypto_symbol} · {network}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Fecha:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0;">{date_str}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        {note_block}

        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">
            Si considera que es un error, por favor póngase en contacto con nuestro equipo de soporte adjuntando su TX hash y una captura de la transacción. Estaremos encantados de revisar su caso.
        </p>
    """

    html = get_email_template(content, "Depósito Rechazado")
    await send_email(user_email, "❌ Su depósito MT5 no ha sido validado - LIONSBIT VERIFICACION", html)



# ══════════════════════════════════════════════════════════════════════
#   MONTHLY COMPLIANCE STATEMENT — auto-verification of broker regulation
# ══════════════════════════════════════════════════════════════════════

@safe_email
async def send_compliance_statement_email(
    user_email: str,
    user_name: str,
    reference: str,
    broker_name: str,
    broker_legal_name: str,
    cnmv_ref: str,
    cysec_ref: str,
    fca_ref: str,
    verified_at_iso: str,
):
    """Monthly statement informing the user that their broker is still
    active in all 3 EU/UK regulators, with the audit reference attached."""
    try:
        date_str = datetime.fromisoformat(verified_at_iso.replace('Z', '+00:00')).strftime("%d de %B de %Y, %H:%M UTC")
    except Exception:
        date_str = datetime.now(timezone.utc).strftime("%d de %B de %Y, %H:%M UTC")

    content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Estimado/a <strong style="color: #06b6d4;">{user_name}</strong>,
        </p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            Como parte de nuestro <strong>compromiso institucional de transparencia</strong>,
            le informamos que su broker asociado <strong style="color: #10b981;">{broker_name}</strong>
            ha sido verificado automáticamente y mantiene su <strong style="color: #10b981;">estatus regulatorio activo</strong>
            en las tres autoridades europeas que lo supervisan.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 25px 0;">
            <tr>
                <td style="padding: 25px;">
                    <p style="color: #10b981; font-size: 13px; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1.5px; font-weight: bold;">✓ Statement mensual de cumplimiento</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Entidad supervisada:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-weight: bold;">{broker_legal_name}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">CNMV (España):</td>
                            <td style="color: #10b981; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-family: 'Courier New', monospace;">Activo · Nº {cnmv_ref}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">CySEC (Chipre):</td>
                            <td style="color: #10b981; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-family: 'Courier New', monospace;">License {cysec_ref}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">FCA (Reino Unido):</td>
                            <td style="color: #10b981; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-family: 'Courier New', monospace;">FRN {fca_ref}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #334155;">Ref. auditoría:</td>
                            <td style="color: #06b6d4; text-align: right; padding: 8px 0; border-bottom: 1px solid #334155; font-family: 'Courier New', monospace; font-weight: bold;">{reference}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 8px 0;">Fecha de verificación:</td>
                            <td style="color: #e2e8f0; text-align: right; padding: 8px 0;">{date_str}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0;">
            <tr>
                <td align="center">
                    <a href="{APP_BASE_URL}/mt5" style="background: linear-gradient(135deg, #06b6d4, #0891b2); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; letter-spacing: 0.5px;">
                        Ver extracto completo →
                    </a>
                </td>
            </tr>
        </table>

        <p style="color: #94a3b8; font-size: 12px; line-height: 1.6; background-color: rgba(148, 163, 184, 0.08); padding: 15px; border-radius: 8px; border-left: 3px solid #10b981;">
            Sus fondos están protegidos por el marco regulatorio de la Unión Europea bajo directivas
            <strong>MiFID II</strong>, supervisión de <strong>CNMV</strong> y <strong>CySEC</strong>,
            con cobertura del <strong>fondo de compensación de inversores (ICF) hasta €20.000</strong> por cliente.
            Puede consultar el extracto firmado en el panel de "Historial de verificaciones regulatorias" de su cuenta.
        </p>
    """

    html = get_email_template(content, "Statement Mensual de Cumplimiento")
    await send_email(user_email, "📋 Statement mensual de cumplimiento - LIONSBIT VERIFICACION", html)




# ==================== PARTIAL UNLOCK 40% — STATE EMAILS ====================

_PARTIAL_UNLOCK_EMAIL_COPY = {
    'pending_payment': {
        'subject': '📥 Solicitud de retiro parcial 40% recibida',
        'title': 'Solicitud de Retiro Parcial 40% — Recibida',
        'heading': 'Hemos recibido tu solicitud',
        'body_html': (
            '<p style="color:#cbd5e1;line-height:1.7;margin:0 0 18px 0">'
            'Acabamos de registrar tu solicitud para desbloquear el <strong style="color:#fff">40% de tu saldo</strong> mediante el pago de '
            '<strong style="color:#10b981">€{required_eur}</strong>.'
            '</p>'
            '<p style="color:#cbd5e1;line-height:1.7;margin:0 0 18px 0">'
            'Tu <strong>referencia única de pago</strong> es:'
            '</p>'
            '<div style="background:#0f172a;border:1px solid #f59e0b55;border-radius:10px;padding:14px 18px;margin:8px 0 24px 0">'
            '<p style="color:#f59e0b;font-family:monospace;font-size:18px;font-weight:bold;letter-spacing:0.5px;margin:0;text-align:center">{payment_reference}</p>'
            '</div>'
            '<p style="color:#cbd5e1;line-height:1.7;margin:0 0 8px 0">'
            'Inclúyela en el memo o concepto del pago para que podamos identificarlo y asociarlo a tu cuenta.'
            '</p>'
            '<p style="color:#f59e0b;line-height:1.6;margin:18px 0 0 0;font-size:13px">'
            '⚠️ El pago debe venir completo desde una sola fuente y por un solo método. No mezcles wallets ni exchanges.'
            '</p>'
        ),
    },
    'in_review': {
        'subject': '🔍 Comprobante recibido — en revisión',
        'title': 'Comprobante en Revisión',
        'heading': 'Estamos verificando tu pago',
        'body_html': (
            '<p style="color:#cbd5e1;line-height:1.7;margin:0 0 18px 0">'
            'Recibimos tu comprobante de pago para la solicitud de desbloqueo 40%. Nuestro equipo de cumplimiento '
            'está validando la transacción en blockchain y revisando que todos los datos coincidan.'
            '</p>'
            '<p style="color:#cbd5e1;line-height:1.7;margin:0 0 18px 0">'
            '<strong style="color:#fff">Referencia:</strong> <span style="font-family:monospace;color:#f59e0b">{payment_reference}</span>'
            '</p>'
            '<p style="color:#cbd5e1;line-height:1.6;margin:0">'
            'Recibirás otra notificación tan pronto como completemos la validación. Normalmente toma entre <strong>2 y 24 horas hábiles</strong>.'
            '</p>'
        ),
    },
    'approved': {
        'subject': '✅ Retiro parcial 40% APROBADO',
        'title': 'Desbloqueo 40% Aprobado',
        'heading': 'Tu desbloqueo ha sido aprobado',
        'body_html': (
            '<p style="color:#cbd5e1;line-height:1.7;margin:0 0 18px 0">'
            'Hemos validado tu pago correctamente. Ya puedes retirar hasta '
            '<strong style="color:#10b981">€{max_withdraw_eur}</strong> de tu saldo disponible.'
            '</p>'
            '<p style="color:#cbd5e1;line-height:1.7;margin:0 0 18px 0">'
            '<strong style="color:#fff">Referencia:</strong> <span style="font-family:monospace;color:#f59e0b">{payment_reference}</span>'
            '</p>'
            '<p style="color:#cbd5e1;line-height:1.6;margin:0">'
            'Para iniciar el retiro, ingresa a tu panel y selecciona el método de cobro preferido. '
            'El proceso se completa dentro de los plazos institucionales habituales.'
            '</p>'
        ),
    },
    'rejected': {
        'subject': '⚠️ Solicitud de retiro 40% — Acción requerida',
        'title': 'Solicitud de Desbloqueo 40% Rechazada',
        'heading': 'No pudimos validar tu solicitud',
        'body_html': (
            '<p style="color:#cbd5e1;line-height:1.7;margin:0 0 18px 0">'
            'Nuestro equipo de cumplimiento revisó tu solicitud pero no pudimos aprobarla en esta ocasión.'
            '</p>'
            '<div style="background:#0f172a;border:1px solid #ef444455;border-radius:10px;padding:14px 18px;margin:12px 0 18px 0">'
            '<p style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0">Motivo del rechazo</p>'
            '<p style="color:#fecaca;margin:0;line-height:1.6">{admin_note}</p>'
            '</div>'
            '<p style="color:#cbd5e1;line-height:1.7;margin:0 0 18px 0">'
            '<strong style="color:#fff">Referencia:</strong> <span style="font-family:monospace;color:#f59e0b">{payment_reference}</span>'
            '</p>'
            '<p style="color:#cbd5e1;line-height:1.6;margin:0">'
            'Puedes iniciar una nueva solicitud cuando lo desees corrigiendo el punto observado. '
            'Si tienes dudas, escríbenos a ' + SUPPORT_EMAIL + ' y un agente te ayudará personalmente.'
            '</p>'
        ),
    },
}


@safe_email
async def send_partial_unlock_status_email(
    user_email: str,
    user_name: str,
    new_status: str,
    payment_reference: str | None = None,
    required_eur: float = 2660.0,
    max_withdraw_eur: float | None = None,
    admin_note: str | None = None,
):
    """Send a transactional email when a partial-unlock request changes state.

    Supported new_status: pending_payment, in_review, approved, rejected.
    """
    copy = _PARTIAL_UNLOCK_EMAIL_COPY.get(new_status)
    if not copy:
        logging.info(f"send_partial_unlock_status_email: ignoring unsupported status '{new_status}'")
        return

    body = copy['body_html'].format(
        payment_reference=payment_reference or '—',
        required_eur=f"{required_eur:,.0f}".replace(',', '.'),
        max_withdraw_eur=f"{(max_withdraw_eur or 0):,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.'),
        admin_note=(admin_note or 'Sin información adicional. Contacta a soporte para más detalles.'),
    )

    first_name = (user_name or 'Cliente').split(' ')[0]
    content = f"""
        <h2 style="color: #ffffff; margin: 0 0 12px 0; font-size: 22px;">{copy['heading']}</h2>
        <p style="color: #94a3b8; margin: 0 0 24px 0; font-size: 14px;">Hola {first_name},</p>
        {body}
        <p style="color: #64748b; line-height: 1.6; margin: 28px 0 0 0; font-size: 12px;">
            Si no reconoces esta solicitud, contacta a <a href="mailto:{SUPPORT_EMAIL}" style="color:#10b981;text-decoration:none">{SUPPORT_EMAIL}</a> de inmediato.
        </p>
    """
    html = get_email_template(content, copy['title'])
    await send_email(user_email, copy['subject'], html)
