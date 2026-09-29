"""Texto a voz (OpenAI TTS vía Emergent LLM Key) con caché en MongoDB."""
import base64
import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from emergentintegrations.llm.openai import OpenAITextToSpeech

from config import db
from services.auth import get_current_user

load_dotenv()
router = APIRouter()
log = logging.getLogger(__name__)

MODEL = 'tts-1'
DEFAULT_VOICE = 'onyx'
VOICES = [
    {'id': 'onyx', 'label': 'Onyx', 'desc': 'Grave, institucional'},
    {'id': 'sage', 'label': 'Sage', 'desc': 'Pausada, serena'},
    {'id': 'coral', 'label': 'Coral', 'desc': 'Cálida, cercana'},
    {'id': 'nova', 'label': 'Nova', 'desc': 'Enérgica'},
    {'id': 'alloy', 'label': 'Alloy', 'desc': 'Neutra'},
    {'id': 'echo', 'label': 'Echo', 'desc': 'Suave, calmada'},
    {'id': 'shimmer', 'label': 'Shimmer', 'desc': 'Brillante'},
    {'id': 'ash', 'label': 'Ash', 'desc': 'Clara, articulada'},
    {'id': 'fable', 'label': 'Fable', 'desc': 'Expresiva'},
]
VOICE_IDS = {v['id'] for v in VOICES}
MAX_CHARS = 4096

_tts: Optional[OpenAITextToSpeech] = None


def _client() -> OpenAITextToSpeech:
    global _tts
    if _tts is None:
        key = os.getenv('EMERGENT_LLM_KEY')
        if not key:
            raise HTTPException(503, 'Texto a voz no configurado (EMERGENT_LLM_KEY)')
        _tts = OpenAITextToSpeech(api_key=key)
    return _tts


class SpeakIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_CHARS)
    voice: Optional[str] = None
    speed: Optional[float] = Field(None, ge=0.5, le=2.0)


class PrefsIn(BaseModel):
    voice: Optional[str] = None
    speed: Optional[float] = Field(None, ge=0.5, le=2.0)
    enabled: Optional[bool] = None


def _prefs(user: dict) -> dict:
    p = user.get('tts_prefs') or {}
    return {'voice': p.get('voice') if p.get('voice') in VOICE_IDS else DEFAULT_VOICE,
            'speed': float(p.get('speed') or 1.0), 'enabled': p.get('enabled', True)}


@router.get('/tts/voices')
async def tts_voices(user: dict = Depends(get_current_user)):
    return {'model': MODEL, 'voices': VOICES, 'default_voice': DEFAULT_VOICE, 'prefs': _prefs(user)}


@router.put('/tts/preferences')
async def tts_set_prefs(body: PrefsIn, user: dict = Depends(get_current_user)):
    cur = _prefs(user)
    if body.voice is not None:
        if body.voice not in VOICE_IDS:
            raise HTTPException(400, 'Voz no válida')
        cur['voice'] = body.voice
    if body.speed is not None:
        cur['speed'] = float(body.speed)
    if body.enabled is not None:
        cur['enabled'] = body.enabled
    await db.users.update_one({'id': user['id']}, {'$set': {'tts_prefs': cur}})
    return {'ok': True, 'prefs': cur}


@router.post('/tts/speak')
async def tts_speak(body: SpeakIn, user: dict = Depends(get_current_user)):
    """Devuelve audio/mpeg. Cachea por (texto, voz, velocidad) para no regenerar."""
    prefs = _prefs(user)
    voice = body.voice if body.voice in VOICE_IDS else prefs['voice']
    speed = round(body.speed or prefs['speed'], 2)
    text = ' '.join(body.text.split())
    key = hashlib.sha256(f'{MODEL}|{voice}|{speed}|{text}'.encode()).hexdigest()

    cached = await db.tts_cache.find_one({'key': key}, {'_id': 0, 'audio_b64': 1})
    if cached:
        await db.tts_cache.update_one({'key': key}, {'$inc': {'hits': 1}, '$set': {'last_used_at': datetime.now(timezone.utc).isoformat()}})
        audio = base64.b64decode(cached['audio_b64'])
        return Response(content=audio, media_type='audio/mpeg', headers={'X-TTS-Cache': 'hit', 'Cache-Control': 'private, max-age=86400'})

    try:
        audio = await _client().generate_speech(text=text, model=MODEL, voice=voice, speed=speed, response_format='mp3')
    except ValueError as e:
        raise HTTPException(400, f'Texto no válido: {e}')
    except Exception as e:
        log.error(f'[tts] generation failed: {e}')
        raise HTTPException(502, 'No se pudo generar el audio en este momento')

    await db.tts_cache.update_one({'key': key}, {'$set': {
        'key': key, 'model': MODEL, 'voice': voice, 'speed': speed, 'chars': len(text),
        'audio_b64': base64.b64encode(audio).decode('ascii'), 'size': len(audio),
        'created_at': datetime.now(timezone.utc).isoformat(), 'hits': 0,
    }}, upsert=True)
    return Response(content=audio, media_type='audio/mpeg', headers={'X-TTS-Cache': 'miss', 'Cache-Control': 'private, max-age=86400'})
