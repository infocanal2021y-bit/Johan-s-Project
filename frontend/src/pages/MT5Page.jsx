import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { OdometerValue } from '../components/dashboard/OdometerValue';
import api from '../lib/api';
import {
    ShieldCheck, RefreshCw, ExternalLink, CheckCircle2, CandlestickChart,
    TrendingUp, Activity, Wallet, Gauge, FileCheck, Star, Server, Layers,
    Clock, Copy, Check, ArrowLeftRight, LineChart, Book, Landmark, Scale, Percent,
} from 'lucide-react';
import { toast } from 'sonner';
import { FundsPanel, JournalPanel, StatementPanel } from '../components/mt5/MT5Sections';
import { MT5TradingSuite, HistoryTable } from '../components/mt5/MT5TradingSuite';
import { MT5InvestSection } from '../components/mt5/MT5InvestSection';
import { MT5CoachWidget } from '../components/mt5/MT5CoachWidget';
import { BrokerVerifyModal, BrokerVerifyHistory } from '../components/mt5/BrokerVerifyModal';
import {
    MT5PrimaryActions,
    MT5LimitsAndKyc,
    GlobalWithdrawalsFeed,
    BlockchainTransactions,
    ReserveInvestmentModal,
} from '../components/mt5/MT5HubSections';

const GOLD = '#D4AF37';

const fmtMoney = (n, cur = 'USD') => {
    const symbol = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '';
    return `${symbol}${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtPct = (n) => `${Number(n || 0).toFixed(2)}%`;

// ─────────────────── Estado de conexión ───────────────────
const STATUS = {
    connected:    { label: 'Conectado',    dot: 'bg-emerald-400', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
    syncing:      { label: 'Sincronizando', dot: 'bg-sky-400 animate-pulse', cls: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
    disconnected: { label: 'Desconectado', dot: 'bg-rose-400', cls: 'bg-rose-500/10 text-rose-300 border-rose-500/30' },
};

const StatusPill = ({ status }) => {
    const s = STATUS[status] || STATUS.connected;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold tracking-[0.12em] uppercase border ${s.cls}`}
            data-testid="mt5-status-pill">
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === 'connected' ? 'animate-pulse' : ''}`} />
            {s.label}
        </span>
    );
};

const DemoBadge = () => (
    <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold tracking-[0.14em] uppercase bg-[#D4AF37]/12 text-[#F3D372] border border-[#D4AF37]/35"
        data-testid="mt5-demo-badge" title="Datos simulados para demostración · Bridge MT5 real en producción">
        Demo
    </span>
);

// ─────────────────── KPI ───────────────────
const KpiCard = ({ label, value, icon: Icon, color = '#14549C', sub, testId, gold = false, ariaValue }) => (
    <div
        className={`relative overflow-hidden rounded-xl p-3.5 sm:p-4 bg-gradient-to-br from-[#0A111F] via-[#0E182A] to-[#080E1A] border ${
            gold ? 'border-[#D4AF37]/30' : 'border-slate-800/80'
        } shadow-[0_4px_24px_-8px_rgba(0,0,0,0.6)] min-w-0`}
        data-testid={testId}
    >
        {gold && <div aria-hidden="true" className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}88, transparent)` }} />}
        <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center ring-1 flex-shrink-0"
                style={{ backgroundColor: color + '1e', color, borderColor: color + '44' }}>
                <Icon className="w-3.5 h-3.5" />
            </div>
            <p className="text-[9.5px] sm:text-[10px] uppercase tracking-[0.16em] text-slate-400 font-semibold truncate">{label}</p>
        </div>
        <div className="text-lg sm:text-xl lg:text-[22px] text-white font-mono tabular-nums font-bold leading-tight truncate" style={{ letterSpacing: '-0.02em' }}
            aria-label={ariaValue} data-testid={testId ? `${testId}-value` : undefined}>
            {value}
        </div>
        {sub && <p className="text-[10.5px] text-slate-500 mt-1 font-mono truncate">{sub}</p>}
    </div>
);

