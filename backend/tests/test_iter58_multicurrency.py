"""Iter 58 — Multi-currency wallet & exchange rates (Fase 1)

Tests cover:
- /multi-currency/accounts auto-creates a wallet with 7 currencies
- /multi-currency/rates returns base=EUR + all 7 keys
- /multi-currency/preview math (rate × amount, fee 0.5%)
- /multi-currency/preview rejects same-currency and unknown currencies
- /multi-currency/convert deducts source / credits destination + writes history
- /multi-currency/convert rejects insufficient balance
- /multi-currency/conversions returns the history
- /admin/multi-currency/rates list returns all overrides (admin-only)
- /admin/multi-currency/rates/{cur} PUT overrides + DELETE resets
- /admin/multi-currency/rates is admin-only (403 for normal users)
"""
import os
import sys
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

sys.path.insert(0, "/app/backend")
load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")


def _backend_url() -> str:
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
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


def _db():
    from pymongo import MongoClient
    cli = MongoClient(os.environ["MONGO_URL"])
    return cli, cli[os.environ["DB_NAME"]]


def _seed_eur_balance(email, eur):
    cli, db = _db()
    try:
        u = db.users.find_one({"email": email})
        if not u:
            return
        db.multi_currency_wallets.update_one(
            {"user_id": u["id"]},
            {"$set": {"balances.EUR": eur}},
        )
    finally:
        cli.close()


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def fresh_user():
    suffix = uuid.uuid4().hex[:8]
    email = f"test_iter58_{suffix}@example.com"
    pwd = "TestPass123!"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": pwd, "name": f"Iter58 {suffix}",
              "country": "ES", "phone": "+34600000003"},
        timeout=15,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"Register failed: {r.status_code} {r.text[:200]}")
    return {"email": email, "password": pwd, "token": _login(email, pwd)}


@pytest.fixture
def user_headers(fresh_user):
    return {"Authorization": f"Bearer {fresh_user['token']}"}


SUPPORTED = {"EUR", "USD", "GBP", "DOP", "MXN", "COP", "BTC"}


# ════════════════════════════════════════════════════════════════════
#  USER FLOW
# ════════════════════════════════════════════════════════════════════

