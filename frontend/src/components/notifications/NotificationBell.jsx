import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ScrollArea } from '../ui/scroll-area';
import { notificationsAPI } from '../../lib/api';
import { formatDistanceToNow } from 'date-fns';

export const NotificationBell = () => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [open, setOpen] = useState(false);

    const fetchNotifications = async () => {
        try {
            const response = await notificationsAPI.getAll();
            setNotifications(response.data.notifications);
            setUnreadCount(response.data.unread_count);
        } catch (error) {
            console.error('Failed to fetch notifications');
        }
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    const handleMarkRead = async (id) => {
        try {
            await notificationsAPI.markRead(id);
            fetchNotifications();
        } catch (error) {
            console.error('Failed to mark notification as read');
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await notificationsAPI.markAllRead();
            fetchNotifications();
        } catch (error) {
            console.error('Failed to mark all as read');
        }
    };

    const formatTime = (dateString) => {
        try {
            return formatDistanceToNow(new Date(dateString), { addSuffix: true });
        } catch {
            return dateString;
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    data-testid="notification-bell"
                >
                    <Bell className="w-5 h-5 text-slate-400" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs text-white flex items-center justify-center font-medium">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0 bg-slate-900 border-slate-800" align="end">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                    <h3 className="font-semibold text-white">Notifications</h3>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-emerald-400 hover:text-emerald-300"
                            onClick={handleMarkAllRead}
                        >
                            Mark all read
                        </Button>
                    )}
                </div>
                <ScrollArea className="h-[300px]">
                    {notifications.length === 0 ? (
                        <div className="py-8 text-center text-slate-500">
                            No notifications
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-800">
                            {notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    className={`px-4 py-3 cursor-pointer hover:bg-slate-800/50 transition-colors ${
                                        !notification.read ? 'bg-slate-800/30' : ''
                                    }`}
                                    onClick={() => handleMarkRead(notification.id)}
                                    data-testid={`notification-${notification.id}`}
                                >
                                    <div className="flex items-start gap-3">
                                        {!notification.read && (
                                            <span className="w-2 h-2 bg-emerald-500 rounded-full mt-2 flex-shrink-0" />
                                        )}
                                        <div className={!notification.read ? '' : 'ml-5'}>
                                            <p className="font-medium text-white text-sm">
                                                {notification.title}
                                            </p>
                                            <p className="text-xs text-slate-400 mt-1">
                                                {notification.message}
                                            </p>
                                            <p className="text-xs text-slate-600 mt-2">
                                                {formatTime(notification.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
};
