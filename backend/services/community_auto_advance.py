"""Community auto-advance scheduler.

Each calendar day, automatically promote DAILY_AUTO_ADVANCE_COUNT (=2) users
from the "in-process" demo pool (community_in_process_v1) all the way to
step 5 (Retirado). For every promoted user we:

  - set community_step_override = 5
  - set account_status = 'completado'
  - set partial_withdraw_unlocked = True
  - insert a withdraw transaction status=completed (so the user shows up in
    "Retiros recientes verificados" feed and the Hall of Fame)
  - debit the checking balance accordingly

Idempotency is guaranteed via the `community_auto_advance_log` collection:
each run inserts a doc keyed by `date` (YYYY-MM-DD UTC). If a doc for today
already exists, the tick is a no-op.

Runs daily at 09:00 UTC plus once at app startup (catch-up if missed).
Manual trigger available via POST /api/admin/community/auto-advance/run.
"""
import logging
import random
import uuid
from datetime import datetime, timezone

from config import db

logger = logging.getLogger(__name__)

DAILY_AUTO_ADVANCE_COUNT = 2
# Two demo pools rotate together so the daily promotions draw from any
# in-process user (steps 1-4) regardless of which batch seeded them.
#   • community_in_process_v1 → original 35 Spaniards seeded in steps 1-4
#   • community_impuesto_v1   → 70 named profiles parked at step 2 (Impuesto)
# Adding more batches here will automatically include them in the rotation.
DEMO_POOL_BATCHES = [
    'community_in_process_v1',
    'community_impuesto_v1',
]


def _today_key() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%d')


async def _pick_candidates(limit: int) -> list:
    """Pick users still in-process (step 1-4) from the demo pool. We pull more
    than needed so we can prioritise those nearest to completion (step 4) and
    fall back to lower steps if the higher-step pool is empty."""
    cur = db.users.find(
        {
            'is_demo': True,
            'demo_seed_batch': {'$in': DEMO_POOL_BATCHES},
            'community_step_override': {'$gte': 1, '$lte': 4},
        },
        {'_id': 0, 'id': 1, 'name': 1, 'country_flag': 1, 'community_step_override': 1, 'demo_seed_batch': 1},
    ).sort('community_step_override', -1).limit(limit * 4)
    return await cur.to_list(limit * 4)


async def _promote_one(user: dict, run_at_iso: str, triggered_by: str) -> dict:
    """Apply the full promotion to step 5 + emit the withdrawal artefact."""
    user_id = user['id']

    # 1. Pull the checking account so we know how much to "withdraw"
    checking = await db.accounts.find_one(
        {'user_id': user_id, 'account_type': 'checking'},
        {'_id': 0},
    )
    balance = float((checking or {}).get('balance_eur') or 0.0)
    # Demo pool is seeded with €15k-€68k. Withdraw 60-95% of balance for
    # an organic-looking partial-completion mix.
    if balance <= 0:
        # Fallback: synthesise a believable amount so the feed still gets fed
        balance = random.uniform(15000, 68000)
        amount = round(random.uniform(0.6, 0.95) * balance, 2)
    else:
        amount = round(random.uniform(0.6, 0.95) * balance, 2)

    # 2. Update the user doc — pin to step 5 + completion flags
    await db.users.update_one(
        {'id': user_id},
        {'$set': {
            'community_step_override': 5,
            'community_step_updated_at': run_at_iso,
            'community_step_updated_by': triggered_by,
            'account_status': 'completado',
            'partial_withdraw_unlocked': True,
            'auto_advanced_to_5_at': run_at_iso,
        }},
    )

    # 3. Insert a completed withdrawal so the recent-withdrawals feed picks
    # them up (sorted by created_at desc) and balances get debited.
    if checking:
        wd_id = str(uuid.uuid4())
        await db.transactions.insert_one({
            'id': wd_id,
            'account_id': checking['id'],
            'user_id': user_id,
            'transaction_type': 'withdraw',
            'amount': amount,
            'currency': 'EUR',
            'status': 'completed',
            'description': 'Retiro procesado · verificación completada',
            'transaction_reference': f"AUTO-WD-{wd_id[:8].upper()}",
            'created_at': run_at_iso,
            'completed_at': run_at_iso,
            'is_demo': True,
            'auto_generated_by': 'community_auto_advance',
        })
        # Debit the checking balance (clamp at 0)
        new_balance = max(0.0, round(balance - amount, 2))
        await db.accounts.update_one(
            {'id': checking['id']},
            {'$set': {'balance_eur': new_balance}},
        )

    return {
        'user_id': user_id,
        'name': user.get('name'),
        'country_flag': user.get('country_flag'),
        'previous_step': user.get('community_step_override'),
        'new_step': 5,
        'amount_eur': amount,
    }


