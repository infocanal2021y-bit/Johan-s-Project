"""Notification routes"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from config import db
from services.auth import get_current_user

router = APIRouter()


def _classify(notif: dict) -> str:
    """Heuristic categorization based on title/message keywords."""
    text = ((notif.get('title') or '') + ' ' + (notif.get('message') or '')).lower()
    if any(k in text for k in ['retiro', 'withdraw', 'transferencia', 'conversión', 'conversion', 'r40']):
        return 'transactions'
    if any(k in text for k in ['documento', 'vault', 'certificado', 'hash', 'kyc']):
        return 'documents'
    if any(k in text for k in ['mensaje', 'message', 'difusión', 'broadcast']):
        return 'messages'
    if any(k in text for k in ['expediente', 'verificación', 'verification', 'estado', 'aprobado', 'rechazado']):
        return 'expediente'
    return 'system'


CATEGORY_META = {
    'transactions': {'label': 'Transacciones', 'color': '#10b981', 'icon': 'banknote'},
    'documents':    {'label': 'Documentos',    'color': '#06b6d4', 'icon': 'file'},
    'messages':     {'label': 'Mensajes',      'color': '#a78bfa', 'icon': 'mail'},
    'expediente':   {'label': 'Expediente',    'color': '#f59e0b', 'icon': 'shield'},
    'system':       {'label': 'Sistema',       'color': '#64748b', 'icon': 'bell'},
}


# ==================== NOTIFICATIONS ROUTES ====================

@router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    """Backwards-compatible compact list for the bell."""
    notifications = await db.notifications.find(
        {'user_id': current_user['id']},
        {'_id': 0}
    ).sort('created_at', -1).limit(50).to_list(50)
    
    unread_count = await db.notifications.count_documents({
        'user_id': current_user['id'],
        'read': False
    })
    
    return {
        'notifications': notifications,
        'unread_count': unread_count
    }


@router.get("/notifications/center")
async def get_notifications_center(
    category: Optional[str] = None,
    unread_only: bool = False,
    limit: int = 100,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    """Rich payload for the dedicated Notifications Center page.

    Returns: items (with `category` enrichment), counts_by_category, total, unread_total,
    grouped_by_day (latest first), category_meta.
    """
    limit = max(1, min(limit, 500))
    offset = max(0, offset)

    q: dict = {'user_id': current_user['id']}
    if unread_only:
        q['read'] = {'$ne': True}

    cur = db.notifications.find(q, {'_id': 0}).sort('created_at', -1).skip(offset).limit(limit + 50)
    raw = await cur.to_list(length=limit + 50)

    # Enrich with category + filter if requested
    counts_by_category = {k: 0 for k in CATEGORY_META.keys()}
    enriched = []
    for n in raw:
        c = _classify(n)
        n['category'] = c
        counts_by_category[c] = counts_by_category.get(c, 0) + 1
        if category and category != 'all' and c != category:
            continue
        enriched.append(n)
        if len(enriched) >= limit:
            break

    # Total & unread (independent of filters)
    total = await db.notifications.count_documents({'user_id': current_user['id']})
    unread_total = await db.notifications.count_documents({'user_id': current_user['id'], 'read': {'$ne': True}})

    # Group by day key (YYYY-MM-DD UTC)
    grouped: dict = {}
    for n in enriched:
        ts = n.get('created_at')
        if not ts:
            continue
        day = (ts[:10] if isinstance(ts, str) else
               datetime.fromisoformat(str(ts)).date().isoformat())
        grouped.setdefault(day, []).append(n)
    grouped_list = [{'day': day, 'items': items} for day, items in
                    sorted(grouped.items(), key=lambda x: x[0], reverse=True)]

    return {
        'items': enriched,
        'grouped_by_day': grouped_list,
        'counts_by_category': counts_by_category,
        'total': total,
        'unread_total': unread_total,
        'category_meta': CATEGORY_META,
        'category_filter': category or 'all',
    }


@router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.notifications.update_one(
        {'id': notification_id, 'user_id': current_user['id']},
        {'$set': {'read': True}}
    )
    
    if result.modified_count == 0:
        # Re-check: maybe already read (still 200) vs truly not found (404)
        exists = await db.notifications.find_one(
            {'id': notification_id, 'user_id': current_user['id']}, {'_id': 0, 'id': 1}
        )
        if not exists:
            raise HTTPException(status_code=404, detail='Notification not found')
    
    return {'message': 'Notification marked as read'}


@router.put("/notifications/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    res = await db.notifications.update_many(
        {'user_id': current_user['id'], 'read': {'$ne': True}},
        {'$set': {'read': True}}
    )
    return {'message': 'All notifications marked as read', 'updated': res.modified_count}


@router.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str, current_user: dict = Depends(get_current_user)):
    res = await db.notifications.delete_one({'id': notification_id, 'user_id': current_user['id']})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Notification not found')
    return {'ok': True}

# ==================== ADMIN ROUTES ====================

