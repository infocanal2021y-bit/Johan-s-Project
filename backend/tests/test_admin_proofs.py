"""Backend regression tests for the Unified Admin Proofs viewer.

Covers:
- GET /api/admin/proofs (all types + each type filter)
- Auth gate (no token -> 401/403)
- GET /api/admin/proofs/{ptype}/{pid}/file (existing item without file -> 404 'Sin archivo asociado')
- Invalid ptype -> 404 'Tipo de comprobante invalido'
"""
import os
import pytest
import requests
from pathlib import Path


def _load_backend_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    env_file = Path("/app/frontend/.env")
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    return ""


BASE_URL = _load_backend_url()
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"

ALLOWED_TYPES = {"crypto", "bank", "mt5", "partial-unlock"}
REQUIRED_ITEM_FIELDS = {
    "id", "type", "type_label", "user_id", "amount", "currency",
    "reference", "status", "has_file", "created_at",
    "user_name", "user_email",
}


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def admin_token():
    assert BASE_URL, "REACT_APP_BACKEND_URL not configured"
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token") or body.get("access_token")
    assert token, f"No token in login response: {body}"
    return token


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- Module: Auth gate ----------

class TestAuthGate:
    def test_proofs_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/proofs?type=all&limit=5", timeout=15)
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"

    def test_proof_file_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/proofs/crypto/any-id/file", timeout=15)
        assert r.status_code in (401, 403)


# ---------- Module: Listing endpoint ----------

class TestProofsListing:
    def test_list_all(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/proofs?type=all&limit=10",
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and "count" in body
        assert isinstance(body["items"], list)
        assert body["count"] == len(body["items"])
        assert len(body["items"]) <= 10
        # Validate item shape if any returned
        for it in body["items"]:
            assert it["type"] in ALLOWED_TYPES, f"Unexpected type: {it['type']}"
            # All required fields must be present (may be None)
            missing = REQUIRED_ITEM_FIELDS - set(it.keys())
            assert not missing, f"Missing fields: {missing} in item {it.get('id')}"
            assert isinstance(it["has_file"], bool)

    @pytest.mark.parametrize("ptype", ["crypto", "bank", "mt5", "partial-unlock"])
    def test_list_filter_type(self, admin_headers, ptype):
        r = requests.get(
            f"{BASE_URL}/api/admin/proofs?type={ptype}&limit=20",
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body["items"], list)
        # Every returned item must match the requested filter
        for it in body["items"]:
            assert it["type"] == ptype, f"Filter {ptype} leaked item with type={it['type']}"

    def test_limit_param_respected(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/proofs?type=all&limit=2",
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200
        assert len(r.json()["items"]) <= 2

    def test_limit_out_of_range(self, admin_headers):
        # limit must be 1..500 per Query() declaration
        r = requests.get(
            f"{BASE_URL}/api/admin/proofs?type=all&limit=9999",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 422


# ---------- Module: Proof file endpoint ----------

class TestProofFile:
    def test_invalid_type_returns_404(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/proofs/garbage/abc/file",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 404
        body = r.json()
        assert "Tipo de comprobante invalido" in (body.get("detail") or "")

    def test_unknown_id_returns_404(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/proofs/crypto/does-not-exist-xyz/file",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 404
        body = r.json()
        # Either 'no encontrado' or 'sin archivo' depending on docs in DB
        detail = (body.get("detail") or "").lower()
        assert ("no encontrado" in detail) or ("sin archivo" in detail)

    def test_existing_crypto_without_file_returns_sin_archivo(self, admin_headers):
        # Find a crypto proof that has_file=false
        r = requests.get(
            f"{BASE_URL}/api/admin/proofs?type=crypto&limit=10",
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200
        items = r.json()["items"]
        no_file_items = [i for i in items if not i["has_file"]]
        if not no_file_items:
            pytest.skip("No crypto items without file in this env")
        target = no_file_items[0]
        r2 = requests.get(
            f"{BASE_URL}/api/admin/proofs/crypto/{target['id']}/file",
            headers=admin_headers, timeout=15,
        )
        assert r2.status_code == 404
        detail = (r2.json().get("detail") or "")
        assert "Sin archivo asociado" in detail, f"Got detail: {detail}"
