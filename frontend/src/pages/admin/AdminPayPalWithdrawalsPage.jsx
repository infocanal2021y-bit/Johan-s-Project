import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { Wallet, RefreshCw, Loader2, ChevronDown, ArrowRight, CheckCircle2, XCircle, Ban, Search, Zap, RotateCw, AlertTriangle } from 'lucide-react';
import api from '../../lib/api';
import { PP_STATUS, StatusPill, Timeline, fmtDate, fmtMoney } from '../../components/paypal/PayPalWithdrawalHistory';

const FILTERS = ['all', 'requested', 'in_review', 'processing', 'payout_sent', 'completed', 'rejected', 'cancelled'];
const NEXT = { requested: 'in_review', in_review: 'processing' };

const ActionBar = ({ r, onDone, payouts }) => {
    const [mode, setMode] = useState(null); // complete | reject | cancel
    const [txn, setTxn] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const run = async (path, body) => {
        setBusy(true);
        try { await api.post(`/admin/paypal-withdrawals/${r.id}/${path}`, body); toast.success('Actualizado'); setMode(null); setTxn(''); setNote(''); onDone(); }
        catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
        finally { setBusy(false); }
    };
    if (['completed', 'rejected', 'cancelled', 'expired', 'awaiting_code'].includes(r.status)) return null;
    const inputCls = 'h-9 flex-1 px-3 rounded-md bg-slate-950/70 border border-slate-800 text-white text-xs placeholder:text-slate-600';
    const canAutoPay = payouts?.configured && ['in_review', 'processing'].includes(r.status) && !r.payout_batch_id;
    return (
        <div className="space-y-2" data-testid={`pp-admin-actions-${r.id}`}>
            {!mode && (
                <div className="flex flex-wrap gap-2">
                    {r.status === 'payout_sent' && <Button size="sm" onClick={() => run('sync', {})} disabled={busy} className="h-8 bg-violet-600 hover:bg-violet-700 text-xs" data-testid={`pp-sync-${r.id}`}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5 mr-1" />} Sincronizar con PayPal</Button>}
                    {NEXT[r.status] && <Button size="sm" onClick={() => run('advance', {})} disabled={busy} className="h-8 bg-cyan-600 hover:bg-cyan-700 text-xs" data-testid={`pp-advance-${r.id}`}><ArrowRight className="w-3.5 h-3.5 mr-1" /> Pasar a {PP_STATUS[NEXT[r.status]].label}</Button>}
                    {canAutoPay && <Button size="sm" onClick={() => setMode('pay')} className="h-8 bg-[#009cde] hover:bg-[#0088c4] text-xs" data-testid={`pp-pay-${r.id}`}><Zap className="w-3.5 h-3.5 mr-1" /> Pagar con PayPal{payouts.mode === 'sandbox' ? ' (sandbox)' : ''}</Button>}
                    <Button size="sm" onClick={() => setMode('complete')} className="h-8 bg-emerald-600 hover:bg-emerald-700 text-xs" data-testid={`pp-complete-${r.id}`}><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {r.status === 'payout_sent' ? 'Completar manual' : 'Completar'}</Button>
                    <Button size="sm" variant="outline" onClick={() => setMode('reject')} className="h-8 border-red-500/40 text-red-300 hover:bg-red-500/10 text-xs" data-testid={`pp-reject-${r.id}`}><XCircle className="w-3.5 h-3.5 mr-1" /> Rechazar</Button>
                    <Button size="sm" variant="outline" onClick={() => setMode('cancel')} className="h-8 border-slate-600 text-slate-300 hover:bg-white/5 text-xs" data-testid={`pp-cancel-${r.id}`}><Ban className="w-3.5 h-3.5 mr-1" /> Cancelar</Button>
                </div>
            )}
            {mode === 'pay' && (
                <div className="rounded-lg border border-[#009cde]/40 bg-[#009cde]/10 p-3 space-y-2" data-testid={`pp-pay-confirm-box-${r.id}`}>
                    <p className="text-xs text-white">Se enviarán <strong>{fmtMoney(r.net_amount, r.currency)}</strong> desde tu cuenta PayPal Business a <strong className="font-mono">{r.paypal_email}</strong> ({payouts.mode === 'live' ? 'DINERO REAL' : 'sandbox'}). Esta acción no se puede deshacer.</p>
                    <div className="flex gap-2">
                        <Button size="sm" onClick={() => run('pay', {})} disabled={busy} className="h-8 bg-[#009cde] hover:bg-[#0088c4] text-xs" data-testid={`pp-pay-confirm-${r.id}`}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1" />} Confirmar envío</Button>
                        <button onClick={() => setMode(null)} className="text-xs text-slate-400 hover:text-white">Volver</button>
                    </div>
                </div>
            )}
            {mode === 'complete' && (
                <div className="flex flex-wrap gap-2 items-center">
                    <input value={txn} onChange={(e) => setTxn(e.target.value)} placeholder="ID de transacción PayPal (obligatorio)" className={inputCls} data-testid={`pp-txn-input-${r.id}`} />
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" className={inputCls} />
                    <Button size="sm" onClick={() => run('complete', { paypal_txn_id: txn, note })} disabled={busy || txn.trim().length < 6} className="h-8 bg-emerald-600 hover:bg-emerald-700 text-xs" data-testid={`pp-complete-confirm-${r.id}`}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirmar pago enviado'}</Button>
                    <button onClick={() => setMode(null)} className="text-xs text-slate-400 hover:text-white">Volver</button>
                </div>
            )}
            {(mode === 'reject' || mode === 'cancel') && r.status === 'payout_sent' && <p className="text-[11px] text-amber-300 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> El pago ya salió hacia PayPal: sincroniza primero. Solo anula si PayPal lo devolvió.</p>}
            {(mode === 'reject' || mode === 'cancel') && (
                <div className="flex flex-wrap gap-2 items-center">
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Motivo de ${mode === 'reject' ? 'rechazo' : 'cancelación'} (obligatorio) · se reembolsa al usuario`} className={inputCls} data-testid={`pp-reason-input-${r.id}`} />
                    <Button size="sm" onClick={() => run(mode, { note })} disabled={busy || note.trim().length < 3} className="h-8 bg-red-600 hover:bg-red-700 text-xs" data-testid={`pp-${mode}-confirm-${r.id}`}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : `Confirmar ${mode === 'reject' ? 'rechazo' : 'cancelación'}`}</Button>
                    <button onClick={() => setMode(null)} className="text-xs text-slate-400 hover:text-white">Volver</button>
                </div>
            )}
        </div>
    );
};

export const AdminPayPalWithdrawalsPage = () => {
    const [data, setData] = useState(null);
    const [filter, setFilter] = useState('all');
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(null);
    const load = useCallback(async () => {
        try { const r = await api.get('/admin/paypal-withdrawals', { params: { status: filter } }); setData(r.data); }
        catch { toast.error('No se pudo cargar la cola PayPal'); }
    }, [filter]);
    useEffect(() => { load(); }, [load]);

    const items = useMemo(() => {
        const nq = q.trim().toLowerCase();
        return (data?.items || []).filter((r) => !nq || [r.reference, r.user_name, r.user_email, r.paypal_email, r.paypal_txn_id].some((v) => (v || '').toLowerCase().includes(nq)));
    }, [data, q]);
    const counts = data?.counts || {};
    const pendingTotal = (counts.requested || 0) + (counts.in_review || 0) + (counts.processing || 0);

    return (
        <Layout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5" data-testid="admin-paypal-page">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-[10.5px] uppercase tracking-[0.14em] text-amber-300 font-bold">Administración · Retiros</p>
                        <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1 flex items-center gap-2"><Wallet className="w-7 h-7 text-[#009cde]" /> Retiros PayPal</h1>
                        <p className="text-slate-400 text-[13px] mt-1.5">Pago manual desde PayPal Business · al completar registra el ID de transacción</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {data?.payouts && (
                            <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${data.payouts.configured ? (data.payouts.mode === 'live' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/30') : 'bg-slate-500/15 text-slate-400 border-slate-500/30'}`} data-testid="pp-payouts-mode">
                                {data.payouts.configured ? `Payouts API · ${data.payouts.mode}` : 'Payouts API · sin configurar'}
                            </span>
                        )}
                        <Button onClick={load} variant="outline" className="bg-white/5 border-white/15 text-white hover:bg-white/10" data-testid="pp-admin-refresh"><RefreshCw className="w-4 h-4 mr-1.5" /> Refrescar</Button>
                    </div>
                </div>
                {data?.payouts && !data.payouts.configured && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-100 flex items-start gap-2" data-testid="pp-payouts-not-configured">
                        <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold">Pago automático desactivado · los retiros se completan manualmente</p>
                            <p className="text-amber-100/80 mt-0.5">Para activar PayPal Payouts añade en <span className="font-mono">backend/.env</span>: <span className="font-mono">PAYPAL_CLIENT_ID</span>, <span className="font-mono">PAYPAL_CLIENT_SECRET</span> y <span className="font-mono">PAYPAL_MODE</span> (sandbox | live). Opcional: <span className="font-mono">PAYPAL_WEBHOOK_ID</span> para confirmación instantánea por webhook (URL: <span className="font-mono">/api/paypal/webhook</span>). Obtén las credenciales en developer.paypal.com → Apps & Credentials.</p>
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card className="p-4 bg-gradient-to-br from-[#003087] to-[#009cde]/60 border-0"><p className="text-[9.5px] uppercase tracking-wider text-white/70 font-bold">Pendientes</p><p className="text-white text-2xl font-bold mt-1" data-testid="pp-kpi-pending">{pendingTotal}</p></Card>
                    <Card className="p-4 bg-white/5 border-white/10"><p className="text-[9.5px] uppercase tracking-wider text-amber-300 font-bold">En revisión</p><p className="text-white text-2xl font-bold mt-1">{counts.in_review || 0}</p></Card>
                    <Card className="p-4 bg-white/5 border-white/10"><p className="text-[9.5px] uppercase tracking-wider text-emerald-300 font-bold">Completados</p><p className="text-white text-2xl font-bold mt-1">{counts.completed || 0}</p></Card>
                    <Card className="p-4 bg-white/5 border-white/10"><p className="text-[9.5px] uppercase tracking-wider text-red-300 font-bold">Rechazados / Cancelados</p><p className="text-white text-2xl font-bold mt-1">{(counts.rejected || 0) + (counts.cancelled || 0)}</p></Card>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {FILTERS.map((f) => (
                        <button key={f} onClick={() => setFilter(f)} data-testid={`pp-filter-${f}`}
                            className={`px-3 py-1.5 rounded-full text-[11.5px] font-semibold border transition-colors ${filter === f ? 'bg-[#009cde]/15 text-[#7dd3fc] border-[#009cde]/40' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}>
                            {f === 'all' ? 'Todos' : PP_STATUS[f].label}{f !== 'all' && counts[f] ? ` (${counts[f]})` : ''}
                        </button>
                    ))}
                    <div className="ml-auto flex items-center gap-2 h-9 px-3 rounded-md bg-white/5 border border-white/10 min-w-[220px]"><Search className="w-3.5 h-3.5 text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Referencia, usuario, cuenta PayPal, ID…" className="flex-1 bg-transparent outline-none text-[12.5px] text-white placeholder:text-slate-500" data-testid="pp-admin-search" /></div>
                </div>
                <Card className="bg-slate-900/60 border border-slate-800 overflow-hidden">
                    {!data ? <div className="py-12 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin text-slate-400" /></div>
                        : items.length === 0 ? <p className="py-12 text-center text-slate-500 text-[13px]" data-testid="pp-admin-empty">No hay retiros PayPal para este filtro.</p>
                        : items.map((r) => (
                            <div key={r.id} className="border-b border-slate-800/80 last:border-0" data-testid={`pp-admin-row-${r.id}`} data-status={r.status}>
                                <button onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full grid grid-cols-[1fr_auto] sm:grid-cols-[1.2fr_1.4fr_1fr_auto_auto] items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40">
                                    <div className="min-w-0"><p className="text-white text-sm font-mono">{r.reference}</p><p className="text-slate-500 text-[11px]">{fmtDate(r.created_at)}</p></div>
                                    <div className="hidden sm:block min-w-0"><p className="text-white text-[13px] truncate">{r.user_name}</p><p className="text-slate-500 text-[11px] truncate">→ {r.paypal_email}</p></div>
                                    <p className="hidden sm:block text-white font-mono text-sm text-right">{fmtMoney(r.net_amount, r.currency)}</p>
                                    <StatusPill status={r.status} testId={`pp-admin-status-${r.id}`} />
                                    <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open === r.id ? 'rotate-180' : ''}`} />
                                </button>
                                {open === r.id && (
                                    <div className="px-4 pb-4 space-y-3 bg-slate-950/40">
                                        <div className="grid sm:grid-cols-3 gap-2 text-[11.5px] pt-3">
                                            <p className="text-slate-400">Usuario: <span className="text-white">{r.user_name}</span> · {r.user_email}</p>
                                            <p className="text-slate-400">Titular PayPal: <span className="text-white">{r.paypal_holder}</span></p>
                                            <p className="text-slate-400">Importe: <span className="text-white font-mono">{fmtMoney(r.amount, r.currency)}</span>{r.paypal_txn_id && <> · ID PayPal <span className="text-emerald-300 font-mono">{r.paypal_txn_id}</span></>}</p>
                                            {r.payout_batch_id && <p className="text-slate-400 sm:col-span-3" data-testid={`pp-payout-info-${r.id}`}>Payout {r.payout_mode}: batch <span className="text-violet-300 font-mono">{r.payout_batch_id}</span> · estado PayPal <span className="text-white">{r.payout_item_status || r.payout_batch_status || '—'}</span>{r.payout_fee && <> · comisión PayPal {r.payout_fee}</>}{r.payout_last_sync_at && <> · sync {fmtDate(r.payout_last_sync_at)}</>}</p>}
                                            {r.payout_last_error && <p className="text-red-300 sm:col-span-3">Último error PayPal: {r.payout_last_error}</p>}
                                        </div>
                                        <ActionBar r={r} onDone={load} payouts={data?.payouts} />
                                        <Timeline items={r.status_timeline} testId={`pp-admin-timeline-${r.id}`} />
                                    </div>
                                )}
                            </div>
                        ))}
                </Card>
            </div>
        </Layout>
    );
};

export default AdminPayPalWithdrawalsPage;
