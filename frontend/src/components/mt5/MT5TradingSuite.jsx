import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Activity, List } from 'lucide-react';
import { MarketWatch, TradingPanel } from './MarketWatchAndTrading';
import { OpenPositions, PendingOrders } from './MT5Sections';

// ─────────────────── Trading workspace: gráfico + market watch + posiciones/pendientes ───────────────────
export const MT5TradingSuite = ({ account, onAccountChange }) => {
    const [tab, setTab] = useState('positions');
    const [tradingSymbol, setTradingSymbol] = useState(null);
    const [tradingDir, setTradingDir] = useState('buy');
    const [tradingOpen, setTradingOpen] = useState(false);
    const [tradingPrefill, setTradingPrefill] = useState({ sl: undefined, tp: undefined });

    const openTrade = (sym, dir, prefill = {}) => {
        setTradingSymbol(sym);
        setTradingDir(dir);
        setTradingPrefill({ sl: prefill.sl, tp: prefill.tp });
        setTradingOpen(true);
    };

    const TABS = [
        { id: 'positions', label: 'Posiciones abiertas', icon: Activity },
        { id: 'pending',   label: 'Órdenes pendientes',  icon: List },
    ];

    return (
        <div data-testid="mt5-trading-suite" className="space-y-4">
            {/* Market Watch + gráfico principal */}
            <div className="rounded-xl border border-slate-800/80 bg-gradient-to-br from-[#0A111F] via-[#0E182A] to-[#080E1A] p-3 sm:p-4">
                <MarketWatch onOpenTrade={openTrade} accountBalance={account?.balance} />
            </div>

            {/* Posiciones / Pendientes */}
            <div className="rounded-xl border border-slate-800/80 bg-gradient-to-br from-[#0A111F] to-[#080E1A] overflow-hidden">
                <div className="flex items-center gap-1 px-2 py-2 border-b border-slate-800/80 overflow-x-auto scrollbar-hide">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            data-testid={`mt5-suite-tab-${t.id}`}
                            data-no-hover
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all min-h-[36px] ${
                                tab === t.id
                                    ? 'bg-[#D4AF37]/12 text-[#F3D372] ring-1 ring-[#D4AF37]/30'
                                    : 'text-slate-500 hover:text-slate-200'
                            }`}
                        >
                            <t.icon className="w-3.5 h-3.5" /> {t.label}
                        </button>
                    ))}
                </div>
                <div className="p-3 sm:p-4">
                    {tab === 'positions' && <OpenPositions onChange={onAccountChange} />}
                    {tab === 'pending'   && <PendingOrders />}
                </div>
            </div>

            <TradingPanel
                open={tradingOpen}
                symbol={tradingSymbol}
                direction={tradingDir}
                prefillSl={tradingPrefill.sl}
                prefillTp={tradingPrefill.tp}
                onClose={() => setTradingOpen(false)}
                onDone={onAccountChange}
            />
        </div>
    );
};

// Historial de operaciones cerradas (con filtro) — usado en la pestaña Historial
export const HistoryTable = () => {
    const [ops, setOps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');

    useEffect(() => {
        let cancelled = false;
        api.get('/mt5/operations?status=closed&limit=200').then(r => {
            if (!cancelled) { setOps(r.data.closed || []); setLoading(false); }
        }).catch(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const filtered = ops.filter(o => !q || (o.symbol || '').toLowerCase().includes(q.toLowerCase()) || String(o.ticket).includes(q));
    const totalPL = filtered.reduce((s, o) => s + (o.profit || 0) + (o.swap || 0) + (o.commission || 0), 0);

    const fmtPrice = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
    const fmtDT = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

    return (
        <div>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <input
                    type="text"
                    placeholder="Filtrar por símbolo o ticket"
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    data-testid="mt5-history-filter"
                    className="flex-1 h-9 px-3 rounded-lg bg-slate-950/60 border border-slate-800 text-white text-sm focus:outline-none focus:border-[#D4AF37]/40"
                />
                <div className="text-right text-[11px]">
                    <p className="text-slate-500">PnL filtrado</p>
                    <p className={`font-mono tabular-nums font-bold ${totalPL >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {totalPL >= 0 ? '+' : ''}${Math.abs(totalPL).toFixed(2)}
                    </p>
                </div>
            </div>
            {loading && <p className="text-slate-500 text-sm py-8 text-center">Cargando historial…</p>}
            {!loading && filtered.length === 0 && <p className="text-slate-500 text-sm py-10 text-center">Sin operaciones cerradas.</p>}
            {!loading && filtered.length > 0 && (
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 overflow-hidden max-h-96 overflow-y-auto">
                    <table className="w-full text-[11.5px]">
                        <thead className="sticky top-0 bg-slate-950/95">
                            <tr className="text-slate-500 text-left border-b border-slate-800/80">
                                <th className="py-2 px-3 font-bold uppercase tracking-[0.12em] text-[10px]">Ticket</th>
                                <th className="py-2 px-3 font-bold uppercase tracking-[0.12em] text-[10px]">Símbolo</th>
                                <th className="py-2 px-3 font-bold uppercase tracking-[0.12em] text-[10px]">Dir</th>
                                <th className="py-2 px-3 font-bold uppercase tracking-[0.12em] text-[10px] text-right">Lot</th>
                                <th className="py-2 px-3 font-bold uppercase tracking-[0.12em] text-[10px] text-right">E/C</th>
                                <th className="py-2 px-3 font-bold uppercase tracking-[0.12em] text-[10px] text-right">Cierre</th>
                                <th className="py-2 px-3 font-bold uppercase tracking-[0.12em] text-[10px] text-right">Profit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(op => {
                                const p = Number(op.profit || 0);
                                return (
                                    <tr key={op.id} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                                        <td className="py-2 px-3 text-slate-400 font-mono tabular-nums">#{op.ticket}</td>
                                        <td className="py-2 px-3 text-white font-mono font-bold">{op.symbol_name || op.symbol}</td>
                                        <td className={`py-2 px-3 font-bold ${op.direction === 'buy' ? 'text-emerald-300' : 'text-rose-300'}`}>{op.direction === 'buy' ? 'BUY' : 'SELL'}</td>
                                        <td className="py-2 px-3 text-right text-white font-mono tabular-nums">{op.lot}</td>
                                        <td className="py-2 px-3 text-right text-slate-400 font-mono tabular-nums text-[10px] whitespace-nowrap">{fmtPrice(op.open_price)} → {fmtPrice(op.close_price)}</td>
                                        <td className="py-2 px-3 text-right text-slate-500 font-mono text-[10px] whitespace-nowrap">{fmtDT(op.close_time)}</td>
                                        <td className={`py-2 px-3 text-right font-mono tabular-nums font-bold ${p >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{p >= 0 ? '+' : ''}${Math.abs(p).toFixed(2)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
