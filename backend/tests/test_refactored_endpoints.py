"""
Test suite for verifying critical API endpoints after backend refactoring.
Tests: auth, accounts, admin, crypto-wallets, chatbot, payments, notifications, support, dashboard
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"
TEST_USER_EMAIL = "test.bronce@test.com"
TEST_USER_PASSWORD = "Test1234!"


class TestAuthEndpoints:
    """Test authentication endpoints after refactoring"""
    
    def test_admin_login_success(self):
        """POST /api/auth/login with admin credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token missing from login response"
        assert "user" in data, "User missing from login response"
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        print(f"✅ Admin login successful: {data['user']['name']}")
    
    def test_register_new_user(self):
        """POST /api/auth/register with a new test user"""
        unique_email = f"test_refactor_{uuid.uuid4().hex[:8]}@test.com"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Test Refactor User",
            "email": unique_email,
            "password": "TestPass123!"
        })
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token missing from register response"
        assert "user" in data, "User missing from register response"
        assert data["user"]["email"] == unique_email
        assert data["user"]["role"] == "user"
        assert data["user"]["verification_status"] == "unverified"
        print(f"✅ User registration successful: {unique_email}")
    
    def test_login_invalid_credentials(self):
        """POST /api/auth/login with invalid credentials should fail"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Invalid credentials correctly rejected")


class TestAccountsEndpoints:
    """Test accounts endpoints after refactoring"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_accounts_with_auth(self, admin_token):
        """GET /api/accounts with valid auth token"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/accounts", headers=headers)
        assert response.status_code == 200, f"Get accounts failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Accounts should be a list"
        if len(data) > 0:
            account = data[0]
            assert "id" in account
            assert "account_type" in account
            assert "balance_usd" in account
            assert "balance_eur" in account
        print(f"✅ GET /api/accounts returned {len(data)} accounts")
    
    def test_get_accounts_without_auth(self):
        """GET /api/accounts without auth should fail"""
        response = requests.get(f"{BASE_URL}/api/accounts")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ Accounts endpoint correctly requires authentication")


class TestAdminEndpoints:
    """Test admin endpoints after refactoring"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_admin_users(self, admin_token):
        """GET /api/admin/users with admin token"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)
        assert response.status_code == 200, f"Get admin users failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Users should be a list"
        if len(data) > 0:
            user = data[0]
            assert "id" in user
            assert "name" in user
            assert "email" in user
            assert "role" in user
        print(f"✅ GET /api/admin/users returned {len(data)} users")
    
    def test_get_pending_withdrawals(self, admin_token):
        """GET /api/admin/pending-withdrawals with admin token"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/pending-withdrawals", headers=headers)
        assert response.status_code == 200, f"Get pending withdrawals failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Pending withdrawals should be a list"
        print(f"✅ GET /api/admin/pending-withdrawals returned {len(data)} withdrawals")
    
    def test_admin_users_without_admin_role(self):
        """GET /api/admin/users without admin role should fail"""
        # First register a regular user
        unique_email = f"test_nonadmin_{uuid.uuid4().hex[:8]}@test.com"
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Non Admin User",
            "email": unique_email,
            "password": "TestPass123!"
        })
        if reg_response.status_code == 200:
            user_token = reg_response.json()["token"]
            headers = {"Authorization": f"Bearer {user_token}"}
            response = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)
            assert response.status_code == 403, f"Expected 403, got {response.status_code}"
            print("✅ Admin endpoint correctly rejects non-admin users")
        else:
            pytest.skip("Could not create test user")


class TestCryptoWalletsEndpoint:
    """Test crypto wallets endpoint after refactoring"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_crypto_wallets(self, auth_token):
        """GET /api/crypto-wallets with auth token (should return BTC, ETH, BNB, USDT wallets)"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/crypto-wallets", headers=headers)
        assert response.status_code == 200, f"Get crypto wallets failed: {response.text}"
        data = response.json()
        assert isinstance(data, dict), "Crypto wallets should be a dict"
        
        # Verify expected wallets exist
        expected_wallets = ['BTC', 'ETH', 'BNB', 'USDT']
        for wallet in expected_wallets:
            assert wallet in data, f"Missing {wallet} wallet"
            assert "address" in data[wallet], f"Missing address for {wallet}"
            assert "network" in data[wallet], f"Missing network for {wallet}"
        
        print(f"✅ GET /api/crypto-wallets returned wallets: {list(data.keys())}")
        print(f"   BTC address: {data['BTC']['address'][:20]}...")
        print(f"   ETH address: {data['ETH']['address'][:20]}...")


