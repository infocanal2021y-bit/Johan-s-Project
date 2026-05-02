import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { Button } from '../../components/ui/button';
import {
    Mail, Send, RefreshCw, Loader2, CheckCircle2, XCircle,
    AlertTriangle, Activity, Clock, FlaskConical, Sparkles, Users, Eye
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const fmtNum = (n) => (n || 0).toLocaleString('es-ES');

const KPICard = ({ icon: Icon, label, value, accent, testid }) => (
    <div
        className="rounded-xl p-5 bg-white border-0 shadow-[0_1px_3px_rgba(7,33,70,0.04),_0_6px_20px_rgba(7,33,70,0.06)] relative overflow-hidden"
        data-testid={testid}
    >
        <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent }} />
        <div className="flex items-start justify-between mb-3">
            <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: `${accent}1a` }}
            >
                <Icon className="w-5 h-5" style={{ color: accent }} />
            </div>
        </div>
        <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[#5B5B5B] mb-1">{label}</p>
        <p className="text-2xl font-mono tabular-nums font-semibold text-[#072146]">{fmtNum(value)}</p>
    </div>
);

const CampaignRow = ({ c }) => {
    const isRunning = c.status === 'running';
    const isDone = c.status === 'completed';
    const total = c.total_to_process || 0;
    const processed = c.processed_count || 0;
    const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

    return (
        <div className="px-4 py-3 hover:bg-[#F4F6F8] transition-colors" data-testid={`email-campaign-${c.id}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    {isRunning ? (
                        <Loader2 className="w-4 h-4 text-[#1973B8] animate-spin flex-shrink-0" />
                    ) : isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : (
                        <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] tabular-nums text-[#072146] font-medium">
                                {c.id.slice(0, 8)}
                            </span>
                            {c.mode === 'retry_failed' && (
                                <span className="inline-flex px-1.5 py-0.5 text-[9px] font-medium rounded bg-amber-100 text-amber-800 uppercase tracking-wider">
                                    Reintento
                                </span>
                            )}
                            {c.dry_run && (
                                <span className="inline-flex px-1.5 py-0.5 text-[9px] font-medium rounded bg-slate-200 text-slate-600 uppercase tracking-wider">
                                    Dry run
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-[#8A95A5] mt-0.5">
                            {c.triggered_by} · {new Date(c.started_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                </div>
                <div className="text-right text-[11px] font-mono tabular-nums flex-shrink-0">
                    <p className="text-emerald-700 font-semibold">{c.sent_count}/{total}</p>
                    <p className="text-[#8A95A5]">
                        {c.failed_count > 0 && <span className="text-rose-500">·{c.failed_count} fallo</span>}
                        {c.invalid_count > 0 && <span className="text-amber-600 ml-1">·{c.invalid_count} inv</span>}
                    </p>
                </div>
            </div>
            {(isRunning || pct < 100) && total > 0 && (
                <div className="mt-2 h-1 rounded-full bg-slate-100 overflow-hidden">
                    <div
                        className="h-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: isDone ? '#10B981' : '#1973B8' }}
                    />
                </div>
            )}
        </div>
    );
};

export const AdminEmailCampaignPage = () => {
    const [data, setData] = useState({ counts: null, recent_campaigns: [] });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [sending, setSending] = useState(false);

    const fetchOverview = useCallback(async (silent = false) => {
        if (!silent) setRefreshing(true);
        try {
            const token = localStorage.getItem('token');
            const r = await fetch(`${API_URL}/api/admin/email-campaign/overview`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await r.json();
            setData(d);
        } catch (e) { /* silent */ }
        finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchOverview(true);
        const id = setInterval(() => fetchOverview(true), 5000);
        return () => clearInterval(id);
    }, [fetchOverview]);

    const trigger = async ({ onlyFailed = false, dryRun = false, max = 0 } = {}) => {
        const desc = dryRun
            ? `Validación dry-run (${max || 'todos'} usuarios)`
            : onlyFailed
                ? `Reenviar a ${data.counts?.failed_retryable || 0} fallidos`
                : `Enviar a ${data.counts?.pending || 0} pendientes`;
        if (!window.confirm(`¿${desc}? ${dryRun ? '(NO se envían correos reales)' : 'Esto enviará correos REALES vía Resend.'}`)) return;
        setSending(true);
        try {
            const token = localStorage.getItem('token');
            const params = new URLSearchParams({
                only_failed: onlyFailed ? 'true' : 'false',
                dry_run: dryRun ? 'true' : 'false',
            });
            if (max > 0) params.set('max_messages', String(max));
            const r = await fetch(`${API_URL}/api/admin/email-campaign/send?${params}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await r.json();
            if (r.ok) {
                toast.success(d.note || 'Campaña iniciada');
                setTimeout(() => fetchOverview(true), 1200);
            } else {
                toast.error(d.detail || 'Error al iniciar');
            }
        } catch (e) {
            toast.error('Error de red');
        } finally {
            setSending(false);
        }
    };

    if (loading) {
        return (
            <Layout>
                <div className="max-w-6xl mx-auto py-12 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-[#1973B8] animate-spin" />
                </div>
            </Layout>
        );
    }

    const counts = data.counts || {};

    return (
        <Layout>
            <div className="max-w-6xl mx-auto space-y-5 pb-12" data-testid="admin-email-campaign-page">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="rounded-xl bg-white shadow-[0_1px_3px_rgba(7,33,70,0.04),_0_6px_20px_rgba(7,33,70,0.06)] overflow-hidden">
                        <div className="h-0.5 bg-gradient-to-r from-[#004481] via-[#1973B8] to-[#0EA5E9]" />
                        <div className="px-6 py-5 flex items-start justify-between gap-4 flex-wrap">
                            <div>
                                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5B5B5B] mb-2">
                                    <Mail className="w-3.5 h-3.5 text-[#1973B8]" />
                                    Notificaciones por Correo
                                </div>
                                <h1 className="text-xl sm:text-2xl font-semibold text-[#072146] tracking-tight" style={{ fontFamily: 'Poppins' }}>
                                    Campaña de activación · PayLionsbit
                                </h1>
                                <p className="text-[#5B5B5B] mt-1.5 max-w-2xl text-[13px] leading-relaxed">
                                    Envía la contraseña temporal por email a usuarios que aún no han iniciado sesión.
                                    Idempotente — no se envía dos veces al mismo usuario. Tasa: 80 emails/min · Tracking de apertura activado.
                                </p>
                            </div>
                            <Button
                                onClick={() => fetchOverview(false)}
                                disabled={refreshing}
                                variant="outline"
                                className="border-slate-200 text-[#5B5B5B] hover:bg-[#F4F6F8] text-xs h-9 px-3 flex-shrink-0"
                                data-testid="email-refresh-btn"
                            >
                                {refreshing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                                Refrescar
                            </Button>
                        </div>
                    </div>
                </motion.div>

                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <KPICard icon={Users}        label="Total con email"   value={counts.total_with_email}     accent="#004481" testid="kpi-em-total" />
                    <KPICard icon={Activity}     label="Pendientes"         value={counts.pending}              accent="#1973B8" testid="kpi-em-pending" />
                    <KPICard icon={Send}         label="Enviados"           value={counts.sent}                 accent="#0EA5E9" testid="kpi-em-sent" />
                    <KPICard icon={Eye}          label="Abiertos"           value={counts.opened}               accent="#10B981" testid="kpi-em-opened" />
                    <KPICard icon={XCircle}      label="Fallidos retry"     value={counts.failed_retryable}     accent="#EF4444" testid="kpi-em-failed" />
                    <KPICard icon={AlertTriangle} label="Email inválido"    value={counts.invalid_email}        accent="#F59E0B" testid="kpi-em-invalid" />
                </div>

                {/* Action panel */}
                <div className="rounded-xl bg-white shadow-[0_1px_3px_rgba(7,33,70,0.04),_0_6px_20px_rgba(7,33,70,0.06)] overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[#5B5B5B] font-semibold mb-1">Acciones</p>
                        <h3 className="text-sm font-semibold text-[#072146]" style={{ fontFamily: 'Poppins' }}>Lanzar campaña</h3>
                    </div>
                    <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Dry-run */}
                        <Button
                            onClick={() => trigger({ dryRun: true, max: 10 })}
                            disabled={sending || counts.pending === 0}
                            variant="outline"
                            className="border-slate-300 text-[#5B5B5B] hover:bg-slate-50 h-auto py-4 flex flex-col items-start gap-1.5"
                            data-testid="email-dryrun-btn"
                        >
                            <div className="flex items-center gap-2">
                                <FlaskConical className="w-4 h-4 text-slate-500" />
                                <span className="text-[13px] font-semibold text-[#072146]">Validar (dry-run)</span>
                            </div>
                            <p className="text-[11px] text-[#8A95A5] font-normal text-left whitespace-normal">
                                10 usuarios · sin enviar real · valida formato de emails
                            </p>
                        </Button>

                        {/* Real send */}
                        <Button
                            onClick={() => trigger({})}
                            disabled={sending || counts.pending === 0}
                            className="bg-[#1973B8] hover:bg-[#004481] text-white h-auto py-4 flex flex-col items-start gap-1.5 shadow-sm"
                            data-testid="email-send-btn"
                        >
                            <div className="flex items-center gap-2">
                                <Send className="w-4 h-4" />
                                <span className="text-[13px] font-semibold">Enviar a pendientes</span>
                            </div>
                            <p className="text-[11px] text-white/85 font-normal text-left whitespace-normal">
                                {fmtNum(counts.pending)} correos · ~{Math.ceil(counts.pending / 80)} min
                            </p>
                        </Button>

                        {/* Retry failed */}
                        <Button
                            onClick={() => trigger({ onlyFailed: true })}
                            disabled={sending || counts.failed_retryable === 0}
                            variant="outline"
                            className="border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 h-auto py-4 flex flex-col items-start gap-1.5"
                            data-testid="email-retry-btn"
                        >
                            <div className="flex items-center gap-2">
                                <RefreshCw className="w-4 h-4" />
                                <span className="text-[13px] font-semibold">Reintentar fallidos</span>
                            </div>
                            <p className="text-[11px] text-amber-700/80 font-normal text-left whitespace-normal">
                                {fmtNum(counts.failed_retryable)} usuarios · max 3 reintentos
                            </p>
                        </Button>
                    </div>
                </div>

                {/* Subject preview */}
                <div className="rounded-xl bg-[#F4F6F8] border border-[#E5EAF0] px-5 py-4" data-testid="email-subject-preview">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[#5B5B5B] font-semibold mb-1">Asunto del correo</p>
                    <p className="text-sm font-medium text-[#072146] font-mono">Activación de cuenta · PayLionsbit</p>
                </div>

                {/* Recent campaigns */}
                <div className="rounded-xl bg-white shadow-[0_1px_3px_rgba(7,33,70,0.04),_0_6px_20px_rgba(7,33,70,0.06)] overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.14em] text-[#5B5B5B] font-semibold mb-1">Historial</p>
                            <h3 className="text-sm font-semibold text-[#072146]" style={{ fontFamily: 'Poppins' }}>
                                Últimas campañas ({data.recent_campaigns.length})
                            </h3>
                        </div>
                        <Sparkles className="w-3.5 h-3.5 text-slate-300" />
                    </div>
                    {data.recent_campaigns.length === 0 ? (
                        <div className="p-12 text-center text-[#8A95A5] text-sm">Sin campañas aún. Lanza la primera con "Validar (dry-run)".</div>
                    ) : (
                        <div className="divide-y divide-slate-100" data-testid="email-campaigns-list">
                            {data.recent_campaigns.map(c => <CampaignRow key={c.id} c={c} />)}
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
};

export default AdminEmailCampaignPage;
