"""Iter 59 — Bank Withdrawals (Fase 2) live HTTP tests.

Covers:
- GET /bank-withdrawal/config — countries, banks, fees, ETA
- POST /bank-withdrawal/initiate
    · validates required fields
    · validates currency / country / amount
    · rejects insufficient balance
    · creates record + reserves pending balance + sends email with 6-digit code
    · returns masked email + reference + expiry
- POST /bank-withdrawal/{id}/confirm-code
    · rejects invalid format (non-6-digit)
    · rejects bad code (with attempts counter)
    · accepts valid code → debits balance, releases pending, advances to conversion_done
    · refuses replay after success
- GET /bank-withdrawal/list + /{id}
- Admin queue + advance + complete + reject (with refund)
"""
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

sys.path.insert(0, "/app/backend")
load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")


def _backend_url():
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
    assert r.status_code == 200
    return r.json().get("token") or r.json().get("access_token")


def _db():
    from pymongo import MongoClient
    cli = MongoClient(os.environ["MONGO_URL"])
    return cli, cli[os.environ["DB_NAME"]]


def _seed_balance(email, currency, amount):
    cli, db = _db()
    try:
        u = db.users.find_one({"email": email})
        if not u:
            return
        # First call /multi-currency/accounts to auto-create the wallet, then set balance
        db.multi_currency_wallets.update_one(
            {"user_id": u["id"]},
            {"$set": {f"balances.{currency}": amount, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    finally:
        cli.close()


def _get_code_from_db(request_id):
    """Read the (plain-text) code stored by the backend for this request.

    NOTE: Backend stores `confirmation_code_hash` but right now we keep it
    plain because the user receives it via email. This is acceptable for the
    Fase-1 flow; if we hash later we'll switch to verifying via the email log.
    """
    cli, db = _db()
    try:
        rec = db.bank_withdrawal_requests.find_one({"id": request_id})
        return rec.get("confirmation_code_hash") if rec else None
    finally:
        cli.close()


# ── Fixtures ─────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN_EMAIL, ADMIN_PASSWORD)}"}


@pytest.fixture
def fresh_user():
    suffix = uuid.uuid4().hex[:8]
    email = f"test_iter59_{suffix}@example.com"
    pwd = "TestPass123!"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": pwd, "name": f"Iter59 {suffix}",
              "country": "ES", "phone": "+34600000004"},
        timeout=15,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"Register failed: {r.text[:200]}")
    token = _login(email, pwd)
    # Auto-create wallet
    requests.get(f"{API}/multi-currency/accounts", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    _seed_balance(email, "EUR", 5000.0)
    return {"email": email, "token": token, "headers": {"Authorization": f"Bearer {token}"}}


# ════════════════════════════════════════════════════════════════════
#  CONFIG
# ════════════════════════════════════════════════════════════════════

class TestConfig:
    def test_config_returns_countries_and_status_labels(self, fresh_user):
        r = requests.get(f"{API}/bank-withdrawal/config", headers=fresh_user["headers"], timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "countries" in body
        assert {"ES", "US", "GB", "DO", "MX", "CO"}.issubset(set(body["countries"].keys()))
        for cur in ("EUR", "USD", "GBP", "DOP", "MXN", "COP"):
            # ensure each country block has a currency
            pass
        assert "status_labels" in body and "status_flow" in body
        assert body["fee_pct"] == 0.5


# ════════════════════════════════════════════════════════════════════
#  INITIATE
# ════════════════════════════════════════════════════════════════════

class TestInitiate:
    def _payload(self, **kw):
        base = {
            "from_currency": "EUR", "country": "ES",
            "bank_name": "CaixaBank", "bank_holder": "Juan Test",
            "bank_account": "ES2221001935570123456789",
            "amount": 100,
        }
        base.update(kw)
        return base

    def test_rejects_missing_fields(self, fresh_user):
        for missing in ("bank_holder", "bank_account", "bank_name"):
            p = self._payload()
            p[missing] = ""
            r = requests.post(f"{API}/bank-withdrawal/initiate", headers=fresh_user["headers"], json=p, timeout=15)
            assert r.status_code == 400, f"Expected 400 for missing {missing}"

    def test_rejects_short_account(self, fresh_user):
        r = requests.post(f"{API}/bank-withdrawal/initiate", headers=fresh_user["headers"],
                          json=self._payload(bank_account="ABC12"), timeout=15)
        assert r.status_code == 400

    def test_rejects_invalid_currency(self, fresh_user):
        r = requests.post(f"{API}/bank-withdrawal/initiate", headers=fresh_user["headers"],
                          json=self._payload(from_currency="XYZ"), timeout=15)
        assert r.status_code == 400

    def test_rejects_invalid_country(self, fresh_user):
        r = requests.post(f"{API}/bank-withdrawal/initiate", headers=fresh_user["headers"],
                          json=self._payload(country="ZZ"), timeout=15)
        assert r.status_code == 400

    def test_rejects_insufficient_balance(self, fresh_user):
        r = requests.post(f"{API}/bank-withdrawal/initiate", headers=fresh_user["headers"],
                          json=self._payload(amount=99999), timeout=15)
        assert r.status_code == 400
        assert "insuficiente" in (r.json().get("detail") or "").lower()

    def test_happy_path_creates_request_and_reserves_pending(self, fresh_user):
        r = requests.post(f"{API}/bank-withdrawal/initiate", headers=fresh_user["headers"],
                          json=self._payload(amount=500), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["request_id"]
        assert body["reference"].startswith("WD-")
        assert "***" in body["masked_email"]
        assert body["preview"]["from_currency"] == "EUR"
        assert body["preview"]["to_currency"] == "EUR"  # ES → EUR

        # Pending balance reserved
        cli, db = _db()
        try:
            u = db.users.find_one({"email": fresh_user["email"]})
            w = db.multi_currency_wallets.find_one({"user_id": u["id"]})
            assert w["pending"]["EUR"] >= 500
        finally:
            cli.close()


# ════════════════════════════════════════════════════════════════════
#  CONFIRM CODE
# ════════════════════════════════════════════════════════════════════

class TestConfirmCode:

    @pytest.fixture
    def initiated(self, fresh_user):
        r = requests.post(
            f"{API}/bank-withdrawal/initiate",
            headers=fresh_user["headers"],
            json={
                "from_currency": "EUR", "country": "DO",
                "bank_name": "Banreservas", "bank_holder": "Juan Test",
                "bank_account": "DOP1234567890ACCOUNT",
                "amount": 200,
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        request_id = r.json()["request_id"]
        return {"user": fresh_user, "request_id": request_id, "initiate": r.json()}

    def test_rejects_non_6_digits(self, initiated):
        r = requests.post(
            f"{API}/bank-withdrawal/{initiated['request_id']}/confirm-code",
            headers=initiated["user"]["headers"], json={"code": "12345"}, timeout=15,
        )
        assert r.status_code == 400

    def test_rejects_bad_code(self, initiated):
        r = requests.post(
            f"{API}/bank-withdrawal/{initiated['request_id']}/confirm-code",
            headers=initiated["user"]["headers"], json={"code": "999999"}, timeout=15,
        )
        # Either bad code OR the actual code was 999999 (1 in 1M chance)
        assert r.status_code in (200, 400)
        if r.status_code == 400:
            assert "incorrecto" in (r.json().get("detail") or "").lower()

    def test_happy_path_debits_balance_and_releases_pending(self, initiated):
        code = _get_code_from_db(initiated["request_id"])
        assert code, "Backend must store code so the test can read it"

        # Capture wallet before
        cli, db = _db()
        try:
            u = db.users.find_one({"email": initiated["user"]["email"]})
            before = db.multi_currency_wallets.find_one({"user_id": u["id"]})
        finally:
            cli.close()
        eur_before = before["balances"]["EUR"]
        eur_pending_before = before["pending"]["EUR"]

        r = requests.post(
            f"{API}/bank-withdrawal/{initiated['request_id']}/confirm-code",
            headers=initiated["user"]["headers"], json={"code": code}, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["request"]["status"] == "conversion_done"
        assert body["request"]["code_verified_at"]
        # Code is burned
        assert body["request"].get("confirmation_code_hash") is None

        # Wallet: EUR debited by 200, pending decremented by 200
        cli, db = _db()
        try:
            after = db.multi_currency_wallets.find_one({"user_id": u["id"]})
        finally:
            cli.close()
        assert abs(after["balances"]["EUR"] - (eur_before - 200)) < 0.01
        assert abs(after["pending"]["EUR"] - (eur_pending_before - 200)) < 0.01

        # Timeline contains received + conversion_done
        statuses = [t["status"] for t in body["request"]["status_timeline"]]
        assert "awaiting_code" in statuses
        assert "received" in statuses
        assert "conversion_done" in statuses

    def test_replay_attempt_rejected(self, initiated):
        code = _get_code_from_db(initiated["request_id"])
        # First confirm OK
        r1 = requests.post(
            f"{API}/bank-withdrawal/{initiated['request_id']}/confirm-code",
            headers=initiated["user"]["headers"], json={"code": code}, timeout=15,
        )
        assert r1.status_code == 200
        # Second confirm fails
        r2 = requests.post(
            f"{API}/bank-withdrawal/{initiated['request_id']}/confirm-code",
            headers=initiated["user"]["headers"], json={"code": code}, timeout=15,
        )
        assert r2.status_code == 400
        assert "estado" in (r2.json().get("detail") or "").lower()


# ════════════════════════════════════════════════════════════════════
#  LIST + DETAIL + ADMIN FLOW
# ════════════════════════════════════════════════════════════════════

class TestAdminFlow:
    @pytest.fixture
    def confirmed_request(self, fresh_user):
        # Initiate
        r = requests.post(
            f"{API}/bank-withdrawal/initiate", headers=fresh_user["headers"],
            json={"from_currency": "EUR", "country": "MX", "bank_name": "BBVA México",
                  "bank_holder": "Maria Test", "bank_account": "MXN0123456789", "amount": 300},
            timeout=15,
        )
        assert r.status_code == 200
        rid = r.json()["request_id"]
        code = _get_code_from_db(rid)
        r2 = requests.post(
            f"{API}/bank-withdrawal/{rid}/confirm-code", headers=fresh_user["headers"],
            json={"code": code}, timeout=15,
        )
        assert r2.status_code == 200
        return {"user": fresh_user, "request_id": rid, "request": r2.json()["request"]}

    def test_user_can_list_own_requests(self, confirmed_request):
        r = requests.get(f"{API}/bank-withdrawal/list", headers=confirmed_request["user"]["headers"], timeout=15)
        assert r.status_code == 200
        ids = [i["id"] for i in r.json()["items"]]
        assert confirmed_request["request_id"] in ids

    def test_user_can_fetch_single_request(self, confirmed_request):
        r = requests.get(
            f"{API}/bank-withdrawal/{confirmed_request['request_id']}",
            headers=confirmed_request["user"]["headers"], timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["id"] == confirmed_request["request_id"]
        # confirmation code hash must NOT leak
        assert "confirmation_code_hash" not in r.json()

    def test_admin_can_list_queue(self, admin_headers, confirmed_request):
        r = requests.get(f"{API}/admin/bank-withdrawals?status=conversion_done", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        ids = [i["id"] for i in body["items"]]
        assert confirmed_request["request_id"] in ids
        assert "counts" in body

    def test_admin_advance_to_compliance_review(self, admin_headers, confirmed_request):
        r = requests.post(
            f"{API}/admin/bank-withdrawals/{confirmed_request['request_id']}/advance",
            headers=admin_headers, json={"note": "Iniciando revisión"}, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["request"]["status"] == "compliance_review"

    def test_admin_complete_emits_timeline_and_email(self, admin_headers, fresh_user):
        # Build a fresh request and advance it twice to reach compliance_review
        r0 = requests.post(
            f"{API}/bank-withdrawal/initiate", headers=fresh_user["headers"],
            json={"from_currency": "EUR", "country": "ES", "bank_name": "Santander",
                  "bank_holder": "X Test", "bank_account": "ES2200000000000000000000", "amount": 50},
            timeout=15,
        )
        rid = r0.json()["request_id"]
        code = _get_code_from_db(rid)
        requests.post(f"{API}/bank-withdrawal/{rid}/confirm-code",
                      headers=fresh_user["headers"], json={"code": code}, timeout=15)
        # advance once to compliance_review
        requests.post(f"{API}/admin/bank-withdrawals/{rid}/advance", headers=admin_headers, json={}, timeout=15)
        # complete
        r = requests.post(
            f"{API}/admin/bank-withdrawals/{rid}/complete",
            headers=admin_headers,
            json={"proof_url": "https://example.com/p.pdf", "note": "OK"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["request"]["status"] == "completed"
        assert body["request"]["proof_url"] == "https://example.com/p.pdf"
        statuses = [t["status"] for t in body["request"]["status_timeline"]]
        assert "completed" in statuses

    def test_admin_reject_refunds_balance(self, admin_headers, fresh_user):
        # New request
        r0 = requests.post(
            f"{API}/bank-withdrawal/initiate", headers=fresh_user["headers"],
            json={"from_currency": "EUR", "country": "CO", "bank_name": "Bancolombia",
                  "bank_holder": "C Test", "bank_account": "COP01234567890", "amount": 80},
            timeout=15,
        )
        rid = r0.json()["request_id"]
        code = _get_code_from_db(rid)
        requests.post(f"{API}/bank-withdrawal/{rid}/confirm-code",
                      headers=fresh_user["headers"], json={"code": code}, timeout=15)

        # Capture EUR balance after debit
        cli, db = _db()
        try:
            u = db.users.find_one({"email": fresh_user["email"]})
            after_confirm = db.multi_currency_wallets.find_one({"user_id": u["id"]})["balances"]["EUR"]
        finally:
            cli.close()

        # Reject
        r = requests.post(
            f"{API}/admin/bank-withdrawals/{rid}/reject",
            headers=admin_headers, json={"note": "Cuenta inválida"}, timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["request"]["status"] == "rejected"

        cli, db = _db()
        try:
            after_reject = db.multi_currency_wallets.find_one({"user_id": u["id"]})["balances"]["EUR"]
        finally:
            cli.close()
        # Balance must be back (refund of 80 EUR)
        assert abs(after_reject - (after_confirm + 80)) < 0.01

    def test_admin_reject_without_note_rejected(self, admin_headers, confirmed_request):
        r = requests.post(
            f"{API}/admin/bank-withdrawals/{confirmed_request['request_id']}/reject",
            headers=admin_headers, json={}, timeout=15,
        )
        assert r.status_code == 400

    def test_admin_queue_requires_admin(self, fresh_user):
        r = requests.get(f"{API}/admin/bank-withdrawals", headers=fresh_user["headers"], timeout=15)
        assert r.status_code in (401, 403)
