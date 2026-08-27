from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import Response, JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import asyncio
import re
import os
import logging
import uuid
from datetime import datetime, timezone, timedelta
import resend
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
import httpx
import jwt

from config import (
    db, client, RESEND_API_KEY, ADMIN_EMAIL, TAX_AMOUNT,
    SafeJSONResponse
)
from services.auth import hash_password
from services.notifications import create_notification
from services.scoring import process_user_scoring, process_user_reminders
from services.email import (
    send_email, send_email_background, get_email_template,
    send_tax_reminder_email, send_withdrawal_rejected_email
)
from services.helpers import ensure_government_treasury
from routes.trading_bot import run_bot_tick
from routes import register_routes

# ==================== APP SETUP ====================
resend.api_key = RESEND_API_KEY

app = FastAPI(title="LIONSBIT VERIFICACION API", default_response_class=SafeJSONResponse)
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Include the router in the main app
register_routes(api_router)
app.include_router(api_router)

# =============================================================================
# CORS — bullet-proof config to survive proxies, ingress quirks, and crashes.
# =============================================================================
# Allow-list: paylionsbit.es (+ subdomains) · all Emergent hosts · localhost.
# We compile a single regex once and reuse it both for the standard
# CORSMiddleware AND a fail-safe middleware that GUARANTEES headers are
# attached to EVERY response, including 5xx errors and crashes — so the
# browser never sees a CORS error masquerading as a real outage.
# =============================================================================
CORS_ORIGIN_RE = re.compile(
    r'^https?://'
    r'(localhost(:\d+)?|127\.0\.0\.1(:\d+)?'
    r'|([a-z0-9-]+\.)*paylionsbit\.es'
    r'|([a-z0-9-]+\.)*emergent\.host'
    r'|([a-z0-9-]+\.)*emergentagent\.com)$'
)
EXTRA_ORIGINS = [
    o.strip()
    for o in (os.environ.get('CORS_ORIGINS') or '').split(',')
    if o.strip() and o.strip() != '*'
]


def _origin_allowed(origin: str) -> bool:
    if not origin:
        return False
    if origin in EXTRA_ORIGINS:
        return True
    return bool(CORS_ORIGIN_RE.match(origin))


class CORSFailSafeMiddleware(BaseHTTPMiddleware):
    """Guarantees CORS headers on EVERY response — including 5xx and crashes.

    The standard Starlette CORSMiddleware ONLY attaches headers to successful
    responses; if a route raises, the browser sees a bare 500 with no CORS
    header and reports it as "blocked by CORS policy". This middleware wraps
    every request and explicitly handles:
      • OPTIONS preflight  → returns 200 with the proper CORS headers
      • Successful response → injects/overwrites CORS headers
      • Uncaught exceptions → returns 500 JSON WITH CORS headers attached
    """

    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get('origin', '')
        allowed = _origin_allowed(origin)

        # Preflight — answer immediately so it always succeeds
        if request.method == 'OPTIONS' and 'access-control-request-method' in request.headers:
            return self._preflight_response(origin if allowed else '')

        try:
            response = await call_next(request)
        except Exception as exc:  # pragma: no cover
            logger.exception('Unhandled exception during request: %s', exc)
            response = JSONResponse(
                status_code=500,
                content={'detail': 'Internal server error'},
            )

        if allowed:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Vary'] = 'Origin'
        return response

    @staticmethod
    def _preflight_response(origin: str) -> Response:
        headers = {
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Max-Age': '3600',
            'Vary': 'Origin',
        }
        if origin:
            headers['Access-Control-Allow-Origin'] = origin
            headers['Access-Control-Allow-Credentials'] = 'true'
        return Response(status_code=200, headers=headers)


# Order matters: Starlette runs middlewares in REVERSE order they're added.
# Adding the fail-safe last means it runs FIRST on requests and LAST on
# responses — exactly where we want to guarantee the headers stick.
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=EXTRA_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_RE.pattern,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)
app.add_middleware(CORSFailSafeMiddleware)


# =============================================================================
# Admin Request Logger — captures every admin API call (path, status, ms,
# admin_id, IP). Used by /admin/system-status panel.
# =============================================================================
import time as _t

class AdminRequestLoggerMiddleware(BaseHTTPMiddleware):
    """Stores a lightweight record of every /api/admin/* request to MongoDB.
    Skips OPTIONS preflight + the logger's own collection reads.
    Fire-and-forget — never blocks the request even if DB write fails.
    """
    async def dispatch(self, request, call_next):
        path = request.url.path
        method = request.method
        is_admin_call = path.startswith('/api/admin/') and method != 'OPTIONS'
        start = _t.perf_counter()
        response = None
        try:
            response = await call_next(request)
            status = response.status_code
        except Exception:
            status = 500
            raise
        finally:
            if is_admin_call:
                try:
                    elapsed_ms = round((_t.perf_counter() - start) * 1000, 1)
                    ip = request.headers.get('x-forwarded-for', '').split(',')[0].strip() or (
                        request.client.host if request.client else None
                    )
                    admin_id = None
                    auth = request.headers.get('authorization', '')
                    if auth.startswith('Bearer '):
                        try:
                            from config import JWT_SECRET as _JS
                            decoded = jwt.decode(auth[7:], _JS, algorithms=['HS256'])
                            admin_id = decoded.get('user_id') or decoded.get('id')
                        except Exception:
                            admin_id = None
                    doc = {
                        'id': str(uuid.uuid4()),
                        'path': path,
                        'method': method,
                        'status': status,
                        'elapsed_ms': elapsed_ms,
                        'admin_id': admin_id,
                        'ip': ip,
                        'created_at': datetime.now(timezone.utc).isoformat(),
                    }
                    asyncio.create_task(_safe_insert_admin_log(doc))
                except Exception:
                    pass
        return response


