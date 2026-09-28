"""Tests para la feature 'Transacciones autorizadas'."""
import os
import pytest
import requests

BASE = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/') or 'http://localhost:8001'
API = f"{BASE}/api"

ADMIN = {"email": "info@paylionsbit.es", "password": "Juan1949."}
USER = {"email": "manclic@yahoo.es", "password": "FX2026"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text[:200]}"
    j = r.json()
    return j.get("token") or j.get("access_token")


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def user_token():
    return _login(USER)


def _h(t):
    return {"Authorization": f"Bearer {t}"}


# --- Listado usuario normal ---
def test_list_user_normal(user_token):
    r = requests.get(f"{API}/authorized-transactions", headers=_h(user_token), timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["total_planned"] == 70
    assert d["count"] >= 0
    items = d["items"]
    seqs = [i["sequence"] for i in items]
    assert seqs == sorted(seqs)
    assert d["totals"]["authorized"] == round(d["count"] * 6000.0, 2)
    assert d["totals"]["paid"] == round(d["count"] * 800.0, 2)
    cfg = d.get("config") or {}
    assert set(cfg.keys()) == {"next_batch_at"}, f"user cfg keys: {cfg.keys()}"


def test_list_admin_full_config(admin_token):
    r = requests.get(f"{API}/authorized-transactions", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200
    cfg = r.json()["config"]
    for k in ("paused", "batch_size", "interval_hours", "next_batch_at", "last_batch_at"):
        assert k in cfg, f"missing {k} in admin cfg"


# --- 403 usuario normal en admin endpoints ---
def test_forbidden_publish(user_token):
    r = requests.post(f"{API}/admin/authorized-transactions/publish-now", headers=_h(user_token), timeout=30)
    assert r.status_code == 403


def test_forbidden_put_config(user_token):
    r = requests.put(f"{API}/admin/authorized-transactions/config", headers=_h(user_token), json={"paused": True}, timeout=30)
    assert r.status_code == 403


def test_forbidden_get_config(user_token):
    r = requests.get(f"{API}/admin/authorized-transactions/config", headers=_h(user_token), timeout=30)
    assert r.status_code == 403


# --- Validaciones PUT config ---
def test_put_empty(admin_token):
    r = requests.put(f"{API}/admin/authorized-transactions/config", headers=_h(admin_token), json={}, timeout=30)
    assert r.status_code == 400


def test_put_bad_batch(admin_token):
    r = requests.put(f"{API}/admin/authorized-transactions/config", headers=_h(admin_token), json={"batch_size": 0}, timeout=30)
    assert r.status_code == 400


def test_put_bad_interval(admin_token):
    r = requests.put(f"{API}/admin/authorized-transactions/config", headers=_h(admin_token), json={"interval_hours": 500}, timeout=30)
    assert r.status_code == 400


def test_pause_toggle(admin_token):
    r = requests.put(f"{API}/admin/authorized-transactions/config", headers=_h(admin_token), json={"paused": True}, timeout=30)
    assert r.status_code == 200
    assert r.json()["config"]["paused"] is True
    r = requests.put(f"{API}/admin/authorized-transactions/config", headers=_h(admin_token), json={"paused": False}, timeout=30)
    assert r.status_code == 200
    assert r.json()["config"]["paused"] is False


# --- Ciclo: reset → publish → publish → verificar orden y sin duplicados ---
def test_reset_and_publish_flow(admin_token):
    r = requests.post(f"{API}/admin/authorized-transactions/reset", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200

    r = requests.post(f"{API}/admin/authorized-transactions/publish-now", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["count"] == 3
    assert d["created"] == ["CarlosM_01", "JavierR_02", "MiguelS_03"]
    assert d["totals"]["authorized"] == 18000.0
    assert d["totals"]["paid"] == 2400.0

    r = requests.post(f"{API}/admin/authorized-transactions/publish-now", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["count"] == 6
    assert d["created"] == ["AntonioG_04", "DanielP_05", "RobertoL_06"]

    r = requests.get(f"{API}/authorized-transactions", headers=_h(admin_token), timeout=30)
    items = r.json()["items"]
    usernames = [i["username"] for i in items]
    assert len(usernames) == len(set(usernames)), "duplicados detectados"
    assert usernames[:6] == [
        "CarlosM_01", "JavierR_02", "MiguelS_03", "AntonioG_04", "DanielP_05", "RobertoL_06"
    ]


# --- Al final: dejar estado inicial (3 primeros, paused=false) ---
def test_zzz_leave_initial_state(admin_token):
    r = requests.post(f"{API}/admin/authorized-transactions/reset", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200
    r = requests.post(f"{API}/admin/authorized-transactions/publish-now", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200
    # asegurar paused=false
    requests.put(f"{API}/admin/authorized-transactions/config", headers=_h(admin_token), json={"paused": False}, timeout=30)
    r = requests.get(f"{API}/authorized-transactions", headers=_h(admin_token), timeout=30)
    d = r.json()
    assert d["count"] == 3
    assert d["config"]["paused"] is False
    assert d["config"]["next_batch_at"] is not None
