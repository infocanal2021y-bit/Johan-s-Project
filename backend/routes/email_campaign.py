"""Admin routes for the Email reactivation campaign."""
import asyncio
import base64
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from config import db
from services.auth import get_admin_user
from services.email_campaign import (
    get_campaign_status,
    get_pending_count,
    get_recent_logs,
    list_recent_campaigns,
    send_email_campaign,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["email-campaign"])


@router.get("/admin/email-campaign/overview")
async def email_overview(admin: dict = Depends(get_admin_user)):
    counts = await get_pending_count()
    recent = await list_recent_campaigns(limit=10)
    return {'counts': counts, 'recent_campaigns': recent}


@router.post("/admin/email-campaign/send")
async def email_send(
    only_failed: bool = Query(False),
    max_messages: int = Query(0, ge=0),
    dry_run: bool = Query(False),
    admin: dict = Depends(get_admin_user),
):
    counts = await get_pending_count()
    if not only_failed and counts['pending'] == 0:
        raise HTTPException(
            status_code=400,
            detail='No hay usuarios pendientes — todos ya fueron notificados o no quedan elegibles.',
        )
    if only_failed and counts['failed_retryable'] == 0:
        raise HTTPException(
            status_code=400,
            detail='No hay envíos fallidos para reintentar.',
        )
    cap = max_messages if max_messages > 0 else None

    asyncio.create_task(send_email_campaign(
        triggered_by=admin.get('email') or 'admin',
        only_failed=only_failed,
        max_messages=cap,
        dry_run=dry_run,
    ))

    return {
        'status': 'started',
        'mode': 'retry_failed' if only_failed else 'fresh',
        'max_messages': cap,
        'dry_run': dry_run,
        'pending_at_start': counts['pending'] if not only_failed else counts['failed_retryable'],
        'note': 'El envío corre en segundo plano. Refresca para ver el progreso en vivo.',
    }


@router.get("/admin/email-campaign/campaign/{campaign_id}")
async def email_campaign_status(
    campaign_id: str,
    admin: dict = Depends(get_admin_user),
):
    c = await get_campaign_status(campaign_id)
    if not c:
        raise HTTPException(status_code=404, detail='Campaign not found')
    return c


@router.get("/admin/email-campaign/logs")
async def email_logs(
    campaign_id: str = Query(None),
    limit: int = Query(100, ge=1, le=500),
    admin: dict = Depends(get_admin_user),
):
    return {'logs': await get_recent_logs(campaign_id=campaign_id, limit=limit)}


# ════════════════════════════════════════════════════════
#  PUBLIC: Open-tracking pixel
#  GET /api/email/track/open/{token}.png — returns 1x1 transparent png
#  and stamps email_reactivation_notification.opened_at on the user.
# ════════════════════════════════════════════════════════

# 1x1 transparent GIF (43 bytes) — also valid as PNG-ish payload for tracking
_TRANSPARENT_PIXEL = base64.b64decode(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
)


@router.get("/email/track/open/{token}.png")
async def track_email_open(token: str):
    """Best-effort open tracker. Always returns a 1x1 pixel."""
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        # Stamp opened_at (only first-open is preserved by $setOnInsert-like trick)
        await db.users.update_one(
            {
                'email_open_token': token,
                'email_reactivation_notification.opened_at': {'$in': [None, '', False]},
            },
            {'$set': {
                'email_reactivation_notification.opened_at': now_iso,
                'email_reactivation_notification.status': 'opened',
                'email_status': 'opened',
            }},
        )
        # Also stamp every open in a separate collection
        await db.email_open_events.insert_one({
            'token': token,
            'opened_at': now_iso,
        })
    except Exception as exc:  # pragma: no cover
        logger.warning('[email-track] %s', exc)

    return Response(content=_TRANSPARENT_PIXEL, media_type='image/gif')
