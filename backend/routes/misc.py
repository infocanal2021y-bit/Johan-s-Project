"""Miscellaneous routes: chatbot, payments, bitcoin, feedback"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
import uuid, logging
import httpx
from config import db, strip_id, CHATBOT_FAQ, SUPPORT_EMAILS
from models import ChatMessage, FeedbackSubmission, BankTransferConfirm
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification

router = APIRouter()

# ==================== CHATBOT ROUTES ====================


# ─── Bank Transfer Payment Confirmation ───

@router.get("/payments/bank-transfer-access")
async def check_bank_transfer_access(current_user: dict = Depends(get_current_user)):
    """Check if user has access to bank transfer method"""
    has_access = current_user['email'].lower() not in RESTRICTED_BANK_TRANSFER_EMAILS
    return {'has_access': has_access}

@router.post("/payments/bank-transfer-confirm")
async def confirm_bank_transfer(data: BankTransferConfirm, current_user: dict = Depends(get_current_user)):
    """Record bank transfer confirmation with proof upload + email notifications"""
    if current_user['email'].lower() in RESTRICTED_BANK_TRANSFER_EMAILS:
        raise HTTPException(status_code=403, detail='No tiene acceso a este metodo de pago')
    
    # Validate file if provided
    if data.proof_file and data.proof_filename:
        allowed_ext = ('.jpg', '.jpeg', '.png', '.pdf')
        if not data.proof_filename.lower().endswith(allowed_ext):
            raise HTTPException(status_code=400, detail='Formato de archivo no permitido. Use JPG, PNG o PDF.')
        # Check base64 size (~5MB limit -> ~6.7MB base64)
        if len(data.proof_file) > 7_000_000:
            raise HTTPException(status_code=400, detail='Archivo demasiado grande. Maximo 5MB.')
    
    record_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    now_formatted = datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')
    
    record = {
        'id': record_id,
        'user_id': current_user['id'],
        'user_name': current_user['name'],
        'user_email': current_user['email'],
        'type': 'bank_transfer',
        'reference': data.reference,
        'amount': 4850,
        'currency': 'EUR',
        'status': 'pending_verification',
        'comment': data.comment,
        'proof_filename': data.proof_filename,
        'has_proof': bool(data.proof_file),
        'bank_details': {
            'holder': 'Juan Gomez',
            'iban': 'BE73 9053 1376 1560',
            'swift': 'TRWIBEB1XXX',
        },
        'created_at': now,
        'updated_at': now
    }
    
    # Store proof file separately if provided (keep main record lean)
    if data.proof_file:
        await db.bank_transfer_proofs.insert_one({
            'payment_id': record_id,
            'filename': data.proof_filename,
            'data': data.proof_file,
            'created_at': now
        })
    
    await db.bank_transfer_payments.insert_one(record)
    
    # Notification to user
    await create_notification(current_user['id'], 'Comprobante Recibido',
        f'Su comprobante de transferencia bancaria (Ref: {data.reference}) ha sido recibido. Estado: Pendiente de verificacion.')
    
    # Notification to admins
    admins = await db.users.find({'role': 'admin'}, {'_id': 0, 'id': 1}).to_list(10)
    for admin in admins:
        await create_notification(admin['id'], 'Nueva Transferencia Bancaria',
            f'{current_user["name"]} ({current_user["email"]}) ha enviado comprobante de transferencia. Referencia: {data.reference}. Monto: 4850 EUR.')
    
    # ── Email to info@lionbit.es ──
    admin_email_content = f"""
        <p style="color:#e2e8f0;font-size:16px;">Se ha recibido un nuevo comprobante de transferencia bancaria.</p>
        <table width="100%" style="background:#0f172a;border-radius:12px;margin:20px 0;">
            <tr><td style="padding:25px;">
                <p style="color:#10b981;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">Datos de la Transferencia</p>
                <table width="100%">
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Nombre:</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;">{current_user['name']}</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Email:</td><td style="color:#10b981;text-align:right;padding:8px 0;border-bottom:1px solid #334155;">{current_user['email']}</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Monto:</td><td style="color:#f59e0b;text-align:right;padding:8px 0;border-bottom:1px solid #334155;font-weight:bold;">4850 EUR</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Referencia:</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;font-family:monospace;">{data.reference}</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Fecha:</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;">{now_formatted}</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Comprobante:</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;">{'Adjunto' if data.proof_file else 'No proporcionado'}</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;">Comentario:</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;">{data.comment or 'Sin comentario'}</td></tr>
                </table>
            </td></tr>
        </table>
    """
    admin_html = get_email_template(admin_email_content, "Nuevo Comprobante de Transferencia")
    
    # Build email params with optional attachment
    email_params = {
        "from": f"LIONSBIT VERIFICACION <{SENDER_EMAIL}>",
        "to": ["info@lionbit.es"],
        "subject": "Nuevo comprobante de transferencia recibido",
        "html": admin_html
    }
    
    if data.proof_file and data.proof_filename:
        import base64 as b64module
        # Extract raw base64 from data URI
        raw_b64 = data.proof_file
        if ',' in raw_b64:
            raw_b64 = raw_b64.split(',', 1)[1]
        email_params["attachments"] = [{
            "filename": data.proof_filename,
            "content": raw_b64
        }]
    
    if RESEND_API_KEY:
        try:
            await asyncio.to_thread(resend.Emails.send, email_params)
        except Exception as e:
            logging.error(f"Failed to send admin transfer email: {e}")
    
    # ── Confirmation email to user ──
    user_email_content = f"""
        <p style="color:#e2e8f0;font-size:16px;">Hemos recibido tu comprobante de transferencia bancaria.</p>
        <table width="100%" style="background:#0f172a;border-radius:12px;margin:20px 0;">
            <tr><td style="padding:25px;">
                <p style="color:#10b981;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">Resumen</p>
                <table width="100%">
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Monto:</td><td style="color:#f59e0b;text-align:right;padding:8px 0;border-bottom:1px solid #334155;font-weight:bold;">4850 EUR</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;border-bottom:1px solid #334155;">Referencia:</td><td style="color:#e2e8f0;text-align:right;padding:8px 0;border-bottom:1px solid #334155;font-family:monospace;">{data.reference}</td></tr>
                    <tr><td style="color:#94a3b8;padding:8px 0;">Estado:</td><td style="color:#f59e0b;text-align:right;padding:8px 0;font-weight:bold;">Pendiente de verificacion</td></tr>
                </table>
            </td></tr>
        </table>
        <p style="color:#94a3b8;font-size:14px;">Sera verificado en un plazo de 1 a 3 dias habiles.</p>
    """
    user_html = get_email_template(user_email_content, "Comprobante Recibido")
    send_email_background(current_user['email'], "Comprobante recibido - LIONSBIT VERIFICACION", user_html)
    
    return {'message': 'Comprobante enviado correctamente. Pendiente de verificacion.', 'id': record_id, 'status': 'pending_verification'}


# ─── Bitcoin Outputs Verification ───
_btc_outputs_cache = {'data': None, 'ts': 0}

@router.get("/bitcoin/outputs")
async def get_bitcoin_outputs():
    """Fetch recent large Bitcoin outputs for transaction verification"""
    import time as _time
    now = _time.time()
    # Cache for 2 minutes
    if _btc_outputs_cache['data'] and (now - _btc_outputs_cache['ts']) < 120:
        return _btc_outputs_cache['data']

    outputs = []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Get BTC price
            price_resp = await client.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
            btc_price = 72000  # fallback
            if price_resp.status_code == 200:
                btc_price = price_resp.json().get('bitcoin', {}).get('usd', 72000)

            # Get latest block hash
            latest_resp = await client.get('https://blockchain.info/latestblock', headers={'User-Agent': 'Mozilla/5.0'})
            if latest_resp.status_code != 200:
                raise Exception('Failed to get latest block')
            latest = latest_resp.json()
            block_hash = latest['hash']
            block_height = latest['height']

            # Fetch last 2 blocks for more data
            for offset in range(2):
                bh = block_hash if offset == 0 else None
                if offset > 0:
                    prev_resp = await client.get(f'https://blockchain.info/rawblock/{block_hash}', headers={'User-Agent': 'Mozilla/5.0'})
                    if prev_resp.status_code == 200:
                        bh = prev_resp.json().get('prev_block')
                    else:
                        break
                if not bh:
                    break

                block_resp = await client.get(f'https://blockchain.info/rawblock/{bh}', headers={'User-Agent': 'Mozilla/5.0'})
                if block_resp.status_code != 200:
                    break
                block_data = block_resp.json()
                block_time = block_data.get('time', 0)
                block_hash = block_data.get('prev_block', '')

                for tx in block_data.get('tx', []):
                    for out_idx, out in enumerate(tx.get('out', [])):
                        value_btc = out.get('value', 0) / 1e8
                        value_usd = value_btc * btc_price
                        # Filter: $40,000 - $110,000 USD range
                        if 40000 <= value_usd <= 110000:
                            outputs.append({
                                'block_id': block_data.get('height', block_height - offset),
                                'transaction_hash': tx.get('hash', ''),
                                'index': out_idx,
                                'time': datetime.fromtimestamp(block_time, tz=timezone.utc).isoformat(),
                                'value_btc': round(value_btc, 8),
                                'value_usd': round(value_usd, 2),
                                'recipient': out.get('addr', 'Unknown'),
                                'is_spent': out.get('spent', False),
                                'script_hex': out.get('script', '')[:40] + '...' if out.get('script') else '',
                            })

                        if len(outputs) >= 50:
                            break
                    if len(outputs) >= 50:
                        break
                if len(outputs) >= 50:
                    break

        # Sort by time desc
        outputs.sort(key=lambda x: x['time'], reverse=True)
        result = {
            'outputs': outputs[:50],
            'btc_price': btc_price,
            'block_height': block_height,
            'total_found': len(outputs),
            'filter': {'min_usd': 40000, 'max_usd': 110000},
            'source': 'blockchain.info',
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        _btc_outputs_cache['data'] = result
        _btc_outputs_cache['ts'] = now
        return result

    except Exception as e:
        logging.error(f"Bitcoin outputs fetch error: {e}")
        if _btc_outputs_cache['data']:
            return _btc_outputs_cache['data']
        return {
            'outputs': [],
            'btc_price': 0,
            'block_height': 0,
            'total_found': 0,
            'filter': {'min_usd': 40000, 'max_usd': 110000},
            'source': 'blockchain.info',
            'error': str(e),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }



@router.post("/chatbot/message")
async def chatbot_message(data: ChatMessage):
    """Process chatbot message and return FAQ response"""
    message = data.message.lower()
    
    best_match = None
    best_score = 0
    
    for faq in CHATBOT_FAQ.values():
        score = sum(len(kw) for kw in faq['keywords'] if kw in message)
        if score > best_score:
            best_score = score
            best_match = faq
    
    if best_match and best_score > 0:
        return {'response': best_match['answer'], 'matched': True}
    
    return {
        'response': 'No encontré una respuesta exacta. Intente con palabras clave como: retiro, impuesto, verificación, tiempo, soporte. O cree un ticket de soporte para atención personalizada.',
        'matched': False
    }


# ─── Feedback System ───

@router.post("/feedback")
async def submit_feedback(data: FeedbackSubmission, current_user: dict = Depends(get_current_user)):
    """Submit user feedback (rating + comment)"""
    feedback = {
        'id': str(uuid.uuid4()),
        'user_id': current_user['id'],
        'user_email': current_user['email'],
        'user_name': current_user.get('name', ''),
        'rating': data.rating,
        'comment': data.comment,
        'category': data.category or 'general',
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.feedback.insert_one(feedback)

    # Notify admins of new feedback
    stars = data.rating * '\u2605' + (5 - data.rating) * '\u2606'
    await notify_admins('Nuevo Feedback',
        f'{current_user.get("name", current_user["email"])} dejo feedback: {stars} ({data.rating}/5)')

    return {'message': 'Feedback enviado correctamente', 'id': feedback['id']}


@router.get("/feedback/mine")
async def get_my_feedback(current_user: dict = Depends(get_current_user)):
    """Get current user's feedback history"""
    feedbacks = await db.feedback.find(
        {'user_id': current_user['id']}, {'_id': 0}
    ).sort('created_at', -1).to_list(50)
    return feedbacks


@router.get("/admin/feedback")
async def get_all_feedback(admin: dict = Depends(get_admin_user)):
    """Get all feedback for admin dashboard"""
    feedbacks = await db.feedback.find({}, {'_id': 0}).sort('created_at', -1).to_list(200)

    # Stats
    total = len(feedbacks)
    if total > 0:
        avg_rating = sum(f['rating'] for f in feedbacks) / total
        distribution = {i: sum(1 for f in feedbacks if f['rating'] == i) for i in range(1, 6)}
    else:
        avg_rating = 0
        distribution = {i: 0 for i in range(1, 6)}

    return {
        'feedbacks': feedbacks,
        'stats': {
            'total': total,
            'average_rating': round(avg_rating, 1),
            'distribution': distribution
        }
    }
