"""Live exchange rates service · Fase 6 ajuste.

Fetches real-time FX rates from `open.er-api.com` (free, no API key, supports
EUR · USD · GBP · DOP · MXN · COP and 160+ currencies). Rates are cached in
MongoDB collection `exchange_rates_live` with a TTL of 30 minutes so we don't
hit the API on every request.

Resolution order used by `/api/multi-currency/rates`:
    1. Admin override   (`exchange_rates_admin.{pair}.rate`)   → "admin"
    2. Live cache       (`exchange_rates_live.{currency}`)     → "live"
    3. Hard-coded fallback                                     → "fallback"

Cache row shape:
    { currency: 'USD', rate: 1.0812, source: 'open.er-api.com',
      fetched_at: '2026-02-...', expires_at: '2026-02-...' }
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

import httpx

from config import db


log = logging.getLogger(__name__)

LIVE_API_URL = "https://open.er-api.com/v6/latest/EUR"
LIVE_API_NAME = "open.er-api.com"
CACHE_TTL_MIN = 30

# Currencies we maintain live (BTC is excluded — different provider needed)
LIVE_CURRENCIES = ["USD", "GBP", "DOP", "MXN", "COP"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


async def _fetch_remote() -> Optional[Dict[str, float]]:
    """Calls the external API. Returns {currency: rate_from_eur} or None on failure."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(LIVE_API_URL)
            r.raise_for_status()
            data = r.json()
            if data.get("result") != "success":
                log.warning("[fx-live] API returned non-success: %s", data.get("result"))
                return None
            rates = data.get("rates") or {}
            out: Dict[str, float] = {}
            for cur in LIVE_CURRENCIES:
                v = rates.get(cur)
                if isinstance(v, (int, float)) and v > 0:
                    out[cur] = float(v)
            return out
    except Exception as e:
        log.warning("[fx-live] fetch failed: %s", e)
        return None


async def _persist_cache(rates: Dict[str, float]) -> str:
    """Upsert rates in the cache collection. Returns the fetched_at timestamp."""
    now = _now()
    expires = now + timedelta(minutes=CACHE_TTL_MIN)
    fetched_iso = _iso(now)
    expires_iso = _iso(expires)
    for cur, rate in rates.items():
        await db.exchange_rates_live.update_one(
            {"currency": cur},
            {
                "$set": {
                    "currency": cur,
                    "rate": float(rate),
                    "source": LIVE_API_NAME,
                    "fetched_at": fetched_iso,
                    "expires_at": expires_iso,
                }
            },
            upsert=True,
        )
    return fetched_iso


async def refresh_live_rates(force: bool = False) -> dict:
    """Re-fetch live rates if cache is stale (or `force=True`). Returns status dict."""
    if not force:
        any_row = await db.exchange_rates_live.find_one(
            {}, {"_id": 0, "expires_at": 1}, sort=[("fetched_at", -1)]
        )
        if any_row and any_row.get("expires_at"):
            try:
                exp = datetime.fromisoformat(any_row["expires_at"])
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                if exp > _now():
                    return {"refreshed": False, "reason": "cache_fresh", "expires_at": any_row["expires_at"]}
            except Exception:
                pass

    rates = await _fetch_remote()
    if not rates:
        return {"refreshed": False, "reason": "fetch_failed"}
    ts = await _persist_cache(rates)
    return {"refreshed": True, "fetched_at": ts, "source": LIVE_API_NAME, "count": len(rates)}


async def get_live_rate(currency: str) -> Optional[dict]:
    """Returns {rate, source, fetched_at} or None if no cache entry."""
    if currency == "EUR":
        return {"rate": 1.0, "source": LIVE_API_NAME, "fetched_at": _iso(_now())}
    if currency not in LIVE_CURRENCIES:
        return None
    # Self-refresh if expired (best effort, never blocks too long)
    try:
        await refresh_live_rates(force=False)
    except Exception:
        pass
    doc = await db.exchange_rates_live.find_one({"currency": currency}, {"_id": 0})
    if not doc:
        return None
    return {
        "rate": float(doc.get("rate") or 0),
        "source": doc.get("source") or LIVE_API_NAME,
        "fetched_at": doc.get("fetched_at"),
    }


async def get_all_live_rates() -> dict:
    """Returns the full cache (used by the UI to show last update per currency)."""
    rows = await db.exchange_rates_live.find({}, {"_id": 0}).to_list(50)
    return {r["currency"]: r for r in rows}
