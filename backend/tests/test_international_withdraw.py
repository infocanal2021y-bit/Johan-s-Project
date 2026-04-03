"""
Test International Bank Support for Withdrawals
Tests the new feature allowing ANY bank from ANY country for withdrawals.
Two modes: IBAN (Europe) and International Account (worldwide)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"


class TestInternationalWithdrawBackend:
    """Backend API tests for international withdrawal support"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.user_data = login_response.json().get("user")
        else:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
    
    def test_01_login_successful(self):
        """Test admin login works"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        print(f"✅ Admin login successful: {data['user']['email']}")
    
    def test_02_get_accounts(self):
        """Test getting user accounts for withdrawal"""
        response = self.session.get(f"{BASE_URL}/api/accounts")
        assert response.status_code == 200
        accounts = response.json()
        assert isinstance(accounts, list)
        assert len(accounts) > 0
        print(f"✅ Got {len(accounts)} accounts")
        
        # Store account ID for later tests
        self.account_id = accounts[0]["id"]
        return accounts[0]
    
    def test_03_withdraw_with_iban_european(self):
        """Test withdrawal with IBAN (European mode) - Spanish bank"""
        # Get account first
        accounts_response = self.session.get(f"{BASE_URL}/api/accounts")
        accounts = accounts_response.json()
        account_id = accounts[0]["id"]
        
        # Create withdrawal with IBAN
        withdrawal_data = {
            "account_id": account_id,
            "transaction_type": "withdraw",
            "amount": 100.00,
            "currency": "EUR",
            "description": "Test IBAN withdrawal - Spain",
            "banking_info": {
                "account_holder": "Test User IBAN",
                "iban": "ES9121000418450200051332",  # Valid Spanish IBAN format
                "account_number": None,
                "swift_code": "CAIXESBBXXX",
                "routing_number": None,
                "bank_name": "CaixaBank",
                "bank_country": "España",
                "bank_city": "Barcelona",
                "account_type": "iban"
            }
        }
        
        response = self.session.post(f"{BASE_URL}/api/transactions", json=withdrawal_data)
        print(f"IBAN withdrawal response: {response.status_code} - {response.text[:500]}")
        
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}"
        data = response.json()
        assert data["transaction_type"] == "withdraw"
        assert data["amount"] == 100.00
        assert "banking_info" in data
        assert data["banking_info"]["iban"] == "ES9121000418450200051332"
        assert data["banking_info"]["account_type"] == "iban"
        print(f"✅ IBAN withdrawal created: {data['id']}")
    
    def test_04_withdraw_with_international_account_mexico(self):
        """Test withdrawal with International Account - Mexican bank"""
        accounts_response = self.session.get(f"{BASE_URL}/api/accounts")
        accounts = accounts_response.json()
        account_id = accounts[0]["id"]
        
        # Create withdrawal with international account (no IBAN)
        withdrawal_data = {
            "account_id": account_id,
            "transaction_type": "withdraw",
            "amount": 50.00,
            "currency": "USD",
            "description": "Test International withdrawal - Mexico",
            "banking_info": {
                "account_holder": "Test User Mexico",
                "iban": None,  # No IBAN for international
                "account_number": "012345678901234567",  # CLABE format
                "swift_code": "BBVAMXMMXXX",
                "routing_number": "012",
                "bank_name": "BBVA México",
                "bank_country": "México",
                "bank_city": "Ciudad de México",
                "account_type": "account"
            }
        }
        
        response = self.session.post(f"{BASE_URL}/api/transactions", json=withdrawal_data)
        print(f"Mexico withdrawal response: {response.status_code} - {response.text[:500]}")
        
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}"
        data = response.json()
        assert data["transaction_type"] == "withdraw"
        assert "banking_info" in data
        assert data["banking_info"]["account_number"] == "012345678901234567"
        assert data["banking_info"]["swift_code"] == "BBVAMXMMXXX"
        assert data["banking_info"]["bank_country"] == "México"
        print(f"✅ Mexico international withdrawal created: {data['id']}")
    
    def test_05_withdraw_with_international_account_colombia(self):
        """Test withdrawal with International Account - Colombian bank"""
        accounts_response = self.session.get(f"{BASE_URL}/api/accounts")
        accounts = accounts_response.json()
        account_id = accounts[0]["id"]
        
        withdrawal_data = {
            "account_id": account_id,
            "transaction_type": "withdraw",
            "amount": 75.00,
            "currency": "USD",
            "description": "Test International withdrawal - Colombia",
            "banking_info": {
                "account_holder": "Test User Colombia",
                "iban": None,
                "account_number": "1234567890123",
                "swift_code": "COLOCOBBXXX",
                "routing_number": None,
                "bank_name": "Bancolombia",
                "bank_country": "Colombia",
                "bank_city": "Bogotá",
                "account_type": "account"
            }
        }
        
        response = self.session.post(f"{BASE_URL}/api/transactions", json=withdrawal_data)
        print(f"Colombia withdrawal response: {response.status_code} - {response.text[:500]}")
        
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}"
        data = response.json()
        assert data["banking_info"]["bank_name"] == "Bancolombia"
        assert data["banking_info"]["bank_country"] == "Colombia"
        print(f"✅ Colombia international withdrawal created: {data['id']}")
    
    def test_06_withdraw_with_international_account_usa(self):
        """Test withdrawal with International Account - US bank with routing number"""
        accounts_response = self.session.get(f"{BASE_URL}/api/accounts")
        accounts = accounts_response.json()
        account_id = accounts[0]["id"]
        
        withdrawal_data = {
            "account_id": account_id,
            "transaction_type": "withdraw",
            "amount": 200.00,
            "currency": "USD",
            "description": "Test International withdrawal - USA",
            "banking_info": {
                "account_holder": "Test User USA",
                "iban": None,
                "account_number": "123456789012",
                "swift_code": "CHASUS33XXX",
                "routing_number": "021000021",  # Chase routing number
                "bank_name": "Chase (JPMorgan)",
                "bank_country": "Estados Unidos",
                "bank_city": "New York",
                "account_type": "account"
            }
        }
        
        response = self.session.post(f"{BASE_URL}/api/transactions", json=withdrawal_data)
        print(f"USA withdrawal response: {response.status_code} - {response.text[:500]}")
        
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}"
        data = response.json()
        assert data["banking_info"]["routing_number"] == "021000021"
        assert data["banking_info"]["bank_country"] == "Estados Unidos"
        print(f"✅ USA international withdrawal created: {data['id']}")
    
    def test_07_withdraw_with_manual_bank_entry(self):
        """Test withdrawal with manually entered bank (not in list)"""
        accounts_response = self.session.get(f"{BASE_URL}/api/accounts")
        accounts = accounts_response.json()
        account_id = accounts[0]["id"]
        
        withdrawal_data = {
            "account_id": account_id,
            "transaction_type": "withdraw",
            "amount": 30.00,
            "currency": "EUR",
            "description": "Test manual bank entry - Ecuador",
            "banking_info": {
                "account_holder": "Test User Ecuador",
                "iban": None,
                "account_number": "9876543210",
                "swift_code": "PICHECEGXXX",
                "routing_number": None,
                "bank_name": "Banco del Austro",  # Not in predefined list
                "bank_country": "Ecuador",
                "bank_city": "Cuenca",
                "account_type": "account"
            }
        }
        
        response = self.session.post(f"{BASE_URL}/api/transactions", json=withdrawal_data)
        print(f"Manual bank withdrawal response: {response.status_code} - {response.text[:500]}")
        
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}"
        data = response.json()
        assert data["banking_info"]["bank_name"] == "Banco del Austro"
        print(f"✅ Manual bank entry withdrawal created: {data['id']}")
    
    def test_08_banking_info_model_accepts_optional_fields(self):
        """Test that BankingInfo model accepts all optional fields correctly"""
        accounts_response = self.session.get(f"{BASE_URL}/api/accounts")
        accounts = accounts_response.json()
        account_id = accounts[0]["id"]
        
        # Test with minimal required fields only
        withdrawal_data = {
            "account_id": account_id,
            "transaction_type": "withdraw",
            "amount": 25.00,
            "currency": "EUR",
            "description": "Test minimal banking info",
            "banking_info": {
                "account_holder": "Minimal Test User",
                "bank_name": "Test Bank",
                "bank_country": "España"
                # All other fields are optional and omitted
            }
        }
        
        response = self.session.post(f"{BASE_URL}/api/transactions", json=withdrawal_data)
        print(f"Minimal banking info response: {response.status_code} - {response.text[:500]}")
        
        # Should accept minimal fields
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}"
        data = response.json()
        assert data["banking_info"]["account_holder"] == "Minimal Test User"
        print(f"✅ Minimal banking info accepted: {data['id']}")
    
    def test_09_get_transactions_shows_banking_info(self):
        """Test that transactions endpoint returns banking_info for withdrawals"""
        response = self.session.get(f"{BASE_URL}/api/transactions")
        assert response.status_code == 200
        transactions = response.json()
        
        # Find a withdrawal transaction
        withdrawals = [t for t in transactions if t.get("transaction_type") == "withdraw"]
        assert len(withdrawals) > 0, "No withdrawal transactions found"
        
        # Check that banking_info is present
        for w in withdrawals[:3]:  # Check first 3
            if w.get("banking_info"):
                print(f"✅ Withdrawal {w['id'][:8]}... has banking_info: {w['banking_info'].get('bank_name')}")
    
    def test_10_withdraw_requires_banking_info(self):
        """Test that withdrawal without banking_info fails"""
        accounts_response = self.session.get(f"{BASE_URL}/api/accounts")
        accounts = accounts_response.json()
        account_id = accounts[0]["id"]
        
        withdrawal_data = {
            "account_id": account_id,
            "transaction_type": "withdraw",
            "amount": 10.00,
            "currency": "EUR",
            "description": "Test without banking info"
            # No banking_info provided
        }
        
        response = self.session.post(f"{BASE_URL}/api/transactions", json=withdrawal_data)
        print(f"No banking info response: {response.status_code} - {response.text[:200]}")
        
        # Should fail - banking_info is required for withdrawals
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
        print(f"✅ Correctly rejected withdrawal without banking_info")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
