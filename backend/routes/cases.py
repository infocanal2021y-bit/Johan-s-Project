"""User-facing case lookup endpoints.

`/api/cases/me`              → my recent cases (sortable, filterable by type)
`/api/cases/lookup/{code}`   → resolve a single code (must belong to caller)
`/api/cases/search?q=...`    → fuzzy search by code, ref or summary (own only)
"""
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Query

from config import db
from services.auth import get_current_user


router = APIRouter()
log = logging.getLogger(__name__)


# How to deep-link from a case to its underlying flow in the UI
ENTITY_NAV = {
    "withdrawal":     ("/wallet/bank-withdrawal", "Retiro bancario"),
    "support_ticket": ("/support",                "Ticket de soporte"),
    "partial_unlock": ("/partial-unlock",         "Liberación parcial"),
    "mt5_deposit":    ("/mt5",                    "Depósito MT5"),
    "vault_doc":      ("/wallet/vault",           "Documento Vault"),
}


def _enrich(case: dict) -> dict:
    nav_path, type_label = ENTITY_NAV.get(case.get("entity_type"), (None, case.get("entity_type", "—")))
    return {**case, "nav_path": nav_path, "type_label": type_label}


@router.get("/cases/me")
async def my_cases(
    user: dict = Depends(get_current_user),
    entity_type: str = Query(None, description="Filter by entity_type"),
    status: str = Query(None, description="Filter by status"),
    limit: int = Query(50, le=200),
):
    """Returns the caller's cases newest-first."""
    query = {"user_id": user["id"]}
    if entity_type:
        query["entity_type"] = entity_type
    if status:
        query["status"] = status

    cur = db.cases.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
    items = await cur.to_list(length=limit)
    items = [_enrich(c) for c in items]
    total = await db.cases.count_documents({"user_id": user["id"]})
    by_type = {}
    for c in items:
        by_type[c.get("entity_type", "other")] = by_type.get(c.get("entity_type", "other"), 0) + 1
    return {"items": items, "count": len(items), "total": total, "by_type": by_type}


@router.get("/cases/lookup/{code}")
async def lookup_case(code: str, user: dict = Depends(get_current_user)):
    """Resolve a single case code. Must belong to the caller (or 404)."""
    code = code.strip().upper()
    if not re.match(r"^PLB-\d{4}-\d{6}$", code):
        raise HTTPException(400, "Formato de código inválido. Esperado: PLB-AAAA-XXXXXX")
    case = await db.cases.find_one({"code": code, "user_id": user["id"]}, {"_id": 0})
    if not case:
        raise HTTPException(404, f"No se encontró el caso {code} en su cuenta")
    return _enrich(case)


@router.get("/cases/search")
async def search_cases(
    q: str = Query(..., min_length=2),
    user: dict = Depends(get_current_user),
    limit: int = Query(20, le=100),
):
    """Fuzzy search by code, entity_ref or summary (own cases only)."""
    pattern = re.escape(q.strip())
    cur = db.cases.find(
        {
            "user_id": user["id"],
            "$or": [
                {"code":       {"$regex": pattern, "$options": "i"}},
                {"entity_ref": {"$regex": pattern, "$options": "i"}},
                {"summary":    {"$regex": pattern, "$options": "i"}},
            ],
        },
        {"_id": 0},
    ).sort("created_at", -1).limit(limit)
    items = await cur.to_list(length=limit)
    return {"items": [_enrich(c) for c in items], "count": len(items)}
