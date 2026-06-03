import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Button } from '../ui/button';
import {
    Sparkles, CheckCircle2, AlertTriangle, ShieldAlert, Info,
    Loader2, RefreshCw, ChevronRight, ArrowLeft, FileText,
    Wallet, Receipt, Shield, User as UserIcon, Box,
} from 'lucide-react';


// Visual config per severity (color + icon + sort weight)
const SEVERITY = {
    blocker: { color: '#ef4444', bg: 'bg-rose-500/12',   ring: 'ring-rose-500/40',   text: 'text-rose-200',    label: 'Bloqueante', icon: ShieldAlert },
    warn:    { color: '#f59e0b', bg: 'bg-amber-500/12',  ring: 'ring-amber-500/40',  text: 'text-amber-200',   label: 'Atención',   icon: AlertTriangle },
    info:    { color: '#06b6d4', bg: 'bg-cyan-500/12',   ring: 'ring-cyan-500/40',   text: 'text-cyan-200',    label: 'Info',       icon: Info },
    ok:      { color: '#10b981', bg: 'bg-emerald-500/12', ring: 'ring-emerald-500/40', text: 'text-emerald-200', label: 'Listo',     icon: CheckCircle2 },
};

const CATEGORY_ICON = {
    kyc: Shield,
    banking: Wallet,
    tax: Receipt,
    withdrawal: Wallet,
    vault: Box,
    profile: UserIcon,
};

const OVERALL_HEADLINE = {
    all_clear: {
        color: '#10b981',
        title: '¡Todo en orden!',
        sub: 'No hay acciones pendientes en tu cuenta.',
        ring: 'from-emerald-500/15 to-transparent ring-emerald-500/30',
    },
    minor: {
        color: '#06b6d4',
        title: 'Algunas notas informativas',
        sub: 'Hay información útil sobre el estado de tu cuenta.',
        ring: 'from-cyan-500/15 to-transparent ring-cyan-500/30',
    },
    action_required: {
        color: '#f59e0b',
        title: 'Tu atención es necesaria',
        sub: 'Detectamos puntos que conviene resolver.',
        ring: 'from-amber-500/15 to-transparent ring-amber-500/30',
    },
    blocked: {
        color: '#ef4444',
        title: 'Hay bloqueos activos',
        sub: 'Resuelve estos puntos para operar con normalidad.',
        ring: 'from-rose-500/15 to-transparent ring-rose-500/30',
    },
};


/**
 * DiagnosticPanel — analiza la cuenta del usuario y muestra hallazgos
 * estructurados con CTAs accionables.
 *
 * Props:
 *   - compact?: boolean — si true, usa layout más estrecho (para chat)
 *   - onClose?: function — botón "Volver al chat" (solo si está en chat)
 *   - autoRun?: boolean — si true, analiza al montar
 */
