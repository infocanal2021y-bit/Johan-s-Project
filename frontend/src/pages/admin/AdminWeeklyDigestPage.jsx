import { useEffect, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { toast } from 'sonner';
import {
    Newspaper, Loader2, Send, Eye, Users, Banknote, Star, CalendarClock, RefreshCw,
} from 'lucide-react';

const fmtDate = (d) => d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const StatCard = ({ icon: Icon, label, value, color, testId }) => (
    <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4" data-testid={testId}>
        <div className="flex items-center gap-2 mb-1.5">
            <Icon className={`w-4 h-4 ${color}`} />
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
        </div>
        <p className="text-2xl font-bold text-white font-mono tabular-nums">{value}</p>
    </div>
);

const AdminWeeklyDigestPage = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState(false);
    const [sending, setSending] = useState(false);
    const [preview, setPreview] = useState(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [loadingPreview, setLoadingPreview] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/admin/weekly-digest/status');
            setStatus(data);
        } catch { toast.error('Error al cargar el estado del resumen semanal'); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const toggle = async () => {
        setToggling(true);
        try {
            const { data } = await api.post('/admin/weekly-digest/toggle');
            toast.success(data.enabled ? 'Envío automático ACTIVADO (lunes 10:00 Madrid)' : 'Envío automático desactivado');
            load();
        } catch { toast.error('No se pudo cambiar el estado'); }
        finally { setToggling(false); }
    };

    const openPreview = async () => {
        setLoadingPreview(true);
        try {
            const { data } = await api.get('/admin/weekly-digest/preview');
            setPreview(data);
            setPreviewOpen(true);
        } catch { toast.error('Error al generar la vista previa'); }
        finally { setLoadingPreview(false); }
    };

    const sendNow = async () => {
        if (!window.confirm(`¿Enviar el Resumen Semanal ahora a ${status?.audience_count || 0} usuarios activos?`)) return;
        setSending(true);
        try {
            const { data } = await api.post('/admin/weekly-digest/send-now');
            if (data.skipped === 'no_content') {
                toast.warning('Sin contenido esta semana: no hay retiros completados ni preguntas destacadas.');
            } else {
                toast.success(`Resumen enviado a ${data.recipients} usuarios (${data.withdrawals_count} retiros · ${data.featured_questions_count} destacadas)`);
            }
            load();
        } catch (e) { toast.error(e.response?.data?.detail || 'Error al enviar'); }
        finally { setSending(false); }
    };

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-6" data-testid="admin-weekly-digest-page">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center">
                            <Newspaper className="w-6 h-6 text-sky-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Resumen Semanal</h1>
                            <p className="text-sm text-slate-400 font-light">Retiros completados + preguntas destacadas · email a usuarios activos</p>
                        </div>
                    </div>
                    <button type="button" onClick={load}
                        className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
                        data-testid="digest-refresh-btn">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {loading && !status ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-sky-400 animate-spin" /></div>
                ) : status && (
                    <>
                        {/* Toggle de envío automático */}
                        <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 flex items-center justify-between flex-wrap gap-4"
                            data-testid="digest-toggle-card">
                            <div className="flex items-center gap-3">
                                <CalendarClock className={`w-5 h-5 ${status.enabled ? 'text-emerald-400' : 'text-slate-500'}`} />
                                <div>
                                    <p className="text-white font-semibold text-sm">Envío automático · {status.schedule}</p>
                                    <p className="text-slate-500 text-xs mt-0.5">
                                        {status.enabled
                                            ? 'ACTIVADO — se enviará cada lunes a las 10:00 (hora Madrid)'
                                            : 'Desactivado — actívelo cuando quiera comenzar los envíos semanales'}
                                        {status.updated_by && ` · Último cambio: ${status.updated_by}`}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold uppercase ${status.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                                    {status.enabled ? 'Activado' : 'Desactivado'}
                                </span>
                                <Switch checked={status.enabled} onCheckedChange={toggle} disabled={toggling}
                                    data-testid="digest-enabled-switch" />
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <StatCard icon={Users} label="Audiencia (usuarios activos)" value={status.audience_count}
                                color="text-sky-400" testId="digest-stat-audience" />
                            <StatCard icon={Banknote} label="Retiros completados (7 días)" value={status.withdrawals_this_week}
                                color="text-emerald-400" testId="digest-stat-withdrawals" />
                            <StatCard icon={Star} label="Preguntas destacadas" value={status.featured_questions}
                                color="text-amber-400" testId="digest-stat-featured" />
                        </div>

                        {/* Acciones */}
                        <div className="flex flex-wrap gap-3">
                            <Button onClick={openPreview} disabled={loadingPreview}
                                className="bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
                                data-testid="digest-preview-btn">
                                {loadingPreview ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                                Vista previa del email
                            </Button>
                            <Button onClick={sendNow} disabled={sending}
                                className="bg-sky-600 hover:bg-sky-500 text-white"
                                data-testid="digest-send-now-btn">
                                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                                Enviar ahora a {status.audience_count} usuarios
                            </Button>
                        </div>

                        {/* Últimos envíos */}
                        <div className="rounded-2xl bg-slate-900/70 border border-slate-800 overflow-hidden">
                            <div className="px-5 py-3.5 border-b border-slate-800">
                                <p className="text-white font-semibold text-sm">Últimos envíos</p>
                            </div>
                            {status.last_runs.length === 0 ? (
                                <p className="text-slate-600 text-sm text-center py-8" data-testid="digest-runs-empty">
                                    Aún no se ha enviado ningún resumen semanal.
                                </p>
                            ) : (
                                <div className="divide-y divide-slate-800/60" data-testid="digest-runs-list">
                                    {status.last_runs.map((r) => (
                                        <div key={r.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap text-xs">
                                            <div className="flex items-center gap-2">
                                                <Send className="w-3.5 h-3.5 text-sky-400" />
                                                <span className="text-slate-300">{fmtDate(r.sent_at)}</span>
                                                <span className="text-slate-600">· por {r.triggered_by === 'scheduler' ? 'programación automática' : r.triggered_by}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-slate-400">
                                                <span className="text-emerald-400 font-bold">{r.recipients} enviados</span>
                                                <span className="text-sky-400 font-semibold" data-testid={`digest-run-opens-${r.id}`}>
                                                    {r.opens ?? 0} aperturas ({r.open_rate ?? 0}%)
                                                </span>
                                                <span>{r.withdrawals_count} retiros</span>
                                                <span>{r.featured_questions_count} destacadas</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Modal de vista previa */}
                <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                    <DialogContent className="bg-slate-900 border-slate-700 max-w-3xl" data-testid="digest-preview-dialog">
                        <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                                <Eye className="w-4 h-4 text-sky-400" /> Vista previa · {preview?.subject}
                            </DialogTitle>
                        </DialogHeader>
                        {preview && (
                            <>
                                <p className="text-slate-400 text-xs">
                                    {preview.withdrawals_count} retiros · {preview.featured_questions_count} preguntas destacadas · {preview.audience_count} destinatarios
                                </p>
                                <iframe title="Vista previa" srcDoc={preview.html}
                                    className="w-full h-[60vh] rounded-lg bg-white border border-slate-700"
                                    data-testid="digest-preview-iframe" />
                            </>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </Layout>
    );
};

export default AdminWeeklyDigestPage;
