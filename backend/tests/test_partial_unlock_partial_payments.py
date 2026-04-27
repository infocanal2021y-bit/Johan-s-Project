"""Tests for partial-payment flow on the 40% unlock paywall.

Covers iteration request scenarios:
- Status payload includes min_partial_eur, total_paid_eur, remaining_eur
- start seeds payments=[]
- proof: < 500 (min) → 400
- proof: 500 OK partial
- proof: +1000 OK partial 1500/2660
- proof: duplicate hash → 400
- proof: > remaining → 400
- proof: exact close → completed=true, in_review, priority_rank
- proof: missing amount_eur defaults to remaining
- proof after in_review → 404
- proof: amount=0 / negative → 400
- proof: tx_hash<10 chars → 400
- admin queue still lists in_review with payments[]
- admin approve still works + mirrors flag
"""
import os
import secrets
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = os.environ.get("ADMIN_PRIMARY_EMAIL", "admi@paylionsbit.es")
ADMIN_PASSWORD = os.environ.get("ADMIN_PRIMARY_PASSWORD", "LionsBit2026!")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


# ── shared helpers ────────────────────────────────────────────────
def _hash(prefix: str = "tx") -> str:
    return f"{prefix}_{secrets.token_hex(20)}"


@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(autouse=True)
def reset_unlock(db):
    """Clean any existing unlock for admin before each test so we always
    start from a clean 'pending_payment' state.
    """
    user = db.users.find_one({"email": ADMIN_EMAIL})
    if user:
        db.partial_withdraw_unlocks.delete_many({"user_id": user["id"]})
        db.users.update_one(
            {"id": user["id"]},
            {"$unset": {
                "partial_withdraw_unlocked": "",
                "partial_withdraw_max_eur": "",
                "partial_withdraw_unlocked_at": "",
            }},
        )
    yield
    # don't auto-cleanup after — last test handles its own state


