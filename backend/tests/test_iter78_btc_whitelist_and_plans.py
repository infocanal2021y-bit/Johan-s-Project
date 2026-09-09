"""Iter 78 — BTC whitelist + security lock + withdrawal plans.

Covers:
  * POST /api/btc-wallets (whitelist create, duplicate & invalid errors, lock activation)
  * GET  /api/btc-wallets (lock info + remaining_seconds)
  * POST /api/btc-withdrawal/initiate (403 during lock, trusted vs additional_review)
  * Admin whitelist listing / approve / settings / lift-lock
  * Withdrawal plans (create tranches, second-plan guard, approve, execute, complete, reject, cancel)
"""
import os
import time
from datetime import datetime, timezone
from typing import Optional

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

_fe = dotenv_values("/app/frontend/.env")
_be = dotenv_values("/app/backend/.env")
BASE_URL = _fe["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = _be["MONGO_URL"]
DB_NAME = _be["DB_NAME"]

ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASS = "LionsBit2026!"
USER_EMAIL = "manclic@yahoo.es"
USER_PASS = "FX2026"

VALID_ADDR = "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"          # P2SH valid
VALID_ADDR_2 = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"  # segwit valid (no whitelist)
INVALID_ADDR = "1notavalidbtcaddress123456"


# ── Mongo (for setup / teardown) ──
_mongo = MongoClient(MONGO_URL)
db = _mongo[DB_NAME]


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    data = r.json()
    if data.get("requires_2fa"):
        # Pull latest challenge for this user from db and find code via log? use pymongo.
        # We can't recover the code (hashed). Skip if 2FA enabled.
        pytest.skip(f"2FA active for {email}; can't automate here")
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token: {data}"
    return tok


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="session")
def user_token():
    return _login(USER_EMAIL, USER_PASS)


