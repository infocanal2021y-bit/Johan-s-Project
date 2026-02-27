import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fintech-deposits.preview.emergentagent.com').rstrip('/')

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def demo_user_token(api_client):
    """Get auth token for demo user"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "demo@vaultbank.com",
        "password": "Password123"
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Demo user login failed — skipping authenticated tests")

@pytest.fixture
def demo_user_client(api_client, demo_user_token):
    """Session with demo user auth header"""
    api_client.headers.update({"Authorization": f"Bearer {demo_user_token}"})
    return api_client

@pytest.fixture
def admin_user_token(api_client):
    """Get auth token for admin user"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@vaultbank.com",
        "password": "Admin123!"
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Admin user login failed — skipping admin tests")

@pytest.fixture
def admin_client(api_client, admin_user_token):
    """Session with admin auth header"""
    api_client.headers.update({"Authorization": f"Bearer {admin_user_token}"})
    return api_client
