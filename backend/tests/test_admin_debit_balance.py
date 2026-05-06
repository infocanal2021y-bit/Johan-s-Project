"""
Tests for admin debit-balance feature + admin transactions audit endpoint.
Covers: POST /api/admin/debit-balance and GET /api/admin/users/{uid}/admin-transactions
Also regression-tests POST /api/admin/add-balance (credit).
"""
import os
import pytest
import requests
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://compliance-dash-32.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = 'admi@paylionsbit.es'
ADMIN_PASSWORD = 'LionsBit2026!'
TEST_USER_ID_WITH_BALANCE = 'dea201c1-940b-4ae6-9dc7-403581ebebb9'  # Test User


@pytest.fixture(scope='module')
def admin_token():
    r = requests.post(f'{BASE_URL}/api/auth/login', json={
        'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD
    }, timeout=30)
    assert r.status_code == 200, f'Admin login failed: {r.status_code} {r.text}'
    tok = r.json().get('token') or r.json().get('access_token')
    assert tok, f'No token in login response: {r.json()}'
    return tok


@pytest.fixture(scope='module')
def admin_headers(admin_token):
    return {'Authorization': f'Bearer {admin_token}', 'Content-Type': 'application/json'}


# ---------- Validation tests ----------
class TestDebitValidation:
    def test_reject_missing_reason(self, admin_headers):
        r = requests.post(f'{BASE_URL}/api/admin/debit-balance', headers=admin_headers, json={
            'user_id': TEST_USER_ID_WITH_BALANCE, 'amount': 1, 'currency': 'USD'
        })
        assert r.status_code in (400, 422), f'expected 4xx, got {r.status_code}: {r.text}'

    def test_reject_short_reason(self, admin_headers):
        r = requests.post(f'{BASE_URL}/api/admin/debit-balance', headers=admin_headers, json={
            'user_id': TEST_USER_ID_WITH_BALANCE, 'amount': 1, 'currency': 'USD', 'reason': 'ab'
        })
        assert r.status_code in (400, 422), f'expected 4xx, got {r.status_code}: {r.text}'

    def test_reject_invalid_currency(self, admin_headers):
        r = requests.post(f'{BASE_URL}/api/admin/debit-balance', headers=admin_headers, json={
            'user_id': TEST_USER_ID_WITH_BALANCE, 'amount': 1, 'currency': 'GBP',
            'reason': 'test invalid currency'
        })
        assert r.status_code == 400
        assert 'Moneda' in r.text or 'invalid' in r.text.lower()

    def test_reject_user_not_found(self, admin_headers):
        r = requests.post(f'{BASE_URL}/api/admin/debit-balance', headers=admin_headers, json={
            'user_id': 'non-existent-id-xyz', 'amount': 1, 'currency': 'USD',
            'reason': 'debit for non existent user'
        })
        assert r.status_code == 404

    def test_requires_admin_auth(self):
        r = requests.post(f'{BASE_URL}/api/admin/debit-balance', json={
            'user_id': TEST_USER_ID_WITH_BALANCE, 'amount': 1, 'currency': 'USD',
            'reason': 'no auth test'
        })
        assert r.status_code in (401, 403)


# ---------- Successful debit flow ----------
class TestDebitSuccess:
    def test_debit_and_verify_audit_trail(self, admin_headers):
        # Get balance before via admin-transactions endpoint + user account
        before_txs = requests.get(
            f'{BASE_URL}/api/admin/users/{TEST_USER_ID_WITH_BALANCE}/admin-transactions',
            headers=admin_headers
        )
        assert before_txs.status_code == 200, before_txs.text
        before_data = before_txs.json()
        before_debit_usd = before_data['totals']['debit_usd']
        before_count = len(before_data['transactions'])

        # Perform debit
        reason = 'Regression test debit by automated QA'
        amount = 5.0
        r = requests.post(f'{BASE_URL}/api/admin/debit-balance', headers=admin_headers, json={
            'user_id': TEST_USER_ID_WITH_BALANCE,
            'amount': amount,
            'currency': 'USD',
            'reason': reason,
            'notify_user': True,
        })
        assert r.status_code == 200, f'debit failed: {r.status_code} {r.text}'
        body = r.json()
        assert body['amount'] == amount
        assert body['currency'] == 'USD'
        assert body['reason'] == reason
        assert 'transaction_id' in body
        assert 'transaction_reference' in body
        assert body['balance_after'] == body['balance_before'] - amount

        # Verify audit-trail endpoint reflects the new debit
        time.sleep(1)
        after_txs = requests.get(
            f'{BASE_URL}/api/admin/users/{TEST_USER_ID_WITH_BALANCE}/admin-transactions',
            headers=admin_headers
        )
        assert after_txs.status_code == 200
        after_data = after_txs.json()
        assert len(after_data['transactions']) == before_count + 1
        assert after_data['totals']['debit_usd'] >= before_debit_usd + amount - 0.001

        # First transaction should be the newest (desc sort) and should be our debit
        newest = after_data['transactions'][0]
        assert newest['transaction_type'] == 'admin_debit'
        assert newest['reason'] == reason
        assert newest['amount'] == amount

    def test_insufficient_funds(self, admin_headers):
        # Use a huge amount - safe to assume no user has 10^12 USD
        r = requests.post(f'{BASE_URL}/api/admin/debit-balance', headers=admin_headers, json={
            'user_id': TEST_USER_ID_WITH_BALANCE, 'amount': 1_000_000_000_000.0,
            'currency': 'USD', 'reason': 'insufficient funds probe'
        })
        assert r.status_code == 400
        assert 'insuficientes' in r.text.lower() or 'insufficient' in r.text.lower()


# ---------- Admin-transactions endpoint ----------
class TestAdminTransactions:
    def test_structure_and_sorting(self, admin_headers):
        r = requests.get(
            f'{BASE_URL}/api/admin/users/{TEST_USER_ID_WITH_BALANCE}/admin-transactions',
            headers=admin_headers
        )
        assert r.status_code == 200
        data = r.json()
        assert 'user' in data and 'transactions' in data and 'totals' in data
        assert set(['credit_usd', 'credit_eur', 'debit_usd', 'debit_eur']).issubset(data['totals'].keys())
        # Ensure descending sort by created_at
        txs = data['transactions']
        if len(txs) >= 2:
            assert txs[0]['created_at'] >= txs[1]['created_at']
        # No mongo _id leaks
        for tx in txs:
            assert '_id' not in tx
        # Entries are only admin_credit or admin_debit
        for tx in txs:
            assert tx['transaction_type'] in ('admin_credit', 'admin_debit')

    def test_user_not_found(self, admin_headers):
        r = requests.get(
            f'{BASE_URL}/api/admin/users/nope-xyz-123/admin-transactions',
            headers=admin_headers
        )
        assert r.status_code == 404


# ---------- Credit regression ----------
class TestCreditRegression:
    def test_add_balance_still_works(self, admin_headers):
        r = requests.post(f'{BASE_URL}/api/admin/add-balance', headers=admin_headers, json={
            'user_id': TEST_USER_ID_WITH_BALANCE,
            'amount': 1.0,
            'currency': 'USD',
            'description': 'Regression credit by QA'
        })
        assert r.status_code == 200, r.text
