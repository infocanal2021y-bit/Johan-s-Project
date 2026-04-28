"""
LIONSBIT — Accounts Lifecycle / Auto-heal regression
====================================================
Covers the 10 review-request cases for the bug fix
"Checking account not found" + new admin endpoints
(/admin/backfill-accounts, /admin/users/{id}/balance-summary)
+ client-import auto-provisioning.
"""
import os
import io
import uuid
import time
import pytest
import requests
from datetime import datetime, timezone
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"

# ──────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    client.close()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _seed_broken_user(mongo, suffix=""):
    """Insert a user directly in mongo WITHOUT any accounts."""
    uid = str(uuid.uuid4())
    email = f"broken_{suffix}_{uid[:8]}@test.lionsbit.es"
    doc = {
        "id": uid,
        "name": f"Broken User {suffix}",
        "email": email,
        "password": "$2b$12$abc",  # fake hash, never used
        "role": "user",
        "verification_status": "unverified",
        "account_status": "active",
        "must_change_password": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_reactivated": False,
        "is_online": False,
    }
    mongo.users.insert_one(doc)
    return uid, email


@pytest.fixture
def broken_user(mongo):
    uid, email = _seed_broken_user(mongo, "addbal")
    yield uid, email
    mongo.users.delete_one({"id": uid})
    mongo.accounts.delete_many({"user_id": uid})
    mongo.transactions.delete_many({"user_id": uid})
    mongo.notifications.delete_many({"user_id": uid})


@pytest.fixture
def cleanup_test_data(mongo):
    """Sweep all @test.lionsbit.es users + their accounts after the suite."""
    yield
    test_users = list(mongo.users.find({"email": {"$regex": "@test.lionsbit.es$"}}, {"id": 1}))
    ids = [u["id"] for u in test_users]
    if ids:
        mongo.users.delete_many({"id": {"$in": ids}})
        mongo.accounts.delete_many({"user_id": {"$in": ids}})
        mongo.transactions.delete_many({"user_id": {"$in": ids}})
        mongo.notifications.delete_many({"user_id": {"$in": ids}})
    mongo.client_import_jobs.delete_many({"filename": {"$regex": "^TEST_"}})


# ──────────────────────────────────────────────────────────
# 1. add-balance auto-heals
# ──────────────────────────────────────────────────────────
class TestAddBalanceAutoHeal:
    def test_add_balance_user_without_checking_no_404(self, admin_headers, broken_user, mongo):
        uid, email = broken_user
        assert mongo.accounts.count_documents({"user_id": uid}) == 0  # pre-condition

        r = requests.post(f"{BASE_URL}/api/admin/add-balance",
                          headers=admin_headers,
                          json={"user_id": uid, "amount": 250.0, "currency": "EUR",
                                "description": "TEST_autoheal"},
                          timeout=20)
        assert r.status_code == 200, f"Expected 200, got {r.status_code} → {r.text}"
        body = r.json()
        assert body.get("new_balance") == 250.0
        assert body.get("user_id") == uid
        assert body.get("amount") == 250.0
        assert body.get("currency") == "EUR"
        assert "transaction_id" in body

        # checking account auto-created
        chk = mongo.accounts.find_one({"user_id": uid, "account_type": "checking"})
        assert chk is not None
        assert chk.get("auto_provisioned") is True
        assert chk.get("balance_eur") == 250.0
        assert chk.get("status") == "active"
        assert chk.get("withdrawal_status") == "idle"

    def test_add_balance_admin_credit_transaction_persisted(self, admin_headers, broken_user, mongo):
        uid, _ = broken_user
        r = requests.post(f"{BASE_URL}/api/admin/add-balance",
                          headers=admin_headers,
                          json={"user_id": uid, "amount": 100.0, "currency": "USD"},
                          timeout=20)
        assert r.status_code == 200
        tx_id = r.json()["transaction_id"]
        tx = mongo.transactions.find_one({"id": tx_id})
        assert tx is not None
        assert tx["transaction_type"] == "admin_credit"
        assert tx["amount"] == 100.0
        assert tx["currency"] == "USD"
        assert tx["status"] == "completed"


