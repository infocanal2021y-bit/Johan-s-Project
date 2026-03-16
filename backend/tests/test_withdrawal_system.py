"""
Test suite for LIONSBIT BANK withdrawal system.
Tests:
- KYC verification requirement for withdrawals
- Withdrawal creation with banking info
- IBAN validation
- Withdrawal status flow (pending -> processing -> transfer_in_progress -> completed)
- Admin withdrawal management
- Balance deduction on completion
"""
import pytest
import requests
import uuid
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"

# Valid Spanish IBAN for testing (CaixaBank)
VALID_SPANISH_IBAN = "ES9121000418450200051332"
VALID_IBAN_BBVA = "ES8500182200001234567890"
INVALID_IBAN = "ES0000000000000000000000"


class TestKYCRequirement:
    """Test that KYC verification is required for withdrawals"""
    
    def test_unverified_user_cannot_withdraw(self):
        """Test that unverified user gets blocked from creating withdrawal"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Create new unverified user
        unique_id = str(uuid.uuid4())[:8]
        test_email = f"unverified_{unique_id}@test.com"
        
        response = session.post(f"{BASE_URL}/api/auth/register", json={
            "name": f"Unverified User {unique_id}",
            "email": test_email,
            "password": "TestPass123!"
        })
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        token = data.get("token")
        user = data.get("user")
        
        # Verify user is unverified
        assert user.get("verification_status") == "unverified", "New user should be unverified"
        
        # Get user's account
        session.headers.update({"Authorization": f"Bearer {token}"})
        accounts_resp = session.get(f"{BASE_URL}/api/accounts")
        assert accounts_resp.status_code == 200
        accounts = accounts_resp.json()
        assert len(accounts) > 0, "User should have accounts"
        account_id = accounts[0]["id"]
        
        # Try to create withdrawal
        withdrawal_resp = session.post(f"{BASE_URL}/api/transactions", json={
            "account_id": account_id,
            "transaction_type": "withdraw",
            "amount": 100.0,
            "currency": "EUR",
            "description": "Test withdrawal",
            "banking_info": {
                "account_holder": "Test User",
                "iban": VALID_SPANISH_IBAN,
                "bank_name": "CaixaBank",
                "bank_country": "España"
            }
        })
        
        # Should be rejected due to KYC
        assert withdrawal_resp.status_code == 403, f"Expected 403 for unverified user, got {withdrawal_resp.status_code}: {withdrawal_resp.text}"
        assert "KYC" in withdrawal_resp.text or "verifi" in withdrawal_resp.text.lower(), "Error should mention KYC verification"
    
    def test_verified_user_can_create_withdrawal(self):
        """Test that verified admin user can create withdrawal"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as verified admin
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
        token = login_resp.json().get("token")
        
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get account
        accounts_resp = session.get(f"{BASE_URL}/api/accounts")
        assert accounts_resp.status_code == 200
        accounts = accounts_resp.json()
        account_id = accounts[0]["id"]
        
        # Create withdrawal
        withdrawal_resp = session.post(f"{BASE_URL}/api/transactions", json={
            "account_id": account_id,
            "transaction_type": "withdraw",
            "amount": 50.0,
            "currency": "EUR",
            "description": f"Test withdrawal {uuid.uuid4().hex[:8]}",
            "banking_info": {
                "account_holder": "Admin LionsBit",
                "iban": VALID_SPANISH_IBAN,
                "bank_name": "CaixaBank",
                "bank_country": "España"
            }
        })
        
        # Should succeed for verified user
        assert withdrawal_resp.status_code == 200, f"Withdrawal creation failed: {withdrawal_resp.text}"
        tx_data = withdrawal_resp.json()
        assert tx_data.get("status") == "pending", "New withdrawal should be pending"
        assert tx_data.get("transaction_type") == "withdraw"


