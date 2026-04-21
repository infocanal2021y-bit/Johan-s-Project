import { useState, useEffect, useCallback, useRef } from 'react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import {
    TrendingUp, BarChart3, X, ArrowUpCircle, ArrowDownCircle, RefreshCw,
    History, AlertTriangle, Wallet, Loader2, Zap, ArrowRightLeft, Lock,
    Trophy, GraduationCap, ShieldAlert, Rewind, Target, BookOpen, CheckCircle, Award, Bell
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { CandlestickChart } from '../components/trading/CandlestickChart';
import { OrderBook } from '../components/trading/OrderBook';
import { PriceAlerts } from '../components/trading/PriceAlerts';

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

const fmtMoney = (v) => v?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00';

export const TradingDemoPage = () => {
    const [prices, setPrices] = useState({});
    const [prevPrices, setPrevPrices] = useState({});
    const [account, setAccount] = useState(null);
    const [positions, setPositions] = useState([]);
    const [history, setHistory] = useState([]);
    const [selectedSymbol, setSelectedSymbol] = useState('BTCUSD');
    const [lotSize, setLotSize] = useState('0.10');
    const [activeTab, setActiveTab] = useState('positions');
    const [loading, setLoading] = useState(true);
    const [tradeLoading, setTradeLoading] = useState(false);
    const [showTransfer, setShowTransfer] = useState(false);
    const [showPro, setShowPro] = useState(false);
    const [showAlerts, setShowAlerts] = useState(false);
    const [stopLoss, setStopLoss] = useState('');
    const [takeProfit, setTakeProfit] = useState('');
    const [stats, setStats] = useState(null);
    const [challenges, setChallenges] = useState([]);
    const [learning, setLearning] = useState([]);
    const [riskData, setRiskData] = useState(null);
    const [selectedLesson, setSelectedLesson] = useState(null);
    const [replayMode, setReplayMode] = useState(false);
    const [replayCandles, setReplayCandles] = useState([]);
    const [replayIdx, setReplayIdx] = useState(0);
    const [replayPlaying, setReplayPlaying] = useState(false);
    const replayRef = useRef(null);
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
        try { const res = await api.get('/trading/history'); setHistory(res.data); } catch { /* silent */ }
    }, []);

    const fetchExtra = useCallback(async () => {
        try {
            const [s, c, l] = await Promise.all([
                api.get('/trading/stats'), api.get('/trading/challenges'), api.get('/trading/learning')
            ]);
            setStats(s.data); setChallenges(c.data); setLearning(l.data);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchData(); fetchHistory(); fetchExtra();
        intervalRef.current = setInterval(fetchData, 3000);
        return () => clearInterval(intervalRef.current);
    }, [fetchData, fetchHistory, fetchExtra]);

    const openTrade = async (direction) => {
        const lot = parseFloat(lotSize);
        if (!lot || lot < 0.01 || lot > 10) { toast.error('Lote invalido (0.01 - 10.00)'); return; }
        setTradeLoading(true);
        try {
            const payload = { symbol: selectedSymbol, direction, lot_size: lot };
            if (stopLoss) payload.stop_loss = parseFloat(stopLoss);
            if (takeProfit) payload.take_profit = parseFloat(takeProfit);
            const res = await api.post('/trading/open', payload);
            toast.success(res.data.message);
            fetchData(); fetchExtra();
        } catch (e) { toast.error(e.response?.data?.detail || 'Error al abrir operacion'); }
        finally { setTradeLoading(false); }
    };

    const closeTrade = async (tradeId) => {
        try {
            const res = await api.post('/trading/close', { trade_id: tradeId });
            const pl = res.data.profit_loss;
            toast[pl >= 0 ? 'success' : 'error'](`Cerrada: ${pl >= 0 ? '+' : ''}$${pl.toFixed(2)}`);
            fetchData(); fetchHistory(); fetchExtra();
        } catch (e) { toast.error(e.response?.data?.detail || 'Error al cerrar'); }
    };

    const resetAccount = async () => {
        try { await api.post('/trading/reset'); toast.success('Cuenta reiniciada a $10,000'); fetchData(); fetchHistory(); fetchExtra(); }
        catch { toast.error('Error al reiniciar'); }
    };

    const fetchRisk = async () => {
        try {
            const params = { symbol: selectedSymbol, direction: 'buy', lot_size: parseFloat(lotSize) || 0.1 };
            if (stopLoss) params.stop_loss = parseFloat(stopLoss);
            if (takeProfit) params.take_profit = parseFloat(takeProfit);
            const res = await api.get('/trading/risk-simulate', { params });
            setRiskData(res.data);
        } catch { /* silent */ }
    };

    const completeLesson = async (moduleId) => {
        try { await api.post(`/trading/learning/${moduleId}/complete`); fetchExtra(); toast.success('Leccion completada'); }
        catch { /* silent */ }
    };

    const startReplay = async () => {
        try {
            const res = await api.get('/trading/replay', { params: { symbol: selectedSymbol } });
            setReplayCandles(res.data.candles); setReplayIdx(30); setReplayMode(true); setReplayPlaying(false);
        } catch { toast.error('Error al cargar replay'); }
    };

    const toggleReplayPlay = () => {
        if (replayPlaying) { clearInterval(replayRef.current); setReplayPlaying(false); return; }
        setReplayPlaying(true);
        replayRef.current = setInterval(() => {
            setReplayIdx(prev => { if (prev >= 199) { clearInterval(replayRef.current); setReplayPlaying(false); return prev; } return prev + 1; });
        }, 500);
    };

    useEffect(() => { return () => { if (replayRef.current) clearInterval(replayRef.current); }; }, []);

    const sel = prices[selectedSymbol];
    const selInfo = SYMBOLS.find(s => s.id === selectedSymbol);
    const totalPL = positions.reduce((s, p) => s + (p.profit_loss || 0), 0);

    if (loading) return (
        <Layout>
            <div className="flex items-center justify-center h-[80vh]">
                <div className="text-center"><Loader2 className="w-8 h-8 animate-spin text-[#F0B90B] mx-auto mb-3" /><p className="text-slate-500 text-sm">Cargando terminal...</p></div>
            </div>
        </Layout>
    );

    return (
        <Layout>
            <div className="space-y-0 -m-4 md:-m-6 lg:-m-8 bg-[#0b0e11] min-h-screen" data-testid="trading-demo-page">

                {/* ═══ TOP BAR: Asset selector + Price + Account ═══ */}
                <div className="border-b border-[#1e2329] bg-[#0b0e11] sticky top-0 z-20">
                    {/* Demo strip */}
                    <div className="bg-[#F0B90B]/8 border-b border-[#F0B90B]/20 px-4 py-1.5 flex items-center gap-2" data-testid="demo-banner">
                        <AlertTriangle className="w-3.5 h-3.5 text-[#F0B90B]" />
                        <span className="text-[#F0B90B] text-[11px] font-medium">Modo Demo — Fondos virtuales</span>
                        <button onClick={() => setShowAlerts(true)} className="ml-auto flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-[#F0B90B] transition-colors" data-testid="price-alerts-btn">
                            <Bell className="w-3 h-3" /> Alertas
                        </button>
                        <button onClick={() => setShowPro(true)} className="ml-3 text-[10px] font-bold text-[#F0B90B]/80 hover:text-[#F0B90B] transition-colors" data-testid="pro-mode-btn">
                            PRO
                        </button>
                    </div>

                    {/* Main header bar */}
                    <div className="flex items-center gap-0 overflow-x-auto scrollbar-hide">
                        {/* Asset pills */}
                        <div className="flex items-center border-r border-[#1e2329]">
                            {SYMBOLS.map(sym => {
                                const p = prices[sym.id];
                                const active = selectedSymbol === sym.id;
                                return (
                                    <button key={sym.id} onClick={() => setSelectedSymbol(sym.id)} data-testid={`asset-${sym.id}`}
                                        className={`px-4 py-3 text-left whitespace-nowrap transition-colors border-b-2 ${active ? 'bg-[#1e2329] border-[#F0B90B] text-white' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-[#1e2329]/50'}`}>
                                        <div className="text-xs font-bold">{sym.label}</div>
                                        {p && <div className={`text-[10px] font-mono ${p.change_pct >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{formatPrice(p.bid, sym.id)}</div>}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Selected pair info */}
                        {sel && (
                            <div className="flex items-center gap-6 px-5 flex-shrink-0">
                                <div>
                                    <span className="text-white text-xl font-bold font-mono tabular-nums">{formatPrice(sel.bid, selectedSymbol)}</span>
                                    <span className={`ml-2 text-sm font-semibold ${sel.change_pct >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                                        {sel.change_pct >= 0 ? '+' : ''}{sel.change_pct}%
                                    </span>
                                </div>
                                <div className="flex gap-5 text-[11px]">
                                    <div><span className="text-slate-500">Bid</span><p className="text-[#0ecb81] font-mono">{formatPrice(sel.bid, selectedSymbol)}</p></div>
                                    <div><span className="text-slate-500">Ask</span><p className="text-[#f6465d] font-mono">{formatPrice(sel.ask, selectedSymbol)}</p></div>
                                    <div><span className="text-slate-500">Spread</span><p className="text-slate-300 font-mono">{(sel.ask - sel.bid).toFixed(selectedSymbol === 'USDJPY' ? 3 : 5)}</p></div>
                                </div>
                            </div>
                        )}

                        {/* Account mini */}
                        {account && (
                            <div className="ml-auto flex items-center gap-4 px-4 flex-shrink-0 border-l border-[#1e2329]">
                                <div className="text-right">
                                    <span className="text-slate-500 text-[10px] uppercase">Balance</span>
                                    <p className="text-white text-sm font-mono font-bold">${fmtMoney(account.balance)}</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-slate-500 text-[10px] uppercase">P/L</span>
                                    <p className={`text-sm font-mono font-bold ${account.floating_pl >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                                        {account.floating_pl >= 0 ? '+' : ''}${fmtMoney(account.floating_pl)}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══ MAIN CONTENT: Chart + Order Panel ═══ */}
                <div className="flex flex-col lg:flex-row">
                    {/* Chart Area - takes most space */}
                    <div className="flex-1 min-w-0 border-r border-[#1e2329]" data-testid="chart-card">
                        <div className="p-3 md:p-4">
                            <CandlestickChart symbol={selectedSymbol} />
                        </div>
                    </div>

                    {/* Right Panel: Order + Account */}
                    <div className="w-full lg:w-[320px] xl:w-[340px] flex-shrink-0 border-t lg:border-t-0 border-[#1e2329]" data-testid="order-panel">
                        {/* Order Form */}
                        <div className="p-4 border-b border-[#1e2329]">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-white font-semibold text-sm">Orden</h3>
                                <span className="text-[#F0B90B] text-xs font-mono">{selInfo?.label}</span>
                            </div>

                            {/* Bid/Ask compact */}
                            {sel && (
                                <div className="grid grid-cols-2 gap-2 mb-4">
                                    <div className="bg-[#0ecb81]/8 border border-[#0ecb81]/20 rounded-lg py-2 text-center">
                                        <span className="text-[#0ecb81]/60 text-[9px] uppercase block">Bid</span>
                                        <span className="text-[#0ecb81] font-mono font-bold text-base">{formatPrice(sel.bid, selectedSymbol)}</span>
                                    </div>
                                    <div className="bg-[#f6465d]/8 border border-[#f6465d]/20 rounded-lg py-2 text-center">
                                        <span className="text-[#f6465d]/60 text-[9px] uppercase block">Ask</span>
                                        <span className="text-[#f6465d] font-mono font-bold text-base">{formatPrice(sel.ask, selectedSymbol)}</span>
                                    </div>
                                </div>
                            )}

                            {/* Lot size */}
                            <div className="mb-3">
                                <label className="text-slate-500 text-[11px] uppercase tracking-wider mb-1.5 block">Volumen (Lotes)</label>
                                <div className="flex gap-1.5">
                                    {['0.01', '0.10', '0.50', '1.00'].map(v => (
                                        <button key={v} onClick={() => setLotSize(v)} data-testid={`lot-${v}`}
                                            className={`flex-1 py-1.5 rounded text-[11px] font-semibold transition-all ${lotSize === v ? 'bg-[#F0B90B]/15 text-[#F0B90B] border border-[#F0B90B]/40' : 'bg-[#1e2329] text-slate-500 border border-[#2b3139] hover:border-slate-600'}`}>
                                            {v}
                                        </button>
                                    ))}
                                </div>
                                <Input value={lotSize} onChange={e => setLotSize(e.target.value)}
                                    className="mt-2 bg-[#1e2329] border-[#2b3139] text-white text-center text-sm font-mono h-9 focus:border-[#F0B90B] focus:ring-[#F0B90B]/20" data-testid="lot-input" />
                            </div>

                            {/* SL / TP */}
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <div>
                                    <label className="text-[#f6465d]/70 text-[10px] uppercase flex items-center gap-1 mb-1"><ShieldAlert className="w-3 h-3" /> Stop Loss</label>
                                    <Input value={stopLoss} onChange={e => setStopLoss(e.target.value)} placeholder="Precio SL"
                                        className="bg-[#1e2329] border-[#2b3139] text-white text-xs font-mono h-8 focus:border-[#f6465d]" data-testid="sl-input" />
                                </div>
                                <div>
                                    <label className="text-[#0ecb81]/70 text-[10px] uppercase flex items-center gap-1 mb-1"><Target className="w-3 h-3" /> Take Profit</label>
                                    <Input value={takeProfit} onChange={e => setTakeProfit(e.target.value)} placeholder="Precio TP"
                                        className="bg-[#1e2329] border-[#2b3139] text-white text-xs font-mono h-8 focus:border-[#0ecb81]" data-testid="tp-input" />
                                </div>
                            </div>

                            {/* Risk preview */}
                            {(stopLoss || takeProfit) && (
                                <button onClick={fetchRisk} className="w-full text-[10px] text-[#F0B90B]/60 hover:text-[#F0B90B] mb-2 flex items-center justify-center gap-1" data-testid="risk-preview-btn">
                                    <ShieldAlert className="w-3 h-3" /> Ver analisis de riesgo
                                </button>
                            )}
                            {riskData && (stopLoss || takeProfit) && (
                                <div className="bg-[#1e2329]/80 rounded-lg p-2 mb-3 text-[10px] space-y-1">
                                    {riskData.sl_loss != null && <div className="flex justify-between"><span className="text-slate-500">Perdida SL:</span><span className="text-[#f6465d] font-mono">${riskData.sl_loss}</span></div>}
                                    {riskData.tp_gain != null && <div className="flex justify-between"><span className="text-slate-500">Ganancia TP:</span><span className="text-[#0ecb81] font-mono">+${riskData.tp_gain}</span></div>}
                                    {riskData.risk_pct != null && <div className="flex justify-between"><span className="text-slate-500">Riesgo:</span><span className={`font-mono ${riskData.risk_pct > 2 ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>{riskData.risk_pct}%</span></div>}
                                    {riskData.rr_ratio != null && <div className="flex justify-between"><span className="text-slate-500">R:R Ratio:</span><span className="text-[#F0B90B] font-mono">1:{riskData.rr_ratio}</span></div>}
                                </div>
                            )}

                            {/* Buy / Sell buttons */}
                            <div className="grid grid-cols-2 gap-2">
                                <Button onClick={() => openTrade('buy')} disabled={tradeLoading} data-testid="buy-btn"
                                    className="h-12 bg-[#0ecb81] hover:bg-[#0ecb81]/90 text-white font-bold text-sm rounded-lg shadow-none">
                                    {tradeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ArrowUpCircle className="w-4 h-4 mr-1.5" />Comprar</>}
                                </Button>
                                <Button onClick={() => openTrade('sell')} disabled={tradeLoading} data-testid="sell-btn"
                                    className="h-12 bg-[#f6465d] hover:bg-[#f6465d]/90 text-white font-bold text-sm rounded-lg shadow-none">
                                    {tradeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ArrowDownCircle className="w-4 h-4 mr-1.5" />Vender</>}
                                </Button>
                            </div>
                        </div>

                        {/* Order Book */}
                        <div className="border-b border-[#1e2329]" data-testid="orderbook-section">
                            <OrderBook
                                symbol={selectedSymbol}
                                bid={sel?.bid}
                                ask={sel?.ask}
                                formatPrice={formatPrice}
                            />
                        </div>


                        {/* Account Summary */}
                        <div className="p-4 border-b border-[#1e2329]" data-testid="account-summary">
                            <h4 className="text-slate-500 text-[10px] uppercase tracking-wider mb-3 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Cuenta Demo</h4>
                            <div className="space-y-2">
                                {[
                                    ['Balance', `$${fmtMoney(account?.balance)}`, 'text-white'],
                                    ['Equity', `$${fmtMoney(account?.equity)}`, account?.equity >= account?.balance ? 'text-[#0ecb81]' : 'text-[#f6465d]'],
                                    ['Margen Usado', `$${fmtMoney(account?.margin_used)}`, 'text-slate-300'],
                                    ['Margen Libre', `$${fmtMoney(account?.free_margin)}`, 'text-slate-300'],
                                    ['P/L Flotante', `${(account?.floating_pl || 0) >= 0 ? '+' : ''}$${fmtMoney(account?.floating_pl)}`, (account?.floating_pl || 0) >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'],
                                ].map(([label, value, color]) => (
                                    <div key={label} className="flex justify-between items-center">
                                        <span className="text-slate-500 text-xs">{label}</span>
                                        <span className={`font-mono text-xs font-semibold ${color}`}>{value}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2 mt-3">
                                <Button size="sm" variant="outline" onClick={() => setShowTransfer(true)} data-testid="transfer-btn"
                                    className="flex-1 border-[#F0B90B]/30 text-[#F0B90B] hover:bg-[#F0B90B]/10 text-[11px] h-8">
                                    <Zap className="w-3 h-3 mr-1" /> Transferir
                                </Button>
                                <Button size="sm" variant="outline" onClick={resetAccount} data-testid="reset-btn"
                                    className="border-[#2b3139] text-slate-500 hover:text-slate-300 text-[11px] h-8">
                                    <RefreshCw className="w-3 h-3 mr-1" /> Reset
                                </Button>
                            </div>
                        </div>

                        {/* Converter mini */}
                        <ConverterMini />
                    </div>
                </div>

                {/* ═══ BOTTOM: Positions & History ═══ */}
                <div className="border-t border-[#1e2329]">
                    {/* Tabs */}
                    <div className="flex items-center border-b border-[#1e2329] bg-[#0b0e11] overflow-x-auto scrollbar-hide">
                        <button onClick={() => setActiveTab('positions')} data-testid="tab-positions"
                            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'positions' ? 'text-[#F0B90B] border-[#F0B90B]' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
                            Posiciones ({positions.length})
                        </button>
                        <button onClick={() => { setActiveTab('history'); fetchHistory(); }} data-testid="tab-history"
                            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'history' ? 'text-[#F0B90B] border-[#F0B90B]' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
                            Historial ({history.length})
                        </button>
                        <button onClick={() => { setActiveTab('stats'); fetchExtra(); }} data-testid="tab-stats"
                            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'stats' ? 'text-[#F0B90B] border-[#F0B90B]' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
                            Informe
                        </button>
                        <button onClick={() => { setActiveTab('challenges'); fetchExtra(); }} data-testid="tab-challenges"
                            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1 ${activeTab === 'challenges' ? 'text-[#F0B90B] border-[#F0B90B]' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
                            <Trophy className="w-3 h-3" /> Retos
                        </button>
                        <button onClick={() => { setActiveTab('learning'); fetchExtra(); }} data-testid="tab-learning"
                            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1 ${activeTab === 'learning' ? 'text-[#F0B90B] border-[#F0B90B]' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
                            <GraduationCap className="w-3 h-3" /> Aprende
                        </button>
                        <button onClick={() => { setActiveTab('replay'); startReplay(); }} data-testid="tab-replay"
                            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1 ${activeTab === 'replay' ? 'text-[#F0B90B] border-[#F0B90B]' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
                            <Rewind className="w-3 h-3" /> Replay
                        </button>
                        {positions.length > 0 && activeTab === 'positions' && (
                            <div className="ml-auto pr-4 flex items-center gap-3 text-[11px]">
                                <span className="text-slate-500">P/L Total:</span>
                                <span className={`font-mono font-bold ${totalPL >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                                    {totalPL >= 0 ? '+' : ''}${totalPL.toFixed(2)}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Table content */}
                    <div className="max-h-[320px] overflow-y-auto">
                        {activeTab === 'positions' && (
                            positions.length === 0 ? (
                                <div className="py-10 text-center"><BarChart3 className="w-8 h-8 text-[#2b3139] mx-auto mb-2" /><p className="text-slate-600 text-xs">Sin posiciones abiertas</p></div>
                            ) : (
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-[#0b0e11]">
                                        <tr className="text-slate-600 text-[10px] uppercase tracking-wider">
                                            <th className="px-4 py-2 text-left font-medium">Par</th>
                                            <th className="px-3 py-2 font-medium">Tipo</th>
                                            <th className="px-3 py-2 font-medium">Lote</th>
                                            <th className="px-3 py-2 font-medium">Entrada</th>
                                            <th className="px-3 py-2 font-medium">SL / TP</th>
                                            <th className="px-3 py-2 font-medium">Actual</th>
                                            <th className="px-3 py-2 font-medium">P/L</th>
                                            <th className="px-3 py-2 font-medium"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {positions.map(pos => (
                                            <tr key={pos.id} className="border-t border-[#1e2329]/60 hover:bg-[#1e2329]/40 transition-colors" data-testid={`position-${pos.id}`}>
                                                <td className="px-4 py-2.5 text-white font-medium">{SYMBOLS.find(s => s.id === pos.symbol)?.label}</td>
                                                <td className="px-3 py-2.5 text-center"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pos.direction === 'buy' ? 'bg-[#0ecb81]/15 text-[#0ecb81]' : 'bg-[#f6465d]/15 text-[#f6465d]'}`}>{pos.direction === 'buy' ? 'LONG' : 'SHORT'}</span></td>
                                                <td className="px-3 py-2.5 text-center text-slate-400 font-mono">{pos.lot_size}</td>
                                                <td className="px-3 py-2.5 text-center text-slate-500 font-mono">{formatPrice(pos.entry_price, pos.symbol)}</td>
                                                <td className="px-3 py-2.5 text-center text-[10px]">
                                                    {pos.stop_loss ? <span className="text-[#f6465d]">SL:{formatPrice(pos.stop_loss, pos.symbol)}</span> : <span className="text-slate-700">—</span>}
                                                    {' '}
                                                    {pos.take_profit ? <span className="text-[#0ecb81]">TP:{formatPrice(pos.take_profit, pos.symbol)}</span> : ''}
                                                </td>
                                                <td className="px-3 py-2.5 text-center text-white font-mono">{formatPrice(pos.current_price, pos.symbol)}</td>
                                                <td className={`px-3 py-2.5 text-center font-mono font-bold ${pos.profit_loss >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{pos.profit_loss >= 0 ? '+' : ''}${pos.profit_loss.toFixed(2)}</td>
                                                <td className="px-3 py-2.5 text-right"><button onClick={() => closeTrade(pos.id)} data-testid={`close-${pos.id}`} className="px-2.5 py-1 rounded bg-[#f6465d]/10 text-[#f6465d] text-[10px] font-bold hover:bg-[#f6465d]/20">Cerrar</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )
                        )}

                        {activeTab === 'history' && (
                            history.length === 0 ? (
                                <div className="py-10 text-center"><History className="w-8 h-8 text-[#2b3139] mx-auto mb-2" /><p className="text-slate-600 text-xs">Sin historial</p></div>
                            ) : (
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-[#0b0e11]">
                                        <tr className="text-slate-600 text-[10px] uppercase tracking-wider">
                                            <th className="px-4 py-2 text-left font-medium">Par</th><th className="px-3 py-2 font-medium">Tipo</th><th className="px-3 py-2 font-medium">Lote</th>
                                            <th className="px-3 py-2 font-medium">Entrada</th><th className="px-3 py-2 font-medium">Cierre</th><th className="px-3 py-2 font-medium">Razon</th>
                                            <th className="px-3 py-2 font-medium">P/L</th><th className="px-3 py-2 font-medium">Fecha</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history.map(h => (
                                            <tr key={h.id} className="border-t border-[#1e2329]/60 hover:bg-[#1e2329]/40">
                                                <td className="px-4 py-2.5 text-white font-medium">{SYMBOLS.find(s => s.id === h.symbol)?.label}</td>
                                                <td className="px-3 py-2.5 text-center"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${h.direction === 'buy' ? 'bg-[#0ecb81]/15 text-[#0ecb81]' : 'bg-[#f6465d]/15 text-[#f6465d]'}`}>{h.direction === 'buy' ? 'LONG' : 'SHORT'}</span></td>
                                                <td className="px-3 py-2.5 text-center text-slate-400 font-mono">{h.lot_size}</td>
                                                <td className="px-3 py-2.5 text-center text-slate-500 font-mono">{formatPrice(h.entry_price, h.symbol)}</td>
                                                <td className="px-3 py-2.5 text-center text-slate-500 font-mono">{formatPrice(h.close_price, h.symbol)}</td>
                                                <td className="px-3 py-2.5 text-center"><span className={`text-[9px] px-1.5 py-0.5 rounded ${h.close_reason === 'stop_loss' ? 'bg-[#f6465d]/10 text-[#f6465d]' : h.close_reason === 'take_profit' ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-slate-800 text-slate-500'}`}>{h.close_reason === 'stop_loss' ? 'SL' : h.close_reason === 'take_profit' ? 'TP' : 'Manual'}</span></td>
                                                <td className={`px-3 py-2.5 text-center font-mono font-bold ${(h.profit_loss||0) >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{(h.profit_loss||0) >= 0 ? '+' : ''}${h.profit_loss?.toFixed(2)}</td>
                                                <td className="px-3 py-2.5 text-center text-slate-600 text-[10px]">{h.closed_at ? new Date(h.closed_at).toLocaleDateString('es-ES', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )
                        )}

                        {/* ═══ STATS / REPORT ═══ */}
                        {activeTab === 'stats' && stats && (
                            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="stats-panel">
                                <div className="bg-[#1e2329] rounded-lg p-3 text-center col-span-2 md:col-span-4">
                                    <div className="flex items-center justify-center gap-4 flex-wrap">
                                        <div><span className="text-slate-500 text-[10px] block">Perfil</span><span className="text-[#F0B90B] font-bold">{stats.profile}</span></div>
                                        <div><span className="text-slate-500 text-[10px] block">Riesgo</span><span className={`font-bold ${stats.risk_level === 'Alto' ? 'text-[#f6465d]' : stats.risk_level === 'Medio' ? 'text-[#F0B90B]' : 'text-[#0ecb81]'}`}>{stats.risk_level}</span></div>
                                        <div><span className="text-slate-500 text-[10px] block">Win Rate</span><span className="text-white font-bold">{stats.win_rate}%</span></div>
                                        <div><span className="text-slate-500 text-[10px] block">Racha</span><span className="text-[#F0B90B] font-bold">{stats.win_streak}</span></div>
                                        <div><span className="text-slate-500 text-[10px] block">Favorito</span><span className="text-white font-bold">{stats.favorite_asset || '—'}</span></div>
                                    </div>
                                </div>
                                {[
                                    ['Total Ops', stats.total_trades, 'text-white'],
                                    ['Neto P/L', `$${fmtMoney(stats.net_pl)}`, stats.net_pl >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'],
                                    ['Mejor', `+$${fmtMoney(stats.best_trade)}`, 'text-[#0ecb81]'],
                                    ['Peor', `$${fmtMoney(stats.worst_trade)}`, 'text-[#f6465d]'],
                                    ['Ganancias', `$${fmtMoney(stats.total_profit)}`, 'text-[#0ecb81]'],
                                    ['Perdidas', `$${fmtMoney(stats.total_loss)}`, 'text-[#f6465d]'],
                                    ['Sem. Ops', stats.weekly_trades, 'text-white'],
                                    ['Sem. P/L', `$${fmtMoney(stats.weekly_pl)}`, stats.weekly_pl >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'],
                                ].map(([label, value, color]) => (
                                    <div key={label} className="bg-[#1e2329] rounded-lg p-3 text-center">
                                        <p className="text-slate-600 text-[9px] uppercase">{label}</p>
                                        <p className={`font-mono font-bold text-sm ${color}`}>{value}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ═══ CHALLENGES ═══ */}
                        {activeTab === 'challenges' && (
                            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3" data-testid="challenges-panel">
                                {challenges.map(ch => (
                                    <div key={ch.id} className={`rounded-lg p-3 border transition-colors ${ch.completed ? 'bg-[#0ecb81]/5 border-[#0ecb81]/30' : 'bg-[#1e2329] border-[#2b3139]'}`}>
                                        <div className="flex items-center gap-2 mb-1">
                                            {ch.completed ? <CheckCircle className="w-4 h-4 text-[#0ecb81]" /> : <Trophy className="w-4 h-4 text-[#F0B90B]/40" />}
                                            <span className={`text-xs font-bold ${ch.completed ? 'text-[#0ecb81]' : 'text-white'}`}>{ch.name}</span>
                                        </div>
                                        <p className="text-slate-500 text-[10px] mb-2">{ch.desc}</p>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[9px] bg-[#F0B90B]/10 text-[#F0B90B] px-2 py-0.5 rounded font-bold">+{ch.xp} XP</span>
                                            {ch.completed ? <span className="flex items-center gap-1 text-[9px] text-[#0ecb81]"><Award className="w-3 h-3" />{ch.badge}</span> : <span className="text-slate-700 text-[9px]">Pendiente</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ═══ LEARNING ═══ */}
                        {activeTab === 'learning' && (
                            <div className="p-4" data-testid="learning-panel">
                                {selectedLesson ? (
                                    <div>
                                        <button onClick={() => setSelectedLesson(null)} className="text-[#F0B90B] text-xs mb-3 hover:underline flex items-center gap-1"><X className="w-3 h-3" /> Volver a modulos</button>
                                        <h3 className="text-white font-bold mb-1">{selectedLesson.title}</h3>
                                        <p className="text-slate-500 text-[10px] mb-4">{selectedLesson.duration} — Nivel: {selectedLesson.level}</p>
                                        <div className="bg-[#1e2329] rounded-lg p-4 text-slate-300 text-sm leading-relaxed whitespace-pre-line">{selectedLesson.content}</div>
                                        {!selectedLesson.completed && (
                                            <Button onClick={() => { completeLesson(selectedLesson.id); setSelectedLesson({...selectedLesson, completed: true}); }}
                                                className="mt-4 bg-[#F0B90B] hover:bg-[#F0B90B]/90 text-black font-bold" data-testid="complete-lesson-btn">
                                                <CheckCircle className="w-4 h-4 mr-2" /> Marcar como completado
                                            </Button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                        {learning.map(m => (
                                            <button key={m.id} onClick={() => setSelectedLesson(m)}
                                                className={`text-left rounded-lg p-3 border transition-colors hover:border-[#F0B90B]/40 ${m.completed ? 'bg-[#0ecb81]/5 border-[#0ecb81]/30' : 'bg-[#1e2329] border-[#2b3139]'}`} data-testid={`lesson-${m.id}`}>
                                                <div className="flex items-center gap-2 mb-1">
                                                    {m.completed ? <CheckCircle className="w-4 h-4 text-[#0ecb81] flex-shrink-0" /> : <BookOpen className="w-4 h-4 text-[#F0B90B] flex-shrink-0" />}
                                                    <span className="text-white text-xs font-bold truncate">{m.title}</span>
                                                </div>
                                                <p className="text-slate-500 text-[10px]">{m.duration} — {m.level}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ═══ REPLAY ═══ */}
                        {activeTab === 'replay' && (
                            <div className="p-4" data-testid="replay-panel">
                                <div className="flex items-center gap-3 mb-3">
                                    <button onClick={toggleReplayPlay} data-testid="replay-play-btn"
                                        className={`px-4 py-2 rounded-lg text-xs font-bold ${replayPlaying ? 'bg-[#f6465d] text-white' : 'bg-[#F0B90B] text-black'}`}>
                                        {replayPlaying ? 'Pausar' : 'Reproducir'}
                                    </button>
                                    <input type="range" min={10} max={199} value={replayIdx}
                                        onChange={e => { if (!replayPlaying) setReplayIdx(parseInt(e.target.value)); }}
                                        className="flex-1 accent-[#F0B90B]" data-testid="replay-slider" />
                                    <span className="text-slate-500 text-xs font-mono">{replayIdx}/200</span>
                                    <button onClick={startReplay} className="text-slate-500 hover:text-[#F0B90B] text-xs"><RefreshCw className="w-3.5 h-3.5" /></button>
                                </div>
                                {replayCandles.length > 0 && (
                                    <div className="bg-[#0b0e11] rounded-lg overflow-hidden border border-[#1e2329]" style={{height: 200}}>
                                        <ReplayMiniChart candles={replayCandles.slice(0, replayIdx + 1)} />
                                    </div>
                                )}
                                <p className="text-slate-600 text-[10px] mt-2 text-center">Practica leyendo el grafico. Puedes pausar, rebobinar y analizar patrones.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══ DIALOGS ═══ */}
                <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
                    <DialogContent className="bg-[#1e2329] border-[#2b3139] max-w-sm" data-testid="transfer-dialog">
                        <DialogHeader><DialogTitle className="text-white flex items-center gap-2"><Zap className="w-5 h-5 text-[#F0B90B]" /> Transferir Ganancias</DialogTitle></DialogHeader>
                        <div className="space-y-4 pt-2">
                            <div className="p-4 rounded-xl bg-[#F0B90B]/8 border border-[#F0B90B]/20">
                                <p className="text-[#F0B90B]/80 text-sm leading-relaxed">Las ganancias demo son virtuales. Esta funcion estara disponible en el <strong>Modo Profesional</strong>.</p>
                            </div>
                            <div className="p-4 rounded-xl bg-[#0b0e11] text-center">
                                <p className="text-slate-500 text-xs mb-1">Ganancias Demo</p>
                                <p className={`text-2xl font-mono font-bold ${(account?.balance || 0) - 10000 >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                                    {((account?.balance || 0) - 10000) >= 0 ? '+' : ''}${((account?.balance || 0) - 10000).toFixed(2)}
                                </p>
                            </div>
                            <Button onClick={() => setShowTransfer(false)} className="w-full bg-[#2b3139] hover:bg-[#363d47] text-white">Entendido</Button>
                        </div>
                    </DialogContent>
                </Dialog>

                <Dialog open={showPro} onOpenChange={setShowPro}>
                    <DialogContent className="bg-[#1e2329] border-[#2b3139] max-w-sm" data-testid="pro-mode-dialog">
                        <DialogHeader><DialogTitle className="text-white flex items-center gap-2"><Lock className="w-5 h-5 text-[#F0B90B]" /> Modo Profesional</DialogTitle></DialogHeader>
                        <div className="space-y-4 pt-2">
                            <div className="p-5 rounded-xl bg-gradient-to-br from-[#F0B90B]/10 to-[#F0B90B]/5 border border-[#F0B90B]/20 text-center">
                                <Lock className="w-10 h-10 text-[#F0B90B] mx-auto mb-3" />
                                <h3 className="text-white font-bold text-lg mb-2">Proximamente</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">Estamos trabajando en el <strong className="text-[#F0B90B]">Modo Profesional</strong> y el <strong className="text-[#F0B90B]">Modo Real</strong> para una experiencia mas avanzada.</p>
                            </div>
                            <Button onClick={() => setShowPro(false)} className="w-full bg-[#F0B90B] hover:bg-[#F0B90B]/90 text-black font-bold">Entendido</Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Price Alerts modal */}
                <PriceAlerts
                    open={showAlerts}
                    onClose={setShowAlerts}
                    symbol={selectedSymbol}
                    currentPrice={sel ? (sel.bid + sel.ask) / 2 : null}
                    prices={prices}
                    formatPrice={formatPrice}
                />
            </div>
        </Layout>
    );
};

// Compact Converter
const ConverterMini = () => {
    const [amount, setAmount] = useState('100');
    const [from, setFrom] = useState('USD');
    const [to, setTo] = useState('EUR');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const convert = async () => {
        setLoading(true);
        try { const res = await api.get('/trading/convert', { params: { amount: parseFloat(amount) || 0, from_currency: from, to_currency: to } }); setResult(res.data); }
        catch { toast.error('Error'); }
        finally { setLoading(false); }
    };

    return (
        <div className="p-4">
            <h4 className="text-slate-500 text-[10px] uppercase tracking-wider mb-3 flex items-center gap-1.5"><ArrowRightLeft className="w-3.5 h-3.5" /> Conversor</h4>
            <div className="space-y-2">
                <Input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="Monto"
                    className="bg-[#1e2329] border-[#2b3139] text-white text-sm h-9 focus:border-[#F0B90B]" data-testid="converter-amount" />
                <div className="flex gap-1.5 items-center">
                    <select value={from} onChange={e => setFrom(e.target.value)} data-testid="converter-from"
                        className="flex-1 bg-[#1e2329] border border-[#2b3139] text-white rounded-md px-2 text-xs h-9">
                        {['USD', 'EUR', 'GBP', 'JPY'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button onClick={() => { setFrom(to); setTo(from); setResult(null); }} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-[#F0B90B]">
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                    </button>
                    <select value={to} onChange={e => setTo(e.target.value)} data-testid="converter-to"
                        className="flex-1 bg-[#1e2329] border border-[#2b3139] text-white rounded-md px-2 text-xs h-9">
                        {['USD', 'EUR', 'GBP', 'JPY'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <Button onClick={convert} disabled={loading} size="sm" className="w-full bg-[#F0B90B] hover:bg-[#F0B90B]/90 text-black font-bold h-8 text-xs" data-testid="convert-btn">
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Convertir'}
                </Button>
                {result && (
                    <div className="bg-[#1e2329] rounded-lg p-2.5 text-center">
                        <p className="text-white font-mono font-bold text-sm">{result.result.toLocaleString('en-US', { minimumFractionDigits: 2 })} {result.to}</p>
                        <p className="text-slate-600 text-[9px] mt-0.5">1 {result.from} = {result.rate} {result.to}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// Replay Mini Chart using canvas
const ReplayMiniChart = ({ candles }) => {
    const canvasRef = useRef(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !candles?.length) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width = canvas.parentElement.clientWidth;
        const H = canvas.height = 200;
        ctx.clearRect(0, 0, W, H);

        const prices = candles.flatMap(c => [c.high, c.low]);
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        const range = maxP - minP || 1;
        const barW = Math.max(2, (W - 20) / candles.length);

        ctx.fillStyle = '#0b0e11';
        ctx.fillRect(0, 0, W, H);

        candles.forEach((c, i) => {
            const x = 10 + i * barW;
            const yO = H - 10 - ((c.open - minP) / range) * (H - 20);
            const yC = H - 10 - ((c.close - minP) / range) * (H - 20);
            const yH = H - 10 - ((c.high - minP) / range) * (H - 20);
            const yL = H - 10 - ((c.low - minP) / range) * (H - 20);
            const up = c.close >= c.open;
            ctx.strokeStyle = up ? '#0ecb81' : '#f6465d';
            ctx.fillStyle = up ? '#0ecb81' : '#f6465d';
            // Wick
            ctx.beginPath();
            ctx.moveTo(x + barW / 2, yH);
            ctx.lineTo(x + barW / 2, yL);
            ctx.stroke();
            // Body
            const bodyTop = Math.min(yO, yC);
            const bodyH = Math.max(1, Math.abs(yO - yC));
            ctx.fillRect(x + 1, bodyTop, Math.max(1, barW - 2), bodyH);
        });
    }, [candles]);
    return <canvas ref={canvasRef} style={{ width: '100%', height: 200 }} />;
};

export default TradingDemoPage;
