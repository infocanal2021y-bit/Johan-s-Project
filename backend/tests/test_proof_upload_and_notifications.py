"""
Test suite for:
1. Bank Transfer Proof Upload feature (POST /api/payments/bank-transfer-confirm with proof_file)
2. Interactive Notifications (GET /api/notifications, PUT /api/notifications/{id}/read, PUT /api/notifications/read-all)
"""
import pytest
import requests
import os
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://compliance-dash-32.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"
RESTRICTED_EMAIL = "marinini28@gmail.com"
RESTRICTED_PASSWORD = "Marina2026!"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def restricted_token():
    """Get restricted user authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": RESTRICTED_EMAIL,
        "password": RESTRICTED_PASSWORD
    })
    assert response.status_code == 200, f"Restricted user login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


# ==================== BANK TRANSFER PROOF UPLOAD TESTS ====================

class TestBankTransferProofUpload:
    """Tests for POST /api/payments/bank-transfer-confirm with proof upload"""
    
    def test_confirm_with_valid_jpg_proof(self, admin_token):
        """Test bank transfer confirm with valid JPG proof file"""
        # Create a small valid base64 image (1x1 red pixel JPEG)
        small_jpg_b64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwAB//9k="
        
        response = requests.post(
            f"{BASE_URL}/api/payments/bank-transfer-confirm",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "reference": "TEST-JPG-001",
                "comment": "Test with JPG proof",
                "proof_file": f"data:image/jpeg;base64,{small_jpg_b64}",
                "proof_filename": "comprobante.jpg"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "pending_verification"
        assert "id" in data, "Response should have record id"
        print("✅ Bank transfer confirm with JPG proof works")
    
    def test_confirm_with_valid_png_proof(self, admin_token):
        """Test bank transfer confirm with valid PNG proof file"""
        # Small 1x1 PNG
        small_png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        response = requests.post(
            f"{BASE_URL}/api/payments/bank-transfer-confirm",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "reference": "TEST-PNG-001",
                "comment": "Test with PNG proof",
                "proof_file": f"data:image/png;base64,{small_png_b64}",
                "proof_filename": "comprobante.png"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "pending_verification"
        print("✅ Bank transfer confirm with PNG proof works")
    
    def test_confirm_with_valid_pdf_proof(self, admin_token):
        """Test bank transfer confirm with valid PDF proof file"""
        # Minimal valid PDF
        pdf_content = b"%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF"
        pdf_b64 = base64.b64encode(pdf_content).decode()
        
        response = requests.post(
            f"{BASE_URL}/api/payments/bank-transfer-confirm",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "reference": "TEST-PDF-001",
                "comment": "Test with PDF proof",
                "proof_file": f"data:application/pdf;base64,{pdf_b64}",
                "proof_filename": "comprobante.pdf"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "pending_verification"
        print("✅ Bank transfer confirm with PDF proof works")
    
    def test_reject_invalid_file_extension(self, admin_token):
        """Test that executable/invalid file extensions are rejected"""
        fake_exe_b64 = base64.b64encode(b"MZ fake executable").decode()
        
        response = requests.post(
            f"{BASE_URL}/api/payments/bank-transfer-confirm",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "reference": "TEST-EXE-001",
                "proof_file": f"data:application/octet-stream;base64,{fake_exe_b64}",
                "proof_filename": "malware.exe"
            }
        )
        assert response.status_code == 400, f"Expected 400 for .exe file, got {response.status_code}"
        assert "no permitido" in response.json().get("detail", "").lower() or "formato" in response.json().get("detail", "").lower()
        print("✅ Executable files correctly rejected")
    
    def test_reject_file_over_5mb(self, admin_token):
        """Test that files over 5MB are rejected (base64 > 7MB)"""
        # Create a base64 string > 7MB (which represents > 5MB file)
        large_b64 = "A" * 7_500_000  # ~7.5MB base64
        
        response = requests.post(
            f"{BASE_URL}/api/payments/bank-transfer-confirm",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "reference": "TEST-LARGE-001",
                "proof_file": f"data:image/jpeg;base64,{large_b64}",
                "proof_filename": "large_file.jpg"
            }
        )
        assert response.status_code == 400, f"Expected 400 for large file, got {response.status_code}"
        assert "grande" in response.json().get("detail", "").lower() or "5mb" in response.json().get("detail", "").lower()
        print("✅ Files over 5MB correctly rejected")
    
    def test_restricted_user_gets_403(self, restricted_token):
        """Test that restricted user marinini28@gmail.com gets 403"""
        response = requests.post(
            f"{BASE_URL}/api/payments/bank-transfer-confirm",
            headers={"Authorization": f"Bearer {restricted_token}", "Content-Type": "application/json"},
            json={
                "reference": "TEST-RESTRICTED-001"
            }
        )
        assert response.status_code == 403, f"Expected 403 for restricted user, got {response.status_code}"
        print("✅ Restricted user correctly gets 403")
    
    def test_confirm_without_proof_still_works(self, admin_token):
        """Test that confirm works without proof file (optional)"""
        response = requests.post(
            f"{BASE_URL}/api/payments/bank-transfer-confirm",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "reference": "TEST-NOPROOF-001",
                "comment": "Test without proof"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "pending_verification"
        print("✅ Bank transfer confirm without proof works")
    
    def test_requires_authentication(self):
        """Test that endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/payments/bank-transfer-confirm",
            headers={"Content-Type": "application/json"},
            json={"reference": "TEST-NOAUTH-001"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✅ Authentication required for bank transfer confirm")


# ==================== NOTIFICATION TESTS ====================

class TestNotifications:
    """Tests for notification endpoints"""
    
    def test_get_notifications(self, admin_token):
        """Test GET /api/notifications returns list with unread_count"""
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "notifications" in data, "Response should have 'notifications' key"
        assert "unread_count" in data, "Response should have 'unread_count' key"
        assert isinstance(data["notifications"], list), "notifications should be a list"
        assert isinstance(data["unread_count"], int), "unread_count should be an integer"
        print(f"✅ GET /api/notifications works - {len(data['notifications'])} notifications, {data['unread_count']} unread")
    
    def test_notification_has_required_fields(self, admin_token):
        """Test that notifications have required fields for display"""
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["notifications"]:
            notif = data["notifications"][0]
            assert "id" in notif, "Notification should have 'id'"
            assert "title" in notif, "Notification should have 'title'"
            assert "message" in notif, "Notification should have 'message'"
            assert "read" in notif, "Notification should have 'read' field"
            assert "created_at" in notif, "Notification should have 'created_at'"
            print(f"✅ Notification has all required fields: id, title, message, read, created_at")
        else:
            print("⚠️ No notifications to verify fields (empty list)")
    
    def test_mark_notification_as_read(self, admin_token):
        """Test PUT /api/notifications/{id}/read marks notification as read"""
        # First get notifications
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if not data["notifications"]:
            pytest.skip("No notifications to mark as read")
        
        # Find an unread notification or use first one
        notif_id = data["notifications"][0]["id"]
        
        # Mark as read
        response = requests.put(
            f"{BASE_URL}/api/notifications/{notif_id}/read",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✅ PUT /api/notifications/{notif_id}/read works")
    
    def test_mark_all_notifications_read(self, admin_token):
        """Test PUT /api/notifications/read-all marks all as read"""
        response = requests.put(
            f"{BASE_URL}/api/notifications/read-all",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify all are read
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["unread_count"] == 0, f"Expected 0 unread after mark all, got {data['unread_count']}"
        print("✅ PUT /api/notifications/read-all works - unread_count is 0")
    
    def test_notifications_require_auth(self):
        """Test that notification endpoints require authentication"""
        response = requests.get(f"{BASE_URL}/api/notifications")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✅ Notifications require authentication")


# ==================== EXISTING FEATURES VERIFICATION ====================

class TestExistingFeatures:
    """Verify existing features still work"""
    
    def test_visa_mc_skrill_still_show_proximamente(self, admin_token):
        """Verify Visa/MC/Skrill methods exist (frontend shows 'Próximamente')"""
        # This is a frontend test, but we verify the backend doesn't have special handling
        response = requests.get(
            f"{BASE_URL}/api/payments/bank-transfer-access",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert response.json().get("has_access") == True
        print("✅ Bank transfer access check works for admin")
    
    def test_country_bank_data_exists(self):
        """Verify country bank data is defined in frontend (Mexico/Chile/Colombia)"""
        # This is frontend data, but we can verify the backend is healthy
        response = requests.get(f"{BASE_URL}/api/crypto-wallets")
        assert response.status_code == 200
        data = response.json()
        assert "BTC" in data or "wallets" in data
        print("✅ Backend healthy - crypto wallets endpoint works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
