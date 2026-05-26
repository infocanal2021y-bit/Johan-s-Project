"""Backend tests for GET /api/admin/journey-analytics (P2 Journey Analytics)."""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
ADMIN_EMAIL = 'admi@paylionsbit.es'
ADMIN_PASSWORD = 'LionsBit2026!'

EXPECTED_STAGE_KEYS = [
    'registered', 'dashboard_entered', 'balance_viewed', 'withdraw_initiated',
    'kyc_reached', 'proof_uploaded', 'pending_review', 'completed',
]


# ----- fixtures -----

@pytest.fixture(scope='module')
def api():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    return s


@pytest.fixture(scope='module')
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    return r.json().get('access_token') or r.json().get('token')


@pytest.fixture(scope='module')
def admin_headers(admin_token):
    return {'Authorization': f'Bearer {admin_token}', 'Content-Type': 'application/json'}


@pytest.fixture(scope='module')
def base_payload(api, admin_headers):
    r = api.get(f"{BASE_URL}/api/admin/journey-analytics", headers=admin_headers, timeout=60)
    assert r.status_code == 200, f"unexpected: {r.status_code} {r.text[:300]}"
    return r.json()


# ----- auth tests -----

class TestAuth:
    def test_anonymous_forbidden(self, api):
        r = api.get(f"{BASE_URL}/api/admin/journey-analytics", timeout=30)
        assert r.status_code in (401, 403), f"anon got {r.status_code}"

    def test_non_admin_forbidden(self, api):
        # invalid token should not succeed
        r = api.get(f"{BASE_URL}/api/admin/journey-analytics",
                    headers={'Authorization': 'Bearer not-a-real-token'}, timeout=30)
        assert r.status_code in (401, 403)


# ----- structural tests -----

class TestPayloadShape:
    def test_top_level_keys(self, base_payload):
        for k in ['stages', 'overall_conversion_pct', 'avg_hours_between',
                  'by_country', 'by_method', 'by_status', 'stuck_users',
                  'followup_users', 'recent_active', 'filters', 'updated_at',
                  'total_users', 'cutoff']:
            assert k in base_payload, f"missing top-level key: {k}"

    def test_stage_keys_order(self, base_payload):
        stages = base_payload['stages']
        keys = [s['key'] for s in stages]
        assert keys == EXPECTED_STAGE_KEYS

    def test_avg_hours_keys(self, base_payload):
        ah = base_payload['avg_hours_between']
        for k in ['registered_to_first_login', 'dashboard_to_withdraw',
                  'withdraw_to_proof', 'proof_to_completed']:
            assert k in ah
            v = ah[k]
            assert v is None or (isinstance(v, (int, float)) and v >= 0), \
                f"{k} invalid: {v}"

    def test_total_users_positive(self, base_payload):
        assert base_payload['total_users'] > 0

    def test_overall_conversion_pct_range(self, base_payload):
        v = base_payload['overall_conversion_pct']
        assert isinstance(v, (int, float))
        assert 0 <= v <= 100


# ----- funnel correctness -----

class TestFunnel:
    def test_monotonic_non_increasing(self, base_payload):
        stages = base_payload['stages']
        for i in range(1, len(stages)):
            prev_c = stages[i - 1]['count']
            curr_c = stages[i]['count']
            assert curr_c <= prev_c, (
                f"funnel broken at {stages[i]['key']}: {curr_c} > {prev_c}")

    def test_dropoff_first_is_none(self, base_payload):
        assert base_payload['stages'][0]['dropoff_pct_from_prev'] is None

    def test_dropoff_formula(self, base_payload):
        stages = base_payload['stages']
        for i in range(1, len(stages)):
            prev = stages[i - 1]['count']
            curr = stages[i]['count']
            got = stages[i]['dropoff_pct_from_prev']
            if not prev:
                assert got is None
            else:
                expected = round(100.0 * (prev - curr) / prev, 1)
                assert got == expected, (
                    f"stage {stages[i]['key']}: {got} != {expected}")

    def test_kyc_onward_le_withdraw(self, base_payload):
        m = {s['key']: s['count'] for s in base_payload['stages']}
        w = m['withdraw_initiated']
        for k in ('kyc_reached', 'proof_uploaded', 'pending_review', 'completed'):
            assert m[k] <= w, f"{k}({m[k]}) > withdraw_initiated({w})"


