import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import api from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import {
    Bot, Play, RefreshCw, ArrowUp, ArrowDown, Minus, Zap, Loader2,
    TrendingUp, TrendingDown, Activity, AlertTriangle, CheckCircle,
    Shield, GraduationCap, Sparkles, Lightbulb, Cpu, BookOpen, Award,
    Wallet, LineChart, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { InfoBadge } from '../components/trading/InfoBadge';
import { AssetSelector } from '../components/trading/AssetSelector';

const SYMBOL_LABELS = {
    EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY',
    BTCUSD: 'BTC/USD', ETHUSD: 'ETH/USD', XAUUSD: 'XAU/USD',
};
const getLabel = (sym, prices) => prices?.[sym]?.label || SYMBOL_LABELS[sym] || sym;

const ACTION_META = {
    buy:  { label: 'COMPRA', icon: ArrowUp,   color: '#0ecb81', bg: 'bg-[#0ecb81]/10', border: 'border-[#0ecb81]/30' },
    sell: { label: 'VENTA',  icon: ArrowDown, color: '#f6465d', bg: 'bg-[#f6465d]/10', border: 'border-[#f6465d]/30' },
    hold: { label: 'ESPERA', icon: Minus,     color: '#94a3b8', bg: 'bg-slate-500/10', border: 'border-slate-500/30' },
};

const fmtTime  = (iso) => (!iso ? '—' : new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
const fmtDate  = (iso) => (!iso ? '—' : new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }));
const fmtPrice = (p) => (p == null ? '—' : Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 }));
const fmtMoney = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ═════════════════════ Atoms ═════════════════════

const StatusPill = ({ running }) => (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
        running ? 'bg-[#0ecb81]/15 text-[#0ecb81]' : 'bg-slate-700/60 text-slate-400'
    }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-[#0ecb81] animate-pulse' : 'bg-slate-500'}`} />
        {running ? 'ACTIVO' : 'DETENIDO'}
    </div>
);

const KpiTile = ({ label, value, icon: Icon, color = '#F0B90B', sub, testId }) => (
    <div className="bg-[#1e2329]/70 border border-[#2b3139] rounded-xl p-3 sm:p-3.5" data-testid={testId}>
        <div className="flex items-center justify-between mb-1.5">
            <span className="text-slate-500 text-[10px] uppercase tracking-[0.12em] font-medium truncate">{label}</span>
            <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
        </div>
        <p className="text-white text-base sm:text-lg font-mono font-bold tabular-nums leading-tight break-words">{value}</p>
        {sub && <p className="text-slate-500 text-[10px] mt-1 truncate">{sub}</p>}
    </div>
);

