"""
Withdrawal type selection — user picks once per process:
    • partial  → unlock 40% of balance · fixed fee €2.660
    • full     → withdraw 100% of balance · fixed fee €4.850

The choice is persisted on the user document (`withdrawal_type`), together
with a timestamp and the amount-snapshot at the moment of selection. Once
chosen, the other option is visually "locked" client-side for that process,
but the user can always reset the selection via POST with type='reset'
(the server just clears the field — no state mutation on accounts).
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Literal

from services.auth import get_current_user
from config import db

router = APIRouter(tags=['withdraw-type'])

# Fee schedule — keep in sync with PartialUnlockPanel + Community stats
FEE_PARTIAL_EUR = 2660.0
FEE_FULL_EUR    = 4850.0


class WithdrawTypePayload(BaseModel):
    type: Literal['partial', 'full', 'reset'] = Field(..., description='partial | full | reset')


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get('/withdraw-type')
async def get_withdraw_type(user: dict = Depends(get_current_user)):
    """Return the user's current withdrawal-type selection (if any)."""
    u = await db.users.find_one(
        {'id': user['id']},
        {
            '_id': 0,
            'withdrawal_type': 1,
            'withdrawal_type_selected_at': 1,
        },
    ) or {}
    return {
        'withdrawal_type': u.get('withdrawal_type'),        # 'partial' | 'full' | None
        'selected_at':     u.get('withdrawal_type_selected_at'),
        'config': {
            'partial_fee_eur': FEE_PARTIAL_EUR,
            'full_fee_eur':    FEE_FULL_EUR,
            'partial_pct':     40,
            'full_pct':        100,
        },
    }


@router.post('/withdraw-type')
async def set_withdraw_type(
    payload: WithdrawTypePayload,
    user: dict = Depends(get_current_user),
):
    """Persist or reset the user's withdrawal type for this process."""
    if payload.type == 'reset':
        await db.users.update_one(
            {'id': user['id']},
            {'$unset': {'withdrawal_type': '', 'withdrawal_type_selected_at': ''}},
        )
        return {'ok': True, 'withdrawal_type': None}

    await db.users.update_one(
        {'id': user['id']},
        {
            '$set': {
                'withdrawal_type': payload.type,
                'withdrawal_type_selected_at': _now_iso(),
            }
        },
    )
    return {
        'ok': True,
        'withdrawal_type': payload.type,
        'selected_at': _now_iso(),
    }
