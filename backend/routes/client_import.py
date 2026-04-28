"""Client Import — CSV/Excel reactivation flow.

Admin uploads a sheet with legacy customers. The module:
  • parses headers tolerantly (Spanish / English / different casings)
  • de-duplicates by email (primary), phone (secondary)
  • on EXISTS: merges missing fields, flags 'is_reactivated=true',
    preserves history (accounts/verifications/withdrawals stay intact)
  • on NEW: creates user with temporary password 'lionsbit2.0' and
    must_change_password=True so first login forces a change
  • records engagement events (email opened / first login / password
    changed / verification / withdraw) for the admin dashboard
  • sends a professional reactivation email with a one-pixel open tracker

Public endpoints (admin-only except the open-pixel):
  POST /admin/client-import/preview          multipart upload (dry run)
  POST /admin/client-import/execute/{job_id} commit
  GET  /admin/client-import/jobs             history with summaries
  GET  /admin/client-import/jobs/{job_id}    detailed per-row report
  GET  /client-import/track/open/{token}.png 1x1 tracking pixel (public)
"""
import io
import re
import uuid
import base64
import logging
from datetime import datetime, timezone
from typing import List, Optional

import pandas as pd
from fastapi import (
    APIRouter, Depends, HTTPException, UploadFile, File, Form,
)
from fastapi.responses import Response

from config import db, APP_BASE_URL
from services.auth import get_current_user, get_admin_user, hash_password
from services.email import send_email_background, get_email_template


router = APIRouter()

# ── Constants ─────────────────────────────────────────────────────
TEMP_PASSWORD = 'lionsbit2.0'
VALID_GROUPS = ['recuperar', 'espanoles', 'latinos', 'bfx', 'pa']
GROUP_LABELS = {
    'recuperar': 'Recuperar',
    'espanoles': 'Españoles',
    'latinos':   'Latinos',
    'bfx':       'BFX',
    'pa':        'P&A',
}
PRIORITY_GROUPS = {'recuperar', 'espanoles'}

MAX_ROWS = 20_000

# Sheet-name → group auto-mapping (Excel multi-sheet support).
# Keys are matched case-insensitively via substring.
SHEET_GROUP_MAP = [
    ('bfx',          'bfx'),       # 'BFX (Españoles)', 'BFX (Latinos)', ...
    ('españoles',    'espanoles'),
    ('espanoles',    'espanoles'),
    ('latinos',      'latinos'),
    ('recuperar',    'recuperar'),
    ('viejos',       'recuperar'), # historical "old" clients
    ('nefy',         'recuperar'),
    ('p&a',          'pa'),
    ('p & a',        'pa'),
    ('pa',           'pa'),
]

# Sheet names we always skip (templates, metadata, email-only exports)
SHEET_SKIPLIST = {'plantilla', 'mono', 'rott lawyer', 'correos'}

# 1×1 transparent PNG for the email-open tracker
_PIXEL_PNG = base64.b64decode(
    b'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
)


