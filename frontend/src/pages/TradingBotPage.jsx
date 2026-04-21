import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import api from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import {
    Bot, Play, Pause, RefreshCw, ArrowUp, ArrowDown, Minus, Zap, Loader2,
    TrendingUp, TrendingDown, Activity, AlertTriangle, CheckCircle,
    Shield, Target, GraduationCap, Sparkles, Lightbulb, Cpu, BookOpen, Award
} from 'lucide-react';
import { toast } from 'sonner';
import { InfoBadge } from '../components/trading/InfoBadge';

const SYMBOL_LABELS = {
    EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY',
    BTCUSD: 'BTC/USD', ETHUSD: 'ETH/USD', XAUUSD: 'XAU/USD',
};

const ACTION_META = {
    buy: { label: 'COMPRA', icon: ArrowUp, color: '#0ecb81', bg: 'bg-[#0ecb81]/10', border: 'border-[#0ecb81]/30' },
    sell: { label: 'VENTA', icon: ArrowDown, color: '#f6465d', bg: 'bg-[#f6465d]/10', border: 'border-[#f6465d]/30' },
    hold: { label: 'ESPERA', icon: Minus, color: '#94a3b8', bg: 'bg-slate-500/10', border: 'border-slate-500/30' },
};

const formatTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
const formatPrice = (p) => (p == null ? '—' : Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 }));

// ══════════════ SUB-COMPONENTS ══════════════

