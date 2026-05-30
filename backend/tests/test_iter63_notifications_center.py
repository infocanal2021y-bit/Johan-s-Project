"""Iter 63 — Notifications Center (Fase 6) backend tests."""
import os
import sys
import uuid
import time
from datetime import datetime, timezone
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


def _db():
    from pymongo import MongoClient
    cli = MongoClient(os.environ["MONGO_URL"])
    return cli, cli[os.environ["DB_NAME"]]


def _seed_notifications(user_id, items):
    """Insert a batch of notifications directly. items=[(title, message), ...]"""
    cli, db = _db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        docs = [{
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "title": t,
            "message": m,
            "read": False,
            "created_at": now,
        } for (t, m) in items]
        if docs:
            db.notifications.insert_many(docs)
        return [d["id"] for d in docs]
    finally:
        cli.close()


@pytest.fixture
def fresh_user():
    suffix = uuid.uuid4().hex[:8]
    email = f"test_iter63_{suffix}@example.com"
    pwd = "TestPass123!"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": pwd, "name": f"Iter63 {suffix}",
              "country": "ES", "phone": "+34600000011"},
        timeout=15,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"Register failed: {r.text[:200]}")
    token = _login(email, pwd)
    cli, db = _db()
    try:
        u = db.users.find_one({"email": email})
    finally:
        cli.close()
    return {"email": email, "user_id": u["id"], "headers": {"Authorization": f"Bearer {token}"}}


# ════════════════════════════════════════════════════════════════════
class TestNotificationsCenter:
    def test_requires_auth(self):
        r = requests.get(f"{API}/notifications/center", timeout=15)
        assert r.status_code in (401, 403)

    def test_empty_payload_has_shape(self, fresh_user):
        r = requests.get(f"{API}/notifications/center", headers=fresh_user["headers"], timeout=15)
        assert r.status_code == 200
        body = r.json()
        for k in ("items", "grouped_by_day", "counts_by_category", "total", "unread_total", "category_meta", "category_filter"):
            assert k in body, f"missing {k}"
        # New users may have a single auto-generated welcome notification
        assert body["total"] >= 0
        assert isinstance(body["items"], list)

    def test_categorizes_correctly(self, fresh_user):
        # Note: "documento" keyword wins over "expediente" because docs is checked first.
        # Use unambiguous titles for each category.
        _seed_notifications(fresh_user["user_id"], [
            ("Retiro WD-260530 actualizado", "Tu retiro pasó a estado completado."),
            ("Vault certificado", "Tu hash ha sido inmutabilizado en la cadena."),
            ("Nueva difusión recibida", "Un mensaje del administrador."),
            ("Estado del expediente: aprobado", "Tu expediente ha sido revisado correctamente."),
            ("Mantenimiento programado", "Servicio disponible."),
        ])
        r = requests.get(f"{API}/notifications/center", headers=fresh_user["headers"], timeout=15)
        body = r.json()
        counts = body["counts_by_category"]
        assert counts["transactions"] >= 1
        assert counts["documents"] >= 1
        assert counts["messages"] >= 1
        assert counts["expediente"] >= 1
        for it in body["items"]:
            assert it.get("category") in body["category_meta"]

    def test_filter_by_category(self, fresh_user):
        _seed_notifications(fresh_user["user_id"], [
            ("Retiro confirmado", "Tu retiro fue confirmado."),
            ("Documento subido", "Documento KYC recibido en Vault."),
        ])
        r = requests.get(f"{API}/notifications/center?category=transactions",
                         headers=fresh_user["headers"], timeout=15)
        body = r.json()
        assert body["category_filter"] == "transactions"
        for it in body["items"]:
            assert it["category"] == "transactions"

    def test_unread_only_filter(self, fresh_user):
        # Baseline counts (the auto welcome message may exist)
        r0 = requests.get(f"{API}/notifications/center", headers=fresh_user["headers"], timeout=15).json()
        base_total = r0["total"]
        base_unread = r0["unread_total"]

        ids = _seed_notifications(fresh_user["user_id"], [
            ("Retiro 1", "x"), ("Retiro 2", "y"), ("Retiro 3", "z"),
        ])
        requests.put(f"{API}/notifications/{ids[0]}/read", headers=fresh_user["headers"], timeout=15)

        r_all = requests.get(f"{API}/notifications/center", headers=fresh_user["headers"], timeout=15).json()
        r_unread = requests.get(f"{API}/notifications/center?unread_only=true",
                                headers=fresh_user["headers"], timeout=15).json()
        assert r_all["total"] - base_total == 3
        assert (r_all["unread_total"] - base_unread) == 2
        assert len(r_unread["items"]) == r_all["unread_total"]

    def test_grouped_by_day(self, fresh_user):
        # We expect AT LEAST 1 group (today). May have more if the welcome notif
        # was inserted at a different timestamp.
        _seed_notifications(fresh_user["user_id"], [("A", "a"), ("B", "b")])
        r = requests.get(f"{API}/notifications/center", headers=fresh_user["headers"], timeout=15)
        body = r.json()
        assert len(body["grouped_by_day"]) >= 1
        today = datetime.now(timezone.utc).date().isoformat()
        today_group = next((g for g in body["grouped_by_day"] if g["day"] == today), None)
        assert today_group is not None
        # The 2 seeded "today" notifications must be in today's group
        assert len(today_group["items"]) >= 2


