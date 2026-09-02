"""Documentación fiscal: subida por el usuario y revisión administrativa.

Flujo: usuario sube documento (base64, máx 8MB) → estado 'pending_review' →
notificación admin "Nueva documentación fiscal pendiente de revisión" →
admin acepta / rechaza / solicita de nuevo (motivo obligatorio al rechazar/solicitar)
→ notificación + email al usuario.
"""
import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from services.auth import get_current_user, get_admin_user
from services.notifications import create_admin_notification, create_notification
from services.email import send_email_background, get_email_template

router = APIRouter()

MAX_BYTES = 8 * 1024 * 1024
ALLOWED_MIMES = {'application/pdf', 'image/png', 'image/jpeg', 'image/webp'}

STATUS_LABELS = {
    'pending_review': 'Pendiente de revisión',
    'accepted': 'Aceptado',
    'rejected': 'Rechazado',
    'resubmission_requested': 'Se solicita nuevamente',
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _decode(content_b64: str) -> bytes:
    raw = content_b64 or ''
    if ',' in raw and raw.strip().lower().startswith('data:'):
        raw = raw.split(',', 1)[1]
    try:
        return base64.b64decode(raw, validate=True)
    except Exception:
        raise HTTPException(400, 'Contenido base64 inválido')


class FiscalUpload(BaseModel):
    name: str
    mime: str
    content_b64: str
    note: Optional[str] = None


class FiscalReview(BaseModel):
    action: str  # accept | reject | request_again
    observation: Optional[str] = None


@router.post('/fiscal-documents/upload')
async def upload_fiscal_document(payload: FiscalUpload, user: dict = Depends(get_current_user)):
    name = payload.name.strip()[:200]
    if not name:
        raise HTTPException(400, 'Nombre de archivo requerido')
    mime = payload.mime.strip()[:120]
    if mime not in ALLOWED_MIMES:
        raise HTTPException(400, 'Formato no permitido. Use PDF, PNG, JPG o WEBP.')
    data = _decode(payload.content_b64)
    if len(data) < 1:
        raise HTTPException(400, 'Archivo vacío')
    if len(data) > MAX_BYTES:
        raise HTTPException(400, 'Archivo demasiado grande (máx 8 MB)')

    doc = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'user_email': user['email'],
        'user_name': user.get('name') or user['email'],
        'name': name,
        'mime': mime,
        'size_bytes': len(data),
        'content_b64': base64.b64encode(data).decode('ascii'),
        'note': (payload.note or '').strip()[:500] or None,
        'status': 'pending_review',
        'observation': None,
        'reviewed_by': None,
        'reviewed_at': None,
        'created_at': _now(),
        'updated_at': _now(),
    }
    await db.fiscal_documents.insert_one(doc)

    await create_admin_notification(
        'fiscal_document',
        'Nueva documentación fiscal pendiente de revisión',
        f"{doc['user_name']} ({doc['user_email']}) ha subido el documento fiscal \"{name}\".",
        user_info={'name': doc['user_name'], 'email': doc['user_email']},
        metadata={'document_id': doc['id']},
    )
    doc.pop('content_b64')
    doc.pop('_id', None)
    return {'ok': True, 'document': doc}


@router.get('/fiscal-documents/mine')
async def my_fiscal_documents(user: dict = Depends(get_current_user)):
    docs = await db.fiscal_documents.find(
        {'user_id': user['id']}, {'_id': 0, 'content_b64': 0},
    ).sort('created_at', -1).to_list(100)
    return {'documents': docs, 'status_labels': STATUS_LABELS}


@router.get('/fiscal-documents/{doc_id}/content')
async def fiscal_document_content(doc_id: str, user: dict = Depends(get_current_user)):
    doc = await db.fiscal_documents.find_one({'id': doc_id}, {'_id': 0})
    if not doc:
        raise HTTPException(404, 'Documento no encontrado')
    if doc['user_id'] != user['id'] and user.get('role') != 'admin':
        raise HTTPException(403, 'Sin acceso a este documento')
    return {'name': doc['name'], 'mime': doc['mime'], 'content_b64': doc['content_b64']}


