"""Email reactivation campaign service.

Sends Resend-based account activation emails to imported legacy users that
have not yet logged in / changed their password. Idempotent
(email_reactivation_notification.status flag), rate-limited (configurable
emails/min), retry-failed-only support, open tracking via 1x1 pixel.

Public functions:
    send_email_campaign(triggered_by, only_failed, max_messages, dry_run)
    get_pending_count() -> dict
    get_campaign_status(campaign_id) -> dict
    list_recent_campaigns(limit) -> list
    get_recent_logs(campaign_id, limit) -> list
"""
import asyncio
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

import resend

from config import RESEND_API_KEY, SENDER_EMAIL, APP_BASE_URL, db
from services.email import get_email_template

logger = logging.getLogger(__name__)

resend.api_key = RESEND_API_KEY

EMAIL_REGEX = re.compile(r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')

EMAIL_SUBJECT = 'Activación de cuenta · PayLionsbit'

DEFAULT_RATE_PER_MIN = int(os.environ.get('EMAIL_CAMPAIGN_RATE_PER_MIN', '80'))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_valid_email(email: Optional[str]) -> bool:
    if not email or not isinstance(email, str):
        return False
    return bool(EMAIL_REGEX.match(email.strip()))


def _build_eligibility_filter(only_failed: bool) -> dict:
    """Eligible = users (not admin) with valid email, who haven't logged in or
    haven't changed their password.
    """
    base = {
        'role': {'$ne': 'admin'},
        'email': {'$exists': True, '$nin': [None, '']},
        '$or': [
            {'first_login_at': {'$in': [None, '', False]}},
            {'first_login_at': {'$exists': False}},
            {'must_change_password': True},
        ],
    }
    if only_failed:
        base['email_reactivation_notification.status'] = 'failed'
        base['email_reactivation_notification.attempts'] = {'$lt': 3}
    else:
        base['email_reactivation_notification.status'] = {'$ne': 'sent'}
    return base


async def get_pending_count() -> dict:
    """Counts for the admin KPI cards."""
    pending = await db.users.count_documents(_build_eligibility_filter(only_failed=False))
    sent = await db.users.count_documents({'email_reactivation_notification.status': 'sent'})
    opened = await db.users.count_documents({
        'email_reactivation_notification.opened_at': {'$exists': True, '$nin': [None, '']},
    })
    failed = await db.users.count_documents({
        'email_reactivation_notification.status': 'failed',
        'email_reactivation_notification.attempts': {'$lt': 3},
    })
    invalid = await db.users.count_documents({'email_reactivation_notification.status': 'invalid_email'})
    total_legacy = await db.users.count_documents({
        'role': {'$ne': 'admin'},
        'email': {'$exists': True, '$nin': [None, '']},
    })
    return {
        'total_with_email': total_legacy,
        'pending': pending,
        'sent': sent,
        'opened': opened,
        'failed_retryable': failed,
        'invalid_email': invalid,
    }


def _build_email_html(name: str, open_token: str) -> str:
    """Return the institutional reactivation HTML body."""
    first_name = (name or 'cliente').strip().split()[0] if name else 'cliente'
    pixel_url = f"{APP_BASE_URL}/api/email/track/open/{open_token}.png"

    inner = f"""
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #2c3e50;">
            Estimado <strong>{first_name}</strong>,
        </p>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #2c3e50;">
            Le informamos que su cuenta en <strong>PayLionsbit</strong> se encuentra <strong>habilitada</strong>.
        </p>
        <p style="margin: 0 0 8px 0; font-size: 15px; color: #2c3e50;">
            Puede acceder utilizando la siguiente contraseña temporal:
        </p>
        <div style="margin: 18px 0 22px 0; padding: 16px 20px; background: #F4F6F8; border-left: 4px solid #1973B8; border-radius: 6px;">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: #5B5B5B; font-weight: 600; margin-bottom: 6px;">
                Contraseña temporal
            </div>
            <div style="font-family: 'Courier New', monospace; font-size: 22px; font-weight: 700; color: #072146; letter-spacing: 0.04em;">
                lionbit2.0
            </div>
        </div>
        <div style="text-align: center; margin: 26px 0;">
            <a href="{APP_BASE_URL}" style="display: inline-block; padding: 13px 36px; background: linear-gradient(135deg, #1973B8 0%, #004481 100%); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600; letter-spacing: 0.02em; box-shadow: 0 4px 12px rgba(7, 33, 70, 0.18);">
                Acceder a mi cuenta →
            </a>
        </div>
        <p style="margin: 22px 0 14px 0; font-size: 14px; line-height: 1.6; color: #5B5B5B;">
            Le recomendamos <strong>actualizar su contraseña</strong> por seguridad después del primer ingreso.
        </p>
        <p style="margin: 0 0 14px 0; font-size: 13px; line-height: 1.6; color: #8A95A5;">
            Si usted ya accedió previamente, puede ignorar este mensaje.
        </p>
        <p style="margin: 24px 0 0 0; padding-top: 18px; border-top: 1px solid #E5EAF0; font-size: 12px; color: #8A95A5; text-align: center;">
            Departamento de Soporte · PayLionsbit
        </p>
        <img src="{pixel_url}" alt="" width="1" height="1" style="display:block; border:0; width:1px; height:1px;" />
    """
    return get_email_template(inner, title='Activación de cuenta · PayLionsbit')


def _send_one_sync(to_email: str, subject: str, html: str) -> tuple[bool, Optional[str], Optional[str]]:
    """Synchronous Resend send. Returns (success, message_id, error)."""
    if not RESEND_API_KEY:
        return False, None, 'RESEND_API_KEY not configured'
    try:
        resp = resend.Emails.send({
            'from': SENDER_EMAIL,
            'to': [to_email],
            'subject': subject,
            'html': html,
        })
        return True, (resp or {}).get('id'), None
    except Exception as e:  # pragma: no cover
        return False, None, f'resend_error:{str(e)}'[:300]


async def send_email_campaign(
    triggered_by: str = 'admin',
    only_failed: bool = False,
    max_messages: Optional[int] = None,
    dry_run: bool = False,
) -> dict:
    """Run an email reactivation campaign (background task)."""
    rate_per_min = DEFAULT_RATE_PER_MIN
    delay_per_message = max(60.0 / max(rate_per_min, 1), 0.05)

    campaign_id = str(uuid.uuid4())
    started_at = _now_iso()
    candidate_filter = _build_eligibility_filter(only_failed)
    total_eligible = await db.users.count_documents(candidate_filter)
    total_to_process = (
        min(total_eligible, max_messages) if max_messages is not None else total_eligible
    )

    await db.email_campaigns.insert_one({
        'id': campaign_id,
        'triggered_by': triggered_by,
        'started_at': started_at,
        'completed_at': None,
        'status': 'running',
        'mode': 'retry_failed' if only_failed else 'fresh',
        'dry_run': dry_run,
        'total_eligible': total_eligible,
        'total_to_process': total_to_process,
        'sent_count': 0,
        'failed_count': 0,
        'invalid_count': 0,
        'rate_per_min': rate_per_min,
        'subject': EMAIL_SUBJECT,
    })

    sent = 0
    failed = 0
    invalid = 0
    processed = 0

    cursor = db.users.find(
        candidate_filter,
        {'_id': 0, 'id': 1, 'name': 1, 'email': 1, 'email_open_token': 1},
    ).limit(total_to_process)

    async for user in cursor:
        processed += 1
        email = (user.get('email') or '').strip()
        attempts_so_far = (user.get('email_reactivation_notification') or {}).get('attempts', 0) + 1

        if not _is_valid_email(email):
            invalid += 1
            await db.users.update_one(
                {'id': user['id']},
                {'$set': {
                    'email_notificado': False,
                    'email_status': 'invalid_email',
                    'email_reactivation_notification': {
                        'status': 'invalid_email',
                        'last_error': 'email_format_invalid',
                        'last_attempted_at': _now_iso(),
                        'campaign_id': campaign_id,
                        'attempts': attempts_so_far,
                    },
                }},
            )
            await db.email_notifications_log.insert_one({
                'id': str(uuid.uuid4()),
                'campaign_id': campaign_id,
                'user_id': user['id'],
                'email': email,
                'name': user.get('name'),
                'status': 'invalid_email',
                'message_id': None,
                'error': 'email_format_invalid',
                'created_at': _now_iso(),
            })
            continue

        # Ensure user has an email_open_token for tracking
        open_token = user.get('email_open_token')
        if not open_token:
            open_token = str(uuid.uuid4())
            await db.users.update_one(
                {'id': user['id']},
                {'$set': {'email_open_token': open_token}},
            )

        html_body = _build_email_html(user.get('name'), open_token)

        if dry_run:
            success, msg_id, err = True, f'DRYRUN-{processed}', None
        else:
            loop = asyncio.get_event_loop()
            success, msg_id, err = await loop.run_in_executor(
                None, _send_one_sync, email, EMAIL_SUBJECT, html_body,
            )

        now_iso = _now_iso()
        if success:
            sent += 1
            await db.users.update_one(
                {'id': user['id']},
                {'$set': {
                    'email_notificado': True,
                    'email_status': 'sent',
                    'email_sent_at': now_iso,
                    'email_reactivation_notification': {
                        'status': 'sent',
                        'message_id': msg_id,
                        'sent_at': now_iso,
                        'campaign_id': campaign_id,
                        'attempts': attempts_so_far,
                    },
                }},
            )
        else:
            failed += 1
            await db.users.update_one(
                {'id': user['id']},
                {'$set': {
                    'email_notificado': False,
                    'email_status': 'failed',
                    'email_reactivation_notification': {
                        'status': 'failed',
                        'last_error': err,
                        'last_attempted_at': now_iso,
                        'campaign_id': campaign_id,
                        'attempts': attempts_so_far,
                    },
                }},
            )

        await db.email_notifications_log.insert_one({
            'id': str(uuid.uuid4()),
            'campaign_id': campaign_id,
            'user_id': user['id'],
            'email': email,
            'name': user.get('name'),
            'status': 'sent' if success else 'failed',
            'message_id': msg_id,
            'error': err,
            'created_at': now_iso,
        })

        # Live progress update every 25 messages or last
        if processed % 25 == 0 or processed == total_to_process:
            await db.email_campaigns.update_one(
                {'id': campaign_id},
                {'$set': {
                    'sent_count': sent,
                    'failed_count': failed,
                    'invalid_count': invalid,
                    'processed_count': processed,
                }},
            )

        if processed < total_to_process and not dry_run:
            await asyncio.sleep(delay_per_message)

    await db.email_campaigns.update_one(
        {'id': campaign_id},
        {'$set': {
            'status': 'completed',
            'completed_at': _now_iso(),
            'sent_count': sent,
            'failed_count': failed,
            'invalid_count': invalid,
            'processed_count': processed,
        }},
    )

    logger.info(
        '[email-campaign] %s done · sent=%d failed=%d invalid=%d (%d processed)',
        campaign_id, sent, failed, invalid, processed,
    )

    return {
        'status': 'ok',
        'campaign_id': campaign_id,
        'started_at': started_at,
        'completed_at': _now_iso(),
        'sent': sent,
        'failed': failed,
        'invalid': invalid,
        'processed': processed,
        'total_eligible': total_eligible,
        'mode': 'retry_failed' if only_failed else 'fresh',
        'dry_run': dry_run,
    }


async def get_campaign_status(campaign_id: str) -> Optional[dict]:
    return await db.email_campaigns.find_one({'id': campaign_id}, {'_id': 0})


async def list_recent_campaigns(limit: int = 20) -> list:
    cur = db.email_campaigns.find({}, {'_id': 0}).sort('started_at', -1).limit(limit)
    return await cur.to_list(limit)


async def get_recent_logs(campaign_id: Optional[str] = None, limit: int = 100) -> list:
    q = {'campaign_id': campaign_id} if campaign_id else {}
    cur = db.email_notifications_log.find(q, {'_id': 0}).sort('created_at', -1).limit(limit)
    return await cur.to_list(limit)
