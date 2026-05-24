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


# ---------- Module: Proof review actions ----------

def _pick_crypto_id(admin_headers, skip_id=None):
    r = requests.get(
        f"{BASE_URL}/api/admin/proofs?type=crypto&limit=20",
        headers=admin_headers, timeout=20,
    )
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    for it in items:
        if skip_id and it.get("id") == skip_id:
            continue
        return it.get("id")
    return None


class TestProofActionValidation:
    def test_invalid_ptype_returns_404(self, admin_headers):
        r = requests.post(
            f"{BASE_URL}/api/admin/proofs/wrongtype/abc/action",
            headers=admin_headers, json={"action": "reviewed"}, timeout=15,
        )
        assert r.status_code == 404
        assert "Tipo de comprobante invalido" in (r.json().get("detail") or "")

    def test_unknown_id_returns_404(self, admin_headers):
        r = requests.post(
            f"{BASE_URL}/api/admin/proofs/crypto/nonexistent-id-xyz/action",
            headers=admin_headers, json={"action": "reviewed"}, timeout=15,
        )
        assert r.status_code == 404
        assert "Comprobante no encontrado" in (r.json().get("detail") or "")

    def test_invalid_action_returns_400(self, admin_headers):
        pid = _pick_crypto_id(admin_headers)
        if not pid:
            pytest.skip("No crypto proof in env")
        r = requests.post(
            f"{BASE_URL}/api/admin/proofs/crypto/{pid}/action",
            headers=admin_headers, json={"action": "xxx"}, timeout=15,
        )
        assert r.status_code == 400
        assert "Accion invalida" in (r.json().get("detail") or "")

    def test_reject_without_note_returns_400(self, admin_headers):
        pid = _pick_crypto_id(admin_headers)
        if not pid:
            pytest.skip("No crypto proof in env")
        r = requests.post(
            f"{BASE_URL}/api/admin/proofs/crypto/{pid}/action",
            headers=admin_headers, json={"action": "reject"}, timeout=15,
        )
        assert r.status_code == 400
        assert "Motivo requerido" in (r.json().get("detail") or "")

    def test_action_requires_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/admin/proofs/crypto/any/action",
            json={"action": "reviewed"}, timeout=15,
        )
        assert r.status_code in (401, 403)


class TestProofActionStamping:
    def test_reviewed_does_not_change_status(self, admin_headers):
        # Get listing snapshot
        list_r = requests.get(
            f"{BASE_URL}/api/admin/proofs?type=crypto&limit=20",
            headers=admin_headers, timeout=20,
        )
        items = list_r.json()["items"]
        if not items:
            pytest.skip("No crypto proofs in env")
        target = items[0]
        pid = target["id"]
        prev_status = target.get("status")

        r = requests.post(
            f"{BASE_URL}/api/admin/proofs/crypto/{pid}/action",
            headers=admin_headers, json={"action": "reviewed", "note": "TEST_reviewed"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("admin_review_action") == "reviewed"
        assert body.get("admin_reviewed_at")
        assert body.get("admin_reviewed_by_name")
        assert body.get("admin_review_note") == "TEST_reviewed"
        # status was NOT set in the update payload
        assert "status" not in body or body.get("status") is None

        # Verify persistence in listing
        list_r2 = requests.get(
            f"{BASE_URL}/api/admin/proofs?type=crypto&limit=50",
            headers=admin_headers, timeout=20,
        )
        match = next((i for i in list_r2.json()["items"] if i["id"] == pid), None)
        assert match is not None
        assert match.get("admin_review_action") == "reviewed"
        assert match.get("admin_reviewed_by_name")
        assert match.get("admin_review_note") == "TEST_reviewed"
        # Status unchanged by 'reviewed'
        assert match.get("status") == prev_status

    def test_reject_sets_status_rejected(self, admin_headers):
        # Pick any crypto id (could be same; reject overrides reviewed)
        list_r = requests.get(
            f"{BASE_URL}/api/admin/proofs?type=crypto&limit=20",
            headers=admin_headers, timeout=20,
        )
        items = list_r.json()["items"]
        if len(items) < 2:
            pytest.skip("Need >=2 crypto proofs to avoid mutating the reviewed-test target")
        # Use the second item to keep the first one in 'reviewed' state for inspection
        pid = items[1]["id"]
        r = requests.post(
            f"{BASE_URL}/api/admin/proofs/crypto/{pid}/action",
            headers=admin_headers, json={"action": "reject", "note": "TEST_fraude"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "rejected"
        assert body.get("admin_review_action") == "reject"
        assert body.get("admin_review_note") == "TEST_fraude"

        # Verify in listing
        list_r2 = requests.get(
            f"{BASE_URL}/api/admin/proofs?type=crypto&limit=50",
            headers=admin_headers, timeout=20,
        )
        match = next((i for i in list_r2.json()["items"] if i["id"] == pid), None)
        assert match is not None
        assert match.get("status") == "rejected"
        assert match.get("admin_review_action") == "reject"

    def test_approve_sets_status_approved(self, admin_headers):
        list_r = requests.get(
            f"{BASE_URL}/api/admin/proofs?type=crypto&limit=20",
            headers=admin_headers, timeout=20,
        )
        items = list_r.json()["items"]
        if len(items) < 3:
            pytest.skip("Need >=3 crypto proofs for distinct approve target")
        pid = items[2]["id"]
        r = requests.post(
            f"{BASE_URL}/api/admin/proofs/crypto/{pid}/action",
            headers=admin_headers, json={"action": "approve"}, timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "approved"
        assert body.get("admin_review_action") == "approve"
        assert body.get("admin_reviewed_by_name")


# ---------- Module: CSV export ----------

class TestProofsCsvExport:
    def test_csv_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/proofs/export.csv?type=all", timeout=15)
        assert r.status_code in (401, 403)

    def test_csv_all_returns_200_with_header(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/proofs/export.csv?type=all",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert ".csv" in cd.lower()
        text = r.text
        lines = [ln for ln in text.splitlines() if ln.strip()]
        assert lines, "CSV should have at least header row"
        expected_header = "fecha,tipo,usuario,email,monto,moneda,referencia,estado,tiene_archivo,id,revisado_por,accion_revision,fecha_revision,nota_revision"
        assert lines[0] == expected_header, f"Header mismatch. Got: {lines[0]}"

    def test_csv_crypto_filter_only_crypto_rows(self, admin_headers):
        # Get expected count of crypto items (listing capped at 500)
        list_r = requests.get(
            f"{BASE_URL}/api/admin/proofs?type=crypto&limit=500",
            headers=admin_headers, timeout=30,
        )
        assert list_r.status_code == 200, list_r.text
        expected_count = list_r.json()["count"]

        r = requests.get(
            f"{BASE_URL}/api/admin/proofs/export.csv?type=crypto",
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200
        lines = [ln for ln in r.text.splitlines() if ln.strip()]
        # First line is header
        data_rows = lines[1:]
        assert len(data_rows) == expected_count, (
            f"Expected {expected_count} crypto rows, got {len(data_rows)}"
        )
        # All data rows should have 'crypto' (or 'Pago Crypto' label) in the tipo column
        for row in data_rows:
            cols = row.split(',')
            # Column index 1 = tipo (type_label). For crypto it's 'Pago Crypto'.
            assert ('Pago Crypto' in row) or ('crypto' in cols[1].lower()), f"Row not crypto: {row}"
