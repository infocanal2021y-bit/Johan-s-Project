"""
Test suite for Admin Withdrawals Accordion System
Tests:
- GET /api/admin/withdrawals/all - Get all withdrawals grouped by status
- GET /api/admin/withdrawals/{id}/details - Get expanded user details for a withdrawal
- POST /api/admin/withdrawals/{id}/reactivate - Reactivate a rejected withdrawal
- PUT /api/admin/withdrawals/update-status - Status advancement (pending→processing→transfer→completed)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"


class TestWithdrawalAccordionBackend:
    """Backend tests for withdrawal accordion system"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get admin token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Admin login failed: {login_response.status_code}")
        
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.admin_token = token
    
    # ==================== GET ALL WITHDRAWALS ====================
    
    def test_get_all_withdrawals_returns_200(self):
        """GET /api/admin/withdrawals/all returns 200 with list of withdrawals"""
        response = self.session.get(f"{BASE_URL}/api/admin/withdrawals/all")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET /api/admin/withdrawals/all returned {len(data)} withdrawals")
    
    def test_withdrawals_have_required_fields(self):
        """Each withdrawal has required fields for accordion display"""
        response = self.session.get(f"{BASE_URL}/api/admin/withdrawals/all")
        assert response.status_code == 200
        
        data = response.json()
        if len(data) == 0:
            pytest.skip("No withdrawals to test")
        
        withdrawal = data[0]
        required_fields = ['id', 'user_id', 'amount', 'currency', 'status', 'created_at']
        for field in required_fields:
            assert field in withdrawal, f"Missing required field: {field}"
        
        # Check user info is embedded
        assert 'user' in withdrawal, "Withdrawal should have embedded user info"
        assert 'name' in withdrawal['user'], "User should have name"
        assert 'email' in withdrawal['user'], "User should have email"
        
        print(f"✅ Withdrawal has all required fields: {required_fields}")
    
    def test_withdrawals_have_valid_statuses(self):
        """All withdrawals have valid status values"""
        response = self.session.get(f"{BASE_URL}/api/admin/withdrawals/all")
        assert response.status_code == 200
        
        data = response.json()
        valid_statuses = ['pending_tax', 'pending', 'processing', 'transfer_in_progress', 'completed', 'rejected', 'under_review', 'crypto_payment_under_review']
        
        status_counts = {}
        for w in data:
            status = w.get('status')
            assert status in valid_statuses, f"Invalid status: {status}"
            status_counts[status] = status_counts.get(status, 0) + 1
        
        print(f"✅ Status distribution: {status_counts}")
    
    # ==================== GET WITHDRAWAL DETAILS ====================
    
    def test_get_withdrawal_details_returns_user_info(self):
        """GET /api/admin/withdrawals/{id}/details returns user info, balance, and history"""
        # First get a withdrawal ID
        all_response = self.session.get(f"{BASE_URL}/api/admin/withdrawals/all")
        assert all_response.status_code == 200
        
        withdrawals = all_response.json()
        if len(withdrawals) == 0:
            pytest.skip("No withdrawals to test")
        
        withdrawal_id = withdrawals[0]['id']
        
        # Get details
        response = self.session.get(f"{BASE_URL}/api/admin/withdrawals/{withdrawal_id}/details")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check structure
        assert 'user' in data, "Response should have user info"
        assert 'balance' in data, "Response should have balance info"
        assert 'withdrawal_history' in data, "Response should have withdrawal history"
        assert 'banking_info' in data, "Response should have banking info"
        
        # Check user fields
        user = data['user']
        assert 'name' in user, "User should have name"
        assert 'email' in user, "User should have email"
        
        # Check balance fields
        balance = data['balance']
        assert 'available_usd' in balance, "Balance should have available_usd"
        assert 'available_eur' in balance, "Balance should have available_eur"
        
        print(f"✅ Withdrawal details returned: user={user.get('name')}, USD={balance.get('available_usd')}, EUR={balance.get('available_eur')}")
    
    def test_get_withdrawal_details_returns_history(self):
        """Withdrawal details include withdrawal history list"""
        all_response = self.session.get(f"{BASE_URL}/api/admin/withdrawals/all")
        withdrawals = all_response.json()
        if len(withdrawals) == 0:
            pytest.skip("No withdrawals to test")
        
        withdrawal_id = withdrawals[0]['id']
        response = self.session.get(f"{BASE_URL}/api/admin/withdrawals/{withdrawal_id}/details")
        assert response.status_code == 200
        
        data = response.json()
        history = data.get('withdrawal_history', [])
        assert isinstance(history, list), "History should be a list"
        
        if len(history) > 0:
            h = history[0]
            assert 'id' in h, "History item should have id"
            assert 'amount' in h, "History item should have amount"
            assert 'status' in h, "History item should have status"
            assert 'created_at' in h, "History item should have created_at"
        
        print(f"✅ Withdrawal history returned {len(history)} items")
    
    def test_get_withdrawal_details_404_for_invalid_id(self):
        """GET /api/admin/withdrawals/{id}/details returns 404 for invalid ID"""
        response = self.session.get(f"{BASE_URL}/api/admin/withdrawals/invalid-id-12345/details")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ Returns 404 for invalid withdrawal ID")
    
    # ==================== REACTIVATE WITHDRAWAL ====================
    
    def test_reactivate_rejected_withdrawal(self):
        """POST /api/admin/withdrawals/{id}/reactivate changes rejected to pending"""
        # Find a rejected withdrawal
        all_response = self.session.get(f"{BASE_URL}/api/admin/withdrawals/all")
        withdrawals = all_response.json()
        
        rejected = [w for w in withdrawals if w.get('status') == 'rejected']
        if len(rejected) == 0:
            pytest.skip("No rejected withdrawals to test reactivation")
        
        withdrawal_id = rejected[0]['id']
        
        # Reactivate
        response = self.session.post(f"{BASE_URL}/api/admin/withdrawals/{withdrawal_id}/reactivate")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'message' in data, "Response should have message"
        
        # Verify status changed
        verify_response = self.session.get(f"{BASE_URL}/api/admin/withdrawals/all")
        updated = [w for w in verify_response.json() if w['id'] == withdrawal_id]
        if len(updated) > 0:
            assert updated[0]['status'] == 'pending', f"Status should be pending, got {updated[0]['status']}"
        
        print(f"✅ Reactivated withdrawal {withdrawal_id[:8]}... to pending status")
    
    def test_reactivate_non_rejected_returns_400(self):
        """POST /api/admin/withdrawals/{id}/reactivate returns 400 for non-rejected"""
        # Find a non-rejected withdrawal
        all_response = self.session.get(f"{BASE_URL}/api/admin/withdrawals/all")
        withdrawals = all_response.json()
        
        non_rejected = [w for w in withdrawals if w.get('status') not in ['rejected']]
        if len(non_rejected) == 0:
            pytest.skip("No non-rejected withdrawals to test")
        
        withdrawal_id = non_rejected[0]['id']
        
        response = self.session.post(f"{BASE_URL}/api/admin/withdrawals/{withdrawal_id}/reactivate")
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"✅ Returns 400 when trying to reactivate non-rejected withdrawal (status={non_rejected[0]['status']})")
    
    def test_reactivate_invalid_id_returns_404(self):
        """POST /api/admin/withdrawals/{id}/reactivate returns 404 for invalid ID"""
        response = self.session.post(f"{BASE_URL}/api/admin/withdrawals/invalid-id-12345/reactivate")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ Returns 404 for invalid withdrawal ID on reactivate")
    
    # ==================== STATUS ADVANCEMENT ====================
    
    def test_status_advancement_pending_to_processing(self):
        """PUT /api/admin/withdrawals/update-status advances pending to processing"""
        all_response = self.session.get(f"{BASE_URL}/api/admin/withdrawals/all")
        withdrawals = all_response.json()
        
        pending = [w for w in withdrawals if w.get('status') == 'pending']
        if len(pending) == 0:
            pytest.skip("No pending withdrawals to test status advancement")
        
        withdrawal_id = pending[0]['id']
        
        response = self.session.put(f"{BASE_URL}/api/admin/withdrawals/update-status", json={
            "transaction_id": withdrawal_id,
            "status": "processing"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        print(f"✅ Advanced withdrawal {withdrawal_id[:8]}... from pending to processing")
    
    def test_status_advancement_processing_to_transfer(self):
        """PUT /api/admin/withdrawals/update-status advances processing to transfer_in_progress"""
        all_response = self.session.get(f"{BASE_URL}/api/admin/withdrawals/all")
        withdrawals = all_response.json()
        
        processing = [w for w in withdrawals if w.get('status') == 'processing']
        if len(processing) == 0:
            pytest.skip("No processing withdrawals to test")
        
        withdrawal_id = processing[0]['id']
        
        response = self.session.put(f"{BASE_URL}/api/admin/withdrawals/update-status", json={
            "transaction_id": withdrawal_id,
            "status": "transfer_in_progress"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        print(f"✅ Advanced withdrawal {withdrawal_id[:8]}... from processing to transfer_in_progress")
    
    def test_reject_withdrawal_with_reason(self):
        """PUT /api/admin/withdrawals/update-status can reject with reason"""
        all_response = self.session.get(f"{BASE_URL}/api/admin/withdrawals/all")
        withdrawals = all_response.json()
        
        # Find a withdrawal that can be rejected (not completed or already rejected)
        rejectable = [w for w in withdrawals if w.get('status') not in ['completed', 'rejected']]
        if len(rejectable) == 0:
            pytest.skip("No withdrawals available to reject")
        
        withdrawal_id = rejectable[0]['id']
        
        response = self.session.put(f"{BASE_URL}/api/admin/withdrawals/update-status", json={
            "transaction_id": withdrawal_id,
            "status": "rejected",
            "rejection_reason": "Test rejection reason from automated test"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        print(f"✅ Rejected withdrawal {withdrawal_id[:8]}... with reason")
    
    # ==================== AUTHENTICATION ====================
    
    def test_endpoints_require_admin_auth(self):
        """All admin withdrawal endpoints require authentication"""
        unauthenticated = requests.Session()
        unauthenticated.headers.update({"Content-Type": "application/json"})
        
        # Test all endpoints without auth
        endpoints = [
            ("GET", f"{BASE_URL}/api/admin/withdrawals/all"),
            ("GET", f"{BASE_URL}/api/admin/withdrawals/test-id/details"),
            ("POST", f"{BASE_URL}/api/admin/withdrawals/test-id/reactivate"),
            ("PUT", f"{BASE_URL}/api/admin/withdrawals/update-status"),
        ]
        
        for method, url in endpoints:
            if method == "GET":
                response = unauthenticated.get(url)
            elif method == "POST":
                response = unauthenticated.post(url)
            elif method == "PUT":
                response = unauthenticated.put(url, json={})
            
            assert response.status_code in [401, 403], f"{method} {url} should require auth, got {response.status_code}"
        
        print("✅ All endpoints require authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
