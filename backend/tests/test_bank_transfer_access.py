"""
Test Bank Transfer Access and Confirmation Endpoints
Tests the new bank transfer feature with user-level access restrictions.
- Admin users should have access to bank transfer
- Restricted user (marinini28@gmail.com) should NOT have access
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://compliance-dash-32.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"
RESTRICTED_EMAIL = "marinini28@gmail.com"
RESTRICTED_PASSWORD = "Marina2026!"


class TestBankTransferAccess:
    """Test bank transfer access control endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def get_token(self, email: str, password: str) -> str:
        """Helper to get auth token"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password}
        )
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    # ─── GET /api/payments/bank-transfer-access ───
    
    def test_admin_has_bank_transfer_access(self):
        """Admin user should have access to bank transfer"""
        token = self.get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None, "Admin login failed"
        
        response = self.session.get(
            f"{BASE_URL}/api/payments/bank-transfer-access",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "has_access" in data
        assert data["has_access"] == True, "Admin should have bank transfer access"
    
    def test_restricted_user_no_bank_transfer_access(self):
        """Restricted user (marinini28@gmail.com) should NOT have access"""
        token = self.get_token(RESTRICTED_EMAIL, RESTRICTED_PASSWORD)
        assert token is not None, "Restricted user login failed"
        
        response = self.session.get(
            f"{BASE_URL}/api/payments/bank-transfer-access",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "has_access" in data
        assert data["has_access"] == False, "Restricted user should NOT have bank transfer access"
    
    def test_bank_transfer_access_requires_auth(self):
        """Endpoint should require authentication"""
        response = self.session.get(f"{BASE_URL}/api/payments/bank-transfer-access")
        assert response.status_code in [401, 403], "Should require authentication"
    
    # ─── POST /api/payments/bank-transfer-confirm ───
    
    def test_admin_can_confirm_bank_transfer(self):
        """Admin user should be able to confirm bank transfer"""
        token = self.get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None, "Admin login failed"
        
        response = self.session.post(
            f"{BASE_URL}/api/payments/bank-transfer-confirm",
            headers={"Authorization": f"Bearer {token}"},
            json={"reference": "216389"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "id" in data
        assert data["status"] == "pending_verification"
    
    def test_restricted_user_cannot_confirm_bank_transfer(self):
        """Restricted user should get 403 when trying to confirm bank transfer"""
        token = self.get_token(RESTRICTED_EMAIL, RESTRICTED_PASSWORD)
        assert token is not None, "Restricted user login failed"
        
        response = self.session.post(
            f"{BASE_URL}/api/payments/bank-transfer-confirm",
            headers={"Authorization": f"Bearer {token}"},
            json={"reference": "216389"}
        )
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        data = response.json()
        assert "detail" in data
        assert "acceso" in data["detail"].lower() or "access" in data["detail"].lower()
    
    def test_bank_transfer_confirm_requires_auth(self):
        """Confirm endpoint should require authentication"""
        response = self.session.post(
            f"{BASE_URL}/api/payments/bank-transfer-confirm",
            json={"reference": "216389"}
        )
        assert response.status_code in [401, 403], "Should require authentication"
    
    def test_bank_transfer_confirm_requires_reference(self):
        """Confirm endpoint should require reference field"""
        token = self.get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None, "Admin login failed"
        
        response = self.session.post(
            f"{BASE_URL}/api/payments/bank-transfer-confirm",
            headers={"Authorization": f"Bearer {token}"},
            json={}
        )
        
        assert response.status_code == 422, "Should return 422 for missing reference"


class TestExistingPaymentMethods:
    """Verify existing payment methods still work"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def get_token(self, email: str, password: str) -> str:
        """Helper to get auth token"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password}
        )
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    def test_crypto_wallets_endpoint_still_works(self):
        """GET /api/crypto-wallets should still return wallet addresses"""
        token = self.get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None, "Admin login failed"
        
        response = self.session.get(
            f"{BASE_URL}/api/crypto-wallets",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        # Response is a dict with wallet types as keys (BTC, ETH, BNB, USDT, etc.)
        assert "BTC" in data, "Should have BTC wallet"
        assert "ETH" in data, "Should have ETH wallet"
        assert "USDT" in data, "Should have USDT wallet"
        assert len(data) >= 4, "Should have at least 4 crypto wallets"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
