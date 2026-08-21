"""Iteration 69 — Bank withdrawal: email_sent flag + resend-code endpoint."""
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://compliance-dash-32.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')


# ── Fixtures ─────────────────────────────────────────────────
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


# ── State captured for cleanup ──────────────────────────────
_state = {"created_ids": [], "user_id": None, "amount": 10.0}


# ── Test 1: initiate returns email_sent flag ────────────────
def test_initiate_returns_email_sent_flag(admin_headers, db):
    payload = {
        "from_currency": "EUR",
        "country": "ES",
        "bank_name": "CaixaBank",
        "bank_holder": "Test QA",
        "bank_account": "ES7620770024003102575766",
        "amount": _state["amount"],
    }
    r = requests.post(f"{API}/bank-withdrawal/initiate", json=payload, headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"initiate failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("ok") is True
    assert "email_sent" in data, "Response missing email_sent field"
    assert isinstance(data["email_sent"], bool)
    print(f"[initiate] email_sent={data['email_sent']} masked={data.get('masked_email')} req_id={data.get('request_id')}")

    req_id = data["request_id"]
    _state["created_ids"].append(req_id)
    _state["last_email_sent"] = data["email_sent"]

    # DB fields present
    rec = db.bank_withdrawal_requests.find_one({"id": req_id})
    assert rec is not None
    assert rec.get("last_code_sent_at") is not None, "last_code_sent_at not persisted"
    assert "last_code_email_sent" in rec, "last_code_email_sent not persisted"
    assert rec["last_code_email_sent"] == data["email_sent"]
    _state["user_id"] = rec["user_id"]
    _state["orig_hash"] = rec.get("confirmation_code_hash")

    # If email_sent=False, verify email_logs has a failed entry (likely quota)
    if not data["email_sent"]:
        log = db.email_logs.find_one({"to_email": ADMIN_EMAIL, "status": "failed"}, sort=[("created_at", -1)])
        assert log is not None, "No failed email_logs entry despite email_sent=False"
        print(f"[email_logs] latest failure: {log.get('error')}")


# ── Test 2: resend rate limit (429) ─────────────────────────
def test_resend_rate_limited_immediately(admin_headers):
    assert _state["created_ids"], "no request created"
    req_id = _state["created_ids"][-1]
    r = requests.post(f"{API}/bank-withdrawal/{req_id}/resend-code", headers=admin_headers, timeout=15)
    assert r.status_code == 429, f"expected 429 got {r.status_code} {r.text}"
    body = r.json()
    msg = body.get("detail") or body.get("message") or ""
    assert "Espera" in msg or "espera" in msg.lower(), f"unexpected msg: {msg}"
    print(f"[resend 429] {msg}")


# ── Test 3: resend security — 404 for foreign/non-existent ─
def test_resend_404_for_unknown_request(admin_headers):
    r = requests.post(f"{API}/bank-withdrawal/does-not-exist-xyz/resend-code", headers=admin_headers, timeout=15)
    assert r.status_code == 404, f"expected 404 got {r.status_code} {r.text}"


# ── Test 4: resend 400 when not in awaiting_code ────────────
def test_resend_400_for_wrong_status(admin_headers, db):
    # Create a temp doc directly in DB with status != awaiting_code owned by admin
    admin = db.users.find_one({"email": ADMIN_EMAIL})
    assert admin
    import uuid
    fake_id = str(uuid.uuid4())
    db.bank_withdrawal_requests.insert_one({
        "id": fake_id, "user_id": admin["id"], "user_email": ADMIN_EMAIL,
        "status": "completed", "from_currency": "EUR", "to_currency": "EUR",
        "from_amount": 1.0, "net_to_amount": 1.0,
        "bank_name": "X", "bank_holder": "X", "country": "ES",
        "reference": "WD-TEST-CLEAN",
    })
    _state["created_ids"].append(fake_id)
    r = requests.post(f"{API}/bank-withdrawal/{fake_id}/resend-code", headers=admin_headers, timeout=15)
    assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text}"


