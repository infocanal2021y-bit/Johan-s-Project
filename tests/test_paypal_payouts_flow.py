"""In-process test of PayPal payout flow against the fake server (no real credentials)."""
import asyncio, os, sys
sys.path.insert(0, '/app/backend')
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
os.environ.update(PAYPAL_CLIENT_ID='fake', PAYPAL_CLIENT_SECRET='fake', PAYPAL_MODE='sandbox',
                  PAYPAL_API_BASE='http://127.0.0.1:8099', PAYPAL_WEBHOOK_ID='WH-TEST')

from config import db
from routes import paypal_withdrawals as pw
from fastapi import HTTPException

USER_ID = 'b8a5dbb3-c164-4e46-80e1-1bbbaa13c895'
ADMIN = {'id': 'admin-test', 'name': 'Admin Test', 'email': 'info@paylionsbit.es'}


async def make_request(amount, suffix):
    user = await db.users.find_one({'id': USER_ID}, {'_id': 0, 'password': 0})
    await db.multi_currency_wallets.update_one({'user_id': USER_ID}, {'$set': {'balances.EUR': 1000.0, 'pending.EUR': 0.0}})
    r = await pw.initiate({'amount': amount, 'currency': 'EUR'}, user)
    rec = await db.paypal_withdrawal_requests.find_one({'id': r['request_id']})
    await pw.confirm_code(r['request_id'], {'code': rec['confirmation_code']}, user)
    # force reference suffix so the fake server knows the behaviour
    await db.paypal_withdrawal_requests.update_one({'id': r['request_id']}, {'$set': {'reference': rec['reference'] + suffix}})
    await pw.admin_advance(r['request_id'], {}, ADMIN)  # -> in_review
    return r['request_id']


async def bal():
    w = await db.multi_currency_wallets.find_one({'user_id': USER_ID})
    return w['balances'].get('EUR'), w.get('pending', {}).get('EUR')


async def main():
    # 1. immediate success
    rid = await make_request(60, '-OK')
    res = await pw.admin_pay_with_paypal(rid, {}, ADMIN)
    rec = res['request']
    print('1 OK  ->', res['outcome'], rec['status'], rec['paypal_txn_id'], rec['payout_fee'], [t['status'] for t in rec['status_timeline']])
    assert rec['status'] == 'completed' and rec['paypal_txn_id'].startswith('TXN')
    tx = await db.transactions.find_one({'paypal_withdrawal_id': rid}); assert tx['status'] == 'completed'

    # 2. pending then success via poll
    rid2 = await make_request(70, '-PEND')
    res = await pw.admin_pay_with_paypal(rid2, {}, ADMIN)
    print('2 PEND->', res['outcome'], res['request']['status'])
    assert res['request']['status'] == 'payout_sent'
    try:
        await pw.admin_advance(rid2, {}, ADMIN); print('advance allowed?!')
    except HTTPException as e:
        print('   advance blocked:', e.detail[:60])
    try:
        await pw._terminate(rid2, {'note': 'intento'}, ADMIN, 'cancelled'); print('cancel allowed?!')
    except HTTPException as e:
        print('   cancel blocked:', e.detail[:60])
    poll = await pw.poll_pending_payouts(); print('   poll ->', poll)
    rec = await db.paypal_withdrawal_requests.find_one({'id': rid2}); print('   after poll:', rec['status'], rec['paypal_txn_id'])
    assert rec['status'] == 'completed'

    # 3. failure -> rejected + refund
    before = await bal()
    rid3 = await make_request(80, '-FAIL')
    mid = await bal()
    res = await pw.admin_pay_with_paypal(rid3, {}, ADMIN)
    after = await bal()
    rec = res['request']
    print('3 FAIL->', res['outcome'], rec['status'], '| note:', rec['admin_note'], '| balances before/mid/after:', before, mid, after)
    assert rec['status'] == 'rejected' and abs(after[0] - mid[0] - 80) < 0.01

    # 4. API validation error (invalid receiver) -> stays in_review, error recorded
    rid4 = await make_request(90, '-X')
    await db.paypal_withdrawal_requests.update_one({'id': rid4}, {'$set': {'paypal_email': 'nobody@invalid.test'}})
    try:
        await pw.admin_pay_with_paypal(rid4, {}, ADMIN); print('4 should have failed')
    except HTTPException as e:
        rec = await db.paypal_withdrawal_requests.find_one({'id': rid4})
        print('4 ERR ->', e.status_code, e.detail[:80], '| status:', rec['status'], '| last_error saved:', bool(rec.get('payout_last_error')))
        assert rec['status'] == 'in_review'

    # 5. webhook: unverified ignored, verified finalizes
    rid5 = await make_request(50, '-PEND')
    res = await pw.admin_pay_with_paypal(rid5, {}, ADMIN)
    bid = res['request']['payout_batch_id']
    from starlette.requests import Request
    async def fake_req(sig):
        scope = {'type': 'http', 'method': 'POST', 'headers': [(b'paypal-transmission-sig', sig.encode()), (b'paypal-transmission-id', b'x'), (b'paypal-auth-algo', b'SHA256withRSA'), (b'paypal-cert-url', b'https://x'), (b'paypal-transmission-time', b'now')], 'path': '/api/paypal/webhook', 'query_string': b''}
        body = ('{"id":"WH-EVT","event_type":"PAYMENT.PAYOUTS-ITEM.SUCCEEDED","resource":{"payout_batch_id":"%s"}}' % bid).encode()
        async def receive(): return {'type': 'http.request', 'body': body, 'more_body': False}
        return Request(scope, receive)
    r1 = await pw.paypal_webhook(await fake_req('BAD')); rec = await db.paypal_withdrawal_requests.find_one({'id': rid5})
    print('5 webhook BAD ->', r1, rec['status'])
    assert rec['status'] == 'payout_sent'
    r2 = await pw.paypal_webhook(await fake_req('GOOD')); rec = await db.paypal_withdrawal_requests.find_one({'id': rid5})
    print('5 webhook GOOD ->', r2, rec['status'], rec['paypal_txn_id'])
    assert rec['status'] == 'completed'
    print('events logged:', await db.paypal_webhook_events.count_documents({'batch_id': bid}))

    # cleanup test balance
    await db.multi_currency_wallets.update_one({'user_id': USER_ID}, {'$set': {'balances.EUR': 0.0, 'pending.EUR': 0.0}})
    print('ALL PASS')

asyncio.run(main())
