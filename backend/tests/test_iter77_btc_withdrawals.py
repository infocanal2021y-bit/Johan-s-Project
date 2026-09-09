"""BTC withdrawals smoke test - iteration 77."""
import os
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://compliance-dash-32.preview.emergentagent.com').rstrip('/')
USER = ('manclic@yahoo.es', 'FX2026')
ADMIN = ('admi@paylionsbit.es', 'LionsBit2026!')

VALID_BECH32 = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'
INVALID_ADDR = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdX'
TXID_OK = '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b'


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text[:300]}"
    tok = r.json().get('access_token') or r.json().get('token')
    if tok:
        s.headers.update({'Authorization': f'Bearer {tok}'})
    return s


def test_validate_address_valid():
    s = _login(*USER)
    r = s.get(f"{BASE_URL}/api/btc/validate-address", params={"address": VALID_BECH32}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json().get('valid') is True


def test_validate_address_invalid():
    s = _login(*USER)
    r = s.get(f"{BASE_URL}/api/btc/validate-address", params={"address": INVALID_ADDR}, timeout=10)
    assert r.status_code == 200
    assert r.json().get('valid') is False


def test_admin_btc_addresses_list():
    s = _login(*ADMIN)
    r = s.get(f"{BASE_URL}/api/admin/btc-addresses", timeout=15)
    assert r.status_code == 200, r.text


def test_full_btc_withdrawal_cycle():
    user = _login(*USER)
    admin = _login(*ADMIN)

    # find or initiate a request
    r_list = user.get(f"{BASE_URL}/api/btc-withdrawal/list", timeout=15)
    assert r_list.status_code == 200
    reqs = r_list.json().get('requests', [])
    active = [x for x in reqs if x.get('status') not in ('completado', 'retiro_rechazado')]
    if active:
        req = active[0]
        req_id = req['id']
        status = req['status']
    else:
        r = user.post(f"{BASE_URL}/api/btc-withdrawal/initiate", json={
            "amount_eur": 25000, "btc_address": VALID_BECH32, "address_confirmed": True
        }, timeout=20)
        assert r.status_code in (200, 201), r.text
        req = r.json().get('request') or r.json()
        req_id = req.get('id')
        status = req.get('status', 'pendiente_abono')

    # submit-info if in pendiente_abono/accion_requerida
    if status in ('pendiente_abono', 'accion_requerida', 'validacion_rechazada'):
        r = user.post(f"{BASE_URL}/api/btc-withdrawal/{req_id}/submit-info", json={
            "message": "abono realizado", "fee_txid": TXID_OK, "coin_used": "BTC"
        }, timeout=15)
        assert r.status_code in (200, 201), r.text
        status = 'pendiente_validacion'

    # admin validate (pendiente_validacion → en_revision)
    if status == 'pendiente_validacion':
        r = admin.post(f"{BASE_URL}/api/admin/btc-withdrawals/{req_id}/validate", timeout=15)
        assert r.status_code in (200, 201), r.text
        status = 'en_revision'

    # register-send invalid TXID
    r = admin.post(f"{BASE_URL}/api/admin/btc-withdrawals/{req_id}/register-send", json={
        "btc_amount": 0.35, "txid": "invalidhex"
    }, timeout=15)
    assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"

    # register-send valid
    if status not in ('enviado', 'completado'):
        r = admin.post(f"{BASE_URL}/api/admin/btc-withdrawals/{req_id}/register-send", json={
            "btc_amount": 0.35, "txid": TXID_OK
        }, timeout=15)
        assert r.status_code in (200, 201), r.text

    # add note
    r = admin.post(f"{BASE_URL}/api/admin/btc-withdrawals/{req_id}/notes",
                   json={"note": "QA iter77"}, timeout=10)
    assert r.status_code in (200, 201), r.text
