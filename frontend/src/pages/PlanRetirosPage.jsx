import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import api from '../lib/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { CalendarClock, Loader2, CheckCircle2, XCircle, Clock, Plus } from 'lucide-react';

const fmtEur = (n) => `€${(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
const FREQS = [['semanal', 'Semanal (7 días)'], ['quincenal', 'Quincenal (14 días)'], ['mensual', 'Mensual (30 días)']];
const STATUS_CLS = {
    pendiente_aprobacion: 'bg-amber-500/15 text-amber-300', activo: 'bg-emerald-500/15 text-emerald-300',
    rechazado: 'bg-red-500/15 text-red-300', completado: 'bg-emerald-500/20 text-emerald-300',
    cancelado: 'bg-slate-500/15 text-slate-400',
};

const PlanView = ({ plan, onCancel }) => (
    <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-5 space-y-4" data-testid={`plan-view-${plan.id}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
                <p className="text-2xl font-bold text-white font-mono">{fmtEur(plan.total_eur)}</p>
                <p className="text-slate-400 text-xs mt-0.5">{plan.tranches.length} tramos · {plan.frequency} · desde {plan.start_date}</p>
            </div>
            <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${STATUS_CLS[plan.status]}`} data-testid="plan-status">{plan.status_label}</span>
        </div>
        {plan.rejection_reason && <p className="text-red-300 text-xs">Motivo del rechazo: {plan.rejection_reason}</p>}
        {plan.next_tranche && plan.status === 'activo' && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs" data-testid="plan-next-tranche">
                <p className="text-emerald-300 font-bold">Próximo tramo: #{plan.next_tranche.n} · {fmtEur(plan.next_tranche.amount_eur)} · {plan.next_tranche.due_date}</p>
            </div>
        )}
        <div className="space-y-1.5" data-testid="plan-tranches">
            {plan.tranches.map((t) => (
                <div key={t.n} className="flex items-center gap-3 rounded-lg bg-slate-950/60 border border-slate-800 px-3 py-2 text-xs">
                    {t.status === 'ejecutado' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Clock className="w-4 h-4 text-slate-500" />}
                    <span className="text-white font-semibold">Tramo {t.n}</span>
                    <span className="text-slate-400">{t.due_date}</span>
                    <span className="ml-auto text-white font-mono font-bold">{fmtEur(t.amount_eur)}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.status === 'ejecutado' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/60 text-slate-400'}`}>
                        {t.status === 'ejecutado' ? 'Ejecutado' : 'Pendiente'}
                    </span>
                </div>
            ))}
        </div>
        {plan.status === 'pendiente_aprobacion' && (
            <Button variant="ghost" onClick={() => onCancel(plan.id)} className="text-red-400 hover:text-red-300 text-xs h-8" data-testid="plan-cancel-btn">
                Cancelar solicitud
            </Button>
        )}
    </div>
);

export default function PlanRetirosPage() {
    const [data, setData] = useState(null);
    const [total, setTotal] = useState('');
    const [freq, setFreq] = useState('semanal');
    const [creating, setCreating] = useState(false);

    const load = () => api.get('/withdrawal-plan').then((r) => setData(r.data)).catch(() => setData({ plans: [] }));
    useEffect(() => { load(); }, []);

    const activePlan = (data?.plans || []).find((p) => ['pendiente_aprobacion', 'activo'].includes(p.status));
    const nTranches = total > 0 ? Math.ceil(parseFloat(total) / 15000) : 0;

    const create = async () => {
        setCreating(true);
        try {
            await api.post('/withdrawal-plan', { total_eur: parseFloat(total), frequency: freq });
            toast.success('Plan enviado: pendiente de aprobación administrativa');
            load();
        } catch (e) { toast.error(e.response?.data?.detail || 'Error al crear el plan'); }
        finally { setCreating(false); }
    };
    const cancel = async (id) => {
        try { await api.post(`/withdrawal-plan/${id}/cancel`); toast.success('Plan cancelado'); load(); }
        catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    };

    return (
        <Layout>
            <div className="max-w-2xl mx-auto space-y-5" data-testid="plan-retiros-page">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/25 flex items-center justify-center">
                        <CalendarClock className="w-6 h-6 text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Retiro programado</h1>
                        <p className="text-sm text-slate-400 font-light">Plan por tramos de hasta €15.000 cada uno, con calendario de fechas e importes</p>
                    </div>
                </div>

                {data === null ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
                ) : activePlan ? (
                    <PlanView plan={activePlan} onCancel={cancel} />
                ) : (
                    <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-5 space-y-4" data-testid="plan-create-form">
                        <div>
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Monto total a retirar (EUR)</label>
                            <input type="number" min="1" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0.00"
                                className="w-full h-11 px-3 mt-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-lg font-mono focus:outline-none focus:border-violet-500/50"
                                data-testid="plan-total-input" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Frecuencia entre tramos</label>
                            <div className="flex gap-2 mt-1.5">
                                {FREQS.map(([k, l]) => (
                                    <button key={k} type="button" onClick={() => setFreq(k)}
                                        className={`px-3 py-2 rounded-lg border text-xs font-semibold ${freq === k ? 'bg-violet-500/20 border-violet-500/50 text-violet-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                                        data-testid={`plan-freq-${k}`}>{l}</button>
                                ))}
                            </div>
                        </div>
                        {nTranches > 0 && (
                            <p className="text-slate-400 text-xs" data-testid="plan-preview">
                                Su plan se dividirá en <span className="text-white font-bold">{nTranches} tramo(s)</span> de máx. €15.000 cada uno,
                                comenzando en ~7 días. Requiere aprobación administrativa.
                            </p>
                        )}
                        <Button onClick={create} disabled={creating || !total || parseFloat(total) <= 0}
                            className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold h-11" data-testid="plan-create-btn">
                            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                            Solicitar plan de retiros
                        </Button>
                    </div>
                )}

                {(data?.plans || []).filter((p) => p.id !== activePlan?.id).map((p) => <PlanView key={p.id} plan={p} onCancel={cancel} />)}
            </div>
        </Layout>
    );
}
