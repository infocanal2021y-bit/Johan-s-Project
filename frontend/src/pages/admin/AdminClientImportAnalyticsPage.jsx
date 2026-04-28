import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import api from '../../lib/api';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
    TrendingUp, RefreshCw, Mail, UserCheck, Shield, ShieldCheck, ArrowRight,
    Send, Loader2, AlertTriangle, Sparkles, Users, Target, ChevronRight, X,
} from 'lucide-react';

const GROUPS = [
    { id: 'recuperar', label: 'Recuperar', color: '#22d3ee' },
    { id: 'espanoles', label: 'Españoles', color: '#0ea5e9' },
    { id: 'latinos',   label: 'Latinos',   color: '#f0b90b' },
    { id: 'bfx',       label: 'BFX',       color: '#a855f7' },
    { id: 'pa',        label: 'P&A',       color: '#ec4899' },
];
const GROUP_LABEL = Object.fromEntries(GROUPS.map(g => [g.id, g.label]));
const GROUP_COLOR = Object.fromEntries(GROUPS.map(g => [g.id, g.color]));

const STAGE_ICON = {
    emailed:            Mail,
    opened:             Mail,
    logged_in:          UserCheck,
    password_changed:   Shield,
    kyc_completed:      ShieldCheck,
    withdraw_requested: ArrowRight,
};
const STAGE_COLOR = {
    emailed:            '#94a3b8',
    opened:             '#a855f7',
    logged_in:          '#0ecb81',
    password_changed:   '#22d3ee',
    kyc_completed:      '#f0b90b',
    withdraw_requested: '#ec4899',
};

const SEGMENTS = [
    { id: 'not_opened',      label: 'No abrieron el correo',         Icon: Mail,     color: '#f6465d', hint: 'Primera ola: recuérdales que su cuenta está lista' },
    { id: 'opened_no_login', label: 'Abrieron pero no iniciaron sesión', Icon: UserCheck, color: '#f0b90b', hint: 'Ya vieron el correo — solo faltan 30s para entrar' },
    { id: 'no_kyc',          label: 'Iniciaron sesión sin completar KYC', Icon: ShieldCheck, color: '#22d3ee', hint: 'Desbloquea retiros con verificación' },
];