const DecisionItem = ({ d, prices }) => {
    const meta = ACTION_META[d.action] || ACTION_META.hold;
    const Icon = meta.icon;
    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            className={`flex gap-2.5 rounded-lg p-2.5 sm:p-3 border ${meta.bg} ${meta.border}`}
        >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: meta.color + '22', color: meta.color }}>
                <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] sm:text-[11px] font-bold" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-300 text-[11px] font-mono truncate">{getLabel(d.symbol, prices)}</span>
                    <span className="text-slate-600 text-[10px] ml-auto font-mono">{fmtTime(d.timestamp)}</span>
                </div>
                <p className="text-slate-200 text-[11.5px] sm:text-[12px] leading-snug mt-1 break-words">{d.reason}</p>
                {d.details && (d.details.rsi != null || d.details.ema20 != null) && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-slate-500">
                        {d.details.rsi != null && <span>RSI: <span className="text-white">{d.details.rsi}</span></span>}
                        {d.details.ema20 != null && <span>EMA20: <span className="text-amber-400">{d.details.ema20}</span></span>}
                        {d.details.ema50 != null && <span>EMA50: <span className="text-cyan-400">{d.details.ema50}</span></span>}
                        {d.details.price != null && <span>Px: <span className="text-[#F0B90B]">{d.details.price}</span></span>}
                    </div>
                )}
                {d.executed && (
                    <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] bg-[#0ecb81]/10 text-[#0ecb81] px-1.5 py-0.5 rounded">
                        <CheckCircle className="w-3 h-3" /> Ejecutada
                    </div>
                )}
                {d.skipped_reason && (
                    <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded">
                        <AlertTriangle className="w-3 h-3" /> Omitida: {d.skipped_reason}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

// ═════════════════════ Main ═════════════════════

export const TradingBotPage = () => {
    const [cfg, setCfg] = useState(null);
    const [status, setStatus] = useState(null);
    const [decisions, setDecisions] = useState([]);
    const [perf, setPerf] = useState(null);
    const [account, setAccount] = useState(null);   // ← Trading Demo account sync
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [ticking, setTicking] = useState(false);
    const [resetConfirm, setResetConfirm] = useState(false);
    const [showEduModal, setShowEduModal] = useState(false);
    const [prices, setPrices] = useState({});
    const prevDecisionCount = useRef(0);

    const fetchAll = useCallback(async () => {
        try {
            const [c, s, d, p, pr, a] = await Promise.all([
                api.get('/trading/bot/config'),
                api.get('/trading/bot/status'),
                api.get('/trading/bot/decisions?limit=50'),
                api.get('/trading/bot/performance'),
                api.get('/trading/prices'),
                api.get('/trading/account'),
            ]);
            setCfg(c.data);
            setStatus(s.data);
            setDecisions(d.data);
            setPerf(p.data);
            setPrices(pr.data || {});
            setAccount(a.data);
        } catch (e) { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        fetchAll();
        const id = setInterval(fetchAll, 10000);
        return () => clearInterval(id);
    }, [fetchAll]);

    // Notify when new decision with executed trade arrives
    useEffect(() => {
        if (!decisions.length) { prevDecisionCount.current = 0; return; }
        if (prevDecisionCount.current === 0) { prevDecisionCount.current = decisions.length; return; }
        if (decisions.length > prevDecisionCount.current) {
            const latest = decisions[0];
            if (latest.executed) {
                toast.success(`Bot ejecutó ${latest.action.toUpperCase()} en ${getLabel(latest.symbol, prices)}`, {
                    description: latest.reason, duration: 6000,
                });
            }
        }
        prevDecisionCount.current = decisions.length;
    }, [decisions, prices]);

    const updateConfig = async (patch) => {
        if (!cfg) return;
        setSaving(true);
        try {
            const payload = {
                enabled: patch.enabled ?? cfg.enabled,
                symbol: patch.symbol ?? cfg.symbol,
                strategy: patch.strategy ?? cfg.strategy,
                risk_level: patch.risk_level ?? cfg.risk_level,
            };
            await api.put('/trading/bot/config', payload);
            if (patch.enabled === true)  toast.success('Bot activado · comenzará a analizar el mercado');
            if (patch.enabled === false) toast('Bot detenido');
            await fetchAll();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error guardando configuración');
        } finally { setSaving(false); }
    };

    const runOnce = async () => {
        setTicking(true);
        try {
            const res = await api.post('/trading/bot/run-once');
            const ld = res.data?.last_decision;
            if (ld) toast.info(`Análisis manual: ${ld.action.toUpperCase()}`, { description: ld.reason, duration: 6000 });
            await fetchAll();
        } catch (e) { toast.error(e.response?.data?.detail || 'Error ejecutando tick'); }
        finally { setTicking(false); }
    };

    const resetBot = async () => {
        try {
            const res = await api.post('/trading/bot/reset');
            toast.success(`Bot reiniciado (${res.data.closed} operaciones cerradas)`);
            setResetConfirm(false);
            await fetchAll();
        } catch { toast.error('Error al reiniciar'); }
    };

    if (loading || !cfg || !status) {
        return (
            <Layout>
                <div className="flex items-center justify-center h-[70vh]">
                    <Loader2 className="w-8 h-8 animate-spin text-[#F0B90B]" />
                </div>
            </Layout>
        );
    }

    const running = !!status.is_running;
    const preset = status.preset || {};
    const lossUsedPct = status.daily_loss_used_pct || 0;

    // Growth vs initial (syncs with Trading Demo)
    const growthPct = account && account.initial_balance
        ? ((account.equity - account.initial_balance) / account.initial_balance) * 100
        : 0;

    return (
        <Layout>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 sm:space-y-5 p-3 sm:p-5 max-w-7xl mx-auto"
                data-testid="trading-bot-page"
            >
                {/* ── Header ────────────────────────────────────── */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-[#F0B90B] to-amber-600 flex items-center justify-center shadow-lg shadow-[#F0B90B]/25 flex-shrink-0">
                            <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-black" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-[#F0B90B] font-bold">
                                LIONSBIT · Motor Automático
                            </p>
                            <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                <h1 className="text-lg sm:text-2xl font-bold text-white truncate" style={{ letterSpacing: '-0.01em' }}>
                                    Trading Bot
                                </h1>
                                <StatusPill running={running} />
                                <span className="text-[9px] sm:text-[10px] bg-[#F0B90B]/10 text-[#F0B90B] px-1.5 py-0.5 rounded font-bold tracking-wide">DEMO</span>
                            </div>
                            <p className="text-slate-400 text-[11px] sm:text-sm mt-1 leading-snug">
                                Análisis automático de RSI + EMA sobre el activo configurado, ejecutando con SL/TP sobre tu cuenta demo.
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={() => setShowEduModal(true)}
                        variant="outline"
                        size="sm"
                        className="border-[#22d3ee]/40 text-[#22d3ee] hover:bg-[#22d3ee]/10 text-xs"
                        data-testid="bot-edu-btn"
                    >
                        <GraduationCap className="w-3.5 h-3.5 mr-1" /> Guía
                    </Button>
                </div>

                {/* ── Trading Demo account link ────────────────── */}
                {account && (
                    <Card className="bg-gradient-to-r from-[#14181d] via-[#14181d] to-[#14549C]/10 border-[#2b3139] p-3.5 sm:p-4" data-testid="bot-account-sync">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-[#14549C]/15 ring-1 ring-[#14549C]/30 flex items-center justify-center flex-shrink-0">
                                    <Wallet className="w-4 h-4 text-[#4a9eff]" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold">
                                        Cuenta Trading Demo
                                    </p>
                                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                        <p className="text-white font-mono font-bold tabular-nums text-base sm:text-lg">
                                            {fmtMoney(account.equity)}
                                        </p>
                                        <span className={`text-[11px] font-semibold ${growthPct >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                                            {growthPct >= 0 ? '+' : ''}{growthPct.toFixed(2)}%
                                        </span>
                                        <span className="text-slate-600 text-[10px]">desde {fmtMoney(account.initial_balance)}</span>
                                    </div>
                                </div>
                            </div>
                            <Link to="/trading-demo" className="text-[11px] text-[#22d3ee] hover:text-cyan-200 inline-flex items-center gap-1 font-semibold">
                                Abrir Trading Demo <ExternalLink className="w-3 h-3" />
                            </Link>
                        </div>
                        <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-3 pt-3 border-t border-[#2b3139]">
                            <div>
                                <p className="text-slate-500 text-[10px] uppercase tracking-wider">Balance</p>
                                <p className="text-white text-xs sm:text-sm font-mono mt-0.5 tabular-nums">{fmtMoney(account.balance)}</p>
                            </div>
                            <div>
                                <p className="text-slate-500 text-[10px] uppercase tracking-wider">Margen libre</p>
                                <p className="text-white text-xs sm:text-sm font-mono mt-0.5 tabular-nums">{fmtMoney(account.free_margin)}</p>
                            </div>
                            <div>
                                <p className="text-slate-500 text-[10px] uppercase tracking-wider">Usado</p>
                                <p className="text-white text-xs sm:text-sm font-mono mt-0.5 tabular-nums">{fmtMoney(account.margin_used)}</p>
                            </div>
                        </div>
                    </Card>
                )}

                {/* ── Bot KPIs ──────────────────────────────────── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3" data-testid="bot-metrics">
                    <KpiTile label="Abiertas" value={status.open_trades} icon={Activity} sub={`Máx: ${preset.max_concurrent || '—'}`} testId="metric-open" />
                    <KpiTile label="P/L hoy" value={`${status.daily_pl >= 0 ? '+' : ''}${fmtMoney(status.daily_pl)}`} icon={status.daily_pl >= 0 ? TrendingUp : TrendingDown} color={status.daily_pl >= 0 ? '#0ecb81' : '#f6465d'} sub={`${status.daily_trades} cerradas`} testId="metric-pl" />
                    <KpiTile label="Win rate" value={`${perf?.win_rate || 0}%`} icon={Award} color="#22d3ee" sub={`${perf?.wins || 0}W / ${perf?.losses || 0}L`} testId="metric-winrate" />
                    <KpiTile label="P/L total" value={`${(perf?.total_profit_loss || 0) >= 0 ? '+' : ''}${fmtMoney(perf?.total_profit_loss || 0)}`} icon={TrendingUp} color={(perf?.total_profit_loss || 0) >= 0 ? '#0ecb81' : '#f6465d'} sub={`${perf?.total_trades || 0} totales`} testId="metric-total" />
                    <KpiTile label="Riesgo diario" value={`${lossUsedPct}%`} icon={Shield} color={lossUsedPct > 80 ? '#f6465d' : lossUsedPct > 50 ? '#F0B90B' : '#0ecb81'} sub={`Máx: ${fmtMoney(preset.max_daily_loss || 0)}`} testId="metric-risk" />
                </div>

                {/* ── Main grid ─────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
                    {/* LEFT: Config + Limits */}
                    <div className="space-y-4">
                        <Card className="bg-[#14181d] border-[#2b3139]">
                            <CardHeader className="pb-2 px-4 pt-4">
                                <CardTitle className="text-white text-sm flex items-center gap-2">
                                    <Cpu className="w-4 h-4 text-[#F0B90B]" /> Configuración
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4 px-4 pb-4">
                                {/* On/Off */}
                                <div className="flex items-center justify-between p-3 bg-[#0b0e11] rounded-lg border border-[#2b3139]">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-white text-sm font-semibold truncate">Bot {running ? 'activado' : 'desactivado'}</span>
                                        <InfoBadge
                                            title="Encender el Bot"
                                            what="Cuando está activo, el bot analiza el mercado cada 60 s y ejecuta operaciones según la estrategia."
                                            how="Actívalo/desactívalo con el switch. Puedes cambiar la configuración en cualquier momento."
                                            tip="Empieza siempre con riesgo 'bajo' y un par que conozcas bien."
                                            testId="info-bot-enabled"
                                        />
                                    </div>
                                    <Switch
                                        checked={running}
                                        onCheckedChange={(v) => updateConfig({ enabled: v })}
                                        disabled={saving}
                                        data-testid="bot-enabled-switch"
                                    />
                                </div>

                                {/* Symbol */}
                                <div>
                                    <label className="text-slate-500 text-[11px] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                        Activo a operar
                                        <InfoBadge
                                            title="Activo del Bot"
                                            what="Par, índice, materia prima, cripto o acción sobre la que el bot operará."
                                            how="Pulsa para buscar entre los 170+ activos. Puedes filtrar por categoría."
                                            tip="Elige activos con suficiente liquidez. Evita alta volatilidad con riesgo 'alto'."
                                            testId="info-bot-symbol"
                                        />
                                        <span className="ml-auto text-[10px] text-slate-600 normal-case hidden sm:inline">Ctrl+K</span>
                                    </label>
                                    <AssetSelector
                                        selectedSymbol={cfg.symbol}
                                        onSelect={(v) => updateConfig({ symbol: v })}
                                        prices={prices}
                                    />
                                </div>

                                {/* Strategy */}
                                <div>
                                    <label className="text-slate-500 text-[11px] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                        Estrategia
                                        <InfoBadge
                                            title="Estrategia de Trading"
                                            what="Reglas que el bot aplica para decidir comprar, vender o esperar."
                                            how="Cada estrategia analiza el mercado distinto. Combo es la más conservadora."
                                            tip="Prueba cada una con riesgo bajo y compara resultados."
                                            testId="info-bot-strategy"
                                        />
                                    </label>
                                    <div className="space-y-2">
                                        {Object.entries(cfg.strategies || {}).map(([key, s]) => (
                                            <label
                                                key={key}
                                                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                                    cfg.strategy === key
                                                        ? 'bg-[#F0B90B]/10 border-[#F0B90B]/40'
                                                        : 'bg-[#1e2329] border-[#2b3139] hover:border-slate-600'
                                                }`}
                                                data-testid={`strategy-option-${key}`}
                                            >
                                                <input
                                                    type="radio" name="strategy" value={key}
                                                    checked={cfg.strategy === key}
                                                    onChange={() => updateConfig({ strategy: key })}
                                                    disabled={saving}
                                                    className="mt-1 accent-[#F0B90B] flex-shrink-0"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm font-semibold ${cfg.strategy === key ? 'text-[#F0B90B]' : 'text-white'}`}>{s.name}</p>
                                                    <p className="text-slate-500 text-[11px] leading-snug mt-0.5">{s.desc}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Risk level */}
                                <div>
                                    <label className="text-slate-500 text-[11px] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                        Nivel de riesgo
                                        <InfoBadge
                                            title="Nivel de Riesgo"
                                            what="Controla el tamaño de las operaciones, el SL y los límites de seguridad."
                                            how="Bajo = lotes pequeños + SL ajustado. Alto = lotes grandes + SL amplio."
                                            tip="Empieza siempre en Bajo. Sube solo si dominas la estrategia."
                                            testId="info-bot-risk"
                                        />
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['bajo', 'medio', 'alto'].map((level) => {
                                            const rp = cfg.risk_presets?.[level];
                                            const active = cfg.risk_level === level;
                                            const color = level === 'bajo' ? '#0ecb81' : level === 'medio' ? '#F0B90B' : '#f6465d';
                                            return (
                                                <button
                                                    key={level}
                                                    onClick={() => updateConfig({ risk_level: level })}
                                                    disabled={saving}
                                                    data-testid={`risk-${level}`}
                                                    className="p-2.5 rounded-lg border text-center transition-all capitalize"
                                                    style={active
                                                        ? { borderColor: color, backgroundColor: color + '1a' }
                                                        : { borderColor: '#2b3139', backgroundColor: '#1e2329' }
                                                    }
                                                >
                                                    <p className="text-xs font-bold" style={{ color: active ? color : '#94a3b8' }}>{level}</p>
                                                    {rp && (
                                                        <p className="text-[9px] text-slate-600 mt-0.5 font-mono leading-tight">
                                                            SL {(rp.sl_pct * 100).toFixed(1)}%<br/>
                                                            Máx {fmtMoney(rp.max_daily_loss)}
                                                        </p>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {preset.description && (
                                        <p className="text-slate-500 text-[11px] mt-2 italic leading-relaxed">{preset.description}</p>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="grid grid-cols-2 gap-2 pt-1">
                                    <Button
                                        onClick={runOnce}
                                        disabled={!running || ticking}
                                        variant="outline"
                                        className="border-[#22d3ee]/40 text-[#22d3ee] hover:bg-[#22d3ee]/10 text-xs h-9"
                                        data-testid="bot-run-once-btn"
                                    >
                                        {ticking ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1" />}
                                        Analizar
                                    </Button>
                                    <Button
                                        onClick={() => setResetConfirm(true)}
                                        variant="outline"
                                        className="border-[#f6465d]/40 text-[#f6465d] hover:bg-[#f6465d]/10 text-xs h-9"
                                        data-testid="bot-reset-btn"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reiniciar
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Risk limits */}
                        <Card className="bg-[#14181d] border-[#2b3139]">
                            <CardHeader className="pb-2 px-4 pt-4">
                                <CardTitle className="text-white text-xs flex items-center gap-2">
                                    <Shield className="w-3.5 h-3.5 text-[#f6465d]" /> Límites de seguridad
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2.5 text-[11px] px-4 pb-4">
                                <div className="flex justify-between items-center gap-2">
                                    <span className="text-slate-500">Stop Loss</span>
                                    <span className="text-[#f6465d] font-mono">{((preset.sl_pct || 0) * 100).toFixed(2)}%</span>
                                </div>
                                <div className="flex justify-between items-center gap-2">
                                    <span className="text-slate-500">Take Profit</span>
                                    <span className="text-[#0ecb81] font-mono">{((preset.tp_pct || 0) * 100).toFixed(2)}%</span>
                                </div>
                                <div className="flex justify-between items-center gap-2">
                                    <span className="text-slate-500">Max concurrentes</span>
                                    <span className="text-white font-mono">{preset.max_concurrent || '—'}</span>
                                </div>
                                <div className="flex justify-between items-center gap-2">
                                    <span className="text-slate-500">Pérdida diaria máx</span>
                                    <span className="text-[#F0B90B] font-mono">{fmtMoney(preset.max_daily_loss || 0)}</span>
                                </div>
                                <div className="pt-2 border-t border-[#2b3139]">
                                    <div className="h-1.5 bg-[#1e2329] rounded-full overflow-hidden">
                                        <div
                                            className="h-full transition-all"
                                            style={{
                                                width: `${Math.min(100, lossUsedPct)}%`,
                                                backgroundColor: lossUsedPct > 80 ? '#f6465d' : lossUsedPct > 50 ? '#F0B90B' : '#0ecb81',
                                            }}
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-1">Riesgo diario utilizado: {lossUsedPct}%</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* RIGHT: Decisions feed */}
                    <div className="lg:col-span-2">
                        <Card className="bg-[#14181d] border-[#2b3139]">
                            <CardHeader className="pb-2 px-4 pt-4">
                                <CardTitle className="text-white text-sm flex items-center gap-2 flex-wrap">
                                    <Activity className="w-4 h-4 text-[#F0B90B]" />
                                    <span>Log de Decisiones</span>
                                    <span className="text-slate-500 text-[10px] font-normal font-mono ml-auto">
                                        {decisions.length} · 10 s
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="px-3 pb-4 sm:px-4">
                                {decisions.length === 0 ? (
                                    <div className="py-12 sm:py-16 text-center">
                                        <Bot className="w-10 h-10 text-[#2b3139] mx-auto mb-3" />
                                        <p className="text-slate-500 text-sm">
                                            {running ? 'El bot está analizando el mercado...' : 'Activa el bot para ver sus decisiones aquí'}
                                        </p>
                                        <p className="text-slate-700 text-xs mt-2 max-w-xs mx-auto">
                                            Cada 60 segundos evaluará el mercado y registrará su razonamiento.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-[480px] sm:max-h-[600px] overflow-y-auto pr-1 sm:pr-2" data-testid="bot-decisions-feed">
                                        <AnimatePresence initial={false}>
                                            {decisions.map((d) => <DecisionItem key={d.id} d={d} prices={prices} />)}
                                        </AnimatePresence>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* ── Open positions ────────────────────────────── */}
                {perf && perf.open_trades && perf.open_trades.length > 0 && (
                    <Card className="bg-[#14181d] border-[#2b3139]">
                        <CardHeader className="pb-2 px-4 pt-4">
                            <CardTitle className="text-white text-sm flex items-center gap-2">
                                <Play className="w-4 h-4 text-[#0ecb81]" /> Posiciones abiertas ({perf.open_trades.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {perf.open_trades.map((t) => (
                                    <div key={t.id} className="bg-[#1e2329]/60 rounded-lg p-3 border border-[#2b3139] text-[11px]">
                                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                            <span className={`font-bold ${t.direction === 'buy' ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                                                {t.direction === 'buy' ? '↑ COMPRA' : '↓ VENTA'}
                                            </span>
                                            <span className="text-white truncate">{getLabel(t.symbol, prices)}</span>
                                            <span className="ml-auto text-slate-600 font-mono">{t.lot_size} lot</span>
                                        </div>
                                        <p className="text-slate-500 font-mono">Entry: <span className="text-white">{fmtPrice(t.entry_price)}</span></p>
                                        {t.stop_loss   && <p className="text-[#f6465d]/80 font-mono">SL: {fmtPrice(t.stop_loss)}</p>}
                                        {t.take_profit && <p className="text-[#0ecb81]/80 font-mono">TP: {fmtPrice(t.take_profit)}</p>}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* ── Recent closed — mobile cards + desktop table ─ */}
                {perf && perf.recent_closed && perf.recent_closed.length > 0 && (
                    <Card className="bg-[#14181d] border-[#2b3139]">
                        <CardHeader className="pb-2 px-4 pt-4">
                            <CardTitle className="text-white text-sm flex items-center gap-2">
                                <LineChart className="w-4 h-4 text-slate-400" /> Historial reciente
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-4 sm:px-4">
                            {/* Mobile: cards */}
                            <div className="sm:hidden space-y-2">
                                {perf.recent_closed.map((t) => {
                                    const pl = t.profit_loss || 0;
                                    const isWin = pl >= 0;
                                    return (
                                        <div key={t.id} className="bg-[#1e2329]/60 border border-[#2b3139] rounded-lg p-2.5 text-[11px] font-mono">
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span style={{ color: t.direction === 'buy' ? '#0ecb81' : '#f6465d' }}>
                                                        {t.direction === 'buy' ? '↑' : '↓'}
                                                    </span>
                                                    <span className="text-white truncate">{getLabel(t.symbol, prices)}</span>
                                                </div>
                                                <span className="font-bold" style={{ color: isWin ? '#0ecb81' : '#f6465d' }}>
                                                    {isWin ? '+' : ''}{fmtMoney(pl)}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 text-slate-500 text-[10px]">
                                                <span>{fmtDate(t.closed_at)} · {fmtTime(t.closed_at)}</span>
                                                <span className="capitalize">{t.close_reason || 'manual'}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-600 mt-1">
                                                <span>E: <span className="text-slate-400">{fmtPrice(t.entry_price)}</span></span>
                                                <span>C: <span className="text-slate-400">{fmtPrice(t.close_price)}</span></span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {/* Desktop: table */}
                            <div className="hidden sm:block overflow-x-auto">
                                <table className="w-full text-[11px]">
                                    <thead>
                                        <tr className="text-slate-600 text-left border-b border-[#2b3139]">
                                            <th className="py-2 font-semibold uppercase">Fecha</th>
                                            <th className="py-2 font-semibold uppercase">Par</th>
                                            <th className="py-2 font-semibold uppercase">Dir</th>
                                            <th className="py-2 font-semibold uppercase text-right">Entry</th>
                                            <th className="py-2 font-semibold uppercase text-right">Cierre</th>
                                            <th className="py-2 font-semibold uppercase text-right">P/L</th>
                                            <th className="py-2 font-semibold uppercase">Motivo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {perf.recent_closed.map((t) => (
                                            <tr key={t.id} className="border-b border-[#1e2329]/50 font-mono">
                                                <td className="py-2 text-slate-500">{fmtDate(t.closed_at)} {fmtTime(t.closed_at)}</td>
                                                <td className="py-2 text-white">{getLabel(t.symbol, prices)}</td>
                                                <td className="py-2" style={{ color: t.direction === 'buy' ? '#0ecb81' : '#f6465d' }}>{t.direction === 'buy' ? '↑' : '↓'}</td>
                                                <td className="py-2 text-right text-slate-400">{fmtPrice(t.entry_price)}</td>
                                                <td className="py-2 text-right text-slate-400">{fmtPrice(t.close_price)}</td>
                                                <td className="py-2 text-right font-bold" style={{ color: (t.profit_loss || 0) >= 0 ? '#0ecb81' : '#f6465d' }}>
                                                    {(t.profit_loss || 0) >= 0 ? '+' : ''}{fmtMoney(t.profit_loss || 0)}
                                                </td>
                                                <td className="py-2 text-slate-600 capitalize">{t.close_reason || 'manual'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* ── Reset confirm ─────────────────────────────── */}
                <Dialog open={resetConfirm} onOpenChange={setResetConfirm}>
                    <DialogContent className="bg-[#14181d] border-[#2b3139] max-w-sm">
                        <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-[#f6465d]" /> Reiniciar Bot
                            </DialogTitle>
                        </DialogHeader>
                        <p className="text-slate-300 text-sm leading-relaxed">
                            Esto cerrará todas las posiciones abiertas del bot al precio actual, eliminará el historial de decisiones y desactivará el bot.
                        </p>
                        <div className="flex gap-2 pt-3">
                            <Button onClick={() => setResetConfirm(false)} variant="outline" className="flex-1 border-[#2b3139] text-slate-300">Cancelar</Button>
                            <Button onClick={resetBot} className="flex-1 bg-[#f6465d] hover:bg-[#f6465d]/90 text-white" data-testid="bot-reset-confirm">Reiniciar</Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* ── Educational modal ─────────────────────────── */}
                <Dialog open={showEduModal} onOpenChange={setShowEduModal}>
                    <DialogContent className="bg-[#14181d] border-[#2b3139] max-w-lg max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                                <GraduationCap className="w-5 h-5 text-[#22d3ee]" /> Cómo funciona el Bot
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 text-[13px] text-slate-300 leading-relaxed">
                            <div className="flex gap-3 p-3 bg-[#F0B90B]/5 border border-[#F0B90B]/20 rounded-lg">
                                <Sparkles className="w-4 h-4 text-[#F0B90B] flex-shrink-0 mt-0.5" />
                                <p>El bot es <strong>100% educativo y simulado</strong>. Opera con dinero virtual sobre tu cuenta demo.</p>
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-sm mb-2 flex items-center gap-2"><BookOpen className="w-4 h-4 text-[#22d3ee]" /> Las 3 estrategias</h4>
                                <ul className="space-y-2 text-[12px]">
                                    <li><strong className="text-[#F0B90B]">RSI Reversion:</strong> compra cuando el precio está muy caído (RSI&lt;30) y vende cuando está muy subido (RSI&gt;70).</li>
                                    <li><strong className="text-[#F0B90B]">EMA Crossover:</strong> detecta cambios de tendencia por el cruce entre EMA20 y EMA50.</li>
                                    <li><strong className="text-[#F0B90B]">Combo:</strong> solo abre si RSI y tendencia EMA coinciden. Menos señales, más fiables.</li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-sm mb-2 flex items-center gap-2"><Shield className="w-4 h-4 text-[#f6465d]" /> Seguridad integrada</h4>
                                <ul className="space-y-1 text-[12px]">
                                    <li>• Cada operación lleva <strong>Stop Loss y Take Profit</strong>.</li>
                                    <li>• Límite de operaciones concurrentes.</li>
                                    <li>• <strong>Límite diario de pérdida</strong>: si se alcanza, el bot para hasta el día siguiente.</li>
                                    <li>• Nunca opera sin margen disponible.</li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-sm mb-2 flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-400" /> Qué puedes aprender</h4>
                                <p className="text-[12px]">Observa cómo el bot razona cada decisión. Con el tiempo, entenderás cuándo una estrategia funciona y cómo los indicadores anticipan movimientos del mercado.</p>
                            </div>
                        </div>
                        <Button onClick={() => setShowEduModal(false)} className="w-full bg-[#22d3ee] hover:bg-[#22d3ee]/90 text-black font-bold mt-4">Entendido</Button>
                    </DialogContent>
                </Dialog>
            </motion.div>
        </Layout>
    );
};

export default TradingBotPage;
