import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../lib/api';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import {
    Unlock, Wallet, CreditCard, Upload, ShieldCheck, Clock,
    Copy, Check, AlertTriangle, CheckCircle2, XCircle, Loader2,
    Hash, ExternalLink, FileText, MessageSquare, Sparkles,
    ArrowRight, Zap,
} from 'lucide-react';

const fmtEUR = (n) => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

// ─────────────── Status palette ───────────────
const STATUS = {
    pending_payment: {
        label: 'Pendiente de pago',
        color: '#94a3b8',
        bg: 'bg-slate-700/40',
        ring: 'ring-slate-600/50',
        text: 'text-slate-200',
        Icon: Clock,
        dot: 'bg-slate-400',
    },
    in_review: {
        label: 'En revisión',
        color: '#f0b90b',
        bg: 'bg-amber-500/15',
        ring: 'ring-amber-500/40',
        text: 'text-amber-200',
        Icon: Loader2,
        dot: 'bg-amber-400',
    },
    approved: {
        label: 'Aprobado · 40% desbloqueado',
        color: '#0ecb81',
        bg: 'bg-emerald-500/15',
        ring: 'ring-emerald-500/40',
        text: 'text-emerald-200',
        Icon: CheckCircle2,
        dot: 'bg-emerald-400',
    },
    rejected: {
        label: 'Rechazado',
        color: '#f6465d',
        bg: 'bg-rose-500/15',
        ring: 'ring-rose-500/40',
        text: 'text-rose-200',
        Icon: XCircle,
        dot: 'bg-rose-400',
    },
};

