import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { OdometerValue } from '../components/dashboard/OdometerValue';
import api from '../lib/api';
import {
    Landmark, ShieldCheck, RefreshCw, ExternalLink, CheckCircle2,
    ArrowUpRight, ArrowDownRight, TrendingUp, Activity, Wallet, Gauge,
    Banknote, FileCheck, Star, Server, Layers, Clock, Copy, Check, Info,
    LineChart, BarChart3, List, Book, ArrowLeftRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { MarketWatch, TradingPanel } from '../components/mt5/MarketWatchAndTrading';
import { OpenPositions, PendingOrders, FundsPanel, JournalPanel, StatementPanel } from '../components/mt5/MT5Sections';
import { MT5InvestSection } from '../components/mt5/MT5InvestSection';

const fmtMoney = (n, cur = 'USD') => {
    const symbol = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '';
    return `${symbol}${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtNum = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (n) => `${Number(n || 0).toFixed(2)}%`;
const fmtPrice = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
const fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// ─────────────────── Atoms ───────────────────
const KpiCard = ({ label, value, icon: Icon, color = '#14549C', sub, testId, accent = false }) => (
    <Card className={`relative overflow-hidden p-4 sm:p-5 bg-gradient-to-br from-slate-900/90 to-slate-950 border-slate-800/80 ${accent ? 'ring-1 ring-[#14549C]/25' : ''}`} data-testid={testId}>
        <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center ring-1" style={{
                backgroundColor: color + '22', color, borderColor: color + '55',
            }}>
                <Icon className="w-4 h-4" />
            </div>
        </div>
        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold">{label}</p>
        <div className="text-2xl sm:text-[28px] text-white mt-1.5 font-numbers tabular-nums leading-tight" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
            {value}
        </div>
        {sub && <p className="text-[11px] text-slate-500 mt-1.5 truncate">{sub}</p>}
    </Card>
);

const DirectionChip = ({ direction }) => {
    const isBuy = direction === 'buy';
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
            isBuy ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
        }`}>
            {isBuy ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {isBuy ? 'BUY' : 'SELL'}
        </span>
    );
};

