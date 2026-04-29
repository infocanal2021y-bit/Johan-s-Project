"""Backfill deposit + available balance for the original 47 registered users.

ONLY touches users that are:
  • NOT admin
  • NOT is_demo (the 80 community completed seed)
  • NOT imported via client-import (no import_job_id)
  • Currently with €0 balance OR no admin_credit history (skips the 3 already-funded)

Each gets:
  • deposited_eur in [800, 22.000] (realistic small-account range)
  • available_balance = deposited * uniform(0.55, 0.95)
  • admin_credit transaction logged for each → so /community shows depositado correctly
  • checking.balance_eur set to the available amount
"""
import asyncio
import os
import random
import sys
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv(str(Path(__file__).resolve().parents[1] / '.env'))

from services.accounts_lifecycle import ensure_user_accounts


async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]
    random.seed(2026)

    candidates = await db.users.find(
        {
            'role': {'$ne': 'admin'},
            'is_demo': {'$ne': True},
            'import_job_id': {'$exists': False},
        },
        {'_id': 0, 'id': 1, 'name': 1, 'email': 1, 'created_at': 1},
    ).to_list(500)

    print(f'Found {len(candidates)} candidate registered users')
    print()

    funded = 0
    skipped = 0
    for u in candidates:
        # Skip if already has any completed admin_credit (preserves the 3 manually-funded)
        existing = await db.transactions.find_one({
            'user_id': u['id'],
            'transaction_type': 'admin_credit',
            'status': 'completed',
        })
        if existing:
            print(f'  · {u["name"][:30]:<30} SKIP (already has completed credit)')
            skipped += 1
            continue

        deposited = round(random.uniform(800, 22000), 2)
        available = round(deposited * random.uniform(0.55, 0.95), 2)

        # Ensure checking account exists (idempotent)
        accounts = await ensure_user_accounts(u['id'])
        checking_id = accounts['checking']['id']

        now = datetime.now(timezone.utc)
        # Realistic past date for the deposit
        deposit_dt = now - timedelta(days=random.randint(7, 90))

        await db.transactions.insert_one({
            'id': str(uuid.uuid4()),
            'account_id': checking_id,
            'user_id': u['id'],
            'transaction_type': 'admin_credit',
            'amount': deposited,
            'currency': 'EUR',
            'status': 'completed',
            'description': 'Depósito inicial verificado',
            'transaction_reference': f"REG-{uuid.uuid4().hex[:8].upper()}",
            'created_at': deposit_dt.isoformat(),
            'completed_at': deposit_dt.isoformat(),
        })

        await db.accounts.update_one(
            {'id': checking_id},
            {'$set': {'balance_eur': available}},
        )

        funded += 1
        print(f'  · {u["name"][:30]:<30} dep=€{deposited:>9,.2f}  avail=€{available:>9,.2f}')

    print()
    print(f'━━━ DONE ━━━ funded={funded} · skipped={skipped}')


if __name__ == '__main__':
    asyncio.run(main())
