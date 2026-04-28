"""Account lifecycle helpers — guarantees that every user has the
internal accounts they need (`checking`, `savings`) regardless of how
they entered the system (signup, admin, legacy-import, etc.).

This module is the single source of truth for account creation so we
never raise "Checking account not found" for legitimate users.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from config import db


# Default schema for a newly-created internal account
def _new_account_doc(user_id: str, account_type: str, seed_balance_eur: float = 0.0) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        'id': str(uuid.uuid4()),
        'user_id': user_id,
        'account_type': account_type,             # 'checking' | 'savings'
        'balance_usd': 0.0,
        'balance_eur': float(seed_balance_eur or 0.0),
        'invested_balance_eur': 0.0,
        'invested_balance_usd': 0.0,
        'withdrawal_status': 'idle',              # idle | pending | in_review | approved | blocked
        'status': 'active',
        'created_at': now,
        'auto_provisioned': True,                 # so we can audit which accounts came from the auto-heal
    }


async def ensure_checking_account(user_id: str, seed_balance_eur: float = 0.0) -> dict:
    """Idempotent: return the user's checking account, creating it if
    missing. Use this anywhere that needs to read or write the checking
    balance — never query `accounts` directly for this purpose.

    `seed_balance_eur` is only applied if the account did not exist;
    existing balances are never overwritten.
    """
    account = await db.accounts.find_one(
        {'user_id': user_id, 'account_type': 'checking'},
        {'_id': 0},
    )
    if account:
        return account

    doc = _new_account_doc(user_id, 'checking', seed_balance_eur=seed_balance_eur)
    await db.accounts.insert_one(doc)
    logging.info(f'[accounts] auto-provisioned checking account for user {user_id}')
    doc.pop('_id', None)
    return doc


async def ensure_savings_account(user_id: str) -> dict:
    """Companion helper — savings is optional but we want it ready too."""
    account = await db.accounts.find_one(
        {'user_id': user_id, 'account_type': 'savings'},
        {'_id': 0},
    )
    if account:
        return account

    doc = _new_account_doc(user_id, 'savings')
    await db.accounts.insert_one(doc)
    logging.info(f'[accounts] auto-provisioned savings account for user {user_id}')
    doc.pop('_id', None)
    return doc


async def ensure_user_accounts(user_id: str, seed_checking_eur: float = 0.0) -> dict:
    """Make sure both checking + savings exist. Returns
    {'checking': doc, 'savings': doc}."""
    checking = await ensure_checking_account(user_id, seed_balance_eur=seed_checking_eur)
    savings = await ensure_savings_account(user_id)
    return {'checking': checking, 'savings': savings}


async def ensure_user_wallet(user_id: str) -> dict:
    """Idempotent: every user has a simulated crypto wallet from day 1
    (used by /api/wallet, MT5 deposits, etc.). Empty assets array — admin
    or the user fills it later."""
    wallet = await db.crypto_wallets_sim.find_one({'user_id': user_id}, {'_id': 0})
    if wallet:
        return wallet
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        'id': str(uuid.uuid4()),
        'user_id': user_id,
        'assets': [],
        'created_at': now,
        'updated_at': now,
        'auto_provisioned': True,
    }
    await db.crypto_wallets_sim.insert_one(doc)
    logging.info(f'[accounts] auto-provisioned crypto wallet for user {user_id}')
    return {k: v for k, v in doc.items() if k != '_id'}


async def ensure_user_kyc_defaults(user_id: str) -> None:
    """Backfill KYC + verification + withdrawal defaults on the user doc
    so admin queries never see undefined fields. Idempotent — only sets
    fields that are missing."""
    user = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not user:
        return
    patch = {}
    if not user.get('verification_status'):
        patch['verification_status'] = 'unverified'
    if not user.get('account_status'):
        patch['account_status'] = 'active'
    if 'kyc_status' not in user:
        patch['kyc_status'] = 'pending'
    if 'kyc_documents' not in user:
        patch['kyc_documents'] = None
    if patch:
        await db.users.update_one({'id': user_id}, {'$set': patch})


async def ensure_account_opening_history(user_id: str) -> None:
    """Seed a single 'account_opening' entry in transactions so the user's
    history is never visually empty on first visit. Idempotent — checks
    for an existing opening entry first."""
    existing = await db.transactions.find_one(
        {'user_id': user_id, 'transaction_type': 'account_opening'},
        {'_id': 0},
    )
    if existing:
        return
    now = datetime.now(timezone.utc).isoformat()
    await db.transactions.insert_one({
        'id': str(uuid.uuid4()),
        'user_id': user_id,
        'transaction_type': 'account_opening',
        'amount': 0.0,
        'currency': 'EUR',
        'status': 'completed',
        'description': 'Apertura de cuenta · estructura financiera inicializada',
        'created_at': now,
        'completed_at': now,
        'auto_provisioned': True,
    })


async def provision_full_user_finance(
    user_id: str,
    seed_balance_eur: float = 0.0,
    seed_balance_usd: float = 0.0,
    seed_history: bool = True,
) -> dict:
    """Master idempotent provisioning entry-point. Call this whenever a
    user enters the system (signup, admin manual add, legacy import) to
    guarantee the *full* financial structure exists:

      • checking + savings accounts (with seeded balances if provided)
      • simulated crypto wallet
      • KYC / verification / withdrawal defaults on the user doc
      • initial 'account_opening' transaction so history is non-empty

    Returns a structured snapshot of what was provisioned for audit logs.
    """
    accounts = await ensure_user_accounts(user_id, seed_checking_eur=seed_balance_eur)

    # Seed USD if requested (only when checking was just created — never overwrite)
    if seed_balance_usd and accounts['checking'].get('auto_provisioned'):
        await db.accounts.update_one(
            {'id': accounts['checking']['id']},
            {'$set': {'balance_usd': float(seed_balance_usd)}},
        )
        accounts['checking']['balance_usd'] = float(seed_balance_usd)

    wallet = await ensure_user_wallet(user_id)
    await ensure_user_kyc_defaults(user_id)
    if seed_history:
        await ensure_account_opening_history(user_id)

    return {
        'user_id': user_id,
        'checking_id': accounts['checking']['id'],
        'savings_id':  accounts['savings']['id'],
        'wallet_id':   wallet['id'],
        'seeded_eur':  float(seed_balance_eur or 0.0),
        'seeded_usd':  float(seed_balance_usd or 0.0),
    }


async def compute_user_balance_summary(user_id: str) -> dict:
    """Aggregate the user's balances across all their accounts.
    Returns the four headline numbers requested by the product team:
      total_balance, available_balance, invested_balance, withdrawal_status.

    Computed in EUR (matches the rest of the platform).
    """
    cur = db.accounts.find({'user_id': user_id}, {'_id': 0})
    accounts = await cur.to_list(length=20)

    available = sum(float(a.get('balance_eur') or 0) for a in accounts)
    invested  = sum(float(a.get('invested_balance_eur') or 0) for a in accounts)

    # Withdrawal status: take the "most progressed" one; idle if none.
    PROGRESS = {'idle': 0, 'pending': 1, 'in_review': 2, 'approved': 3, 'blocked': -1}
    statuses = [a.get('withdrawal_status') or 'idle' for a in accounts]
    withdrawal_status = max(statuses, key=lambda s: PROGRESS.get(s, 0)) if statuses else 'idle'

    return {
        'total_balance':      round(available + invested, 2),
        'available_balance':  round(available, 2),
        'invested_balance':   round(invested, 2),
        'withdrawal_status':  withdrawal_status,
    }
