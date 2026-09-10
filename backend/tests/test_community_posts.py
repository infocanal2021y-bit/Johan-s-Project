"""Backend tests for LIONSBIT official Community Posts feature (iter 81).

Tests: user read-only feed, admin CRUD, replies, settings, autopost, security.
Cleans up test-created posts and restores settings to enabled/2/100 at end.
"""
import os
import asyncio
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "info@paylionsbit.es"
ADMIN_PASS = "Juan1949."
USER_EMAIL = "manclic@yahoo.es"
USER_PASS = "FX2026"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    data = r.json()
    if data.get("requires_2fa"):
        pytest.skip("Admin 2FA is ON — cannot test without email access")
    return data["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def user_token():
    return _login(USER_EMAIL, USER_PASS)


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def user_h(user_token):
    return {"Authorization": f"Bearer {user_token}"}


# Track created posts for cleanup
_created = []


# =========== USER FEED ===========

def test_user_feed_list(user_h):
    r = requests.get(f"{API}/community/posts", headers=user_h, timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert j["author"] == "Supports Lionsbit"
    assert j["badge"] == "✓ Soporte oficial"
    assert isinstance(j["posts"], list)
    assert len(j["posts"]) >= 2, f"Expected >=2 published posts after seed, got {len(j['posts'])}"
    for p in j["posts"]:
        assert p["author"] == "Supports Lionsbit"
        assert p["badge"] == "✓ Soporte oficial"
        assert "body" in p and "published_at" in p and "replies" in p
    # pinned first, then most recent first
    pinned_positions = [i for i, p in enumerate(j["posts"]) if p.get("pinned")]
    non_pinned_positions = [i for i, p in enumerate(j["posts"]) if not p.get("pinned")]
    if pinned_positions and non_pinned_positions:
        assert max(pinned_positions) < min(non_pinned_positions), "Pinned must be first"


# =========== ADMIN LIST + COUNTS ===========

def test_admin_list_counts(admin_h):
    r = requests.get(f"{API}/admin/community-posts", headers=admin_h, timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert "counts" in j and "settings" in j and "posts" in j
    c = j["counts"]
    # published>=2 (seed), scheduled around 28, max 100
    assert c["published"] >= 2
    assert c["scheduled"] >= 20, f"Expected ~28 scheduled, got {c['scheduled']}"
    assert c["max"] == 100
    s = j["settings"]
    assert s["enabled"] is True
    assert s["daily_count"] == 2
    assert s["max_posts"] == 100


# =========== SECURITY ===========

def test_user_cannot_access_admin_list(user_h):
    r = requests.get(f"{API}/admin/community-posts", headers=user_h, timeout=15)
    assert r.status_code == 403, f"Expected 403 got {r.status_code}"


def test_user_cannot_create_post(user_h):
    r = requests.post(f"{API}/admin/community-posts", headers=user_h,
                      json={"body": "hack"}, timeout=15)
    assert r.status_code == 403


def test_user_cannot_update_settings(user_h):
    r = requests.put(f"{API}/admin/community-posts-settings", headers=user_h,
                     json={"enabled": False}, timeout=15)
    assert r.status_code == 403


# =========== ADMIN CRUD ===========

def test_admin_create_publish_now(admin_h):
    r = requests.post(f"{API}/admin/community-posts", headers=admin_h,
                      json={"body": "TEST_iter81 publish now", "publish_now": True}, timeout=15)
    assert r.status_code == 200
    p = r.json()["post"]
    assert p["status"] == "published"
    assert p["body"] == "TEST_iter81 publish now"
    assert p["published_at"] is not None
    _created.append(p["id"])
    # verify persisted via list
    lr = requests.get(f"{API}/admin/community-posts?status=published", headers=admin_h).json()
    assert any(x["id"] == p["id"] for x in lr["posts"])


def test_admin_create_scheduled_future(admin_h):
    from datetime import datetime, timezone, timedelta
    future = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    r = requests.post(f"{API}/admin/community-posts", headers=admin_h,
                      json={"body": "TEST_iter81 scheduled", "publish_at": future}, timeout=15)
    assert r.status_code == 200
    p = r.json()["post"]
    assert p["status"] == "scheduled"
    assert p["published_at"] is None
    _created.append(p["id"])


def test_admin_edit_body_and_pin(admin_h):
    pid = _created[0]
    r = requests.put(f"{API}/admin/community-posts/{pid}", headers=admin_h,
                     json={"body": "TEST_iter81 edited", "pinned": True}, timeout=15)
    assert r.status_code == 200
    p = r.json()["post"]
    assert p["body"] == "TEST_iter81 edited"
    assert p["pinned"] is True


def test_admin_publish_now_scheduled(admin_h):
    pid = _created[1]  # scheduled
    r = requests.post(f"{API}/admin/community-posts/{pid}/publish-now", headers=admin_h, timeout=15)
    assert r.status_code == 200
    # verify status
    lr = requests.get(f"{API}/admin/community-posts", headers=admin_h).json()
    p = next((x for x in lr["posts"] if x["id"] == pid), None)
    assert p and p["status"] == "published"


def test_admin_hide_and_restore(admin_h):
    pid = _created[0]
    r = requests.put(f"{API}/admin/community-posts/{pid}", headers=admin_h,
                     json={"status": "hidden"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["post"]["status"] == "hidden"
    # restore
    r2 = requests.put(f"{API}/admin/community-posts/{pid}", headers=admin_h,
                      json={"status": "published"}, timeout=15)
    assert r2.status_code == 200


def test_admin_reply_crud(admin_h):
    pid = _created[0]
    r = requests.post(f"{API}/admin/community-posts/{pid}/replies", headers=admin_h,
                      json={"body": "TEST_iter81 reply"}, timeout=15)
    assert r.status_code == 200
    rid = r.json()["reply"]["id"]

    r2 = requests.put(f"{API}/admin/community-posts/{pid}/replies/{rid}", headers=admin_h,
                      json={"body": "TEST_iter81 reply edited"}, timeout=15)
    assert r2.status_code == 200

    r3 = requests.delete(f"{API}/admin/community-posts/{pid}/replies/{rid}", headers=admin_h, timeout=15)
    assert r3.status_code == 200


def test_admin_create_empty_body_400(admin_h):
    r = requests.post(f"{API}/admin/community-posts", headers=admin_h,
                      json={"body": "   ", "publish_now": True}, timeout=15)
    assert r.status_code == 400


# =========== SETTINGS ===========

def test_settings_pause_and_resume(admin_h):
    r = requests.put(f"{API}/admin/community-posts-settings", headers=admin_h,
                     json={"enabled": False}, timeout=15)
    assert r.status_code == 200
    assert r.json()["settings"]["enabled"] is False


def test_settings_change_values(admin_h):
    r = requests.put(f"{API}/admin/community-posts-settings", headers=admin_h,
                     json={"daily_count": 3, "max_posts": 50}, timeout=15)
    assert r.status_code == 200
    s = r.json()["settings"]
    assert s["daily_count"] == 3
    assert s["max_posts"] == 50


def test_settings_out_of_range_400(admin_h):
    r = requests.put(f"{API}/admin/community-posts-settings", headers=admin_h,
                     json={"daily_count": 999}, timeout=15)
    assert r.status_code == 400
    r2 = requests.put(f"{API}/admin/community-posts-settings", headers=admin_h,
                      json={"max_posts": 99999}, timeout=15)
    assert r2.status_code == 400


# =========== AUTOPOST ===========

def test_run_community_autopost_daily_quota(admin_h):
    """Executes run_community_autopost against the live DB via a subprocess."""
    # Ensure settings enabled=True daily=2 max=100 for a fair test
    requests.put(f"{API}/admin/community-posts-settings", headers=admin_h,
                 json={"enabled": True, "daily_count": 2, "max_posts": 100}, timeout=15)

    code = (
        "import asyncio, sys, os, json\n"
        "sys.path.insert(0, '/app/backend')\n"
        "from routes.community_posts import run_community_autopost\n"
        "print('RESULT:'+json.dumps(asyncio.run(run_community_autopost())))\n"
    )
    import subprocess
    p = subprocess.run(["python", "-c", code], capture_output=True, text=True, timeout=30, cwd="/app/backend")
    out = p.stdout + p.stderr
    assert "RESULT:" in out, out
    result_line = [l for l in out.splitlines() if l.startswith("RESULT:")][-1]
    import json as _j
    result = _j.loads(result_line.replace("RESULT:", ""))
    # 2 seed posts already published today with auto_published=True -> daily_quota
    assert result.get("skipped") == "daily_quota", f"Expected daily_quota, got {result}"


def test_run_community_autopost_max_reached(admin_h):
    # Temporarily lower max_posts to 2 so max_reached triggers
    requests.put(f"{API}/admin/community-posts-settings", headers=admin_h,
                 json={"max_posts": 2}, timeout=15)
    try:
        code = (
            "import asyncio, sys, json\n"
            "sys.path.insert(0, '/app/backend')\n"
            "from routes.community_posts import run_community_autopost\n"
            "print('RESULT:'+json.dumps(asyncio.run(run_community_autopost())))\n"
        )
        import subprocess, json as _j
        p = subprocess.run(["python", "-c", code], capture_output=True, text=True, timeout=30, cwd="/app/backend")
        out = p.stdout + p.stderr
        result_line = [l for l in out.splitlines() if l.startswith("RESULT:")][-1]
        result = _j.loads(result_line.replace("RESULT:", ""))
        assert result.get("skipped") == "max_reached", f"Expected max_reached, got {result}"
    finally:
        # restore max_posts=100
        requests.put(f"{API}/admin/community-posts-settings", headers=admin_h,
                     json={"max_posts": 100}, timeout=15)


# =========== FINAL CLEANUP ===========

def test_zz_cleanup_and_restore(admin_h):
    # Delete all test-created posts
    for pid in _created:
        r = requests.delete(f"{API}/admin/community-posts/{pid}", headers=admin_h, timeout=15)
        assert r.status_code in (200, 404)
    # Restore settings
    r = requests.put(f"{API}/admin/community-posts-settings", headers=admin_h,
                     json={"enabled": True, "daily_count": 2, "max_posts": 100}, timeout=15)
    assert r.status_code == 200
    s = r.json()["settings"]
    assert s == {**s, "enabled": True, "daily_count": 2, "max_posts": 100}
    # Verify counts after cleanup: published should be back to 2 (seed)
    lr = requests.get(f"{API}/admin/community-posts", headers=admin_h).json()
    # No TEST_ posts left
    assert not any("TEST_iter81" in p.get("body", "") for p in lr["posts"])
