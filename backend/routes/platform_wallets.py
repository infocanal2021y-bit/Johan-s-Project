"""Panel de administración de wallets de plataforma.

Administración → Configuración → Wallets.
Permite activar/desactivar monedas y editar dirección pública, red y
confirmaciones requeridas. Nunca acepta ni almacena claves privadas/seed.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from services.auth import get_admin_user
from services.wallet_config import get_all_wallets, MANAGED_COINS

router = APIRouter()

# Campos prohibidos: jamás deben aceptarse en ninguna petición.
FORBIDDEN_KEYS = {'seed', 'seed_phrase', 'mnemonic', 'private_key', 'privkey', 'secret'}


class WalletUpdate(BaseModel):
    enabled: Optional[bool] = None
    address: Optional[str] = None
    network: Optional[str] = None
    required_confirmations: Optional[int] = None


@router.get('/admin/platform-wallets')
async def list_wallets(admin: dict = Depends(get_admin_user)):
    wallets = await get_all_wallets()
    return {'wallets': wallets, 'managed_coins': MANAGED_COINS}


@router.put('/admin/platform-wallets/{coin}')
async def update_wallet(coin: str, payload: WalletUpdate, admin: dict = Depends(get_admin_user)):
    coin = coin.upper()
    if coin not in MANAGED_COINS:
        raise HTTPException(400, f'Moneda no gestionable: {coin}')

    # Defensa: rechazar cualquier intento de guardar material sensible.
    raw = payload.model_dump(exclude_none=True)
    if FORBIDDEN_KEYS.intersection({k.lower() for k in raw.keys()}):
        raise HTTPException(400, 'No se permiten claves privadas ni seed phrases.')

    update = {}
    if payload.enabled is not None:
        update['enabled'] = bool(payload.enabled)
    if payload.address is not None:
        update['address'] = payload.address.strip()
    if payload.network is not None:
        net = payload.network.strip()
        if not net:
            raise HTTPException(400, 'La red no puede estar vacía.')
        update['network'] = net
    if payload.required_confirmations is not None:
        if payload.required_confirmations < 0 or payload.required_confirmations > 200:
            raise HTTPException(400, 'Confirmaciones fuera de rango (0–200).')
        update['required_confirmations'] = int(payload.required_confirmations)

    if not update:
        raise HTTPException(400, 'Nada que actualizar.')

    # Si se habilita, debe haber una dirección configurada.
    if update.get('enabled'):
        current = await db.platform_wallets.find_one({'coin': coin}, {'_id': 0})
        final_addr = update.get('address', (current or {}).get('address', ''))
        if not (final_addr or '').strip():
            raise HTTPException(400, 'No se puede habilitar una moneda sin dirección pública.')

    update['updated_at'] = datetime.now(timezone.utc).isoformat()
    update['updated_by'] = admin.get('email')

    await db.platform_wallets.update_one({'coin': coin}, {'$set': update}, upsert=True)
    logging.info(f'platform wallet {coin} updated by {admin.get("email")}: {list(update.keys())}')
    fresh = await db.platform_wallets.find_one({'coin': coin}, {'_id': 0})
    return {'ok': True, 'wallet': fresh}
