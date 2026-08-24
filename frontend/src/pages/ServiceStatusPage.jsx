import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import {
    CheckCircle2, AlertTriangle, XCircle, RefreshCw, Loader2, Activity, Clock, ShieldCheck, LogIn,
} from 'lucide-react';

const Shell = ({ children }) => {
    const { user } = useAuth();
    if (user) return <Layout>{children}</Layout>;
    return (
        <div className="min-h-screen" style={{ background: '#000000' }} data-testid="public-status-shell">
            <header className="border-b border-slate-800/70 bg-slate-950/40">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <ShieldCheck className="w-6 h-6 text-cyan-400" />
                        <div>
                            <p className="text-white font-bold text-sm tracking-wide">LIONSBIT</p>
                            <p className="text-slate-500 text-[10px] uppercase tracking-widest -mt-0.5">Verificación</p>
                        </div>
                    </div>
                    <Link
                        to="/login"
                        data-testid="public-status-login-link"
                        className="inline-flex items-center gap-1.5 text-cyan-300 text-sm font-medium hover:text-cyan-200 transition-colors"
                    >
                        <LogIn className="w-4 h-4" /> Iniciar sesión
                    </Link>
                </div>
            </header>
            <div className="px-4 py-8">{children}</div>
        </div>
    );
};

const STATUS_META = {
    operational: { label: 'Operativo', color: 'text-emerald-400', dot: 'bg-emerald-400', bar: 'bg-emerald-500', Icon: CheckCircle2 },
    degraded: { label: 'Degradado', color: 'text-amber-400', dot: 'bg-amber-400', bar: 'bg-amber-500', Icon: AlertTriangle },
    down: { label: 'Caído', color: 'text-red-400', dot: 'bg-red-400', bar: 'bg-red-500', Icon: XCircle },
};

const OVERALL_META = {
    operational: { text: 'Todos los sistemas operativos', cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' },
    degraded: { text: 'Rendimiento degradado en algunos servicios', cls: 'bg-amber-500/10 border-amber-500/30 text-amber-300' },
    down: { text: 'Incidencia activa en uno o más servicios', cls: 'bg-red-500/10 border-red-500/30 text-red-300' },
};

const formatDuration = (secs) => {
    if (secs == null) return '—';
    if (secs < 60) return `${secs} s`;
    if (secs < 3600) return `${Math.round(secs / 60)} min`;
    return `${Math.floor(secs / 3600)} h ${Math.round((secs % 3600) / 60)} min`;
};

const HistoryBars = ({ history, componentKey }) => (
    <div className="flex items-end gap-[3px] h-6" title="Historial de comprobaciones recientes">
        {history.map((h, i) => {
            const s = h.components?.[componentKey] || 'operational';
            return <span key={i} className={`w-[5px] rounded-sm ${STATUS_META[s].bar} ${s === 'operational' ? 'h-4 opacity-60' : 'h-6'}`} />;
        })}
    </div>
);

export default function ServiceStatusPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const r = await api.get('/system/status');
            setData(r.data);
        } catch { /* keep last */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        load();
        const iv = setInterval(load, 60000);
        return () => clearInterval(iv);
    }, [load]);

    if (loading && !data) {
        return (
            <Shell>
                <div className="flex items-center justify-center py-32">
                    <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                </div>
            </Shell>
        );
    }

    const overall = OVERALL_META[data?.overall || 'operational'];
    const OverallIcon = STATUS_META[data?.overall || 'operational'].Icon;

    return (
        <Shell>
            <div className="max-w-4xl mx-auto space-y-6" data-testid="service-status-page">
                <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
                            <Activity className="w-6 h-6 text-cyan-400" />
                        </div>
                        <div>
                            <h1 className="text-white text-2xl font-bold tracking-tight">Estado de Servicios</h1>
                            <p className="text-slate-400 text-sm">Monitorización en tiempo real de la plataforma LIONSBIT</p>
                        </div>
                    </div>
                    <Button variant="outline" className="border-slate-700 text-slate-300" onClick={load} data-testid="status-refresh-btn">
                        <RefreshCw className="w-4 h-4 mr-1.5" /> Actualizar
                    </Button>
                </motion.div>

                {/* Overall banner */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex items-center gap-3 p-5 rounded-2xl border ${overall.cls}`}
                    data-testid="status-overall-banner"
                >
                    <OverallIcon className="w-6 h-6" />
                    <p className="font-semibold text-base">{overall.text}</p>
                    <span className="ml-auto text-xs opacity-70 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {data?.checked_at ? new Date(data.checked_at).toLocaleTimeString('es-ES') : ''}
                    </span>
                </motion.div>

                {/* Component list */}
                <div className="rounded-2xl bg-slate-900/60 border border-slate-800 divide-y divide-slate-800" data-testid="status-components">
                    {(data?.components || []).map((c, i) => {
                        const meta = STATUS_META[c.status] || STATUS_META.operational;
                        return (
                            <motion.div
                                key={c.key}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="flex items-center gap-4 p-4.5 px-5 py-4"
                                data-testid={`status-component-${c.key}`}
                            >
                                <span className={`w-2.5 h-2.5 rounded-full ${meta.dot} ${c.status !== 'operational' ? 'animate-pulse' : ''}`} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-white text-sm font-semibold">{c.name}</p>
                                    <p className="text-slate-500 text-xs mt-0.5">
                                        {c.detail || c.description}
                                        {c.latency_ms != null && <span className="font-mono text-slate-600"> · {c.latency_ms} ms</span>}
                                    </p>
                                </div>
                                <div className="hidden sm:block">
                                    <HistoryBars history={data?.history || []} componentKey={c.key} />
                                </div>
                                <span className={`text-xs font-bold uppercase tracking-wide w-24 text-right ${meta.color}`} data-testid={`status-label-${c.key}`}>
                                    {meta.label}
                                </span>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Incident history */}
                <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5" data-testid="status-incidents">
                    <h2 className="text-white text-base font-semibold flex items-center gap-2 mb-4">
                        <AlertTriangle className="w-4 h-4 text-amber-400" /> Historial de incidencias
                    </h2>
                    {(data?.incidents || []).length === 0 ? (
                        <p className="text-slate-500 text-sm flex items-center gap-2" data-testid="status-no-incidents">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Sin incidencias registradas. Todos los servicios han funcionado con normalidad.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {data.incidents.map((inc) => {
                                const meta = STATUS_META[inc.status] || STATUS_META.degraded;
                                const ongoing = !inc.ended_at;
                                return (
                                    <div key={inc.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800" data-testid={`incident-${inc.id}`}>
                                        <span className={`mt-1.5 w-2 h-2 rounded-full ${meta.dot} ${ongoing ? 'animate-pulse' : ''}`} />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-slate-200 text-sm font-medium">
                                                {inc.component_name}
                                                <span className={`ml-2 text-[10px] font-bold uppercase ${meta.color}`}>{meta.label}</span>
                                                {ongoing && <span className="ml-2 text-[10px] font-bold uppercase text-red-300 bg-red-500/15 px-1.5 py-0.5 rounded">En curso</span>}
                                            </p>
                                            {inc.detail && <p className="text-slate-500 text-xs mt-0.5">{inc.detail}</p>}
                                            <p className="text-slate-600 text-xs mt-1">
                                                {new Date(inc.started_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                {!ongoing && <span> · Duración: {formatDuration(inc.duration_seconds)}</span>}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <p className="text-slate-600 text-xs text-center">
                    Comprobación automática cada 60 segundos · Las barras muestran el historial de las últimas verificaciones
                </p>
            </div>
        </Shell>
    );
}
