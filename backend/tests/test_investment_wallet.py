"""
Test Investment Wallet Features - LIONSBIT VERIFICACION
Tests for:
- GET /api/accounts/investment-history - Investment history endpoint
- GET /api/accounts/summary/total - Account summary with invested balance
- POST /api/accounts/invest - Investment reservation endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://compliance-dash-32.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"
TEST_USER_EMAIL = "test.bronce@test.com"
TEST_USER_PASSWORD = "Test1234!"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def test_user_token():
    """Get test user authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
    )
    assert response.status_code == 200, f"Test user login failed: {response.text}"
    return response.json()["token"]


class TestInvestmentHistoryEndpoint:
    """Tests for GET /api/accounts/investment-history"""
    
    def test_investment_history_requires_auth(self):
        """Investment history endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/accounts/investment-history")
        assert response.status_code == 403, "Should require authentication"
    
    def test_investment_history_returns_correct_structure(self, admin_token):
        """Investment history returns correct data structure"""
        response = requests.get(
            f"{BASE_URL}/api/accounts/investment-history",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify required fields exist
        assert "total_invested_eur" in data
        assert "total_invested_usd" in data
        assert "status" in data
        assert "count" in data
        assert "history" in data
        
        # Verify data types
        assert isinstance(data["total_invested_eur"], (int, float))
        assert isinstance(data["total_invested_usd"], (int, float))
        assert isinstance(data["status"], str)
        assert isinstance(data["count"], int)
        assert isinstance(data["history"], list)
    
    def test_admin_has_investment_history(self, admin_token):
        """Admin user has investment history with 3 operations"""
        response = requests.get(
            f"{BASE_URL}/api/accounts/investment-history",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Admin should have invested balance > 0
        assert data["total_invested_eur"] > 0 or data["total_invested_usd"] > 0
        
        # Admin should have 3 investment operations
        assert data["count"] == 3
        
        # Status should be 'Fondos reservados'
        assert data["status"] == "Fondos reservados"
    
    def test_investment_history_items_structure(self, admin_token):
        """Each investment history item has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/accounts/investment-history",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["history"]:
            item = data["history"][0]
            assert "id" in item
            assert "amount" in item
            assert "currency" in item
            assert "status" in item
            assert "type" in item
            assert "created_at" in item
            
            # Type should be 'Reserva para inversion'
            assert item["type"] == "Reserva para inversion"


class TestAccountSummaryEndpoint:
    """Tests for GET /api/accounts/summary/total"""
    
    def test_summary_requires_auth(self):
        """Account summary endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/accounts/summary/total")
        assert response.status_code == 403, "Should require authentication"
    
    def test_summary_returns_correct_structure(self, admin_token):
        """Account summary returns correct data structure"""
        response = requests.get(
            f"{BASE_URL}/api/accounts/summary/total",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify required fields
        assert "total" in data
        assert "available" in data
        assert "invested" in data
        assert "accounts" in data
        
        # Verify nested structure
        assert "usd" in data["total"]
        assert "eur" in data["total"]
        assert "usd" in data["available"]
        assert "eur" in data["available"]
        assert "usd" in data["invested"]
        assert "eur" in data["invested"]
    
    def test_admin_has_invested_balance(self, admin_token):
        """Admin user has invested balance > 0"""
        response = requests.get(
            f"{BASE_URL}/api/accounts/summary/total",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Admin should have invested balance
        assert data["invested"]["usd"] > 0 or data["invested"]["eur"] > 0
        
        # Verify specific values (admin has $50,000 USD / €25,900 EUR invested)
        assert data["invested"]["usd"] == 50000.0
        assert data["invested"]["eur"] == 25900.0


class TestInvestEndpoint:
    """Tests for POST /api/accounts/invest"""
    
    def test_invest_requires_auth(self):
        """Invest endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/accounts/invest",
            json={"account_id": "test", "amount": 300, "currency": "EUR"}
        )
        assert response.status_code == 403, "Should require authentication"
    
    def test_invest_minimum_amount(self, admin_token):
        """Investment requires minimum €300"""
        # First get checking account ID
        summary_response = requests.get(
            f"{BASE_URL}/api/accounts/summary/total",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        accounts = summary_response.json()["accounts"]
        checking = next((a for a in accounts if a["account_type"] == "checking"), None)
        
        if checking:
            response = requests.post(
                f"{BASE_URL}/api/accounts/invest",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"account_id": checking["id"], "amount": 100, "currency": "EUR"}
            )
            assert response.status_code == 400
            assert "300" in response.json().get("detail", "")


class TestLoginEndpoint:
    """Tests for POST /api/auth/login"""
    
    def test_admin_login_success(self):
        """Admin can login with correct credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
    
    def test_test_user_login_success(self):
        """Test user can login with correct credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_USER_EMAIL
    
    def test_login_invalid_credentials(self):
        """Login fails with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "wrong@email.com", "password": "wrongpassword"}
        )
        assert response.status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
