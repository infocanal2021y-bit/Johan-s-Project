"""Lightweight Telegram alerting service.

Inactive by default. Becomes active as soon as TELEGRAM_BOT_TOKEN and
TELEGRAM_CHAT_ID are set in backend/.env and the backend is restarted.

Used by the health monitor job in server.py to push notifications when the
aggregated platform status stays degraded/down beyond a threshold.
"""
import os
import logging
import httpx

TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '').strip()
TELEGRAM_CHAT_ID = os.environ.get('TELEGRAM_CHAT_ID', '').strip()
# "down" → only alert when overall==down. "degraded" → also on degraded.
TELEGRAM_ALERT_LEVEL = os.environ.get('TELEGRAM_ALERT_LEVEL', 'down').strip().lower()


def is_configured() -> bool:
    return bool(TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)


async def send_telegram_alert(text: str, parse_mode: str = 'HTML') -> bool:
    """Fire-and-forget alert. Returns True on success, False otherwise.
    No-op (returns False) when token/chat are not configured."""
    if not is_configured():
        return False

    url = f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage'
    payload = {
        'chat_id': TELEGRAM_CHAT_ID,
        'text': text,
        'parse_mode': parse_mode,
        'disable_web_page_preview': True,
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(url, json=payload)
        if resp.status_code == 200:
            return True
        logging.error(f"Telegram alert failed: {resp.status_code} {resp.text[:200]}")
        return False
    except Exception as e:
        logging.error(f"Telegram alert exception: {e}")
        return False


def should_alert_for(overall: str) -> bool:
    """Return True if the current overall status meets the configured threshold."""
    if overall == 'down':
        return True
    if overall == 'degraded' and TELEGRAM_ALERT_LEVEL == 'degraded':
        return True
    return False
