import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
    Clock, CheckCircle, XCircle, Loader2, RefreshCw, ChevronDown,
    Building2, CreditCard, Globe, User, ArrowRight, Ban,
    Banknote, FileText, RotateCcw, DollarSign, Mail, Calendar,
    AlertTriangle, History, ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_CONFIG = [
    { key: 'pending_tax', label: 'Impuesto Pendiente', icon: AlertTriangle, color: 'orange', filter: w => ['pending_tax', 'crypto_payment_under_review'].includes(w.status) },
    { key: 'pending', label: 'Pendientes', icon: Clock, color: 'amber', filter: w => w.status === 'pending' },
    { key: 'processing', label: 'Procesando', icon: Loader2, color: 'cyan', filter: w => w.status === 'processing' },
    { key: 'transfer', label: 'En Transferencia', icon: ArrowRight, color: 'blue', filter: w => w.status === 'transfer_in_progress' },
    { key: 'completed', label: 'Completados', icon: CheckCircle, color: 'emerald', filter: w => w.status === 'completed' },
    { key: 'rejected', label: 'Rechazados', icon: XCircle, color: 'red', filter: w => w.status === 'rejected' },
];

const colorMap = {
    orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', badge: 'bg-orange-500' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', badge: 'bg-amber-500' },
    cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400', badge: 'bg-cyan-500' },
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', badge: 'bg-blue-500' },
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', badge: 'bg-emerald-500' },
    red: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', badge: 'bg-red-500' },
};

const statusLabels = {
    pending: 'Pendiente', processing: 'Procesando', transfer_in_progress: 'En Transferencia',
    completed: 'Completado', rejected: 'Rechazado', pending_tax: 'Impuesto Pendiente', under_review: 'En Revision',
    crypto_payment_under_review: 'Comprobante en Revision',
};

const AUTH_REQUIRED_EUR = 4850;
const fmtEur = (n) => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 });

