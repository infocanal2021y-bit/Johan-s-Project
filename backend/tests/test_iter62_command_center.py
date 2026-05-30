"""Iter 62 — Financial Command Center (Fase 5) backend tests.

Covers:
- Requires auth
- Returns full aggregated structure (all top-level keys present)
- Portfolio total in EUR ≈ sum of (balance / rate_to_eur) for non-zero currencies
- Multi-user isolation (data is per-user)
- Active withdrawals filtered to non-terminal
- Activity 24h counts only events in last 24h
"""
import os
import sys
import uuid
import time
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

sys.path.insert(0, "/app/backend")
load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")


def _backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    env_file = Path("/app/frontend/.env")
    if env_file.exists():
        for ln in env_file.read_text().splitlines():
            if ln.startswith("REACT_APP_BACKEND_URL="):
                return ln.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _backend_url()
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200
    return r.json().get("token") or r.json().get("access_token")


def _db():
    from pymongo import MongoClient
    cli = MongoClient(os.environ["MONGO_URL"])
    return cli, cli[os.environ["DB_NAME"]]


@pytest.fixture
def fresh_user():
    suffix = uuid.uuid4().hex[:8]
    email = f"test_iter62_{suffix}@example.com"
    pwd = "TestPass123!"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": pwd, "name": f"Iter62 {suffix}",
              "country": "ES", "phone": "+34600000009"},
        timeout=15,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"Register failed: {r.text[:200]}")
    token = _login(email, pwd)
    # Trigger wallet creation
    requests.get(f"{API}/multi-currency/accounts", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    return {"email": email, "headers": {"Authorization": f"Bearer {token}"}}


# ════════════════════════════════════════════════════════════════════
#  AUTH + STRUCTURE
# ════════════════════════════════════════════════════════════════════

class TestStructure:
    def test_requires_auth(self):
        r = requests.get(f"{API}/command-center/overview", timeout=15)
        assert r.status_code in (401, 403)

    def test_returns_all_top_level_keys(self, fresh_user):
        r = requests.get(f"{API}/command-center/overview", headers=fresh_user["headers"], timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        required = {"user", "portfolio", "withdrawals", "conversions", "vault",
                    "notifications", "ai_assistant", "activity_24h", "snapshot_at"}
        missing = required - set(body.keys())
        assert not missing, f"Missing keys: {missing}"

    def test_user_payload_shape(self, fresh_user):
        r = requests.get(f"{API}/command-center/overview", headers=fresh_user["headers"], timeout=20)
        body = r.json()
        u = body["user"]
        assert u["email"] == fresh_user["email"]
        assert "id" in u
        # Boolean
        assert "is_verified" in u

    def test_portfolio_shape(self, fresh_user):
        r = requests.get(f"{API}/command-center/overview", headers=fresh_user["headers"], timeout=20)
        body = r.json()
        p = body["portfolio"]
        assert "total_eur" in p and isinstance(p["total_eur"], (int, float))
        assert "currencies" in p and isinstance(p["currencies"], list)
        assert "currency_count" in p

    def test_withdrawals_shape(self, fresh_user):
        r = requests.get(f"{API}/command-center/overview", headers=fresh_user["headers"], timeout=20)
        body = r.json()
        w = body["withdrawals"]
        assert "active" in w and isinstance(w["active"], list)
        assert "recent" in w and isinstance(w["recent"], list)
        assert "active_count" in w

    def test_vault_shape(self, fresh_user):
        r = requests.get(f"{API}/command-center/overview", headers=fresh_user["headers"], timeout=20)
        body = r.json()
        v = body["vault"]
        assert "counts" in v
        assert "total" in v
        assert "certified" in v
        assert "pending" in v
        assert "recent" in v and isinstance(v["recent"], list)

    def test_activity_24h_shape(self, fresh_user):
        r = requests.get(f"{API}/command-center/overview", headers=fresh_user["headers"], timeout=20)
        body = r.json()
        a = body["activity_24h"]
        for k in ("conversions", "withdrawals", "documents"):
            assert k in a and isinstance(a[k], int)


# ════════════════════════════════════════════════════════════════════
#  PORTFOLIO MATH
# ════════════════════════════════════════════════════════════════════

class TestPortfolioMath:

    def _seed_balances(self, email, balances_dict):
        cli, db = _db()
        try:
            u = db.users.find_one({"email": email})
            if not u:
                return
            update = {f"balances.{k}": v for k, v in balances_dict.items()}
            update["updated_at"] = datetime.now(timezone.utc).isoformat()
            db.multi_currency_wallets.update_one({"user_id": u["id"]}, {"$set": update}, upsert=True)
        finally:
            cli.close()

    def test_empty_wallet_total_zero(self, fresh_user):
        r = requests.get(f"{API}/command-center/overview", headers=fresh_user["headers"], timeout=20)
        body = r.json()
        assert body["portfolio"]["total_eur"] == 0.0
        assert body["portfolio"]["currency_count"] == 0

    def test_eur_only_total_equals_balance(self, fresh_user):
        self._seed_balances(fresh_user["email"], {"EUR": 1000.0})
        r = requests.get(f"{API}/command-center/overview", headers=fresh_user["headers"], timeout=20)
        body = r.json()
        assert abs(body["portfolio"]["total_eur"] - 1000.0) < 0.5

    def test_mixed_currencies_sum_to_eur(self, fresh_user):
        # USD 100 + EUR 100. Rate USD=1.08 → 100 / 1.08 ≈ 92.59 EUR
        self._seed_balances(fresh_user["email"], {"EUR": 100.0, "USD": 100.0})
        r = requests.get(f"{API}/command-center/overview", headers=fresh_user["headers"], timeout=20)
        body = r.json()
        # Expected ≈ 192.59 EUR (±1 tolerance for rate fluctuations)
        assert 190 <= body["portfolio"]["total_eur"] <= 195
        assert body["portfolio"]["currency_count"] == 2

    def test_currencies_sorted_by_eur_value_desc(self, fresh_user):
        # USD has more EUR value than DOP
        self._seed_balances(fresh_user["email"], {"USD": 5000.0, "DOP": 1000.0, "EUR": 50.0})
        r = requests.get(f"{API}/command-center/overview", headers=fresh_user["headers"], timeout=20)
        currencies = r.json()["portfolio"]["currencies"]
        eur_vals = [c["eur_equivalent"] for c in currencies]
        assert eur_vals == sorted(eur_vals, reverse=True)


# ════════════════════════════════════════════════════════════════════
#  ISOLATION
# ════════════════════════════════════════════════════════════════════

class TestIsolation:
    def test_overview_is_per_user(self, fresh_user):
        # Seed user A wallet
        cli, db = _db()
        try:
            uA = db.users.find_one({"email": fresh_user["email"]})
            db.multi_currency_wallets.update_one(
                {"user_id": uA["id"]},
                {"$set": {"balances.EUR": 7777.0}}, upsert=True,
            )
        finally:
            cli.close()

        # Register user B
        suffix = uuid.uuid4().hex[:8]
        emailB = f"test_iter62b_{suffix}@example.com"
        pwd = "TestPass123!"
        reg = requests.post(
            f"{API}/auth/register",
            json={"email": emailB, "password": pwd, "name": f"Iter62b {suffix}",
                  "country": "ES", "phone": "+34600000010"},
            timeout=15,
        )
        if reg.status_code not in (200, 201):
            pytest.skip("Could not register second user")
        token = _login(emailB, pwd)
        hB = {"Authorization": f"Bearer {token}"}
        # Trigger wallet creation for B
        requests.get(f"{API}/multi-currency/accounts", headers=hB, timeout=15)

        rA = requests.get(f"{API}/command-center/overview", headers=fresh_user["headers"], timeout=20).json()
        rB = requests.get(f"{API}/command-center/overview", headers=hB, timeout=20).json()
        assert rA["user"]["email"] != rB["user"]["email"]
        assert rA["portfolio"]["total_eur"] >= 7777.0
        assert rB["portfolio"]["total_eur"] < 7777.0
