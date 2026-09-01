"""Immutable withdrawal audit trail"""
import uuid
from datetime import datetime, timezone
from typing import Optional
from config import db


async def log_withdrawal_audit(
    operation_id: str,
    action: str,
    reference: Optional[str] = None,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
    admin_id: Optional[str] = None,
    admin_name: Optional[str] = None,
    old_status: Optional[str] = None,
    new_status: Optional[str] = None,
    amount: Optional[float] = None,
    currency: Optional[str] = None,
    method: Optional[str] = None,
    txid: Optional[str] = None,
    network: Optional[str] = None,
    notes: Optional[str] = None,
    kind: str = 'withdrawal',
):
    """Append an immutable audit entry. No delete endpoint exists on purpose."""
    try:
        await db.withdrawal_audit_logs.insert_one({
            'id': str(uuid.uuid4()),
            'operation_id': operation_id,
            'kind': kind,
            'reference': reference,
            'user_id': user_id,
            'user_name': user_name,
            'admin_id': admin_id,
            'admin_name': admin_name,
            'action': action,
            'old_status': old_status,
            'new_status': new_status,
            'amount': amount,
            'currency': currency,
            'method': method,
            'txid': txid,
            'network': network,
            'notes': notes,
            'created_at': datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass
