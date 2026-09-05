"""Iter 76: Retiros Recientes bug-fix + admin stage change smoke tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://compliance-dash-32.preview.emergentagent.com').rstrip('/')
ADMIN = {"email": "admi@paylionsbit.es", "password": "LionsBit2026!"}
USER = {"email": "manclic@yahoo.es", "password": "FX2026"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get('access_token') or r.json().get('token')
    if tok:
        s.headers.update({'Authorization': f'Bearer {tok}'})
    return s


@pytest.fixture(scope="module")
def admin_sess():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def user_sess():
    return _login(USER)


def test_detailed_feed_no_invalid_rows(user_sess):
    r = user_sess.get(f"{BASE_URL}/api/community/recent-withdrawals/detailed?limit=100", timeout=20)
    assert r.status_code == 200
    data = r.json()
    items = data.get('items', [])
    assert len(items) > 0, "feed vacío"
    for it in items:
        name = (it.get('name_full') or '') + ' ' + (it.get('name_public') or '')
        assert 'admin' not in name.lower(), f"admin en feed: {it}"
        assert 'test' not in name.lower(), f"test en feed: {it}"
        assert it.get('country') != 'Internacional', f"país internacional: {it}"
        assert float(it.get('amount', 0)) >= 1000, f"monto ridículo: {it}"
        # currency por país
        c = (it.get('country') or '').lower()
        cur = it.get('currency')
        if 'españa' in c or 'espana' in c or 'spain' in c:
            assert cur == 'EUR', f"España debe ser EUR: {it}"
        if 'méxico' in c or 'mexico' in c or 'chile' in c:
            assert cur == 'USD', f"MX/CL debe ser USD: {it}"
        assert it.get('name_full') and ' ' in it['name_full'], f"name_full incompleto: {it}"


def test_admin_stage_invalid_returns_400(admin_sess, user_sess):
    r = user_sess.get(f"{BASE_URL}/api/community/recent-withdrawals/detailed?limit=5", timeout=15)
    wid = r.json()['items'][0]['withdrawal_id']
    r2 = admin_sess.post(f"{BASE_URL}/api/admin/recent-withdrawals/{wid}/stage",
                         json={'stage': 'nope'}, timeout=15)
    assert r2.status_code == 400


def test_user_stage_forbidden(user_sess):
    r = user_sess.get(f"{BASE_URL}/api/community/recent-withdrawals/detailed?limit=5", timeout=15)
    wid = r.json()['items'][0]['withdrawal_id']
    r2 = user_sess.post(f"{BASE_URL}/api/admin/recent-withdrawals/{wid}/stage",
                        json={'stage': 'en_revision'}, timeout=15)
    assert r2.status_code in (401, 403)


def test_admin_stage_roundtrip(admin_sess, user_sess):
    r = user_sess.get(f"{BASE_URL}/api/community/recent-withdrawals/detailed?limit=5", timeout=15)
    it = r.json()['items'][0]
    wid = it['withdrawal_id']
    # a en_revision
    r2 = admin_sess.post(f"{BASE_URL}/api/admin/recent-withdrawals/{wid}/stage",
                         json={'stage': 'en_revision'}, timeout=15)
    assert r2.status_code == 200 and r2.json().get('stage') == 'en_revision'
    r3 = user_sess.get(f"{BASE_URL}/api/community/recent-withdrawals/detailed?limit=100", timeout=15)
    found = next((x for x in r3.json()['items'] if x['withdrawal_id'] == wid), None)
    assert found and found['stage'] == 'en_revision' and found['questions_enabled'] is False
    # devolver a completado
    r4 = admin_sess.post(f"{BASE_URL}/api/admin/recent-withdrawals/{wid}/stage",
                         json={'stage': 'completado'}, timeout=15)
    assert r4.status_code == 200 and r4.json().get('stage') == 'completado'
    r5 = user_sess.get(f"{BASE_URL}/api/community/recent-withdrawals/detailed?limit=100", timeout=15)
    found2 = next((x for x in r5.json()['items'] if x['withdrawal_id'] == wid), None)
    assert found2 and found2['stage'] == 'completado' and found2['questions_enabled'] is True