async def _safe_insert_admin_log(doc):
    try:
        await db.admin_request_logs.insert_one(doc)
    except Exception:
        pass


app.add_middleware(AdminRequestLoggerMiddleware)

# Public healthcheck — no auth, no DB calls, no side-effects. Designed to
# answer in <5ms even under heavy load so the frontend ConnectionIndicator
# always gets a fast, reliable signal.
@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": "lionsbit-api",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# Capture process boot time once for uptime calculation
_BOOT_TIME = datetime.now(timezone.utc)
_API_VERSION = "1.5.0"


@app.get("/api/health/full")
async def health_full():
    """Full diagnostic health check: DB ping, latency, uptime, memory, maintenance flag.
    Designed to be polled by the admin system-status panel and the resilient frontend.
    """
    import time
    out: dict = {
        "status": "ok",
        "service": "lionsbit-api",
        "version": _API_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": int((datetime.now(timezone.utc) - _BOOT_TIME).total_seconds()),
        "boot_at": _BOOT_TIME.isoformat(),
    }

    # 1. DB ping with latency
    try:
        t0 = time.perf_counter()
        await db.command("ping")
        out["db"] = {
            "status": "ok",
            "latency_ms": round((time.perf_counter() - t0) * 1000, 2),
        }
    except Exception as exc:
        out["status"] = "degraded"
        out["db"] = {"status": "fail", "error": str(exc)[:200]}

    # 2. Maintenance flag (admin can toggle from /admin/system-status)
    try:
        flag_doc = await db.system_flags.find_one({"key": "maintenance"}, {"_id": 0})
        if flag_doc and flag_doc.get("enabled"):
            out["maintenance"] = {
                "enabled": True,
                "message": flag_doc.get("message") or "Sistema en mantenimiento",
                "started_at": flag_doc.get("started_at"),
                "estimated_end": flag_doc.get("estimated_end"),
            }
            out["status"] = "maintenance"
        else:
            out["maintenance"] = {"enabled": False}
    except Exception:
        out["maintenance"] = {"enabled": False}

    # 3. Memory snapshot (best-effort, no hard dep on psutil)
    try:
        import resource
        ru = resource.getrusage(resource.RUSAGE_SELF)
        out["memory"] = {"rss_kb": ru.ru_maxrss}
    except Exception:
        pass

    return out

@app.on_event("startup")
async def startup_event():
    await ensure_government_treasury()
    await ensure_admin_users()
    # Start the scheduler for tax reminders and auto-rejection
    start_scheduler()

# ==================== SCHEDULER FOR TAX REMINDERS ====================

scheduler = AsyncIOScheduler()

