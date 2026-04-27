"""Backend tests for Partial Unlock 40% feature.

Covers:
- /partial-unlock/status (config + snapshot)
- /partial-unlock/start (idempotent)
- /partial-unlock/proof (validation + state move + FIFO priority)
- /partial-unlock/support-request (notification fanout)
- /admin/partial-unlock/queue (status filters, counts, sorting)
- /admin/partial-unlock/{id}/approve (mirror flag onto user, notif)
- /admin/partial-unlock/{id}/reject (note required, notif)
- Auth: non-admin -> 403 on admin endpoints
- Errors: 404 unknown id, 400 already-finalized
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"
USER_EMAIL = "test.bronce@test.com"
USER_PASSWORD = "Test1234!"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def user_token():
    # Best-effort; if test user doesn't exist we'll skip the non-admin check
    try:
        return _login(USER_EMAIL, USER_PASSWORD)
    except AssertionError:
        return None


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ─────────────────────────── STATUS ───────────────────────────
def test_status_initial_no_active(admin_headers):
    """After main agent reset, admin user should have no active request."""
    r = requests.get(f"{API}/partial-unlock/status", headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["config"]["required_eur"] == 2660.0
    assert data["config"]["unlock_pct"] == 40.0
    pm = data["config"]["payment_method"]
    assert pm["key"] == "usdt_trc20"
    assert pm["wallet_address"]
    assert "tronscan.org" in pm["tx_explorer"]
    assert isinstance(data["available_balance_eur"], (int, float))
    assert data["available_balance_eur"] > 0, "Admin user should have a non-zero balance"
    expected_max = round(data["available_balance_eur"] * 0.4, 2)
    assert data["live_max_withdraw_eur"] == expected_max
    assert data["active_request"] is None
    assert data["can_start"] is True


# ─────────────────────────── START ───────────────────────────
def test_start_creates_pending_payment(admin_headers):
    r = requests.post(f"{API}/partial-unlock/start", headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["created"] is True
    req = data["request"]
    assert req["status"] == "pending_payment"
    assert req["required_eur"] == 2660.0
    assert req["payment_method"] == "usdt_trc20"
    assert req["max_withdraw_eur_snapshot"] == round(req["available_balance_eur_snapshot"] * 0.4, 2)
    assert req["wallet_address"]


def test_start_is_idempotent(admin_headers):
    r = requests.post(f"{API}/partial-unlock/start", headers=admin_headers, timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert data["created"] is False
    assert data["request"]["status"] in ("pending_payment", "in_review", "approved")


# ─────────────────────────── PROOF ───────────────────────────
def test_proof_short_hash_400(admin_headers):
    r = requests.post(f"{API}/partial-unlock/proof", headers=admin_headers, json={"tx_hash": "abc"}, timeout=20)
    assert r.status_code == 400


def test_proof_empty_hash_400(admin_headers):
    r = requests.post(f"{API}/partial-unlock/proof", headers=admin_headers, json={"tx_hash": ""}, timeout=20)
    assert r.status_code == 400


def test_proof_valid_moves_to_in_review(admin_headers):
    tx = "TESTTXHASH" + str(int(time.time()))
    r = requests.post(f"{API}/partial-unlock/proof", headers=admin_headers, json={"tx_hash": tx}, timeout=20)
    assert r.status_code == 200, r.text
    req = r.json()["request"]
    assert req["status"] == "in_review"
    assert req["tx_hash"] == tx
    assert req["proof_uploaded_at"]
    assert isinstance(req["priority_rank"], int)
    assert req["priority_rank"] >= 1


def test_proof_without_pending_returns_404(admin_headers):
    # We're now in_review, so calling proof again should 404 (no pending_payment)
    r = requests.post(f"{API}/partial-unlock/proof", headers=admin_headers, json={"tx_hash": "ANOTHERLONGTXHASH123"}, timeout=20)
    assert r.status_code == 404


# ───────────────────────── SUPPORT ─────────────────────────
def test_support_request_creates_user_notification(admin_headers):
    r = requests.post(f"{API}/partial-unlock/support-request", headers=admin_headers, json={"note": "Necesito justificante para mi banco"}, timeout=20)
    assert r.status_code == 200
    assert r.json()["ok"] is True
    # Verify user notification was created
    rn = requests.get(f"{API}/notifications", headers=admin_headers, timeout=20)
    assert rn.status_code == 200
    notifs = rn.json() if isinstance(rn.json(), list) else rn.json().get("notifications", [])
    assert any("Justificante" in (n.get("title") or "") for n in notifs), \
        f"Expected user notification with 'Justificante' title; got {[n.get('title') for n in notifs[:5]]}"


# ───────────────────────── ADMIN QUEUE ─────────────────────────
def test_admin_queue_default_in_review(admin_headers):
    r = requests.get(f"{API}/admin/partial-unlock/queue", headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "items" in data and "counts" in data
    assert data["counts"]["in_review"] >= 1
    # Sorted by priority_rank ascending
    ranks = [it.get("priority_rank") for it in data["items"] if it.get("priority_rank") is not None]
    assert ranks == sorted(ranks), f"Queue should be sorted by priority_rank asc, got {ranks}"
    # All items in default filter should be in_review
    assert all(it["status"] == "in_review" for it in data["items"])


def test_admin_queue_filter_all(admin_headers):
    r = requests.get(f"{API}/admin/partial-unlock/queue?status=all", headers=admin_headers, timeout=20)
    assert r.status_code == 200
    statuses = {it["status"] for it in r.json()["items"]}
    # at least in_review present
    assert "in_review" in statuses


def test_admin_queue_non_admin_403(user_token):
    if not user_token:
        pytest.skip("test user not available")
    h = {"Authorization": f"Bearer {user_token}"}
    r = requests.get(f"{API}/admin/partial-unlock/queue", headers=h, timeout=20)
    assert r.status_code in (401, 403)


# ───────────────────────── ADMIN APPROVE ─────────────────────────
@pytest.fixture(scope="module")
def in_review_id(admin_headers):
    r = requests.get(f"{API}/admin/partial-unlock/queue", headers=admin_headers, timeout=20)
    items = r.json()["items"]
    assert items, "Need at least one in_review record"
    return items[0]["id"]


def test_approve_unknown_id_404(admin_headers):
    r = requests.post(f"{API}/admin/partial-unlock/does-not-exist-xyz/approve", headers=admin_headers, json={}, timeout=20)
    assert r.status_code == 404


def test_reject_empty_note_400(admin_headers, in_review_id):
    r = requests.post(f"{API}/admin/partial-unlock/{in_review_id}/reject", headers=admin_headers, json={"admin_note": ""}, timeout=20)
    assert r.status_code == 400


def test_approve_non_admin_403(user_token, in_review_id):
    if not user_token:
        pytest.skip("test user not available")
    h = {"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"}
    r = requests.post(f"{API}/admin/partial-unlock/{in_review_id}/approve", headers=h, json={}, timeout=20)
    assert r.status_code in (401, 403)


def test_approve_success_mirrors_user_flag(admin_headers, in_review_id):
    r = requests.post(f"{API}/admin/partial-unlock/{in_review_id}/approve", headers=admin_headers, json={"admin_note": "Validado OK"}, timeout=20)
    assert r.status_code == 200, r.text
    req = r.json()["request"]
    assert req["status"] == "approved"
    assert req["admin_validated_at"]
    assert req["admin_validated_by"]

    # Status endpoint should reflect approved
    rs = requests.get(f"{API}/partial-unlock/status", headers=admin_headers, timeout=20)
    sdata = rs.json()
    assert sdata["is_approved"] is True
    assert sdata["active_request"]["status"] == "approved"


def test_approve_already_approved_400(admin_headers, in_review_id):
    r = requests.post(f"{API}/admin/partial-unlock/{in_review_id}/approve", headers=admin_headers, json={}, timeout=20)
    assert r.status_code == 400


def test_reject_already_finalized_400(admin_headers, in_review_id):
    r = requests.post(f"{API}/admin/partial-unlock/{in_review_id}/reject", headers=admin_headers, json={"admin_note": "tarde"}, timeout=20)
    assert r.status_code == 400


def test_reject_unknown_id_404(admin_headers):
    r = requests.post(f"{API}/admin/partial-unlock/missing-id-zzz/reject", headers=admin_headers, json={"admin_note": "no"}, timeout=20)
    assert r.status_code == 404