# ── Header mapping (tolerant) ─────────────────────────────────────
HEADER_MAP = {
    'name':        {'name', 'full name', 'nombre', 'nombre completo', 'cliente', 'full_name'},
    'last_name':   {'apellidos', 'apellido', 'last name', 'surname', 'last_name'},
    'email':       {'email', 'e-mail', 'correo', 'correo electronico', 'correo electrónico', 'mail', 'correos', 'correos electronicos', 'correos electrónicos'},
    'phone':       {'phone', 'telefono', 'teléfono', 'movil', 'móvil', 'celular', 'whatsapp', 'tel', 'numero', 'número', 'num', 'nro'},
    'country':     {'country', 'pais', 'país', 'nacionalidad'},
    'balance':     {'balance', 'saldo', 'saldo disponible', 'amount', 'monto', 'available_balance', 'cantidad'},
    'status':      {'status', 'estado', 'estado de cuenta', 'account_status', 'forex'},
    'comments':    {'comments', 'comentarios', 'notas', 'observaciones', 'internal_notes', 'notes'},
    'identification': {'id', 'identificacion', 'identificación', 'dni', 'nie', 'passport', 'pasaporte', 'document'},
    'group':       {'group', 'grupo', 'tag', 'category', 'categoria', 'categoría'},
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_header(raw: str) -> str:
    return (raw or '').strip().lower().replace('_', ' ').replace('-', ' ')


def _detect_columns(df: pd.DataFrame) -> dict:
    """Return canonical → actual-column-name mapping for the uploaded sheet."""
    mapping = {}
    for col in df.columns:
        norm = _normalize_header(str(col))
        for canon, aliases in HEADER_MAP.items():
            if norm in aliases and canon not in mapping:
                mapping[canon] = col
                break
    return mapping


def _normalize_phone(raw: str) -> str:
    if not raw:
        return ''
    return re.sub(r'[^\d+]', '', str(raw)).strip()


def _normalize_email(raw: str) -> str:
    return str(raw or '').strip().lower()


def _safe_float(raw) -> float:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return 0.0
    try:
        s = str(raw).replace('€', '').replace('$', '').replace(' ', '').strip()
        # Handle comma as decimal separator
        if ',' in s and '.' in s:
            # assume thousands separator first
            s = s.replace('.', '').replace(',', '.')
        elif ',' in s:
            s = s.replace(',', '.')
        return float(s)
    except (ValueError, TypeError):
        return 0.0


def _normalize_group(raw: str, default: str = '') -> str:
    g = _normalize_header(raw or default or '')
    g = g.replace(' ', '').replace('&', '')
    if g in VALID_GROUPS:
        return g
    # fuzzy: 'españoles' → 'espanoles', etc.
    if 'recup' in g:
        return 'recuperar'
    if 'espan' in g or 'españ' in g:
        return 'espanoles'
    if 'latin' in g:
        return 'latinos'
    if 'bfx' in g:
        return 'bfx'
    if 'p' in g and 'a' in g and len(g) <= 3:
        return 'pa'
    return 'latinos'  # sensible default if unknown


# ── Parsing ───────────────────────────────────────────────────────
def _sheet_to_group(sheet_name: str, fallback: str) -> str:
    low = (sheet_name or '').strip().lower()
    # Check 'BFX (Españoles)' type names — bfx wins because we process that prefix first
    for key, group in SHEET_GROUP_MAP:
        if key in low:
            return group
    return fallback


def _parse_single_df(df: pd.DataFrame, default_group: str, sheet_name: str = '',
                     row_offset: int = 0) -> List[dict]:
    """Canonicalise a single dataframe into row dicts."""
    cols = _detect_columns(df)
    if 'email' not in cols:
        return []  # sheet has no email column — skip silently

    rows: List[dict] = []
    for i, record in enumerate(df.to_dict(orient='records'), start=1):
        absolute_row = row_offset + i
        email = _normalize_email(record.get(cols['email'], ''))
        if not email or '@' not in email:
            rows.append({
                'row_number': absolute_row,
                'sheet': sheet_name,
                'error': 'Email inválido o faltante',
                'raw': {k: v for k, v in record.items() if v},
            })
            continue

        # name = nombre + apellidos (if both exist)
        first = str(record.get(cols.get('name', ''), '') or '').strip()
        last  = str(record.get(cols.get('last_name', ''), '') or '').strip()
        full  = (f"{first} {last}".strip()) or email.split('@')[0].title()

        rows.append({
            'row_number': absolute_row,
            'sheet':      sheet_name,
            'name':       full,
            'email':      email,
            'phone':      _normalize_phone(record.get(cols.get('phone', ''), '')),
            'country':    str(record.get(cols.get('country', ''), '') or '').strip(),
            'balance':    _safe_float(record.get(cols.get('balance', ''), 0)),
            'status':     str(record.get(cols.get('status', ''), '') or '').strip(),
            'comments':   str(record.get(cols.get('comments', ''), '') or '').strip(),
            'identification': str(record.get(cols.get('identification', ''), '') or '').strip(),
            'group':      _normalize_group(record.get(cols.get('group', ''), ''), default_group),
        })
    return rows


def _parse_spreadsheet(file_bytes: bytes, filename: str, default_group: str) -> List[dict]:
    """Read CSV/Excel from memory. For multi-sheet Excel files, iterate all
    sheets and auto-assign group per sheet name (BFX→bfx, Españoles→espanoles,
    Recuperar→recuperar, P&A→pa, Viejos/NEFY→recuperar, ...)."""
    name = (filename or '').lower()
    try:
        if name.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(file_bytes), dtype=str, keep_default_na=False)
            rows = _parse_single_df(df, default_group, sheet_name='csv', row_offset=0)
        elif name.endswith(('.xls', '.xlsx', '.xlsm')):
            xls = pd.ExcelFile(io.BytesIO(file_bytes), engine='openpyxl')
            rows: List[dict] = []
            for sheet in xls.sheet_names:
                if sheet.strip().lower() in SHEET_SKIPLIST:
                    continue
                sheet_df = pd.read_excel(
                    io.BytesIO(file_bytes),
                    sheet_name=sheet,
                    dtype=str,
                    keep_default_na=False,
                    engine='openpyxl',
                )
                # Drop fully-blank rows (common in exports with trailing empty rows)
                sheet_df = sheet_df[sheet_df.apply(
                    lambda row: any(str(v).strip() for v in row.values), axis=1
                )].reset_index(drop=True)
                if sheet_df.empty:
                    continue
                group = _sheet_to_group(sheet, default_group)
                parsed = _parse_single_df(sheet_df, group, sheet_name=sheet, row_offset=len(rows))
                rows.extend(parsed)
        else:
            df = pd.read_csv(io.BytesIO(file_bytes), dtype=str, keep_default_na=False)
            rows = _parse_single_df(df, default_group, sheet_name='csv', row_offset=0)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f'No se pudo leer el archivo: {e}')

    if not rows:
        raise HTTPException(400, 'El archivo no contiene filas procesables (verifique que incluya una columna de correo electrónico).')
    if len(rows) > MAX_ROWS:
        raise HTTPException(400, f'El archivo excede el máximo de {MAX_ROWS} filas.')
    return rows


