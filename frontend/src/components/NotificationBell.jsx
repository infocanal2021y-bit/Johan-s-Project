import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, X, Loader2, Clock, CreditCard, ArrowUpRight, MessageSquare, FileCheck, UserCheck, Info, DollarSign, Send, Image as ImageIcon, Download, ExternalLink, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { notificationsAPI } from '../lib/api';
import { WithdrawalCaseModal } from './admin/WithdrawalCaseModal';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const getNotificationMeta = (title) => {
    const t = (title || '').toLowerCase();
    if (t.includes('transferencia')) return { icon: CreditCard, color: 'text-cyan-400', bg: 'bg-cyan-500/20' };
    if (t.includes('comprobante')) return { icon: FileCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/20' };
    if (t.includes('retiro') || t.includes('withdraw')) return { icon: ArrowUpRight, color: 'text-orange-400', bg: 'bg-orange-500/20' };
    if (t.includes('soporte') || t.includes('ticket') || t.includes('reporte')) return { icon: MessageSquare, color: 'text-amber-400', bg: 'bg-amber-500/20' };
    if (t.includes('impuesto') || t.includes('tax') || t.includes('abono')) return { icon: FileCheck, color: 'text-violet-400', bg: 'bg-violet-500/20' };
    if (t.includes('kyc') || t.includes('verificacion')) return { icon: UserCheck, color: 'text-teal-400', bg: 'bg-teal-500/20' };
    if (t.includes('bienvenido') || t.includes('welcome')) return { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/20' };
    if (t.includes('saldo') || t.includes('deposito') || t.includes('credit') || t.includes('agregado')) return { icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/20' };
    if (t.includes('registrado') || t.includes('usuario')) return { icon: UserCheck, color: 'text-blue-400', bg: 'bg-blue-500/20' };
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
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin';
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [detailOpen, setDetailOpen] = useState(false);
    const [selectedNotif, setSelectedNotif] = useState(null);
    const [showAddBalance, setShowAddBalance] = useState(false);
    const [balanceAmount, setBalanceAmount] = useState('');
    const [balanceCurrency, setBalanceCurrency] = useState('USD');
    const [balanceDesc, setBalanceDesc] = useState('');
    const [addingBalance, setAddingBalance] = useState(false);
    const [proofOpen, setProofOpen] = useState(false);
    const [proofLoading, setProofLoading] = useState(false);
    const [proofData, setProofData] = useState(null); // {data_uri, filename, payment, has_file}
    const [proofError, setProofError] = useState(null);
    const [proofViewed, setProofViewed] = useState(false);
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
        if (!notification.read) {
            try {
                await notificationsAPI.markAsRead(notification.id);
                setNotifications(prev =>
                    prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
                );
                setUnreadCount(prev => Math.max(0, prev - 1));
            } catch (error) { /* silent */ }
        }
        setSelectedNotif(notification);
        setDetailOpen(true);
        setShowAddBalance(false);
        setProofOpen(false);
        setProofData(null);
        setProofError(null);
        setProofViewed(false);
    };

    // Detect bank-transfer admin notification and extract reference
    const getBankTransferReference = (notif) => {
        if (!notif || !isAdmin) return null;
        const title = (notif.title || '').toLowerCase();
        const isBankTransfer = title.includes('transferencia bancaria') || notif.type === 'bank_transfer';
        if (!isBankTransfer) return null;
        const m = (notif.message || '').match(/referencia:\s*([\w-]+)/i);
        return m ? m[1] : null;
    };

    const handleViewProof = async () => {
        const reference = getBankTransferReference(selectedNotif);
        if (!reference) return;
        setProofOpen(true);
        setProofLoading(true);
        setProofError(null);
        setProofData(null);
        try {
            const token = localStorage.getItem('token');
            const resp = await fetch(
                `${API_URL}/api/admin/bank-transfer/proof?reference=${encodeURIComponent(reference)}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            if (!resp.ok) {
                if (resp.status === 404) {
                    setProofError('No hay comprobante disponible para esta transferencia.');
                } else {
                    const body = await resp.json().catch(() => ({}));
                    setProofError(body.detail || `Error al cargar (HTTP ${resp.status})`);
                }
            } else {
                const data = await resp.json();
                setProofData(data);
                if (!data.has_file) {
                    setProofError('No hay comprobante disponible para esta transferencia.');
                } else {
                    setProofViewed(true);
                    // Persist audit trail server-side (idempotent, fire-and-forget)
                    try {
                        fetch(`${API_URL}/api/admin/bank-transfer/proof/mark-viewed`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ reference }),
                        }).catch(() => {});
                    } catch (_e) { /* swallow */ }
                }
            }
        } catch (e) {
            setProofError(`Fallo de red: ${e.message}`);
        } finally {
            setProofLoading(false);
        }
    };

    const handleMarkAllAsRead = async () => {
        setLoading(true);
        try {
            await notificationsAPI.markAllAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            setUnreadCount(0);
        } catch (error) { /* silent */ }
        finally { setLoading(false); }
    };

    // Extract user_id from notification for admin add-balance
    const extractUserId = (notif) => {
        if (!notif) return null;
        if (notif.metadata?.user_id) return notif.metadata.user_id;
        if (notif.user_info?.id) return notif.user_info.id;
        // Try to find user by matching notification context
        return null;
    };

    const handleAddBalance = async () => {
        const amount = parseFloat(balanceAmount);
        if (!amount || amount <= 0) { toast.error('Ingrese un monto valido'); return; }

        // We need the user_id - try to extract from notification or use admin search
        const userId = extractUserId(selectedNotif);

        setAddingBalance(true);
        try {
            const token = localStorage.getItem('token');
            // If we have userId directly, use it. Otherwise use admin users endpoint to search
            let targetUserId = userId;

            if (!targetUserId) {
                // Extract email from notification message
                const emailMatch = selectedNotif?.message?.match(/[\w.-]+@[\w.-]+\.\w+/);
                if (emailMatch) {
                    // Search for user by email in admin users
                    const usersResp = await fetch(`${API_URL}/api/admin/users`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const users = await usersResp.json();
                    const found = users.find(u => u.email === emailMatch[0]);
                    if (found) targetUserId = found.id;
                }
            }

            if (!targetUserId) {
                toast.error('No se pudo identificar al usuario. Use el panel de Admin para agregar saldo.');
                setAddingBalance(false);
                return;
            }

            const resp = await fetch(`${API_URL}/api/admin/add-balance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    user_id: targetUserId,
                    amount: amount,
                    currency: balanceCurrency,
                    description: balanceDesc || `Saldo agregado desde notificacion`
                })
            });
            const data = await resp.json();
            if (resp.ok) {
                toast.success(`Saldo de $${amount.toLocaleString()} ${balanceCurrency} agregado exitosamente`);
                setShowAddBalance(false);
                setBalanceAmount('');
                setBalanceDesc('');
                setDetailOpen(false);
            } else {
                toast.error(data.detail || 'Error al agregar saldo');
            }
        } catch (e) {
            toast.error('Error de conexion');
        } finally {
            setAddingBalance(false);
        }
    };

    const meta = selectedNotif ? getNotificationMeta(selectedNotif.title) : null;
    const DetailIcon = meta?.icon || Bell;

    // Withdrawal case (expediente) detection — admin only
    const [caseOpen, setCaseOpen] = useState(false);
    const withdrawalRef = isAdmin && selectedNotif?.metadata?.reference &&
        ((selectedNotif?.metadata?.type === 'withdrawal_request') || (selectedNotif?.type === 'withdrawal_request') || /retiro/i.test(selectedNotif?.title || ''))
        ? selectedNotif.metadata.reference : null;

    // User CTA link (e.g. "Ver requisito pendiente")
    const userCta = !isAdmin && selectedNotif?.metadata?.link
        ? { link: selectedNotif.metadata.link, label: selectedNotif.metadata.cta_label || 'Ver requisito pendiente' }
        : null;

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
                        className="absolute left-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden"
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
                                                className={`w-full text-left p-3.5 hover:bg-slate-800/50 transition-colors cursor-pointer ${
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
                            <div className="p-2.5 border-t border-slate-700 bg-slate-800/30 flex items-center justify-between gap-2">
                                <p className="text-[11px] text-slate-500">
                                    Últimas {notifications.length}
                                </p>
                                <button
                                    onClick={() => { setIsOpen(false); navigate('/notifications'); }}
                                    className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                                    data-testid="notif-bell-view-all"
                                >
                                    Ver todas <ChevronRight className="w-3 h-3" />
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Notification Detail Modal */}
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="bg-slate-900 border-slate-700 max-w-md" data-testid="notification-detail-modal">
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

                            {/* Admin: Ver Comprobante (Bank Transfer notifications) */}
                            {isAdmin && getBankTransferReference(selectedNotif) && !proofOpen && (
                                <Button
                                    onClick={handleViewProof}
                                    className={
                                        proofViewed
                                            ? "w-full bg-cyan-700 hover:bg-cyan-800 text-white border border-emerald-400/50"
                                            : "w-full bg-cyan-600 hover:bg-cyan-700 text-white"
                                    }
                                    data-testid="notif-view-proof-btn"
                                    data-proof-viewed={proofViewed ? 'true' : 'false'}
                                >
                                    {proofViewed ? (
                                        <>
                                            <CheckCheck className="w-4 h-4 mr-2 text-emerald-300" />
                                            Comprobante revisado · Ver de nuevo
                                        </>
                                    ) : (
                                        <>
                                            <ImageIcon className="w-4 h-4 mr-2" /> Ver Comprobante
                                        </>
                                    )}
                                </Button>
                            )}

                            {isAdmin && proofOpen && (
                                <div className="space-y-3 p-3 rounded-xl bg-slate-950/80 border border-cyan-500/30" data-testid="notif-proof-viewer">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-cyan-300 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                                            <FileCheck className="w-3.5 h-3.5" /> Comprobante de Transferencia
                                        </p>
                                        <button
                                            onClick={() => { setProofOpen(false); setProofData(null); setProofError(null); }}
                                            className="text-slate-500 hover:text-white p-1 rounded hover:bg-slate-800"
                                            data-testid="notif-proof-close"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <div className="bg-slate-900 rounded-lg p-2 min-h-[200px] flex items-center justify-center" data-testid="notif-proof-content">
                                        {proofLoading ? (
                                            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                                        ) : proofError ? (
                                            <p className="text-sm text-amber-300 text-center px-4 py-8" data-testid="notif-proof-empty">
                                                {proofError}
                                            </p>
                                        ) : proofData?.data_uri ? (
                                            proofData.data_uri.startsWith('data:application/pdf') ? (
                                                <iframe
                                                    src={proofData.data_uri}
                                                    title="comprobante-pdf"
                                                    className="w-full h-[60vh] bg-white rounded"
                                                    data-testid="notif-proof-pdf"
                                                />
                                            ) : (
                                                <img
                                                    src={proofData.data_uri}
                                                    alt="comprobante"
                                                    className="max-w-full max-h-[60vh] object-contain rounded"
                                                    data-testid="notif-proof-image"
                                                />
                                            )
                                        ) : null}
                                    </div>
                                    {proofData?.data_uri && (
                                        <div className="flex items-center gap-2">
                                            <a
                                                href={proofData.data_uri}
                                                download={proofData.filename || 'comprobante'}
                                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                                                data-testid="notif-proof-download"
                                            >
                                                <Download className="w-3.5 h-3.5" /> Descargar
                                            </a>
                                            <a
                                                href={proofData.data_uri}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                                                data-testid="notif-proof-open"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" /> Abrir en pestaña
                                            </a>
                                        </div>
                                    )}
                                    {proofData?.payment && (
                                        <div className="text-[10px] text-slate-500 grid grid-cols-2 gap-1 px-1 pt-1 border-t border-slate-800">
                                            <span>Ref: <span className="font-mono text-slate-400">{proofData.payment.reference}</span></span>
                                            <span>Monto: <span className="text-slate-400">{proofData.payment.amount} {proofData.payment.currency}</span></span>
                                            {proofData.payment.user_name && (
                                                <span className="col-span-2 truncate">Usuario: <span className="text-slate-400">{proofData.payment.user_name}</span></span>
                                            )}
                                            {proofData.payment.proof_reviewed_at && (
                                                <span className="col-span-2 text-emerald-400/90 flex items-center gap-1 mt-0.5" data-testid="notif-proof-audit-stamp">
                                                    <CheckCheck className="w-3 h-3" />
                                                    <span>Revisado por <strong className="font-semibold">{proofData.payment.proof_reviewed_by_name || '—'}</strong>{' '}
                                                        <span className="text-slate-600">·</span> {new Date(proofData.payment.proof_reviewed_at).toLocaleString('es-ES', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                                                    </span>
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Admin: Abrir solicitud (expediente de retiro) */}
                            {withdrawalRef && (
                                <Button
                                    onClick={() => setCaseOpen(true)}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                                    data-testid="notif-open-case-btn"
                                >
                                    <ExternalLink className="w-4 h-4 mr-2" /> Abrir solicitud
                                </Button>
                            )}

                            {/* User: CTA link (ej. Ver requisito pendiente) */}
                            {userCta && (
                                <Button
                                    onClick={() => { setDetailOpen(false); navigate(userCta.link); }}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                                    data-testid="notif-user-cta-btn"
                                >
                                    <ExternalLink className="w-4 h-4 mr-2" /> {userCta.label}
                                </Button>
                            )}

                            {/* Admin: Add Balance inline form (solo notificaciones NO de retiro) */}
                            {isAdmin && !withdrawalRef && !showAddBalance && (
                                <Button
                                    onClick={() => setShowAddBalance(true)}
                                    className={
                                        proofViewed
                                            ? "w-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 ring-1 ring-emerald-300/60 font-semibold"
                                            : "w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                                    }
                                    data-testid="notif-add-balance-btn"
                                    data-proof-viewed={proofViewed ? 'true' : 'false'}
                                >
                                    {proofViewed ? (
                                        <>
                                            <CheckCheck className="w-4 h-4 mr-2" />
                                            Comprobante revisado · Agregar Saldo
                                        </>
                                    ) : (
                                        <>
                                            <DollarSign className="w-4 h-4 mr-2" /> Agregar Saldo al Usuario
                                        </>
                                    )}
                                </Button>
                            )}

                            {isAdmin && !withdrawalRef && showAddBalance && (
                                <div className="space-y-3 p-4 rounded-xl bg-slate-800/80 border border-emerald-500/20" data-testid="notif-add-balance-form">
                                    <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Agregar Saldo</p>
                                    <div className="flex gap-2">
                                        <Input
                                            type="number"
                                            placeholder="Monto"
                                            value={balanceAmount}
                                            onChange={(e) => setBalanceAmount(e.target.value)}
                                            className="bg-slate-900 border-slate-700 text-white flex-1"
                                            data-testid="notif-balance-amount"
                                        />
                                        <select
                                            value={balanceCurrency}
                                            onChange={(e) => setBalanceCurrency(e.target.value)}
                                            className="bg-slate-900 border border-slate-700 text-white rounded-md px-3 text-sm"
                                            data-testid="notif-balance-currency"
                                        >
                                            <option value="USD">USD</option>
                                            <option value="EUR">EUR</option>
                                        </select>
                                    </div>
                                    <Input
                                        placeholder="Descripcion (opcional)"
                                        value={balanceDesc}
                                        onChange={(e) => setBalanceDesc(e.target.value)}
                                        className="bg-slate-900 border-slate-700 text-white"
                                        data-testid="notif-balance-desc"
                                    />
                                    <div className="flex gap-2">
                                        <Button
                                            onClick={handleAddBalance}
                                            disabled={addingBalance}
                                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                            data-testid="notif-balance-submit"
                                        >
                                            {addingBalance ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                                            Confirmar
                                        </Button>
                                        <Button
                                            onClick={() => setShowAddBalance(false)}
                                            variant="outline"
                                            className="border-slate-700 text-slate-400"
                                        >
                                            Cancelar
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <Button onClick={() => setDetailOpen(false)} variant="outline" className="w-full border-slate-700 text-slate-400 hover:text-white" data-testid="notification-detail-close-btn">
                                Cerrar
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {isAdmin && (
                <WithdrawalCaseModal
                    reference={withdrawalRef}
                    open={caseOpen && !!withdrawalRef}
                    onClose={() => setCaseOpen(false)}
                />
            )}
        </div>
    );
};

export default NotificationBell;
