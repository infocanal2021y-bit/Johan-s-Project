import { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck, X, Loader2, Clock, CreditCard, ArrowUpRight, MessageSquare, FileCheck, UserCheck, Info } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { notificationsAPI } from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';

const getNotificationMeta = (title) => {
    const t = (title || '').toLowerCase();
    if (t.includes('transferencia')) return { icon: CreditCard, color: 'text-cyan-400', bg: 'bg-cyan-500/20' };
    if (t.includes('comprobante')) return { icon: FileCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/20' };
    if (t.includes('retiro') || t.includes('withdraw')) return { icon: ArrowUpRight, color: 'text-orange-400', bg: 'bg-orange-500/20' };
    if (t.includes('soporte') || t.includes('ticket') || t.includes('reporte')) return { icon: MessageSquare, color: 'text-amber-400', bg: 'bg-amber-500/20' };
    if (t.includes('impuesto') || t.includes('tax') || t.includes('abono')) return { icon: FileCheck, color: 'text-violet-400', bg: 'bg-violet-500/20' };
    if (t.includes('kyc') || t.includes('verificacion')) return { icon: UserCheck, color: 'text-teal-400', bg: 'bg-teal-500/20' };
    if (t.includes('bienvenido') || t.includes('welcome')) return { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/20' };
    if (t.includes('saldo') || t.includes('deposito') || t.includes('credit')) return { icon: CreditCard, color: 'text-emerald-400', bg: 'bg-emerald-500/20' };
    return { icon: Bell, color: 'text-slate-400', bg: 'bg-slate-500/20' };
};

const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `Hace ${minutes}m`;
    if (hours < 24) return `Hace ${hours}h`;
    if (days < 7) return `Hace ${days}d`;
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
};

const formatFullDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('es-ES', {
        day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

export const NotificationBell = () => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [detailOpen, setDetailOpen] = useState(false);
    const [selectedNotif, setSelectedNotif] = useState(null);
    const dropdownRef = useRef(null);

    const fetchNotifications = async () => {
        try {
            const response = await notificationsAPI.getAll();
            setNotifications(response.data.notifications || []);
            setUnreadCount(response.data.unread_count || 0);
        } catch (error) {
            // silent
        }
    };

    useEffect(() => {
        fetchNotifications();
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

    const handleNotificationClick = async (notification) => {
        // Mark as read
        if (!notification.read) {
            try {
                await notificationsAPI.markAsRead(notification.id);
                setNotifications(prev =>
                    prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
                );
                setUnreadCount(prev => Math.max(0, prev - 1));
            } catch (error) {
                // silent
            }
        }
        // Open detail
        setSelectedNotif(notification);
        setDetailOpen(true);
    };

    const handleMarkAllAsRead = async () => {
        setLoading(true);
        try {
            await notificationsAPI.markAllAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            setUnreadCount(0);
        } catch (error) {
            // silent
        } finally {
            setLoading(false);
        }
    };

    const meta = selectedNotif ? getNotificationMeta(selectedNotif.title) : null;
    const DetailIcon = meta?.icon || Bell;

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
                        data-testid="notification-dropdown"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800/50">
                            <h3 className="text-white font-semibold flex items-center gap-2 text-sm">
                                <Bell className="w-4 h-4 text-emerald-400" />
                                Notificaciones
                            </h3>
                            <div className="flex items-center gap-2">
                                {unreadCount > 0 && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleMarkAllAsRead}
                                        disabled={loading}
                                        className="text-xs text-emerald-400 hover:text-emerald-300 hover:bg-slate-700 h-7 px-2"
                                        data-testid="mark-all-read-btn"
                                    >
                                        {loading ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <><CheckCheck className="w-3 h-3 mr-1" /> Marcar todo leido</>
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
                                    <Bell className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                                    <p className="text-slate-500 text-sm">Sin notificaciones</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-800/60">
                                    {notifications.map((notification) => {
                                        const nm = getNotificationMeta(notification.title);
                                        const NIcon = nm.icon;
                                        return (
                                            <button
                                                key={notification.id}
                                                onClick={() => handleNotificationClick(notification)}
                                                data-testid={`notification-item-${notification.id}`}
                                                className={`w-full text-left p-3.5 hover:bg-slate-800/50 transition-colors ${
                                                    !notification.read ? 'bg-emerald-500/[0.04] border-l-2 border-emerald-500' : 'border-l-2 border-transparent'
                                                }`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className={`w-8 h-8 rounded-lg ${nm.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                                                        <NIcon className={`w-4 h-4 ${nm.color}`} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className={`text-sm truncate ${
                                                                notification.read ? 'text-slate-400 font-normal' : 'text-white font-semibold'
                                                            }`}>
                                                                {notification.title}
                                                            </p>
                                                            {!notification.read && (
                                                                <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />
                                                            )}
                                                        </div>
                                                        <p className={`text-xs mt-1 line-clamp-2 ${notification.read ? 'text-slate-600' : 'text-slate-400'}`}>
                                                            {notification.message}
                                                        </p>
                                                        <p className="text-[11px] text-slate-600 mt-1.5 flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />
                                                            {formatTime(notification.created_at)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {notifications.length > 0 && (
                            <div className="p-2.5 border-t border-slate-700 bg-slate-800/30">
                                <p className="text-[11px] text-slate-600 text-center">
                                    Ultimas {notifications.length} notificaciones
                                </p>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Notification Detail Modal ── */}
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="bg-slate-900 border-slate-700 max-w-sm" data-testid="notification-detail-modal">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2 text-base">
                            {meta && <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center`}><DetailIcon className={`w-4 h-4 ${meta.color}`} /></div>}
                            <span className="truncate">{selectedNotif?.title}</span>
                        </DialogTitle>
                    </DialogHeader>
                    {selectedNotif && (
                        <div className="space-y-4">
                            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/50">
                                <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                                    {selectedNotif.message}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Clock className="w-3.5 h-3.5" />
                                {formatFullDate(selectedNotif.created_at)}
                            </div>
                            <Button onClick={() => setDetailOpen(false)} className="w-full bg-slate-800 hover:bg-slate-700 text-white" data-testid="notification-detail-close-btn">
                                <X className="w-4 h-4 mr-2" /> Cerrar
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default NotificationBell;