# ── Dedup analysis ───────────────────────────────────────────────
async def _analyze_rows(rows: List[dict]) -> List[dict]:
    """For each row, decide action = 'create' | 'reactivate' | 'error' | 'duplicate_in_file'."""
    # 1) mark duplicates *within* the uploaded file
    seen_emails: dict = {}
    seen_phones: dict = {}
    for r in rows:
        if 'error' in r:
            r['action'] = 'error'
            continue
        email_key = r['email']
        phone_key = r.get('phone') or ''
        if email_key in seen_emails:
            r['action'] = 'duplicate_in_file'
            r['conflict'] = f"Email ya aparece en la fila {seen_emails[email_key]}"
            continue
        if phone_key and phone_key in seen_phones:
            r['action'] = 'duplicate_in_file'
            r['conflict'] = f"Teléfono ya aparece en la fila {seen_phones[phone_key]}"
            continue
        seen_emails[email_key] = r['row_number']
        if phone_key:
            seen_phones[phone_key] = r['row_number']

    # 2) match against existing DB users
    emails_to_check = [r['email'] for r in rows if r.get('action') not in ('error', 'duplicate_in_file')]
    if emails_to_check:
        existing_cur = db.users.find(
            {'email': {'$in': emails_to_check}},
            {'_id': 0, 'id': 1, 'email': 1, 'name': 1, 'phone': 1, 'country': 1, 'account_status': 1}
        )
        existing_map = {u['email']: u async for u in existing_cur}
    else:
        existing_map = {}

    for r in rows:
        if 'action' in r:
            continue
        match = existing_map.get(r['email'])
        if match:
            r['action'] = 'reactivate'
            r['existing_user_id'] = match['id']
            r['existing_name'] = match.get('name')
        else:
            r['action'] = 'create'
    return rows


# ── Summary builder ──────────────────────────────────────────────
def _build_summary(rows: List[dict]) -> dict:
    summary = {
        'total_rows':       len(rows),
        'new_profiles':     sum(1 for r in rows if r.get('action') == 'create'),
        'reactivated':      sum(1 for r in rows if r.get('action') == 'reactivate'),
        'duplicates_in_file': sum(1 for r in rows if r.get('action') == 'duplicate_in_file'),
        'errors':           sum(1 for r in rows if r.get('action') == 'error'),
        'by_group':         {},
    }
    for r in rows:
        if r.get('action') in ('error', 'duplicate_in_file'):
            continue
        g = r.get('group') or 'latinos'
        summary['by_group'].setdefault(g, 0)
        summary['by_group'][g] += 1
    return summary


# ══════════════════════════════════════════════════════════════════
#  ADMIN: Preview (dry run)
# ══════════════════════════════════════════════════════════════════

@router.post("/admin/client-import/preview")
async def preview_import(
    file: UploadFile = File(...),
    default_group: str = Form('latinos'),
    admin: dict = Depends(get_admin_user),
):
    """Parse the uploaded sheet and return a dedup analysis WITHOUT
    touching the database. Creates a temp job record that can be
    committed with /execute/{job_id} within the next 60 minutes."""
    content = await file.read()
    if not content:
        raise HTTPException(400, 'Archivo vacío')
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, 'Archivo demasiado grande (>10 MB)')

    default_group_norm = _normalize_group(default_group, 'latinos')
    rows = _parse_spreadsheet(content, file.filename or '', default_group_norm)
    rows = await _analyze_rows(rows)
    summary = _build_summary(rows)

    job = {
        'id': str(uuid.uuid4()),
        'filename':      file.filename,
        'default_group': default_group_norm,
        'status':        'preview',  # -> 'executed' once committed
        'rows':          rows,
        'summary':       summary,
        'created_by':    admin.get('email'),
        'created_at':    _now_iso(),
        'executed_at':   None,
    }
    await db.client_import_jobs.insert_one(job)
    job_out = {k: v for k, v in job.items() if k != '_id'}
    return {'ok': True, 'job_id': job['id'], 'summary': summary, 'rows': rows, 'job': job_out}


# ══════════════════════════════════════════════════════════════════
#  ADMIN: Execute commit
# ══════════════════════════════════════════════════════════════════

