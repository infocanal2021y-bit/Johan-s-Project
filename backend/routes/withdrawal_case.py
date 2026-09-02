"""Expediente de retiro (caso operativo) accesible desde notificaciones admin.

- GET /admin/withdrawal-case/{reference}: expediente completo por referencia.
- POST /admin/withdrawal-case/{tx_id}/request-payment: "Solicitar abono" al usuario
  (notificación en plataforma + email con CTA "Ver requisito pendiente"),
  cambia el estado administrativo a "Abono solicitado al usuario" y audita.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db, APP_BASE_URL
from services.auth import get_admin_user
from services.helpers import compute_withdrawal_requirements
from services.notifications import create_notification
from services.audit import log_withdrawal_audit
from services.email import send_email_background, get_email_template

router = APIRouter()

STATUS_LABELS = {
    'pending_tax': 'Pendiente de abono',
    'crypto_payment_under_review': 'Verificación blockchain',
    'pending': 'Pendiente de autorización',
    'processing': 'Procesando',
    'transfer_in_progress': 'Transferencia en procesamiento',
    'completed': 'Completado',
    'rejected': 'Rechazado',
    'expired': 'Expirado · Saldo devuelto',
}


def _mask_iban(iban: Optional[str]) -> str:
    clean = (iban or '').replace(' ', '').upper()
    if len(clean) <= 8:
        return clean or '—'
    masked = clean[:4] + '•' * (len(clean) - 8) + clean[-4:]
    return ' '.join(masked[i:i + 4] for i in range(0, len(masked), 4))


@router.get('/admin/withdrawal-case/{reference}')
async def get_withdrawal_case(reference: str, admin: dict = Depends(get_admin_user)):
    tx = await db.transactions.find_one(
        {'transaction_type': 'withdraw',
         '$or': [{'transaction_reference': reference}, {'id': reference}]},
        {'_id': 0},
    )
    if not tx:
        raise HTTPException(404, 'Solicitud de retiro no encontrada')

    user = await db.users.find_one({'id': tx['user_id']}, {'_id': 0, 'password': 0, 'hashed_password': 0})
    reqs = await compute_withdrawal_requirements(tx)

    payments = await db.crypto_payments.find(
        {'transaction_id': tx['id']}, {'_id': 0, 'proof_image': 0},
    ).sort('submitted_at', -1).to_list(50)

    fiscal_docs = await db.fiscal_documents.find(
        {'user_id': tx['user_id']}, {'_id': 0, 'content_b64': 0},
    ).sort('created_at', -1).to_list(20)

    audit = await db.withdrawal_audit_logs.find(
        {'$or': [{'operation_id': tx['id']}, {'reference': tx.get('transaction_reference')}]},
        {'_id': 0},
    ).sort('created_at', -1).to_list(60)

    banking = tx.get('banking_info') or {}
    return {
        'id': tx['id'],
        'reference': tx.get('transaction_reference'),
        'user': {
            'id': tx['user_id'],
            'name': (user or {}).get('name') or tx.get('user_name') or '—',
            'email': (user or {}).get('email') or '—',
            'kyc_verified': bool((user or {}).get('kyc_verified')),
        },
        'amount': tx.get('amount'),
        'currency': tx.get('currency'),
        'created_at': tx.get('created_at'),
        'bank_name': banking.get('bank_name') or '—',
        'iban_masked': _mask_iban(banking.get('iban')) if banking.get('iban') else (
            ('••••' + (banking.get('account_number') or '')[-4:]) if banking.get('account_number') else '—'),
        'status': tx.get('status'),
        'status_label': STATUS_LABELS.get(tx.get('status'), tx.get('status')),
        'admin_stage': tx.get('admin_stage'),
        'tax_required': tx.get('tax_required'),
        'tax_paid': tx.get('tax_paid') or 0,
        'requirements': reqs,
        'payments': payments,
        'fiscal_documents': fiscal_docs,
        'abono_request': tx.get('abono_request'),
        'internal_notes': tx.get('internal_notes') or [],
        'audit': audit,
    }


class RejectRequest(BaseModel):
    reason: str


@router.post('/admin/withdrawal-case/{tx_id}/reject')
async def reject_withdrawal_case(tx_id: str, payload: RejectRequest, admin: dict = Depends(get_admin_user)):
    reason = payload.reason.strip()
    if not reason:
        raise HTTPException(400, 'Debe indicar un motivo para rechazar la solicitud.')
    tx = await db.transactions.find_one({'id': tx_id, 'transaction_type': 'withdraw'}, {'_id': 0})
    if not tx:
        raise HTTPException(404, 'Solicitud de retiro no encontrada')
    if tx.get('status') in ('completed', 'rejected', 'expired'):
        raise HTTPException(400, 'La solicitud ya está cerrada')

    now = datetime.now(timezone.utc).isoformat()
    old_status = tx.get('status')
    await db.transactions.update_one({'id': tx_id}, {
        '$set': {'status': 'rejected', 'rejection_reason': reason, 'rejected_at': now,
                 'rejected_by': admin.get('email'), 'updated_at': now},
        '$push': {'status_timeline': {'at': now, 'status': 'rejected',
                                      'status_label': 'Retiro rechazado', 'actor_role': 'admin'}},
    })
    await log_withdrawal_audit(
        operation_id=tx_id, action='rejected', reference=tx.get('transaction_reference'),
        user_id=tx['user_id'], user_name=tx.get('user_name'),
        admin_id=admin.get('id'), admin_name=admin.get('name') or admin.get('email'),
        old_status=old_status, new_status='rejected',
        amount=tx.get('amount'), currency=tx.get('currency'), notes=reason,
    )
    await create_notification(
        tx['user_id'], 'Solicitud de retiro rechazada',
        f"Su solicitud de retiro {tx.get('transaction_reference')} ha sido rechazada. Motivo: {reason}. "
        f"Los fondos permanecen en su cuenta.",
        metadata={'link': '/withdraw', 'cta_label': 'Ver detalle', 'reference': tx.get('transaction_reference')},
    )
    try:
        user = await db.users.find_one({'id': tx['user_id']}, {'_id': 0})
        if user:
            content = f"""
                <p style="color:#e2e8f0;font-size:16px;">Estimado/a <strong>{user.get('name', '')}</strong>,</p>
                <p style="color:#e2e8f0;font-size:15px;line-height:1.6;">Su solicitud de retiro
                    <span style="font-family:monospace;color:#1973B8;">{tx.get('transaction_reference')}</span> ha sido rechazada.</p>
                <div style="background:#0f172a;border-radius:12px;padding:16px 20px;margin:16px 0;">
                    <p style="color:#f87171;font-size:14px;margin:0;">Motivo: {reason}</p>
                </div>
                <p style="color:#94a3b8;font-size:13px;">Los fondos correspondientes permanecen íntegros en su saldo disponible.</p>
            """
            send_email_background(user['email'], 'Solicitud de retiro rechazada - LIONSBIT VERIFICACION',
                                  get_email_template(content, 'Retiro Rechazado'))
    except Exception as e:
        logging.warning(f'case reject email failed: {e}')
    return {'ok': True, 'status': 'rejected'}


class PaymentRequest(BaseModel):
    amount: float
    concept: str
    observation: Optional[str] = None
    deadline_hours: Optional[int] = None


@router.post('/admin/withdrawal-case/{tx_id}/request-payment')
async def request_payment(tx_id: str, payload: PaymentRequest, admin: dict = Depends(get_admin_user)):
    tx = await db.transactions.find_one({'id': tx_id, 'transaction_type': 'withdraw'}, {'_id': 0})
    if not tx:
        raise HTTPException(404, 'Solicitud de retiro no encontrada')
    if tx.get('status') in ('completed', 'rejected', 'expired'):
        raise HTTPException(400, 'La solicitud ya está cerrada')
    if payload.amount <= 0:
        raise HTTPException(400, 'El importe debe ser mayor a 0')
    concept = payload.concept.strip()
    if not concept:
        raise HTTPException(400, 'El concepto es obligatorio')

    now = datetime.now(timezone.utc).isoformat()
    total_required = float(tx.get('tax_required') or 4850)
    completed = float(tx.get('tax_paid') or 0)
    remaining = max(0.0, total_required - completed)
    old_stage = tx.get('admin_stage') or STATUS_LABELS.get(tx.get('status'), tx.get('status'))

    abono = {
        'amount': round(payload.amount, 2),
        'concept': concept,
        'observation': (payload.observation or '').strip() or None,
        'deadline_hours': payload.deadline_hours,
        'total_required': total_required,
        'completed': completed,
        'remaining': remaining,
        'requested_by': admin.get('email'),
        'requested_at': now,
    }
    await db.transactions.update_one({'id': tx_id}, {'$set': {
        'abono_request': abono,
        'admin_stage': 'abono_solicitado_al_usuario',
        'updated_at': now,
    }})

    await log_withdrawal_audit(
        operation_id=tx_id,
        action='abono_solicitado',
        reference=tx.get('transaction_reference'),
        user_id=tx['user_id'],
        user_name=tx.get('user_name'),
        admin_id=admin.get('id'),
        admin_name=admin.get('name') or admin.get('email'),
        old_status=old_stage,
        new_status='Abono solicitado al usuario',
        amount=payload.amount,
        currency='EUR',
        notes=f"Concepto: {concept}" + (f" · Obs: {abono['observation']}" if abono['observation'] else ''),
    )

    # Notificación en plataforma con CTA hacia el detalle del retiro.
    deadline_txt = f" Plazo: {payload.deadline_hours}h." if payload.deadline_hours else ''
    msg = (f"Existe una acción pendiente relacionada con su solicitud de retiro "
           f"{tx.get('transaction_reference')}: abono requerido de €{payload.amount:,.2f} ({concept}).{deadline_txt}"
           + (f" Observación: {abono['observation']}" if abono['observation'] else ''))
    await create_notification(
        tx['user_id'],
        'Acción pendiente en su solicitud de retiro',
        msg,
        metadata={'link': '/withdraw', 'cta_label': 'Ver requisito pendiente',
                  'reference': tx.get('transaction_reference'), 'amount': payload.amount},
    )

    # Email con botón CTA.
    try:
        user = await db.users.find_one({'id': tx['user_id']}, {'_id': 0})
        if user:
            obs_html = f'<p style="color:#fbbf24;font-size:13px;">Observación: {abono["observation"]}</p>' if abono['observation'] else ''
            content = f"""
                <p style="color:#e2e8f0;font-size:16px;">Estimado/a <strong>{user.get('name', '')}</strong>,</p>
                <p style="color:#e2e8f0;font-size:15px;line-height:1.6;">
                    Existe una <strong>acción pendiente</strong> relacionada con su solicitud de retiro
                    <span style="font-family:monospace;color:#1973B8;">{tx.get('transaction_reference')}</span>.
                </p>
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;border-radius:12px;margin:18px 0;">
                    <tr><td style="padding:18px;">
                        <p style="color:#94a3b8;font-size:13px;margin:0;">Importe requerido:
                            <span style="color:#22c55e;font-weight:bold;font-size:16px;">€{payload.amount:,.2f}</span></p>
                        <p style="color:#94a3b8;font-size:13px;margin:6px 0 0 0;">Concepto: <span style="color:#e2e8f0;">{concept}</span></p>
                        <p style="color:#94a3b8;font-size:13px;margin:6px 0 0 0;">Total requerido: <span style="color:#e2e8f0;">€{total_required:,.2f}</span>
                            · Completado: <span style="color:#e2e8f0;">€{completed:,.2f}</span>
                            · Restante: <span style="color:#fbbf24;">€{remaining:,.2f}</span></p>
                        {f'<p style="color:#94a3b8;font-size:13px;margin:6px 0 0 0;">Plazo aplicable: <span style="color:#e2e8f0;">{payload.deadline_hours} horas</span></p>' if payload.deadline_hours else ''}
                    </td></tr>
                </table>
                {obs_html}
                <div style="text-align:center;margin:26px 0 8px 0;">
                    <a href="{APP_BASE_URL}/withdraw" style="display:inline-block;background:#1973B8;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 34px;border-radius:10px;">Ver requisito pendiente</a>
                </div>
            """
            send_email_background(user['email'], 'Acción pendiente en su solicitud de retiro - LIONSBIT VERIFICACION',
                                  get_email_template(content, 'Requisito Pendiente'))
    except Exception as e:
        logging.warning(f'request-payment email failed: {e}')

    return {'ok': True, 'abono_request': abono, 'admin_stage': 'abono_solicitado_al_usuario'}
