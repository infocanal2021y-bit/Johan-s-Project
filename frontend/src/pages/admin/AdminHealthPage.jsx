import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import api from '../../lib/api';
import { safeApiCall } from '../../lib/diagnostics';
import { toast } from 'sonner';
import {
    Activity, Database, Mail, Clock, Bot, CheckCircle2, AlertTriangle,
    XCircle, RefreshCw, ArrowLeft, Zap, HeartPulse, Send, AlertOctagon,
} from 'lucide-react';

const STATUS_TONE = {
    healthy:   { label: 'OPERATIVO',      bg: 'bg-emerald-500/15', text: 'text-emerald-300', ring: 'ring-emerald-500/40', Icon: CheckCircle2 },
    up:        { label: 'CONECTADO',      bg: 'bg-emerald-500/15', text: 'text-emerald-300', ring: 'ring-emerald-500/40', Icon: CheckCircle2 },
    running:   { label: 'EN EJECUCIÓN',   bg: 'bg-emerald-500/15', text: 'text-emerald-300', ring: 'ring-emerald-500/40', Icon: CheckCircle2 },
    configured:{ label: 'CONFIGURADO',    bg: 'bg-cyan-500/15',    text: 'text-cyan-300',    ring: 'ring-cyan-500/40',    Icon: CheckCircle2 },
    degraded:  { label: 'DEGRADADO',      bg: 'bg-amber-500/15',   text: 'text-amber-300',   ring: 'ring-amber-500/40',   Icon: AlertTriangle },
    stopped:   { label: 'DETENIDO',       bg: 'bg-rose-500/15',    text: 'text-rose-300',    ring: 'ring-rose-500/40',    Icon: XCircle },
    disabled:  { label: 'DESACTIVADO',    bg: 'bg-slate-700/40',   text: 'text-slate-300',   ring: 'ring-slate-600/40',   Icon: XCircle },
    skipped:   { label: 'OMITIDO',        bg: 'bg-slate-700/40',   text: 'text-slate-300',   ring: 'ring-slate-600/40',   Icon: AlertTriangle },
    down:      { label: 'CAÍDO',          bg: 'bg-rose-500/15',    text: 'text-rose-300',    ring: 'ring-rose-500/40',    Icon: XCircle },
    failed:    { label: 'FALLIDO',        bg: 'bg-rose-500/15',    text: 'text-rose-300',    ring: 'ring-rose-500/40',    Icon: XCircle },
    sent:      { label: 'ENVIADO',        bg: 'bg-emerald-500/15', text: 'text-emerald-300', ring: 'ring-emerald-500/40', Icon: CheckCircle2 },
    unknown:   { label: 'DESCONOCIDO',    bg: 'bg-slate-700/40',   text: 'text-slate-300',   ring: 'ring-slate-600/40',   Icon: AlertTriangle },
};

const StatusBadge = ({ status }) => {
    const tone = STATUS_TONE[status] || STATUS_TONE.unknown;
    const { Icon } = tone;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}>
            <Icon className="w-3 h-3" />
            {tone.label}
        </span>
    );
};

const MetricPill = ({ label, value, tone = 'slate' }) => {
    const palette = {
        emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
        rose:    'bg-rose-500/10 text-rose-300 border-rose-500/25',
        amber:   'bg-amber-500/10 text-amber-300 border-amber-500/25',
        slate:   'bg-slate-800/60 text-slate-300 border-slate-700',
    }[tone];
    return (
        <div className={`flex-1 min-w-0 px-3 py-2 rounded-lg border ${palette}`}>
            <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
            <p className="text-lg font-mono font-bold tabular-nums mt-0.5">{value}</p>
        </div>
    );
};

const fmtLocalTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
const fmtRelative = (iso) => {
    if (!iso) return '—';
    const diff = new Date(iso).getTime() - Date.now();
    const abs = Math.abs(diff);
    const mins = Math.round(abs / 60000);
    if (mins < 1) return diff >= 0 ? 'en <1 min' : 'hace <1 min';
    if (mins < 60) return diff >= 0 ? `en ${mins} min` : `hace ${mins} min`;
    const hours = Math.round(mins / 60);
    return diff >= 0 ? `en ${hours} h` : `hace ${hours} h`;
};

