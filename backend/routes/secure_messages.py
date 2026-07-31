"""Secure Message Center — unified inbox (tickets + notifications + broadcasts)"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from config import db
from services.auth import get_current_user

router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ts(val) -> str:
    if val is None:
        return ''
    if isinstance(val, datetime):
        return val.isoformat()
    return str(val)


def _ticket_unread(ticket: dict) -> bool:
    last_seen = ticket.get('user_last_seen_at') or ''
    for r in ticket.get('replies', []):
        if r.get('from_admin') and (r.get('created_at') or '') > last_seen:
            return True
    return False


def _ticket_preview(ticket: dict) -> str:
    replies = ticket.get('replies') or []
    text = replies[-1]['message'] if replies else (ticket.get('message') or '')
    return text[:140]


@router.get("/messages/inbox")
async def get_secure_inbox(
    kind: Optional[str] = None,
    unread_only: bool = False,
    limit: int = 200,
    current_user: dict = Depends(get_current_user),
):
    """Unified secure inbox: support tickets + admin broadcasts + notifications."""
    limit = max(1, min(limit, 500))
    uid = current_user['id']

    tickets = await db.support_tickets.find({'user_id': uid}, {'_id': 0}).sort('updated_at', -1).to_list(200)
    notifs = await db.notifications.find({'user_id': uid}, {'_id': 0}).sort('created_at', -1).to_list(300)

    # Map ticket_id -> PLB case code
    ticket_ids = [t['id'] for t in tickets]
    case_map = {}
    if ticket_ids:
        cases = await db.cases.find(
            {'entity_type': 'support_ticket', 'entity_id': {'$in': ticket_ids}},
            {'_id': 0, 'entity_id': 1, 'case_code': 1}
        ).to_list(200)
        case_map = {c['entity_id']: c.get('case_code') for c in cases}

    items = []
    for t in tickets:
        items.append({
            'kind': 'ticket',
            'id': t['id'],
            'title': t.get('subject') or 'Ticket de soporte',
            'preview': _ticket_preview(t),
            'ticket_number': t.get('ticket_number'),
            'case_code': case_map.get(t['id']),
            'status': t.get('status', 'open'),
            'category': t.get('category'),
            'replies_count': len(t.get('replies') or []),
            'unread': _ticket_unread(t),
            'created_at': _ts(t.get('created_at')),
            'updated_at': _ts(t.get('updated_at') or t.get('created_at')),
        })

    for n in notifs:
        n_kind = 'broadcast' if n.get('broadcast') else 'notification'
        items.append({
            'kind': n_kind,
            'id': n.get('id'),
            'title': n.get('title') or 'Notificación',
            'preview': (n.get('message') or '')[:140],
            'message': n.get('message'),
            'unread': not n.get('read', False),
            'created_at': _ts(n.get('created_at')),
            'updated_at': _ts(n.get('created_at')),
        })

    counts = {
        'ticket': sum(1 for i in items if i['kind'] == 'ticket' and i['unread']),
        'broadcast': sum(1 for i in items if i['kind'] == 'broadcast' and i['unread']),
        'notification': sum(1 for i in items if i['kind'] == 'notification' and i['unread']),
    }
    counts['total'] = counts['ticket'] + counts['broadcast'] + counts['notification']

    totals_by_kind = {
        'ticket': sum(1 for i in items if i['kind'] == 'ticket'),
        'broadcast': sum(1 for i in items if i['kind'] == 'broadcast'),
        'notification': sum(1 for i in items if i['kind'] == 'notification'),
    }

    if kind and kind != 'all':
        items = [i for i in items if i['kind'] == kind]
    if unread_only:
        items = [i for i in items if i['unread']]

    items.sort(key=lambda i: i.get('updated_at') or '', reverse=True)

    return {
        'items': items[:limit],
        'unread_counts': counts,
        'totals_by_kind': totals_by_kind,
        'total': len(items),
    }


@router.post("/messages/tickets/{ticket_id}/seen")
async def mark_ticket_seen(ticket_id: str, current_user: dict = Depends(get_current_user)):
    """Mark a ticket thread as seen by the user (clears its unread state)."""
    res = await db.support_tickets.update_one(
        {'id': ticket_id, 'user_id': current_user['id']},
        {'$set': {'user_last_seen_at': _now_iso()}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail='Ticket not found')
    return {'ok': True}
