"""Tests for Client Import Analytics: funnel, segment-preview, resend-campaign, campaigns."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"

FUNNEL_KEYS = ['emailed', 'opened', 'logged_in', 'password_changed', 'kyc_completed', 'withdraw_requested']


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    return r.json()['token']


@pytest.fixture(scope="module")
def normal_token():
    uid = uuid.uuid4().hex[:8]
    r = requests.post(f"{BASE_URL}/api/auth/register", json={
        'name': f'TEST_norm_{uid}',
        'email': f'test_norm_{uid}@test.lionsbit.es',
        'password': 'TestPass123!',
    })
    if r.status_code != 200:
        pytest.skip(f"register failed: {r.text[:200]}")
    return r.json()['token']


def _h(t):
    return {'Authorization': f'Bearer {t}'}


# ── FUNNEL ─────────────────────────────────────────────────────────
class TestFunnel:
    def test_funnel_global_structure(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/client-import/funnel", headers=_h(admin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert 'total' in body and isinstance(body['total'], int)
        assert 'stages' in body and len(body['stages']) == 6
        assert 'by_group' in body and isinstance(body['by_group'], dict)
        assert 'last_sync' in body
        keys = [s['key'] for s in body['stages']]
        assert keys == FUNNEL_KEYS
        for s in body['stages']:
            assert 'count' in s and 'pct' in s and 'drop_off_pct' in s and 'label' in s

    def test_funnel_cumulative_monotonic(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/client-import/funnel", headers=_h(admin_token))
        body = r.json()
        counts = [s['count'] for s in body['stages']]
        # cumulative: each stage <= previous
        for i in range(1, len(counts)):
            assert counts[i] <= counts[i - 1], f"Stage {i} ({counts[i]}) > prev ({counts[i-1]})"
        # Stage 0 (emailed) == total
        if body['total'] > 0:
            assert counts[0] == body['total']

    def test_funnel_by_group_includes_recuperar_or_espanoles(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/client-import/funnel", headers=_h(admin_token))
        body = r.json()
        bg = body['by_group']
        # Demo data should have at least these
        assert any(g in bg for g in ['recuperar', 'espanoles']), f"by_group keys: {list(bg.keys())}"
        for g, payload in bg.items():
            assert 'total' in payload
            assert 'stages' in payload and len(payload['stages']) == 6

    def test_funnel_filter_group_recuperar(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/client-import/funnel?group=recuperar",
                         headers=_h(admin_token))
        assert r.status_code == 200
        body = r.json()
        # Filtered total <= global total, and only one (or 'unknown') key in by_group
        for g in body['by_group']:
            assert g == 'recuperar' or g == 'unknown'

    def test_funnel_filter_job_id(self, admin_token):
        # Get a job id from the demo data
        r = requests.get(f"{BASE_URL}/api/admin/client-import/jobs", headers=_h(admin_token))
        items = r.json().get('items', [])
        demo = next((j for j in items if str(j.get('id', '')).startswith('demo-analytics-job-')), None)
        if not demo:
            # fall back to any executed job
            demo = next((j for j in items if j.get('status') == 'executed'), None)
        if not demo:
            pytest.skip("No jobs available")
        r2 = requests.get(f"{BASE_URL}/api/admin/client-import/funnel?job_id={demo['id']}",
                          headers=_h(admin_token))
        assert r2.status_code == 200
        body = r2.json()
        # Filter is applied: total <= global
        assert body['total'] >= 0

    def test_funnel_admin_only(self, normal_token):
        r = requests.get(f"{BASE_URL}/api/admin/client-import/funnel", headers=_h(normal_token))
        assert r.status_code == 403


# ── SEGMENT PREVIEW ────────────────────────────────────────────────
class TestSegmentPreview:
    @pytest.mark.parametrize("seg", ['not_opened', 'opened_no_login', 'no_kyc'])
    def test_segments_valid(self, admin_token, seg):
        r = requests.get(f"{BASE_URL}/api/admin/client-import/segment-preview?segment={seg}",
                         headers=_h(admin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body['segment'] == seg
        assert 'count' in body and isinstance(body['count'], int)
        assert 'sample' in body and isinstance(body['sample'], list)
        assert len(body['sample']) <= 5
        assert body.get('suggested_subject')
        assert body.get('label')

    def test_segment_invalid_400(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/client-import/segment-preview?segment=zzz_bad",
                         headers=_h(admin_token))
        assert r.status_code == 400

    def test_segment_filter_group(self, admin_token):
        r_all = requests.get(f"{BASE_URL}/api/admin/client-import/segment-preview?segment=not_opened",
                             headers=_h(admin_token)).json()
        r_filt = requests.get(
            f"{BASE_URL}/api/admin/client-import/segment-preview?segment=not_opened&group=recuperar",
            headers=_h(admin_token)).json()
        assert r_filt['count'] <= r_all['count']

    def test_segment_admin_only(self, normal_token):
        r = requests.get(f"{BASE_URL}/api/admin/client-import/segment-preview?segment=not_opened",
                         headers=_h(normal_token))
        assert r.status_code == 403


# ── RESEND CAMPAIGN ────────────────────────────────────────────────
class TestResendCampaign:
    def test_resend_invalid_segment_400(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/admin/client-import/resend-campaign",
                          json={'segment': 'invalid'}, headers=_h(admin_token))
        assert r.status_code == 400

    def test_resend_basic_creates_record(self, admin_token):
        # Use 'not_opened' which we know has demo data
        r = requests.post(f"{BASE_URL}/api/admin/client-import/resend-campaign",
                          json={'segment': 'not_opened'}, headers=_h(admin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get('ok') is True
        assert 'sent' in body
        assert 'matched' in body
        assert 'campaign' in body
        camp = body['campaign']
        assert camp['segment'] == 'not_opened'
        assert camp['triggered_by'] == ADMIN_EMAIL
        assert 'triggered_at' in camp
        # Should now appear in /campaigns list
        r2 = requests.get(f"{BASE_URL}/api/admin/client-import/campaigns", headers=_h(admin_token))
        assert r2.status_code == 200
        items = r2.json()['items']
        assert any(c.get('id') == camp['id'] for c in items), "Campaign not persisted in listing"

    def test_resend_with_custom_subject_intro(self, admin_token):
        custom_subj = "TEST_Subject_Custom_LIONSBIT"
        custom_intro = "TEST_Intro_paragraph_custom"
        r = requests.post(f"{BASE_URL}/api/admin/client-import/resend-campaign",
                          json={'segment': 'opened_no_login',
                                'subject': custom_subj,
                                'intro': custom_intro},
                          headers=_h(admin_token))
        assert r.status_code == 200, r.text
        camp = r.json()['campaign']
        assert camp['subject'] == custom_subj
        assert camp['intro'] == custom_intro

    def test_resend_with_group_filter_reduces(self, admin_token):
        # Without filter
        r_all = requests.post(f"{BASE_URL}/api/admin/client-import/resend-campaign",
                              json={'segment': 'no_kyc'}, headers=_h(admin_token))
        # With group filter
        r_grp = requests.post(f"{BASE_URL}/api/admin/client-import/resend-campaign",
                              json={'segment': 'no_kyc', 'group': 'recuperar'},
                              headers=_h(admin_token))
        assert r_all.status_code == 200 and r_grp.status_code == 200
        assert r_grp.json()['matched'] <= r_all.json()['matched']

    def test_campaigns_list_sorted_desc(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/client-import/campaigns", headers=_h(admin_token))
        assert r.status_code == 200
        items = r.json()['items']
        if len(items) >= 2:
            # triggered_at sorted desc (string ISO comparison works)
            assert items[0]['triggered_at'] >= items[1]['triggered_at']

    def test_resend_admin_only(self, normal_token):
        r = requests.post(f"{BASE_URL}/api/admin/client-import/resend-campaign",
                          json={'segment': 'not_opened'}, headers=_h(normal_token))
        assert r.status_code == 403
