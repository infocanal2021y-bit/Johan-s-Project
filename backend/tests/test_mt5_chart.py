"""MT5 chart & trading endpoint regression tests.
Covers /api/mt5/candles, /api/mt5/tick, /api/mt5/calculator, /api/mt5/symbols,
/api/mt5/account and verifies _id is NEVER present in responses.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _assert_no_mongo_id(obj):
    """Recursively ensure no '_id' key leaks into responses."""
    if isinstance(obj, dict):
        assert "_id" not in obj, f"Found _id in {list(obj.keys())}"
        for v in obj.values():
            _assert_no_mongo_id(v)
    elif isinstance(obj, list):
        for v in obj:
            _assert_no_mongo_id(v)


# ── /api/mt5/candles ─────────────────────────────────────────────────

class TestCandles:
    def test_candles_eurusd_h1_200(self, headers):
        r = requests.get(f"{BASE_URL}/api/mt5/candles",
                         params={"symbol": "EURUSD", "timeframe": "H1"},
                         headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["symbol"] == "EURUSD"
        assert data["timeframe"] == "H1"
        candles = data["candles"]
        assert isinstance(candles, list)
        assert len(candles) == 200, f"expected 200 candles got {len(candles)}"
        first = candles[0]
        for k in ("time", "open", "high", "low", "close", "volume"):
            assert k in first, f"missing {k} in candle"
        _assert_no_mongo_id(data)

    @pytest.mark.parametrize("tf,expected_len", [("M1", 240), ("M15", 200), ("D1", 120)])
    def test_candles_multiple_timeframes(self, headers, tf, expected_len):
        r = requests.get(f"{BASE_URL}/api/mt5/candles",
                         params={"symbol": "EURUSD", "timeframe": tf},
                         headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        assert len(r.json()["candles"]) == expected_len

    def test_candles_invalid_symbol_400(self, headers):
        r = requests.get(f"{BASE_URL}/api/mt5/candles",
                         params={"symbol": "FOO", "timeframe": "H1"},
                         headers=headers, timeout=15)
        assert r.status_code == 400

    def test_candles_invalid_timeframe_400(self, headers):
        r = requests.get(f"{BASE_URL}/api/mt5/candles",
                         params={"symbol": "EURUSD", "timeframe": "W1"},
                         headers=headers, timeout=15)
        assert r.status_code == 400


# ── /api/mt5/tick ────────────────────────────────────────────────────

class TestTick:
    def test_tick_returns_bid_ask_last_bar(self, headers):
        r = requests.get(f"{BASE_URL}/api/mt5/tick",
                         params={"symbol": "EURUSD", "timeframe": "H1"},
                         headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("bid", "ask", "last", "bar"):
            assert k in data, f"missing {k} in tick"
        bar = data["bar"]
        for k in ("time", "open", "high", "low", "close"):
            assert k in bar
        assert data["ask"] > data["bid"]
        _assert_no_mongo_id(data)

    def test_tick_live_drift_between_calls(self, headers):
        samples = []
        for _ in range(4):
            r = requests.get(f"{BASE_URL}/api/mt5/tick",
                             params={"symbol": "EURUSD", "timeframe": "H1"},
                             headers=headers, timeout=15)
            assert r.status_code == 200
            samples.append(r.json()["last"])
            time.sleep(1.2)
        distinct = len(set(samples))
        assert distinct >= 2, f"expected >=2 distinct last values, got {samples}"

    def test_tick_invalid_symbol_400(self, headers):
        r = requests.get(f"{BASE_URL}/api/mt5/tick",
                         params={"symbol": "FOO"},
                         headers=headers, timeout=15)
        assert r.status_code == 400


# ── /api/mt5/calculator ──────────────────────────────────────────────

class TestCalculator:
    def test_calculator_eurusd_0_1(self, headers):
        r = requests.post(f"{BASE_URL}/api/mt5/calculator",
                          json={"symbol": "EURUSD", "lot": 0.1},
                          headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["symbol"] == "EURUSD"
        assert data["lot"] == 0.1
        assert data["pip_value_usd"] > 0
        assert data["margin_required_usd"] > 0
        _assert_no_mongo_id(data)


# ── /api/mt5/account & symbols (regression) ──────────────────────────

class TestAccountAndSymbols:
    def test_account(self, headers):
        r = requests.get(f"{BASE_URL}/api/mt5/account", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("login", "balance", "equity", "margin_level", "broker"):
            assert k in data, f"missing {k}"
        _assert_no_mongo_id(data)

    def test_symbols_list(self, headers):
        r = requests.get(f"{BASE_URL}/api/mt5/symbols", headers=headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["symbols"], list)
        assert len(data["symbols"]) >= 5
        _assert_no_mongo_id(data)

    def test_operations(self, headers):
        r = requests.get(f"{BASE_URL}/api/mt5/operations", headers=headers, timeout=15)
        assert r.status_code == 200
        _assert_no_mongo_id(r.json())
