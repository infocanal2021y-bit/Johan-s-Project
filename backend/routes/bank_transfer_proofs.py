"""Bank Transfer Proof — user uploads bank transfer receipt for partial-unlock 40% activation.

Flow:
1. User opens "Pagar por transferencia bancaria" modal → sees treasury IBAN.
2. User uploads proof (image base64) + holder_name + reference + amount.
3. Backend stores in `bank_transfer_proofs` with status='in_review'.
4. Admin reviews in /admin/bank-transfers panel.
5. Approve → amount is appended to parent partial_unlock's `payments` array (counts toward 2,660 EUR).
6. Reject → user receives notification and can re-submit.

Collection: `treasury_transfer_proofs`
{
  id, user_id, user_email, user_name,
  unlock_id,                        # link to partial_withdraw_unlocks
  amount_eur, holder_name, reference,
  proof_b64, proof_mime, proof_filename,
  status: 'in_review' | 'approved' | 'rejected',
  reject_reason: str | None,
  reviewed_at, reviewed_by, reviewed_by_email,
  case_code,
  submitted_at, updated_at,
}
"""
import uuid
import base64
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException

from config import db
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification, create_admin_notification
from services.case_codes import generate_case_code


router = APIRouter()

MIN_AMOUNT_EUR = 500.0
MAX_PROOF_BYTES = 5 * 1024 * 1024  # 5 MB

