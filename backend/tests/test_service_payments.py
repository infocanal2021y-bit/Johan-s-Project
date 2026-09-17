"""Tests for Stripe service payments integration."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # fallback: read frontend .env directly
    with open('/app/frontend/.env') as f:
        for ln in f:
            if ln.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = ln.split('=', 1)[1].strip().rstrip('/')

USER_EMAIL = 'manclic@yahoo.es'
USER_PASS = 'FX2026'
ADMIN_EMAIL = 'info@paylionsbit.es'
ADMIN_PASS = 'Juan1949.'


def _login(email, password):
    r = requests.post(f'{BASE_URL}/api/auth/login',
                      json={'email': email, 'password': password}, timeout=30)
    assert r.status_code == 200, f'login failed: {r.status_code} {r.text}'
    data = r.json()
    if data.get('requires_2fa'):
        # get code from logs
        time.sleep(2)
        import subprocess
        out = subprocess.check_output(
            "grep 'ADMIN 2FA code' /var/log/supervisor/backend.*.log | tail -1",
            shell=True).decode()
        code = ''.join(ch for ch in out.split('code')[-1] if ch.isdigit())[:6]
        r2 = requests.post(f'{BASE_URL}/api/auth/verify-2fa',
                           json={'challenge_id': data['challenge_id'], 'code': code}, timeout=30)
        assert r2.status_code == 200, r2.text
        return r2.json()['token']
    return data['token']


@pytest.fixture(scope='module')
def user_token():
    return _login(USER_EMAIL, USER_PASS)


@pytest.fixture(scope='module')
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope='module')
def uh(user_token):
    return {'Authorization': f'Bearer {user_token}'}


@pytest.fixture(scope='module')
def ah(admin_token):
    return {'Authorization': f'Bearer {admin_token}'}


# ────── Catalog ──────
def test_catalog_has_services(uh):
    r = requests.get(f'{BASE_URL}/api/service-payments/catalog', headers=uh, timeout=30)
    assert r.status_code == 200, r.text
    services = r.json()['services']
    keys = {s['lookup_key'] for s in services}
    expected = {'cert_bancario_eur', 'cert_bancario_usd', 'gestion_documental_eur',
                'gestion_documental_usd', 'abono_special45_eur', 'abono_btc_eur'}
    missing = expected - keys
    assert not missing, f'missing lookup_keys: {missing}. Got: {keys}'
    # spot check prices
    by_key = {s['lookup_key']: s for s in services}
    assert by_key['cert_bancario_eur']['amount'] == 2500
    assert by_key['cert_bancario_eur']['currency'] == 'eur'
    assert by_key['abono_special45_eur']['amount'] == 180000
    assert by_key['abono_btc_eur']['amount'] == 485000


def test_catalog_requires_auth():
    r = requests.get(f'{BASE_URL}/api/service-payments/catalog', timeout=30)
    assert r.status_code in (401, 403), r.status_code


# ────── Checkout ──────
def test_checkout_creates_session(uh):
    r = requests.post(f'{BASE_URL}/api/service-payments/checkout',
                      headers=uh, timeout=30,
                      json={'lookup_key': 'cert_bancario_eur',
                            'origin_url': BASE_URL})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d['session_id'].startswith('cs_test_')
    assert 'checkout.stripe.com' in d['checkout_url']
    # persist session_id for later
    pytest._svp_session = d['session_id']  # type: ignore
    pytest._svp_url = d['checkout_url']  # type: ignore


def test_checkout_status_pending(uh):
    sid = getattr(pytest, '_svp_session', None)
    if not sid:
        pytest.skip('no session id')
    r = requests.get(f'{BASE_URL}/api/payments/status/{sid}', timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d['payment_status'] in ('pending', 'paid'), d


def test_checkout_invalid_lookup(uh):
    r = requests.post(f'{BASE_URL}/api/service-payments/checkout',
                      headers=uh, timeout=30,
                      json={'lookup_key': 'does_not_exist_xxx',
                            'origin_url': BASE_URL})
    assert r.status_code == 400, r.status_code


def test_checkout_requires_auth():
    r = requests.post(f'{BASE_URL}/api/service-payments/checkout',
                     json={'lookup_key': 'cert_bancario_eur', 'origin_url': BASE_URL}, timeout=30)
    assert r.status_code in (401, 403)


# ────── Webhook ──────
def test_webhook_invalid_signature():
    r = requests.post(f'{BASE_URL}/api/stripe/webhook',
                      headers={'stripe-signature': 'bad', 'Content-Type': 'application/json'},
                      data=b'{}', timeout=30)
    assert r.status_code == 400, r.status_code


# ────── Admin ──────
def test_admin_service_payments_lists(ah):
    r = requests.get(f'{BASE_URL}/api/admin/service-payments', headers=ah, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert 'transactions' in d and 'counts' in d and 'total_paid_eur_cents' in d and 'catalog' in d
    assert all(k in d['counts'] for k in ('pending', 'paid', 'failed', 'expired', 'refunded'))


def test_admin_service_payments_forbidden_for_user(uh):
    r = requests.get(f'{BASE_URL}/api/admin/service-payments', headers=uh, timeout=30)
    assert r.status_code == 403


def test_admin_add_service_and_duplicate(ah):
    body = {'name': 'Test Servicio QA', 'lookup_key': 'test_qa_eur',
            'amount_cents': 1000, 'currency': 'eur'}
    r = requests.post(f'{BASE_URL}/api/admin/service-payments/catalog',
                      headers=ah, json=body, timeout=30)
    # first time might be 200 or 409 if already created in previous run
    assert r.status_code in (200, 409), r.text
    # duplicate → 409
    r2 = requests.post(f'{BASE_URL}/api/admin/service-payments/catalog',
                       headers=ah, json=body, timeout=30)
    assert r2.status_code == 409, r2.status_code

    # confirm shows in catalog
    cat = requests.get(f'{BASE_URL}/api/service-payments/catalog',
                       headers={'Authorization': ah['Authorization']}, timeout=30).json()['services']
    assert any(s['lookup_key'] == 'test_qa_eur' for s in cat)


def test_admin_refund_on_non_paid(ah):
    sid = getattr(pytest, '_svp_session', None)
    if not sid:
        pytest.skip('no session id')
    r = requests.post(f'{BASE_URL}/api/admin/service-payments/{sid}/refund',
                      headers=ah, timeout=30)
    assert r.status_code == 400, r.status_code


# ────── Regression ──────
def test_regression_bank_withdrawal(uh):
    r = requests.get(f'{BASE_URL}/api/bank-withdrawal/config', headers=uh, timeout=30)
    assert r.status_code == 200


def test_regression_special45(uh):
    r = requests.get(f'{BASE_URL}/api/special45/config', headers=uh, timeout=30)
    assert r.status_code == 200
