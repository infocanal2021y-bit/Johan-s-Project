"""Tests for iteration 51 features:
   1) Single-user broadcast (audience='single' + target_user_id) +
      /admin/broadcast/search-users with admin filtered out
   2) /api/community/global-transfers SWIFT-style map endpoint
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"
ADMIN_EMAIL = 'admi@paylionsbit.es'
ADMIN_PASS = 'LionsBit2026!'


@pytest.fixture(scope='module')
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={'email': ADMIN_EMAIL, 'password': ADMIN_PASS},
                      timeout=20)
    assert r.status_code == 200, r.text
    return r.json()['token']


@pytest.fixture(scope='module')
def admin_headers(admin_token):
    return {'Authorization': f'Bearer {admin_token}'}


@pytest.fixture(scope='module')
def admin_id(admin_headers):
    r = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=10)
    assert r.status_code == 200
    return r.json()['id']


# ---------- /admin/broadcast/search-users ----------

class TestBroadcastSearchUsers:
    def test_requires_auth(self):
        r = requests.get(f"{API}/admin/broadcast/search-users?q=a", timeout=10)
        assert r.status_code in (401, 403), r.text

    def test_search_filters_out_admin(self, admin_headers):
        # 'admi' should match the admin email — endpoint MUST exclude admins
        r = requests.get(f"{API}/admin/broadcast/search-users",
                         params={'q': 'admi', 'limit': 20},
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert 'users' in data and 'count' in data
        for u in data['users']:
            assert u.get('email') != ADMIN_EMAIL, f"admin leaked: {u}"

    def test_search_with_query_jorg(self, admin_headers):
        r = requests.get(f"{API}/admin/broadcast/search-users",
                         params={'q': 'jorg', 'limit': 5},
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data['users'], list)
        assert data['count'] == len(data['users'])
        assert data['count'] <= 5

    def test_search_empty_q_returns_users(self, admin_headers):
        r = requests.get(f"{API}/admin/broadcast/search-users",
                         params={'limit': 10}, headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data['count'] >= 1
        assert data['count'] <= 10
        for u in data['users']:
            assert u.get('email') != ADMIN_EMAIL


# ---------- /admin/broadcast audience='single' ----------

class TestBroadcastSingleAudience:
    def test_single_without_target_user_id_400(self, admin_headers):
        r = requests.post(f"{API}/admin/broadcast",
                         json={'title': 'TEST_single', 'message': 'hola',
                               'send_in_app': True, 'send_email': False,
                               'audience': 'single'},
                         headers=admin_headers, timeout=15)
        assert r.status_code == 400, r.text
        assert 'usuario' in r.json().get('detail', '').lower()

    def test_single_with_admin_id_returns_404(self, admin_headers, admin_id):
        r = requests.post(f"{API}/admin/broadcast",
                         json={'title': 'TEST_single_admin', 'message': 'm',
                               'send_in_app': True, 'send_email': False,
                               'audience': 'single', 'target_user_id': admin_id},
                         headers=admin_headers, timeout=15)
        assert r.status_code == 404, r.text

    def test_single_with_invalid_user_id_returns_404(self, admin_headers):
        r = requests.post(f"{API}/admin/broadcast",
                         json={'title': 'TEST_invalid', 'message': 'm',
                               'send_in_app': True, 'send_email': False,
                               'audience': 'single',
                               'target_user_id': 'nonexistent-uuid-9999'},
                         headers=admin_headers, timeout=15)
        assert r.status_code == 404, r.text

    def test_single_with_valid_user_creates_one_notification(self, admin_headers):
        # Pick a real non-admin user
        sr = requests.get(f"{API}/admin/broadcast/search-users",
                          params={'limit': 5}, headers=admin_headers, timeout=15)
        assert sr.status_code == 200
        users = sr.json()['users']
        assert len(users) >= 1, 'No non-admin users to test'
        target = users[0]
        target_id = target['id']

        title = 'TEST_single_broadcast_iter51'
        r = requests.post(f"{API}/admin/broadcast",
                         json={'title': title,
                               'message': 'Mensaje individual de prueba',
                               'send_in_app': True, 'send_email': False,
                               'audience': 'single', 'target_user_id': target_id},
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data['success'] is True
        assert data['recipients'] == 1
        assert data['in_app_sent'] == 1
        assert data['emails_queued'] == 0


# ---------- /admin/broadcast audience='all' regression ----------

class TestBroadcastAllAudience:
    def test_all_audience_still_works(self, admin_headers):
        r = requests.post(f"{API}/admin/broadcast",
                         json={'title': 'TEST_iter51_all',
                               'message': 'regression',
                               'send_in_app': True, 'send_email': False,
                               'audience': 'all'},
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data['success'] is True
        assert data['recipients'] >= 1


# ---------- /community/global-transfers ----------

SUPPORTED_COUNTRIES = {'España', 'Chile', 'México', 'Costa Rica', 'Argentina'}


class TestGlobalTransfers:
    def test_requires_auth(self):
        r = requests.get(f"{API}/community/global-transfers?limit=5", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_returns_shape(self, admin_headers):
        r = requests.get(f"{API}/community/global-transfers",
                         params={'limit': 10}, headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert 'count' in data and 'items' in data and 'countries' in data and 'updated_at' in data
        assert set(data['countries']) == SUPPORTED_COUNTRIES

    def test_items_have_required_fields(self, admin_headers):
        r = requests.get(f"{API}/community/global-transfers",
                         params={'limit': 10}, headers=admin_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert len(data['items']) >= 1
        for item in data['items']:
            for f in ('origin_city', 'origin_lat', 'origin_lng',
                      'dest_city', 'dest_lat', 'dest_lng',
                      'amount_eur', 'country', 'country_flag',
                      'name_public', 'status', 'date'):
                assert f in item, f'Missing field {f} in {item}'
            assert item['country'] in SUPPORTED_COUNTRIES
            assert isinstance(item['origin_lat'], (int, float))
            assert isinstance(item['origin_lng'], (int, float))
            assert isinstance(item['amount_eur'], (int, float))

    def test_limit_is_padded_with_demo(self, admin_headers):
        # request a high limit — endpoint must pad with is_demo=True items
        target_limit = 20
        r = requests.get(f"{API}/community/global-transfers",
                         params={'limit': target_limit},
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data['count'] == target_limit, f"expected {target_limit} items, got {data['count']}"
