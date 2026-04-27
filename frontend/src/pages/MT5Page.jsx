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
} from 'lucide-react';
import { toast } from 'sonner';
import { MarketWatch, TradingPanel } from '../components/mt5/MarketWatchAndTrading';
import { OpenPositions, PendingOrders, FundsPanel, JournalPanel, StatementPanel } from '../components/mt5/MT5Sections';
import { MT5TradingSuite } from '../components/mt5/MT5TradingSuite';
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
    const [verifyOpen, setVerifyOpen] = useState(false);
    const [verifyTick, setVerifyTick] = useState(0);
    const [hubLimits, setHubLimits] = useState(null);
    const [reserveOpen, setReserveOpen] = useState(false);
    const heartbeatRef = useRef(null);

    const fetchSummary = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const res = await api.get('/mt5/summary');
            setData(res.data);
        } catch (e) { /* silent */ }
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

                {/* ── Primary Hub Actions: Invertir / Reservar / Operar ─── */}
                <MT5PrimaryActions onReserveClick={() => setReserveOpen(true)} />

                {/* ── Limits + KYC chips strip ─── */}
                {hubLimits && <MT5LimitsAndKyc data={hubLimits} />}

                {/* ── Section 1: Dashboard KPIs ─────────────── */}
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-5 rounded-full bg-[#14549C]" />
                        <h2 className="text-[13px] font-semibold text-slate-200 tracking-wide uppercase">Dashboard de cuenta</h2>
                    </div>
                    {/* Mobile: horizontal snap-scroll carousel · Desktop: 4-col grid */}
                    <div
                        className="flex md:grid md:grid-cols-4 gap-3 sm:gap-4 overflow-x-auto md:overflow-visible snap-x snap-mandatory md:snap-none scrollbar-hide -mx-3 px-3 md:mx-0 md:px-0 pb-2 md:pb-0"
                        style={{ scrollPaddingLeft: '0.75rem' }}
                        data-testid="mt5-kpi-carousel"
                    >
                        <div className="snap-start flex-shrink-0 w-[78%] sm:w-[60%] md:w-auto">
                            <KpiCard icon={Wallet}    label="Balance disponible" color="#14549C" testId="mt5-kpi-balance" accent
                                value={<OdometerValue value={fmtMoney(acc.balance)} staggerMs={40} />}
                                sub="Saldo tras operaciones cerradas" />
                        </div>
                        <div className="snap-start flex-shrink-0 w-[78%] sm:w-[60%] md:w-auto">
                            <KpiCard icon={TrendingUp} label="Equity (tiempo real)" color="#22d3ee" testId="mt5-kpi-equity"
                                value={<OdometerValue value={fmtMoney(acc.equity)} staggerMs={40} />}
                                sub="Balance + PnL flotante" />
                        </div>
                        <div className="snap-start flex-shrink-0 w-[78%] sm:w-[60%] md:w-auto">
                            <KpiCard icon={Activity}  label="Profit / Loss" color={acc.profit >= 0 ? '#0ecb81' : '#f6465d'} testId="mt5-kpi-pnl"
                                value={
                                    <span className={acc.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                                        {acc.profit >= 0 ? '+' : ''}{fmtMoney(Math.abs(acc.profit))}
                                    </span>
                                }
                                sub="PnL flotante abierto" />
                        </div>
                        <div className="snap-start flex-shrink-0 w-[78%] sm:w-[60%] md:w-auto">
                            <KpiCard icon={Gauge}     label="Margin Level" color={mlColor} testId="mt5-kpi-margin-level"
                                value={acc.margin_level > 0 ? fmtPct(acc.margin_level) : '—'}
                                sub={`Margen usado: ${fmtMoney(acc.margin_used)}`} />
                        </div>
                    </div>
                    {/* Mobile-only swipe hint dots */}
                    <div className="flex justify-center gap-1 mt-2 md:hidden" aria-hidden="true">
                        {[0,1,2,3].map(i => <span key={i} className="w-1 h-1 rounded-full bg-slate-700" />)}
                    </div>
                </div>

                {/* ── Section 2: Broker asociado ────────────── */}
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-5 rounded-full bg-emerald-500" />
                        <h2 className="text-[13px] font-semibold text-slate-200 tracking-wide uppercase">Broker asociado</h2>
                    </div>
                    <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900/80 via-[#0c1f3d]/40 to-slate-900/70 border-emerald-500/20 p-5 sm:p-6" data-testid="mt5-broker-card">
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute -top-16 -right-16 w-72 h-72 rounded-full opacity-20 blur-3xl"
                            style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.45), transparent 70%)' }}
                        />
                        <div className="relative flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex items-start gap-4 min-w-0 flex-1">
                                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 ring-1 ring-emerald-500/40 flex items-center justify-center flex-shrink-0">
                                    <span className="text-emerald-300 text-2xl font-black tracking-tighter" style={{ fontFamily: '"Inter", sans-serif' }}>e</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-300 font-bold">Broker principal · Verificado</p>
                                    </div>
                                    <h3 className="text-white text-lg sm:text-xl font-bold mt-0.5" style={{ letterSpacing: '-0.01em' }}>
                                        {broker.name}
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 ml-2 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 text-emerald-300 text-[10px] font-bold tracking-wider uppercase align-middle">
                                            <CheckCircle2 className="w-3 h-3" /> Verificado
                                        </span>
                                    </h3>
                                    <p className="text-slate-500 text-[11px] mt-0.5">{broker.legal_name}</p>
                                    <p className="text-slate-300 text-[12.5px] mt-2 leading-relaxed">{broker.description}</p>

                                    {/* Regulator chips */}
                                    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 ring-1 ring-amber-500/30 text-amber-200 text-[10px] font-bold tracking-wider">
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
                                        <a
                                            href={broker.license_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-xs font-semibold ring-1 ring-emerald-500/40 transition-colors"
                                            data-no-hover
                                            data-testid="mt5-view-license-btn"
                                        >
                                            <FileCheck className="w-3.5 h-3.5" /> Ver licencia oficial
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => setVerifyOpen(true)}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 text-xs font-semibold ring-1 ring-cyan-500/40 transition-colors"
                                            data-no-hover
                                            data-testid="mt5-validate-regulation-btn"
                                        >
                                            <ShieldCheck className="w-3.5 h-3.5" /> Validar regulación
                                        </button>
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

                        {/* Compliance disclaimer */}
                        <div className="relative mt-5 px-4 py-3 rounded-lg bg-emerald-500/5 ring-1 ring-emerald-500/25">
                            <div className="flex items-start gap-2">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300 flex-shrink-0 mt-0.5" />
                                <p className="text-slate-300 text-[11.5px] leading-relaxed">
                                    Las operaciones financieras e inversiones son gestionadas mediante infraestructura <span className="text-white font-semibold">MetaTrader 5 (MT5)</span> y brokers regulados internacionalmente como <span className="text-emerald-200 font-semibold">eToro</span>, registrado ante la <span className="text-amber-200 font-semibold">CNMV (Nº 2534)</span> y supervisado por entidades financieras europeas, garantizando cumplimiento legal, trazabilidad y seguridad para nuestros usuarios.
                                </p>
                            </div>
                        </div>
                    </Card>

                    {/* ── European Protection visual section ───────── */}
                    <div className="mt-3" data-testid="mt5-eu-protection">
                        <Card className="relative overflow-hidden bg-gradient-to-r from-[#003399]/30 via-slate-900/80 to-[#003399]/20 border-[#FFCC00]/30 p-5">
                            <div
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-0 opacity-[0.04]"
                                style={{
                                    background: 'repeating-linear-gradient(45deg, transparent, transparent 24px, #FFCC00 24px, #FFCC00 25px)',
                                }}
                            />
                            <div className="relative flex items-start gap-4 flex-wrap">
                                {/* EU stars badge */}
                                <div className="w-14 h-14 rounded-full bg-[#003399] ring-2 ring-[#FFCC00]/60 flex items-center justify-center flex-shrink-0 relative">
                                    <div className="absolute inset-0 rounded-full" style={{
                                        background: 'conic-gradient(from 0deg, transparent 0deg, transparent 30deg, #FFCC00 30deg, #FFCC00 32deg, transparent 32deg, transparent 60deg, #FFCC00 60deg, #FFCC00 62deg, transparent 62deg, transparent 90deg, #FFCC00 90deg, #FFCC00 92deg, transparent 92deg, transparent 120deg, #FFCC00 120deg, #FFCC00 122deg, transparent 122deg, transparent 150deg, #FFCC00 150deg, #FFCC00 152deg, transparent 152deg, transparent 180deg, #FFCC00 180deg, #FFCC00 182deg, transparent 182deg, transparent 210deg, #FFCC00 210deg, #FFCC00 212deg, transparent 212deg, transparent 240deg, #FFCC00 240deg, #FFCC00 242deg, transparent 242deg, transparent 270deg, #FFCC00 270deg, #FFCC00 272deg, transparent 272deg, transparent 300deg, #FFCC00 300deg, #FFCC00 302deg, transparent 302deg, transparent 330deg, #FFCC00 330deg, #FFCC00 332deg, transparent 332deg)',
                                        opacity: 0.8,
                                        WebkitMask: 'radial-gradient(circle, transparent 18px, black 19px, black 26px, transparent 27px)',
                                        mask: 'radial-gradient(circle, transparent 18px, black 19px, black 26px, transparent 27px)',
                                    }} />
                                    <ShieldCheck className="w-7 h-7 text-[#FFCC00] relative z-10" strokeWidth={2.2} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#FFCC00] font-bold">UE · MiFID II · ICF</p>
                                    <h3 className="text-white text-base sm:text-lg font-bold mt-0.5" style={{ letterSpacing: '-0.01em' }}>
                                        Inversiones protegidas bajo regulación europea
                                    </h3>
                                    <p className="text-slate-300 text-[12px] mt-1 leading-relaxed max-w-3xl">
                                        Sus fondos están protegidos por el marco regulatorio de la Unión Europea bajo directivas <span className="text-white font-semibold">MiFID II</span>, supervisión de <span className="text-amber-200 font-semibold">CNMV (España)</span> y <span className="text-cyan-200 font-semibold">CySEC (Chipre)</span>, con cobertura del fondo de compensación de inversores <span className="text-white font-semibold">ICF</span> hasta <span className="text-white font-semibold">€20,000</span> por cliente.
                                    </p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                                        <div className="px-2.5 py-1.5 rounded-md bg-slate-950/50 ring-1 ring-slate-800">
                                            <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Cobertura ICF</p>
                                            <p className="text-emerald-300 text-[12px] font-mono tabular-nums font-bold">€20,000</p>
                                        </div>
                                        <div className="px-2.5 py-1.5 rounded-md bg-slate-950/50 ring-1 ring-slate-800">
                                            <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Segregación</p>
                                            <p className="text-cyan-300 text-[12px] font-bold">100% Tier-1</p>
                                        </div>
                                        <div className="px-2.5 py-1.5 rounded-md bg-slate-950/50 ring-1 ring-slate-800">
                                            <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Auditoría</p>
                                            <p className="text-amber-300 text-[12px] font-bold">PwC · KPMG</p>
                                        </div>
                                        <div className="px-2.5 py-1.5 rounded-md bg-slate-950/50 ring-1 ring-slate-800">
                                            <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Cumplimiento</p>
                                            <p className="text-indigo-300 text-[12px] font-bold">MiFID II</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Compliance audit log */}
                    <BrokerVerifyHistory refreshTick={verifyTick} />
                </div>

                {/* ── Section 3: Professional crypto investment ─── */}
                <MT5InvestSection />

                {/* ── Section 3b: Hub feeds — global withdrawals + blockchain TX ─ */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <GlobalWithdrawalsFeed />
                    <BlockchainTransactions />
                </div>

                {/* ── Section 4: Full trading suite with tabs ─────── */}
                <MT5TradingSuite account={acc} onAccountChange={() => fetchSummary(true)} />

                {/* AI Coach floating widget */}
                <MT5CoachWidget />

                {/* Broker verify modal */}
                <BrokerVerifyModal
                    open={verifyOpen}
                    onClose={() => { setVerifyOpen(false); setVerifyTick(t => t + 1); }}
                />

                {/* Reserve future investment modal */}
                <ReserveInvestmentModal
                    open={reserveOpen}
                    onClose={() => setReserveOpen(false)}
                />

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


export default MT5Page;
