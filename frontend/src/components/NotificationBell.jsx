import { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, X, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { notificationsAPI } from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';

export const NotificationBell = () => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef(null);

    const fetchNotifications = async () => {
        try {
            const response = await notificationsAPI.getAll();
            setNotifications(response.data.notifications || []);
            setUnreadCount(response.data.unread_count || 0);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        }
    };

    useEffect(() => {
        fetchNotifications();
        // Poll for new notifications every 30 seconds
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMarkAsRead = async (notificationId) => {
        try {
            await notificationsAPI.markAsRead(notificationId);
            setNotifications(prev => 
                prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    };

    const handleMarkAllAsRead = async () => {
        setLoading(true);
        try {
            await notificationsAPI.markAllAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    };

    const getNotificationIcon = (title) => {
        if (title.toLowerCase().includes('deposit') || title.toLowerCase().includes('credit')) {
            return '💰';
        }
        if (title.toLowerCase().includes('withdraw') || title.toLowerCase().includes('retiro')) {
            return '📤';
        }
        if (title.toLowerCase().includes('transfer')) {
            return '↔️';
        }
        if (title.toLowerCase().includes('support') || title.toLowerCase().includes('ticket')) {
            return '💬';
        }
        if (title.toLowerCase().includes('tax')) {
            return '📋';
        }
        if (title.toLowerCase().includes('kyc') || title.toLowerCase().includes('verification')) {
            return '✅';
        }
        if (title.toLowerCase().includes('welcome')) {
            return '👋';
        }
        return '🔔';
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(!isOpen)}
                className="relative text-slate-400 hover:text-white hover:bg-slate-800"
                data-testid="notification-bell"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </Button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800/50">
                            <h3 className="text-white font-semibold flex items-center gap-2">
                                <Bell className="w-4 h-4 text-emerald-400" />
                                Notifications
                            </h3>
                            <div className="flex items-center gap-2">
                                {unreadCount > 0 && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleMarkAllAsRead}
                                        disabled={loading}
                                        className="text-xs text-emerald-400 hover:text-emerald-300 hover:bg-slate-700"
                                    >
                                        {loading ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <>
                                                <CheckCheck className="w-3 h-3 mr-1" />
                                                Mark all read
                                            </>
                                        )}
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setIsOpen(false)}
                                    className="w-6 h-6 text-slate-400 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Notifications List */}
                        <div className="max-h-96 overflow-y-auto">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center">
                                    <Bell className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                                    <p className="text-slate-500">No notifications yet</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-800">
                                    {notifications.map((notification) => (
                                        <div
                                            key={notification.id}
                                            className={`p-4 hover:bg-slate-800/50 transition-colors cursor-pointer ${
                                                !notification.read ? 'bg-emerald-500/5 border-l-2 border-emerald-500' : ''
                                            }`}
                                            onClick={() => !notification.read && handleMarkAsRead(notification.id)}
                                        >
                                            <div className="flex items-start gap-3">
                                                <span className="text-xl flex-shrink-0">
                                                    {getNotificationIcon(notification.title)}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className={`font-medium truncate ${
                                                            notification.read ? 'text-slate-400' : 'text-white'
                                                        }`}>
                                                            {notification.title}
                                                        </p>
                                                        {!notification.read && (
                                                            <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">
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
                        </div>

                        {/* Footer */}
                        {notifications.length > 0 && (
                            <div className="p-3 border-t border-slate-700 bg-slate-800/30">
                                <p className="text-xs text-slate-500 text-center">
                                    Showing last {notifications.length} notifications
                                </p>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NotificationBell;
