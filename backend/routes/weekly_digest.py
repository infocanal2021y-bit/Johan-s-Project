"""Resumen Semanal por email: retiros completados de la semana + preguntas destacadas.

- Envío automático: lunes 10:00 (Europe/Madrid) vía APScheduler, solo si enabled=True.
- Panel admin: toggle, vista previa, envío manual y registro de envíos.
- Audiencia: usuarios activos reales (excluye admins, demo y correos @example.*).
"""
import base64
import logging
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from config import db, APP_BASE_URL
from services.auth import get_admin_user
from services.email import send_email_background, get_email_template
from routes.community import _public_first_name, _flag_for, _display_currency_for

router = APIRouter()

SETTINGS_ID = 'weekly_digest'
SUBJECT = 'Resumen Semanal · Retiros completados y preguntas destacadas — LIONSBIT'


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _audience_query() -> dict:
    return {
        'role': {'$ne': 'admin'},
        'account_status': {'$nin': ['suspended', 'blocked', 'rejected', 'under_review']},
        'is_demo': {'$ne': True},
        'email': {'$not': {'$regex': '@example\\.'}},
    }


async def get_digest_settings() -> dict:
    doc = await db.platform_settings.find_one({'id': SETTINGS_ID}, {'_id': 0})
    return doc or {'id': SETTINGS_ID, 'enabled': False, 'updated_at': None, 'updated_by': None}


async def _build_digest_data() -> dict:
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    rows = await db.transactions.find(
        {'transaction_type': 'withdraw', 'status': 'completed', 'completed_at': {'$gte': since}},
        {'_id': 0, 'id': 1, 'user_id': 1, 'amount': 1, 'currency': 1, 'completed_at': 1,
         'transaction_reference': 1},
    ).sort('completed_at', -1).limit(10).to_list(10)

    user_ids = list({r['user_id'] for r in rows})
    user_map = {}
    if user_ids:
        async for u in db.users.find({'id': {'$in': user_ids}},
                                     {'_id': 0, 'id': 1, 'name': 1, 'country_name': 1, 'country': 1}):
            user_map[u['id']] = u

    withdrawals = []
    for r in rows:
        u = user_map.get(r['user_id'])
        if not u:
            continue
        country = u.get('country_name') or u.get('country') or 'Internacional'
        tx_cur = (r.get('currency') or 'EUR').upper()
        display_cur = _display_currency_for(country, tx_cur)
        amt = float(r.get('amount') or 0)
        if tx_cur != display_cur:
            amt = amt * 1.08 if display_cur == 'USD' else amt / 1.08
        withdrawals.append({
            'withdrawal_id': r['id'],
            'name_public': _public_first_name(u.get('name') or 'Cliente'),
            'country': country,
            'country_flag': _flag_for(country),
            'amount': round(amt, 2),
            'currency': display_cur,
            'completed_at': r.get('completed_at'),
        })

    questions = await db.withdrawal_questions.find(
        {'featured': True, 'status': 'answered'},
        {'_id': 0, 'id': 1, 'message': 1, 'reply': 1, 'user_name': 1, 'withdrawal_id': 1, 'featured_at': 1},
    ).sort('featured_at', -1).limit(5).to_list(5)
    featured = [{
        'question_id': q['id'],
        'withdrawal_id': q.get('withdrawal_id'),
        'user_public_name': _public_first_name(q.get('user_name') or 'Cliente'),
        'message': q['message'],
        'reply_message': (q.get('reply') or {}).get('message', ''),
    } for q in questions]

    return {'withdrawals': withdrawals, 'featured_questions': featured}


def _fmt_amount(amount: float, currency: str) -> str:
    if currency == 'USD':
        return f"${amount:,.2f} USD"
    s = f"{amount:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
    return f"€{s} EUR"


def _fmt_date(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso).strftime('%d/%m/%Y')
    except Exception:
        return ''