class TestActions:
    def test_mark_all_read(self, fresh_user):
        _seed_notifications(fresh_user["user_id"], [("X1", "a"), ("X2", "b"), ("X3", "c")])
        r = requests.put(f"{API}/notifications/read-all", headers=fresh_user["headers"], timeout=15)
        assert r.status_code == 200
        assert r.json()["updated"] >= 3

        check = requests.get(f"{API}/notifications/center", headers=fresh_user["headers"], timeout=15).json()
        assert check["unread_total"] == 0

    def test_delete_notification(self, fresh_user):
        ids = _seed_notifications(fresh_user["user_id"], [("Delete me", "msg")])
        r = requests.delete(f"{API}/notifications/{ids[0]}", headers=fresh_user["headers"], timeout=15)
        assert r.status_code == 200
        # Now refetch
        check = requests.get(f"{API}/notifications/center", headers=fresh_user["headers"], timeout=15).json()
        assert all(it["id"] != ids[0] for it in check["items"])

    def test_delete_unknown_returns_404(self, fresh_user):
        r = requests.delete(f"{API}/notifications/no-such-id", headers=fresh_user["headers"], timeout=15)
        assert r.status_code == 404

    def test_mark_read_idempotent(self, fresh_user):
        ids = _seed_notifications(fresh_user["user_id"], [("Mark me", "msg")])
        r1 = requests.put(f"{API}/notifications/{ids[0]}/read", headers=fresh_user["headers"], timeout=15)
        assert r1.status_code == 200
        # Second time should also return 200 (already read, not 404)
        r2 = requests.put(f"{API}/notifications/{ids[0]}/read", headers=fresh_user["headers"], timeout=15)
        assert r2.status_code == 200


class TestIsolation:
    def test_user_cannot_see_other_users_notifs(self, fresh_user):
        _seed_notifications(fresh_user["user_id"], [("Private", "secret")])

        suffix = uuid.uuid4().hex[:8]
        email2 = f"test_iter63b_{suffix}@example.com"
        pwd = "TestPass123!"
        reg = requests.post(
            f"{API}/auth/register",
            json={"email": email2, "password": pwd, "name": f"Iter63b {suffix}",
                  "country": "ES", "phone": "+34600000012"},
            timeout=15,
        )
        if reg.status_code not in (200, 201):
            pytest.skip("Cannot register second user")
        h2 = {"Authorization": f"Bearer {_login(email2, pwd)}"}

        r = requests.get(f"{API}/notifications/center", headers=h2, timeout=15)
        body = r.json()
        # User B may have an auto welcome notif but must NOT see the "Private" one
        assert all(it["title"] != "Private" for it in body["items"])
        # And the totals must be small (welcome only at most)
        assert body["total"] <= 2
