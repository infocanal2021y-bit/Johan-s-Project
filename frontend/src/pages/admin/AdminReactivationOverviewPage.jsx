import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { Button } from '../../components/ui/button';
import {
    Activity, Mail, Eye, LogIn, ShieldCheck, TrendingUp,
    Send, Clock, RefreshCw, Loader2, Sparkles, Globe
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STAGE_META = {
    emailed:            { label: 'Enviado',        icon: Mail,        color: 'cyan',    cls: 'bg-cyan-500'    },
    opened:             { label: 'Abierto',        icon: Eye,         color: 'sky',     cls: 'bg-sky-500'     },
    logged_in:          { label: 'Inició sesión',  icon: LogIn,       color: 'violet',  cls: 'bg-violet-500'  },
    password_changed:   { label: 'Cambió clave',   icon: ShieldCheck, color: 'fuchsia', cls: 'bg-fuchsia-500' },
    kyc_completed:      { label: 'KYC verificado', icon: ShieldCheck, color: 'amber',   cls: 'bg-amber-500'   },
    withdraw_requested: { label: 'Solicitó retiro',icon: TrendingUp,  color: 'emerald', cls: 'bg-emerald-500' },
};

const GROUP_META = {
    recuperar: { label: 'Recuperar', flag: '🇪🇸', cls: 'border-rose-500/40 text-rose-300 bg-rose-500/[0.06]' },
    espanoles: { label: 'Españoles', flag: '🇪🇸', cls: 'border-amber-500/40 text-amber-300 bg-amber-500/[0.06]' },
    latinos:   { label: 'Latinos',   flag: '🌎', cls: 'border-cyan-500/40 text-cyan-300 bg-cyan-500/[0.06]' },
};

const fmtNum = (n) => (n || 0).toLocaleString('es-ES');
const fmtPct = (p) => `${(p || 0).toFixed(1)}%`;

const Kpi = ({ label, value, accent = 'text-slate-100', testid }) => (
    <div className="px-5 py-4" data-testid={testid}>
        <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500 mb-1.5">{label}</p>
        <p className={`text-2xl font-semibold font-mono tabular-nums ${accent}`}>{value}</p>
    </div>
);

const FunnelBar = ({ stage, idx, total }) => {
    const meta = STAGE_META[stage.key] || STAGE_META.emailed;
    const Icon = meta.icon;
    const widthPct = total > 0 ? (stage.count / total) * 100 : 0;
    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.06 }}
            className="space-y-1.5"
            data-testid={`funnel-stage-${stage.key}`}
        >
            <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                    <Icon className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-medium">{stage.label}</span>
                </div>
                <div className="flex items-center gap-2">
                    {idx > 0 && stage.drop_off_pct > 0 && (
                        <span className="text-[10px] font-mono text-rose-400/80 tabular-nums">↓ {fmtPct(stage.drop_off_pct)}</span>
                    )}
                    <span className="font-mono tabular-nums font-semibold text-white">{fmtNum(stage.count)}</span>
                    <span className="font-mono tabular-nums text-[11px] text-slate-500 w-12 text-right">{fmtPct(stage.pct)}</span>
                </div>
            </div>
            <div className="h-2 rounded-full bg-slate-800/60 overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${widthPct}%` }}
                    transition={{ duration: 0.6, delay: idx * 0.06 + 0.1, ease: 'easeOut' }}
                    className={`h-full ${meta.cls}`}
                />
            </div>
        </motion.div>
    );
};