export const AdminClientImportAnalyticsPage = () => {
    const [funnel, setFunnel] = useState(null);
    const [loading, setLoading] = useState(true);
    const [groupFilter, setGroupFilter] = useState('all');
    const [jobs, setJobs] = useState([]);
    const [jobFilter, setJobFilter] = useState('all');
    const [campaigns, setCampaigns] = useState([]);

    const [campaignOpen, setCampaignOpen] = useState(null); // segment id
    const [campaignPreview, setCampaignPreview] = useState(null);
    const [campaignSubject, setCampaignSubject] = useState('');
    const [campaignIntro, setCampaignIntro] = useState('');
    const [campaignBusy, setCampaignBusy] = useState(false);

    const loadAll = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (groupFilter !== 'all') params.group = groupFilter;
            if (jobFilter !== 'all') params.job_id = jobFilter;
            const [fResp, jResp, cResp] = await Promise.all([
                api.get('/admin/client-import/funnel', { params }),
                api.get('/admin/client-import/jobs'),
                api.get('/admin/client-import/campaigns'),
            ]);
            setFunnel(fResp.data);
            setJobs((jResp.data.items || []).filter(j => j.status === 'executed'));
            setCampaigns(cResp.data.items || []);
        } catch (e) {
            toast.error('Error al cargar analytics');
        } finally { setLoading(false); }
    }, [groupFilter, jobFilter]);

    useEffect(() => { loadAll(); }, [loadAll]);
    useEffect(() => {
        const t = setInterval(loadAll, 30000);
        return () => clearInterval(t);
    }, [loadAll]);

    const openCampaign = async (segmentId) => {
        setCampaignOpen(segmentId);
        setCampaignPreview(null);
        try {
            const params = { segment: segmentId };
            if (groupFilter !== 'all') params.group = groupFilter;
            if (jobFilter !== 'all') params.job_id = jobFilter;
            const r = await api.get('/admin/client-import/segment-preview', { params });
            setCampaignPreview(r.data);
            setCampaignSubject(r.data.suggested_subject || '');
            setCampaignIntro('');
        } catch (e) {
            toast.error('No se pudo calcular el segmento');
            setCampaignOpen(null);
        }
    };

    const sendCampaign = async () => {
        if (!campaignPreview || campaignPreview.count === 0) {
            toast.error('No hay destinatarios para enviar');
            return;
        }
        if (!window.confirm(`¿Enviar correo a ${campaignPreview.count} destinatarios del segmento "${campaignPreview.label}"? Esta acción no se puede deshacer.`)) return;
        setCampaignBusy(true);
        try {
            const body = {
                segment: campaignOpen,
                subject: campaignSubject || undefined,
                intro:   campaignIntro || undefined,
            };
            if (groupFilter !== 'all') body.group = groupFilter;
            if (jobFilter !== 'all') body.job_id = jobFilter;
            const r = await api.post('/admin/client-import/resend-campaign', body);
            toast.success(`Campaña enviada · ${r.data.sent} correos despachados`);
            setCampaignOpen(null);
            await loadAll();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al enviar la campaña');
        } finally { setCampaignBusy(false); }
    };

    return (
        <Layout>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto p-3 sm:p-5 space-y-5" data-testid="admin-client-import-analytics-page">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/25 to-cyan-700/15 ring-1 ring-cyan-500/40 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                            <TrendingUp className="w-5 h-5 text-cyan-200" strokeWidth={2.4} />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300 font-bold">
                                <Sparkles className="w-3 h-3 inline mr-1 -mt-0.5" /> Analytics · Post-importación
                            </p>
                            <h1 className="text-2xl sm:text-3xl text-white font-bold" style={{ letterSpacing: '-0.02em' }}>
                                Funnel de conversión
                            </h1>
                            <p className="text-slate-400 text-[12px] sm:text-sm mt-1 max-w-2xl">
                                Conversión en tiempo real desde el correo enviado hasta el retiro solicitado. Identifica drop-offs y reenvía campañas segmentadas.
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={loadAll} className="border-slate-700 text-slate-300 hover:bg-slate-800 h-9" data-testid="analytics-refresh">
                        <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refrescar
                    </Button>
                </div>

                {/* Filters */}
                <Card className="p-4 bg-slate-900/60 border-slate-800/80">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Job:</span>
                        <button type="button" data-no-hover onClick={() => setJobFilter('all')} data-testid="filter-job-all"
                            className={`px-2.5 py-1 rounded text-[11px] font-bold ring-1 ${jobFilter === 'all' ? 'bg-cyan-500/20 text-cyan-200 ring-cyan-500/40' : 'bg-slate-950 text-slate-400 ring-slate-800'}`}
                        >Todos</button>
                        {jobs.map(j => (
                            <button key={j.id} type="button" data-no-hover onClick={() => setJobFilter(j.id)} data-testid={`filter-job-${j.id}`}
                                className={`px-2.5 py-1 rounded text-[11px] font-bold ring-1 max-w-[240px] truncate ${jobFilter === j.id ? 'bg-cyan-500/20 text-cyan-200 ring-cyan-500/40' : 'bg-slate-950 text-slate-400 ring-slate-800'}`}
                                title={j.filename}
                            >
                                {j.filename?.slice(0, 28) || 'Sin nombre'}
                            </button>
                        ))}
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold ml-4">Grupo:</span>
                        <button type="button" data-no-hover onClick={() => setGroupFilter('all')} data-testid="filter-group-all"
                            className={`px-2.5 py-1 rounded text-[11px] font-bold ring-1 ${groupFilter === 'all' ? 'bg-cyan-500/20 text-cyan-200 ring-cyan-500/40' : 'bg-slate-950 text-slate-400 ring-slate-800'}`}
                        >Todos</button>
                        {GROUPS.map(g => (
                            <button key={g.id} type="button" data-no-hover onClick={() => setGroupFilter(g.id)} data-testid={`filter-group-${g.id}`}
                                className="px-2.5 py-1 rounded text-[11px] font-bold ring-1"
                                style={groupFilter === g.id
                                    ? { backgroundColor: g.color + '22', color: g.color, borderColor: g.color }
                                    : { backgroundColor: 'rgba(2,6,23,0.6)', color: '#94a3b8', borderColor: 'rgba(51,65,85,0.8)' }}
                            >{g.label}</button>
                        ))}
                    </div>
                </Card>

                {/* Global funnel */}
                {loading && !funnel ? (
                    <Card className="p-8 bg-slate-900/60 border-slate-800/80 text-center">
                        <Loader2 className="w-6 h-6 text-slate-500 animate-spin mx-auto" />
                        <p className="text-slate-500 text-[12px] mt-2">Calculando funnel…</p>
                    </Card>
                ) : funnel && funnel.total === 0 ? (
                    <Card className="p-8 bg-slate-900/60 border-slate-800/80 text-center" data-testid="analytics-empty">
                        <Users className="w-8 h-8 text-slate-600 mx-auto" />
                        <p className="text-slate-400 text-sm font-semibold mt-2">Aún no hay clientes importados</p>
                        <p className="text-slate-500 text-[12px] mt-1">Ejecuta una importación desde <code className="text-cyan-300">/admin/client-import</code> para empezar a medir.</p>
                    </Card>
                ) : funnel && (
                    <>
                        <Card className="p-5 bg-gradient-to-br from-[#0a1628] via-slate-950/95 to-slate-950 border-slate-800/80" data-testid="analytics-funnel">
                            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-300 font-bold flex items-center gap-1.5">
                                        <Target className="w-3 h-3" /> Funnel global
                                    </p>
                                    <h2 className="text-white text-lg font-bold mt-0.5" style={{ letterSpacing: '-0.01em' }}>
                                        {funnel.total.toLocaleString('es-ES')} clientes importados
                                    </h2>
                                </div>
                                <p className="text-slate-600 text-[10.5px]">
                                    Última sincronización: {new Date(funnel.last_sync).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </p>
                            </div>

                            {/* Funnel bars */}
                            <div className="space-y-2.5" data-testid="analytics-funnel-bars">
                                {funnel.stages.map((s, i) => {
                                    const Icon = STAGE_ICON[s.key];
                                    const color = STAGE_COLOR[s.key];
                                    const width = Math.max(s.pct, 2); // min 2% so icon shows
                                    return (
                                        <div key={s.key} className="group" data-testid={`funnel-stage-${s.key}`}>
                                            <div className="flex items-center justify-between gap-3 mb-1 text-[11px]">
                                                <span className="inline-flex items-center gap-1.5 text-slate-300 font-semibold">
                                                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                                                    {s.label}
                                                </span>
                                                <span className="font-mono tabular-nums text-[11px] flex items-center gap-2">
                                                    <span className="text-white font-bold">{s.count.toLocaleString('es-ES')}</span>
                                                    <span className="text-slate-500">·</span>
                                                    <span style={{ color }} className="font-bold">{s.pct.toFixed(1)}%</span>
                                                    {i > 0 && s.drop_off_pct > 0 && (
                                                        <span className="text-rose-400/80 text-[10px]">↓ {s.drop_off_pct.toFixed(1)}%</span>
                                                    )}
                                                </span>
                                            </div>
                                            <div className="relative h-8 rounded-lg bg-slate-950/70 ring-1 ring-slate-800/60 overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${width}%` }}
                                                    transition={{ duration: 0.7, delay: i * 0.08, ease: 'easeOut' }}
                                                    className="absolute inset-y-0 left-0 rounded-lg shadow-[0_0_18px_-4px_currentColor]"
                                                    style={{
                                                        background: `linear-gradient(90deg, ${color}40, ${color})`,
                                                        color,
                                                    }}
                                                />
                                                {/* Ambient glow line */}
                                                <div aria-hidden="true" className="absolute inset-0 pointer-events-none"
                                                    style={{ background: `linear-gradient(90deg, transparent, ${color}18, transparent)` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>

                        {/* Segmented resend CTAs */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-1 h-5 rounded-full bg-emerald-500" />
                                <h2 className="text-[13px] font-semibold text-slate-200 tracking-wide uppercase">Campañas de reenvío segmentado</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="analytics-segments">
                                {SEGMENTS.map(seg => (
                                    <Card key={seg.id} className="p-4 bg-gradient-to-br from-slate-900/90 to-slate-950 border-slate-800/80 relative overflow-hidden group cursor-pointer hover:border-slate-700 transition-all"
                                        onClick={() => openCampaign(seg.id)}
                                        data-testid={`segment-card-${seg.id}`}
                                    >
                                        <div aria-hidden="true" className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20 blur-2xl"
                                            style={{ background: `radial-gradient(circle, ${seg.color}80, transparent 70%)` }} />
                                        <div className="relative">
                                            <div className="w-10 h-10 rounded-lg flex items-center justify-center ring-1 mb-3"
                                                style={{ backgroundColor: seg.color + '22', color: seg.color, borderColor: seg.color + '55' }}>
                                                <seg.Icon className="w-4 h-4" />
                                            </div>
                                            <p className="text-white text-[13px] font-bold leading-tight">{seg.label}</p>
                                            <p className="text-slate-500 text-[10.5px] mt-1 leading-relaxed">{seg.hint}</p>
                                            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: seg.color }}>
                                                <Send className="w-3 h-3" /> Preparar campaña
                                                <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </div>

                        {/* Breakdown by group */}
                        {Object.keys(funnel.by_group || {}).length > 0 && (
                            <Card className="bg-slate-900/60 border-slate-800/80 overflow-hidden" data-testid="analytics-by-group">
                                <div className="px-4 py-3 border-b border-slate-800/80">
                                    <p className="text-white text-sm font-bold">Desglose por grupo</p>
                                    <p className="text-slate-500 text-[11px]">Conversión por cada stage — identifica dónde se pierden los usuarios de cada segmento</p>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[12px]">
                                        <thead className="bg-slate-950/60 border-b border-slate-800">
                                            <tr className="text-slate-500 text-left">
                                                <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px]">Grupo</th>
                                                <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px] text-right">Total</th>
                                                {funnel.stages.slice(1).map(s => (
                                                    <th key={s.key} className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px] text-right" style={{ color: STAGE_COLOR[s.key] }}>
                                                        {s.label}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(funnel.by_group).map(([gId, gd]) => {
                                                const gc = GROUP_COLOR[gId] || '#94a3b8';
                                                return (
                                                    <tr key={gId} className="border-b border-slate-800/40">
                                                        <td className="py-2.5 px-3">
                                                            <span className="inline-block px-2 py-0.5 rounded text-[10.5px] font-bold"
                                                                style={{ backgroundColor: gc + '22', color: gc }}>
                                                                {GROUP_LABEL[gId] || gId}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right text-white font-mono tabular-nums font-bold">
                                                            {gd.total.toLocaleString('es-ES')}
                                                        </td>
                                                        {gd.stages.slice(1).map(s => {
                                                            const color = STAGE_COLOR[s.key];
                                                            const intensity = Math.min(1, s.pct / 100);
                                                            return (
                                                                <td key={s.key} className="py-2.5 px-3 text-right">
                                                                    <div className="inline-flex flex-col items-end">
                                                                        <span className="font-mono tabular-nums font-bold text-[12.5px]" style={{ color }}>
                                                                            {s.pct.toFixed(0)}%
                                                                        </span>
                                                                        <span className="text-slate-500 text-[10px] font-mono">{s.count}</span>
                                                                        <div className="w-10 h-0.5 mt-0.5 rounded-full bg-slate-800 overflow-hidden">
                                                                            <div className="h-full" style={{ width: `${intensity * 100}%`, backgroundColor: color }} />
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        )}

                        {/* Campaigns history */}
                        <Card className="bg-slate-900/60 border-slate-800/80 overflow-hidden" data-testid="analytics-campaigns-history">
                            <div className="px-4 py-3 border-b border-slate-800/80">
                                <p className="text-white text-sm font-bold">Historial de campañas</p>
                                <p className="text-slate-500 text-[11px]">Últimos reenvíos segmentados despachados</p>
                            </div>
                            {campaigns.length === 0 ? (
                                <p className="text-slate-500 text-sm py-10 text-center">Aún no se han enviado campañas de reenvío.</p>
                            ) : (
                                <div className="divide-y divide-slate-800/60">
                                    {campaigns.slice(0, 20).map(c => {
                                        const seg = SEGMENTS.find(s => s.id === c.segment);
                                        const color = seg?.color || '#94a3b8';
                                        return (
                                            <div key={c.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                                                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                                    style={{ backgroundColor: color + '22', color }}>
                                                    <Send className="w-3.5 h-3.5" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-white text-[12.5px] font-semibold truncate">{c.subject}</p>
                                                    <p className="text-slate-500 text-[10.5px]">
                                                        {seg?.label || c.segment}{c.group ? ` · ${GROUP_LABEL[c.group] || c.group}` : ''} · {new Date(c.triggered_at).toLocaleString('es-ES')} · {c.triggered_by}
                                                    </p>
                                                </div>
                                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[10.5px]">{c.emails_sent} enviados</span>
                                                {c.targets_matched !== c.emails_sent && (
                                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-[10.5px]">{c.targets_matched - c.emails_sent} fallidos</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Card>
                    </>
                )}
            </motion.div>

            {/* Campaign launch modal */}
            <AnimatePresence>
                {campaignOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                        onClick={() => setCampaignOpen(null)}
                        data-testid="campaign-launch-modal"
                    >
                        <motion.div
                            initial={{ y: 20, scale: 0.96, opacity: 0 }}
                            animate={{ y: 0, scale: 1, opacity: 1 }}
                            exit={{ y: 20, scale: 0.96, opacity: 0 }}
                            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
                            className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 ring-1 ring-cyan-500/25 rounded-2xl shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-300 font-bold">Campaña de reenvío</p>
                                    <h3 className="text-white text-base font-bold">{SEGMENTS.find(s => s.id === campaignOpen)?.label}</h3>
                                </div>
                                <button type="button" onClick={() => setCampaignOpen(null)} data-no-hover className="w-8 h-8 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="px-5 py-5 space-y-3">
                                {!campaignPreview ? (
                                    <div className="py-8 text-center">
                                        <Loader2 className="w-6 h-6 text-slate-500 animate-spin mx-auto" />
                                        <p className="text-slate-500 text-[11px] mt-2">Calculando destinatarios…</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="rounded-lg bg-slate-950/60 ring-1 ring-cyan-500/20 p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold">Destinatarios</span>
                                                <span className="text-cyan-200 text-2xl font-mono tabular-nums font-bold" data-testid="campaign-target-count">
                                                    {campaignPreview.count.toLocaleString('es-ES')}
                                                </span>
                                            </div>
                                            {campaignPreview.sample?.length > 0 && (
                                                <div className="mt-2 pt-2 border-t border-slate-800/80">
                                                    <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold mb-1">Muestra</p>
                                                    <ul className="space-y-0.5">
                                                        {campaignPreview.sample.map((s, i) => (
                                                            <li key={i} className="text-slate-400 text-[10.5px] font-mono truncate">
                                                                {s.email}{s.import_group ? ` · ${GROUP_LABEL[s.import_group] || s.import_group}` : ''}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>

                                        <label className="block">
                                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Asunto</span>
                                            <input
                                                type="text"
                                                value={campaignSubject}
                                                onChange={(e) => setCampaignSubject(e.target.value.slice(0, 200))}
                                                data-testid="campaign-subject"
                                                className="w-full h-10 mt-1 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-[12.5px] focus:outline-none focus:border-cyan-500/50"
                                            />
                                        </label>

                                        <label className="block">
                                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Mensaje adicional (opcional)</span>
                                            <textarea
                                                rows={3}
                                                value={campaignIntro}
                                                onChange={(e) => setCampaignIntro(e.target.value.slice(0, 600))}
                                                placeholder="Añade un mensaje personalizado que se intercalará en la plantilla base"
                                                data-testid="campaign-intro"
                                                className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-[12px] focus:outline-none focus:border-cyan-500/50 resize-none"
                                            />
                                            <span className="text-[9.5px] text-slate-600 mt-0.5 block text-right">{campaignIntro.length}/600</span>
                                        </label>

                                        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/25 text-amber-200 text-[10.5px] leading-relaxed">
                                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                            <span>
                                                Se enviará <strong>un correo individual</strong> a cada uno de los {campaignPreview.count} destinatarios. Esta acción no se puede deshacer.
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2 pt-2">
                                            <Button variant="outline" onClick={() => setCampaignOpen(null)} className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800">
                                                Cancelar
                                            </Button>
                                            <Button
                                                onClick={sendCampaign}
                                                disabled={campaignBusy || campaignPreview.count === 0 || !campaignSubject.trim()}
                                                data-testid="campaign-send-btn"
                                                className="flex-1 bg-gradient-to-r from-cyan-600 to-cyan-500 text-white font-bold tracking-wider shadow-md"
                                            >
                                                {campaignBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                                                Enviar {campaignPreview.count > 0 ? `(${campaignPreview.count})` : ''}
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </Layout>
    );
};

export default AdminClientImportAnalyticsPage;
