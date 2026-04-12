"""Notification routes"""
from fastapi import APIRouter, Depends
from datetime import datetime, timezone
from config import db, strip_id
from services.auth import get_current_user

router = APIRouter()

# ==================== NOTIFICATIONS ROUTES ====================

@router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    notifications = await db.notifications.find(
        {'user_id': current_user['id']},
        {'_id': 0}
    ).sort('created_at', -1).limit(50).to_list(50)
    
    unread_count = await db.notifications.count_documents({
        'user_id': current_user['id'],
        'read': False
    })
    
    return {
        'notifications': notifications,
        'unread_count': unread_count
    }

@router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.notifications.update_one(
        {'id': notification_id, 'user_id': current_user['id']},
        {'$set': {'read': True}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail='Notification not found')
    
    return {'message': 'Notification marked as read'}

@router.put("/notifications/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    await db.notifications.update_many(
        {'user_id': current_user['id'], 'read': False},
        {'$set': {'read': True}}
    )
    return {'message': 'All notifications marked as read'}