const StatusPill = ({ running }) => (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold ${
        running ? 'bg-[#0ecb81]/15 text-[#0ecb81]' : 'bg-slate-700/50 text-slate-400'
    }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-[#0ecb81] animate-pulse' : 'bg-slate-500'}`} />
        {running ? 'ACTIVO' : 'DETENIDO'}
    </div>
);

const MetricCard = ({ label, value, icon: Icon, color = '#F0B90B', sub, testId }) => (
    <div className="bg-[#1e2329]/60 border border-[#2b3139] rounded-lg p-3" data-testid={testId}>
        <div className="flex items-center justify-between mb-1">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider">{label}</span>
            <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <p className="text-white text-lg font-mono font-bold">{value}</p>
        {sub && <p className="text-slate-600 text-[10px] mt-0.5">{sub}</p>}
    </div>
);

const DecisionItem = ({ d }) => {
    const meta = ACTION_META[d.action] || ACTION_META.hold;
    const Icon = meta.icon;
    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            className={`relative flex gap-3 rounded-lg p-3 border ${meta.bg} ${meta.border}`}
        >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0`} style={{ backgroundColor: meta.color + '22', color: meta.color }}>
                <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="text-slate-400 text-[11px]">·</span>
                    <span className="text-slate-400 text-[11px] font-mono">{SYMBOL_LABELS[d.symbol] || d.symbol}</span>
                    <span className="text-slate-600 text-[10px] ml-auto font-mono">{formatTime(d.timestamp)}</span>
                </div>
                <p className="text-slate-200 text-[12px] leading-snug mt-1">{d.reason}</p>
                {d.details && (d.details.rsi != null || d.details.ema20 != null) && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-slate-500">
                        {d.details.rsi != null && <span>RSI: <span className="text-white">{d.details.rsi}</span></span>}
                        {d.details.ema20 != null && <span>EMA20: <span className="text-amber-400">{d.details.ema20}</span></span>}
                        {d.details.ema50 != null && <span>EMA50: <span className="text-cyan-400">{d.details.ema50}</span></span>}
                        {d.details.price != null && <span>Precio: <span className="text-[#F0B90B]">{d.details.price}</span></span>}
                    </div>
                )}
                {d.executed && (
                    <div className="mt-2 inline-flex items-center gap-1 text-[10px] bg-[#0ecb81]/10 text-[#0ecb81] px-2 py-0.5 rounded">
                        <CheckCircle className="w-3 h-3" /> Ejecutada
                    </div>
                )}
                {d.skipped_reason && (
                    <div className="mt-2 inline-flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded">
                        <AlertTriangle className="w-3 h-3" /> Omitida: {d.skipped_reason}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

// ══════════════ MAIN PAGE ══════════════

export const TradingBotPage = () => {
    const [cfg, setCfg] = useState(null);
    const [status, setStatus] = useState(null);
    const [decisions, setDecisions] = useState([]);
    const [perf, setPerf] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [ticking, setTicking] = useState(false);
    const [resetConfirm, setResetConfirm] = useState(false);
    const [showEduModal, setShowEduModal] = useState(false);
    const prevDecisionCount = useRef(0);

    const fetchAll = useCallback(async () => {
        try {
            const [c, s, d, p] = await Promise.all([
                api.get('/trading/bot/config'),
                api.get('/trading/bot/status'),
                api.get('/trading/bot/decisions?limit=50'),
                api.get('/trading/bot/performance'),
            ]);
            setCfg(c.data);
            setStatus(s.data);
            setDecisions(d.data);
            setPerf(p.data);
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
        if (prevDecisionCount.current === 0) {
            prevDecisionCount.current = decisions.length;
            return;
        }
        if (decisions.length > prevDecisionCount.current) {
            const latest = decisions[0];
            if (latest.executed) {
                toast.success(`Bot ejecuto ${latest.action.toUpperCase()} en ${SYMBOL_LABELS[latest.symbol] || latest.symbol}`, {
                    description: latest.reason,
                    duration: 6000,
                });
            }
        }
        prevDecisionCount.current = decisions.length;
    }, [decisions]);

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
            if (patch.enabled === true) toast.success('Bot activado · comenzara a analizar el mercado');
            if (patch.enabled === false) toast('Bot detenido');
            await fetchAll();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error guardando configuracion');
        } finally { setSaving(false); }
    };

    const runOnce = async () => {
        setTicking(true);
        try {
            const res = await api.post('/trading/bot/run-once');
            const ld = res.data?.last_decision;
            if (ld) {
                toast.info(`Analisis manual: ${ld.action.toUpperCase()}`, {
                    description: ld.reason,
                    duration: 6000,
                });
            }
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

    return (
        <Layout>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto"
                data-testid="trading-bot-page"
            >
                {/* Header */}
                <div className="flex items-start gap-4 flex-wrap">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#F0B90B] to-amber-600 flex items-center justify-center shadow-lg shadow-[#F0B90B]/20">
                        <Bot className="w-7 h-7 text-black" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-2xl font-bold text-white">Trading Bot (Demo)</h1>
                            <StatusPill running={running} />
                            <span className="text-[10px] bg-[#F0B90B]/10 text-[#F0B90B] px-2 py-1 rounded font-bold tracking-wide">SIMULADO · EDUCATIVO</span>
                        </div>
                        <p className="text-slate-400 text-sm mt-1">
                            Motor automatico basado en reglas. Analiza RSI y EMA sobre el par seleccionado y ejecuta operaciones con SL/TP.
                        </p>
                    </div>
                    <Button
                        onClick={() => setShowEduModal(true)}
                        variant="outline"
                        className="border-[#22d3ee]/40 text-[#22d3ee] hover:bg-[#22d3ee]/10"
                        data-testid="bot-edu-btn"
                    >
                        <GraduationCap className="w-4 h-4 mr-1.5" /> Como funciona
                    </Button>
                </div>

                {/* Status strip */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="bot-metrics">
                    <MetricCard label="Operaciones abiertas" value={status.open_trades} icon={Activity} sub={`Max: ${preset.max_concurrent || '—'}`} testId="metric-open" />
                    <MetricCard label="P/L hoy" value={`${status.daily_pl >= 0 ? '+' : ''}$${status.daily_pl.toFixed(2)}`} icon={status.daily_pl >= 0 ? TrendingUp : TrendingDown} color={status.daily_pl >= 0 ? '#0ecb81' : '#f6465d'} sub={`${status.daily_trades} trades cerrados`} testId="metric-pl" />
                    <MetricCard label="Win rate" value={`${perf?.win_rate || 0}%`} icon={Award} color="#22d3ee" sub={`${perf?.wins || 0}W / ${perf?.losses || 0}L`} testId="metric-winrate" />
                    <MetricCard label="Total P/L" value={`${(perf?.total_profit_loss || 0) >= 0 ? '+' : ''}$${(perf?.total_profit_loss || 0).toFixed(2)}`} icon={TrendingUp} color={(perf?.total_profit_loss || 0) >= 0 ? '#0ecb81' : '#f6465d'} sub={`${perf?.total_trades || 0} trades total`} testId="metric-total" />
                    <MetricCard label="Riesgo diario usado" value={`${lossUsedPct}%`} icon={Shield} color={lossUsedPct > 80 ? '#f6465d' : lossUsedPct > 50 ? '#F0B90B' : '#0ecb81'} sub={`Limite: $${preset.max_daily_loss || '—'}`} testId="metric-risk" />
                </div>

                {/* Two columns: Config + Feed */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* LEFT: Config */}
                    <div className="space-y-4">
                        <Card className="bg-[#14181d] border-[#2b3139]">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-white text-sm flex items-center gap-2">
                                    <Cpu className="w-4 h-4 text-[#F0B90B]" /> Configuracion
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* On/Off */}
                                <div className="flex items-center justify-between p-3 bg-[#0b0e11] rounded-lg border border-[#2b3139]">
                                    <div className="flex items-center gap-2">
                                        <span className="text-white text-sm font-semibold">Bot {running ? 'activado' : 'desactivado'}</span>
                                        <InfoBadge
                                            title="Encender el Bot"
                                            what="Cuando esta activo, el bot analiza el mercado cada 60 segundos y ejecuta operaciones segun la estrategia."
                                            how="Actualo/desactivalo con el switch. Puedes cambiar la configuracion en cualquier momento."
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
                                    <label className="text-slate-500 text-[11px] uppercase tracking-wider mb-1.5 block">Par a operar</label>
                                    <Select value={cfg.symbol} onValueChange={(v) => updateConfig({ symbol: v })} disabled={saving}>
                                        <SelectTrigger className="bg-[#1e2329] border-[#2b3139] text-white" data-testid="bot-symbol-select">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#14181d] border-[#2b3139]">
                                            {cfg.available_symbols?.map(s => (
                                                <SelectItem key={s} value={s} className="text-white">{SYMBOL_LABELS[s] || s}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Strategy */}
                                <div>
                                    <label className="text-slate-500 text-[11px] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                        Estrategia
                                        <InfoBadge
                                            title="Estrategia de Trading"
                                            what="Conjunto de reglas que el bot aplica para decidir cuando comprar, vender o esperar."
                                            how="Cada estrategia analiza el mercado distinto. Combo es la mas conservadora."
                                            tip="Prueba cada una con riesgo bajo y compara resultados."
                                            testId="info-bot-strategy"
                                        />
                                    </label>
                                    <div className="space-y-2">
                                        {Object.entries(cfg.strategies || {}).map(([key, s]) => (
                                            <label key={key} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                                cfg.strategy === key ? 'bg-[#F0B90B]/10 border-[#F0B90B]/40' : 'bg-[#1e2329] border-[#2b3139] hover:border-slate-600'
                                            }`} data-testid={`strategy-option-${key}`}>
                                                <input
                                                    type="radio" name="strategy" value={key}
                                                    checked={cfg.strategy === key}
                                                    onChange={() => updateConfig({ strategy: key })}
                                                    disabled={saving}
                                                    className="mt-1 accent-[#F0B90B]"
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
                                            what="Controla el tamano de las operaciones, el Stop Loss y los limites de seguridad."
                                            how="Bajo = lotes pequenos + SL ajustado. Alto = lotes grandes + SL amplio."
                                            tip="Empieza siempre en Bajo. Sube solo si dominas la estrategia."
                                            testId="info-bot-risk"
                                        />
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['bajo', 'medio', 'alto'].map(level => {
                                            const rp = cfg.risk_presets?.[level];
                                            const active = cfg.risk_level === level;
                                            const colors = level === 'bajo' ? ['#0ecb81', '#0ecb81/40', '#0ecb81/10'] : level === 'medio' ? ['#F0B90B', '#F0B90B/40', '#F0B90B/10'] : ['#f6465d', '#f6465d/40', '#f6465d/10'];
                                            return (
                                                <button
                                                    key={level}
                                                    onClick={() => updateConfig({ risk_level: level })}
                                                    disabled={saving}
                                                    data-testid={`risk-${level}`}
                                                    className={`p-2.5 rounded-lg border text-center transition-all capitalize ${
                                                        active
                                                            ? `border-[${colors[0]}] bg-[${colors[0]}]/10`
                                                            : 'border-[#2b3139] bg-[#1e2329] hover:border-slate-600'
                                                    }`}
                                                    style={active ? { borderColor: colors[0], backgroundColor: colors[0] + '1a' } : {}}
                                                >
                                                    <p className={`text-xs font-bold`} style={{ color: active ? colors[0] : '#94a3b8' }}>{level}</p>
                                                    {rp && (
                                                        <p className="text-[9px] text-slate-600 mt-0.5 font-mono">
                                                            SL {(rp.sl_pct * 100).toFixed(1)}%<br/>
                                                            Max ${rp.max_daily_loss}
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
                                <div className="grid grid-cols-2 gap-2 pt-2">
                                    <Button
                                        onClick={runOnce}
                                        disabled={!running || ticking}
                                        variant="outline"
                                        className="border-[#22d3ee]/40 text-[#22d3ee] hover:bg-[#22d3ee]/10 text-xs"
                                        data-testid="bot-run-once-btn"
                                    >
                                        {ticking ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1" />}
                                        Analizar ahora
                                    </Button>
                                    <Button
                                        onClick={() => setResetConfirm(true)}
                                        variant="outline"
                                        className="border-[#f6465d]/40 text-[#f6465d] hover:bg-[#f6465d]/10 text-xs"
                                        data-testid="bot-reset-btn"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5 mr-1" />
                                        Reiniciar bot
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Risk limits card */}
                        <Card className="bg-[#14181d] border-[#2b3139]">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-white text-xs flex items-center gap-2">
                                    <Shield className="w-3.5 h-3.5 text-[#f6465d]" /> Limites de Seguridad
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-[11px]">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500">Lote por operacion</span>
                                    <span className="text-white font-mono">
                                        {preset.lot_size ? Object.entries(preset.lot_size).map(([k, v]) => <span key={k} className="ml-2">{k}:{v}</span>) : '—'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500">Stop Loss</span>
                                    <span className="text-[#f6465d] font-mono">{((preset.sl_pct || 0) * 100).toFixed(2)}% del precio</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500">Take Profit</span>
                                    <span className="text-[#0ecb81] font-mono">{((preset.tp_pct || 0) * 100).toFixed(2)}% del precio</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500">Max. concurrentes</span>
                                    <span className="text-white font-mono">{preset.max_concurrent || '—'} operaciones</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500">Perdida diaria maxima</span>
                                    <span className="text-[#F0B90B] font-mono">${preset.max_daily_loss || '—'}</span>
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
                            <CardHeader className="pb-3">
                                <CardTitle className="text-white text-sm flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-[#F0B90B]" />
                                    Log de Decisiones
                                    <span className="text-slate-500 text-[10px] font-normal font-mono ml-auto">
                                        {decisions.length} registros · actualiza cada 10s
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {decisions.length === 0 ? (
                                    <div className="py-16 text-center">
                                        <Bot className="w-10 h-10 text-[#2b3139] mx-auto mb-3" />
                                        <p className="text-slate-500 text-sm">
                                            {running ? 'El bot esta analizando el mercado...' : 'Activa el bot para ver sus decisiones aqui'}
                                        </p>
                                        <p className="text-slate-700 text-xs mt-2">
                                            Cada 60 segundos evaluara el mercado y registrara su razonamiento.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2" data-testid="bot-decisions-feed">
                                        <AnimatePresence initial={false}>
                                            {decisions.map(d => <DecisionItem key={d.id} d={d} />)}
                                        </AnimatePresence>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Open positions from bot */}
                {perf && perf.open_trades && perf.open_trades.length > 0 && (
                    <Card className="bg-[#14181d] border-[#2b3139]">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-white text-sm flex items-center gap-2">
                                <Play className="w-4 h-4 text-[#0ecb81]" /> Posiciones abiertas del bot ({perf.open_trades.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {perf.open_trades.map(t => (
                                    <div key={t.id} className="bg-[#1e2329]/60 rounded-lg p-3 border border-[#2b3139] text-[11px]">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`font-bold ${t.direction === 'buy' ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                                                {t.direction === 'buy' ? '↑ COMPRA' : '↓ VENTA'}
                                            </span>
                                            <span className="text-white">{SYMBOL_LABELS[t.symbol] || t.symbol}</span>
                                            <span className="ml-auto text-slate-600 font-mono">{t.lot_size} lot</span>
                                        </div>
                                        <p className="text-slate-500 font-mono">Entry: <span className="text-white">{formatPrice(t.entry_price)}</span></p>
                                        {t.stop_loss && <p className="text-[#f6465d]/80 font-mono">SL: {formatPrice(t.stop_loss)}</p>}
                                        {t.take_profit && <p className="text-[#0ecb81]/80 font-mono">TP: {formatPrice(t.take_profit)}</p>}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Recent closed */}
                {perf && perf.recent_closed && perf.recent_closed.length > 0 && (
                    <Card className="bg-[#14181d] border-[#2b3139]">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-white text-sm flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-slate-400" /> Historial reciente del bot
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
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
                                        {perf.recent_closed.map(t => (
                                            <tr key={t.id} className="border-b border-[#1e2329]/50 font-mono">
                                                <td className="py-2 text-slate-500">{formatTime(t.closed_at)}</td>
                                                <td className="py-2 text-white">{SYMBOL_LABELS[t.symbol] || t.symbol}</td>
                                                <td className="py-2" style={{ color: t.direction === 'buy' ? '#0ecb81' : '#f6465d' }}>{t.direction === 'buy' ? '↑' : '↓'}</td>
                                                <td className="py-2 text-right text-slate-400">{formatPrice(t.entry_price)}</td>
                                                <td className="py-2 text-right text-slate-400">{formatPrice(t.close_price)}</td>
                                                <td className="py-2 text-right font-bold" style={{ color: (t.profit_loss || 0) >= 0 ? '#0ecb81' : '#f6465d' }}>
                                                    {(t.profit_loss || 0) >= 0 ? '+' : ''}${(t.profit_loss || 0).toFixed(2)}
                                                </td>
                                                <td className="py-2 text-slate-600">{t.close_reason || 'manual'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Reset confirm dialog */}
                <Dialog open={resetConfirm} onOpenChange={setResetConfirm}>
                    <DialogContent className="bg-[#14181d] border-[#2b3139] max-w-sm">
                        <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-[#f6465d]" /> Reiniciar Bot
                            </DialogTitle>
                        </DialogHeader>
                        <p className="text-slate-300 text-sm leading-relaxed">
                            Esto cerrara todas las posiciones abiertas del bot al precio actual, eliminara el historial de decisiones y desactivara el bot.
                        </p>
                        <div className="flex gap-2 pt-3">
                            <Button onClick={() => setResetConfirm(false)} variant="outline" className="flex-1 border-[#2b3139] text-slate-300">Cancelar</Button>
                            <Button onClick={resetBot} className="flex-1 bg-[#f6465d] hover:bg-[#f6465d]/90 text-white" data-testid="bot-reset-confirm">Reiniciar</Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Educational modal */}
                <Dialog open={showEduModal} onOpenChange={setShowEduModal}>
                    <DialogContent className="bg-[#14181d] border-[#2b3139] max-w-lg max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                                <GraduationCap className="w-5 h-5 text-[#22d3ee]" /> Como funciona el Bot
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 text-[13px] text-slate-300 leading-relaxed">
                            <div className="flex gap-3 p-3 bg-[#F0B90B]/5 border border-[#F0B90B]/20 rounded-lg">
                                <Sparkles className="w-4 h-4 text-[#F0B90B] flex-shrink-0 mt-0.5" />
                                <p>
                                    El bot es <strong>100% educativo y simulado</strong>. Operaraciones con dinero virtual. Su objetivo es que veas como un sistema automatizado toma decisiones.
                                </p>
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-sm mb-2 flex items-center gap-2"><BookOpen className="w-4 h-4 text-[#22d3ee]" /> Las 3 estrategias</h4>
                                <ul className="space-y-2 text-[12px]">
                                    <li><strong className="text-[#F0B90B]">RSI Reversion:</strong> compra cuando el precio esta muy caido (RSI&lt;30) y vende cuando esta muy subido (RSI&gt;70). Asume que el precio volvera a su media.</li>
                                    <li><strong className="text-[#F0B90B]">EMA Crossover:</strong> detecta cambios de tendencia por el cruce entre EMA20 y EMA50. Golden Cross = compra. Death Cross = venta.</li>
                                    <li><strong className="text-[#F0B90B]">Combo:</strong> solo abre si RSI y la tendencia EMA coinciden. Menos senales pero mas fiables.</li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-sm mb-2 flex items-center gap-2"><Shield className="w-4 h-4 text-[#f6465d]" /> Seguridad integrada</h4>
                                <ul className="space-y-1 text-[12px]">
                                    <li>• Cada operacion lleva <strong>Stop Loss y Take Profit</strong> automaticos.</li>
                                    <li>• Limite de operaciones concurrentes.</li>
                                    <li>• <strong>Limite diario de perdida</strong>: si se alcanza, el bot para operaciones nuevas hasta el dia siguiente.</li>
                                    <li>• Nunca opera sin margen disponible.</li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-sm mb-2 flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-400" /> Que puedes aprender</h4>
                                <p className="text-[12px]">Observa como el bot razona cada decision. Con el tiempo, entenderas cuando una estrategia funciona, cuando falla, y como los indicadores anticipan movimientos del mercado.</p>
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
