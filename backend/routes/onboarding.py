"""Onboarding routes — track first-login tour completion server-side."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from config import db
from services.auth import get_current_user

router = APIRouter()


@router.get("/user/onboarding/status")
async def get_status(user: dict = Depends(get_current_user)):
    """Return whether the user has completed the tour."""
    u = await db.users.find_one(
        {"id": user["id"]},
        {"_id": 0, "onboarding_completed_at": 1, "onboarding_dismissed": 1, "onboarding_last_step": 1},
    )
    return {
        "completed": bool((u or {}).get("onboarding_completed_at")),
        "dismissed": bool((u or {}).get("onboarding_dismissed", False)),
        "last_step": int((u or {}).get("onboarding_last_step", 0) or 0),
        "completed_at": (u or {}).get("onboarding_completed_at"),
    }


@router.post("/user/onboarding/progress")
async def save_progress(payload: dict, user: dict = Depends(get_current_user)):
    """Persist the user's current step. Body: `{step: int}`."""
    try:
        step = int(payload.get("step", 0))
    except (TypeError, ValueError):
        step = 0
    step = max(0, min(step, 50))
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"onboarding_last_step": step}},
    )
    return {"ok": True, "step": step}


@router.post("/user/onboarding/complete")
async def complete_tour(user: dict = Depends(get_current_user)):
    """Mark the tour as completed."""
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"onboarding_completed_at": now}},
    )
    return {"ok": True, "completed_at": now}


@router.post("/user/onboarding/dismiss")
async def dismiss_tour(user: dict = Depends(get_current_user)):
    """User explicitly skipped — don't show again automatically."""
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"onboarding_dismissed": True}},
    )
    return {"ok": True}


@router.post("/user/onboarding/reset")
async def reset_tour(user: dict = Depends(get_current_user)):
    """Allow user to retake the tour from the user menu."""
    await db.users.update_one(
        {"id": user["id"]},
        {"$unset": {"onboarding_completed_at": "", "onboarding_dismissed": "", "onboarding_last_step": ""}},
    )
    return {"ok": True}
