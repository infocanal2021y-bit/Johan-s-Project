"""
Trading Demo New Features Tests (Iteration 31)
Tests for 6 new features:
1. Stop Loss / Take Profit on orders with auto-close
2. Replay Mode for practicing on historical charts
3. Trading Challenges/Gamification (8 challenges with XP/badges)
4. Weekly stats report + trader profile
5. Pre-trade risk simulator
6. Learning center with 5 mini-modules
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"


class TestStopLossTakeProfit:
    """Test SL/TP functionality on orders"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and reset account"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            # Reset account for clean state
            self.session.post(f"{BASE_URL}/api/trading/reset")
        else:
            pytest.skip("Authentication failed")
    
    def test_open_trade_with_stop_loss(self):
        """POST /api/trading/open - should accept stop_loss parameter"""
        # Get current price first
        prices = self.session.get(f"{BASE_URL}/api/trading/prices").json()
        current_bid = prices['EURUSD']['bid']
        sl_price = round(current_bid - 0.0050, 5)  # 50 pips below
        
        response = self.session.post(f"{BASE_URL}/api/trading/open", json={
            "symbol": "EURUSD",
            "direction": "buy",
            "lot_size": 0.1,
            "stop_loss": sl_price
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        trade = response.json()['trade']
        assert trade['stop_loss'] == sl_price, f"Stop loss should be {sl_price}, got {trade.get('stop_loss')}"
        
        print(f"✅ POST /api/trading/open with stop_loss={sl_price} - Trade opened successfully")
    
    def test_open_trade_with_take_profit(self):
        """POST /api/trading/open - should accept take_profit parameter"""
        prices = self.session.get(f"{BASE_URL}/api/trading/prices").json()
        current_ask = prices['BTCUSD']['ask']
        tp_price = round(current_ask + 500, 2)  # $500 above
        
        response = self.session.post(f"{BASE_URL}/api/trading/open", json={
            "symbol": "BTCUSD",
            "direction": "buy",
            "lot_size": 0.05,
            "take_profit": tp_price
        })
        assert response.status_code == 200
        
        trade = response.json()['trade']
        assert trade['take_profit'] == tp_price, f"Take profit should be {tp_price}, got {trade.get('take_profit')}"
        
        print(f"✅ POST /api/trading/open with take_profit={tp_price} - Trade opened successfully")
    
    def test_open_trade_with_both_sl_tp(self):
        """POST /api/trading/open - should accept both SL and TP"""
        prices = self.session.get(f"{BASE_URL}/api/trading/prices").json()
        current_bid = prices['XAUUSD']['bid']
        sl_price = round(current_bid - 10, 2)  # $10 below
        tp_price = round(current_bid + 20, 2)  # $20 above
        
        response = self.session.post(f"{BASE_URL}/api/trading/open", json={
            "symbol": "XAUUSD",
            "direction": "buy",
            "lot_size": 0.1,
            "stop_loss": sl_price,
            "take_profit": tp_price
        })
        assert response.status_code == 200
        
        trade = response.json()['trade']
        assert trade['stop_loss'] == sl_price
        assert trade['take_profit'] == tp_price
        
        print(f"✅ POST /api/trading/open with SL={sl_price} and TP={tp_price} - Both set correctly")
    
    def test_positions_show_sl_tp(self):
        """GET /api/trading/positions - should show SL/TP in position data"""
        # Open trade with SL/TP
        prices = self.session.get(f"{BASE_URL}/api/trading/prices").json()
        current_bid = prices['GBPUSD']['bid']
        sl_price = round(current_bid - 0.0030, 5)
        tp_price = round(current_bid + 0.0060, 5)
        
        self.session.post(f"{BASE_URL}/api/trading/open", json={
            "symbol": "GBPUSD",
            "direction": "buy",
            "lot_size": 0.1,
            "stop_loss": sl_price,
            "take_profit": tp_price
        })
        
        # Check positions
        positions = self.session.get(f"{BASE_URL}/api/trading/positions").json()
        assert len(positions) > 0, "Should have at least one position"
        
        gbp_position = next((p for p in positions if p['symbol'] == 'GBPUSD'), None)
        assert gbp_position is not None, "GBPUSD position not found"
        assert gbp_position.get('stop_loss') == sl_price, "Position should show stop_loss"
        assert gbp_position.get('take_profit') == tp_price, "Position should show take_profit"
        
        print(f"✅ GET /api/trading/positions - SL/TP visible in position data")


class TestTradingStats:
    """Test trading stats and trader profile endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed")
    
    def test_get_stats_endpoint_exists(self):
        """GET /api/trading/stats - endpoint should exist and return 200"""
        response = self.session.get(f"{BASE_URL}/api/trading/stats")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ GET /api/trading/stats - Endpoint exists and returns 200")
    
    def test_stats_returns_profile(self):
        """GET /api/trading/stats - should return trader profile"""
        response = self.session.get(f"{BASE_URL}/api/trading/stats")
        data = response.json()
        
        assert 'profile' in data, "Missing profile field"
        assert 'risk_level' in data, "Missing risk_level field"
        
        # Profile should be one of the expected values
        valid_profiles = ['Agresivo', 'Conservador', 'Estrategico', 'Moderado', 'Sin datos']
        assert data['profile'] in valid_profiles, f"Invalid profile: {data['profile']}"
        
        print(f"✅ GET /api/trading/stats - Profile: {data['profile']}, Risk: {data['risk_level']}")
    
    def test_stats_returns_win_rate(self):
        """GET /api/trading/stats - should return win_rate"""
        response = self.session.get(f"{BASE_URL}/api/trading/stats")
        data = response.json()
        
        assert 'win_rate' in data, "Missing win_rate field"
        assert 'total_trades' in data, "Missing total_trades field"
        assert isinstance(data['win_rate'], (int, float)), "win_rate should be numeric"
        
        print(f"✅ GET /api/trading/stats - Win rate: {data['win_rate']}%, Total trades: {data['total_trades']}")
    
    def test_stats_returns_best_worst_trade(self):
        """GET /api/trading/stats - should return best and worst trade"""
        response = self.session.get(f"{BASE_URL}/api/trading/stats")
        data = response.json()
        
        assert 'best_trade' in data, "Missing best_trade field"
        assert 'worst_trade' in data, "Missing worst_trade field"
        
        print(f"✅ GET /api/trading/stats - Best: ${data['best_trade']}, Worst: ${data['worst_trade']}")
    
    def test_stats_returns_weekly_stats(self):
        """GET /api/trading/stats - should return weekly statistics"""
        response = self.session.get(f"{BASE_URL}/api/trading/stats")
        data = response.json()
        
        assert 'weekly_trades' in data, "Missing weekly_trades field"
        assert 'weekly_pl' in data, "Missing weekly_pl field"
        assert 'weekly_wins' in data, "Missing weekly_wins field"
        
        print(f"✅ GET /api/trading/stats - Weekly: {data['weekly_trades']} trades, P/L: ${data['weekly_pl']}")
    
    def test_stats_returns_streak_info(self):
        """GET /api/trading/stats - should return win streak info"""
        response = self.session.get(f"{BASE_URL}/api/trading/stats")
        data = response.json()
        
        assert 'win_streak' in data, "Missing win_streak field"
        assert 'current_streak' in data, "Missing current_streak field"
        
        print(f"✅ GET /api/trading/stats - Max streak: {data['win_streak']}, Current: {data['current_streak']}")


class TestTradingChallenges:
    """Test trading challenges/gamification endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed")
    
    def test_get_challenges_endpoint_exists(self):
        """GET /api/trading/challenges - endpoint should exist"""
        response = self.session.get(f"{BASE_URL}/api/trading/challenges")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ GET /api/trading/challenges - Endpoint exists and returns 200")
    
    def test_challenges_returns_8_challenges(self):
        """GET /api/trading/challenges - should return 8 challenges"""
        response = self.session.get(f"{BASE_URL}/api/trading/challenges")
        data = response.json()
        
        assert isinstance(data, list), "Challenges should be a list"
        assert len(data) == 8, f"Expected 8 challenges, got {len(data)}"
        
        print(f"✅ GET /api/trading/challenges - Returns {len(data)} challenges")
    
    def test_challenges_have_required_fields(self):
        """GET /api/trading/challenges - each challenge should have required fields"""
        response = self.session.get(f"{BASE_URL}/api/trading/challenges")
        data = response.json()
        
        required_fields = ['id', 'name', 'desc', 'target', 'type', 'xp', 'badge', 'completed']
        
        for challenge in data:
            for field in required_fields:
                assert field in challenge, f"Challenge missing field: {field}"
        
        print("✅ GET /api/trading/challenges - All challenges have required fields")
    
    def test_challenges_have_correct_ids(self):
        """GET /api/trading/challenges - should have the 8 expected challenge IDs"""
        response = self.session.get(f"{BASE_URL}/api/trading/challenges")
        data = response.json()
        
        expected_ids = ['streak_3', 'streak_5', 'profit_500', 'profit_2000', 
                       'trades_10', 'trades_50', 'drawdown_10', 'multi_asset']
        
        actual_ids = [c['id'] for c in data]
        
        for expected_id in expected_ids:
            assert expected_id in actual_ids, f"Missing challenge: {expected_id}"
        
        print(f"✅ GET /api/trading/challenges - All 8 challenge IDs present: {expected_ids}")
    
    def test_challenges_have_xp_values(self):
        """GET /api/trading/challenges - each challenge should have XP reward"""
        response = self.session.get(f"{BASE_URL}/api/trading/challenges")
        data = response.json()
        
        for challenge in data:
            assert challenge['xp'] > 0, f"Challenge {challenge['id']} should have positive XP"
            assert isinstance(challenge['badge'], str), f"Challenge {challenge['id']} should have badge string"
        
        total_xp = sum(c['xp'] for c in data)
        print(f"✅ GET /api/trading/challenges - Total XP available: {total_xp}")


class TestRiskSimulator:
    """Test pre-trade risk simulator endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed")
    
    def test_risk_simulate_endpoint_exists(self):
        """GET /api/trading/risk-simulate - endpoint should exist"""
        response = self.session.get(f"{BASE_URL}/api/trading/risk-simulate", params={
            "symbol": "EURUSD",
            "direction": "buy",
            "lot_size": 0.1
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ GET /api/trading/risk-simulate - Endpoint exists and returns 200")
    
    def test_risk_simulate_returns_scenarios(self):
        """GET /api/trading/risk-simulate - should return price scenarios"""
        response = self.session.get(f"{BASE_URL}/api/trading/risk-simulate", params={
            "symbol": "BTCUSD",
            "direction": "buy",
            "lot_size": 0.1
        })
        data = response.json()
        
        assert 'scenarios' in data, "Missing scenarios field"
        assert isinstance(data['scenarios'], list), "Scenarios should be a list"
        assert len(data['scenarios']) > 0, "Should have at least one scenario"
        
        # Check scenario structure
        scenario = data['scenarios'][0]
        assert 'change_pct' in scenario, "Scenario missing change_pct"
        assert 'price' in scenario, "Scenario missing price"
        assert 'pl' in scenario, "Scenario missing pl"
        assert 'balance_after' in scenario, "Scenario missing balance_after"
        
        print(f"✅ GET /api/trading/risk-simulate - Returns {len(data['scenarios'])} scenarios")
    
    def test_risk_simulate_with_sl_tp(self):
        """GET /api/trading/risk-simulate - should calculate SL loss and TP gain"""
        prices = self.session.get(f"{BASE_URL}/api/trading/prices").json()
        current_price = prices['EURUSD']['ask']
        sl_price = round(current_price - 0.0050, 5)
        tp_price = round(current_price + 0.0100, 5)
        
        response = self.session.get(f"{BASE_URL}/api/trading/risk-simulate", params={
            "symbol": "EURUSD",
            "direction": "buy",
            "lot_size": 0.1,
            "stop_loss": sl_price,
            "take_profit": tp_price
        })
        data = response.json()
        
        assert 'sl_loss' in data, "Missing sl_loss field"
        assert 'tp_gain' in data, "Missing tp_gain field"
        assert data['sl_loss'] is not None, "sl_loss should not be None when SL provided"
        assert data['tp_gain'] is not None, "tp_gain should not be None when TP provided"
        assert data['sl_loss'] < 0, "sl_loss should be negative"
        assert data['tp_gain'] > 0, "tp_gain should be positive"
        
        print(f"✅ GET /api/trading/risk-simulate - SL loss: ${data['sl_loss']}, TP gain: ${data['tp_gain']}")
    
    def test_risk_simulate_returns_rr_ratio(self):
        """GET /api/trading/risk-simulate - should return risk/reward ratio"""
        prices = self.session.get(f"{BASE_URL}/api/trading/prices").json()
        current_price = prices['XAUUSD']['ask']
        sl_price = round(current_price - 5, 2)
        tp_price = round(current_price + 10, 2)
        
        response = self.session.get(f"{BASE_URL}/api/trading/risk-simulate", params={
            "symbol": "XAUUSD",
            "direction": "buy",
            "lot_size": 0.1,
            "stop_loss": sl_price,
            "take_profit": tp_price
        })
        data = response.json()
        
        assert 'rr_ratio' in data, "Missing rr_ratio field"
        assert 'risk_pct' in data, "Missing risk_pct field"
        
        if data['rr_ratio'] is not None:
            assert data['rr_ratio'] > 0, "R:R ratio should be positive"
        
        print(f"✅ GET /api/trading/risk-simulate - R:R ratio: 1:{data['rr_ratio']}, Risk: {data['risk_pct']}%")
    
    def test_risk_simulate_returns_margin_info(self):
        """GET /api/trading/risk-simulate - should return margin information"""
        response = self.session.get(f"{BASE_URL}/api/trading/risk-simulate", params={
            "symbol": "EURUSD",
            "direction": "buy",
            "lot_size": 0.5
        })
        data = response.json()
        
        assert 'entry_price' in data, "Missing entry_price"
        assert 'margin' in data, "Missing margin"
        assert 'margin_pct' in data, "Missing margin_pct"
        assert 'balance' in data, "Missing balance"
        
        print(f"✅ GET /api/trading/risk-simulate - Entry: {data['entry_price']}, Margin: ${data['margin']} ({data['margin_pct']}%)")


class TestLearningCenter:
    """Test learning center with 5 mini-modules"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed")
    
    def test_get_learning_endpoint_exists(self):
        """GET /api/trading/learning - endpoint should exist"""
        response = self.session.get(f"{BASE_URL}/api/trading/learning")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ GET /api/trading/learning - Endpoint exists and returns 200")
    
    def test_learning_returns_5_modules(self):
        """GET /api/trading/learning - should return 5 learning modules"""
        response = self.session.get(f"{BASE_URL}/api/trading/learning")
        data = response.json()
        
        assert isinstance(data, list), "Learning modules should be a list"
        assert len(data) == 5, f"Expected 5 modules, got {len(data)}"
        
        print(f"✅ GET /api/trading/learning - Returns {len(data)} modules")
    
    def test_learning_modules_have_required_fields(self):
        """GET /api/trading/learning - each module should have required fields"""
        response = self.session.get(f"{BASE_URL}/api/trading/learning")
        data = response.json()
        
        required_fields = ['id', 'title', 'duration', 'level', 'content', 'completed']
        
        for module in data:
            for field in required_fields:
                assert field in module, f"Module missing field: {field}"
        
        print("✅ GET /api/trading/learning - All modules have required fields")
    
    def test_learning_modules_have_correct_ids(self):
        """GET /api/trading/learning - should have the 5 expected module IDs"""
        response = self.session.get(f"{BASE_URL}/api/trading/learning")
        data = response.json()
        
        expected_ids = ['intro', 'sl_tp', 'risk', 'analysis', 'psychology']
        actual_ids = [m['id'] for m in data]
        
        for expected_id in expected_ids:
            assert expected_id in actual_ids, f"Missing module: {expected_id}"
        
        print(f"✅ GET /api/trading/learning - All 5 module IDs present: {expected_ids}")
    
    def test_complete_learning_module(self):
        """POST /api/trading/learning/{id}/complete - should mark module as completed"""
        # Complete the 'intro' module
        response = self.session.post(f"{BASE_URL}/api/trading/learning/intro/complete")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'message' in data, "Missing message field"
        
        # Verify it's marked as completed
        modules = self.session.get(f"{BASE_URL}/api/trading/learning").json()
        intro_module = next((m for m in modules if m['id'] == 'intro'), None)
        assert intro_module is not None
        assert intro_module['completed'] == True, "Module should be marked as completed"
        
        print("✅ POST /api/trading/learning/intro/complete - Module marked as completed")
    
    def test_complete_invalid_module(self):
        """POST /api/trading/learning/{id}/complete - should return 404 for invalid module"""
        response = self.session.post(f"{BASE_URL}/api/trading/learning/invalid_module/complete")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ POST /api/trading/learning/invalid/complete - Returns 404 for invalid module")


class TestReplayMode:
    """Test replay mode for practicing on historical charts"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed")
    
    def test_get_replay_endpoint_exists(self):
        """GET /api/trading/replay - endpoint should exist"""
        response = self.session.get(f"{BASE_URL}/api/trading/replay", params={
            "symbol": "BTCUSD"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ GET /api/trading/replay - Endpoint exists and returns 200")
    
    def test_replay_returns_200_candles(self):
        """GET /api/trading/replay - should return 200 candles"""
        response = self.session.get(f"{BASE_URL}/api/trading/replay", params={
            "symbol": "BTCUSD"
        })
        data = response.json()
        
        assert 'candles' in data, "Missing candles field"
        assert 'symbol' in data, "Missing symbol field"
        assert 'total' in data, "Missing total field"
        
        assert len(data['candles']) == 200, f"Expected 200 candles, got {len(data['candles'])}"
        assert data['total'] == 200, f"Total should be 200, got {data['total']}"
        
        print(f"✅ GET /api/trading/replay - Returns {len(data['candles'])} candles")
    
    def test_replay_candles_have_ohlc(self):
        """GET /api/trading/replay - candles should have OHLC data"""
        response = self.session.get(f"{BASE_URL}/api/trading/replay", params={
            "symbol": "EURUSD"
        })
        data = response.json()
        
        candle = data['candles'][0]
        assert 'time' in candle, "Candle missing time"
        assert 'open' in candle, "Candle missing open"
        assert 'high' in candle, "Candle missing high"
        assert 'low' in candle, "Candle missing low"
        assert 'close' in candle, "Candle missing close"
        
        # Verify OHLC logic
        assert candle['high'] >= candle['low'], "High should be >= Low"
        assert candle['high'] >= candle['open'], "High should be >= Open"
        assert candle['high'] >= candle['close'], "High should be >= Close"
        assert candle['low'] <= candle['open'], "Low should be <= Open"
        assert candle['low'] <= candle['close'], "Low should be <= Close"
        
        print("✅ GET /api/trading/replay - Candles have valid OHLC data")
    
    def test_replay_works_for_different_symbols(self):
        """GET /api/trading/replay - should work for all supported symbols"""
        symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD', 'ETHUSD', 'XAUUSD']
        
        for symbol in symbols:
            response = self.session.get(f"{BASE_URL}/api/trading/replay", params={
                "symbol": symbol
            })
            assert response.status_code == 200, f"Failed for {symbol}"
            data = response.json()
            assert data['symbol'] == symbol
            assert len(data['candles']) == 200
        
        print(f"✅ GET /api/trading/replay - Works for all 6 symbols")
    
    def test_replay_invalid_symbol(self):
        """GET /api/trading/replay - should return 400 for invalid symbol"""
        response = self.session.get(f"{BASE_URL}/api/trading/replay", params={
            "symbol": "INVALID"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✅ GET /api/trading/replay - Returns 400 for invalid symbol")


class TestHistoryCloseReason:
    """Test that history shows close reason (SL/TP/Manual)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and reset"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.session.post(f"{BASE_URL}/api/trading/reset")
        else:
            pytest.skip("Authentication failed")
    
    def test_manual_close_shows_reason(self):
        """Manually closed trade should show 'manual' as close_reason"""
        # Open and close a trade manually
        open_res = self.session.post(f"{BASE_URL}/api/trading/open", json={
            "symbol": "EURUSD",
            "direction": "buy",
            "lot_size": 0.1
        })
        trade_id = open_res.json()['trade']['id']
        
        self.session.post(f"{BASE_URL}/api/trading/close", json={
            "trade_id": trade_id
        })
        
        # Check history
        history = self.session.get(f"{BASE_URL}/api/trading/history").json()
        closed_trade = next((h for h in history if h['id'] == trade_id), None)
        
        assert closed_trade is not None, "Trade should be in history"
        assert 'close_reason' in closed_trade, "Missing close_reason field"
        assert closed_trade['close_reason'] == 'manual', f"Expected 'manual', got {closed_trade['close_reason']}"
        
        print("✅ Manual close shows close_reason='manual' in history")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
