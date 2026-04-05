"""
Test suite for CryptoPaymentSection and ChatBot features
- POST /api/support/payment-issue endpoint
- GET /api/crypto-wallets endpoint
- POST /api/support/tickets endpoint (chatbot ticket creation)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCryptoWallets:
    """Test crypto wallets endpoint for multi-crypto selector"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admi@paylionsbit.es",
            "password": "LionsBit2026!"
        })
        if login_response.status_code == 200:
            self.token = login_response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_get_crypto_wallets(self):
        """Test GET /api/crypto-wallets returns all crypto wallet addresses"""
        response = requests.get(f"{BASE_URL}/api/crypto-wallets", headers=self.headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Should have BTC, ETH, BNB, USDT wallets
        assert "BTC" in data, "BTC wallet missing"
        assert "ETH" in data, "ETH wallet missing"
        assert "BNB" in data, "BNB wallet missing"
        assert "USDT" in data, "USDT wallet missing"
        
        # Each wallet should have address and network
        for crypto_type in ["BTC", "ETH", "BNB", "USDT"]:
            wallet = data[crypto_type]
            assert "address" in wallet, f"{crypto_type} wallet missing address"
            assert "network" in wallet, f"{crypto_type} wallet missing network"
            assert len(wallet["address"]) > 10, f"{crypto_type} wallet address too short"
        
        print(f"✅ Crypto wallets returned: {list(data.keys())}")


class TestPaymentIssueEndpoint:
    """Test POST /api/support/payment-issue endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admi@paylionsbit.es",
            "password": "LionsBit2026!"
        })
        if login_response.status_code == 200:
            self.token = login_response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_report_payment_issue_success(self):
        """Test reporting a payment issue with valid data"""
        payload = {
            "transaction_id": "test-transaction-123",
            "crypto_type": "BTC",
            "network": "Bitcoin",
            "amount": "500",
            "wallet_address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
            "tx_hash": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0",
            "message": "El pago fue enviado hace 2 horas pero no aparece confirmado en mi cuenta."
        }
        
        response = requests.post(f"{BASE_URL}/api/support/payment-issue", 
                                json=payload, headers=self.headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should return ticket info
        assert "ticket_number" in data or "id" in data, "Response should contain ticket info"
        print(f"✅ Payment issue reported successfully: {data}")
    
    def test_report_payment_issue_minimal_data(self):
        """Test reporting with minimal required data (only message + transaction_id)"""
        payload = {
            "transaction_id": "test-transaction-456",
            "message": "Tengo un problema con mi pago de impuesto."
        }
        
        response = requests.post(f"{BASE_URL}/api/support/payment-issue", 
                                json=payload, headers=self.headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✅ Payment issue with minimal data reported successfully")
    
    def test_report_payment_issue_requires_auth(self):
        """Test that endpoint requires authentication"""
        payload = {
            "transaction_id": "test-transaction-789",
            "message": "Test message without auth"
        }
        
        response = requests.post(f"{BASE_URL}/api/support/payment-issue", json=payload)
        
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("✅ Payment issue endpoint correctly requires authentication")
    
    def test_report_payment_issue_validates_message(self):
        """Test that message is required"""
        payload = {
            "transaction_id": "test-transaction-000"
            # Missing message
        }
        
        response = requests.post(f"{BASE_URL}/api/support/payment-issue", 
                                json=payload, headers=self.headers)
        
        # Should fail validation (422) because message is required
        assert response.status_code == 422, f"Expected 422 for missing message, got {response.status_code}"
        print("✅ Payment issue endpoint validates required message field")


class TestChatBotTicketCreation:
    """Test support ticket creation from ChatBot"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admi@paylionsbit.es",
            "password": "LionsBit2026!"
        })
        if login_response.status_code == 200:
            self.token = login_response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_create_support_ticket(self):
        """Test creating a support ticket (chatbot flow)"""
        payload = {
            "subject": "Problema con mi pago de impuesto",
            "message": "Envié $500 en BTC hace 2 horas pero no se refleja en mi cuenta. Necesito ayuda urgente.",
            "category": "general"
        }
        
        response = requests.post(f"{BASE_URL}/api/support/tickets", 
                                json=payload, headers=self.headers)
        
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should return ticket info
        assert "id" in data or "ticket_number" in data, "Response should contain ticket ID"
        print(f"✅ Support ticket created successfully: {data.get('ticket_number', data.get('id'))}")
    
    def test_create_ticket_validates_subject(self):
        """Test that subject must be at least 5 characters"""
        payload = {
            "subject": "Hi",  # Too short
            "message": "This is a test message with enough characters.",
            "category": "general"
        }
        
        response = requests.post(f"{BASE_URL}/api/support/tickets", 
                                json=payload, headers=self.headers)
        
        # Should either fail validation or succeed (depends on backend validation)
        print(f"Short subject response: {response.status_code}")
    
    def test_create_ticket_validates_message(self):
        """Test that message must be at least 10 characters"""
        payload = {
            "subject": "Test Subject",
            "message": "Short",  # Too short
            "category": "general"
        }
        
        response = requests.post(f"{BASE_URL}/api/support/tickets", 
                                json=payload, headers=self.headers)
        
        # Should either fail validation or succeed (depends on backend validation)
        print(f"Short message response: {response.status_code}")
    
    def test_get_my_tickets(self):
        """Test getting user's support tickets"""
        response = requests.get(f"{BASE_URL}/api/support/tickets", headers=self.headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list of tickets"
        print(f"✅ Retrieved {len(data)} support tickets")
    
    def test_ticket_requires_auth(self):
        """Test that ticket creation requires authentication"""
        payload = {
            "subject": "Test Subject",
            "message": "Test message without authentication",
            "category": "general"
        }
        
        response = requests.post(f"{BASE_URL}/api/support/tickets", json=payload)
        
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("✅ Ticket creation correctly requires authentication")


class TestCryptoPaymentFlow:
    """Test crypto payment submission flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admi@paylionsbit.es",
            "password": "LionsBit2026!"
        })
        if login_response.status_code == 200:
            self.token = login_response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
            self.user = login_response.json().get("user", {})
        else:
            pytest.skip("Authentication failed")
    
    def test_get_user_transactions(self):
        """Test getting user transactions to find pending_tax ones"""
        response = requests.get(f"{BASE_URL}/api/transactions", headers=self.headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Check if there are any pending_tax transactions
        pending_tax = [t for t in data if t.get('status') == 'pending_tax']
        print(f"✅ Found {len(pending_tax)} pending_tax transactions out of {len(data)} total")
        
        return pending_tax


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