@router.post("/admin/client-import/execute/{job_id}")
async def execute_import(job_id: str, admin: dict = Depends(get_admin_user)):
    job = await db.client_import_jobs.find_one({'id': job_id})
    if not job:
        raise HTTPException(404, 'Job no encontrado')
    if job['status'] == 'executed':
        raise HTTPException(400, 'Esta importación ya fue ejecutada')

    rows = job['rows']
    # Sort: priority groups first, then rest, preserving original order inside
    rows_sorted = sorted(
        rows,
        key=lambda r: (0 if r.get('group') in PRIORITY_GROUPS else 1, r.get('row_number', 0))
    )

    hashed_temp = hash_password(TEMP_PASSWORD)
    created_count = 0
    reactivated_count = 0
    skipped_count = 0
    errors_log: List[dict] = []

    for r in rows_sorted:
        action = r.get('action')
        if action in ('error', 'duplicate_in_file'):
            skipped_count += 1
            continue

        open_token = str(uuid.uuid4())
        import_meta = {
            'import_job_id':   job['id'],
            'imported_at':     _now_iso(),
            'imported_from':   job.get('filename'),
            'import_group':    r.get('group') or 'latinos',
            'import_comments': r.get('comments') or None,
            'import_identification': r.get('identification') or None,
            'legacy_balance':  r.get('balance') or 0.0,
            'email_open_token': open_token,
        }

        try:
            if action == 'create':
                user_id = str(uuid.uuid4())
                doc = {
                    'id':       user_id,
                    'name':     r['name'],
                    'email':    r['email'],
                    'phone':    r.get('phone') or None,
                    'country':  r.get('country') or None,
                    'password': hashed_temp,
                    'role':     'user',
                    'verification_status': 'unverified',
                    'account_status': 'reactivated',
                    'is_reactivated': True,
                    'must_change_password': True,
                    'reactivated_at': _now_iso(),
                    'created_at': _now_iso(),
                    'balance':  r.get('balance') or 0.0,
                    'is_online': False,
                    'engagement': {
                        'email_opened_at':          None,
                        'first_login_at':           None,
                        'password_changed_at':      None,
                        'verification_started_at':  None,
                        'last_withdraw_request_at': None,
                    },
                    **import_meta,
                }
                await db.users.insert_one(doc)
                created_count += 1
                r['committed_user_id'] = user_id

                # Auto-provision FULL financial structure (accounts + wallet + KYC defaults + seed history)
                from services.accounts_lifecycle import provision_full_user_finance
                await provision_full_user_finance(user_id, seed_balance_eur=r.get('balance') or 0.0)

            elif action == 'reactivate':
                existing = await db.users.find_one({'email': r['email']}, {'_id': 0})
                if not existing:  # race-safe fallback
                    skipped_count += 1
                    errors_log.append({'row_number': r['row_number'], 'email': r['email'], 'reason': 'Usuario desapareció entre preview y execute'})
                    continue

                set_fields: dict = {
                    'account_status': 'reactivated',
                    'is_reactivated': True,
                    'reactivated_at': _now_iso(),
                    **import_meta,
                }
                # Fill ONLY missing fields (preserve everything existing)
                if not existing.get('phone') and r.get('phone'):
                    set_fields['phone'] = r['phone']
                if not existing.get('country') and r.get('country'):
                    set_fields['country'] = r['country']
                # Keep engagement as-is if present; otherwise seed empty
                if not existing.get('engagement'):
                    set_fields['engagement'] = {
                        'email_opened_at':          None,
                        'first_login_at':           None,
                        'password_changed_at':      None,
                        'verification_started_at':  None,
                        'last_withdraw_request_at': None,
                    }

                await db.users.update_one({'id': existing['id']}, {'$set': set_fields})
                reactivated_count += 1
                r['committed_user_id'] = existing['id']

                # Self-heal: ensure both internal accounts + wallet + history exist for legacy users
                from services.accounts_lifecycle import provision_full_user_finance
                await provision_full_user_finance(existing['id'])

            # Email — fire-and-forget, never blocks
            login_url = f"{APP_BASE_URL}/login?reactivated=1"
            track_url = f"{APP_BASE_URL}/api/client-import/track/open/{open_token}.png"
            html = get_email_template(
                _build_reactivation_email_html(r['name'], login_url, track_url),
                'Su cuenta ha sido reactivada',
            )
            send_email_background(r['email'], 'Su cuenta ha sido reactivada', html)

        except Exception as e:
            logging.exception('Client import row failed')
            errors_log.append({'row_number': r.get('row_number'), 'email': r.get('email'), 'reason': str(e)})

    # Update job with final result
    final_summary = {
        **job['summary'],
        'executed_created':     created_count,
        'executed_reactivated': reactivated_count,
        'executed_skipped':     skipped_count,
        'execution_errors':     errors_log,
    }
    await db.client_import_jobs.update_one(
        {'id': job_id},
        {'$set': {
            'status':      'executed',
            'executed_at': _now_iso(),
            'executed_by': admin.get('email'),
            'rows':        rows_sorted,
            'summary':     final_summary,
        }},
    )
    return {'ok': True, 'summary': final_summary}


# ══════════════════════════════════════════════════════════════════
#  ADMIN: History
# ══════════════════════════════════════════════════════════════════

