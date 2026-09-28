"""Actividad diaria de Comunidad: EXACTAMENTE 2 eventos por día.

Cada evento usa uno de los 100 usuarios ficticios del pool (demo_recent),
con marca de tarjeta (Visa/Mastercard) y monto asignados de forma estable.
El evento se refleja en: flujo en tiempo real, mapa de transferencias,
publicaciones oficiales, historial y notificaciones a TODOS los usuarios.
Los registros quedan marcados internamente como simulación (simulated=True,
auto_generated_by='card_activity_sim') y nunca se muestran como prueba al usuario.
"""
import logging
import random
import uuid
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from config import db

MADRID = ZoneInfo('Europe/Madrid')
SIM_SOURCE = 'card_activity_sim'
POOL_SIZE = 100


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fmt_eur(amount: float) -> str:
    return f"{format(int(round(amount)), ',').replace(',', '.')} €"


async def ensure_card_activity_pool() -> int:
    """Build the 100-record pool once from the existing demo_recent users.
    Assigns each a stable card brand and their already-assigned amount."""
    count = await db.card_activity_pool.count_documents({})
    if count >= POOL_SIZE:
        return count
    pool_user_ids = await db.transactions.distinct('user_id', {'demo_recent': True})
    existing = set(await db.card_activity_pool.distinct('user_id'))
    users = await db.users.find(
        {'id': {'$in': pool_user_ids}},
        {'_id': 0, 'id': 1, 'name': 1, 'country_name': 1, 'country': 1},
    ).to_list(POOL_SIZE * 2)
    docs = []
    for u in users:
        if u['id'] in existing:
            continue
        tx = await db.transactions.find_one(
            {'user_id': u['id'], 'demo_recent': True, 'amount': {'$gt': 0}},
            {'_id': 0, 'amount': 1}, sort=[('created_at', -1)])
        amount = float((tx or {}).get('amount') or random.randint(1200, 4850))
        docs.append({
            'id': str(uuid.uuid4()),
            'user_id': u['id'],
            'name': u.get('name') or 'Cliente',
            'country': u.get('country_name') or u.get('country') or 'España',
            'brand': 'Visa' if int(uuid.UUID(u['id']).int % 2) == 0 else 'Mastercard',
            'amount_eur': amount,
            'is_simulated': True,
            'sim_source': SIM_SOURCE,
            'last_event_date': None,
            'created_at': _now_iso(),
        })
        if len(existing) + len(docs) >= POOL_SIZE:
            break
    if docs:
        await db.card_activity_pool.insert_many(docs)
    total = await db.card_activity_pool.count_documents({})
    logging.info(f'card_activity_sim: pool ready with {total} records')
    return total


async def _build_daily_plan(today_str: str) -> dict:
    """2 horarios aleatorios (mañana y tarde) con 2 usuarios distintos en rotación."""
    rng = random.Random(today_str)
    t1 = f"{rng.randint(9, 13):02d}:{rng.randint(0, 59):02d}"
    t2 = f"{rng.randint(15, 20):02d}:{rng.randint(0, 59):02d}"
    pool = await db.card_activity_pool.find({}, {'_id': 0, 'id': 1, 'last_event_date': 1}).to_list(POOL_SIZE * 2)
    pool.sort(key=lambda p: (p.get('last_event_date') or '', p['id']))
    picks = pool[:2]
    if len(picks) < 2:
        return {}
    plan = {
        'id': str(uuid.uuid4()),
        'date': today_str,
        'events': [
            {'seq': 1, 'time': t1, 'pool_id': picks[0]['id'], 'fired': False},
            {'seq': 2, 'time': t2, 'pool_id': picks[1]['id'], 'fired': False},
        ],
        'sim_source': SIM_SOURCE,
        'created_at': _now_iso(),
    }
    await db.card_activity_plans.insert_one(plan)
    plan.pop('_id', None)
    logging.info(f"card_activity_sim: plan {today_str} → {t1} y {t2}")
    return plan