# ──────────────────────────────────────────────────────────
# 2. tax-payment auto-heals (no 404)
# ──────────────────────────────────────────────────────────
class TestTaxPaymentAutoHeal:
    def test_tax_payment_user_without_checking_no_404(self, mongo, cleanup_test_data):
        """Register a real test user, drop any auto-created accounts, set
        up a pending_tax transaction, and call pay-tax. The endpoint must
        auto-heal the missing checking account (validating the
        ensure_checking_account integration). It will then 400 on
        'Insufficient USD funds' — that's the EXPECTED guard, NOT a 404."""
        unique = str(uuid.uuid4())[:8]
        email = f"taxheal_{unique}@test.lionsbit.es"
        password = "TaxPass123!"
        reg = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"name": "Tax Heal", "email": email, "password": password},
                            timeout=15)
        assert reg.status_code == 200, f"register failed: {reg.text}"
        token = reg.json()["token"]
        uid = reg.json()["user"]["id"]

        # drop auto-created accounts to simulate a "broken" legacy user
        mongo.accounts.delete_many({"user_id": uid})
        assert mongo.accounts.count_documents({"user_id": uid}) == 0

        # forge a pending_tax transaction owned by this user
        tx_id = str(uuid.uuid4())
        mongo.transactions.insert_one({
            "id": tx_id,
            "user_id": uid,
            "account_id": "fake-acct",
            "transaction_type": "withdraw",
            "amount": 5000.0,
            "currency": "USD",
            "status": "pending_tax",
            "tax_required": 1000.0,
            "tax_paid": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "transaction_reference": "TEST_TAX_REF",
        })

        r = requests.post(f"{BASE_URL}/api/transactions/{tx_id}/pay-tax",
                          headers={"Authorization": f"Bearer {token}",
                                   "Content-Type": "application/json"},
                          json={"amount": 1000.0},
                          timeout=20)
        # Must NOT be 404 'Checking account not found'.
        assert r.status_code != 404, f"Got 404: {r.text}"
        # Auto-healed checking exists now
        assert mongo.accounts.count_documents(
            {"user_id": uid, "account_type": "checking"}
        ) == 1
        # Body must be the insufficient-funds 400 (since auto-healed acct is empty)
        assert r.status_code == 400
        assert "Insufficient" in r.text or "insufficient" in r.text


# ──────────────────────────────────────────────────────────
# 3. backfill-accounts (admin only, idempotent)
# ──────────────────────────────────────────────────────────
class TestBackfillAccounts:
    def test_backfill_returns_full_payload(self, admin_headers, mongo, cleanup_test_data):
        # seed 3 broken users
        uids = []
        for i in range(3):
            uid, _ = _seed_broken_user(mongo, f"backfill{i}")
            uids.append(uid)

        r = requests.post(f"{BASE_URL}/api/admin/backfill-accounts",
                          headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("total_users", "already_complete", "created_checking",
                  "created_savings", "by_segment", "errors"):
            assert k in body, f"missing field {k}"
        for seg in ("reactivated", "regular", "admin"):
            assert seg in body["by_segment"]
        assert isinstance(body["errors"], list)
        assert body["created_checking"] >= 3
        assert body["created_savings"] >= 3
        # Now every seeded user has both accounts
        for uid in uids:
            assert mongo.accounts.count_documents({"user_id": uid, "account_type": "checking"}) == 1
            assert mongo.accounts.count_documents({"user_id": uid, "account_type": "savings"}) == 1

    def test_backfill_idempotent(self, admin_headers, mongo, cleanup_test_data):
        # seed one broken user
        uid, _ = _seed_broken_user(mongo, "idem")
        # 1st call creates
        r1 = requests.post(f"{BASE_URL}/api/admin/backfill-accounts",
                           headers=admin_headers, timeout=60).json()
        # 2nd call must NOT create more for already-fixed users
        r2 = requests.post(f"{BASE_URL}/api/admin/backfill-accounts",
                           headers=admin_headers, timeout=60).json()
        assert mongo.accounts.count_documents({"user_id": uid, "account_type": "checking"}) == 1
        assert mongo.accounts.count_documents({"user_id": uid, "account_type": "savings"}) == 1
        # 2nd run should report already_complete >= 1st run
        assert r2["already_complete"] >= r1["already_complete"]

    def test_backfill_requires_admin(self, mongo, cleanup_test_data):
        # register a normal user
        unique = str(uuid.uuid4())[:8]
        email = f"reg_{unique}@test.lionsbit.es"
        reg = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"name": "Reg", "email": email, "password": "Pass1234!"},
                            timeout=15)
        assert reg.status_code == 200
        token = reg.json()["token"]
        r = requests.post(f"{BASE_URL}/api/admin/backfill-accounts",
                          headers={"Authorization": f"Bearer {token}"},
                          timeout=20)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"