def start_scheduler():
    """Start the background scheduler for tax payment reminders and auto-rejection"""
    from routes.crypto_monitor import check_crypto_payments
    scheduler.add_job(
        check_crypto_payments,
        IntervalTrigger(minutes=2),
        id='crypto_payment_monitor',
        name='Detect crypto payments on blockchain',
        replace_existing=True
    )
    # Run every 15 hours for reminders
    scheduler.add_job(
        process_tax_reminders,
        IntervalTrigger(hours=15),
        id='tax_reminders',
        name='Send tax payment reminders',
        replace_existing=True
    )
    
    # Run every hour to check for 72-hour auto-rejection
    scheduler.add_job(
        process_auto_rejections,
        IntervalTrigger(hours=1),
        id='auto_rejections',
        name='Auto-reject expired withdrawals',
        replace_existing=True
    )
    
    # Run every 15 minutes to send balance notifications (daily budget: 30 emails)
    scheduler.add_job(
        process_balance_notifications,
        IntervalTrigger(minutes=15),
        id='balance_notifications',
        name='Send balance available notifications (max 30/day)',
        replace_existing=True
    )
    
    # Run every 30 minutes to check incomplete processes
    scheduler.add_job(
        process_incomplete_followups,
        IntervalTrigger(minutes=30),
        id='incomplete_followups',
        name='Follow up on incomplete processes',
        replace_existing=True
    )

    # Run every hour to recalculate user scoring
    scheduler.add_job(
        process_user_scoring,
        IntervalTrigger(hours=1),
        id='user_scoring',
        name='Recalculate user interest scoring',
        replace_existing=True
    )
    
    # Run every 12 hours to send process reminders
    scheduler.add_job(
        process_user_reminders,
        IntervalTrigger(hours=12),
        id='user_reminders',
        name='Send process completion reminders (12h)',
        replace_existing=True
    )

    # Run every 24 hours to send daily summary to admin
    scheduler.add_job(
        process_daily_admin_summary,
        IntervalTrigger(hours=24),
        id='daily_admin_summary',
        name='Send daily activity summary to admin',
        replace_existing=True
    )

    # Run every 60s to tick the Trading Bot (Demo) for all enabled users
    scheduler.add_job(
        run_bot_tick,
        IntervalTrigger(seconds=60),
        id='trading_bot_tick',
        name='Run trading bot decision tick (60s)',
        replace_existing=True
    )

    # Run every 60s to check platform health and fire Telegram alerts if degraded/down persists
    scheduler.add_job(
        process_health_watchdog,
        IntervalTrigger(seconds=60),
        id='health_watchdog',
        name='Platform health watchdog (Telegram alerts)',
        replace_existing=True
    )

    # Run every 24h to send monthly compliance statements (idempotent: only sends once per 25 days per user)
    from routes.mt5 import run_monthly_compliance_statements
    scheduler.add_job(
        run_monthly_compliance_statements,
        IntervalTrigger(hours=24),
        id='compliance_monthly_statement',
        name='Monthly broker regulatory verification statement',
        replace_existing=True
    )

    # Run every hour to send onboarding funnel emails (steps 2 & 3) to admin-created users
    from services.onboarding_funnel import run_onboarding_funnel_tick
    scheduler.add_job(
        run_onboarding_funnel_tick,
        IntervalTrigger(hours=1),
        id='onboarding_funnel_tick',
        name='Onboarding email funnel for admin-created users (24h step2, 72h step3)',
        replace_existing=True
    )

    # Daily reminder for users with incomplete withdrawal journey (>24h with
    # withdrawal_type set and no completed transaction). Sends at most one email
    # every 48h per user.
    from services.withdraw_journey_reminder import run_incomplete_withdraw_reminders
    scheduler.add_job(
        run_incomplete_withdraw_reminders,
        IntervalTrigger(hours=24),
        id='withdraw_journey_reminder',
        name='Friendly reminder for users with incomplete withdrawal journey',
        replace_existing=True
    )

    # Run daily to auto-advance 2 community in-process users to step 5 (Retirado).
    # First fire happens 60s after boot (catch-up), then every 24h. The function
    # itself is idempotent by UTC date so we never double-process a single day.
    from services.community_auto_advance import run_community_auto_advance_tick
    scheduler.add_job(
        run_community_auto_advance_tick,
        IntervalTrigger(hours=24),
        id='community_auto_advance',
        name='Auto-advance 2 community users/day to Retirado',
        next_run_time=datetime.now(timezone.utc) + timedelta(seconds=60),
        replace_existing=True
    )

    # Keep-alive self-ping every 4 minutes to prevent cold starts in production.
    scheduler.add_job(
        process_self_keepalive,
        IntervalTrigger(minutes=4),
        id='self_keepalive',
        name='Self-ping /api/health to keep instance warm',
        replace_existing=True,
    )

    # Service status checks every 5 minutes (detects incidents without page visits)
    from routes.service_status import run_status_checks
    scheduler.add_job(
        run_status_checks,
        IntervalTrigger(minutes=5),
        id='service_status_checks',
        name='Run service status checks + incident detection',
        next_run_time=datetime.now(timezone.utc) + timedelta(seconds=90),
        replace_existing=True,
    )

    # Smart email queue: retry quota-rejected emails every 15 minutes
    from services.email import process_email_queue
    scheduler.add_job(
        process_email_queue,
        IntervalTrigger(minutes=15),
        id='email_queue_retry',
        name='Retry quota-rejected emails from smart queue',
        replace_existing=True,
    )

    
    scheduler.start()
    logging.info("Scheduler started: Tax reminders (15h), auto-rejections (1h), balance notifications (15min, max 30/day), incomplete process follow-ups (30min), daily summary (24h), trading bot (60s), health watchdog (60s), self-keepalive (4min)")


