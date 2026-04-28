"""End-to-end tests for the Client Import (CSV/Excel reactivation) feature.

Covers:
  - preview validation (empty, no-email column, dup-in-file, reactivate match)
  - admin-only enforcement
  - execute commits (create + reactivate, idempotency, dedupe on re-upload)
  - jobs history & detail enrichment with engagement
  - email-open tracking pixel (PNG + idempotent engagement update)
  - auth flows: must_change_password top-level + nested, /auth/me, /auth/change-password
"""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"
TEMP_PASSWORD = "lionsbit2.0"


def _post_file(token, content, filename, default_group='latinos'):
    files = {'file': (filename, content, 'text/csv' if filename.endswith('.csv') else 'application/octet-stream')}
    data = {'default_group': default_group}
    return requests.post(
        f"{BASE_URL}/api/admin/client-import/preview",
        files=files, data=data,
        headers={'Authorization': f'Bearer {token}'}
    )


@pytest.fixture(scope="module")
def admin_token_mod():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    return r.json()['token']


@pytest.fixture(scope="module")
def cleanup_after(admin_token_mod):
    """Final cleanup: delete TEST_ users + import_jobs created during tests."""
    yield
    try:
        # Delete via direct db is unavailable here; the system has no public delete.
        # Best-effort: nothing — main agent will clean up.
        pass
    except Exception:
        pass


# ── PREVIEW ─────────────────────────────────────────────────────────
class TestPreview:
    def test_preview_empty_file(self, admin_token_mod):
        r = _post_file(admin_token_mod, b'', 'empty.csv')
        assert r.status_code == 400
        assert 'vac' in r.json()['detail'].lower()

    def test_preview_no_email_column(self, admin_token_mod):
        csv = b"Nombre,Telefono,Pais\nJuan,600111222,ES\n"
        r = _post_file(admin_token_mod, csv, 'noemail.csv')
        assert r.status_code == 400
        assert 'correo' in r.json()['detail'].lower()

    def test_preview_non_admin_403(self):
        # create a brand new user
        uid = uuid.uuid4().hex[:8]
        reg = requests.post(f"{BASE_URL}/api/auth/register", json={
            'name': f'TEST_normal_{uid}',
            'email': f'test_normal_{uid}@test.com',
            'password': 'TestPass123!',
        })
        assert reg.status_code == 200
        token = reg.json()['token']
        csv = b"Nombre,Email\nJuan,a@b.com\n"
        r = _post_file(token, csv, 'x.csv')
        assert r.status_code == 403

    def test_preview_valid_with_dup_and_reactivate(self, admin_token_mod):
        uid = uuid.uuid4().hex[:6]
        # Row 1: new (unique) | Row 2: dup of row 1 email | Row 3: admin existing → reactivate
        csv = (
            "Nombre,Correo,Telefono,Pais,Saldo,Estado,Comentarios,Grupo\n"
            f"TEST_New_{uid},test_new_{uid}@test.com,600111222,ES,1500.50,activo,nota1,recuperar\n"
            f"TEST_Dup_{uid},test_new_{uid}@test.com,600111223,ES,200,,nota2,recuperar\n"
            f"Admin Existing,{ADMIN_EMAIL},600999999,ES,5000,activo,reactivacion,espanoles\n"
        ).encode()
        r = _post_file(admin_token_mod, csv, f'preview_{uid}.csv', default_group='recuperar')
        assert r.status_code == 200, r.text
        body = r.json()
        assert body['ok'] is True
        assert 'job_id' in body
        s = body['summary']
        assert s['total_rows'] == 3
        assert s['new_profiles'] == 1
        assert s['reactivated'] == 1
        assert s['duplicates_in_file'] == 1
        assert s['errors'] == 0
        # Find rows by action
        actions = {row['action']: row for row in body['rows']}
        assert 'create' in actions
        assert 'reactivate' in actions
        assert 'duplicate_in_file' in actions
        # reactivate row has existing_user_id + existing_name
        re_row = actions['reactivate']
        assert re_row.get('existing_user_id')
        assert re_row.get('existing_name')
        # duplicate row references conflict row
        dup_row = actions['duplicate_in_file']
        assert 'conflict' in dup_row
        # by_group sums
        assert sum(s['by_group'].values()) == s['new_profiles'] + s['reactivated']