# ──────────────────────────────────────────────────────────
# 4. balance-summary
# ──────────────────────────────────────────────────────────
class TestBalanceSummary:
    def test_balance_summary_returns_4_fields(self, admin_headers, mongo, broken_user):
        uid, email = broken_user
        # ensure no accounts → endpoint must self-heal
        mongo.accounts.delete_many({"user_id": uid})
        r = requests.get(f"{BASE_URL}/api/admin/users/{uid}/balance-summary",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("total_balance", "available_balance", "invested_balance", "withdrawal_status"):
            assert k in body, f"missing {k}"
        assert isinstance(body["total_balance"], (int, float))
        assert body["available_balance"] == 0
        assert body["invested_balance"] == 0
        assert body["withdrawal_status"] == "idle"
        # user object
        assert "user" in body
        assert body["user"]["id"] == uid
        assert body["user"]["email"] == email
        # self-heal verified
        assert mongo.accounts.count_documents({"user_id": uid, "account_type": "checking"}) == 1
        assert mongo.accounts.count_documents({"user_id": uid, "account_type": "savings"}) == 1

    def test_balance_summary_user_not_found(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/users/{uuid.uuid4()}/balance-summary",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 404

    def test_balance_summary_requires_admin(self, mongo, cleanup_test_data):
        unique = str(uuid.uuid4())[:8]
        email = f"reg2_{unique}@test.lionsbit.es"
        reg = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"name": "Reg2", "email": email, "password": "Pass1234!"},
                            timeout=15)
        token = reg.json()["token"]
        uid = reg.json()["user"]["id"]
        r = requests.get(f"{BASE_URL}/api/admin/users/{uid}/balance-summary",
                         headers={"Authorization": f"Bearer {token}"}, timeout=20)
        assert r.status_code == 403


# ──────────────────────────────────────────────────────────
# 5. Idempotency of ensure_checking_account
# ──────────────────────────────────────────────────────────
class TestEnsureCheckingIdempotency:
    def test_calling_5_times_creates_only_one_doc(self, admin_headers, mongo, broken_user):
        """5 consecutive add-balance calls (each invokes ensure_checking_account)
        must produce exactly 1 checking account document."""
        uid, _ = broken_user
        for i in range(5):
            r = requests.post(f"{BASE_URL}/api/admin/add-balance",
                              headers=admin_headers,
                              json={"user_id": uid, "amount": 10.0, "currency": "EUR"},
                              timeout=20)
            assert r.status_code == 200, r.text
        # Strict assertion: exactly 1 checking
        cnt = mongo.accounts.count_documents({"user_id": uid, "account_type": "checking"})
        assert cnt == 1, f"expected 1 checking acct, got {cnt}"
        # And balance accumulated correctly
        chk = mongo.accounts.find_one({"user_id": uid, "account_type": "checking"})
        assert chk["balance_eur"] == 50.0


