"""Configuración de wallets de plataforma controlada por el administrador.

Fuente única para: monedas habilitadas, dirección pública, red y
confirmaciones requeridas. Nunca almacena seed phrase ni claves privadas.

Colección: `platform_wallets` — un documento por moneda.
{ coin, name, network, address, enabled, required_confirmations, updated_at, updated_by }
"""
from datetime import datetime, timezone
from config import db, CRYPTO_WALLETS

# Monedas gestionables desde el panel admin y sus valores por defecto.
DEFAULT_WALLETS = {
    'BTC': {
        'name': 'Bitcoin',
        'network': 'Bitcoin',
        'address': CRYPTO_WALLETS.get('BTC', {}).get('address', ''),
        'required_confirmations': 2,
    },
    'ETH': {
        'name': 'Ethereum',
        'network': 'Ethereum (ERC20)',
        'address': CRYPTO_WALLETS.get('ETH', {}).get('address', ''),
        'required_confirmations': 12,
    },
    'BNB': {
        'name': 'BNB',
        'network': 'BNB Smart Chain (BEP20)',
        'address': CRYPTO_WALLETS.get('BNB', {}).get('address', ''),
        'required_confirmations': 12,
    },
    'USDT': {
        'name': 'Tether USDT',
        'network': 'Tron (TRC20)',
        'address': CRYPTO_WALLETS.get('USDT', {}).get('address', ''),
        'required_confirmations': 19,
    },
}

MANAGED_COINS = list(DEFAULT_WALLETS.keys())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def ensure_seeded():
    """Crea los documentos por defecto si aún no existen (idempotente)."""
    for coin, cfg in DEFAULT_WALLETS.items():
        existing = await db.platform_wallets.find_one({'coin': coin})
        if not existing:
            await db.platform_wallets.insert_one({
                'coin': coin,
                'name': cfg['name'],
                'network': cfg['network'],
                'address': cfg['address'],
                'enabled': True,
                'required_confirmations': cfg['required_confirmations'],
                'updated_at': _now(),
                'updated_by': None,
            })


async def get_all_wallets() -> list:
    """Todas las configuraciones de wallet (para el panel admin)."""
    await ensure_seeded()
    docs = await db.platform_wallets.find({}, {'_id': 0}).to_list(50)
    order = {c: i for i, c in enumerate(MANAGED_COINS)}
    docs.sort(key=lambda d: order.get(d.get('coin'), 99))
    return docs


async def get_wallet(coin: str):
    await ensure_seeded()
    return await db.platform_wallets.find_one({'coin': coin}, {'_id': 0})


async def get_enabled_wallets() -> dict:
    """Wallets habilitadas y con dirección válida (para mostrar al usuario).

    Devuelve un dict {coin: {name, network, address, required_confirmations}}
    compatible con el consumo del frontend (QR / dirección / red).
    """
    await ensure_seeded()
    docs = await db.platform_wallets.find(
        {'enabled': True}, {'_id': 0}
    ).to_list(50)
    out = {}
    order = {c: i for i, c in enumerate(MANAGED_COINS)}
    for d in sorted(docs, key=lambda x: order.get(x.get('coin'), 99)):
        addr = (d.get('address') or '').strip()
        if not addr:
            continue  # no mostrar una moneda sin dirección configurada
        out[d['coin']] = {
            'name': d.get('name'),
            'network': d.get('network'),
            'address': addr,
            'required_confirmations': d.get('required_confirmations'),
            'icon': (d.get('coin') or '').lower(),
        }
    return out
