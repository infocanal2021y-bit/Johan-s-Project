"""User scoring and automated reminders/notifications."""
import logging
from datetime import datetime, timezone, timedelta
from config import db

# Import send_email at runtime to avoid circular imports
_email_funcs = {}

def _get_email_funcs():
    """Lazy import of email functions from server to avoid circular imports"""
    if not _email_funcs:
        import server
        _email_funcs['send_email'] = server.send_email
        _email_funcs['get_email_template'] = server.get_email_template
    return _email_funcs


async def create_notification(user_id, title, message):
    """Inline notification creation to avoid circular import"""
    import uuid
    notification = {
        'id': str(uuid.uuid4()),
        'user_id': user_id,
        'title': title,
        'message': message,
        'read': False,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification)
    return notification


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
                'user_id': user_id,
                'timestamp': {'$gte': seven_days_ago}
            })

            account = await db.accounts.find_one({'user_id': user_id, 'account_type': 'checking'}, {'_id': 0})
            balance = (account.get('balance_usd', 0) if account else 0) + (account.get('balance_eur', 0) if account else 0)

            last_active = user.get('last_active')
            if last_active:
                try:
                    la = datetime.fromisoformat(str(last_active).replace('Z', '+00:00'))
                    days_inactive = (now - la).days
                except Exception:
                    days_inactive = 999
            else:
                days_inactive = 999

            has_pending = await db.transactions.count_documents({
                'user_id': user_id, 'transaction_type': 'withdraw',
                'status': {'$in': ['pending', 'pending_tax', 'processing']}
            })

            if login_count_7d >= 3 and balance > 0:
                score = 'hot'
                score_label = 'Alto interes'
            elif login_count_7d >= 1 or has_pending > 0:
                score = 'warm'
                score_label = 'Medio'
            else:
                score = 'cold'
                score_label = 'Frio'

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


async def _send_reminder_email(user_email, user_name, subject, message_html):
    """Send reminder email using server's email infrastructure"""
    try:
        fns = _get_email_funcs()
        content = f"""
            <p style="color:#e2e8f0;font-size:16px;">Hola <strong>{user_name}</strong>,</p>
            {message_html}
            <div style="text-align:center;margin:30px 0;">
                <a href="https://paylionsbit.es" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">
                    Acceder a mi cuenta
                </a>
            </div>
            <p style="color:#64748b;font-size:12px;margin-top:24px;">Si ya completaste tu proceso, puedes ignorar este mensaje.</p>
        """
        html = fns['get_email_template'](content, "Recordatorio - LIONSBIT VERIFICACION")
        await fns['send_email'](user_email, subject, html)
        logging.info(f"Reminder email sent to {user_email}")
    except Exception as e:
        logging.error(f"Failed to send reminder email to {user_email}: {e}")


