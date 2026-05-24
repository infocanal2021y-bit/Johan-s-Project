"""Backend tests for GET /api/admin/bank-transfer/proof (notification proof viewer).

Validates:
- 200 + data_uri (data:image/png;base64,...) for seeded reference TEST-216389
- 404 'Transferencia no encontrada' for nonexistent reference
- 400 'Indique reference o payment_id' when neither param provided
- Auth gate: 401/403 without token; 401/403 for non-admin user
- payment_id lookup also works
"""
import os
import pytest
import requests
from pathlib import Path


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
    assert BASE_URL, "REACT_APP_BACKEND_URL not configured"
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def user_token():
    """Try to register / login a basic non-admin user to verify role gate."""
    email = "TEST_proofviewer_user@example.com"
    pwd = "TestPwd2026!"
    # Try login first
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": pwd}, timeout=15,
    )
    if r.status_code != 200:
        # try to register
        reg = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": pwd, "name": "Test User", "country": "ES"},
            timeout=15,
        )
        if reg.status_code in (200, 201):
            r = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": email, "password": pwd}, timeout=15,
            )
    if r.status_code != 200:
        pytest.skip("Could not create/login non-admin user for role gate test")
    return r.json().get("token") or r.json().get("access_token")


# --------- Auth ---------

class TestAuthGate:
    def test_no_token_rejected(self):
        r = requests.get(
            f"{BASE_URL}/api/admin/bank-transfer/proof?reference={SEED_REFERENCE}",
            timeout=15,
        )
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"

    def test_non_admin_rejected(self, user_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/bank-transfer/proof?reference={SEED_REFERENCE}",
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=15,
        )
        assert r.status_code in (401, 403), f"Expected 401/403 for user, got {r.status_code}"


# --------- Validation ---------

class TestValidation:
    def test_missing_params_returns_400(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/bank-transfer/proof",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 400, r.text
        detail = (r.json().get("detail") or "")
        assert "Indique reference o payment_id" in detail, f"Got: {detail}"

    def test_unknown_reference_returns_404(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/bank-transfer/proof?reference=nonexistent-xyz-999",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 404
        assert "Transferencia no encontrada" in (r.json().get("detail") or "")

    def test_unknown_payment_id_returns_404(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/bank-transfer/proof?payment_id=does-not-exist-xyz",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 404
        assert "Transferencia no encontrada" in (r.json().get("detail") or "")


# --------- Happy path ---------

class TestSeededProof:
    def test_lookup_by_reference_returns_data_uri(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/bank-transfer/proof?reference={SEED_REFERENCE}",
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Shape
        assert "payment" in body
        assert "data_uri" in body
        assert "filename" in body
        assert "has_file" in body
        # Values
        assert body["has_file"] is True
        assert isinstance(body["data_uri"], str)
        assert body["data_uri"].startswith("data:image/png;base64,"), (
            f"Unexpected data_uri prefix: {body['data_uri'][:60]}"
        )
        assert body["filename"] == "comprobante.png"
        # Payment metadata
        p = body["payment"]
        assert p.get("reference") == SEED_REFERENCE
        assert p.get("user_name") == "Jorge Lamberti"
        assert p.get("user_email") == "jlamberti.carso.cr@gmail.com"
        assert p.get("amount") == 4850
        assert p.get("currency") == "EUR"
        # No mongo _id leaks
        assert "_id" not in p

    def test_lookup_by_payment_id(self, admin_headers):
        # First fetch by reference to get the id
        r1 = requests.get(
            f"{BASE_URL}/api/admin/bank-transfer/proof?reference={SEED_REFERENCE}",
            headers=admin_headers, timeout=20,
        )
        assert r1.status_code == 200
        pid = r1.json()["payment"]["id"]
        assert pid

        r2 = requests.get(
            f"{BASE_URL}/api/admin/bank-transfer/proof?payment_id={pid}",
            headers=admin_headers, timeout=20,
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body["has_file"] is True
        assert body["payment"]["id"] == pid
        assert body["payment"]["reference"] == SEED_REFERENCE
        assert body["data_uri"].startswith("data:image/png;base64,")

    def test_reference_with_leading_trailing_whitespace(self, admin_headers):
        # backend strips whitespace
        r = requests.get(
            f"{BASE_URL}/api/admin/bank-transfer/proof",
            params={"reference": f"  {SEED_REFERENCE}  "},
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json()["payment"]["reference"] == SEED_REFERENCE
