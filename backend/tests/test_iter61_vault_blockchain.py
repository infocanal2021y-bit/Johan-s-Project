"""Iter 61 — Vault Blockchain (Fase 4) backend tests.

Covers:
- Upload doc → server computes SHA-256 + chains to previous doc
- Chain integrity: doc N's chain_prev_hash = SHA256(doc N-1 prev + doc N-1 sha256)
- Verify endpoint detects tampering (we manipulate the stored content_b64)
- List my docs (no content leaked)
- Download returns data URI with correct mime
- Validation: rejects too-large files, empty, bad base64, missing fields, bad category
- Admin certify + reject (with note) + audit chain returns chronological list
- Cross-user isolation: user A cannot access user B's docs
"""
import base64
import hashlib
import os
import sys
import uuid
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


def _b64(content: bytes) -> str:
    return base64.b64encode(content).decode("ascii")


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN_EMAIL, ADMIN_PASSWORD)}"}


@pytest.fixture
def fresh_user():
    suffix = uuid.uuid4().hex[:8]
    email = f"test_iter61_{suffix}@example.com"
    pwd = "TestPass123!"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": pwd, "name": f"Iter61 {suffix}",
              "country": "ES", "phone": "+34600000007"},
        timeout=15,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"Register failed: {r.text[:200]}")
    return {"email": email, "headers": {"Authorization": f"Bearer {_login(email, pwd)}"}}


# ════════════════════════════════════════════════════════════════════
#  UPLOAD VALIDATION
# ════════════════════════════════════════════════════════════════════

class TestUploadValidation:
    def test_requires_auth(self):
        r = requests.post(f"{API}/vault/documents/upload",
                          json={"name": "x", "category": "kyc", "mime": "text/plain", "content_b64": "QQ=="},
                          timeout=15)
        assert r.status_code in (401, 403)

    def test_rejects_missing_name(self, fresh_user):
        r = requests.post(f"{API}/vault/documents/upload", headers=fresh_user["headers"],
                          json={"name": "", "category": "kyc", "mime": "text/plain", "content_b64": "QQ=="},
                          timeout=15)
        assert r.status_code == 400

    def test_rejects_invalid_category(self, fresh_user):
        r = requests.post(f"{API}/vault/documents/upload", headers=fresh_user["headers"],
                          json={"name": "X", "category": "bogus", "mime": "text/plain", "content_b64": "QQ=="},
                          timeout=15)
        assert r.status_code == 400

    def test_rejects_empty_content(self, fresh_user):
        r = requests.post(f"{API}/vault/documents/upload", headers=fresh_user["headers"],
                          json={"name": "X", "category": "kyc", "mime": "text/plain", "content_b64": ""},
                          timeout=15)
        assert r.status_code == 400

    def test_rejects_bad_base64(self, fresh_user):
        r = requests.post(f"{API}/vault/documents/upload", headers=fresh_user["headers"],
                          json={"name": "X", "category": "kyc", "mime": "text/plain", "content_b64": "***not-base64***"},
                          timeout=15)
        assert r.status_code == 400

    def test_rejects_too_large(self, fresh_user):
        big = b"x" * (9 * 1024 * 1024)  # 9 MB > 8 MB limit
        r = requests.post(f"{API}/vault/documents/upload", headers=fresh_user["headers"],
                          json={"name": "huge.bin", "category": "other",
                                "mime": "application/octet-stream", "content_b64": _b64(big)},
                          timeout=30)
        assert r.status_code == 400


# ════════════════════════════════════════════════════════════════════
#  UPLOAD + HASH + CHAIN
# ════════════════════════════════════════════════════════════════════