# ── Test 5: resend after 61s → 502 if quota still out, else 200 ─
@pytest.mark.slow
def test_resend_after_cooldown(admin_headers, db):
    req_id = _state["created_ids"][0]
    orig_hash = _state["orig_hash"]
    print(f"[resend cooldown] sleeping 62s...")
    time.sleep(62)
    r = requests.post(f"{API}/bank-withdrawal/{req_id}/resend-code", headers=admin_headers, timeout=30)
    print(f"[resend after cooldown] status={r.status_code} body={r.text[:250]}")

    rec = db.bank_withdrawal_requests.find_one({"id": req_id})
    tl = rec.get("status_timeline") or []

    if r.status_code == 502:
        # Note: ingress replaces 502 body with HTML "Bad Gateway" page,
        # so we cannot assert JSON detail here. Backend log shows the raw response.
        # Hash must NOT have rotated
        assert rec.get("confirmation_code_hash") == orig_hash, "hash rotated despite failed send"
        # Timeline should have a failure entry
        assert any("Reenvío" in (t.get("note") or "") or "falló" in (t.get("note") or "").lower() for t in tl), \
            f"missing failure timeline entry: {tl}"
        print("[resend 502] hash NOT rotated ✓, timeline has failure entry ✓")
    elif r.status_code == 200:
        body = r.json()
        assert body.get("sent") is True
        # Hash SHOULD have rotated
        assert rec.get("confirmation_code_hash") != orig_hash, "hash did not rotate on success"
        assert rec.get("code_attempts") == 0
        _state["orig_hash"] = rec.get("confirmation_code_hash")
    else:
        pytest.fail(f"unexpected status: {r.status_code} {r.text}")


# ── Test 6: confirm-code still works with DB hash ───────────
def test_confirm_code_flow_intact(admin_headers, db):
    # Use a fresh withdrawal we can control
    req_id = _state["created_ids"][0]
    rec = db.bank_withdrawal_requests.find_one({"id": req_id})
    if rec["status"] != "awaiting_code":
        pytest.skip(f"status changed to {rec['status']}, cannot test confirm")

    # Reset expiry to future (in case previous test ate time)
    from datetime import datetime, timezone, timedelta
    new_exp = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    db.bank_withdrawal_requests.update_one(
        {"id": req_id}, {"$set": {"code_expires_at": new_exp}}
    )
    code = rec.get("confirmation_code_hash")
    assert code and len(code) == 6, f"invalid stored code: {code}"

    r = requests.post(f"{API}/bank-withdrawal/{req_id}/confirm-code", json={"code": code},
                      headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"confirm failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("ok") is True
    # After confirm, status transitions to conversion_done (received → conversion_done)
    fresh = db.bank_withdrawal_requests.find_one({"id": req_id})
    assert fresh["status"] in ("received", "conversion_done"), f"unexpected status: {fresh['status']}"


# ── Cleanup ─────────────────────────────────────────────────
def test_zzz_cleanup(db):
    ids = _state["created_ids"]
    user_id = _state["user_id"]
    if not user_id:
        return
    # sum any still-locked pending: amount * number of NOT-completed requests we created
    # simplest: reset pending EUR to 0 for admin (safe here as this is test DB)
    # Actually we should decrement only what we locked. The initiate locked amount once.
    # After confirm_code, pending is decremented. For any not confirmed, decrement here.
    for rid in ids:
        rec = db.bank_withdrawal_requests.find_one({"id": rid})
        if rec and rec.get("status") == "awaiting_code":
            db.multi_currency_wallets.update_one(
                {"user_id": user_id},
                {"$inc": {f"pending.{rec['from_currency']}": -float(rec['from_amount'])}}
            )
        db.bank_withdrawal_requests.delete_one({"id": rid})
        db.cases.delete_one({"entity_type": "withdrawal", "entity_id": rid})
    print(f"[cleanup] removed {len(ids)} test withdrawals")
