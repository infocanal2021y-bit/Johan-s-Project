"""User scoring and reminder services."""
import logging
from datetime import datetime, timezone, timedelta
from config import db
from services.notifications import create_notification


async def process_user_scoring():
    """Calculate interest scoring for all users: hot/warm/cold"""
    logging.info("Running user scoring job...")
    try:
        now = datetime.now(timezone.utc)
        users = await db.users.find({'role': 'user'}, {'_id': 0, 'id': 1, 'email': 1, 'last_active': 1}).to_list(1000)

        for user in users:
            user_id = user['id']
            seven_days_ago = (now - timedelta(days=7)).isoformat()
            login_count_7d = await db.login_history.count_documents({
                'user_id': user_id, 'timestamp': {'$gte': seven_days_ago}
            })

            account = await db.accounts.find_one({'user_id': user_id, 'account_type': 'checking'}, {'_id': 0})
            balance = (account.get('balance_usd', 0) if account else 0) + (account.get('balance_eur', 0) if account else 0)

            last_active = user.get('last_active')
            days_inactive = 999
            if last_active:
                try:
                    la = datetime.fromisoformat(str(last_active).replace('Z', '+00:00'))
                    days_inactive = (now - la).days
                except Exception:
                    pass

            has_pending = await db.transactions.count_documents({
                'user_id': user_id, 'transaction_type': 'withdraw',
                'status': {'$in': ['pending', 'pending_tax', 'processing']}
            })

            if login_count_7d >= 3 and balance > 0:
                score, score_label = 'hot', 'Alto interes'
            elif login_count_7d >= 1 or has_pending > 0:
                score, score_label = 'warm', 'Medio'
            else:
                score, score_label = 'cold', 'Frio'

            await db.users.update_one(
                {'id': user_id},
                {'$set': {
                    'interest_score': score,
                    'interest_label': score_label,
                    'score_data': {
                        'logins_7d': login_count_7d,
                        'balance': round(balance, 2),
                        'days_inactive': days_inactive,
                        'has_pending_withdrawal': has_pending > 0,
                        'updated_at': now.isoformat()
                    }
                }}
            )
        logging.info(f"User scoring completed for {len(users)} users")
    except Exception as e:
        logging.error(f"Error in user scoring: {e}")


async def process_user_reminders():
    """Send reminders to users every 12 hours if they have pending processes"""
    logging.info("Running user reminder job (12h)...")
    try:
        now = datetime.now(timezone.utc)
        pending_tax = await db.transactions.find({
            'transaction_type': 'withdraw',
            'status': {'$in': ['pending_tax', 'pending']}
        }, {'_id': 0, 'user_id': 1, 'amount': 1, 'currency': 1}).to_list(100)

        notified = set()
        for tx in pending_tax:
            uid = tx['user_id']
            if uid in notified:
                continue
            notified.add(uid)
            await create_notification(uid, 'Proceso Pendiente',
                f'Tienes un retiro de {tx["amount"]} {tx["currency"]} pendiente. Completa el proceso para continuar.')

        users_with_balance = await db.accounts.find({
            'account_type': 'checking',
            '$or': [{'balance_usd': {'$gt': 0}}, {'balance_eur': {'$gt': 0}}]
        }, {'_id': 0, 'user_id': 1, 'balance_usd': 1, 'balance_eur': 1}).to_list(100)

        for acc in users_with_balance:
            uid = acc['user_id']
            if uid in notified:
                continue
            user = await db.users.find_one({'id': uid}, {'_id': 0, 'last_active': 1})
            if user and user.get('last_active'):
                try:
                    la = datetime.fromisoformat(str(user['last_active']).replace('Z', '+00:00'))
                    if (now - la).total_seconds() > 43200:
                        total = acc.get('balance_usd', 0) + acc.get('balance_eur', 0)
                        await create_notification(uid, 'Saldo Disponible',
                            f'Tienes saldo disponible (${total:.2f}). Inicia sesion para gestionar tus fondos.')
                        notified.add(uid)
                except Exception:
                    pass
        logging.info(f"Reminders sent to {len(notified)} users")
    except Exception as e:
        logging.error(f"Error in user reminders: {e}")