class TestUploadAndChain:
    def test_upload_computes_correct_sha256(self, fresh_user):
        payload_bytes = b"Hello LIONSBIT Vault iter61"
        expected = hashlib.sha256(payload_bytes).hexdigest()
        r = requests.post(f"{API}/vault/documents/upload", headers=fresh_user["headers"],
                          json={"name": "test.txt", "category": "other",
                                "mime": "text/plain", "content_b64": _b64(payload_bytes)},
                          timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["document"]["sha256"] == expected
        assert body["document"]["chain_index"] >= 0
        # Content not in response
        assert "content_b64" not in body["document"]

    def test_upload_accepts_data_uri(self, fresh_user):
        data = b"data URI content"
        b64 = _b64(data)
        data_uri = f"data:text/plain;base64,{b64}"
        r = requests.post(f"{API}/vault/documents/upload", headers=fresh_user["headers"],
                          json={"name": "uri.txt", "category": "other",
                                "mime": "text/plain", "content_b64": data_uri},
                          timeout=15)
        assert r.status_code == 200
        assert r.json()["document"]["sha256"] == hashlib.sha256(data).hexdigest()

    def test_chain_links_to_previous_doc(self, fresh_user):
        # Upload doc A
        rA = requests.post(f"{API}/vault/documents/upload", headers=fresh_user["headers"],
                           json={"name": "A.txt", "category": "other", "mime": "text/plain",
                                 "content_b64": _b64(b"A content")},
                           timeout=15)
        assert rA.status_code == 200
        docA = rA.json()["document"]

        # Upload doc B
        rB = requests.post(f"{API}/vault/documents/upload", headers=fresh_user["headers"],
                           json={"name": "B.txt", "category": "other", "mime": "text/plain",
                                 "content_b64": _b64(b"B content")},
                           timeout=15)
        assert rB.status_code == 200
        docB = rB.json()["document"]

        # B's prev hash must equal SHA256(A.chain_prev_hash + A.sha256)
        expected = hashlib.sha256(
            (docA["chain_prev_hash"] + docA["sha256"]).encode()
        ).hexdigest()
        assert docB["chain_prev_hash"] == expected
        # Index increases
        assert docB["chain_index"] == docA["chain_index"] + 1


# ════════════════════════════════════════════════════════════════════
#  VERIFY (tamper detection)
# ════════════════════════════════════════════════════════════════════

class TestVerify:
    def test_verify_returns_ok_for_clean_doc(self, fresh_user):
        rU = requests.post(f"{API}/vault/documents/upload", headers=fresh_user["headers"],
                           json={"name": "verify_clean.txt", "category": "other",
                                 "mime": "text/plain", "content_b64": _b64(b"clean")},
                           timeout=15)
        doc_id = rU.json()["document"]["id"]
        rV = requests.get(f"{API}/vault/documents/{doc_id}/verify",
                          headers=fresh_user["headers"], timeout=15)
        assert rV.status_code == 200
        body = rV.json()
        assert body["integrity_ok"] is True
        assert body["computed_hash"] == body["stored_hash"]

    def test_verify_detects_tampering(self, fresh_user):
        rU = requests.post(f"{API}/vault/documents/upload", headers=fresh_user["headers"],
                           json={"name": "verify_tamper.txt", "category": "other",
                                 "mime": "text/plain", "content_b64": _b64(b"original")},
                           timeout=15)
        doc_id = rU.json()["document"]["id"]

        # Tamper directly with the DB
        cli, db = _db()
        try:
            db.vault_documents.update_one(
                {"id": doc_id}, {"$set": {"content_b64": _b64(b"TAMPERED!")}}
            )
        finally:
            cli.close()

        rV = requests.get(f"{API}/vault/documents/{doc_id}/verify",
                          headers=fresh_user["headers"], timeout=15)
        assert rV.status_code == 200
        body = rV.json()
        assert body["integrity_ok"] is False
        assert body["computed_hash"] != body["stored_hash"]


# ════════════════════════════════════════════════════════════════════
#  LIST + DOWNLOAD + AUDIT
# ════════════════════════════════════════════════════════════════════

class TestListDownloadAudit:
    def test_list_returns_docs_without_content(self, fresh_user):
        requests.post(f"{API}/vault/documents/upload", headers=fresh_user["headers"],
                      json={"name": "list1.txt", "category": "other",
                            "mime": "text/plain", "content_b64": _b64(b"list me")},
                      timeout=15)
        r = requests.get(f"{API}/vault/documents", headers=fresh_user["headers"], timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["count"] >= 1
        for it in body["items"]:
            assert "content_b64" not in it
            assert it.get("sha256_short")

    def test_download_returns_data_uri(self, fresh_user):
        payload = b"Download me!"
        rU = requests.post(f"{API}/vault/documents/upload", headers=fresh_user["headers"],
                           json={"name": "dl.txt", "category": "other",
                                 "mime": "text/plain", "content_b64": _b64(payload)},
                           timeout=15)
        doc_id = rU.json()["document"]["id"]
        rD = requests.get(f"{API}/vault/documents/{doc_id}/download",
                          headers=fresh_user["headers"], timeout=15)
        assert rD.status_code == 200
        body = rD.json()
        assert body["data_uri"].startswith("data:text/plain;base64,")
        assert base64.b64decode(body["data_uri"].split(",", 1)[1]) == payload

    def test_audit_chain_returns_ordered_list(self, fresh_user):
        # Upload 3 docs
        ids = []
        for i in range(3):
            r = requests.post(f"{API}/vault/documents/upload", headers=fresh_user["headers"],
                              json={"name": f"audit{i}.txt", "category": "other",
                                    "mime": "text/plain", "content_b64": _b64(f"audit{i}".encode())},
                              timeout=15)
            ids.append(r.json()["document"]["id"])

        rA = requests.get(f"{API}/vault/chain/audit", headers=fresh_user["headers"], timeout=15)
        assert rA.status_code == 200
        body = rA.json()
        my_chain = [c for c in body["chain"] if c["id"] in ids]
        # The 3 of mine appear in increasing chain_index
        assert len(my_chain) == 3
        indices = [c["chain_index"] for c in my_chain]
        assert indices == sorted(indices)


# ════════════════════════════════════════════════════════════════════
#  ADMIN CERTIFY / REJECT
# ════════════════════════════════════════════════════════════════════

class TestAdmin:
    @pytest.fixture
    def pending_doc(self, fresh_user):
        r = requests.post(f"{API}/vault/documents/upload", headers=fresh_user["headers"],
                          json={"name": "cert.pdf", "category": "kyc",
                                "mime": "application/pdf", "content_b64": _b64(b"PDF stub")},
                          timeout=15)
        return r.json()["document"]

    def test_admin_only(self, fresh_user, pending_doc):
        r = requests.get(f"{API}/admin/vault/documents", headers=fresh_user["headers"], timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_list_with_counts(self, admin_headers, pending_doc):
        r = requests.get(f"{API}/admin/vault/documents", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "counts" in body
        assert any(d["id"] == pending_doc["id"] for d in body["items"])

    def test_admin_certify_marks_doc(self, admin_headers, pending_doc):
        r = requests.post(f"{API}/admin/vault/documents/{pending_doc['id']}/certify",
                          headers=admin_headers, json={"note": "All good"}, timeout=15)
        assert r.status_code == 200

        # Re-fetch and check
        cli, db = _db()
        try:
            doc = db.vault_documents.find_one({"id": pending_doc["id"]})
        finally:
            cli.close()
        assert doc["status"] == "certified"
        assert doc["certified_by"] == ADMIN_EMAIL
        assert doc["certified_at"]

    def test_admin_certify_already_done_fails(self, admin_headers, pending_doc):
        # Certify first
        requests.post(f"{API}/admin/vault/documents/{pending_doc['id']}/certify",
                      headers=admin_headers, json={}, timeout=15)
        # Try again
        r = requests.post(f"{API}/admin/vault/documents/{pending_doc['id']}/certify",
                          headers=admin_headers, json={}, timeout=15)
        assert r.status_code == 400

    def test_admin_reject_requires_note(self, admin_headers, pending_doc):
        r = requests.post(f"{API}/admin/vault/documents/{pending_doc['id']}/reject",
                          headers=admin_headers, json={}, timeout=15)
        assert r.status_code == 400

    def test_admin_reject_with_note(self, admin_headers, pending_doc):
        r = requests.post(f"{API}/admin/vault/documents/{pending_doc['id']}/reject",
                          headers=admin_headers, json={"note": "Documento ilegible"}, timeout=15)
        assert r.status_code == 200

        cli, db = _db()
        try:
            doc = db.vault_documents.find_one({"id": pending_doc["id"]})
        finally:
            cli.close()
        assert doc["status"] == "rejected"
        assert doc["admin_note"] == "Documento ilegible"


# ════════════════════════════════════════════════════════════════════
#  CROSS-USER ISOLATION
# ════════════════════════════════════════════════════════════════════

class TestIsolation:
    def test_user_cannot_access_other_users_doc(self, fresh_user):
        # Doc by user A
        rA = requests.post(f"{API}/vault/documents/upload", headers=fresh_user["headers"],
                           json={"name": "private.txt", "category": "other",
                                 "mime": "text/plain", "content_b64": _b64(b"private")},
                           timeout=15)
        doc_id = rA.json()["document"]["id"]

        # Register user B and try to access
        suffix2 = uuid.uuid4().hex[:8]
        email2 = f"test_iter61b_{suffix2}@example.com"
        pwd = "TestPass123!"
        reg = requests.post(
            f"{API}/auth/register",
            json={"email": email2, "password": pwd, "name": f"Iter61b {suffix2}",
                  "country": "ES", "phone": "+34600000008"},
            timeout=15,
        )
        if reg.status_code not in (200, 201):
            pytest.skip("Could not register second user")
        h2 = {"Authorization": f"Bearer {_login(email2, pwd)}"}

        # User B cannot read user A's doc
        for path in [f"/vault/documents/{doc_id}",
                     f"/vault/documents/{doc_id}/verify",
                     f"/vault/documents/{doc_id}/download"]:
            r = requests.get(f"{API}{path}", headers=h2, timeout=15)
            assert r.status_code == 404, f"{path} leaked"