const ProfitCell = ({ value }) => {
    const n = Number(value || 0);
    const sign = n >= 0 ? '+' : '−';
    return (
        <span className={`font-mono tabular-nums font-bold ${n >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
            {sign}${Math.abs(n).toFixed(2)}
        </span>
    );
};

// ─────────────────── Main page ───────────────────
export const MT5Page = () => {
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [data, setData] = useState(null);
    const [copied, setCopied] = useState(false);
    const heartbeatRef = useRef(null);

    const fetchSummary = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const res = await api.get('/mt5/summary');
            setData(res.data);
        } catch (e) { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        fetchSummary();
        heartbeatRef.current = setInterval(() => fetchSummary(true), 15000);
        return () => clearInterval(heartbeatRef.current);
    }, [fetchSummary]);

    const handleSync = async () => {
        setSyncing(true);
        try {
            await api.post('/mt5/sync');
            await fetchSummary(true);
            toast.success('Cuenta MT5 sincronizada');
        } catch (e) {
            toast.error('Error sincronizando');
        } finally {
            setSyncing(false);
        }
    };

    const copyLogin = (val) => {
        navigator.clipboard.writeText(String(val));
        setCopied(true);
        toast.success('Número de cuenta copiado');
        setTimeout(() => setCopied(false), 1800);
    };

    if (loading && !data) {
        return (
            <Layout>
                <div className="max-w-6xl mx-auto p-4 sm:p-6">
                    <p className="text-slate-500 text-sm">Conectando con MetaTrader 5...</p>
                </div>
            </Layout>
        );
    }

    const acc = data?.account || {};
    const broker = data?.broker || {};
    const recent = data?.recent_operations || [];
    const counts = data?.counts || { open: 0, closed: 0 };

    const growthPct = acc.initial_balance
        ? ((acc.equity - acc.initial_balance) / acc.initial_balance) * 100
        : 0;
    const marginLevelTone = acc.margin_level > 300 ? 'emerald' : acc.margin_level > 100 ? 'amber' : acc.margin_level > 0 ? 'rose' : 'slate';
    const mlColor = { emerald: '#0ecb81', amber: '#f0b90b', rose: '#f6465d', slate: '#94a3b8' }[marginLevelTone];

    return (
        <Layout>
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto space-y-5 p-3 sm:p-5" data-testid="mt5-page">

                {/* ── Header ─────────────────────────────────── */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-[#14549C] to-[#0b3f75] ring-1 ring-white/10 flex items-center justify-center shadow-lg shadow-[#14549C]/30 flex-shrink-0">
                            <Landmark className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                        </div>
                        <div>
                            <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-[#4a9eff] font-bold">
                                LIONSBIT · Infraestructura Institucional
                            </p>
                            <h1 className="text-2xl sm:text-3xl text-white mt-0.5" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                                MetaTrader 5 <span className="text-slate-500 font-normal">· MT5</span>
                            </h1>
                            <p className="text-slate-400 text-[12px] sm:text-sm mt-1 max-w-2xl leading-snug">
                                Nuestra infraestructura financiera utiliza tecnología MetaTrader 5 (MT5) junto a brokers regulados internacionalmente para ofrecer <span className="text-slate-200">trazabilidad, seguridad y ejecución profesional</span> de operaciones.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-emerald-300 text-xs font-semibold">Cuenta activa</span>
                        </div>
                        <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing} className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs h-9" data-testid="mt5-sync-btn">
                            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncing ? 'animate-spin' : ''}`} /> Sincronizar
                        </Button>
                    </div>
                </div>

                {/* ── Account Identity Card ─────────────────── */}
                <Card className="relative overflow-hidden bg-gradient-to-br from-[#0b1b34] via-[#0c1f3d]/90 to-slate-950 border-[#14549C]/30 p-5 sm:p-6">
                    <div
                        aria-hidden="true"
                        className="absolute -right-10 -top-10 w-60 h-60 rounded-full opacity-40 blur-2xl"
                        style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.25), transparent 70%)' }}
                    />
                    <div className="relative flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/90 font-bold">Cuenta MT5 vinculada</p>
                            <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
                                <button
                                    onClick={() => copyLogin(acc.login)}
                                    className="text-2xl sm:text-3xl text-white font-mono tabular-nums font-bold tracking-wider hover:text-cyan-300 transition-colors inline-flex items-center gap-2"
                                    data-no-hover
                                    data-testid="mt5-account-login"
                                >
                                    <span>#{acc.login}</span>
                                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-500" />}
                                </button>
                            </div>
                            <div className="flex items-center gap-3 sm:gap-4 mt-3 flex-wrap text-[11px]">
                                <div className="inline-flex items-center gap-1.5 text-slate-400">
                                    <Server className="w-3.5 h-3.5 text-cyan-400" />
                                    <span className="font-mono">{acc.server}</span>
                                </div>
                                <div className="inline-flex items-center gap-1.5 text-slate-400">
                                    <Layers className="w-3.5 h-3.5 text-amber-300" />
                                    <span>Apalancamiento</span>
                                    <span className="text-white font-mono font-bold">1:{acc.leverage}</span>
                                </div>
                                <div className="inline-flex items-center gap-1.5 text-slate-400">
                                    <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Divisa</span>
                                    <span className="text-white font-mono font-bold">{acc.currency}</span>
                                </div>
                            </div>
                        </div>
                        <div className="text-right min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold">Rendimiento total</p>
                            <p className={`text-lg sm:text-xl font-mono tabular-nums font-bold mt-1 ${growthPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                                {growthPct >= 0 ? '+' : ''}{growthPct.toFixed(2)}%
                            </p>
                            <p className="text-[10px] text-slate-600 mt-0.5">vs {fmtMoney(acc.initial_balance)} inicial</p>
                        </div>
                    </div>
                </Card>

                {/* ── Section 1: Dashboard KPIs ─────────────── */}
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-5 rounded-full bg-[#14549C]" />
                        <h2 className="text-[13px] font-semibold text-slate-200 tracking-wide uppercase">Dashboard de cuenta</h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                        <KpiCard icon={Wallet}    label="Balance disponible" color="#14549C" testId="mt5-kpi-balance" accent
                            value={<OdometerValue value={fmtMoney(acc.balance)} staggerMs={40} />}
                            sub="Saldo tras operaciones cerradas" />
                        <KpiCard icon={TrendingUp} label="Equity (tiempo real)" color="#22d3ee" testId="mt5-kpi-equity"
                            value={<OdometerValue value={fmtMoney(acc.equity)} staggerMs={40} />}
                            sub="Balance + PnL flotante" />
                        <KpiCard icon={Activity}  label="Profit / Loss" color={acc.profit >= 0 ? '#0ecb81' : '#f6465d'} testId="mt5-kpi-pnl"
                            value={
                                <span className={acc.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                                    {acc.profit >= 0 ? '+' : ''}{fmtMoney(Math.abs(acc.profit))}
                                </span>
                            }
                            sub="PnL flotante abierto" />
                        <KpiCard icon={Gauge}     label="Margin Level" color={mlColor} testId="mt5-kpi-margin-level"
                            value={acc.margin_level > 0 ? fmtPct(acc.margin_level) : '—'}
                            sub={`Margen usado: ${fmtMoney(acc.margin_used)}`} />
                    </div>
                </div>

                {/* ── Section 2: Broker asociado ────────────── */}
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-5 rounded-full bg-emerald-500" />
                        <h2 className="text-[13px] font-semibold text-slate-200 tracking-wide uppercase">Broker asociado</h2>
                    </div>
                    <Card className="bg-slate-900/70 border-slate-800/80 p-5 sm:p-6" data-testid="mt5-broker-card">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex items-start gap-4 min-w-0 flex-1">
                                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 ring-1 ring-emerald-500/40 flex items-center justify-center flex-shrink-0">
                                    <ShieldCheck className="w-7 h-7 text-emerald-300" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-white text-lg sm:text-xl font-bold" style={{ letterSpacing: '-0.01em' }}>
                                            {broker.name}
                                        </h3>
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 text-emerald-300 text-[10px] font-bold tracking-wider uppercase">
                                            <CheckCircle2 className="w-3 h-3" /> Verificado
                                        </span>
                                    </div>
                                    <p className="text-slate-500 text-[11px] mt-0.5">{broker.legal_name}</p>
                                    <p className="text-slate-300 text-[12.5px] mt-2 leading-relaxed">{broker.description}</p>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-4">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Regulación</p>
                                            <p className="text-[13px] text-white mt-0.5">{broker.regulator}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Número de licencia</p>
                                            <p className="text-[13px] text-white mt-0.5 font-mono">{broker.license_number}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Jurisdicción</p>
                                            <p className="text-[13px] text-white mt-0.5">{broker.country}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Opera desde</p>
                                            <p className="text-[13px] text-white mt-0.5">{broker.year_founded}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 mt-4 flex-wrap">
                                        <a
                                            href={broker.license_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#14549C]/15 hover:bg-[#14549C]/25 text-[#4a9eff] text-xs font-semibold ring-1 ring-[#14549C]/40 transition-colors"
                                            data-no-hover
                                            data-testid="mt5-view-license-btn"
                                        >
                                            <FileCheck className="w-3.5 h-3.5" /> Ver licencia oficial
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                        <a
                                            href={broker.website}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/70 hover:bg-slate-800 text-slate-300 text-xs font-semibold ring-1 ring-slate-700 transition-colors"
                                            data-no-hover
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" /> Sitio web oficial
                                        </a>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30">
                                    <Star className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                                    <span className="text-amber-200 font-bold text-sm font-mono">{broker.rating}</span>
                                    <span className="text-amber-300/60 text-xs">/10</span>
                                </div>
                                <p className="text-[10px] text-slate-600 mt-1.5">Rating regulatorio</p>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* ── Section 3: Professional crypto investment ─── */}
                <MT5InvestSection />

                {/* ── Section 4: Full trading suite with tabs ─────── */}
                <MT5TradingSuite account={acc} onAccountChange={() => fetchSummary(true)} />

                {/* ── Linked withdrawals / footer ─── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {[
                        { icon: ShieldCheck, label: 'Trazabilidad on-chain + MT5', sub: 'Auditable' },
                        { icon: Banknote,    label: 'Retiros vinculados a Wallet', sub: 'SEPA / crypto' },
                        { icon: Info,        label: 'Datos simulados en demo',     sub: 'Bridge MT5 real en producción' },
                    ].map((t) => (
                        <div key={t.label} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
                            <div className="w-8 h-8 rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/25 flex items-center justify-center flex-shrink-0">
                                <t.icon className="w-4 h-4 text-emerald-400" />
                            </div>
                            <div className="leading-tight min-w-0">
                                <p className="text-[12px] font-semibold text-slate-200 truncate">{t.label}</p>
                                <p className="text-[10px] text-slate-500 truncate">{t.sub}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>
        </Layout>
    );
};

// ─────────────────── Operations tabs component ───────────────────
const MT5TradingSuite = ({ account, onAccountChange }) => {
    const [tab, setTab] = useState('market');
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
        { id: 'market',    label: 'Market Watch',    icon: BarChart3 },
        { id: 'positions', label: 'Posiciones',      icon: Activity },
        { id: 'pending',   label: 'Pendientes',      icon: List },
        { id: 'history',   label: 'Historial',       icon: Clock },
        { id: 'funds',     label: 'Fondos',          icon: ArrowLeftRight },
        { id: 'report',    label: 'Reporte',         icon: LineChart },
        { id: 'journal',   label: 'Journal',         icon: Book },
    ];

    return (
        <div data-testid="mt5-trading-suite">
            <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-5 rounded-full bg-amber-500" />
                <h2 className="text-[13px] font-semibold text-slate-200 tracking-wide uppercase">Terminal MT5</h2>
            </div>

            {/* Tabs */}
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/70 overflow-hidden">
                <div className="flex items-center gap-1 px-2 py-2 border-b border-slate-800/80 overflow-x-auto scrollbar-hide">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            data-testid={`mt5-suite-tab-${t.id}`}
                            data-no-hover
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                                tab === t.id
                                    ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30'
                                    : 'text-slate-500 hover:text-slate-200'
                            }`}
                        >
                            <t.icon className="w-3.5 h-3.5" /> {t.label}
                        </button>
                    ))}
                </div>

                <div className="p-4 sm:p-5">
                    {tab === 'market'    && <MarketWatch onOpenTrade={openTrade} accountBalance={account?.balance} />}
                    {tab === 'positions' && <OpenPositions onChange={onAccountChange} />}
                    {tab === 'pending'   && <PendingOrders />}
                    {tab === 'history'   && <HistoryTable />}
                    {tab === 'funds'     && <FundsPanel account={account} onDone={onAccountChange} />}
                    {tab === 'report'    && <StatementPanel />}
                    {tab === 'journal'   && <JournalPanel />}
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

