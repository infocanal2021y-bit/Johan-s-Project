"""
Test Binance Wallet Integration
- GET /api/binance/prices - Real-time prices from Binance
- GET /api/binance/tickers - 24h ticker data
- GET /api/binance/wallet - User's simulated wallet with live prices
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"
TEST_USER_EMAIL = "test.bronce@test.com"
TEST_USER_PASSWORD = "Test1234!"

# Expected coins in wallet
EXPECTED_COINS = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'LINK']


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def test_user_token():
    """Get test user authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Test user login failed: {response.status_code} - {response.text}")


class TestBinancePrices:
    """Test GET /api/binance/prices endpoint"""
    
    def test_prices_returns_200(self):
        """Prices endpoint should return 200 OK"""
        response = requests.get(f"{BASE_URL}/api/binance/prices")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    def test_prices_returns_expected_coins(self):
        """Prices should include BTC, ETH, BNB, SOL, etc."""
        response = requests.get(f"{BASE_URL}/api/binance/prices")
        assert response.status_code == 200
        data = response.json()
        
        # Check that we have price data for expected coins
        for coin in ['BTC', 'ETH', 'BNB', 'SOL']:
            assert coin in data, f"Missing {coin} in prices"
            assert 'price' in data[coin], f"Missing price for {coin}"
            assert data[coin]['price'] > 0, f"{coin} price should be > 0"
    
    def test_prices_structure(self):
        """Each price entry should have symbol, coin, name, price"""
        response = requests.get(f"{BASE_URL}/api/binance/prices")
        assert response.status_code == 200
        data = response.json()
        
        if 'BTC' in data:
            btc = data['BTC']
            assert 'symbol' in btc, "Missing symbol field"
            assert 'coin' in btc, "Missing coin field"
            assert 'name' in btc, "Missing name field"
            assert 'price' in btc, "Missing price field"
            assert btc['coin'] == 'BTC'
            assert btc['name'] == 'Bitcoin'


class TestBinanceTickers:
    """Test GET /api/binance/tickers endpoint"""
    
    def test_tickers_returns_200(self):
        """Tickers endpoint should return 200 OK"""
        response = requests.get(f"{BASE_URL}/api/binance/tickers")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    def test_tickers_returns_24h_data(self):
        """Tickers should include 24h change data"""
        response = requests.get(f"{BASE_URL}/api/binance/tickers")
        assert response.status_code == 200
        data = response.json()
        
        # Check BTC ticker has 24h data
        if 'BTC' in data:
            btc = data['BTC']
            assert 'price' in btc, "Missing price"
            assert 'price_change_pct' in btc, "Missing price_change_pct"
            assert 'high_24h' in btc, "Missing high_24h"
            assert 'low_24h' in btc, "Missing low_24h"
            assert 'volume' in btc, "Missing volume"
    
    def test_tickers_all_expected_coins(self):
        """Tickers should have data for all 10 tracked coins"""
        response = requests.get(f"{BASE_URL}/api/binance/tickers")
        assert response.status_code == 200
        data = response.json()
        
        for coin in EXPECTED_COINS:
            assert coin in data, f"Missing {coin} in tickers"


class TestBinanceWallet:
    """Test GET /api/binance/wallet endpoint"""
    
    def test_wallet_requires_auth(self):
        """Wallet endpoint should require authentication"""
        response = requests.get(f"{BASE_URL}/api/binance/wallet")
        # 401 or 403 are both acceptable for unauthorized access
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
    
    def test_wallet_returns_200_with_auth(self, admin_token):
        """Wallet should return 200 with valid token"""
        response = requests.get(
            f"{BASE_URL}/api/binance/wallet",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_wallet_has_summary_values(self, admin_token):
        """Wallet should have total_value_usd, total_available_usd, total_locked_usd"""
        response = requests.get(
            f"{BASE_URL}/api/binance/wallet",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert 'total_value_usd' in data, "Missing total_value_usd"
        assert 'total_available_usd' in data, "Missing total_available_usd"
        assert 'total_locked_usd' in data, "Missing total_locked_usd"
        
        # Values should be > 0 (default wallet has assets)
        assert data['total_value_usd'] > 0, "total_value_usd should be > 0"
        assert data['total_available_usd'] > 0, "total_available_usd should be > 0"
    
    def test_wallet_has_assets_array(self, admin_token):
        """Wallet should have assets array with 10 coins"""
        response = requests.get(
            f"{BASE_URL}/api/binance/wallet",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert 'assets' in data, "Missing assets array"
        assert len(data['assets']) >= 10, f"Expected at least 10 assets, got {len(data['assets'])}"
    
    def test_wallet_asset_structure(self, admin_token):
        """Each asset should have coin, name, available, locked, total, price, value_usd"""
        response = requests.get(
            f"{BASE_URL}/api/binance/wallet",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if data['assets']:
            asset = data['assets'][0]
            required_fields = ['coin', 'name', 'available', 'locked', 'total', 'price', 'value_usd', 'price_change_pct']
            for field in required_fields:
                assert field in asset, f"Missing {field} in asset"
    
    def test_wallet_has_distribution(self, admin_token):
        """Wallet should have distribution array for pie chart"""
        response = requests.get(
            f"{BASE_URL}/api/binance/wallet",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert 'distribution' in data, "Missing distribution array"
        assert len(data['distribution']) > 0, "Distribution should not be empty"
        
        # Check distribution structure
        dist = data['distribution'][0]
        assert 'coin' in dist, "Missing coin in distribution"
        assert 'value' in dist, "Missing value in distribution"
        assert 'percentage' in dist, "Missing percentage in distribution"
    
    def test_wallet_has_top_assets(self, admin_token):
        """Wallet should have top_assets array with top 5 coins"""
        response = requests.get(
            f"{BASE_URL}/api/binance/wallet",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert 'top_assets' in data, "Missing top_assets array"
        assert len(data['top_assets']) == 5, f"Expected 5 top assets, got {len(data['top_assets'])}"
    
    def test_wallet_test_user(self, test_user_token):
        """Test user should also get a wallet (auto-created)"""
        response = requests.get(
            f"{BASE_URL}/api/binance/wallet",
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert 'total_value_usd' in data
        assert 'assets' in data
        assert len(data['assets']) >= 10


class TestBinancePriceValues:
    """Test that prices are realistic (sanity checks)"""
    
    def test_btc_price_realistic(self):
        """BTC price should be in realistic range (>10000)"""
        response = requests.get(f"{BASE_URL}/api/binance/prices")
        assert response.status_code == 200
        data = response.json()
        
        if 'BTC' in data:
            btc_price = data['BTC']['price']
            assert btc_price > 10000, f"BTC price {btc_price} seems too low"
            assert btc_price < 500000, f"BTC price {btc_price} seems too high"
    
    def test_eth_price_realistic(self):
        """ETH price should be in realistic range (>100)"""
        response = requests.get(f"{BASE_URL}/api/binance/prices")
        assert response.status_code == 200
        data = response.json()
        
        if 'ETH' in data:
            eth_price = data['ETH']['price']
            assert eth_price > 100, f"ETH price {eth_price} seems too low"
            assert eth_price < 50000, f"ETH price {eth_price} seems too high"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