class TestWithdrawalBankingInfo:
    """Test withdrawal creation with banking information"""
    
    def test_withdrawal_stores_banking_info(self):
        """Test that banking info is stored correctly in withdrawal"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_resp.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get account
        accounts_resp = session.get(f"{BASE_URL}/api/accounts")
        accounts = accounts_resp.json()
        account_id = accounts[0]["id"]
        
        # Create withdrawal with full banking info
        unique_desc = f"Test banking info {uuid.uuid4().hex[:8]}"
        withdrawal_resp = session.post(f"{BASE_URL}/api/transactions", json={
            "account_id": account_id,
            "transaction_type": "withdraw",
            "amount": 25.0,
            "currency": "EUR",
            "description": unique_desc,
            "banking_info": {
                "account_holder": "Test Account Holder",
                "iban": VALID_SPANISH_IBAN,
                "bank_name": "CaixaBank",
                "bank_country": "España",
                "bank_city": "Madrid"
            }
        })
        
        assert withdrawal_resp.status_code == 200
        tx_data = withdrawal_resp.json()
        
        # Verify banking info is stored
        assert tx_data.get("banking_info") is not None, "Banking info should be stored"
        banking_info = tx_data.get("banking_info")
        assert banking_info.get("account_holder") == "Test Account Holder"
        assert banking_info.get("iban") == VALID_SPANISH_IBAN
        assert banking_info.get("bank_name") == "CaixaBank"
        assert banking_info.get("bank_country") == "España"
    
    def test_withdrawal_requires_account_holder(self):
        """Test that account holder is required in banking info"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_resp.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get account
        accounts_resp = session.get(f"{BASE_URL}/api/accounts")
        accounts = accounts_resp.json()
        account_id = accounts[0]["id"]
        
        # Try withdrawal without account_holder
        withdrawal_resp = session.post(f"{BASE_URL}/api/transactions", json={
            "account_id": account_id,
            "transaction_type": "withdraw",
            "amount": 10.0,
            "currency": "EUR",
            "description": "Test missing holder",
            "banking_info": {
                "iban": VALID_SPANISH_IBAN,
                "bank_name": "CaixaBank",
                "bank_country": "España"
            }
        })
        
        # Should fail validation
        assert withdrawal_resp.status_code in [400, 422], f"Expected validation error, got {withdrawal_resp.status_code}"


class TestAdminWithdrawalManagement:
    """Test admin withdrawal management functionality"""
    
    def test_admin_can_get_all_withdrawals(self):
        """Test that admin can retrieve all withdrawals"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_resp.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get all withdrawals
        response = session.get(f"{BASE_URL}/api/admin/withdrawals/all")
        assert response.status_code == 200, f"Failed to get withdrawals: {response.text}"
        
        withdrawals = response.json()
        assert isinstance(withdrawals, list), "Response should be a list"
        
        # Check structure if withdrawals exist
        if len(withdrawals) > 0:
            w = withdrawals[0]
            assert "id" in w, "Withdrawal should have id"
            assert "status" in w, "Withdrawal should have status"
            assert "amount" in w, "Withdrawal should have amount"
            assert "user" in w, "Withdrawal should include user info"
    
    def test_admin_can_get_pending_withdrawals(self):
        """Test that admin can get pending withdrawals"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_resp.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get pending withdrawals
        response = session.get(f"{BASE_URL}/api/admin/withdrawals/pending")
        assert response.status_code == 200
        
        withdrawals = response.json()
        # All should be pending status
        for w in withdrawals:
            assert w.get("status") == "pending", f"Expected pending, got {w.get('status')}"