async def run_community_auto_advance_tick(triggered_by: str = 'scheduler') -> dict:
    """Daily tick. Idempotent by UTC date. Returns the run summary."""
    today = _today_key()
    existing = await db.community_auto_advance_log.find_one({'date': today}, {'_id': 0})
    if existing and triggered_by == 'scheduler':
        # Scheduler already ran today; manual triggers can re-run if needed.
        return {
            'status': 'skipped_already_ran',
            'date': today,
            'previous_run': existing,
            'advanced': [],
        }

    candidates = await _pick_candidates(DAILY_AUTO_ADVANCE_COUNT)
    if not candidates:
        # Nothing left to promote (pool drained)
        run_at_iso = datetime.now(timezone.utc).isoformat()
        log_doc = {
            'id': str(uuid.uuid4()),
            'date': today,
            'run_at': run_at_iso,
            'triggered_by': triggered_by,
            'count': 0,
            'advanced': [],
            'note': 'no_candidates_available',
        }
        await db.community_auto_advance_log.update_one(
            {'date': today}, {'$set': log_doc}, upsert=True,
        )
        logger.info('[community-auto-advance] no candidates available (pool drained)')
        return {'status': 'ok_empty', 'date': today, 'count': 0, 'advanced': []}

    # Sample up to DAILY_AUTO_ADVANCE_COUNT preferring step 4 → 3 → 2 → 1
    # candidates is already sorted by step desc. Pick first N.
    picked = candidates[:DAILY_AUTO_ADVANCE_COUNT]

    run_at = datetime.now(timezone.utc)
    run_at_iso = run_at.isoformat()
    advanced = []
    for u in picked:
        try:
            res = await _promote_one(u, run_at_iso, f'auto:{triggered_by}')
            advanced.append(res)
            logger.info(
                '[community-auto-advance] promoted %s (%s) %s→5 €%.2f',
                u.get('name'), u.get('id'), u.get('community_step_override'), res['amount_eur'],
            )
        except Exception as exc:  # pragma: no cover
            logger.exception('[community-auto-advance] failed to promote %s: %s', u.get('id'), exc)

    log_doc = {
        'id': str(uuid.uuid4()),
        'date': today,
        'run_at': run_at_iso,
        'triggered_by': triggered_by,
        'count': len(advanced),
        'advanced': advanced,
    }
    await db.community_auto_advance_log.update_one(
        {'date': today}, {'$set': log_doc}, upsert=True,
    )

    return {
        'status': 'ok',
        'date': today,
        'count': len(advanced),
        'advanced': advanced,
        'triggered_by': triggered_by,
    }


async def get_recent_runs(limit: int = 30) -> list:
    cur = db.community_auto_advance_log.find({}, {'_id': 0}).sort('date', -1).limit(limit)
    return await cur.to_list(limit)


async def get_pool_status() -> dict:
    """Return current pool size + remaining in-process candidates across
    every demo batch registered in DEMO_POOL_BATCHES."""
    base_filter = {
        'is_demo': True,
        'demo_seed_batch': {'$in': DEMO_POOL_BATCHES},
    }
    total_in_pool = await db.users.count_documents(base_filter)
    remaining = await db.users.count_documents({
        **base_filter,
        'community_step_override': {'$gte': 1, '$lte': 4},
    })
    completed = await db.users.count_documents({
        **base_filter,
        'community_step_override': 5,
    })

    # Per-batch breakdown so the admin panel can show contribution per pool
    by_batch = {}
    for batch in DEMO_POOL_BATCHES:
        by_batch[batch] = {
            'total':     await db.users.count_documents({'is_demo': True, 'demo_seed_batch': batch}),
            'remaining': await db.users.count_documents({
                'is_demo': True,
                'demo_seed_batch': batch,
                'community_step_override': {'$gte': 1, '$lte': 4},
            }),
            'completed': await db.users.count_documents({
                'is_demo': True,
                'demo_seed_batch': batch,
                'community_step_override': 5,
            }),
        }

    days_remaining = (
        (remaining + DAILY_AUTO_ADVANCE_COUNT - 1) // DAILY_AUTO_ADVANCE_COUNT
        if remaining > 0 else 0
    )
    return {
        'pool_total': total_in_pool,
        'in_process_remaining': remaining,
        'completed_so_far': completed,
        'daily_count': DAILY_AUTO_ADVANCE_COUNT,
        'days_remaining': days_remaining,
        'by_batch': by_batch,
        'batches': DEMO_POOL_BATCHES,
    }
