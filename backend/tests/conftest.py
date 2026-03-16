import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def admin_token(api_client):
    """Get admin authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Admin authentication failed — skipping admin tests")

@pytest.fixture
def admin_client(api_client, admin_token):
    """Session with admin auth header"""
    api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
    return api_client

@pytest.fixture
def test_user_token(api_client):
    """Create a test user and get token"""
    import uuid
    unique_id = str(uuid.uuid4())[:8]
    test_email = f"testuser_{unique_id}@test.com"
    test_password = "TestPass123!"
    
    # Register new user
    response = api_client.post(f"{BASE_URL}/api/auth/register", json={
        "name": f"Test User {unique_id}",
        "email": test_email,
        "password": test_password
    })
    
    if response.status_code == 200:
        data = response.json()
        return {
            "token": data.get("token"),
            "user": data.get("user"),
            "email": test_email,
            "password": test_password
        }
    pytest.skip("User registration failed — skipping user tests")

@pytest.fixture
def test_user_client(api_client, test_user_token):
    """Session with test user auth header"""
    api_client.headers.update({"Authorization": f"Bearer {test_user_token['token']}"})
    return api_client, test_user_token
