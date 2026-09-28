"""Bitcoin mainnet anchoring for the Vault (real network data via mempool.space)."""
import hashlib
import logging
import time
from datetime import datetime, timezone

import httpx

log = logging.getLogger(__name__)

MEMPOOL = 'https://mempool.space/api'
EXPLORER = 'https://mempool.space/es'
_status_cache = {'at': 0.0, 'data': None}


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def compute_anchor_hash(block_hash: str, doc_sha256: str) -> str:
    return _sha256_hex(block_hash + doc_sha256)


async def fetch_tip_block() -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f'{MEMPOOL}/v1/blocks')
        r.raise_for_status()
        b = r.json()[0]
    return {
        'height': int(b['height']),
        'hash': b['id'],
        'timestamp': int(b['timestamp']),
        'time_iso': datetime.fromtimestamp(int(b['timestamp']), tz=timezone.utc).isoformat(),
        'tx_count': b.get('tx_count'),
        'size': b.get('size'),
        'difficulty': b.get('difficulty'),
        'merkle_root': b.get('merkle_root'),
    }


async def get_network_status() -> dict:
    if _status_cache['data'] and time.time() - _status_cache['at'] < 60:
        return _status_cache['data']
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            blocks, fees, prices, mem = await _gather(
                client.get(f'{MEMPOOL}/v1/blocks'),
                client.get(f'{MEMPOOL}/v1/fees/recommended'),
                client.get(f'{MEMPOOL}/v1/prices'),
                client.get(f'{MEMPOOL}/mempool'),
            )
        b = blocks.json()[0]
        f = fees.json()
        p = prices.json()
        m = mem.json()
        data = {
            'ok': True,
            'network': 'Bitcoin Mainnet',
            'source': 'mempool.space',
            'fetched_at': _now_iso(),
            'tip': {
                'height': int(b['height']),
                'hash': b['id'],
                'timestamp': int(b['timestamp']),
                'time_iso': datetime.fromtimestamp(int(b['timestamp']), tz=timezone.utc).isoformat(),
                'tx_count': b.get('tx_count'),
                'size': b.get('size'),
                'difficulty': b.get('difficulty'),
                'explorer_url': f"{EXPLORER}/block/{b['id']}",
            },
            'fees': {
                'fastest': f.get('fastestFee'),
                'half_hour': f.get('halfHourFee'),
                'hour': f.get('hourFee'),
                'economy': f.get('economyFee'),
            },
            'prices': {'EUR': p.get('EUR'), 'USD': p.get('USD')},
            'mempool': {'count': m.get('count'), 'vsize': m.get('vsize')},
        }
        _status_cache.update({'at': time.time(), 'data': data})
        return data
    except Exception as e:
        log.warning('[btc-anchor] network status failed: %s', e)
        if _status_cache['data']:
            return {**_status_cache['data'], 'stale': True}
        return {'ok': False, 'error': 'No se pudo consultar la red Bitcoin en este momento.'}


async def _gather(*coros):
    import asyncio
    return await asyncio.gather(*coros)


async def anchor_document(doc_sha256: str, retroactive: bool = False) -> dict | None:
    """Anchor a document hash to the current real Bitcoin tip block. Returns None if network unavailable."""
    try:
        tip = await fetch_tip_block()
    except Exception as e:
        log.warning('[btc-anchor] anchoring failed: %s', e)
        return None
    return {
        'network': 'bitcoin-mainnet',
        'source': 'mempool.space',
        'block_height': tip['height'],
        'block_hash': tip['hash'],
        'block_timestamp': tip['timestamp'],
        'block_time_iso': tip['time_iso'],
        'block_tx_count': tip['tx_count'],
        'block_difficulty': tip['difficulty'],
        'block_merkle_root': tip['merkle_root'],
        'anchor_hash': compute_anchor_hash(tip['hash'], doc_sha256),
        'anchored_at': _now_iso(),
        'retroactive': bool(retroactive),
        'explorer_url': f"{EXPLORER}/block/{tip['hash']}",
    }


async def verify_anchor(anchor: dict, doc_sha256: str) -> dict:
    """Re-query the Bitcoin network and confirm the anchor block is still canonical."""
    result = {
        'checked_at': _now_iso(),
        'block_height': anchor.get('block_height'),
        'block_hash': anchor.get('block_hash'),
        'explorer_url': anchor.get('explorer_url'),
        'hash_link_ok': compute_anchor_hash(anchor.get('block_hash', ''), doc_sha256) == anchor.get('anchor_hash'),
        'block_on_chain': None,
        'confirmations': None,
        'tip_height': None,
        'network_ok': False,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            by_height, tip = await _gather(
                client.get(f"{MEMPOOL}/block-height/{anchor['block_height']}"),
                client.get(f'{MEMPOOL}/blocks/tip/height'),
            )
        canonical_hash = by_height.text.strip() if by_height.status_code == 200 else None
        tip_height = int(tip.text.strip()) if tip.status_code == 200 else None
        result['network_ok'] = True
        result['block_on_chain'] = canonical_hash == anchor.get('block_hash')
        result['tip_height'] = tip_height
        if tip_height is not None:
            result['confirmations'] = max(0, tip_height - int(anchor['block_height']) + 1)
    except Exception as e:
        log.warning('[btc-anchor] verify failed: %s', e)
        result['error'] = 'No se pudo consultar la red Bitcoin en este momento.'
    result['anchor_ok'] = bool(result['hash_link_ok'] and result['block_on_chain'])
    return result
