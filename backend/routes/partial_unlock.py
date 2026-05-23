"""Partial Withdrawal Unlock (40%) — paywall flow.

Flow:
1. User has X EUR available (sum of their accounts.balance_eur).
2. To unlock partial withdrawals (up to 40% of available), user must pay
   a one-time activation fee of 2,660 EUR via USDT (TRC20).
3. User submits TX hash → status moves to 'in_review'.
4. Admin validates manually → status='approved' → user can withdraw 40%.
   Or admin rejects with note → user can re-submit.

Snapshot policy: the 40% MAX is calculated and FROZEN at request creation
(option 3a confirmed by user). If their balance grows later, the unlocked
amount stays the same — auditable, predictable, regulatory-friendly.

Collection: `partial_withdraw_unlocks`
{
  id, user_id, user_email,
  status: 'pending_payment' | 'in_review' | 'approved' | 'rejected',
  required_eur: 2660.0,
  available_balance_eur_snapshot: float,
  max_withdraw_eur_snapshot: float,   # 40% of snapshot
  payment_method: 'usdt_trc20',
  wallet_address: str,
  tx_hash: str | None,
  proof_uploaded_at: ISO | None,
  admin_validated_at: ISO | None,
  admin_validated_by: str | None,
  admin_note: str | None,
  priority_rank: int,                 # FIFO across all in_review at submit time
  created_at, updated_at
}
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from config import db
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification, create_admin_notification


router = APIRouter()

# ── Constants ─────────────────────────────────────────────────────
REQUIRED_EUR = 2660.0
MIN_PARTIAL_EUR = 500.0  # minimum per partial payment (lowers entry friction)
UNLOCK_PCT = 40.0  # 40 % of available balance
PAYMENT_METHOD = {
    'key': 'usdt_trc20',
    'crypto_symbol': 'USDT',
    'name': 'USDT (Tron Network)',
    'network': 'TRC20',
    'network_full': 'Tron (TRC-20)',
    'wallet_address': 'TXwBxF3p5rz9dWwLsVyUvGJ2XhRyK8eQmP',
    'confirmations_required': 1,
    'avg_confirmation_min': 2,
    'fee_eur_est': 1.0,
    'color': '#26A17B',
    'tx_explorer': 'https://tronscan.org/#/transaction/',
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_available_balance_eur(user_id: str) -> float:
    """Sum of EUR balances across all user accounts (matches /accounts/summary)."""
    accs = await db.accounts.find({'user_id': user_id}, {'_id': 0, 'balance_eur': 1}).to_list(20)
    return float(sum((a.get('balance_eur') or 0) for a in accs))


def _serialize(doc: dict) -> dict:
    """Return doc safe for JSON (drop _id, keep IDs)."""
    if not doc:
        return doc
    d = dict(doc)
    d.pop('_id', None)
    return d


def _total_paid_eur(unlock: dict) -> float:
    """Sum of all partial payments submitted for this unlock."""
    if not unlock:
        return 0.0
    return float(sum((p.get('amount_eur') or 0) for p in (unlock.get('payments') or [])))


def _remaining_eur(unlock: dict) -> float:
    return max(0.0, REQUIRED_EUR - _total_paid_eur(unlock))


# ══════════════════════════════════════════════════════════════════
#  USER ENDPOINTS
# ══════════════════════════════════════════════════════════════════

@router.get("/partial-unlock/status")
async def get_status(user: dict = Depends(get_current_user)):
    """Returns current unlock state for this user + the live calculation
    of 40 % of their available balance.

    No active request yet → returns config-only payload so the UI can render
    the "start" CTA. Active request → returns the full record + snapshot.
    """
    available_eur = await _get_available_balance_eur(user['id'])
    live_max_withdraw = round(available_eur * (UNLOCK_PCT / 100.0), 2)

    # Find the *active* (not-rejected) record — there can only be one.
    active = await db.partial_withdraw_unlocks.find_one(
        {'user_id': user['id'], 'status': {'$in': ['pending_payment', 'in_review', 'approved']}},
        {'_id': 0},
        sort=[('created_at', -1)],
    )

    # All historical entries (including rejected) for the user
    history_cur = db.partial_withdraw_unlocks.find(
        {'user_id': user['id']}, {'_id': 0}
    ).sort('created_at', -1).limit(10)
    history = await history_cur.to_list(length=10)

    return {
        'config': {
            'required_eur': REQUIRED_EUR,
            'min_partial_eur': MIN_PARTIAL_EUR,
            'unlock_pct': UNLOCK_PCT,
            'payment_method': PAYMENT_METHOD,
        },
        'available_balance_eur': round(available_eur, 2),
        'live_max_withdraw_eur': live_max_withdraw,
        'active_request': active,
        'total_paid_eur': round(_total_paid_eur(active), 2),
        'remaining_eur': round(_remaining_eur(active), 2) if active else REQUIRED_EUR,
        'history': history,
        # convenience flags for the UI
        'can_start': active is None,
        'is_in_review': bool(active and active.get('status') == 'in_review'),
        'is_approved': bool(active and active.get('status') == 'approved'),
    }


@router.post("/partial-unlock/start")
async def start_request(user: dict = Depends(get_current_user)):
    """Create a new pending_payment unlock request.

    Snapshots the current available balance + 40 % cap so the user knows
    exactly what they will get when admin approves. Idempotent: if there is
    already an active record (pending/in_review/approved), it returns it.
    """
    existing = await db.partial_withdraw_unlocks.find_one(
        {'user_id': user['id'], 'status': {'$in': ['pending_payment', 'in_review', 'approved']}},
        {'_id': 0},
        sort=[('created_at', -1)],
    )
    if existing:
        return {'ok': True, 'created': False, 'request': existing}

    available_eur = await _get_available_balance_eur(user['id'])
    snapshot_max = round(available_eur * (UNLOCK_PCT / 100.0), 2)
    now = _now_iso()

    doc = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'user_email': user.get('email', ''),
        'status': 'pending_payment',
        'required_eur': REQUIRED_EUR,
        'available_balance_eur_snapshot': round(available_eur, 2),
        'max_withdraw_eur_snapshot': snapshot_max,
        'payment_method': PAYMENT_METHOD['key'],
        'wallet_address': PAYMENT_METHOD['wallet_address'],
        'tx_hash': None,             # legacy single-payment field (latest payment)
        'proof_uploaded_at': None,   # legacy field (timestamp of latest payment)
        'payments': [],              # NEW: list of partial payments
        'admin_validated_at': None,
        'admin_validated_by': None,
        'admin_note': None,
        'priority_rank': None,
        'created_at': now,
        'updated_at': now,
    }
    await db.partial_withdraw_unlocks.insert_one(doc)
    return {'ok': True, 'created': True, 'request': _serialize(doc)}


@router.post("/partial-unlock/proof")
async def submit_proof(payload: dict, user: dict = Depends(get_current_user)):
    """User submits a (partial) payment proof toward the 2,660 EUR activation.

    Accepts:
        tx_hash    (required, >= 10 chars)
        amount_eur (optional; defaults to remaining; min 500)

    Behavior:
        - Each call appends a payment to the unlock record.
        - Status stays 'pending_payment' until the cumulative paid amount
          reaches REQUIRED_EUR; then moves to 'in_review' and a FIFO
          priority_rank is assigned, and admins are notified.
    """
    tx_hash = (payload.get('tx_hash') or '').strip()
    if not tx_hash or len(tx_hash) < 10:
        raise HTTPException(400, 'TX hash inválido (mínimo 10 caracteres)')

    record = await db.partial_withdraw_unlocks.find_one(
        {'user_id': user['id'], 'status': 'pending_payment'},
        sort=[('created_at', -1)],
    )
    if not record:
        raise HTTPException(404, 'No tienes una solicitud pendiente de pago. Inicia el proceso primero.')

    # Reject duplicate hashes within the same unlock
    existing_hashes = {(p.get('tx_hash') or '').lower() for p in (record.get('payments') or [])}
    if tx_hash.lower() in existing_hashes:
        raise HTTPException(400, 'Ese TX hash ya fue registrado en esta solicitud')

    # Amount: default to remaining if not provided
    remaining = _remaining_eur(record)
    raw_amount = payload.get('amount_eur')
    try:
        amount = float(raw_amount) if raw_amount is not None else remaining
    except (TypeError, ValueError):
        raise HTTPException(400, 'amount_eur debe ser numérico')

    if amount <= 0:
        raise HTTPException(400, 'El monto debe ser mayor a 0')
    # Floor of 500 EUR per partial — except the LAST payment that just closes the gap
    if amount < MIN_PARTIAL_EUR and amount + 0.01 < remaining:
        raise HTTPException(
            400,
            f'Monto mínimo por abono parcial: {int(MIN_PARTIAL_EUR)} EUR. '
            f'(Pendiente: €{remaining:.2f})',
        )
    if amount > remaining + 0.01:
        raise HTTPException(
            400,
            f'Monto excede lo pendiente. Restan €{remaining:.2f} para completar la activación.',
        )

    now = _now_iso()
    payment = {
        'id': str(uuid.uuid4()),
        'amount_eur': round(amount, 2),
        'tx_hash': tx_hash,
        'submitted_at': now,
    }

    new_total = _total_paid_eur(record) + amount
    completed = new_total + 0.01 >= REQUIRED_EUR

    update: dict = {
        '$push': {'payments': payment},
        '$set': {
            'tx_hash': tx_hash,           # legacy: latest hash
            'proof_uploaded_at': now,     # legacy: latest timestamp
            'updated_at': now,
        },
    }

    priority = None
    if completed:
        in_review_count = await db.partial_withdraw_unlocks.count_documents({'status': 'in_review'})
        priority = in_review_count + 1
        update['$set'].update({'status': 'in_review', 'priority_rank': priority})

    await db.partial_withdraw_unlocks.update_one({'id': record['id']}, update)

    # Forward proof TX hash to admin inbox (no attachment — it's a hash)
    try:
        from services.proof_forwarder import forward_proof_to_admin
        await forward_proof_to_admin(
            proof_type='Desbloqueo 40% (USDT TRC20)',
            user=user,
            proof_file_b64=None,
            proof_filename=None,
            fields={
                'TX Hash': tx_hash,
                'Monto': f'€{amount:.2f} EUR',
                'Acumulado': f'€{new_total:.2f} / €{REQUIRED_EUR:.0f}',
                'Estado': 'COMPLETO ✓' if completed else 'Parcial',
                'Unlock ID': record['id'],
            },
        )
    except Exception:
        pass

    # Admin notification
    short_hash = tx_hash[:8] + '…' + tx_hash[-6:] if len(tx_hash) > 16 else tx_hash
    try:
        if completed:
            title = 'Desbloqueo 40% — comprobante recibido'
            message = (
                f"{user.get('email', 'Usuario')} ha completado el pago de {REQUIRED_EUR:.0f} EUR "
                f"(USDT TRC20) con {len((record.get('payments') or [])) + 1} abonos. "
                f"Último TX: {short_hash}. Prioridad #{priority}."
            )
        else:
            title = 'Desbloqueo 40% — abono parcial recibido'
            message = (
                f"{user.get('email', 'Usuario')} ha registrado un abono parcial de €{amount:.2f}. "
                f"Total acumulado: €{new_total:.2f} / €{REQUIRED_EUR:.0f} "
                f"(restan €{REQUIRED_EUR - new_total:.2f}). TX: {short_hash}."
            )
        await create_admin_notification(
            notification_type='withdrawal_request',
            title=title,
            message=message,
            user_info={
                'name': user.get('full_name') or user.get('email'),
                'email': user.get('email'),
                'country': user.get('country'),
            },
            metadata={
                'unlock_id': record['id'],
                'tx_hash': tx_hash,
                'amount_eur': round(amount, 2),
                'total_paid_eur': round(new_total, 2),
                'max_withdraw_eur': record.get('max_withdraw_eur_snapshot'),
                'priority_rank': priority,
                'completed': completed,
            },
            send_email_notification=completed,  # only email on full completion
        )
    except Exception:
        pass

    # In-app confirmation to the user for the partial payment itself
    try:
        if completed:
            await create_notification(
                user['id'],
                'Pago de activación completado',
                f'Has completado el pago de €{REQUIRED_EUR:.0f}. Tu solicitud pasó a "En revisión" (prioridad #{priority}).',
            )
        else:
            await create_notification(
                user['id'],
                'Abono parcial registrado',
                f'Hemos registrado tu abono de €{amount:.2f}. '
                f'Total acumulado: €{new_total:.2f} / €{REQUIRED_EUR:.0f} '
                f'(restan €{REQUIRED_EUR - new_total:.2f}).',
            )
    except Exception:
        pass

    fresh = await db.partial_withdraw_unlocks.find_one({'id': record['id']}, {'_id': 0})
    return {'ok': True, 'request': fresh, 'completed': completed, 'total_paid_eur': round(new_total, 2)}


@router.post("/partial-unlock/support-request")
async def support_request(payload: dict, user: dict = Depends(get_current_user)):
    """User asks Support for an official bank justification (justificante)
    of the 2,660 EUR fee. Creates an admin notification and a notification
    back to the user confirming the request.
    """
    note = (payload.get('note') or '').strip()[:300]
    record = await db.partial_withdraw_unlocks.find_one(
        {'user_id': user['id']},
        sort=[('created_at', -1)],
    )
    short_id = (record or {}).get('id', '')[:8]

    try:
        await create_admin_notification(
            notification_type='support_ticket',
            title='Solicitud de justificante bancario — Desbloqueo 40%',
            message=f"{user.get('email', 'Usuario')} solicita un justificante bancario oficial para la activación del desbloqueo parcial (Ref. #{short_id}). Nota: {note or '(sin nota)'}",
            user_info={'email': user.get('email'), 'name': user.get('full_name') or user.get('email')},
            metadata={'unlock_id': (record or {}).get('id'), 'note': note},
            send_email_notification=True,
        )
    except Exception:
        pass

    await create_notification(
        user['id'],
        'Justificante solicitado',
        'Hemos recibido tu solicitud de justificante bancario. Nuestro equipo de soporte te lo enviará en un máximo de 24h hábiles.',
    )
    return {'ok': True}


# ══════════════════════════════════════════════════════════════════
#  ADMIN ENDPOINTS
# ══════════════════════════════════════════════════════════════════

@router.get("/admin/partial-unlock/queue")
async def admin_queue(status: Optional[str] = None, user: dict = Depends(get_admin_user)):
    """Admin: list unlock requests, default filter = in_review (most relevant).
    Sorted by priority_rank asc, then created_at asc (FIFO).
    """
    q: dict = {}
    if status and status != 'all':
        q['status'] = status
    else:
        q['status'] = 'in_review'

    cur = db.partial_withdraw_unlocks.find(q, {'_id': 0}).sort([('priority_rank', 1), ('created_at', 1)]).limit(200)
    items = await cur.to_list(length=200)

    # Counts by status for the KPI strip
    pipeline = [{'$group': {'_id': '$status', 'n': {'$sum': 1}}}]
    counts = {row['_id']: row['n'] async for row in db.partial_withdraw_unlocks.aggregate(pipeline)}

    return {
        'items': items,
        'count': len(items),
        'counts': {
            'pending_payment': counts.get('pending_payment', 0),
            'in_review':       counts.get('in_review', 0),
            'approved':        counts.get('approved', 0),
            'rejected':        counts.get('rejected', 0),
        },
    }


@router.post("/admin/partial-unlock/{unlock_id}/approve")
async def admin_approve(unlock_id: str, payload: Optional[dict] = None, user: dict = Depends(get_admin_user)):
    note = ((payload or {}).get('admin_note') or '').strip()[:300]
    record = await db.partial_withdraw_unlocks.find_one({'id': unlock_id})
    if not record:
        raise HTTPException(404, 'Solicitud no encontrada')
    if record['status'] not in ('in_review', 'pending_payment'):
        raise HTTPException(400, f"Estado actual no permite aprobar: {record['status']}")

    now = _now_iso()
    await db.partial_withdraw_unlocks.update_one(
        {'id': unlock_id},
        {'$set': {
            'status': 'approved',
            'admin_validated_at': now,
            'admin_validated_by': user.get('email'),
            'admin_note': note or None,
            'updated_at': now,
        }},
    )

    # Mirror unlocked flag onto user document so other modules can read it
    await db.users.update_one(
        {'id': record['user_id']},
        {'$set': {
            'partial_withdraw_unlocked': True,
            'partial_withdraw_max_eur': record.get('max_withdraw_eur_snapshot'),
            'partial_withdraw_unlocked_at': now,
        }},
    )

    await create_notification(
        record['user_id'],
        'Desbloqueo 40% aprobado',
        f"Tu pago de {REQUIRED_EUR:.0f} EUR ha sido validado. Ya puedes retirar hasta €{record.get('max_withdraw_eur_snapshot', 0):.2f} (40% de tu saldo en el momento de la solicitud).",
    )
    fresh = await db.partial_withdraw_unlocks.find_one({'id': unlock_id}, {'_id': 0})
    return {'ok': True, 'request': fresh}


@router.post("/admin/partial-unlock/{unlock_id}/reject")
async def admin_reject(unlock_id: str, payload: Optional[dict] = None, user: dict = Depends(get_admin_user)):
    note = ((payload or {}).get('admin_note') or '').strip()[:300]
    if not note:
        raise HTTPException(400, 'Motivo de rechazo requerido')

    record = await db.partial_withdraw_unlocks.find_one({'id': unlock_id})
    if not record:
        raise HTTPException(404, 'Solicitud no encontrada')
    if record['status'] not in ('in_review', 'pending_payment'):
        raise HTTPException(400, f"Estado actual no permite rechazar: {record['status']}")

    now = _now_iso()
    await db.partial_withdraw_unlocks.update_one(
        {'id': unlock_id},
        {'$set': {
            'status': 'rejected',
            'admin_validated_at': now,
            'admin_validated_by': user.get('email'),
            'admin_note': note,
            'updated_at': now,
        }},
    )

    await create_notification(
        record['user_id'],
        'Desbloqueo 40% rechazado',
        f"El comprobante enviado no pudo ser validado. Motivo: {note}. Puedes iniciar una nueva solicitud cuando lo desees.",
    )
    fresh = await db.partial_withdraw_unlocks.find_one({'id': unlock_id}, {'_id': 0})
    return {'ok': True, 'request': fresh}
