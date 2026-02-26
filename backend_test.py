#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime
import uuid

class VaultBankAPITester:
    def __init__(self, base_url="https://fintech-hub-181.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.admin_token = None
        self.user_id = None
        self.admin_user_id = None
        self.accounts = []
        self.tests_run = 0
        self.tests_passed = 0
        
    def run_test(self, name, method, endpoint, expected_status, data=None, auth_required=True):
        """Run a single API test"""
        url = f"{self.base_url}{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if auth_required and self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Response: {response.text}")

            return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_register(self, name, email, password):
        """Test user registration"""
        success, response = self.run_test(
            "User Registration",
            "POST",
            "/auth/register",
            200,
            data={"name": name, "email": email, "password": password},
            auth_required=False
        )
        if success and 'token' in response:
            self.token = response['token']
            self.user_id = response['user']['id']
            return True
        return False

    def test_login(self, email, password):
        """Test user login"""
        success, response = self.run_test(
            "User Login",
            "POST",
            "/auth/login",
            200,
            data={"email": email, "password": password},
            auth_required=False
        )
        if success and 'token' in response:
            self.token = response['token']
            self.user_id = response['user']['id']
            return True
        return False

    def test_get_me(self):
        """Test getting current user info"""
        success, response = self.run_test(
            "Get Current User",
            "GET", 
            "/auth/me",
            200
        )
        return success

    def test_get_accounts(self):
        """Test getting user accounts"""
        success, response = self.run_test(
            "Get User Accounts",
            "GET",
            "/accounts",
            200
        )
        if success:
            self.accounts = response
        return success

    def test_account_summary(self):
        """Test account summary"""
        success, response = self.run_test(
            "Get Account Summary",
            "GET",
            "/accounts/summary/total",
            200
        )
        return success

    def test_deposit(self, account_id, amount, currency="USD"):
        """Test deposit transaction"""
        success, response = self.run_test(
            f"Deposit {amount} {currency}",
            "POST",
            "/transactions",
            200,
            data={
                "account_id": account_id,
                "transaction_type": "deposit",
                "amount": amount,
                "currency": currency,
                "description": "Test deposit"
            }
        )
        return success, response

    def test_withdraw(self, account_id, amount, currency="USD"):
        """Test withdrawal transaction (should be pending)"""
        success, response = self.run_test(
            f"Withdraw {amount} {currency}",
            "POST",
            "/transactions",
            200,
            data={
                "account_id": account_id,
                "transaction_type": "withdraw", 
                "amount": amount,
                "currency": currency,
                "description": "Test withdrawal"
            }
        )
        return success, response

    def test_transfer(self, from_account, to_account, amount, currency="USD"):
        """Test transfer between accounts"""
        success, response = self.run_test(
            f"Transfer {amount} {currency}",
            "POST",
            "/transactions",
            200,
            data={
                "account_id": from_account,
                "transaction_type": "transfer",
                "amount": amount,
                "currency": currency,
                "recipient_account_id": to_account,
                "description": "Test transfer"
            }
        )
        return success, response

    def test_get_transactions(self):
        """Test getting user transactions"""
        success, response = self.run_test(
            "Get User Transactions",
            "GET",
            "/transactions",
            200
        )
        return success

    def test_get_all_transactions(self):
        """Test getting all user transactions"""
        success, response = self.run_test(
            "Get All User Transactions",
            "GET",
            "/transactions/all",
            200
        )
        return success

    def test_csv_export(self):
        """Test CSV export"""
        url = f"{self.base_url}/transactions/export/csv"
        headers = {'Authorization': f'Bearer {self.token}'}
        
        self.tests_run += 1
        print(f"\n🔍 Testing CSV Export...")
        
        try:
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                return True
            else:
                print(f"❌ Failed - Expected 200, got {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False

    def setup_admin_user(self):
        """Create admin user by first registering, then would need manual promotion"""
        admin_email = f"admin_{uuid.uuid4().hex[:8]}@test.com"
        admin_success = self.test_register(
            "Admin User", 
            admin_email, 
            "AdminPass123!"
        )
        if admin_success:
            self.admin_token = self.token
            self.admin_user_id = self.user_id
            print(f"ℹ️  Admin user created: {admin_email}")
            print("⚠️  Note: Admin role needs to be manually set via admin panel")
        return admin_success

def main():
    """Main test function"""
    print("🏦 VaultBank API Testing Suite")
    print("=" * 50)
    
    # Setup
    tester = VaultBankAPITester()
    test_email = f"test_user_{uuid.uuid4().hex[:8]}@example.com"
    test_password = "TestPass123!"
    test_name = "Test User"

    # Test 1: Registration
    if not tester.test_register(test_name, test_email, test_password):
        print("❌ Registration failed, stopping tests")
        return 1

    # Test 2: Login (re-login to test login endpoint)
    login_token = tester.token  # Save registration token
    tester.token = None  # Clear to test login
    if not tester.test_login(test_email, test_password):
        print("❌ Login failed, stopping tests")
        return 1

    # Test 3: Get current user
    if not tester.test_get_me():
        print("❌ Get current user failed")

    # Test 4: Get accounts
    if not tester.test_get_accounts():
        print("❌ Get accounts failed")
        return 1

    if len(tester.accounts) < 2:
        print("❌ Expected 2 accounts (checking & savings), stopping tests")
        return 1

    checking_account = next(acc for acc in tester.accounts if acc['account_type'] == 'checking')
    savings_account = next(acc for acc in tester.accounts if acc['account_type'] == 'savings') 

    # Test 5: Account summary
    if not tester.test_account_summary():
        print("❌ Account summary failed")

    # Test 6: Deposit to checking
    success, deposit_response = tester.test_deposit(checking_account['id'], 1000.00, "USD")
    if not success:
        print("❌ Deposit failed")

    # Test 7: Deposit to savings
    success, _ = tester.test_deposit(savings_account['id'], 500.00, "EUR")
    if not success:
        print("❌ EUR deposit failed")

    # Test 8: Withdrawal (should be pending)
    success, withdraw_response = tester.test_withdraw(checking_account['id'], 200.00, "USD")
    if not success:
        print("❌ Withdrawal failed")
    elif withdraw_response.get('status') != 'pending':
        print("❌ Withdrawal should be pending status")

    # Test 9: Transfer between accounts
    success, _ = tester.test_transfer(
        checking_account['id'], 
        savings_account['id'], 
        150.00, 
        "USD"
    )
    if not success:
        print("❌ Transfer failed")

    # Test 10: Get transactions
    if not tester.test_get_transactions():
        print("❌ Get transactions failed")

    # Test 11: Get all transactions
    if not tester.test_get_all_transactions():
        print("❌ Get all transactions failed")

    # Test 12: CSV export
    if not tester.test_csv_export():
        print("❌ CSV export failed")

    # Test 13: Exchange rates
    success, _ = tester.run_test(
        "Get Exchange Rates",
        "GET",
        "/exchange-rates",
        200,
        auth_required=False
    )

    # Test 14: Root endpoint
    success, _ = tester.run_test(
        "API Root Endpoint",
        "GET", 
        "/",
        200,
        auth_required=False
    )

    # Print results
    print("\n" + "=" * 50)
    print(f"📊 Tests Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if tester.tests_passed == tester.tests_run:
        print("✅ All backend API tests passed!")
        return 0
    else:
        print("❌ Some backend tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())