# ----- followup/stuck rules -----

class TestStuckAndFollowup:
    def test_stuck_hours_gt_72(self, base_payload):
        for u in base_payload['stuck_users']:
            assert u['hours_in_stage'] > 72, f"stuck has {u['hours_in_stage']}"

    def test_followup_hours_in_band(self, base_payload):
        for u in base_payload['followup_users']:
            h = u['hours_in_stage']
            stage = u.get('stage')
            if stage == 'pending_review':
                assert 24 <= h <= 72, f"pending followup {h}"
            elif stage == 'withdraw_initiated':
                assert 24 <= h <= 168, f"withdraw followup {h}"
            else:
                pytest.fail(f"unexpected followup stage: {stage}")

    def test_no_mongo_id(self, base_payload):
        # ensure ObjectId not leaked
        for key in ('stuck_users', 'followup_users', 'recent_active'):
            for u in base_payload[key]:
                assert '_id' not in u


# ----- filter tests -----

class TestFilters:
    def test_filter_country_spain(self, api, admin_headers, base_payload):
        r = api.get(f"{BASE_URL}/api/admin/journey-analytics",
                    params={'country': 'España'}, headers=admin_headers, timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert data['filters']['country'] == 'España'
        # total_users should be <= unfiltered
        assert data['total_users'] <= base_payload['total_users']
        # by_country should now only contain 'España' (or "Sin país" if any of the
        # filtered users have null country_name) — but every row must NOT be
        # some unrelated country
        for c in data['by_country']:
            assert c['country'] in ('España', 'Sin país'), \
                f"unexpected country leaked: {c['country']}"

    def test_filter_method_crypto(self, api, admin_headers, base_payload):
        r = api.get(f"{BASE_URL}/api/admin/journey-analytics",
                    params={'method': 'crypto'}, headers=admin_headers, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert d['filters']['method'] == 'crypto'
        # Stage counts from withdraw onward must be <= unfiltered counterparts
        base_m = {s['key']: s['count'] for s in base_payload['stages']}
        new_m = {s['key']: s['count'] for s in d['stages']}
        for k in ('withdraw_initiated', 'proof_uploaded',
                  'pending_review', 'completed'):
            assert new_m[k] <= base_m[k], f"{k} increased with crypto filter"

    def test_filter_status_completed(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/journey-analytics",
                    params={'status': 'completed'}, headers=admin_headers, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert d['filters']['status'] == 'completed'
        # by_status must contain only 'completed'
        statuses = {row['status'] for row in d['by_status']}
        assert statuses.issubset({'completed'}), \
            f"by_status leaked: {statuses}"

    def test_filter_days_7_cutoff(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/journey-analytics",
                    params={'days': 7}, headers=admin_headers, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert d['filters']['days'] == 7
        cutoff = datetime.fromisoformat(d['cutoff'])
        # allow 1-min skew
        now = datetime.now(timezone.utc)
        diff = (now - cutoff).total_seconds() / 86400.0
        assert 6.9 <= diff <= 7.1, f"cutoff days mismatch: {diff}"
        for u in d['recent_active']:
            la_raw = u.get('last_active')
            if not la_raw:
                continue
            la = la_raw if hasattr(la_raw, 'isoformat') else datetime.fromisoformat(
                str(la_raw).replace('Z', '+00:00'))
            if la.tzinfo is None:
                la = la.replace(tzinfo=timezone.utc)
            assert la >= cutoff - timedelta(minutes=1), \
                f"recent_active {u.get('user_id')} la={la} < cutoff={cutoff}"
