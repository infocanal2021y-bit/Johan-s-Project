"""Withdrawal journey tracking — incomplete-process detection & guidance.

Identifies users who:
  • picked a withdrawal modality (`withdrawal_type` is set), AND
  • logged in 2+ times in the last 24h, AND
  • have NO completed withdrawal transaction yet.

Such users receive guidance through:
  • Banner in the Dashboard
  • Single per-session in-app notification
  • Email reminder (24h+ since process started, sent at most once per 48h)

All journey events (`banner_shown`, `banner_click`, `banner_dismissed`,
`notification_shown`, `email_sent`) are persisted in `withdraw_journey_events`
for analytics. The system halts ALL reminders the moment the user records a
completed withdrawal.
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Literal, Optional
import uuid

from services.auth import get_current_user
from config import db

router = APIRouter(tags=['withdraw-journey'])

JOURNEY_INCOMPLETE = 'incomplete'
JOURNEY_COMPLETED  = 'completed'
JOURNEY_NONE       = 'none'

VALID_EVENTS = {'banner_shown', 'banner_click', 'banner_dismissed', 'notification_shown'}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _user_login_count_24h(user_id: str) -> int:
    """Count distinct login events for the user in the last 24h.

    We rely on the `auth_audit` collection if present, falling back to the
    user document's `login_count` / `last_active` heuristic so the feature
    keeps working even if the audit log isn't populated yet.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    try:
        n = await db.auth_audit.count_documents({
            'user_id': user_id,
            'event': 'login',
            'created_at': {'$gte': cutoff},
        })
        if n > 0:
            return n
    except Exception:  # pragma: no cover
        pass
    # Fallback heuristic: any user with `last_active` within 24h counts as 1
    u = await db.users.find_one({'id': user_id}, {'_id': 0, 'last_active': 1})
    if u and u.get('last_active') and u['last_active'] >= cutoff:
        return 1
    return 0


async def _has_completed_withdrawal(user_id: str) -> bool:
    n = await db.transactions.count_documents({
        'user_id': user_id,
        'transaction_type': 'withdraw',
        'status': 'completed',
    })
    return n > 0


async def compute_journey_status(user: dict) -> dict:
    """Pure-function projection — used by GET endpoint and the email job."""
    user_id = user['id']
    withdrawal_type = user.get('withdrawal_type')

    # 1. No modality picked → nothing to nudge yet
    if not withdrawal_type:
        return {
            'status': JOURNEY_NONE,
            'withdrawal_type': None,
            'started_at': None,
            'login_count_24h': 0,
            'reason': 'no_modality_selected',
        }

    # 2. Already completed → halt all reminders
    if await _has_completed_withdrawal(user_id):
        return {
            'status': JOURNEY_COMPLETED,
            'withdrawal_type': withdrawal_type,
            'started_at': user.get('withdrawal_type_selected_at'),
            'login_count_24h': 0,
            'reason': 'withdrawal_completed',
        }

    # 3. Not enough engagement → don't push yet
    login_count = await _user_login_count_24h(user_id)
    started_at = user.get('withdrawal_type_selected_at')
    return {
        'status': JOURNEY_INCOMPLETE if login_count >= 2 else JOURNEY_NONE,
        'withdrawal_type': withdrawal_type,
        'started_at': started_at,
        'login_count_24h': login_count,
        'reason': 'incomplete' if login_count >= 2 else 'awaiting_engagement',
    }


@router.get('/withdraw/journey-status')
async def get_journey_status(user: dict = Depends(get_current_user)):
    """Resolve the user's journey state (none / incomplete / completed)."""
    snap = await compute_journey_status(user)
    # Per-session "shown_in_session" hint is opaque — frontend uses session
    # storage to throttle. We just provide the canonical state here.
    return snap


class JourneyEventPayload(BaseModel):
    event: Literal['banner_shown', 'banner_click', 'banner_dismissed', 'notification_shown']
    metadata: Optional[dict] = Field(default_factory=dict)


@router.post('/withdraw/journey-status/event')
async def record_journey_event(
    payload: JourneyEventPayload,
    user: dict = Depends(get_current_user),
):
    """Persist a journey UX event for analytics."""
    if payload.event not in VALID_EVENTS:
        raise HTTPException(status_code=400, detail='unknown event')
    doc = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'event': payload.event,
        'withdrawal_type': user.get('withdrawal_type'),
        'metadata': payload.metadata or {},
        'created_at': _now_iso(),
    }
    await db.withdraw_journey_events.insert_one(doc)
    return {'ok': True, 'event_id': doc['id']}
