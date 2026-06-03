"""Self-diagnostics — Diagnóstico Automático.

A single endpoint `GET /api/diagnostics/me` that scans the user's account and
returns a structured list of actionable findings. Reduces support load by
telling the user up-front *what they need to do next*.

Each finding has:
    severity: 'blocker' | 'warn' | 'info' | 'ok'
    category: 'kyc' | 'banking' | 'tax' | 'withdrawal' | 'vault' | 'profile'
    title, description, action_label?, action_path?

Response shape:
    {
        ok_count, warn_count, blocker_count,
        overall: 'all_clear' | 'minor' | 'action_required' | 'blocked',
        findings: [...],
        last_run_at,
    }
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from config import db
from services.auth import get_current_user


router = APIRouter()
log = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _f(severity: str, category: str, title: str, description: str,
       action_label: str = None, action_path: str = None, meta: dict = None) -> dict:
    return {
        'severity': severity,
        'category': category,
        'title': title,
        'description': description,
        'action_label': action_label,
        'action_path': action_path,
        'meta': meta or {},
    }


@router.get("/diagnostics/me")
async def my_diagnostics(user: dict = Depends(get_current_user)):
    """Run all health checks on the user's account and return a summary."""
    uid = user['id']
    findings: list[dict] = []

    # ── 1) PROFILE COMPLETENESS ──────────────────────────────────
    fresh = await db.users.find_one(
        {'id': uid},
        {'_id': 0, 'name': 1, 'phone': 1, 'country_code': 1, 'country_name': 1,
         'kyc_documents': 1, 'verification_status': 1, 'kyc_status': 1,
         'account_status': 1, 'email': 1},
    ) or {}

    missing_profile_fields = []
    if not fresh.get('name'):
        missing_profile_fields.append('Nombre completo')
    if not fresh.get('phone'):
        missing_profile_fields.append('Teléfono')
    if not fresh.get('country_code'):
        missing_profile_fields.append('País')

    if missing_profile_fields:
        findings.append(_f(
            'warn', 'profile',
            'Datos personales incompletos',
            f"Faltan: {', '.join(missing_profile_fields)}. Completa tu perfil para agilizar verificaciones.",
            action_label='Completar perfil',
            action_path='/account',
            meta={'missing': missing_profile_fields},
        ))

    # ── 2) KYC STATUS ────────────────────────────────────────────
    kyc_status = fresh.get('kyc_status') or fresh.get('verification_status') or 'unverified'
    has_docs = bool(fresh.get('kyc_documents'))

    if kyc_status in ('approved', 'verified', 'completed'):
        findings.append(_f('ok', 'kyc', 'KYC verificado', 'Tu identidad está verificada.'))
    elif kyc_status in ('pending', 'in_review', 'under_review'):
        findings.append(_f(
            'info', 'kyc',
            'KYC en revisión',
            'Tus documentos están siendo revisados por nuestro equipo. Te avisaremos por email.',
            action_label='Ver estado',
            action_path='/account',
        ))
    elif kyc_status in ('rejected', 'denied'):
        findings.append(_f(
            'blocker', 'kyc',
            'KYC rechazado',
            'Tu verificación fue rechazada. Revisa el motivo y vuelve a subir los documentos.',
            action_label='Volver a verificar',
            action_path='/account',
        ))
    elif not has_docs:
        findings.append(_f(
            'blocker', 'kyc',
            'Faltan documentos de identidad',
            'No has subido tu documentación KYC. Es obligatorio para retirar fondos y operar.',
            action_label='Subir documentos',
            action_path='/account',
        ))
    else:
        findings.append(_f(
            'warn', 'kyc',
            'Verificación incompleta',
            'Hay documentos pendientes de subir o de aprobar para finalizar tu KYC.',
            action_label='Continuar verificación',
            action_path='/account',
        ))

    # ── 3) ACCOUNT STATUS ────────────────────────────────────────
    if fresh.get('account_status') == 'suspended':
        findings.append(_f(
            'blocker', 'profile',
            'Cuenta suspendida',
            'Tu cuenta está temporalmente suspendida. Contacta al equipo de soporte.',
            action_label='Contactar soporte',
            action_path='/support',
        ))
    elif fresh.get('account_status') == 'restricted':
        findings.append(_f(
            'warn', 'profile',
            'Cuenta con restricciones',
            'Tu cuenta tiene restricciones temporales. Algunas operaciones pueden no estar disponibles.',
            action_label='Ver detalles',
            action_path='/support',
        ))

    # ── 4) TAX PENDING ───────────────────────────────────────────
    tax = await db.tax_payments.find_one(
        {'user_id': uid, 'status': {'$in': ['pending', 'partial', 'in_review']}},
        {'_id': 0, 'amount_paid_eur': 1, 'required_eur': 1, 'status': 1},
        sort=[('created_at', -1)],
    )
    if tax:
        paid = float(tax.get('amount_paid_eur', 0) or 0)
        required = float(tax.get('required_eur', 4850) or 4850)
        diff = max(0.0, required - paid)
        if diff > 0:
            findings.append(_f(
                'blocker', 'tax',
                f'Impuesto pendiente: €{diff:,.2f}',
                'Tienes un pago de impuestos pendiente que bloquea retiros completos. Puedes pagar la parte restante o iniciar la liberación parcial del 40%.',
                action_label='Resolver impuesto',
                action_path='/partial-unlock',
                meta={'amount_eur': round(diff, 2)},
            ))

    # ── 5) PARTIAL UNLOCK (40%) IN PROGRESS ──────────────────────
    pu = await db.partial_unlock_requests.find_one(
        {'user_id': uid, 'status': {'$in': ['pending_payment', 'in_review', 'approved']}},
        {'_id': 0, 'status': 1, 'max_withdraw_eur': 1, 'reference': 1},
        sort=[('created_at', -1)],
    )
    if pu:
        st = pu.get('status')
        if st == 'pending_payment':
            findings.append(_f(
                'warn', 'tax',
                'Pago de liberación parcial pendiente',
                f"Has iniciado la liberación del 40% (ref. {pu.get('reference', '—')}). Falta confirmar tu pago.",
                action_label='Subir comprobante',
                action_path='/partial-unlock',
            ))
        elif st == 'in_review':
            findings.append(_f(
                'info', 'tax',
                'Liberación parcial en revisión',
                'Tu comprobante está siendo revisado. Te notificaremos al aprobarlo.',
                action_label='Ver estado',
                action_path='/partial-unlock',
            ))
        elif st == 'approved':
            findings.append(_f(
                'ok', 'tax',
                'Liberación parcial aprobada',
                f'Tienes hasta €{pu.get("max_withdraw_eur", 0):,.2f} disponibles para retirar.',
                action_label='Retirar ahora',
                action_path='/wallet/bank-withdrawal',
            ))

    # ── 6) ACTIVE WITHDRAWAL STUCK AT 'awaiting_code' ────────────
    stuck = await db.bank_withdrawal_requests.find_one(
        {'user_id': uid, 'status': 'awaiting_code'},
        {'_id': 0, 'id': 1, 'reference': 1, 'masked_email': 1, 'created_at': 1},
        sort=[('created_at', -1)],
    )
    if stuck:
        findings.append(_f(
            'warn', 'withdrawal',
            'Retiro esperando código',
            f"Tienes un retiro (ref. {stuck.get('reference', '—')}) esperando que ingreses el código enviado a tu email.",
            action_label='Confirmar código',
            action_path='/wallet/bank-withdrawal',
            meta={'request_id': stuck.get('id')},
        ))

    # ── 7) ACTIVE WITHDRAWAL IN PROGRESS ─────────────────────────
    in_progress = await db.bank_withdrawal_requests.find_one(
        {'user_id': uid, 'status': {'$in': ['received', 'conversion_done',
                                            'compliance_review', 'transfer_in_progress']}},
        {'_id': 0, 'status': 1, 'reference': 1},
        sort=[('created_at', -1)],
    )
    if in_progress:
        findings.append(_f(
            'info', 'withdrawal',
            'Retiro en curso',
            f"Tu retiro (ref. {in_progress.get('reference', '—')}) está en estado {in_progress.get('status')}.",
            action_label='Ver detalle',
            action_path='/wallet/bank-withdrawal',
        ))

    # ── 8) BANK PROFILE / SAVED BANK ACCOUNTS ────────────────────
    has_saved_bank = await db.bank_withdrawal_requests.find_one(
        {'user_id': uid, 'status': {'$in': ['completed', 'received',
                                            'conversion_done', 'compliance_review',
                                            'transfer_in_progress']}},
        {'_id': 0, 'id': 1},
    )
    if not has_saved_bank and not stuck:
        findings.append(_f(
            'info', 'banking',
            'Aún no has registrado datos bancarios',
            'Cuando hagas tu primer retiro, podrás guardar tu cuenta bancaria para futuros envíos.',
            action_label='Iniciar retiro',
            action_path='/wallet/bank-withdrawal',
        ))

    # ── 9) VAULT DOCUMENTS PENDING CERTIFICATION ─────────────────
    pending_vault = await db.vault_documents.count_documents(
        {'user_id': uid, 'status': 'pending'},
    )
    if pending_vault > 0:
        findings.append(_f(
            'info', 'vault',
            f'{pending_vault} documento(s) pendiente(s) en el Vault',
            'Tus documentos están esperando ser certificados por el equipo de cumplimiento.',
            action_label='Ver Vault',
            action_path='/wallet/vault',
        ))

    # ── 10) BALANCE NOTICE ───────────────────────────────────────
    checking = await db.accounts.find_one(
        {'user_id': uid, 'account_type': 'checking'}, {'_id': 0, 'balance_eur': 1}
    )
    balance = float((checking or {}).get('balance_eur', 0) or 0)
    if balance > 10 and not stuck and not in_progress and kyc_status in ('approved', 'verified', 'completed'):
        findings.append(_f(
            'ok', 'withdrawal',
            f'Tienes €{balance:,.2f} disponibles para retirar',
            'Tu cuenta está verificada y con fondos. Puedes iniciar un retiro cuando quieras.',
            action_label='Retirar ahora',
            action_path='/wallet/bank-withdrawal',
        ))

    # ── Summary ──────────────────────────────────────────────────
    ok = sum(1 for f in findings if f['severity'] == 'ok')
    warn = sum(1 for f in findings if f['severity'] == 'warn')
    blocker = sum(1 for f in findings if f['severity'] == 'blocker')
    info = sum(1 for f in findings if f['severity'] == 'info')

    if blocker > 0:
        overall = 'blocked'
    elif warn > 0:
        overall = 'action_required'
    elif info > 0:
        overall = 'minor'
    else:
        overall = 'all_clear'

    # Sort: blockers first, then warn, then info, then ok
    order = {'blocker': 0, 'warn': 1, 'info': 2, 'ok': 3}
    findings.sort(key=lambda x: order.get(x['severity'], 99))

    # Persist a lightweight log for telemetry (no PII beyond user_id)
    try:
        await db.diagnostics_log.insert_one({
            'user_id': uid,
            'at': _now_iso(),
            'overall': overall,
            'counts': {'ok': ok, 'warn': warn, 'blocker': blocker, 'info': info},
        })
    except Exception as e:
        log.warning('[diag] log persist failed: %s', e)

    return {
        'overall': overall,
        'ok_count': ok,
        'warn_count': warn,
        'blocker_count': blocker,
        'info_count': info,
        'total': len(findings),
        'findings': findings,
        'last_run_at': _now_iso(),
    }
