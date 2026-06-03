import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { Sparkles, ChevronRight, AlertTriangle, ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react';


/**
 * Compact "Analizar mi caso" CTA shown on the dashboard.
 *
 * Calls `/diagnostics/me` once on mount (lightweight read-only) to figure out
 * if there is anything pending. Shows a dynamic pill with the count of issues.
 * Clicking dispatches a custom DOM event so the floating AI Assistant can
 * open the DiagnosticPanel without prop-drilling.
 */
export const DiagnosticCTA = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        api.get('/diagnostics/me')
            .then((r) => { if (alive) setData(r.data); })
            .catch(() => { /* silent */ })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    const pending = (data?.blocker_count || 0) + (data?.warn_count || 0);
    const blocked = (data?.blocker_count || 0) > 0;
    const handleClick = () => {
        // Let the floating AI assistant open the panel inline
        window.dispatchEvent(new CustomEvent('open-diagnostic'));
    };

    return (
        <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleClick}
            data-testid="dashboard-diagnostic-cta"
            className="w-full text-left group relative overflow-hidden rounded-2xl ring-1 ring-cyan-500/20 bg-gradient-to-br from-slate-900/70 via-[#0a1c3d] to-slate-950 hover:ring-cyan-400/40 hover:shadow-[0_8px_30px_-8px_rgba(34,211,238,0.25)] transition-all"
        >
            {/* Background blobs */}
            <div className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-cyan-500/12 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-12 w-56 h-56 rounded-full bg-violet-500/10 blur-3xl" />

            <div className="relative flex items-center justify-between gap-3 p-4 sm:p-5">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-cyan-500/20 to-violet-500/20 ring-1 ring-cyan-500/30">
                        <Sparkles className="w-5 h-5 text-cyan-300" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300 font-bold flex items-center gap-1.5">
                            Diagnóstico automático
                            {loading && <Loader2 className="w-2.5 h-2.5 animate-spin opacity-60" />}
                        </p>
                        <p className="text-white font-bold text-[15px] sm:text-[16px] mt-0.5 leading-tight">Analizar mi caso</p>
                        <p className="text-slate-400 text-[11.5px] mt-0.5 truncate">
                            {loading
                                ? 'Cargando…'
                                : data?.overall === 'all_clear'
                                    ? 'Tu cuenta está al día — no hay acciones pendientes.'
                                    : data?.overall === 'minor'
                                        ? 'Hay información útil sobre tu cuenta.'
                                        : pending > 0
                                            ? `${pending} ${pending === 1 ? 'acción recomendada' : 'acciones recomendadas'} en tu cuenta.`
                                            : 'Revisa el estado de tu cuenta en un click.'}
                        </p>
                    </div>
                </div>

                {/* Status pill + chevron */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    {!loading && data && (
                        blocked ? (
                            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-500/15 ring-1 ring-rose-500/40 text-rose-300 text-[10px] font-bold uppercase tracking-wider">
                                <ShieldAlert className="w-3 h-3" /> {data.blocker_count} bloqueo{data.blocker_count === 1 ? '' : 's'}
                            </span>
                        ) : pending > 0 ? (
                            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 ring-1 ring-amber-500/40 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                                <AlertTriangle className="w-3 h-3" /> {pending} pendiente{pending === 1 ? '' : 's'}
                            </span>
                        ) : (
                            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/40 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                                <CheckCircle2 className="w-3 h-3" /> Al día
                            </span>
                        )
                    )}
                    <ChevronRight className="w-5 h-5 text-cyan-300 group-hover:translate-x-1 transition-transform" />
                </div>
            </div>
        </motion.button>
    );
};


export default DiagnosticCTA;
