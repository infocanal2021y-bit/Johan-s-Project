"""Mobile App waitlist · Phase 6 polish.

Persists user expressions of interest for the upcoming PayLionsBit Mobile app
(iOS + Android). Idempotent per user — a second submission updates the row
instead of inserting a duplicate. Used by the compact widget on the Command
Center and the dedicated /mobile-app page.

Collection: `mobile_app_waitlist`
    { id, user_id, email, name, source, notify_email, notify_push, ip,
      created_at, updated_at }
"""
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from config import db
from services.auth import get_current_user, get_admin_user


router = APIRouter()


# Social-proof baseline so the counter is credible from day 1 (campaign seed).
# Configurable per environment without redeploys.
WAITLIST_BASELINE = int(os.environ.get("MOBILE_APP_WAITLIST_BASELINE", "1247"))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/mobile-app/waitlist/count")
async def waitlist_count(user: dict = Depends(get_current_user)):
    """Public-ish count for social proof. Returns `{total, real, baseline}`.

    `total = real + baseline` — the baseline is a campaign seed so the number
    looks credible from day one; tweak via `MOBILE_APP_WAITLIST_BASELINE` env.
    No personal data exposed.
    """
    real = await db.mobile_app_waitlist.count_documents({})
    total = real + WAITLIST_BASELINE
    return {"total": total, "real": real, "baseline": WAITLIST_BASELINE}


@router.get("/mobile-app/waitlist/status")
async def my_waitlist_status(user: dict = Depends(get_current_user)):
    """Returns `{registered, since, source}` so the UI can show 'already in list'."""
    row = await db.mobile_app_waitlist.find_one(
        {"user_id": user["id"]},
        {"_id": 0, "created_at": 1, "source": 1, "notify_email": 1, "notify_push": 1},
    )
    return {
        "registered": bool(row),
        "since": (row or {}).get("created_at"),
        "source": (row or {}).get("source"),
        "notify_email": (row or {}).get("notify_email", True),
        "notify_push": (row or {}).get("notify_push", True),
    }


@router.post("/mobile-app/waitlist/register")
async def register_waitlist(payload: dict, request: Request, user: dict = Depends(get_current_user)):
    """Idempotent registration. Body (all optional):
    `{source: 'command_center'|'mobile_page'|'dashboard', notify_email?, notify_push?}`.

    Reuses the user's auth identity — we never trust client-supplied emails to
    avoid impersonation. Returns the persisted row.
    """
    source = (payload.get("source") or "unknown")[:40]
    notify_email = bool(payload.get("notify_email", True))
    notify_push = bool(payload.get("notify_push", True))
    ip = (request.client.host if request.client else None)

    now = _now_iso()
    existing = await db.mobile_app_waitlist.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1, "created_at": 1})
    doc_id = (existing or {}).get("id") or str(uuid.uuid4())
    created_at = (existing or {}).get("created_at") or now

    await db.mobile_app_waitlist.update_one(
        {"user_id": user["id"]},
        {
            "$set": {
                "id": doc_id,
                "user_id": user["id"],
                "email": user.get("email"),
                "name": user.get("name"),
                "source": source,
                "notify_email": notify_email,
                "notify_push": notify_push,
                "ip": ip,
                "updated_at": now,
                "created_at": created_at,
            }
        },
        upsert=True,
    )

    real = await db.mobile_app_waitlist.count_documents({})
    return {
        "ok": True,
        "registered": True,
        "since": created_at,
        "source": source,
        "already_registered": bool(existing),
        "total": real + WAITLIST_BASELINE,
    }


@router.delete("/mobile-app/waitlist/register")
async def unregister_waitlist(user: dict = Depends(get_current_user)):
    """Remove the user from the waitlist (rarely used, but provided for parity)."""
    result = await db.mobile_app_waitlist.delete_one({"user_id": user["id"]})
    return {"ok": True, "removed": result.deleted_count}


# ── Admin endpoint ─────────────────────────────────────────────────

@router.get("/admin/mobile-app/waitlist")
async def admin_list_waitlist(limit: int = 200, admin: dict = Depends(get_admin_user)):
    """Admin: list everyone signed up for the mobile launch announcement."""
    limit = max(1, min(limit, 1000))
    cur = db.mobile_app_waitlist.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
    items = await cur.to_list(length=limit)
    total = await db.mobile_app_waitlist.count_documents({})
    return {"items": items, "count": len(items), "total": total}
