import { useState } from 'react';
import { ChevronDown, History, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';

export const PP_STATUS = {
    awaiting_code: { label: 'Esperando código', cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
    requested: { label: 'Solicitado', cls: 'bg-[#009cde]/15 text-[#7dd3fc] border-[#009cde]/30' },
    in_review: { label: 'En revisión', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    processing: { label: 'Procesado', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
    payout_sent: { label: 'Pago enviado', cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
    completed: { label: 'Completado', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    rejected: { label: 'Rechazado', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
    cancelled: { label: 'Cancelado', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
    expired: { label: 'Expirado', cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};
export const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtMoney = (n, c) => `${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c || ''}`;

export const StatusPill = ({ status, testId }) => {
    const s = PP_STATUS[status] || PP_STATUS.requested;
    return <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${s.cls}`} data-testid={testId}>{s.label}</span>;
};

export const Timeline = ({ items = [], testId }) => (
    <ol className="relative border-l border-slate-800 ml-1.5 space-y-2.5" data-testid={testId}>
        {items.map((t, i) => (
            <li key={`${t.status}-${i}`} className="pl-4 relative">
                <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#009cde] ring-2 ring-slate-950" />
                <div className="flex flex-wrap items-baseline gap-x-2 text-[11px]"><span className="text-slate-200 font-semibold">{t.status_label}</span><span className="text-slate-500">· {t.actor_role === 'admin' ? (t.actor_name || 'Administración') : t.actor_role === 'user' ? 'Cliente' : 'Sistema'}</span><span className="text-slate-500 font-mono text-[10px] ml-auto">{fmtDate(t.at)}</span></div>
                {t.note && <p className="text-[10.5px] text-slate-400 mt-0.5">{t.note}</p>}
            </li>
        ))}
    </ol>
);

export const PayPalWithdrawalHistory = ({ items, onChange }) => {
    const [open, setOpen] = useState(null);
    const cancel = async (r) => {
        if (!window.confirm(`¿Cancelar el retiro ${r.reference}? Los fondos volverán a tu saldo.`)) return;
        try { await api.post(`/paypal-withdrawal/${r.id}/cancel`); toast.success('Retiro cancelado'); onChange?.(); }
        catch (e) { toast.error(e.response?.data?.detail || 'No se pudo cancelar'); }
    };
    return (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5" data-testid="paypal-history">
            <p className="text-white font-semibold text-sm flex items-center gap-2 mb-3"><History className="w-4 h-4 text-[#009cde]" /> Historial de retiros PayPal</p>
            {items.length === 0 ? <p className="text-slate-500 text-xs" data-testid="paypal-history-empty">Aún no has realizado retiros a PayPal.</p> : (
                <div className="space-y-2">
                    {items.map((r) => (
                        <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-950/50 overflow-hidden" data-testid={`paypal-history-row-${r.id}`} data-status={r.status}>
                            <button onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                                <div className="flex-1 min-w-0"><p className="text-white text-sm font-mono">{r.reference}</p><p className="text-slate-500 text-[11px] truncate">{fmtDate(r.created_at)} · {r.paypal_email}</p></div>
                                <p className="text-white font-mono text-sm">{fmtMoney(r.amount, r.currency)}</p>
                                <StatusPill status={r.status} testId={`paypal-history-status-${r.id}`} />
                                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open === r.id ? 'rotate-180' : ''}`} />
                            </button>
                            {open === r.id && (
                                <div className="px-4 pb-4 pt-1 border-t border-slate-800/70 space-y-3">
                                    {r.paypal_txn_id && <p className="text-[11px] text-slate-400">ID transacción PayPal: <span className="text-emerald-300 font-mono">{r.paypal_txn_id}</span></p>}
                                    {r.admin_note && (r.status === 'rejected' || r.status === 'cancelled') && <p className="text-[11px] text-red-300">Motivo: {r.admin_note}</p>}
                                    <Timeline items={r.status_timeline} testId={`paypal-timeline-${r.id}`} />
                                    {r.status === 'requested' && (
                                        <button onClick={() => cancel(r)} className="flex items-center gap-1 text-[11px] text-red-300 hover:text-red-200" data-testid={`paypal-user-cancel-${r.id}`}><XCircle className="w-3.5 h-3.5" /> Cancelar solicitud</button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
