"""Iter 64 — Onboarding Tour (Fase 7) backend tests."""
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


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture
def fresh_user():
    suffix = uuid.uuid4().hex[:8]
    email = f"test_iter64_{suffix}@example.com"
    pwd = "TestPass123!"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": pwd, "name": f"Iter64 {suffix}",
              "country": "ES", "phone": "+34600000013"},
        timeout=15,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"Register failed: {r.text[:200]}")
    return {"email": email, "headers": {"Authorization": f"Bearer {_login(email, pwd)}"}}


class TestOnboarding:
    def test_requires_auth(self):
        for method, path in [("GET", "/user/onboarding/status"),
                             ("POST", "/user/onboarding/complete"),
                             ("POST", "/user/onboarding/dismiss"),
                             ("POST", "/user/onboarding/reset")]:
            r = requests.request(method, f"{API}{path}", timeout=15)
            assert r.status_code in (401, 403), f"{method} {path} not gated"

    def test_initial_status_not_completed(self, fresh_user):
        r = requests.get(f"{API}/user/onboarding/status", headers=fresh_user["headers"], timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["completed"] is False
        assert body["dismissed"] is False
        assert body["last_step"] == 0

    def test_save_progress(self, fresh_user):
        r = requests.post(f"{API}/user/onboarding/progress",
                          headers=fresh_user["headers"], json={"step": 3}, timeout=15)
        assert r.status_code == 200
        assert r.json()["step"] == 3

        check = requests.get(f"{API}/user/onboarding/status", headers=fresh_user["headers"], timeout=15).json()
        assert check["last_step"] == 3

    def test_progress_clamps_to_range(self, fresh_user):
        r = requests.post(f"{API}/user/onboarding/progress",
                          headers=fresh_user["headers"], json={"step": 999}, timeout=15)
        assert r.status_code == 200
        assert r.json()["step"] == 50  # clamped to max

        r2 = requests.post(f"{API}/user/onboarding/progress",
                           headers=fresh_user["headers"], json={"step": -5}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["step"] == 0

    def test_progress_handles_bad_input(self, fresh_user):
        r = requests.post(f"{API}/user/onboarding/progress",
                          headers=fresh_user["headers"], json={"step": "not-a-number"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["step"] == 0

    def test_complete_marks_done(self, fresh_user):
        r = requests.post(f"{API}/user/onboarding/complete", headers=fresh_user["headers"], timeout=15)
        assert r.status_code == 200
        assert r.json()["completed_at"]

        check = requests.get(f"{API}/user/onboarding/status", headers=fresh_user["headers"], timeout=15).json()
        assert check["completed"] is True
        assert check["completed_at"]

    def test_dismiss_marks_dismissed(self, fresh_user):
        r = requests.post(f"{API}/user/onboarding/dismiss", headers=fresh_user["headers"], timeout=15)
        assert r.status_code == 200

        check = requests.get(f"{API}/user/onboarding/status", headers=fresh_user["headers"], timeout=15).json()
        assert check["dismissed"] is True
        assert check["completed"] is False  # dismissed != completed

    def test_reset_clears_all_flags(self, fresh_user):
        # Complete + dismiss + set step
        requests.post(f"{API}/user/onboarding/complete", headers=fresh_user["headers"], timeout=15)
        requests.post(f"{API}/user/onboarding/dismiss", headers=fresh_user["headers"], timeout=15)
        requests.post(f"{API}/user/onboarding/progress",
                      headers=fresh_user["headers"], json={"step": 4}, timeout=15)

        # Reset
        r = requests.post(f"{API}/user/onboarding/reset", headers=fresh_user["headers"], timeout=15)
        assert r.status_code == 200

        # All flags cleared
        check = requests.get(f"{API}/user/onboarding/status", headers=fresh_user["headers"], timeout=15).json()
        assert check["completed"] is False
        assert check["dismissed"] is False
        assert check["last_step"] == 0

    def test_full_user_journey(self, fresh_user):
        h = fresh_user["headers"]

        # 1. First check — should auto-show
        s = requests.get(f"{API}/user/onboarding/status", headers=h, timeout=15).json()
        assert not s["completed"] and not s["dismissed"]

        # 2. User progresses through some steps
        for step in [1, 2, 3, 4]:
            requests.post(f"{API}/user/onboarding/progress",
                          headers=h, json={"step": step}, timeout=15)

        # 3. User finishes
        requests.post(f"{API}/user/onboarding/complete", headers=h, timeout=15)

        # 4. Status now shows completed
        s2 = requests.get(f"{API}/user/onboarding/status", headers=h, timeout=15).json()
        assert s2["completed"] is True
        assert s2["last_step"] == 4