@router.get("/admin/client-import/jobs")
async def list_jobs(limit: int = 50, admin: dict = Depends(get_admin_user)):
    cur = db.client_import_jobs.find(
        {}, {'_id': 0, 'rows': 0}  # drop heavy field from list view
    ).sort('created_at', -1).limit(min(limit, 200))
    items = await cur.to_list(length=200)
    return {'items': items, 'count': len(items)}


@router.get("/admin/client-import/jobs/{job_id}")
async def get_job(job_id: str, admin: dict = Depends(get_admin_user)):
    job = await db.client_import_jobs.find_one({'id': job_id}, {'_id': 0})
    if not job:
        raise HTTPException(404, 'Job no encontrado')

    # Enrich rows with current engagement data from users collection
    emails = [r['email'] for r in job.get('rows', []) if r.get('email')]
    engagement_map = {}
    if emails:
        cur = db.users.find(
            {'email': {'$in': emails}},
            {'_id': 0, 'email': 1, 'engagement': 1, 'is_reactivated': 1,
             'account_status': 1, 'must_change_password': 1, 'verification_status': 1,
             'first_login_at': 1, 'last_active': 1}
        )
        async for u in cur:
            engagement_map[u['email']] = u

    enriched_rows = []
    for r in job.get('rows', []):
        live = engagement_map.get(r.get('email', ''), {})
        enriched_rows.append({
            **r,
            'live': {
                'account_status':     live.get('account_status'),
                'verification_status': live.get('verification_status'),
                'must_change_password': live.get('must_change_password'),
                'first_login_at':     live.get('first_login_at'),
                'last_active':        live.get('last_active'),
                'engagement':         live.get('engagement') or {},
            }
        })
    job['rows'] = enriched_rows
    return job


# ══════════════════════════════════════════════════════════════════
#  ADMIN: Analytics — conversion funnel + segmented campaigns
# ══════════════════════════════════════════════════════════════════

FUNNEL_STAGES = [
    ('emailed',           'Correo enviado'),
    ('opened',            'Correo abierto'),
    ('logged_in',         'Inició sesión'),
    ('password_changed',  'Cambió contraseña'),
    ('kyc_completed',     'Completó KYC'),
    ('withdraw_requested', 'Solicitó retiro'),
]


def _classify_user_stage(user: dict) -> str:
    """Return the furthest funnel stage this user has reached."""
    eng = user.get('engagement') or {}
    if eng.get('last_withdraw_request_at'):
        return 'withdraw_requested'
    if user.get('verification_status') == 'verified':
        return 'kyc_completed'
    if eng.get('password_changed_at') or not user.get('must_change_password'):
        # 'must_change_password' was True at import → flipping it off means the change happened
        if user.get('is_reactivated') and (eng.get('password_changed_at') or user.get('password_changed_at')):
            return 'password_changed'
    if user.get('first_login_at'):
        return 'logged_in'
    if eng.get('email_opened_at'):
        return 'opened'
    return 'emailed'


async def _compute_funnel(match_filter: dict) -> dict:
    """Aggregate users matching ``match_filter`` into the 5-stage funnel,
    with per-group breakdown. Users are counted at the FURTHEST stage
    they've reached (so each stage is cumulative: stage N >= stage N+1)."""
    cur = db.users.find(match_filter, {
        '_id': 0, 'id': 1, 'email': 1, 'import_group': 1, 'engagement': 1,
        'verification_status': 1, 'first_login_at': 1, 'is_reactivated': 1,
        'must_change_password': 1, 'password_changed_at': 1, 'import_job_id': 1,
    })
    users = [u async for u in cur]

    total = len(users)
    cumulative = {k: 0 for k, _ in FUNNEL_STAGES}
    by_group_cumulative: dict = {}
    order_idx = {k: i for i, (k, _) in enumerate(FUNNEL_STAGES)}

    for u in users:
        stage = _classify_user_stage(u)
        idx = order_idx[stage]
        # Count cumulative: if user reached stage N, count them in all stages 0..N
        for k, _ in FUNNEL_STAGES[: idx + 1]:
            cumulative[k] += 1
            g = u.get('import_group') or 'unknown'
            by_group_cumulative.setdefault(g, {k2: 0 for k2, _ in FUNNEL_STAGES})
            by_group_cumulative[g][k] += 1

    stages: list = []
    prev_count: int = 0
    for i, (key, label) in enumerate(FUNNEL_STAGES):
        count = cumulative[key]
        pct = round((count / total) * 100, 1) if total else 0.0
        drop_off_pct = 0.0
        if i > 0 and prev_count > 0:
            drop_off_pct = round(((prev_count - count) / prev_count) * 100, 1)
        stages.append({
            'key': key, 'label': label,
            'count': count, 'pct': pct, 'drop_off_pct': drop_off_pct,
        })
        prev_count = count

    # Sum total per group
    by_group = {}
    for g, counts in by_group_cumulative.items():
        g_total = counts['emailed']
        group_stages = []
        prev = 0
        for i, (key, label) in enumerate(FUNNEL_STAGES):
            c = counts[key]
            p = round((c / g_total) * 100, 1) if g_total else 0.0
            d = round(((prev - c) / prev) * 100, 1) if i > 0 and prev > 0 else 0.0
            group_stages.append({'key': key, 'label': label, 'count': c, 'pct': p, 'drop_off_pct': d})
            prev = c
        by_group[g] = {'total': g_total, 'stages': group_stages}

    return {
        'total': total,
        'stages': stages,
        'by_group': by_group,
        'last_sync': _now_iso(),
    }


