"""Centralised admin notification for all proof uploads.

Every time a user uploads a proof file (bank transfer, tax payment, crypto
payment, mt5 deposit, partial unlock), we forward a copy to the admin inbox
with the original file attached so the team can review without logging in.
"""
import os
import asyncio
import logging
from datetime import datetime, timezone

import resend

from config import RESEND_API_KEY, SENDER_EMAIL, SUPPORT_EMAIL
from services.email import get_email_template

# Where every proof copy goes. Override via env if needed.
PROOF_ADMIN_INBOX = os.environ.get('PROOF_ADMIN_INBOX', SUPPORT_EMAIL)


def _build_proof_email_html(proof_type: str, user: dict, fields: dict, comment: str | None = None) -> str:
    """Render the standard 'New proof received' admin email body."""
    now_formatted = datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')

    rows_html = ''
    rows_html += f'<tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Cliente:</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;">{user.get("name", "—")}</td></tr>'
    rows_html += f'<tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Email:</td><td style="color:#10b981;text-align:right;padding:8px 0;border-bottom:1px solid #334155;">{user.get("email", "—")}</td></tr>'

    for key, val in (fields or {}).items():
        rows_html += f'<tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">{key}:</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;font-family:monospace;">{val}</td></tr>'

    rows_html += f'<tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Fecha:</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;">{now_formatted}</td></tr>'
    rows_html += f'<tr><td style="color:#94a3b8;padding:8px 0;">Comentario:</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;">{comment or "Sin comentario"}</td></tr>'

    body = f"""
        <p style="color:#e2e8f0;font-size:16px;">Se ha recibido un nuevo comprobante: <strong style="color:#10b981;">{proof_type}</strong>.</p>
        <table width="100%" style="background:#0f172a;border-radius:12px;margin:20px 0;">
            <tr><td style="padding:25px;">
                <p style="color:#10b981;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">Datos del Comprobante</p>
                <table width="100%">{rows_html}</table>
            </td></tr>
        </table>
        <p style="color:#94a3b8;font-size:13px;">El archivo adjunto está disponible en este correo para su revisión inmediata.</p>
    """
    return get_email_template(body, f"Nuevo comprobante: {proof_type}")


async def forward_proof_to_admin(
    *,
    proof_type: str,
    user: dict,
    proof_file_b64: str | None,
    proof_filename: str | None,
    fields: dict | None = None,
    comment: str | None = None,
    extra_recipients: list | None = None,
) -> bool:
    """Send a copy of the uploaded proof to PROOF_ADMIN_INBOX (info@paylionsbit.es).

    Safe to call even if proof_file_b64 is None — in that case the email is sent
    without attachment but still notifies the admin about the submission.

    Returns True on success, False on failure (never raises — silent log).
    """
    if not RESEND_API_KEY:
        logging.warning('[proof-forward] RESEND_API_KEY missing, skipping admin notification')
        return False

    try:
        html = _build_proof_email_html(proof_type, user, fields or {}, comment)

        recipients = [PROOF_ADMIN_INBOX]
        if extra_recipients:
            for r in extra_recipients:
                if r and r not in recipients:
                    recipients.append(r)

        params = {
            'from': f'LIONSBIT VERIFICACION <{SENDER_EMAIL}>',
            'to': recipients,
            'subject': f'Nuevo comprobante: {proof_type} ({user.get("email", "?")})',
            'html': html,
        }

        if proof_file_b64 and proof_filename:
            # Strip data URI prefix if present
            raw_b64 = proof_file_b64
            if ',' in raw_b64:
                raw_b64 = raw_b64.split(',', 1)[1]
            # Resend Python SDK expects raw bytes for `content`, NOT a base64 string.
            # Decode here so the attachment opens cleanly in every email client.
            import base64 as _b64
            try:
                file_bytes = _b64.b64decode(raw_b64, validate=False)
            except Exception:
                # If decoding fails, fall back to raw string (older SDK accepts it)
                file_bytes = raw_b64
            params['attachments'] = [{
                'filename': proof_filename,
                'content': list(file_bytes) if isinstance(file_bytes, (bytes, bytearray)) else file_bytes,
            }]

        await asyncio.to_thread(resend.Emails.send, params)
        logging.info(f'[proof-forward] sent {proof_type} from {user.get("email")} to {recipients}')
        return True
    except Exception as exc:
        logging.error(f'[proof-forward] failed for {proof_type}: {exc}')
        return False
