"""Preguntas y respuestas públicas sobre Retiros Recientes.

- Usuarios registrados: máx 3 preguntas por retiro.
- Las respuestas se escriben desde el panel admin pero públicamente se muestran
  solo como "Respuesta" (admin_id es interno, nunca se expone).
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from config import db
from services.auth import get_current_user, get_admin_user
from services.notifications import create_notification, create_admin_notification

router = APIRouter()

MAX_QUESTIONS_PER_WITHDRAWAL = 3


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _public_name(name: str) -> str:
    parts = (name or 'Cliente').strip().split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[1][0].upper()}."
    return parts[0] if parts else 'Cliente'


def _public_q(q: dict) -> dict:
    reply = q.get('reply')
    return {
        'question_id': q['id'],
        'withdrawal_id': q['withdrawal_id'],
        'user_public_name': _public_name(q.get('user_name')),
        'message': q['message'],
        'created_at': q['created_at'],
        'status': q['status'],
        'featured': bool(q.get('featured')),
        'reply': {'message': reply['message'], 'created_at': reply['created_at']} if reply else None,
    }


class QuestionCreate(BaseModel):
    withdrawal_id: str
    message: str


@router.post('/recent-withdrawals/questions')
async def create_question(payload: QuestionCreate, user: dict = Depends(get_current_user)):
    message = payload.message.strip()[:500]
    if not message:
        raise HTTPException(400, 'La pregunta no puede estar vacía')
    tx = await db.transactions.find_one(
        {'id': payload.withdrawal_id, 'transaction_type': 'withdraw'}, {'_id': 0})
    if not tx:
        raise HTTPException(404, 'Retiro no encontrado')

    count = await db.withdrawal_questions.count_documents({
        'withdrawal_id': payload.withdrawal_id, 'user_id': user['id'],
        'status': {'$ne': 'deleted'},
    })
    if count >= MAX_QUESTIONS_PER_WITHDRAWAL:
        raise HTTPException(429, f'Máximo {MAX_QUESTIONS_PER_WITHDRAWAL} preguntas por retiro.')

    q = {
        'id': str(uuid.uuid4()),
        'withdrawal_id': payload.withdrawal_id,
        'withdrawal_reference': tx.get('transaction_reference'),
        'user_id': user['id'],
        'user_name': user.get('name') or user['email'],
        'user_email': user['email'],
        'target_user_id': tx['user_id'],
        'target_user_name': tx.get('user_name') or '',
        'amount': tx.get('amount'),
        'currency': tx.get('currency'),
        'message': message,
        'status': 'pending',
        'reply': None,
        'created_at': _now(),
    }
    await db.withdrawal_questions.insert_one(q)
    await create_admin_notification(
        'withdrawal_question',
        'Nueva pregunta en Retiros Recientes',
        f"{q['user_name']} preguntó sobre el retiro de {q['target_user_name']} "
        f"({q['amount']} {q['currency']}): \"{message[:120]}\"",
        metadata={'question_id': q['id'], 'withdrawal_id': q['withdrawal_id']},
    )
    return {'ok': True, 'question': _public_q(q), 'remaining': MAX_QUESTIONS_PER_WITHDRAWAL - count - 1}


@router.get('/recent-withdrawals/{withdrawal_id}/questions')
async def list_questions(withdrawal_id: str, user: dict = Depends(get_current_user)):
    qs = await db.withdrawal_questions.find(
        {'withdrawal_id': withdrawal_id, 'status': {'$in': ['pending', 'answered']}},
        {'_id': 0},
    ).sort([('featured', -1), ('created_at', 1)]).to_list(50)
    my_count = await db.withdrawal_questions.count_documents({
        'withdrawal_id': withdrawal_id, 'user_id': user['id'], 'status': {'$ne': 'deleted'},
    })
    return {
        'questions': [_public_q(q) for q in qs],
        'my_count': my_count,
        'my_remaining': max(0, MAX_QUESTIONS_PER_WITHDRAWAL - my_count),
    }


# ── Admin ────────────────────────────────────────────────────────────────

@router.get('/admin/withdrawal-questions')
async def admin_list_questions(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    admin: dict = Depends(get_admin_user),
):
    query = {'status': {'$ne': 'deleted'}}
    if status in ('pending', 'answered', 'hidden'):
        query['status'] = status
    if search:
        import re
        rx = {'$regex': re.escape(search.strip()), '$options': 'i'}
        query['$or'] = [
            {'user_email': rx}, {'user_name': rx}, {'target_user_name': rx},
            {'withdrawal_reference': rx}, {'withdrawal_id': rx}, {'message': rx},
        ]
    qs = await db.withdrawal_questions.find(query, {'_id': 0}).sort('created_at', -1).to_list(300)
    counts = {
        'pending': await db.withdrawal_questions.count_documents({'status': 'pending'}),
        'answered': await db.withdrawal_questions.count_documents({'status': 'answered'}),
        'hidden': await db.withdrawal_questions.count_documents({'status': 'hidden'}),
        'total': await db.withdrawal_questions.count_documents({'status': {'$ne': 'deleted'}}),
    }
    return {'questions': qs, 'counts': counts}


class ReplyPayload(BaseModel):
    message: str


@router.post('/admin/withdrawal-questions/{question_id}/reply')
async def admin_reply(question_id: str, payload: ReplyPayload, admin: dict = Depends(get_admin_user)):
    message = payload.message.strip()[:1000]
    if not message:
        raise HTTPException(400, 'La respuesta no puede estar vacía')
    q = await db.withdrawal_questions.find_one({'id': question_id}, {'_id': 0})
    if not q or q['status'] == 'deleted':
        raise HTTPException(404, 'Pregunta no encontrada')

    is_edit = bool(q.get('reply'))
    reply = {
        'reply_id': (q.get('reply') or {}).get('reply_id') or str(uuid.uuid4()),
        'question_id': question_id,
        'admin_id': admin.get('id'),  # interno, nunca se expone públicamente
        'message': message,
        'created_at': (q.get('reply') or {}).get('created_at') or _now(),
        'updated_at': _now() if is_edit else None,
    }
    await db.withdrawal_questions.update_one(
        {'id': question_id},
        {'$set': {'reply': reply, 'status': 'answered', 'answered_at': _now()}},
    )
    if not is_edit:
        await create_notification(
            q['user_id'],
            'Tu pregunta en Retiros Recientes recibió una respuesta.',
            f"Tu pregunta \"{q['message'][:100]}\" sobre el retiro de {q.get('target_user_name', '')} "
            f"ya tiene respuesta.",
            metadata={'link': f"/community?withdrawal={q['withdrawal_id']}&question={question_id}",
                      'cta_label': 'Ver respuesta', 'question_id': question_id},
        )
    return {'ok': True, 'edited': is_edit}


@router.post('/admin/withdrawal-questions/{question_id}/feature')
async def admin_toggle_featured(question_id: str, admin: dict = Depends(get_admin_user)):
    """Destacar / quitar de destacados. Solo preguntas ya respondidas."""
    q = await db.withdrawal_questions.find_one({'id': question_id}, {'_id': 0})
    if not q or q['status'] == 'deleted':
        raise HTTPException(404, 'Pregunta no encontrada')
    new_val = not q.get('featured')
    if new_val and not q.get('reply'):
        raise HTTPException(400, 'Solo se pueden destacar preguntas que ya tienen respuesta.')
    await db.withdrawal_questions.update_one(
        {'id': question_id},
        {'$set': {'featured': new_val, 'featured_at': _now() if new_val else None}},
    )
    return {'ok': True, 'featured': new_val}


@router.post('/admin/withdrawal-questions/{question_id}/hide')
async def admin_hide(question_id: str, admin: dict = Depends(get_admin_user)):
    q = await db.withdrawal_questions.find_one({'id': question_id}, {'_id': 0})
    if not q:
        raise HTTPException(404, 'Pregunta no encontrada')
    new_status = 'hidden' if q['status'] != 'hidden' else ('answered' if q.get('reply') else 'pending')
    await db.withdrawal_questions.update_one({'id': question_id}, {'$set': {'status': new_status}})
    return {'ok': True, 'status': new_status}


@router.delete('/admin/withdrawal-questions/{question_id}')
async def admin_delete(question_id: str, admin: dict = Depends(get_admin_user)):
    res = await db.withdrawal_questions.update_one(
        {'id': question_id}, {'$set': {'status': 'deleted', 'deleted_at': _now()}})
    if res.matched_count == 0:
        raise HTTPException(404, 'Pregunta no encontrada')
    return {'ok': True}