@router.get("/admin/client-import/funnel")
async def get_funnel(
    job_id: Optional[str] = None,
    group: Optional[str] = None,
    admin: dict = Depends(get_admin_user),
):
    """Real-time conversion funnel for imported users.
    Filters: job_id (single import), group (only that segment)."""
    match: dict = {'import_job_id': {'$exists': True, '$ne': None}}
    if job_id:
        match['import_job_id'] = job_id
    if group:
        match['import_group'] = _normalize_group(group, group)
    return await _compute_funnel(match)


# ── Segmented campaigns (re-engagement) ──────────────────────────
CAMPAIGN_SEGMENTS = {
    'not_opened':      {'label': 'No abrieron el correo',        'subject': 'Recordatorio · Su cuenta LIONSBIT sigue habilitada'},
    'opened_no_login': {'label': 'Abrieron pero no iniciaron sesión', 'subject': 'Complete el acceso a su cuenta reactivada'},
    'no_kyc':          {'label': 'Iniciaron sesión sin completar KYC', 'subject': 'Finalice su verificación para desbloquear retiros'},
}


def _segment_match_fragment(segment: str) -> dict:
    """Return the Mongo fragment that selects users in this segment."""
    if segment == 'not_opened':
        return {'engagement.email_opened_at': {'$in': [None, '', False]}}
    if segment == 'opened_no_login':
        return {
            'engagement.email_opened_at': {'$nin': [None, '', False]},
            'first_login_at': {'$in': [None, '']},
        }
    if segment == 'no_kyc':
        return {
            'first_login_at': {'$nin': [None, '']},
            'verification_status': {'$ne': 'verified'},
        }
    raise HTTPException(400, f"Segmento inválido: {segment}. Usa uno de {list(CAMPAIGN_SEGMENTS)}")


@router.get("/admin/client-import/segment-preview")
async def segment_preview(
    segment: str,
    job_id: Optional[str] = None,
    group: Optional[str] = None,
    admin: dict = Depends(get_admin_user),
):
    """Return the count of users that would be targeted by this campaign
    (dry-run, no emails sent)."""
    if segment not in CAMPAIGN_SEGMENTS:
        raise HTTPException(400, f"Segmento inválido: {segment}")

    base = {'import_job_id': {'$exists': True, '$ne': None}}
    base.update(_segment_match_fragment(segment))
    if job_id:
        base['import_job_id'] = job_id
    if group:
        base['import_group'] = _normalize_group(group, group)

    count = await db.users.count_documents(base)
    # Sample 5 emails so admin can preview
    sample_cur = db.users.find(base, {'_id': 0, 'email': 1, 'name': 1, 'import_group': 1}).limit(5)
    sample = await sample_cur.to_list(length=5)
    return {
        'segment': segment,
        'label': CAMPAIGN_SEGMENTS[segment]['label'],
        'suggested_subject': CAMPAIGN_SEGMENTS[segment]['subject'],
        'count': count,
        'sample': sample,
    }


@router.post("/admin/client-import/resend-campaign")
async def resend_campaign(payload: dict, admin: dict = Depends(get_admin_user)):
    """Send a re-engagement email to a filtered segment.
    Payload: { segment: 'not_opened'|'opened_no_login'|'no_kyc',
               job_id?: str, group?: str,
               subject?: str, intro?: str }"""
    segment = (payload.get('segment') or '').strip()
    if segment not in CAMPAIGN_SEGMENTS:
        raise HTTPException(400, f"Segmento inválido: {segment}")

    base = {'import_job_id': {'$exists': True, '$ne': None}}
    base.update(_segment_match_fragment(segment))
    if payload.get('job_id'):
        base['import_job_id'] = payload['job_id']
    if payload.get('group'):
        base['import_group'] = _normalize_group(payload['group'], payload['group'])

    subject = (payload.get('subject') or CAMPAIGN_SEGMENTS[segment]['subject']).strip()[:200]
    intro   = (payload.get('intro') or '').strip()[:600]

    users_cur = db.users.find(base, {'_id': 0, 'id': 1, 'email': 1, 'name': 1, 'email_open_token': 1})
    targets = await users_cur.to_list(length=5000)

    login_url = f"{APP_BASE_URL}/login?reactivated=1"
    sent = 0
    for u in targets:
        try:
            token = u.get('email_open_token') or str(uuid.uuid4())
            if not u.get('email_open_token'):
                # back-fill token so re-engagement opens still register
                await db.users.update_one({'id': u['id']}, {'$set': {'email_open_token': token}})
            track_url = f"{APP_BASE_URL}/api/client-import/track/open/{token}.png"
            html = get_email_template(
                _build_reengagement_email_html(u.get('name') or 'Cliente', login_url, track_url, segment, intro),
                subject,
            )
            send_email_background(u['email'], subject, html)
            sent += 1
        except Exception as e:
            logging.warning(f"resend failed for {u.get('email')}: {e}")

    # Log the campaign for audit
    campaign_doc = {
        'id': str(uuid.uuid4()),
        'segment': segment,
        'job_id': payload.get('job_id'),
        'group':  payload.get('group'),
        'subject': subject,
        'intro': intro,
        'targets_matched': len(targets),
        'emails_sent': sent,
        'triggered_by': admin.get('email'),
        'triggered_at': _now_iso(),
    }
    await db.client_import_campaigns.insert_one(campaign_doc)
    campaign_doc.pop('_id', None)
    return {'ok': True, 'sent': sent, 'matched': len(targets), 'campaign': campaign_doc}