export const DiagnosticPanel = ({ compact = false, onClose, autoRun = true }) => {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [started, setStarted] = useState(false);

    const run = async () => {
        setLoading(true);
        setStarted(true);
        try {
            const r = await api.get('/diagnostics/me');
            setData(r.data);
        } catch (err) {
            setData({ error: err.response?.data?.detail || 'No se pudo completar el diagnóstico' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (autoRun) run();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className={compact ? 'py-1' : 'space-y-4'} data-testid="diagnostic-panel">
            {compact && (
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                        {onClose && (
                            <button onClick={onClose} className="text-slate-400 hover:text-white p-1 -ml-1" data-testid="diag-back" aria-label="Volver">
                                <ArrowLeft className="w-3.5 h-3.5" />
                            </button>
                        )}
                        <div>
                            <p className="text-[9.5px] uppercase tracking-wider text-cyan-300 font-bold">Diagnóstico automático</p>
                            <p className="text-white text-[12.5px] font-bold leading-tight">Análisis de mi cuenta</p>
                        </div>
                    </div>
                    <button
                        onClick={run}
                        disabled={loading}
                        className="text-slate-400 hover:text-cyan-300 p-1 disabled:opacity-50"
                        data-testid="diag-refresh"
                        title="Re-analizar"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            )}

            {!started && !autoRun && (
                <Button
                    onClick={run}
                    className="w-full bg-gradient-to-r from-cyan-500 to-[#1973B8] hover:opacity-95 text-white font-bold text-[13px] h-11"
                    data-testid="diag-run-btn"
                >
                    <Sparkles className="w-4 h-4 mr-2" /> Analizar mi caso
                </Button>
            )}

            {loading && (
                <div className="py-10 text-center" data-testid="diag-loading">
                    <Loader2 className="w-6 h-6 mx-auto animate-spin text-cyan-400" />
                    <p className="text-slate-400 text-[12px] mt-3">Analizando tu cuenta…</p>
                    <p className="text-slate-500 text-[10.5px] mt-1">
                        Revisando KYC · datos bancarios · impuestos · retiros · Vault
                    </p>
                </div>
            )}

            {data?.error && (
                <div className="rounded-lg bg-rose-500/10 ring-1 ring-rose-500/30 text-rose-300 p-3 text-[12px]" data-testid="diag-error">
                    {data.error}
                </div>
            )}

            <AnimatePresence>
                {data && !loading && !data.error && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-3"
                    >
                        {/* Headline */}
                        <Headline overall={data.overall} counts={data} compact={compact} />

                        {/* Findings list */}
                        <ul className="space-y-2" data-testid="diag-findings">
                            {data.findings.map((f, i) => (
                                <FindingRow
                                    key={i}
                                    finding={f}
                                    compact={compact}
                                    onAction={(path) => {
                                        if (onClose) onClose();
                                        navigate(path);
                                    }}
                                />
                            ))}
                        </ul>

                        <p className="text-[9.5px] text-slate-600 text-center" data-testid="diag-timestamp">
                            Diagnóstico ejecutado: {new Date(data.last_run_at).toLocaleString('es-ES')}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};


// ─── Headline summary card ────────────────────────────────────────
const Headline = ({ overall, counts, compact }) => {
    const meta = OVERALL_HEADLINE[overall] || OVERALL_HEADLINE.minor;
    return (
        <div
            className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${meta.ring} ring-1 p-3 sm:p-4`}
            data-testid={`diag-headline-${overall}`}
        >
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: meta.color + '25', boxShadow: `inset 0 0 0 1px ${meta.color}40` }}>
                    <Sparkles className="w-5 h-5" style={{ color: meta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`font-bold ${compact ? 'text-[13px]' : 'text-[15px]'} leading-tight`} style={{ color: meta.color }}>
                        {meta.title}
                    </p>
                    <p className="text-slate-300 text-[11px] mt-0.5">{meta.sub}</p>
                </div>
            </div>
            {/* Count pills */}
            <div className="grid grid-cols-4 gap-1.5 mt-3">
                {[
                    { k: 'blocker', count: counts.blocker_count },
                    { k: 'warn', count: counts.warn_count },
                    { k: 'info', count: counts.info_count },
                    { k: 'ok', count: counts.ok_count },
                ].map(({ k, count }) => {
                    const s = SEVERITY[k];
                    return (
                        <div key={k} className={`px-2 py-1.5 rounded-md ${s.bg} ring-1 ${s.ring} flex items-center gap-1.5`} data-testid={`diag-count-${k}`}>
                            <s.icon className="w-3 h-3 flex-shrink-0" style={{ color: s.color }} />
                            <span className={`text-[10px] ${s.text} font-bold`}>{count}</span>
                            <span className="text-slate-400 text-[9px] uppercase tracking-wider hidden sm:inline">{s.label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};


// ─── Individual finding card ──────────────────────────────────────
const FindingRow = ({ finding, compact, onAction }) => {
    const sev = SEVERITY[finding.severity] || SEVERITY.info;
    const SIcon = sev.icon;
    const CatIcon = CATEGORY_ICON[finding.category] || FileText;

    return (
        <motion.li
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            className={`group relative overflow-hidden rounded-lg ${sev.bg} ring-1 ${sev.ring} p-2.5 sm:p-3 transition-all hover:ring-2`}
            data-testid={`diag-finding-${finding.severity}-${finding.category}`}
        >
            <div className="flex items-start gap-2.5">
                <div className="relative">
                    <div className="w-7 h-7 rounded-md bg-slate-900/50 flex items-center justify-center" style={{ boxShadow: `inset 0 0 0 1px ${sev.color}40` }}>
                        <CatIcon className="w-3.5 h-3.5" style={{ color: sev.color }} />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-slate-950 ring-1 ring-slate-700 flex items-center justify-center">
                        <SIcon className="w-2 h-2" style={{ color: sev.color }} />
                    </div>
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`font-bold ${compact ? 'text-[11.5px]' : 'text-[12.5px]'} leading-tight`} style={{ color: sev.color }}>
                        {finding.title}
                    </p>
                    <p className="text-slate-300 text-[11px] mt-1 leading-relaxed">
                        {finding.description}
                    </p>
                    {finding.action_label && finding.action_path && (
                        <button
                            onClick={() => onAction(finding.action_path)}
                            className="mt-2 inline-flex items-center gap-1 text-[10.5px] font-bold transition-colors hover:gap-1.5"
                            style={{ color: sev.color }}
                            data-testid={`diag-action-${finding.category}`}
                        >
                            {finding.action_label} <ChevronRight className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>
        </motion.li>
    );
};


export default DiagnosticPanel;
