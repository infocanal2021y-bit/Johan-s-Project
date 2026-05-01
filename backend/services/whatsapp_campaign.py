"""WhatsApp bulk reactivation campaign service.

Sends Twilio-templated WhatsApp messages to imported legacy users that have
not yet logged in / changed their password. Idempotent (whatsapp_notificado
flag), rate-limited (configurable msgs/min), retry-failed-only support.

Public functions:
    send_whatsapp_campaign(triggered_by, only_failed=False) -> dict
    get_campaign_status(campaign_id) -> dict
    get_pending_count() -> int
    list_recent_campaigns(limit) -> list

ENV:
    TWILIO_ACCOUNT_SID            (required)
    TWILIO_AUTH_TOKEN             (required)
    TWILIO_WHATSAPP_FROM          (required, e.g. "whatsapp:+14155238886")
    TWILIO_WHATSAPP_TEMPLATE_SID  (required, e.g. "HXb5b6...")
    TWILIO_WHATSAPP_RATE_PER_MIN  (optional, default 40)
"""
import asyncio
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import phonenumbers
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client as TwilioClient

from config import db

logger = logging.getLogger(__name__)


# Country auto-detection priors when a number is missing the leading "+"
COUNTRY_DEFAULTS = ['ES', 'MX', 'CO', 'AR', 'CL', 'PE', 'VE', 'EC', 'US']


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _client() -> Optional[TwilioClient]:
    sid = os.environ.get('TWILIO_ACCOUNT_SID')
    token = os.environ.get('TWILIO_AUTH_TOKEN')
    if not sid or not token:
        return None
    return TwilioClient(sid, token)


def _normalize_phone(raw: str) -> Optional[str]:
    """Best-effort conversion of any input to E.164. Returns None if unfixable."""
    if not raw:
        return None
    s = str(raw).strip()
    s = re.sub(r'[\s\-().]', '', s)
    if not s:
        return None
    # Already starts with +
    if s.startswith('+'):
        try:
            num = phonenumbers.parse(s, None)
            if phonenumbers.is_valid_number(num):
                return phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164)
        except phonenumbers.NumberParseException:
            return None
        return None
    # No + sign — try a few country priors
    for region in COUNTRY_DEFAULTS:
        try:
            num = phonenumbers.parse(s, region)
            if phonenumbers.is_valid_number(num):
                return phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164)
        except phonenumbers.NumberParseException:
            continue
    return None


def _build_eligibility_filter(only_failed: bool) -> dict:
    """Filter users that need to receive the WhatsApp message.

    Eligible = imported legacy users (have phone), no admin role, AND
      either have NEVER logged in OR have NEVER changed their password.
    """
    base = {
        'role': {'$ne': 'admin'},
        'phone': {'$exists': True, '$nin': [None, '']},
        '$or': [
            {'first_login_at': {'$in': [None, '', False]}},
            {'first_login_at': {'$exists': False}},
            {'must_change_password': True},
        ],
    }
    if only_failed:
        base['whatsapp_notification'] = {'$exists': True}
        base['whatsapp_notification.status'] = 'failed'
        # Don't keep retrying after 3 attempts
        base['whatsapp_notification.attempts'] = {'$lt': 3}
    else:
        # Skip already-notified users (idempotent)
        base['whatsapp_notification.status'] = {'$ne': 'sent'}
    return base


async def get_pending_count() -> dict:
    """Counts for the admin KPI cards."""
    pending = await db.users.count_documents(_build_eligibility_filter(only_failed=False))
    sent = await db.users.count_documents({'whatsapp_notification.status': 'sent'})
    failed = await db.users.count_documents({
        'whatsapp_notification.status': 'failed',
        'whatsapp_notification.attempts': {'$lt': 3},
    })
    invalid = await db.users.count_documents({'whatsapp_notification.status': 'invalid_phone'})
    total_legacy = await db.users.count_documents({
        'role': {'$ne': 'admin'},
        'phone': {'$exists': True, '$nin': [None, '']},
    })
    return {
        'total_legacy_with_phone': total_legacy,
        'pending': pending,
        'sent': sent,
        'failed_retryable': failed,
        'invalid_phone': invalid,
    }


def _send_one_sync(client, from_number, template_sid, to_e164, name) -> tuple[bool, str, str]:
    """Synchronous Twilio send. Returns (success, sid_or_error, status)."""
    try:
        msg = client.messages.create(
            from_=from_number,
            to=f'whatsapp:{to_e164}',
            content_sid=template_sid,
            content_variables=json.dumps({
                '1': (name or 'Estimado cliente').split()[0][:30],
                '2': 'lionsbit2.0',
            }),
        )
        return True, msg.sid, msg.status or 'queued'
    except TwilioRestException as e:
        return False, f'twilio_{e.code}:{e.msg}'[:300], 'failed'
    except Exception as e:  # pragma: no cover
        return False, f'error:{str(e)}'[:300], 'failed'