# ──────────────────────────────────────────────────────────
# 6. Auto-provisioned schema verification
# ──────────────────────────────────────────────────────────
class TestAutoProvisionedSchema:
    def test_schema_fields(self, admin_headers, mongo, broken_user):
        uid, _ = broken_user
        # trigger ensure via balance-summary (no balance side-effect)
        r = requests.get(f"{BASE_URL}/api/admin/users/{uid}/balance-summary",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200
        chk = mongo.accounts.find_one({"user_id": uid, "account_type": "checking"})
        assert chk is not None
        # required fields
        assert "id" in chk and isinstance(chk["id"], str) and len(chk["id"]) >= 32
        assert chk["user_id"] == uid
        assert chk["account_type"] == "checking"
        assert chk["balance_eur"] == 0
        assert chk["balance_usd"] == 0
        assert chk["invested_balance_eur"] == 0
        assert chk["invested_balance_usd"] == 0
        assert chk["withdrawal_status"] == "idle"
        assert chk["status"] == "active"
        assert chk["auto_provisioned"] is True
        # ISO datetime parses
        datetime.fromisoformat(chk["created_at"])


# ──────────────────────────────────────────────────────────
# 7. Client-import: create + reactivate auto-provision
# ──────────────────────────────────────────────────────────
def _build_csv(rows):
    """rows: list[dict] with keys name,email,phone,country,group,balance"""
    header = "name,email,phone,country,group,balance"
    lines = [header]
    for r in rows:
        lines.append(",".join(str(r.get(k, "")) for k in
                              ("name", "email", "phone", "country", "group", "balance")))
    return "\n".join(lines).encode()


class TestClientImportAutoProvision:
    def test_create_path_auto_provisions_with_seed(self, admin_token, mongo, cleanup_test_data):
        unique = str(uuid.uuid4())[:6]
        email1 = f"imp_create_{unique}@test.lionsbit.es"
        csv = _build_csv([
            {"name": "Imp Create", "email": email1, "phone": "+34900111222",
             "country": "ES", "group": "espanoles", "balance": 1234.5},
        ])
        files = {"file": (f"TEST_create_{unique}.csv", csv, "text/csv")}
        data = {"default_group": "espanoles"}
        headers = {"Authorization": f"Bearer {admin_token}"}
        prev = requests.post(f"{BASE_URL}/api/admin/client-import/preview",
                             files=files, data=data, headers=headers, timeout=30)
        assert prev.status_code == 200, prev.text
        job_id = prev.json()["job_id"]
        ex = requests.post(f"{BASE_URL}/api/admin/client-import/execute/{job_id}",
                           headers=headers, timeout=60)
        assert ex.status_code == 200, ex.text

        user = mongo.users.find_one({"email": email1})
        assert user is not None
        uid = user["id"]
        chk = mongo.accounts.find_one({"user_id": uid, "account_type": "checking"})
        sav = mongo.accounts.find_one({"user_id": uid, "account_type": "savings"})
        assert chk is not None and sav is not None
        assert chk["balance_eur"] == 1234.5
        assert chk["invested_balance_eur"] == 0
        assert chk["withdrawal_status"] == "idle"
        assert chk["auto_provisioned"] is True

    def test_reactivate_path_auto_heals_and_no_dup(self, admin_token, mongo, cleanup_test_data):
        # seed an existing user WITHOUT accounts (will be reactivated)
        unique = str(uuid.uuid4())[:6]
        email = f"imp_react_{unique}@test.lionsbit.es"
        uid = str(uuid.uuid4())
        mongo.users.insert_one({
            "id": uid, "name": "ReAct", "email": email,
            "password": "$2b$12$xxx", "role": "user",
            "verification_status": "unverified",
            "account_status": "active",
            "is_reactivated": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "must_change_password": False,
        })
        csv = _build_csv([
            {"name": "ReAct", "email": email, "phone": "", "country": "ES",
             "group": "espanoles", "balance": 0},
        ])
        files = {"file": (f"TEST_react_{unique}.csv", csv, "text/csv")}
        data = {"default_group": "espanoles"}
        headers = {"Authorization": f"Bearer {admin_token}"}
        prev = requests.post(f"{BASE_URL}/api/admin/client-import/preview",
                             files=files, data=data, headers=headers, timeout=30)
        assert prev.status_code == 200, prev.text
        rows = prev.json()["rows"]
        # confirm it's recognised as a reactivate action
        assert any(r.get("action") == "reactivate" for r in rows), f"rows={rows}"
        job_id = prev.json()["job_id"]
        ex = requests.post(f"{BASE_URL}/api/admin/client-import/execute/{job_id}",
                           headers=headers, timeout=60)
        assert ex.status_code == 200, ex.text

        # Both accounts should now exist exactly once
        assert mongo.accounts.count_documents({"user_id": uid, "account_type": "checking"}) == 1
        assert mongo.accounts.count_documents({"user_id": uid, "account_type": "savings"}) == 1

        # Re-run import to confirm no duplication
        files2 = {"file": (f"TEST_react2_{unique}.csv", csv, "text/csv")}
        prev2 = requests.post(f"{BASE_URL}/api/admin/client-import/preview",
                              files=files2, data=data, headers=headers, timeout=30)
        assert prev2.status_code == 200
        ex2 = requests.post(f"{BASE_URL}/api/admin/client-import/execute/{prev2.json()['job_id']}",
                            headers=headers, timeout=60)
        assert ex2.status_code == 200
        assert mongo.accounts.count_documents({"user_id": uid, "account_type": "checking"}) == 1
        assert mongo.accounts.count_documents({"user_id": uid, "account_type": "savings"}) == 1


# ──────────────────────────────────────────────────────────
# 8. Regression: signup still creates checking+savings without dup
# ──────────────────────────────────────────────────────────
class TestSignupRegression:
    def test_signup_creates_accounts_no_dup(self, mongo, cleanup_test_data):
        unique = str(uuid.uuid4())[:8]
        email = f"signup_{unique}@test.lionsbit.es"
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"name": "Sign", "email": email, "password": "Pass1234!"},
                          timeout=15)
        assert r.status_code == 200, r.text
        uid = r.json()["user"]["id"]
        chk = mongo.accounts.count_documents({"user_id": uid, "account_type": "checking"})
        sav = mongo.accounts.count_documents({"user_id": uid, "account_type": "savings"})
        assert chk == 1, f"expected 1 checking, got {chk}"
        assert sav == 1, f"expected 1 savings, got {sav}"

    def test_admin_login_still_works(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                          timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"

    def test_admin_users_listing(self, admin_headers, mongo):
        r = requests.get(f"{BASE_URL}/api/admin/users",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list) and len(users) > 0
        # admin should be intact with its 2 accounts
        admin = mongo.users.find_one({"email": ADMIN_EMAIL})
        assert admin is not None
        assert mongo.accounts.count_documents({"user_id": admin["id"]}) >= 2
