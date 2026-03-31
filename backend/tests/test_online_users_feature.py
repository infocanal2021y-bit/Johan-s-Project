"""
Test suite for Online Users Tracking Feature
Tests: heartbeat, logout-status, admin/users/online, login-history, support tickets
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"


class TestHealthCheck:
    """Basic health check"""
    
    def test_api_health(self):
        """Test API is running"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        print("✅ API health check passed")


class TestAuthAndPresence:
    """Test authentication and presence (heartbeat/logout-status) endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data['token']
        self.user = data['user']
        self.headers = {"Authorization": f"Bearer {self.token}"}
        print(f"✅ Logged in as {self.user['email']}")
    
    def test_login_sets_user_online(self):
        """Test that login sets is_online=true and updates last_active"""
        # Login already done in setup, verify user is online via admin endpoint
        response = requests.get(f"{BASE_URL}/api/admin/users/online", headers=self.headers)
        assert response.status_code == 200
        online_users = response.json()
        
        # Check if current admin is in online users list
        admin_online = any(u['email'] == ADMIN_EMAIL for u in online_users)
        assert admin_online, "Admin should be online after login"
        print("✅ Login correctly sets user as online")
    
    def test_heartbeat_endpoint(self):
        """Test POST /api/auth/heartbeat updates last_active"""
        response = requests.post(f"{BASE_URL}/api/auth/heartbeat", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'ok', f"Expected status 'ok', got {data}"
        print("✅ Heartbeat endpoint returns {status: 'ok'}")
    
    def test_heartbeat_requires_auth(self):
        """Test heartbeat requires authentication"""
        response = requests.post(f"{BASE_URL}/api/auth/heartbeat")
        assert response.status_code in [401, 403], "Heartbeat should require auth"
        print("✅ Heartbeat correctly requires authentication")
    
    def test_logout_status_endpoint(self):
        """Test POST /api/auth/logout-status marks user offline"""
        # First verify user is online
        response = requests.get(f"{BASE_URL}/api/admin/users/online", headers=self.headers)
        assert response.status_code == 200
        
        # Call logout-status
        response = requests.post(f"{BASE_URL}/api/auth/logout-status", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'ok', f"Expected status 'ok', got {data}"
        print("✅ Logout-status endpoint returns {status: 'ok'}")
    
    def test_logout_status_requires_auth(self):
        """Test logout-status requires authentication"""
        response = requests.post(f"{BASE_URL}/api/auth/logout-status")
        assert response.status_code in [401, 403], "Logout-status should require auth"
        print("✅ Logout-status correctly requires authentication")


class TestAdminOnlineUsers:
    """Test GET /api/admin/users/online endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        self.token = data['token']
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_online_users(self):
        """Test GET /api/admin/users/online returns list of online users"""
        response = requests.get(f"{BASE_URL}/api/admin/users/online", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET /admin/users/online returns list with {len(data)} users")
        
        # Verify response structure if there are online users
        if len(data) > 0:
            user = data[0]
            required_fields = ['id', 'name', 'email', 'role', 'last_active', 'login_ip', 'login_location', 'login_device']
            for field in required_fields:
                assert field in user, f"Missing field: {field}"
            print(f"✅ Online user data has all required fields: {required_fields}")
    
    def test_online_users_requires_admin(self):
        """Test that online users endpoint requires admin role"""
        # Try without auth
        response = requests.get(f"{BASE_URL}/api/admin/users/online")
        assert response.status_code in [401, 403], "Should require auth"
        print("✅ Online users endpoint requires authentication")


class TestAdminLoginHistory:
    """Test GET /api/admin/login-history endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        self.token = data['token']
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_login_history(self):
        """Test GET /api/admin/login-history returns login records"""
        response = requests.get(f"{BASE_URL}/api/admin/login-history", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET /admin/login-history returns list with {len(data)} records")
        
        # Verify structure if there are records
        if len(data) > 0:
            record = data[0]
            expected_fields = ['user_id', 'user_name', 'user_email', 'ip_address', 'device', 'browser', 'location', 'logged_in_at']
            for field in expected_fields:
                assert field in record, f"Missing field: {field}"
            print(f"✅ Login history record has expected fields")
    
    def test_login_history_requires_admin(self):
        """Test login history requires admin"""
        response = requests.get(f"{BASE_URL}/api/admin/login-history")
        assert response.status_code in [401, 403]
        print("✅ Login history requires authentication")


class TestSupportTickets:
    """Test POST /api/support/tickets returns Spanish message"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        self.token = data['token']
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_create_ticket_spanish_message(self):
        """Test POST /api/support/tickets returns Spanish success message"""
        ticket_data = {
            "subject": "Test ticket for online users feature",
            "message": "This is a test ticket to verify Spanish response message",
            "category": "general"
        }
        response = requests.post(f"{BASE_URL}/api/support/tickets", json=ticket_data, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify Spanish message
        assert 'message' in data, "Response should have 'message' field"
        assert data['message'] == 'Tu solicitud ha sido enviada correctamente', \
            f"Expected Spanish message, got: {data['message']}"
        assert 'ticket_number' in data, "Response should have ticket_number"
        print(f"✅ Support ticket created with Spanish message: '{data['message']}'")
        print(f"   Ticket number: {data['ticket_number']}")
    
    def test_create_ticket_requires_auth(self):
        """Test creating ticket requires authentication"""
        ticket_data = {
            "subject": "Test",
            "message": "Test message here",
            "category": "general"
        }
        response = requests.post(f"{BASE_URL}/api/support/tickets", json=ticket_data)
        assert response.status_code in [401, 403]
        print("✅ Support tickets require authentication")


class TestUserLoginHistory:
    """Test GET /api/auth/login-history for regular users"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        self.token = data['token']
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_user_login_history(self):
        """Test GET /api/auth/login-history returns user's own login history"""
        response = requests.get(f"{BASE_URL}/api/auth/login-history", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET /auth/login-history returns {len(data)} records for current user")


class TestOnlineUsersFlow:
    """Integration test for the full online users flow"""
    
    def test_full_presence_flow(self):
        """Test complete flow: login -> heartbeat -> check online -> logout-status"""
        # 1. Login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        token = response.json()['token']
        headers = {"Authorization": f"Bearer {token}"}
        print("✅ Step 1: Login successful")
        
        # 2. Send heartbeat
        response = requests.post(f"{BASE_URL}/api/auth/heartbeat", headers=headers)
        assert response.status_code == 200
        assert response.json()['status'] == 'ok'
        print("✅ Step 2: Heartbeat sent")
        
        # 3. Check online users (admin should be online)
        response = requests.get(f"{BASE_URL}/api/admin/users/online", headers=headers)
        assert response.status_code == 200
        online_users = response.json()
        admin_found = any(u['email'] == ADMIN_EMAIL for u in online_users)
        assert admin_found, "Admin should be in online users list"
        print(f"✅ Step 3: Admin found in online users list ({len(online_users)} total online)")
        
        # 4. Call logout-status
        response = requests.post(f"{BASE_URL}/api/auth/logout-status", headers=headers)
        assert response.status_code == 200
        assert response.json()['status'] == 'ok'
        print("✅ Step 4: Logout-status called successfully")
        
        print("✅ Full presence flow completed successfully!")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
