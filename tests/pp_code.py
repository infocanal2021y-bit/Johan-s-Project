import sys, json
from pymongo import MongoClient
from dotenv import dotenv_values
env = dotenv_values('/app/backend/.env')
db = MongoClient(env['MONGO_URL'])[env['DB_NAME']]
UID = 'b8a5dbb3-c164-4e46-80e1-1bbbaa13c895'
cmd = sys.argv[1] if len(sys.argv) > 1 else 'code'
if cmd == 'code':
    d = db.paypal_withdrawal_requests.find_one({'user_id': UID, 'status': 'awaiting_code'}, sort=[('created_at', -1)])
    print(d and d.get('confirmation_code'), d and d.get('reference'))
else:
    w = db.multi_currency_wallets.find_one({'user_id': UID}, {'_id': 0})
    print(json.dumps(w, default=str)[:800])
    for d in db.paypal_withdrawal_requests.find({'user_id': UID}, {'_id': 0, 'reference': 1, 'status': 1, 'amount': 1, 'created_at': 1}).sort('created_at', -1).limit(10):
        print(d)
    print(db.paypal_accounts.find_one({'user_id': UID}, {'_id': 0}) if 'paypal_accounts' in db.list_collection_names() else db.list_collection_names())
