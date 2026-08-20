"""Service Status — statuspage-style component health for clients and admins."""
import time
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, Depends
from config import db, RESEND_API_KEY
from services.auth import get_current_user

router = APIRouter()

OPERATIONAL, DEGRADED, DOWN = 'operational', 'degraded', 'down'


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _check_database() -> dict:
    try:
        t0 = time.perf_counter()
        await db.command('ping')
        ms = round((time.perf_counter() - t0) * 1000, 1)
        return {'status': OPERATIONAL if ms < 250 else DEGRADED, 'latency_ms': ms}
    except Exception:
        return {'status': DOWN, 'latency_ms': None}


async def _check_email() -> dict:
    if not RESEND_API_KEY:
        return {'status': DOWN, 'detail': 'Servicio no configurado'}
    try:
        since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        logs = await db.email_logs.find({'created_at': {'$gte': since}}, {'_id': 0, 'status': 1}).to_list(2000)
        sent = sum(1 for l in logs if l.get('status') == 'sent')
        failed = sum(1 for l in logs if l.get('status') == 'failed')
        if failed > 0 and sent == 0:
            return {'status': DOWN, 'detail': f'{failed} fallos en 24h'}
        if failed > max(3, sent * 0.2):
            return {'status': DEGRADED, 'detail': f'{sent} enviados · {failed} fallos en 24h'}
        return {'status': OPERATIONAL, 'detail': f'{sent} emails enviados en 24h'}
    except Exception:
        return {'status': DEGRADED, 'detail': 'No se pudo leer el registro'}


async def _check_exchange_rates() -> dict:
    try:
        row = await db.exchange_rates_live.find_one({}, {'_id': 0, 'fetched_at': 1}, sort=[('fetched_at', -1)])
        fresh = False
        if row and row.get('fetched_at'):
            age = datetime.now(timezone.utc) - datetime.fromisoformat(row['fetched_at'])
            fresh = age < timedelta(hours=2)
        t0 = time.perf_counter()
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get('https://open.er-api.com/v6/latest/EUR')
        ms = round((time.perf_counter() - t0) * 1000, 1)
        if r.status_code == 200:
            return {'status': OPERATIONAL, 'latency_ms': ms, 'detail': 'Proveedor en línea'}
        return {'status': DEGRADED if fresh else DOWN, 'detail': 'Proveedor con errores · usando caché' if fresh else 'Proveedor no disponible'}
    except Exception:
        return {'status': DEGRADED, 'detail': 'Sin respuesta del proveedor · usando caché'}


async def _check_collection(coll: str) -> dict:
    try:
        t0 = time.perf_counter()
        await db[coll].estimated_document_count()
        ms = round((time.perf_counter() - t0) * 1000, 1)
        return {'status': OPERATIONAL, 'latency_ms': ms}
    except Exception:
        return {'status': DOWN, 'latency_ms': None}


@router.get("/system/status")
async def get_service_status(current_user: dict = Depends(get_current_user)):
    db_check = await _check_database()
    email_check = await _check_email()
    fx_check = await _check_exchange_rates()
    mt5_check = await _check_collection('demo_accounts')
    banking_check = await _check_collection('accounts')

    components = [
        {'key': 'banking', 'name': 'Banca Core & Pagos', 'description': 'Cuentas, transferencias y retiros', **banking_check},
        {'key': 'mt5', 'name': 'MT5 Hub & Trading', 'description': 'Cuentas demo, bots y señales', **mt5_check},
        {'key': 'database', 'name': 'Base de Datos', 'description': 'Almacenamiento principal de la plataforma', **db_check},
        {'key': 'email', 'name': 'Notificaciones Email', 'description': 'Envío de correos transaccionales', **email_check},
        {'key': 'exchange', 'name': 'Tipos de Cambio', 'description': 'Cotizaciones multidivisa en tiempo real', **fx_check},
        {'key': 'vault', 'name': 'Vault Blockchain', 'description': 'Certificados y custodia digital', 'status': OPERATIONAL},
    ]

    order = {DOWN: 2, DEGRADED: 1, OPERATIONAL: 0}
    overall = max((c['status'] for c in components), key=lambda s: order[s])

    # ---- Incident tracking: open on failure, close (with duration) on recovery
    now = _now_iso()
    for c in components:
        open_inc = await db.status_incidents.find_one({'component': c['key'], 'ended_at': None}, {'_id': 0})
        if c['status'] != OPERATIONAL and not open_inc:
            import uuid
            await db.status_incidents.insert_one({
                'id': str(uuid.uuid4()),
                'component': c['key'],
                'component_name': c['name'],
                'status': c['status'],
                'detail': c.get('detail'),
                'started_at': now,
                'ended_at': None,
                'duration_seconds': None,
            })
        elif c['status'] != OPERATIONAL and open_inc and open_inc.get('status') != c['status']:
            await db.status_incidents.update_one({'id': open_inc['id']}, {'$set': {'status': c['status'], 'detail': c.get('detail')}})
        elif c['status'] == OPERATIONAL and open_inc:
            started = datetime.fromisoformat(open_inc['started_at'])
            duration = int((datetime.now(timezone.utc) - started).total_seconds())
            await db.status_incidents.update_one(
                {'id': open_inc['id']},
                {'$set': {'ended_at': now, 'duration_seconds': duration}}
            )

    incidents = await db.status_incidents.find({}, {'_id': 0}).sort('started_at', -1).limit(20).to_list(20)

    snapshot = {
        'created_at': _now_iso(),
        'overall': overall,
        'components': {c['key']: c['status'] for c in components},
    }
    await db.status_snapshots.insert_one(dict(snapshot))
    # keep history bounded
    count = await db.status_snapshots.estimated_document_count()
    if count > 400:
        old = await db.status_snapshots.find({}, {'_id': 1}).sort('created_at', 1).limit(count - 400).to_list(count)
        await db.status_snapshots.delete_many({'_id': {'$in': [o['_id'] for o in old]}})

    history_docs = await db.status_snapshots.find({}, {'_id': 0}).sort('created_at', -1).limit(60).to_list(60)
    history_docs.reverse()

    return {
        'overall': overall,
        'checked_at': snapshot['created_at'],
        'components': components,
        'history': history_docs,
        'incidents': incidents,
    }
