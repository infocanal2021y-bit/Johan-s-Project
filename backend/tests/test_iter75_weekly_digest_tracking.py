"""Iter 75: weekly digest open tracking + opens/open_rate en status + pixel en HTML."""
import os
import re
import uuid
import pytest
import requests
from dotenv import load_dotenv

load_dotenv('/app/frontend/.env')
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ADMIN_EMAIL = 'admi@paylionsbit.es'
ADMIN_PASS = 'LionsBit2026!'


@pytest.fixture(scope='module')
def admin_session():
    s = requests.Session()
    r = s.post(f'{BASE_URL}/api/auth/login', json={'email': ADMIN_EMAIL, 'password': ADMIN_PASS})
    assert r.status_code == 200, r.text
    tok = r.json().get('access_token') or r.json().get('token')
    if tok:
        s.headers.update({'Authorization': f'Bearer {tok}'})
    return s


# ── Pixel público ─────────────────────────────────────────────────────
class TestPixel:
    def test_pixel_invalid_token_returns_png(self):
        run_id = str(uuid.uuid4())
        r = requests.get(f'{BASE_URL}/api/weekly-digest/track/{run_id}/invalid-token-xyz.png')
        assert r.status_code == 200
        assert r.headers.get('content-type', '').startswith('image/png')
        assert r.content[:8] == b'\x89PNG\r\n\x1a\n'

    def test_pixel_dedup_and_status_reflects_opens(self, admin_session):
        # Sembrar un run en weekly_digest_log via directo? no tenemos db acceso; usar seed via python
        # Sembramos via subproceso mongo? Mejor: solo verificamos pixel dedup via token válido.
        # Necesitamos un token válido -> tomar de un usuario real.
        # No hay endpoint público; usar admin users list si existe.
        import subprocess
        run_id = str(uuid.uuid4())
        # crear seed: user token + weekly_digest_log
        script = f"""
import asyncio
from config import db
async def go():
    user = await db.users.find_one({{'email_open_token': {{'$exists': True, '$ne': None}}}}, {{'_id':0,'id':1,'email_open_token':1}})
    if not user:
        # crear token para un usuario
        u = await db.users.find_one({{'role': {{'$ne':'admin'}}}}, {{'_id':0,'id':1}})
        import uuid as U
        tok = str(U.uuid4())
        await db.users.update_one({{'id': u['id']}}, {{'$set': {{'email_open_token': tok}}}})
        user = {{'id': u['id'], 'email_open_token': tok}}
    await db.weekly_digest_log.insert_one({{'id':'{run_id}','sent_at':'2026-01-01T00:00:00+00:00','triggered_by':'test','recipients':10,'withdrawals_count':0,'featured_questions_count':0}})
    print('TOKEN:'+user['email_open_token'])
    print('UID:'+user['id'])
asyncio.run(go())
"""
        proc = subprocess.run(['python3','-c',script], cwd='/app/backend', capture_output=True, text=True, timeout=30)
        assert 'TOKEN:' in proc.stdout, proc.stdout + proc.stderr
        token = [l.split(':',1)[1] for l in proc.stdout.splitlines() if l.startswith('TOKEN:')][0]
        uid = [l.split(':',1)[1] for l in proc.stdout.splitlines() if l.startswith('UID:')][0]

        try:
            # 2 hits -> 1 open
            r1 = requests.get(f'{BASE_URL}/api/weekly-digest/track/{run_id}/{token}.png')
            r2 = requests.get(f'{BASE_URL}/api/weekly-digest/track/{run_id}/{token}.png')
            assert r1.status_code == 200
            assert r2.status_code == 200

            # verify dedup via status endpoint
            s = admin_session.get(f'{BASE_URL}/api/admin/weekly-digest/status')
            assert s.status_code == 200
            body = s.json()
            runs = body.get('last_runs') or []
            match = next((x for x in runs if x['id'] == run_id), None)
            assert match is not None, 'seeded run missing'
            assert 'opens' in match and 'open_rate' in match
            assert match['opens'] == 1
            assert match['open_rate'] == 10.0
        finally:
            # cleanup
            cleanup = f"""
import asyncio
from config import db
async def go():
    await db.weekly_digest_log.delete_one({{'id':'{run_id}'}})
    await db.weekly_digest_opens.delete_many({{'run_id':'{run_id}'}})
asyncio.run(go())
"""
            subprocess.run(['python3','-c',cleanup], cwd='/app/backend', capture_output=True, text=True, timeout=15)


# ── Preview & code check ───────────────────────────────────────────────
class TestPixelInHtml:
    def test_preview_does_not_include_pixel(self, admin_session):
        r = admin_session.get(f'{BASE_URL}/api/admin/weekly-digest/preview')
        assert r.status_code == 200
        html = r.json().get('html','')
        assert '/api/weekly-digest/track/' not in html, 'preview should NOT include tracking pixel'

    def test_run_weekly_digest_code_includes_pixel(self):
        with open('/app/backend/routes/weekly_digest.py','r') as f:
            src = f.read()
        assert '/api/weekly-digest/track/' in src
        assert re.search(r"<img\s+src=.*?/api/weekly-digest/track/", src)