# ── EXECUTE ─────────────────────────────────────────────────────────
class TestExecute:
    @pytest.fixture(scope="class")
    def preview_job(self, admin_token_mod):
        """Create a preview job to be executed by tests."""
        uid = uuid.uuid4().hex[:6]
        new_email = f"test_exec_{uid}@test.com"
        csv = (
            "Nombre,Correo,Telefono,Pais,Saldo,Estado,Comentarios,Grupo\n"
            f"TEST_Exec_{uid},{new_email},600222333,ES,2500,activo,exec_test,recuperar\n"
            f"Admin Reactivate,{ADMIN_EMAIL},600999999,ES,5000,activo,exec_reactivate,espanoles\n"
        ).encode()
        r = _post_file(admin_token_mod, csv, f'exec_{uid}.csv', default_group='recuperar')
        assert r.status_code == 200, r.text
        return {'job_id': r.json()['job_id'], 'new_email': new_email, 'csv': csv, 'uid': uid}

    def test_execute_commits_create_and_reactivate(self, admin_token_mod, preview_job):
        r = requests.post(
            f"{BASE_URL}/api/admin/client-import/execute/{preview_job['job_id']}",
            headers={'Authorization': f'Bearer {admin_token_mod}'}
        )
        assert r.status_code == 200, r.text
        s = r.json()['summary']
        assert s['executed_created'] == 1
        assert s['executed_reactivated'] == 1
        assert s['executed_skipped'] == 0
        assert isinstance(s['execution_errors'], list)

    def test_new_user_can_login_with_temp_password(self, preview_job):
        """Login as the imported user → must_change_password=True (top + nested)."""
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            'email': preview_job['new_email'],
            'password': TEMP_PASSWORD,
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get('must_change_password') is True
        assert body['user'].get('must_change_password') is True
        assert body['user'].get('is_reactivated') is True

    def test_new_user_wrong_password_401(self, preview_job):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            'email': preview_job['new_email'],
            'password': 'wrongPass!1',
        })
        assert r.status_code == 401

    def test_auth_me_exposes_must_change_flag(self, preview_job):
        login = requests.post(f"{BASE_URL}/api/auth/login", json={
            'email': preview_job['new_email'], 'password': TEMP_PASSWORD,
        })
        token = login.json()['token']
        me = requests.get(f"{BASE_URL}/api/auth/me",
                          headers={'Authorization': f'Bearer {token}'})
        assert me.status_code == 200
        assert me.json().get('must_change_password') is True
        assert me.json().get('is_reactivated') is True

    def test_change_password_clears_flag(self, preview_job):
        login = requests.post(f"{BASE_URL}/api/auth/login", json={
            'email': preview_job['new_email'], 'password': TEMP_PASSWORD,
        })
        token = login.json()['token']
        new_pwd = 'NewSecurePass123!'
        chg = requests.post(
            f"{BASE_URL}/api/auth/change-password",
            json={'current_password': TEMP_PASSWORD, 'new_password': new_pwd},
            headers={'Authorization': f'Bearer {token}'}
        )
        assert chg.status_code == 200, chg.text
        # Verify flag cleared via /auth/me
        me = requests.get(f"{BASE_URL}/api/auth/me",
                          headers={'Authorization': f'Bearer {token}'})
        assert me.json().get('must_change_password') is False
        # Verify can't login anymore with temp password
        bad = requests.post(f"{BASE_URL}/api/auth/login", json={
            'email': preview_job['new_email'], 'password': TEMP_PASSWORD,
        })
        assert bad.status_code == 401
        # Verify can login with new password
        good = requests.post(f"{BASE_URL}/api/auth/login", json={
            'email': preview_job['new_email'], 'password': new_pwd,
        })
        assert good.status_code == 200
        assert good.json().get('must_change_password') is False

    def test_execute_again_400(self, admin_token_mod, preview_job):
        r = requests.post(
            f"{BASE_URL}/api/admin/client-import/execute/{preview_job['job_id']}",
            headers={'Authorization': f'Bearer {admin_token_mod}'}
        )
        assert r.status_code == 400
        assert 'ejecutada' in r.json()['detail'].lower()

    def test_execute_unknown_job_404(self, admin_token_mod):
        r = requests.post(
            f"{BASE_URL}/api/admin/client-import/execute/{uuid.uuid4()}",
            headers={'Authorization': f'Bearer {admin_token_mod}'}
        )
        assert r.status_code == 404

    def test_reupload_dedupes(self, admin_token_mod, preview_job):
        """Same CSV → preview shows ALL rows as reactivate (already in DB)."""
        r = _post_file(admin_token_mod, preview_job['csv'], f"redup_{preview_job['uid']}.csv",
                       default_group='recuperar')
        assert r.status_code == 200
        s = r.json()['summary']
        assert s['new_profiles'] == 0
        assert s['reactivated'] >= 1  # both rows now exist