export const AdminHealthPage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchHealth = async () => {
        try {
            setRefreshing(true);
            const res = await api.get('/admin/health');
            setData(res.data);
        } catch (e) { console.error('[AdminHealth] silent error', e); }
        finally { setLoading(false); setRefreshing(false); }
    };

    useEffect(() => {
        fetchHealth();
        const id = setInterval(fetchHealth, 10000);
        return () => clearInterval(id);
    }, []);

    if (loading && !data) {
        return (
            <Layout>
                <div className="max-w-6xl mx-auto p-4 sm:p-6">
                    <p className="text-slate-500 text-sm">Cargando diagnóstico...</p>
                </div>
            </Layout>
        );
    }

    const overall = data?.overall || 'unknown';
    const mongo = data?.mongo || {};
    const resend = data?.resend || {};
    const scheduler = data?.scheduler || {};
    const bot = data?.trading_bot || {};

    return (
        <Layout>
            <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-6xl mx-auto space-y-5 p-3 sm:p-5"
                data-testid="admin-health-page"
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3">
                        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-[#14549C] to-[#0b3f75] ring-1 ring-white/10 flex items-center justify-center shadow-lg shadow-[#14549C]/30">
                            <HeartPulse className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-[#4a9eff] font-bold">
                                LIONSBIT · Monitoreo
                            </p>
                            <h1 className="text-xl sm:text-2xl font-bold text-white mt-0.5" style={{ letterSpacing: '-0.01em' }}>
                                Salud de integraciones
                            </h1>
                            <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
                                Estado en tiempo real de los servicios críticos de la plataforma.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <StatusBadge status={overall} />
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={fetchHealth}
                            disabled={refreshing}
                            className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs h-9"
                            data-testid="health-refresh-btn"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                            Refrescar
                        </Button>
                        <Link to="/admin">
                            <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white text-xs h-9">
                                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Panel
                            </Button>
                        </Link>
                    </div>
                </div>

                <p className="text-slate-500 text-[11px]">
                    Última comprobación: <span className="text-slate-300 font-mono">{fmtLocalTime(data?.checked_at)}</span>
                    <span className="ml-2">· Se actualiza automáticamente cada 10 s.</span>
                </p>

                {/* Telegram alerts status */}
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/40">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ring-1 ${
                        data?.telegram?.configured
                            ? 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30'
                            : 'bg-slate-700/40 text-slate-400 ring-slate-600/40'
                    }`}>
                        <Send className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white text-sm font-semibold">Alertas Telegram</p>
                            {data?.telegram?.configured ? (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-bold tracking-wider ring-1 ring-emerald-500/30">
                                    ACTIVAS · nivel: {data?.telegram?.alert_level || 'down'}
                                </span>
                            ) : (
                                <span className="px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-300 text-[10px] font-bold tracking-wider ring-1 ring-slate-600/40">
                                    SIN CONFIGURAR
                                </span>
                            )}
                        </div>
                        <p className="text-slate-400 text-[11px] leading-relaxed mt-1">
                            {data?.telegram?.configured
                                ? 'Recibirás un mensaje automático si la plataforma se degrada o cae durante +60 s. También al recuperarse.'
                                : 'Añade TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en backend/.env y reinicia backend para activar alertas automáticas.'}
                        </p>
                    </div>
                </div>

                {/* ── Grid: Mongo · Resend · Scheduler · Bot ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* MongoDB */}
                    <Card className="bg-slate-900/70 border-slate-800/80 p-5" data-testid="health-mongo">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg bg-[#14549C]/15 ring-1 ring-[#14549C]/30 flex items-center justify-center">
                                    <Database className="w-4 h-4 text-[#4a9eff]" />
                                </div>
                                <h2 className="text-white font-semibold">MongoDB</h2>
                            </div>
                            <StatusBadge status={mongo.status || 'unknown'} />
                        </div>
                        <div className="flex gap-2 mb-3">
                            <MetricPill
                                label="Latencia"
                                value={mongo.latency_ms != null ? `${mongo.latency_ms} ms` : '—'}
                                tone={mongo.latency_ms != null && mongo.latency_ms < 50 ? 'emerald' : mongo.latency_ms < 200 ? 'amber' : 'rose'}
                            />
                            <MetricPill
                                label="Usuarios"
                                value={mongo.collections?.users ?? '—'}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                            {Object.entries(mongo.collections || {}).map(([coll, count]) => (
                                <div key={coll} className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-slate-950/40 border border-slate-800/70">
                                    <span className="text-slate-500 font-mono truncate">{coll}</span>
                                    <span className="text-white tabular-nums">{count ?? '—'}</span>
                                </div>
                            ))}
                        </div>
                        {mongo.error && (
                            <p className="text-rose-300 text-[11px] mt-2 font-mono">{mongo.error}</p>
                        )}
                    </Card>

                    {/* Resend */}
                    <Card className="bg-slate-900/70 border-slate-800/80 p-5" data-testid="health-resend">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg bg-rose-500/15 ring-1 ring-rose-500/30 flex items-center justify-center">
                                    <Mail className="w-4 h-4 text-rose-300" />
                                </div>
                                <h2 className="text-white font-semibold">Resend · Email</h2>
                            </div>
                            <StatusBadge status={resend.status || 'unknown'} />
                        </div>
                        <div className="flex gap-2 mb-3">
                            <MetricPill label="Enviados 24h" value={resend.stats_24h?.sent ?? 0} tone="emerald" />
                            <MetricPill label="Fallidos 24h" value={resend.stats_24h?.failed ?? 0} tone={resend.stats_24h?.failed > 0 ? 'rose' : 'slate'} />
                            <MetricPill label="Omitidos" value={resend.stats_24h?.skipped ?? 0} />
                        </div>
                        {resend.last_failure && (
                            <div className="mb-3 p-2.5 rounded-lg bg-rose-500/5 border border-rose-500/25">
                                <p className="text-[10px] uppercase tracking-wider text-rose-300 font-semibold">Último fallo</p>
                                <p className="text-white text-[12px] mt-1 truncate font-mono">{resend.last_failure.subject}</p>
                                <p className="text-rose-300/80 text-[10px] mt-0.5 font-mono line-clamp-2">{resend.last_failure.error}</p>
                                <p className="text-slate-600 text-[10px] mt-1">{fmtLocalTime(resend.last_failure.created_at)} · {resend.last_failure.to_email}</p>
                            </div>
                        )}
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Últimos 20 envíos</p>
                            <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                                {(resend.recent || []).length === 0 && (
                                    <p className="text-slate-600 text-[11px] py-4 text-center">Sin envíos recientes</p>
                                )}
                                {(resend.recent || []).map((log) => (
                                    <div key={log.id} className="flex items-center gap-2 text-[11px] py-1.5 border-b border-slate-800/50 last:border-b-0">
                                        <StatusBadge status={log.status} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-slate-200 truncate">{log.subject || '—'}</p>
                                            <p className="text-slate-600 text-[10px] font-mono truncate">{log.to_email}</p>
                                        </div>
                                        <span className="text-slate-600 text-[10px] font-mono flex-shrink-0">{fmtLocalTime(log.created_at)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>

                    {/* Scheduler */}
                    <Card className="bg-slate-900/70 border-slate-800/80 p-5" data-testid="health-scheduler">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg bg-amber-500/15 ring-1 ring-amber-500/30 flex items-center justify-center">
                                    <Clock className="w-4 h-4 text-amber-300" />
                                </div>
                                <h2 className="text-white font-semibold">Scheduler · Tareas</h2>
                            </div>
                            <StatusBadge status={scheduler.status || 'unknown'} />
                        </div>
                        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                            {(scheduler.jobs || []).length === 0 && (
                                <p className="text-slate-600 text-[11px] py-4 text-center">Sin tareas programadas</p>
                            )}
                            {(scheduler.jobs || []).map((j) => (
                                <div key={j.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-950/40 border border-slate-800/70">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-white text-[12px] truncate" title={j.name}>{j.name}</p>
                                        <p className="text-slate-600 text-[10px] font-mono truncate">{j.trigger}</p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-emerald-300 text-[11px] font-mono tabular-nums">{fmtLocalTime(j.next_run_at)}</p>
                                        <p className="text-slate-600 text-[10px]">{fmtRelative(j.next_run_at)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* Trading Bot */}
                    <Card className="bg-slate-900/70 border-slate-800/80 p-5" data-testid="health-bot">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg bg-cyan-500/15 ring-1 ring-cyan-500/30 flex items-center justify-center">
                                    <Bot className="w-4 h-4 text-cyan-300" />
                                </div>
                                <h2 className="text-white font-semibold">Trading Bot</h2>
                            </div>
                            <StatusBadge status={bot.error ? 'degraded' : 'healthy'} />
                        </div>
                        <div className="flex gap-2">
                            <MetricPill label="Usuarios con bot" value={bot.users_with_bot ?? 0} />
                            <MetricPill label="Bots activos" value={bot.active_bots ?? 0} tone={bot.active_bots > 0 ? 'emerald' : 'slate'} />
                        </div>
                        <p className="text-slate-500 text-[11px] mt-3 leading-relaxed">
                            El scheduler ejecuta el análisis cada 60 s sobre los bots activos. Revisa las tareas de <span className="text-amber-300">trading_bot_tick</span> arriba para confirmar ejecución.
                        </p>
                        {bot.error && <p className="text-rose-300 text-[11px] mt-2 font-mono">{bot.error}</p>}
                    </Card>
                </div>

                {/* Quick tip */}
                <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
                    <div className="w-8 h-8 rounded-md bg-amber-500/15 ring-1 ring-amber-500/30 flex items-center justify-center flex-shrink-0">
                        <Zap className="w-4 h-4 text-amber-300" />
                    </div>
                    <div className="text-[12px] text-slate-400 leading-relaxed">
                        <p className="text-white font-semibold text-sm mb-0.5 flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5 text-[#4a9eff]" /> ¿Por qué este panel?
                        </p>
                        Detecta fallos silenciosos antes de que lleguen al usuario. Si ves "DEGRADADO" en Resend o "DETENIDO" en el scheduler, revisa <span className="text-slate-200 font-mono">/var/log/supervisor/backend.err.log</span>.
                    </div>
                </div>
            </motion.div>

            {/* Maintenance mode toggle */}
            <MaintenanceCard />
        </Layout>
    );
};

const MaintenanceCard = () => {
    const [data, setData] = useState({ enabled: false, message: '', estimated_end: '' });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const refresh = async () => {
        setLoading(true);
        const r = await safeApiCall({ url: '/api/admin/maintenance', method: 'GET', timeoutMs: 6000 });
        setLoading(false);
        if (r.ok) {
            setData({
                enabled: !!r.data.enabled,
                message: r.data.message || '',
                estimated_end: r.data.estimated_end || '',
            });
        }
    };

    useEffect(() => { refresh(); }, []);

    const save = async (enabled) => {
        setSaving(true);
        const r = await safeApiCall({
            url: '/api/admin/maintenance',
            method: 'POST',
            body: {
                enabled,
                message: data.message,
                estimated_end: data.estimated_end || null,
            },
            timeoutMs: 8000,
        });
        setSaving(false);
        if (r.ok) {
            setData({ ...data, enabled });
            toast.success(enabled ? 'Modo mantenimiento ACTIVADO' : 'Modo mantenimiento desactivado');
        } else {
            toast.error(r.message);
        }
    };

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="max-w-7xl mx-auto px-4 sm:px-6 mt-6">
            <div className={`rounded-2xl border p-5 backdrop-blur-md transition-colors ${
                data.enabled
                    ? 'bg-amber-500/10 border-amber-500/40'
                    : 'bg-slate-900/70 border-slate-800'
            }`} data-testid="maintenance-card">
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            data.enabled ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                        }`}>
                            <AlertOctagon className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-sm">Modo Mantenimiento</h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Muestra un banner global a todos los usuarios e indica que la plataforma está en mantenimiento.
                            </p>
                        </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider ${
                        data.enabled
                            ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40 animate-pulse'
                            : 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40'
                    }`}>
                        {data.enabled ? 'ACTIVO' : 'DESACTIVADO'}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                    <div>
                        <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">
                            Mensaje al usuario
                        </label>
                        <Input
                            value={data.message}
                            onChange={(e) => setData({ ...data, message: e.target.value })}
                            placeholder="Mantenimiento programado en curso"
                            className="bg-slate-950 border-slate-800 text-white text-sm"
                            data-testid="maintenance-message-input"
                            disabled={loading}
                        />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">
                            Hora estimada de finalización (opcional)
                        </label>
                        <Input
                            value={data.estimated_end}
                            onChange={(e) => setData({ ...data, estimated_end: e.target.value })}
                            placeholder="Hoy 22:00 UTC"
                            className="bg-slate-950 border-slate-800 text-white text-sm"
                            data-testid="maintenance-end-input"
                            disabled={loading}
                        />
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-4">
                    {!data.enabled ? (
                        <Button
                            onClick={() => save(true)}
                            disabled={saving}
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                            data-testid="maintenance-enable-btn"
                        >
                            {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <AlertOctagon className="w-4 h-4 mr-2" />}
                            Activar Mantenimiento
                        </Button>
                    ) : (
                        <Button
                            onClick={() => save(false)}
                            disabled={saving}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            data-testid="maintenance-disable-btn"
                        >
                            {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                            Desactivar Mantenimiento
                        </Button>
                    )}
                    <Button
                        onClick={refresh}
                        variant="outline"
                        disabled={loading}
                        className="border-slate-700 hover:bg-slate-800 text-xs"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                        Refrescar
                    </Button>
                </div>
            </div>
        </motion.div>
    );
};

export default AdminHealthPage;
