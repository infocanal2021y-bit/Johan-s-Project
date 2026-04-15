import { useState, useEffect, useCallback, useRef } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import {
    TrendingUp, TrendingDown, DollarSign, BarChart3, Clock, X,
    ArrowUpCircle, ArrowDownCircle, RefreshCw, History, AlertTriangle,
    Wallet, ChevronDown, Loader2, Zap, ArrowRightLeft, Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import api from '../lib/api';

const SYMBOLS = [
    { id: 'EURUSD', label: 'EUR/USD', flag: 'EU', category: 'forex' },
    { id: 'GBPUSD', label: 'GBP/USD', flag: 'GB', category: 'forex' },
    { id: 'USDJPY', label: 'USD/JPY', flag: 'JP', category: 'forex' },
    { id: 'BTCUSD', label: 'BTC/USD', flag: 'BT', category: 'crypto' },
    { id: 'ETHUSD', label: 'ETH/USD', flag: 'ET', category: 'crypto' },
    { id: 'XAUUSD', label: 'XAU/USD', flag: 'AU', category: 'commodity' },
];

const formatPrice = (price, symbol) => {
    if (!price) return '—';
    if (symbol === 'USDJPY') return price.toFixed(3);
    if (['BTCUSD', 'ETHUSD', 'XAUUSD'].includes(symbol)) return price.toFixed(2);
    return price.toFixed(5);
};

const PriceCell = ({ price, prevPrice, symbol }) => {
    const color = !prevPrice ? 'text-white' : price > prevPrice ? 'text-emerald-400' : price < prevPrice ? 'text-red-400' : 'text-white';
    return <span className={`font-mono text-sm tabular-nums transition-colors duration-300 ${color}`}>{formatPrice(price, symbol)}</span>;
};

export const TradingDemoPage = () => {
    const [prices, setPrices] = useState({});
    const [prevPrices, setPrevPrices] = useState({});
    const [account, setAccount] = useState(null);
    const [positions, setPositions] = useState([]);
    const [history, setHistory] = useState([]);
    const [selectedSymbol, setSelectedSymbol] = useState('EURUSD');
    const [lotSize, setLotSize] = useState('0.10');
    const [activeTab, setActiveTab] = useState('positions');
    const [loading, setLoading] = useState(true);
    const [tradeLoading, setTradeLoading] = useState(false);
    const [showTransfer, setShowTransfer] = useState(false);
    const [showPro, setShowPro] = useState(false);
    const intervalRef = useRef(null);

    const fetchData = useCallback(async () => {
        try {
            const [pricesRes, accountRes, posRes] = await Promise.all([
                api.get('/trading/prices'),
                api.get('/trading/account'),
                api.get('/trading/positions'),
            ]);
            setPrevPrices(prices);
            setPrices(pricesRes.data);
            setAccount(accountRes.data);
            setPositions(posRes.data);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    const fetchHistory = useCallback(async () => {
        try {
            const res = await api.get('/trading/history');
            setHistory(res.data);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchData();
        fetchHistory();
        intervalRef.current = setInterval(fetchData, 3000);
        return () => clearInterval(intervalRef.current);
    }, [fetchData, fetchHistory]);

    const openTrade = async (direction) => {
        const lot = parseFloat(lotSize);
        if (!lot || lot < 0.01 || lot > 10) { toast.error('Lote invalido (0.01 - 10.00)'); return; }
        setTradeLoading(true);
        try {
            const res = await api.post('/trading/open', { symbol: selectedSymbol, direction, lot_size: lot });
            toast.success(res.data.message);
            fetchData();
        } catch (e) { toast.error(e.response?.data?.detail || 'Error al abrir operacion'); }
        finally { setTradeLoading(false); }
    };

    const closeTrade = async (tradeId) => {
        try {
            const res = await api.post('/trading/close', { trade_id: tradeId });
            const pl = res.data.profit_loss;
            toast[pl >= 0 ? 'success' : 'error'](`Cerrada: ${pl >= 0 ? '+' : ''}$${pl.toFixed(2)}`);
            fetchData();
            fetchHistory();
        } catch (e) { toast.error(e.response?.data?.detail || 'Error al cerrar'); }
    };

    const resetAccount = async () => {
        try {
            await api.post('/trading/reset');
            toast.success('Cuenta demo reiniciada a $10,000');
            fetchData();
            fetchHistory();
        } catch { toast.error('Error al reiniciar'); }
    };

    const sel = prices[selectedSymbol];
    const selInfo = SYMBOLS.find(s => s.id === selectedSymbol);

    if (loading) return (
        <Layout>
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
            </div>
        </Layout>
    );

    return (
        <Layout>
            <div className="space-y-4 -m-1 md:-m-2" data-testid="trading-demo-page">
                {/* Demo Banner */}
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5 flex items-center gap-3" data-testid="demo-banner">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <p className="text-amber-300 text-xs font-medium">Modo Demo — Simulacion con fondos virtuales. No es dinero real.</p>
                    <button onClick={() => setShowPro(true)} className="ml-auto text-[10px] font-bold text-amber-400 border border-amber-500/40 rounded-full px-3 py-1 hover:bg-amber-500/10 transition-colors whitespace-nowrap" data-testid="pro-mode-btn">
                        Modo Profesional
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Left: Asset List + Order Panel */}
                    <div className="lg:col-span-3 space-y-4">
                        {/* Asset Selector */}
                        <Card className="bg-slate-900/70 border-slate-800">
                            <CardHeader className="py-3 px-4 border-b border-slate-800">
                                <CardTitle className="text-white text-sm flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-emerald-400" /> Activos
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-slate-800/50">
                                    {SYMBOLS.map(sym => {
                                        const p = prices[sym.id];
                                        const pp = prevPrices[sym.id];
                                        const isActive = selectedSymbol === sym.id;
                                        return (
                                            <button
                                                key={sym.id}
                                                onClick={() => setSelectedSymbol(sym.id)}
                                                data-testid={`asset-${sym.id}`}
                                                className={`w-full text-left px-4 py-3 transition-colors ${isActive ? 'bg-emerald-500/10 border-l-2 border-emerald-500' : 'hover:bg-slate-800/50 border-l-2 border-transparent'}`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <span className="text-white text-sm font-semibold">{sym.label}</span>
                                                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${sym.category === 'forex' ? 'bg-blue-500/20 text-blue-400' : sym.category === 'crypto' ? 'bg-orange-500/20 text-orange-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                                            {sym.category}
                                                        </span>
                                                    </div>
                                                    {p && (
                                                        <span className={`text-xs font-mono ${p.change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {p.change_pct >= 0 ? '+' : ''}{p.change_pct}%
                                                        </span>
                                                    )}
                                                </div>
                                                {p && (
                                                    <div className="flex gap-3 mt-1 text-xs text-slate-500">
                                                        <span>B: <PriceCell price={p.bid} prevPrice={pp?.bid} symbol={sym.id} /></span>
                                                        <span>A: <PriceCell price={p.ask} prevPrice={pp?.ask} symbol={sym.id} /></span>
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Converter Card */}
                        <ConverterCard />
                    </div>

                    {/* Center: Price + Order */}
                    <div className="lg:col-span-5 space-y-4">
                        {/* Active Symbol Display */}
                        <Card className="bg-slate-900/70 border-slate-800" data-testid="price-display">
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h2 className="text-white text-xl font-bold">{selInfo?.label}</h2>
                                        <p className="text-slate-500 text-xs">{sel?.name}</p>
                                    </div>
                                    {sel && (
                                        <span className={`text-sm font-bold px-3 py-1 rounded-full ${sel.change_pct >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                            {sel.change_pct >= 0 ? '+' : ''}{sel.change_pct}%
                                        </span>
                                    )}
                                </div>
                                {sel && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-center">
                                            <p className="text-emerald-400/70 text-[10px] uppercase tracking-wider mb-1">BID (Venta)</p>
                                            <p className="text-emerald-400 text-2xl font-mono font-bold tabular-nums">{formatPrice(sel.bid, selectedSymbol)}</p>
                                        </div>
                                        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-center">
                                            <p className="text-red-400/70 text-[10px] uppercase tracking-wider mb-1">ASK (Compra)</p>
                                            <p className="text-red-400 text-2xl font-mono font-bold tabular-nums">{formatPrice(sel.ask, selectedSymbol)}</p>
                                        </div>
                                    </div>
                                )}
                                {/* Spread */}
                                <div className="mt-3 text-center">
                                    <span className="text-slate-600 text-[11px]">Spread: <span className="text-slate-400">{sel ? (sel.ask - sel.bid).toFixed(sel.symbol === 'USDJPY' ? 3 : 5) : '—'}</span></span>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Order Panel */}
                        <Card className="bg-slate-900/70 border-slate-800" data-testid="order-panel">
                            <CardContent className="p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-white font-semibold text-sm">Nueva Operacion</h3>
                                    <span className="text-slate-500 text-xs">{selInfo?.label}</span>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-slate-400 text-xs">Tamano del Lote</label>
                                    <div className="flex items-center gap-2">
                                        {['0.01', '0.10', '0.50', '1.00'].map(v => (
                                            <button key={v} onClick={() => setLotSize(v)}
                                                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${lotSize === v ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'}`}
                                                data-testid={`lot-${v}`}>{v}</button>
                                        ))}
                                        <Input value={lotSize} onChange={e => setLotSize(e.target.value)}
                                            className="w-20 bg-slate-800 border-slate-700 text-white text-center text-sm" data-testid="lot-input" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Button
                                        onClick={() => openTrade('buy')}
                                        disabled={tradeLoading}
                                        className="h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base shadow-lg shadow-emerald-500/20"
                                        data-testid="buy-btn"
                                    >
                                        {tradeLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ArrowUpCircle className="w-5 h-5 mr-2" />COMPRAR</>}
                                    </Button>
                                    <Button
                                        onClick={() => openTrade('sell')}
                                        disabled={tradeLoading}
                                        className="h-14 bg-red-600 hover:bg-red-700 text-white font-bold text-base shadow-lg shadow-red-500/20"
                                        data-testid="sell-btn"
                                    >
                                        {tradeLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ArrowDownCircle className="w-5 h-5 mr-2" />VENDER</>}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right: Account Info */}
                    <div className="lg:col-span-4 space-y-4">
                        {/* Account Summary */}
                        <Card className="bg-slate-900/70 border-slate-800" data-testid="account-summary">
                            <CardHeader className="py-3 px-4 border-b border-slate-800">
                                <CardTitle className="text-white text-sm flex items-center gap-2">
                                    <Wallet className="w-4 h-4 text-emerald-400" /> Cuenta Demo
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3">
                                {account && (
                                    <>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-slate-800/50 rounded-lg p-3">
                                                <p className="text-slate-500 text-[10px] uppercase">Balance</p>
                                                <p className="text-white font-mono font-bold text-lg">${account.balance.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                                            </div>
                                            <div className="bg-slate-800/50 rounded-lg p-3">
                                                <p className="text-slate-500 text-[10px] uppercase">Equity</p>
                                                <p className={`font-mono font-bold text-lg ${account.equity >= account.balance ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    ${account.equity.toLocaleString('en-US', {minimumFractionDigits: 2})}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="bg-slate-800/30 rounded-lg p-2 text-center">
                                                <p className="text-slate-600 text-[9px] uppercase">Margen</p>
                                                <p className="text-slate-300 text-xs font-mono">${account.margin_used.toFixed(2)}</p>
                                            </div>
                                            <div className="bg-slate-800/30 rounded-lg p-2 text-center">
                                                <p className="text-slate-600 text-[9px] uppercase">Libre</p>
                                                <p className="text-slate-300 text-xs font-mono">${account.free_margin.toFixed(2)}</p>
                                            </div>
                                            <div className="bg-slate-800/30 rounded-lg p-2 text-center">
                                                <p className="text-slate-600 text-[9px] uppercase">P/L Flotante</p>
                                                <p className={`text-xs font-mono font-bold ${account.floating_pl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {account.floating_pl >= 0 ? '+' : ''}${account.floating_pl.toFixed(2)}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button size="sm" variant="outline" onClick={() => setShowTransfer(true)}
                                                className="flex-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs" data-testid="transfer-btn">
                                                <Zap className="w-3 h-3 mr-1" /> Transferir Ganancias
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={resetAccount}
                                                className="border-slate-700 text-slate-400 text-xs" data-testid="reset-btn">
                                                <RefreshCw className="w-3 h-3 mr-1" /> Reset
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>

                        {/* Open Positions Count */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 text-center">
                                <p className="text-slate-500 text-[10px] uppercase">Operaciones Abiertas</p>
                                <p className="text-white text-2xl font-bold">{positions.length}</p>
                            </div>
                            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 text-center">
                                <p className="text-slate-500 text-[10px] uppercase">Total Cerradas</p>
                                <p className="text-white text-2xl font-bold">{history.length}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Positions & History Tabs */}
                <Card className="bg-slate-900/70 border-slate-800">
                    <CardHeader className="py-3 px-4 border-b border-slate-800">
                        <div className="flex gap-4">
                            <button onClick={() => setActiveTab('positions')}
                                className={`flex items-center gap-1.5 text-sm font-semibold pb-1 border-b-2 transition-colors ${activeTab === 'positions' ? 'text-emerald-400 border-emerald-400' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
                                data-testid="tab-positions">
                                <TrendingUp className="w-4 h-4" /> Posiciones Abiertas ({positions.length})
                            </button>
                            <button onClick={() => { setActiveTab('history'); fetchHistory(); }}
                                className={`flex items-center gap-1.5 text-sm font-semibold pb-1 border-b-2 transition-colors ${activeTab === 'history' ? 'text-emerald-400 border-emerald-400' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
                                data-testid="tab-history">
                                <History className="w-4 h-4" /> Historial ({history.length})
                            </button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {activeTab === 'positions' ? (
                            positions.length === 0 ? (
                                <div className="py-12 text-center">
                                    <BarChart3 className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                                    <p className="text-slate-500 text-sm">Sin posiciones abiertas</p>
                                    <p className="text-slate-600 text-xs mt-1">Seleccione un activo y pulse Comprar o Vender</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-slate-500 text-[11px] uppercase border-b border-slate-800">
                                                <th className="px-4 py-2.5 text-left">Activo</th>
                                                <th className="px-3 py-2.5">Tipo</th>
                                                <th className="px-3 py-2.5">Lote</th>
                                                <th className="px-3 py-2.5">Entrada</th>
                                                <th className="px-3 py-2.5">Actual</th>
                                                <th className="px-3 py-2.5">P/L</th>
                                                <th className="px-3 py-2.5"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                            {positions.map(pos => (
                                                <tr key={pos.id} className="hover:bg-slate-800/30" data-testid={`position-${pos.id}`}>
                                                    <td className="px-4 py-3 text-white font-medium">{SYMBOLS.find(s => s.id === pos.symbol)?.label}</td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${pos.direction === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                            {pos.direction === 'buy' ? 'COMPRA' : 'VENTA'}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 text-center text-slate-300 font-mono">{pos.lot_size}</td>
                                                    <td className="px-3 py-3 text-center text-slate-400 font-mono text-xs">{formatPrice(pos.entry_price, pos.symbol)}</td>
                                                    <td className="px-3 py-3 text-center text-white font-mono text-xs">{formatPrice(pos.current_price, pos.symbol)}</td>
                                                    <td className={`px-3 py-3 text-center font-mono font-bold ${pos.profit_loss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {pos.profit_loss >= 0 ? '+' : ''}${pos.profit_loss.toFixed(2)}
                                                    </td>
                                                    <td className="px-3 py-3 text-right">
                                                        <Button size="sm" variant="outline"
                                                            onClick={() => closeTrade(pos.id)}
                                                            className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs h-7 px-2"
                                                            data-testid={`close-${pos.id}`}>
                                                            <X className="w-3 h-3 mr-1" /> Cerrar
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )
                        ) : (
                            history.length === 0 ? (
                                <div className="py-12 text-center">
                                    <History className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                                    <p className="text-slate-500 text-sm">Sin historial de operaciones</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-slate-500 text-[11px] uppercase border-b border-slate-800">
                                                <th className="px-4 py-2.5 text-left">Activo</th>
                                                <th className="px-3 py-2.5">Tipo</th>
                                                <th className="px-3 py-2.5">Lote</th>
                                                <th className="px-3 py-2.5">Entrada</th>
                                                <th className="px-3 py-2.5">Cierre</th>
                                                <th className="px-3 py-2.5">P/L</th>
                                                <th className="px-3 py-2.5">Fecha</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                            {history.map(h => (
                                                <tr key={h.id} className="hover:bg-slate-800/30">
                                                    <td className="px-4 py-3 text-white font-medium">{SYMBOLS.find(s => s.id === h.symbol)?.label}</td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${h.direction === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                            {h.direction === 'buy' ? 'COMPRA' : 'VENTA'}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 text-center text-slate-300 font-mono">{h.lot_size}</td>
                                                    <td className="px-3 py-3 text-center text-slate-400 font-mono text-xs">{formatPrice(h.entry_price, h.symbol)}</td>
                                                    <td className="px-3 py-3 text-center text-slate-400 font-mono text-xs">{formatPrice(h.close_price, h.symbol)}</td>
                                                    <td className={`px-3 py-3 text-center font-mono font-bold ${h.profit_loss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {h.profit_loss >= 0 ? '+' : ''}${h.profit_loss?.toFixed(2)}
                                                    </td>
                                                    <td className="px-3 py-3 text-center text-slate-500 text-xs">
                                                        {h.closed_at ? new Date(h.closed_at).toLocaleDateString('es-ES', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'}) : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )
                        )}
                    </CardContent>
                </Card>

                {/* Transfer Dialog (visual only) */}
                <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
                    <DialogContent className="bg-slate-900 border-slate-700 max-w-sm" data-testid="transfer-dialog">
                        <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                                <Zap className="w-5 h-5 text-amber-400" /> Transferir Ganancias
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                <p className="text-amber-300 text-sm leading-relaxed">
                                    Las ganancias del modo demo son virtuales y no pueden transferirse al saldo principal. 
                                    Esta funcion estara disponible en el <strong>Modo Profesional</strong>.
                                </p>
                            </div>
                            <div className="p-4 rounded-xl bg-slate-800/50 text-center">
                                <p className="text-slate-500 text-xs mb-1">Ganancias Demo</p>
                                <p className={`text-2xl font-mono font-bold ${(account?.balance || 0) - 10000 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {((account?.balance || 0) - 10000) >= 0 ? '+' : ''}${((account?.balance || 0) - 10000).toFixed(2)}
                                </p>
                            </div>
                            <Button onClick={() => setShowTransfer(false)} className="w-full bg-slate-800 hover:bg-slate-700 text-white">Entendido</Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Pro Mode Dialog */}
                <Dialog open={showPro} onOpenChange={setShowPro}>
                    <DialogContent className="bg-slate-900 border-slate-700 max-w-sm" data-testid="pro-mode-dialog">
                        <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                                <Lock className="w-5 h-5 text-cyan-400" /> Modo Profesional
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                            <div className="p-5 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 text-center">
                                <Lock className="w-10 h-10 text-cyan-400 mx-auto mb-3" />
                                <h3 className="text-white font-bold text-lg mb-2">Proximamente</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">
                                    Estamos trabajando en el <strong className="text-cyan-400">Modo Profesional</strong> y el <strong className="text-cyan-400">Modo Real</strong> para ofrecerle una experiencia mas avanzada y completa dentro de la plataforma.
                                </p>
                            </div>
                            <Button onClick={() => setShowPro(false)} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white">Entendido</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </Layout>
    );
};

// Mini Converter Component
const ConverterCard = () => {
    const [amount, setAmount] = useState('100');
    const [from, setFrom] = useState('USD');
    const [to, setTo] = useState('EUR');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const convert = async () => {
        setLoading(true);
        try {
            const res = await api.get('/trading/convert', { params: { amount: parseFloat(amount) || 0, from_currency: from, to_currency: to } });
            setResult(res.data);
        } catch { toast.error('Error en conversion'); }
        finally { setLoading(false); }
    };

    return (
        <Card className="bg-slate-900/70 border-slate-800">
            <CardHeader className="py-3 px-4 border-b border-slate-800">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4 text-cyan-400" /> Conversor
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
                <Input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="Monto"
                    className="bg-slate-800 border-slate-700 text-white" data-testid="converter-amount" />
                <div className="flex gap-2">
                    <select value={from} onChange={e => setFrom(e.target.value)}
                        className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-md px-2 text-sm h-10" data-testid="converter-from">
                        {['USD', 'EUR', 'GBP', 'JPY'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button onClick={() => { setFrom(to); setTo(from); setResult(null); }}
                        className="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-md text-slate-400 hover:text-white">
                        <ArrowRightLeft className="w-4 h-4" />
                    </button>
                    <select value={to} onChange={e => setTo(e.target.value)}
                        className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-md px-2 text-sm h-10" data-testid="converter-to">
                        {['USD', 'EUR', 'GBP', 'JPY'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <Button onClick={convert} disabled={loading} size="sm" className="w-full bg-cyan-600 hover:bg-cyan-700 text-white" data-testid="convert-btn">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Convertir'}
                </Button>
                {result && (
                    <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                        <p className="text-white font-mono font-bold">{result.result.toLocaleString('en-US', {minimumFractionDigits: 2})} {result.to}</p>
                        <p className="text-slate-500 text-[10px] mt-1">Tasa: 1 {result.from} = {result.rate} {result.to}</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default TradingDemoPage;