async def process_self_keepalive():
    """Self-ping the public /api/health endpoint every 4 minutes.
    Prevents cold starts on serverless / spot-instance environments
    where idle backends get reaped. Also auto-cleans old admin logs.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get('http://localhost:8001/api/health')
            logging.info(f"[keepalive] self-ping status={r.status_code}")
    except Exception as exc:
        logging.warning(f"[keepalive] self-ping failed: {exc}")

    # Trim admin_request_logs older than 14 days to keep collection lean
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
        result = await db.admin_request_logs.delete_many({'created_at': {'$lt': cutoff}})
        if result.deleted_count > 0:
            logging.info(f"[keepalive] pruned {result.deleted_count} old admin logs (>14d)")
    except Exception:
        pass
    # Also trim client_errors older than 30 days
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        await db.client_errors.delete_many({'created_at': {'$lt': cutoff}})
    except Exception:
        pass


async def process_daily_admin_summary():
    """Send daily activity summary email to all admins"""
    logging.info("Running daily admin summary job...")
    try:
        now = datetime.now(timezone.utc)
        yesterday = (now - timedelta(hours=24)).isoformat()
        date_label = now.strftime("%d/%m/%Y")

        # Gather stats
        new_users = await db.users.count_documents({'created_at': {'$gte': yesterday}})
        logins_today = await db.login_history.count_documents({'logged_in_at': {'$gte': yesterday}})
        
        new_withdrawals = await db.transactions.count_documents({
            'transaction_type': 'withdraw', 'created_at': {'$gte': yesterday}
        })
        completed_withdrawals = await db.transactions.count_documents({
            'transaction_type': 'withdraw', 'status': 'completed', 'completed_at': {'$gte': yesterday}
        })
        pending_withdrawals = await db.transactions.count_documents({
            'transaction_type': 'withdraw', 'status': {'$in': ['pending', 'pending_tax', 'processing']}
        })
        
        tax_payments = await db.transactions.aggregate([
            {'$match': {'transaction_type': 'withdraw', 'tax_paid': {'$gt': 0}}},
            {'$group': {'_id': None, 'total': {'$sum': '$tax_paid'}}}
        ]).to_list(1)
        total_tax = tax_payments[0]['total'] if tax_payments else 0
        
        crypto_payments_count = await db.crypto_payments.count_documents({'created_at': {'$gte': yesterday}})
        
        kyc_submitted = await db.users.count_documents({
            'verification_status': 'pending_verification',
            'kyc_submitted_at': {'$gte': yesterday}
        })
        
        support_tickets = await db.support_tickets.count_documents({'created_at': {'$gte': yesterday}})
        
        total_users = await db.users.count_documents({})
        total_balance_agg = await db.accounts.aggregate([
            {'$group': {'_id': None, 'usd': {'$sum': '$balance_usd'}, 'eur': {'$sum': '$balance_eur'}}}
        ]).to_list(1)
        total_usd = total_balance_agg[0]['usd'] if total_balance_agg else 0
        total_eur = total_balance_agg[0]['eur'] if total_balance_agg else 0

        def stat_row(label, value, color="#e2e8f0"):
            return f"""
            <tr>
                <td style="color: #94a3b8; padding: 10px 15px; border-bottom: 1px solid #1e293b; font-size: 14px;">{label}</td>
                <td style="color: {color}; font-weight: bold; text-align: right; padding: 10px 15px; border-bottom: 1px solid #1e293b; font-size: 16px; font-family: 'Outfit', monospace;">{value}</td>
            </tr>"""

        content = f"""
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6;">
            <strong style="color: #1973B8;">Administrador</strong>, aquí está el resumen de actividad del día <strong>{date_label}</strong>:
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 20px 0;">
            <tr><td style="padding: 20px;">
                <p style="color: #1973B8; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 10px 0; font-weight: 600;">Actividad (últimas 24h)</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                    {stat_row("Nuevos registros", new_users, "#49A2E0")}
                    {stat_row("Inicios de sesión", logins_today)}
                    {stat_row("Solicitudes KYC", kyc_submitted, "#a78bfa")}
                    {stat_row("Tickets de soporte", support_tickets, "#fbbf24")}
                </table>
            </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 20px 0;">
            <tr><td style="padding: 20px;">
                <p style="color: #1973B8; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 10px 0; font-weight: 600;">Retiros</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                    {stat_row("Nuevos retiros (hoy)", new_withdrawals, "#f97316")}
                    {stat_row("Completados (hoy)", completed_withdrawals, "#22c55e")}
                    {stat_row("Pendientes (total)", pending_withdrawals, "#ef4444")}
                    {stat_row("Pagos crypto (hoy)", crypto_payments_count, "#8b5cf6")}
                </table>
            </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; margin: 20px 0;">
            <tr><td style="padding: 20px;">
                <p style="color: #1973B8; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 10px 0; font-weight: 600;">Estado General</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                    {stat_row("Total usuarios", total_users)}
                    {stat_row("Balance total USD", f"${total_usd:,.2f}", "#22c55e")}
                    {stat_row("Balance total EUR", f"€{total_eur:,.2f}", "#3b82f6")}
                    {stat_row("Tax recaudado (total)", f"${total_tax:,.2f}", "#f59e0b")}
                </table>
            </td></tr>
        </table>
        """

        html = get_email_template(content, f"Resumen Diario - {date_label}")
        await send_email(ADMIN_EMAIL, f"Resumen Diario {date_label} - LIONSBIT VERIFICACION", html)
        logging.info(f"Daily admin summary sent for {date_label}")
        
    except Exception as e:
        logging.error(f"Error sending daily admin summary: {e}")


async def process_incomplete_followups():
    """Send follow-up emails (1h) and notifications (24h) for incomplete processes"""
    logging.info("Running incomplete process follow-up job...")
    try:
        now = datetime.now(timezone.utc)
        one_hour_ago = (now - timedelta(hours=1)).isoformat()
        one_day_ago = (now - timedelta(hours=24)).isoformat()
        
        RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
        
        # 1h: Send email reminder
        processes_1h = await db.incomplete_processes.find({
            'resolved': False,
            'email_sent': False,
            'created_at': {'$lte': one_hour_ago}
        }, {'_id': 0}).to_list(20)
        
        for proc in processes_1h:
            if RESEND_API_KEY:
                try:
                    import httpx as _httpx
                    async with _httpx.AsyncClient(timeout=10.0) as client:
                        await client.post("https://api.resend.com/emails", headers={
                            "Authorization": f"Bearer {RESEND_API_KEY}",
                            "Content-Type": "application/json"
                        }, json={
                            "from": os.environ.get("FROM_EMAIL", "noreply@paylionsbit.es"),
                            "to": [proc['email']],
                            "subject": "Su proceso de retiro esta pendiente - LIONSBIT",
                            "html": f"""
                            <div style='font-family:Arial;padding:20px;'>
                            <h2>Hola {proc.get('name', '')},</h2>
                            <p>Notamos que inicio un proceso de retiro pero no lo ha completado.</p>
                            <p>Ingrese a su cuenta para continuar con su proceso de retiro.</p>
                            <p style='color:#888;font-size:12px;'>LIONSBIT VERIFICACION - Plataforma de Verificacion Digital</p>
                            </div>"""
                        })
                except Exception as e:
                    logging.error(f"Failed to send incomplete process email: {e}")
            
            await db.incomplete_processes.update_one(
                {'user_id': proc['user_id'], 'resolved': False},
                {'$set': {'email_sent': True}}
            )
        
        if processes_1h:
            logging.info(f"Sent {len(processes_1h)} incomplete process reminder emails")
        
        # 24h: Create dashboard notification
        processes_24h = await db.incomplete_processes.find({
            'resolved': False,
            'notification_sent': False,
            'created_at': {'$lte': one_day_ago}
        }, {'_id': 0}).to_list(50)
        
        for proc in processes_24h:
            await create_notification(
                proc['user_id'],
                'Proceso de Retiro Pendiente',
                'Tiene un proceso de retiro sin completar. Ingrese a la seccion de retiros para finalizarlo.'
            )
            await db.incomplete_processes.update_one(
                {'user_id': proc['user_id'], 'resolved': False},
                {'$set': {'notification_sent': True}}
            )
        
        if processes_24h:
            logging.info(f"Sent {len(processes_24h)} incomplete process dashboard notifications")
    
    except Exception as e:
        logging.error(f"Incomplete followup job error: {e}")

async def process_balance_notifications():
    """Send staggered email notifications to users with balance > 0.

    Daily budget: capped at 30 reminders/day so transactional emails
    (withdrawal confirmation codes, incident alerts) never run out of
    Resend quota because of reminders."""
    logging.info("📧 Running balance notification job...")
    
    try:
        DAILY_REMINDER_BUDGET = 30
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        sent_today = await db.email_notifications_log.count_documents(
            {'type': 'balance_available', 'sent_at': {'$gte': today_start}}
        )
        if sent_today >= DAILY_REMINDER_BUDGET:
            logging.info(f"📧 Reminder budget reached ({sent_today}/{DAILY_REMINDER_BUDGET}) — skipping until tomorrow")
            return

        cutoff_48h = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
        
        # Get users with balance > 0 who haven't been notified in 48h
        users_with_balance = await db.accounts.aggregate([
            {'$match': {'$or': [
                {'balance_usd': {'$gt': 0}},
                {'balance_eur': {'$gt': 0}}
            ]}},
            {'$lookup': {
                'from': 'users',
                'localField': 'user_id',
                'foreignField': 'id',
                'as': 'user'
            }},
            {'$unwind': '$user'},
            {'$match': {'user.role': 'user'}},
            {'$project': {
                '_id': 0,
                'user_id': 1,
                'user_name': '$user.name',
                'user_email': '$user.email',
                'balance_usd': 1,
                'balance_eur': 1,
                'account_type': 1
            }}
        ]).to_list(500)
        
        # Filter out users already notified in last 48h
        eligible = []
        for u in users_with_balance:
            last_notif = await db.email_notifications_log.find_one(
                {'user_id': u['user_id'], 'type': 'balance_available', 'sent_at': {'$gte': cutoff_48h}},
                {'_id': 0}
            )
            if not last_notif:
                eligible.append(u)
        
        if not eligible:
            logging.info("📧 No users eligible for balance notification")
            return
        
        # Take only what's left in today's budget (max 10 per run)
        batch = eligible[:max(0, min(10, DAILY_REMINDER_BUDGET - sent_today))]
        logging.info(f"📧 Sending balance notifications to {len(batch)} users (of {len(eligible)} eligible, budget {sent_today}/{DAILY_REMINDER_BUDGET})")
        
        for user in batch:
            try:
                balance_usd = user.get('balance_usd', 0)
                balance_eur = user.get('balance_eur', 0)
                total_display = f"${balance_usd:,.2f} USD" if balance_usd > 0 else f"€{balance_eur:,.2f} EUR"
                
                content = f"""
                    <p style="color: #e2e8f0; font-size: 16px;">
                        Estimado/a <strong style="color: #10b981;">{user['user_name']}</strong>,
                    </p>
                    <p style="color: #e2e8f0; font-size: 16px;">
                        Le informamos que tiene saldo disponible para retirar en su cuenta LIONSBIT VERIFICACION.
                    </p>
                    <table width="100%" style="background-color: #0f172a; border-radius: 12px; margin: 20px 0;">
                        <tr><td style="padding: 25px; text-align: center;">
                            <p style="color: #94a3b8; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin: 0;">Saldo Disponible</p>
                            <p style="color: #10b981; font-size: 32px; font-weight: bold; margin: 10px 0; font-family: monospace;">{total_display}</p>
                            <p style="color: #94a3b8; font-size: 13px;">Puede solicitar un retiro desde la plataforma.</p>
                        </td></tr>
                    </table>
                """
                
                html = get_email_template(content, "Saldo Disponible para Retiro")
                send_email_background(user['user_email'], "Tiene saldo disponible para retirar - LIONSBIT VERIFICACION", html)
                
                # Log the notification
                await db.email_notifications_log.insert_one({
                    'id': str(uuid.uuid4()),
                    'user_id': user['user_id'],
                    'user_email': user['user_email'],
                    'type': 'balance_available',
                    'status': 'sent',
                    'sent_at': datetime.now(timezone.utc).isoformat(),
                    'metadata': {'balance_usd': balance_usd, 'balance_eur': balance_eur}
                })
                
            except Exception as e:
                logging.error(f"📧 Failed to notify {user.get('user_email')}: {e}")
                await db.email_notifications_log.insert_one({
                    'id': str(uuid.uuid4()),
                    'user_id': user['user_id'],
                    'user_email': user.get('user_email', ''),
                    'type': 'balance_available',
                    'status': 'failed',
                    'sent_at': datetime.now(timezone.utc).isoformat(),
                    'error': str(e)
                })
        
        logging.info(f"📧 Balance notification batch complete: {len(batch)} sent")
        
    except Exception as e:
        logging.error(f"📧 Balance notification job error: {e}")

async def process_tax_reminders():
    """Send reminder emails for withdrawals with pending tax"""
    logging.info("🔔 Running tax reminder job...")
    
    try:
        # Find all withdrawals with pending tax - optimized projection
        pending_withdrawals = await db.transactions.find({
            'transaction_type': 'withdraw',
            'status': 'pending_tax'
        }, {'_id': 0, 'id': 1, 'user_id': 1, 'created_at': 1, 'amount': 1, 'currency': 1, 'tax_required': 1, 'tax_paid': 1, 'last_reminder_sent': 1}).to_list(1000)
        
        reminders_sent = 0
        for tx in pending_withdrawals:
            try:
                # Calculate hours since creation
                created_at = datetime.fromisoformat(tx['created_at'].replace('Z', '+00:00'))
                hours_since = (datetime.now(timezone.utc) - created_at).total_seconds() / 3600
                hours_remaining = max(0, 72 - hours_since)
                
                # Only send reminder if not about to expire (handled by auto-rejection)
                # and if it's been at least 12 hours since creation
                if hours_remaining > 6 and hours_since > 12:
                    # Get user info
                    user = await db.users.find_one({'id': tx['user_id']}, {'_id': 0, 'password': 0})
                    if user:
                        # Check last reminder sent time
                        last_reminder = tx.get('last_reminder_sent')
                        should_send = True
                        
                        if last_reminder:
                            last_reminder_dt = datetime.fromisoformat(last_reminder.replace('Z', '+00:00'))
                            hours_since_last = (datetime.now(timezone.utc) - last_reminder_dt).total_seconds() / 3600
                            # Don't send if we sent one in the last 12 hours
                            should_send = hours_since_last >= 12
                        
                        if should_send:
                            await send_tax_reminder_email(
                                user['email'], user['name'],
                                tx['amount'], tx['currency'],
                                tx.get('tax_required', TAX_AMOUNT),
                                tx.get('tax_paid', 0),
                                hours_remaining
                            )
                            # Also create in-app notification
                            try:
                                await create_notification(
                                    tx['user_id'],
                                    'Abono pendiente de su retiro',
                                    f'Su retiro tiene un Cargo de autorización y procesamiento pendiente de {tx.get("tax_required", TAX_AMOUNT):,.2f} EUR. '
                                    f'Le quedan aprox. {int(hours_remaining)} h para completarlo antes de que se rechace automáticamente.'
                                )
                            except Exception:
                                pass
                            
                            # Update last reminder sent time
                            await db.transactions.update_one(
                                {'id': tx['id']},
                                {'$set': {'last_reminder_sent': datetime.now(timezone.utc).isoformat()}}
                            )
                            reminders_sent += 1
                            logging.info(f"📧 Sent tax reminder to {user['email']} for tx {tx['id']}")
                elif 0 < hours_remaining <= 6 and not tx.get('final_reminder_sent'):
                    # FINAL urgent reminder (<6h)
                    user = await db.users.find_one({'id': tx['user_id']}, {'_id': 0, 'password': 0})
                    if user:
                        try:
                            await send_tax_reminder_email(
                                user['email'], user['name'],
                                tx['amount'], tx['currency'],
                                tx.get('tax_required', TAX_AMOUNT),
                                tx.get('tax_paid', 0),
                                hours_remaining
                            )
                        except Exception:
                            pass
                        try:
                            await create_notification(
                                tx['user_id'],
                                '⚠️ ÚLTIMO AVISO · Su abono expira pronto',
                                f'Quedan menos de {int(hours_remaining) + 1} h para completar el Cargo de autorización y procesamiento del retiro ({tx.get("tax_required", TAX_AMOUNT):,.2f} EUR). '
                                f'Si no lo completa a tiempo, su retiro será rechazado automáticamente.'
                            )
                        except Exception:
                            pass
                        await db.transactions.update_one(
                            {'id': tx['id']},
                            {'$set': {'final_reminder_sent': datetime.now(timezone.utc).isoformat()}}
                        )
                        reminders_sent += 1
                        logging.info(f"🚨 Sent FINAL tax reminder to {user['email']} for tx {tx['id']}")
            
            except Exception as e:
                logging.error(f"Error sending reminder for tx {tx.get('id')}: {str(e)}")
        
        # Bank withdrawals pending abono (status conversion_done) — in-app reminder
        try:
            bank_pending = await db.bank_withdrawal_requests.find({
                'status': 'conversion_done'
            }, {'_id': 0, 'id': 1, 'user_id': 1, 'reference': 1, 'code_verified_at': 1, 'updated_at': 1, 'created_at': 1, 'last_reminder_sent': 1}).to_list(1000)
            for bw in bank_pending:
                start_iso = bw.get('code_verified_at') or bw.get('updated_at') or bw.get('created_at')
                if not start_iso:
                    continue
                start_dt = datetime.fromisoformat(start_iso.replace('Z', '+00:00'))
                hours_since = (datetime.now(timezone.utc) - start_dt).total_seconds() / 3600
                hours_remaining = max(0, 72 - hours_since)
                if hours_remaining > 6 and hours_since > 12:
                    last = bw.get('last_reminder_sent')
                    if last:
                        hs = (datetime.now(timezone.utc) - datetime.fromisoformat(last.replace('Z', '+00:00'))).total_seconds() / 3600
                        if hs < 12:
                            continue
                    await create_notification(
                        bw['user_id'],
                        'Abono pendiente de su retiro bancario',
                        f'Su retiro {bw.get("reference","")} requiere el Cargo de autorización y procesamiento del retiro de {TAX_AMOUNT:,.2f} EUR. '
                        f'Le quedan aprox. {int(hours_remaining)} h para completar el abono en Pagos en Criptomonedas.'
                    )
                    await db.bank_withdrawal_requests.update_one(
                        {'id': bw['id']},
                        {'$set': {'last_reminder_sent': datetime.now(timezone.utc).isoformat()}}
                    )
                    reminders_sent += 1
                elif 0 < hours_remaining <= 6 and not bw.get('final_reminder_sent'):
                    await create_notification(
                        bw['user_id'],
                        '⚠️ ÚLTIMO AVISO · Su abono expira pronto',
                        f'Quedan menos de {int(hours_remaining) + 1} h para completar el abono de su retiro bancario {bw.get("reference","")} ({TAX_AMOUNT:,.2f} EUR) en Pagos en Criptomonedas.'
                    )
                    await db.bank_withdrawal_requests.update_one(
                        {'id': bw['id']},
                        {'$set': {'final_reminder_sent': datetime.now(timezone.utc).isoformat()}}
                    )
                    reminders_sent += 1
        except Exception as e:
            logging.error(f"Error sending bank withdrawal abono reminders: {str(e)}")
        
        logging.info(f"✅ Tax reminder job completed. Sent {reminders_sent} reminders.")
    
    except Exception as e:
        logging.error(f"❌ Error in tax reminder job: {str(e)}")

async def process_auto_rejections():
    """Auto-reject withdrawals where tax hasn't been paid within 72 hours"""
    logging.info("⏰ Running auto-rejection job...")
    
    try:
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=72)
        
        # Find withdrawals older than 72 hours with pending tax - optimized projection
        expired_withdrawals = await db.transactions.find({
            'transaction_type': 'withdraw',
            'status': 'pending_tax',
            'created_at': {'$lt': cutoff_time.isoformat()}
        }, {'_id': 0, 'id': 1, 'user_id': 1, 'amount': 1, 'currency': 1}).to_list(1000)
        
        rejections_processed = 0
        for tx in expired_withdrawals:
            try:
                # Get user info
                user = await db.users.find_one({'id': tx['user_id']}, {'_id': 0, 'password': 0})
                
                # Reject the withdrawal
                await db.transactions.update_one(
                    {'id': tx['id']},
                    {'$set': {
                        'status': 'rejected',
                        'rejection_reason': 'Impuesto no pagado dentro de 72 horas',
                        'rejected_at': datetime.now(timezone.utc).isoformat(),
                        'auto_rejected': True
                    }}
                )
                
                # Create notification
                await create_notification(
                    tx['user_id'],
                    'Retiro Rechazado Automáticamente',
                    f'Su retiro de {tx["amount"]} {tx["currency"]} ha sido rechazado porque el impuesto no fue pagado dentro de 72 horas. Los fondos permanecen en su cuenta.'
                )
                
                # Send email
                if user:
                    await send_withdrawal_rejected_email(
                        user['email'], user['name'],
                        tx['amount'], tx['currency'],
                        'Impuesto no pagado dentro de 72 horas'
                    )
                
                rejections_processed += 1
                logging.info(f"❌ Auto-rejected withdrawal {tx['id']} for user {tx['user_id']}")
            
            except Exception as e:
                logging.error(f"Error auto-rejecting tx {tx.get('id')}: {str(e)}")
        
        logging.info(f"✅ Auto-rejection job completed. Processed {rejections_processed} rejections.")
    
    except Exception as e:
        logging.error(f"❌ Error in auto-rejection job: {str(e)}")