/* ── Authorization Modal (full withdrawals) ── */
const WithdrawalAuthModal = ({ withdrawalId, onClose, onDone }) => {
    const [info, setInfo] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        adminAPI.getWithdrawalAuthInfo(withdrawalId)
            .then(r => setInfo(r.data))
            .catch(() => { toast.error('No se pudo cargar la información'); onClose(); });
    }, [withdrawalId, onClose]);

    const confirm = async () => {
        setBusy(true);
        try {
            await adminAPI.authorizeWithdrawal(withdrawalId);
            toast.success('Autorización completada · Retiro autorizado para procesamiento');
            onClose();
            onDone();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo completar la autorización');
        } finally {
            setBusy(false);
        }
    };

    const pm = info?.payment_method;
    const alreadyDone = info?.authorization?.status === 'completed';

    return (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="bg-slate-900 border-slate-800 max-w-lg" data-testid="withdrawal-auth-modal">
                <DialogHeader>
                    <DialogTitle className="text-white flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-amber-400" /> Autorización de transacción
                        <span className="font-mono text-cyan-400 text-sm">{info?.reference || ''}</span>
                    </DialogTitle>
                </DialogHeader>
                {!info ? (
                    <div className="p-8 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin text-slate-500" /></div>
                ) : (
                    <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-2 gap-2.5 text-sm">
                            <div className="p-3 rounded-lg bg-slate-800/60">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Importe total solicitado</p>
                                <p className="text-white font-bold font-mono mt-1" data-testid="wd-auth-requested">{fmtEur(info.requested_amount)} {info.requested_currency}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25">
                                <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Importe requerido</p>
                                <p className="text-amber-300 font-bold font-mono text-lg mt-1" data-testid="wd-auth-required">{fmtEur(info.required_eur)} €</p>
                            </div>
                            <div className="p-3 rounded-lg bg-slate-800/60 col-span-2">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Concepto del importe</p>
                                <p className="text-white mt-1" data-testid="wd-auth-concept">{info.concept}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-slate-800/60">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Estado actual</p>
                                <p className="text-white font-semibold mt-1" data-testid="wd-auth-status">{alreadyDone ? 'Autorización completada' : 'Pendiente de abono y verificación'}</p>
                                <p className="text-slate-500 text-xs">{info.status_label}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-slate-800/60">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Fecha de solicitud</p>
                                <p className="text-white font-semibold mt-1" data-testid="wd-auth-date">{formatDate(info.created_at)}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-slate-800/60 col-span-2">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Método de pago utilizado</p>
                                <p className="text-white font-semibold mt-1" data-testid="wd-auth-payment-method">{pm?.label}</p>
                                {pm?.status === 'not_declared' ? (
                                    <p className="text-slate-500 text-xs">El usuario aún no ha declarado el pago</p>
                                ) : (
                                    <>
                                        <p className="text-slate-500 text-xs">Estado del pago: <span className="font-semibold text-slate-300">{pm?.status}</span>{pm?.detected_amount ? ` · Enviado: ${pm.detected_amount}` : ''}</p>
                                        {pm?.txid && <p className="text-slate-600 text-[11px] font-mono truncate" title={pm.txid}>TXID: {pm.txid}</p>}
                                    </>
                                )}
                            </div>
                        </div>

                        {info.requirements && (
                            <div className="p-3 rounded-lg bg-slate-800/60" data-testid="wd-auth-requirements">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Requisitos previos al procesamiento</p>
                                <div className="space-y-1.5">
                                    {info.requirements.items.map((it) => (
                                        <div key={it.key} className="flex items-center gap-2 text-xs" data-testid={`wd-auth-req-${it.key}`}>
                                            {it.done
                                                ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                                : <XCircle className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />}
                                            <span className={it.done ? 'text-slate-300' : 'text-slate-500'}>{it.label}</span>
                                            {!it.done && <span className="ml-auto text-[9px] text-amber-500 font-bold uppercase">Pendiente</span>}
                                        </div>
                                    ))}
                                </div>
                                {info.requirements.alert && (
                                    <div className="mt-2.5 p-2 rounded-md bg-amber-500/10 border border-amber-500/25 flex items-start gap-2" data-testid="wd-auth-requirements-alert">
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                                        <p className="text-amber-300 text-[11px] leading-snug">{info.requirements.alert}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {alreadyDone ? (
                            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm" data-testid="wd-auth-done-banner">
                                <p className="font-bold flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> Autorización completada</p>
                                <p className="mt-0.5 text-xs">Verificado el {formatDate(info.authorization.authorized_at)} por <span className="font-semibold">{info.authorization.authorized_by_name}</span></p>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-500 bg-slate-800/40 rounded-md p-2.5">
                                Al confirmar, el estado cambiará a <span className="font-bold text-emerald-400">"Autorización completada"</span> y después a <span className="font-bold text-amber-400">"Retiro autorizado para procesamiento"</span>. Se registrará en el historial la fecha, hora y el administrador que confirmó la operación.
                            </p>
                        )}

                        <div className="flex gap-2">
                            <Button variant="outline" onClick={onClose} className="flex-1 border-slate-700 text-slate-300">Cerrar</Button>
                            {!alreadyDone && (
                                <Button onClick={confirm} disabled={busy} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold" data-testid="wd-auth-confirm-btn">
                                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Importe recibido y verificado'}
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

const formatDate = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

const getNextStatus = (s) => ({ pending: 'processing', processing: 'transfer_in_progress', transfer_in_progress: 'completed' }[s] || null);
const getNextLabel = (s) => ({ pending: 'Aprobar', processing: 'En Transferencia', transfer_in_progress: 'Completar' }[s] || null);

/* ── Expanded User Row ── */
const UserDetailPanel = ({ withdrawal, onReactivate, onAddBalance, reactivating }) => {
    const [details, setDetails] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        adminAPI.getWithdrawalDetails(withdrawal.id)
            .then(res => setDetails(res.data))
            .catch(() => toast.error('Error al cargar detalles'))
            .finally(() => setLoading(false));
    }, [withdrawal.id]);

    if (loading) return <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>;
    if (!details) return null;

    const isRejected = withdrawal.status === 'rejected';

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
        >
            <div className="px-4 pb-4 pt-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* User info */}
                <div className="p-3 rounded-lg bg-slate-800/60 space-y-2">
                    <p className="text-xs text-slate-500 uppercase tracking-wider flex items-center gap-1"><User className="w-3 h-3" /> Datos del Usuario</p>
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                        <span className="text-slate-500">Nombre:</span><span className="text-white">{details.user.name}</span>
                        <span className="text-slate-500">Email:</span><span className="text-white">{details.user.email}</span>
                        <span className="text-slate-500">IBAN:</span><span className="text-white font-mono text-xs">{details.banking_info?.iban || '-'}</span>
                        <span className="text-slate-500">Saldo USD:</span><span className="text-emerald-400">${details.balance.available_usd?.toFixed(2)}</span>
                        <span className="text-slate-500">Saldo EUR:</span><span className="text-emerald-400">{details.balance.available_eur?.toFixed(2)} EUR</span>
                    </div>
                </div>

                {/* Withdrawal history */}
                <div className="p-3 rounded-lg bg-slate-800/60 space-y-2">
                    <p className="text-xs text-slate-500 uppercase tracking-wider flex items-center gap-1"><History className="w-3 h-3" /> Historial de Retiros</p>
                    <div className="max-h-36 overflow-y-auto space-y-1">
                        {details.withdrawal_history?.length > 0 ? details.withdrawal_history.map(h => (
                            <div key={h.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-700/40 last:border-0">
                                <span className="text-slate-400">{formatDate(h.created_at)}</span>
                                <span className="text-white font-mono">{h.currency === 'USD' ? '$' : 'EUR '}{h.amount?.toFixed(2)}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                    h.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                                    h.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                                    'bg-amber-500/20 text-amber-400'
                                }`}>{statusLabels[h.status] || h.status}</span>
                            </div>
                        )) : <p className="text-slate-600 text-xs">Sin historial</p>}
                    </div>
                </div>

                {/* Rejection section */}
                {isRejected && (
                    <div className="md:col-span-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 space-y-3">
                        {withdrawal.rejection_reason && (
                            <div>
                                <p className="text-xs text-red-400 uppercase tracking-wider">Motivo del Rechazo</p>
                                <p className="text-white text-sm mt-1">{withdrawal.rejection_reason}</p>
                            </div>
                        )}
                        <p className="text-slate-400 text-xs">Puede reactivar este retiro para que vuelva al estado pendiente.</p>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                onClick={() => onReactivate(withdrawal.id)}
                                disabled={reactivating}
                                className="bg-amber-500 hover:bg-amber-600 text-white"
                                data-testid={`reactivate-btn-${withdrawal.id}`}
                            >
                                {reactivating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                                Reactivar retiro
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => onAddBalance(withdrawal)}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                                data-testid={`add-balance-btn-${withdrawal.id}`}
                            >
                                <DollarSign className="w-3 h-3 mr-1" /> Agregar saldo
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

/* ── Main Page ── */
export const AdminWithdrawalsPage = () => {
    const [withdrawals, setWithdrawals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [openSections, setOpenSections] = useState(['pending_tax', 'pending']);
    const [expandedRows, setExpandedRows] = useState({});
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
    const [selectedWithdrawal, setSelectedWithdrawal] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [addBalanceDialog, setAddBalanceDialog] = useState(false);
    const [balanceAmount, setBalanceAmount] = useState('');
    const [balanceCurrency, setBalanceCurrency] = useState('USD');
    const [authFor, setAuthFor] = useState(null);

    const fetchWithdrawals = async () => {
        setLoading(true);
        try {
            const response = await adminAPI.getAllWithdrawals();
            setWithdrawals(response.data);
        } catch (error) {
            toast.error('Error al cargar retiros');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchWithdrawals(); }, []);

    const toggleSection = (key) => {
        setOpenSections(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };

    const toggleRow = (id) => {
        setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleStatusChange = async (transactionId, newStatus) => {
        setProcessingId(transactionId);
        try {
            await adminAPI.updateWithdrawalStatus({
                transaction_id: transactionId,
                status: newStatus,
                rejection_reason: newStatus === 'rejected' ? rejectionReason : null
            });
            toast.success(`Estado actualizado a: ${statusLabels[newStatus]}`);
            setRejectDialogOpen(false);
            setRejectionReason('');
            fetchWithdrawals();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Error al actualizar');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReactivate = async (id) => {
        setProcessingId(id);
        try {
            await adminAPI.reactivateWithdrawal(id);
            toast.success('Retiro reactivado');
            fetchWithdrawals();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Error al reactivar');
        } finally {
            setProcessingId(null);
        }
    };

    const handleAddBalance = async () => {
        if (!selectedWithdrawal || !balanceAmount) return;
        setProcessingId('balance');
        try {
            await adminAPI.addBalance({
                user_id: selectedWithdrawal.user_id || selectedWithdrawal.user?.id,
                amount: parseFloat(balanceAmount),
                currency: balanceCurrency,
                description: `Saldo agregado desde gestion de retiros (Ref: ${selectedWithdrawal.id?.slice(0, 8)})`
            });
            toast.success('Saldo agregado exitosamente');
            setAddBalanceDialog(false);
            setBalanceAmount('');
            fetchWithdrawals();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Error al agregar saldo');
        } finally {
            setProcessingId(null);
        }
    };

    const openAddBalanceDialog = (w) => {
        setSelectedWithdrawal(w);
        setBalanceAmount('');
        setAddBalanceDialog(true);
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-6" data-testid="admin-withdrawals-page">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl sm:text-3xl text-white font-bold tracking-tight">Gestion de Retiros</h1>
                        <p className="text-slate-500 text-sm mt-1">Sistema de gestion por estados con acordeon</p>
                    </div>
                    <Button onClick={fetchWithdrawals} variant="outline" className="border-slate-700 hover:bg-slate-800 text-slate-300" data-testid="refresh-btn">
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Actualizar
                    </Button>
                </div>

                {/* Accordion Sections */}
                {loading ? (
                    <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-slate-800/50 rounded-xl animate-pulse" />)}</div>
                ) : (
                    <div className="space-y-3">
                        {STATUS_CONFIG.map(section => {
                            const items = withdrawals.filter(section.filter);
                            const cm = colorMap[section.color];
                            const isOpen = openSections.includes(section.key);
                            const SIcon = section.icon;

                            return (
                                <div key={section.key} className={`rounded-xl border ${cm.border} overflow-hidden transition-colors`} data-testid={`section-${section.key}`}>
                                    {/* Section header */}
                                    <button
                                        onClick={() => toggleSection(section.key)}
                                        className={`w-full flex items-center justify-between p-4 ${cm.bg} hover:brightness-110 transition-all`}
                                        data-testid={`section-toggle-${section.key}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <SIcon className={`w-5 h-5 ${cm.text}`} />
                                            <span className={`font-semibold ${cm.text}`}>{section.label}</span>
                                            <span className={`w-6 h-6 rounded-full ${cm.badge} text-white text-xs font-bold flex items-center justify-center`}>
                                                {items.length}
                                            </span>
                                        </div>
                                        <ChevronDown className={`w-5 h-5 ${cm.text} transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {/* Section content */}
                                    <AnimatePresence>
                                        {isOpen && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                                className="overflow-hidden"
                                            >
                                                {items.length === 0 ? (
                                                    <div className="p-8 text-center">
                                                        <Banknote className="w-10 h-10 mx-auto text-slate-700 mb-2" />
                                                        <p className="text-slate-600 text-sm">No hay retiros en esta categoria</p>
                                                    </div>
                                                ) : (
                                                    <div className="divide-y divide-slate-800/50">
                                                        {/* Table header - desktop only */}
                                                        <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 bg-slate-900/50 text-[11px] text-slate-500 uppercase tracking-wider">
                                                            <span>Usuario</span><span>Email</span><span>Monto</span><span>Banco</span><span>Fecha</span><span className="text-right">Acciones</span>
                                                        </div>
                                                        {items.map(w => {
                                                            const banking = w.banking_info || {};
                                                            const isExpanded = expandedRows[w.id];
                                                            const nextStatus = getNextStatus(w.status);
                                                            const nextLabel = getNextLabel(w.status);

                                                            return (
                                                                <div key={w.id} data-testid={`withdrawal-row-${w.id}`}>
                                                                    {/* Authorization block */}
                                                                    {['pending_tax', 'crypto_payment_under_review'].includes(w.status) && w.authorization_status !== 'completed' && (
                                                                        <div className="px-4 pt-3">
                                                                            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex flex-wrap items-center justify-between gap-2" data-testid={`wd-auth-block-${w.id}`}>
                                                                                <div>
                                                                                    <p className="text-amber-300 text-xs">
                                                                                        Importe requerido para autorizar el retiro: <span className="font-bold">€{AUTH_REQUIRED_EUR.toLocaleString('es-ES')}</span>
                                                                                    </p>
                                                                                    <p className="text-amber-500/90 text-[10px] font-bold uppercase tracking-wide mt-0.5" data-testid={`wd-auth-status-${w.id}`}>
                                                                                        Pendiente de abono y verificación
                                                                                    </p>
                                                                                </div>
                                                                                <Button size="sm" onClick={() => setAuthFor(w.id)}
                                                                                    className="bg-amber-600 hover:bg-amber-500 text-white h-7 text-xs px-2.5 font-bold"
                                                                                    data-testid={`wd-auth-complete-btn-${w.id}`}>
                                                                                    <ShieldCheck className="w-3 h-3 mr-1" /> Completar autorización
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    {w.authorization_status === 'completed' && (
                                                                        <div className="px-4 pt-3">
                                                                            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20" data-testid={`wd-auth-done-${w.id}`}>
                                                                                <p className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                                                                                    <CheckCircle className="w-3 h-3" /> Autorización completada
                                                                                </p>
                                                                                <p className="text-slate-500 text-[10px]">
                                                                                    Retiro autorizado para procesamiento · {formatDate(w.authorized_at)}{w.authorized_by_name ? ` · ${w.authorized_by_name}` : ''}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    {/* Desktop Row */}
                                                                    <div
                                                                        className={`hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-3 items-center cursor-pointer hover:bg-slate-800/30 transition-colors ${isExpanded ? 'bg-slate-800/20' : ''}`}
                                                                        onClick={() => toggleRow(w.id)}
                                                                    >
                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                            <ChevronDown className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                                                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                                                                                <span className="text-xs font-medium text-white">{w.user?.name?.charAt(0)?.toUpperCase() || '?'}</span>
                                                                            </div>
                                                                            <span className="text-white text-sm font-medium truncate">{w.user?.name || 'Desconocido'}</span>
                                                                        </div>
                                                                        <span className="text-slate-400 text-xs truncate">{w.user?.email || '-'}</span>
                                                                        <span className="text-red-400 font-semibold text-sm font-mono">{w.currency === 'USD' ? '$' : 'EUR '}{w.amount?.toFixed(2)}</span>
                                                                        <span className="text-slate-400 text-xs truncate">{banking.bank_name || '-'}</span>
                                                                        <span className="text-slate-500 text-xs">{formatDate(w.created_at)}</span>
                                                                        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                                                            {nextStatus && (
                                                                                <Button size="sm" onClick={() => handleStatusChange(w.id, nextStatus)} disabled={processingId === w.id}
                                                                                    className="bg-emerald-500 hover:bg-emerald-600 text-white h-7 text-xs px-2" data-testid={`advance-btn-${w.id}`}>
                                                                                    {processingId === w.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <>{nextLabel}</>}
                                                                                </Button>
                                                                            )}
                                                                            {w.status !== 'completed' && w.status !== 'rejected' && (
                                                                                <Button size="sm" variant="outline" onClick={() => { setSelectedWithdrawal(w); setRejectionReason(''); setRejectDialogOpen(true); }}
                                                                                    disabled={processingId === w.id} className="border-red-500/50 text-red-400 hover:bg-red-500/10 h-7 text-xs px-2" data-testid={`reject-btn-${w.id}`}>
                                                                                    <Ban className="w-3 h-3" />
                                                                                </Button>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* Mobile Card */}
                                                                    <div
                                                                        className={`sm:hidden p-4 cursor-pointer hover:bg-slate-800/30 transition-colors ${isExpanded ? 'bg-slate-800/20' : ''}`}
                                                                        onClick={() => toggleRow(w.id)}
                                                                    >
                                                                        <div className="flex items-center justify-between mb-2">
                                                                            <div className="flex items-center gap-2">
                                                                                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                                                                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                                                                                    <span className="text-xs font-medium text-white">{w.user?.name?.charAt(0)?.toUpperCase() || '?'}</span>
                                                                                </div>
                                                                                <div>
                                                                                    <p className="text-white text-sm font-medium">{w.user?.name || 'Desconocido'}</p>
                                                                                    <p className="text-slate-500 text-xs">{w.user?.email || '-'}</p>
                                                                                </div>
                                                                            </div>
                                                                            <span className="text-red-400 font-bold font-mono">{w.currency === 'USD' ? '$' : 'EUR '}{w.amount?.toFixed(2)}</span>
                                                                        </div>
                                                                        <div className="flex items-center justify-between mt-2" onClick={e => e.stopPropagation()}>
                                                                            <span className="text-slate-600 text-xs">{formatDate(w.created_at)}</span>
                                                                            <div className="flex gap-1.5">
                                                                                {nextStatus && (
                                                                                    <Button size="sm" onClick={() => handleStatusChange(w.id, nextStatus)} disabled={processingId === w.id}
                                                                                        className="bg-emerald-500 hover:bg-emerald-600 text-white h-8 text-xs px-3">
                                                                                        {processingId === w.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <>{nextLabel}</>}
                                                                                    </Button>
                                                                                )}
                                                                                {w.status !== 'completed' && w.status !== 'rejected' && (
                                                                                    <Button size="sm" variant="outline" onClick={() => { setSelectedWithdrawal(w); setRejectionReason(''); setRejectDialogOpen(true); }}
                                                                                        className="border-red-500/50 text-red-400 h-8 text-xs px-3">
                                                                                        <Ban className="w-3 h-3" />
                                                                                    </Button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Expanded detail */}
                                                                    <AnimatePresence>
                                                                        {isExpanded && (
                                                                            <UserDetailPanel
                                                                                withdrawal={w}
                                                                                onReactivate={handleReactivate}
                                                                                onAddBalance={openAddBalanceDialog}
                                                                                reactivating={processingId === w.id}
                                                                            />
                                                                        )}
                                                                    </AnimatePresence>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Authorization Modal */}
            {authFor && (
                <WithdrawalAuthModal
                    withdrawalId={authFor}
                    onClose={() => setAuthFor(null)}
                    onDone={fetchWithdrawals}
                />
            )}

            {/* Reject Dialog */}
            <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-md" data-testid="reject-dialog">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <XCircle className="w-5 h-5 text-red-400" /> Rechazar Retiro
                        </DialogTitle>
                    </DialogHeader>
                    {selectedWithdrawal && (
                        <div className="space-y-4 pt-2">
                            <div className="p-3 rounded-lg bg-slate-800/50 text-sm text-slate-400">
                                Rechazar retiro de <span className="text-white font-medium">{selectedWithdrawal.user?.name}</span> por{' '}
                                <span className="text-red-400 font-mono">{selectedWithdrawal.currency === 'USD' ? '$' : 'EUR '}{selectedWithdrawal.amount?.toFixed(2)}</span>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-slate-300">Motivo del rechazo</Label>
                                <Input placeholder="Ej: Informacion bancaria incorrecta..." value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}
                                    className="bg-slate-950 border-slate-800 text-white" data-testid="rejection-reason-input" />
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={() => setRejectDialogOpen(false)} variant="outline" className="flex-1 border-slate-700 text-slate-300">Cancelar</Button>
                                <Button onClick={() => handleStatusChange(selectedWithdrawal.id, 'rejected')} disabled={processingId === selectedWithdrawal.id}
                                    className="flex-1 bg-red-500 hover:bg-red-600 text-white" data-testid="confirm-reject-btn">
                                    {processingId === selectedWithdrawal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><XCircle className="w-4 h-4 mr-2" />Confirmar Rechazo</>}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Add Balance Dialog */}
            <Dialog open={addBalanceDialog} onOpenChange={setAddBalanceDialog}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-sm" data-testid="add-balance-dialog">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-emerald-400" /> Agregar Saldo
                        </DialogTitle>
                    </DialogHeader>
                    {selectedWithdrawal && (
                        <div className="space-y-4 pt-2">
                            <p className="text-slate-400 text-sm">
                                Agregar saldo a <span className="text-white font-medium">{selectedWithdrawal.user?.name}</span>
                            </p>
                            <div className="space-y-2">
                                <Label className="text-slate-300">Monto</Label>
                                <Input type="number" placeholder="0.00" value={balanceAmount} onChange={e => setBalanceAmount(e.target.value)}
                                    className="bg-slate-950 border-slate-800 text-white" data-testid="balance-amount-input" />
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={() => setBalanceCurrency('USD')} variant={balanceCurrency === 'USD' ? 'default' : 'outline'}
                                    className={balanceCurrency === 'USD' ? 'bg-emerald-500 text-white' : 'border-slate-700 text-slate-300'}>USD</Button>
                                <Button onClick={() => setBalanceCurrency('EUR')} variant={balanceCurrency === 'EUR' ? 'default' : 'outline'}
                                    className={balanceCurrency === 'EUR' ? 'bg-emerald-500 text-white' : 'border-slate-700 text-slate-300'}>EUR</Button>
                            </div>
                            <Button onClick={handleAddBalance} disabled={processingId === 'balance' || !balanceAmount}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white" data-testid="confirm-balance-btn">
                                {processingId === 'balance' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><DollarSign className="w-4 h-4 mr-2" />Agregar Saldo</>}
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </Layout>
    );
};

export default AdminWithdrawalsPage;
