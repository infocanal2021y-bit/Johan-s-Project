"""
Tests for Admin-Only Deposits feature
- Regular users should NOT be able to deposit
- Admin should be able to add balance via POST /api/admin/add-balance
- GET /api/admin/credits should return admin_credit transactions
- User notifications when admin adds balance
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://crypto-bank-dev.preview.emergentagent.com').rstrip('/')


class TestAdminOnlyDeposits:
    """Test that deposits are disabled for regular users"""
    
    def test_deposit_disabled_for_regular_users(self, demo_user_client):
        """Regular users should get 403 when trying to deposit"""
        # First get user accounts
        accounts_resp = demo_user_client.get(f"{BASE_URL}/api/accounts")
        assert accounts_resp.status_code == 200, f"Failed to get accounts: {accounts_resp.text}"
        
        accounts = accounts_resp.json()
        assert len(accounts) > 0, "User should have at least one account"
        
        checking_account = next((acc for acc in accounts if acc['account_type'] == 'checking'), accounts[0])
        
        # Try to create a deposit
        deposit_data = {
            "account_id": checking_account['id'],
            "transaction_type": "deposit",
            "amount": 100.00,
            "currency": "USD",
            "description": "Test deposit"
        }
        
        response = demo_user_client.post(f"{BASE_URL}/api/transactions", json=deposit_data)
        
        # Should get 403 Forbidden
        assert response.status_code == 403, f"Expected 403 Forbidden, got {response.status_code}: {response.text}"
        assert "disabled" in response.json().get('detail', '').lower() or "administrator" in response.json().get('detail', '').lower()


class TestAdminAddBalance:
    """Test admin add-balance endpoint"""
    
    def test_admin_can_add_balance(self, admin_client, demo_user_client):
        """Admin should be able to add balance to user accounts"""
        # Get demo user info
        me_resp = demo_user_client.get(f"{BASE_URL}/api/auth/me")
        assert me_resp.status_code == 200, f"Failed to get demo user info: {me_resp.text}"
        demo_user_id = me_resp.json()['id']
        
        # Get initial balance
        accounts_resp = demo_user_client.get(f"{BASE_URL}/api/accounts/summary/total")
        assert accounts_resp.status_code == 200
        initial_balance = accounts_resp.json()['available']['usd']
        
        # Admin adds balance
        test_amount = 50.0
        add_balance_data = {
            "user_id": demo_user_id,
            "amount": test_amount,
            "currency": "USD",
            "description": f"TEST_CREDIT_{uuid.uuid4().hex[:8]}"
        }
        
        response = admin_client.post(f"{BASE_URL}/api/admin/add-balance", json=add_balance_data)
        assert response.status_code == 200, f"Admin add-balance failed: {response.text}"
        
        result = response.json()
        assert result.get('message') == 'Balance added successfully'
        assert result.get('amount') == test_amount
        assert result.get('currency') == 'USD'
        assert 'transaction_id' in result
        
        # Verify balance was updated
        accounts_resp2 = demo_user_client.get(f"{BASE_URL}/api/accounts/summary/total")
        assert accounts_resp2.status_code == 200
        new_balance = accounts_resp2.json()['available']['usd']
        assert new_balance == initial_balance + test_amount, f"Balance should increase by {test_amount}"
    
    def test_admin_add_balance_creates_admin_credit_transaction(self, admin_client, demo_user_client):
        """Balance additions should be logged as admin_credit type"""
        # Get demo user info
        me_resp = demo_user_client.get(f"{BASE_URL}/api/auth/me")
        assert me_resp.status_code == 200
        demo_user_id = me_resp.json()['id']
        
        unique_description = f"TEST_ADMIN_CREDIT_{uuid.uuid4().hex[:8]}"
        
        # Admin adds balance
        add_balance_data = {
            "user_id": demo_user_id,
            "amount": 25.0,
            "currency": "USD",
            "description": unique_description
        }
        
        response = admin_client.post(f"{BASE_URL}/api/admin/add-balance", json=add_balance_data)
        assert response.status_code == 200, f"Add balance failed: {response.text}"
        
        transaction_id = response.json()['transaction_id']
        
        # Get admin credits and verify transaction exists
        credits_resp = admin_client.get(f"{BASE_URL}/api/admin/credits")
        assert credits_resp.status_code == 200, f"Failed to get credits: {credits_resp.text}"
        
        credits = credits_resp.json()
        
        # Find the transaction
        found_credit = None
        for credit in credits:
            if credit.get('id') == transaction_id:
                found_credit = credit
                break
        
        assert found_credit is not None, f"Transaction {transaction_id} not found in admin credits"
        assert found_credit['transaction_type'] == 'admin_credit', f"Expected admin_credit, got {found_credit['transaction_type']}"
        assert found_credit['amount'] == 25.0
        assert found_credit['currency'] == 'USD'
        assert found_credit['description'] == unique_description
    
    def test_admin_add_balance_non_admin_forbidden(self, demo_user_client):
        """Regular users should NOT be able to use admin add-balance"""
        # Get demo user info
        me_resp = demo_user_client.get(f"{BASE_URL}/api/auth/me")
        assert me_resp.status_code == 200
        demo_user_id = me_resp.json()['id']
        
        add_balance_data = {
            "user_id": demo_user_id,
            "amount": 100.0,
            "currency": "USD",
            "description": "Trying to cheat"
        }
        
        response = demo_user_client.post(f"{BASE_URL}/api/admin/add-balance", json=add_balance_data)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
    
    def test_admin_add_balance_invalid_user(self, admin_client):
        """Adding balance to non-existent user should fail"""
        add_balance_data = {
            "user_id": "non-existent-user-id",
            "amount": 100.0,
            "currency": "USD"
        }
        
        response = admin_client.post(f"{BASE_URL}/api/admin/add-balance", json=add_balance_data)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_admin_add_balance_eur_currency(self, admin_client, demo_user_client):
        """Admin should be able to add EUR balance"""
        # Get demo user info
        me_resp = demo_user_client.get(f"{BASE_URL}/api/auth/me")
        assert me_resp.status_code == 200
        demo_user_id = me_resp.json()['id']
        
        # Get initial EUR balance
        accounts_resp = demo_user_client.get(f"{BASE_URL}/api/accounts/summary/total")
        assert accounts_resp.status_code == 200
        initial_eur_balance = accounts_resp.json()['available']['eur']
        
        test_amount = 75.0
        add_balance_data = {
            "user_id": demo_user_id,
            "amount": test_amount,
            "currency": "EUR",
            "description": f"TEST_EUR_CREDIT_{uuid.uuid4().hex[:8]}"
        }
        
        response = admin_client.post(f"{BASE_URL}/api/admin/add-balance", json=add_balance_data)
        assert response.status_code == 200, f"EUR add-balance failed: {response.text}"
        assert response.json()['currency'] == 'EUR'
        
        # Verify EUR balance was updated
        accounts_resp2 = demo_user_client.get(f"{BASE_URL}/api/accounts/summary/total")
        new_eur_balance = accounts_resp2.json()['available']['eur']
        assert new_eur_balance == initial_eur_balance + test_amount


class TestAdminCreditsEndpoint:
    """Test GET /api/admin/credits endpoint"""
    
    def test_admin_can_get_credits(self, admin_client):
        """Admin should be able to get all admin_credit transactions"""
        response = admin_client.get(f"{BASE_URL}/api/admin/credits")
        assert response.status_code == 200, f"Failed to get credits: {response.text}"
        
        credits = response.json()
        assert isinstance(credits, list)
        
        # If there are credits, verify structure
        if len(credits) > 0:
            credit = credits[0]
            assert 'id' in credit
            assert 'transaction_type' in credit
            assert credit['transaction_type'] == 'admin_credit'
            assert 'amount' in credit
            assert 'currency' in credit
            assert 'user_id' in credit
            assert 'created_at' in credit
    
    def test_non_admin_cannot_get_credits(self, demo_user_client):
        """Regular users should NOT be able to access admin credits endpoint"""
        response = demo_user_client.get(f"{BASE_URL}/api/admin/credits")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"


class TestUserNotification:
    """Test that users receive notifications when admin adds balance"""
    
    def test_user_gets_notification_on_balance_add(self, admin_client, demo_user_client):
        """User should receive notification when admin adds balance"""
        # Get demo user info
        me_resp = demo_user_client.get(f"{BASE_URL}/api/auth/me")
        assert me_resp.status_code == 200
        demo_user_id = me_resp.json()['id']
        
        # Get initial notification count
        notif_resp1 = demo_user_client.get(f"{BASE_URL}/api/notifications")
        assert notif_resp1.status_code == 200
        initial_count = len(notif_resp1.json().get('notifications', []))
        
        # Admin adds balance
        unique_desc = f"TEST_NOTIF_{uuid.uuid4().hex[:8]}"
        add_balance_data = {
            "user_id": demo_user_id,
            "amount": 10.0,
            "currency": "USD",
            "description": unique_desc
        }
        
        response = admin_client.post(f"{BASE_URL}/api/admin/add-balance", json=add_balance_data)
        assert response.status_code == 200, f"Add balance failed: {response.text}"
        
        # Check for new notification
        notif_resp2 = demo_user_client.get(f"{BASE_URL}/api/notifications")
        assert notif_resp2.status_code == 200
        
        new_notifications = notif_resp2.json().get('notifications', [])
        assert len(new_notifications) > initial_count, "User should have received a new notification"
        
        # Find the balance notification
        balance_notification = None
        for notif in new_notifications:
            if 'balance' in notif.get('title', '').lower() or 'balance' in notif.get('message', '').lower():
                balance_notification = notif
                break
        
        assert balance_notification is not None, "User should receive 'Balance Added' notification"
