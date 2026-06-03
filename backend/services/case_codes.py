"""Unified case codes — PLB-YYYY-XXXXXX.

Single source of truth for the human-readable case codes a user receives every
time something is created in the platform (withdrawal, support ticket, partial
unlock, etc.). The legacy entity-specific references (`BW-...`, `tk-...`) are
preserved on the entity row; this service simply links them to a unified code.

Collection: `cases`
    { code: 'PLB-2026-584721',
      user_id, user_email,
      entity_type: 'withdrawal' | 'support_ticket' | 'partial_unlock' | 'mt5_deposit' | 'vault_doc',
      entity_id, entity_ref,
      summary, status,
      created_at, updated_at }
"""
import logging
import random
from datetime import datetime, timezone
from typing import Optional

from config import db


log = logging.getLogger(__name__)


def _year() -> int:
    return datetime.now(timezone.utc).year


def _gen() -> str:
    """Generates a candidate `PLB-YYYY-XXXXXX` code (6 digits, year-prefixed)."""
    return f"PLB-{_year()}-{random.randint(100000, 999999)}"


async def generate_case_code(
    *,
    user_id: str,
    user_email: Optional[str],
    entity_type: str,
    entity_id: str,
    entity_ref: Optional[str] = None,
    summary: Optional[str] = None,
    status: Optional[str] = None,
) -> str:
    """Allocate a brand new case code, persist it, return it.

    Uniqueness is enforced via a quick existence check + retry (max 5 attempts).
    Collisions are extremely rare (9×10^5 space per year).
    """
    code = _gen()
    for _ in range(5):
        exists = await db.cases.find_one({"code": code}, {"_id": 0, "code": 1})
        if not exists:
            break
        code = _gen()

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "code": code,
        "user_id": user_id,
        "user_email": user_email,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_ref": entity_ref,
        "summary": (summary or '')[:200],
        "status": status or 'open',
        "created_at": now,
        "updated_at": now,
    }
    try:
        await db.cases.insert_one(doc)
    except Exception as e:
        log.warning("[cases] insert failed for %s/%s: %s", entity_type, entity_id, e)
    return code


async def update_case_status(*, entity_type: str, entity_id: str, status: str, summary: Optional[str] = None) -> None:
    """Update the case row when the underlying entity changes status.

    Idempotent — safe to call repeatedly. Updates the `updated_at` timestamp.
    """
    update = {
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if summary is not None:
        update["summary"] = summary[:200]
    try:
        await db.cases.update_one(
            {"entity_type": entity_type, "entity_id": entity_id},
            {"$set": update},
        )
    except Exception as e:
        log.warning("[cases] update_status failed %s/%s: %s", entity_type, entity_id, e)


async def get_case_by_entity(entity_type: str, entity_id: str) -> Optional[dict]:
    """Returns the case row for a given entity, or None."""
    return await db.cases.find_one(
        {"entity_type": entity_type, "entity_id": entity_id},
        {"_id": 0},
    )
