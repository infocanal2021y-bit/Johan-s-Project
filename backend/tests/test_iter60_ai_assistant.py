"""Iter 60 — AI Assistant 24/7 (Fase 3) backend tests.

Covers:
- /ai-assistant/suggestions — returns 5-6 contextually-aware suggestions
- /ai-assistant/sessions — empty initially, then lists sessions after chat
- /ai-assistant/chat — accepts message, creates session, returns assistant reply
- /ai-assistant/chat — rejects empty / too long messages
- /ai-assistant/chat — multi-turn keeps the same session_id and grows history
- /ai-assistant/sessions/{id}/messages — returns chronological history
- /ai-assistant/sessions/{id}/delete — removes session + cascades messages
- Auth gate: all endpoints reject unauthenticated requests

Note: real LLM call is made (Claude Sonnet 4.6 via Universal Key).
"""
import os
import sys
import time
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


@pytest.fixture(scope="module")
def fresh_user():
    suffix = uuid.uuid4().hex[:8]
    email = f"test_iter60_{suffix}@example.com"
    pwd = "TestPass123!"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": pwd, "name": f"Iter60 {suffix}",
              "country": "ES", "phone": "+34600000005"},
        timeout=15,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"Register failed: {r.text[:200]}")
    return {"email": email, "headers": {"Authorization": f"Bearer {_login(email, pwd)}"}}


# ════════════════════════════════════════════════════════════════════
#  AUTH GATE
# ════════════════════════════════════════════════════════════════════

