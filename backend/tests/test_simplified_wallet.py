"""
Test Simplified Binance Wallet - Uses REAL user balances + Binance prices
Tests the rewritten /api/binance/wallet endpoint that:
1. Gets user's REAL platform balance (checking=available, savings=locked)
2. Converts to crypto equivalents using REAL Binance prices
3. Returns simplified structure with 2 summary values (available + locked)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"
TEST_USER_EMAIL = "test.bronce@test.com"
TEST_USER_PASSWORD = "Test1234!"

# Expected values for admin user
ADMIN_EXPECTED_AVAILABLE_USD = 100000  # $100,000 from checking
ADMIN_EXPECTED_LOCKED_USD = 50000      # $50,000 from savings
ADMIN_EXPECTED_TOTAL_USD = 150000      # $150,000 total

# Allocation percentages
ALLOCATIONS = {
    'BTC': 0.40,  # 40%
    'ETH': 0.25,  # 25%
    'BNB': 0.12,  # 12%
    'SOL': 0.08,  # 8%
    'XRP': 0.05,  # 5%
    'ADA': 0.03,  # 3%
    'DOGE': 0.02, # 2%
    'DOT': 0.02,  # 2%
    'AVAX': 0.02, # 2%
    'LINK': 0.01, # 1%
}


class TestSimplifiedWallet:
    """Test the simplified Binance wallet endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def test_user_token(self):
        """Get test user authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Test user login failed: {response.status_code} - {response.text}")
    
    def test_wallet_requires_auth(self):
        """Test that /api/binance/wallet requires authentication"""
        response = requests.get(f"{BASE_URL}/api/binance/wallet")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ GET /api/binance/wallet requires authentication")
    
    def test_admin_wallet_structure(self, admin_token):
        """Test wallet response structure for admin user"""
        response = requests.get(
            f"{BASE_URL}/api/binance/wallet",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check required fields exist
        required_fields = [
            'total_value_usd', 'total_available_usd', 'total_locked_usd',
            'assets', 'distribution', 'top_assets', 'updated_at'
        ]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"✅ Wallet response has all required fields: {required_fields}")
    
    def test_admin_wallet_balances(self, admin_token):
        """Test that admin wallet shows correct USD balances from accounts"""
        response = requests.get(
            f"{BASE_URL}/api/binance/wallet",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify balances match expected values
        total_available = data.get('total_available_usd', 0)
        total_locked = data.get('total_locked_usd', 0)
        total_value = data.get('total_value_usd', 0)
        
        print(f"  Admin wallet balances:")
        print(f"    total_available_usd: ${total_available:,.2f} (expected: ${ADMIN_EXPECTED_AVAILABLE_USD:,.2f})")
        print(f"    total_locked_usd: ${total_locked:,.2f} (expected: ${ADMIN_EXPECTED_LOCKED_USD:,.2f})")
        print(f"    total_value_usd: ${total_value:,.2f} (expected: ${ADMIN_EXPECTED_TOTAL_USD:,.2f})")
        
        # Allow some tolerance for rounding
        assert abs(total_available - ADMIN_EXPECTED_AVAILABLE_USD) < 1, \
            f"Available USD mismatch: {total_available} != {ADMIN_EXPECTED_AVAILABLE_USD}"
        assert abs(total_locked - ADMIN_EXPECTED_LOCKED_USD) < 1, \
            f"Locked USD mismatch: {total_locked} != {ADMIN_EXPECTED_LOCKED_USD}"
        assert abs(total_value - ADMIN_EXPECTED_TOTAL_USD) < 1, \
            f"Total USD mismatch: {total_value} != {ADMIN_EXPECTED_TOTAL_USD}"
        
        print("✅ Admin wallet balances match expected values ($100k available, $50k locked)")
    
    def test_admin_wallet_assets_allocation(self, admin_token):
        """Test that assets follow correct allocation percentages"""
        response = requests.get(
            f"{BASE_URL}/api/binance/wallet",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assets = data.get('assets', [])
        total_usd = data.get('total_value_usd', 0)
        
        assert len(assets) >= 5, f"Expected at least 5 assets, got {len(assets)}"
        
        print(f"  Asset allocations (total: ${total_usd:,.2f}):")
        for asset in assets[:5]:  # Check top 5
            coin = asset.get('coin')
            value_usd = asset.get('value_usd', 0)
            expected_pct = ALLOCATIONS.get(coin, 0)
            expected_value = total_usd * expected_pct
            
            print(f"    {coin}: ${value_usd:,.2f} (expected ~${expected_value:,.2f} = {expected_pct*100}%)")
            
            # Allow 5% tolerance for rounding
            if expected_value > 0:
                assert abs(value_usd - expected_value) / expected_value < 0.05, \
                    f"{coin} value mismatch: {value_usd} vs expected {expected_value}"
        
        print("✅ Asset allocations match expected percentages (BTC 40%, ETH 25%, BNB 12%...)")
    
    def test_admin_wallet_btc_value(self, admin_token):
        """Test BTC allocation is 40% of total ($60,000)"""
        response = requests.get(
            f"{BASE_URL}/api/binance/wallet",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assets = data.get('assets', [])
        btc = next((a for a in assets if a['coin'] == 'BTC'), None)
        
        assert btc is not None, "BTC not found in assets"
        
        expected_btc_value = ADMIN_EXPECTED_TOTAL_USD * 0.40  # $60,000
        actual_btc_value = btc.get('value_usd', 0)
        
        print(f"  BTC value: ${actual_btc_value:,.2f} (expected: ${expected_btc_value:,.2f})")
        
        assert abs(actual_btc_value - expected_btc_value) < 100, \
            f"BTC value mismatch: {actual_btc_value} != {expected_btc_value}"
        
        print("✅ BTC value is $60,000 (40% of $150k)")
    
    def test_admin_wallet_eth_value(self, admin_token):
        """Test ETH allocation is 25% of total ($37,500)"""
        response = requests.get(
            f"{BASE_URL}/api/binance/wallet",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assets = data.get('assets', [])
        eth = next((a for a in assets if a['coin'] == 'ETH'), None)
        
        assert eth is not None, "ETH not found in assets"
        
        expected_eth_value = ADMIN_EXPECTED_TOTAL_USD * 0.25  # $37,500
        actual_eth_value = eth.get('value_usd', 0)
        
        print(f"  ETH value: ${actual_eth_value:,.2f} (expected: ${expected_eth_value:,.2f})")
        
        assert abs(actual_eth_value - expected_eth_value) < 100, \
            f"ETH value mismatch: {actual_eth_value} != {expected_eth_value}"
        
        print("✅ ETH value is $37,500 (25% of $150k)")
    
    def test_admin_wallet_real_prices(self, admin_token):
        """Test that prices are real (non-zero) from Binance"""
        response = requests.get(
            f"{BASE_URL}/api/binance/wallet",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assets = data.get('assets', [])
        
        print("  Real Binance prices:")
        for asset in assets[:5]:
            coin = asset.get('coin')
            price = asset.get('price', 0)
            price_change = asset.get('price_change_pct', 0)
            
            print(f"    {coin}: ${price:,.2f} ({price_change:+.2f}%)")
            
            assert price > 0, f"{coin} price is 0 or negative"
        
        # BTC should be > $10,000
        btc = next((a for a in assets if a['coin'] == 'BTC'), None)
        if btc:
            assert btc.get('price', 0) > 10000, f"BTC price unrealistic: {btc.get('price')}"
        
        print("✅ Prices are real from Binance (BTC > $10,000)")
    
    def test_admin_wallet_distribution_chart(self, admin_token):
        """Test distribution data for pie chart"""
        response = requests.get(
            f"{BASE_URL}/api/binance/wallet",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        distribution = data.get('distribution', [])
        
        assert len(distribution) >= 5, f"Expected at least 5 distribution entries, got {len(distribution)}"
        
        print("  Distribution chart data:")
        for d in distribution[:5]:
            coin = d.get('coin')
            pct = d.get('percentage', 0)
            value = d.get('value', 0)
            print(f"    {coin}: {pct}% (${value:,.2f})")
            
            # Check structure
            assert 'coin' in d, "Missing 'coin' in distribution"
            assert 'percentage' in d, "Missing 'percentage' in distribution"
            assert 'value' in d, "Missing 'value' in distribution"
        
        # BTC should be 40%
        btc_dist = next((d for d in distribution if d['coin'] == 'BTC'), None)
        if btc_dist:
            assert abs(btc_dist.get('percentage', 0) - 40) < 1, \
                f"BTC percentage mismatch: {btc_dist.get('percentage')} != 40"
        
        print("✅ Distribution chart data correct (BTC 40%, ETH 25%, BNB 12%)")
    
    def test_admin_wallet_top_assets(self, admin_token):
        """Test top 5 assets are returned"""
        response = requests.get(
            f"{BASE_URL}/api/binance/wallet",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        top_assets = data.get('top_assets', [])
        
        assert len(top_assets) == 5, f"Expected 5 top assets, got {len(top_assets)}"
        
        expected_order = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP']
        actual_order = [a['coin'] for a in top_assets]
        
        print(f"  Top 5 assets: {actual_order}")
        assert actual_order == expected_order, f"Top assets order mismatch: {actual_order} != {expected_order}"
        
        print("✅ Top 5 assets: BTC, ETH, BNB, SOL, XRP")
    
    def test_test_user_wallet_zero_balance(self, test_user_token):
        """Test that test user (€0 balance) shows $0 everywhere"""
        response = requests.get(
            f"{BASE_URL}/api/binance/wallet",
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        
        total_available = data.get('total_available_usd', 0)
        total_locked = data.get('total_locked_usd', 0)
        total_value = data.get('total_value_usd', 0)
        
        print(f"  Test user wallet balances:")
        print(f"    total_available_usd: ${total_available:,.2f}")
        print(f"    total_locked_usd: ${total_locked:,.2f}")
        print(f"    total_value_usd: ${total_value:,.2f}")
        
        # Test user should have $0 or very small balance
        assert total_value < 100, f"Test user should have ~$0 balance, got ${total_value}"
        
        print("✅ Test user (test.bronce@test.com) has $0 balance as expected")


class TestBinancePricesEndpoint:
    """Test the Binance prices endpoint"""
    
    def test_binance_prices_available(self):
        """Test /api/binance/prices returns real prices"""
        response = requests.get(f"{BASE_URL}/api/binance/prices")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Check BTC price exists and is realistic
        btc_price = data.get('BTC', {}).get('price', 0)
        assert btc_price > 10000, f"BTC price unrealistic: {btc_price}"
        
        print(f"✅ /api/binance/prices returns real prices (BTC: ${btc_price:,.2f})")
    
    def test_binance_tickers_available(self):
        """Test /api/binance/tickers returns 24h data"""
        response = requests.get(f"{BASE_URL}/api/binance/tickers")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Check BTC ticker data
        btc = data.get('BTC', {})
        assert 'price' in btc, "Missing 'price' in BTC ticker"
        assert 'price_change_pct' in btc, "Missing 'price_change_pct' in BTC ticker"
        
        print(f"✅ /api/binance/tickers returns 24h data (BTC change: {btc.get('price_change_pct', 0):+.2f}%)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
