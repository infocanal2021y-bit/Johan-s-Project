"""Phase 6 tests: live FX rates, multi-currency regression, vault history events."""
import os
import base64
import time
import pytest
import requests

def _load_frontend_url():
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    return line.split('=', 1)[1].strip()
    except Exception:
        pass
    return None

BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or _load_frontend_url() or '').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASS = "LionsBit2026!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ─────────────────────────────── Multi-currency: /rates  ───────────────────────────────
class TestMultiCurrencyRates:
    def test_rates_shape_and_live_sources(self, admin_h):
        r = requests.get(f"{API}/multi-currency/rates", headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("rates", "sources", "updated_at_per_currency", "live_provider", "next_refresh_at"):
            assert k in data, f"missing key: {k}"
        assert data["live_provider"] == "open.er-api.com"
        assert data["rates"]["EUR"] == 1.0
        # USD/GBP/COP should NOT be fallback when network OK; allow 'live' or 'admin'
        for c in ("USD", "GBP", "COP"):
            assert data["sources"].get(c) in ("live", "admin"), f"{c} source={data['sources'].get(c)}"
            assert data["rates"].get(c, 0) > 0

    def test_rates_refresh(self, admin_h):
        r = requests.post(f"{API}/multi-currency/rates/refresh", headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # refreshed True with count=5 when OK, or refreshed False with reason on error
        if data.get("refreshed") is True:
            assert data.get("count") == 5
            assert data.get("source") == "open.er-api.com"
            assert data.get("fetched_at")
        else:
            assert data.get("reason") in ("fetch_failed", "throttled", "no_data")

    def test_preview_and_convert_regression(self, admin_h):
        # Preview USD→EUR small amount (no balance needed)
        r = requests.post(
            f"{API}/multi-currency/preview",
            headers=admin_h,
            json={"from_currency": "USD", "to_currency": "EUR", "amount": 10},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        prev = r.json()
        for k in ("rate", "fee_pct", "fee_amount", "amount_out", "gross_out"):
            assert k in prev
        assert prev["amount_out"] > 0
        assert prev["amount_in"] == 10

        # Try convert; if no USD balance, will return 400 — that's still regression OK
        rc = requests.post(
            f"{API}/multi-currency/convert",
            headers=admin_h,
            json={"from_currency": "USD", "to_currency": "EUR", "amount": 1},
            timeout=20,
        )
        assert rc.status_code in (200, 400), rc.text
        if rc.status_code == 200:
            body = rc.json()
            assert body.get("ok") is True
            assert body["conversion"]["from_currency"] == "USD"
            assert body["conversion"]["to_currency"] == "EUR"


# ─────────────────────────────── Vault history events  ───────────────────────────────
def _tiny_b64():
    return base64.b64encode(b"test history phase6 content").decode()


class TestVaultHistory:
    doc_id = None

    def test_upload_creates_event(self, admin_h):
        payload = {
            "name": "Test History Phase6.txt",
            "category": "other",
            "mime": "text/plain",
            "content_b64": _tiny_b64(),
        }
        r = requests.post(f"{API}/vault/documents/upload", headers=admin_h, json=payload, timeout=20)
        assert r.status_code in (200, 201), r.text
        doc = r.json()
        TestVaultHistory.doc_id = doc.get("id") or doc.get("document", {}).get("id")
        assert TestVaultHistory.doc_id

        # history should already include 'created'
        h = requests.get(f"{API}/vault/documents/{TestVaultHistory.doc_id}/history", headers=admin_h, timeout=10)
        assert h.status_code == 200, h.text
        body = h.json()
        assert "document" in body
        assert "events" in body
        assert "count" in body
        types = [e["type"] for e in body["events"]]
        assert "created" in types
        for ev in body["events"]:
            assert "type" in ev and "at" in ev and "actor" in ev
            assert "_id" not in ev  # MUST be excluded

    def test_verify_creates_event(self, admin_h):
        assert TestVaultHistory.doc_id
        r = requests.get(f"{API}/vault/documents/{TestVaultHistory.doc_id}/verify", headers=admin_h, timeout=10)
        assert r.status_code == 200, r.text
        time.sleep(0.3)
        h = requests.get(f"{API}/vault/documents/{TestVaultHistory.doc_id}/history", headers=admin_h, timeout=10)
        types = [e["type"] for e in h.json()["events"]]
        assert "verified" in types

    def test_download_creates_event(self, admin_h):
        r = requests.get(f"{API}/vault/documents/{TestVaultHistory.doc_id}/download", headers=admin_h, timeout=10)
        assert r.status_code == 200, r.text
        time.sleep(0.3)
        h = requests.get(f"{API}/vault/documents/{TestVaultHistory.doc_id}/history", headers=admin_h, timeout=10)
        types = [e["type"] for e in h.json()["events"]]
        assert "downloaded" in types

    def test_certify_creates_event(self, admin_h):
        r = requests.post(
            f"{API}/admin/vault/documents/{TestVaultHistory.doc_id}/certify",
            headers=admin_h,
            json={"note": "phase6-test"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        time.sleep(0.3)
        h = requests.get(f"{API}/vault/documents/{TestVaultHistory.doc_id}/history", headers=admin_h, timeout=10)
        body = h.json()
        types = [e["type"] for e in body["events"]]
        assert "certified" in types
        # events must be sorted asc by 'at'
        ats = [e["at"] for e in body["events"]]
        assert ats == sorted(ats), f"events not ascending: {ats}"

    def test_history_unauthorized_returns_404(self, admin_h):
        # fake id → 404
        r = requests.get(f"{API}/vault/documents/this-id-does-not-exist-xyz/history", headers=admin_h, timeout=10)
        assert r.status_code == 404
