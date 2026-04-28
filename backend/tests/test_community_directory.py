"""Tests for /api/community/* endpoints (iteration_43).

Validates:
- Auth required
- Safe field exposure (no email/phone/kyc_documents/password)
- Admin role excluded from results
- is_self resolves correctly
- Query params: q, status, country, limit
- Recent withdrawals public_first_name anonymization + status filter
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
ADMIN_EMAIL = 'admi@paylionsbit.es'
ADMIN_PASSWORD = 'LionsBit2026!'

UNSAFE_FIELDS = {'email', 'phone', 'password', 'kyc_documents',
                 'reset_token', 'login_history', 'engagement'}


@pytest.fixture(scope='module')
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD},
                      timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get('access_token') or r.json().get('token')
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope='module')
def admin_headers(admin_token):
    return {'Authorization': f'Bearer {admin_token}'}


@pytest.fixture(scope='module')
def admin_id(admin_headers):
    # Get admin /me to learn the admin id
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers, timeout=15)
    if r.status_code == 200:
        return r.json().get('id')
    return None


@pytest.fixture(scope='module')
def test_user(admin_headers):
    """Create or reuse a non-admin test user via manual-create."""
    payload = {
        'name': 'TEST Community Maria',
        'email': f'test_community_{int(time.time())}@test.com',
        'country': 'España',
        'phone': '+34600000000',
    }
    r = requests.post(f"{BASE_URL}/api/admin/users/manual-create",
                      headers=admin_headers, json=payload, timeout=20)
    if r.status_code not in (200, 201):
        pytest.skip(f"manual-create failed: {r.status_code} {r.text}")
    data = r.json()
    user = data.get('user') or data
    temp_pw = data.get('temporary_password') or data.get('temp_password') or 'lionsbit2.0'
    return {
        'id': user.get('id'),
        'email': payload['email'],
        'name': payload['name'],
        'password': temp_pw,
    }


@pytest.fixture(scope='module')
def user_token(test_user):
    """Login as the new test user. Force password change is OK — login still
    issues a token."""
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={'email': test_user['email'],
                            'password': test_user['password']},
                      timeout=20)
    if r.status_code != 200:
        pytest.skip(f"user login failed: {r.status_code} {r.text}")
    body = r.json()
    tok = body.get('access_token') or body.get('token')
    if not tok:
        pytest.skip("no token in user login response")
    # Resolve real user id from /auth/me if not provided by manual-create
    if not test_user.get('id'):
        me = requests.get(f"{BASE_URL}/api/auth/me",
                          headers={'Authorization': f'Bearer {tok}'},
                          timeout=15)
        if me.status_code == 200:
            test_user['id'] = me.json().get('id')
    return tok


# ───────── community/members ─────────
class TestCommunityMembers:
    def test_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/community/members", timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_can_call(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/community/members",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert 'count' in data and 'members' in data and 'self_id' in data \
            and 'updated_at' in data
        assert isinstance(data['members'], list)

    def test_no_unsafe_fields_leak(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/community/members",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200
        for m in r.json()['members']:
            keys = set(m.keys())
            leaks = keys & UNSAFE_FIELDS
            assert not leaks, f"member {m.get('id')} leaked fields: {leaks}"

    def test_admin_excluded_from_list(self, admin_headers, admin_id):
        r = requests.get(f"{BASE_URL}/api/community/members?limit=500",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200
        ids = [m['id'] for m in r.json()['members']]
        if admin_id:
            assert admin_id not in ids, "admin user should be excluded"

    def test_required_safe_fields_present(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/community/members",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200
        members = r.json()['members']
        if not members:
            pytest.skip("no members returned")
        m = members[0]
        for k in ['id', 'is_self', 'name', 'country', 'country_flag',
                  'deposited_eur', 'available_balance_eur', 'account_status',
                  'progress_step', 'badges', 'has_pending_tax',
                  'partial_withdraw_unlocked', 'created_at']:
            assert k in m, f"missing field {k}"
        assert m['account_status'] in (
            'activo', 'en_revision', 'retiro_pendiente', 'completado')
        assert isinstance(m['progress_step'], int) and 1 <= m['progress_step'] <= 5
        assert isinstance(m['badges'], list)

    def test_status_filter(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/community/members?status=activo",
            headers=admin_headers, timeout=20)
        assert r.status_code == 200
        for m in r.json()['members']:
            assert m['account_status'] == 'activo'

    def test_country_filter(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/community/members?country=esp",
            headers=admin_headers, timeout=20)
        assert r.status_code == 200
        for m in r.json()['members']:
            assert 'esp' in m['country'].lower()

    def test_q_search(self, admin_headers, test_user):
        # Search by part of the test user name
        r = requests.get(
            f"{BASE_URL}/api/community/members?q=maria",
            headers=admin_headers, timeout=20)
        assert r.status_code == 200
        members = r.json()['members']
        for m in members:
            assert ('maria' in m['name'].lower()
                    or 'maria' in m['country'].lower())

    def test_limit_param(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/community/members?limit=2",
            headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert len(r.json()['members']) <= 2

    def test_is_self_for_user(self, user_token, test_user):
        h = {'Authorization': f'Bearer {user_token}'}
        r = requests.get(f"{BASE_URL}/api/community/members?limit=500",
                         headers=h, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data['self_id'] == test_user['id']
        self_cards = [m for m in data['members'] if m['is_self']]
        assert len(self_cards) == 1, \
            f"expected exactly 1 self card, got {len(self_cards)}"
        assert self_cards[0]['id'] == test_user['id']


# ───────── community/recent-withdrawals ─────────
class TestRecentWithdrawals:
    def test_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/community/recent-withdrawals",
                         timeout=15)
        assert r.status_code in (401, 403)

    def test_returns_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/community/recent-withdrawals",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert 'count' in d and 'items' in d and 'updated_at' in d
        assert isinstance(d['items'], list)

    def test_status_whitelist_and_anonymization(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/community/recent-withdrawals",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200
        for it in r.json()['items']:
            assert it.get('status') in (
                'completed', 'in_transfer', 'approved'), \
                f"unexpected status {it.get('status')}"
            # name_public should not contain a full last name (just first + initial)
            np = it.get('name_public') or ''
            # Allowed forms: "Juan", "Juan A.", "Juan A"
            parts = np.split()
            if len(parts) >= 2:
                # second token should be 1-2 chars (initial + optional dot)
                assert len(parts[-1].rstrip('.')) <= 2, \
                    f"name not anonymized: {np}"
            # no email/phone leak
            for k in ('email', 'phone', 'name'):
                assert k not in it
