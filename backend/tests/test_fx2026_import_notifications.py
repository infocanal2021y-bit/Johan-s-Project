"""
Tests for FX2026 bulk-imported users (import_source == 'fx2026_xlsx').

Coverage:
- Auth login for imported users (correct + wrong password)
- Data integrity: country/role/status + auto-provisioned checking account
- Idempotency: pre-existing user password NOT overwritten; admin intact
- Broadcast (in-app + email) to a single imported user integrates with
  the same email pipeline as the rest of the platform (email_logs collection)
- GET /notifications returns welcome + broadcast notifications
"""
import os
import time
import uuid
import pytest
import requests
from pathlib import Path
from pymongo import MongoClient

def _load_env_val(key, path):
    p = Path(path)
    if p.exists():
        for line in p.read_text().splitlines():
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_backend_url().rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL") or _load_env_val("MONGO_URL", "/app/backend/.env")
DB_NAME = os.environ.get("DB_NAME") or _load_env_val("DB_NAME", "/app/backend/.env")
_mongo_client = MongoClient(MONGO_URL) if MONGO_URL else None
_db = _mongo_client[DB_NAME] if _mongo_client and DB_NAME else None

ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"

IMPORTED_USERS = [
    ("manclic@yahoo.es", "FX2026"),
    ("way3058@gmail.com", "FX2026"),
]
PREEXISTING_EMAIL = "gsalazar1@gmail.com"


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, email, password):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    return r


