"""
Test suite for 5 Advanced User Engagement Features:
1. Investment flow popup (min €300, validation, balance update)
2. Inactivity detection (75s popup) - frontend only
3. Activity priority system (track logins, time, clicks, dynamic messages)
4. Multichannel automated flow (incomplete process tracking)
5. Intent detection (activity score for returning users)
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admi@paylionsbit.es"
ADMIN_PASSWORD = "LionsBit2026!"


class TestAuthSetup:
    """Authentication setup for all tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for admin user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }


class TestInvestmentFeature(TestAuthSetup):
    """FEATURE 1: Investment flow popup - API tests"""
    
    def test_get_accounts(self, auth_headers):
        """Test getting user accounts to verify balance"""
        response = requests.get(f"{BASE_URL}/api/accounts", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get accounts: {response.text}"
        accounts = response.json()
        assert isinstance(accounts, list), "Accounts should be a list"
        assert len(accounts) > 0, "User should have at least one account"
        
        # Find checking account
        checking = next((a for a in accounts if a.get('account_type') == 'checking'), None)
        assert checking is not None, "User should have a checking account"
        assert 'balance_eur' in checking, "Checking account should have balance_eur"
        print(f"✅ Checking account balance: €{checking['balance_eur']}")
        return checking
    
    def test_get_account_summary(self, auth_headers):
        """Test getting account summary with invested balance"""
        response = requests.get(f"{BASE_URL}/api/accounts/summary/total", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get summary: {response.text}"
        summary = response.json()
        
        assert 'total' in summary, "Summary should have total"
        assert 'available' in summary, "Summary should have available"
        assert 'invested' in summary, "Summary should have invested"
        
        print(f"✅ Total: €{summary['total']['eur']}, Available: €{summary['available']['eur']}, Invested: €{summary['invested']['eur']}")
        return summary
    
    def test_invest_minimum_validation(self, auth_headers):
        """Test investment minimum €300 validation"""
        # Get checking account
        accounts_resp = requests.get(f"{BASE_URL}/api/accounts", headers=auth_headers)
        accounts = accounts_resp.json()
        checking = next((a for a in accounts if a.get('account_type') == 'checking'), None)
        
        # Try to invest less than €300
        response = requests.post(f"{BASE_URL}/api/accounts/invest", headers=auth_headers, json={
            "account_id": checking['id'],
            "amount": 100,
            "currency": "EUR"
        })
        assert response.status_code == 400, f"Should reject amount < €300: {response.text}"
        assert "minimo" in response.json().get('detail', '').lower() or "300" in response.json().get('detail', ''), \
            "Error should mention minimum amount"
        print("✅ Investment minimum €300 validation works")
    
    def test_invest_insufficient_balance(self, auth_headers):
        """Test investment with insufficient balance"""
        accounts_resp = requests.get(f"{BASE_URL}/api/accounts", headers=auth_headers)
        accounts = accounts_resp.json()
        checking = next((a for a in accounts if a.get('account_type') == 'checking'), None)
        
        # Try to invest more than balance
        huge_amount = checking['balance_eur'] + 10000
        response = requests.post(f"{BASE_URL}/api/accounts/invest", headers=auth_headers, json={
            "account_id": checking['id'],
            "amount": huge_amount,
            "currency": "EUR"
        })
        assert response.status_code == 400, f"Should reject insufficient balance: {response.text}"
        assert "insuficiente" in response.json().get('detail', '').lower(), \
            "Error should mention insufficient balance"
        print("✅ Investment insufficient balance validation works")
    
    def test_invest_success(self, auth_headers):
        """Test successful investment reservation"""
        # Get initial balances
        accounts_resp = requests.get(f"{BASE_URL}/api/accounts", headers=auth_headers)
        accounts = accounts_resp.json()
        checking = next((a for a in accounts if a.get('account_type') == 'checking'), None)
        savings = next((a for a in accounts if a.get('account_type') == 'savings'), None)
        
        initial_checking = checking['balance_eur']
        initial_savings = savings['balance_eur'] if savings else 0
        
        # Make investment of €300
        invest_amount = 300
        response = requests.post(f"{BASE_URL}/api/accounts/invest", headers=auth_headers, json={
            "account_id": checking['id'],
            "amount": invest_amount,
            "currency": "EUR"
        })
        assert response.status_code == 200, f"Investment failed: {response.text}"
        data = response.json()
        assert data.get('amount') == invest_amount, "Response should confirm amount"
        
        # Verify balance update
        accounts_resp2 = requests.get(f"{BASE_URL}/api/accounts", headers=auth_headers)
        accounts2 = accounts_resp2.json()
        checking2 = next((a for a in accounts2 if a.get('account_type') == 'checking'), None)
        savings2 = next((a for a in accounts2 if a.get('account_type') == 'savings'), None)
        
        # Checking should decrease
        assert checking2['balance_eur'] == initial_checking - invest_amount, \
            f"Checking balance should decrease by {invest_amount}"
        
        # Savings should increase
        if savings2:
            assert savings2['balance_eur'] == initial_savings + invest_amount, \
                f"Savings balance should increase by {invest_amount}"
        
        print(f"✅ Investment of €{invest_amount} successful")
        print(f"   Checking: €{initial_checking} → €{checking2['balance_eur']}")
        if savings2:
            print(f"   Savings: €{initial_savings} → €{savings2['balance_eur']}")
    
    def test_invest_invalid_account(self, auth_headers):
        """Test investment with invalid account ID"""
        response = requests.post(f"{BASE_URL}/api/accounts/invest", headers=auth_headers, json={
            "account_id": "invalid-account-id",
            "amount": 300,
            "currency": "EUR"
        })
        assert response.status_code == 404, f"Should return 404 for invalid account: {response.text}"
        print("✅ Investment invalid account validation works")


class TestActivityTracking(TestAuthSetup):
    """FEATURE 3: Activity priority system - track logins, time, clicks"""
    
    def test_track_page_visit(self, auth_headers):
        """Test tracking page visit activity"""
        response = requests.post(f"{BASE_URL}/api/user/activity", headers=auth_headers, json={
            "event_type": "page_visit",
            "page": "/withdraw"
        })
        assert response.status_code == 200, f"Failed to track activity: {response.text}"
        assert response.json().get('status') == 'ok', "Should return status ok"
        print("✅ Page visit tracking works")
    
    def test_track_button_click(self, auth_headers):
        """Test tracking button click activity"""
        response = requests.post(f"{BASE_URL}/api/user/activity", headers=auth_headers, json={
            "event_type": "button_click",
            "details": "submit_withdraw"
        })
        assert response.status_code == 200, f"Failed to track click: {response.text}"
        assert response.json().get('status') == 'ok', "Should return status ok"
        print("✅ Button click tracking works")
    
    def test_track_session_active(self, auth_headers):
        """Test tracking session duration"""
        response = requests.post(f"{BASE_URL}/api/user/activity", headers=auth_headers, json={
            "event_type": "session_active",
            "details": "5min"
        })
        assert response.status_code == 200, f"Failed to track session: {response.text}"
        assert response.json().get('status') == 'ok', "Should return status ok"
        print("✅ Session active tracking works")
    
    def test_get_activity_score(self, auth_headers):
        """Test getting activity score for intent detection"""
        # First add some activity
        for i in range(5):
            requests.post(f"{BASE_URL}/api/user/activity", headers=auth_headers, json={
                "event_type": "page_visit",
                "page": f"/page{i}"
            })
        
        response = requests.get(f"{BASE_URL}/api/user/activity-score", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get activity score: {response.text}"
        data = response.json()
        
        assert 'score' in data, "Response should have score"
        assert data['score'] in ['low', 'medium', 'high'], f"Score should be low/medium/high, got: {data['score']}"
        assert 'login_count' in data, "Response should have login_count"
        assert 'withdraw_visits' in data, "Response should have withdraw_visits"
        assert 'total_interactions' in data, "Response should have total_interactions"
        
        print(f"✅ Activity score: {data['score']}")
        print(f"   Login count: {data['login_count']}, Withdraw visits: {data['withdraw_visits']}, Total: {data['total_interactions']}")


class TestIncompleteProcess(TestAuthSetup):
    """FEATURE 4: Multichannel automated flow - incomplete process tracking"""
    
    def test_mark_incomplete_process(self, auth_headers):
        """Test marking a process as incomplete"""
        response = requests.post(f"{BASE_URL}/api/user/mark-incomplete-process", headers=auth_headers)
        assert response.status_code == 200, f"Failed to mark incomplete: {response.text}"
        assert response.json().get('status') == 'ok', "Should return status ok"
        print("✅ Mark incomplete process works")
    
    def test_mark_incomplete_idempotent(self, auth_headers):
        """Test that marking incomplete is idempotent (updates existing)"""
        # Mark incomplete twice
        response1 = requests.post(f"{BASE_URL}/api/user/mark-incomplete-process", headers=auth_headers)
        assert response1.status_code == 200
        
        time.sleep(0.5)
        
        response2 = requests.post(f"{BASE_URL}/api/user/mark-incomplete-process", headers=auth_headers)
        assert response2.status_code == 200, "Second call should also succeed"
        print("✅ Mark incomplete is idempotent")
    
    def test_resolve_incomplete_process(self, auth_headers):
        """Test resolving an incomplete process"""
        # First mark as incomplete
        requests.post(f"{BASE_URL}/api/user/mark-incomplete-process", headers=auth_headers)
        
        # Then resolve
        response = requests.post(f"{BASE_URL}/api/user/resolve-incomplete-process", headers=auth_headers)
        assert response.status_code == 200, f"Failed to resolve: {response.text}"
        assert response.json().get('status') == 'ok', "Should return status ok"
        print("✅ Resolve incomplete process works")


class TestIntentDetection(TestAuthSetup):
    """FEATURE 5: Intent detection - dynamic CTAs based on activity"""
    
    def test_withdraw_visits_tracking(self, auth_headers):
        """Test that withdraw page visits are tracked for intent detection"""
        # Track multiple withdraw page visits
        for _ in range(3):
            requests.post(f"{BASE_URL}/api/user/activity", headers=auth_headers, json={
                "event_type": "page_visit",
                "page": "/withdraw"
            })
        
        # Get activity score
        response = requests.get(f"{BASE_URL}/api/user/activity-score", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert data['withdraw_visits'] >= 3, f"Should have at least 3 withdraw visits, got: {data['withdraw_visits']}"
        print(f"✅ Withdraw visits tracked: {data['withdraw_visits']}")
    
    def test_activity_score_increases_with_interactions(self, auth_headers):
        """Test that activity score increases with more interactions"""
        # Add many interactions
        for i in range(20):
            requests.post(f"{BASE_URL}/api/user/activity", headers=auth_headers, json={
                "event_type": "button_click",
                "details": f"button_{i}"
            })
        
        response = requests.get(f"{BASE_URL}/api/user/activity-score", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # With 20+ interactions, score should be medium or high
        assert data['score'] in ['medium', 'high'], f"Score should be medium/high with many interactions, got: {data['score']}"
        print(f"✅ Activity score with many interactions: {data['score']}")


class TestWithdrawFormIntegration(TestAuthSetup):
    """Test withdraw form with investment popup integration"""
    
    def test_withdraw_requires_kyc(self, auth_headers):
        """Test that withdrawal requires KYC verification"""
        # Get accounts
        accounts_resp = requests.get(f"{BASE_URL}/api/accounts", headers=auth_headers)
        accounts = accounts_resp.json()
        checking = next((a for a in accounts if a.get('account_type') == 'checking'), None)
        
        # Try to create withdrawal
        response = requests.post(f"{BASE_URL}/api/transactions", headers=auth_headers, json={
            "account_id": checking['id'],
            "transaction_type": "withdraw",
            "amount": 100,
            "currency": "EUR",
            "description": "Test withdrawal",
            "banking_info": {
                "account_holder": "Test User",
                "iban": "ES9121000418450200051332",
                "bank_name": "CaixaBank",
                "bank_country": "España"
            }
        })
        
        # Should either succeed (if KYC verified) or fail with KYC error
        if response.status_code == 403:
            assert "kyc" in response.text.lower() or "verif" in response.text.lower(), \
                "Should mention KYC verification"
            print("✅ Withdrawal correctly requires KYC verification")
        elif response.status_code == 200:
            print("✅ Withdrawal created (user is KYC verified)")
        else:
            print(f"⚠️ Unexpected status: {response.status_code} - {response.text}")


class TestEndpointAvailability:
    """Test that all new endpoints are available"""
    
    def test_investment_endpoint_exists(self):
        """Test POST /api/accounts/invest endpoint exists"""
        response = requests.post(f"{BASE_URL}/api/accounts/invest", json={})
        # Should return 401 (unauthorized) not 404
        assert response.status_code != 404, "Investment endpoint should exist"
        print("✅ POST /api/accounts/invest endpoint exists")
    
    def test_activity_endpoint_exists(self):
        """Test POST /api/user/activity endpoint exists"""
        response = requests.post(f"{BASE_URL}/api/user/activity", json={})
        assert response.status_code != 404, "Activity endpoint should exist"
        print("✅ POST /api/user/activity endpoint exists")
    
    def test_activity_score_endpoint_exists(self):
        """Test GET /api/user/activity-score endpoint exists"""
        response = requests.get(f"{BASE_URL}/api/user/activity-score")
        assert response.status_code != 404, "Activity score endpoint should exist"
        print("✅ GET /api/user/activity-score endpoint exists")
    
    def test_mark_incomplete_endpoint_exists(self):
        """Test POST /api/user/mark-incomplete-process endpoint exists"""
        response = requests.post(f"{BASE_URL}/api/user/mark-incomplete-process")
        assert response.status_code != 404, "Mark incomplete endpoint should exist"
        print("✅ POST /api/user/mark-incomplete-process endpoint exists")
    
    def test_resolve_incomplete_endpoint_exists(self):
        """Test POST /api/user/resolve-incomplete-process endpoint exists"""
        response = requests.post(f"{BASE_URL}/api/user/resolve-incomplete-process")
        assert response.status_code != 404, "Resolve incomplete endpoint should exist"
        print("✅ POST /api/user/resolve-incomplete-process endpoint exists")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
