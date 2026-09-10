"""Publicaciones oficiales de la Comunidad.

Solo el administrador crea/edita/responde/fija/oculta. Identidad pública fija:
'Supports Lionsbit · ✓ Soporte oficial'. Autopublicación programada (N por día
hasta un máximo configurable) gestionada por scheduler.
"""
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from config import db
from services.auth import get_current_user, get_admin_user

router = APIRouter()

AUTHOR = 'Supports Lionsbit'
BADGE = '✓ Soporte oficial'
SETTINGS_ID = 'community_autopost'


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def get_autopost_settings() -> dict:
    doc = await db.platform_settings.find_one({'id': SETTINGS_ID}, {'_id': 0})
    return doc or {'id': SETTINGS_ID, 'enabled': True, 'daily_count': 2, 'max_posts': 100}


def _public_post(p: dict) -> dict:
    return {
        'id': p['id'], 'body': p['body'], 'pinned': bool(p.get('pinned')),
        'author': AUTHOR, 'badge': BADGE,
        'published_at': p.get('published_at') or p.get('publish_at'),
        'replies': [{'id': r['id'], 'body': r['body'], 'author': AUTHOR, 'badge': BADGE,
                     'created_at': r.get('created_at')} for r in (p.get('replies') or [])],
    }


# ══════════════ Usuario (solo lectura) ══════════════

@router.get('/community/posts')
async def list_public_posts(limit: int = Query(50, le=100), user: dict = Depends(get_current_user)):
    rows = await db.community_posts.find({'status': 'published'}, {'_id': 0}).to_list(200)
    rows.sort(key=lambda p: (not p.get('pinned'), p.get('published_at') or ''), reverse=False)
    # pinned primero; dentro de cada grupo, más recientes primero
    pinned = sorted([p for p in rows if p.get('pinned')], key=lambda p: p.get('published_at') or '', reverse=True)
    normal = sorted([p for p in rows if not p.get('pinned')], key=lambda p: p.get('published_at') or '', reverse=True)
    out = (pinned + normal)[:limit]
    return {'posts': [_public_post(p) for p in out], 'author': AUTHOR, 'badge': BADGE}


# ══════════════ Admin ══════════════

@router.get('/admin/community-posts')
async def admin_list_posts(status: Optional[str] = Query(None), admin: dict = Depends(get_admin_user)):
    q = {'status': status} if status else {}
    rows = await db.community_posts.find(q, {'_id': 0}).to_list(500)
    rows.sort(key=lambda p: p.get('publish_at') or p.get('published_at') or '', reverse=False)
    settings = await get_autopost_settings()
    published = sum(1 for r in rows if r.get('status') == 'published') if not status else \
        await db.community_posts.count_documents({'status': 'published'})
    scheduled = await db.community_posts.count_documents({'status': 'scheduled'})
    hidden = await db.community_posts.count_documents({'status': 'hidden'})
    return {'posts': rows, 'settings': settings,
            'counts': {'published': published, 'scheduled': scheduled, 'hidden': hidden,
                       'max': settings.get('max_posts', 100)}}


class PostBody(BaseModel):
    body: str
    reply: Optional[str] = None
    publish_at: Optional[str] = None
    pinned: bool = False
    publish_now: bool = False


@router.post('/admin/community-posts')
async def admin_create_post(data: PostBody, admin: dict = Depends(get_admin_user)):
    if not data.body.strip():
        raise HTTPException(400, 'El texto de la publicación es obligatorio.')
    now = _now()
    publish_at = (data.publish_at or now)
    status = 'published' if data.publish_now or publish_at <= now else 'scheduled'
    doc = {
        'id': str(uuid.uuid4()), 'body': data.body.strip(), 'pinned': bool(data.pinned),
        'status': status, 'publish_at': publish_at,
        'published_at': now if status == 'published' else None,
        'auto_published': False,
        'replies': ([{'id': str(uuid.uuid4()), 'body': data.reply.strip(), 'created_at': now}]
                    if (data.reply or '').strip() else []),
        'created_at': now, 'updated_at': now, 'created_by': admin.get('email'),
    }
    await db.community_posts.insert_one(doc)
    doc.pop('_id', None)
    return {'ok': True, 'post': doc}


class PostEdit(BaseModel):
    body: Optional[str] = None
    publish_at: Optional[str] = None
    pinned: Optional[bool] = None
    status: Optional[str] = None  # published | scheduled | hidden


