"""
Tests for new features:
- Login history (IP, device, browser)
- Support tickets
- Change password
- Password reset (MOCKED)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

ADMIN_EMAIL = "johanspotify67@gmail.com"
ADMIN_PASSWORD = "LionsBit2026!"


class TestLoginHistory:
    """Test login history features"""
    
    def test_login_returns_login_info(self, api_client):
        """Login should return session info (IP, device, location)"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # Should have login_info in response
        assert "login_info" in data
        login_info = data["login_info"]
        
        assert "ip" in login_info
        assert "device" in login_info
        assert "location" in login_info
        assert "time" in login_info
    
    def test_get_login_history(self, admin_client):
        """Should get last 5 login sessions"""
        response = admin_client.get(f"{BASE_URL}/api/auth/login-history")
        
        assert response.status_code == 200
        history = response.json()
        
        # Should be a list
        assert isinstance(history, list)
        
        # Should have at most 5 items
        assert len(history) <= 5
        
        # Each item should have expected fields
        if len(history) > 0:
            item = history[0]
            assert "id" in item
            assert "user_id" in item
            assert "ip_address" in item
            assert "device" in item
            assert "browser" in item
            assert "location" in item
            assert "logged_in_at" in item


class TestSupportTickets:
    """Test support ticket features"""
    
    def test_create_ticket(self, test_user_client):
        """User can create a support ticket"""
        client, user_data = test_user_client
        
        ticket_data = {
            "subject": f"TEST_TICKET_{uuid.uuid4().hex[:6]}",
            "message": "This is a test ticket message for automated testing",
            "category": "general"
        }
        
        response = client.post(f"{BASE_URL}/api/support/tickets", json=ticket_data)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "message" in data
        assert "ticket_number" in data
        assert "id" in data
        assert data["ticket_number"].startswith("TKT-")
    
    def test_get_my_tickets(self, test_user_client):
        """User can get their tickets"""
        client, user_data = test_user_client
        
        # First create a ticket
        ticket_data = {
            "subject": f"TEST_TICKET_{uuid.uuid4().hex[:6]}",
            "message": "Test ticket for listing",
            "category": "transfer"
        }
        client.post(f"{BASE_URL}/api/support/tickets", json=ticket_data)
        
        # Get tickets
        response = client.get(f"{BASE_URL}/api/support/tickets")
        
        assert response.status_code == 200
        tickets = response.json()
        
        assert isinstance(tickets, list)
        assert len(tickets) >= 1
        
        # Check ticket structure
        ticket = tickets[0]
        assert "id" in ticket
        assert "ticket_number" in ticket
        assert "subject" in ticket
        assert "message" in ticket
        assert "status" in ticket
        assert "category" in ticket
    
    def test_get_single_ticket(self, test_user_client):
        """User can get a specific ticket"""
        client, user_data = test_user_client
        
        # Create ticket
        ticket_data = {
            "subject": f"TEST_SINGLE_{uuid.uuid4().hex[:6]}",
            "message": "Test for single ticket retrieval",
            "category": "account"
        }
        create_response = client.post(f"{BASE_URL}/api/support/tickets", json=ticket_data)
        ticket_id = create_response.json()["id"]
        
        # Get single ticket
        response = client.get(f"{BASE_URL}/api/support/tickets/{ticket_id}")
        
        assert response.status_code == 200
        ticket = response.json()
        
        assert ticket["id"] == ticket_id
        assert ticket["subject"] == ticket_data["subject"]
    
    def test_reply_to_ticket(self, test_user_client):
        """User can reply to their ticket"""
        client, user_data = test_user_client
        
        # Create ticket
        ticket_data = {
            "subject": f"TEST_REPLY_{uuid.uuid4().hex[:6]}",
            "message": "Test for reply feature",
            "category": "technical"
        }
        create_response = client.post(f"{BASE_URL}/api/support/tickets", json=ticket_data)
        ticket_id = create_response.json()["id"]
        
        # Reply to ticket
        reply_data = {
            "ticket_id": ticket_id,
            "message": "This is a test reply from user"
        }
        response = client.post(f"{BASE_URL}/api/support/tickets/{ticket_id}/reply", json=reply_data)
        
        assert response.status_code == 200
        
        # Verify reply was added
        get_response = client.get(f"{BASE_URL}/api/support/tickets/{ticket_id}")
        ticket = get_response.json()
        
        assert "replies" in ticket
        assert len(ticket["replies"]) >= 1
        assert ticket["replies"][0]["message"] == reply_data["message"]
        assert ticket["replies"][0]["from_admin"] == False
    
    def test_ticket_categories(self, test_user_client):
        """Test all ticket categories work"""
        client, user_data = test_user_client
        
        categories = ["general", "transfer", "account", "technical"]
        
        for category in categories:
            ticket_data = {
                "subject": f"TEST_CAT_{category}_{uuid.uuid4().hex[:4]}",
                "message": f"Testing {category} category",
                "category": category
            }
            response = client.post(f"{BASE_URL}/api/support/tickets", json=ticket_data)
            assert response.status_code == 200, f"Failed to create ticket with category {category}"


