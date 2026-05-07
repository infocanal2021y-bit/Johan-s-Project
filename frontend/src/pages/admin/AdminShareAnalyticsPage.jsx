import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
    Share2, RefreshCw, TrendingUp, Globe, Award,
    Loader2, Trophy, ShieldCheck, MessageCircle, Send,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const CHANNEL_META = {
    whatsapp: { label: 'WhatsApp', color: '#25D366', bg: 'rgba(37,211,102,0.12)' },
    twitter:  { label: 'X / Twitter', color: '#000000', bg: 'rgba(0,0,0,0.08)' },
    telegram: { label: 'Telegram', color: '#0088CC', bg: 'rgba(0,136,204,0.12)' },
    native:   { label: 'Compartir nativo', color: '#1E3A8A', bg: 'rgba(30,58,138,0.12)' },
    copy:     { label: 'Copiar enlace', color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
};

const fmtEUR = (n) => `€${(Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const AdminShareAnalyticsPage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const r = await fetch(`${API_URL}/api/admin/community/share-stats`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const j = await r.json();
            if (r.ok) setData(j);
            else toast.error(j.detail || 'Error al cargar analytics');
        } catch (e) {
            toast.error('Error de red');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const total = data?.total || 0;
    const channels = data?.by_channel || {};
    const topItems = data?.top_items || [];
    const topCountries = data?.top_countries || [];
    const series = data?.daily_14d || [];
    const maxDaily = Math.max(...series.map(s => s.count), 1);
    const channelMax = Math.max(...Object.values(channels), 1);

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-6" data-testid="admin-share-analytics-page">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl sm:text-3xl text-white font-bold tracking-tight flex items-center gap-2">
                            <Share2 className="w-7 h-7 text-emerald-400" />
                            Share Analytics
                        </h1>
                        <p className="text-slate-500 mt-1 text-sm">
                            Engagement de los botones "Compartir" del libro de retiros verificados
                        </p>
                    </div>
                    <Button onClick={fetchData} variant="outline" className="border-slate-700 hover:bg-slate-800">
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refrescar
                    </Button>
                </motion.div>

                {loading && !data ? (
                    <div className="py-24 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                    </div>
                ) : (
                    <>
                        {/* KPI Strip */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { icon: Share2, color: 'emerald', label: 'Total shares', value: total },
                                { icon: ShieldCheck, color: 'cyan', label: 'Capital recuperado', value: `${data?.capital_recovered_ratio_pct || 0}%` },
                                { icon: TrendingUp, color: 'amber', label: 'Monto promedio', value: fmtEUR(data?.avg_amount_eur || 0) },
                                { icon: Trophy, color: 'rose', label: 'Items únicos compartidos', value: topItems.length },
                            ].map((s, i) => (
                                <Card key={i} className="bg-slate-900/70 border-slate-800">
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-lg bg-${s.color}-500/20 flex items-center justify-center`}>
                                                <s.icon className={`w-5 h-5 text-${s.color}-400`} />
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500">{s.label}</p>
                                                <p className="text-xl text-white font-semibold tabular-nums">{s.value}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {/* By channel */}
                        <Card className="bg-slate-900/70 border-slate-800">
                            <CardHeader className="border-b border-slate-800 pb-3">
                                <CardTitle className="text-white flex items-center gap-2 text-base font-bold">
                                    <MessageCircle className="w-5 h-5 text-cyan-400" />
                                    Canales preferidos
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-3">
                                {Object.entries(channels).map(([ch, count]) => {
                                    const meta = CHANNEL_META[ch] || { label: ch, color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' };
                                    const pct = total ? Math.round((count / total) * 100) : 0;
                                    const widthPct = (count / channelMax) * 100;
                                    return (
                                        <div key={ch} className="space-y-1.5" data-testid={`channel-row-${ch}`}>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-slate-300 font-medium">{meta.label}</span>
                                                <span className="text-slate-400 font-mono tabular-nums">
                                                    <span className="text-white font-semibold">{count}</span>
                                                    <span className="text-slate-600 ml-2">{pct}%</span>
                                                </span>
                                            </div>
                                            <div className="h-2 rounded-full bg-slate-800/60 overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${widthPct}%` }}
                                                    transition={{ duration: 0.6 }}
                                                    className="h-full rounded-full"
                                                    style={{ background: meta.color }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                                {total === 0 && (
                                    <p className="text-center text-slate-500 text-sm py-6">
                                        Aún no hay shares registrados. Los datos se acumularán a medida que los usuarios compartan retiros.
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Top items */}
                            <Card className="bg-slate-900/70 border-slate-800">
                                <CardHeader className="border-b border-slate-800 pb-3">
                                    <CardTitle className="text-white flex items-center gap-2 text-base font-bold">
                                        <Trophy className="w-5 h-5 text-amber-400" />
                                        Retiros más compartidos
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 space-y-2">
                                    {topItems.length === 0 && (
                                        <p className="text-center text-slate-500 text-sm py-6">Sin datos aún</p>
                                    )}
                                    {topItems.map((it, i) => (
                                        <div key={it.item_id}
                                            className="flex items-center gap-3 p-3 rounded-lg bg-slate-950/50 border border-slate-800"
                                            data-testid={`top-item-${i}`}>
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                                i === 0 ? 'bg-amber-500/20 text-amber-400' :
                                                i === 1 ? 'bg-slate-400/20 text-slate-300' :
                                                i === 2 ? 'bg-orange-700/20 text-orange-500' :
                                                'bg-slate-800 text-slate-500'
                                            }`}>
                                                <span className="text-xs font-bold">#{i + 1}</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-sm font-semibold truncate">
                                                    {it.name_public || '—'}
                                                    {it.capital_recovered && (
                                                        <ShieldCheck className="w-3.5 h-3.5 inline ml-1.5 text-emerald-400" />
                                                    )}
                                                </p>
                                                <p className="text-[11px] text-slate-500 truncate">
                                                    {it.country} · {fmtEUR(it.amount_eur)}
                                                </p>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className="text-emerald-400 font-bold text-sm tabular-nums">{it.count}</p>
                                                <p className="text-[10px] text-slate-600 uppercase tracking-wider">shares</p>
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>

                            {/* Top countries */}
                            <Card className="bg-slate-900/70 border-slate-800">
                                <CardHeader className="border-b border-slate-800 pb-3">
                                    <CardTitle className="text-white flex items-center gap-2 text-base font-bold">
                                        <Globe className="w-5 h-5 text-cyan-400" />
                                        Top países por engagement
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 space-y-2">
                                    {topCountries.length === 0 && (
                                        <p className="text-center text-slate-500 text-sm py-6">Sin datos aún</p>
                                    )}
                                    {topCountries.map((c, i) => {
                                        const pct = total ? Math.round((c.count / total) * 100) : 0;
                                        return (
                                            <div key={c.country}
                                                className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-950/50 border border-slate-800"
                                                data-testid={`top-country-${i}`}>
                                                <span className="text-slate-300 text-sm flex-1 truncate">{c.country}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-cyan-400 font-bold tabular-nums">{c.count}</span>
                                                    <span className="text-[11px] text-slate-500 tabular-nums w-10 text-right">{pct}%</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </CardContent>
                            </Card>
                        </div>

                        {/* 14-day trend */}
                        <Card className="bg-slate-900/70 border-slate-800">
                            <CardHeader className="border-b border-slate-800 pb-3">
                                <CardTitle className="text-white flex items-center gap-2 text-base font-bold">
                                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                                    Tendencia · 14 días
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5">
                                <div className="flex items-end gap-1.5 h-32">
                                    {series.map((s) => {
                                        const h = Math.max(2, (s.count / maxDaily) * 100);
                                        return (
                                            <div key={s.date} className="flex-1 flex flex-col items-center gap-1 group">
                                                <div
                                                    className="w-full rounded-t bg-emerald-500/40 hover:bg-emerald-400 transition-colors min-h-[2px]"
                                                    style={{ height: `${h}%` }}
                                                    title={`${s.date}: ${s.count} shares`}
                                                />
                                                <span className="text-[9px] text-slate-600 font-mono">{s.date.slice(8, 10)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                {total === 0 && (
                                    <p className="text-center text-slate-500 text-sm mt-4">
                                        La tendencia se poblará automáticamente con los shares de los próximos días.
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        {data?.last_event_at && (
                            <p className="text-center text-[10px] text-slate-600 font-mono">
                                Último evento registrado: {new Date(data.last_event_at).toLocaleString('es-ES')}
                            </p>
                        )}
                    </>
                )}
            </div>
        </Layout>
    );
};

export default AdminShareAnalyticsPage;
