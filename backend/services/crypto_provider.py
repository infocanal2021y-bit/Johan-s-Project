"""Crypto Treasury provider abstraction. Static wallets now; Fireblocks later (same interface)."""
import os
from typing import Optional

from config import db

NETWORKS = {
    'BTC': [{'id': 'bitcoin', 'label': 'Bitcoin', 'wallet_coin': 'BTC', 'confirmations': 2, 'min_deposit': 0.0005}],
    'USDT': [
        {'id': 'trc20', 'label': 'Tron (TRC20)', 'wallet_coin': 'USDT', 'confirmations': 20, 'min_deposit': 10},
        {'id': 'erc20', 'label': 'Ethereum (ERC20)', 'wallet_coin': 'ETH', 'confirmations': 12, 'min_deposit': 20},
        {'id': 'bep20', 'label': 'BNB Smart Chain (BEP20)', 'wallet_coin': 'BNB', 'confirmations': 15, 'min_deposit': 10},
    ],
}
STATUSES = ['pending', 'confirming', 'confirmed', 'rejected']
STATUS_LABELS = {'pending': 'Pendiente', 'confirming': 'Confirmando', 'confirmed': 'Confirmado', 'rejected': 'Rechazado'}


def network_meta(coin: str, network_id: str) -> Optional[dict]:
    return next((n for n in NETWORKS.get(coin, []) if n['id'] == network_id), None)


class TreasuryProvider:
    name = 'base'

    async def get_deposit_address(self, user_id: str, coin: str, network_id: str) -> Optional[str]:
        raise NotImplementedError

    async def get_tx_status(self, coin: str, network_id: str, txid: str) -> Optional[dict]:
        return None  # sin consulta on-chain por ahora


class StaticWalletProvider(TreasuryProvider):
    """Direcciones compartidas de `platform_wallets` (lo que ya usa la plataforma)."""
    name = 'static'

    async def get_deposit_address(self, user_id, coin, network_id):
        meta = network_meta(coin, network_id)
        if not meta:
            return None
        w = await db.platform_wallets.find_one({'coin': meta['wallet_coin'], 'enabled': True}, {'_id': 0, 'address': 1})
        return (w or {}).get('address')


class FireblocksProvider(TreasuryProvider):
    """Punto de conexión futuro: vault accounts por usuario + webhooks de confirmación."""
    name = 'fireblocks'

    async def get_deposit_address(self, user_id, coin, network_id):
        raise NotImplementedError('Fireblocks no está conectado todavía')


def get_provider() -> TreasuryProvider:
    return FireblocksProvider() if os.environ.get('CRYPTO_TREASURY_PROVIDER') == 'fireblocks' else StaticWalletProvider()
