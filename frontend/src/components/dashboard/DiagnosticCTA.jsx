import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { Sparkles, ChevronRight, AlertTriangle, ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react';
import { HealthScoreRing } from '../diagnostics/HealthScoreRing';


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
    const score = data?.health_score;
    const scoreColor = data?.health_score_color || '#06b6d4';
    const handleClick = () => {
        window.dispatchEvent(new CustomEvent('open-diagnostic'));
    };

    return (
        <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleClick}
            data-testid="dashboard-diagnostic-cta"
            className="lb-card-glow w-full text-left group relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900/70 via-[#0a1c3d] to-slate-950 hover:shadow-[0_18px_50px_-12px_rgba(0,212,255,0.45)] hover:-translate-y-[1px] transition-all duration-300"
        >
            {/* Background blobs */}
            <div className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-cyan-500/12 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-12 w-56 h-56 rounded-full bg-violet-500/10 blur-3xl" />

            <div className="relative flex items-center justify-between gap-3 p-4 sm:p-5">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    {/* Health score ring (replaces the static icon) */}
                    <div className="flex-shrink-0">
                        {!loading && score != null ? (
                            <HealthScoreRing score={score} color={scoreColor} label="" size="sm" />
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-slate-800 ring-1 ring-slate-700 flex items-center justify-center">
                                <Loader2 className="w-5 h-5 animate-spin text-cyan-300" />
                            </div>
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300 font-bold flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3" /> Salud de cuenta
                        </p>
                        <p className="text-white font-bold text-[15px] sm:text-[16px] mt-0.5 leading-tight">
                            {loading ? 'Analizando…' : score >= 90
                                ? 'Tu cuenta está en perfecto estado'
                                : score >= 70 ? 'Tu cuenta está bien, hay pequeñas mejoras'
                                    : score >= 50 ? 'Tu cuenta necesita atención'
                                        : 'Tu cuenta tiene puntos críticos'}
                        </p>
                        <p className="text-slate-400 text-[11.5px] mt-0.5 truncate">
                            {loading
                                ? 'Cargando…'
                                : data?.overall === 'all_clear'
                                    ? 'No hay acciones pendientes.'
                                    : pending > 0
                                        ? `${pending} ${pending === 1 ? 'acción recomendada' : 'acciones recomendadas'} · click para ver detalle`
                                        : 'Click para ver el análisis completo'}
                        </p>
                    </div>
                </div>

                {/* Status pill + chevron */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    {!loading && data && (
                        blocked ? (
                            <span className="hidden sm:inline-flex lb-badge lb-badge-error">
                                <ShieldAlert className="w-3 h-3" /> {data.blocker_count} bloqueo{data.blocker_count === 1 ? '' : 's'}
                            </span>
                        ) : pending > 0 ? (
                            <span className="hidden sm:inline-flex lb-badge lb-badge-pending">
                                <AlertTriangle className="w-3 h-3" /> {pending} pendiente{pending === 1 ? '' : 's'}
                            </span>
                        ) : (
                            <span className="hidden sm:inline-flex lb-badge lb-badge-approved">
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