async def send_whatsapp_campaign(
    triggered_by: str = 'admin',
    only_failed: bool = False,
    max_messages: Optional[int] = None,
    dry_run: bool = False,
) -> dict:
    """Run a WhatsApp reactivation campaign synchronously (background task).

    Args:
        triggered_by: log marker (admin email, "scheduler", etc).
        only_failed: if True, retry only previously failed (attempts < 3) users.
        max_messages: cap (for testing). None = unlimited.
        dry_run: if True, validate/iterate but DO NOT call Twilio.
    """
    client = _client()
    template_sid = os.environ.get('TWILIO_WHATSAPP_TEMPLATE_SID')
    from_number = os.environ.get('TWILIO_WHATSAPP_FROM')
    rate_per_min = int(os.environ.get('TWILIO_WHATSAPP_RATE_PER_MIN', '40'))

    if not dry_run and (not client or not template_sid or not from_number):
        return {
            'status': 'error',
            'error': 'twilio_credentials_missing',
            'detail': 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, TWILIO_WHATSAPP_TEMPLATE_SID must all be set in /app/backend/.env',
        }

    # Build campaign doc
    campaign_id = str(uuid.uuid4())
    started_at = _now_iso()
    candidate_filter = _build_eligibility_filter(only_failed)
    total_eligible = await db.users.count_documents(candidate_filter)
    if max_messages is not None:
        total_to_process = min(total_eligible, max_messages)
    else:
        total_to_process = total_eligible

    await db.whatsapp_campaigns.insert_one({
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
        'template_sid': template_sid,
        'from_number': from_number,
    })

    # Rate-limit window: every 60s no more than `rate_per_min` Twilio calls
    delay_per_message = max(60.0 / max(rate_per_min, 1), 0.1)

    sent = 0
    failed = 0
    invalid = 0
    processed = 0

    cursor = db.users.find(candidate_filter, {'_id': 0, 'id': 1, 'name': 1, 'phone': 1}).limit(total_to_process)

    async for user in cursor:
        processed += 1
        e164 = _normalize_phone(user.get('phone'))
        if not e164:
            invalid += 1
            await db.users.update_one(
                {'id': user['id']},
                {'$set': {
                    'whatsapp_notification': {
                        'status': 'invalid_phone',
                        'last_error': 'phone_format_invalid',
                        'last_attempted_at': _now_iso(),
                        'campaign_id': campaign_id,
                        'attempts': (user.get('whatsapp_notification') or {}).get('attempts', 0) + 1,
                    },
                }},
            )
            await db.whatsapp_logs.insert_one({
                'id': str(uuid.uuid4()),
                'campaign_id': campaign_id,
                'user_id': user['id'],
                'phone_input': user.get('phone'),
                'phone_e164': None,
                'name': user.get('name'),
                'status': 'invalid_phone',
                'twilio_sid': None,
                'error': 'phone_format_invalid',
                'created_at': _now_iso(),
            })
            continue

        if dry_run:
            success, sid_or_err, twilio_status = True, f'DRYRUN-{processed}', 'queued'
        else:
            # Twilio SDK is sync — push to a thread so we don't block the loop
            loop = asyncio.get_event_loop()
            success, sid_or_err, twilio_status = await loop.run_in_executor(
                None,
                _send_one_sync,
                client, from_number, template_sid, e164, user.get('name'),
            )

        attempts_so_far = (user.get('whatsapp_notification') or {}).get('attempts', 0) + 1

        if success:
            sent += 1
            await db.users.update_one(
                {'id': user['id']},
                {'$set': {
                    'whatsapp_notificado': True,
                    'whatsapp_notification': {
                        'status': 'sent',
                        'twilio_sid': sid_or_err,
                        'twilio_status': twilio_status,
                        'phone_e164': e164,
                        'last_attempted_at': _now_iso(),
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
                    'whatsapp_notificado': False,
                    'whatsapp_notification': {
                        'status': 'failed',
                        'last_error': sid_or_err,
                        'phone_e164': e164,
                        'last_attempted_at': _now_iso(),
                        'campaign_id': campaign_id,
                        'attempts': attempts_so_far,
                    },
                }},
            )

        await db.whatsapp_logs.insert_one({
            'id': str(uuid.uuid4()),
            'campaign_id': campaign_id,
            'user_id': user['id'],
            'phone_input': user.get('phone'),
            'phone_e164': e164,
            'name': user.get('name'),
            'status': 'sent' if success else 'failed',
            'twilio_sid': sid_or_err if success else None,
            'twilio_status': twilio_status if success else None,
            'error': None if success else sid_or_err,
            'created_at': _now_iso(),
        })

        # Live progress update on the campaign every 10 messages or last
        if processed % 10 == 0 or processed == total_to_process:
            await db.whatsapp_campaigns.update_one(
                {'id': campaign_id},
                {'$set': {
                    'sent_count': sent,
                    'failed_count': failed,
                    'invalid_count': invalid,
                    'processed_count': processed,
                }},
            )

        # Rate limit (skip the wait on the last message)
        if processed < total_to_process and not dry_run:
            await asyncio.sleep(delay_per_message)

    await db.whatsapp_campaigns.update_one(
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
        '[whatsapp-campaign] %s done · sent=%d failed=%d invalid=%d (%d processed)',
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
    return await db.whatsapp_campaigns.find_one({'id': campaign_id}, {'_id': 0})


async def list_recent_campaigns(limit: int = 20) -> list:
    cur = db.whatsapp_campaigns.find({}, {'_id': 0}).sort('started_at', -1).limit(limit)
    return await cur.to_list(limit)


async def get_recent_logs(campaign_id: Optional[str] = None, limit: int = 100) -> list:
    q = {'campaign_id': campaign_id} if campaign_id else {}
    cur = db.whatsapp_logs.find(q, {'_id': 0}).sort('created_at', -1).limit(limit)
    return await cur.to_list(limit)