@pytest.fixture(scope="module")
def admin_token(session):
    r = _login(session, ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok, "Admin token missing"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- AUTH ----------

@pytest.mark.parametrize("email,password", IMPORTED_USERS)
def test_imported_user_login_success(session, email, password):
    r = _login(session, email, password)
    assert r.status_code == 200, f"{email} login failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("token"), "Missing token"
    user = body.get("user") or {}
    assert user.get("email", "").lower() == email.lower()


def test_imported_user_wrong_password(session):
    r = _login(session, IMPORTED_USERS[0][0], "WrongPass123!")
    assert r.status_code == 401, f"Expected 401 got {r.status_code}: {r.text}"


def test_preexisting_user_not_overwritten(session):
    # gsalazar1 should NOT accept FX2026
    r = _login(session, PREEXISTING_EMAIL, "FX2026")
    assert r.status_code == 401, (
        f"Preexisting user was overwritten with FX2026! status={r.status_code}"
    )


def test_admin_intact(session):
    r = _login(session, ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200
    u = r.json().get("user") or {}
    assert u.get("role") == "admin"


# ---------- DATA INTEGRITY ----------

def _find_user_by_email(session, admin_headers, email):
    # Prefer direct DB lookup (admin/users endpoint is limited to 1000 without search)
    if _db is not None:
        u = _db.users.find_one({"email": email})
        if u:
            u.pop("_id", None)
            return u
    # Fallback: attempt admin listing
    r = session.get(f"{API}/admin/users", headers=admin_headers, timeout=60)
    if r.status_code == 200:
        data = r.json()
        users = data if isinstance(data, list) else (data.get("users") or data.get("data") or [])
        for u in users:
            if (u.get("email") or "").lower() == email.lower():
                return u
    return None


@pytest.mark.parametrize("email,_", IMPORTED_USERS)
def test_imported_user_data_fields(session, admin_headers, email, _):
    user = _find_user_by_email(session, admin_headers, email)
    assert user is not None, f"User {email} not found via admin listing"
    assert user.get("country_name") == "España", f"country_name={user.get('country_name')}"
    assert user.get("country_code") == "ES", f"country_code={user.get('country_code')}"
    assert user.get("role") == "user"
    assert user.get("account_status") == "active"
    assert user.get("import_source") == "fx2026_xlsx"


def test_imported_user_has_checking_account(session, admin_headers):
    # Verify via DB directly (accounts collection auto-provisioned)
    if _db is None:
        pytest.skip("No DB access")
    email, _ = IMPORTED_USERS[0]
    user = _db.users.find_one({"email": email})
    assert user, f"User {email} missing in DB"
    accounts = list(_db.accounts.find({"user_id": user["id"]}))
    types = [(a.get("account_type") or "").lower() for a in accounts]
    assert "checking" in types, f"No checking account for {email}. Types found: {types}"


# ---------- BROADCAST / EMAIL INTEGRATION (CRITICAL) ----------

@pytest.fixture(scope="module")
def imported_user_ctx(session, admin_headers):
    email, pw = IMPORTED_USERS[0]
    user = _find_user_by_email(session, admin_headers, email)
    assert user, f"Could not locate {email}"
    return {"id": user["id"], "email": email, "password": pw}


def test_broadcast_single_imported_user_in_app_and_email(session, admin_headers, imported_user_ctx):
    unique = uuid.uuid4().hex[:8]
    title = f"TEST_FX2026_BC_{unique}"
    message = f"Test broadcast to imported user {imported_user_ctx['email']} ({unique})"
    payload = {
        "title": title,
        "message": message,
        "send_in_app": True,
        "send_email": True,
        "audience": "single",
        "target_user_id": imported_user_ctx["id"],
    }
    r = session.post(f"{API}/admin/broadcast", headers=admin_headers, json=payload, timeout=60)
    assert r.status_code == 200, f"broadcast failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("success") is True
    assert body.get("recipients") == 1, f"recipients={body.get('recipients')}"
    assert body.get("in_app_sent") == 1
    assert body.get("emails_queued") == 1

    # Wait for background email task
    time.sleep(4)

    # Verify in-app notification present after login
    lr = _login(session, imported_user_ctx["email"], imported_user_ctx["password"])
    assert lr.status_code == 200
    tok = lr.json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    nr = session.get(f"{API}/notifications", headers=h, timeout=30)
    assert nr.status_code == 200, f"GET /notifications failed: {nr.status_code} {nr.text}"
    data = nr.json()
    items = data if isinstance(data, list) else (data.get("notifications") or data.get("data") or [])
    titles = [n.get("title", "") for n in items]
    assert any(title in t for t in titles), f"Broadcast title {title} not in {titles[:5]}"

    # Verify email pipeline was used by checking email_logs collection directly
    found_email_log = False
    log_status = None
    if _db is not None:
        # search email_logs for this recipient + subject
        for _ in range(6):  # retry a few times as background task may still be running
            log = _db.email_logs.find_one({
                "to_email": imported_user_ctx["email"],
                "subject": {"$regex": title},
            })
            if not log:
                log = _db.email_logs.find_one({
                    "to": imported_user_ctx["email"],
                    "subject": {"$regex": title},
                })
            if log:
                found_email_log = True
                log_status = log.get("status") or log.get("state") or "unknown"
                print(f"email_log found status={log_status} keys={list(log.keys())}")
                break
            time.sleep(2)
    assert found_email_log, (
        f"No email_logs entry recorded for imported user broadcast. "
        f"Imported user is NOT integrated with the shared email pipeline."
    )


# ---------- IN-APP WELCOME ----------

def test_imported_user_welcome_notification(session):
    email, pw = IMPORTED_USERS[0]
    r = _login(session, email, pw)
    assert r.status_code == 200
    tok = r.json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    nr = session.get(f"{API}/notifications", headers=h, timeout=30)
    assert nr.status_code == 200
    data = nr.json()
    items = data if isinstance(data, list) else (data.get("notifications") or data.get("data") or [])
    joined_titles = " | ".join([(n.get("title") or "") for n in items])
    joined_msgs = " | ".join([(n.get("message") or "") for n in items])
    assert ("Bienvenido" in joined_titles) or ("Bienvenido" in joined_msgs) or ("LIONSBIT" in joined_titles), (
        f"No welcome notification found. Titles: {joined_titles[:300]}"
    )