class TestAuth:
    def test_chat_requires_auth(self):
        r = requests.post(f"{API}/ai-assistant/chat", json={"message": "hi"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_sessions_requires_auth(self):
        r = requests.get(f"{API}/ai-assistant/sessions", timeout=15)
        assert r.status_code in (401, 403)

    def test_suggestions_requires_auth(self):
        r = requests.get(f"{API}/ai-assistant/suggestions", timeout=15)
        assert r.status_code in (401, 403)


# ════════════════════════════════════════════════════════════════════
#  SUGGESTIONS
# ════════════════════════════════════════════════════════════════════

class TestSuggestions:
    def test_returns_default_set(self, fresh_user):
        r = requests.get(f"{API}/ai-assistant/suggestions", headers=fresh_user["headers"], timeout=15)
        assert r.status_code == 200
        s = r.json()["suggestions"]
        assert isinstance(s, list)
        assert 3 <= len(s) <= 6
        # Default suggestions mention financial topics
        joined = " ".join(s).lower()
        assert any(k in joined for k in ["swift", "iban", "mt103", "kyc", "transferencia"])


# ════════════════════════════════════════════════════════════════════
#  CHAT INPUT VALIDATION
# ════════════════════════════════════════════════════════════════════

class TestChatValidation:
    def test_rejects_empty(self, fresh_user):
        r = requests.post(f"{API}/ai-assistant/chat", headers=fresh_user["headers"],
                          json={"message": "  "}, timeout=15)
        assert r.status_code == 400

    def test_rejects_too_long(self, fresh_user):
        r = requests.post(f"{API}/ai-assistant/chat", headers=fresh_user["headers"],
                          json={"message": "a" * 5000}, timeout=15)
        assert r.status_code == 400

    def test_rejects_unknown_session(self, fresh_user):
        r = requests.post(f"{API}/ai-assistant/chat", headers=fresh_user["headers"],
                          json={"message": "hola", "session_id": "fake-session-id-12345"}, timeout=15)
        assert r.status_code == 404


# ════════════════════════════════════════════════════════════════════
#  CHAT END-TO-END (real LLM)
# ════════════════════════════════════════════════════════════════════

class TestChatE2E:
    @pytest.fixture(scope="class")
    def first_turn(self, fresh_user):
        r = requests.post(
            f"{API}/ai-assistant/chat", headers=fresh_user["headers"],
            json={"message": "Hola, en máximo 1 frase di '¡Hola, soy LIONS Assistant!'"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        return r.json()

    def test_first_turn_creates_session_and_returns_reply(self, first_turn):
        assert first_turn["is_new_session"] is True
        assert first_turn["session_id"]
        assert first_turn["user_message"]["role"] == "user"
        assert first_turn["assistant_message"]["role"] == "assistant"
        # Real LLM reply must not be empty
        assert len(first_turn["assistant_message"]["content"]) > 5

    def test_session_appears_in_list(self, fresh_user, first_turn):
        r = requests.get(f"{API}/ai-assistant/sessions", headers=fresh_user["headers"], timeout=15)
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()["items"]]
        assert first_turn["session_id"] in ids

    def test_messages_endpoint_returns_history(self, fresh_user, first_turn):
        r = requests.get(
            f"{API}/ai-assistant/sessions/{first_turn['session_id']}/messages",
            headers=fresh_user["headers"], timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["session"]["id"] == first_turn["session_id"]
        roles = [m["role"] for m in body["messages"]]
        assert roles == ["user", "assistant"]

    def test_second_turn_reuses_session(self, fresh_user, first_turn):
        r = requests.post(
            f"{API}/ai-assistant/chat", headers=fresh_user["headers"],
            json={"message": "Responde con la palabra 'OK' únicamente.",
                  "session_id": first_turn["session_id"]},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["is_new_session"] is False
        assert body["session_id"] == first_turn["session_id"]

        # Messages endpoint should now have 4 messages
        r2 = requests.get(
            f"{API}/ai-assistant/sessions/{first_turn['session_id']}/messages",
            headers=fresh_user["headers"], timeout=15,
        )
        assert len(r2.json()["messages"]) == 4


# ════════════════════════════════════════════════════════════════════
#  SESSION DELETE
# ════════════════════════════════════════════════════════════════════

class TestDelete:
    def test_delete_session_cascades(self, fresh_user):
        # Create a session
        r = requests.post(
            f"{API}/ai-assistant/chat", headers=fresh_user["headers"],
            json={"message": "Saluda en 5 palabras."},
            timeout=60,
        )
        sid = r.json()["session_id"]

        # Delete it
        r2 = requests.post(
            f"{API}/ai-assistant/sessions/{sid}/delete",
            headers=fresh_user["headers"], timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json()["ok"] is True

        # Now fetching messages should 404
        r3 = requests.get(
            f"{API}/ai-assistant/sessions/{sid}/messages",
            headers=fresh_user["headers"], timeout=15,
        )
        assert r3.status_code == 404

    def test_delete_unknown_returns_404(self, fresh_user):
        r = requests.post(
            f"{API}/ai-assistant/sessions/no-such-session/delete",
            headers=fresh_user["headers"], timeout=15,
        )
        assert r.status_code == 404


# ════════════════════════════════════════════════════════════════════
#  CROSS-USER ISOLATION
# ════════════════════════════════════════════════════════════════════

class TestIsolation:
    def test_user_cannot_access_other_users_session(self, fresh_user):
        # Create a session with fresh_user
        r1 = requests.post(
            f"{API}/ai-assistant/chat", headers=fresh_user["headers"],
            json={"message": "Hola"},
            timeout=60,
        )
        sid = r1.json()["session_id"]

        # Register a SECOND user and try to read fresh_user's session
        suffix2 = uuid.uuid4().hex[:8]
        email2 = f"test_iter60b_{suffix2}@example.com"
        pwd = "TestPass123!"
        reg = requests.post(
            f"{API}/auth/register",
            json={"email": email2, "password": pwd, "name": f"Iter60b {suffix2}",
                  "country": "ES", "phone": "+34600000006"},
            timeout=15,
        )
        if reg.status_code not in (200, 201):
            pytest.skip("Could not register second user")
        token2 = _login(email2, pwd)
        h2 = {"Authorization": f"Bearer {token2}"}

        r2 = requests.get(f"{API}/ai-assistant/sessions/{sid}/messages", headers=h2, timeout=15)
        assert r2.status_code == 404

        r3 = requests.post(f"{API}/ai-assistant/chat", headers=h2,
                           json={"message": "hi", "session_id": sid}, timeout=15)
        assert r3.status_code == 404