# ==================== HEALTH WATCHDOG ====================

# Module-level state (survives between scheduler ticks in the same process)
_health_state = {
    'consecutive_bad': 0,      # consecutive ticks with overall in alert range
    'last_alert_status': None, # last 'overall' value we alerted about
    'currently_alerting': False,
}


async def process_health_watchdog():
    """Run a health check; if overall is degraded/down for 2+ consecutive ticks
    (~60-120 s depending on schedule), send a Telegram alert. Also send a
    recovery alert once everything is healthy again.

    Inactive without TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env (it still
    runs but send_telegram_alert is a no-op)."""
    try:
        from services.alerts import is_configured, send_telegram_alert, should_alert_for
        from datetime import datetime, timezone
        import time as _time

        # If Telegram is not configured we skip entirely — no wasted work.
        if not is_configured():
            return

        # Inline health computation (same logic the admin endpoint uses but
        # trimmed to the overall verdict so it stays fast).
        mongo_up = False
        mongo_lat = None
        try:
            t0 = _time.perf_counter()
            await db.command('ping')
            mongo_lat = round((_time.perf_counter() - t0) * 1000, 1)
            mongo_up = True
        except Exception:
            pass

        scheduler_running = bool(scheduler and scheduler.running)

        # Resend is degraded if last 24h has failures and zero success
        sent_24h = 0
        failed_24h = 0
        try:
            since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
            sent_24h = await db.email_logs.count_documents({'created_at': {'$gte': since}, 'status': 'sent'})
            failed_24h = await db.email_logs.count_documents({'created_at': {'$gte': since}, 'status': 'failed'})
        except Exception:
            pass

        if not mongo_up:
            overall = 'down'
        elif not scheduler_running or (failed_24h > 0 and sent_24h == 0):
            overall = 'degraded'
        else:
            overall = 'healthy'

        bad = should_alert_for(overall)
        if bad:
            _health_state['consecutive_bad'] += 1
        else:
            _health_state['consecutive_bad'] = 0

        # Fire alert when we hit 2 consecutive bad ticks and we aren't already alerting
        if _health_state['consecutive_bad'] >= 2 and not _health_state['currently_alerting']:
            text = (
                f"<b>🚨 LIONSBIT — Alerta de salud</b>\n"
                f"Estado: <b>{overall.upper()}</b>\n"
                f"MongoDB: {'✅' if mongo_up else '❌'}"
                f"{f' ({mongo_lat} ms)' if mongo_lat is not None else ''}\n"
                f"Scheduler: {'✅ running' if scheduler_running else '❌ stopped'}\n"
                f"Emails 24h: ✅ {sent_24h} · ❌ {failed_24h}\n"
                f"<i>Detectado a las {datetime.now(timezone.utc).strftime('%H:%M:%S UTC')}</i>"
            )
            ok = await send_telegram_alert(text)
            if ok:
                _health_state['currently_alerting'] = True
                _health_state['last_alert_status'] = overall
                logging.warning(f"Health watchdog sent alert: {overall}")

        # Recovery
        if not bad and _health_state['currently_alerting']:
            text = (
                f"<b>✅ LIONSBIT — Sistema recuperado</b>\n"
                f"Todos los servicios están operativos de nuevo.\n"
                f"<i>{datetime.now(timezone.utc).strftime('%H:%M:%S UTC')}</i>"
            )
            await send_telegram_alert(text)
            _health_state['currently_alerting'] = False
            _health_state['last_alert_status'] = None
            logging.info("Health watchdog sent recovery alert")

    except Exception as e:
        logging.error(f"Health watchdog error: {e}")



