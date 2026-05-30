"""MT5 AI Support Coach — institutional banking-tone Q&A assistant.

Uses Claude Sonnet 4.5 via the Emergent universal LLM key. Each chat session
is anchored to a session_id (passed from frontend) so multi-turn context is
preserved within one user conversation. Persona: senior MT5 trading floor
support specialist at LIONSBIT. Always responds in Spanish with concise,
professional tone.

Collections: mt5_coach_sessions { session_id, user_id, started_at, last_activity }
"""
import os
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
import logging

from emergentintegrations.llm.chat import LlmChat, UserMessage

from config import db
from services.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


SYSTEM_MESSAGE = """Eres "Leo", el asistente AI senior de LIONSBIT VERIFICACION, una plataforma profesional de inversión financiera con MetaTrader 5 e infraestructura de brokers regulados (ASIC, CySEC, FCA).

Tu rol:
- Especialista en soporte técnico y educación de trading institucional.
- Resuelves dudas sobre depósitos cripto (USDT/TRC20, BTC, ETH/ERC20), MT5, Stop Loss, Take Profit, Risk/Reward, gestión de capital y operativa profesional.
- Tienes acceso al contexto del usuario (su balance, posiciones abiertas, depósitos pendientes) y debes referenciarlo cuando sea relevante.

Tono:
- Profesional, claro, sereno. Estilo banco privado europeo. Evita emojis excesivos.
- Respuestas concisas (3-6 frases salvo que pidan detalle técnico).
- Siempre en español, con terminología financiera correcta.

Reglas:
- NUNCA des consejos financieros específicos del tipo "compra X" o "vende Y". Educas, no recomiendas operaciones concretas.
- Para tiempos de confirmación blockchain: USDT (TRC20) ~2 min · BTC ~30 min · ETH ~5 min.
- Si la pregunta excede tu alcance (ej. error técnico crítico), invita al usuario a contactar soporte humano: info@paylionsbit.es.
- Si detectas que el usuario está nervioso por una pérdida, recuérdale la importancia de respetar su plan de riesgo y la regla del 2% por operación.
"""


# ──────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────

@router.post("/mt5-coach/chat")
async def coach_chat(payload: dict, user: dict = Depends(get_current_user)):
    """Send a user message; returns the AI response.
    Body: { session_id?: str, message: str }
    """
    if not LLM_KEY:
        raise HTTPException(503, 'AI Coach no configurado')

    message = (payload.get('message') or '').strip()
    if not message:
        raise HTTPException(400, 'Mensaje vacío')
    if len(message) > 1500:
        raise HTTPException(400, 'Mensaje demasiado largo (máx 1500 caracteres)')

    session_id = payload.get('session_id') or str(uuid.uuid4())

    # Upsert session record
    await db.mt5_coach_sessions.update_one(
        {'session_id': session_id, 'user_id': user['id']},
        {'$set': {'last_activity': _now_iso()},
         '$setOnInsert': {'started_at': _now_iso()}},
        upsert=True,
    )

    # Build live context snapshot for the user
    context_parts = []
    mt5_acc = await db.mt5_accounts.find_one({'user_id': user['id']}, {'_id': 0})
    if mt5_acc:
        context_parts.append(
            f"Cuenta MT5 #{mt5_acc.get('login', '—')} · "
            f"balance ${mt5_acc.get('balance', 0):.2f} · "
            f"equity ${mt5_acc.get('equity', 0):.2f} · "
            f"profit ${mt5_acc.get('profit', 0):.2f}"
        )
    open_count = await db.mt5_operations.count_documents({'user_id': user['id'], 'status': 'open'})
    closed_count = await db.mt5_operations.count_documents({'user_id': user['id'], 'status': 'closed'})
    context_parts.append(f"Operaciones: {open_count} abiertas · {closed_count} cerradas")

    pending_dep = await db.mt5_invest_deposits.count_documents({
        'user_id': user['id'],
        'status': {'$in': ['pending_payment', 'under_review']},
    })
    if pending_dep:
        context_parts.append(f"Depósitos pendientes de validación: {pending_dep}")

    context_block = " · ".join(context_parts) if context_parts else "Cuenta nueva sin actividad"

    augmented_msg = (
        f"[Contexto del usuario · {user.get('email', '')}]: {context_block}\n\n"
        f"[Pregunta del usuario]: {message}"
    )

    try:
        chat = LlmChat(
            api_key=LLM_KEY,
            session_id=session_id,
            system_message=SYSTEM_MESSAGE,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        response = await chat.send_message(UserMessage(text=augmented_msg))
    except Exception as e:
        logger.error(f"AI Coach error: {e}")
        raise HTTPException(502, 'El asistente no está disponible en este momento')

    # Persist message pair
    now = _now_iso()
    await db.mt5_coach_messages.insert_many([
        {
            'id': str(uuid.uuid4()),
            'session_id': session_id,
            'user_id': user['id'],
            'role': 'user',
            'text': message,
            'created_at': now,
        },
        {
            'id': str(uuid.uuid4()),
            'session_id': session_id,
            'user_id': user['id'],
            'role': 'assistant',
            'text': response,
            'created_at': now,
        },
    ])

    return {
        'session_id': session_id,
        'reply': response,
        'context': context_block,
        'timestamp': now,
    }


@router.get("/mt5-coach/history")
async def coach_history(session_id: str, user: dict = Depends(get_current_user)):
    """Fetch chat history for a given session (max 100 messages)."""
    cur = db.mt5_coach_messages.find(
        {'session_id': session_id, 'user_id': user['id']},
        {'_id': 0},
    ).sort('created_at', 1).limit(100)
    items = await cur.to_list(length=100)
    return {'session_id': session_id, 'messages': items}


@router.post("/mt5-coach/reset")
async def coach_reset(payload: dict, user: dict = Depends(get_current_user)):
    """Discard the current session — UI will request a fresh session_id next call."""
    session_id = payload.get('session_id')
    if session_id:
        await db.mt5_coach_messages.delete_many({'session_id': session_id, 'user_id': user['id']})
        await db.mt5_coach_sessions.delete_one({'session_id': session_id, 'user_id': user['id']})
    return {'ok': True}