class TestAdminSupport:
    """Test admin support ticket features"""
    
    def test_admin_get_all_tickets(self, admin_client):
        """Admin can get all tickets"""
        response = admin_client.get(f"{BASE_URL}/api/admin/support/tickets")
        
        assert response.status_code == 200
        tickets = response.json()
        
        assert isinstance(tickets, list)
    
    def test_admin_reply_to_ticket(self, api_client):
        """Admin can reply to any ticket"""
        # First create a user and ticket
        unique_id = str(uuid.uuid4())[:8]
        test_email = f"adminreply_{unique_id}@test.com"
        test_password = "TestPass123!"
        
        # Register user
        reg_response = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "name": f"Admin Reply Test {unique_id}",
            "email": test_email,
            "password": test_password
        })
        user_token = reg_response.json()["token"]
        
        # Create ticket as user
        user_headers = {"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"}
        ticket_data = {
            "subject": f"ADMIN_REPLY_TEST_{uuid.uuid4().hex[:6]}",
            "message": "Ticket for admin reply test",
            "category": "general"
        }
        create_response = api_client.post(f"{BASE_URL}/api/support/tickets", json=ticket_data, headers=user_headers)
        ticket_id = create_response.json()["id"]
        
        # Login as admin
        admin_login = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        admin_token = admin_login.json()["token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
        
        # Admin replies
        reply_data = {
            "ticket_id": ticket_id,
            "message": "This is an admin reply"
        }
        response = api_client.post(f"{BASE_URL}/api/admin/support/tickets/{ticket_id}/reply", json=reply_data, headers=admin_headers)
        
        assert response.status_code == 200
        
        # Verify reply was from admin
        get_response = api_client.get(f"{BASE_URL}/api/support/tickets/{ticket_id}", headers=user_headers)
        ticket = get_response.json()
        
        admin_replies = [r for r in ticket.get("replies", []) if r.get("from_admin")]
        assert len(admin_replies) >= 1
        assert admin_replies[0]["message"] == reply_data["message"]
    
    def test_admin_update_ticket_status(self, api_client):
        """Admin can update ticket status"""
        # First create a user and ticket
        unique_id = str(uuid.uuid4())[:8]
        test_email = f"statustest_{unique_id}@test.com"
        test_password = "TestPass123!"
        
        # Register user
        reg_response = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "name": f"Status Test {unique_id}",
            "email": test_email,
            "password": test_password
        })
        user_token = reg_response.json()["token"]
        user_headers = {"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"}
        
        # Create ticket as user
        ticket_data = {
            "subject": f"STATUS_TEST_{uuid.uuid4().hex[:6]}",
            "message": "Ticket for status update test",
            "category": "general"
        }
        create_response = api_client.post(f"{BASE_URL}/api/support/tickets", json=ticket_data, headers=user_headers)
        ticket_id = create_response.json()["id"]
        
        # Login as admin
        admin_login = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        admin_token = admin_login.json()["token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
        
        # Admin updates status
        for status in ["in_progress", "resolved", "closed"]:
            response = api_client.put(f"{BASE_URL}/api/admin/support/tickets/{ticket_id}/status?status={status}", headers=admin_headers)
            assert response.status_code == 200, f"Failed to update status to {status}"
            
            # Verify status changed
            get_response = api_client.get(f"{BASE_URL}/api/support/tickets/{ticket_id}", headers=user_headers)
            ticket = get_response.json()
            assert ticket["status"] == status


class TestChangePassword:
    """Test password change feature"""
    
    def test_change_password_success(self, api_client):
        """User can change their password"""
        # Register new user
        unique_id = str(uuid.uuid4())[:8]
        test_email = f"pwchange_{unique_id}@test.com"
        old_password = "OldPass123!"
        new_password = "NewPass456!"
        
        # Register
        reg_response = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "name": f"PW Change Test {unique_id}",
            "email": test_email,
            "password": old_password
        })
        assert reg_response.status_code == 200
        token = reg_response.json()["token"]
        
        # Change password
        api_client.headers.update({"Authorization": f"Bearer {token}"})
        change_response = api_client.post(f"{BASE_URL}/api/auth/change-password", json={
            "current_password": old_password,
            "new_password": new_password
        })
        
        assert change_response.status_code == 200
        assert "successfully" in change_response.json()["message"].lower()
        
        # Login with new password should work
        api_client.headers.pop("Authorization")
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": test_email,
            "password": new_password
        })
        assert login_response.status_code == 200
    
    def test_change_password_wrong_current(self, test_user_client):
        """Change password fails with wrong current password"""
        client, user_data = test_user_client
        
        response = client.post(f"{BASE_URL}/api/auth/change-password", json={
            "current_password": "WrongPassword123!",
            "new_password": "NewPass456!"
        })
        
        assert response.status_code == 400
        assert "incorrect" in response.json()["detail"].lower()
    
    def test_change_password_short_new(self, test_user_client):
        """Change password fails with short new password"""
        client, user_data = test_user_client
        
        response = client.post(f"{BASE_URL}/api/auth/change-password", json={
            "current_password": user_data["password"],
            "new_password": "123"  # Too short
        })
        
        # Should fail validation (422) or business logic (400)
        assert response.status_code in [400, 422]


