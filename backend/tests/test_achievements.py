"""
Test suite for Achievements/Medals System
Tests the 10 achievements across 5 categories with auto-detection based on user actions.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"
BRONCE_EMAIL = "test.bronce@test.com"
BRONCE_PASSWORD = "Test1234!"


class TestAchievementsAPI:
    """Test GET /api/user/achievements endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code}")
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def bronce_token(self):
        """Get test user (Bronce) auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": BRONCE_EMAIL,
            "password": BRONCE_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Bronce user login failed: {response.status_code}")
        return response.json().get("token")
    
    def test_achievements_requires_auth(self):
        """Test that achievements endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/user/achievements")
        assert response.status_code == 403 or response.status_code == 401, \
            f"Expected 401/403 without auth, got {response.status_code}"
    
    def test_achievements_returns_all_fields(self, admin_token):
        """Test that achievements response contains all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/user/achievements",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Check top-level fields
        assert "achievements" in data, "Missing 'achievements' field"
        assert "total" in data, "Missing 'total' field"
        assert "completed" in data, "Missing 'completed' field"
        assert "progress" in data, "Missing 'progress' field"
        assert "newly_unlocked" in data, "Missing 'newly_unlocked' field"
        
        # Verify total is 10
        assert data["total"] == 10, f"Expected 10 total achievements, got {data['total']}"
    
    def test_achievements_structure(self, admin_token):
        """Test that each achievement has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/user/achievements",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        achievements = data["achievements"]
        
        # Check each achievement has required fields
        for ach in achievements:
            assert "id" in ach, f"Achievement missing 'id': {ach}"
            assert "name" in ach, f"Achievement missing 'name': {ach}"
            assert "desc" in ach, f"Achievement missing 'desc': {ach}"
            assert "icon" in ach, f"Achievement missing 'icon': {ach}"
            assert "category" in ach, f"Achievement missing 'category': {ach}"
            assert "unlocked" in ach, f"Achievement missing 'unlocked': {ach}"
            # unlocked_at can be None for locked achievements
    
    def test_admin_has_expected_achievements(self, admin_token):
        """Test that admin user has 7/10 achievements unlocked"""
        response = requests.get(
            f"{BASE_URL}/api/user/achievements",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Admin should have 7 achievements: first_login, kyc_verified, first_investment, 
        # first_withdrawal, level_plata, level_oro, level_platino
        expected_unlocked = {
            'first_login', 'kyc_verified', 'first_investment', 
            'first_withdrawal', 'level_plata', 'level_oro', 'level_platino'
        }
        
        unlocked_ids = {a['id'] for a in data['achievements'] if a['unlocked']}
        
        # Check that expected achievements are unlocked
        for ach_id in expected_unlocked:
            assert ach_id in unlocked_ids, f"Admin should have '{ach_id}' unlocked"
        
        # Verify completed count
        assert data['completed'] >= 7, f"Admin should have at least 7 achievements, got {data['completed']}"
    
    def test_bronce_user_has_first_login_only(self, bronce_token):
        """Test that Bronce test user has only first_login achievement"""
        response = requests.get(
            f"{BASE_URL}/api/user/achievements",
            headers={"Authorization": f"Bearer {bronce_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Bronce user should have at least first_login
        unlocked_ids = {a['id'] for a in data['achievements'] if a['unlocked']}
        assert 'first_login' in unlocked_ids, "Bronce user should have 'first_login' achievement"
        
        # Should have 1 or very few achievements (just first_login)
        assert data['completed'] >= 1, "Bronce user should have at least 1 achievement"
        assert data['completed'] <= 3, f"Bronce user should have few achievements, got {data['completed']}"
    
    def test_progress_percentage_calculation(self, admin_token):
        """Test that progress percentage is calculated correctly"""
        response = requests.get(
            f"{BASE_URL}/api/user/achievements",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Progress should be (completed/total) * 100
        expected_progress = round((data['completed'] / data['total']) * 100)
        assert data['progress'] == expected_progress, \
            f"Progress mismatch: expected {expected_progress}, got {data['progress']}"
    
    def test_all_categories_present(self, admin_token):
        """Test that all 5 categories are represented"""
        response = requests.get(
            f"{BASE_URL}/api/user/achievements",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        categories = {a['category'] for a in data['achievements']}
        
        expected_categories = {'basico', 'transacciones', 'inversion', 'actividad', 'niveles'}
        assert categories == expected_categories, \
            f"Categories mismatch: expected {expected_categories}, got {categories}"
    
    def test_all_10_achievements_defined(self, admin_token):
        """Test that all 10 achievements are defined"""
        response = requests.get(
            f"{BASE_URL}/api/user/achievements",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        achievement_ids = {a['id'] for a in data['achievements']}
        
        expected_ids = {
            'first_login', 'kyc_verified', 'first_investment', 'first_withdrawal',
            'streak_5', 'active_user', 'committed_investor',
            'level_plata', 'level_oro', 'level_platino'
        }
        
        assert achievement_ids == expected_ids, \
            f"Achievement IDs mismatch: expected {expected_ids}, got {achievement_ids}"
    
    def test_newly_unlocked_is_list(self, admin_token):
        """Test that newly_unlocked is a list (may be empty on subsequent calls)"""
        response = requests.get(
            f"{BASE_URL}/api/user/achievements",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data['newly_unlocked'], list), \
            f"newly_unlocked should be a list, got {type(data['newly_unlocked'])}"
    
    def test_unlocked_achievements_have_date(self, admin_token):
        """Test that unlocked achievements have unlocked_at date"""
        response = requests.get(
            f"{BASE_URL}/api/user/achievements",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        
        for ach in data['achievements']:
            if ach['unlocked']:
                assert ach.get('unlocked_at') is not None, \
                    f"Unlocked achievement '{ach['id']}' should have unlocked_at date"
    
    def test_locked_achievements_no_date(self, admin_token):
        """Test that locked achievements have no unlocked_at date"""
        response = requests.get(
            f"{BASE_URL}/api/user/achievements",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        
        for ach in data['achievements']:
            if not ach['unlocked']:
                assert ach.get('unlocked_at') is None, \
                    f"Locked achievement '{ach['id']}' should not have unlocked_at date"


class TestAchievementCategories:
    """Test achievement category distribution"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code}")
        return response.json().get("token")
    
    def test_basico_category_has_2_achievements(self, admin_token):
        """Test that 'basico' category has 2 achievements"""
        response = requests.get(
            f"{BASE_URL}/api/user/achievements",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        basico = [a for a in data['achievements'] if a['category'] == 'basico']
        assert len(basico) == 2, f"Expected 2 basico achievements, got {len(basico)}"
        
        basico_ids = {a['id'] for a in basico}
        assert basico_ids == {'first_login', 'kyc_verified'}
    
    def test_transacciones_category_has_1_achievement(self, admin_token):
        """Test that 'transacciones' category has 1 achievement"""
        response = requests.get(
            f"{BASE_URL}/api/user/achievements",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        transacciones = [a for a in data['achievements'] if a['category'] == 'transacciones']
        assert len(transacciones) == 1, f"Expected 1 transacciones achievement, got {len(transacciones)}"
        assert transacciones[0]['id'] == 'first_withdrawal'
    
    def test_inversion_category_has_2_achievements(self, admin_token):
        """Test that 'inversion' category has 2 achievements"""
        response = requests.get(
            f"{BASE_URL}/api/user/achievements",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        inversion = [a for a in data['achievements'] if a['category'] == 'inversion']
        assert len(inversion) == 2, f"Expected 2 inversion achievements, got {len(inversion)}"
        
        inversion_ids = {a['id'] for a in inversion}
        assert inversion_ids == {'first_investment', 'committed_investor'}
    
    def test_actividad_category_has_2_achievements(self, admin_token):
        """Test that 'actividad' category has 2 achievements"""
        response = requests.get(
            f"{BASE_URL}/api/user/achievements",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        actividad = [a for a in data['achievements'] if a['category'] == 'actividad']
        assert len(actividad) == 2, f"Expected 2 actividad achievements, got {len(actividad)}"
        
        actividad_ids = {a['id'] for a in actividad}
        assert actividad_ids == {'streak_5', 'active_user'}
    
    def test_niveles_category_has_3_achievements(self, admin_token):
        """Test that 'niveles' category has 3 achievements"""
        response = requests.get(
            f"{BASE_URL}/api/user/achievements",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        niveles = [a for a in data['achievements'] if a['category'] == 'niveles']
        assert len(niveles) == 3, f"Expected 3 niveles achievements, got {len(niveles)}"
        
        niveles_ids = {a['id'] for a in niveles}
        assert niveles_ids == {'level_plata', 'level_oro', 'level_platino'}


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
