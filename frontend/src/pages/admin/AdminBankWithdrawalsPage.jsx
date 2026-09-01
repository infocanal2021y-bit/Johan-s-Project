import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../../components/layout/Layout';
import api from '../../lib/api';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
    Banknote, RefreshCw, ChevronRight, CheckCircle2, XCircle, Loader2,
    ArrowRight, Building2, Filter, ExternalLink, ShieldCheck, AlertTriangle,
} from 'lucide-react';

const fmt = (n, d = 2) => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const STATUS_FLOW = ['awaiting_code', 'received', 'conversion_done', 'compliance_review', 'transfer_in_progress', 'completed'];
const STATUS_META = {
    awaiting_code: { label: 'Esperando código', color: '#94a3b8' },
    received: { label: 'Solicitud recibida', color: '#1973B8' },
    conversion_done: { label: 'Conversión hecha', color: '#06b6d4' },
    compliance_review: { label: 'Revisión cumplimiento', color: '#a78bfa' },
    transfer_in_progress: { label: 'Transferencia en curso', color: '#f59e0b' },
    completed: { label: 'Completado', color: '#10b981' },
    rejected: { label: 'Rechazado', color: '#ef4444' },
};

const FILTERS = [
    { id: 'received', label: 'Recibidos' },
    { id: 'conversion_done', label: 'Conv. hecha' },
    { id: 'compliance_review', label: 'Cumplimiento' },
    { id: 'transfer_in_progress', label: 'En transferencia' },
    { id: 'completed', label: 'Completados' },
    { id: 'rejected', label: 'Rechazados' },
    { id: 'all', label: 'Todos' },
];

const AUTH_REQUIRED_EUR = 4850;

