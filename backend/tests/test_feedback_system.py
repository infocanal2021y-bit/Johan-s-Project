"""
Test Feedback System - Backend API Tests
Tests for: POST /api/feedback, GET /api/feedback/mine, GET /api/admin/feedback
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"


class TestFeedbackSubmission:
    """Tests for POST /api/feedback endpoint"""
    
    def test_submit_feedback_success(self, test_user_client):
        """Test submitting feedback with rating 4, comment, and category 'retiros'"""
        client, user_data = test_user_client
        
        response = client.post(f"{BASE_URL}/api/feedback", json={
            "rating": 4,
            "comment": "Test feedback",
            "category": "retiros"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data
        assert "id" in data
        assert data["message"] == "Feedback enviado correctamente"
        print(f"✅ POST /api/feedback returns success with id: {data['id']}")
    
    def test_submit_feedback_all_ratings(self, test_user_client):
        """Test submitting feedback with all valid ratings (1-5)"""
        client, user_data = test_user_client
        
        for rating in [1, 2, 3, 5]:  # 4 already tested above
            response = client.post(f"{BASE_URL}/api/feedback", json={
                "rating": rating,
                "comment": f"Test feedback rating {rating}",
                "category": "general"
            })
            assert response.status_code == 200, f"Rating {rating} failed: {response.text}"
        print("✅ POST /api/feedback accepts all ratings 1-5")
    
    def test_submit_feedback_all_categories(self, test_user_client):
        """Test submitting feedback with different categories"""
        client, user_data = test_user_client
        categories = ["general", "retiros", "soporte", "interfaz", "pagos"]
        
        for cat in categories:
            response = client.post(f"{BASE_URL}/api/feedback", json={
                "rating": 3,
                "comment": f"Test for category {cat}",
                "category": cat
            })
            assert response.status_code == 200, f"Category {cat} failed: {response.text}"
        print("✅ POST /api/feedback accepts all categories")
    
    def test_submit_feedback_without_comment(self, test_user_client):
        """Test submitting feedback without optional comment"""
        client, user_data = test_user_client
        
        response = client.post(f"{BASE_URL}/api/feedback", json={
            "rating": 5,
            "category": "general"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✅ POST /api/feedback works without comment (optional)")
    
    def test_submit_feedback_requires_auth(self, api_client):
        """Test that feedback submission requires authentication"""
        response = api_client.post(f"{BASE_URL}/api/feedback", json={
            "rating": 4,
            "comment": "Test",
            "category": "general"
        })
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ POST /api/feedback requires authentication")
    
    def test_submit_feedback_invalid_rating(self, test_user_client):
        """Test that invalid ratings are rejected"""
        client, user_data = test_user_client
        
        # Rating 0 (below minimum)
        response = client.post(f"{BASE_URL}/api/feedback", json={
            "rating": 0,
            "category": "general"
        })
        assert response.status_code == 422, f"Rating 0 should be rejected: {response.status_code}"
        
        # Rating 6 (above maximum)
        response = client.post(f"{BASE_URL}/api/feedback", json={
            "rating": 6,
            "category": "general"
        })
        assert response.status_code == 422, f"Rating 6 should be rejected: {response.status_code}"
        print("✅ POST /api/feedback rejects invalid ratings (0, 6)")


class TestFeedbackHistory:
    """Tests for GET /api/feedback/mine endpoint"""
    
    def test_get_my_feedback_returns_list(self, test_user_client):
        """Test that user can retrieve their feedback history"""
        client, user_data = test_user_client
        
        # First submit some feedback
        client.post(f"{BASE_URL}/api/feedback", json={
            "rating": 4,
            "comment": "History test feedback",
            "category": "soporte"
        })
        
        # Then get history
        response = client.get(f"{BASE_URL}/api/feedback/mine")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of feedbacks"
        assert len(data) >= 1, "Expected at least 1 feedback in history"
        
        # Verify feedback structure
        feedback = data[0]
        assert "rating" in feedback
        assert "category" in feedback
        assert "created_at" in feedback
        print(f"✅ GET /api/feedback/mine returns list with {len(data)} feedbacks")
    
    def test_get_my_feedback_requires_auth(self, api_client):
        """Test that feedback history requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/feedback/mine")
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ GET /api/feedback/mine requires authentication")


class TestAdminFeedback:
    """Tests for GET /api/admin/feedback endpoint"""
    
    def test_admin_get_all_feedback(self, admin_client):
        """Test admin can get all feedbacks with stats"""
        response = admin_client.get(f"{BASE_URL}/api/admin/feedback")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure - stats are nested under 'stats' key
        assert "feedbacks" in data, "Missing 'feedbacks' in response"
        assert "stats" in data, "Missing 'stats' in response"
        
        stats = data["stats"]
        assert "total" in stats, "Missing 'total' in stats"
        assert "average_rating" in stats, "Missing 'average_rating' in stats"
        assert "distribution" in stats, "Missing 'distribution' in stats"
        
        # Verify distribution has all ratings 1-5
        distribution = stats["distribution"]
        for i in range(1, 6):
            assert str(i) in distribution or i in distribution, f"Missing rating {i} in distribution"
        
        print(f"✅ GET /api/admin/feedback returns stats: total={stats['total']}, avg={stats['average_rating']:.2f}")
        print(f"   Distribution: {stats['distribution']}")
    
    def test_admin_feedback_requires_admin_role(self, test_user_client):
        """Test that admin feedback endpoint requires admin role"""
        client, user_data = test_user_client
        
        response = client.get(f"{BASE_URL}/api/admin/feedback")
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ GET /api/admin/feedback requires admin role")
    
    def test_admin_feedback_requires_auth(self, api_client):
        """Test that admin feedback endpoint requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/admin/feedback")
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ GET /api/admin/feedback requires authentication")


class TestScoringModule:
    """Tests for services/scoring.py module exports"""
    
    def test_scoring_module_imports(self):
        """Test that scoring.py exports required functions"""
        try:
            from services.scoring import process_user_reminders, process_user_scoring
            assert callable(process_user_reminders), "process_user_reminders should be callable"
            assert callable(process_user_scoring), "process_user_scoring should be callable"
            print("✅ services/scoring.py exports process_user_reminders and process_user_scoring")
        except ImportError as e:
            # If running from test directory, try different import path
            import sys
            sys.path.insert(0, '/app/backend')
            from services.scoring import process_user_reminders, process_user_scoring
            assert callable(process_user_reminders)
            assert callable(process_user_scoring)
            print("✅ services/scoring.py exports process_user_reminders and process_user_scoring")


# Fixtures from conftest.py are used
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
    pytest.skip("Admin authentication failed")

@pytest.fixture
def admin_client(api_client, admin_token):
    """Session with admin auth header"""
    api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
    return api_client

@pytest.fixture
def test_user_token(api_client):
    """Create a test user and get token"""
    unique_id = str(uuid.uuid4())[:8]
    test_email = f"testfeedback_{unique_id}@test.com"
    test_password = "TestPass123!"
    
    response = api_client.post(f"{BASE_URL}/api/auth/register", json={
        "name": f"Feedback Test User {unique_id}",
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
    pytest.skip("User registration failed")

@pytest.fixture
def test_user_client(api_client, test_user_token):
    """Session with test user auth header"""
    api_client.headers.update({"Authorization": f"Bearer {test_user_token['token']}"})
    return api_client, test_user_token
