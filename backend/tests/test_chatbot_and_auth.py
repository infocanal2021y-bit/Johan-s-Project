"""
Test suite for LIONSBIT VERIFICACION - Chatbot and Auth features
Tests: Chatbot API, Login flow, Health check
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://compliance-dash-32.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"


class TestHealthCheck:
    """Health check endpoint tests"""
    
    def test_api_health(self):
        """Test GET /api/ returns version info"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "version" in data
        assert "LIONSBIT" in data["message"]
        print(f"✅ Health check passed: {data}")


class TestAdminLogin:
    """Admin login tests"""
    
    def test_admin_login_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        assert "login_info" in data
        print(f"✅ Admin login successful: {data['user']['name']}")
        return data["token"]
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✅ Invalid credentials correctly rejected")
    
    def test_auth_me_with_token(self):
        """Test GET /api/auth/me with valid token"""
        # First login to get token
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_response.json()["token"]
        
        # Test /auth/me
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "admin"
        print(f"✅ Auth/me returned correct user: {data['name']}")


class TestChatbotAPI:
    """Chatbot API endpoint tests"""
    
    def test_chatbot_retiro_keyword(self):
        """Test chatbot with 'retiro' keyword"""
        response = requests.post(f"{BASE_URL}/api/chatbot/message", json={
            "message": "retiro"
        })
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert data["matched"] == True
        assert "retiro" in data["response"].lower() or "withdraw" in data["response"].lower()
        print(f"✅ Chatbot 'retiro' response: matched={data['matched']}")
    
    def test_chatbot_impuesto_keyword(self):
        """Test chatbot with 'impuesto' keyword"""
        response = requests.post(f"{BASE_URL}/api/chatbot/message", json={
            "message": "impuesto"
        })
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert data["matched"] == True
        assert "4,850" in data["response"] or "4850" in data["response"]
        print(f"✅ Chatbot 'impuesto' response: matched={data['matched']}")
    
    def test_chatbot_tiempo_keyword(self):
        """Test chatbot with 'tiempo' keyword"""
        response = requests.post(f"{BASE_URL}/api/chatbot/message", json={
            "message": "cuánto tiempo tarda"
        })
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert data["matched"] == True
        print(f"✅ Chatbot 'tiempo' response: matched={data['matched']}")
    
    def test_chatbot_verificacion_keyword(self):
        """Test chatbot with 'verificación' keyword"""
        response = requests.post(f"{BASE_URL}/api/chatbot/message", json={
            "message": "verificación"
        })
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert data["matched"] == True
        assert "kyc" in data["response"].lower() or "verificar" in data["response"].lower()
        print(f"✅ Chatbot 'verificación' response: matched={data['matched']}")
    
    def test_chatbot_minimo_keyword(self):
        """Test chatbot with 'mínimo' keyword"""
        response = requests.post(f"{BASE_URL}/api/chatbot/message", json={
            "message": "pago mínimo"
        })
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert data["matched"] == True
        assert "200" in data["response"]
        print(f"✅ Chatbot 'mínimo' response: matched={data['matched']}")
    
    def test_chatbot_soporte_keyword(self):
        """Test chatbot with 'soporte' keyword"""
        response = requests.post(f"{BASE_URL}/api/chatbot/message", json={
            "message": "soporte"
        })
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert data["matched"] == True
        print(f"✅ Chatbot 'soporte' response: matched={data['matched']}")
    
    def test_chatbot_unmatched_query(self):
        """Test chatbot with unmatched query"""
        response = requests.post(f"{BASE_URL}/api/chatbot/message", json={
            "message": "random query that should not match anything specific"
        })
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert data["matched"] == False
        assert "No encontré" in data["response"] or "ticket" in data["response"].lower()
        print(f"✅ Chatbot unmatched query handled correctly: matched={data['matched']}")
    
    def test_chatbot_empty_message(self):
        """Test chatbot with empty message"""
        response = requests.post(f"{BASE_URL}/api/chatbot/message", json={
            "message": ""
        })
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert data["matched"] == False
        print(f"✅ Chatbot empty message handled: matched={data['matched']}")


class TestDashboardAccess:
    """Test dashboard access after login"""
    
    def test_accounts_endpoint(self):
        """Test GET /api/accounts with auth"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_response.json()["token"]
        
        # Get accounts
        response = requests.get(f"{BASE_URL}/api/accounts", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Accounts endpoint returned {len(data)} accounts")
    
    def test_notifications_endpoint(self):
        """Test GET /api/notifications with auth"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_response.json()["token"]
        
        # Get notifications
        response = requests.get(f"{BASE_URL}/api/notifications", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        # Notifications endpoint returns object with notifications list
        assert "notifications" in data or isinstance(data, list)
        notifications = data.get("notifications", data) if isinstance(data, dict) else data
        print(f"✅ Notifications endpoint returned {len(notifications)} notifications")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
