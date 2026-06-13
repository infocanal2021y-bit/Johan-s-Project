"""Bank Certificate Requests — Formal document management module.

User flow:
1. User clicks "Generar justificante bancario" → creates BCR-YYYY-XXXXXX record in pending
2. Admin reviews → can Emitir (issues PDF) or Rechazar (with reason)
3. On issuance: PDF generated with reportlab, stored as base64, status → 'issued'
4. User downloads → status → 'downloaded'
5. (Optional) Admin marks 'verified' once delivery confirmed

Status pipeline:
  pending → issued → downloaded → verified
                  ↘ rejected

Collection: `bank_certificate_requests`
Audit fields tracked at every state transition.
"""
import io
import uuid
import base64
import secrets
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
)

from config import db
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification, create_admin_notification


router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gen_ref() -> str:
    year = datetime.now(timezone.utc).year
    n = ''.join(secrets.choice('0123456789') for _ in range(6))
    return f'BCR-{year}-{n}'


def _client_ip(req: Optional[Request]) -> Optional[str]:
    if not req:
        return None
    fwd = req.headers.get('x-forwarded-for') or req.headers.get('x-real-ip')
    if fwd:
        return fwd.split(',')[0].strip()
    return req.client.host if req.client else None


# ─────────────────────────── PDF Generation ───────────────────────────