class TestPasswordReset:
    """Test password reset feature (MOCKED)"""
    
    def test_request_password_reset(self, api_client):
        """Request password reset returns mock link"""
        # Use admin email for testing
        response = api_client.post(f"{BASE_URL}/api/auth/request-password-reset", json={
            "email": ADMIN_EMAIL
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert "message" in data
        # The mock implementation returns the link
        assert "mock_link" in data or "reset" in data.get("message", "").lower()
    
    def test_request_password_reset_nonexistent_email(self, api_client):
        """Request reset for nonexistent email returns same message (security)"""
        response = api_client.post(f"{BASE_URL}/api/auth/request-password-reset", json={
            "email": "nonexistent_user_12345@test.com"
        })
        
        # Should return 200 for security (don't reveal if email exists)
        assert response.status_code == 200
    
    def test_admin_can_see_password_reset_requests(self, admin_client, api_client):
        """Admin can see password reset requests"""
        # First request a reset
        unique_id = str(uuid.uuid4())[:8]
        test_email = f"resettest_{unique_id}@test.com"
        
        # Register user first
        api_client.post(f"{BASE_URL}/api/auth/register", json={
            "name": f"Reset Test {unique_id}",
            "email": test_email,
            "password": "TestPass123!"
        })
        
        # Request reset
        api_client.post(f"{BASE_URL}/api/auth/request-password-reset", json={
            "email": test_email
        })
        
        # Admin views reset requests
        response = admin_client.get(f"{BASE_URL}/api/admin/password-resets")
        
        assert response.status_code == 200
        resets = response.json()
        
        assert isinstance(resets, list)


class TestTicketValidation:
    """Test ticket input validation"""
    
    def test_ticket_subject_too_short(self, test_user_client):
        """Ticket with short subject should fail"""
        client, user_data = test_user_client
        
        response = client.post(f"{BASE_URL}/api/support/tickets", json={
            "subject": "Hi",  # Too short (min 5)
            "message": "This is a test message for validation",
            "category": "general"
        })
        
        assert response.status_code == 422  # Validation error
    
    def test_ticket_message_too_short(self, test_user_client):
        """Ticket with short message should fail"""
        client, user_data = test_user_client
        
        response = client.post(f"{BASE_URL}/api/support/tickets", json={
            "subject": "Valid Subject Here",
            "message": "Short",  # Too short (min 10)
            "category": "general"
        })
        
        assert response.status_code == 422  # Validation error
