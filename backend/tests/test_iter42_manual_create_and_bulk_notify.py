"""Iteration 42 — manual user creation + bulk-notify-by-health + provisioning regression."""
import os
import time
import uuid
import requests
import pytest
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # fallback: read from frontend env
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
ADMIN_EMAIL = 'admi@paylionsbit.es'
ADMIN_PASSWORD = 'LionsBit2026!'

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]


@pytest.fixture(scope='module')
def admin_token():
    r = requests.post(f'{BASE_URL}/api/auth/login',
                      json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json().get('access_token') or r.json().get('token')


@pytest.fixture(scope='module')
def auth_h(admin_token):
    return {'Authorization': f'Bearer {admin_token}'}


# ---------- Cleanup of test users (created during this run) ----------
CREATED_EMAILS = []

def _cleanup():
    for email in CREATED_EMAILS:
        u = db.users.find_one({'email': email})
        if not u:
            continue
        uid = u['id']
        if email == ADMIN_EMAIL:
            continue  # never delete admin
        db.users.delete_one({'id': uid})
        db.accounts.delete_many({'user_id': uid})
        db.transactions.delete_many({'user_id': uid})
        db.crypto_wallets_sim.delete_many({'user_id': uid})
        db.notifications.delete_many({'user_id': uid})


@pytest.fixture(scope='module', autouse=True)
def cleanup_at_end():
    yield
    _cleanup()


# ---------- 1. Health column regression ----------
def test_admin_users_health_regression(auth_h):
    r = requests.get(f'{BASE_URL}/api/admin/users', headers=auth_h, timeout=30)
    assert r.status_code == 200
    users = r.json()
    assert isinstance(users, list) and len(users) >= 1
    for u in users:
        h = u.get('health')
        assert h, f"missing health on {u.get('email')}"
        assert h['level'] in ('green', 'yellow', 'red')
        assert isinstance(h['reasons'], list)
        for k in ('has_checking', 'has_savings', 'verified', 'logged_in',
                  'must_change_password', 'suspended'):
            assert k in h['flags']


def test_admin_balance_intact(auth_h):
    r = requests.get(f'{BASE_URL}/api/admin/users', headers=auth_h, timeout=30)
    admin = next((u for u in r.json() if u.get('email') == ADMIN_EMAIL), None)
    assert admin, 'admin missing'
    assert admin.get('total_balance_eur', 0) >= 70000


# ---------- 2. Manual create endpoint ----------
def test_manual_create_provisions_full_finance(auth_h):
    email = f'TEST_manual_{uuid.uuid4().hex[:8]}@example.com'
    CREATED_EMAILS.append(email)
    payload = {
        'name': 'Test Manual User',
        'email': email,
        'phone': '+34600000000',
        'country_code': 'ES',
        'country_name': 'Spain',
        'seed_balance_eur': 1000,
        'seed_balance_usd': 500,
        'role': 'user',
    }
    r = requests.post(f'{BASE_URL}/api/admin/users/manual-create',
                      json=payload, headers=auth_h, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    user_id = body['user_id']
    assert body.get('temporary_password') == 'lionsbit2.0'
    p = body['provisioned']
    assert p['checking_id'] and p['savings_id'] and p['wallet_id']

    # DB regression — wallet, transaction, kyc fields
    user_doc = db.users.find_one({'id': user_id})
    assert user_doc['kyc_status'] == 'pending'
    assert user_doc['verification_status'] == 'unverified'
    assert user_doc['must_change_password'] is True
    wallet = db.crypto_wallets_sim.find_one({'user_id': user_id})
    assert wallet and wallet.get('assets') == []
    opening = list(db.transactions.find({'user_id': user_id, 'transaction_type': 'account_opening'}))
    assert len(opening) == 1 and opening[0]['status'] == 'completed'

    # balance-summary on new user — must NOT 404
    r2 = requests.get(f'{BASE_URL}/api/admin/users/{user_id}/balance-summary',
                      headers=auth_h, timeout=20)
    assert r2.status_code == 200, r2.text
    bs = r2.json()
    for k in ('total_balance', 'available_balance', 'invested_balance', 'withdrawal_status'):
        assert k in bs
    assert bs['available_balance'] >= 1000  # seeded EUR

    # checking has seed_balance_usd applied
    checking = db.accounts.find_one({'user_id': user_id, 'account_type': 'checking'})
    assert checking['balance_eur'] == 1000.0
    assert checking['balance_usd'] == 500.0


def test_manual_create_duplicate_email_400(auth_h):
    payload = {'name': 'dup', 'email': ADMIN_EMAIL}
    r = requests.post(f'{BASE_URL}/api/admin/users/manual-create',
                      json=payload, headers=auth_h, timeout=20)
    assert r.status_code == 400


# ---------- 3. Idempotency: backfill should not re-provision the new user ----------
def test_backfill_idempotency_after_manual_create(auth_h):
    email = f'TEST_backfill_{uuid.uuid4().hex[:8]}@example.com'
    CREATED_EMAILS.append(email)
    r = requests.post(f'{BASE_URL}/api/admin/users/manual-create',
                      json={'name': 'BF', 'email': email}, headers=auth_h, timeout=30)
    assert r.status_code == 200
    user_id = r.json()['user_id']
    rb = requests.post(f'{BASE_URL}/api/admin/backfill-accounts', headers=auth_h, timeout=60)
    assert rb.status_code == 200
    body = rb.json()
    # The new user already had checking + savings → must contribute to already_complete
    assert body['already_complete'] >= 1
    # No duplicate accounts
    assert db.accounts.count_documents({'user_id': user_id, 'account_type': 'checking'}) == 1
    assert db.accounts.count_documents({'user_id': user_id, 'account_type': 'savings'}) == 1


# ---------- 4. Bulk notify by health ----------
def test_bulk_notify_invalid_level(auth_h):
    r = requests.post(f'{BASE_URL}/api/admin/users/bulk-notify-by-health',
                      json={'level': 'blue', 'subject': 'x'}, headers=auth_h, timeout=20)
    assert r.status_code == 400


def test_bulk_notify_empty_subject(auth_h):
    r = requests.post(f'{BASE_URL}/api/admin/users/bulk-notify-by-health',
                      json={'level': 'yellow', 'subject': '   '}, headers=auth_h, timeout=20)
    assert r.status_code == 400


def test_bulk_notify_dry_run_excludes_admin(auth_h):
    r = requests.post(f'{BASE_URL}/api/admin/users/bulk-notify-by-health',
                      json={'level': 'yellow', 'subject': 'Test', 'dry_run': True},
                      headers=auth_h, timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert 'count' in body and 'sample' in body
    assert all(s.get('email') != ADMIN_EMAIL for s in body['sample'])


def test_bulk_notify_yellow_sends_and_creates_notifications(auth_h):
    # Capture pre-count of yellow-bucket notifications subject
    subj = f'TEST_iter42_{uuid.uuid4().hex[:6]}'
    pre = db.notifications.count_documents({'title': subj})
    assert pre == 0
    r = requests.post(f'{BASE_URL}/api/admin/users/bulk-notify-by-health',
                      json={'level': 'yellow', 'subject': subj, 'intro': 'Hola'},
                      headers=auth_h, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['level'] == 'yellow'
    assert body['target_count'] == body['sent'] + body['failed']
    # In-app notifications match sent
    time.sleep(0.5)
    post = db.notifications.count_documents({'title': subj})
    assert post == body['sent']
    # Admin should not appear in receiver list
    admin_user = db.users.find_one({'email': ADMIN_EMAIL})
    assert db.notifications.count_documents({'title': subj, 'user_id': admin_user['id']}) == 0


# ---------- 5. /auth/register regression: full provisioning ----------
def test_auth_register_provisions_full_finance():
    email = f'TEST_register_{uuid.uuid4().hex[:8]}@example.com'
    CREATED_EMAILS.append(email)
    payload = {
        'name': 'Reg Test', 'email': email, 'password': 'Passw0rd!23',
        'phone': '+34600000111', 'country_code': 'ES', 'country_name': 'Spain'
    }
    r = requests.post(f'{BASE_URL}/api/auth/register', json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    user = db.users.find_one({'email': email})
    assert user
    uid = user['id']
    assert db.accounts.count_documents({'user_id': uid, 'account_type': 'checking'}) == 1
    assert db.accounts.count_documents({'user_id': uid, 'account_type': 'savings'}) == 1
    assert db.crypto_wallets_sim.count_documents({'user_id': uid}) == 1
    assert db.transactions.count_documents(
        {'user_id': uid, 'transaction_type': 'account_opening'}) == 1