// History sub-component (closed trades with filter)
const HistoryTable = () => {
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
                    className="flex-1 h-9 px-3 rounded-lg bg-slate-950/60 border border-slate-800 text-white text-sm focus:outline-none focus:border-cyan-500/40"
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
                            <tr className="text-slate-600 text-left border-b border-slate-800/80">
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider">Ticket</th>
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider">Símbolo</th>
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider">Dir</th>
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right">Lot</th>
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right">E/C</th>
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right">Cierre</th>
                                <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right">Profit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(op => {
                                const p = Number(op.profit || 0);
                                return (
                                    <tr key={op.id} className="border-b border-slate-800/40">
                                        <td className="py-2 px-3 text-slate-400 font-mono">#{op.ticket}</td>
                                        <td className="py-2 px-3 text-white font-mono">{op.symbol_name || op.symbol}</td>
                                        <td className={`py-2 px-3 font-bold ${op.direction === 'buy' ? 'text-emerald-300' : 'text-rose-300'}`}>{op.direction === 'buy' ? 'BUY' : 'SELL'}</td>
                                        <td className="py-2 px-3 text-right text-white font-mono tabular-nums">{op.lot}</td>
                                        <td className="py-2 px-3 text-right text-slate-400 font-mono tabular-nums text-[10px]">{fmtPrice(op.open_price)} → {fmtPrice(op.close_price)}</td>
                                        <td className="py-2 px-3 text-right text-slate-500 font-mono text-[10px]">{fmtDT(op.close_time)}</td>
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


export default MT5Page;
