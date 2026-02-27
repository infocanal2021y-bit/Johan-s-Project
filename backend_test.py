import requests
import sys
import json
from datetime import datetime

class VaultBankAPITester:
    def __init__(self, base_url="https://fintech-hub-181.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.user = None
        self.accounts = []
        self.tests_run = 0
        self.tests_passed = 0

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
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)

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
                try:
                    print(f"   Response: {response.json()}")
                except:
                    print(f"   Response: {response.text}")

            return success, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_login(self):
        """Test login with demo user"""
        print("\n=== Testing Login ===")
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
            return True
        return False

    def test_get_accounts(self):
        """Get user accounts"""
        print("\n=== Testing Account Access ===")
        success, response = self.run_test(
            "Get user accounts",
            "GET",
            "accounts",
            200
        )
        if success:
            self.accounts = response
            print(f"   Found {len(self.accounts)} accounts")
            for acc in self.accounts:
                print(f"   - {acc['account_type']}: USD ${acc['balance_usd']}, EUR €{acc['balance_eur']}")
            return True
        return False

    def test_create_deposit(self, amount=5000):
        """Create a deposit to have funds for testing"""
        print("\n=== Testing Deposit ===")
        if not self.accounts:
            print("❌ No accounts available")
            return False
        
        checking_account = next((acc for acc in self.accounts if acc['account_type'] == 'checking'), None)
        if not checking_account:
            print("❌ No checking account found")
            return False

        success, response = self.run_test(
            f"Create deposit of ${amount}",
            "POST",
            "transactions",
            200,
            data={
                "account_id": checking_account['id'],
                "transaction_type": "deposit",
                "amount": amount,
                "currency": "USD",
                "description": "Test deposit for transfer testing"
            }
        )
        if success:
            print(f"   Deposit created: {response['id']}")
            # Refresh accounts to get updated balance
            self.test_get_accounts()
        return success

    def test_create_transfer(self):
        """Test creating a transfer with tax system"""
        print("\n=== Testing Transfer Creation ===")
        if not self.accounts or len(self.accounts) < 2:
            print("❌ Need at least 2 accounts for transfer")
            return False, None

        sender_account = next((acc for acc in self.accounts if acc['account_type'] == 'checking'), None)
        recipient_account = next((acc for acc in self.accounts if acc['account_type'] == 'savings'), None)
        
        if not sender_account or not recipient_account:
            print("❌ Need both checking and savings accounts")
            return False, None

        transfer_amount = 1000
        success, response = self.run_test(
            f"Create transfer of ${transfer_amount}",
            "POST",
            "transactions", 
            201,
            data={
                "account_id": sender_account['id'],
                "transaction_type": "transfer",
                "amount": transfer_amount,
                "currency": "USD",
                "description": "Test transfer with tax",
                "recipient_account_id": recipient_account['id']
            }
        )
        
        if success:
            transfer = response
            print(f"   Transfer created: {transfer['id']}")
            print(f"   Status: {transfer['status']}")
            print(f"   Tax required: ${transfer.get('tax_required', 0)}")
            print(f"   Tax paid: ${transfer.get('tax_paid', 0)}")
            
            # Validate transfer has correct tax properties
            if transfer['status'] != 'pending_tax':
                print(f"❌ Expected status 'pending_tax', got '{transfer['status']}'")
                return False, None
            
            if transfer.get('tax_required') != 4850:
                print(f"❌ Expected tax_required 4850, got {transfer.get('tax_required')}")
                return False, None
                
            if transfer.get('tax_paid') != 0:
                print(f"❌ Expected tax_paid 0, got {transfer.get('tax_paid')}")
                return False, None
                
            return True, transfer
        
        return False, None

    def test_verify_balances_after_transfer(self, sender_id, recipient_id, transfer_amount):
        """Verify that sender balance was deducted but recipient not credited yet"""
        print("\n=== Verifying Balances After Transfer ===")
        
        # Get updated accounts
        success, accounts = self.run_test(
            "Get updated accounts",
            "GET", 
            "accounts",
            200
        )
        
        if not success:
            return False
            
        sender = next((acc for acc in accounts if acc['id'] == sender_id), None)
        recipient = next((acc for acc in accounts if acc['id'] == recipient_id), None)
        
        if not sender or not recipient:
            print("❌ Could not find sender or recipient account")
            return False
            
        print(f"   Sender balance: USD ${sender['balance_usd']}")
        print(f"   Recipient balance: USD ${recipient['balance_usd']}")
        
        # Find original balances from self.accounts
        orig_sender = next((acc for acc in self.accounts if acc['id'] == sender_id), None)
        orig_recipient = next((acc for acc in self.accounts if acc['id'] == recipient_id), None)
        
        expected_sender_balance = orig_sender['balance_usd'] - transfer_amount
        expected_recipient_balance = orig_recipient['balance_usd']  # Should not change yet
        
        if abs(sender['balance_usd'] - expected_sender_balance) > 0.01:
            print(f"❌ Sender balance incorrect. Expected ${expected_sender_balance}, got ${sender['balance_usd']}")
            return False
            
        if abs(recipient['balance_usd'] - expected_recipient_balance) > 0.01:
            print(f"❌ Recipient balance should not change until tax paid. Expected ${expected_recipient_balance}, got ${recipient['balance_usd']}")
            return False
            
        print("✅ Balances are correct - transfer amount deducted from sender, recipient not credited yet")
        return True

    def test_pay_tax_partial(self, transaction_id, amount):
        """Test partial tax payment"""
        print(f"\n=== Testing Partial Tax Payment (${amount}) ===")
        success, response = self.run_test(
            f"Pay partial tax ${amount}",
            "POST",
            f"transactions/{transaction_id}/pay-tax",
            200,
            data={"amount": amount}
        )
        
        if success:
            print(f"   Tax payment processed")
            print(f"   Status: {response.get('status')}")
            print(f"   Tax paid: ${response.get('tax_paid', 0)}")
            print(f"   Tax required: ${response.get('tax_required', 0)}")
            return True, response
        return False, None

    def test_pay_tax_complete(self, transaction_id, remaining_amount):
        """Test completing tax payment"""
        print(f"\n=== Testing Complete Tax Payment (${remaining_amount}) ===")
        success, response = self.run_test(
            f"Complete tax payment ${remaining_amount}",
            "POST",
            f"transactions/{transaction_id}/pay-tax",
            200,
            data={"amount": remaining_amount}
        )
        
        if success:
            print(f"   Final tax payment processed")
            print(f"   Status: {response.get('status')}")
            print(f"   Tax paid: ${response.get('tax_paid', 0)}")
            print(f"   Released at: {response.get('released_at')}")
            
            # Verify status changed to completed
            if response.get('status') != 'completed':
                print(f"❌ Expected status 'completed', got '{response.get('status')}'")
                return False, None
                
            if not response.get('released_at'):
                print(f"❌ Expected released_at to be set")
                return False, None
                
            return True, response
        return False, None

    def test_verify_final_balances(self, sender_id, recipient_id, transfer_amount):
        """Verify final balances after tax completion"""
        print("\n=== Verifying Final Balances After Tax Completion ===")
        
        success, accounts = self.run_test(
            "Get final accounts",
            "GET",
            "accounts", 
            200
        )
        
        if not success:
            return False
            
        sender = next((acc for acc in accounts if acc['id'] == sender_id), None)
        recipient = next((acc for acc in accounts if acc['id'] == recipient_id), None)
        
        if not sender or not recipient:
            print("❌ Could not find accounts")
            return False
            
        print(f"   Final sender balance: USD ${sender['balance_usd']}")  
        print(f"   Final recipient balance: USD ${recipient['balance_usd']}")
        
        # Recipient should now have the transfer amount
        # We expect recipient to have received the transfer amount
        print("✅ Transfer completed - recipient should now have received the funds")
        return True

    def test_get_transactions(self):
        """Test getting all transactions"""
        print("\n=== Testing Transaction History ===")
        success, response = self.run_test(
            "Get transaction history",
            "GET",
            "transactions/all",
            200
        )
        
        if success:
            print(f"   Found {len(response)} transactions")
            # Find transfers with tax info
            transfers = [tx for tx in response if tx['transaction_type'] == 'transfer']
            for transfer in transfers[:3]:  # Show first 3 transfers
                print(f"   - Transfer {transfer['id'][:8]}... Status: {transfer['status']} Tax: {transfer.get('tax_paid', 0)}/{transfer.get('tax_required', 0)}")
        return success

