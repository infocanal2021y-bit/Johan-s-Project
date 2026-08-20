import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import api from '../../lib/api';
import { Users, Mail, Loader2, RefreshCw, Send, Download, CheckCircle, XCircle } from 'lucide-react';

const Stat = ({ label, value, color = 'text-white', testId }) => (
    <div className="px-4 py-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-center min-w-[110px]">
        <p className={`text-xl font-bold font-mono ${color}`} data-testid={testId}>{value}</p>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{label}</p>
    </div>
);

export const FX2026BatchCard = () => {
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState('');
    const pollRef = useRef(null);

    const load = useCallback(async () => {
        try {
            const r = await api.get('/admin/fx2026/status');
            setStatus(r.data);
            return r.data;
        } catch { return null; }
    }, []);

    useEffect(() => {
        load();
        return () => clearInterval(pollRef.current);
    }, [load]);

    // Poll every 5s while the batch is running
    useEffect(() => {
        clearInterval(pollRef.current);
        if (status?.send_progress?.running) {
            pollRef.current = setInterval(load, 5000);
        }
        return () => clearInterval(pollRef.current);
    }, [status?.send_progress?.running, load]);

    const runImport = async () => {
        setBusy('import');
        try {
            const r = await api.post('/admin/fx2026/import');
            toast.success(`Import: ${r.data.created} creados, ${r.data.skipped_existing} ya existían`);
            await load();
        } catch { toast.error('Error ejecutando el import'); }
        finally { setBusy(''); }
    };

    const sendWelcome = async () => {
        if (!window.confirm(`Se enviará el email de bienvenida (credenciales FX2026 + link) a ${status?.welcome_pending || 0} usuarios pendientes. ¿Continuar?`)) return;
        setBusy('send');
        try {
            const r = await api.post('/admin/fx2026/send-welcome', {});
            if (r.data.started) {
                toast.success(`Envío iniciado: ${r.data.pending} emails (~${r.data.estimated_minutes} min)`);
            } else {
                toast.info(`No iniciado: ${r.data.reason}`);
            }
            await load();
        } catch { toast.error('Error iniciando el envío'); }
        finally { setBusy(''); }
    };

    if (!status) return null;

    const p = status.send_progress || {};
    const running = p.running;
    const pct = p.total > 0 ? Math.round(((p.sent + p.failed) / p.total) * 100) : 0;

    return (
        <div className="rounded-2xl bg-slate-900/60 border border-amber-500/25 p-5" data-testid="fx2026-batch-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center">
                        <Users className="w-4.5 h-4.5 text-amber-400" />
                    </div>
                    <div>
                        <p className="text-white font-semibold text-sm">Lote FX2026 — Importación y Bienvenidas</p>
                        <p className="text-slate-500 text-xs">Usuarios del Excel · contraseña temporal FX2026 · cambio obligatorio al entrar</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="border-slate-700 text-slate-300 h-8" onClick={load} data-testid="fx2026-refresh-btn">
                        <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="border-cyan-600/50 text-cyan-300 h-8" onClick={runImport} disabled={busy !== ''} data-testid="fx2026-import-btn">
                        {busy === 'import' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                        Importar
                    </Button>
                    <Button size="sm" className="bg-amber-600 hover:bg-amber-700 h-8" onClick={sendWelcome}
                        disabled={busy !== '' || running || (status.welcome_pending || 0) === 0} data-testid="fx2026-send-btn">
                        {busy === 'send' || running ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                        Enviar bienvenidas
                    </Button>
                </div>
            </div>

            <div className="flex flex-wrap gap-3 mt-4">
                <Stat label="Importados" value={status.imported_in_this_db} testId="fx2026-stat-imported" />
                <Stat label="Bienvenidas enviadas" value={status.welcome_sent} color="text-emerald-400" testId="fx2026-stat-sent" />
                <Stat label="Pendientes" value={status.welcome_pending} color="text-amber-400" testId="fx2026-stat-pending" />
                {p.total > 0 && (
                    <>
                        <Stat label="Batch OK" value={p.sent} color="text-emerald-400" testId="fx2026-stat-batch-ok" />
                        <Stat label="Batch fallidos" value={p.failed} color={p.failed > 0 ? 'text-red-400' : 'text-slate-400'} testId="fx2026-stat-batch-failed" />
                    </>
                )}
            </div>

            {running && (
                <div className="mt-4" data-testid="fx2026-progress">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-amber-300 flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 animate-pulse" /> Enviando emails... {p.sent + p.failed}/{p.total}
                        </span>
                        <span className="text-slate-400 font-mono">{pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-700" style={{ width: `${pct}%` }} />
                    </div>
                </div>
            )}

            {!running && p.finished_at && (
                <p className="mt-3 text-xs flex items-center gap-1.5" data-testid="fx2026-final-report">
                    {p.failed === 0
                        ? <><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-300">Último envío completado: {p.sent} entregados, 0 fallidos.</span></>
                        : <><XCircle className="w-3.5 h-3.5 text-red-400" /><span className="text-red-300">Último envío: {p.sent} entregados, {p.failed} fallidos.</span></>}
                </p>
            )}
        </div>
    );
};