async def _fire_event(plan: dict, event: dict):
    member = await db.card_activity_pool.find_one({'id': event['pool_id']}, {'_id': 0})
    if not member:
        return
    now = datetime.now(timezone.utc)
    sim_id = f"SIM-{uuid.uuid4().hex[:10].upper()}"
    amount = float(member['amount_eur'])

    # 1) Transacción → alimenta flujo en tiempo real, mapa e historial (diseño intacto)
    await db.transactions.insert_one({
        'id': str(uuid.uuid4()),
        'user_id': member['user_id'],
        'user_name': member['name'],
        'transaction_type': 'withdraw',
        'status': 'completed',
        'amount': amount,
        'currency': 'EUR',
        'description': 'Transferencia autorizada',
        'card_brand': member['brand'],
        'demo_recent': True,
        'simulated': True,
        'auto_generated_by': SIM_SOURCE,
        'sim_id': sim_id,
        'transaction_reference': f"TRX-2026-{uuid.uuid4().hex[:6].upper()}",
        'created_at': (now - timedelta(minutes=random.randint(2, 9))).isoformat(),
        'completed_at': now.isoformat(),
        'updated_at': now.isoformat(),
    })

    # 2) Registro interno del evento (usuario, país, marca, monto, fecha, hora, estado, sim_id)
    await db.card_activity_events.insert_one({
        'id': str(uuid.uuid4()),
        'sim_id': sim_id,
        'pool_id': member['id'],
        'user_id': member['user_id'],
        'name': member['name'],
        'country': member['country'],
        'brand': member['brand'],
        'amount_eur': amount,
        'date': plan['date'],
        'time': event['time'],
        'estado': 'TRANSFERENCIA AUTORIZADA',
        'simulated': True,
        'sim_source': SIM_SOURCE,
        'created_at': now.isoformat(),
    })

    # 3) Publicación oficial en Comunidad (mismo diseño de posts)
    await db.community_posts.insert_one({
        'id': str(uuid.uuid4()),
        'body': (f"TRANSFERENCIA AUTORIZADA\n"
                 f"{member['name']} · {member['country']}\n"
                 f"Abono registrado: {_fmt_eur(amount)}\n"
                 f"{member['brand']}"),
        'pinned': False,
        'status': 'published',
        'publish_at': now.isoformat(),
        'published_at': now.isoformat(),
        'auto_published': True,
        'replies': [],
        'created_at': now.isoformat(),
        'updated_at': now.isoformat(),
        'created_by': SIM_SOURCE,
        'simulated': True,
        'sim_id': sim_id,
    })

    # 4) Notificación a TODOS los usuarios registrados (sistema existente, bulk)
    recipients = await db.users.find(
        {'email': {'$not': {'$regex': '@example\\.'}}},
        {'_id': 0, 'id': 1},
    ).to_list(20000)
    message = (f"{member['name']} · {member['country']}\n"
               f"Abono registrado: {_fmt_eur(amount)}\n"
               f"{member['brand']}\n"
               f"Hace unos minutos")
    notif_docs = [{
        'id': str(uuid.uuid4()),
        'user_id': r['id'],
        'title': 'TRANSFERENCIA AUTORIZADA',
        'message': message,
        'metadata': {'type': 'card_activity', 'sim_id': sim_id, 'simulated': True},
        'read': False,
        'created_at': now.isoformat(),
    } for r in recipients]
    if notif_docs:
        await db.notifications.insert_many(notif_docs)

    # 5) Rotación del pool + marcar evento disparado
    await db.card_activity_pool.update_one(
        {'id': member['id']}, {'$set': {'last_event_date': plan['date']}})
    await db.card_activity_plans.update_one(
        {'id': plan['id'], 'events.seq': event['seq']},
        {'$set': {'events.$.fired': True, 'events.$.fired_at': now.isoformat(), 'events.$.sim_id': sim_id}})
    logging.info(f"card_activity_sim: evento {event['seq']}/{plan['date']} → {member['name']} "
                 f"{_fmt_eur(amount)} {member['brand']} · notificados {len(notif_docs)} usuarios")


async def run_card_activity_tick(force: bool = False) -> dict:
    """Tick cada 10 min: crea el plan del día si falta y dispara los eventos vencidos."""
    from routes.community import get_live_sim_settings
    settings = await get_live_sim_settings()
    if not settings.get('enabled', True) and not force:
        return {'skipped': 'disabled'}

    await ensure_card_activity_pool()
    now_local = datetime.now(MADRID)
    today_str = now_local.date().isoformat()
    plan = await db.card_activity_plans.find_one({'date': today_str}, {'_id': 0})
    if not plan:
        plan = await _build_daily_plan(today_str)
        if not plan:
            return {'skipped': 'no_pool'}

    fired = 0
    now_hhmm = now_local.strftime('%H:%M')
    for event in plan['events']:
        if event.get('fired'):
            continue
        if force or event['time'] <= now_hhmm:
            await _fire_event(plan, event)
            fired += 1
    return {'ok': True, 'date': today_str,
            'times': [e['time'] for e in plan['events']], 'fired_now': fired}