@router.put('/admin/community-posts/{post_id}')
async def admin_edit_post(post_id: str, data: PostEdit, admin: dict = Depends(get_admin_user)):
    p = await db.community_posts.find_one({'id': post_id}, {'_id': 0})
    if not p:
        raise HTTPException(404, 'Publicación no encontrada')
    updates = {'updated_at': _now()}
    if data.body is not None:
        if not data.body.strip():
            raise HTTPException(400, 'El texto no puede quedar vacío.')
        updates['body'] = data.body.strip()
    if data.publish_at is not None:
        updates['publish_at'] = data.publish_at
        if p['status'] == 'scheduled' and data.publish_at <= _now():
            updates['status'] = 'published'
            updates['published_at'] = _now()
    if data.pinned is not None:
        updates['pinned'] = bool(data.pinned)
    if data.status is not None:
        if data.status not in ('published', 'scheduled', 'hidden'):
            raise HTTPException(400, 'Estado inválido')
        updates['status'] = data.status
        if data.status == 'published' and not p.get('published_at'):
            updates['published_at'] = _now()
    await db.community_posts.update_one({'id': post_id}, {'$set': updates})
    fresh = await db.community_posts.find_one({'id': post_id}, {'_id': 0})
    return {'ok': True, 'post': fresh}


@router.post('/admin/community-posts/{post_id}/publish-now')
async def admin_publish_now(post_id: str, admin: dict = Depends(get_admin_user)):
    p = await db.community_posts.find_one({'id': post_id}, {'_id': 0})
    if not p:
        raise HTTPException(404, 'Publicación no encontrada')
    now = _now()
    await db.community_posts.update_one(
        {'id': post_id},
        {'$set': {'status': 'published', 'published_at': now, 'publish_at': now, 'updated_at': now}})
    return {'ok': True}


@router.delete('/admin/community-posts/{post_id}')
async def admin_delete_post(post_id: str, admin: dict = Depends(get_admin_user)):
    r = await db.community_posts.delete_one({'id': post_id})
    if r.deleted_count == 0:
        raise HTTPException(404, 'Publicación no encontrada')
    return {'ok': True}


class ReplyBody(BaseModel):
    body: str


@router.post('/admin/community-posts/{post_id}/replies')
async def admin_add_reply(post_id: str, data: ReplyBody, admin: dict = Depends(get_admin_user)):
    if not data.body.strip():
        raise HTTPException(400, 'La respuesta no puede estar vacía.')
    p = await db.community_posts.find_one({'id': post_id}, {'_id': 0, 'id': 1})
    if not p:
        raise HTTPException(404, 'Publicación no encontrada')
    reply = {'id': str(uuid.uuid4()), 'body': data.body.strip(), 'created_at': _now()}
    await db.community_posts.update_one({'id': post_id},
                                        {'$push': {'replies': reply}, '$set': {'updated_at': _now()}})
    return {'ok': True, 'reply': reply}


