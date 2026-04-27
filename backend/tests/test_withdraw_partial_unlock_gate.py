"""Backend regression for the 40% Partial Withdraw Unlock gate on POST /api/transactions (withdraw).

Cases covered:
  (A) user NOT unlocked -> 403 with the exact spanish message prefix
  (B) user unlocked, amount > cap -> 400 with 'Monto excede el límite desbloqueado (€<snapshot>)'
  (C) user unlocked, amount <= cap -> 200 (status=pending_tax, reference TRX-...)
  (D) currency=USD, amount*0.92 > cap -> 400 (USD->EUR conversion)
  (E) currency=USD, amount*0.92 <= cap -> 200

Strategy:
  - Login as admin (admi@paylionsbit.es) which currently has partial_withdraw_unlocked=true with snapshot €30194.
  - We toggle the flag directly in Mongo via motor to test the "locked" path, then restore.
"""
import os
import asyncio
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"

BANKING_INFO = {
    "account_holder": "Admin LionsBit",
    "iban": "ES9121000418450200051332",
    "account_number": "0200051332",
    "swift_code": "CAIXESBBXXX",
    "routing_number": None,
    "bank_name": "CaixaBank",
    "bank_country": "ES",
    "bank_city": "Madrid",
    "account_type": "checking",
}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_account(admin_headers):
    r = requests.get(f"{API}/accounts", headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text
    accounts = r.json()
    checking = next((a for a in accounts if a.get("account_type") == "checking"), accounts[0])
    return checking


@pytest.fixture(scope="module")
def mongo_db():
    # Use pymongo (sync) to avoid motor/asyncio loop issues between tests
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        # Load from backend/.env as a fallback
        from dotenv import dotenv_values
        env = dotenv_values("/app/backend/.env")
        mongo_url = mongo_url or env.get("MONGO_URL")
        db_name = db_name or env.get("DB_NAME")
    client = MongoClient(mongo_url)
    return client[db_name]


def _set_flag(db, email, unlocked, max_eur=None):
    upd = {"partial_withdraw_unlocked": unlocked}
    if max_eur is not None:
        upd["partial_withdraw_max_eur"] = max_eur
    db.users.update_one({"email": email}, {"$set": upd})


def _withdraw(headers, account_id, amount, currency="EUR"):
    payload = {
        "account_id": account_id,
        "transaction_type": "withdraw",
        "amount": amount,
        "currency": currency,
        "description": "pytest regression",
        "banking_info": BANKING_INFO,
    }
    return requests.post(f"{API}/transactions", headers=headers, json=payload, timeout=30)


# Read the current snapshot via /partial-unlock/status
@pytest.fixture(scope="module")
def snapshot_eur(admin_headers):
    r = requests.get(f"{API}/partial-unlock/status", headers=admin_headers, timeout=20)
    assert r.status_code == 200
    data = r.json()
    # prefer the user doc mirrored value, fall back to active_request
    req = data.get("active_request") or {}
    snap = req.get("max_withdraw_eur_snapshot")
    assert snap and snap > 0, f"Expected a positive snapshot, got {snap}"
    return float(snap)


# ──────────────── LOCKED PATH ────────────────
def test_A_withdraw_when_locked_returns_403(admin_headers, admin_account, mongo_db, snapshot_eur):
    """Temporarily lock the admin, request a withdraw, expect 403 with the exact spanish prefix."""
    _set_flag(mongo_db, ADMIN_EMAIL, False)
    try:
        r = _withdraw(admin_headers, admin_account["id"], 100.0, "EUR")
        assert r.status_code == 403, f"Expected 403 got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert detail.startswith('Para procesar retiros debe completar primero el "Desbloqueo de retiro parcial · 40%"'), \
            f"Unexpected detail: {detail!r}"
    finally:
        _set_flag(mongo_db, ADMIN_EMAIL, True, snapshot_eur)


# ──────────────── UNLOCKED — OVER CAP ────────────────
def test_B_withdraw_unlocked_over_cap_returns_400(admin_headers, admin_account, snapshot_eur):
    over = snapshot_eur + 1000.0
    r = _withdraw(admin_headers, admin_account["id"], over, "EUR")
    assert r.status_code == 400, f"Expected 400 got {r.status_code}: {r.text}"
    detail = r.json().get("detail", "")
    assert "Monto excede el límite desbloqueado" in detail, f"Unexpected detail: {detail!r}"
    assert f"€{snapshot_eur:.2f}" in detail, f"Snapshot value missing in: {detail!r}"


# ──────────────── UNLOCKED — UNDER CAP ────────────────
def test_C_withdraw_unlocked_under_cap_succeeds(admin_headers, admin_account):
    # Use a small deterministic amount well below the 30194 cap
    r = _withdraw(admin_headers, admin_account["id"], 1500.0, "EUR")
    assert r.status_code == 200, f"Expected 200 got {r.status_code}: {r.text}"
    data = r.json()
    assert data["status"] == "pending_tax"
    assert data.get("transaction_reference", "").startswith("TRX-"), f"bad reference: {data.get('transaction_reference')}"
    assert data["transaction_type"] == "withdraw"
    assert data["amount"] == 1500.0


# ──────────────── UNLOCKED — USD CONVERSION ────────────────
def test_D_withdraw_unlocked_usd_over_cap_400(admin_headers, admin_account, snapshot_eur):
    # amount_usd * 0.92 must exceed the cap -> 400
    amount_usd = (snapshot_eur / 0.92) + 5000.0
    r = _withdraw(admin_headers, admin_account["id"], amount_usd, "USD")
    assert r.status_code == 400, f"Expected 400 got {r.status_code}: {r.text}"
    detail = r.json().get("detail", "")
    assert "Monto excede el límite desbloqueado" in detail, f"Unexpected detail: {detail!r}"


def test_E_withdraw_unlocked_usd_under_cap_succeeds(admin_headers, admin_account):
    # 1000 USD ≈ 920 EUR, well under 30194 cap
    r = _withdraw(admin_headers, admin_account["id"], 1000.0, "USD")
    assert r.status_code == 200, f"Expected 200 got {r.status_code}: {r.text}"
    data = r.json()
    assert data["status"] == "pending_tax"
    assert data.get("transaction_reference", "").startswith("TRX-")
