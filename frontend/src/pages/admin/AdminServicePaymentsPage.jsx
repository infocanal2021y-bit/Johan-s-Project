import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../../components/layout/Layout';
import { Button } from '../../components/ui/button';
import api from '../../lib/api';
import { toast } from 'sonner';
import { CreditCard, Loader2, Plus, RotateCcw } from 'lucide-react';

const CHIP = {
    pending: 'bg-sky-500/15 text-sky-300', paid: 'bg-emerald-500/15 text-emerald-300',
    failed: 'bg-rose-500/15 text-rose-300', expired: 'bg-slate-500/20 text-slate-400',
    refunded: 'bg-amber-500/15 text-amber-300',
};
const fmt = (cents, cur) => `${cur === 'eur' ? '€' : '$'}${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

export default function AdminServicePaymentsPage() {
    const [data, setData] = useState(null);
    const [filter, setFilter] = useState('');
    const [form, setForm] = useState({ name: '', lookup_key: '', amount: '', currency: 'eur' });
    const [showNew, setShowNew] = useState(false);

    const load = useCallback(async () => {
        try { setData((await api.get('/admin/service-payments')).data); }
        catch { toast.error('No se pudo cargar'); }
    }, []);
    useEffect(() => { load(); }, [load]);

    if (!data) return <Layout><div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div></Layout>;

    const rows = data.transactions.filter((t) => !filter || t.payment_status === filter);

    return (
        <Layout>
            <div className="max-w-5xl mx-auto space-y-4 p-3 sm:p-5" data-testid="admin-service-payments-page">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-[#635BFF]/15 ring-1 ring-[#635BFF]/40 flex items-center justify-center">
                            <CreditCard className="w-5 h-5 text-[#8f89ff]" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-white">Pagos de Servicios (Stripe)</h1>
                            <p className="text-slate-400 text-xs">Cobrado: <span className="text-emerald-300 font-mono font-bold">{fmt(data.total_paid_eur_cents, 'eur')}</span> · {data.counts.paid} pagos confirmados · {data.catalog.length} servicios en catálogo</p>
                        </div>
                    </div>
                    <Button onClick={() => setShowNew((v) => !v)} className="bg-[#635BFF] hover:bg-[#7a73ff] h-9 text-xs" data-testid="new-service-btn">
                        <Plus className="w-4 h-4 mr-1" /> Nuevo servicio
                    </Button>
                </div>

                {showNew && (
                    <div className="rounded-xl bg-slate-900/70 border border-[#635BFF]/30 p-4 grid grid-cols-2 sm:grid-cols-5 gap-2 items-end" data-testid="new-service-form">
                        <label className="col-span-2"><span className="text-[10px] uppercase text-slate-500 font-bold">Nombre</span>
                            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-9 px-3 mt-1 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs" /></label>
                        <label><span className="text-[10px] uppercase text-slate-500 font-bold">Clave única</span>
                            <input value={form.lookup_key} onChange={(e) => setForm({ ...form, lookup_key: e.target.value.replace(/[^a-z0-9_]/g, '') })} placeholder="mi_servicio_eur" className="w-full h-9 px-3 mt-1 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs font-mono" /></label>
                        <label><span className="text-[10px] uppercase text-slate-500 font-bold">Importe (€/$)</span>
                            <input type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full h-9 px-3 mt-1 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs font-mono" /></label>
                        <div className="flex gap-2">
                            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="h-9 px-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs">
                                <option value="eur">EUR</option><option value="usd">USD</option>
                            </select>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 h-9 text-xs" disabled={!form.name || !form.lookup_key || !form.amount}
                                onClick={async () => {
                                    try {
                                        await api.post('/admin/service-payments/catalog', {
                                            name: form.name, lookup_key: form.lookup_key,
                                            amount_cents: Math.round(Number(form.amount) * 100), currency: form.currency,
                                        });
                                        toast.success('Servicio creado en Stripe');
                                        setForm({ name: '', lookup_key: '', amount: '', currency: 'eur' }); setShowNew(false); load();
                                    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
                                }} data-testid="save-service-btn">Crear</Button>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-1.5 flex-wrap" data-testid="admin-catalog-chips">
                    {data.catalog.map((s) => (
                        <span key={s.lookup_key} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/70 border border-slate-800 text-[11px] text-slate-300">
                            {s.name} · <span className="font-mono text-[#8f89ff]">{s.amount_label}</span>
                            <button type="button" className="text-slate-600 hover:text-red-400 ml-0.5" title="Desactivar servicio"
                                onClick={async () => {
                                    if (!window.confirm(`¿Desactivar "${s.name}" (${s.amount_label})? Dejará de mostrarse a los usuarios.`)) return;
                                    try { await api.delete(`/admin/service-payments/catalog/${s.lookup_key}`); toast.success('Servicio desactivado'); load(); }
                                    catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
                                }} data-testid={`deactivate-${s.lookup_key}`}>✕</button>
                        </span>
                    ))}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                    <button type="button" onClick={() => setFilter('')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${!filter ? 'bg-[#635BFF]/20 text-[#8f89ff]' : 'text-slate-500 hover:text-white'}`}>Todas ({data.transactions.length})</button>
                    {Object.entries(data.counts).map(([k, v]) => (
                        <button key={k} type="button" onClick={() => setFilter(k)} data-testid={`pay-filter-${k}`}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${filter === k ? 'bg-[#635BFF]/20 text-[#8f89ff]' : 'text-slate-500 hover:text-white'}`}>{k} ({v})</button>
                    ))}
                </div>

                <div className="rounded-xl bg-slate-900/70 border border-slate-800 divide-y divide-slate-800/60">
                    {rows.length === 0 && <p className="text-slate-500 text-sm text-center py-8">Sin transacciones.</p>}
                    {rows.map((t) => (
                        <div key={t.session_id} className="px-4 py-3 flex items-center gap-3 flex-wrap" data-testid={`tx-${t.session_id}`}>
                            <div className="min-w-0 flex-1">
                                <p className="text-white text-sm font-semibold truncate">{t.service_name} <span className="text-slate-500 text-xs">· {t.user_name} ({t.user_email})</span></p>
                                <p className="text-slate-500 text-[10.5px] font-mono truncate">{t.session_id} · {new Date(t.created_at).toLocaleString('es-ES')}</p>
                            </div>
                            <span className="text-white font-mono font-bold text-sm">{fmt(t.amount, t.currency)}</span>
                            <span className={`px-2 py-1 rounded-md text-[10.5px] font-bold capitalize ${CHIP[t.payment_status] || ''}`}>{t.payment_status}</span>
                            {['paid', 'refunded'].includes(t.payment_status) && (
                                <button type="button" className="px-2 py-1 rounded-md bg-[#635BFF]/15 text-[#8f89ff] text-[11px] font-semibold"
                                    onClick={async () => {
                                        try {
                                            const r = await api.get(`/service-payments/${t.session_id}/invoice`, { responseType: 'blob' });
                                            const url = URL.createObjectURL(r.data);
                                            const a = document.createElement('a');
                                            a.href = url; a.download = `factura-${t.session_id.slice(-6)}.pdf`; a.click();
                                            URL.revokeObjectURL(url);
                                        } catch { toast.error('Error al descargar'); }
                                    }} data-testid={`invoice-${t.session_id}`}>
                                    Factura PDF
                                </button>
                            )}
                            {t.payment_status === 'paid' && (
                                <button type="button" className="px-2 py-1 rounded-md bg-amber-500/10 text-amber-300 text-[11px] font-semibold"
                                    onClick={async () => {
                                        if (!window.confirm('¿Reembolsar este pago completo?')) return;
                                        try { await api.post(`/admin/service-payments/${t.session_id}/refund`); toast.success('Reembolso solicitado'); load(); }
                                        catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
                                    }} data-testid={`refund-${t.session_id}`}>
                                    <RotateCcw className="w-3 h-3 inline mr-1" /> Reembolsar
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </Layout>
    );
}