@router.get("/admin/client-import/campaigns")
async def list_campaigns(limit: int = 50, admin: dict = Depends(get_admin_user)):
    cur = db.client_import_campaigns.find({}, {'_id': 0}).sort('triggered_at', -1).limit(min(limit, 200))
    items = await cur.to_list(length=200)
    return {'items': items, 'count': len(items)}


# ══════════════════════════════════════════════════════════════════
#  PUBLIC: Email open tracking pixel
# ══════════════════════════════════════════════════════════════════

@router.get("/client-import/track/open/{token}.png")
async def track_email_open(token: str):
    """1×1 transparent PNG. Records the first time this token is opened."""
    try:
        user = await db.users.find_one({'email_open_token': token}, {'_id': 0, 'id': 1, 'email': 1, 'engagement': 1})
        if user and not (user.get('engagement') or {}).get('email_opened_at'):
            now = _now_iso()
            await db.users.update_one(
                {'id': user['id']},
                {'$set': {'engagement.email_opened_at': now}},
            )
    except Exception as e:
        logging.warning(f'track_email_open error: {e}')
    return Response(
        content=_PIXEL_PNG,
        media_type='image/png',
        headers={
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
        },
    )


# ── Email template (inline) ──────────────────────────────────────
def _build_reactivation_email_html(user_name: str, login_url: str, tracker_url: str) -> str:
    """Content block injected into get_email_template()."""
    safe_name = (user_name or 'Cliente').split('@')[0]
    return f"""
    <div style="padding: 28px 28px 8px;">
        <h1 style="color:#ffffff; font-size:22px; font-weight:700; margin:0 0 6px; letter-spacing:-0.02em;">
            Su cuenta ha sido reactivada
        </h1>
        <p style="color:#94a3b8; font-size:13px; margin:0 0 20px;">Departamento de Soporte · LIONSBIT VERIFICACION</p>

        <p style="color:#cbd5e1; font-size:14px; line-height:1.7; margin:0 0 14px;">
            Estimado {safe_name},
        </p>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.7; margin:0 0 14px;">
            Le informamos que su cuenta ha sido habilitada nuevamente tras el proceso de reestructuración operativa de la plataforma.
        </p>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.7; margin:0 0 18px;">
            Ya puede acceder utilizando su correo histórico, completar su verificación de perfil y continuar con su proceso de retiro de fondos de forma segura.
        </p>

        <table role="presentation" style="width:100%; margin:18px 0 22px; border-collapse:separate; border-spacing:0;">
            <tr>
                <td style="background:rgba(34,211,238,0.08); border:1px solid rgba(34,211,238,0.35); border-radius:10px; padding:14px 16px;">
                    <p style="color:#22d3ee; font-size:10px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; margin:0 0 6px;">Acceso inicial</p>
                    <p style="color:#ffffff; font-size:13px; margin:0 0 4px;">Correo registrado <span style="color:#64748b;">+</span> contraseña temporal asignada</p>
                    <p style="color:#22d3ee; font-family:'SF Mono', monospace; font-size:15px; font-weight:700; letter-spacing:0.04em; margin:8px 0 0;">
                        {TEMP_PASSWORD}
                    </p>
                </td>
            </tr>
        </table>

        <p style="color:#cbd5e1; font-size:14px; line-height:1.7; margin:0 0 14px;">
            <strong style="color:#ffffff;">Por seguridad, deberá cambiarla en su primer acceso.</strong>
        </p>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.7; margin:0 0 22px;">
            Los clientes que completen primero su validación tendrán <strong style="color:#22d3ee;">prioridad en el procesamiento de retiros</strong>.
        </p>

        <table role="presentation" style="margin:28px 0;">
            <tr>
                <td style="background:linear-gradient(135deg,#0891b2,#06b6d4); border-radius:10px;">
                    <a href="{login_url}" target="_blank" style="display:inline-block; padding:14px 28px; color:#ffffff; font-size:14px; font-weight:700; text-decoration:none; letter-spacing:0.04em;">
                        Acceder a mi cuenta →
                    </a>
                </td>
            </tr>
        </table>

        <p style="color:#64748b; font-size:12px; line-height:1.7; margin:22px 0 8px;">
            En caso de cualquier duda, puede contactarnos desde el área de soporte o respondiendo directamente a este correo.
        </p>
        <p style="color:#94a3b8; font-size:13px; margin:16px 0 0;">
            Atentamente,<br><strong style="color:#cbd5e1;">Departamento de Soporte</strong>
        </p>
    </div>
    <img src="{tracker_url}" width="1" height="1" alt="" style="display:block; border:0;" />
    """


