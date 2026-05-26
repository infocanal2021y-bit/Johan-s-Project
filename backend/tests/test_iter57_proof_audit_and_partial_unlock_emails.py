"""Iter 57 backend tests (live HTTP against the running backend).

(A) POST /api/admin/bank-transfer/proof/mark-viewed
    - 401/403 for unauth/non-admin
    - 400 if neither reference nor payment_id is given
    - 404 if reference is unknown
    - First admin call stamps proof_reviewed_{at,by,by_name}
    - Second admin call is idempotent (timestamp not overwritten)
    - GET /admin/bank-transfer/proof now returns the audit fields

(B) Partial-unlock 40% email + audit lifecycle:
    - pending_payment → in_review → approved (or rejected)
    - email_logs collection receives EXACTLY ONE entry per transition
    - audit_log[] grows on every transition with previous_status/new_status,
      actor metadata and a note when admin rejects
    - API response is unaffected by email pipeline (200 even when Resend is
      skipped because RESEND_API_KEY is empty)

(C) Wise removal regression:
    - frontend, backend (non-test), email templates and DB seed/demo must
      contain zero hard references to "Wise", "TRWIBEB", or the old IBAN.

Run with:
    cd /app/backend && python -m pytest tests/test_iter57_proof_audit_and_partial_unlock_emails.py -v
"""
import os
import re
import sys
import time
import uuid
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

sys.path.insert(0, "/app/backend")
load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")


# ── URL + creds ──────────────────────────────────────────────────────
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
SEED_REFERENCE = "TEST-216389"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


def _db():
    from pymongo import MongoClient
    cli = MongoClient(os.environ["MONGO_URL"])
    return cli, cli[os.environ["DB_NAME"]]


# ── Fixtures ─────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def fresh_user():
    """Register a brand new test user (no active partial-unlock request)."""
    suffix = uuid.uuid4().hex[:8]
    email = f"test_iter57_{suffix}@example.com"
    pwd = "TestPass123!"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": pwd, "name": f"Iter57 Tester {suffix}",
              "country": "ES", "phone": "+34600000000"},
        timeout=15,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"Cannot register fresh user: {r.status_code} {r.text[:200]}")
    return {"email": email, "password": pwd, "token": _login(email, pwd)}


@pytest.fixture
def fresh_user_headers(fresh_user):
    return {"Authorization": f"Bearer {fresh_user['token']}"}


# ════════════════════════════════════════════════════════════════════
#  (A) /admin/bank-transfer/proof/mark-viewed
# ════════════════════════════════════════════════════════════════════

