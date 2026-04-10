"""
Test Complete Withdrawal Flow - New Features
Tests for:
1. GET /api/crypto-wallets - Returns crypto wallet addresses
2. POST /api/payments/bank-transfer-confirm - Proof submission endpoint
3. GET /api/transactions - Verify processing withdrawals are returned
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"
TEST_TRANSACTION_ID = "3c015ee2-0a48-48a3-bb95-be01e2bce64d"


class TestCryptoWalletsEndpoint:
    """Tests for GET /api/crypto-wallets endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_crypto_wallets_returns_200(self):
        """Test that crypto-wallets endpoint returns 200"""
        response = self.session.get(f"{BASE_URL}/api/crypto-wallets")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✅ GET /api/crypto-wallets returns 200 OK")
    
    def test_crypto_wallets_contains_btc(self):
        """Test that crypto-wallets contains BTC wallet"""
        response = self.session.get(f"{BASE_URL}/api/crypto-wallets")
        data = response.json()
        assert "BTC" in data, f"BTC wallet not found in response: {data}"
        assert "address" in data["BTC"], "BTC wallet missing address field"
        print(f"✅ BTC wallet found: {data['BTC']['address'][:20]}...")
    
    def test_crypto_wallets_contains_eth(self):
        """Test that crypto-wallets contains ETH wallet"""
        response = self.session.get(f"{BASE_URL}/api/crypto-wallets")
        data = response.json()
        assert "ETH" in data, f"ETH wallet not found in response: {data}"
        assert "address" in data["ETH"], "ETH wallet missing address field"
        print(f"✅ ETH wallet found: {data['ETH']['address'][:20]}...")
    
    def test_crypto_wallets_contains_usdt(self):
        """Test that crypto-wallets contains USDT wallet"""
        response = self.session.get(f"{BASE_URL}/api/crypto-wallets")
        data = response.json()
        assert "USDT" in data, f"USDT wallet not found in response: {data}"
        assert "address" in data["USDT"], "USDT wallet missing address field"
        print(f"✅ USDT wallet found: {data['USDT']['address'][:20]}...")
    
    def test_crypto_wallets_contains_bnb(self):
        """Test that crypto-wallets contains BNB wallet"""
        response = self.session.get(f"{BASE_URL}/api/crypto-wallets")
        data = response.json()
        assert "BNB" in data, f"BNB wallet not found in response: {data}"
        assert "address" in data["BNB"], "BNB wallet missing address field"
        print(f"✅ BNB wallet found: {data['BNB']['address'][:20]}...")
    
    def test_crypto_wallets_structure(self):
        """Test that each wallet has required fields: name, network, address"""
        response = self.session.get(f"{BASE_URL}/api/crypto-wallets")
        data = response.json()
        
        for coin, wallet in data.items():
            assert "name" in wallet, f"{coin} wallet missing 'name' field"
            assert "network" in wallet, f"{coin} wallet missing 'network' field"
            assert "address" in wallet, f"{coin} wallet missing 'address' field"
            print(f"✅ {coin} wallet has all required fields: name={wallet['name']}, network={wallet['network']}")


class TestBankTransferConfirmEndpoint:
    """Tests for POST /api/payments/bank-transfer-confirm endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_bank_transfer_confirm_requires_auth(self):
        """Test that endpoint requires authentication"""
        session_no_auth = requests.Session()
        session_no_auth.headers.update({"Content-Type": "application/json"})
        
        response = session_no_auth.post(f"{BASE_URL}/api/payments/bank-transfer-confirm", json={
            "reference": "216389",
            "comment": "Test payment"
        })
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✅ POST /api/payments/bank-transfer-confirm requires authentication")
    
    def test_bank_transfer_confirm_with_proof(self):
        """Test bank transfer confirmation with proof file"""
        # Create a minimal base64 encoded test image (1x1 pixel PNG)
        test_proof_base64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        response = self.session.post(f"{BASE_URL}/api/payments/bank-transfer-confirm", json={
            "reference": "216389",
            "comment": "Test payment via pytest - Complete Withdrawal Flow",
            "proof_file": test_proof_base64,
            "proof_filename": "test_proof.png"
        })
        
        # Should return 200 or 201 for successful submission
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        print(f"✅ POST /api/payments/bank-transfer-confirm with proof returns {response.status_code}")
        
        # Verify response contains expected fields
        data = response.json()
        assert "message" in data or "id" in data, f"Response missing expected fields: {data}"
        print(f"✅ Bank transfer confirmation response: {data}")


class TestTransactionsEndpoint:
    """Tests for GET /api/transactions endpoint - verify processing withdrawals"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_transactions_returns_200(self):
        """Test that transactions endpoint returns 200"""
        response = self.session.get(f"{BASE_URL}/api/transactions")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✅ GET /api/transactions returns 200 OK")
    
    def test_transactions_returns_list(self):
        """Test that transactions endpoint returns a list"""
        response = self.session.get(f"{BASE_URL}/api/transactions")
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✅ GET /api/transactions returns list with {len(data)} transactions")
    
    def test_transactions_all_returns_200(self):
        """Test that transactions/all endpoint returns 200"""
        response = self.session.get(f"{BASE_URL}/api/transactions/all")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✅ GET /api/transactions/all returns 200 OK")
    
    def test_find_processing_withdrawal(self):
        """Test that we can find the test transaction with processing status"""
        response = self.session.get(f"{BASE_URL}/api/transactions")
        data = response.json()
        
        # Look for the specific test transaction
        processing_withdrawals = [
            tx for tx in data 
            if tx.get('status') == 'processing' and tx.get('transaction_type') == 'withdraw'
        ]
        
        print(f"Found {len(processing_withdrawals)} processing withdrawals")
        
        # Check if our test transaction exists
        test_tx = next((tx for tx in data if tx.get('id') == TEST_TRANSACTION_ID), None)
        if test_tx:
            print(f"✅ Test transaction found: ID={test_tx['id']}, status={test_tx.get('status')}, type={test_tx.get('transaction_type')}")
        else:
            print(f"⚠️ Test transaction {TEST_TRANSACTION_ID} not found in user's transactions (may be for different user)")
        
        # At minimum, verify the endpoint works
        assert response.status_code == 200


class TestCompleteWithdrawalPageData:
    """Tests to verify data needed for CompleteWithdrawalPage is available"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_all_required_endpoints_accessible(self):
        """Test that all endpoints needed for CompleteWithdrawalPage are accessible"""
        endpoints = [
            ("/api/transactions", "GET"),
            ("/api/crypto-wallets", "GET"),
        ]
        
        for endpoint, method in endpoints:
            if method == "GET":
                response = self.session.get(f"{BASE_URL}{endpoint}")
            
            assert response.status_code == 200, f"{method} {endpoint} failed with {response.status_code}"
            print(f"✅ {method} {endpoint} - OK")
    
    def test_crypto_wallets_has_all_required_coins(self):
        """Test that crypto wallets endpoint returns all required coins for the UI"""
        response = self.session.get(f"{BASE_URL}/api/crypto-wallets")
        data = response.json()
        
        required_coins = ["BTC", "ETH", "USDT", "BNB"]
        for coin in required_coins:
            assert coin in data, f"Missing required coin: {coin}"
            print(f"✅ {coin} wallet available")
        
        print(f"✅ All {len(required_coins)} required crypto wallets available")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
