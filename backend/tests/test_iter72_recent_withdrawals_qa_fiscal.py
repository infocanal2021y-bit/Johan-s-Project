"""Iter72 backend regression tests.

Covers:
  - GET /api/community/recent-withdrawals/detailed (currency rule, shape).
  - POST /api/admin/withdrawal-questions/{id}/feature (toggle + 400 without reply).
  - Featured questions ordering + public payload has no admin identity.
  - GET /api/transactions/{tx_id}/requirements fiscal item (optional, not in total).
  - 3-question-per-withdrawal limit still enforced (429 on 4th).
"""
import os
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / 'frontend' / '.env')
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
assert BASE_URL, 'REACT_APP_BACKEND_URL must be set'
API = f"{BASE_URL}/api"

ADMIN_EMAIL = 'admi@paylionsbit.es'
ADMIN_PASSWORD = 'LionsBit2026!'
USER_EMAIL = 'manclic@yahoo.es'
USER_PASSWORD = 'FX2026'
KNOWN_COMPLETED_WD = '7381add7-b3f2-4de0-8dc0-69958cb8b621'
KNOWN_FEATURED_Q = '70ff4ef8-ebb6-4290-8a2e-f5e3c86ce732'


# ─── Fixtures ─────────────────────────────────────────────────────────

def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={'email': email, 'password': password}, timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text[:200]}"
    tok = r.json().get('token')
    assert tok, r.json()
    return tok


@pytest.fixture(scope='module')
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope='module')
def user_token():
    return _login(USER_EMAIL, USER_PASSWORD)


@pytest.fixture(scope='module')
def admin_headers(admin_token):
    return {'Authorization': f'Bearer {admin_token}'}


@pytest.fixture(scope='module')
def user_headers(user_token):
    return {'Authorization': f'Bearer {user_token}'}


# ─── Recent withdrawals detailed ──────────────────────────────────────

class TestRecentWithdrawalsDetailed:
    def test_endpoint_shape(self, user_headers):
        r = requests.get(f"{API}/community/recent-withdrawals/detailed?limit=40",
                         headers=user_headers, timeout=20)
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert 'items' in j and 'count' in j and 'updated_at' in j
        assert isinstance(j['items'], list)
        if not j['items']:
            pytest.skip('no withdrawals in DB to validate')
        item = j['items'][0]
        for k in ('withdrawal_id', 'name_public', 'country', 'country_flag',
                  'amount', 'currency', 'stage', 'stage_index', 'reference',
                  'created_at', 'questions_count', 'questions_enabled'):
            assert k in item, f'missing {k}: {item}'
        assert item['stage'] in ('solicitado', 'en_revision', 'procesado', 'completado')
        assert 1 <= item['stage_index'] <= 4

    def test_currency_rule_spain_mx_chile(self, user_headers):
        r = requests.get(f"{API}/community/recent-withdrawals/detailed?limit=100",
                         headers=user_headers, timeout=20)
        assert r.status_code == 200
        items = r.json()['items']
        for it in items:
            c = (it.get('country') or '').lower()
            if 'espa' in c or c == 'spain':
                assert it['currency'] == 'EUR', f"spain must be EUR: {it}"
            elif c in ('mexico', 'méxico', 'chile'):
                assert it['currency'] == 'USD', f"MX/CL must be USD: {it}"

    def test_known_completed_present(self, user_headers):
        r = requests.get(f"{API}/community/recent-withdrawals/detailed?limit=100",
                         headers=user_headers, timeout=20)
        items = r.json()['items']
        match = [i for i in items if i['withdrawal_id'] == KNOWN_COMPLETED_WD]
        if not match:
            pytest.skip('known completed withdrawal not in top 100')
        assert match[0]['stage'] == 'completado'
        assert match[0]['stage_index'] == 4
        assert match[0]['questions_enabled'] is True


# ─── Feature toggle + public payload ──────────────────────────────────

class TestFeatureToggle:
    def test_feature_toggle_known_answered_question(self, admin_headers):
        # Toggle off (was featured) then back on to leave state unchanged.
        r1 = requests.post(f"{API}/admin/withdrawal-questions/{KNOWN_FEATURED_Q}/feature",
                           headers=admin_headers, timeout=20)
        assert r1.status_code == 200, r1.text[:200]
        v1 = r1.json()['featured']
        r2 = requests.post(f"{API}/admin/withdrawal-questions/{KNOWN_FEATURED_Q}/feature",
                           headers=admin_headers, timeout=20)
        assert r2.status_code == 200
        v2 = r2.json()['featured']
        assert v1 != v2, 'toggle should flip'

    def test_feature_requires_reply_400(self, admin_headers, user_headers):
        # Create a fresh pending (no reply) question on KNOWN_COMPLETED_WD → try to feature → expect 400.
        payload = {'withdrawal_id': KNOWN_COMPLETED_WD,
                   'message': f'TEST_iter72 pregunta sin respuesta {uuid.uuid4().hex[:6]}'}
        r = requests.post(f"{API}/recent-withdrawals/questions",
                          headers=user_headers, json=payload, timeout=20)
        if r.status_code == 429:
            pytest.skip('user has hit 3-question limit on this withdrawal')
        assert r.status_code == 200, r.text[:200]
        qid = r.json()['question']['question_id']
        rf = requests.post(f"{API}/admin/withdrawal-questions/{qid}/feature",
                           headers=admin_headers, timeout=20)
        assert rf.status_code == 400, f"expected 400, got {rf.status_code}: {rf.text[:200]}"
        # cleanup: hide it
        requests.post(f"{API}/admin/withdrawal-questions/{qid}/hide",
                      headers=admin_headers, timeout=20)


