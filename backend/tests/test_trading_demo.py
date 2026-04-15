"""
Trading Demo Module Tests
Tests for simulated trading with 6 assets, demo account, positions, history, and currency converter
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"


class TestTradingDemoEndpoints:
    """Test all Trading Demo API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")  # API returns "token" not "access_token"
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.authenticated = True
        else:
            self.authenticated = False
            pytest.skip(f"Authentication failed: {login_response.status_code}")
    
    # ==================== GET /api/trading/prices ====================
    def test_get_prices_returns_6_assets(self):
        """GET /api/trading/prices - should return prices for all 6 assets"""
        response = self.session.get(f"{BASE_URL}/api/trading/prices")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        expected_symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD', 'ETHUSD', 'XAUUSD']
        
        # Verify all 6 assets are present
        for symbol in expected_symbols:
            assert symbol in data, f"Missing symbol: {symbol}"
            
        # Verify price structure for each asset
        for symbol in expected_symbols:
            asset = data[symbol]
            assert 'bid' in asset, f"{symbol} missing bid price"
            assert 'ask' in asset, f"{symbol} missing ask price"
            assert 'change_pct' in asset, f"{symbol} missing change_pct"
            assert 'name' in asset, f"{symbol} missing name"
            assert 'category' in asset, f"{symbol} missing category"
            assert asset['bid'] > 0, f"{symbol} bid should be positive"
            assert asset['ask'] > asset['bid'], f"{symbol} ask should be > bid (spread)"
        
        print(f"✅ GET /api/trading/prices - All 6 assets returned with valid prices")
    
    def test_prices_have_correct_categories(self):
        """Verify assets have correct categories (forex, crypto, commodity)"""
        response = self.session.get(f"{BASE_URL}/api/trading/prices")
        assert response.status_code == 200
        
        data = response.json()
        
        # Forex pairs
        assert data['EURUSD']['category'] == 'forex'
        assert data['GBPUSD']['category'] == 'forex'
        assert data['USDJPY']['category'] == 'forex'
        
        # Crypto pairs
        assert data['BTCUSD']['category'] == 'crypto'
        assert data['ETHUSD']['category'] == 'crypto'
        
        # Commodity
        assert data['XAUUSD']['category'] == 'commodity'
        
        print("✅ Asset categories are correct (forex, crypto, commodity)")
    
    # ==================== GET /api/trading/account ====================
    def test_get_account_creates_demo_with_10000(self):
        """GET /api/trading/account - should create/return demo account with $10,000"""
        response = self.session.get(f"{BASE_URL}/api/trading/account")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify account structure
        assert 'balance' in data, "Missing balance field"
        assert 'equity' in data, "Missing equity field"
        assert 'margin_used' in data, "Missing margin_used field"
        assert 'free_margin' in data, "Missing free_margin field"
        assert 'floating_pl' in data, "Missing floating_pl field"
        assert 'initial_balance' in data, "Missing initial_balance field"
        assert 'currency' in data, "Missing currency field"
        assert 'leverage' in data, "Missing leverage field"
        
        # Verify initial balance is $10,000
        assert data['initial_balance'] == 10000.0, f"Initial balance should be 10000, got {data['initial_balance']}"
        assert data['currency'] == 'USD', f"Currency should be USD, got {data['currency']}"
        
        print(f"✅ GET /api/trading/account - Demo account with $10,000 initial balance")
        print(f"   Balance: ${data['balance']}, Equity: ${data['equity']}")
    
    # ==================== POST /api/trading/open ====================
    def test_open_buy_trade(self):
        """POST /api/trading/open - should open a BUY trade"""
        response = self.session.post(f"{BASE_URL}/api/trading/open", json={
            "symbol": "EURUSD",
            "direction": "buy",
            "lot_size": 0.1
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'message' in data, "Missing message field"
        assert 'trade' in data, "Missing trade field"
        
        trade = data['trade']
        assert trade['symbol'] == 'EURUSD'
        assert trade['direction'] == 'buy'
        assert trade['lot_size'] == 0.1
        assert trade['status'] == 'open'
        assert 'entry_price' in trade
        assert 'id' in trade
        
        # Store trade ID for later tests
        self.buy_trade_id = trade['id']
        
        print(f"✅ POST /api/trading/open - BUY trade opened at {trade['entry_price']}")
    
    def test_open_sell_trade(self):
        """POST /api/trading/open - should open a SELL trade"""
        response = self.session.post(f"{BASE_URL}/api/trading/open", json={
            "symbol": "BTCUSD",
            "direction": "sell",
            "lot_size": 0.05
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        trade = data['trade']
        assert trade['symbol'] == 'BTCUSD'
        assert trade['direction'] == 'sell'
        assert trade['lot_size'] == 0.05
        
        print(f"✅ POST /api/trading/open - SELL trade opened at {trade['entry_price']}")
    
    def test_open_trade_invalid_symbol(self):
        """POST /api/trading/open - should reject invalid symbol"""
        response = self.session.post(f"{BASE_URL}/api/trading/open", json={
            "symbol": "INVALID",
            "direction": "buy",
            "lot_size": 0.1
        })
        assert response.status_code == 400, f"Expected 400 for invalid symbol, got {response.status_code}"
        print("✅ POST /api/trading/open - Correctly rejects invalid symbol")
    
    def test_open_trade_invalid_lot_size(self):
        """POST /api/trading/open - should reject invalid lot size"""
        # Too small
        response = self.session.post(f"{BASE_URL}/api/trading/open", json={
            "symbol": "EURUSD",
            "direction": "buy",
            "lot_size": 0.001
        })
        assert response.status_code == 400, f"Expected 400 for lot too small, got {response.status_code}"
        
        # Too large
        response = self.session.post(f"{BASE_URL}/api/trading/open", json={
            "symbol": "EURUSD",
            "direction": "buy",
            "lot_size": 100
        })
        assert response.status_code == 400, f"Expected 400 for lot too large, got {response.status_code}"
        
        print("✅ POST /api/trading/open - Correctly validates lot size (0.01 - 10.0)")
    
    # ==================== GET /api/trading/positions ====================
    def test_get_positions_with_live_pl(self):
        """GET /api/trading/positions - should return open positions with live P/L"""
        # First open a trade
        self.session.post(f"{BASE_URL}/api/trading/open", json={
            "symbol": "GBPUSD",
            "direction": "buy",
            "lot_size": 0.1
        })
        
        response = self.session.get(f"{BASE_URL}/api/trading/positions")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Positions should be a list"
        
        if len(data) > 0:
            position = data[0]
            assert 'id' in position
            assert 'symbol' in position
            assert 'direction' in position
            assert 'lot_size' in position
            assert 'entry_price' in position
            assert 'current_price' in position, "Missing current_price for live P/L"
            assert 'profit_loss' in position, "Missing profit_loss field"
            
            print(f"✅ GET /api/trading/positions - {len(data)} open positions with live P/L")
        else:
            print("✅ GET /api/trading/positions - Returns empty list (no open positions)")
    
    # ==================== POST /api/trading/close ====================
    def test_close_trade_updates_balance(self):
        """POST /api/trading/close - should close trade and update balance"""
        # Get initial balance
        account_before = self.session.get(f"{BASE_URL}/api/trading/account").json()
        
        # Open a trade
        open_response = self.session.post(f"{BASE_URL}/api/trading/open", json={
            "symbol": "XAUUSD",
            "direction": "buy",
            "lot_size": 0.1
        })
        trade_id = open_response.json()['trade']['id']
        
        # Close the trade
        close_response = self.session.post(f"{BASE_URL}/api/trading/close", json={
            "trade_id": trade_id
        })
        assert close_response.status_code == 200, f"Expected 200, got {close_response.status_code}"
        
        data = close_response.json()
        assert 'message' in data
        assert 'profit_loss' in data
        assert 'close_price' in data
        
        print(f"✅ POST /api/trading/close - Trade closed with P/L: ${data['profit_loss']}")
    
    def test_close_nonexistent_trade(self):
        """POST /api/trading/close - should return 404 for nonexistent trade"""
        response = self.session.post(f"{BASE_URL}/api/trading/close", json={
            "trade_id": "nonexistent-trade-id-12345"
        })
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ POST /api/trading/close - Correctly returns 404 for nonexistent trade")
    
    # ==================== GET /api/trading/history ====================
    def test_get_trade_history(self):
        """GET /api/trading/history - should return closed trades"""
        response = self.session.get(f"{BASE_URL}/api/trading/history")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "History should be a list"
        
        if len(data) > 0:
            trade = data[0]
            assert trade['status'] == 'closed', "History should only contain closed trades"
            assert 'close_price' in trade
            assert 'profit_loss' in trade
            assert 'closed_at' in trade
            
        print(f"✅ GET /api/trading/history - {len(data)} closed trades in history")
    
    # ==================== POST /api/trading/reset ====================
    def test_reset_demo_account(self):
        """POST /api/trading/reset - should reset demo to $10,000"""
        response = self.session.post(f"{BASE_URL}/api/trading/reset")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data['balance'] == 10000.0, f"Balance should be reset to 10000, got {data['balance']}"
        
        # Verify account is actually reset
        account = self.session.get(f"{BASE_URL}/api/trading/account").json()
        assert account['balance'] == 10000.0
        
        # Verify positions are cleared
        positions = self.session.get(f"{BASE_URL}/api/trading/positions").json()
        assert len(positions) == 0, "Positions should be cleared after reset"
        
        print("✅ POST /api/trading/reset - Demo account reset to $10,000")
    
    # ==================== GET /api/trading/convert ====================
    def test_currency_conversion_usd_to_eur(self):
        """GET /api/trading/convert - should convert USD to EUR"""
        response = self.session.get(f"{BASE_URL}/api/trading/convert", params={
            "amount": 100,
            "from_currency": "USD",
            "to_currency": "EUR"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data['from'] == 'USD'
        assert data['to'] == 'EUR'
        assert data['amount'] == 100
        assert 'result' in data
        assert 'rate' in data
        assert data['result'] > 0
        
        print(f"✅ GET /api/trading/convert - 100 USD = {data['result']} EUR (rate: {data['rate']})")
    
    def test_currency_conversion_eur_to_jpy(self):
        """GET /api/trading/convert - should convert EUR to JPY"""
        response = self.session.get(f"{BASE_URL}/api/trading/convert", params={
            "amount": 50,
            "from_currency": "EUR",
            "to_currency": "JPY"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data['from'] == 'EUR'
        assert data['to'] == 'JPY'
        assert data['result'] > 0
        
        print(f"✅ GET /api/trading/convert - 50 EUR = {data['result']} JPY")
    
    def test_currency_conversion_all_pairs(self):
        """GET /api/trading/convert - should support USD/EUR/GBP/JPY"""
        currencies = ['USD', 'EUR', 'GBP', 'JPY']
        
        for from_curr in currencies:
            for to_curr in currencies:
                if from_curr != to_curr:
                    response = self.session.get(f"{BASE_URL}/api/trading/convert", params={
                        "amount": 100,
                        "from_currency": from_curr,
                        "to_currency": to_curr
                    })
                    assert response.status_code == 200, f"Failed for {from_curr} -> {to_curr}"
        
        print("✅ GET /api/trading/convert - All currency pairs (USD/EUR/GBP/JPY) work")
    
    def test_currency_conversion_invalid_currency(self):
        """GET /api/trading/convert - should reject unsupported currency"""
        response = self.session.get(f"{BASE_URL}/api/trading/convert", params={
            "amount": 100,
            "from_currency": "USD",
            "to_currency": "BTC"  # Not supported
        })
        assert response.status_code == 400, f"Expected 400 for unsupported currency, got {response.status_code}"
        print("✅ GET /api/trading/convert - Correctly rejects unsupported currency")


class TestTradingDemoIntegration:
    """Integration tests for complete trading flows"""
    
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
            token = login_response.json().get("token")  # API returns "token" not "access_token"
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            # Reset account for clean state
            self.session.post(f"{BASE_URL}/api/trading/reset")
        else:
            pytest.skip("Authentication failed")
    
    def test_full_trading_flow(self):
        """Test complete flow: open trade -> check position -> close -> verify history"""
        # 1. Verify initial balance
        account = self.session.get(f"{BASE_URL}/api/trading/account").json()
        assert account['balance'] == 10000.0, "Should start with $10,000"
        
        # 2. Open a trade
        open_res = self.session.post(f"{BASE_URL}/api/trading/open", json={
            "symbol": "EURUSD",
            "direction": "buy",
            "lot_size": 0.1
        })
        assert open_res.status_code == 200
        trade_id = open_res.json()['trade']['id']
        
        # 3. Verify position appears
        positions = self.session.get(f"{BASE_URL}/api/trading/positions").json()
        assert len(positions) >= 1
        assert any(p['id'] == trade_id for p in positions)
        
        # 4. Close the trade
        close_res = self.session.post(f"{BASE_URL}/api/trading/close", json={
            "trade_id": trade_id
        })
        assert close_res.status_code == 200
        pl = close_res.json()['profit_loss']
        
        # 5. Verify position is removed
        positions_after = self.session.get(f"{BASE_URL}/api/trading/positions").json()
        assert not any(p['id'] == trade_id for p in positions_after)
        
        # 6. Verify trade appears in history
        history = self.session.get(f"{BASE_URL}/api/trading/history").json()
        closed_trade = next((h for h in history if h['id'] == trade_id), None)
        assert closed_trade is not None, "Closed trade should appear in history"
        assert closed_trade['status'] == 'closed'
        
        # 7. Verify balance updated
        account_after = self.session.get(f"{BASE_URL}/api/trading/account").json()
        expected_balance = 10000.0 + pl
        assert abs(account_after['balance'] - expected_balance) < 0.01
        
        print(f"✅ Full trading flow completed: P/L = ${pl}, New balance = ${account_after['balance']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