async def process_user_reminders():
    """Send reminders every 12h to users with pending processes or available balance.
    Stops automatically when user completes their process."""
    logging.info("Running user reminder job (12h)...")
    try:
        now = datetime.now(timezone.utc)
        notified = set()

        # Daily budget shared for this job: keep Resend quota free for critical emails
        REMINDER_JOB_DAILY_BUDGET = 20
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        sent_today = await db.reminder_log.count_documents({'sent_at': {'$gte': today_start}})
        if sent_today >= REMINDER_JOB_DAILY_BUDGET:
            logging.info(f"Reminder job budget reached ({sent_today}/{REMINDER_JOB_DAILY_BUDGET}) — skipping")
            return
        emails_left = REMINDER_JOB_DAILY_BUDGET - sent_today

        # 1) Users with pending withdrawals (tax pending or processing)
        pending_txs = await db.transactions.find({
            'transaction_type': 'withdraw',
            'status': {'$in': ['pending_tax', 'pending', 'processing']}
        }, {'_id': 0, 'user_id': 1, 'amount': 1, 'currency': 1, 'status': 1}).to_list(200)

        for tx in pending_txs:
            uid = tx['user_id']
            if uid in notified:
                continue

            # Check if user opted out or was recently reminded (skip if reminded < 11h ago)
            last_reminder = await db.reminder_log.find_one(
                {'user_id': uid}, sort=[('sent_at', -1)]
            )
            if last_reminder:
                try:
                    lr_time = datetime.fromisoformat(str(last_reminder.get('sent_at', '')).replace('Z', '+00:00'))
                    if (now - lr_time).total_seconds() < 39600:  # < 11h
                        continue
                except Exception:
                    pass

            notified.add(uid)

            # Get user info for email
            user = await db.users.find_one({'id': uid}, {'_id': 0, 'email': 1, 'name': 1})
            if not user:
                continue

            amount_str = f"${tx['amount']:,.2f} {tx['currency']}"
            status_label = {
                'pending_tax': 'impuesto pendiente',
                'pending': 'pendiente de aprobacion',
                'processing': 'en proceso'
            }.get(tx['status'], tx['status'])

            # In-app notification
            await create_notification(uid, 'Proceso Pendiente',
                f'Tienes un retiro de {amount_str} ({status_label}) pendiente de completar. Puedes continuar en cualquier momento desde tu cuenta.')

            # Email notification
            email_html = f"""
                <p style="color:#e2e8f0;font-size:15px;line-height:1.6;">
                    Tienes un retiro de <strong style="color:#f59e0b;">{amount_str}</strong> con estado
                    <strong style="color:#22d3ee;">{status_label}</strong> pendiente de completar proceso.
                </p>
                <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
                    Puedes continuar en cualquier momento desde tu cuenta. Si necesitas ayuda, contacta a nuestro equipo de soporte.
                </p>
            """
            await _send_reminder_email(user['email'], user['name'],
                f'Proceso pendiente - Retiro {amount_str}', email_html)

            # Log reminder
            await db.reminder_log.insert_one({
                'user_id': uid,
                'type': 'pending_withdrawal',
                'sent_at': now.isoformat(),
                'channel': 'both'
            })
            emails_left -= 1
            if emails_left <= 0:
                logging.info("Reminder job budget consumed — stopping early")
                return

        # 2) Users with available balance but no pending processes
        users_with_balance = await db.accounts.find({
            'account_type': 'checking',
            '$or': [{'balance_usd': {'$gt': 0}}, {'balance_eur': {'$gt': 0}}]
        }, {'_id': 0, 'user_id': 1, 'balance_usd': 1, 'balance_eur': 1}).to_list(200)

        for acc in users_with_balance:
            uid = acc['user_id']
            if uid in notified:
                continue

            # Check if user has any completed withdrawals (stop reminders)
            recently_completed = await db.transactions.count_documents({
                'user_id': uid,
                'transaction_type': 'withdraw',
                'status': 'completed',
                'released_at': {'$gte': (now - timedelta(days=7)).isoformat()}
            })
            if recently_completed > 0:
                continue

            # Check last reminder timing
            last_reminder = await db.reminder_log.find_one(
                {'user_id': uid, 'type': 'balance_available'}, sort=[('sent_at', -1)]
            )
            if last_reminder:
                try:
                    lr_time = datetime.fromisoformat(str(last_reminder.get('sent_at', '')).replace('Z', '+00:00'))
                    if (now - lr_time).total_seconds() < 39600:
                        continue
                except Exception:
                    pass

            user = await db.users.find_one({'id': uid}, {'_id': 0, 'email': 1, 'name': 1, 'last_active': 1})
            if not user:
                continue

            # Only remind inactive users (>6h)
            if user.get('last_active'):
                try:
                    la = datetime.fromisoformat(str(user['last_active']).replace('Z', '+00:00'))
                    if (now - la).total_seconds() < 21600:  # < 6h
                        continue
                except Exception:
                    pass

            total_usd = acc.get('balance_usd', 0)
            total_eur = acc.get('balance_eur', 0)
            total = total_usd + total_eur
            notified.add(uid)

            # In-app notification
            await create_notification(uid, 'Saldo Disponible',
                f'Tienes un saldo disponible de ${total:,.2f} pendiente de completar proceso. Puedes continuar en cualquier momento desde tu cuenta.')

            # Email notification
            balance_parts = []
            if total_usd > 0:
                balance_parts.append(f"${total_usd:,.2f} USD")
            if total_eur > 0:
                balance_parts.append(f"\u20AC{total_eur:,.2f} EUR")
            balance_str = " + ".join(balance_parts)

            email_html = f"""
                <p style="color:#e2e8f0;font-size:15px;line-height:1.6;">
                    Tienes un saldo disponible de <strong style="color:#10b981;">{balance_str}</strong> pendiente de completar proceso.
                </p>
                <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
                    Puedes continuar en cualquier momento desde tu cuenta para gestionar tus fondos disponibles.
                </p>
            """
            await _send_reminder_email(user['email'], user['name'],
                f'Saldo disponible - {balance_str}', email_html)

            # Log reminder
            await db.reminder_log.insert_one({
                'user_id': uid,
                'type': 'balance_available',
                'sent_at': now.isoformat(),
                'channel': 'both'
            })
            emails_left -= 1
            if emails_left <= 0:
                logging.info("Reminder job budget consumed — stopping early")
                return

        logging.info(f"Reminders sent to {len(notified)} users (in-app + email)")
    except Exception as e:
        logging.error(f"Error in user reminders: {e}")
