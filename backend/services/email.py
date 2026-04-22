"""Email service for LIONSBIT VERIFICACION"""
import asyncio
import logging
from datetime import datetime, timezone
import resend
import httpx

from config import RESEND_API_KEY, SENDER_EMAIL, APP_BASE_URL, db

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
        return None

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