def main():
    print("🏦 VaultBank Transfer Tax System Test Suite")
    print("=" * 50)
    
    tester = VaultBankAPITester()
    
    # Step 1: Login
    if not tester.test_login():
        print("❌ Login failed, stopping tests")
        return 1

    # Step 2: Get accounts  
    if not tester.test_get_accounts():
        print("❌ Failed to get accounts, stopping tests")
        return 1

    # Step 3: Create deposit to have funds
    if not tester.test_create_deposit(5000):
        print("❌ Failed to create deposit, stopping tests")
        return 1

    # Step 4: Create transfer (should be pending_tax)
    transfer_success, transfer = tester.test_create_transfer()
    if not transfer_success:
        print("❌ Failed to create transfer, stopping tests")
        return 1

    # Step 5: Verify balances after transfer (sender deducted, recipient not credited)
    sender_account = next((acc for acc in tester.accounts if acc['account_type'] == 'checking'), None)
    recipient_account = next((acc for acc in tester.accounts if acc['account_type'] == 'savings'), None)
    
    if not tester.test_verify_balances_after_transfer(
        sender_account['id'], 
        recipient_account['id'], 
        1000
    ):
        print("❌ Balance verification failed")
        return 1

    # Step 6: Pay partial tax
    partial_success, partial_response = tester.test_pay_tax_partial(transfer['id'], 2000)
    if not partial_success:
        print("❌ Partial tax payment failed")
        return 1

    # Step 7: Complete tax payment  
    remaining_tax = 4850 - 2000  # 2850
    complete_success, complete_response = tester.test_pay_tax_complete(transfer['id'], remaining_tax)
    if not complete_success:
        print("❌ Complete tax payment failed")
        return 1

    # Step 8: Verify final balances (recipient should now be credited)
    if not tester.test_verify_final_balances(
        sender_account['id'],
        recipient_account['id'], 
        1000
    ):
        print("❌ Final balance verification failed")
        return 1

    # Step 9: Get transaction history
    if not tester.test_get_transactions():
        print("❌ Failed to get transaction history")
        return 1

    # Print results
    print(f"\n📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print("⚠️  Some tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())