const HourlyHeatmap = ({ buckets, peakHour, peakCount }) => {
    const max = Math.max(...buckets, 1);
    return (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40" data-testid="heatmap-panel">
            <div className="px-5 py-4 border-b border-slate-800/80">
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-1">Mapa de calor · UTC</p>
                <h3 className="text-white text-sm font-semibold">Aperturas por hora del día</h3>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    {peakHour !== null && peakCount > 0 ? (
                        <>Hora pico: <span className="text-amber-300 font-medium">{String(peakHour).padStart(2,'0')}:00 UTC</span> · {peakCount} apertura{peakCount === 1 ? '' : 's'}</>
                    ) : (
                        <span className="text-slate-600">Aún sin aperturas registradas (los pixels se activan cuando el destinatario muestra imágenes en su cliente).</span>
                    )}
                </p>
            </div>
            <div className="p-4">
                <div className="grid grid-cols-12 gap-1.5">
                    {buckets.map((c, h) => {
                        const intensity = c / max;
                        const isPeak = c > 0 && c === peakCount;
                        return (
                            <div key={h} className="flex flex-col items-center gap-1" title={`${h}:00 UTC · ${c} aperturas`}>
                                <div
                                    className={`w-full aspect-square rounded-sm transition-all ${isPeak ? 'ring-1 ring-amber-400/60' : ''}`}
                                    style={{
                                        backgroundColor: c === 0
                                            ? 'rgba(15, 23, 42, 0.6)'
                                            : `rgba(245, 158, 11, ${0.18 + intensity * 0.7})`,
                                    }}
                                    data-testid={`heatmap-bucket-${h}`}
                                />
                                <span className={`text-[9px] font-mono tabular-nums ${isPeak ? 'text-amber-300' : 'text-slate-600'}`}>
                                    {String(h).padStart(2, '0')}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const GroupFunnel = ({ groupKey, info }) => {
    const meta = GROUP_META[groupKey] || { label: groupKey, flag: '🌐', cls: 'border-slate-700 text-slate-300' };
    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden"
            data-testid={`group-funnel-${groupKey}`}
        >
            <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{meta.flag}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium tracking-wide border ${meta.cls}`}>
                        {meta.label}
                    </span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                    {fmtNum(info.total)} contactos
                </span>
            </div>
            <div className="p-4 space-y-2.5">
                {info.stages.map((s, i) => <FunnelBar key={s.key} stage={s} idx={i} total={info.total} />)}
            </div>
        </motion.div>
    );
};

export const AdminReactivationOverviewPage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchOverview = useCallback(async (silent = false) => {
        if (!silent) setRefreshing(true);
        try {
            const token = localStorage.getItem('token');
            const r = await fetch(`${API_URL}/api/admin/reactivation/overview`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await r.json();
            setData(d);
        } catch (e) { console.error('[AdminReactivationOverview] silent error', e); }
        finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchOverview(true);
        const id = setInterval(() => fetchOverview(true), 60000);  // 60s auto-refresh
        return () => clearInterval(id);
    }, [fetchOverview]);

    const groupOrder = useMemo(() => {
        if (!data?.funnel?.by_group) return [];
        const order = ['recuperar', 'espanoles', 'latinos'];
        return order.filter(g => data.funnel.by_group[g]);
    }, [data]);

    if (loading) {
        return (
            <Layout>
                <div className="max-w-7xl mx-auto py-12 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                </div>
            </Layout>
        );
    }

    if (!data) return <Layout><div className="text-center py-12 text-slate-500">Sin datos.</div></Layout>;

    const { kpi, funnel, heatmap, campaigns } = data;
    const overallConversion = kpi.reactivation_audience > 0
        ? (kpi.verified_count / kpi.reactivation_audience) * 100 : 0;

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-5 pb-12" data-testid="admin-reactivation-page">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden">
                        <div className="h-0.5 bg-gradient-to-r from-cyan-500 via-violet-500 to-emerald-500" />
                        <div className="px-6 py-5 flex items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500 mb-2">
                                    <Activity className="w-3 h-3" />
                                    Panel administrativo · Reactivación global
                                </div>
                                <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                                    Overview de campañas de reactivación
                                </h1>
                                <p className="text-slate-400 mt-1.5 max-w-2xl text-[13px] leading-relaxed">
                                    Funnel agregado de las campañas Recuperar · Españoles · Latinos. Identifica el horario óptimo de envío y la tasa de conversión por grupo en tiempo real.
                                </p>
                            </div>
                            <Button
                                onClick={() => fetchOverview(false)}
                                disabled={refreshing}
                                variant="outline"
                                className="border-slate-700 hover:bg-slate-800 text-slate-300 text-xs h-9 px-3 flex-shrink-0"
                                data-testid="reactivation-refresh-btn"
                            >
                                {refreshing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                                Refrescar
                            </Button>
                        </div>
                        {/* KPI strip */}
                        <div className="grid grid-cols-2 md:grid-cols-5 border-t border-slate-800/80 divide-x divide-slate-800/80">
                            <Kpi label="Audiencia" value={fmtNum(kpi.reactivation_audience)} accent="text-cyan-300" testid="kpi-audience" />
                            <Kpi label="Emails enviados" value={fmtNum(kpi.total_emails_dispatched)} accent="text-sky-300" testid="kpi-sent" />
                            <Kpi label="Aperturas" value={fmtNum(kpi.opened_count)} accent="text-violet-300" testid="kpi-opened" />
                            <Kpi label="Inicios sesión" value={fmtNum(kpi.logged_in_count)} accent="text-amber-300" testid="kpi-logins" />
                            <Kpi label="Conversión KYC" value={fmtPct(overallConversion)} accent={overallConversion > 0 ? 'text-emerald-300' : 'text-slate-500'} testid="kpi-conversion" />
                        </div>
                    </div>
                </motion.div>

                {/* Aggregated funnel + Hourly heatmap */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 rounded-lg border border-slate-800 bg-slate-900/40">
                        <div className="px-5 py-4 border-b border-slate-800/80">
                            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-1">Funnel agregado</p>
                            <h3 className="text-white text-sm font-semibold">Conversión global · {fmtNum(funnel.total)} contactos</h3>
                        </div>
                        <div className="p-5 space-y-3" data-testid="aggregate-funnel">
                            {funnel.stages.map((s, i) => <FunnelBar key={s.key} stage={s} idx={i} total={funnel.total} />)}
                        </div>
                    </div>
                    <HourlyHeatmap
                        buckets={heatmap.buckets}
                        peakHour={heatmap.peak_hour_utc}
                        peakCount={heatmap.peak_count}
                    />
                </div>

                {/* By-group funnels */}
                {groupOrder.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Globe className="w-3.5 h-3.5 text-slate-500" />
                            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-medium">Desglose por grupo</p>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="group-funnels-grid">
                            {groupOrder.map(g => (
                                <GroupFunnel key={g} groupKey={g} info={funnel.by_group[g]} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Campaigns history */}
                <div className="rounded-lg border border-slate-800 bg-slate-900/40">
                    <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-1">Historial</p>
                            <h3 className="text-white text-sm font-semibold">Últimas campañas ({campaigns.length})</h3>
                        </div>
                        <Sparkles className="w-3.5 h-3.5 text-slate-600" />
                    </div>
                    {campaigns.length === 0 ? (
                        <div className="p-12 text-center text-slate-500 text-sm">Sin campañas registradas.</div>
                    ) : (
                        <div className="divide-y divide-slate-800/60" data-testid="campaigns-history">
                            {campaigns.map(c => {
                                const groupMeta = GROUP_META[c.group] || { label: c.group || '—', flag: '🌐', cls: 'border-slate-700 text-slate-400' };
                                return (
                                    <div key={c.id} className="px-5 py-3 flex items-center gap-3 text-sm hover:bg-slate-800/30 transition-colors">
                                        <Send className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-slate-100 text-[13px] font-medium truncate">{c.subject}</p>
                                            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                                                <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide border bg-slate-900 border-slate-700 text-slate-400">{c.segment}</span>
                                                {c.group && (
                                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide border ${groupMeta.cls}`}>
                                                        <span className="text-[10px] leading-none">{groupMeta.flag}</span>
                                                        {groupMeta.label}
                                                    </span>
                                                )}
                                                <span className="font-mono tabular-nums text-slate-600 inline-flex items-center gap-1">
                                                    <Clock className="w-2.5 h-2.5" />
                                                    {new Date(c.triggered_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="text-[13px] font-semibold text-emerald-300 font-mono tabular-nums">{fmtNum(c.emails_sent)}</p>
                                            <p className="text-[9px] uppercase tracking-widest text-emerald-400/70">enviados</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
};

export default AdminReactivationOverviewPage;