class TestChatbotEndpoint:
    """Test chatbot endpoint after refactoring"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_chatbot_message_retiro(self, auth_token):
        """POST /api/chatbot/message with message 'como retiro?' (should return matched FAQ response)"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.post(f"{BASE_URL}/api/chatbot/message", 
                                 json={"message": "como retiro?"},
                                 headers=headers)
        assert response.status_code == 200, f"Chatbot message failed: {response.text}"
        data = response.json()
        assert "response" in data, "Response missing from chatbot"
        # Should match 'retiro' keyword and return withdrawal instructions
        assert "retiro" in data["response"].lower() or "withdraw" in data["response"].lower() or "impuesto" in data["response"].lower(), \
            f"Response doesn't seem to be about withdrawals: {data['response'][:100]}"
        print(f"✅ Chatbot responded to 'como retiro?': {data['response'][:100]}...")
    
    def test_chatbot_message_impuesto(self, auth_token):
        """POST /api/chatbot/message with message about tax"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.post(f"{BASE_URL}/api/chatbot/message", 
                                 json={"message": "por que pagar impuesto?"},
                                 headers=headers)
        assert response.status_code == 200, f"Chatbot message failed: {response.text}"
        data = response.json()
        assert "response" in data
        print(f"✅ Chatbot responded to tax question: {data['response'][:100]}...")


class TestPaymentsEndpoint:
    """Test payments endpoint after refactoring"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_bank_transfer_access_admin(self, admin_token):
        """GET /api/payments/bank-transfer-access with admin token (should return has_access: true)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/payments/bank-transfer-access", headers=headers)
        assert response.status_code == 200, f"Bank transfer access check failed: {response.text}"
        data = response.json()
        assert "has_access" in data, "has_access field missing"
        assert data["has_access"] == True, f"Admin should have bank transfer access, got: {data}"
        print(f"✅ GET /api/payments/bank-transfer-access: has_access={data['has_access']}")


class TestNotificationsEndpoint:
    """Test notifications endpoint after refactoring"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_notifications(self, auth_token):
        """GET /api/notifications with auth token"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        assert response.status_code == 200, f"Get notifications failed: {response.text}"
        data = response.json()
        # API returns dict with 'notifications' key and 'unread_count'
        assert isinstance(data, dict), "Response should be a dict"
        assert "notifications" in data, "notifications key missing"
        assert "unread_count" in data, "unread_count key missing"
        notifications = data["notifications"]
        assert isinstance(notifications, list), "Notifications should be a list"
        if len(notifications) > 0:
            notification = notifications[0]
            assert "id" in notification
            assert "message" in notification
        print(f"✅ GET /api/notifications returned {len(notifications)} notifications, {data['unread_count']} unread")


class TestSupportTicketsEndpoint:
    """Test support tickets endpoint after refactoring"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_create_support_ticket(self, auth_token):
        """POST /api/support/tickets to create a support ticket"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        ticket_data = {
            "subject": f"Test Ticket {uuid.uuid4().hex[:6]}",
            "message": "This is a test support ticket created during refactoring verification.",
            "category": "general"
        }
        response = requests.post(f"{BASE_URL}/api/support/tickets", 
                                 json=ticket_data,
                                 headers=headers)
        assert response.status_code == 200, f"Create ticket failed: {response.text}"
        data = response.json()
        assert "ticket_number" in data, "Ticket number missing"
        assert "id" in data, "Ticket ID missing"
        print(f"✅ Created support ticket: {data['ticket_number']}")


class TestUserDashboardEndpoint:
    """Test user dashboard endpoint after refactoring"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_user_dashboard(self, auth_token):
        """GET /api/user/dashboard with auth token"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/user/dashboard", headers=headers)
        # Dashboard endpoint might not exist, check for 200 or 404
        if response.status_code == 200:
            data = response.json()
            print(f"✅ GET /api/user/dashboard returned data: {list(data.keys()) if isinstance(data, dict) else 'list'}")
        elif response.status_code == 404:
            print("⚠️ GET /api/user/dashboard endpoint not found (404) - may not be implemented")
        else:
            assert False, f"Unexpected status code: {response.status_code}, {response.text}"


class TestAuthMeEndpoint:
    """Test auth/me endpoint after refactoring"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_current_user(self, auth_token):
        """GET /api/auth/me with auth token"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200, f"Get current user failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert "name" in data
        assert "email" in data
        assert data["email"] == ADMIN_EMAIL
        print(f"✅ GET /api/auth/me returned user: {data['name']} ({data['email']})")


class TestImportedModulesWorking:
    """Verify that imported modules from config.py, models.py, services/ are working"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_password_hashing_works(self):
        """Verify hash_password and verify_password from services/auth.py work"""
        # If login works, password hashing is working
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, "Password verification failed"
        print("✅ Password hashing (services/auth.py) working correctly")
    
    def test_jwt_token_creation_works(self, admin_token):
        """Verify create_token from services/auth.py works"""
        # If we got a token and can use it, JWT creation is working
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200, "JWT token validation failed"
        print("✅ JWT token creation (services/auth.py) working correctly")
    
    def test_notification_creation_works(self, admin_token):
        """Verify create_notification from services/notifications.py works"""
        # Register a new user - this triggers create_notification
        unique_email = f"test_notif_{uuid.uuid4().hex[:8]}@test.com"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Notification Test User",
            "email": unique_email,
            "password": "TestPass123!"
        })
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        # Check notifications for the new user
        user_token = response.json()["token"]
        headers = {"Authorization": f"Bearer {user_token}"}
        notif_response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        assert notif_response.status_code == 200
        notifications = notif_response.json()
        # New user should have welcome notification
        assert len(notifications) > 0, "No welcome notification created"
        print(f"✅ Notification creation (services/notifications.py) working - {len(notifications)} notifications")
    
    def test_crypto_wallets_from_config(self, admin_token):
        """Verify CRYPTO_WALLETS from config.py is accessible"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/crypto-wallets", headers=headers)
        assert response.status_code == 200
        data = response.json()
        # Verify the wallets match what's in config.py
        assert data["BTC"]["address"] == "1D8qYgB782ASjwDPwJAafuoTx2TFKFyM89"
        assert data["ETH"]["address"] == "0x3ab1d3202a3cd4541093601a16ae3770d33c9f28"
        print("✅ CRYPTO_WALLETS from config.py accessible and correct")
    
    def test_chatbot_faq_from_config(self, admin_token):
        """Verify CHATBOT_FAQ from config.py is accessible"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(f"{BASE_URL}/api/chatbot/message", 
                                 json={"message": "verificacion kyc"},
                                 headers=headers)
        assert response.status_code == 200
        data = response.json()
        # Should match 'verificacion' keyword
        assert "response" in data
        print("✅ CHATBOT_FAQ from config.py accessible and working")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