@router.put('/admin/community-posts/{post_id}/replies/{reply_id}')
async def admin_edit_reply(post_id: str, reply_id: str, data: ReplyBody, admin: dict = Depends(get_admin_user)):
    if not data.body.strip():
        raise HTTPException(400, 'La respuesta no puede estar vacía.')
    r = await db.community_posts.update_one(
        {'id': post_id, 'replies.id': reply_id},
        {'$set': {'replies.$.body': data.body.strip(), 'replies.$.updated_at': _now(), 'updated_at': _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, 'Respuesta no encontrada')
    return {'ok': True}


@router.delete('/admin/community-posts/{post_id}/replies/{reply_id}')
async def admin_delete_reply(post_id: str, reply_id: str, admin: dict = Depends(get_admin_user)):
    r = await db.community_posts.update_one(
        {'id': post_id}, {'$pull': {'replies': {'id': reply_id}}, '$set': {'updated_at': _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, 'Publicación no encontrada')
    return {'ok': True}


class SettingsBody(BaseModel):
    enabled: Optional[bool] = None
    daily_count: Optional[int] = None
    max_posts: Optional[int] = None


@router.put('/admin/community-posts-settings')
async def admin_update_settings(data: SettingsBody, admin: dict = Depends(get_admin_user)):
    updates = {'updated_at': _now(), 'updated_by': admin.get('email')}
    if data.enabled is not None:
        updates['enabled'] = bool(data.enabled)
    if data.daily_count is not None:
        if not (1 <= data.daily_count <= 20):
            raise HTTPException(400, 'Cantidad diaria fuera de rango (1-20).')
        updates['daily_count'] = int(data.daily_count)
    if data.max_posts is not None:
        if not (1 <= data.max_posts <= 1000):
            raise HTTPException(400, 'Límite máximo fuera de rango (1-1000).')
        updates['max_posts'] = int(data.max_posts)
    await db.platform_settings.update_one({'id': SETTINGS_ID}, {'$set': updates}, upsert=True)
    return {'ok': True, 'settings': await get_autopost_settings()}


# ══════════════ Autopublicación (scheduler) ══════════════

async def run_community_autopost() -> dict:
    settings = await get_autopost_settings()
    if not settings.get('enabled', True):
        return {'skipped': 'paused'}
    max_posts = int(settings.get('max_posts', 100))
    daily = int(settings.get('daily_count', 2))
    published_total = await db.community_posts.count_documents({'status': 'published'})
    if published_total >= max_posts:
        return {'skipped': 'max_reached', 'published_total': published_total}
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    published_today = await db.community_posts.count_documents(
        {'status': 'published', 'auto_published': True, 'published_at': {'$gte': today_start}})
    allowance = min(daily - published_today, max_posts - published_total)
    if allowance <= 0:
        return {'skipped': 'daily_quota', 'published_today': published_today}
    now = _now()
    due = await db.community_posts.find(
        {'status': 'scheduled', 'publish_at': {'$lte': now}},
        {'_id': 0, 'id': 1}).sort('publish_at', 1).to_list(allowance)
    published = 0
    for p in due:
        await db.community_posts.update_one(
            {'id': p['id']},
            {'$set': {'status': 'published', 'published_at': _now(),
                      'auto_published': True, 'updated_at': _now()}})
        published += 1
    if published:
        logging.info(f'community autopost: {published} publicaciones publicadas')
    return {'published': published}


# ══════════════ Siembra idempotente de contenido oficial ══════════════

SEED_POSTS = [
    ("Bienvenidos al canal oficial de la comunidad LIONSBIT. Aquí publicaremos información verificada sobre retiros, tiempos de procesamiento, transferencias y soporte.", "Si tiene dudas sobre su caso, abra un ticket desde Soporte citando su código PLB.", True),
    ("¿Cuánto tarda un retiro bancario? Una vez confirmado con el código de 6 dígitos y completado el abono de autorización, el tiempo estimado es de 2 a 5 días hábiles.", None, False),
    ("Las transferencias bancarias no tienen comisión: el monto neto que recibe es el monto completo convertido a la divisa de destino.", None, False),
    ("Retiros en Bitcoin: la dirección de destino se valida por formato y checksum (Legacy, P2SH, SegWit y Taproot). La validación no confirma la identidad del propietario, revise siempre su dirección antes de confirmar.", "Recomendamos registrar su wallet en la lista blanca para agilizar futuras revisiones.", False),
    ("Lista blanca de wallets BTC: registre sus direcciones de confianza desde Retiro en Bitcoin → Mis wallets BTC. Las wallets aprobadas por el equipo se marcan como ★ de confianza.", None, False),
    ("Por su seguridad, al registrar una nueva wallet BTC o cambiar su contraseña se activa un bloqueo temporal de retiros de 48 horas.", "Puede solicitar una verificación adicional al equipo para levantar el bloqueo antes.", False),
    ("Resumen antes de retirar: antes de confirmar cualquier retiro verá una pantalla con el desglose completo (monto, destino, comisiones de red si aplican y el neto a recibir).", None, False),
    ("¿Qué documentación puede requerirse para un retiro? Documento de identidad vigente y, en algunos casos, comprobante de titularidad de la cuenta bancaria de destino.", None, False),
    ("Los retiros grandes pueden dividirse en tramos programados de hasta €15,000 por tramo mediante un Plan de Retiro, sujeto a aprobación del equipo.", None, False),
    ("Cotización BTC: usamos precios de mercado en vivo (CoinGecko) y la comisión de red se estima con mempool.space al momento de la solicitud.", None, False),
    ("Verificación de envíos BTC: cada envío incluye su TXID verificable públicamente en mempool.space desde su panel.", None, False),
    ("Recordatorio: LIONSBIT nunca le pedirá su contraseña ni códigos por teléfono, WhatsApp o redes sociales. Toda comunicación oficial llega por email o por este panel.", None, True),
    ("¿Olvidó su contraseña? Use la opción 'Olvidaste tu contraseña' en el login. Tras el cambio, los retiros quedan pausados 48 h como medida de seguridad.", None, False),
    ("El Resumen Semanal por email recopila los retiros completados y las preguntas destacadas de la semana. Puede activarlo o silenciarlo desde su perfil.", None, False),
    ("Preguntas sobre retiros en vivo: puede realizar hasta 3 preguntas por retiro publicado en Retiros Recientes. Las respuestas oficiales aparecen como 'Respuesta'.", None, False),
    ("Tiempos de acreditación SEPA: una vez emitida la transferencia, la mayoría de bancos españoles acreditan en 24-48 h hábiles.", None, False),
    ("¿Emitimos certificados bancarios? Sí: puede solicitar un certificado de saldo o de movimientos desde la sección Certificados, con firma y referencia verificable.", None, False),
    ("Cuenta Multidivisa: puede mantener saldo en EUR, USD y otras divisas, y convertir entre ellas antes de retirar a su banco local.", None, False),
    ("Todos los abonos en cripto se monitorizan on-chain: cuando su pago alcanza las confirmaciones requeridas, el sistema avanza su expediente automáticamente y le notifica.", None, False),
    ("Horario de soporte: nuestro equipo responde tickets de lunes a viernes de 9:00 a 18:00 (CET). Los tickets se atienden por orden de llegada citando su código PLB.", None, False),
    ("Seguridad de sesión: cada inicio de sesión nuevo genera una notificación por email. Si no reconoce un acceso, cambie su contraseña de inmediato y contacte a soporte.", None, False),
    ("¿Por qué mi retiro está 'En revisión'? Es una etapa estándar de cumplimiento donde verificamos el abono y los datos de destino. Duración habitual: 1-3 horas laborables.", None, False),
    ("IBAN: validamos automáticamente el formato y la entidad de su IBAN al solicitar un retiro bancario para evitar rechazos por datos incorrectos.", None, False),
    ("Consejo BTC: las direcciones SegWit (bc1q...) suelen tener comisiones de red más bajas que las Legacy (1...).", None, False),
    ("Su código de caso PLB identifica cada operación (retiros, certificados, tickets). Cítelo en cualquier contacto con soporte para una atención más rápida.", None, False),
    ("Estados de un retiro Bitcoin: Solicitado → Pendiente de abono → Pendiente de validación → En revisión → Aprobado → Procesando → Enviado → Completado.", None, False),
    ("Las notificaciones de la campana y los emails de etapa le informan en tiempo real de cada avance de su retiro: solicitado, aprobado, enviado y confirmado.", None, False),
    ("Mantenimientos programados: cualquier ventana de mantenimiento se anunciará en este canal con al menos 24 h de antelación.", None, False),
    ("Fiscalidad: puede descargar su documentación fiscal desde la sección Documentos Fiscales para su declaración anual.", None, False),
    ("Gracias por formar parte de la comunidad LIONSBIT. Este canal es informativo y solo el equipo oficial puede publicar en él.", None, False),
]


async def ensure_community_posts_seed():
    """Siembra 30 publicaciones oficiales (2/día) + configuración inicial. Idempotente."""
    if await db.community_posts.count_documents({}) > 0:
        return
    now = datetime.now(timezone.utc)
    docs = []
    for i, (body, reply, pinned) in enumerate(SEED_POSTS):
        day = i // 2
        hour, minute = (9, 30) if i % 2 == 0 else (16, 0)
        publish_dt = (now + timedelta(days=day)).replace(hour=hour, minute=minute, second=0, microsecond=0)
        is_today_first = day == 0
        published = is_today_first  # las 2 del día 0 se publican al arrancar
        docs.append({
            'id': str(uuid.uuid4()), 'body': body, 'pinned': pinned,
            'status': 'published' if published else 'scheduled',
            'publish_at': publish_dt.isoformat(),
            'published_at': now.isoformat() if published else None,
            'auto_published': published,
            'replies': ([{'id': str(uuid.uuid4()), 'body': reply, 'created_at': now.isoformat()}] if reply else []),
            'created_at': now.isoformat(), 'updated_at': now.isoformat(), 'created_by': 'seed',
        })
    await db.community_posts.insert_many(docs)
    await db.platform_settings.update_one(
        {'id': SETTINGS_ID},
        {'$set': {'enabled': True, 'daily_count': 2, 'max_posts': 100, 'updated_at': now.isoformat()}},
        upsert=True)
    logging.info(f'community posts seed: {len(docs)} publicaciones oficiales creadas')
