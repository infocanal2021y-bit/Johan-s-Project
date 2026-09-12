"""Retiro Especial +45 — backend tests.

Covers: config eligibility gates, initiate validations (amount, DOB, IBAN, BTC,
verified, single active), ownership mismatch flow, admin approval rule,
holder-match flow, abono, admin list, admin RBAC, regression on bank/btc
withdrawals endpoints.
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

USER_EMAIL = 'manclic@yahoo.es'
USER_PASSWORD = 'FX2026'
ADMIN_EMAIL = 'info@paylionsbit.es'
ADMIN_PASSWORD = 'Juan1949.'

VALID_IBAN = 'ES9121000418450200051332'
VALID_BTC = '1CzpZ62XwYA1wf72qSjffqCVCqX7PhPVbd'


# ─── Mongo fixtures (elevate then restore) ────────────────────────────────
@pytest.fixture(scope='module')
def mongo():
    c = MongoClient(MONGO_URL)
    return c[DB_NAME]


@pytest.fixture(scope='module')
def original_manclic(mongo):
    u = mongo.users.find_one({'email': USER_EMAIL})
    assert u, 'manclic user missing'
    original = {
        'verification_status': u.get('verification_status'),
        'kyc_status': u.get('kyc_status'),
    }
    yield {**original, 'id': u['id'], 'name': u.get('name')}
    # Restore
    mongo.users.update_one({'email': USER_EMAIL}, {'$set': original})
    # Cleanup requests + notifications created in tests
    mongo.special45_requests.delete_many({'user_id': u['id']})
    mongo.notifications.delete_many({'user_id': u['id'], 'data.type': 'special45'})


@pytest.fixture(scope='module')
def user_token(original_manclic, mongo):
    r = requests.post(f'{BASE_URL}/api/auth/login', json={'email': USER_EMAIL, 'password': USER_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f'user login failed: {r.status_code} {r.text[:200]}')
    return r.json()['token']


@pytest.fixture(scope='module')
def admin_token():
    r = requests.post(f'{BASE_URL}/api/auth/login', json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f'admin login failed: {r.status_code} {r.text[:200]}')
    return r.json()['token']


def _uh(t):
    return {'Authorization': f'Bearer {t}', 'Content-Type': 'application/json'}


# ─── 1. Gate: config while unverified ─────────────────────────────────────
def test_config_unverified_ineligible(user_token, mongo, original_manclic):
    # Ensure unverified state
    mongo.users.update_one({'email': USER_EMAIL},
                           {'$set': {'verification_status': 'unverified', 'kyc_status': 'pending'}})
    r = requests.get(f'{BASE_URL}/api/special45/config', headers=_uh(user_token))
    assert r.status_code == 200
    d = r.json()
    assert d['eligible'] is False
    assert any('verificado' in x.lower() for x in d['reasons'])
    assert any('kyc' in x.lower() for x in d['reasons'])
    assert d['fee_eur'] == 1800.0 and d['max_eur'] == 10000.0 and d['min_age'] == 45


# ─── Elevate manclic for the rest ──────────────────────────────────────────
@pytest.fixture(scope='module')
def elevated(mongo, original_manclic):
    mongo.users.update_one({'email': USER_EMAIL},
                           {'$set': {'verification_status': 'verified', 'kyc_status': 'approved'}})
    yield
    # (restore happens in original_manclic teardown)


def test_config_eligible_after_elevation(user_token, elevated):
    r = requests.get(f'{BASE_URL}/api/special45/config', headers=_uh(user_token))
    assert r.status_code == 200
    d = r.json()
    assert d['verified_ok'] is True and d['kyc_ok'] is True
    # eligible unless active request exists
    if not d.get('active_request'):
        assert d['eligible'] is True


# ─── 2. Initiate validations ───────────────────────────────────────────────
def test_initiate_amount_over_max(user_token, elevated, mongo, original_manclic):
    mongo.special45_requests.delete_many({'user_id': original_manclic['id']})
    r = requests.post(f'{BASE_URL}/api/special45/initiate', headers=_uh(user_token), json={
        'amount_eur': 10001, 'date_of_birth': '1975-01-01', 'destination_type': 'bank',
        'bank_holder': 'Javier Moya Andres', 'bank_iban': VALID_IBAN,
    })
    assert r.status_code == 400
    assert 'máximo' in r.text.lower() or 'maximum' in r.text.lower() or 'max' in r.text.lower()


def test_initiate_underage(user_token, elevated):
    r = requests.post(f'{BASE_URL}/api/special45/initiate', headers=_uh(user_token), json={
        'amount_eur': 100, 'date_of_birth': '2005-01-01', 'destination_type': 'bank',
        'bank_holder': 'Javier Moya Andres', 'bank_iban': VALID_IBAN,
    })
    assert r.status_code == 403


def test_initiate_invalid_dob(user_token, elevated):
    r = requests.post(f'{BASE_URL}/api/special45/initiate', headers=_uh(user_token), json={
        'amount_eur': 100, 'date_of_birth': 'not-a-date', 'destination_type': 'bank',
        'bank_holder': 'X', 'bank_iban': VALID_IBAN,
    })
    assert r.status_code == 400


def test_initiate_invalid_iban(user_token, elevated):
    r = requests.post(f'{BASE_URL}/api/special45/initiate', headers=_uh(user_token), json={
        'amount_eur': 100, 'date_of_birth': '1975-01-01', 'destination_type': 'bank',
        'bank_holder': 'Javier Moya Andres', 'bank_iban': 'NOT_AN_IBAN',
    })
    assert r.status_code == 400


def test_initiate_invalid_btc(user_token, elevated):
    r = requests.post(f'{BASE_URL}/api/special45/initiate', headers=_uh(user_token), json={
        'amount_eur': 100, 'date_of_birth': '1975-01-01', 'destination_type': 'btc',
        'btc_address': 'notavalidbtc',
    })
    assert r.status_code == 400


# ─── 3. Holder mismatch flow → pendiente_validacion ───────────────────────
@pytest.fixture(scope='module')
def mismatch_request(user_token, elevated, mongo, original_manclic):
    # Clean any leftover active
    mongo.special45_requests.delete_many({'user_id': original_manclic['id']})
    r = requests.post(f'{BASE_URL}/api/special45/initiate', headers=_uh(user_token), json={
        'amount_eur': 5000, 'date_of_birth': '1975-01-01', 'destination_type': 'bank',
        'bank_holder': 'Pedro García López', 'bank_iban': VALID_IBAN, 'bank_name': 'TEST_Bank',
    })
    assert r.status_code == 200, r.text
    req = r.json()['request']
    yield req
    mongo.special45_requests.delete_one({'id': req['id']})


def test_mismatch_sets_pendiente_validacion(mismatch_request):
    assert mismatch_request['status'] == 'pendiente_validacion'
    assert mismatch_request['ownership_validated'] is False


def test_second_active_returns_409(user_token, elevated, mismatch_request):
    r = requests.post(f'{BASE_URL}/api/special45/initiate', headers=_uh(user_token), json={
        'amount_eur': 100, 'date_of_birth': '1975-01-01', 'destination_type': 'bank',
        'bank_holder': 'Javier Moya Andres', 'bank_iban': VALID_IBAN,
    })
    assert r.status_code == 409


# ─── 4. Admin approval rule (cannot approve without ownership) ────────────
def test_admin_cannot_approve_without_ownership(admin_token, mismatch_request):
    r = requests.post(f'{BASE_URL}/api/admin/special45/{mismatch_request["id"]}/status',
                      headers=_uh(admin_token), json={'status': 'aprobado'})
    assert r.status_code == 400
    assert 'titularidad' in r.text.lower()


def test_admin_validate_ownership_then_approve_and_complete(admin_token, user_token, mismatch_request):
    rid = mismatch_request['id']
    # Validate ownership
    r = requests.post(f'{BASE_URL}/api/admin/special45/{rid}/validate-ownership',
                      headers=_uh(admin_token), json={'validated': True, 'note': 'TEST_ok', 'dob_verified': True})
    assert r.status_code == 200 and r.json()['status'] == 'en_revision'

    # Approve
    r = requests.post(f'{BASE_URL}/api/admin/special45/{rid}/status',
                      headers=_uh(admin_token), json={'status': 'aprobado'})
    assert r.status_code == 200

    # Complete
    r = requests.post(f'{BASE_URL}/api/admin/special45/{rid}/status',
                      headers=_uh(admin_token), json={'status': 'completado'})
    assert r.status_code == 200

    # Verify user notifications include an update
    n = requests.get(f'{BASE_URL}/api/notifications', headers=_uh(user_token))
    assert n.status_code == 200
    txt = n.text.lower()
    assert 'retiro especial +45' in txt or 'special45' in txt


# ─── 5. Holder matches → status 'solicitado' ──────────────────────────────
@pytest.fixture(scope='module')
def match_request(user_token, elevated, mongo, original_manclic, mismatch_request):
    # mismatch_request is completed → no active → can create new
    r = requests.post(f'{BASE_URL}/api/special45/initiate', headers=_uh(user_token), json={
        'amount_eur': 3000, 'date_of_birth': '1975-05-10', 'destination_type': 'bank',
        'bank_holder': 'Javier Moya Andres', 'bank_iban': VALID_IBAN,
    })
    assert r.status_code == 200, r.text
    req = r.json()['request']
    yield req
    mongo.special45_requests.delete_one({'id': req['id']})


def test_match_sets_solicitado(match_request):
    assert match_request['status'] == 'solicitado'
    assert match_request['ownership_validated'] is True


# ─── 6. Abono flow + mine ─────────────────────────────────────────────────
def test_submit_abono_and_mine(user_token, match_request):
    r = requests.post(f'{BASE_URL}/api/special45/{match_request["id"]}/submit-abono',
                      headers=_uh(user_token), json={'txid': 'TEST_TXID_abc123', 'message': 'TEST_msg'})
    assert r.status_code == 200
    m = requests.get(f'{BASE_URL}/api/special45/mine', headers=_uh(user_token))
    assert m.status_code == 200
    rows = m.json()['requests']
    mine_row = next((x for x in rows if x['id'] == match_request['id']), None)
    assert mine_row is not None
    assert mine_row['fee_informed'] is True
    assert mine_row['status_label']


# ─── 7. Admin list + counts ───────────────────────────────────────────────
def test_admin_list_has_counts(admin_token):
    r = requests.get(f'{BASE_URL}/api/admin/special45', headers=_uh(admin_token))
    assert r.status_code == 200
    d = r.json()
    assert 'requests' in d and 'counts' in d and 'statuses' in d
    assert isinstance(d['counts'], dict)


# ─── 8. Admin RBAC ────────────────────────────────────────────────────────
def test_admin_endpoint_forbidden_for_user(user_token):
    r = requests.get(f'{BASE_URL}/api/admin/special45', headers=_uh(user_token))
    assert r.status_code == 403


# ─── 9. Regression: existing withdrawal endpoints ─────────────────────────
def test_regression_btc_withdrawal_quote(user_token):
    # /api/btc-withdrawal/quote requires amount param — regression: endpoint responds (not 404/500)
    r = requests.get(f'{BASE_URL}/api/btc-withdrawal/quote?amount_eur=100', headers=_uh(user_token))
    assert r.status_code in (200, 400, 403, 422)


def test_regression_bank_withdrawal_initiate_validates(user_token):
    # Just check endpoint exists and validates something (not a 404/500)
    r = requests.post(f'{BASE_URL}/api/bank-withdrawal/initiate', headers=_uh(user_token), json={})
    assert r.status_code in (400, 403, 422)