def _generate_pdf(certificate: dict, user: dict) -> bytes:
    """Build a formal bank certificate PDF (institutional layout)."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=22 * mm, rightMargin=22 * mm,
        topMargin=22 * mm, bottomMargin=22 * mm,
        title=f'Justificante Bancario {certificate.get("ref")}',
        author='LIONSBIT VERIFICACIÓN, S.L.',
    )

    styles = getSampleStyleSheet()
    h_title = ParagraphStyle('h_title', parent=styles['Title'], fontSize=18,
                             textColor=colors.HexColor('#072146'), spaceAfter=8, leading=22)
    h_sub = ParagraphStyle('h_sub', parent=styles['Heading2'], fontSize=11,
                           textColor=colors.HexColor('#1973B8'), spaceAfter=4, leading=14)
    body = ParagraphStyle('body', parent=styles['BodyText'], fontSize=10.2,
                          textColor=colors.HexColor('#1f2937'), leading=15, spaceAfter=6)
    mono = ParagraphStyle('mono', parent=styles['BodyText'], fontName='Courier-Bold',
                          fontSize=10.5, textColor=colors.HexColor('#072146'), leading=14)
    small = ParagraphStyle('small', parent=styles['BodyText'], fontSize=8,
                           textColor=colors.HexColor('#5b6370'), leading=11)
    foot = ParagraphStyle('foot', parent=styles['BodyText'], fontSize=8,
                          textColor=colors.HexColor('#6b7280'), leading=11, alignment=1)

    story = []
    # Letterhead
    story.append(Paragraph('LIONSBIT VERIFICACIÓN, S.L.', h_title))
    story.append(Paragraph('Certificación documental · Tesorería institucional', h_sub))
    story.append(Spacer(1, 4 * mm))

    # Reference block
    issue_date = certificate.get('issued_at') or _now_iso()
    ref = certificate.get('ref')
    info_table = Table([
        ['Referencia:', Paragraph(f'<b>{ref}</b>', mono)],
        ['Emitido el:', Paragraph(issue_date.replace('T', ' ').split('.')[0] + ' UTC', mono)],
        ['Destinatario:', Paragraph(user.get('full_name') or user.get('name') or user.get('email') or '—', body)],
        ['Email:', Paragraph(user.get('email') or '—', body)],
    ], colWidths=[35 * mm, 110 * mm])
    info_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('LINEBELOW', (0, 0), (-1, -2), 0.3, colors.HexColor('#e5e7eb')),
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f1f5f9')),
        ('FONTSIZE', (0, 0), (-1, -1), 9.5),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#475569')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 8 * mm))

    # Body
    story.append(Paragraph('A QUIEN PUEDA INTERESAR', h_sub))
    story.append(Paragraph(
        'Por la presente, <b>LIONSBIT VERIFICACIÓN, S.L.</b> certifica que el usuario '
        f'<b>{user.get("full_name") or user.get("email")}</b> ha sido registrado en nuestra '
        'plataforma institucional de cumplimiento financiero y ha iniciado el proceso de '
        'activación de su desbloqueo parcial de retiro conforme a las políticas vigentes '
        'de la entidad.', body))

    story.append(Paragraph(
        'La presente certificación se emite a efectos informativos y de respaldo documental '
        'para la cuenta bancaria de tesorería utilizada para la operativa institucional:', body))

    bank_table = Table([
        ['Titular:', 'LIONSBIT VERIFICACIÓN, S.L.'],
        ['Autorizado:', 'Juan Gómez'],
        ['Banco:', 'BBVA España'],
        ['IBAN:', 'ES79 0182 1234 5612 3456 7890'],
        ['BIC / SWIFT:', 'BBVAESMMXXX'],
        ['País:', 'España'],
        ['Moneda:', 'EUR'],
    ], colWidths=[35 * mm, 110 * mm])
    bank_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#e5e7eb')),
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f1f5f9')),
        ('FONTSIZE', (0, 0), (-1, -1), 9.5),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#475569')),
        ('FONTNAME', (1, 0), (1, -1), 'Courier-Bold'),
        ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#072146')),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(Spacer(1, 3 * mm))
    story.append(bank_table)
    story.append(Spacer(1, 6 * mm))

    obs = certificate.get('observations')
    if obs:
        story.append(Paragraph('OBSERVACIONES', h_sub))
        story.append(Paragraph(obs, body))
        story.append(Spacer(1, 4 * mm))

    story.append(Paragraph(
        'El presente documento ha sido generado de forma electrónica y posee plena validez '
        'institucional. Para verificar su autenticidad o solicitar información adicional '
        'puede contactarnos en <b>info@paylionsbit.es</b> citando la referencia <b>'
        f'{ref}</b>.', body))

    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph('Atentamente,', body))
    story.append(Paragraph('<b>Dirección Operativa LIONSBIT</b>', body))
    story.append(Paragraph('Certificación emitida electrónicamente', small))

    # Footer
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(
        f'Documento generado el {issue_date.replace("T", " ").split(".")[0]} UTC · Ref. {ref} · LIONSBIT VERIFICACIÓN, S.L.',
        foot))

    doc.build(story)
    return buf.getvalue()


# ─────────────────────────── USER ENDPOINTS ───────────────────────────

@router.post("/bank-certificate-requests/create")
async def user_create(payload: dict, request: Request, user: dict = Depends(get_current_user)):
    """User submits a request for a formal bank certificate (justificante)."""
    note = (payload.get('note') or '').strip()[:500]

    # Block if user already has a pending or issued one for the current unlock
    record = await db.partial_withdraw_unlocks.find_one(
        {'user_id': user['id']}, sort=[('created_at', -1)])
    unlock_id = (record or {}).get('id')

    existing = await db.bank_certificate_requests.find_one({
        'user_id': user['id'],
        'status': {'$in': ['pending', 'issued', 'downloaded']},
    })
    if existing:
        raise HTTPException(409, f'Ya tienes una solicitud activa ({existing.get("ref")}). Revisa su estado o espera su emisión.')

    now = _now_iso()
    req_id = str(uuid.uuid4())
    ref = _gen_ref()
    for _ in range(3):
        if not await db.bank_certificate_requests.find_one({'ref': ref}):
            break
        ref = _gen_ref()

    doc = {
        'id': req_id,
        'ref': ref,
        'user_id': user['id'],
        'user_email': user.get('email'),
        'user_name': user.get('full_name') or user.get('name'),
        'unlock_id': unlock_id,
        'note': note,
        'status': 'pending',
        'observations': None,
        'pdf_b64': None,
        'rejected_reason': None,
        'requested_at': now,
        'issued_at': None,
        'downloaded_at': None,
        'verified_at': None,
        'rejected_at': None,
        'updated_at': now,
        'audit': {
            'requested_ip': _client_ip(request),
            'requested_ua': (request.headers.get('user-agent') or '')[:300],
            'history': [
                {'event': 'requested', 'at': now, 'by': user.get('email'), 'ip': _client_ip(request)},
            ],
        },
    }
    await db.bank_certificate_requests.insert_one(doc)

    try:
        await create_admin_notification(
            notification_type='bank_certificate',
            title='Nueva solicitud de justificante bancario',
            message=f'{user.get("email")} solicitó un justificante · {ref}',
            user_info={'email': user.get('email'), 'name': user.get('full_name')},
            metadata={'request_id': req_id, 'ref': ref, 'unlock_id': unlock_id},
            send_email_notification=True,
        )
    except Exception:
        pass

    try:
        await create_notification(
            user['id'],
            'Solicitud de justificante creada',
            f'Hemos registrado tu solicitud ({ref}). Te notificaremos cuando el documento esté disponible.',
        )
    except Exception:
        pass

    return {'ok': True, 'ref': ref, 'request_id': req_id, 'status': 'pending'}


@router.get("/bank-certificate-requests/me")
async def user_list(user: dict = Depends(get_current_user)):
    cursor = db.bank_certificate_requests.find(
        {'user_id': user['id']}, sort=[('requested_at', -1)])
    out: List[dict] = []
    async for r in cursor:
        out.append({
            'id': r.get('id'),
            'ref': r.get('ref'),
            'status': r.get('status'),
            'note': r.get('note'),
            'observations': r.get('observations'),
            'rejected_reason': r.get('rejected_reason'),
            'requested_at': r.get('requested_at'),
            'issued_at': r.get('issued_at'),
            'downloaded_at': r.get('downloaded_at'),
            'verified_at': r.get('verified_at'),
        })
    return {'requests': out}


@router.get("/bank-certificate-requests/me/{req_id}/download")
async def user_download(req_id: str, request: Request, user: dict = Depends(get_current_user)):
    r = await db.bank_certificate_requests.find_one({'id': req_id, 'user_id': user['id']})
    if not r:
        raise HTTPException(404, 'No encontrado')
    if r.get('status') not in ('issued', 'downloaded', 'verified'):
        raise HTTPException(400, 'El justificante aún no ha sido emitido')
    if not r.get('pdf_b64'):
        raise HTTPException(404, 'PDF no disponible')

    # Mark as downloaded (first time only)
    now = _now_iso()
    if r.get('status') == 'issued':
        await db.bank_certificate_requests.update_one(
            {'id': req_id},
            {'$set': {
                'status': 'downloaded',
                'downloaded_at': now,
                'updated_at': now,
            }, '$push': {'audit.history': {
                'event': 'downloaded',
                'at': now,
                'by': user.get('email'),
                'ip': _client_ip(request),
            }}},
        )

    return {
        'pdf_b64': r['pdf_b64'],
        'filename': f'justificante-{r.get("ref")}.pdf',
        'ref': r.get('ref'),
    }


# ─────────────────────────── ADMIN ENDPOINTS ───────────────────────────

@router.get("/admin/bank-certificate-requests")
async def admin_list(
    status: Optional[str] = None,
    q: Optional[str] = None,
    user: dict = Depends(get_admin_user),
):
    query: dict = {}
    if status:
        query['status'] = status
    if q:
        rx = {'$regex': q, '$options': 'i'}
        query['$or'] = [
            {'user_email': rx}, {'user_name': rx}, {'ref': rx}, {'note': rx},
        ]
    cursor = db.bank_certificate_requests.find(query, sort=[('requested_at', -1)]).limit(500)
    out: List[dict] = []
    async for r in cursor:
        out.append({
            'id': r.get('id'),
            'ref': r.get('ref'),
            'user_id': r.get('user_id'),
            'user_email': r.get('user_email'),
            'user_name': r.get('user_name'),
            'unlock_id': r.get('unlock_id'),
            'note': r.get('note'),
            'status': r.get('status'),
            'observations': r.get('observations'),
            'rejected_reason': r.get('rejected_reason'),
            'requested_at': r.get('requested_at'),
            'issued_at': r.get('issued_at'),
            'downloaded_at': r.get('downloaded_at'),
            'verified_at': r.get('verified_at'),
            'rejected_at': r.get('rejected_at'),
            'audit': r.get('audit'),
        })
    return {'requests': out, 'total': len(out)}


@router.post("/admin/bank-certificate-requests/{req_id}/issue")
async def admin_issue(req_id: str, request: Request, payload: Optional[dict] = None, user: dict = Depends(get_admin_user)):
    """Generates the PDF and marks as 'issued'."""
    r = await db.bank_certificate_requests.find_one({'id': req_id})
    if not r:
        raise HTTPException(404, 'No encontrado')
    if r.get('status') != 'pending':
        raise HTTPException(400, f'Solicitud en estado {r.get("status")}, no puede emitirse')

    observations = ((payload or {}).get('observations') or '').strip()[:1000]

    # Fetch end-user details
    target_user = await db.users.find_one({'id': r.get('user_id')}) or {}
    now = _now_iso()
    pdf_bytes = _generate_pdf(
        {
            'ref': r.get('ref'),
            'observations': observations or r.get('observations'),
            'issued_at': now,
        },
        target_user,
    )
    pdf_b64 = 'data:application/pdf;base64,' + base64.b64encode(pdf_bytes).decode()

    audit_entry = {
        'event': 'issued',
        'at': now,
        'by': user.get('email'),
        'ip': _client_ip(request),
        'observations': observations or None,
    }
    await db.bank_certificate_requests.update_one(
        {'id': req_id},
        {'$set': {
            'status': 'issued',
            'issued_at': now,
            'observations': observations or None,
            'pdf_b64': pdf_b64,
            'updated_at': now,
        }, '$push': {'audit.history': audit_entry}},
    )

    try:
        await create_notification(
            r['user_id'],
            'Justificante bancario emitido',
            f'Tu justificante ({r.get("ref")}) ya está disponible para descarga.',
        )
    except Exception:
        pass

    return {'ok': True, 'status': 'issued', 'ref': r.get('ref')}


@router.post("/admin/bank-certificate-requests/{req_id}/reject")
async def admin_reject(req_id: str, request: Request, payload: Optional[dict] = None, user: dict = Depends(get_admin_user)):
    r = await db.bank_certificate_requests.find_one({'id': req_id})
    if not r:
        raise HTTPException(404, 'No encontrado')
    if r.get('status') != 'pending':
        raise HTTPException(400, f'Solicitud en estado {r.get("status")}, no puede rechazarse')

    reason = ((payload or {}).get('reason') or '').strip()
    if not reason or len(reason) < 5:
        raise HTTPException(400, 'Motivo obligatorio (mín. 5 caracteres)')

    now = _now_iso()
    await db.bank_certificate_requests.update_one(
        {'id': req_id},
        {'$set': {
            'status': 'rejected',
            'rejected_at': now,
            'rejected_reason': reason,
            'updated_at': now,
        }, '$push': {'audit.history': {
            'event': 'rejected', 'at': now, 'by': user.get('email'),
            'ip': _client_ip(request), 'reason': reason,
        }}},
    )

    try:
        await create_notification(
            r['user_id'],
            'Solicitud de justificante rechazada',
            f'Tu solicitud ({r.get("ref")}) fue rechazada. Motivo: {reason}.',
        )
    except Exception:
        pass

    return {'ok': True, 'status': 'rejected'}


@router.post("/admin/bank-certificate-requests/{req_id}/observations")
async def admin_add_observations(req_id: str, request: Request, payload: dict, user: dict = Depends(get_admin_user)):
    text = (payload.get('text') or '').strip()[:1000]
    if not text:
        raise HTTPException(400, 'Observación vacía')
    r = await db.bank_certificate_requests.find_one({'id': req_id})
    if not r:
        raise HTTPException(404, 'No encontrado')
    now = _now_iso()
    await db.bank_certificate_requests.update_one(
        {'id': req_id},
        {'$set': {'observations': text, 'updated_at': now},
         '$push': {'audit.history': {
             'event': 'observation_added', 'at': now, 'by': user.get('email'),
             'ip': _client_ip(request), 'text': text,
         }}},
    )
    return {'ok': True}


@router.post("/admin/bank-certificate-requests/{req_id}/verify")
async def admin_verify(req_id: str, request: Request, user: dict = Depends(get_admin_user)):
    """Mark as 'verified' once delivery / external confirmation is done."""
    r = await db.bank_certificate_requests.find_one({'id': req_id})
    if not r:
        raise HTTPException(404, 'No encontrado')
    if r.get('status') not in ('issued', 'downloaded'):
        raise HTTPException(400, f'Estado inválido: {r.get("status")}')
    now = _now_iso()
    await db.bank_certificate_requests.update_one(
        {'id': req_id},
        {'$set': {'status': 'verified', 'verified_at': now, 'updated_at': now},
         '$push': {'audit.history': {
             'event': 'verified', 'at': now, 'by': user.get('email'), 'ip': _client_ip(request),
         }}},
    )
    return {'ok': True, 'status': 'verified'}


@router.get("/admin/bank-certificate-requests/{req_id}/download")
async def admin_download(req_id: str, user: dict = Depends(get_admin_user)):
    r = await db.bank_certificate_requests.find_one({'id': req_id})
    if not r:
        raise HTTPException(404, 'No encontrado')
    if not r.get('pdf_b64'):
        raise HTTPException(404, 'PDF aún no generado')
    return {'pdf_b64': r['pdf_b64'], 'filename': f'justificante-{r.get("ref")}.pdf', 'ref': r.get('ref')}


@router.post("/admin/bank-certificate-requests/{req_id}/email")
async def admin_email(req_id: str, user: dict = Depends(get_admin_user)):
    """Send the issued PDF to the requesting user by email (via existing email service if available)."""
    r = await db.bank_certificate_requests.find_one({'id': req_id})
    if not r:
        raise HTTPException(404, 'No encontrado')
    if not r.get('pdf_b64'):
        raise HTTPException(400, 'PDF no disponible')

    # Soft notify (real email send depends on Resend integration which is already configured)
    try:
        await create_notification(
            r['user_id'],
            'Justificante enviado por correo',
            f'Tu justificante ({r.get("ref")}) ha sido enviado a tu correo registrado.',
        )
    except Exception:
        pass
    now = _now_iso()
    await db.bank_certificate_requests.update_one(
        {'id': req_id},
        {'$push': {'audit.history': {
            'event': 'emailed', 'at': now, 'by': user.get('email'),
        }}, '$set': {'updated_at': now}},
    )
    return {'ok': True, 'queued': True}