def _digest_content(data: dict) -> str:
    """Cuerpo HTML del resumen. Usa el placeholder __NOMBRE__ para personalizar por destinatario."""
    wd_rows = ''
    for w in data['withdrawals']:
        wd_rows += f"""
        <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:14px;">
                {w['country_flag']} <strong>{w['name_public']}</strong>
                <span style="color:#64748b;font-size:12px;"> · {w['country']}</span>
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#22c55e;font-weight:bold;font-size:14px;text-align:right;white-space:nowrap;">
                {_fmt_amount(w['amount'], w['currency'])}
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:12px;text-align:right;white-space:nowrap;">
                {_fmt_date(w.get('completed_at') or '')}
            </td>
        </tr>"""

    q_blocks = ''
    for q in data['featured_questions']:
        q_blocks += f"""
        <div style="background:#0f172a;border-radius:12px;padding:16px;margin:12px 0;">
            <p style="color:#fbbf24;font-size:12px;margin:0 0 6px 0;font-weight:bold;">★ Pregunta destacada</p>
            <p style="color:#e2e8f0;font-size:14px;margin:0;"><strong>{q['user_public_name']}</strong>: {q['message']}</p>
            <p style="color:#38bdf8;font-size:13px;margin:10px 0 0 0;">↳ Respuesta</p>
            <p style="color:#cbd5e1;font-size:13px;margin:4px 0 0 0;line-height:1.5;">{q['reply_message']}</p>
        </div>"""

    wd_section = f"""
        <h3 style="color:#e2e8f0;font-size:16px;margin:24px 0 10px 0;">✅ Retiros completados esta semana</h3>
        <table style="width:100%;border-collapse:collapse;background:#0f172a;border-radius:12px;overflow:hidden;">
            {wd_rows}
        </table>""" if data['withdrawals'] else ''

    q_section = f"""
        <h3 style="color:#e2e8f0;font-size:16px;margin:28px 0 4px 0;">💬 Preguntas destacadas de la comunidad</h3>
        {q_blocks}""" if data['featured_questions'] else ''

    return f"""
        <p style="color:#e2e8f0;font-size:16px;">Estimado/a <strong>__NOMBRE__</strong>,</p>
        <p style="color:#cbd5e1;font-size:14px;line-height:1.6;">
            Este es su resumen semanal de actividad verificada en LIONSBIT VERIFICACION:
            los retiros completados por la comunidad durante los últimos 7 días y las
            preguntas más útiles respondidas por nuestro equipo.
        </p>
        {wd_section}
        {q_section}
        <div style="text-align:center;margin:30px 0 10px 0;">
            <a href="{APP_BASE_URL}/retiros-recientes"
               style="display:inline-block;background:#1973B8;color:#ffffff;text-decoration:none;
                      padding:13px 32px;border-radius:10px;font-size:15px;font-weight:bold;">
                Ver Retiros Recientes
            </a>
        </div>
        <p style="color:#64748b;font-size:12px;text-align:center;margin-top:12px;">
            Puede consultar toda la actividad y hacer sus propias preguntas desde la plataforma.
        </p>
    """


async def run_weekly_digest(triggered_by: str = 'scheduler') -> dict:
    """Ejecuta el envío del resumen semanal a toda la audiencia activa."""
    settings = await get_digest_settings()
    if triggered_by == 'scheduler' and not settings.get('enabled'):
        logging.info('weekly_digest: skipped (disabled)')
        return {'skipped': 'disabled'}

    data = await _build_digest_data()
    if not data['withdrawals'] and not data['featured_questions']:
        logging.info('weekly_digest: skipped (no content this week)')
        return {'skipped': 'no_content'}

    content_tpl = _digest_content(data)
    targets = await db.users.find(
        _audience_query(), {'_id': 0, 'id': 1, 'email': 1, 'name': 1, 'email_open_token': 1},
    ).to_list(length=5000)

    run_id = str(uuid.uuid4())
    sent = 0
    for u in targets:
        try:
            name = (u.get('name') or 'Cliente').split()[0]
            token = u.get('email_open_token') or str(uuid.uuid4())
            if not u.get('email_open_token'):
                await db.users.update_one({'id': u['id']}, {'$set': {'email_open_token': token}})
            pixel = (f'<img src="{APP_BASE_URL}/api/weekly-digest/track/{run_id}/{token}.png" '
                     f'width="1" height="1" style="display:none;" alt="" />')
            html = get_email_template(content_tpl.replace('__NOMBRE__', name) + pixel, 'Resumen Semanal')
            send_email_background(u['email'], SUBJECT, html)
            sent += 1
        except Exception as e:
            logging.warning(f"weekly_digest send failed for {u.get('email')}: {e}")

    log_doc = {
        'id': run_id,
        'sent_at': _now_iso(),
        'triggered_by': triggered_by,
        'recipients': sent,
        'withdrawals_count': len(data['withdrawals']),
        'featured_questions_count': len(data['featured_questions']),
    }
    await db.weekly_digest_log.insert_one(log_doc)
    log_doc.pop('_id', None)
    logging.info(f"weekly_digest: dispatched to {sent} users (by {triggered_by})")
    return {'ok': True, **log_doc}