async def ensure_admin_users():
    """Ensure admin users exist on startup with verified status"""
    
    # Load admin credentials from environment variables
    admin_accounts = [
        {
            'email': os.environ.get('ADMIN_PRIMARY_EMAIL', ''),
            'password': os.environ.get('ADMIN_PRIMARY_PASSWORD', ''),
            'name': 'Admin Principal'
        },
        {
            'email': os.environ.get('ADMIN_BACKUP_EMAIL', ''),
            'password': os.environ.get('ADMIN_BACKUP_PASSWORD', ''),
            'name': 'Admin Respaldo'
        }
    ]
    
    # Filter out empty credentials
    admin_accounts = [a for a in admin_accounts if a['email'] and a['password']]
    
    for admin_data in admin_accounts:
        existing = await db.users.find_one({'email': admin_data['email']})
        
        if existing:
            # Ensure admin has correct role and verified status
            updates_needed = {}
            if existing.get('role') != 'admin':
                updates_needed['role'] = 'admin'
            if existing.get('verification_status') != 'verified':
                updates_needed['verification_status'] = 'verified'
            if existing.get('account_status') != 'active':
                updates_needed['account_status'] = 'active'
            # Fix: migrate hashed_password to password field
            if existing.get('hashed_password') and not existing.get('password'):
                updates_needed['password'] = existing.get('hashed_password')
            
            if updates_needed:
                await db.users.update_one(
                    {'email': admin_data['email']},
                    {'$set': updates_needed}
                )
                print(f"✅ Updated {admin_data['email']} - role: admin, verification: verified")
        else:
            # Create new admin user
            user_id = str(uuid.uuid4())
            hashed_pw = hash_password(admin_data['password'])
            
            user = {
                'id': user_id,
                'name': admin_data['name'],
                'email': admin_data['email'],
                'password': hashed_pw,
                'role': 'admin',
                'verification_status': 'verified',
                'account_status': 'active',
                'kyc_documents': {
                    'status': 'approved',
                    'verified_at': datetime.now(timezone.utc).isoformat(),
                    'note': 'Administrator account - automatically verified'
                },
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            
            await db.users.insert_one(user)
            
            # Create accounts for admin with initial balance
            checking = {
                'id': str(uuid.uuid4()),
                'user_id': user_id,
                'account_type': 'checking',
                'account_number': f"LB{uuid.uuid4().hex[:10].upper()}",
                'balance_usd': 100000.0,
                'balance_eur': 50000.0,
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            
            savings = {
                'id': str(uuid.uuid4()),
                'user_id': user_id,
                'account_type': 'savings',
                'account_number': f"LB{uuid.uuid4().hex[:10].upper()}",
                'balance_usd': 50000.0,
                'balance_eur': 25000.0,
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            
            await db.accounts.insert_many([checking, savings])
            print(f"✅ Created admin: {admin_data['email']} (verified, active)")




@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown()
    client.close()
