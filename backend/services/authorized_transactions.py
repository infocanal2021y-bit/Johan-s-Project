"""Transacciones autorizadas: incorpora 3 usuarios cada 24h (orden fijo, 70 en total).

Estado persistente en `system_flags` (key `authorized_tx_config`) → sobrevive reinicios.
Registros en `authorized_transactions` con índice único por `username` y `sequence`.
"""
import logging
import uuid
from datetime import datetime, timezone, timedelta

from config import db

CONFIG_KEY = 'authorized_tx_config'
STATUS = 'authorized'
STATUS_LABEL = 'Transacción autorizada'
AUTHORIZED_AMOUNT = 6000.00
PAID_AMOUNT = 800.00
CURRENCY = 'EUR'
DEFAULT_BATCH_SIZE = 3
DEFAULT_INTERVAL_HOURS = 24
NAMESPACE = uuid.UUID('7d2f1c4e-9a3b-4f6e-8b21-0c5e1a7f3d90')

USERNAMES = [
    'CarlosM_01', 'JavierR_02', 'MiguelS_03', 'AntonioG_04', 'DanielP_05', 'RobertoL_06',
    'FernandoM_07', 'AlejandroV_08', 'SergioC_09', 'DavidT_10', 'LuisA_11', 'JorgeN_12',
    'ManuelB_13', 'AlbertoF_14', 'RubenD_15', 'FranciscoH_16', 'DiegoP_17', 'RaulG_18',
    'VictorS_19', 'AdrianL_20', 'MarcosR_21', 'OscarM_22', 'RubenS_23', 'TomasJ_24',
    'HectorV_25', 'NicolasC_26', 'CristianP_27', 'EduardoR_28', 'IvanM_29', 'GabrielT_30',
    'MartinG_31', 'SamuelL_32', 'AndresF_33', 'PedroN_34', 'JoaquinD_35', 'MateoS_36',
    'RubenA_37', 'GuillermoP_38', 'EstebanC_39', 'LorenzoV_40', 'PabloM_41', 'EnriqueS_42',
    'RamonG_43', 'JaimeR_44', 'BrunoC_45', 'AlexP_46', 'MarceloV_47', 'AlvaroN_48',
    'RodrigoM_49', 'FelipeS_50', 'HugoR_51', 'MarioG_52', 'GonzaloP_53', 'JulianC_54',
    'EmilioV_55', 'SantiagoL_56', 'IgnacioD_57', 'NicolasM_58', 'RafaelS_59', 'MartinP_60',
    'DamianR_61', 'FabianG_62', 'LeonardoC_63', 'MauricioV_64', 'SebastianN_65', 'GermanM_66',
    'AgustinS_67', 'MaximilianoR_68', 'PatricioG_69', 'AlejandroM_70',
]
TOTAL_PLANNED = len(USERNAMES)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def ensure_indexes():
    await db.authorized_transactions.create_index('username', unique=True)
    await db.authorized_transactions.create_index('sequence', unique=True)


async def get_config() -> dict:
    cfg = await db.system_flags.find_one({'key': CONFIG_KEY}, {'_id': 0}) or {}
    return {
        'paused': bool(cfg.get('paused', False)),
        'batch_size': int(cfg.get('batch_size') or DEFAULT_BATCH_SIZE),
        'interval_hours': float(cfg.get('interval_hours') or DEFAULT_INTERVAL_HOURS),
        'next_batch_at': cfg.get('next_batch_at'),
        'last_batch_at': cfg.get('last_batch_at'),
        'started_at': cfg.get('started_at'),
        'updated_by': cfg.get('updated_by'),
        'updated_at': cfg.get('updated_at'),
    }


async def save_config(patch: dict):
    patch['updated_at'] = _now().isoformat()
    await db.system_flags.update_one({'key': CONFIG_KEY}, {'$set': patch}, upsert=True)


async def summary() -> dict:
    count = await db.authorized_transactions.count_documents({})
    cfg = await get_config()
    return {
        'count': count,
        'total_planned': TOTAL_PLANNED,
        'completed': count >= TOTAL_PLANNED,
        'totals': {
            'authorized': round(count * AUTHORIZED_AMOUNT, 2),
            'paid': round(count * PAID_AMOUNT, 2),
            'currency': CURRENCY,
        },
        'config': cfg,
    }


async def publish_next_batch(force: bool = False) -> list:
    """Inserta el siguiente lote (respeta el orden fijo). Devuelve los registros creados."""
    cfg = await get_config()
    existing = set(await db.authorized_transactions.distinct('username'))
    pending = [u for u in USERNAMES if u not in existing]
    if not pending:
        return []
    batch = pending[:cfg['batch_size']]
    now = _now()
    created = []
    for username in batch:
        seq = USERNAMES.index(username) + 1
        doc = {
            'id': str(uuid.uuid4()),
            'sequence': seq,
            'user_id': str(uuid.uuid5(NAMESPACE, username)),
            'username': username,
            'status': STATUS,
            'status_label': STATUS_LABEL,
            'authorized_amount': AUTHORIZED_AMOUNT,
            'paid_amount': PAID_AMOUNT,
            'currency': CURRENCY,
            'published_at': now.isoformat(),
            'created_at': now.isoformat(),
            'auto_generated_by': 'authorized_tx_scheduler',
        }
        try:
            await db.authorized_transactions.insert_one(doc)
            doc.pop('_id', None)
            created.append(doc)
        except Exception as e:  # duplicado → ignorar (índice único)
            logging.warning(f'authorized_tx: skip duplicate {username}: {e}')
    remaining = len(pending) - len(batch)
    patch = {'last_batch_at': now.isoformat()}
    if not cfg.get('started_at'):
        patch['started_at'] = now.isoformat()
    patch['next_batch_at'] = (now + timedelta(hours=cfg['interval_hours'])).isoformat() if remaining > 0 else None
    await save_config(patch)
    logging.info(f'authorized_tx: published {len(created)} ({", ".join(batch)}) · remaining {remaining}')
    return created


async def run_authorized_tx_tick():
    """Job periódico: publica el siguiente lote cuando llegue `next_batch_at`."""
    try:
        cfg = await get_config()
        if cfg['paused']:
            return
        count = await db.authorized_transactions.count_documents({})
        if count >= TOTAL_PLANNED:
            return
        nxt = cfg.get('next_batch_at')
        if count > 0 and nxt and datetime.fromisoformat(nxt) > _now():
            return
        await publish_next_batch()
    except Exception as e:
        logging.error(f'authorized_tx tick failed: {e}')
