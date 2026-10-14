"""Fake PayPal Payouts server for local testing of services/paypal_payouts.py (no real credentials)."""
from fastapi import FastAPI, Request, Header
import uvicorn

app = FastAPI()
BATCHES = {}
# behaviour per sender_batch_id suffix: '-OK' → SUCCESS, '-FAIL' → FAILED (unclaimed → returned), else PENDING then SUCCESS on 2nd GET
POLLS = {}


@app.post('/v1/oauth2/token')
async def token():
    return {'access_token': 'FAKE_TOKEN', 'expires_in': 3000, 'token_type': 'Bearer'}


@app.post('/v1/payments/payouts')
async def create(req: Request, paypal_request_id: str = Header(None, alias='PayPal-Request-Id')):
    body = await req.json()
    sb = body['sender_batch_header']['sender_batch_id']
    if sb in BATCHES:  # idempotency
        return BATCHES[sb]['create']
    if body['items'][0]['receiver'].endswith('@invalid.test'):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=400, content={'name': 'VALIDATION_ERROR', 'message': 'Invalid request - see details',
                                                      'details': [{'field': 'items[0].receiver', 'issue': 'Receiver is invalid'}]})
    bid = f"BATCH{len(BATCHES)+1:04d}"
    BATCHES[sb] = {'id': bid, 'item': body['items'][0], 'create': {'batch_header': {'payout_batch_id': bid, 'batch_status': 'PENDING', 'sender_batch_header': body['sender_batch_header']}}}
    return BATCHES[sb]['create']


@app.get('/v1/payments/payouts/{bid}')
async def get(bid: str):
    sb = next(k for k, v in BATCHES.items() if v['id'] == bid)
    POLLS[bid] = POLLS.get(bid, 0) + 1
    item = BATCHES[sb]['item']
    if sb.endswith('-FAIL'):
        st, err = ('FAILED', {'name': 'RECEIVER_UNREGISTERED', 'message': 'Receiver is unregistered'})
    elif sb.endswith('-OK') or POLLS[bid] >= 2:
        st, err = ('SUCCESS', None)
    else:
        st, err = ('PENDING', None)
    row = {'payout_item_id': f"ITEM{bid}", 'transaction_status': st, 'transaction_id': f"TXN{bid}" if st == 'SUCCESS' else None,
           'payout_item_fee': {'value': '0.25', 'currency': item['amount']['currency']}, 'payout_item': item, 'time_processed': '2026-10-15T00:00:00Z'}
    if err:
        row['errors'] = err
    return {'batch_header': {'payout_batch_id': bid, 'batch_status': 'SUCCESS' if st != 'PENDING' else 'PROCESSING'}, 'items': [row]}


@app.post('/v1/notifications/verify-webhook-signature')
async def verify(req: Request):
    body = await req.json()
    return {'verification_status': 'SUCCESS' if body.get('transmission_sig') == 'GOOD' else 'FAILURE'}


if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=8099, log_level='warning')
