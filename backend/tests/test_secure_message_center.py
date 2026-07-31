"""Backend tests for Secure Message Center (/api/messages/*)"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # fallback to frontend .env parse
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
    except Exception:
        pass

ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def test_user():
    # Register a temp user
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_msgctr_{suffix}@example.com"
    password = "TestUser2026!"
    payload = {
        "email": email,
        "password": password,
        "name": f"TEST User {suffix}",
        "phone": "+34600000000",
        "country_code": "ES",
        "country_name": "Spain",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
    if r.status_code not in (200, 201):
        pytest.skip(f"could not register test user: {r.status_code} {r.text[:200]}")
    login = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    data = login.json()
    return {"email": email, "password": password, "token": data["token"], "id": data.get("user", {}).get("id")}


def hdr(token):
    return {"Authorization": f"Bearer {token}"}


class TestInboxBasics:
    def test_inbox_admin_ok(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/messages/inbox", headers=hdr(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("items", "unread_counts", "totals_by_kind", "total"):
            assert k in d
        for k in ("ticket", "broadcast", "notification", "total"):
            assert k in d["unread_counts"]
        for k in ("ticket", "broadcast", "notification"):
            assert k in d["totals_by_kind"]

    def test_inbox_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/messages/inbox")
        assert r.status_code in (401, 403)

    def test_inbox_kind_filter(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/messages/inbox?kind=notification", headers=hdr(admin_token))
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["kind"] == "notification"

    def test_inbox_unread_only(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/messages/inbox?unread_only=true", headers=hdr(admin_token))
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["unread"] is True


class TestTicketUnreadFlow:
    def test_full_flow(self, test_user, admin_token):
        tok = test_user["token"]
        # 1) Create ticket
        payload = {"subject": "TEST_ticket_msgcenter", "message": "Consulta de prueba automatizada", "category": "general"}
        r = requests.post(f"{BASE_URL}/api/support/tickets", json=payload, headers=hdr(tok))
        assert r.status_code in (200, 201), r.text
        ticket = r.json()
        tid = ticket.get("id") or ticket.get("ticket_id") or ticket.get("ticket", {}).get("id")
        assert tid, f"no ticket id in response: {ticket}"

        # 2) Inbox: ticket present, initially not necessarily unread (no admin reply yet)
        r = requests.get(f"{BASE_URL}/api/messages/inbox?kind=ticket", headers=hdr(tok))
        assert r.status_code == 200
        found = next((i for i in r.json()["items"] if i["id"] == tid), None)
        assert found is not None, "ticket not found in user inbox"
        assert found["unread"] is False

        # 3) Admin replies
        r = requests.post(
            f"{BASE_URL}/api/admin/support/tickets/{tid}/reply",
            json={"ticket_id": tid, "message": "Respuesta del equipo LIONSBIT"},
            headers=hdr(admin_token),
        )
        assert r.status_code in (200, 201), r.text

        # 4) Inbox should now show unread=true for this ticket
        r = requests.get(f"{BASE_URL}/api/messages/inbox?kind=ticket", headers=hdr(tok))
        assert r.status_code == 200
        found = next((i for i in r.json()["items"] if i["id"] == tid), None)
        assert found and found["unread"] is True, f"expected unread=true, got {found}"

        # 5) Mark ticket seen
        r = requests.post(f"{BASE_URL}/api/messages/tickets/{tid}/seen", headers=hdr(tok))
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # 6) Should now be unread=false
        r = requests.get(f"{BASE_URL}/api/messages/inbox?kind=ticket", headers=hdr(tok))
        found = next((i for i in r.json()["items"] if i["id"] == tid), None)
        assert found and found["unread"] is False

    def test_seen_404_for_missing(self, test_user):
        r = requests.post(
            f"{BASE_URL}/api/messages/tickets/nonexistent-id-xyz/seen",
            headers=hdr(test_user["token"]),
        )
        assert r.status_code == 404


class TestBroadcastAppearsInInbox:
    def test_broadcast(self, test_user, admin_token):
        uid = test_user["id"]
        if not uid:
            pytest.skip("no user id available")
        payload = {
            "title": "TEST_broadcast_msg",
            "message": "Mensaje de prueba de broadcast",
            "send_in_app": True,
            "audience": "single",
            "target_user_id": uid,
        }
        r = requests.post(f"{BASE_URL}/api/admin/broadcast", json=payload, headers=hdr(admin_token))
        assert r.status_code in (200, 201), r.text
        time.sleep(1)
        r = requests.get(f"{BASE_URL}/api/messages/inbox?kind=broadcast", headers=hdr(test_user["token"]))
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(i["title"] == "TEST_broadcast_msg" for i in items), f"broadcast not in inbox: {items}"