@pytest.fixture(scope="session")
def user_id(user_token):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {user_token}"}, timeout=10)
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="session", autouse=True)
def clean_state(user_id, admin_token):
    """Ensure manclic starts clean; also restore state at teardown."""
    db.btc_wallet_whitelist.delete_many({"user_id": user_id})
    db.btc_withdrawal_requests.delete_many({"user_id": user_id})
    db.withdrawal_plans.delete_many({"user_id": user_id})
    db.users.update_one({"id": user_id}, {"$unset": {"btc_withdrawal_lock_until": ""}})
    # reset settings to default 48
    requests.put(f"{API}/admin/btc-security-settings", json={"lock_hours": 48},
                 headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
    yield
    # Teardown cleanup
    db.btc_wallet_whitelist.delete_many({"user_id": user_id})
    db.btc_withdrawal_requests.delete_many({"user_id": user_id})
    db.withdrawal_plans.delete_many({"user_id": user_id})
    db.users.update_one({"id": user_id}, {"$unset": {"btc_withdrawal_lock_until": ""}})
    requests.put(f"{API}/admin/btc-security-settings", json={"lock_hours": 48},
                 headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)


def _uh(tok): return {"Authorization": f"Bearer {tok}"}


# ═══════════════════════ Whitelist + lock ═══════════════════════

class TestWhitelistAndLock:
    def test_01_register_wallet_invalid(self, user_token):
        r = requests.post(f"{API}/btc-wallets", json={"address": INVALID_ADDR, "label": "bad"},
                          headers=_uh(user_token), timeout=10)
        assert r.status_code == 400

    def test_02_register_wallet_ok_activates_lock(self, user_token, user_id):
        r = requests.post(f"{API}/btc-wallets", json={"address": VALID_ADDR, "label": "QA Trust"},
                          headers=_uh(user_token), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["wallet"]["status"] == "pending_review"
        assert data["wallet"]["address"] == VALID_ADDR
        assert data["lock"]["locked"] is True
        assert data["lock"]["remaining_seconds"] > 47 * 3600
        # persisted?
        g = requests.get(f"{API}/btc-wallets", headers=_uh(user_token), timeout=10).json()
        assert g["lock"]["locked"] is True
        assert g["lock_hours"] == 48
        assert len(g["wallets"]) == 1

    def test_03_register_wallet_duplicate(self, user_token):
        r = requests.post(f"{API}/btc-wallets", json={"address": VALID_ADDR, "label": "dup"},
                          headers=_uh(user_token), timeout=10)
        assert r.status_code == 400

    def test_04_initiate_blocked_during_lock(self, user_token):
        r = requests.post(f"{API}/btc-withdrawal/initiate", json={
            "amount_eur": 1000, "btc_address": VALID_ADDR, "address_confirmed": True,
        }, headers=_uh(user_token), timeout=10)
        assert r.status_code == 403, r.text
        assert "Tiempo restante" in r.text or "bloqueado" in r.text.lower()

    def test_05_admin_list_whitelist(self, admin_token, user_id):
        r = requests.get(f"{API}/admin/btc-wallet-whitelist",
                         headers=_uh(admin_token), timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["settings"]["lock_hours"] == 48
        assert any(w["user_id"] == user_id for w in data["wallets"])
        assert any(u["id"] == user_id for u in data["locked_users"])

    def test_06_admin_update_settings(self, admin_token):
        r = requests.put(f"{API}/admin/btc-security-settings", json={"lock_hours": 24},
                         headers=_uh(admin_token), timeout=10)
        assert r.status_code == 200
        assert r.json()["lock_hours"] == 24
        # Out of range
        assert requests.put(f"{API}/admin/btc-security-settings", json={"lock_hours": 999},
                            headers=_uh(admin_token), timeout=10).status_code == 400

    def test_07_admin_lift_lock(self, admin_token, user_token, user_id):
        r = requests.post(f"{API}/admin/btc-security/lift-lock/{user_id}",
                          headers=_uh(admin_token), timeout=10)
        assert r.status_code == 200
        g = requests.get(f"{API}/btc-wallets", headers=_uh(user_token), timeout=10).json()
        assert g["lock"]["locked"] is False

    def test_08_admin_approve_wallet(self, admin_token, user_token, user_id):
        wl = db.btc_wallet_whitelist.find_one({"user_id": user_id, "address": VALID_ADDR})
        assert wl
        r = requests.post(f"{API}/admin/btc-wallet-whitelist/{wl['id']}/approve",
                          headers=_uh(admin_token), timeout=10)
        assert r.status_code == 200
        g = requests.get(f"{API}/btc-wallets", headers=_uh(user_token), timeout=10).json()
        assert g["wallets"][0]["status"] == "trusted"

    def test_09_initiate_trusted_wallet(self, user_token):
        r = requests.post(f"{API}/btc-withdrawal/initiate", json={
            "amount_eur": 2000, "btc_address": VALID_ADDR, "address_confirmed": True,
        }, headers=_uh(user_token), timeout=15)
        assert r.status_code == 200, r.text
        req = r.json()["request"]
        assert req["trusted_wallet"] is True
        assert req["additional_review"] is False
        # cleanup: delete this request so next test can create
        db.btc_withdrawal_requests.delete_one({"id": req["id"]})

    def test_10_initiate_non_listed_flags_additional_review(self, user_token):
        r = requests.post(f"{API}/btc-withdrawal/initiate", json={
            "amount_eur": 2000, "btc_address": VALID_ADDR_2, "address_confirmed": True,
        }, headers=_uh(user_token), timeout=15)
        assert r.status_code == 200, r.text
        req = r.json()["request"]
        assert req["trusted_wallet"] is False
        assert req["additional_review"] is True


# ═══════════════════════ Withdrawal plans ═══════════════════════

class TestWithdrawalPlans:
    def test_01_create_plan_40k_quincenal(self, user_token):
        r = requests.post(f"{API}/withdrawal-plan", json={
            "total_eur": 40000, "frequency": "quincenal"},
            headers=_uh(user_token), timeout=10)
        assert r.status_code == 200, r.text
        p = r.json()["plan"]
        assert p["status"] == "pendiente_aprobacion"
        assert len(p["tranches"]) == 3
        amounts = [t["amount_eur"] for t in p["tranches"]]
        assert amounts == [15000.0, 15000.0, 10000.0]
        # Dates every 14 days
        d = [datetime.fromisoformat(t["due_date"]) for t in p["tranches"]]
        assert (d[1] - d[0]).days == 14
        assert (d[2] - d[1]).days == 14

    def test_02_second_plan_forbidden(self, user_token):
        r = requests.post(f"{API}/withdrawal-plan", json={
            "total_eur": 5000, "frequency": "semanal"},
            headers=_uh(user_token), timeout=10)
        assert r.status_code == 400

    def test_03_admin_approve_and_execute_all(self, admin_token, user_token, user_id):
        p = db.withdrawal_plans.find_one({"user_id": user_id, "status": "pendiente_aprobacion"})
        assert p
        # approve
        r = requests.post(f"{API}/admin/withdrawal-plans/{p['id']}/approve",
                          headers=_uh(admin_token), timeout=10)
        assert r.status_code == 200
        # execute tramo 1,2,3
        for n in (1, 2, 3):
            r = requests.post(f"{API}/admin/withdrawal-plans/{p['id']}/tranches/{n}/execute",
                              headers=_uh(admin_token), timeout=10)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["completed"] is (n == 3)
        # re-execute -> 400
        r = requests.post(f"{API}/admin/withdrawal-plans/{p['id']}/tranches/1/execute",
                          headers=_uh(admin_token), timeout=10)
        assert r.status_code == 400
        # plan visible in user endpoint as completado
        g = requests.get(f"{API}/withdrawal-plan", headers=_uh(user_token), timeout=10).json()
        active = [x for x in g["plans"] if x["id"] == p["id"]][0]
        assert active["status"] == "completado"
        assert active["executed_count"] == 3

    def test_04_reject_pending_plan(self, admin_token, user_token, user_id):
        # create fresh plan
        r = requests.post(f"{API}/withdrawal-plan", json={"total_eur": 20000, "frequency": "mensual"},
                          headers=_uh(user_token), timeout=10)
        assert r.status_code == 200
        pid = r.json()["plan"]["id"]
        r = requests.post(f"{API}/admin/withdrawal-plans/{pid}/reject", json={"reason": "prueba QA"},
                          headers=_uh(admin_token), timeout=10)
        assert r.status_code == 200
        assert r.json()["status"] == "rechazado"

    def test_05_user_cancel_pending(self, user_token, user_id):
        r = requests.post(f"{API}/withdrawal-plan", json={"total_eur": 10000, "frequency": "semanal"},
                          headers=_uh(user_token), timeout=10)
        assert r.status_code == 200
        pid = r.json()["plan"]["id"]
        r = requests.post(f"{API}/withdrawal-plan/{pid}/cancel",
                         headers=_uh(user_token), timeout=10)
        assert r.status_code == 200
