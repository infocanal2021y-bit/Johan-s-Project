"""Notification services: in-app notifications and admin alerts."""
import uuid
import logging
from datetime import datetime, timezone
from config import db, SENDER_EMAIL, RESEND_API_KEY


async def create_notification(user_id: str, title: str, message: str):
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

async def notify_admins(title: str, message: str):
    admins = await db.users.find({'role': 'admin'}, {'_id': 0}).to_list(100)
    for admin in admins:
        await create_notification(admin['id'], title, message)

async def create_admin_notification(title: str, message: str, category: str = 'general',
                                     priority: str = 'normal', action_url: str = None,
                                     metadata: dict = None, send_email: bool = True):
    admins = await db.users.find({'role': 'admin'}, {'_id': 0, 'id': 1, 'email': 1}).to_list(100)
    notifications = []
    for admin in admins:
        notification = {
            'id': str(uuid.uuid4()),
            'user_id': admin['id'],
            'title': title,
            'message': message,
            'read': False,
            'category': category,
            'priority': priority,
            'action_url': action_url,
            'metadata': metadata or {},
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        await db.notifications.insert_one(notification)
        notifications.append(notification)
    return notifications
