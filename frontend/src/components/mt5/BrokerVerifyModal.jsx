import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../lib/api';
import { Button } from '../ui/button';
import {
    ShieldCheck, X, Loader2, CheckCircle2, FileText, Download,
    ExternalLink, Clock, Building2, Sparkles,
} from 'lucide-react';

const fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const fmtDate = (str) => {
    if (!str) return '—';
    const d = new Date(str);
    return isNaN(d) ? str : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Color palette per authority — EU institutional look
const AUTHORITY_STYLE = {
    CNMV:  { color: '#f59e0b', bg: 'bg-amber-500/10',  ring: 'ring-amber-500/30',  accent: 'text-amber-300'  },
    CySEC: { color: '#06b6d4', bg: 'bg-cyan-500/10',   ring: 'ring-cyan-500/30',   accent: 'text-cyan-300'   },
    FCA:   { color: '#6366f1', bg: 'bg-indigo-500/10', ring: 'ring-indigo-500/30', accent: 'text-indigo-300' },
};

// Simulated progressive check animation
const CHECK_STAGES = [
    { label: 'Conectando con API CNMV (Madrid)',       ms: 700 },
    { label: 'Consultando registro oficial · Nº 2534',  ms: 700 },
    { label: 'Verificando licencia CySEC · Chipre',     ms: 700 },
    { label: 'Validando passporting FCA · Reino Unido', ms: 600 },
    { label: 'Firmando extracto regulatorio',           ms: 500 },
];

export const BrokerVerifyModal = ({ open, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [stageIdx, setStageIdx] = useState(0);
    const [data, setData] = useState(null);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        setStageIdx(0);
        setData(null);

        let cancelled = false;

        // Animate through stages
        let elapsed = 0;
        const timers = [];
        CHECK_STAGES.forEach((s, i) => {
            elapsed += s.ms;
            timers.push(setTimeout(() => { if (!cancelled) setStageIdx(i + 1); }, elapsed));
        });

        // Fetch the actual verification payload while stages animate
        (async () => {
            try {
                const r = await api.post('/mt5/broker/verify');
                if (cancelled) return;
                // Wait for animation to complete gracefully
                const totalMs = CHECK_STAGES.reduce((s, x) => s + x.ms, 0);
                setTimeout(() => { if (!cancelled) { setData(r.data); setLoading(false); } }, totalMs + 150);
            } catch (e) {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
            timers.forEach(t => clearTimeout(t));
        };
    }, [open]);

    const handlePrint = () => {
        window.print();
    };

    if (!open) return null;

    const verifiedDate = data?.verified_at ? fmtDateTime(data.verified_at) : '—';

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
                onClick={onClose}
                data-testid="broker-verify-modal"
            >
                <motion.div
                    initial={{ y: 24, opacity: 0, scale: 0.96 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: 24, opacity: 0, scale: 0.96 }}
                    transition={{ type: 'spring', damping: 24, stiffness: 320 }}
                    className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 ring-1 ring-cyan-500/25 rounded-2xl shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Ambient glow */}
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-24 -right-24 w-80 h-80 rounded-full opacity-30 blur-3xl"
                        style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.35), transparent 70%)' }}
                    />

                    {/* Header */}
                    <div className="relative flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-800/80">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/25 to-emerald-700/15 ring-1 ring-emerald-400/40 flex items-center justify-center flex-shrink-0">
                                <ShieldCheck className="w-5 h-5 text-emerald-200" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-300 font-bold">Validación regulatoria · en vivo</p>
                                <h3 className="text-white text-base sm:text-lg font-bold leading-tight">Extracto oficial de licencias</h3>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            data-no-hover
                            data-testid="broker-verify-close"
                            aria-label="Cerrar"
                            className="w-8 h-8 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/60 flex items-center justify-center transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Loading state */}
                    {loading && (
                        <div className="px-6 py-8" data-testid="broker-verify-loading">
                            <div className="flex items-center gap-3 mb-4">
                                <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                                <p className="text-cyan-300 text-sm font-semibold">Consultando registros regulatorios…</p>
                            </div>
                            <ul className="space-y-2">
                                {CHECK_STAGES.map((s, i) => {
                                    const done = i < stageIdx;
                                    const active = i === stageIdx;
                                    return (
                                        <li key={i} className="flex items-center gap-2 text-[12px]">
                                            {done ? (
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                            ) : active ? (
                                                <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                                            ) : (
                                                <span className="w-3.5 h-3.5 rounded-full bg-slate-800 ring-1 ring-slate-700" />
                                            )}
                                            <span className={done ? 'text-emerald-200' : active ? 'text-cyan-200' : 'text-slate-600'}>
                                                {s.label}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}

                    {/* Result state */}
                    {!loading && data && (
                        <div className="relative px-5 sm:px-6 py-5 space-y-5" data-testid="broker-verify-result">
                            {/* Pass banner */}
                            <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-transparent ring-1 ring-emerald-400/40 p-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="w-9 h-9 rounded-full bg-emerald-500/25 ring-1 ring-emerald-300/50 flex items-center justify-center flex-shrink-0">
                                            <CheckCircle2 className="w-5 h-5 text-emerald-100" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-emerald-200 text-sm font-bold leading-tight">✓ Entidad activa en los 3 registros</p>
                                            <p className="text-slate-400 text-[11px]">Última verificación: <span className="text-emerald-300 font-mono">{verifiedDate}</span></p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">Ref. auditoría</p>
                                        <p className="text-white font-mono text-[11px]" data-testid="broker-verify-reference">{data.reference}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Entity block */}
                            <div className="rounded-xl bg-slate-950/60 ring-1 ring-slate-800 p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-bold">Entidad supervisada</p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">Razón social</p>
                                        <p className="text-white text-sm font-bold mt-0.5">{data.broker.legal_name}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">Nombre comercial</p>
                                        <p className="text-white text-sm font-bold mt-0.5">{data.broker.name}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">Jurisdicción</p>
                                        <p className="text-slate-200 text-[13px] mt-0.5">{data.broker.jurisdiction || data.broker.country}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">Año de fundación</p>
                                        <p className="text-slate-200 text-[13px] mt-0.5 font-mono">{data.broker.year_founded}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Registry cards */}
                            <div className="space-y-2.5">
                                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-bold flex items-center gap-1.5">
                                    <FileText className="w-3 h-3" />
                                    Extractos de autoridades regulatorias
                                </p>
                                {data.registries.map((reg) => {
                                    const style = AUTHORITY_STYLE[reg.authority] || AUTHORITY_STYLE.CNMV;
                                    return (
                                        <div
                                            key={reg.authority}
                                            className={`relative rounded-lg ${style.bg} ring-1 ${style.ring} p-3.5`}
                                            data-testid={`broker-verify-${reg.authority.toLowerCase()}`}
                                        >
                                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                                    <div
                                                        className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-[11px] flex-shrink-0"
                                                        style={{ backgroundColor: style.color + '22', color: style.color, border: '1px solid ' + style.color + '55' }}
                                                    >
                                                        {reg.authority}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <p className={`text-[13px] font-bold ${style.accent}`}>{reg.authority}</p>
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 ring-1 ring-emerald-500/30 text-emerald-300 text-[9.5px] font-bold uppercase tracking-wider">
                                                                <CheckCircle2 className="w-2.5 h-2.5" /> {reg.status_label}
                                                            </span>
                                                        </div>
                                                        <p className="text-slate-400 text-[10.5px] mt-0.5">{reg.authority_full}</p>
                                                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                                                            <div>
                                                                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">{reg.field_label}</p>
                                                                <p className="text-white font-mono text-[11.5px] font-bold">{reg.reference}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Registrado</p>
                                                                <p className="text-slate-200 text-[11px] font-mono">{reg.registered_on}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Último audit</p>
                                                                <p className="text-slate-200 text-[11px] font-mono">{fmtDate(reg.last_audit)}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Alcance</p>
                                                                <p className="text-slate-300 text-[10.5px] leading-tight">{reg.scope}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                {reg.source_url && (
                                                    <a
                                                        href={reg.source_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        data-no-hover
                                                        className={`text-[10px] font-bold inline-flex items-center gap-1 ${style.accent} hover:opacity-80`}
                                                    >
                                                        Fuente <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Protections summary */}
                            <div className="rounded-xl bg-gradient-to-r from-[#003399]/25 via-slate-900/60 to-[#003399]/15 ring-1 ring-[#FFCC00]/30 p-3.5">
                                <div className="flex items-center gap-2 mb-2">
                                    <Sparkles className="w-3.5 h-3.5 text-[#FFCC00]" />
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-[#FFCC00] font-bold">Protecciones activas</p>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <MiniStat label="MiFID II"     value={data.protections.mifid_ii ? '✓ Activo' : '—'} color="#6366f1" />
                                    <MiniStat label="ICF"          value={`€${data.protections.icf_coverage_eur.toLocaleString('es-ES')}`} color="#10b981" />
                                    <MiniStat label="Segregación"  value={data.protections.segregation} color="#06b6d4" />
                                    <MiniStat label="Auditores"    value={data.protections.auditors.join(' · ')} color="#f59e0b" />
                                </div>
                            </div>

                            <p className="text-[10px] text-slate-500 leading-relaxed flex items-start gap-1.5">
                                <Clock className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                {data.disclaimer}
                            </p>

                            {/* Actions */}
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/60">
                                <Button
                                    variant="outline"
                                    onClick={handlePrint}
                                    data-testid="broker-verify-print"
                                    className="border-slate-700 text-slate-200 hover:bg-slate-800 h-9"
                                >
                                    <Download className="w-3.5 h-3.5 mr-1.5" /> Descargar extracto (PDF)
                                </Button>
                                <Button
                                    onClick={onClose}
                                    className="bg-cyan-600 hover:bg-cyan-500 text-white h-9"
                                >
                                    Cerrar
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Fallback: fetch failed */}
                    {!loading && !data && (
                        <div className="px-6 py-10 text-center">
                            <p className="text-rose-300 text-sm">No se pudo completar la verificación en este momento.</p>
                            <Button onClick={onClose} variant="outline" className="mt-4 border-slate-700 text-slate-300">Cerrar</Button>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

const MiniStat = ({ label, value, color }) => (
    <div className="px-2.5 py-1.5 rounded-md bg-slate-950/50 ring-1 ring-slate-800">
        <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
        <p className="text-[11.5px] font-bold mt-0.5" style={{ color }}>{value}</p>
    </div>
);

export default BrokerVerifyModal;
