"""Iteration 85 — admin invitations, quick-onboard, resend, FX2026 env guard, withdrawal cancel email."""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://compliance-dash-32.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')
ADMIN_EMAIL = 'info@paylionsbit.es'
ADMIN_PASS = 'Juan1949.'
USER_EMAIL = 'manclic@yahoo.es'
USER_PASS = 'FX2026'


@pytest.fixture(scope='module')
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope='module')
def admin_token():
    r = requests.post(f"{API}/auth/login", json={'email': ADMIN_EMAIL, 'password': ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    if data.get('requires_2fa'):
        pytest.skip('Admin 2FA enabled, cannot run tests')
    return data['token']


@pytest.fixture(scope='module')
def user_token():
    r = requests.post(f"{API}/auth/login", json={'email': USER_EMAIL, 'password': USER_PASS}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()['token']


@pytest.fixture(scope='module')
def qa_emails():
    rand = uuid.uuid4().hex[:8]
    return {
        'invite': f"qa.invite.{rand}@example.com",
        'ui': f"qa.ui.{rand}@example.com",
        'rand': rand,
        'created_ids': [],
    }


def _h(tok):
    return {'Authorization': f'Bearer {tok}'}


# ============ Invitations list auth ============
def test_invitations_requires_admin(user_token):
    r = requests.get(f"{API}/admin/users/invitations", headers=_h(user_token), timeout=15)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


def test_invitations_list_shape(admin_token):
    r = requests.get(f"{API}/admin/users/invitations", headers=_h(admin_token), timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert 'count' in data and 'items' in data
    assert isinstance(data['items'], list)
    if data['items']:
        it = data['items'][0]
        for k in ('user_id', 'name', 'email', 'activation', 'token_state', 'invited_at'):
            assert k in it, f"missing field {k}"
        assert it['activation'] in ('activated', 'pending', 'expired')


# ============ Quick-onboard: create with send_email:false ============
def test_quick_onboard_creates_user(admin_token, qa_emails, mongo):
    body = {
        'users': [{'name': 'QA Test', 'email': qa_emails['invite'], 'phone': '+34 600 111 222'}],
        'send_email': False,
        'existing_policy': 'activation_link',
    }
    r = requests.post(f"{API}/admin/users/quick-onboard", headers=_h(admin_token), json=body, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data['created']) == 1
    c = data['created'][0]
    assert c['email'] == qa_emails['invite']
    assert c['temp_password'].startswith('PLB-')
    assert c['email_status'] == 'not_sent'
    qa_emails['temp_password'] = c['temp_password']
    qa_emails['user_id'] = c['id']
    qa_emails['created_ids'].append(c['id'])

    # Login with temp password
    lr = requests.post(f"{API}/auth/login", json={'email': qa_emails['invite'], 'password': c['temp_password']}, timeout=15)
    assert lr.status_code == 200, lr.text
    ldata = lr.json()
    assert ldata.get('must_change_password') is True


def test_quick_onboard_existing_activation_link(admin_token, qa_emails):
    """Repost same email with activation_link; should NOT change password."""
    body = {
        'users': [{'name': 'QA Test', 'email': qa_emails['invite']}],
        'send_email': False,
        'existing_policy': 'activation_link',
    }
    r = requests.post(f"{API}/admin/users/quick-onboard", headers=_h(admin_token), json=body, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data['existing']) == 1
    assert data['existing'][0]['action'] == 'activation_link'
    # Original temp password still works
    lr = requests.post(f"{API}/auth/login", json={'email': qa_emails['invite'], 'password': qa_emails['temp_password']}, timeout=15)
    assert lr.status_code == 200, f"original temp password should still work: {lr.text}"


def test_quick_onboard_existing_skip(admin_token, qa_emails):
    body = {
        'users': [{'name': 'QA Test', 'email': qa_emails['invite']}],
        'send_email': False,
        'existing_policy': 'skip',
    }
    r = requests.post(f"{API}/admin/users/quick-onboard", headers=_h(admin_token), json=body, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data['existing'][0]['action'] == 'skipped'


# ============ Activation token flow ============
def test_activation_reset_flow(admin_token, qa_emails, mongo):
    # Find a valid activation token for the invite user
    tok_doc = mongo.password_resets.find_one(
        {'email': qa_emails['invite'], 'purpose': 'activation', 'used': False},
        sort=[('created_at', -1)],
    )
    assert tok_doc, 'no unused activation token found'
    qa_emails['last_token'] = tok_doc['token']
    # Reset password
    new_pass = 'NewPass2026!'
    r = requests.post(f"{API}/auth/reset-password", json={'token': tok_doc['token'], 'new_password': new_pass}, timeout=15)
    assert r.status_code == 200, r.text
    # Login with new password
    lr = requests.post(f"{API}/auth/login", json={'email': qa_emails['invite'], 'password': new_pass}, timeout=15)
    assert lr.status_code == 200, lr.text
    assert lr.json().get('must_change_password') is False
    qa_emails['new_pass'] = new_pass

    # Invitations list now shows this user as 'activated'
    inv = requests.get(f"{API}/admin/users/invitations", headers=_h(admin_token), timeout=20).json()
    match = next((i for i in inv['items'] if i['email'] == qa_emails['invite']), None)
    assert match, 'invite user not in invitations list'
    assert match['activation'] == 'activated', f"expected activated, got {match['activation']}"


def test_resend_rejected_for_activated(admin_token, qa_emails):
    r = requests.post(f"{API}/admin/users/invitations/{qa_emails['user_id']}/resend",
                      headers=_h(admin_token), timeout=15)
    assert r.status_code == 400, f"expected 400 for activated user, got {r.status_code}: {r.text}"


# ============ Resend for non-activated user ============
def test_resend_for_non_activated(admin_token, qa_emails, mongo):
    # Create a 2nd QA user (not activated)
    email2 = f"qa.resend.{qa_emails['rand']}@example.com"
    body = {
        'users': [{'name': 'QA Resend', 'email': email2}],
        'send_email': False,
        'existing_policy': 'activation_link',
    }
    r = requests.post(f"{API}/admin/users/quick-onboard", headers=_h(admin_token), json=body, timeout=20)
    assert r.status_code == 200
    uid2 = r.json()['created'][0]['id']
    qa_emails['created_ids'].append(uid2)
    qa_emails['resend_email'] = email2

    # Capture original token id
    orig_tok = mongo.password_resets.find_one({'email': email2, 'purpose': 'activation', 'used': False}, sort=[('created_at', -1)])
    assert orig_tok, 'original token should exist'
    orig_token_id = orig_tok['token']

    # Resend
    rr = requests.post(f"{API}/admin/users/invitations/{uid2}/resend", headers=_h(admin_token), timeout=20)
    assert rr.status_code == 200, rr.text
    rdata = rr.json()
    for k in ('ok', 'email', 'email_status'):
        assert k in rdata
    assert rdata['email'] == email2

    # Original token should now be marked used:true
    orig_after = mongo.password_resets.find_one({'token': orig_token_id})
    assert orig_after['used'] is True, 'old activation token must be invalidated'


# ============ FX2026 environment guard ============
def test_fx2026_env_mismatch_guard(admin_token):
    # Pass Origin as preview URL; APP_BASE_URL = paylionsbit.es
    r = requests.post(f"{API}/admin/fx2026/send-welcome",
                      headers={**_h(admin_token), 'Origin': BASE_URL},
                      json={}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get('started') is False
    assert data.get('reason') == 'environment_mismatch'
    assert 'mismatch' in data
    assert data['mismatch'].get('link_host') == 'paylionsbit.es'


# ============ Withdrawal cancel email ============
def test_withdrawal_cancel_email(admin_token, mongo):
    # Find a completado withdrawal
    r = requests.get(f"{API}/community/recent-withdrawals/detailed?limit=20", headers=_h(admin_token), timeout=20)
    assert r.status_code == 200, r.text
    items = r.json().get('items') or r.json()
    completed = next((it for it in items if (it.get('stage') or '').lower() == 'completado'), None)
    if not completed:
        pytest.skip('No completado withdrawal available')
    wid = completed.get('id') or completed.get('withdrawal_id')
    assert wid

    # Move to en_revision
    sr = requests.post(f"{API}/admin/recent-withdrawals/{wid}/stage",
                       headers=_h(admin_token), json={'stage': 'en_revision'}, timeout=15)
    assert sr.status_code == 200, sr.text

    # Cancel
    cr = requests.post(f"{API}/admin/recent-withdrawals/{wid}/cancel",
                       headers=_h(admin_token), json={'reason': 'QA prueba correo'}, timeout=20)
    assert cr.status_code == 200, cr.text

    # Wait for background email job
    time.sleep(6)

    # Check email_logs
    log = None
    for _ in range(5):
        log = mongo.email_logs.find_one(
            {'subject': {'$regex': 'cancelada', '$options': 'i'}},
            sort=[('created_at', -1)],
        )
        if log:
            break
        time.sleep(1)
    assert log, 'No email log for cancelled withdrawal'
    assert 'cancelada' in log['subject'].lower()
    # status may be 'sent' or 'failed'
    print(f"email_log status={log.get('status')} subject={log.get('subject')} to={log.get('to_email')}")

    # Check notifications
    notif = mongo.notifications.find_one({'metadata.withdrawal_id': wid}, sort=[('created_at', -1)])
    assert notif, 'notification with metadata.withdrawal_id not found'


# ============ Cleanup ============
def test_cleanup_qa_users(qa_emails, mongo):
    """Remove QA users and their artifacts."""
    emails = [qa_emails['invite'], qa_emails.get('resend_email')]
    emails = [e for e in emails if e]
    for e in emails:
        u = mongo.users.find_one({'email': e})
        if not u:
            continue
        uid = u['id']
        mongo.accounts.delete_many({'user_id': uid})
        mongo.transactions.delete_many({'user_id': uid})
        mongo.notifications.delete_many({'user_id': uid})
        mongo.password_resets.delete_many({'email': e})
        mongo.users.delete_one({'id': uid})
    print(f"Cleaned {len(emails)} QA users")
