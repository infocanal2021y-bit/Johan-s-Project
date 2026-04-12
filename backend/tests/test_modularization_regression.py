"""
Regression tests for LIONSBIT VERIFICACION backend modularization.
Tests all API endpoints after server.py was split into routes/ and services/ modules.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://compliance-dash-32.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"
TEST_USER_EMAIL = "test.bronce@test.com"
TEST_USER_PASSWORD = "Test1234!"


class TestHealthAndRoot:
    """Test basic API health and root endpoint"""
    
    def test_root_endpoint(self):
        """GET / - API root returns version info"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "LIONSBIT" in data["message"]
        print(f"✅ Root endpoint: {data}")


class TestAuthRoutes:
    """Test authentication routes from routes/auth.py"""
    
    def test_admin_login(self):
        """POST /api/auth/login - Admin login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["role"] == "admin"
        print(f"✅ Admin login successful: {data['user']['email']}")
        return data["token"]
    
    def test_user_login(self):
        """POST /api/auth/login - User login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        print(f"✅ User login successful: {data['user']['email']}")
        return data["token"]
    
    def test_get_me_authenticated(self):
        """GET /api/auth/me - Returns logged in user"""
        # First login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_resp.json()["token"]
        
        # Get me
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == ADMIN_EMAIL
        print(f"✅ GET /auth/me: {data['name']} ({data['email']})")
    
    def test_get_me_unauthenticated(self):
        """GET /api/auth/me - Returns 401 without token"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code in [401, 403]
        print("✅ GET /auth/me without token returns 401/403")


class TestAccountRoutes:
    """Test account routes from routes/accounts.py"""
    
    @pytest.fixture
    def user_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_accounts(self, user_token):
        """GET /api/accounts - Returns user accounts"""
        response = requests.get(f"{BASE_URL}/api/accounts", headers={
            "Authorization": f"Bearer {user_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /accounts: {len(data)} accounts found")
    
    def test_get_account_summary(self, user_token):
        """GET /api/accounts/summary/total - Returns balance summary"""
        response = requests.get(f"{BASE_URL}/api/accounts/summary/total", headers={
            "Authorization": f"Bearer {user_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "available" in data
        assert "invested" in data
        print(f"✅ GET /accounts/summary/total: USD={data['total']['usd']}, EUR={data['total']['eur']}")


class TestGamificationRoutes:
    """Test gamification routes from routes/accounts.py"""
    
    @pytest.fixture
    def user_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_user_level(self, user_token):
        """GET /api/user/level - Returns gamification level"""
        response = requests.get(f"{BASE_URL}/api/user/level", headers={
            "Authorization": f"Bearer {user_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "level" in data
        assert "label" in data
        assert "icon" in data
        print(f"✅ GET /user/level: {data['label']} {data['icon']}")
    
    def test_get_user_achievements(self, user_token):
        """GET /api/user/achievements - Returns achievements"""
        response = requests.get(f"{BASE_URL}/api/user/achievements", headers={
            "Authorization": f"Bearer {user_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "achievements" in data
        assert "total" in data
        assert "completed" in data
        print(f"✅ GET /user/achievements: {data['completed']}/{data['total']} completed")


class TestSupportRoutes:
    """Test support routes from routes/support.py"""
    
    @pytest.fixture
    def user_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_support_tickets(self, user_token):
        """GET /api/support/tickets - List tickets"""
        response = requests.get(f"{BASE_URL}/api/support/tickets", headers={
            "Authorization": f"Bearer {user_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /support/tickets: {len(data)} tickets found")
    
    def test_create_support_ticket(self, user_token):
        """POST /api/support/tickets - Create support ticket"""
        response = requests.post(f"{BASE_URL}/api/support/tickets", 
            headers={"Authorization": f"Bearer {user_token}"},
            json={
                "subject": "TEST_Regression Test Ticket",
                "message": "This is a test ticket from regression testing",
                "category": "general"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "ticket_number" in data
        print(f"✅ POST /support/tickets: Created ticket {data['ticket_number']}")


class TestTransactionRoutes:
    """Test transaction routes from routes/transactions.py"""
    
    @pytest.fixture
    def user_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_transactions(self, user_token):
        """GET /api/transactions - List transactions"""
        response = requests.get(f"{BASE_URL}/api/transactions", headers={
            "Authorization": f"Bearer {user_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /transactions: {len(data)} transactions found")
    
    def test_get_withdrawal_history(self, user_token):
        """GET /api/withdrawals/history - Withdrawal history"""
        response = requests.get(f"{BASE_URL}/api/withdrawals/history", headers={
            "Authorization": f"Bearer {user_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "statistics" in data
        assert "history" in data
        print(f"✅ GET /withdrawals/history: {data['statistics']['total_count']} total withdrawals")


class TestNotificationRoutes:
    """Test notification routes from routes/notifications.py"""
    
    @pytest.fixture
    def user_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_notifications(self, user_token):
        """GET /api/notifications - User notifications"""
        response = requests.get(f"{BASE_URL}/api/notifications", headers={
            "Authorization": f"Bearer {user_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "notifications" in data
        assert "unread_count" in data
        print(f"✅ GET /notifications: {len(data['notifications'])} notifications, {data['unread_count']} unread")


class TestAdminRoutes:
    """Test admin routes from routes/admin.py"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_admin_get_users(self, admin_token):
        """GET /api/admin/users - Admin list users"""
        response = requests.get(f"{BASE_URL}/api/admin/users", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /admin/users: {len(data)} users found")
    
    def test_admin_get_all_withdrawals(self, admin_token):
        """GET /api/admin/withdrawals/all - Admin list all withdrawals"""
        response = requests.get(f"{BASE_URL}/api/admin/withdrawals/all", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /admin/withdrawals/all: {len(data)} withdrawals found")
    
    def test_admin_get_pending_crypto_payments(self, admin_token):
        """GET /api/admin/crypto-payments/pending - Admin pending crypto payments"""
        response = requests.get(f"{BASE_URL}/api/admin/crypto-payments/pending", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /admin/crypto-payments/pending: {len(data)} pending payments")
    
    def test_admin_get_activity(self, admin_token):
        """GET /api/admin/activity - Admin activity log"""
        response = requests.get(f"{BASE_URL}/api/admin/activity", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /admin/activity: {len(data)} activities found")
    
    def test_admin_get_kyc_submissions(self, admin_token):
        """GET /api/admin/kyc/submissions - Admin KYC submissions"""
        response = requests.get(f"{BASE_URL}/api/admin/kyc/submissions", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /admin/kyc/submissions: {len(data)} submissions found")
    
    def test_admin_get_support_tickets(self, admin_token):
        """GET /api/admin/support/tickets - Admin support tickets"""
        response = requests.get(f"{BASE_URL}/api/admin/support/tickets", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /admin/support/tickets: {len(data)} tickets found")


class TestMiscRoutes:
    """Test miscellaneous routes from routes/misc.py"""
    
    def test_get_exchange_rates(self):
        """GET /api/exchange-rates - Returns exchange rates"""
        response = requests.get(f"{BASE_URL}/api/exchange-rates")
        assert response.status_code == 200
        data = response.json()
        assert "USD" in data
        assert "EUR" in data
        print(f"✅ GET /exchange-rates: USD={data['USD']}, EUR={data['EUR']}")
    
    def test_get_crypto_wallets(self):
        """GET /api/crypto-wallets - Returns crypto wallet addresses"""
        response = requests.get(f"{BASE_URL}/api/crypto-wallets")
        assert response.status_code == 200
        data = response.json()
        assert "BTC" in data
        assert "ETH" in data
        print(f"✅ GET /crypto-wallets: {len(data)} wallets configured")
    
    def test_get_market_crypto(self):
        """GET /api/market/crypto - Market data from CoinGecko"""
        response = requests.get(f"{BASE_URL}/api/market/crypto")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /market/crypto: {len(data)} cryptocurrencies")
    
    def test_chatbot_message(self):
        """POST /api/chatbot/message - Chatbot responds to messages"""
        response = requests.post(f"{BASE_URL}/api/chatbot/message", json={
            "message": "como puedo retirar dinero"
        })
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        print(f"✅ POST /chatbot/message: Response received (matched={data.get('matched', False)})")


class TestUserRegistration:
    """Test user registration flow"""
    
    def test_register_duplicate_email(self):
        """POST /api/auth/register - Duplicate email returns 400"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Test User",
            "email": TEST_USER_EMAIL,  # Already exists
            "password": "TestPassword123!"
        })
        assert response.status_code == 400
        print("✅ POST /auth/register with duplicate email returns 400")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
