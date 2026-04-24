import { useEffect, useState, useCallback } from 'react';
import api from '../../lib/api';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Edit3, Scissors, PieChart, ArrowUpRight, ArrowDownRight, ArrowRight,
    Book, BadgeDollarSign, ArrowLeftRight, AlertTriangle,
} from 'lucide-react';

const fmtMoney = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPrice = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
const fmtDT = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// ════════════════════════ OPEN POSITIONS ════════════════════════
export const OpenPositions = ({ onChange }) => {
    const [ops, setOps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null);
    const [partial, setPartial] = useState(null);
    const [pLot, setPLot] = useState('');
    const [sl, setSl] = useState('');
    const [tp, setTp] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await api.get('/mt5/operations?status=open&limit=100');
            setOps(res.data.open || []);
        } catch (e) { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, 7000);
        return () => clearInterval(id);
    }, [load]);

    const close = async (op) => {
        try {
            await api.post(`/mt5/position/${op.id}/close`, {});
            toast.success(`Cerrada #${op.ticket}`);
            load(); onChange && onChange();
        } catch (e) { toast.error('Error cerrando'); }
    };

    const openModify = (op) => {
        setEditing(op);
        setSl(op.stop_loss || '');
        setTp(op.take_profit || '');
    };
    const submitModify = async () => {
        try {
            await api.post(`/mt5/position/${editing.id}/modify`, {
                sl: sl ? parseFloat(sl) : null,
                tp: tp ? parseFloat(tp) : null,
            });
            toast.success(`SL/TP actualizados`);
            setEditing(null);
            load();
        } catch (e) { toast.error('Error actualizando'); }
    };

    const openPartial = (op) => {
        setPartial(op);
        setPLot((op.lot / 2).toFixed(2));
    };
    const submitPartial = async () => {
        try {
            await api.post(`/mt5/position/${partial.id}/close`, { partial_lot: parseFloat(pLot) });
            toast.success('Cierre parcial ejecutado');
            setPartial(null); load(); onChange && onChange();
        } catch (e) { toast.error('Error en cierre parcial'); }
    };

    return (
        <div data-testid="mt5-open-positions">
            {loading && <p className="text-slate-500 text-sm py-8 text-center">Cargando posiciones…</p>}
            {!loading && ops.length === 0 && <p className="text-slate-500 text-sm py-10 text-center">No hay posiciones abiertas.</p>}
            {!loading && ops.length > 0 && (
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 overflow-hidden">
                    {/* Desktop table */}
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-[12px]">
                            <thead>
                                <tr className="text-slate-600 text-left border-b border-slate-800/80">
                                    <th className="py-2 px-3 font-semibold uppercase tracking-wider">Ticket</th>
                                    <th className="py-2 px-3 font-semibold uppercase tracking-wider">Símbolo</th>
                                    <th className="py-2 px-3 font-semibold uppercase tracking-wider">Dir</th>
                                    <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right">Lot</th>
                                    <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right">Entry</th>
                                    <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right">SL</th>
                                    <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right">TP</th>
                                    <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right">Profit</th>
                                    <th className="py-2 px-3 font-semibold uppercase tracking-wider"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {ops.map(op => {
                                    const isBuy = op.direction === 'buy';
                                    const p = Number(op.profit || 0);
                                    return (
                                        <tr key={op.id} className="border-b border-slate-800/40">
                                            <td className="py-2.5 px-3 text-slate-400 font-mono">#{op.ticket}</td>
                                            <td className="py-2.5 px-3 text-white font-mono">{op.symbol_name || op.symbol}</td>
                                            <td className="py-2.5 px-3">
                                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${isBuy ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                                                    {isBuy ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />} {isBuy ? 'BUY' : 'SELL'}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-3 text-right text-white font-mono tabular-nums">{op.lot}</td>
                                            <td className="py-2.5 px-3 text-right text-slate-300 font-mono tabular-nums">{fmtPrice(op.open_price)}</td>
                                            <td className="py-2.5 px-3 text-right text-rose-300 font-mono tabular-nums">{op.stop_loss ? fmtPrice(op.stop_loss) : '—'}</td>
                                            <td className="py-2.5 px-3 text-right text-emerald-300 font-mono tabular-nums">{op.take_profit ? fmtPrice(op.take_profit) : '—'}</td>
                                            <td className={`py-2.5 px-3 text-right font-mono tabular-nums font-bold ${p >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{p >= 0 ? '+' : ''}${Math.abs(p).toFixed(2)}</td>
                                            <td className="py-2.5 px-3 text-right">
                                                <div className="inline-flex gap-1">
                                                    <Button size="sm" onClick={() => openModify(op)} data-testid={`mt5-modify-${op.id}`} className="h-7 px-2 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200"><Edit3 className="w-3 h-3" /></Button>
                                                    <Button size="sm" onClick={() => openPartial(op)} data-testid={`mt5-partial-${op.id}`} className="h-7 px-2 text-[11px] bg-amber-600/70 hover:bg-amber-600 text-white"><Scissors className="w-3 h-3" /></Button>
                                                    <Button size="sm" onClick={() => close(op)} data-testid={`mt5-close-${op.id}`} className="h-7 px-2 text-[11px] bg-rose-600/80 hover:bg-rose-600 text-white"><X className="w-3 h-3" /></Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {/* Mobile cards */}
                    <div className="sm:hidden divide-y divide-slate-800/80">
                        {ops.map(op => {
                            const isBuy = op.direction === 'buy';
                            const p = Number(op.profit || 0);
                            return (
                                <div key={op.id} className="p-3 text-[11px]">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isBuy ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>{isBuy ? 'BUY' : 'SELL'}</span>
                                            <span className="text-white font-mono">{op.symbol_name || op.symbol}</span>
                                        </div>
                                        <span className={`font-mono font-bold ${p >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{p >= 0 ? '+' : ''}${Math.abs(p).toFixed(2)}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-slate-500 font-mono text-[10px]">
                                        <span>#{op.ticket}</span>
                                        <span>{op.lot} lot</span>
                                        <span>E: {fmtPrice(op.open_price)}</span>
                                    </div>
                                    <div className="flex gap-1 mt-2">
                                        <Button size="sm" onClick={() => openModify(op)} className="flex-1 h-8 text-[11px] bg-slate-800 text-slate-200"><Edit3 className="w-3 h-3 mr-1" />SL/TP</Button>
                                        <Button size="sm" onClick={() => openPartial(op)} className="flex-1 h-8 text-[11px] bg-amber-600/70 text-white"><Scissors className="w-3 h-3 mr-1" />Parcial</Button>
                                        <Button size="sm" onClick={() => close(op)} className="flex-1 h-8 text-[11px] bg-rose-600/80 text-white"><X className="w-3 h-3 mr-1" />Cerrar</Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Modify modal */}
            <AnimatePresence>
                {editing && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setEditing(null)}>
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
                            <p className="text-white font-semibold">Modificar SL/TP — #{editing.ticket}</p>
                            <p className="text-slate-500 text-xs">{editing.symbol_name} · Entry {fmtPrice(editing.open_price)}</p>
                            <label className="block">
                                <span className="text-[10px] uppercase tracking-wider text-rose-400">Stop Loss</span>
                                <input type="number" step="0.00001" value={sl} onChange={(e) => setSl(e.target.value)} className="w-full h-10 mt-1 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono tabular-nums focus:outline-none focus:border-rose-500/40" />
                            </label>
                            <label className="block">
                                <span className="text-[10px] uppercase tracking-wider text-emerald-400">Take Profit</span>
                                <input type="number" step="0.00001" value={tp} onChange={(e) => setTp(e.target.value)} className="w-full h-10 mt-1 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono tabular-nums focus:outline-none focus:border-emerald-500/40" />
                            </label>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setEditing(null)} className="flex-1 border-slate-700 text-slate-300">Cancelar</Button>
                                <Button onClick={submitModify} className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white">Guardar</Button>
                            </div>
                        </motion.div>
                    </div>
                )}
                {partial && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setPartial(null)}>
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
                            <p className="text-white font-semibold">Cierre parcial — #{partial.ticket}</p>
                            <p className="text-slate-500 text-xs">Volumen total: {partial.lot} · Cierra una fracción a precio actual.</p>
                            <label className="block">
                                <span className="text-[10px] uppercase tracking-wider text-amber-300">Volumen a cerrar</span>
                                <input type="number" step="0.01" min="0.01" max={partial.lot} value={pLot} onChange={(e) => setPLot(e.target.value)} className="w-full h-10 mt-1 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono tabular-nums focus:outline-none focus:border-amber-500/40" />
                            </label>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setPartial(null)} className="flex-1 border-slate-700 text-slate-300">Cancelar</Button>
                                <Button onClick={submitPartial} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white">Ejecutar</Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};


// ════════════════════════ PENDING ORDERS ════════════════════════
export const PendingOrders = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try { const res = await api.get('/mt5/pending'); setItems(res.data.pending || []); }
        catch { /* */ } finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); const id = setInterval(load, 8000); return () => clearInterval(id); }, [load]);

    const cancel = async (p) => {
        try { await api.delete(`/mt5/pending/${p.id}`); toast.success('Cancelada'); load(); }
        catch { toast.error('Error cancelando'); }
    };

    return (
        <div data-testid="mt5-pending-orders">
            {loading && <p className="text-slate-500 text-sm py-8 text-center">Cargando órdenes pendientes…</p>}
            {!loading && items.length === 0 && <p className="text-slate-500 text-sm py-10 text-center">No hay órdenes pendientes.</p>}
            {!loading && items.length > 0 && (
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 overflow-hidden">
                    <table className="w-full text-[12px]">
                        <thead>
                            <tr className="text-slate-600 text-left border-b border-slate-800/80">
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider">Ticket</th>
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider">Símbolo</th>
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider">Tipo</th>
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right">Lot</th>
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right">Precio</th>
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider hidden sm:table-cell">Creada</th>
                                <th className="py-2 px-3 text-right"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(p => (
                                <tr key={p.id} className="border-b border-slate-800/40">
                                    <td className="py-2 px-3 text-slate-400 font-mono">#{p.ticket}</td>
                                    <td className="py-2 px-3 text-white font-mono">{p.symbol_name || p.symbol}</td>
                                    <td className="py-2 px-3 text-amber-300 text-[11px] font-bold uppercase">{p.type?.replace('_', ' ')}</td>
                                    <td className="py-2 px-3 text-right text-white font-mono tabular-nums">{p.lot}</td>
                                    <td className="py-2 px-3 text-right text-slate-300 font-mono tabular-nums">{fmtPrice(p.price)}</td>
                                    <td className="py-2 px-3 hidden sm:table-cell text-slate-500 font-mono text-[11px]">{fmtDT(p.created_at)}</td>
                                    <td className="py-2 px-3 text-right">
                                        <Button size="sm" onClick={() => cancel(p)} className="h-7 px-2 text-[11px] bg-rose-600/70 hover:bg-rose-600 text-white">Cancelar</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};


// ════════════════════════ FUNDS (Deposit / Withdraw) ════════════════════════
export const FundsPanel = ({ account, onDone }) => {
    const [tab, setTab] = useState('deposit');
    const [amount, setAmount] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [transfers, setTransfers] = useState([]);

    const loadTransfers = useCallback(async () => {
        try { const res = await api.get('/mt5/transfers'); setTransfers(res.data.transfers || []); }
        catch { /* */ }
    }, []);
    useEffect(() => { loadTransfers(); }, [loadTransfers]);

    const submit = async () => {
        const amt = parseFloat(amount);
        if (!amt || amt < 10) { toast.error('Importe mínimo $10'); return; }
        setSubmitting(true);
        try {
            await api.post(tab === 'deposit' ? '/mt5/deposit' : '/mt5/withdraw', { amount: amt });
            toast.success(tab === 'deposit' ? 'Depósito a MT5 confirmado' : 'Retiro a Wallet confirmado');
            setAmount('');
            await loadTransfers();
            onDone && onDone();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error procesando transferencia');
        } finally { setSubmitting(false); }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="mt5-funds-panel">
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5">
                <div className="grid grid-cols-2 gap-1 bg-slate-950 rounded-lg p-1 border border-slate-800 mb-4">
                    {[
                        { id: 'deposit',  label: 'Depositar a MT5',  icon: ArrowRight },
                        { id: 'withdraw', label: 'Retirar a Wallet', icon: ArrowLeftRight },
                    ].map(t => (
                        <button key={t.id} type="button" onClick={() => setTab(t.id)} data-no-hover className={`py-2 rounded-md text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all ${tab === t.id ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>
                            <t.icon className="w-3.5 h-3.5" /> {t.label}
                        </button>
                    ))}
                </div>
                <div className="space-y-3">
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                        {tab === 'deposit'
                            ? 'Mueve USD desde tu Wallet Lionsbit a tu cuenta MT5. Disponible inmediatamente.'
                            : 'Retira margen libre desde MT5 a tu Wallet Lionsbit en USD.'}
                    </p>
                    <div className="flex items-center justify-between rounded-lg bg-slate-950/60 border border-slate-800 px-3 py-2 text-[11px]">
                        <span className="text-slate-500">{tab === 'deposit' ? 'Cuenta MT5' : 'Margen libre MT5'}</span>
                        <span className="text-white font-mono tabular-nums font-bold">{fmtMoney(tab === 'deposit' ? account?.balance : account?.free_margin)}</span>
                    </div>
                    <label className="block">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">Importe (USD)</span>
                        <input type="number" step="0.01" min="10" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Mínimo 10"
                            className="w-full h-11 mt-1 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono tabular-nums text-lg focus:outline-none focus:border-cyan-500/50" data-testid="mt5-funds-amount" />
                    </label>
                    <Button onClick={submit} disabled={submitting} className="w-full h-11 text-white font-bold" style={{ backgroundColor: tab === 'deposit' ? '#0ecb81' : '#14549C' }} data-testid="mt5-funds-submit">
                        <BadgeDollarSign className="w-4 h-4 mr-2" />
                        {submitting ? 'Procesando…' : tab === 'deposit' ? 'Confirmar depósito' : 'Confirmar retiro'}
                    </Button>
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/25">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-300 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-200 leading-relaxed">El retiro a Wallet solo usa margen libre — no afecta operaciones abiertas.</p>
                    </div>
                </div>
            </div>

            {/* Transfer history */}
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500 font-semibold mb-3">Historial de transferencias</p>
                {transfers.length === 0 && <p className="text-slate-600 text-sm py-6 text-center">Sin movimientos registrados.</p>}
                {transfers.length > 0 && (
                    <div className="divide-y divide-slate-800/60 max-h-80 overflow-y-auto">
                        {transfers.map(tx => (
                            <div key={tx.id} className="flex items-center justify-between gap-3 py-2.5 text-[12px]">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${tx.direction === 'deposit' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                                        {tx.direction === 'deposit' ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-white text-[12px] truncate">{tx.direction === 'deposit' ? 'Depósito a MT5' : 'Retiro a Wallet'}</p>
                                        <p className="text-slate-600 text-[10px]">{fmtDT(tx.created_at)}</p>
                                    </div>
                                </div>
                                <span className={`font-mono tabular-nums font-bold ${tx.direction === 'deposit' ? 'text-emerald-300' : 'text-amber-300'}`}>
                                    {tx.direction === 'deposit' ? '+' : '−'}{fmtMoney(tx.amount)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};


// ════════════════════════ JOURNAL ════════════════════════
export const JournalPanel = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try { const res = await api.get('/mt5/journal?limit=80'); if (!cancelled) setEvents(res.data.events || []); }
            catch { /* */ } finally { if (!cancelled) setLoading(false); }
        };
        load();
        const id = setInterval(load, 12000);
        return () => { cancelled = true; clearInterval(id); };
    }, []);

    const KIND_TONE = {
        order:    { bg: 'bg-cyan-500/10',    color: 'text-cyan-300',    label: 'ORDEN' },
        pending:  { bg: 'bg-amber-500/10',   color: 'text-amber-300',   label: 'PENDING' },
        close:    { bg: 'bg-rose-500/10',    color: 'text-rose-300',    label: 'CIERRE' },
        modify:   { bg: 'bg-violet-500/10',  color: 'text-violet-300',  label: 'MODIFICAR' },
        funds:    { bg: 'bg-emerald-500/10', color: 'text-emerald-300', label: 'FONDOS' },
    };

    return (
        <div data-testid="mt5-journal">
            {loading && <p className="text-slate-500 text-sm py-8 text-center">Cargando journal…</p>}
            {!loading && events.length === 0 && <p className="text-slate-500 text-sm py-10 text-center">Sin eventos registrados.</p>}
            {!loading && events.length > 0 && (
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 divide-y divide-slate-800/80 max-h-96 overflow-y-auto">
                    {events.map(e => {
                        const t = KIND_TONE[e.kind] || { bg: 'bg-slate-700/20', color: 'text-slate-300', label: e.kind?.toUpperCase() || '—' };
                        return (
                            <div key={e.id} className="flex items-center gap-3 px-3 py-2.5 text-[11.5px]">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider ${t.bg} ${t.color}`}>{t.label}</span>
                                <p className="text-slate-200 flex-1 min-w-0 truncate">{e.text}</p>
                                <span className="text-slate-600 text-[10px] font-mono flex-shrink-0">{fmtDT(e.created_at)}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};


// ════════════════════════ STATEMENT / REPORT ════════════════════════
export const StatementPanel = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        api.get('/mt5/statement').then(r => { if (!cancelled) { setData(r.data); setLoading(false); } }).catch(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    if (loading) return <p className="text-slate-500 text-sm py-8 text-center">Generando reporte…</p>;
    if (!data) return <p className="text-slate-500 text-sm py-8 text-center">Sin datos.</p>;

    const { series, totals } = data;
    const equityMax = Math.max(...series.map(s => s.equity));
    const equityMin = Math.min(...series.map(s => s.equity));
    const range = Math.max(equityMax - equityMin, 1);
    const W = 800, H = 120, PAD = 6;
    const points = series.map((s, i) => {
        const x = PAD + (i / (series.length - 1)) * (W - PAD * 2);
        const y = H - PAD - ((s.equity - equityMin) / range) * (H - PAD * 2);
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className="space-y-5" data-testid="mt5-statement">
            {/* Top totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: 'Total trades', value: totals.total_trades, color: 'text-white' },
                    { label: 'Win rate',     value: `${totals.win_rate}%`, color: 'text-emerald-300' },
                    { label: 'PnL total',    value: `${totals.total_pnl >= 0 ? '+' : ''}${fmtMoney(totals.total_pnl)}`, color: totals.total_pnl >= 0 ? 'text-emerald-300' : 'text-rose-300' },
                    { label: 'Profit factor',value: totals.profit_factor ? totals.profit_factor : '—', color: 'text-cyan-300' },
                ].map(k => (
                    <div key={k.label} className="rounded-lg bg-slate-900/60 border border-slate-800/80 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{k.label}</p>
                        <p className={`text-lg font-mono tabular-nums font-bold mt-0.5 ${k.color}`}>{k.value}</p>
                    </div>
                ))}
            </div>

            {/* Equity curve */}
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500 font-semibold mb-3 flex items-center gap-1.5">
                    <PieChart className="w-3 h-3 text-cyan-400" /> Curva de equity · 30 días
                </p>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="eqGrad" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
                            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <polyline points={`${PAD},${H} ${points} ${W - PAD},${H}`} fill="url(#eqGrad)" stroke="none" />
                    <polyline points={points} fill="none" stroke="#22d3ee" strokeWidth="1.5" />
                </svg>
                <div className="flex justify-between text-[10px] text-slate-600 font-mono mt-1">
                    <span>{series[0]?.date}</span>
                    <span>{series[series.length - 1]?.date}</span>
                </div>
            </div>

            {/* Details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: 'Wins',      value: totals.wins,       color: 'text-emerald-300' },
                    { label: 'Losses',    value: totals.losses,     color: 'text-rose-300' },
                    { label: 'Mejor',     value: `${totals.best_trade >= 0 ? '+' : ''}${fmtMoney(totals.best_trade)}`, color: 'text-emerald-300' },
                    { label: 'Peor',      value: fmtMoney(totals.worst_trade), color: 'text-rose-300' },
                    { label: 'Prom. win', value: fmtMoney(totals.avg_win), color: 'text-emerald-200' },
                    { label: 'Prom. loss',value: fmtMoney(totals.avg_loss), color: 'text-rose-200' },
                ].map(k => (
                    <div key={k.label} className="rounded-lg bg-slate-900/60 border border-slate-800/80 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{k.label}</p>
                        <p className={`text-sm font-mono tabular-nums font-bold mt-0.5 ${k.color}`}>{k.value}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

// Hidden icon imports placeholders to keep lint happy when tree-shaken
export const _iconIndex = { Book };
