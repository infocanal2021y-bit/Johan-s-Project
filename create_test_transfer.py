import requests

# Get token first
login_response = requests.post('https://fintech-deposits.preview.emergentagent.com/api/auth/login', json={
    'email': 'demo@vaultbank.com',
    'password': 'Password123'
})
token = login_response.json()['token']
headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

# Get accounts
accounts_response = requests.get('https://fintech-deposits.preview.emergentagent.com/api/accounts', headers=headers)
accounts = accounts_response.json()

checking = next(acc for acc in accounts if acc['account_type'] == 'checking')
savings = next(acc for acc in accounts if acc['account_type'] == 'savings')

print(f'Checking account balance: ${checking["balance_usd"]}')
print(f'Savings account balance: ${savings["balance_usd"]}')

# Create a new transfer 
transfer_response = requests.post('https://fintech-deposits.preview.emergentagent.com/api/transactions', 
    headers=headers,
    json={
        'account_id': checking['id'],
        'transaction_type': 'transfer',
        'amount': 750,
        'currency': 'USD',
        'description': 'Test transfer for tax payment UI',
        'recipient_account_id': savings['id']
    }
)

if transfer_response.status_code == 200:
    transfer = transfer_response.json()
    print(f'✅ Transfer created: {transfer["id"]}')
    print(f'   Status: {transfer["status"]}')
    print(f'   Tax required: ${transfer["tax_required"]}')
    print(f'   Tax paid: ${transfer["tax_paid"]}')
else:
    print(f'❌ Transfer failed: {transfer_response.status_code} - {transfer_response.text}')