# ── Re-engagement email (segmented resend) ───────────────────────
def _build_reengagement_email_html(user_name: str, login_url: str, tracker_url: str, segment: str, intro: str = '') -> str:
    safe_name = (user_name or 'Cliente').split('@')[0]

    # Per-segment hook copy
    HOOKS = {
        'not_opened': {
            'title':   'Le recordamos que su cuenta está habilitada',
            'badge':   'Recordatorio · Cuenta reactivada',
            'hook':    'Hemos notado que aún no ha accedido a su cuenta tras la reactivación. Sus fondos siguen disponibles y puede ingresar utilizando su correo histórico y la contraseña temporal asignada.',
            'cta':     'Acceder ahora',
        },
        'opened_no_login': {
            'title':   'Complete el acceso a su cuenta',
            'badge':   'Paso pendiente · Iniciar sesión',
            'hook':    'Su cuenta está preparada y esperando su primer acceso. Solo faltan 30 segundos para entrar, actualizar su contraseña y continuar con su proceso.',
            'cta':     'Iniciar sesión',
        },
        'no_kyc': {
            'title':   'Finalice su verificación para desbloquear retiros',
            'badge':   'Paso pendiente · Verificación KYC',
            'hook':    'Ha iniciado sesión correctamente. Para habilitar el procesamiento de retiros, complete su verificación de identidad (KYC). Los clientes verificados primero tienen prioridad de validación.',
            'cta':     'Completar verificación',
        },
    }
    hook = HOOKS.get(segment, HOOKS['not_opened'])
    custom = f'<p style="color:#cbd5e1; font-size:14px; line-height:1.7; margin:0 0 14px;">{intro}</p>' if intro else ''

    return f"""
    <div style="padding: 28px 28px 8px;">
        <p style="color:#22d3ee; font-size:10px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; margin:0 0 6px;">
            {hook['badge']}
        </p>
        <h1 style="color:#ffffff; font-size:22px; font-weight:700; margin:0 0 6px; letter-spacing:-0.02em;">
            {hook['title']}
        </h1>
        <p style="color:#94a3b8; font-size:13px; margin:0 0 20px;">Departamento de Soporte · LIONSBIT VERIFICACION</p>

        <p style="color:#cbd5e1; font-size:14px; line-height:1.7; margin:0 0 14px;">
            Estimado {safe_name},
        </p>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.7; margin:0 0 14px;">
            {hook['hook']}
        </p>
        {custom}

        <table role="presentation" style="width:100%; margin:18px 0 22px; border-collapse:separate; border-spacing:0;">
            <tr>
                <td style="background:rgba(34,211,238,0.08); border:1px solid rgba(34,211,238,0.35); border-radius:10px; padding:14px 16px;">
                    <p style="color:#22d3ee; font-size:10px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; margin:0 0 6px;">Acceso rápido</p>
                    <p style="color:#ffffff; font-size:13px; margin:0 0 4px;">Correo registrado <span style="color:#64748b;">+</span> contraseña temporal</p>
                    <p style="color:#22d3ee; font-family:'SF Mono', monospace; font-size:15px; font-weight:700; letter-spacing:0.04em; margin:8px 0 0;">
                        {TEMP_PASSWORD}
                    </p>
                </td>
            </tr>
        </table>

        <table role="presentation" style="margin:20px 0;">
            <tr>
                <td style="background:linear-gradient(135deg,#0891b2,#06b6d4); border-radius:10px;">
                    <a href="{login_url}" target="_blank" style="display:inline-block; padding:14px 28px; color:#ffffff; font-size:14px; font-weight:700; text-decoration:none; letter-spacing:0.04em;">
                        {hook['cta']} →
                    </a>
                </td>
            </tr>
        </table>

        <p style="color:#64748b; font-size:12px; line-height:1.7; margin:20px 0 8px;">
            Si necesita asistencia, responda directamente a este correo o contacte al área de soporte.
        </p>
        <p style="color:#94a3b8; font-size:13px; margin:16px 0 0;">
            Atentamente,<br><strong style="color:#cbd5e1;">Departamento de Soporte</strong>
        </p>
    </div>
    <img src="{tracker_url}" width="1" height="1" alt="" style="display:block; border:0;" />
    """
