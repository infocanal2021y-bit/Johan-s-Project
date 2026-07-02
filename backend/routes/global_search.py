"""Global Search — unified header search across cases and users.

`GET /api/search/global?q=...`

Role-aware:
- Regular user → searches ONLY their own cases (by PLB code, entity_ref, summary).
- Admin       → searches ALL cases + users (by name / email).

Response
--------
{
  "cases": [ { code, entity_type, entity_ref, summary, status, user_id,
               user_email, user_name, nav_path, type_label, created_at } ],
  "users": [ { id, name, email, role, verification_status } ],   # admin only
  "count": { "cases": N, "users": M }
}
"""
import re
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from config import db
from services.auth import get_current_user


router = APIRouter()
log = logging.getLogger(__name__)


ENTITY_NAV = {
    "withdrawal":          ("/wallet/bank-withdrawal", "Retiro bancario"),
    "support_ticket":      ("/support",                "Ticket de soporte"),
    "partial_unlock":      ("/partial-unlock",         "Liberación parcial"),
    "mt5_deposit":         ("/mt5",                    "Depósito MT5"),
    "vault_doc":           ("/wallet/vault",           "Documento Vault"),
    "bank_transfer_proof": ("/withdraw",               "Transferencia bancaria"),
    "bank_certificate":    ("/wallet/vault",           "Certificado bancario"),
}


def _enrich_case(c: dict, user_name: Optional[str] = None) -> dict:
    nav_path, type_label = ENTITY_NAV.get(c.get("entity_type"), (None, c.get("entity_type", "—")))
    return {
        "code": c.get("code"),
        "entity_type": c.get("entity_type"),
        "entity_ref": c.get("entity_ref"),
        "summary": c.get("summary"),
        "status": c.get("status"),
        "user_id": c.get("user_id"),
        "user_email": c.get("user_email"),
        "user_name": user_name,
        "created_at": c.get("created_at"),
        "nav_path": nav_path,
        "type_label": type_label,
    }


@router.get("/search/global")
async def global_search(
    q: str = Query(..., min_length=2, max_length=100),
    user: dict = Depends(get_current_user),
    limit: int = Query(15, le=50),
):
    """Unified search bar endpoint (role-aware)."""
    query = q.strip()
    pattern = re.escape(query)
    is_admin = user.get("role") == "admin"

    # ---- CASES ----------------------------------------------------------
    case_filter_or = [
        {"code":       {"$regex": pattern, "$options": "i"}},
        {"entity_ref": {"$regex": pattern, "$options": "i"}},
        {"summary":    {"$regex": pattern, "$options": "i"}},
    ]
    if is_admin:
        # allow admin to also match user_email inside cases
        case_filter_or.append({"user_email": {"$regex": pattern, "$options": "i"}})
        case_filter = {"$or": case_filter_or}
    else:
        case_filter = {"user_id": user["id"], "$or": case_filter_or}

    case_docs = await db.cases.find(case_filter, {"_id": 0}) \
        .sort("created_at", -1).limit(limit).to_list(length=limit)

    # ---- USERS (admin only) --------------------------------------------
    users: list[dict] = []
    user_cases: list[dict] = []
    if is_admin:
        u_cur = db.users.find(
            {
                "$or": [
                    {"name":  {"$regex": pattern, "$options": "i"}},
                    {"email": {"$regex": pattern, "$options": "i"}},
                    {"id":    {"$regex": f"^{pattern}", "$options": "i"}},
                ],
            },
            {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1, "verification_status": 1, "account_status": 1},
        ).limit(limit)
        users = await u_cur.to_list(length=limit)

        # Also pull the most recent cases for the matched users (max 3 per user)
        for u in users[:5]:
            u_cases = await db.cases.find(
                {"user_id": u["id"]},
                {"_id": 0},
            ).sort("created_at", -1).limit(3).to_list(3)
            for uc in u_cases:
                user_cases.append(_enrich_case(uc, user_name=u.get("name")))

    # ---- Attach user names to case results (admin view) ----------------
    enriched_cases: list[dict] = []
    if is_admin and case_docs:
        uids = list({c.get("user_id") for c in case_docs if c.get("user_id")})
        u_docs = await db.users.find(
            {"id": {"$in": uids}},
            {"_id": 0, "id": 1, "name": 1},
        ).to_list(length=len(uids))
        name_map = {u["id"]: u.get("name") for u in u_docs}
        for c in case_docs:
            enriched_cases.append(_enrich_case(c, user_name=name_map.get(c.get("user_id"))))
    else:
        enriched_cases = [_enrich_case(c) for c in case_docs]

    # Merge user_cases dedup by `code`
    seen_codes = {c["code"] for c in enriched_cases}
    for uc in user_cases:
        if uc["code"] not in seen_codes:
            enriched_cases.append(uc)
            seen_codes.add(uc["code"])

    return {
        "cases": enriched_cases[:limit],
        "users": users if is_admin else [],
        "count": {"cases": len(enriched_cases[:limit]), "users": len(users)},
        "is_admin": is_admin,
    }