// ─────────────────── Página ───────────────────
export const MT5Page = () => {
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [connError, setConnError] = useState(false);
    const [data, setData] = useState(null);
    const [copied, setCopied] = useState(false);
    const [verifyOpen, setVerifyOpen] = useState(false);
    const [verifyTick, setVerifyTick] = useState(0);
    const [hubLimits, setHubLimits] = useState(null);
    const [reserveOpen, setReserveOpen] = useState(false);
    const [mainTab, setMainTab] = useState(() => {
        const q = new URLSearchParams(window.location.search).get('tab');
        return ['trading', 'funds', 'history', 'regulation'].includes(q) ? q : 'trading';
    });
    const { search: mt5Search } = useLocation();
    useEffect(() => {
        const q = new URLSearchParams(mt5Search).get('tab');
        if (['trading', 'funds', 'history', 'regulation'].includes(q)) setMainTab(q);
    }, [mt5Search]);
    const [histTab, setHistTab] = useState('history');
    const heartbeatRef = useRef(null);

    const fetchSummary = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const res = await api.get('/mt5/summary');
            setData(res.data);
            setConnError(false);
        } catch (e) { setConnError(true); }
        finally { setLoading(false); }
    }, []);

    const fetchHubLimits = useCallback(async () => {
        try {
            const res = await api.get('/mt5-hub/limits');
            setHubLimits(res.data);
        } catch (e) { /* silent */ }
    }, []);

    useEffect(() => {
        fetchSummary();
        fetchHubLimits();
        heartbeatRef.current = setInterval(() => fetchSummary(true), 15000);
        return () => clearInterval(heartbeatRef.current);
    }, [fetchSummary, fetchHubLimits]);

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
                <div className="max-w-6xl mx-auto p-4 sm:p-6 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                    <p className="text-slate-400 text-sm font-mono">Conectando con MetaTrader 5…</p>
                </div>
            </Layout>
        );
    }

    const acc = data?.account || {};
    const broker = data?.broker || {};
    const status = syncing ? 'syncing' : connError ? 'disconnected' : 'connected';

    const growthPct = acc.initial_balance
        ? ((acc.equity - acc.initial_balance) / acc.initial_balance) * 100
        : 0;
    const marginLevelTone = acc.margin_level > 300 ? 'emerald' : acc.margin_level > 100 ? 'amber' : acc.margin_level > 0 ? 'rose' : 'slate';
    const mlColor = { emerald: '#0ecb81', amber: '#f0b90b', rose: '#f6465d', slate: '#94a3b8' }[marginLevelTone];

    const MAIN_TABS = [
        { id: 'trading',    label: 'Trading',    icon: CandlestickChart },
        { id: 'funds',      label: 'Fondos',     icon: ArrowLeftRight },
        { id: 'history',    label: 'Historial',  icon: Clock },
        { id: 'regulation', label: 'Regulación', icon: Scale },
    ];
    const HIST_TABS = [
        { id: 'history', label: 'Operaciones', icon: Clock },
        { id: 'report',  label: 'Reporte',     icon: LineChart },
        { id: 'journal', label: 'Journal',     icon: Book },
    ];

    return (
        <Layout>
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto space-y-4 p-3 sm:p-5" data-testid="mt5-page">

                {/* ── Terminal header ─────────────────────────── */}
                <div className="relative overflow-hidden rounded-2xl border border-[#D4AF37]/20 bg-gradient-to-br from-[#0A111F] via-[#0E182A] to-[#080E1A] p-4 sm:p-5">
                    <div aria-hidden="true" className="absolute top-0 left-0 right-0 h-[2px]"
                        style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
                    <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 w-64 h-64 rounded-full opacity-25 blur-3xl"
                        style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.28), transparent 70%)' }} />

                    <div className="relative flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-start gap-3 min-w-0">
                            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-[#14549C] to-[#0b3f75] ring-1 ring-[#D4AF37]/30 flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#14549C]/30">
                                <Landmark className="w-5 h-5 sm:w-6 sm:h-6 text-[#F3D372]" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[9.5px] sm:text-[10px] uppercase tracking-[0.22em] text-[#E5C158] font-bold">
                                    LIONSBIT · Terminal Institucional
                                </p>
                                <h1 className="text-xl sm:text-2xl text-white mt-0.5 font-bold truncate" style={{ letterSpacing: '-0.02em' }}>
                                    MetaTrader 5
                                </h1>
                                <button
                                    onClick={() => copyLogin(acc.login)}
                                    className="mt-1 inline-flex items-center gap-1.5 text-sm sm:text-base text-slate-300 font-mono tabular-nums hover:text-[#F3D372] transition-colors"
                                    data-no-hover
                                    data-testid="mt5-account-login"
                                >
                                    <span className="font-bold">#{acc.login}</span>
                                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-600" />}
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <StatusPill status={status} />
                            <DemoBadge />
                            <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}
                                className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white text-xs h-8" data-testid="mt5-sync-btn">
                                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncing ? 'animate-spin' : ''}`} /> Sincronizar
                            </Button>
                        </div>
                    </div>

                    {/* Account meta strip */}
                    <div className="relative flex items-center gap-3 sm:gap-5 mt-3.5 pt-3.5 border-t border-slate-800/60 flex-wrap text-[11px]">
                        <div className="inline-flex items-center gap-1.5 text-slate-400 min-w-0">
                            <Server className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                            <span className="font-mono truncate">{acc.server}</span>
                        </div>
                        <div className="inline-flex items-center gap-1.5 text-slate-400">
                            <Layers className="w-3.5 h-3.5 text-[#E5C158]" />
                            <span>Apalancamiento</span>
                            <span className="text-white font-mono font-bold tabular-nums">1:{acc.leverage}</span>
                        </div>
                        <div className="inline-flex items-center gap-1.5 text-slate-400">
                            <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Divisa</span>
                            <span className="text-white font-mono font-bold">{acc.currency}</span>
                        </div>
                        <div className="inline-flex items-center gap-1.5 text-slate-400 ml-auto">
                            <Percent className="w-3.5 h-3.5 text-slate-500" />
                            <span>Rendimiento</span>
                            <span className={`font-mono font-bold tabular-nums ${growthPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`} data-testid="mt5-kpi-growth">
                                {growthPct >= 0 ? '+' : ''}{growthPct.toFixed(2)}%
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── KPI ribbon ─────────────────────────────── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3" data-testid="mt5-kpi-ribbon">
                    <KpiCard icon={Wallet} label="Balance" color={GOLD} testId="mt5-kpi-balance" gold ariaValue={fmtMoney(acc.balance)}
                        value={<OdometerValue value={fmtMoney(acc.balance)} staggerMs={40} />}
                        sub="Operaciones cerradas" />
                    <KpiCard icon={TrendingUp} label="Equity" color="#22d3ee" testId="mt5-kpi-equity" ariaValue={fmtMoney(acc.equity)}
                        value={<OdometerValue value={fmtMoney(acc.equity)} staggerMs={40} />}
                        sub="Balance + PnL flotante" />
                    <KpiCard icon={Activity} label="Profit / Loss" color={acc.profit >= 0 ? '#0ecb81' : '#f6465d'} testId="mt5-kpi-pnl"
                        value={
                            <span className={acc.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                                {acc.profit >= 0 ? '+' : '−'}{fmtMoney(Math.abs(acc.profit))}
                            </span>
                        }
                        sub="PnL flotante abierto" />
                    <KpiCard icon={Gauge} label="Margin Level" color={mlColor} testId="mt5-kpi-margin-level"
                        value={acc.margin_level > 0 ? fmtPct(acc.margin_level) : '—'}
                        sub={`Usado: ${fmtMoney(acc.margin_used)}`} />
                    <KpiCard icon={Percent} label="Rendimiento" color={growthPct >= 0 ? '#0ecb81' : '#f6465d'} testId="mt5-kpi-performance"
                        value={
                            <span className={growthPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                                {growthPct >= 0 ? '+' : ''}{growthPct.toFixed(2)}%
                            </span>
                        }
                        sub={`Inicial: ${fmtMoney(acc.initial_balance)}`} />
                </div>

                {/* ── Main terminal tabs ─────────────────────── */}
                <div className="rounded-xl border border-slate-800/80 bg-[#0A111F]/80 backdrop-blur px-1.5 py-1.5 flex items-center gap-1 overflow-x-auto scrollbar-hide sticky top-0 z-20">
                    {MAIN_TABS.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setMainTab(t.id)}
                            data-testid={`mt5-main-tab-${t.id}`}
                            data-no-hover
                            className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs sm:text-[13px] font-bold whitespace-nowrap transition-all min-h-[40px] ${
                                mainTab === t.id
                                    ? 'bg-[#D4AF37]/14 text-[#F3D372] ring-1 ring-[#D4AF37]/35 shadow-[0_0_18px_-6px_rgba(212,175,55,0.5)]'
                                    : 'text-slate-500 hover:text-slate-200'
                            }`}
                        >
                            <t.icon className="w-4 h-4" /> {t.label}
                        </button>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={mainTab}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18 }}
                        className="space-y-4"
                    >
                        {/* ══════════ TRADING ══════════ */}
                        {mainTab === 'trading' && (
                            <MT5TradingSuite account={acc} onAccountChange={() => fetchSummary(true)} />
                        )}

                        {/* ══════════ FONDOS ══════════ */}
                        {mainTab === 'funds' && (
                            <div className="space-y-4" data-testid="mt5-funds-tab">
                                <MT5PrimaryActions onReserveClick={() => setReserveOpen(true)} />
                                {hubLimits && <MT5LimitsAndKyc data={hubLimits} />}
                                <div className="rounded-xl border border-slate-800/80 bg-gradient-to-br from-[#0A111F] to-[#080E1A] p-4 sm:p-5">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#E5C158] font-bold mb-3">Depósitos y retiros internos</p>
                                    <FundsPanel account={acc} onDone={() => fetchSummary(true)} />
                                </div>
                                <MT5InvestSection />
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <GlobalWithdrawalsFeed />
                                    <BlockchainTransactions />
                                </div>
                            </div>
                        )}

                        {/* ══════════ HISTORIAL ══════════ */}
                        {mainTab === 'history' && (
                            <div className="rounded-xl border border-slate-800/80 bg-gradient-to-br from-[#0A111F] to-[#080E1A] overflow-hidden" data-testid="mt5-history-tab">
                                <div className="flex items-center gap-1 px-2 py-2 border-b border-slate-800/80 overflow-x-auto scrollbar-hide">
                                    {HIST_TABS.map(t => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setHistTab(t.id)}
                                            data-testid={`mt5-hist-tab-${t.id}`}
                                            data-no-hover
                                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all min-h-[36px] ${
                                                histTab === t.id
                                                    ? 'bg-[#D4AF37]/12 text-[#F3D372] ring-1 ring-[#D4AF37]/30'
                                                    : 'text-slate-500 hover:text-slate-200'
                                            }`}
                                        >
                                            <t.icon className="w-3.5 h-3.5" /> {t.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="p-3 sm:p-4">
                                    {histTab === 'history' && <HistoryTable />}
                                    {histTab === 'report'  && <StatementPanel />}
                                    {histTab === 'journal' && <JournalPanel />}
                                </div>
                            </div>
                        )}

                        {/* ══════════ REGULACIÓN ══════════ */}
                        {mainTab === 'regulation' && (
                            <div className="space-y-4" data-testid="mt5-regulation-tab">
                                <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-[#0A111F] via-[#0c1f3d]/40 to-[#080E1A] p-5 sm:p-6" data-testid="mt5-broker-card">
                                    <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-16 w-72 h-72 rounded-full opacity-20 blur-3xl"
                                        style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.45), transparent 70%)' }} />
                                    <div className="relative flex items-start justify-between gap-4 flex-wrap">
                                        <div className="flex items-start gap-4 min-w-0 flex-1">
                                            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 ring-1 ring-emerald-500/40 flex items-center justify-center flex-shrink-0">
                                                <span className="text-emerald-300 text-2xl font-black tracking-tighter">e</span>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-300 font-bold">Broker principal · Verificado</p>
                                                <h3 className="text-white text-lg sm:text-xl font-bold mt-0.5" style={{ letterSpacing: '-0.01em' }}>
                                                    {broker.name}
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 ml-2 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 text-emerald-300 text-[10px] font-bold tracking-wider uppercase align-middle">
                                                        <CheckCircle2 className="w-3 h-3" /> Verificado
                                                    </span>
                                                </h3>
                                                <p className="text-slate-500 text-[11px] mt-0.5">{broker.legal_name}</p>
                                                <p className="text-slate-300 text-[12.5px] mt-2 leading-relaxed">{broker.description}</p>

                                                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#D4AF37]/12 ring-1 ring-[#D4AF37]/30 text-[#F3D372] text-[10px] font-bold tracking-wider">
                                                        <ShieldCheck className="w-3 h-3" /> CNMV · España
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/15 ring-1 ring-cyan-500/30 text-cyan-200 text-[10px] font-bold tracking-wider">
                                                        <ShieldCheck className="w-3 h-3" /> CySEC · Chipre
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/15 ring-1 ring-indigo-500/30 text-indigo-200 text-[10px] font-bold tracking-wider">
                                                        <ShieldCheck className="w-3 h-3" /> FCA · Reino Unido
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/70 ring-1 ring-slate-700 text-slate-300 text-[10px] font-bold tracking-wider">
                                                        <Activity className="w-3 h-3" /> MetaTrader 5
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-4">
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Regulación</p>
                                                        <p className="text-[13px] text-white mt-0.5">{broker.regulator}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Licencia principal CySEC</p>
                                                        <p className="text-[13px] text-white mt-0.5 font-mono">No. {broker.cysec_license || broker.license_number}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Nº Registro CNMV</p>
                                                        <p className="text-[13px] text-white mt-0.5 font-mono">{broker.cnmv_registry_number || '—'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Fecha de registro</p>
                                                        <p className="text-[13px] text-white mt-0.5">{broker.cnmv_registry_date || '—'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Jurisdicción</p>
                                                        <p className="text-[13px] text-white mt-0.5">{broker.jurisdiction || broker.country}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Opera desde</p>
                                                        <p className="text-[13px] text-white mt-0.5">{broker.year_founded}</p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 mt-4 flex-wrap">
                                                    <a href={broker.license_url} target="_blank" rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-xs font-semibold ring-1 ring-emerald-500/40 transition-colors"
                                                        data-no-hover data-testid="mt5-view-license-btn">
                                                        <FileCheck className="w-3.5 h-3.5" /> Ver licencia oficial
                                                        <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                    <button type="button" onClick={() => setVerifyOpen(true)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 text-xs font-semibold ring-1 ring-cyan-500/40 transition-colors"
                                                        data-no-hover data-testid="mt5-validate-regulation-btn">
                                                        <ShieldCheck className="w-3.5 h-3.5" /> Validar regulación
                                                    </button>
                                                    <a href={broker.website} target="_blank" rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/70 hover:bg-slate-800 text-slate-300 text-xs font-semibold ring-1 ring-slate-700 transition-colors"
                                                        data-no-hover>
                                                        <ExternalLink className="w-3.5 h-3.5" /> Sitio web oficial
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#D4AF37]/10 ring-1 ring-[#D4AF37]/30">
                                                <Star className="w-3.5 h-3.5 text-[#F3D372] fill-[#F3D372]" />
                                                <span className="text-[#F3D372] font-bold text-sm font-mono">{broker.rating}</span>
                                                <span className="text-[#E5C158]/60 text-xs">/10</span>
                                            </div>
                                            <p className="text-[10px] text-slate-600 mt-1.5">Rating regulatorio</p>
                                        </div>
                                    </div>

                                    <div className="relative mt-5 px-4 py-3 rounded-lg bg-emerald-500/5 ring-1 ring-emerald-500/25">
                                        <div className="flex items-start gap-2">
                                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-300 flex-shrink-0 mt-0.5" />
                                            <p className="text-slate-300 text-[11.5px] leading-relaxed">
                                                Las operaciones financieras e inversiones son gestionadas mediante infraestructura <span className="text-white font-semibold">MetaTrader 5 (MT5)</span> y brokers regulados internacionalmente como <span className="text-emerald-200 font-semibold">eToro</span>, registrado ante la <span className="text-[#F3D372] font-semibold">CNMV (Nº 2534)</span> y supervisado por entidades financieras europeas, garantizando cumplimiento legal, trazabilidad y seguridad para nuestros usuarios.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* European Protection */}
                                <div data-testid="mt5-eu-protection">
                                    <div className="relative overflow-hidden rounded-xl border border-[#FFCC00]/30 bg-gradient-to-r from-[#003399]/30 via-[#0A111F]/80 to-[#003399]/20 p-5">
                                        <div className="relative flex items-start gap-4 flex-wrap">
                                            <div className="w-14 h-14 rounded-full bg-[#003399] ring-2 ring-[#FFCC00]/60 flex items-center justify-center flex-shrink-0">
                                                <ShieldCheck className="w-7 h-7 text-[#FFCC00]" strokeWidth={2.2} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[10px] uppercase tracking-[0.16em] text-[#FFCC00] font-bold">UE · MiFID II · ICF</p>
                                                <h3 className="text-white text-base sm:text-lg font-bold mt-0.5" style={{ letterSpacing: '-0.01em' }}>
                                                    Inversiones protegidas bajo regulación europea
                                                </h3>
                                                <p className="text-slate-300 text-[12px] mt-1 leading-relaxed max-w-3xl">
                                                    Sus fondos están protegidos por el marco regulatorio de la Unión Europea bajo directivas <span className="text-white font-semibold">MiFID II</span>, supervisión de <span className="text-[#F3D372] font-semibold">CNMV (España)</span> y <span className="text-cyan-200 font-semibold">CySEC (Chipre)</span>, con cobertura del fondo de compensación de inversores <span className="text-white font-semibold">ICF</span> hasta <span className="text-white font-semibold">€20,000</span> por cliente.
                                                </p>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                                                    {[
                                                        ['Cobertura ICF', '€20,000', 'text-emerald-300'],
                                                        ['Segregación', '100% Tier-1', 'text-cyan-300'],
                                                        ['Auditoría', 'PwC · KPMG', 'text-[#F3D372]'],
                                                        ['Cumplimiento', 'MiFID II', 'text-indigo-300'],
                                                    ].map(([l, v, c]) => (
                                                        <div key={l} className="px-2.5 py-1.5 rounded-md bg-slate-950/50 ring-1 ring-slate-800">
                                                            <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">{l}</p>
                                                            <p className={`text-[12px] font-mono tabular-nums font-bold ${c}`}>{v}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <BrokerVerifyHistory refreshTick={verifyTick} />
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>

                {/* AI Coach floating widget */}
                <MT5CoachWidget />

                <BrokerVerifyModal
                    open={verifyOpen}
                    onClose={() => { setVerifyOpen(false); setVerifyTick(t => t + 1); }}
                />
                <ReserveInvestmentModal open={reserveOpen} onClose={() => setReserveOpen(false)} />

                {/* Footer disclaimer */}
                <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-lg bg-[#D4AF37]/[0.05] border border-[#D4AF37]/15" data-testid="mt5-demo-disclaimer">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#E5C158] flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                        <span className="text-[#F3D372] font-bold uppercase tracking-wider text-[10px] mr-1">Modo Demo ·</span>
                        Los datos de mercado y ejecución operan en entorno de demostración institucional. Retiros vinculados a Wallet (SEPA / crypto) · Trazabilidad on-chain + MT5 auditable · Bridge MT5 real en producción.
                    </p>
                </div>
            </motion.div>
        </Layout>
    );
};

export default MT5Page;
