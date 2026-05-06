"""Daily reminder for users with an incomplete withdrawal journey.

Runs once per day. For every user whose `withdrawal_type` was set 24h+ ago,
who has NOT completed a withdrawal yet, AND who hasn't been emailed in the
last 48h, sends a friendly guidance email via Resend (no pressure language).

The function is idempotent — its `journey_email_last_sent_at` flag guarantees
a user receives at most one reminder every 48 hours.
"""
from datetime import datetime, timezone, timedelta
import logging

from config import db
from services.email import send_email_background

logger = logging.getLogger(__name__)

REMINDER_WINDOW_HOURS = 24       # Email only after 24h of inactivity
RESEND_COOLDOWN_HOURS = 48       # Don't re-email until 48h have passed


def _build_email_html(name: str, withdrawal_type: str, base_url: str) -> str:
    type_label = 'parcial (40%)' if withdrawal_type == 'partial' else 'total (100%)'
    cta = f"{base_url.rstrip('/')}/withdraw"
    return f"""
<!DOCTYPE html>
<html><body style="margin:0;padding:32px;background:#F4F6F8;font-family:Inter,Arial,sans-serif;color:#111827;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"
       style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:14px;
              box-shadow:0 4px 24px rgba(7,33,70,0.08);overflow:hidden;">
  <tr><td style="height:4px;background:#1E3A8A;"></td></tr>
  <tr><td style="padding:32px 32px 8px 32px;">
    <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#1E3A8A;">
      LIONSBIT · Asistente de Operación
    </p>
    <h1 style="margin:8px 0 0 0;font-size:22px;font-weight:600;color:#111827;line-height:1.3;">
      Tiene una solicitud de retiro en proceso
    </h1>
  </td></tr>
  <tr><td style="padding:16px 32px 8px 32px;">
    <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
      Hola {name},
    </p>
    <p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#374151;">
      Hace unas horas inició una solicitud de retiro {type_label} desde su panel,
      pero todavía quedan pasos por completar. Hemos pausado el proceso a la
      espera de su confirmación.
    </p>
    <p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#374151;">
      Cuando le venga bien, puede continuar desde donde lo dejó. No es necesario
      reiniciar nada — su selección y los datos ya introducidos se han guardado.
    </p>
  </td></tr>
  <tr><td style="padding:24px 32px 0 32px;text-align:center;">
    <a href="{cta}" style="display:inline-block;padding:12px 28px;background:#1E3A8A;color:#FFFFFF;
              font-size:13px;font-weight:600;text-decoration:none;border-radius:10px;
              letter-spacing:0.02em;">
      Continuar mi retiro →
    </a>
  </td></tr>
  <tr><td style="padding:24px 32px 32px 32px;">
    <p style="margin:0;font-size:11px;line-height:1.6;color:#6B7280;">
      Si ya completó el proceso o cambió de opinión, puede ignorar este mensaje.
      No volveremos a recordárselo durante las próximas 48 horas.
    </p>
    <p style="margin:12px 0 0 0;font-size:11px;line-height:1.6;color:#9CA3AF;">
      LIONSBIT · paylionsbit.es · Gestión Patrimonial Digital
    </p>
  </td></tr>
</table>
</body></html>
""".strip()


async def run_incomplete_withdraw_reminders() -> dict:
    """Scan, send, persist. Returns a summary for logging/admin endpoints."""
    now = datetime.now(timezone.utc)
    process_cutoff = (now - timedelta(hours=REMINDER_WINDOW_HOURS)).isoformat()
    cooldown_cutoff = (now - timedelta(hours=RESEND_COOLDOWN_HOURS)).isoformat()

    # Candidate query — users with selection > 24h old, not completed, not on cooldown.
    cursor = db.users.find({
        'withdrawal_type': {'$in': ['partial', 'full']},
        'withdrawal_type_selected_at': {'$lte': process_cutoff},
        'is_demo': {'$ne': True},
        '$or': [
            {'journey_email_last_sent_at': {'$exists': False}},
            {'journey_email_last_sent_at': {'$lte': cooldown_cutoff}},
        ],
    }, {'_id': 0, 'id': 1, 'name': 1, 'email': 1, 'withdrawal_type': 1})

    candidates = await cursor.to_list(length=2000)
    sent = 0
    skipped_completed = 0
    base_url = 'https://paylionsbit.es'

    for u in candidates:
        # Last gate: did they actually complete a withdrawal in the meantime?
        completed = await db.transactions.count_documents({
            'user_id': u['id'],
            'transaction_type': 'withdraw',
            'status': 'completed',
        })
        if completed > 0:
            skipped_completed += 1
            continue

        try:
            html = _build_email_html(
                name=(u.get('name') or 'cliente').split()[0],
                withdrawal_type=u['withdrawal_type'],
                base_url=base_url,
            )
            send_email_background(
                u['email'],
                'Su solicitud de retiro está en pausa — puede continuar cuando guste',
                html,
            )
            await db.users.update_one(
                {'id': u['id']},
                {'$set': {'journey_email_last_sent_at': now.isoformat()}},
            )
            await db.withdraw_journey_events.insert_one({
                'id': str(__import__('uuid').uuid4()),
                'user_id': u['id'],
                'event': 'email_sent',
                'withdrawal_type': u['withdrawal_type'],
                'metadata': {'reminder': '24h-incomplete'},
                'created_at': now.isoformat(),
            })
            sent += 1
        except Exception as exc:  # pragma: no cover
            logger.exception('[journey-reminder] %s failed: %s', u.get('email'), exc)

    summary = {
        'ran_at': now.isoformat(),
        'candidates': len(candidates),
        'emails_sent': sent,
        'skipped_completed': skipped_completed,
    }
    logger.info('[journey-reminder] %s', summary)
    return summary