const StatusPill = ({ status }) => {
    const s = STATUS[status] || STATUS.pending_payment;
    const I = s.Icon;
    const spin = status === 'in_review' ? 'animate-spin' : '';
    return (
        <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${s.bg} ring-1 ${s.ring}`}
            data-testid={`partial-unlock-status-${status}`}
        >
            <span className="relative flex w-2 h-2">
                <span className={`absolute inset-0 rounded-full ${s.dot} animate-ping opacity-70`} />
                <span className={`relative w-2 h-2 rounded-full ${s.dot}`} />
            </span>
            <I className={`w-3.5 h-3.5 ${s.text} ${spin}`} />
            <span className={`text-[11.5px] font-bold tracking-wide ${s.text}`}>{s.label}</span>
        </span>
    );
};

// ─────────────── Process timeline (4 steps) ───────────────
const STEPS = [
    { key: 'created',  label: 'Solicitud iniciada',         desc: 'Snapshot del 40% bloqueado' },
    { key: 'paid',     label: 'Pago de 2.660 EUR enviado',  desc: 'USDT TRC20 hacia Tesorería' },
    { key: 'review',   label: 'Comprobante en revisión',    desc: 'Validación blockchain + firma admin' },
    { key: 'unlocked', label: 'Retiro 40% habilitado',      desc: 'Disponible en la sección de retiros' },
];

const ProcessTimeline = ({ active }) => {
    const idx = {
        none: 0, pending_payment: 1, in_review: 2, approved: 4, rejected: 2,
    }[active?.status || 'none'] ?? 0;

    return (
        <ol className="space-y-2.5" data-testid="partial-unlock-timeline">
            {STEPS.map((s, i) => {
                const done = i < idx;
                const current = i === idx - 1;
                const failed = active?.status === 'rejected' && i === 2;
                let dot = 'bg-slate-700 ring-slate-700 text-slate-500';
                let line = 'bg-slate-800';
                if (done) { dot = 'bg-emerald-500 ring-emerald-400/60 text-white'; line = 'bg-emerald-500/40'; }
                if (current) { dot = 'bg-amber-400 ring-amber-300/60 text-slate-900'; line = 'bg-amber-500/40'; }
                if (failed) { dot = 'bg-rose-500 ring-rose-400/60 text-white'; line = 'bg-rose-500/40'; }

                const Icon = failed ? XCircle : done ? Check : current ? Loader2 : Clock;

                return (
                    <li key={s.key} className="relative flex gap-3 pb-1.5 last:pb-0" data-testid={`partial-unlock-step-${s.key}`}>
                        {i < STEPS.length - 1 && <span className={`absolute left-3 top-7 w-px h-[calc(100%-12px)] ${line}`} />}
                        <span className={`relative z-10 inline-flex w-6 h-6 rounded-full ring-2 items-center justify-center flex-shrink-0 ${dot}`}>
                            <Icon className={`w-3 h-3 ${current ? 'animate-spin' : ''}`} strokeWidth={2.5} />
                        </span>
                        <div className="min-w-0 -mt-0.5">
                            <p className={`text-[12px] font-semibold leading-tight ${done ? 'text-emerald-200' : current ? 'text-amber-200' : failed ? 'text-rose-200' : 'text-slate-400'}`}>
                                {s.label}
                            </p>
                            <p className="text-[10.5px] text-slate-500 mt-0.5">{s.desc}</p>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
};


// ─────────────── Main component ───────────────
export const PartialUnlockPanel = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [proofOpen, setProofOpen] = useState(false);
    const [supportOpen, setSupportOpen] = useState(false);
    const [txHash, setTxHash] = useState('');
    const [supportNote, setSupportNote] = useState('');
    const [copied, setCopied] = useState(false);

    const fetchStatus = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const r = await api.get('/partial-unlock/status');
            setData(r.data);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        fetchStatus();
        const id = setInterval(() => fetchStatus(true), 30000);
        return () => clearInterval(id);
    }, [fetchStatus]);

    const startProcess = async () => {
        setActionLoading(true);
        try {
            await api.post('/partial-unlock/start');
            toast.success('Solicitud iniciada · realiza el pago de 2.660 EUR');
            await fetchStatus(true);
        } catch (e) {
            toast.error(e.response?.data?.detail || 'No se pudo iniciar el proceso');
        } finally { setActionLoading(false); }
    };

    const submitProof = async () => {
        if (!txHash.trim() || txHash.trim().length < 10) {
            toast.error('Introduce un TX hash válido (≥10 caracteres)');
            return;
        }
        setActionLoading(true);
        try {
            await api.post('/partial-unlock/proof', { tx_hash: txHash.trim() });
            toast.success('Comprobante enviado · estado: En revisión');
            setProofOpen(false);
            setTxHash('');
            await fetchStatus(true);
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al enviar el comprobante');
        } finally { setActionLoading(false); }
    };

    const sendSupportRequest = async () => {
        setActionLoading(true);
        try {
            await api.post('/partial-unlock/support-request', { note: supportNote.trim() });
            toast.success('Solicitud enviada a soporte · respuesta en 24h hábiles');
            setSupportOpen(false);
            setSupportNote('');
        } catch {
            toast.error('No se pudo enviar la solicitud');
        } finally { setActionLoading(false); }
    };

    const copyAddress = () => {
        const addr = data?.config?.payment_method?.wallet_address;
        if (!addr) return;
        navigator.clipboard.writeText(addr);
        setCopied(true);
        toast.success('Dirección copiada');
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) {
        return (
            <Card className="bg-slate-900/60 border-slate-800/80 p-6 text-center" data-testid="partial-unlock-loading">
                <Loader2 className="w-5 h-5 text-slate-500 animate-spin mx-auto" />
                <p className="text-slate-500 text-[12px] mt-2">Cargando estado de desbloqueo…</p>
            </Card>
        );
    }

    if (!data) return null;

    const { config, available_balance_eur, live_max_withdraw_eur, active_request, history } = data;
    const status = active_request?.status || 'none';
    const method = config.payment_method;
    const isApproved = status === 'approved';
    const isInReview = status === 'in_review';
    const isPendingPayment = status === 'pending_payment';
    // amount we display as "40% unlocked" — snapshot if there is an active request,
    // otherwise the live calc so the user sees what they would unlock right now.
    const displayMax = active_request?.max_withdraw_eur_snapshot ?? live_max_withdraw_eur;

    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-br from-[#0a1628] via-[#0c1f3d]/95 to-slate-950 shadow-2xl shadow-cyan-500/5"
            data-testid="partial-unlock-panel"
        >
            {/* Decorative banking gradient */}
            <div aria-hidden="true" className="absolute -top-16 -right-16 w-72 h-72 rounded-full opacity-30 blur-3xl"
                style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.35), transparent 70%)' }} />
            <div aria-hidden="true" className="absolute inset-0 opacity-[0.04]"
                style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 18px, #14549C 18px, #14549C 19px)' }} />

            {/* ── Header ── */}
            <div className="relative px-5 sm:px-6 pt-5 pb-4 border-b border-slate-800/80">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/25 to-cyan-700/15 ring-1 ring-cyan-400/40 flex items-center justify-center flex-shrink-0 shadow-lg shadow-cyan-500/20">
                            <Unlock className="w-5 h-5 text-cyan-200" strokeWidth={2.4} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300 font-bold flex items-center gap-1.5">
                                <Sparkles className="w-3 h-3" /> Función oficial · Auditada
                            </p>
                            <h2 className="text-white text-lg sm:text-xl font-bold mt-0.5" style={{ letterSpacing: '-0.01em' }}>
                                Desbloqueo de retiro parcial · 40%
                            </h2>
                            <p className="text-slate-400 text-[12px] mt-1 leading-snug max-w-2xl">
                                Activa el retiro de hasta el <span className="text-white font-semibold">40 %</span> de tu saldo disponible. Pago único de activación de <span className="text-cyan-300 font-mono font-bold">2.660 EUR</span> en USDT TRC20.
                            </p>
                        </div>
                    </div>
                    {status !== 'none' && <StatusPill status={status} />}
                </div>
            </div>

            {/* ── Body grid ── */}
            <div className="relative px-5 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-5 gap-5">
                {/* LEFT: amounts + CTAs (3/5) */}
                <div className="lg:col-span-3 space-y-4">
                    {/* 3 numeric tiles */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {/* Saldo disponible */}
                        <div className="rounded-xl bg-slate-950/60 ring-1 ring-slate-800 p-3.5" data-testid="partial-unlock-balance">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <Wallet className="w-3 h-3 text-slate-500" />
                                <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">Saldo disponible</p>
                            </div>
                            <p className="text-white text-xl font-mono tabular-nums font-bold">€{fmtEUR(available_balance_eur)}</p>
                            <p className="text-slate-600 text-[10px] mt-0.5">Suma cuentas EUR</p>
                        </div>
                        {/* 40 % */}
                        <div className="rounded-xl bg-gradient-to-br from-cyan-500/15 to-cyan-700/5 ring-1 ring-cyan-500/40 p-3.5 relative overflow-hidden" data-testid="partial-unlock-max">
                            <div aria-hidden="true" className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-cyan-500/20 blur-2xl" />
                            <div className="relative flex items-center gap-1.5 mb-1.5">
                                <Zap className="w-3 h-3 text-cyan-300" />
                                <p className="text-[9.5px] uppercase tracking-wider text-cyan-300 font-bold">40 % habilitable</p>
                            </div>
                            <p className="relative text-cyan-200 text-xl font-mono tabular-nums font-bold">€{fmtEUR(displayMax)}</p>
                            <p className="relative text-cyan-400/70 text-[10px] mt-0.5">
                                {active_request ? 'Snapshot fijado al iniciar' : 'Cálculo en vivo'}
                            </p>
                        </div>
                        {/* Required */}
                        <div className={`rounded-xl ring-1 p-3.5 ${isApproved ? 'bg-emerald-500/10 ring-emerald-500/40' : 'bg-amber-500/10 ring-amber-500/40'}`} data-testid="partial-unlock-required">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <CreditCard className={`w-3 h-3 ${isApproved ? 'text-emerald-300' : 'text-amber-300'}`} />
                                <p className={`text-[9.5px] uppercase tracking-wider font-bold ${isApproved ? 'text-emerald-300' : 'text-amber-300'}`}>
                                    {isApproved ? 'Pagado' : 'Pago requerido'}
                                </p>
                            </div>
                            <p className={`text-xl font-mono tabular-nums font-bold ${isApproved ? 'text-emerald-200' : 'text-amber-200'}`}>
                                €{fmtEUR(config.required_eur)}
                            </p>
                            <p className={`text-[10px] mt-0.5 ${isApproved ? 'text-emerald-400/70' : 'text-amber-400/70'}`}>
                                {isApproved ? 'Activación confirmada' : 'USDT TRC20 · 1 confirmación'}
                            </p>
                        </div>
                    </div>

                    {/* CTA strip — context-aware */}
                    {status === 'none' && (
                        <Button
                            onClick={startProcess}
                            disabled={actionLoading || available_balance_eur <= 0}
                            data-testid="partial-unlock-start-btn"
                            className="w-full h-12 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold tracking-wider shadow-lg shadow-cyan-500/25"
                        >
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
                            Iniciar proceso de desbloqueo
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    )}

                    {isPendingPayment && (
                        <PaymentDetails method={method} requiredEur={config.required_eur} onCopy={copyAddress} copied={copied} onProof={() => setProofOpen(true)} />
                    )}

                    {isInReview && (
                        <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/40 p-4" data-testid="partial-unlock-in-review">
                            <div className="flex items-start gap-3">
                                <Loader2 className="w-5 h-5 text-amber-300 animate-spin flex-shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                    <p className="text-amber-200 text-[13px] font-bold">Comprobante en revisión</p>
                                    <p className="text-amber-300/80 text-[11.5px] mt-1 leading-relaxed">
                                        Tu pago de €{fmtEUR(config.required_eur)} está siendo validado por nuestro equipo de cumplimiento. Tiempo estimado: <span className="text-white font-semibold">2 a 12 horas hábiles</span>.
                                    </p>
                                    {active_request?.priority_rank && (
                                        <p className="text-amber-300/70 text-[10.5px] mt-1.5 font-mono">
                                            Prioridad de validación · #{active_request.priority_rank} en cola
                                        </p>
                                    )}
                                    {active_request?.tx_hash && (
                                        <a
                                            href={`${method.tx_explorer}${active_request.tx_hash}`}
                                            target="_blank" rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 mt-2 text-cyan-300 hover:text-cyan-200 text-[11px] font-mono"
                                            data-testid="partial-unlock-tx-link"
                                        >
                                            <Hash className="w-3 h-3" /> {active_request.tx_hash.slice(0, 10)}…{active_request.tx_hash.slice(-8)}
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {isApproved && (
                        <div className="rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/40 p-4" data-testid="partial-unlock-approved">
                            <div className="flex items-start gap-3">
                                <CheckCircle2 className="w-5 h-5 text-emerald-300 flex-shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-emerald-200 text-[13px] font-bold">Retiro parcial activado</p>
                                    <p className="text-emerald-300/80 text-[11.5px] mt-1 leading-relaxed">
                                        Ya puedes retirar hasta <span className="text-white font-mono font-bold">€{fmtEUR(displayMax)}</span> usando los métodos disponibles abajo (SEPA / cripto).
                                        Aprobado por <span className="text-white font-mono">{active_request.admin_validated_by || '—'}</span> · {fmtDate(active_request.admin_validated_at)}.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Last rejected attempt — show with retry option */}
                    {status === 'none' && history?.[0]?.status === 'rejected' && (
                        <div className="rounded-xl bg-rose-500/10 ring-1 ring-rose-500/40 p-3.5" data-testid="partial-unlock-last-rejected">
                            <div className="flex items-start gap-2">
                                <XCircle className="w-4 h-4 text-rose-300 flex-shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-rose-200 text-[12px] font-bold">Última solicitud rechazada</p>
                                    <p className="text-rose-300/80 text-[11px] mt-0.5">{history[0].admin_note || 'Sin motivo especificado'}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Support row */}
                    <button
                        type="button"
                        onClick={() => setSupportOpen(true)}
                        data-no-hover
                        data-testid="partial-unlock-support-btn"
                        className="w-full inline-flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg bg-slate-900/70 hover:bg-slate-900 ring-1 ring-slate-800 text-slate-300 hover:text-white transition-all text-[12px]"
                    >
                        <span className="inline-flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            Solicitar justificante bancario oficial
                        </span>
                        <span className="text-slate-500 text-[10.5px]">Soporte 24h →</span>
                    </button>
                </div>

                {/* RIGHT: timeline (2/5) */}
                <div className="lg:col-span-2 rounded-xl bg-slate-950/40 ring-1 ring-slate-800/80 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400 font-bold">
                            Proceso de validación
                        </p>
                    </div>
                    <ProcessTimeline active={active_request} />
                    <p className="mt-4 pt-3 border-t border-slate-800/80 text-[10px] text-slate-600 leading-relaxed">
                        Los retiros parciales se procesan según orden de validación (FIFO). Todas las operaciones quedan registradas en el log regulatorio CNMV/CySEC.
                    </p>
                </div>
            </div>

            {/* ── Modal: submit proof ── */}
            <AnimatePresence>
                {proofOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
                        onClick={() => setProofOpen(false)}
                        data-testid="partial-unlock-proof-modal"
                    >
                        <motion.div
                            initial={{ y: 20, scale: 0.96, opacity: 0 }}
                            animate={{ y: 0, scale: 1, opacity: 1 }}
                            exit={{ y: 20, scale: 0.96, opacity: 0 }}
                            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
                            className="relative w-full max-w-md bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 ring-1 ring-amber-500/30 rounded-2xl shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-5 py-4 border-b border-slate-800/80 flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-lg bg-amber-500/15 ring-1 ring-amber-500/40 flex items-center justify-center">
                                    <Upload className="w-4.5 h-4.5 text-amber-300" />
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-amber-300 font-bold">Paso 2 de 3</p>
                                    <h3 className="text-white text-base font-bold">Subir comprobante</h3>
                                </div>
                            </div>
                            <div className="px-5 py-5 space-y-3">
                                <div className="rounded-lg bg-slate-950/60 ring-1 ring-slate-800 p-3">
                                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Pago realizado</p>
                                    <p className="text-white text-base font-mono tabular-nums font-bold mt-0.5">€{fmtEUR(config.required_eur)} · USDT TRC20</p>
                                    <p className="text-slate-500 text-[10.5px] mt-0.5">Hacia: {method.wallet_address}</p>
                                </div>
                                <label className="block">
                                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">TX Hash de la transacción</span>
                                    <input
                                        type="text"
                                        autoFocus
                                        value={txHash}
                                        onChange={(e) => setTxHash(e.target.value)}
                                        placeholder="ej. a1b2c3d4e5f6..."
                                        data-testid="partial-unlock-proof-input"
                                        className="w-full h-11 mt-1 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-[12.5px] font-mono focus:outline-none focus:border-cyan-500/50"
                                    />
                                </label>
                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-900/70 ring-1 ring-slate-800 text-slate-300 text-[10.5px] leading-relaxed">
                                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-400" />
                                    Verificaremos esta TX en Tronscan. Asegúrate de que se envió a la dirección oficial mostrada arriba; los pagos a otra dirección no podrán ser validados.
                                </div>
                                <div className="flex items-center gap-2 pt-2">
                                    <Button variant="outline" onClick={() => setProofOpen(false)} className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800">
                                        Cancelar
                                    </Button>
                                    <Button
                                        onClick={submitProof}
                                        disabled={actionLoading || txHash.trim().length < 10}
                                        data-testid="partial-unlock-proof-submit"
                                        className="flex-1 bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-bold"
                                    >
                                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                                        Enviar a revisión
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Modal: support request ── */}
            <AnimatePresence>
                {supportOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
                        onClick={() => setSupportOpen(false)}
                        data-testid="partial-unlock-support-modal"
                    >
                        <motion.div
                            initial={{ y: 20, scale: 0.96, opacity: 0 }}
                            animate={{ y: 0, scale: 1, opacity: 1 }}
                            exit={{ y: 20, scale: 0.96, opacity: 0 }}
                            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
                            className="relative w-full max-w-md bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 ring-1 ring-cyan-500/30 rounded-2xl shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-5 py-4 border-b border-slate-800/80 flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-lg bg-cyan-500/15 ring-1 ring-cyan-500/40 flex items-center justify-center">
                                    <MessageSquare className="w-4.5 h-4.5 text-cyan-300" />
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-300 font-bold">Soporte 24h</p>
                                    <h3 className="text-white text-base font-bold">Justificante bancario oficial</h3>
                                </div>
                            </div>
                            <div className="px-5 py-5 space-y-3">
                                <p className="text-slate-300 text-[12px] leading-relaxed">
                                    Solicita un justificante bancario oficial firmado por nuestro departamento de Tesorería que acredite el pago de activación de €{fmtEUR(config.required_eur)}. Lo recibirás por email en máximo 24 h hábiles.
                                </p>
                                <label className="block">
                                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Nota para el equipo (opcional)</span>
                                    <textarea
                                        rows={3}
                                        value={supportNote}
                                        onChange={(e) => setSupportNote(e.target.value.slice(0, 300))}
                                        placeholder="ej. Necesito el justificante en PDF para mi banco..."
                                        data-testid="partial-unlock-support-note"
                                        className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-[12px] focus:outline-none focus:border-cyan-500/50 resize-none"
                                    />
                                    <span className="text-[9.5px] text-slate-600 mt-0.5 block text-right">{supportNote.length}/300</span>
                                </label>
                                <div className="flex items-center gap-2 pt-1">
                                    <Button variant="outline" onClick={() => setSupportOpen(false)} className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800">
                                        Cancelar
                                    </Button>
                                    <Button
                                        onClick={sendSupportRequest}
                                        disabled={actionLoading}
                                        data-testid="partial-unlock-support-submit"
                                        className="flex-1 bg-gradient-to-r from-cyan-600 to-cyan-500 text-white font-bold"
                                    >
                                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MessageSquare className="w-4 h-4 mr-2" />}
                                        Enviar solicitud
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};


// ─────────────── Sub-component: Payment details when pending_payment ───────────────
const PaymentDetails = ({ method, requiredEur, onCopy, copied, onProof }) => {
    return (
        <div className="rounded-xl bg-slate-950/60 ring-1 ring-cyan-500/30 p-4 space-y-3" data-testid="partial-unlock-payment-details">
            <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9.5px] font-bold tracking-wider"
                    style={{ backgroundColor: method.color + '22', color: method.color, border: `1px solid ${method.color}55` }}>
                    {method.crypto_symbol} · {method.network}
                </span>
                <p className="text-slate-400 text-[11px]">Recomendado · ~{method.avg_confirmation_min} min</p>
            </div>
            <div>
                <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">Monto exacto a enviar</p>
                <p className="text-white text-2xl font-mono tabular-nums font-bold mt-0.5" data-testid="partial-unlock-amount-display">
                    €{fmtEUR(requiredEur)}
                </p>
            </div>
            <div>
                <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">Dirección oficial · Tesorería LIONSBIT</p>
                <div className="mt-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950 ring-1 ring-slate-800">
                    <code className="text-cyan-300 text-[11.5px] font-mono break-all flex-1">{method.wallet_address}</code>
                    <button
                        onClick={onCopy}
                        type="button"
                        data-no-hover
                        data-testid="partial-unlock-copy-address"
                        className="flex-shrink-0 p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        title="Copiar dirección"
                    >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-500/10 ring-1 ring-rose-500/30 text-rose-200 text-[10.5px] leading-relaxed">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                    Envía <span className="text-white font-semibold">solo USDT en red TRC20</span>. Cualquier otra red (ERC20/BEP20) resultará en pérdida de fondos. Confirma la red en tu exchange antes de enviar.
                </span>
            </div>
            <Button
                onClick={onProof}
                data-testid="partial-unlock-upload-proof-btn"
                className="w-full h-11 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold tracking-wider shadow-md"
            >
                <Upload className="w-4 h-4 mr-2" />
                Ya pagué · Subir comprobante
            </Button>
        </div>
    );
};

export default PartialUnlockPanel;
