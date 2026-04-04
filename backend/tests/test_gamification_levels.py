"""
Test Gamification / User Levels System
- Level calculation: Bronce, Plata, Oro, Platino
- Progress bar and dynamic messages
- Level-up detection
- Investment balance counts toward level
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"
TEST_BRONCE_EMAIL = "test.bronce@test.com"
TEST_BRONCE_PASSWORD = "Test1234!"


class TestGamificationLevels:
    """Test gamification level system"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def login(self, email, password):
        """Helper to login and get token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return response.json()
        return None
    
    # ==================== ADMIN (PLATINO) TESTS ====================
    
    def test_admin_login_success(self):
        """Test admin can login"""
        result = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert result is not None, "Admin login failed"
        assert "token" in result
        print(f"✅ Admin login successful: {result['user']['name']}")
    
    def test_admin_level_endpoint_returns_data(self):
        """Test GET /api/user/level returns level data for admin"""
        self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        response = self.session.get(f"{BASE_URL}/api/user/level")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify required fields
        assert "level" in data, "Missing 'level' field"
        assert "label" in data, "Missing 'label' field"
        assert "icon" in data, "Missing 'icon' field"
        assert "benefits" in data, "Missing 'benefits' field"
        assert "total_balance_eur" in data, "Missing 'total_balance_eur' field"
        assert "next" in data, "Missing 'next' field"
        assert "message" in data, "Missing 'message' field"
        assert "leveled_up" in data, "Missing 'leveled_up' field"
        
        print(f"✅ Level endpoint returns all required fields")
        print(f"   Level: {data['level']} ({data['label']} {data['icon']})")
        print(f"   Balance EUR: €{data['total_balance_eur']:,.2f}")
        print(f"   Benefits: {data['benefits']}")
    
    def test_admin_is_platino_level(self):
        """Test admin with ~€74,485 balance is Platino level"""
        self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        response = self.session.get(f"{BASE_URL}/api/user/level")
        
        assert response.status_code == 200
        data = response.json()
        
        # Admin should be Platino (balance >= €25,000)
        assert data['level'] == 'platino', f"Expected 'platino', got '{data['level']}'"
        assert data['label'] == 'Platino', f"Expected 'Platino', got '{data['label']}'"
        assert data['icon'] == '💎', f"Expected '💎', got '{data['icon']}'"
        
        print(f"✅ Admin is Platino level (balance: €{data['total_balance_eur']:,.2f})")
    
    def test_platino_has_no_next_level(self):
        """Test Platino user shows 'Nivel maximo alcanzado' (no next level)"""
        self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        response = self.session.get(f"{BASE_URL}/api/user/level")
        
        assert response.status_code == 200
        data = response.json()
        
        # Platino is max level, so next should be None
        assert data['next'] is None, f"Expected next=None for Platino, got {data['next']}"
        
        print(f"✅ Platino has no next level (max level reached)")
    
    def test_platino_benefits(self):
        """Test Platino level has correct benefits"""
        self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        response = self.session.get(f"{BASE_URL}/api/user/level")
        
        assert response.status_code == 200
        data = response.json()
        
        expected_benefits = [
            'Maxima prioridad',
            'Acceso anticipado a nuevas funciones',
            'Soporte dedicado',
            'Beneficios exclusivos'
        ]
        
        assert data['benefits'] == expected_benefits, f"Benefits mismatch: {data['benefits']}"
        print(f"✅ Platino benefits correct: {data['benefits']}")
    
    # ==================== BRONCE USER TESTS ====================
    
    def test_create_bronce_test_user(self):
        """Create a test user with €0 balance (Bronce level)"""
        # Try to register, if already exists, just login
        response = self.session.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Test Bronce User",
            "email": TEST_BRONCE_EMAIL,
            "password": TEST_BRONCE_PASSWORD
        })
        
        if response.status_code == 400 and "already registered" in response.text.lower():
            print(f"✅ Test Bronce user already exists, will login")
        elif response.status_code == 200:
            print(f"✅ Test Bronce user created successfully")
        else:
            print(f"⚠️ Registration response: {response.status_code} - {response.text}")
    
    def test_bronce_user_level(self):
        """Test user with €0 balance is Bronce level"""
        result = self.login(TEST_BRONCE_EMAIL, TEST_BRONCE_PASSWORD)
        if not result:
            pytest.skip("Could not login as test bronce user")
        
        response = self.session.get(f"{BASE_URL}/api/user/level")
        
        assert response.status_code == 200
        data = response.json()
        
        # User with €0 balance should be Bronce
        assert data['level'] == 'bronce', f"Expected 'bronce', got '{data['level']}'"
        assert data['label'] == 'Bronce', f"Expected 'Bronce', got '{data['label']}'"
        assert data['icon'] == '🥉', f"Expected '🥉', got '{data['icon']}'"
        
        print(f"✅ Test user is Bronce level (balance: €{data['total_balance_eur']:,.2f})")
    
    def test_bronce_has_next_level_plata(self):
        """Test Bronce user has next level = Plata"""
        result = self.login(TEST_BRONCE_EMAIL, TEST_BRONCE_PASSWORD)
        if not result:
            pytest.skip("Could not login as test bronce user")
        
        response = self.session.get(f"{BASE_URL}/api/user/level")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data['next'] is not None, "Bronce should have next level"
        assert data['next']['next_level'] == 'plata', f"Expected next_level='plata', got '{data['next']['next_level']}'"
        assert data['next']['next_label'] == 'Plata', f"Expected next_label='Plata', got '{data['next']['next_label']}'"
        
        print(f"✅ Bronce next level is Plata")
    
    def test_bronce_progress_to_plata(self):
        """Test Bronce user shows 0% progress to Plata with 'Te faltan €2500' message"""
        result = self.login(TEST_BRONCE_EMAIL, TEST_BRONCE_PASSWORD)
        if not result:
            pytest.skip("Could not login as test bronce user")
        
        response = self.session.get(f"{BASE_URL}/api/user/level")
        
        assert response.status_code == 200
        data = response.json()
        
        # With €0 balance, progress should be 0%
        assert data['next']['progress'] == 0, f"Expected 0% progress, got {data['next']['progress']}%"
        
        # Balance needed should be €2500
        assert data['next']['balance_needed'] == 2500, f"Expected balance_needed=2500, got {data['next']['balance_needed']}"
        
        print(f"✅ Bronce progress: {data['next']['progress']}%, needs €{data['next']['balance_needed']}")
    
    def test_bronce_dynamic_message(self):
        """Test Bronce user gets appropriate dynamic message"""
        result = self.login(TEST_BRONCE_EMAIL, TEST_BRONCE_PASSWORD)
        if not result:
            pytest.skip("Could not login as test bronce user")
        
        response = self.session.get(f"{BASE_URL}/api/user/level")
        
        assert response.status_code == 200
        data = response.json()
        
        # With 0% progress, should get "Completa tu proceso" message
        if data['next']['progress'] < 20:
            expected_msg = 'Completa tu proceso para mejorar tus beneficios'
            assert data['message'] == expected_msg, f"Expected '{expected_msg}', got '{data['message']}'"
            print(f"✅ Dynamic message for low progress: '{data['message']}'")
        else:
            print(f"⚠️ Progress is {data['next']['progress']}%, message: '{data['message']}'")
    
    def test_bronce_benefits(self):
        """Test Bronce level has correct benefits"""
        result = self.login(TEST_BRONCE_EMAIL, TEST_BRONCE_PASSWORD)
        if not result:
            pytest.skip("Could not login as test bronce user")
        
        response = self.session.get(f"{BASE_URL}/api/user/level")
        
        assert response.status_code == 200
        data = response.json()
        
        expected_benefits = [
            'Acceso basico a la plataforma',
            'Tiempo de procesamiento estandar'
        ]
        
        assert data['benefits'] == expected_benefits, f"Benefits mismatch: {data['benefits']}"
        print(f"✅ Bronce benefits correct: {data['benefits']}")
    
    # ==================== LEVEL CALCULATION TESTS ====================
    
    def test_level_includes_investment_balance(self):
        """Test that investment (savings) balance counts toward level calculation"""
        self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        response = self.session.get(f"{BASE_URL}/api/user/level")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check investment fields
        assert "investment_eur" in data, "Missing 'investment_eur' field"
        assert "has_investment" in data, "Missing 'has_investment' field"
        
        print(f"✅ Investment balance included: €{data['investment_eur']:,.2f}")
        print(f"   Has investment: {data['has_investment']}")
        print(f"   Total balance EUR: €{data['total_balance_eur']:,.2f}")
    
    def test_login_count_included(self):
        """Test that login count is included in level data"""
        self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        response = self.session.get(f"{BASE_URL}/api/user/level")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "login_count_30d" in data, "Missing 'login_count_30d' field"
        assert isinstance(data['login_count_30d'], int), "login_count_30d should be int"
        
        print(f"✅ Login count (30d): {data['login_count_30d']}")
    
    def test_leveled_up_field_exists(self):
        """Test that leveled_up field exists for level-up detection"""
        self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        response = self.session.get(f"{BASE_URL}/api/user/level")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "leveled_up" in data, "Missing 'leveled_up' field"
        assert isinstance(data['leveled_up'], bool), "leveled_up should be boolean"
        
        print(f"✅ leveled_up field exists: {data['leveled_up']}")
    
    # ==================== LEVEL THRESHOLDS TESTS ====================
    
    def test_level_order_field(self):
        """Test that level order field exists for comparison"""
        self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        response = self.session.get(f"{BASE_URL}/api/user/level")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "order" in data, "Missing 'order' field"
        
        # Platino should have order 3 (highest)
        if data['level'] == 'platino':
            assert data['order'] == 3, f"Platino should have order=3, got {data['order']}"
        
        print(f"✅ Level order: {data['order']} for {data['level']}")
    
    def test_next_level_benefits_included(self):
        """Test that next level benefits are included for non-max levels"""
        result = self.login(TEST_BRONCE_EMAIL, TEST_BRONCE_PASSWORD)
        if not result:
            pytest.skip("Could not login as test bronce user")
        
        response = self.session.get(f"{BASE_URL}/api/user/level")
        
        assert response.status_code == 200
        data = response.json()
        
        if data['next']:
            assert "next_benefits" in data['next'], "Missing 'next_benefits' in next level info"
            assert len(data['next']['next_benefits']) > 0, "next_benefits should not be empty"
            print(f"✅ Next level benefits: {data['next']['next_benefits']}")
        else:
            print(f"⚠️ No next level (max level reached)")


class TestLevelAPIValidation:
    """Test API validation and error handling"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_level_endpoint_requires_auth(self):
        """Test that /api/user/level requires authentication"""
        response = self.session.get(f"{BASE_URL}/api/user/level")
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✅ Level endpoint requires authentication (status: {response.status_code})")
    
    def test_level_endpoint_with_invalid_token(self):
        """Test that invalid token is rejected"""
        self.session.headers.update({"Authorization": "Bearer invalid_token_12345"})
        response = self.session.get(f"{BASE_URL}/api/user/level")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✅ Invalid token rejected (status: {response.status_code})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
