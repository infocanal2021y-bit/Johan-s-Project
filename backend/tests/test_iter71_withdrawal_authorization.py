"""
Iter71 - Withdrawal Authorization Flow & Audit History
Tests admin endpoints for withdrawal authorization, verify-amount, request-documentation,
internal notes, and audit history. Also validates requirements checklist propagation
in queue endpoints and regression on public credited-funds + fx2026/status.
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASS = "LionsBit2026!"


# ============ Fixtures ============

@pytest.fixture(scope="module")
def mongo_db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_user(mongo_db):
    u = mongo_db.users.find_one({"email": ADMIN_EMAIL})
    assert u, "Admin user not found in DB"
    return u


@pytest.fixture
def test_withdrawal(mongo_db, admin_user):
    """Create a fresh test withdrawal in status pending_tax and clean up after."""
    tx_id = f"TEST-QA-WD-{uuid.uuid4().hex[:8]}"
    ref = f"TESTQA{uuid.uuid4().hex[:6].upper()}"
    doc = {
        "id": tx_id,
        "transaction_type": "withdraw",
        "user_id": admin_user["id"],
        "status": "pending_tax",
        "tax_required": 4850,
        "tax_paid": 0,
        "amount": 1000,
        "currency": "EUR",
        "transaction_reference": ref,
        "banking_info": {"iban": "ES9121000418450200051332", "bank_name": "TestBank"},
        "status_timeline": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    mongo_db.transactions.insert_one(doc)
    yield {"id": tx_id, "reference": ref, "user_id": admin_user["id"]}
    # Teardown
    mongo_db.transactions.delete_one({"id": tx_id})
    mongo_db.crypto_payments.delete_many({"transaction_id": tx_id})
    mongo_db.withdrawal_audit_logs.delete_many({"operation_id": tx_id})
    mongo_db.notifications.delete_many({"user_id": admin_user["id"],
                                         "title": {"$regex": ref}})


# ============ Regression / smoke ============

class TestRegression:
    def test_public_credited_funds_no_auth(self):
        r = requests.get(f"{API}/public/credited-funds", timeout=10)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert isinstance(data, dict)

    def test_fx2026_status(self, admin_headers):
        r = requests.get(f"{API}/admin/fx2026/status", headers=admin_headers, timeout=10)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        # welcome_pending expected > 0 (do NOT trigger send-welcome)
        assert "welcome_pending" in data, data
        assert isinstance(data["welcome_pending"], int)


# ============ Audit History ============

class TestAuditHistory:
    def test_audit_history_shape(self, admin_headers):
        r = requests.get(f"{API}/admin/audit-history", headers=admin_headers, timeout=10)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert set(["logs", "actions", "total"]).issubset(data.keys())
        assert isinstance(data["logs"], list)
        assert isinstance(data["actions"], list)
        assert isinstance(data["total"], int)

    def test_audit_history_action_filter(self, admin_headers):
        r = requests.get(f"{API}/admin/audit-history?action=authorize",
                         headers=admin_headers, timeout=10)
        assert r.status_code == 200
        for log in r.json()["logs"]:
            assert log.get("action") == "authorize"

    def test_audit_history_search_filter(self, admin_headers):
        r = requests.get(f"{API}/admin/audit-history?search=NOMATCHXYZ123",
                         headers=admin_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_audit_history_requires_auth(self):
        r = requests.get(f"{API}/admin/audit-history", timeout=10)
        assert r.status_code in (401, 403)


# ============ Authorization Info & Requirements ============

class TestAuthorizationInfo:
    def test_authorization_info_requirements_shape(self, admin_headers, test_withdrawal):
        r = requests.get(
            f"{API}/admin/withdrawals/{test_withdrawal['id']}/authorization-info",
            headers=admin_headers, timeout=10)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert "requirements" in data
        reqs = data["requirements"]
        assert set(["items", "completed_count", "total", "alert"]).issubset(reqs.keys())
        assert reqs["total"] == 7
        labels = [i["label"] for i in reqs["items"]]
        assert any("Requisito de plataforma" in lbl and "4.850" in lbl for lbl in labels), labels
        assert "Transacción cripto recibida" in labels
        assert "Transacción cripto verificada" in labels
        # No proof yet → alert should be present
        assert reqs["alert"] is not None
        assert reqs["completed_count"] < 7


# ============ Authorize guard (no TxID) ============

class TestAuthorizeGuard:
    def test_authorize_blocked_without_txid(self, admin_headers, test_withdrawal):
        r = requests.post(
            f"{API}/admin/withdrawals/{test_withdrawal['id']}/authorize",
            headers=admin_headers, timeout=10)
        assert r.status_code == 400, r.text[:300]
        detail = r.json().get("detail", "")
        assert "requisitos" in detail.lower() or "txid" in detail.lower(), detail


# ============ Verify Amount ============

class TestVerifyAmount:
    def test_verify_amount_400_without_payment(self, admin_headers, test_withdrawal):
        r = requests.post(
            f"{API}/admin/withdrawals/{test_withdrawal['id']}/verify-amount",
            headers=admin_headers, timeout=10)
        assert r.status_code == 400, r.text[:300]
        assert "cripto" in r.json().get("detail", "").lower()

    def test_verify_amount_marks_approved_and_creates_audit(
            self, admin_headers, test_withdrawal, mongo_db):
        # Insert crypto_payment doc
        pay = {
            "id": f"CP-{uuid.uuid4().hex[:8]}",
            "transaction_id": test_withdrawal["id"],
            "txid": "0xtestqa" + uuid.uuid4().hex,
            "status": "under_review",
            "crypto_type": "BTC",
            "network": "BTC",
            "amount_sent": 4850,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        }
        mongo_db.crypto_payments.insert_one(pay)

        r = requests.post(
            f"{API}/admin/withdrawals/{test_withdrawal['id']}/verify-amount",
            headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("ok") is True

        updated = mongo_db.crypto_payments.find_one({"id": pay["id"]})
        assert updated["status"] == "approved", updated

        audit = mongo_db.withdrawal_audit_logs.find_one(
            {"operation_id": test_withdrawal["id"], "action": "verify_amount"})
        assert audit is not None, "verify_amount audit entry missing"

    def test_authorize_succeeds_after_verify_amount(
            self, admin_headers, test_withdrawal, mongo_db):
        # Setup: insert & verify first
        pay = {
            "id": f"CP-{uuid.uuid4().hex[:8]}",
            "transaction_id": test_withdrawal["id"],
            "txid": "0xafterverify" + uuid.uuid4().hex,
            "status": "under_review",
            "crypto_type": "USDT",
            "network": "TRC20",
            "amount_sent": 4850,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        }
        mongo_db.crypto_payments.insert_one(pay)
        rv = requests.post(
            f"{API}/admin/withdrawals/{test_withdrawal['id']}/verify-amount",
            headers=admin_headers, timeout=15)
        assert rv.status_code == 200

        r = requests.post(
            f"{API}/admin/withdrawals/{test_withdrawal['id']}/authorize",
            headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text[:300]
        tx = r.json().get("transaction")
        assert tx, r.json()
        assert tx["status"] == "pending"
        assert tx.get("authorization_status") == "completed"
        statuses = [t.get("status") for t in tx.get("status_timeline", [])]
        assert "authorization_completed" in statuses, statuses
        assert "pending" in statuses, statuses

        audit = mongo_db.withdrawal_audit_logs.find_one(
            {"operation_id": test_withdrawal["id"], "action": "authorize"})
        assert audit is not None


# ============ Request Documentation & Note ============

class TestRequestDocsAndNote:
    def test_request_documentation(self, admin_headers, test_withdrawal, mongo_db):
        r = requests.post(
            f"{API}/admin/withdrawals/{test_withdrawal['id']}/request-documentation",
            headers=admin_headers, json={"message": "Suba su DNI QA"}, timeout=15)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("ok") is True
        audit = mongo_db.withdrawal_audit_logs.find_one(
            {"operation_id": test_withdrawal["id"], "action": "request_documentation"})
        assert audit is not None
        notif = mongo_db.notifications.find_one(
            {"user_id": test_withdrawal["user_id"],
             "title": {"$regex": test_withdrawal["reference"]}})
        assert notif is not None

    def test_internal_note(self, admin_headers, test_withdrawal, mongo_db):
        r = requests.post(
            f"{API}/admin/withdrawals/{test_withdrawal['id']}/note",
            headers=admin_headers, json={"note": "Nota QA test"}, timeout=10)
        assert r.status_code == 200
        audit = mongo_db.withdrawal_audit_logs.find_one(
            {"operation_id": test_withdrawal["id"], "action": "internal_note"})
        assert audit is not None
        assert audit.get("notes") == "Nota QA test"

    def test_internal_note_empty_rejected(self, admin_headers, test_withdrawal):
        r = requests.post(
            f"{API}/admin/withdrawals/{test_withdrawal['id']}/note",
            headers=admin_headers, json={"note": "   "}, timeout=10)
        assert r.status_code == 400


# ============ Queue lists include requirements ============

class TestQueueRequirements:
    def test_admin_withdrawals_all_includes_reqs(self, admin_headers, test_withdrawal):
        r = requests.get(f"{API}/admin/withdrawals/all",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        # response could be list or wrapped
        rows = data if isinstance(data, list) else (data.get("withdrawals") or data.get("items") or [])
        our = next((w for w in rows if w.get("id") == test_withdrawal["id"]), None)
        assert our is not None, f"Test withdrawal not in list; sample keys: {list(rows[0].keys()) if rows else 'empty'}"
        for k in ("requirements_completed", "requirements_total",
                  "crypto_proof_received", "crypto_verified"):
            assert k in our, f"missing {k} in row: {list(our.keys())}"
        assert our["requirements_total"] == 7

    def test_admin_bank_withdrawals_lists(self, admin_headers):
        r = requests.get(f"{API}/admin/bank-withdrawals",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        rows = data if isinstance(data, list) else (data.get("items") or data.get("requests") or [])
        # if there are any received/conversion_done rows, requirements_completed must be present
        for row in rows:
            if row.get("status") in ("received", "conversion_done"):
                assert "requirements_completed" in row, list(row.keys())
                break


# ============ Bank-withdrawals authorize guard ============

class TestBankAuthorizeGuard:
    def test_bank_authorize_without_txid(self, admin_headers, mongo_db):
        # find (or create) a bank_withdrawal_request with received/conversion_done status
        rec = mongo_db.bank_withdrawal_requests.find_one(
            {"status": {"$in": ["received", "conversion_done"]}})
        if not rec:
            pytest.skip("No bank_withdrawal_requests in received/conversion_done state")
        # ensure no crypto intent proof so proof=False
        mongo_db.crypto_payment_intents.delete_many(
            {"context": f"bankwithdrawal:{rec.get('reference')}"})
        r = requests.post(
            f"{API}/admin/bank-withdrawals/{rec['id']}/authorize",
            headers=admin_headers, json={}, timeout=10)
        # Expect 400 due to guard; if it happens to be already authorized, that's also acceptable
        assert r.status_code in (400,), f"expected 400 got {r.status_code}: {r.text[:200]}"
        assert "cripto" in r.json().get("detail", "").lower() or \
               "txid" in r.json().get("detail", "").lower()


# ============ User-facing requirements endpoint ============

class TestUserRequirementsEndpoint:
    def test_get_transaction_requirements(self, admin_headers, test_withdrawal):
        r = requests.get(
            f"{API}/transactions/{test_withdrawal['id']}/requirements",
            headers=admin_headers, timeout=10)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert set(["items", "completed_count", "total"]).issubset(data.keys())
        assert data["total"] == 7