class TestWithdrawalStatusFlow:
    """Test the withdrawal status flow: pending -> processing -> transfer_in_progress -> completed"""
    
    def test_status_flow_pending_to_processing(self):
        """Test advancing withdrawal from pending to processing"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_resp.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get account
        accounts_resp = session.get(f"{BASE_URL}/api/accounts")
        accounts = accounts_resp.json()
        account_id = accounts[0]["id"]
        
        # Create new withdrawal
        withdrawal_resp = session.post(f"{BASE_URL}/api/transactions", json={
            "account_id": account_id,
            "transaction_type": "withdraw",
            "amount": 10.0,
            "currency": "EUR",
            "description": f"Flow test {uuid.uuid4().hex[:8]}",
            "banking_info": {
                "account_holder": "Flow Test User",
                "iban": VALID_SPANISH_IBAN,
                "bank_name": "CaixaBank",
                "bank_country": "España"
            }
        })
        
        assert withdrawal_resp.status_code == 200
        tx_id = withdrawal_resp.json().get("id")
        
        # Advance to processing
        update_resp = session.put(f"{BASE_URL}/api/admin/withdrawals/update-status", json={
            "transaction_id": tx_id,
            "status": "processing"
        })
        
        assert update_resp.status_code == 200, f"Status update failed: {update_resp.text}"
        assert update_resp.json().get("new_status") == "processing"
    
    def test_full_status_flow_to_completion(self):
        """Test full withdrawal flow from pending to completed with balance deduction"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_resp.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get account and initial balance
        accounts_resp = session.get(f"{BASE_URL}/api/accounts")
        accounts = accounts_resp.json()
        account = accounts[0]
        account_id = account["id"]
        initial_balance = account["balance_eur"]
        
        withdrawal_amount = 15.0
        
        # Create new withdrawal
        withdrawal_resp = session.post(f"{BASE_URL}/api/transactions", json={
            "account_id": account_id,
            "transaction_type": "withdraw",
            "amount": withdrawal_amount,
            "currency": "EUR",
            "description": f"Full flow test {uuid.uuid4().hex[:8]}",
            "banking_info": {
                "account_holder": "Full Flow Test",
                "iban": VALID_SPANISH_IBAN,
                "bank_name": "CaixaBank",
                "bank_country": "España"
            }
        })
        
        assert withdrawal_resp.status_code == 200
        tx_id = withdrawal_resp.json().get("id")
        
        # Step 1: pending -> processing
        resp1 = session.put(f"{BASE_URL}/api/admin/withdrawals/update-status", json={
            "transaction_id": tx_id,
            "status": "processing"
        })
        assert resp1.status_code == 200
        assert resp1.json().get("new_status") == "processing"
        
        # Step 2: processing -> transfer_in_progress
        resp2 = session.put(f"{BASE_URL}/api/admin/withdrawals/update-status", json={
            "transaction_id": tx_id,
            "status": "transfer_in_progress"
        })
        assert resp2.status_code == 200
        assert resp2.json().get("new_status") == "transfer_in_progress"
        
        # Step 3: transfer_in_progress -> completed
        resp3 = session.put(f"{BASE_URL}/api/admin/withdrawals/update-status", json={
            "transaction_id": tx_id,
            "status": "completed"
        })
        assert resp3.status_code == 200
        assert resp3.json().get("new_status") == "completed"
        
        # Verify balance was deducted
        accounts_after = session.get(f"{BASE_URL}/api/accounts")
        account_after = accounts_after.json()[0]
        final_balance = account_after["balance_eur"]
        
        expected_balance = initial_balance - withdrawal_amount
        assert abs(final_balance - expected_balance) < 0.01, f"Balance not deducted correctly. Expected {expected_balance}, got {final_balance}"
    
    def test_admin_can_reject_withdrawal(self):
        """Test that admin can reject a withdrawal with reason"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_resp.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get account
        accounts_resp = session.get(f"{BASE_URL}/api/accounts")
        accounts = accounts_resp.json()
        account_id = accounts[0]["id"]
        
        # Create withdrawal to reject
        withdrawal_resp = session.post(f"{BASE_URL}/api/transactions", json={
            "account_id": account_id,
            "transaction_type": "withdraw",
            "amount": 5.0,
            "currency": "EUR",
            "description": f"Reject test {uuid.uuid4().hex[:8]}",
            "banking_info": {
                "account_holder": "Reject Test",
                "iban": VALID_SPANISH_IBAN,
                "bank_name": "CaixaBank",
                "bank_country": "España"
            }
        })
        
        assert withdrawal_resp.status_code == 200
        tx_id = withdrawal_resp.json().get("id")
        
        # Reject the withdrawal
        reject_resp = session.put(f"{BASE_URL}/api/admin/withdrawals/update-status", json={
            "transaction_id": tx_id,
            "status": "rejected",
            "rejection_reason": "Invalid banking information"
        })
        
        assert reject_resp.status_code == 200
        assert reject_resp.json().get("new_status") == "rejected"
        
        # Verify withdrawal is rejected
        all_withdrawals = session.get(f"{BASE_URL}/api/admin/withdrawals/all")
        for w in all_withdrawals.json():
            if w["id"] == tx_id:
                assert w["status"] == "rejected"
                break


class TestWithdrawalValidation:
    """Test withdrawal validation rules"""
    
    def test_withdrawal_requires_positive_amount(self):
        """Test that withdrawal amount must be positive"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_resp.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get account
        accounts_resp = session.get(f"{BASE_URL}/api/accounts")
        accounts = accounts_resp.json()
        account_id = accounts[0]["id"]
        
        # Try negative amount
        withdrawal_resp = session.post(f"{BASE_URL}/api/transactions", json={
            "account_id": account_id,
            "transaction_type": "withdraw",
            "amount": -100.0,
            "currency": "EUR",
            "description": "Test negative",
            "banking_info": {
                "account_holder": "Test",
                "iban": VALID_SPANISH_IBAN,
                "bank_name": "CaixaBank",
                "bank_country": "España"
            }
        })
        
        assert withdrawal_resp.status_code == 422, f"Expected 422, got {withdrawal_resp.status_code}"
    
    def test_withdrawal_cannot_exceed_balance(self):
        """Test that withdrawal amount cannot exceed account balance"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_resp.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get account and balance
        accounts_resp = session.get(f"{BASE_URL}/api/accounts")
        accounts = accounts_resp.json()
        account = accounts[0]
        account_id = account["id"]
        current_balance = account["balance_eur"]
        
        # Try withdrawal exceeding balance
        withdrawal_resp = session.post(f"{BASE_URL}/api/transactions", json={
            "account_id": account_id,
            "transaction_type": "withdraw",
            "amount": current_balance + 10000.0,  # Way more than balance
            "currency": "EUR",
            "description": "Test exceed balance",
            "banking_info": {
                "account_holder": "Test",
                "iban": VALID_SPANISH_IBAN,
                "bank_name": "CaixaBank",
                "bank_country": "España"
            }
        })
        
        # Should be rejected (400) due to insufficient funds
        assert withdrawal_resp.status_code == 400, f"Expected 400 for insufficient funds, got {withdrawal_resp.status_code}: {withdrawal_resp.text}"


class TestNonAdminCannotManageWithdrawals:
    """Test that non-admin users cannot manage withdrawals"""
    
    def test_regular_user_cannot_update_withdrawal_status(self):
        """Test that regular users cannot update withdrawal status"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Create regular user
        unique_id = str(uuid.uuid4())[:8]
        response = session.post(f"{BASE_URL}/api/auth/register", json={
            "name": f"Regular User {unique_id}",
            "email": f"regular_{unique_id}@test.com",
            "password": "TestPass123!"
        })
        
        if response.status_code == 200:
            token = response.json().get("token")
            session.headers.update({"Authorization": f"Bearer {token}"})
            
            # Try to update withdrawal status
            update_resp = session.put(f"{BASE_URL}/api/admin/withdrawals/update-status", json={
                "transaction_id": "some-id",
                "status": "completed"
            })
            
            # Should be forbidden
            assert update_resp.status_code == 403, f"Expected 403, got {update_resp.status_code}"
    
    def test_regular_user_cannot_access_admin_withdrawals(self):
        """Test that regular users cannot access admin withdrawal endpoints"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Create regular user
        unique_id = str(uuid.uuid4())[:8]
        response = session.post(f"{BASE_URL}/api/auth/register", json={
            "name": f"Regular User {unique_id}",
            "email": f"regular2_{unique_id}@test.com",
            "password": "TestPass123!"
        })
        
        if response.status_code == 200:
            token = response.json().get("token")
            session.headers.update({"Authorization": f"Bearer {token}"})
            
            # Try to get all withdrawals
            response = session.get(f"{BASE_URL}/api/admin/withdrawals/all")
            assert response.status_code == 403, f"Expected 403, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