# ──────────────────────────────────────────────────────────────────
# 1. Status: config has min_partial_eur + root has total_paid + remaining
# ──────────────────────────────────────────────────────────────────
def test_status_no_active_returns_config_with_min_partial(headers):
    r = requests.get(f"{API}/partial-unlock/status", headers=headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["config"]["required_eur"] == 2660.0
    assert data["config"]["min_partial_eur"] == 500.0
    assert data["active_request"] is None
    assert data["total_paid_eur"] == 0
    assert data["remaining_eur"] == 2660.0
    assert data["can_start"] is True


# ──────────────────────────────────────────────────────────────────
# 2. start seeds payments=[]
# ──────────────────────────────────────────────────────────────────
def test_start_seeds_empty_payments(headers):
    r = requests.post(f"{API}/partial-unlock/start", headers=headers, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    req = body["request"]
    assert req["status"] == "pending_payment"
    assert req["required_eur"] == 2660.0
    assert req.get("payments") == []


# ──────────────────────────────────────────────────────────────────
# 3. proof < min → 400
# ──────────────────────────────────────────────────────────────────
def test_proof_below_min_rejected(headers):
    requests.post(f"{API}/partial-unlock/start", headers=headers, timeout=15)
    r = requests.post(
        f"{API}/partial-unlock/proof",
        headers=headers,
        json={"tx_hash": _hash(), "amount_eur": 300},
        timeout=15,
    )
    assert r.status_code == 400
    assert "mínimo" in r.json().get("detail", "").lower() or "500" in r.json().get("detail", "")


# ──────────────────────────────────────────────────────────────────
# 4. proof 500 OK → partial state 500/2660
# ──────────────────────────────────────────────────────────────────
def test_proof_500_partial(headers):
    requests.post(f"{API}/partial-unlock/start", headers=headers, timeout=15)
    r = requests.post(
        f"{API}/partial-unlock/proof",
        headers=headers,
        json={"tx_hash": _hash("a"), "amount_eur": 500},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["completed"] is False
    assert body["total_paid_eur"] == 500
    req = body["request"]
    assert req["status"] == "pending_payment"
    assert len(req["payments"]) == 1
    p = req["payments"][0]
    assert p["amount_eur"] == 500
    assert p.get("tx_hash") and p.get("submitted_at") and p.get("id")


# ──────────────────────────────────────────────────────────────────
# 5. additional 1000 → 1500/2660 still pending
# ──────────────────────────────────────────────────────────────────
def test_proof_second_partial(headers):
    requests.post(f"{API}/partial-unlock/start", headers=headers, timeout=15)
    requests.post(f"{API}/partial-unlock/proof", headers=headers, json={"tx_hash": _hash("b"), "amount_eur": 500}, timeout=15)
    r = requests.post(
        f"{API}/partial-unlock/proof",
        headers=headers,
        json={"tx_hash": _hash("c"), "amount_eur": 1000},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["completed"] is False
    assert body["total_paid_eur"] == 1500
    assert body["request"]["status"] == "pending_payment"
    assert len(body["request"]["payments"]) == 2


# ──────────────────────────────────────────────────────────────────
# 6. duplicate hash → 400
# ──────────────────────────────────────────────────────────────────
def test_duplicate_tx_hash_rejected(headers):
    requests.post(f"{API}/partial-unlock/start", headers=headers, timeout=15)
    h = _hash("dup")
    r1 = requests.post(f"{API}/partial-unlock/proof", headers=headers, json={"tx_hash": h, "amount_eur": 500}, timeout=15)
    assert r1.status_code == 200
    r2 = requests.post(f"{API}/partial-unlock/proof", headers=headers, json={"tx_hash": h, "amount_eur": 500}, timeout=15)
    assert r2.status_code == 400
    assert "ya fue registrado" in r2.json().get("detail", "")


# ──────────────────────────────────────────────────────────────────
# 7. amount > remaining → 400 with 'Restan €X'
# ──────────────────────────────────────────────────────────────────
def test_amount_exceeds_remaining(headers):
    requests.post(f"{API}/partial-unlock/start", headers=headers, timeout=15)
    requests.post(f"{API}/partial-unlock/proof", headers=headers, json={"tx_hash": _hash("e1"), "amount_eur": 500}, timeout=15)
    r = requests.post(
        f"{API}/partial-unlock/proof",
        headers=headers,
        json={"tx_hash": _hash("e2"), "amount_eur": 5000},
        timeout=15,
    )
    assert r.status_code == 400
    detail = r.json().get("detail", "")
    assert "excede" in detail.lower()
    assert "2160" in detail.replace(".", "").replace(",", "") or "2160.00" in detail


# ──────────────────────────────────────────────────────────────────
# 8. exact closing payment → completed=true + in_review + priority_rank
# ──────────────────────────────────────────────────────────────────
def test_proof_exact_close_to_in_review(headers):
    requests.post(f"{API}/partial-unlock/start", headers=headers, timeout=15)
    requests.post(f"{API}/partial-unlock/proof", headers=headers, json={"tx_hash": _hash("c1"), "amount_eur": 500}, timeout=15)
    requests.post(f"{API}/partial-unlock/proof", headers=headers, json={"tx_hash": _hash("c2"), "amount_eur": 1000}, timeout=15)
    r = requests.post(
        f"{API}/partial-unlock/proof",
        headers=headers,
        json={"tx_hash": _hash("c3"), "amount_eur": 1160},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["completed"] is True
    assert body["total_paid_eur"] == 2660
    req = body["request"]
    assert req["status"] == "in_review"
    assert req["priority_rank"] is not None and req["priority_rank"] >= 1
    assert len(req["payments"]) == 3


# ──────────────────────────────────────────────────────────────────
# 9. omitted amount_eur defaults to remaining (single full payment)
# ──────────────────────────────────────────────────────────────────
def test_proof_default_amount_full_payment(headers):
    requests.post(f"{API}/partial-unlock/start", headers=headers, timeout=15)
    r = requests.post(
        f"{API}/partial-unlock/proof",
        headers=headers,
        json={"tx_hash": _hash("full")},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["completed"] is True
    assert body["total_paid_eur"] == 2660
    assert body["request"]["status"] == "in_review"


# ──────────────────────────────────────────────────────────────────
# 10. proof after in_review → 404 (no pending request)
# ──────────────────────────────────────────────────────────────────
def test_proof_after_in_review_returns_404(headers):
    requests.post(f"{API}/partial-unlock/start", headers=headers, timeout=15)
    requests.post(f"{API}/partial-unlock/proof", headers=headers, json={"tx_hash": _hash("z1")}, timeout=15)
    # now it should be in_review
    r = requests.post(
        f"{API}/partial-unlock/proof",
        headers=headers,
        json={"tx_hash": _hash("z2"), "amount_eur": 500},
        timeout=15,
    )
    assert r.status_code == 404
    assert "pendiente" in r.json().get("detail", "").lower()


# ──────────────────────────────────────────────────────────────────
# 11. amount 0 or negative → 400
# ──────────────────────────────────────────────────────────────────
def test_amount_zero_or_negative_rejected(headers):
    requests.post(f"{API}/partial-unlock/start", headers=headers, timeout=15)
    r0 = requests.post(f"{API}/partial-unlock/proof", headers=headers, json={"tx_hash": _hash(), "amount_eur": 0}, timeout=15)
    assert r0.status_code == 400
    rn = requests.post(f"{API}/partial-unlock/proof", headers=headers, json={"tx_hash": _hash(), "amount_eur": -100}, timeout=15)
    assert rn.status_code == 400


# ──────────────────────────────────────────────────────────────────
# 12. tx_hash < 10 chars → 400
# ──────────────────────────────────────────────────────────────────
def test_tx_hash_too_short(headers):
    requests.post(f"{API}/partial-unlock/start", headers=headers, timeout=15)
    r = requests.post(
        f"{API}/partial-unlock/proof",
        headers=headers,
        json={"tx_hash": "short", "amount_eur": 500},
        timeout=15,
    )
    assert r.status_code == 400


# ──────────────────────────────────────────────────────────────────
# 13. admin queue lists in_review unlocks (with payments[])
# ──────────────────────────────────────────────────────────────────
def test_admin_queue_lists_in_review_with_payments(headers):
    requests.post(f"{API}/partial-unlock/start", headers=headers, timeout=15)
    # split into 2 partials
    requests.post(f"{API}/partial-unlock/proof", headers=headers, json={"tx_hash": _hash("q1"), "amount_eur": 500}, timeout=15)
    requests.post(f"{API}/partial-unlock/proof", headers=headers, json={"tx_hash": _hash("q2"), "amount_eur": 2160}, timeout=15)

    r = requests.get(f"{API}/admin/partial-unlock/queue", headers=headers, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body.get("items"), list)
    assert any(it["status"] == "in_review" and len(it.get("payments") or []) == 2 for it in body["items"])


# ──────────────────────────────────────────────────────────────────
# 14. admin approve still works + mirror flag on user
# ──────────────────────────────────────────────────────────────────
def test_admin_approve_mirrors_flag(headers, db):
    requests.post(f"{API}/partial-unlock/start", headers=headers, timeout=15)
    requests.post(f"{API}/partial-unlock/proof", headers=headers, json={"tx_hash": _hash("ap")}, timeout=15)

    user = db.users.find_one({"email": ADMIN_EMAIL})
    unlock = db.partial_withdraw_unlocks.find_one({"user_id": user["id"], "status": "in_review"})
    assert unlock is not None

    r = requests.post(
        f"{API}/admin/partial-unlock/{unlock['id']}/approve",
        headers=headers,
        json={"admin_note": "ok TEST_partial_payments"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["request"]["status"] == "approved"

    # mirror flag
    user_after = db.users.find_one({"id": user["id"]})
    assert user_after.get("partial_withdraw_unlocked") is True
    assert user_after.get("partial_withdraw_max_eur") == unlock["max_withdraw_eur_snapshot"]
