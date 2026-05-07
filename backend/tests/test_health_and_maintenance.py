"""Backend tests for Phase 1 production stabilization:
   - GET /api/health (fast probe)
   - GET /api/health/full (detailed diagnostics)
   - POST/GET /api/admin/maintenance (toggle maintenance mode)
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://compliance-dash-32.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    return body.get("token") or body.get("access_token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ==================== Health endpoints ====================

class TestHealth:
    def test_health_fast_probe(self):
        t0 = time.perf_counter()
        r = requests.get(f"{BASE_URL}/api/health", timeout=5)
        elapsed_ms = (time.perf_counter() - t0) * 1000
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert body["service"] == "lionsbit-api"
        assert "timestamp" in body
        # Note: network latency to preview can dominate; just record it
        print(f"/api/health round-trip: {elapsed_ms:.1f} ms")

    def test_health_full_payload(self):
        r = requests.get(f"{BASE_URL}/api/health/full", timeout=10)
        assert r.status_code == 200
        body = r.json()
        # Top-level
        assert body["status"] in ("ok", "degraded", "maintenance")
        assert body["version"] == "1.5.0"
        assert isinstance(body["uptime_seconds"], int)
        assert body["uptime_seconds"] >= 0
        assert "boot_at" in body
        # DB
        assert "db" in body
        assert body["db"]["status"] == "ok"
        assert isinstance(body["db"]["latency_ms"], (int, float))
        # Maintenance
        assert "maintenance" in body
        assert "enabled" in body["maintenance"]
        # Memory (best-effort)
        if "memory" in body:
            assert "rss_kb" in body["memory"]


# ==================== Maintenance toggle ====================

class TestMaintenance:
    def test_get_maintenance_initial(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/maintenance", headers=admin_headers, timeout=10)
        assert r.status_code == 200
        # body may be None or a doc; either way endpoint responds

    def test_enable_then_health_full_reflects(self, admin_headers):
        payload = {"enabled": True, "message": "TEST_iter46 maintenance",
                   "estimated_end": "22:00 UTC"}
        r = requests.post(f"{BASE_URL}/api/admin/maintenance",
                          json=payload, headers=admin_headers, timeout=10)
        assert r.status_code == 200, r.text

        # Verify GET reflects the new state
        rg = requests.get(f"{BASE_URL}/api/admin/maintenance", headers=admin_headers, timeout=10)
        assert rg.status_code == 200
        doc = rg.json()
        assert doc.get("enabled") is True
        assert "TEST_iter46" in (doc.get("message") or "")

        # Verify /api/health/full now reports maintenance
        rh = requests.get(f"{BASE_URL}/api/health/full", timeout=10)
        assert rh.status_code == 200
        hbody = rh.json()
        assert hbody["status"] == "maintenance"
        assert hbody["maintenance"]["enabled"] is True
        assert "TEST_iter46" in hbody["maintenance"]["message"]

    def test_disable_and_cleanup(self, admin_headers):
        # IMPORTANT: leave platform NOT in maintenance after the run
        r = requests.post(f"{BASE_URL}/api/admin/maintenance",
                          json={"enabled": False}, headers=admin_headers, timeout=10)
        assert r.status_code == 200, r.text

        rh = requests.get(f"{BASE_URL}/api/health/full", timeout=10)
        assert rh.status_code == 200
        hbody = rh.json()
        assert hbody["status"] != "maintenance"
        assert hbody["maintenance"]["enabled"] is False

    def test_maintenance_requires_admin(self):
        # No auth -> should be 401/403
        r = requests.post(f"{BASE_URL}/api/admin/maintenance",
                          json={"enabled": False}, timeout=10)
        assert r.status_code in (401, 403, 422)


# ==================== Regression: debit + admin-ops still work ====================

class TestRegressionDebit:
    def test_admin_ops_listing_still_works(self, admin_headers):
        """Smoke test that admin can still list users (used by debit page)."""
        r = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list)
        assert len(users) > 0

    def test_admin_transactions_endpoint(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/transactions", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
