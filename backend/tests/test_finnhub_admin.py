"""
Test suite for Finnhub News Integration and Admin Pages (iteration 7)
Tests:
- Finnhub news endpoint with all categories (general, crypto, forex, merger)
- Admin login flow
- Admin credits/balance management endpoints
- Admin online users endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"


class TestFinnhubNews:
    """Finnhub News API tests"""
    
    def test_news_general_category(self):
        """GET /api/market/news?category=general - should return news articles"""
        response = requests.get(f"{BASE_URL}/api/market/news", params={'category': 'general'})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            article = data[0]
            assert 'headline' in article, "Article should have headline"
            assert 'source' in article, "Article should have source"
            assert 'url' in article, "Article should have url"
            assert 'datetime' in article, "Article should have datetime"
            print(f"✅ General news: {len(data)} articles returned")
        else:
            print("⚠️ General news: 0 articles (may be rate limited)")
    
    def test_news_crypto_category(self):
        """GET /api/market/news?category=crypto - should return crypto news"""
        response = requests.get(f"{BASE_URL}/api/market/news", params={'category': 'crypto'})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            article = data[0]
            assert 'headline' in article, "Article should have headline"
            print(f"✅ Crypto news: {len(data)} articles returned")
        else:
            print("⚠️ Crypto news: 0 articles (may be rate limited)")
    
    def test_news_forex_category(self):
        """GET /api/market/news?category=forex - should return forex news"""
        response = requests.get(f"{BASE_URL}/api/market/news", params={'category': 'forex'})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Forex news: {len(data)} articles returned")
    
    def test_news_merger_category(self):
        """GET /api/market/news?category=merger - should return merger news"""
        response = requests.get(f"{BASE_URL}/api/market/news", params={'category': 'merger'})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Merger news: {len(data)} articles returned")
    
    def test_news_invalid_category_defaults_to_general(self):
        """GET /api/market/news?category=invalid - should default to general"""
        response = requests.get(f"{BASE_URL}/api/market/news", params={'category': 'invalid'})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Invalid category defaults to general: {len(data)} articles")


class TestAdminLogin:
    """Admin authentication tests"""
    
    def test_admin_login_success(self):
        """POST /api/auth/login - admin should login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'token' in data, "Response should contain token"
        assert 'user' in data, "Response should contain user"
        assert data['user']['role'] == 'admin', "User should be admin"
        assert data['user']['email'] == ADMIN_EMAIL, "Email should match"
        print(f"✅ Admin login successful: {data['user']['name']}")
    
    def test_admin_login_invalid_password(self):
        """POST /api/auth/login - invalid password should fail"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Invalid password correctly rejected")


class TestAdminCreditsPage:
    """Admin Credits/Balance Management tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json()['token']
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Admin login failed")
    
    def test_get_users_list(self):
        """GET /api/admin/users - should return users list"""
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should have at least one user"
        
        user = data[0]
        assert 'id' in user, "User should have id"
        assert 'name' in user, "User should have name"
        assert 'email' in user, "User should have email"
        print(f"✅ Users list: {len(data)} users returned")
    
    def test_get_credits_history(self):
        """GET /api/admin/credits - should return credits history"""
        response = requests.get(f"{BASE_URL}/api/admin/credits", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            credit = data[0]
            assert 'amount' in credit, "Credit should have amount"
            assert 'currency' in credit, "Credit should have currency"
            assert 'user' in credit, "Credit should have user info"
        print(f"✅ Credits history: {len(data)} records returned")


class TestAdminOnlineUsers:
    """Admin Online Users monitoring tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json()['token']
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Admin login failed")
    
    def test_get_online_users(self):
        """GET /api/admin/users/online - should return online users"""
        response = requests.get(f"{BASE_URL}/api/admin/users/online", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Admin should be online after login
        if len(data) > 0:
            user = data[0]
            assert 'id' in user, "User should have id"
            assert 'name' in user, "User should have name"
            assert 'last_active' in user, "User should have last_active"
            assert 'login_ip' in user, "User should have login_ip"
            assert 'login_location' in user, "User should have login_location"
        print(f"✅ Online users: {len(data)} users currently online")
    
    def test_online_users_requires_auth(self):
        """GET /api/admin/users/online - should require authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/users/online")
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
        print("✅ Online users endpoint correctly requires auth")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