# ─── Public questions list: featured first, no admin identity ─────────

class TestQuestionsListPublic:
    def test_featured_first_and_public_reply_shape(self, user_headers):
        r = requests.get(f"{API}/recent-withdrawals/{KNOWN_COMPLETED_WD}/questions",
                         headers=user_headers, timeout=20)
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert 'questions' in j and 'my_count' in j and 'my_remaining' in j
        qs = j['questions']
        assert isinstance(qs, list)
        featured = [q for q in qs if q.get('featured')]
        if featured:
            # featured must appear before non-featured
            first_non_feat = next((i for i, q in enumerate(qs) if not q.get('featured')), len(qs))
            last_feat = max(i for i, q in enumerate(qs) if q.get('featured'))
            assert last_feat < first_non_feat, 'featured questions must be listed first'
        # Ensure no admin identity leaked in any reply and shape is trimmed.
        for q in qs:
            reply = q.get('reply')
            if reply:
                assert set(reply.keys()) == {'message', 'created_at'}, f'reply leaks fields: {reply.keys()}'
                low = (reply['message'] or '').lower()
                # We can't assert message text (users type freely), but the payload keys must not include admin_id/name.
                assert 'admin_id' not in reply
            assert 'admin_id' not in q


# ─── Requirements: fiscal item is optional & not in total ─────────────

class TestFiscalRequirement:
    def test_known_completed_wd_owner_requirements(self, admin_headers):
        # Admin owns one withdraw tx — use it as the owner-scoped requirements target.
        r = requests.get(f"{API}/transactions?transaction_type=withdraw",
                         headers=admin_headers, timeout=20)
        if r.status_code != 200:
            pytest.skip(f'cannot list admin transactions: {r.status_code}')
        rows = r.json() if isinstance(r.json(), list) else r.json().get('transactions') or r.json().get('items') or []
        wds = [t for t in rows if t.get('transaction_type') == 'withdraw']
        if not wds:
            pytest.skip('admin has no withdrawal transactions')
        tx_id = wds[0].get('id') or wds[0].get('transaction_id')
        rr = requests.get(f"{API}/transactions/{tx_id}/requirements",
                          headers=admin_headers, timeout=20)
        if rr.status_code in (403, 404):
            pytest.skip(f'admin cannot access owner-scoped requirements ({rr.status_code})')
        assert rr.status_code == 200, rr.text[:200]
        data = rr.json()
        assert 'items' in data and 'all_met' in data and 'completed_count' in data and 'total' in data
        fiscal = [i for i in data['items'] if i.get('key') == 'fiscal']
        assert len(fiscal) == 1, f"fiscal item missing: {data['items']}"
        fi = fiscal[0]
        assert fi.get('optional') is True
        assert fi.get('state') in ('pending', 'in_review', 'accepted', 'rejected')
        # total counts only blocking items → must equal 7 (identity, bank, docs, required_amount, proof, validated, admin_review)
        assert data['total'] == 7, f"total must be 7 blocking items, got {data['total']}: labels={[i.get('key') for i in data['items']]}"
        # completed_count must not include fiscal
        blocking_done = sum(1 for i in data['items'] if not i.get('optional') and i.get('done'))
        assert data['completed_count'] == blocking_done


# ─── 3-question limit ─────────────────────────────────────────────────

class TestQuestionLimit:
    def test_limit_returns_429_on_fourth(self, user_headers):
        # Create a synthetic-safe withdrawal_id? We'll use KNOWN_COMPLETED_WD.
        # Check current count first
        lr = requests.get(f"{API}/recent-withdrawals/{KNOWN_COMPLETED_WD}/questions",
                          headers=user_headers, timeout=20)
        assert lr.status_code == 200
        my_count = lr.json()['my_count']
        remaining = max(0, 3 - my_count)
        # Attempt to bring user to 3 then expect 429 on next
        for _ in range(remaining):
            r = requests.post(f"{API}/recent-withdrawals/questions",
                              headers=user_headers,
                              json={'withdrawal_id': KNOWN_COMPLETED_WD,
                                    'message': f'TEST_iter72 limit {uuid.uuid4().hex[:6]}'}, timeout=20)
            assert r.status_code == 200, r.text[:200]
        # Now the next one must be 429
        r429 = requests.post(f"{API}/recent-withdrawals/questions",
                             headers=user_headers,
                             json={'withdrawal_id': KNOWN_COMPLETED_WD,
                                   'message': 'TEST_iter72 must be 429'}, timeout=20)
        assert r429.status_code == 429, f'expected 429, got {r429.status_code}: {r429.text[:200]}'
        # Verify my_count reflects state
        lr2 = requests.get(f"{API}/recent-withdrawals/{KNOWN_COMPLETED_WD}/questions",
                           headers=user_headers, timeout=20)
        assert lr2.status_code == 200
        assert lr2.json()['my_count'] >= 3
        assert lr2.json()['my_remaining'] == 0