# ── Tracking de aperturas (pixel público, sin auth) ─────────────────────

_PIXEL_PNG = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')


@router.get('/weekly-digest/track/{run_id}/{token}.png')
async def track_digest_open(run_id: str, token: str):
    try:
        user = await db.users.find_one({'email_open_token': token}, {'_id': 0, 'id': 1, 'email': 1})
        if user:
            await db.weekly_digest_opens.update_one(
                {'run_id': run_id, 'user_id': user['id']},
                {'$setOnInsert': {
                    'id': str(uuid.uuid4()),
                    'run_id': run_id,
                    'user_id': user['id'],
                    'opened_at': _now_iso(),
                }},
                upsert=True,
            )
    except Exception as e:
        logging.warning(f'weekly_digest track failed: {e}')
    return Response(content=_PIXEL_PNG, media_type='image/png',
                    headers={'Cache-Control': 'no-store, no-cache, must-revalidate'})


# ── Admin endpoints ──────────────────────────────────────────────────────

@router.get('/admin/weekly-digest/status')
async def digest_status(admin: dict = Depends(get_admin_user)):
    settings = await get_digest_settings()
    audience = await db.users.count_documents(_audience_query())
    data = await _build_digest_data()
    runs = await db.weekly_digest_log.find({}, {'_id': 0}).sort('sent_at', -1).to_list(10)
    if runs:
        run_ids = [r['id'] for r in runs]
        opens_by_run = {}
        async for g in db.weekly_digest_opens.aggregate([
            {'$match': {'run_id': {'$in': run_ids}}},
            {'$group': {'_id': '$run_id', 'n': {'$sum': 1}}},
        ]):
            opens_by_run[g['_id']] = g['n']
        for r in runs:
            r['opens'] = opens_by_run.get(r['id'], 0)
            r['open_rate'] = round(r['opens'] / r['recipients'] * 100, 1) if r.get('recipients') else 0.0
    return {
        'enabled': bool(settings.get('enabled')),
        'updated_at': settings.get('updated_at'),
        'updated_by': settings.get('updated_by'),
        'audience_count': audience,
        'withdrawals_this_week': len(data['withdrawals']),
        'featured_questions': len(data['featured_questions']),
        'schedule': 'Lunes 10:00 (Europe/Madrid)',
        'last_runs': runs,
    }


@router.post('/admin/weekly-digest/toggle')
async def digest_toggle(admin: dict = Depends(get_admin_user)):
    settings = await get_digest_settings()
    new_val = not settings.get('enabled')
    await db.platform_settings.update_one(
        {'id': SETTINGS_ID},
        {'$set': {'enabled': new_val, 'updated_at': _now_iso(), 'updated_by': admin.get('email')}},
        upsert=True,
    )
    return {'ok': True, 'enabled': new_val}


@router.get('/admin/weekly-digest/preview')
async def digest_preview(admin: dict = Depends(get_admin_user)):
    data = await _build_digest_data()
    html = get_email_template(_digest_content(data).replace('__NOMBRE__', 'Cliente'), 'Resumen Semanal')
    return {
        'html': html,
        'subject': SUBJECT,
        'withdrawals_count': len(data['withdrawals']),
        'featured_questions_count': len(data['featured_questions']),
        'audience_count': await db.users.count_documents(_audience_query()),
    }


@router.post('/admin/weekly-digest/send-now')
async def digest_send_now(admin: dict = Depends(get_admin_user)):
    result = await run_weekly_digest(triggered_by=admin.get('email') or 'admin')
    return result
