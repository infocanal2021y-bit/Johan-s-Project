import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../../components/layout/Layout';
import api from '../../lib/api';
import { Clock, AlertTriangle, Loader2, RefreshCw, Banknote, Receipt, Timer } from 'lucide-react';
import { Button } from '../../components/ui/button';

const fmtRemaining = (h) => {
    if (h <= 0) return 'Expirado';
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return `${hh}h ${mm}m`;
};

const remainingColor = (h, expired) => {
    if (expired) return 'text-slate-500';
    if (h <= 6) return 'text-rose-400';
    if (h <= 24) return 'text-amber-400';
    return 'text-emerald-400';
};

export default function AdminPendingAbonosPage() {
    const [data, setData] = useState({ items: [], stats: {} });
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        api.get('/admin/pending-abonos')
            .then((r) => setData(r.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        load();
        const iv = setInterval(load, 30000);
        return () => clearInterval(iv);
    }, [load]);

    const stats = data.stats || {};

    return (
        <Layout>
            <div className="max-w-6xl mx-auto space-y-6" data-testid="admin-pending-abonos-page">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25">
                            <Receipt className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Abonos Pendientes</h1>
                            <p className="text-sm text-slate-400 font-light">Retiros esperando el cargo de autorización · tiempo restante</p>
                        </div>
                    </div>
                    <Button onClick={load} variant="outline" className="border-slate-700 text-slate-300 bg-slate-900 hover:bg-slate-800" data-testid="refresh-abonos-btn">
                        <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
                    </Button>
                </div>

                <div className="grid grid-cols-3 gap-3" data-testid="abonos-stats">
                    {[
                        { label: 'Total pendientes', value: stats.total || 0, icon: Timer, color: 'text-cyan-400' },
                        { label: 'Urgentes (<6h)', value: stats.urgent || 0, icon: AlertTriangle, color: 'text-rose-400' },
                        { label: 'Expirados', value: stats.expired || 0, icon: Clock, color: 'text-slate-400' },
                    ].map((s) => (
                        <div key={s.label} className="p-4 rounded-xl border border-slate-800 bg-slate-950/60" data-testid={`abono-stat-${s.label}`}>
                            <s.icon className={`w-4 h-4 ${s.color} mb-2`} />
                            <p className="text-white text-2xl font-bold tabular-nums">{s.value}</p>
                            <p className="text-slate-500 text-xs">{s.label}</p>
                        </div>
                    ))}
                </div>

                {loading ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-amber-400 animate-spin" /></div>
                ) : data.items.length === 0 ? (
                    <div className="text-center py-16 text-slate-500 text-sm" data-testid="abonos-empty">No hay retiros con abono pendiente.</div>
                ) : (
                    <div className="space-y-3" data-testid="abonos-list">
                        {data.items.map((it) => (
                            <div key={it.id} className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 flex items-start justify-between gap-4 flex-wrap" data-testid={`abono-row-${it.id}`}>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${it.kind === 'bank' ? 'bg-[#1973B8]/15 text-[#4a9eff]' : 'bg-amber-500/15 text-amber-300'}`}>
                                            {it.kind === 'bank' ? <><Banknote className="w-3 h-3" /> Retiro a Banco</> : <><Receipt className="w-3 h-3" /> Retiro</>}
                                        </span>
                                        <span className="font-mono text-cyan-400 text-xs">{it.reference || it.id.slice(0, 12)}</span>
                                    </div>
                                    <p className="text-white text-sm font-semibold mt-1">{it.user_name} <span className="text-slate-500 font-normal">· {it.user_email}</span></p>
                                    <p className="text-slate-400 text-xs mt-0.5">
                                        Retiro: <span className="text-white">{Number(it.withdraw_amount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} {it.currency}</span>
                                        {it.bank_name ? ` → ${it.bank_name}` : ''} · Cargo requerido: <span className="text-amber-300 font-bold">{Number(it.charge_required || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                                    </p>
                                    <p className="text-slate-600 text-[10px] mt-0.5">Inicio: {new Date(it.started_at).toLocaleString('es-ES')}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Tiempo restante</p>
                                    <p className={`text-xl font-bold font-mono tabular-nums ${remainingColor(it.hours_remaining, it.expired)}`} data-testid={`abono-remaining-${it.id}`}>
                                        {fmtRemaining(it.hours_remaining)}
                                    </p>
                                    {0 < it.hours_remaining && it.hours_remaining <= 6 && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-300 mt-1"><AlertTriangle className="w-3 h-3" /> Urgente</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Layout>
    );
}