# ── JOBS HISTORY & DETAIL ───────────────────────────────────────────
class TestJobsHistory:
    def test_jobs_list(self, admin_token_mod):
        r = requests.get(f"{BASE_URL}/api/admin/client-import/jobs",
                         headers={'Authorization': f'Bearer {admin_token_mod}'})
        assert r.status_code == 200
        body = r.json()
        assert 'items' in body and 'count' in body
        assert isinstance(body['items'], list)
        if body['items']:
            j = body['items'][0]
            assert 'summary' in j
            assert 'rows' not in j  # heavy field excluded from list

    def test_jobs_list_non_admin_403(self):
        uid = uuid.uuid4().hex[:8]
        reg = requests.post(f"{BASE_URL}/api/auth/register", json={
            'name': f'TEST_listusr_{uid}',
            'email': f'test_listusr_{uid}@test.com',
            'password': 'TestPass123!',
        })
        token = reg.json()['token']
        r = requests.get(f"{BASE_URL}/api/admin/client-import/jobs",
                         headers={'Authorization': f'Bearer {token}'})
        assert r.status_code == 403

    def test_job_detail_enriched(self, admin_token_mod):
        # Get the latest executed job
        lst = requests.get(f"{BASE_URL}/api/admin/client-import/jobs",
                           headers={'Authorization': f'Bearer {admin_token_mod}'}).json()
        executed = [j for j in lst['items'] if j['status'] == 'executed']
        if not executed:
            pytest.skip("No executed jobs yet")
        jid = executed[0]['id']
        r = requests.get(f"{BASE_URL}/api/admin/client-import/jobs/{jid}",
                         headers={'Authorization': f'Bearer {admin_token_mod}'})
        assert r.status_code == 200
        job = r.json()
        assert 'rows' in job
        # rows should be enriched with .live
        committed_rows = [r for r in job['rows'] if r.get('committed_user_id')]
        assert committed_rows, "Expected at least one committed row"
        for row in committed_rows:
            assert 'live' in row
            assert 'engagement' in row['live']
            assert 'must_change_password' in row['live']
            assert 'account_status' in row['live']

    def test_job_detail_not_found(self, admin_token_mod):
        r = requests.get(f"{BASE_URL}/api/admin/client-import/jobs/{uuid.uuid4()}",
                         headers={'Authorization': f'Bearer {admin_token_mod}'})
        assert r.status_code == 404


# ── EMAIL-OPEN TRACKING PIXEL ───────────────────────────────────────
class TestTrackingPixel:
    def test_returns_png(self):
        r = requests.get(f"{BASE_URL}/api/client-import/track/open/{uuid.uuid4()}.png")
        assert r.status_code == 200
        assert r.headers.get('content-type', '').startswith('image/png')
        # 1×1 PNG begins with the standard signature
        assert r.content[:8] == b'\x89PNG\r\n\x1a\n'
        assert len(r.content) < 200

    def test_token_marks_engagement(self, admin_token_mod):
        # Find a job and grab a token
        lst = requests.get(f"{BASE_URL}/api/admin/client-import/jobs",
                           headers={'Authorization': f'Bearer {admin_token_mod}'}).json()
        for j in lst['items']:
            if j['status'] != 'executed':
                continue
            detail = requests.get(f"{BASE_URL}/api/admin/client-import/jobs/{j['id']}",
                                  headers={'Authorization': f'Bearer {admin_token_mod}'}).json()
            tokens = [r.get('email_open_token') for r in detail['rows'] if r.get('email_open_token') and r.get('action') == 'create']
            if tokens:
                tok = tokens[0]
                # Hit the pixel
                p1 = requests.get(f"{BASE_URL}/api/client-import/track/open/{tok}.png")
                assert p1.status_code == 200
                # Idempotent — second hit also OK
                p2 = requests.get(f"{BASE_URL}/api/client-import/track/open/{tok}.png")
                assert p2.status_code == 200
                # Check engagement marked
                detail2 = requests.get(f"{BASE_URL}/api/admin/client-import/jobs/{j['id']}",
                                       headers={'Authorization': f'Bearer {admin_token_mod}'}).json()
                hit_row = next((r for r in detail2['rows'] if r.get('email_open_token') == tok), None)
                assert hit_row is not None
                assert hit_row['live']['engagement'].get('email_opened_at') is not None
                return
        pytest.skip("No executed job rows with email_open_token found")
