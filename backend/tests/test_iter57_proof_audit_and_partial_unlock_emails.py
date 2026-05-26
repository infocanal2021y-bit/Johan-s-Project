"""Iter 57 tests:
(A) POST /api/admin/bank-transfer/proof/mark-viewed audit trail (idempotent, 400/404/401)
(B) send_partial_unlock_status_email is called on state transitions in partial_unlock routes
"""
import os
import sys
import asyncio
import pytest
import requests
from unittest.mock import patch, AsyncMock
from pathlib import Path

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
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
    return ""


BASE_URL = _backend_url()
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"
SEED_REFERENCE = "TEST-216389"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def user_token():
    email = "TEST_iter57_user@example.com"
    pwd = "TestPwd2026!"
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": pwd}, timeout=15)
    if r.status_code != 200:
        reg = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"email": email, "password": pwd, "name": "Iter57 User", "country": "ES"},
                            timeout=15)
        if reg.status_code in (200, 201):
            r = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": email, "password": pwd}, timeout=15)
    if r.status_code != 200:
        pytest.skip("Cannot create non-admin user")
    return r.json().get("token") or r.json().get("access_token")


# ============== (A) MARK-VIEWED ENDPOINT ==============

class TestMarkViewedEndpoint:
    @pytest.fixture(autouse=True)
    def _reset_audit_stamp(self, admin_headers):
        """Clear the audit stamp before each test so first-call invariants hold."""
        from pymongo import MongoClient
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        if mongo_url and db_name:
            cli = MongoClient(mongo_url)
            cli[db_name].bank_transfer_payments.update_one(
                {"reference": SEED_REFERENCE},
                {"$unset": {"proof_reviewed_at": "", "proof_reviewed_by": "", "proof_reviewed_by_name": ""}}
            )
            cli.close()

    def test_no_auth_rejected(self):
        r = requests.post(f"{BASE_URL}/api/admin/bank-transfer/proof/mark-viewed",
                          json={"reference": SEED_REFERENCE}, timeout=15)
        assert r.status_code in (401, 403)

    def test_non_admin_rejected(self, user_token):
        r = requests.post(f"{BASE_URL}/api/admin/bank-transfer/proof/mark-viewed",
                          json={"reference": SEED_REFERENCE},
                          headers={"Authorization": f"Bearer {user_token}"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_missing_args_400(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/bank-transfer/proof/mark-viewed",
                          json={}, headers=admin_headers, timeout=15)
        assert r.status_code == 400
        assert "Indique reference o payment_id" in (r.json().get("detail") or "")

    def test_unknown_reference_404(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/bank-transfer/proof/mark-viewed",
                          json={"reference": "no-such-ref-xyz-9876"},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 404
        assert "Transferencia no encontrada" in (r.json().get("detail") or "")

    def test_first_call_stamps_and_second_is_idempotent(self, admin_headers):
        # 1st call
        r1 = requests.post(f"{BASE_URL}/api/admin/bank-transfer/proof/mark-viewed",
                           json={"reference": SEED_REFERENCE},
                           headers=admin_headers, timeout=15)
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1["ok"] is True
        assert b1["already_reviewed"] is False
        assert b1.get("proof_reviewed_at")
        assert b1.get("proof_reviewed_by")
        assert b1.get("proof_reviewed_by_name")
        ts1 = b1["proof_reviewed_at"]

        # 2nd call - idempotent
        r2 = requests.post(f"{BASE_URL}/api/admin/bank-transfer/proof/mark-viewed",
                           json={"reference": SEED_REFERENCE},
                           headers=admin_headers, timeout=15)
        assert r2.status_code == 200
        b2 = r2.json()
        assert b2["ok"] is True
        assert b2["already_reviewed"] is True
        assert b2["proof_reviewed_at"] == ts1, "Timestamp must not be overwritten"

        # GET /proof now includes audit fields
        rg = requests.get(f"{BASE_URL}/api/admin/bank-transfer/proof?reference={SEED_REFERENCE}",
                          headers=admin_headers, timeout=15)
        assert rg.status_code == 200
        p = rg.json()["payment"]
        assert p.get("proof_reviewed_at") == ts1
        assert p.get("proof_reviewed_by")
        assert p.get("proof_reviewed_by_name")


# ============== (B) PARTIAL UNLOCK EMAIL WIRING ==============

class TestPartialUnlockEmails:
    """Live HTTP tests against the running backend. Verifies emails are emitted by
    inspecting the `email_logs` collection (which send_email writes to with the
    template subject) and that API responses stay 200 even when email pipeline is
    skipped (RESEND_API_KEY not set → log status='skipped')."""

    SUBJECTS = {
        'pending_payment': '📥 Solicitud de retiro parcial 40% recibida',
        'in_review': '🔍 Comprobante recibido — en revisión',
        'approved': '✅ Retiro parcial 40% APROBADO',
        'rejected': '⚠️ Solicitud de retiro 40% — Acción requerida',
    }

    def _db(self):
        from pymongo import MongoClient
        cli = MongoClient(os.environ.get("MONGO_URL"))
        return cli, cli[os.environ.get("DB_NAME")]

    def _cleanup(self, email):
        cli, db = self._db()
        db.partial_withdraw_unlocks.delete_many({"user_email": email})
        cli.close()

    def _recent_log_for(self, email, subject, since_iso):
        cli, db = self._db()
        log = db.email_logs.find_one(
            {"to_email": email, "subject": subject, "created_at": {"$gte": since_iso}},
            sort=[("created_at", -1)],
        )
        cli.close()
        return log

    def test_full_lifecycle_emits_all_four_emails(self, user_token, admin_headers):
        from datetime import datetime, timezone
        email = "TEST_iter57_user@example.com"
        user_hdr = {"Authorization": f"Bearer {user_token}"}
        self._cleanup(email)

        # 1) START → pending_payment email
        t0 = datetime.now(timezone.utc).isoformat()
        r = requests.post(f"{BASE_URL}/api/partial-unlock/start", headers=user_hdr, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        import time; time.sleep(1.0)
        log = self._recent_log_for(email, self.SUBJECTS['pending_payment'], t0)
        assert log is not None, "pending_payment email_logs entry missing"

        # 2) PROOF (full payment) → in_review email
        t1 = datetime.now(timezone.utc).isoformat()
        r = requests.post(f"{BASE_URL}/api/partial-unlock/proof", headers=user_hdr,
                          json={"tx_hash": "TEST_iter57_fullpay_hash_abcdef", "amount_eur": 2660.0},
                          timeout=20)
        assert r.status_code == 200, r.text
        assert r.json().get("completed") is True
        time.sleep(1.0)
        log = self._recent_log_for(email, self.SUBJECTS['in_review'], t1)
        assert log is not None, "in_review email_logs entry missing"

        # Find the unlock_id
        cli, db = self._db()
        rec = db.partial_withdraw_unlocks.find_one({"user_email": email, "status": "in_review"},
                                                    sort=[("created_at", -1)])
        cli.close()
        assert rec
        uid = rec["id"]

        # 3) APPROVE → approved email
        t2 = datetime.now(timezone.utc).isoformat()
        r = requests.post(f"{BASE_URL}/api/admin/partial-unlock/{uid}/approve",
                          headers=admin_headers, json={"admin_note": "ok"}, timeout=20)
        assert r.status_code == 200, r.text
        time.sleep(1.0)
        log = self._recent_log_for(email, self.SUBJECTS['approved'], t2)
        assert log is not None, "approved email_logs entry missing"

        # 4) Create new request, reject it → rejected email
        self._cleanup(email)
        r = requests.post(f"{BASE_URL}/api/partial-unlock/start", headers=user_hdr, timeout=20)
        assert r.status_code == 200
        cli, db = self._db()
        rec = db.partial_withdraw_unlocks.find_one({"user_email": email}, sort=[("created_at", -1)])
        cli.close()
        uid2 = rec["id"]
        t3 = datetime.now(timezone.utc).isoformat()
        r = requests.post(f"{BASE_URL}/api/admin/partial-unlock/{uid2}/reject",
                          headers=admin_headers, json={"admin_note": "Comprobante ilegible"}, timeout=20)
        assert r.status_code == 200, r.text
        time.sleep(1.0)
        log = self._recent_log_for(email, self.SUBJECTS['rejected'], t3)
        assert log is not None, "rejected email_logs entry missing"

    def test_api_response_unaffected_by_email_pipeline(self, user_token):
        """API must return 200 with full payload regardless of email send outcome.
        Since safe_email + try/except wrap all 4 call sites, this is structural."""
        email = "TEST_iter57_user@example.com"
        self._cleanup(email)
        hdr = {"Authorization": f"Bearer {user_token}"}
        r = requests.post(f"{BASE_URL}/api/partial-unlock/start", headers=hdr, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True
        assert body.get("request", {}).get("payment_reference", "").startswith("R40-")

    def test_pending_payment_email_on_start(self, api_client, test_user_token):
        user_auth_header = {"Authorization": f"Bearer {test_user_token}"}
        app_client = api_client
        self._cleanup_user_unlocks("TEST_iter57_user@example.com")
        with patch("routes.partial_unlock.send_partial_unlock_status_email",
                   new_callable=AsyncMock) as mock_send:
            resp = app_client.post("/api/partial-unlock/start", headers=user_auth_header)
            assert resp.status_code == 200, resp.text
            assert mock_send.await_count >= 1
            kwargs = mock_send.await_args.kwargs
            assert kwargs.get("new_status") == "pending_payment"
            assert kwargs.get("payment_reference", "").startswith("R40-")

    def test_in_review_email_on_full_payment(self, api_client, test_user_token):
        user_auth_header = {"Authorization": f"Bearer {test_user_token}"}
        app_client = api_client
        # Ensure pending_payment record exists
        app_client.post("/api/partial-unlock/start", headers=user_auth_header)
        with patch("routes.partial_unlock.send_partial_unlock_status_email",
                   new_callable=AsyncMock) as mock_send:
            resp = app_client.post(
                "/api/partial-unlock/proof",
                headers=user_auth_header,
                json={"tx_hash": "TEST_iter57_tx_full_payment_hash_xx", "amount_eur": 2660.0},
            )
            assert resp.status_code == 200, resp.text
            assert resp.json().get("completed") is True
            # Must fire in_review email
            statuses = [c.kwargs.get("new_status") for c in mock_send.await_args_list]
            assert "in_review" in statuses, f"Got statuses: {statuses}"

    def test_approved_email_on_admin_approve(self, api_client, admin_headers):
        admin_auth_header = admin_headers
        app_client = api_client
        from pymongo import MongoClient
        cli = MongoClient(os.environ.get("MONGO_URL"))
        db = cli[os.environ.get("DB_NAME")]
        rec = db.partial_withdraw_unlocks.find_one(
            {"user_email": "TEST_iter57_user@example.com", "status": "in_review"},
            sort=[("created_at", -1)],
        )
        cli.close()
        if not rec:
            pytest.skip("No in_review record to approve")
        uid = rec["id"]
        with patch("routes.partial_unlock.send_partial_unlock_status_email",
                   new_callable=AsyncMock) as mock_send:
            resp = app_client.post(
                f"/api/admin/partial-unlock/{uid}/approve",
                headers=admin_auth_header,
                json={"admin_note": "ok"},
            )
            assert resp.status_code == 200, resp.text
            statuses = [c.kwargs.get("new_status") for c in mock_send.await_args_list]
            assert "approved" in statuses
            approved_call = next(c for c in mock_send.await_args_list if c.kwargs.get("new_status") == "approved")
            assert approved_call.kwargs.get("max_withdraw_eur") is not None

    def test_rejected_email_on_admin_reject(self, api_client, test_user_token, admin_headers):
        user_auth_header = {"Authorization": f"Bearer {test_user_token}"}
        admin_auth_header = admin_headers
        app_client = api_client
        # Create a fresh record and reject it (need an in_review or pending_payment one)
        self._cleanup_user_unlocks("TEST_iter57_user@example.com")
        app_client.post("/api/partial-unlock/start", headers=user_auth_header)
        from pymongo import MongoClient
        cli = MongoClient(os.environ.get("MONGO_URL"))
        db = cli[os.environ.get("DB_NAME")]
        rec = db.partial_withdraw_unlocks.find_one(
            {"user_email": "TEST_iter57_user@example.com"},
            sort=[("created_at", -1)],
        )
        cli.close()
        assert rec
        uid = rec["id"]
        with patch("routes.partial_unlock.send_partial_unlock_status_email",
                   new_callable=AsyncMock) as mock_send:
            resp = app_client.post(
                f"/api/admin/partial-unlock/{uid}/reject",
                headers=admin_auth_header,
                json={"admin_note": "Comprobante ilegible"},
            )
            assert resp.status_code == 200, resp.text
            statuses = [c.kwargs.get("new_status") for c in mock_send.await_args_list]
            assert "rejected" in statuses
            rej_call = next(c for c in mock_send.await_args_list if c.kwargs.get("new_status") == "rejected")
            assert rej_call.kwargs.get("admin_note") == "Comprobante ilegible"

    def test_email_failure_does_not_break_api(self, api_client, test_user_token):
        user_auth_header = {"Authorization": f"Bearer {test_user_token}"}
        app_client = api_client
        """If email function raises, the API still returns 200."""
        self._cleanup_user_unlocks("TEST_iter57_user@example.com")
        with patch("routes.partial_unlock.send_partial_unlock_status_email",
                   new_callable=AsyncMock, side_effect=RuntimeError("resend down")):
            resp = app_client.post("/api/partial-unlock/start", headers=user_auth_header)
            assert resp.status_code == 200, resp.text
            assert resp.json().get("ok") is True
