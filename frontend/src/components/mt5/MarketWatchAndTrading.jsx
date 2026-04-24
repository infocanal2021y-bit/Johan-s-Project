import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import api from '../../lib/api';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { ArrowUpRight, ArrowDownRight, Zap, Search, Layers, LineChart as LineChartIcon } from 'lucide-react';
import { MT5Chart } from './MT5Chart';

const fmtPrice = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 });

export const MarketWatch = ({ onOpenTrade, accountBalance }) => {
    const [symbols, setSymbols] = useState([]);
    const [filter, setFilter] = useState('');
    const [cat, setCat] = useState('all');
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);

    const load = useCallback(async () => {
        try {
            const res = await api.get('/mt5/symbols');
            setSymbols(res.data.symbols || []);
        } catch (e) { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, 8000);
        return () => clearInterval(id);
    }, [load]);

    // Keep `selected` in sync with latest bid/ask from the polling
    useEffect(() => {
        if (!selected) return;
        const fresh = symbols.find(s => s.symbol === selected.symbol);
        if (fresh && (fresh.bid !== selected.bid || fresh.ask !== selected.ask)) {
            setSelected(fresh);
        }
    }, [symbols, selected]);

    const cats = [
        { id: 'all',     label: 'Todos' },
        { id: 'forex',   label: 'Forex' },
        { id: 'metals',  label: 'Metales' },
        { id: 'crypto',  label: 'Cripto' },
        { id: 'indices', label: 'Índices' },
        { id: 'energy',  label: 'Energía' },
    ];

    const filtered = symbols.filter(s =>
        (cat === 'all' || s.category === cat)
        && (!filter || s.symbol.toLowerCase().includes(filter.toLowerCase()) || s.name.toLowerCase().includes(filter.toLowerCase()))
    );

    // Auto-select the first visible symbol so the chart is never empty
    useEffect(() => {
        if (!selected && filtered.length > 0) setSelected(filtered[0]);
    }, [filtered, selected]);

    return (
        <div data-testid="mt5-market-watch" className="space-y-3">
            {/* Live chart — mini candlestick for the currently selected asset */}
            {selected && (
                <MT5Chart
                    symbol={selected}
                    accountBalance={accountBalance}
                    onClose={() => setSelected(null)}
                    onOpenTrade={onOpenTrade}
                />
            )}

            {/* Filter bar */}
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Buscar símbolo (EURUSD, BTC, S&P 500...)"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="w-full h-9 pl-8 pr-3 rounded-lg bg-slate-950/60 border border-slate-800 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50"
                    />
                </div>
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                    {cats.map(c => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => setCat(c.id)}
                            data-no-hover
                            className={`px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
                                cat === c.id
                                    ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30'
                                    : 'text-slate-500 hover:text-slate-200'
                            }`}
                        >{c.label}</button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 overflow-hidden">
                {loading && <p className="text-slate-500 text-sm py-10 text-center">Cargando Market Watch…</p>}
                {!loading && filtered.length === 0 && <p className="text-slate-500 text-sm py-10 text-center">Sin resultados</p>}
                {!loading && filtered.length > 0 && (
                    <table className="w-full text-[12px]">
                        <thead>
                            <tr className="text-slate-600 text-left border-b border-slate-800/80">
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider">Símbolo</th>
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right">Bid</th>
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right">Ask</th>
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right hidden sm:table-cell">Spread</th>
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right">Cambio</th>
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(s => {
                                const isSel = selected?.symbol === s.symbol;
                                return (
                                <tr
                                    key={s.symbol}
                                    onClick={() => setSelected(s)}
                                    data-testid={`mt5-row-${s.symbol}`}
                                    className={`border-b border-slate-800/40 transition-colors cursor-pointer ${
                                        isSel
                                            ? 'bg-cyan-500/10 ring-1 ring-inset ring-cyan-500/30'
                                            : 'hover:bg-slate-800/30'
                                    }`}
                                >
                                    <td className="py-2 px-3">
                                        <div className="flex items-center gap-1.5">
                                            {isSel && <LineChartIcon className="w-3 h-3 text-cyan-400" />}
                                            <p className="text-white font-mono">{s.symbol}</p>
                                        </div>
                                        <p className="text-slate-500 text-[10px]">{s.name}</p>
                                    </td>
                                    <td className="py-2 px-3 text-right text-rose-300 font-mono tabular-nums">{fmtPrice(s.bid)}</td>
                                    <td className="py-2 px-3 text-right text-emerald-300 font-mono tabular-nums">{fmtPrice(s.ask)}</td>
                                    <td className="py-2 px-3 text-right text-slate-400 font-mono tabular-nums hidden sm:table-cell">{s.spread_pips}</td>
                                    <td className={`py-2 px-3 text-right font-mono tabular-nums ${s.change_pct_24h >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                                        {s.change_pct_24h >= 0 ? '+' : ''}{s.change_pct_24h}%
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                        <div className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                                            <Button size="sm" onClick={() => onOpenTrade && onOpenTrade(s, 'sell')} className="h-7 px-2 text-[11px] bg-rose-600/80 hover:bg-rose-600 text-white">Sell</Button>
                                            <Button size="sm" onClick={() => onOpenTrade && onOpenTrade(s, 'buy')} className="h-7 px-2 text-[11px] bg-emerald-600/80 hover:bg-emerald-600 text-white">Buy</Button>
                                        </div>
                                    </td>
                                </tr>
                            );})}
                        </tbody>
                    </table>
                )}
            </div>
            <p className="text-[10px] text-slate-600 text-right">Precios indicativos · actualiza cada 8 s · velas cada 5 s</p>
        </div>
    );
};

// ────────── Trading Panel (modal) ──────────
export const TradingPanel = ({ open, symbol, direction, onClose, onDone, prefillSl, prefillTp }) => {
    const [mode, setMode] = useState('market');
    const [lot, setLot] = useState('0.10');
    const [price, setPrice] = useState('');
    const [sl, setSl] = useState('');
    const [tp, setTp] = useState('');
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [calc, setCalc] = useState(null);

    const pendingTypeOptions = direction === 'buy'
        ? [{ id: 'buy_limit', label: 'BUY LIMIT' }, { id: 'buy_stop', label: 'BUY STOP' }]
        : [{ id: 'sell_limit', label: 'SELL LIMIT' }, { id: 'sell_stop', label: 'SELL STOP' }];
    const [pendingType, setPendingType] = useState(pendingTypeOptions[0].id);

    useEffect(() => {
        if (!open || !symbol) return;
        setLot('0.10');
        setSl(prefillSl != null ? String(prefillSl) : '');
        setTp(prefillTp != null ? String(prefillTp) : '');
        setComment(''); setPrice('');
        setMode('market');
        setPendingType(pendingTypeOptions[0].id);
    }, [open, symbol, direction, prefillSl, prefillTp]); // eslint-disable-line

    // Margin calculator preview
    useEffect(() => {
        if (!open || !symbol) return;
        const l = parseFloat(lot);
        if (!l || l <= 0) { setCalc(null); return; }
        let cancelled = false;
        api.post('/mt5/calculator', { symbol: symbol.symbol, lot: l })
            .then(r => { if (!cancelled) setCalc(r.data); })
            .catch(() => { if (!cancelled) setCalc(null); });
        return () => { cancelled = true; };
    }, [open, symbol, lot]);

    if (!open || !symbol) return null;

    const submit = async () => {
        setSubmitting(true);
        try {
            if (mode === 'market') {
                await api.post('/mt5/order', {
                    symbol: symbol.symbol,
                    direction,
                    lot: parseFloat(lot),
                    sl: sl || undefined,
                    tp: tp || undefined,
                    comment,
                });
                toast.success(`${direction.toUpperCase()} ${lot} ${symbol.symbol} ejecutada`);
            } else {
                await api.post('/mt5/order/pending', {
                    symbol: symbol.symbol,
                    type: pendingType,
                    lot: parseFloat(lot),
                    price: parseFloat(price),
                    sl: sl || undefined,
                    tp: tp || undefined,
                    comment,
                });
                toast.success(`Orden pendiente ${pendingType.toUpperCase()} creada`);
            }
            onDone && onDone();
            onClose && onClose();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error ejecutando orden');
        } finally {
            setSubmitting(false);
        }
    };

    const isBuy = direction === 'buy';
    const priceNow = isBuy ? symbol.ask : symbol.bid;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <motion.div
                initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                className="w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] font-bold" style={{ color: isBuy ? '#0ecb81' : '#f6465d' }}>
                            {isBuy ? 'COMPRAR' : 'VENDER'} · {symbol.symbol}
                        </p>
                        <p className="text-slate-500 text-xs mt-0.5">{symbol.name}</p>
                    </div>
                    <button onClick={onClose} data-no-hover className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white">✕</button>
                </div>

                {/* Market / Pending switch */}
                <div className="grid grid-cols-2 gap-1 bg-slate-950 rounded-lg p-1 border border-slate-800">
                    {['market', 'pending'].map(m => (
                        <button key={m} type="button" onClick={() => setMode(m)} data-no-hover
                            className={`py-1.5 rounded-md text-xs font-semibold transition-all ${
                                mode === m ? 'bg-slate-800 text-white' : 'text-slate-500'
                            }`}>
                            {m === 'market' ? 'Mercado' : 'Pendiente'}
                        </button>
                    ))}
                </div>

                {mode === 'market' && (
                    <div className="flex items-baseline gap-2">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Precio</p>
                        <p className="text-xl text-white font-mono tabular-nums font-bold">{fmtPrice(priceNow)}</p>
                        <p className="text-slate-600 text-[10px]">({symbol.spread_pips} pips)</p>
                    </div>
                )}

                {/* Pending type */}
                {mode === 'pending' && (
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Tipo de orden</p>
                        <div className="grid grid-cols-2 gap-1">
                            {pendingTypeOptions.map(o => (
                                <button key={o.id} type="button" onClick={() => setPendingType(o.id)} data-no-hover
                                    className={`py-2 rounded-md text-xs font-bold ring-1 ${
                                        pendingType === o.id
                                            ? (isBuy ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' : 'bg-rose-500/15 text-rose-300 ring-rose-500/30')
                                            : 'bg-slate-800/60 text-slate-400 ring-slate-700'
                                    }`}>
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Inputs */}
                <div className="space-y-3">
                    <label className="block">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">Volumen (lots)</span>
                        <input type="number" step="0.01" min="0.01" max="50" value={lot} onChange={(e) => setLot(e.target.value)} data-testid="mt5-order-lot"
                            className="w-full h-10 mt-1 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono tabular-nums focus:outline-none focus:border-cyan-500/50" />
                    </label>
                    {mode === 'pending' && (
                        <label className="block">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500">Precio de activación</span>
                            <input type="number" step="0.00001" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="mt5-order-price"
                                className="w-full h-10 mt-1 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono tabular-nums focus:outline-none focus:border-cyan-500/50" />
                        </label>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                            <span className="text-[10px] uppercase tracking-wider text-rose-400">Stop Loss</span>
                            <input type="number" step="0.00001" value={sl} onChange={(e) => setSl(e.target.value)} placeholder="(opcional)" data-testid="mt5-order-sl"
                                className="w-full h-10 mt-1 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono tabular-nums focus:outline-none focus:border-rose-500/40" />
                        </label>
                        <label className="block">
                            <span className="text-[10px] uppercase tracking-wider text-emerald-400">Take Profit</span>
                            <input type="number" step="0.00001" value={tp} onChange={(e) => setTp(e.target.value)} placeholder="(opcional)" data-testid="mt5-order-tp"
                                className="w-full h-10 mt-1 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono tabular-nums focus:outline-none focus:border-emerald-500/40" />
                        </label>
                    </div>
                    <label className="block">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">Comentario</span>
                        <input type="text" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={80} placeholder="Nota opcional" data-testid="mt5-order-comment"
                            className="w-full h-10 mt-1 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-slate-600" />
                    </label>
                </div>

                {/* Calculator summary */}
                {calc && (
                    <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
                            <Layers className="w-3 h-3 text-amber-300" /> Calculadora de margen
                        </p>
                        <div className="grid grid-cols-3 gap-3 text-[11px]">
                            <div>
                                <p className="text-slate-600 text-[10px]">Margen req.</p>
                                <p className="text-white font-mono tabular-nums font-bold">${calc.margin_required_usd}</p>
                            </div>
                            <div>
                                <p className="text-slate-600 text-[10px]">Valor de pip</p>
                                <p className="text-white font-mono tabular-nums font-bold">${calc.pip_value_usd}</p>
                            </div>
                            <div>
                                <p className="text-slate-600 text-[10px]">Tras abrir</p>
                                <p className={`font-mono tabular-nums font-bold ${calc.free_margin_after_usd >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>${calc.free_margin_after_usd}</p>
                            </div>
                        </div>
                    </div>
                )}

                <Button onClick={submit} disabled={submitting} className="w-full h-11 text-white text-base font-bold" style={{ backgroundColor: isBuy ? '#0ecb81' : '#f6465d' }} data-testid="mt5-order-submit">
                    <Zap className="w-4 h-4 mr-2" />
                    {submitting ? 'Enviando…' : `${mode === 'market' ? 'Ejecutar' : 'Colocar'} ${isBuy ? 'BUY' : 'SELL'}`}
                </Button>
            </motion.div>
        </div>
    );
};