class TestMarkViewedEndpoint:
    @pytest.fixture(autouse=True)
    def _reset_audit_stamp(self):
        """Clear the audit stamp before each test so first-call invariants hold."""
        cli, db = _db()
        db.bank_transfer_payments.update_one(
            {"reference": SEED_REFERENCE},
            {"$unset": {"proof_reviewed_at": "", "proof_reviewed_by": "", "proof_reviewed_by_name": ""}},
        )
        cli.close()

    def test_no_auth_rejected(self):
        r = requests.post(f"{API}/admin/bank-transfer/proof/mark-viewed",
                          json={"reference": SEED_REFERENCE}, timeout=15)
        assert r.status_code in (401, 403)

    def test_non_admin_rejected(self, fresh_user_headers):
        r = requests.post(f"{API}/admin/bank-transfer/proof/mark-viewed",
                          json={"reference": SEED_REFERENCE}, headers=fresh_user_headers, timeout=15)
        assert r.status_code in (401, 403)

    def test_missing_args_400(self, admin_headers):
        r = requests.post(f"{API}/admin/bank-transfer/proof/mark-viewed",
                          json={}, headers=admin_headers, timeout=15)
        assert r.status_code == 400
        assert "Indique reference o payment_id" in (r.json().get("detail") or "")

    def test_unknown_reference_404(self, admin_headers):
        r = requests.post(f"{API}/admin/bank-transfer/proof/mark-viewed",
                          json={"reference": "no-such-ref-xyz-9876"},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 404
        assert "Transferencia no encontrada" in (r.json().get("detail") or "")

    def test_first_call_stamps_and_second_is_idempotent(self, admin_headers):
        cli, db = _db()
        if db.bank_transfer_payments.count_documents({"reference": SEED_REFERENCE}) == 0:
            cli.close()
            pytest.skip(f"Seed reference {SEED_REFERENCE} missing from DB")
        cli.close()

        r1 = requests.post(f"{API}/admin/bank-transfer/proof/mark-viewed",
                           json={"reference": SEED_REFERENCE}, headers=admin_headers, timeout=15)
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1["ok"] is True
        assert b1["already_reviewed"] is False
        assert b1.get("proof_reviewed_at")
        assert b1.get("proof_reviewed_by")
        assert b1.get("proof_reviewed_by_name")
        ts1 = b1["proof_reviewed_at"]

        r2 = requests.post(f"{API}/admin/bank-transfer/proof/mark-viewed",
                           json={"reference": SEED_REFERENCE}, headers=admin_headers, timeout=15)
        assert r2.status_code == 200
        b2 = r2.json()
        assert b2["already_reviewed"] is True
        assert b2["proof_reviewed_at"] == ts1, "Timestamp must not be overwritten"

        # GET /proof now includes audit fields
        rg = requests.get(f"{API}/admin/bank-transfer/proof",
                          params={"reference": SEED_REFERENCE}, headers=admin_headers, timeout=15)
        assert rg.status_code == 200
        p = rg.json()["payment"]
        assert p.get("proof_reviewed_at") == ts1
        assert p.get("proof_reviewed_by")
        assert p.get("proof_reviewed_by_name")


# ════════════════════════════════════════════════════════════════════
#  (B) Partial-unlock 40 % — emails + audit_log lifecycle
# ════════════════════════════════════════════════════════════════════

SUBJECTS = {
    "pending_payment": "📥 Solicitud de retiro parcial 40% recibida",
    "in_review":       "🔍 Comprobante recibido — en revisión",
    "approved":        "✅ Retiro parcial 40% APROBADO",
    "rejected":        "⚠️ Solicitud de retiro 40% — Acción requerida",
}


def _count_email_logs(email, subject, since_iso):
    cli, db = _db()
    try:
        return db.email_logs.count_documents(
            {"to_email": email, "subject": subject, "created_at": {"$gte": since_iso}}
        )
    finally:
        cli.close()


def _seed_balance(user_email, eur=10_000.0):
    """Bypass the no-balance check by giving the user a checking account."""
    cli, db = _db()
    try:
        u = db.users.find_one({"email": user_email})
        if not u:
            return
        if not db.accounts.find_one({"user_id": u["id"], "account_type": "checking"}):
            db.accounts.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": u["id"],
                "account_type": "checking",
                "balance_eur": eur,
                "balance_usd": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        else:
            db.accounts.update_one(
                {"user_id": u["id"], "account_type": "checking"},
                {"$set": {"balance_eur": eur}},
            )
    finally:
        cli.close()


class TestPartialUnlockLifecycle:

    def test_start_sends_pending_payment_email_and_writes_audit(self, fresh_user, fresh_user_headers):
        _seed_balance(fresh_user["email"])
        t0 = datetime.now(timezone.utc).isoformat()

        r = requests.post(f"{API}/partial-unlock/start", headers=fresh_user_headers, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["request"]["payment_reference"].startswith("R40-")

        # Email log written EXACTLY once
        time.sleep(1.2)
        n = _count_email_logs(fresh_user["email"], SUBJECTS["pending_payment"], t0)
        assert n == 1, f"Expected 1 pending_payment email log, got {n}"

        # audit_log seeded with the creation event
        cli, db = _db()
        try:
            rec = db.partial_withdraw_unlocks.find_one(
                {"user_email": fresh_user["email"]}, sort=[("created_at", -1)]
            )
            assert rec is not None
            log = rec.get("audit_log") or []
            assert len(log) >= 1
            first = log[0]
            assert first["previous_status"] is None
            assert first["new_status"] == "pending_payment"
            assert first["actor_role"] == "user"
            assert first["actor_email"] == fresh_user["email"]
            assert first.get("at")
        finally:
            cli.close()

    def test_proof_triggers_in_review_with_single_email_and_audit(self, fresh_user, fresh_user_headers):
        t1 = datetime.now(timezone.utc).isoformat()
        r = requests.post(
            f"{API}/partial-unlock/proof",
            headers=fresh_user_headers,
            json={"tx_hash": "TEST_iter57_fullpay_hash_" + uuid.uuid4().hex[:12], "amount_eur": 2660.0},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("completed") is True

        time.sleep(1.2)
        n = _count_email_logs(fresh_user["email"], SUBJECTS["in_review"], t1)
        assert n == 1, f"Expected 1 in_review email log, got {n}"

        cli, db = _db()
        try:
            rec = db.partial_withdraw_unlocks.find_one(
                {"user_email": fresh_user["email"]}, sort=[("created_at", -1)]
            )
            assert rec["status"] == "in_review"
            log = rec.get("audit_log") or []
            transitions = [(e.get("previous_status"), e.get("new_status")) for e in log]
            assert (None, "pending_payment") in transitions
            assert ("pending_payment", "in_review") in transitions
        finally:
            cli.close()

    def test_admin_approve_sends_approved_email_and_appends_audit(self, fresh_user, fresh_user_headers, admin_headers):
        cli, db = _db()
        try:
            rec = db.partial_withdraw_unlocks.find_one(
                {"user_email": fresh_user["email"], "status": "in_review"},
                sort=[("created_at", -1)],
            )
        finally:
            cli.close()
        assert rec, "Expected an in_review record from the previous test"
        uid = rec["id"]

        t2 = datetime.now(timezone.utc).isoformat()
        r = requests.post(
            f"{API}/admin/partial-unlock/{uid}/approve",
            headers=admin_headers, json={"admin_note": "iter57 OK"}, timeout=20,
        )
        assert r.status_code == 200, r.text

        time.sleep(1.2)
        n = _count_email_logs(fresh_user["email"], SUBJECTS["approved"], t2)
        assert n == 1, f"Expected 1 approved email log, got {n}"

        cli, db = _db()
        try:
            rec2 = db.partial_withdraw_unlocks.find_one({"id": uid})
            assert rec2["status"] == "approved"
            assert rec2["admin_validated_at"]
            assert rec2["admin_validated_by"] == ADMIN_EMAIL
            log = rec2.get("audit_log") or []
            assert any(
                e.get("new_status") == "approved" and e.get("actor_role") == "admin"
                and e.get("actor_email") == ADMIN_EMAIL
                for e in log
            ), f"approved audit entry missing: {log}"
        finally:
            cli.close()

    def test_admin_reject_sends_rejected_email_and_appends_audit(self, admin_headers):
        """Use a separate user so we don't disturb approved records."""
        suffix = uuid.uuid4().hex[:8]
        email = f"test_iter57r_{suffix}@example.com"
        pwd = "TestPass123!"
        reg = requests.post(
            f"{API}/auth/register",
            json={"email": email, "password": pwd, "name": f"Iter57 Reject {suffix}",
                  "country": "ES", "phone": "+34600000001"},
            timeout=15,
        )
        if reg.status_code not in (200, 201):
            pytest.skip(f"Cannot register reject test user: {reg.status_code} {reg.text[:200]}")
        token = _login(email, pwd)
        hdr = {"Authorization": f"Bearer {token}"}
        _seed_balance(email)

        # Create + submit proof to reach in_review
        rs = requests.post(f"{API}/partial-unlock/start", headers=hdr, timeout=20)
        assert rs.status_code == 200
        rp = requests.post(
            f"{API}/partial-unlock/proof",
            headers=hdr,
            json={"tx_hash": "TEST_iter57_rej_" + uuid.uuid4().hex[:12], "amount_eur": 2660.0},
            timeout=20,
        )
        assert rp.status_code == 200

        cli, db = _db()
        try:
            rec = db.partial_withdraw_unlocks.find_one({"user_email": email}, sort=[("created_at", -1)])
        finally:
            cli.close()
        uid = rec["id"]

        t3 = datetime.now(timezone.utc).isoformat()
        rr = requests.post(
            f"{API}/admin/partial-unlock/{uid}/reject",
            headers=admin_headers,
            json={"admin_note": "Comprobante ilegible iter57"},
            timeout=20,
        )
        assert rr.status_code == 200, rr.text

        time.sleep(1.2)
        n = _count_email_logs(email, SUBJECTS["rejected"], t3)
        assert n == 1, f"Expected 1 rejected email log, got {n}"

        cli, db = _db()
        try:
            rec2 = db.partial_withdraw_unlocks.find_one({"id": uid})
            assert rec2["status"] == "rejected"
            assert rec2["admin_validated_by"] == ADMIN_EMAIL
            assert rec2["admin_note"] == "Comprobante ilegible iter57"
            log = rec2.get("audit_log") or []
            reject_entries = [e for e in log if e.get("new_status") == "rejected"]
            assert len(reject_entries) == 1
            assert reject_entries[0]["actor_role"] == "admin"
            assert reject_entries[0]["actor_email"] == ADMIN_EMAIL
            assert reject_entries[0]["note"] == "Comprobante ilegible iter57"
        finally:
            cli.close()

    def test_api_response_unaffected_by_email_pipeline(self, fresh_user_headers):
        """Even if Resend is skipped (no API key), the API must still return 200 + payload."""
        # Idempotent start on existing user — must still respond 200 ok=true.
        r = requests.post(f"{API}/partial-unlock/start", headers=fresh_user_headers, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True
        ref = body.get("request", {}).get("payment_reference", "")
        assert ref.startswith("R40-")


# ════════════════════════════════════════════════════════════════════
#  (C) Wise removal regression — broad scope
# ════════════════════════════════════════════════════════════════════

WISE_PATTERNS = r"'\\bWise\\b|TRWIBEB|BE73 9053'"


class TestWiseRemovalBroad:
    def test_no_wise_in_backend_code(self):
        """Backend python code (excluding tests + this test) must not contain Wise refs.

        We exclude 'otherwise' / 'wisely' etc. by using a word-boundary regex.
        """
        cmd = (
            "grep -rnE 'TRWIBEB|BE73 9053|\\bWise\\b' "
            "/app/backend --include='*.py' --exclude-dir=tests"
        )
        out = subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True)
        assert out.stdout.strip() == "", f"Wise refs in backend:\n{out.stdout}"

    def test_no_wise_in_frontend_code(self):
        cmd = (
            "grep -rnE 'TRWIBEB|BE73 9053|\\bWise\\b' "
            "/app/frontend/src"
        )
        out = subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True)
        assert out.stdout.strip() == "", f"Wise refs in frontend:\n{out.stdout}"

    def test_no_wise_in_email_templates(self):
        """Service-level email module + any html templates must be Wise-free."""
        cmd = (
            "grep -rnE 'TRWIBEB|BE73 9053|\\bWise\\b' "
            "/app/backend/services /app/backend/templates 2>/dev/null || true"
        )
        out = subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True)
        assert out.stdout.strip() == "", f"Wise refs in email/templates:\n{out.stdout}"

    def test_no_wise_in_database_seed_or_demo(self):
        """Scan every Mongo collection for residual Wise / TRWIBEB / old IBAN refs."""
        import json
        cli, db = _db()
        try:
            offending = []
            pattern = re.compile(r"\bWise\b|TRWIBEB|BE73 9053", re.IGNORECASE)
            for coll_name in db.list_collection_names():
                for doc in db[coll_name].find({}, {"_id": 0}).limit(5000):
                    try:
                        txt = json.dumps(doc, default=str)
                    except Exception:
                        continue
                    if pattern.search(txt):
                        offending.append((coll_name, doc.get("id") or doc.get("reference") or doc.get("email") or "?"))
                        break
            assert not offending, f"Wise refs found in DB collections: {offending}"
        finally:
            cli.close()


# ════════════════════════════════════════════════════════════════════
#  (D) Email dedup — exactly one log per transition (sanity)
# ════════════════════════════════════════════════════════════════════

class TestEmailDedup:
    def test_start_is_idempotent_and_does_not_resend_email(self, admin_headers):
        """Calling /partial-unlock/start twice for the same user with an active
        record must NOT send a second 'pending_payment' email."""
        suffix = uuid.uuid4().hex[:8]
        email = f"test_iter57_dedup_{suffix}@example.com"
        pwd = "TestPass123!"
        reg = requests.post(
            f"{API}/auth/register",
            json={"email": email, "password": pwd, "name": f"Iter57 Dedup {suffix}",
                  "country": "ES", "phone": "+34600000002"},
            timeout=15,
        )
        if reg.status_code not in (200, 201):
            pytest.skip("Cannot register dedup user")
        token = _login(email, pwd)
        hdr = {"Authorization": f"Bearer {token}"}
        _seed_balance(email)

        t0 = datetime.now(timezone.utc).isoformat()
        r1 = requests.post(f"{API}/partial-unlock/start", headers=hdr, timeout=20)
        assert r1.status_code == 200
        time.sleep(0.8)
        # Second call must be a no-op for email pipeline (idempotent)
        r2 = requests.post(f"{API}/partial-unlock/start", headers=hdr, timeout=20)
        assert r2.status_code == 200
        assert r2.json().get("created") is False

        time.sleep(0.6)
        n = _count_email_logs(email, SUBJECTS["pending_payment"], t0)
        assert n == 1, f"Expected exactly 1 pending_payment email after dup start, got {n}"
