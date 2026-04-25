"""Tests for MT5 Investment Hub endpoints (iteration_34).

Covers:
- GET /mt5-hub/limits
- GET /mt5-hub/global-feed
- GET /mt5-hub/blockchain-txs (received / paid / invalid)
- POST /mt5-invest/reserve (happy + 4 validation cases)
- GET /mt5-invest/reservations
"""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://compliance-dash-32.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PWD = "LionsBit2026!"


# ── Fixtures ──────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PWD})
    if r.status_code != 200:
        pytest.skip(f"Auth failed: {r.status_code} {r.text[:200]}")
    tok = r.json().get("access_token") or r.json().get("token")
    if not tok:
        pytest.skip("No token in login response")
    return tok


@pytest.fixture(scope="module")
def auth_session(session, auth_token):
    session.headers.update({"Authorization": f"Bearer {auth_token}"})
    return session


# ── /mt5-hub/limits ───────────────────────────────────────────────
class TestHubLimits:
    def test_limits_contract(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/mt5-hub/limits")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["min_invest_eur"] == 300
        assert data["min_topup_eur"] == 200
        assert data["max_partial_withdraw_pct"] == 30
        kyc = data.get("kyc")
        assert isinstance(kyc, dict)
        for k in ("status", "level", "label", "tone", "documents_required"):
            assert k in kyc, f"Missing kyc.{k}"
        assert isinstance(kyc["documents_required"], list)
        assert kyc["tone"] in ("emerald", "amber", "slate", "rose")
        assert kyc["level"] in (0, 1, 2, 3)


# ── /mt5-hub/global-feed ──────────────────────────────────────────
class TestGlobalFeed:
    def test_global_feed_contract(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/mt5-hub/global-feed")
        assert r.status_code == 200, r.text
        data = r.json()
        items = data.get("items")
        assert isinstance(items, list) and len(items) > 0
        assert "total_24h_eur" in data
        # Spot-check schema of one item
        first = items[0]
        for k in ("id", "name", "country", "flag", "city", "amount_eur", "method", "method_color", "when_iso", "minutes_ago"):
            assert k in first, f"Missing {k}"
        assert isinstance(first["amount_eur"], (int, float))


# ── /mt5-hub/blockchain-txs ───────────────────────────────────────
class TestBlockchainTxs:
    def test_received(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/mt5-hub/blockchain-txs", params={"direction": "received"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["direction"] == "received"
        assert isinstance(data["items"], list)
        assert data["count"] == len(data["items"])

    def test_paid(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/mt5-hub/blockchain-txs", params={"direction": "paid"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["direction"] == "paid"
        assert isinstance(data["items"], list)
        assert data["count"] == len(data["items"])

    def test_invalid_direction(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/mt5-hub/blockchain-txs", params={"direction": "sideways"})
        assert r.status_code == 400, r.text


# ── /mt5-invest/reserve ───────────────────────────────────────────
def _future_iso(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


class TestReserve:
    def test_reserve_happy(self, auth_session):
        payload = {
            "amount_eur": 500,
            "method": "usdt_trc20",
            "target_date": _future_iso(7),
        }
        r = auth_session.post(f"{BASE_URL}/api/mt5-invest/reserve", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        res = data["reservation"]
        for k in ("id", "amount_eur", "method", "target_date", "status", "created_at", "expires_at"):
            assert k in res, f"Missing {k}"
        assert res["status"] == "reserved"
        assert res["amount_eur"] == 500.0
        # expires_at should be ~24h from now
        exp = datetime.fromisoformat(res["expires_at"].replace("Z", "+00:00"))
        delta = exp - datetime.now(timezone.utc)
        assert timedelta(hours=23, minutes=30) < delta < timedelta(hours=24, minutes=30)

    def test_reserve_amount_too_low(self, auth_session):
        r = auth_session.post(f"{BASE_URL}/api/mt5-invest/reserve", json={
            "amount_eur": 100, "method": "usdt_trc20", "target_date": _future_iso(7),
        })
        assert r.status_code == 400, r.text

    def test_reserve_past_date(self, auth_session):
        past = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        r = auth_session.post(f"{BASE_URL}/api/mt5-invest/reserve", json={
            "amount_eur": 500, "method": "usdt_trc20", "target_date": past,
        })
        assert r.status_code == 400, r.text

    def test_reserve_too_far_future(self, auth_session):
        r = auth_session.post(f"{BASE_URL}/api/mt5-invest/reserve", json={
            "amount_eur": 500, "method": "usdt_trc20", "target_date": _future_iso(200),
        })
        assert r.status_code == 400, r.text

    def test_reserve_missing_target_date(self, auth_session):
        r = auth_session.post(f"{BASE_URL}/api/mt5-invest/reserve", json={
            "amount_eur": 500, "method": "usdt_trc20",
        })
        assert r.status_code == 400, r.text


# ── /mt5-invest/reservations ──────────────────────────────────────
class TestReservationsList:
    def test_list_reservations(self, auth_session):
        # Ensure at least one exists
        auth_session.post(f"{BASE_URL}/api/mt5-invest/reserve", json={
            "amount_eur": 350, "method": "btc", "target_date": _future_iso(5),
        })
        r = auth_session.get(f"{BASE_URL}/api/mt5-invest/reservations")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data["items"], list)
        assert data["count"] == len(data["items"])
        # Sort desc check (created_at)
        if len(data["items"]) >= 2:
            ts = [x["created_at"] for x in data["items"]]
            assert ts == sorted(ts, reverse=True)
        # No mongo _id leakage
        for it in data["items"]:
            assert "_id" not in it