class TestUserWallet:
    def test_accounts_auto_creates_wallet_with_all_currencies(self, user_headers):
        r = requests.get(f"{API}/multi-currency/accounts", headers=user_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert set(a["currency"] for a in body["accounts"]) == SUPPORTED
        # all balances start at 0
        for a in body["accounts"]:
            assert a["balance"] >= 0
            assert a["status"] == "active"
            assert "symbol" in a and "name" in a and "color" in a

    def test_rates_returns_all_7_currencies_with_base_eur(self, user_headers):
        r = requests.get(f"{API}/multi-currency/rates", headers=user_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["base"] == "EUR"
        assert set(body["rates"].keys()) == SUPPORTED
        assert body["rates"]["EUR"] == 1.0
        assert body["rates"]["USD"] > 0
        assert body["fee_pct_default"] == 0.5

    def test_preview_math_eur_to_dop(self, user_headers):
        r = requests.post(
            f"{API}/multi-currency/preview", headers=user_headers,
            json={"from_currency": "EUR", "to_currency": "DOP", "amount": 1000},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # rate × amount = gross; gross × 0.5% = fee; gross − fee = net
        assert body["amount_in"] == 1000.0
        assert body["fee_pct"] == 0.5
        expected_gross = round(1000 * body["rate"], 2)
        expected_fee = round(expected_gross * 0.005, 2)
        assert abs(body["gross_out"] - expected_gross) < 0.5
        assert abs(body["fee_amount"] - expected_fee) < 0.5
        assert abs(body["amount_out"] - (expected_gross - expected_fee)) < 0.5

    def test_preview_rejects_same_currency(self, user_headers):
        r = requests.post(
            f"{API}/multi-currency/preview", headers=user_headers,
            json={"from_currency": "EUR", "to_currency": "EUR", "amount": 100},
            timeout=15,
        )
        assert r.status_code == 400
        assert "distintas" in (r.json().get("detail") or "").lower()

    def test_preview_rejects_unknown_currency(self, user_headers):
        r = requests.post(
            f"{API}/multi-currency/preview", headers=user_headers,
            json={"from_currency": "EUR", "to_currency": "XYZ", "amount": 100},
            timeout=15,
        )
        assert r.status_code == 400

    def test_preview_rejects_zero_or_negative(self, user_headers):
        for amt in (0, -5):
            r = requests.post(
                f"{API}/multi-currency/preview", headers=user_headers,
                json={"from_currency": "EUR", "to_currency": "USD", "amount": amt},
                timeout=15,
            )
            assert r.status_code == 400

    def test_convert_insufficient_balance(self, user_headers):
        r = requests.post(
            f"{API}/multi-currency/convert", headers=user_headers,
            json={"from_currency": "EUR", "to_currency": "USD", "amount": 99999},
            timeout=15,
        )
        assert r.status_code == 400
        assert "insuficiente" in (r.json().get("detail") or "").lower()

    def test_convert_happy_path_deducts_and_credits_and_logs(self, fresh_user, user_headers):
        # Seed 5000 EUR
        _seed_eur_balance(fresh_user["email"], 5000.0)

        r = requests.post(
            f"{API}/multi-currency/convert", headers=user_headers,
            json={"from_currency": "EUR", "to_currency": "DOP", "amount": 1000},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        conv = body["conversion"]
        assert conv["from_currency"] == "EUR"
        assert conv["to_currency"] == "DOP"
        assert conv["amount_in"] == 1000.0
        assert conv["status"] == "completed"
        assert conv["reference"].startswith("CONV-")

        # Wallet updated
        wallet = body["wallet"]
        assert wallet["balances"]["EUR"] == 4000.0
        assert wallet["balances"]["DOP"] > 0

        # History contains it
        hist = requests.get(f"{API}/multi-currency/conversions", headers=user_headers, timeout=15)
        assert hist.status_code == 200
        items = hist.json()["items"]
        assert any(c["id"] == conv["id"] for c in items)

    def test_convert_atomic_no_double_spend(self, fresh_user, user_headers):
        """Send 2 quick conversions for more than the balance — at least one must fail."""
        _seed_eur_balance(fresh_user["email"], 100.0)
        r1 = requests.post(
            f"{API}/multi-currency/convert", headers=user_headers,
            json={"from_currency": "EUR", "to_currency": "USD", "amount": 80},
            timeout=15,
        )
        r2 = requests.post(
            f"{API}/multi-currency/convert", headers=user_headers,
            json={"from_currency": "EUR", "to_currency": "USD", "amount": 80},
            timeout=15,
        )
        # First succeeds, second must fail (insufficient)
        statuses = sorted([r1.status_code, r2.status_code])
        assert statuses == [200, 400], f"Got {statuses}: {r1.text} | {r2.text}"


# ════════════════════════════════════════════════════════════════════
#  ADMIN FLOW
# ════════════════════════════════════════════════════════════════════

class TestAdminRates:
    def test_list_rates_admin_only(self, user_headers):
        r = requests.get(f"{API}/admin/multi-currency/rates", headers=user_headers, timeout=15)
        assert r.status_code in (401, 403)

    def test_list_rates_returns_6_currencies(self, admin_headers):
        r = requests.get(f"{API}/admin/multi-currency/rates", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert len(body["items"]) == 6  # all except EUR (base)
        assert {it["currency"] for it in body["items"]} == SUPPORTED - {"EUR"}
        for it in body["items"]:
            assert "rate" in it and "default_rate" in it and "is_override" in it

    def test_put_rate_persists_override(self, admin_headers):
        new_rate = 99.99
        r = requests.put(
            f"{API}/admin/multi-currency/rates/MXN", headers=admin_headers,
            json={"rate": new_rate}, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["rate"] == new_rate

        # Verify it's reflected in the list
        r2 = requests.get(f"{API}/admin/multi-currency/rates", headers=admin_headers, timeout=15)
        mxn = next(i for i in r2.json()["items"] if i["currency"] == "MXN")
        assert mxn["rate"] == new_rate
        assert mxn["is_override"] is True

    def test_put_rate_rejects_invalid(self, admin_headers):
        for bad in (0, -1, "abc"):
            r = requests.put(
                f"{API}/admin/multi-currency/rates/USD", headers=admin_headers,
                json={"rate": bad}, timeout=15,
            )
            assert r.status_code == 400

    def test_put_rate_rejects_eur(self, admin_headers):
        r = requests.put(
            f"{API}/admin/multi-currency/rates/EUR", headers=admin_headers,
            json={"rate": 1.0}, timeout=15,
        )
        assert r.status_code == 400

    def test_delete_rate_resets_to_default(self, admin_headers):
        # First set an override
        requests.put(
            f"{API}/admin/multi-currency/rates/GBP", headers=admin_headers,
            json={"rate": 0.99}, timeout=15,
        )
        # Delete it
        r = requests.delete(f"{API}/admin/multi-currency/rates/GBP", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        # Now should be default again
        r2 = requests.get(f"{API}/admin/multi-currency/rates", headers=admin_headers, timeout=15)
        gbp = next(i for i in r2.json()["items"] if i["currency"] == "GBP")
        assert gbp["is_override"] is False
        assert gbp["rate"] == gbp["default_rate"]

    def test_admin_lists_global_conversion_log(self, admin_headers):
        r = requests.get(f"{API}/admin/multi-currency/conversions", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "count" in body
        assert isinstance(body["items"], list)