const AuthorizationModal = ({ requestId, onClose, onDone }) => {
    const [info, setInfo] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        api.get(`/admin/bank-withdrawals/${requestId}/authorization-info`)
            .then((r) => setInfo(r.data))
            .catch(() => { toast.error('No se pudo cargar la información'); onClose(); });
    }, [requestId, onClose]);

    const confirm = async () => {
        setBusy(true);
        try {
            await api.post(`/admin/bank-withdrawals/${requestId}/authorize`, {});
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
    const bankReqMap = {};
    (info?.requirements?.items || []).forEach((i) => { bankReqMap[i.key] = i.done; });
    const canAuthorizeBank = Boolean(bankReqMap.proof);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" data-testid="admin-bank-wd-auth-modal">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 bg-amber-50 flex items-center gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-amber-600" />
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-amber-700 font-bold">Autorización de transacción</p>
                        <h3 className="text-[#072146] text-base font-bold mt-0.5">{info?.reference || '...'}</h3>
                    </div>
                </div>
                {!info ? (
                    <div className="p-10 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin text-slate-400" /></div>
                ) : (
                    <div className="px-5 py-5 space-y-4">
                        <div className="grid grid-cols-2 gap-3 text-[12.5px]">
                            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Importe total solicitado</p>
                                <p className="text-[#072146] font-bold font-mono mt-1" data-testid="auth-modal-requested">{fmt(info.requested_amount)} {info.requested_currency}</p>
                                <p className="text-emerald-600 font-mono text-[11px]">→ {fmt(info.net_to_amount)} {info.to_currency}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                                <p className="text-[10px] uppercase tracking-wider text-amber-700 font-bold">Importe requerido</p>
                                <p className="text-amber-700 font-bold font-mono text-lg mt-1" data-testid="auth-modal-required">{fmt(info.required_eur)} €</p>
                            </div>
                            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 col-span-2">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Concepto del importe</p>
                                <p className="text-[#072146] mt-1" data-testid="auth-modal-concept">{info.concept}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Estado actual</p>
                                <p className="text-[#072146] font-semibold mt-1" data-testid="auth-modal-status">{alreadyDone ? 'Autorización completada' : 'Pendiente de abono y verificación'}</p>
                                <p className="text-slate-500 text-[10.5px]">{info.status_label}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Fecha de solicitud</p>
                                <p className="text-[#072146] font-semibold mt-1" data-testid="auth-modal-date">{fmtDate(info.created_at)}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 col-span-2">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Método de pago utilizado</p>
                                <p className="text-[#072146] font-semibold mt-1" data-testid="auth-modal-payment-method">{pm?.label}</p>
                                {pm?.status === 'not_declared' ? (
                                    <p className="text-slate-500 text-[10.5px]">El usuario aún no ha declarado el pago</p>
                                ) : (
                                    <>
                                        <p className="text-slate-500 text-[10.5px]">Estado del pago: <span className="font-semibold">{pm?.status}</span>{pm?.detected_amount ? ` · Detectado: ${pm.detected_amount}` : ''}</p>
                                        {pm?.txid && <p className="text-slate-400 text-[10px] font-mono truncate" title={pm.txid}>TXID: {pm.txid}</p>}
                                    </>
                                )}
                            </div>
                        </div>

                        {info.requirements && (
                            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200" data-testid="bank-auth-requirements">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Requisitos previos al procesamiento</p>
                                <div className="space-y-1.5">
                                    {info.requirements.items.map((it) => (
                                        <div key={it.key} className="flex items-center gap-2 text-[12px]" data-testid={`bank-auth-req-${it.key}`}>
                                            {it.done
                                                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                                : <XCircle className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />}
                                            <span className={it.done ? 'text-[#072146]' : 'text-slate-400'}>{it.label}</span>
                                            {!it.done && <span className="ml-auto text-[9px] text-amber-600 font-bold uppercase">Pendiente</span>}
                                        </div>
                                    ))}
                                </div>
                                {info.requirements.alert && (
                                    <div className="mt-2.5 p-2 rounded-md bg-amber-50 border border-amber-300 flex items-start gap-2" data-testid="bank-auth-requirements-alert">
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                                        <p className="text-amber-800 text-[11px] leading-snug">{info.requirements.alert}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {alreadyDone ? (
                            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-[12px] text-emerald-700" data-testid="auth-modal-done-banner">
                                <p className="font-bold flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Autorización completada</p>
                                <p className="mt-0.5">Verificado el {fmtDate(info.authorization.authorized_at)} por <span className="font-semibold">{info.authorization.authorized_by_name}</span></p>
                            </div>
                        ) : (
                            <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-2.5">
                                Al confirmar, el estado cambiará a <span className="font-bold text-emerald-700">"Autorización completada"</span> y después a <span className="font-bold text-violet-700">"Retiro autorizado para procesamiento"</span>. Se registrará en el historial la fecha, hora y el administrador que confirmó la operación.
                            </p>
                        )}

                        <div className="flex gap-3">
                            <Button variant="outline" onClick={onClose} className="flex-1">Cerrar</Button>
                            {!alreadyDone && (
                                <Button
                                    onClick={confirm}
                                    disabled={busy || !canAuthorizeBank}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-40"
                                    data-testid="auth-modal-confirm-btn"
                                    title={!canAuthorizeBank ? 'El usuario debe declarar la transacción cripto (TxID) antes de poder autorizar' : ''}
                                >
                                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Autorizar procesamiento'}
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


export const AdminBankWithdrawalsPage = () => {
    const [items, setItems] = useState([]);
    const [counts, setCounts] = useState({});
    const [filter, setFilter] = useState('received');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [rejectFor, setRejectFor] = useState(null);
    const [completeFor, setCompleteFor] = useState(null);
    const [authFor, setAuthFor] = useState(null);

    const load = useCallback(async () => {
        try {
            const r = await api.get(`/admin/bank-withdrawals?status=${filter}`);
            setItems(r.data.items || []);
            setCounts(r.data.counts || {});
        } catch (err) {
            console.error('[admin/bank-wd] load failed', err);
            toast.error('No se pudo cargar la cola');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [filter]);

    useEffect(() => { setLoading(true); load(); }, [load]);

    const handleAdvance = async (it) => {
        setBusyId(it.id);
        try {
            await api.post(`/admin/bank-withdrawals/${it.id}/advance`, { note: '' });
            toast.success('Avanzado a siguiente etapa');
            load();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo avanzar');
        } finally {
            setBusyId(null);
        }
    };

    const handleComplete = async () => {
        if (!completeFor) return;
        setBusyId(completeFor.id);
        try {
            await api.post(`/admin/bank-withdrawals/${completeFor.id}/complete`, {
                proof_url: completeFor.proof_url || undefined,
                note: completeFor.note || undefined,
            });
            toast.success('Retiro marcado como completado');
            setCompleteFor(null);
            load();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo completar');
        } finally {
            setBusyId(null);
        }
    };

    const handleReject = async () => {
        if (!rejectFor || !rejectFor.note?.trim()) {
            toast.error('Motivo requerido');
            return;
        }
        setBusyId(rejectFor.id);
        try {
            await api.post(`/admin/bank-withdrawals/${rejectFor.id}/reject`, { note: rejectFor.note });
            toast.success('Retiro rechazado · fondos devueltos');
            setRejectFor(null);
            load();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo rechazar');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-[10.5px] uppercase tracking-[0.14em] text-[#7CB1E5] font-bold">Admin · Banking</p>
                        <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1" data-testid="admin-bank-wd-title">
                            Retiros bancarios · Cola
                        </h1>
                    </div>
                    <Button
                        onClick={() => { setRefreshing(true); load(); }}
                        variant="outline"
                        className="bg-white/5 border-white/15 text-white hover:bg-white/10"
                        data-testid="admin-bank-wd-refresh"
                    >
                        <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} /> Refrescar
                    </Button>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    {[...STATUS_FLOW.slice(1), 'rejected'].map(s => (
                        <Card key={s} className="p-3 bg-white/5 border-white/10">
                            <p className="text-[9.5px] uppercase tracking-wider font-bold" style={{ color: STATUS_META[s].color }}>
                                {STATUS_META[s].label}
                            </p>
                            <p className="text-white text-2xl font-bold tabular-nums mt-1">{counts[s] || 0}</p>
                        </Card>
                    ))}
                </div>

                {/* Filters */}
                <Card className="bg-slate-900/70 ring-1 ring-slate-800 p-2 flex flex-wrap items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-slate-500 ml-1" />
                    {FILTERS.map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id)}
                            className={`px-3 py-1.5 rounded-md text-[11.5px] font-bold uppercase tracking-wider transition-colors ${
                                filter === f.id ? 'bg-[#1973B8] text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                            data-testid={`admin-bank-wd-filter-${f.id}`}
                        >
                            {f.label}
                            {counts[f.id] !== undefined && f.id !== 'all' && (
                                <span className="ml-1 text-[10px] opacity-70">{counts[f.id] || 0}</span>
                            )}
                        </button>
                    ))}
                </Card>

                {/* Queue */}
                <Card className="bg-white border-slate-200 overflow-hidden">
                    {loading ? (
                        <div className="p-12 text-center text-slate-500">
                            <Loader2 className="w-6 h-6 mx-auto animate-spin" />
                        </div>
                    ) : items.length === 0 ? (
                        <div className="p-10 text-center text-slate-500">
                            <Banknote className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                            <p className="text-[13px]">Sin solicitudes en este filtro.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12.5px]">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr className="text-slate-500 text-left">
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px]">Ref / Fecha</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px]">Usuario</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px]">Operación</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px]">Banco destino</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px]">Estado</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px] text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(it => {
                                        const meta = STATUS_META[it.status] || STATUS_META.received;
                                        const canAdvance = !['awaiting_code', 'transfer_in_progress', 'completed', 'rejected'].includes(it.status);
                                        const canComplete = ['compliance_review', 'transfer_in_progress'].includes(it.status);
                                        const canReject = !['completed', 'rejected', 'awaiting_code'].includes(it.status);
                                        return (
                                            <tr key={it.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`admin-bank-wd-row-${it.id}`}>
                                                <td className="py-3 px-3">
                                                    <p className="font-mono text-cyan-700 text-[11px] font-bold">{it.reference}</p>
                                                    <p className="text-slate-500 text-[10px] mt-0.5">{fmtDate(it.created_at)}</p>
                                                </td>
                                                <td className="py-3 px-3">
                                                    <p className="text-[#072146] font-bold text-[12px]">{it.user_name || it.user_email}</p>
                                                    <p className="text-slate-500 text-[10px]">{it.user_email}</p>
                                                </td>
                                                <td className="py-3 px-3">
                                                    <p className="text-[#072146] font-mono font-bold">{fmt(it.from_amount)} {it.from_currency}</p>
                                                    <ArrowRight className="w-3 h-3 text-slate-400 my-0.5" />
                                                    <p className="text-emerald-600 font-mono font-bold">{fmt(it.net_to_amount)} {it.to_currency}</p>
                                                </td>
                                                <td className="py-3 px-3">
                                                    <p className="text-[#072146] text-[12px]">{it.country_flag} {it.bank_name}</p>
                                                    <p className="text-slate-500 text-[10.5px]">{it.bank_holder}</p>
                                                    <p className="text-slate-400 text-[10px] font-mono">{(it.bank_account || '').slice(0, 24)}{(it.bank_account || '').length > 24 ? '…' : ''}</p>
                                                </td>
                                                <td className="py-3 px-3">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                                                        style={{ background: meta.color + '20', color: meta.color }}>
                                                        {meta.label}
                                                    </span>
                                                    {['received', 'conversion_done'].includes(it.status) && it.authorization_status !== 'completed' && (
                                                        <div className="mt-2 p-2 rounded-md bg-amber-50 border border-amber-200 max-w-[220px]" data-testid={`auth-block-${it.id}`}>
                                                            <p className="text-[10px] text-amber-800 leading-snug">
                                                                Requisito de plataforma: <span className="font-bold">€{fmt(AUTH_REQUIRED_EUR, 0)}</span> · Abono cripto
                                                            </p>
                                                            <p className="text-[9.5px] font-bold uppercase tracking-wide text-amber-600 mt-0.5" data-testid={`auth-status-${it.id}`}>
                                                                Pendiente de abono y verificación
                                                            </p>
                                                            {it.requirements_completed != null && (
                                                                <p className={`text-[9.5px] font-bold mt-0.5 ${it.requirements_completed >= (it.requirements_total || 7) - 1 ? 'text-emerald-600' : 'text-slate-500'}`} data-testid={`bank-req-count-${it.id}`}>
                                                                    {it.requirements_completed} de {it.requirements_total || 7} requisitos completados
                                                                </p>
                                                            )}
                                                            {it.crypto_proof_received && (
                                                                <p className="text-[9.5px] font-bold text-cyan-600 mt-0.5">TxID recibido{it.crypto_verified ? ' · verificado' : ' · sin verificar'}</p>
                                                            )}
                                                            <button
                                                                onClick={() => setAuthFor(it.id)}
                                                                className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold transition-colors"
                                                                data-testid={`auth-complete-btn-${it.id}`}
                                                            >
                                                                <ShieldCheck className="w-3 h-3" /> Completar autorización
                                                            </button>
                                                        </div>
                                                    )}
                                                    {it.authorization_status === 'completed' && (
                                                        <div className="mt-1.5 max-w-[220px]" data-testid={`auth-done-${it.id}`}>
                                                            <p className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                                                                <CheckCircle2 className="w-3 h-3" /> Autorización completada
                                                            </p>
                                                            <p className="text-[9.5px] text-slate-500">
                                                                Retiro autorizado para procesamiento · {fmtDate(it.authorized_at)}{it.authorized_by_name ? ` · ${it.authorized_by_name}` : ''}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {it.admin_note && (
                                                        <p className="text-rose-500 text-[10px] italic mt-1 max-w-[200px] truncate" title={it.admin_note}>
                                                            "{it.admin_note}"
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="py-3 px-3 text-right">
                                                    <div className="inline-flex gap-1">
                                                        {canAdvance && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleAdvance(it)}
                                                                disabled={busyId === it.id}
                                                                className="h-7 px-2.5 text-[10.5px] bg-[#1973B8] hover:bg-[#1F89D8] text-white font-bold"
                                                                data-testid={`admin-bank-wd-advance-${it.id}`}
                                                            >
                                                                <ChevronRight className="w-3 h-3 mr-1" /> Avanzar
                                                            </Button>
                                                        )}
                                                        {canComplete && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => setCompleteFor({ id: it.id, email: it.user_email, proof_url: '', note: '' })}
                                                                disabled={busyId === it.id}
                                                                className="h-7 px-2.5 text-[10.5px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                                                                data-testid={`admin-bank-wd-complete-${it.id}`}
                                                            >
                                                                <CheckCircle2 className="w-3 h-3 mr-1" /> Completar
                                                            </Button>
                                                        )}
                                                        {canReject && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => setRejectFor({ id: it.id, email: it.user_email, note: '' })}
                                                                disabled={busyId === it.id}
                                                                className="h-7 px-2.5 text-[10.5px] border-rose-300 text-rose-700 hover:bg-rose-50"
                                                                data-testid={`admin-bank-wd-reject-${it.id}`}
                                                            >
                                                                <XCircle className="w-3 h-3" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>

            {/* Authorization modal */}
            {authFor && (
                <AuthorizationModal
                    requestId={authFor}
                    onClose={() => setAuthFor(null)}
                    onDone={load}
                />
            )}

            {/* Complete modal */}
            {completeFor && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" data-testid="admin-bank-wd-complete-modal">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-200 bg-emerald-50">
                            <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold">Marcar como completado</p>
                            <h3 className="text-[#072146] text-base font-bold mt-0.5">{completeFor.email}</h3>
                        </div>
                        <div className="px-5 py-5 space-y-4">
                            <label className="block">
                                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 block">URL del comprobante (opcional)</span>
                                <input
                                    type="url"
                                    value={completeFor.proof_url}
                                    onChange={(e) => setCompleteFor({ ...completeFor, proof_url: e.target.value })}
                                    placeholder="https://..."
                                    className="w-full h-10 px-3 rounded-md border border-slate-200 focus:border-emerald-500 outline-none text-[13px]"
                                    data-testid="admin-bank-wd-proof-input"
                                />
                            </label>
                            <label className="block">
                                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 block">Nota (opcional)</span>
                                <textarea
                                    rows={3}
                                    value={completeFor.note}
                                    onChange={(e) => setCompleteFor({ ...completeFor, note: e.target.value })}
                                    className="w-full px-3 py-2 rounded-md border border-slate-200 focus:border-emerald-500 outline-none text-[13px]"
                                    data-testid="admin-bank-wd-complete-note"
                                />
                            </label>
                            <div className="flex gap-3">
                                <Button variant="outline" onClick={() => setCompleteFor(null)} className="flex-1">Cancelar</Button>
                                <Button
                                    onClick={handleComplete}
                                    disabled={busyId === completeFor.id}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                                    data-testid="admin-bank-wd-complete-confirm"
                                >
                                    {busyId === completeFor.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar completado'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject modal */}
            {rejectFor && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" data-testid="admin-bank-wd-reject-modal">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-200 bg-rose-50">
                            <p className="text-[10px] uppercase tracking-wider text-rose-700 font-bold">Rechazar retiro</p>
                            <h3 className="text-[#072146] text-base font-bold mt-0.5">{rejectFor.email}</h3>
                        </div>
                        <div className="px-5 py-5 space-y-3">
                            <label className="block">
                                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 block">Motivo del rechazo (visible al usuario)</span>
                                <textarea
                                    autoFocus
                                    rows={3}
                                    value={rejectFor.note}
                                    onChange={(e) => setRejectFor({ ...rejectFor, note: e.target.value })}
                                    placeholder="Cuenta bancaria no válida, etc."
                                    className="w-full px-3 py-2 rounded-md border border-slate-200 focus:border-rose-500 outline-none text-[13px]"
                                    data-testid="admin-bank-wd-reject-note"
                                />
                            </label>
                            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                                ⚠️ Al rechazar, los fondos serán devueltos automáticamente al saldo del usuario.
                            </p>
                            <div className="flex gap-3">
                                <Button variant="outline" onClick={() => setRejectFor(null)} className="flex-1">Cancelar</Button>
                                <Button
                                    onClick={handleReject}
                                    disabled={busyId === rejectFor.id}
                                    className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold"
                                    data-testid="admin-bank-wd-reject-confirm"
                                >
                                    {busyId === rejectFor.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Rechazar y devolver'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default AdminBankWithdrawalsPage;
