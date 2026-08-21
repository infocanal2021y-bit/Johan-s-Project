import { useEffect, useState, useCallback } from 'react';
import { Mail, RefreshCw, AlertTriangle } from 'lucide-react';
import api from '../../lib/api';

const barColor = (pct) => (pct >= 80 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500');

export const EmailQuotaCard = () => {
    const [q, setQ] = useState(null);

    const load = useCallback(async () => {
        try {
            const r = await api.get('/admin/email-quota');
            setQ(r.data);
        } catch { /* silent */ }
    }, []);

    useEffect(() => { load(); }, [load]);

    if (!q) return null;
    const pct = Math.min(100, q.pct_used);

    return (
        <div className={`rounded-2xl bg-slate-900/60 border p-5 ${q.alert ? 'border-red-500/40' : 'border-slate-800'}`} data-testid="email-quota-card">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${q.alert ? 'bg-red-500/15' : 'bg-emerald-500/15'}`}>
                        <Mail className={`w-4.5 h-4.5 ${q.alert ? 'text-red-400' : 'text-emerald-400'}`} />
                    </div>
                    <div>
                        <p className="text-white font-semibold text-sm">Cuota de Email (Resend)</p>
                        <p className="text-slate-500 text-xs">
                            <span data-testid="email-quota-sent">{q.sent_today}</span> de {q.quota} enviados hoy · quedan <span className="text-slate-300 font-semibold" data-testid="email-quota-remaining">{q.remaining}</span>
                        </p>
                    </div>
                </div>
                <button onClick={load} className="text-slate-500 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors" data-testid="email-quota-refresh">
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            <div className="mt-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-400">Uso diario</span>
                    <span className={`font-mono font-bold ${pct >= 80 ? 'text-red-400' : pct >= 60 ? 'text-amber-400' : 'text-emerald-400'}`} data-testid="email-quota-pct">{q.pct_used}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className={`h-full transition-all duration-700 ${barColor(pct)}`} style={{ width: `${pct}%` }} />
                </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
                <span className="px-2 py-1 rounded bg-cyan-500/10 text-cyan-300">Códigos: {q.breakdown.codes}</span>
                <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-300">Recordatorios: {q.breakdown.reminders}</span>
                <span className="px-2 py-1 rounded bg-slate-700/40 text-slate-300">Otros: {q.breakdown.others}</span>
                {q.failed_today > 0 && <span className="px-2 py-1 rounded bg-red-500/10 text-red-300">Fallidos: {q.failed_today}</span>}
                {q.queued > 0 && (
                    <span className="px-2 py-1 rounded bg-violet-500/10 text-violet-300" data-testid="email-quota-queued">
                        En cola (auto-reintento): {q.queued}{q.queued_high > 0 ? ` · ${q.queued_high} alta prioridad` : ''}
                    </span>
                )}
                {q.queue_sent_today > 0 && (
                    <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-300">Recuperados de cola: {q.queue_sent_today}</span>
                )}
            </div>

            {q.alert && (
                <p className="mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2 flex items-center gap-2" data-testid="email-quota-alert">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    {q.quota_errors_today > 0
                        ? `Resend rechazó ${q.quota_errors_today} emails por cuota agotada hoy. Los códigos de retiro pueden no llegar — amplíe el plan en resend.com.`
                        : 'Uso ≥ 80% de la cuota diaria. Los códigos de retiro podrían dejar de salir si se agota.'}
                </p>
            )}
        </div>
    );
};
