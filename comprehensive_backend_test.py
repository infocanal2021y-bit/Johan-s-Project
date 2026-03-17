import requests
import sys
import json
import time
from datetime import datetime

class ComprehensiveBankingTester:
    def __init__(self, base_url="https://kyc-verification-9.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.admin_token = None
        self.user = None
        self.admin_user = None
        self.accounts = []
        self.admin_accounts = []
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=15)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=15)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=15)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, response.text
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                self.failed_tests.append(f"{name}: Expected {expected_status}, got {response.status_code}")
                try:
                    error_details = response.json()
                    print(f"   Error: {error_details}")
                except:
                    print(f"   Error: {response.text}")

            return success, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.failed_tests.append(f"{name}: {str(e)}")
            return False, {}

    def test_register_new_user(self):
        """Test user registration with KYC flow"""
        print("\n=== Testing User Registration (KYC Flow) ===")
        timestamp = int(time.time())
        new_user_email = f"testuser{timestamp}@vaultbank.com"
        
        success, response = self.run_test(
            "Register new user", 
            "POST",
            "auth/register",
            200,
            data={
                "name": f"Test User {timestamp}",
                "email": new_user_email,
                "password": "TestPass123!"
            }
        )
        
        if success and 'token' in response:
            print(f"   Registered: {response['user']['name']} ({response['user']['email']})")
            print(f"   Verification Status: {response['user']['verification_status']}")
            
            # Store new user token for KYC testing
            self.new_user_token = response['token']
            self.new_user = response['user']
            return True
        return False

    def test_kyc_status_unverified(self):
        """Test KYC status for unverified user"""
        print("\n=== Testing KYC Status (Unverified) ===")
        # Switch to new user token
        original_token = self.token
        self.token = self.new_user_token
        
        success, response = self.run_test(
            "Get KYC status for unverified user",
            "GET",
            "kyc/status",
            200
        )
        
        if success:
            print(f"   Verification Status: {response.get('verification_status')}")
            print(f"   Has Documents: {response.get('has_documents')}")
            
            if response.get('verification_status') != 'unverified':
                print(f"❌ Expected 'unverified', got '{response.get('verification_status')}'")
                self.failed_tests.append("KYC Status: Expected unverified status")
                self.token = original_token
                return False
        
        self.token = original_token
        return success

    def test_kyc_submission(self):
        """Test KYC document submission"""
        print("\n=== Testing KYC Document Submission ===")
        original_token = self.token
        self.token = self.new_user_token
        
        # Mock base64 document data
        mock_document = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD//2Q=="
        mock_selfie = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD//2Q=="
        
        success, response = self.run_test(
            "Submit KYC documents",
            "POST", 
            "kyc/submit",
            200,
            data={
                "document_type": "passport",
                "document_data": mock_document,
                "selfie_data": mock_selfie
            }
        )
        
        if success:
            print(f"   Status: {response.get('status')}")
            if response.get('status') != 'pending_verification':
                print(f"❌ Expected 'pending_verification', got '{response.get('status')}'")
                self.failed_tests.append("KYC Submission: Expected pending_verification status")
                self.token = original_token
                return False
        
        self.token = original_token
        return success

    def test_notifications_after_registration(self):
        """Test that registration creates welcome notification"""
        print("\n=== Testing Notifications After Registration ===")
        original_token = self.token
        self.token = self.new_user_token
        
        success, response = self.run_test(
            "Get notifications for new user",
            "GET",
            "notifications",
            200
        )
        
        if success:
            notifications = response.get('notifications', [])
            unread_count = response.get('unread_count', 0)
            print(f"   Total notifications: {len(notifications)}")
            print(f"   Unread count: {unread_count}")
            
            # Look for welcome notification
            welcome_found = any('Welcome' in notif.get('title', '') for notif in notifications)
            if not welcome_found:
                print("❌ No welcome notification found")
                self.failed_tests.append("Notifications: No welcome notification after registration")
                self.token = original_token
                return False
            
            print("   ✅ Welcome notification found")
        
        self.token = original_token
        return success

    def test_unverified_transfer_limits(self):
        """Test unverified user transfer limits (1000 EUR max)"""
        print("\n=== Testing Unverified User Transfer Limits ===")
        original_token = self.token
        self.token = self.new_user_token
        
        # First, get accounts and add some funds
        accounts_success, accounts_response = self.run_test(
            "Get new user accounts",
            "GET",
            "accounts",
            200
        )
        
        if not accounts_success:
            self.token = original_token
            return False
        
        new_user_accounts = accounts_response
        checking = next((acc for acc in new_user_accounts if acc['account_type'] == 'checking'), None)
        savings = next((acc for acc in new_user_accounts if acc['account_type'] == 'savings'), None)
        
        if not checking or not savings:
            print("❌ Missing checking or savings account")
            self.token = original_token
            return False
        
        # Add funds via deposit
        deposit_success, _ = self.run_test(
            "Create deposit for new user",
            "POST",
            "transactions",
            200,
            data={
                "account_id": checking['id'],
                "transaction_type": "deposit", 
                "amount": 5000,
                "currency": "EUR",
                "description": "Test deposit"
            }
        )
        
        if not deposit_success:
            self.token = original_token
            return False
        
        # Try transfer above unverified limit (1000 EUR)
        limit_test_success, limit_response = self.run_test(
            "Test unverified limit (1500 EUR - should fail)",
            "POST",
            "transactions",
            400,  # Should fail
            data={
                "account_id": checking['id'],
                "transaction_type": "transfer",
                "amount": 1500,
                "currency": "EUR",
                "description": "Test unverified limit",
                "recipient_account_id": savings['id']
            }
        )
        
        if not limit_test_success:
            print("❌ Expected 400 for over-limit transfer")
            self.token = original_token
            return False
        
        # Try transfer within unverified limit (800 EUR)
        within_limit_success, _ = self.run_test(
            "Test within unverified limit (800 EUR - should pass)",
            "POST",
            "transactions",
            200,
            data={
                "account_id": checking['id'],
                "transaction_type": "transfer",
                "amount": 800,
                "currency": "EUR", 
                "description": "Test within unverified limit",
                "recipient_account_id": savings['id']
            }
        )
        
        self.token = original_token
        return within_limit_success

    def test_daily_transfer_limits(self):
        """Test daily transfer limits for verified users"""
        print("\n=== Testing Daily Transfer Limits (10,000 EUR) ===")
        
        # Get demo user accounts with EUR funds
        success, accounts_response = self.run_test(
            "Get demo user accounts",
            "GET",
            "accounts",
            200
        )
        
        if not success:
            return False
        
        checking = next((acc for acc in accounts_response if acc['account_type'] == 'checking'), None)
        savings = next((acc for acc in accounts_response if acc['account_type'] == 'savings'), None)
        
        # Add EUR funds
        deposit_success, _ = self.run_test(
            "Add EUR funds",
            "POST",
            "transactions",
            200,
            data={
                "account_id": checking['id'],
                "transaction_type": "deposit",
                "amount": 15000,
                "currency": "EUR",
                "description": "EUR funds for daily limit test"
            }
        )
        
        if not deposit_success:
            return False
        
        # Test multiple transfers approaching daily limit
        transfer1_success, _ = self.run_test(
            "Transfer 1 - 6000 EUR",
            "POST",
            "transactions",
            200,
            data={
                "account_id": checking['id'],
                "transaction_type": "transfer",
                "amount": 6000,
                "currency": "EUR",
                "description": "Daily limit test 1",
                "recipient_account_id": savings['id']
            }
        )
        
        transfer2_success, _ = self.run_test(
            "Transfer 2 - 3000 EUR",
            "POST", 
            "transactions",
            200,
            data={
                "account_id": checking['id'],
                "transaction_type": "transfer",
                "amount": 3000,
                "currency": "EUR",
                "description": "Daily limit test 2",
                "recipient_account_id": savings['id']
            }
        )
        
        # This should exceed daily limit
        over_limit_success, _ = self.run_test(
            "Transfer 3 - 2000 EUR (should exceed daily limit)",
            "POST",
            "transactions",
            400,  # Should fail
            data={
                "account_id": checking['id'],
                "transaction_type": "transfer",
                "amount": 2000,
                "currency": "EUR",
                "description": "Daily limit exceeded test",
                "recipient_account_id": savings['id']
            }
        )
        
        return transfer1_success and transfer2_success and over_limit_success

    def test_transaction_references(self):
        """Test transaction reference generation (TRX-YYYY-XXXXXX)"""
        print("\n=== Testing Transaction References ===")
        
        success, transactions_response = self.run_test(
            "Get recent transactions with references",
            "GET",
            "transactions/all",
            200
        )
        
        if success:
            transfers = [tx for tx in transactions_response if tx['transaction_type'] == 'transfer']
            if transfers:
                ref = transfers[0].get('transaction_reference')
                print(f"   Sample reference: {ref}")
                
                if ref and ref.startswith('TRX-') and len(ref) == 13:  # TRX-YYYY-XXXXXX
                    print("   ✅ Reference format correct")
                    return True
                else:
                    print(f"❌ Invalid reference format: {ref}")
                    self.failed_tests.append("Transaction References: Invalid format")
                    return False
            else:
                print("❌ No transfers found to check references")
                return False
        
        return False

    def test_government_treasury(self):
        """Test Government Treasury account exists"""
        print("\n=== Testing Government Treasury ===")
        
        # Switch to admin token (assuming demo user is admin)
        success, response = self.run_test(
            "Get Government Treasury balance",
            "GET", 
            "admin/treasury",
            200
        )
        
        if success:
            print(f"   Treasury USD: ${response.get('balance_usd', 0)}")
            print(f"   Treasury EUR: €{response.get('balance_eur', 0)}")
            
            if response.get('account_type') != 'government_treasury':
                print(f"❌ Expected government_treasury account type")
                self.failed_tests.append("Government Treasury: Wrong account type")
                return False
            
            return True
        
        return False

    def test_transaction_stats_chart(self):
        """Test transaction statistics for dashboard chart"""
        print("\n=== Testing Transaction Statistics (Chart Data) ===")
        
        success, response = self.run_test(
            "Get transaction statistics",
            "GET",
            "transactions/stats",
            200
        )
        
        if success:
            print(f"   Total sent: ${response.get('total_sent', 0)}")
            print(f"   Total received: ${response.get('total_received', 0)}")
            print(f"   Total tax paid: ${response.get('total_tax_paid', 0)}")
            print(f"   Chart data points: {len(response.get('chart_data', []))}")
            print(f"   Daily limit: €{response.get('daily_limit', 0)}")
            print(f"   Daily used: €{response.get('daily_used', 0)}")
            
            # Verify chart data structure
            chart_data = response.get('chart_data', [])
            if len(chart_data) != 30:
                print(f"❌ Expected 30 days of chart data, got {len(chart_data)}")
                self.failed_tests.append("Transaction Stats: Wrong chart data length")
                return False
            
            # Check first data point structure
            if chart_data and all(key in chart_data[0] for key in ['date', 'sent', 'received', 'tax']):
                print("   ✅ Chart data structure correct")
                return True
            else:
                print("❌ Chart data structure invalid")
                self.failed_tests.append("Transaction Stats: Invalid chart data structure")
                return False
        
        return False

    def test_pdf_receipt_generation(self):
        """Test PDF receipt generation for completed transfers"""
        print("\n=== Testing PDF Receipt Generation ===")
        
        # Get completed transfers
        success, transactions_response = self.run_test(
            "Get completed transactions",
            "GET",
            "transactions/all", 
            200
        )
        
        if not success:
            return False
        
        completed_transfers = [tx for tx in transactions_response 
                             if tx['transaction_type'] == 'transfer' and tx['status'] == 'completed']
        
        if not completed_transfers:
            print("❌ No completed transfers found for receipt test")
            return False
        
        transfer_id = completed_transfers[0]['id']
        
        # Try to get PDF receipt (expect binary content)
        url = f"{self.base_url}/transactions/{transfer_id}/receipt"
        headers = {'Authorization': f'Bearer {self.token}'}
        
        try:
            response = requests.get(url, headers=headers, timeout=15)
            if response.status_code == 200:
                # Check if response is PDF
                content_type = response.headers.get('content-type', '')
                content_length = len(response.content)
                print(f"   Content-Type: {content_type}")
                print(f"   Content-Length: {content_length} bytes")
                
                if 'pdf' in content_type.lower() and content_length > 1000:
                    print("   ✅ PDF receipt generated successfully")
                    self.tests_passed += 1
                    self.tests_run += 1
                    return True
                else:
                    print(f"❌ Invalid PDF response")
                    self.failed_tests.append("PDF Receipt: Invalid content type or size")
                    self.tests_run += 1
                    return False
            else:
                print(f"❌ Failed to get receipt: {response.status_code}")
                self.failed_tests.append(f"PDF Receipt: HTTP {response.status_code}")
                self.tests_run += 1
                return False
                
        except Exception as e:
            print(f"❌ Receipt request error: {str(e)}")
            self.failed_tests.append(f"PDF Receipt: {str(e)}")
            self.tests_run += 1
            return False

    def test_demo_user_login(self):
        """Test login with existing demo user"""
        print("\n=== Testing Demo User Login ===")
        success, response = self.run_test(
            "Login with demo user",
            "POST",
            "auth/login", 
            200,
            data={"email": "demo@vaultbank.com", "password": "Password123"}
        )
        
        if success and 'token' in response:
            self.token = response['token']
            self.user = response['user']
            print(f"   Logged in as: {self.user['name']} ({self.user['email']})")
            print(f"   Role: {self.user['role']}")
            print(f"   Verification Status: {self.user.get('verification_status', 'unknown')}")
            return True
        return False

