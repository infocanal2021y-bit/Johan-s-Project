"""Admin routes for the WhatsApp reactivation campaign."""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from services.auth import get_admin_user
from services.whatsapp_campaign import (
    get_campaign_status,
    get_pending_count,
    get_recent_logs,
    list_recent_campaigns,
    send_whatsapp_campaign,
)

router = APIRouter(tags=["whatsapp-campaign"])


@router.get("/admin/whatsapp/overview")
async def whatsapp_overview(admin: dict = Depends(get_admin_user)):
    """Aggregated stats for the admin dashboard panel."""
    counts = await get_pending_count()
    recent = await list_recent_campaigns(limit=10)
    return {'counts': counts, 'recent_campaigns': recent}


@router.post("/admin/whatsapp/send")
async def whatsapp_send(
    background_tasks: BackgroundTasks,
    only_failed: bool = Query(False, description="Retry only previously failed users"),
    max_messages: int = Query(0, ge=0, description="Cap (0 = unlimited)"),
    dry_run: bool = Query(False, description="Validate iteration without calling Twilio"),
    admin: dict = Depends(get_admin_user),
):
    """Kick off a WhatsApp campaign in the background. Returns immediately.

    The admin UI then polls /admin/whatsapp/campaign/{id} for live progress.
    """
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

    # Run a brief task that schedules the actual campaign in the background.
    # We need to await `send_whatsapp_campaign` to get the campaign_id but
    # don't want to block. So we use BackgroundTasks for the long-running
    # part — but we still need a campaign_id NOW for the UI. Pattern: spawn
    # an asyncio task instead so we can return immediately with a tag, and
    # the campaign doc is created at the start of the function.
    import asyncio
    asyncio.create_task(send_whatsapp_campaign(
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
        'note': 'El envío corre en segundo plano. Refresca la pestaña de campañas para ver el progreso.',
    }


@router.get("/admin/whatsapp/campaign/{campaign_id}")
async def whatsapp_campaign_status(
    campaign_id: str,
    admin: dict = Depends(get_admin_user),
):
    c = await get_campaign_status(campaign_id)
    if not c:
        raise HTTPException(status_code=404, detail='Campaign not found')
    return c


@router.get("/admin/whatsapp/logs")
async def whatsapp_logs(
    campaign_id: str = Query(None),
    limit: int = Query(100, ge=1, le=500),
    admin: dict = Depends(get_admin_user),
):
    return {'logs': await get_recent_logs(campaign_id=campaign_id, limit=limit)}