@router.get('/admin/fiscal-documents')
async def admin_list_fiscal_documents(status: Optional[str] = None, admin: dict = Depends(get_admin_user)):
    query = {}
    if status:
        query['status'] = status
    docs = await db.fiscal_documents.find(query, {'_id': 0, 'content_b64': 0}).sort('created_at', -1).to_list(300)
    counts = {}
    for s in STATUS_LABELS:
        counts[s] = await db.fiscal_documents.count_documents({'status': s})
    return {'documents': docs, 'counts': counts, 'status_labels': STATUS_LABELS}


@router.post('/admin/fiscal-documents/{doc_id}/review')
async def admin_review_fiscal_document(doc_id: str, payload: FiscalReview, admin: dict = Depends(get_admin_user)):
    doc = await db.fiscal_documents.find_one({'id': doc_id}, {'_id': 0, 'content_b64': 0})
    if not doc:
        raise HTTPException(404, 'Documento no encontrado')

    action = payload.action
    observation = (payload.observation or '').strip()[:1000]
    if action not in ('accept', 'reject', 'request_again'):
        raise HTTPException(400, 'Acción inválida')
    if action in ('reject', 'request_again') and not observation:
        raise HTTPException(400, 'Debe indicar un motivo/observación para esta acción.')

    new_status = {'accept': 'accepted', 'reject': 'rejected', 'request_again': 'resubmission_requested'}[action]
    await db.fiscal_documents.update_one({'id': doc_id}, {'$set': {
        'status': new_status,
        'observation': observation or None,
        'reviewed_by': admin.get('email'),
        'reviewed_at': _now(),
        'updated_at': _now(),
    }})

    # Notificar + email al usuario.
    titles = {
        'accepted': 'Documentación fiscal aceptada',
        'rejected': 'Documentación fiscal rechazada',
        'resubmission_requested': 'Se solicita nuevamente su documentación fiscal',
    }
    msgs = {
        'accepted': f'Su documento "{doc["name"]}" ha sido revisado y aceptado.',
        'rejected': f'Su documento "{doc["name"]}" ha sido rechazado. Motivo: {observation}',
        'resubmission_requested': f'Debe volver a subir su documento fiscal. Observación: {observation}',
    }
    await create_notification(doc['user_id'], titles[new_status], msgs[new_status])
    try:
        obs_html = f'<p style="color:#fbbf24;font-size:14px;"><strong>Observación:</strong> {observation}</p>' if observation else ''
        color = '#22c55e' if new_status == 'accepted' else '#f59e0b'
        content = f"""
            <p style="color:#e2e8f0;font-size:16px;">Estimado/a <strong>{doc['user_name']}</strong>,</p>
            <p style="color:#e2e8f0;font-size:15px;line-height:1.6;">{msgs[new_status]}</p>
            <div style="background:#0f172a;border-radius:12px;padding:18px;margin:18px 0;">
                <p style="color:#94a3b8;font-size:13px;margin:0;">Documento: <span style="color:#e2e8f0;">{doc['name']}</span></p>
                <p style="color:#94a3b8;font-size:13px;margin:6px 0 0 0;">Estado: <span style="color:{color};font-weight:bold;">{STATUS_LABELS[new_status]}</span></p>
            </div>
            {obs_html}
        """
        send_email_background(doc['user_email'], f"{titles[new_status]} - LIONSBIT VERIFICACION",
                              get_email_template(content, 'Documentación Fiscal'))
    except Exception as e:
        logging.warning(f'fiscal review email failed: {e}')

    fresh = await db.fiscal_documents.find_one({'id': doc_id}, {'_id': 0, 'content_b64': 0})
    return {'ok': True, 'document': fresh}