def main():
    print("🏦 Comprehensive VaultBank Professional Banking System Test")
    print("=" * 65)
    
    tester = ComprehensiveBankingTester()
    
    # Test core functionality
    tests = [
        ("Demo User Login", tester.test_demo_user_login),
        ("New User Registration", tester.test_register_new_user),
        ("KYC Status Check", tester.test_kyc_status_unverified), 
        ("KYC Document Submission", tester.test_kyc_submission),
        ("Registration Notifications", tester.test_notifications_after_registration),
        ("Unverified Transfer Limits", tester.test_unverified_transfer_limits),
        ("Daily Transfer Limits", tester.test_daily_transfer_limits),
        ("Transaction References", tester.test_transaction_references),
        ("Government Treasury", tester.test_government_treasury),
        ("Transaction Statistics", tester.test_transaction_stats_chart),
        ("PDF Receipt Generation", tester.test_pdf_receipt_generation),
    ]
    
    failed_tests = []
    
    for test_name, test_func in tests:
        print(f"\n{'='*20} {test_name} {'='*20}")
        try:
            if not test_func():
                failed_tests.append(test_name)
        except Exception as e:
            print(f"❌ {test_name} crashed: {str(e)}")
            failed_tests.append(f"{test_name} (crashed)")
    
    # Print final results
    print(f"\n📊 Final Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if failed_tests:
        print(f"\n❌ Failed Tests ({len(failed_tests)}):")
        for i, test in enumerate(failed_tests, 1):
            print(f"   {i}. {test}")
    
    if tester.failed_tests:
        print(f"\n🔍 Detailed Failures:")
        for i, failure in enumerate(tester.failed_tests, 1):
            print(f"   {i}. {failure}")
    
    if tester.tests_passed == tester.tests_run and not failed_tests:
        print("🎉 All comprehensive tests passed!")
        return 0
    else:
        print("⚠️  Some tests failed - see details above")
        return 1

if __name__ == "__main__":
    sys.exit(main())