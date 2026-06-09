import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../lib/api';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import {
    Unlock, Wallet, CreditCard, Upload, ShieldCheck, Clock,
    Copy, Check, AlertTriangle, CheckCircle2, XCircle, Loader2,
    Hash, ExternalLink, FileText, MessageSquare, Sparkles,
    ArrowRight, Zap, Bitcoin, X,
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
    const [partialAmount, setPartialAmount] = useState('');
    const [supportNote, setSupportNote] = useState('');
    const [confirmStartOpen, setConfirmStartOpen] = useState(false);
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

    // Default the amount input to the remaining when opening the modal
    useEffect(() => {
        if (proofOpen && data) {
            const rem = Number(data.remaining_eur || 0);
            setPartialAmount(rem > 0 ? String(rem) : '');
        }
    }, [proofOpen, data]);

    const startProcess = async () => {
        setActionLoading(true);
        try {
            await api.post('/partial-unlock/start');
            toast.success('Solicitud iniciada · puedes pagar desde 500 EUR por abono');
            setConfirmStartOpen(false);
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
        const amt = Number(partialAmount);
        const remaining = Number(data?.remaining_eur || 0);
        const minPartial = Number(data?.config?.min_partial_eur || 500);
        if (!amt || amt <= 0) {
            toast.error('Indica el monto del abono');
            return;
        }
        // Min 500 EUR per partial — except when it just closes the gap
        if (amt < minPartial && Math.abs(amt - remaining) > 0.01) {
            toast.error(`Mínimo por abono: €${minPartial.toFixed(0)} (o el monto exacto que cierra la activación)`);
            return;
        }
        if (amt > remaining + 0.01) {
            toast.error(`Excede lo pendiente. Restan €${remaining.toFixed(2)}`);
            return;
        }
        setActionLoading(true);
        try {
            const r = await api.post('/partial-unlock/proof', {
                tx_hash: txHash.trim(),
                amount_eur: amt,
            });
            const completed = !!r.data?.completed;
            toast.success(completed
                ? '¡Activación completa! Pasaste a "En revisión"'
                : `Abono de €${amt.toFixed(2)} registrado · Total: €${Number(r.data?.total_paid_eur || 0).toFixed(2)} / €2.660`);
            setProofOpen(false);
            setTxHash('');
            setPartialAmount('');
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

    const { config, available_balance_eur, live_max_withdraw_eur, active_request, history, total_paid_eur, remaining_eur } = data;
    const status = active_request?.status || 'none';
    const method = config.payment_method;
    const isApproved = status === 'approved';
    const isInReview = status === 'in_review';
    const isPendingPayment = status === 'pending_payment';
    // amount we display as "40% unlocked" — snapshot if there is an active request,
    // otherwise the live calc so the user sees what they would unlock right now.
    const displayMax = active_request?.max_withdraw_eur_snapshot ?? live_max_withdraw_eur;
    const minPartial = Number(config.min_partial_eur || 500);
    const paid = Number(total_paid_eur || 0);
    const remaining = Number(remaining_eur || 0);
    const progressPct = Math.min(100, Math.round((paid / Number(config.required_eur || 2660)) * 100));
    const payments = active_request?.payments || [];

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
                                Activa el retiro de hasta el <span className="text-white font-semibold">40 %</span> de tu saldo disponible. Pago único de activación de <span className="text-cyan-300 font-mono font-bold">2.660 EUR</span> en USDT TRC20 — <span className="text-emerald-300 font-semibold">abonos parciales desde €{minPartial.toFixed(0)}</span> hasta completarlo.
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
                        {/* Required / Paid */}
                        <div className={`rounded-xl ring-1 p-3.5 ${isApproved ? 'bg-emerald-500/10 ring-emerald-500/40' : 'bg-amber-500/10 ring-amber-500/40'}`} data-testid="partial-unlock-required">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <CreditCard className={`w-3 h-3 ${isApproved ? 'text-emerald-300' : 'text-amber-300'}`} />
                                <p className={`text-[9.5px] uppercase tracking-wider font-bold ${isApproved ? 'text-emerald-300' : 'text-amber-300'}`}>
                                    {isApproved ? 'Pagado' : (paid > 0 ? `Abonado · ${progressPct}%` : 'Pago requerido')}
                                </p>
                            </div>
                            <p className={`text-xl font-mono tabular-nums font-bold ${isApproved ? 'text-emerald-200' : 'text-amber-200'}`} data-testid="partial-unlock-paid-display">
                                {isApproved
                                    ? `€${fmtEUR(config.required_eur)}`
                                    : (paid > 0
                                        ? `€${fmtEUR(paid)} / €${fmtEUR(config.required_eur)}`
                                        : `€${fmtEUR(config.required_eur)}`)}
                            </p>
                            <p className={`text-[10px] mt-0.5 ${isApproved ? 'text-emerald-400/70' : 'text-amber-400/70'}`}>
                                {isApproved
                                    ? 'Activación confirmada'
                                    : (paid > 0
                                        ? `Restan €${fmtEUR(remaining)}`
                                        : `Desde €${fmtEUR(minPartial)} por abono`)}
                            </p>
                        </div>
                    </div>

                    {/* Progress bar (only while paying) */}
                    {isPendingPayment && paid > 0 && (
                        <div className="rounded-xl bg-slate-950/60 ring-1 ring-cyan-500/25 p-3" data-testid="partial-unlock-progress">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                                <p className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold">
                                    Progreso de activación
                                </p>
                                <p className="text-cyan-200 text-[11px] font-mono font-bold">{progressPct}%</p>
                            </div>
                            <div className="relative h-2 rounded-full bg-slate-800 overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progressPct}%` }}
                                    transition={{ duration: 0.6, ease: 'easeOut' }}
                                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full shadow-[0_0_12px_rgba(34,211,238,0.45)]"
                                />
                            </div>
                            <div className="flex items-center justify-between mt-1.5 text-[10.5px]">
                                <span className="text-emerald-300 font-mono font-bold">€{fmtEUR(paid)}</span>
                                <span className="text-slate-500">restan <span className="text-amber-300 font-mono font-bold">€{fmtEUR(remaining)}</span></span>
                                <span className="text-slate-500 font-mono">€{fmtEUR(config.required_eur)}</span>
                            </div>
                        </div>
                    )}

                    {/* Submitted partial payments list */}
                    {payments.length > 0 && (
                        <div className="rounded-xl bg-slate-950/40 ring-1 ring-slate-800/80 p-3" data-testid="partial-unlock-payments-list">
                            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">
                                Abonos registrados ({payments.length})
                            </p>
                            <ul className="space-y-1.5">
                                {payments.map((p, i) => (
                                    <li key={p.id || i} className="flex items-center justify-between gap-2 text-[11.5px]">
                                        <span className="inline-flex items-center gap-1.5 text-slate-300">
                                            <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                            <span className="font-mono font-bold text-emerald-200">€{fmtEUR(p.amount_eur)}</span>
                                            <a
                                                href={`${method.tx_explorer}${p.tx_hash}`}
                                                target="_blank" rel="noopener noreferrer"
                                                className="text-slate-500 hover:text-cyan-300 font-mono text-[10.5px] inline-flex items-center gap-1"
                                                data-no-hover
                                            >
                                                <Hash className="w-2.5 h-2.5" />
                                                {p.tx_hash.slice(0, 6)}…{p.tx_hash.slice(-4)}
                                                <ExternalLink className="w-2.5 h-2.5" />
                                            </a>
                                        </span>
                                        <span className="text-slate-600 text-[10px] whitespace-nowrap">{fmtDate(p.submitted_at)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* CTA strip — context-aware */}
                    {status === 'none' && (
                        <Button
                            onClick={() => setConfirmStartOpen(true)}
                            disabled={actionLoading || available_balance_eur <= 0}
                            data-testid="partial-unlock-start-btn"
                            className="w-full h-12 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold tracking-wider shadow-lg shadow-cyan-500/25"
                        >
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
                            Solicitar retiro parcial del 40%
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    )}

                    {isPendingPayment && (
                        <PaymentDetails
                            method={method}
                            requiredEur={config.required_eur}
                            remainingEur={remaining}
                            minPartial={minPartial}
                            paid={paid}
                            paymentReference={active_request?.payment_reference}
                            onCopy={copyAddress}
                            copied={copied}
                            onProof={() => setProofOpen(true)}
                        />
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
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-amber-300 font-bold">
                                        {paid > 0 ? 'Nuevo abono parcial' : 'Primer abono'}
                                    </p>
                                    <h3 className="text-white text-base font-bold">Registrar comprobante</h3>
                                </div>
                            </div>
                            <div className="px-5 py-5 space-y-3">
                                <div className="rounded-lg bg-slate-950/60 ring-1 ring-slate-800 p-3">
                                    <div className="flex items-center justify-between gap-3 mb-1">
                                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Activación</p>
                                        <p className="text-emerald-300 text-[11px] font-mono font-bold">{progressPct}% completado</p>
                                    </div>
                                    <p className="text-white text-base font-mono tabular-nums font-bold mt-0.5">
                                        €{fmtEUR(paid)} <span className="text-slate-600">/</span> €{fmtEUR(config.required_eur)}
                                    </p>
                                    <p className="text-slate-500 text-[10.5px] mt-0.5">
                                        Restan <span className="text-amber-300 font-mono font-bold">€{fmtEUR(remaining)}</span> · USDT TRC20 · Min €{fmtEUR(minPartial)} por abono
                                    </p>
                                </div>

                                <label className="block">
                                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Monto del abono (EUR)</span>
                                    <input
                                        type="number"
                                        min={Math.min(minPartial, remaining)}
                                        max={remaining}
                                        step="50"
                                        value={partialAmount}
                                        onChange={(e) => setPartialAmount(e.target.value)}
                                        placeholder={`Min ${minPartial.toFixed(0)}`}
                                        data-testid="partial-unlock-amount-input"
                                        className="w-full h-11 mt-1 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-base font-mono tabular-nums font-bold focus:outline-none focus:border-cyan-500/50"
                                    />
                                    {/* Quick-pick chips */}
                                    <div className="flex items-center gap-1.5 mt-2 flex-wrap" data-testid="partial-unlock-quick-picks">
                                        {[500, 1000, 2660].map((v) => {
                                            const value = Math.min(v, remaining);
                                            if (value < minPartial && Math.abs(value - remaining) > 0.01) return null;
                                            const label = v >= 2660 ? `Total restante (€${fmtEUR(remaining)})` : `€${fmtEUR(value)}`;
                                            return (
                                                <button
                                                    key={v}
                                                    type="button"
                                                    data-no-hover
                                                    onClick={() => setPartialAmount(String(value))}
                                                    className="text-[10.5px] px-2 py-1 rounded-md bg-slate-900 ring-1 ring-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                                                >
                                                    {label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </label>

                                <label className="block">
                                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">TX Hash de la transacción</span>
                                    <input
                                        type="text"
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
                                        disabled={actionLoading || txHash.trim().length < 10 || !partialAmount || Number(partialAmount) <= 0}
                                        data-testid="partial-unlock-proof-submit"
                                        className="flex-1 bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-bold"
                                    >
                                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                                        {Number(partialAmount) >= remaining - 0.01 && remaining > 0 ? 'Completar y enviar a revisión' : 'Registrar abono'}
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Modal: support request ── */}
            <AnimatePresence>

                {/* Confirmation modal — required before showing payment data */}
                {confirmStartOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
                        onClick={() => setConfirmStartOpen(false)}
                        data-testid="partial-unlock-confirm-modal"
                    >
                        <motion.div
                            initial={{ y: 20, scale: 0.96, opacity: 0 }}
                            animate={{ y: 0, scale: 1, opacity: 1 }}
                            exit={{ y: 20, scale: 0.96, opacity: 0 }}
                            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
                            className="relative w-full max-w-md bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 ring-1 ring-amber-500/30 rounded-2xl shadow-2xl shadow-amber-500/10"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-5 py-4 border-b border-slate-800/80 flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-lg bg-amber-500/15 ring-1 ring-amber-500/40 flex items-center justify-center">
                                    <Unlock className="w-4 h-4 text-amber-300" />
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-amber-300 font-bold">Paso 1 de 3</p>
                                    <h3 className="text-white text-base font-bold">Confirma tu solicitud</h3>
                                </div>
                            </div>
                            <div className="px-5 py-5 space-y-4">
                                <p className="text-slate-100 text-sm leading-relaxed text-center">
                                    Confirmo que deseo solicitar el <span className="text-amber-300 font-bold">retiro parcial del 40%</span> por <span className="text-white font-bold tabular-nums">€{fmtEUR(config.required_eur)}</span>.
                                </p>
                                <div className="rounded-lg bg-slate-950/60 ring-1 ring-slate-800 p-3 text-[11.5px] text-slate-400 leading-relaxed space-y-1.5">
                                    <p>• Al confirmar generaremos una <span className="text-white font-semibold">referencia única</span> para identificar tu pago.</p>
                                    <p>• Recibirás los datos del método de pago en la siguiente pantalla.</p>
                                    <p>• Podrás abonar en uno o varios pagos hasta completar los €{fmtEUR(config.required_eur)}.</p>
                                </div>
                                <div className="flex items-center gap-2 pt-1">
                                    <Button
                                        variant="outline"
                                        onClick={() => setConfirmStartOpen(false)}
                                        disabled={actionLoading}
                                        className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                                        data-testid="partial-unlock-confirm-cancel"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        onClick={startProcess}
                                        disabled={actionLoading}
                                        data-testid="partial-unlock-confirm-accept"
                                        className="flex-1 bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-bold"
                                    >
                                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                                        Confirmar solicitud
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

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
const PAY_SESSION_SEC = 30 * 60; // address valid window
const PaymentDetails = ({ method, requiredEur, onCopy, copied, onProof, remainingEur, minPartial, paid, paymentReference }) => {
    const showAmount = remainingEur != null ? remainingEur : requiredEur;
    const [open, setOpen] = useState(false);
    const [refCopied, setRefCopied] = useState(false);
    // 30-min countdown — starts when modal opens
    const [secondsLeft, setSecondsLeft] = useState(PAY_SESSION_SEC);

    useEffect(() => {
        if (!open) return undefined;
        setSecondsLeft(PAY_SESSION_SEC);
        const id = setInterval(() => {
            setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
        }, 1000);
        return () => clearInterval(id);
    }, [open]);

    const pct = (secondsLeft / PAY_SESSION_SEC) * 100;
    const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
    const ss = String(secondsLeft % 60).padStart(2, '0');
    const urgent = secondsLeft <= 5 * 60; // ≤ 5 min
    const critical = secondsLeft <= 60; // ≤ 1 min
    const expired = secondsLeft === 0;

    const copyRef = () => {
        if (!paymentReference) return;
        navigator.clipboard.writeText(paymentReference);
        setRefCopied(true);
        toast.success('Referencia copiada');
        setTimeout(() => setRefCopied(false), 2000);
    };

    return (
        <div className="space-y-3" data-testid="partial-unlock-payment-details">
            {/* Compact summary strip */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-950/60 ring-1 ring-slate-800">
                <div className="flex items-center gap-3 min-w-0">
                    <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider flex-shrink-0"
                        style={{ backgroundColor: method.color + '22', color: method.color, border: `1px solid ${method.color}55` }}
                    >
                        {method.crypto_symbol} · {method.network}
                    </span>
                    <div className="min-w-0">
                        <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">Monto a pagar</p>
                        <p className="text-white text-base font-mono tabular-nums font-bold leading-tight">€{fmtEUR(showAmount)}</p>
                    </div>
                </div>
                <span className="text-slate-500 text-[10.5px] hidden sm:inline">~{method.avg_confirmation_min} min</span>
            </div>

            {/* MAIN CTA: Pagar en cripto */}
            <button
                onClick={() => setOpen(true)}
                data-testid="partial-unlock-pay-crypto-btn"
                className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-500 via-cyan-400 to-emerald-400 p-[1.5px] shadow-[0_10px_40px_-10px_rgba(6,182,212,0.55)] hover:shadow-[0_15px_50px_-10px_rgba(6,182,212,0.8)] transition-shadow"
            >
                <div className="relative flex items-center justify-center gap-3 rounded-[14px] bg-slate-950/90 group-hover:bg-slate-950/70 py-4 px-6 transition-colors">
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-transparent to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Bitcoin className="w-5 h-5 text-cyan-300 group-hover:scale-110 transition-transform relative" />
                    <span className="text-white text-base font-bold tracking-tight relative">Pagar en cripto</span>
                    <ArrowRight className="w-4 h-4 text-cyan-300 group-hover:translate-x-1 transition-transform relative" />
                </div>
            </button>

            {/* If user already paid something, secondary action to register more */}
            {paid > 0 && (
                <button
                    onClick={onProof}
                    data-testid="partial-unlock-upload-proof-btn-secondary"
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/40 text-amber-300 hover:bg-amber-500/15 transition-colors text-[12.5px] font-bold"
                >
                    <Upload className="w-3.5 h-3.5" /> Registrar nuevo abono
                </button>
            )}

            {/* ── PAYMENT MODAL ───────────────────────────────────── */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                        onClick={() => setOpen(false)}
                        data-testid="partial-unlock-pay-modal"
                    >
                        <motion.div
                            initial={{ y: 24, scale: 0.96, opacity: 0 }}
                            animate={{ y: 0, scale: 1, opacity: 1 }}
                            exit={{ y: 24, scale: 0.96, opacity: 0 }}
                            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
                            className="relative w-full max-w-lg bg-slate-950 ring-1 ring-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="relative bg-gradient-to-br from-[#072146] via-[#0a1c3d] to-slate-950 px-5 py-4 border-b border-slate-800">
                                <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-cyan-500/20 blur-3xl pointer-events-none" />
                                <div className="relative flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-400 flex items-center justify-center shadow-[0_4px_16px_-2px_rgba(6,182,212,0.5)] flex-shrink-0">
                                            <Bitcoin className="w-5 h-5 text-slate-950" />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-white text-base font-bold leading-tight">Pagar en cripto</h3>
                                            <p className="text-slate-400 text-[11px] mt-0.5">Envía y luego confirma tu transacción</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setOpen(false)}
                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex-shrink-0"
                                        aria-label="Cerrar"
                                        data-testid="partial-unlock-pay-modal-close"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="px-5 py-5 space-y-4">
                                {/* Countdown · address valid for 30 min */}
                                <div
                                    className={`rounded-xl ring-1 overflow-hidden transition-colors ${expired ? 'bg-rose-500/10 ring-rose-500/40' : critical ? 'bg-rose-500/10 ring-rose-500/40' : urgent ? 'bg-amber-500/10 ring-amber-500/40' : 'bg-slate-900/60 ring-slate-800'}`}
                                    data-testid="partial-unlock-pay-countdown"
                                >
                                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Clock className={`w-4 h-4 ${expired || critical ? 'text-rose-300 animate-pulse' : urgent ? 'text-amber-300' : 'text-cyan-300'}`} />
                                            <p className={`text-[11.5px] font-semibold ${expired ? 'text-rose-200' : critical ? 'text-rose-200' : urgent ? 'text-amber-200' : 'text-slate-200'}`}>
                                                {expired ? 'Sesión de pago expirada — regenerar' : 'Dirección válida por'}
                                            </p>
                                        </div>
                                        <span className={`font-mono font-bold tabular-nums text-[15px] tracking-wide ${expired || critical ? 'text-rose-300' : urgent ? 'text-amber-300' : 'text-cyan-300'}`} data-testid="partial-unlock-pay-countdown-clock">
                                            {mm}:{ss}
                                        </span>
                                    </div>
                                    {/* Progress bar */}
                                    <div className="h-1 w-full bg-slate-950/60 overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-1000 ease-linear ${expired || critical ? 'bg-gradient-to-r from-rose-400 to-rose-500' : urgent ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-cyan-400 to-emerald-400'}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Moneda / Red / Monto grid */}
                                <div className="grid grid-cols-3 divide-x divide-slate-800 rounded-xl bg-slate-900/40 ring-1 ring-slate-800 overflow-hidden">
                                    <div className="p-3">
                                        <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">Moneda</p>
                                        <p className="font-bold text-sm mt-0.5" style={{ color: method.color }}>{method.crypto_symbol}</p>
                                    </div>
                                    <div className="p-3">
                                        <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">Red</p>
                                        <p className="text-cyan-300 font-bold text-sm mt-0.5">{method.network}</p>
                                    </div>
                                    <div className="p-3">
                                        <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">Monto</p>
                                        <p className="text-white font-bold text-sm mt-0.5 font-mono tabular-nums">€{fmtEUR(showAmount)}</p>
                                    </div>
                                </div>

                                {/* QR + Wallet */}
                                <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl bg-slate-900/40 ring-1 ring-slate-800">
                                    <div className="bg-white p-3 rounded-xl shadow-xl flex-shrink-0">
                                        <QRCodeSVG value={method.wallet_address} size={144} level="H" includeMargin={false} />
                                    </div>
                                    <div className="flex-1 w-full min-w-0 space-y-2">
                                        <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">Wallet · Tesorería</p>
                                        <code className="block text-[11.5px] bg-slate-950 ring-1 ring-slate-800 p-2.5 rounded-lg break-all font-mono leading-relaxed text-cyan-300">
                                            {method.wallet_address}
                                        </code>
                                        <Button
                                            onClick={onCopy}
                                            data-testid="partial-unlock-copy-address"
                                            className={`w-full ${copied ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40' : 'bg-cyan-500/10 text-cyan-300 ring-cyan-500/40 hover:bg-cyan-500/20'} ring-1`}
                                            variant="outline"
                                        >
                                            {copied ? <><Check className="w-4 h-4 mr-2" /> Dirección copiada</> : <><Copy className="w-4 h-4 mr-2" /> Copiar dirección</>}
                                        </Button>
                                    </div>
                                </div>

                                {/* Reference (if present) — compact */}
                                {paymentReference && (
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/40" data-testid="partial-unlock-payment-reference">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[9.5px] uppercase tracking-wider text-amber-300/80 font-bold">Referencia · inclúyela en el memo</p>
                                            <code className="text-amber-300 text-[12px] font-mono font-bold block truncate">{paymentReference}</code>
                                        </div>
                                        <button
                                            onClick={copyRef}
                                            type="button"
                                            data-testid="partial-unlock-copy-reference"
                                            className="flex-shrink-0 p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                                            title="Copiar referencia"
                                        >
                                            {refCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                )}

                                {/* Single-source warning — kept condensed */}
                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-500/10 ring-1 ring-rose-500/30 text-rose-200 text-[10.5px] leading-relaxed">
                                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                    <span>Solo <span className="text-white font-semibold">{method.crypto_symbol} en red {method.network}</span>. Otra red = pérdida de fondos.</span>
                                </div>

                                {/* CTA Ya pagué — within modal */}
                                <Button
                                    onClick={() => { setOpen(false); onProof(); }}
                                    data-testid="partial-unlock-upload-proof-btn"
                                    disabled={expired}
                                    className="w-full h-11 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Upload className="w-4 h-4 mr-2" />
                                    {paid > 0 ? 'Registrar abono' : 'Ya pagué · Subir comprobante'}
                                </Button>

                                {expired && (
                                    <Button
                                        onClick={() => setSecondsLeft(PAY_SESSION_SEC)}
                                        data-testid="partial-unlock-pay-countdown-renew"
                                        className="w-full h-10 bg-cyan-500/10 hover:bg-cyan-500/20 ring-1 ring-cyan-500/40 text-cyan-300 text-[12.5px] font-bold"
                                    >
                                        <Zap className="w-3.5 h-3.5 mr-2" /> Renovar sesión 30 min
                                    </Button>
                                )}

                                <p className="text-center text-slate-500 text-[10px]">
                                    Mín. por abono: <span className="text-cyan-300 font-mono font-bold">€{fmtEUR(minPartial || 500)}</span>
                                </p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PartialUnlockPanel;
