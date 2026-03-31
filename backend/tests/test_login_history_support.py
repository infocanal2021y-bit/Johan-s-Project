"""
Test suite for LIONSBIT VERIFICACION - Iteration 5
Testing: Login tracking with geolocation, Admin login history, Support ticket emails
"""
import pytest
import requests
import os
import time

# Use the public URL for testing
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://compliance-dash-32.preview.emergentagent.com')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_api_health(self):
        """Test API is running"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "LIONSBIT" in data["message"]
        print(f"✅ API health check passed: {data}")


class TestLoginWithGeolocation:
    """Test login endpoint returns login_info with geolocation"""
    
    def test_login_returns_login_info(self):
        """Test POST /api/auth/login returns login_info with location data"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Check token and user
        assert "token" in data, "Missing token in response"
        assert "user" in data, "Missing user in response"
        
        # Check login_info with geolocation
        assert "login_info" in data, "Missing login_info in response"
        login_info = data["login_info"]
        
        assert "ip" in login_info, "Missing IP in login_info"
        assert "device" in login_info, "Missing device in login_info"
        assert "location" in login_info, "Missing location in login_info"
        assert "time" in login_info, "Missing time in login_info"
        
        # Location should NOT be hardcoded 'Spain' - should be real geolocation
        location = login_info["location"]
        assert location != "Spain", f"Location appears hardcoded: {location}"
        assert location != "", "Location is empty"
        
        print(f"✅ Login returns login_info with geolocation:")
        print(f"   IP: {login_info['ip']}")
        print(f"   Device: {login_info['device']}")
        print(f"   Location: {login_info['location']}")
        print(f"   Time: {login_info['time']}")
        
        return data["token"]
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✅ Invalid credentials correctly rejected with 401")


class TestAdminLoginHistory:
    """Test admin login history endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json()["token"]
    
    def test_get_login_history(self, admin_token):
        """Test GET /api/admin/login-history returns list of login records"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/login-history", headers=headers)
        
        assert response.status_code == 200, f"Failed to get login history: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Login history should be a list"
        
        if len(data) > 0:
            # Check first record has required fields
            record = data[0]
            expected_fields = ["ip_address", "location", "device", "browser", "logged_in_at"]
            for field in expected_fields:
                assert field in record, f"Missing field '{field}' in login record"
            
            # user_name and user_email may be null for older records
            print(f"✅ Login history returned {len(data)} records")
            print(f"   Sample record: IP={record.get('ip_address')}, Location={record.get('location')}, Device={record.get('device')}")
        else:
            print("✅ Login history endpoint works (no records yet)")
    
    def test_get_suspicious_logins(self, admin_token):
        """Test GET /api/admin/login-history/suspicious returns array"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/login-history/suspicious", headers=headers)
        
        assert response.status_code == 200, f"Failed to get suspicious logins: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Suspicious logins should be a list"
        
        if len(data) > 0:
            # Check suspicious alert structure
            alert = data[0]
            assert "user_id" in alert or "user_email" in alert, "Missing user identifier in alert"
            assert "alert" in alert, "Missing alert message"
            assert "countries" in alert, "Missing countries list"
            print(f"✅ Suspicious logins returned {len(data)} alerts")
            print(f"   Sample alert: {alert.get('alert')}")
        else:
            print("✅ Suspicious logins endpoint works (no suspicious activity detected)")
    
    def test_login_history_requires_admin(self):
        """Test login history endpoints require admin role"""
        # Try without auth
        response = requests.get(f"{BASE_URL}/api/admin/login-history")
        assert response.status_code in [401, 403], "Should require authentication"
        
        response = requests.get(f"{BASE_URL}/api/admin/login-history/suspicious")
        assert response.status_code in [401, 403], "Should require authentication"
        
        print("✅ Login history endpoints correctly require admin authentication")


class TestSupportTickets:
    """Test support ticket creation with email notifications"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_create_support_ticket(self, admin_token):
        """Test POST /api/support/tickets returns success message in Spanish"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        ticket_data = {
            "subject": "Test ticket from automated testing",
            "message": "This is a test message to verify the support ticket system is working correctly.",
            "category": "technical"
        }
        
        response = requests.post(f"{BASE_URL}/api/support/tickets", json=ticket_data, headers=headers)
        
        assert response.status_code == 200, f"Failed to create ticket: {response.text}"
        data = response.json()
        
        # Check response contains expected Spanish message
        assert "message" in data, "Missing message in response"
        assert data["message"] == "Tu solicitud ha sido enviada correctamente", f"Unexpected message: {data['message']}"
        
        # Check ticket_number is returned
        assert "ticket_number" in data, "Missing ticket_number in response"
        assert data["ticket_number"].startswith("TKT-"), f"Invalid ticket number format: {data['ticket_number']}"
        
        print(f"✅ Support ticket created successfully")
        print(f"   Message: {data['message']}")
        print(f"   Ticket Number: {data['ticket_number']}")
        
        # Note: Email sending is background/non-blocking, so we can't verify actual delivery
        # The endpoint returns success immediately
        
        return data["ticket_number"]
    
    def test_get_my_tickets(self, admin_token):
        """Test GET /api/support/tickets returns user's tickets"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/support/tickets", headers=headers)
        
        assert response.status_code == 200, f"Failed to get tickets: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Tickets should be a list"
        print(f"✅ Retrieved {len(data)} support tickets")
    
    def test_create_ticket_validation(self, admin_token):
        """Test ticket creation validates required fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Missing subject
        response = requests.post(f"{BASE_URL}/api/support/tickets", json={
            "message": "Test message"
        }, headers=headers)
        assert response.status_code == 422, "Should reject missing subject"
        
        # Subject too short
        response = requests.post(f"{BASE_URL}/api/support/tickets", json={
            "subject": "Hi",
            "message": "Test message that is long enough"
        }, headers=headers)
        assert response.status_code == 422, "Should reject short subject"
        
        print("✅ Ticket validation working correctly")


class TestChatbot:
    """Test chatbot endpoint still works"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_chatbot_message(self, admin_token):
        """Test POST /api/chatbot/message works"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.post(f"{BASE_URL}/api/chatbot/message", json={
            "message": "retiro"
        }, headers=headers)
        
        assert response.status_code == 200, f"Chatbot failed: {response.text}"
        data = response.json()
        
        assert "response" in data, "Missing response in chatbot reply"
        assert len(data["response"]) > 0, "Empty chatbot response"
        
        print(f"✅ Chatbot working: {data['response'][:100]}...")


class TestAuthMe:
    """Test auth/me endpoint"""
    
    def test_get_me(self):
        """Test GET /api/auth/me returns user info"""
        # First login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        
        # Then get me
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        
        assert response.status_code == 200, f"Failed to get me: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert "email" in data
        assert data["email"] == ADMIN_EMAIL
        assert "role" in data
        assert data["role"] == "admin"
        
        print(f"✅ Auth/me working: {data['email']} ({data['role']})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
