"""Regression test for the NEW Health indicator on GET /api/admin/users.

Validates the 'health' object shape & level-logic added in this iteration:
  red    => no checking OR suspended/rejected/blocked
  yellow => has accounts but at least one reason
  green  => all flags pass, no reasons
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
ADMIN_EMAIL = 'admi@paylionsbit.es'
ADMIN_PASS = 'LionsBit2026!'


@pytest.fixture(scope='module')
def admin_token():
    r = requests.post(
        f'{BASE_URL}/api/auth/login',
        json={'email': ADMIN_EMAIL, 'password': ADMIN_PASS},
        timeout=60,
    )
    assert r.status_code == 200, f'Admin login failed: {r.status_code} {r.text}'
    return r.json()['token']


@pytest.fixture(scope='module')
def users_response(admin_token):
    r = requests.get(
        f'{BASE_URL}/api/admin/users',
        headers={'Authorization': f'Bearer {admin_token}'},
        timeout=30,
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) > 0
    return data


def test_admin_users_endpoint_ok(users_response):
    assert len(users_response) >= 1


def test_every_user_has_health_field(users_response):
    """Every user dict must have a 'health' object with required keys."""
    for u in users_response:
        assert 'health' in u, f'user {u.get("email")} missing health'
        h = u['health']
        assert set(['level', 'reasons', 'flags']).issubset(h.keys())
        assert h['level'] in ('green', 'yellow', 'red')
        assert isinstance(h['reasons'], list)
        for k in ('has_checking', 'has_savings', 'verified', 'logged_in',
                  'must_change_password', 'suspended'):
            assert k in h['flags'], f'flag {k} missing'
            assert isinstance(h['flags'][k], bool)


def test_health_level_logic_matches_flags(users_response):
    """Verify red when no_checking/suspended; green when all good; yellow otherwise."""
    for u in users_response:
        h = u['health']
        f = h['flags']
        reasons = h['reasons']

        if not f['has_checking'] or f['suspended']:
            assert h['level'] == 'red', (
                f"{u.get('email')}: expected red (checking={f['has_checking']}, "
                f"suspended={f['suspended']}), got {h['level']}")
        elif len(reasons) == 0:
            assert h['level'] == 'green'
        else:
            assert h['level'] == 'yellow', (
                f"{u.get('email')}: expected yellow with reasons={reasons}, got {h['level']}")


def test_admin_user_is_green(users_response):
    """The seeded admin user MUST be green (intact pre-prod state)."""
    admin = next((u for u in users_response if u.get('email') == ADMIN_EMAIL), None)
    assert admin is not None, 'admin user not in /admin/users response'
    h = admin['health']
    assert h['level'] == 'green', (
        f'Admin should be green, got {h["level"]} reasons={h["reasons"]}')
    assert h['flags']['has_checking'] is True
    assert h['flags']['has_savings'] is True
    assert h['flags']['verified'] is True
    assert h['flags']['suspended'] is False
    # Admin should still have its 75,485 EUR intact (sanity)
    total_eur = admin.get('total_balance_eur', 0)
    assert total_eur >= 70000, f'Admin EUR balance regression: {total_eur}'


def test_reasons_consistent_with_flags(users_response):
    """If a reason string appears, the corresponding flag must be set accordingly."""
    for u in users_response:
        h = u['health']
        f = h['flags']
        rtxt = ' | '.join(h['reasons'])
        if 'Falta checking' in rtxt:
            assert f['has_checking'] is False
        if 'Falta savings' in rtxt:
            assert f['has_savings'] is False
        if 'KYC pendiente' in rtxt:
            assert f['verified'] is False
        if 'Sin acceso registrado' in rtxt:
            assert f['logged_in'] is False
        if 'Cambio de contrasena pendiente' in rtxt or 'contraseña pendiente' in rtxt:
            assert f['must_change_password'] is True


def test_unauthorized_403(admin_token):
    """Sanity: endpoint requires admin role."""
    r = requests.get(f'{BASE_URL}/api/admin/users', timeout=10)
    assert r.status_code in (401, 403), f'Expected 401/403, got {r.status_code}'