# Treasury bank account — static config (admin can edit via DB later if needed)
TREASURY_BANK_ACCOUNT = {
    'holder': 'LIONSBIT VERIFICACIÓN, S.L.',
    'bank': 'BBVA España',
    'iban': 'ES79 0182 1234 5612 3456 7890',
    'bic': 'BBVAESMMXXX',
    'country': 'España',
    'currency': 'EUR',
    'reference_hint': 'Incluya su código PLB o nombre completo en el concepto',
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ──────────────────────── USER ROUTES ────────────────────────

@router.get("/bank-transfer-proofs/treasury-account")
async def get_treasury_account(user: dict = Depends(get_current_user)):
    return TREASURY_BANK_ACCOUNT


@router.get("/bank-transfer-proofs/me")
async def list_my_proofs(user: dict = Depends(get_current_user)):
    cursor = db.treasury_transfer_proofs.find(
        {'user_id': user['id']},
        sort=[('submitted_at', -1)],
    )
    proofs = []
    async for p in cursor:
        proofs.append({
            'id': p.get('id'),
            'amount_eur': p.get('amount_eur'),
            'holder_name': p.get('holder_name'),
            'reference': p.get('reference'),
            'status': p.get('status'),
            'reject_reason': p.get('reject_reason'),
            'case_code': p.get('case_code'),
            'submitted_at': p.get('submitted_at'),
            'reviewed_at': p.get('reviewed_at'),
        })
    return {'proofs': proofs}


@router.post("/bank-transfer-proofs/submit")
async def submit_proof(payload: dict, user: dict = Depends(get_current_user)):
    """User submits a bank transfer proof toward the 2,660 EUR activation."""
    # Validations
    amount = payload.get('amount_eur')
    holder = (payload.get('holder_name') or '').strip()
    reference = (payload.get('reference') or '').strip()
    proof_b64 = (payload.get('proof_b64') or '').strip()
    proof_mime = (payload.get('proof_mime') or 'image/jpeg').strip()
    proof_filename = (payload.get('proof_filename') or 'comprobante').strip()

    try:
        amount_f = float(amount)
    except (TypeError, ValueError):
        raise HTTPException(400, 'Monto inválido')
    if amount_f < MIN_AMOUNT_EUR:
        raise HTTPException(400, f'El monto mínimo es €{int(MIN_AMOUNT_EUR)}')
    if not holder or len(holder) < 3:
        raise HTTPException(400, 'Nombre del titular obligatorio')
    if not reference or len(reference) < 2:
        raise HTTPException(400, 'Referencia obligatoria')
    if not proof_b64:
        raise HTTPException(400, 'Comprobante requerido')

    # Decode size check
    try:
        raw = base64.b64decode(proof_b64.split(',')[-1])
    except Exception:
        raise HTTPException(400, 'Comprobante con formato inválido')
    if len(raw) > MAX_PROOF_BYTES:
        raise HTTPException(400, 'Comprobante supera 5MB')

    # Find the user's open partial unlock (must exist + still pending_payment OR in_review)
    record = await db.partial_withdraw_unlocks.find_one(
        {'user_id': user['id'], 'status': {'$in': ['pending_payment', 'in_review']}},
        sort=[('created_at', -1)],
    )
    if not record:
        raise HTTPException(404, 'No hay una solicitud activa de desbloqueo')

    now = _now_iso()
    proof_id = str(uuid.uuid4())
    case_code = await generate_case_code(
        entity_type='bank_transfer_proof',
        entity_id=proof_id,
        user_id=user['id'],
        summary=f'Transferencia bancaria · €{amount_f:.2f} EUR',
    )

    doc = {
        'id': proof_id,
        'user_id': user['id'],
        'user_email': user.get('email'),
        'user_name': user.get('full_name') or user.get('name'),
        'unlock_id': record['id'],
        'amount_eur': round(amount_f, 2),
        'holder_name': holder,
        'reference': reference,
        'proof_b64': proof_b64,
        'proof_mime': proof_mime,
        'proof_filename': proof_filename,
        'status': 'in_review',
        'reject_reason': None,
        'case_code': case_code,
        'submitted_at': now,
        'updated_at': now,
    }
    await db.treasury_transfer_proofs.insert_one(doc)

    # Notify admin + user
    try:
        await create_admin_notification(
            title='Nuevo comprobante de transferencia bancaria',
            message=f'{user.get("email")} envió €{amount_f:.2f} EUR · {case_code}',
            link='/admin/bank-transfers',
            severity='info',
        )
    except Exception:
        pass

    try:
        await create_notification(
            user_id=user['id'],
            title='Transferencia en revisión',
            message=f'Tu comprobante ({case_code}) fue recibido y está siendo revisado por nuestro equipo.',
            link='/withdraw',
            severity='info',
        )
    except Exception:
        pass

    return {
        'ok': True,
        'proof_id': proof_id,
        'case_code': case_code,
        'status': 'in_review',
    }


# ──────────────────────── ADMIN ROUTES ────────────────────────

@router.get("/admin/bank-transfer-proofs")
async def admin_list(
    status: Optional[str] = None,
    user: dict = Depends(get_admin_user),
):
    q: dict = {}
    if status:
        q['status'] = status
    cursor = db.treasury_transfer_proofs.find(q, sort=[('submitted_at', -1)])
    out: List[dict] = []
    async for p in cursor:
        out.append({
            'id': p.get('id'),
            'user_id': p.get('user_id'),
            'user_email': p.get('user_email'),
            'user_name': p.get('user_name'),
            'unlock_id': p.get('unlock_id'),
            'amount_eur': p.get('amount_eur'),
            'holder_name': p.get('holder_name'),
            'reference': p.get('reference'),
            'proof_mime': p.get('proof_mime'),
            'proof_filename': p.get('proof_filename'),
            'status': p.get('status'),
            'reject_reason': p.get('reject_reason'),
            'case_code': p.get('case_code'),
            'submitted_at': p.get('submitted_at'),
            'reviewed_at': p.get('reviewed_at'),
            'reviewed_by_email': p.get('reviewed_by_email'),
        })
    return {'proofs': out}


@router.get("/admin/bank-transfer-proofs/{proof_id}/file")
async def admin_get_file(proof_id: str, user: dict = Depends(get_admin_user)):
    p = await db.treasury_transfer_proofs.find_one({'id': proof_id})
    if not p:
        raise HTTPException(404, 'No encontrado')
    return {
        'proof_b64': p.get('proof_b64'),
        'proof_mime': p.get('proof_mime'),
        'proof_filename': p.get('proof_filename'),
    }


@router.post("/admin/bank-transfer-proofs/{proof_id}/approve")
async def admin_approve(proof_id: str, user: dict = Depends(get_admin_user)):
    p = await db.treasury_transfer_proofs.find_one({'id': proof_id})
    if not p:
        raise HTTPException(404, 'Comprobante no encontrado')
    if p.get('status') != 'in_review':
        raise HTTPException(400, f'Estado inválido: {p.get("status")}')

    now = _now_iso()
    amount_eur = float(p.get('amount_eur') or 0)
    unlock_id = p.get('unlock_id')

    # Append a synthetic payment to the parent unlock's payments[] (counts toward 2660 EUR)
    payment_entry = {
        'id': str(uuid.uuid4()),
        'amount_eur': amount_eur,
        'tx_hash': f'BANK-{p.get("case_code") or proof_id[:8].upper()}',
        'method': 'bank_transfer',
        'bank_transfer_proof_id': proof_id,
        'holder_name': p.get('holder_name'),
        'reference': p.get('reference'),
        'submitted_at': p.get('submitted_at'),
        'approved_at': now,
        'approved_by': user.get('id'),
    }
    unlock = await db.partial_withdraw_unlocks.find_one({'id': unlock_id})
    if unlock:
        existing = unlock.get('payments') or []
        new_total = sum(float(x.get('amount_eur') or 0) for x in existing) + amount_eur
        from routes.partial_unlock import REQUIRED_EUR
        completed = new_total + 0.01 >= REQUIRED_EUR

        update: dict = {
            '$push': {'payments': payment_entry},
            '$set': {'updated_at': now},
        }
        if completed and unlock.get('status') == 'pending_payment':
            in_review_count = await db.partial_withdraw_unlocks.count_documents({'status': 'in_review'})
            update['$set'].update({'status': 'in_review', 'priority_rank': in_review_count + 1})

        await db.partial_withdraw_unlocks.update_one({'id': unlock_id}, update)

    await db.treasury_transfer_proofs.update_one(
        {'id': proof_id},
        {'$set': {
            'status': 'approved',
            'reviewed_at': now,
            'reviewed_by': user.get('id'),
            'reviewed_by_email': user.get('email'),
            'updated_at': now,
        }},
    )

    # Notify user
    try:
        await create_notification(
            user_id=p['user_id'],
            title='Transferencia aprobada',
            message=f'Tu transferencia de €{amount_eur:.2f} ({p.get("case_code")}) fue aprobada y aplicada a tu desbloqueo.',
            link='/withdraw',
            severity='success',
        )
    except Exception:
        pass

    return {'ok': True, 'status': 'approved'}


@router.post("/admin/bank-transfer-proofs/{proof_id}/reject")
async def admin_reject(proof_id: str, payload: Optional[dict] = None, user: dict = Depends(get_admin_user)):
    p = await db.treasury_transfer_proofs.find_one({'id': proof_id})
    if not p:
        raise HTTPException(404, 'Comprobante no encontrado')
    if p.get('status') != 'in_review':
        raise HTTPException(400, f'Estado inválido: {p.get("status")}')

    reason = ((payload or {}).get('reason') or '').strip()
    if not reason or len(reason) < 5:
        raise HTTPException(400, 'Motivo de rechazo obligatorio (mínimo 5 caracteres)')

    now = _now_iso()
    await db.treasury_transfer_proofs.update_one(
        {'id': proof_id},
        {'$set': {
            'status': 'rejected',
            'reject_reason': reason,
            'reviewed_at': now,
            'reviewed_by': user.get('id'),
            'reviewed_by_email': user.get('email'),
            'updated_at': now,
        }},
    )

    try:
        await create_notification(
            user_id=p['user_id'],
            title='Transferencia rechazada',
            message=f'Tu transferencia ({p.get("case_code")}) fue rechazada: {reason}. Puedes subir un nuevo comprobante.',
            link='/withdraw',
            severity='warning',
        )
    except Exception:
        pass

    return {'ok': True, 'status': 'rejected'}
