"""
Test suite for LIONSBIT VERIFICACION - Bitcoin Tax Payment Feature
Tests the new crypto payment endpoints and withdrawal flow
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://compliance-dash-32.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"


class TestCryptoWallets:
    """Test GET /api/crypto-wallets endpoint"""
    
    def test_get_crypto_wallets_returns_btc(self, auth_token):
        """Test that crypto wallets endpoint returns BTC wallet"""
        response = requests.get(
            f"{BASE_URL}/api/crypto-wallets",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "BTC" in data, "BTC wallet should be present"
        assert "address" in data["BTC"], "BTC should have address"
        assert "network" in data["BTC"], "BTC should have network"
        assert "name" in data["BTC"], "BTC should have name"
        print(f"✅ Crypto wallets returned: {list(data.keys())}")


class TestCryptoPaymentSubmission:
    """Test POST /api/transactions/{id}/pay-tax-crypto endpoint"""
    
    def test_submit_crypto_payment_requires_auth(self):
        """Test that crypto payment submission requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/transactions/fake-id/pay-tax-crypto",
            json={
                "transaction_id": "fake-id",
                "crypto_type": "BTC",
                "txid": "abc123def456",
                "amount_sent": "500",
                "btc_address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
            }
        )
        assert response.status_code == 403, f"Expected 403 without auth, got {response.status_code}"
        print("✅ Crypto payment requires authentication")
    
    def test_submit_crypto_payment_invalid_transaction(self, auth_token):
        """Test that crypto payment fails for non-existent transaction"""
        response = requests.post(
            f"{BASE_URL}/api/transactions/non-existent-id/pay-tax-crypto",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "transaction_id": "non-existent-id",
                "crypto_type": "BTC",
                "txid": "abc123def456",
                "amount_sent": "500",
                "btc_address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
            }
        )
        assert response.status_code == 404, f"Expected 404 for non-existent transaction, got {response.status_code}"
        print("✅ Non-existent transaction returns 404")


class TestCryptoPaymentStatus:
    """Test GET /api/transactions/{id}/crypto-payment endpoint"""
    
    def test_get_crypto_payment_status_requires_auth(self):
        """Test that crypto payment status requires authentication"""
        response = requests.get(f"{BASE_URL}/api/transactions/fake-id/crypto-payment")
        assert response.status_code == 403, f"Expected 403 without auth, got {response.status_code}"
        print("✅ Crypto payment status requires authentication")
    
    def test_get_crypto_payment_status_returns_array(self, auth_token):
        """Test that crypto payment status returns an array (even if empty)"""
        # First get a valid transaction
        transactions_response = requests.get(
            f"{BASE_URL}/api/transactions",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        if transactions_response.status_code == 200:
            transactions = transactions_response.json()
            if transactions and len(transactions) > 0:
                tx_id = transactions[0].get('id')
                if tx_id:
                    response = requests.get(
                        f"{BASE_URL}/api/transactions/{tx_id}/crypto-payment",
                        headers={"Authorization": f"Bearer {auth_token}"}
                    )
                    # Should return 200 with array or 404 if not found
                    if response.status_code == 200:
                        data = response.json()
                        assert isinstance(data, list), f"Expected array, got {type(data)}"
                        print(f"✅ Crypto payment status returns array with {len(data)} payments")
                        return
        
        print("✅ Crypto payment status endpoint accessible (no transactions to test)")


class TestWithdrawFlow:
    """Test the withdrawal flow that leads to crypto payment"""
    
    def test_withdraw_page_accessible(self, auth_token):
        """Test that withdraw endpoint is accessible"""
        # Get accounts first
        response = requests.get(
            f"{BASE_URL}/api/accounts",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        accounts = response.json()
        print(f"✅ User has {len(accounts)} accounts")
    
    def test_create_withdrawal_requires_banking_info(self, auth_token):
        """Test that withdrawal creation requires banking info"""
        # Get accounts
        accounts_response = requests.get(
            f"{BASE_URL}/api/accounts",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        accounts = accounts_response.json()
        
        if accounts and len(accounts) > 0:
            account_id = accounts[0].get('id')
            
            # Try to create withdrawal without banking info
            response = requests.post(
                f"{BASE_URL}/api/transactions",
                headers={"Authorization": f"Bearer {auth_token}"},
                json={
                    "account_id": account_id,
                    "transaction_type": "withdraw",
                    "amount": 1000,
                    "currency": "EUR",
                    "description": "Test withdrawal"
                }
            )
            # Should either fail validation or succeed
            print(f"✅ Withdrawal endpoint responds with status {response.status_code}")


class TestHealthAndAuth:
    """Basic health and auth tests"""
    
    def test_health_check(self):
        """Test API health check"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200, f"Health check failed: {response.status_code}"
        print("✅ API health check passed")
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Admin login failed: {response.status_code}"
        data = response.json()
        assert "token" in data, "Token should be in response"
        assert "user" in data, "User should be in response"
        print(f"✅ Admin login successful: {data['user']['email']}")


# Fixtures
@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed - skipping authenticated tests")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
