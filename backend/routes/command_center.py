"""Financial Command Center · Fase 5.

A single aggregated endpoint that returns a unified snapshot of EVERY core
module for the authenticated user. The frontend renders this as a single-screen
"flight deck" so the user never has to navigate across pages to see their
financial state.

Endpoint:
- GET /command-center/overview → JSON with multidivisa, withdrawals,
  conversions, vault, partial_unlock, kyc, notifications, ai_session_count.
"""
import os
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends

from config import db
from services.auth import get_current_user
from routes.multicurrency import SUPPORTED_CURRENCIES, CURRENCY_META, _ensure_wallet, _get_rate_to_eur


router = APIRouter()
log = logging.getLogger(__name__)


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _strip_id(d):
    if d:
        d.pop("_id", None)
    return d


@router.get("/command-center/overview")
async def overview(user: dict = Depends(get_current_user)):
    """One-stop snapshot for the Command Center page."""
    uid = user["id"]

    # ── 1) Multi-currency wallet + portfolio total in EUR ────────
    wallet = await _ensure_wallet(uid)
    balances = wallet.get("balances") or {}
    pending = wallet.get("pending") or {}

    portfolio_eur = 0.0
    cur_breakdown = []
    for c in SUPPORTED_CURRENCIES:
        bal = float(balances.get(c, 0.0))
        if bal == 0:
            continue
        try:
            r = await _get_rate_to_eur(c)
            eur_value = bal / r if r > 0 else 0
        except Exception:
            eur_value = 0
        portfolio_eur += eur_value
        meta = CURRENCY_META.get(c, {})
        cur_breakdown.append({
            "currency": c,
            "balance": round(bal, meta.get("decimals", 2)),
            "pending": round(float(pending.get(c, 0.0)), meta.get("decimals", 2)),
            "eur_equivalent": round(eur_value, 2),
            "flag": meta.get("flag", ""),
            "symbol": meta.get("symbol", ""),
            "color": meta.get("color", "#1973B8"),
        })
    # Top 4 currencies by EUR value
    cur_breakdown.sort(key=lambda x: x["eur_equivalent"], reverse=True)

    # ── 2) Bank withdrawals (active + recent completed) ──────────
    active_wd = await db.bank_withdrawal_requests.find(
        {"user_id": uid, "status": {"$nin": ["completed", "rejected"]}},
        {"_id": 0, "id": 1, "reference": 1, "status": 1, "from_amount": 1, "from_currency": 1,
         "net_to_amount": 1, "to_currency": 1, "bank_name": 1, "country_flag": 1,
         "created_at": 1, "updated_at": 1},
    ).sort("created_at", -1).limit(5).to_list(5)

    recent_wd = await db.bank_withdrawal_requests.find(
        {"user_id": uid},
        {"_id": 0, "id": 1, "reference": 1, "status": 1, "net_to_amount": 1,
         "to_currency": 1, "bank_name": 1, "created_at": 1},
    ).sort("created_at", -1).limit(5).to_list(5)

    # ── 3) Recent conversions (last 5) ───────────────────────────
    recent_conv = await db.currency_conversions.find(
        {"user_id": uid},
        {"_id": 0, "id": 1, "from_currency": 1, "to_currency": 1, "amount_in": 1,
         "amount_out": 1, "rate": 1, "status": 1, "reference": 1, "created_at": 1},
    ).sort("created_at", -1).limit(5).to_list(5)

    # ── 4) Vault counts + recent docs ────────────────────────────
    vault_pipeline = [
        {"$match": {"user_id": uid}},
        {"$group": {"_id": "$status", "n": {"$sum": 1}}},
    ]
    vault_counts = {}
    async for row in db.vault_documents.aggregate(vault_pipeline):
        vault_counts[row["_id"]] = row["n"]

    recent_vault = await db.vault_documents.find(
        {"user_id": uid},
        {"_id": 0, "id": 1, "name": 1, "status": 1, "sha256": 1, "chain_index": 1,
         "created_at": 1, "category": 1},
    ).sort("created_at", -1).limit(4).to_list(4)
    for d in recent_vault:
        if d.get("sha256"):
            d["sha256_short"] = d["sha256"][:8].upper() + "…" + d["sha256"][-4:].upper()

    # ── 5) Partial unlock 40% (if any) ───────────────────────────
    partial = await db.partial_withdraw_unlocks.find_one(
        {"user_id": uid, "status": {"$nin": ["approved", "rejected"]}},
        {"_id": 0, "id": 1, "status": 1, "payment_reference": 1, "required_eur": 1,
         "payments": 1, "max_withdraw_eur_snapshot": 1, "created_at": 1},
    )
    if partial:
        paid = sum(float(p.get("amount_eur", 0)) for p in (partial.get("payments") or []))
        partial["paid_eur"] = round(paid, 2)
        partial["pending_eur"] = round(max(0, float(partial.get("required_eur", 0)) - paid), 2)
        partial["progress_pct"] = round(min(100, paid / float(partial["required_eur"]) * 100), 1) if partial.get("required_eur") else 0

    # ── 6) KYC / verification ────────────────────────────────────
    user_doc = await db.users.find_one(
        {"id": uid},
        {"_id": 0, "kyc_status": 1, "country": 1, "name": 1, "email": 1, "created_at": 1, "is_verified": 1},
    )

    # ── 7) Notifications: 5 most recent unread ──────────────────
    notifications = await db.notifications.find(
        {"user_id": uid},
        {"_id": 0, "id": 1, "title": 1, "message": 1, "read": 1, "created_at": 1},
    ).sort("created_at", -1).limit(5).to_list(5)
    unread_count = await db.notifications.count_documents({"user_id": uid, "read": {"$ne": True}})

    # ── 8) AI assistant: session count ───────────────────────────
    ai_sessions = await db.ai_chat_sessions.count_documents({"user_id": uid})

    # ── 9) 24-hour movement summary ──────────────────────────────
    yesterday = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    conv_24h = await db.currency_conversions.count_documents(
        {"user_id": uid, "created_at": {"$gte": yesterday}},
    )
    wd_24h = await db.bank_withdrawal_requests.count_documents(
        {"user_id": uid, "created_at": {"$gte": yesterday}},
    )
    doc_24h = await db.vault_documents.count_documents(
        {"user_id": uid, "created_at": {"$gte": yesterday}},
    )

    return {
        "user": {
            "id": uid,
            "name": user_doc.get("name") if user_doc else user.get("name"),
            "email": user_doc.get("email") if user_doc else user.get("email"),
            "kyc_status": (user_doc or {}).get("kyc_status"),
            "is_verified": (user_doc or {}).get("is_verified", False),
            "country": (user_doc or {}).get("country"),
            "member_since": (user_doc or {}).get("created_at"),
        },
        "portfolio": {
            "total_eur": round(portfolio_eur, 2),
            "currencies": cur_breakdown[:6],
            "currency_count": len(cur_breakdown),
        },
        "withdrawals": {
            "active": active_wd,
            "recent": recent_wd,
            "active_count": len(active_wd),
        },
        "conversions": {
            "recent": recent_conv,
        },
        "vault": {
            "counts": vault_counts,
            "total": sum(vault_counts.values()),
            "certified": vault_counts.get("certified", 0),
            "pending": vault_counts.get("pending", 0),
            "recent": recent_vault,
        },
        "partial_unlock": partial,
        "notifications": {
            "items": notifications,
            "unread_count": unread_count,
        },
        "ai_assistant": {
            "session_count": ai_sessions,
        },
        "activity_24h": {
            "conversions": conv_24h,
            "withdrawals": wd_24h,
            "documents": doc_24h,
        },
        "snapshot_at": _now_iso(),
    }
