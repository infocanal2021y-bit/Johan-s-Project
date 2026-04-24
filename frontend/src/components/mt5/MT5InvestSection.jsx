import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import api from '../../lib/api';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import {
    Bitcoin, Copy, Check, Upload, Clock, CheckCircle2, XCircle,
    ShieldCheck, Sparkles, AlertTriangle, Info, Wallet,
    TrendingUp, Activity, Banknote, ExternalLink, Zap,
} from 'lucide-react';

const fmtEUR = (n) => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCrypto = (n, decimals = 8) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: decimals });
const fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Method icon + gradient palette
const METHOD_VISUALS = {
    usdt_trc20: { grad: 'from-emerald-500/20 via-emerald-600/10 to-transparent', ring: 'ring-emerald-500/40',  dot: 'bg-emerald-400' },
    btc:        { grad: 'from-amber-500/20 via-amber-600/10 to-transparent',     ring: 'ring-amber-500/40',    dot: 'bg-amber-400'   },
    eth:        { grad: 'from-indigo-500/20 via-blue-600/10 to-transparent',     ring: 'ring-indigo-500/40',   dot: 'bg-indigo-400'  },
};

const STATUS_STYLE = {
    pending_payment: { label: 'Esperando pago',          color: 'text-slate-300',   bg: 'bg-slate-500/15',   ring: 'ring-slate-500/30',   icon: Clock },
    under_review:    { label: 'Verificando blockchain',  color: 'text-amber-300',   bg: 'bg-amber-500/15',   ring: 'ring-amber-500/30',   icon: Upload },
    confirmed:       { label: 'Confirmado · acreditado', color: 'text-emerald-300', bg: 'bg-emerald-500/15', ring: 'ring-emerald-500/30', icon: CheckCircle2 },
    rejected:        { label: 'Rechazado',               color: 'text-rose-300',    bg: 'bg-rose-500/15',    ring: 'ring-rose-500/30',    icon: XCircle },
};

// ────────────── QR code via public service ──────────────
const QRImage = ({ data, size = 180 }) => {
    const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&bgcolor=FFFFFF&color=0b1220&data=${encodeURIComponent(data)}`;
    return (
        <img
            src={src}
            alt="QR código de wallet"
            width={size}
            height={size}
            className="rounded-lg bg-white p-1"
            data-testid="mt5-invest-qr"
        />
    );
};

// ────────────── Copy-to-clipboard button ──────────────
const CopyButton = ({ value, className = '', testId }) => {
    const [copied, setCopied] = useState(false);
    const onClick = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success('Copiado al portapapeles');
            setTimeout(() => setCopied(false), 1800);
        } catch {
            toast.error('No se pudo copiar');
        }
    };
    return (
        <button
            type="button"
            onClick={onClick}
            data-testid={testId}
            data-no-hover
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/15 ring-1 ring-cyan-500/30 text-cyan-200 text-xs font-semibold hover:bg-cyan-500/20 transition-colors ${className}`}
        >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copiado' : 'Copiar dirección'}
        </button>
    );
};

// ────────────── Main component ──────────────
export const MT5InvestSection = () => {
    const [methods, setMethods] = useState([]);
    const [methodsMeta, setMethodsMeta] = useState({ min_eur: 300, disclaimer: '', rates_updated_at: null });
    const [activeMethod, setActiveMethod] = useState('usdt_trc20');
    const [amountEur, setAmountEur] = useState(500);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [currentDeposit, setCurrentDeposit] = useState(null); // the active deposit being paid
    const [deposits, setDeposits] = useState([]);
    const [summary, setSummary] = useState(null);

    // Proof submission inputs
    const [proofHash, setProofHash] = useState('');
    const [submittingProof, setSubmittingProof] = useState(false);

    const loadAll = useCallback(async () => {
        try {
            const [m, dep, sum] = await Promise.all([
                api.get('/mt5-invest/methods'),
                api.get('/mt5-invest/deposits'),
                api.get('/mt5-invest/summary'),
            ]);
            setMethods(m.data.methods || []);
            setMethodsMeta({
                min_eur: m.data.min_eur,
                disclaimer: m.data.disclaimer,
                rates_updated_at: m.data.rates_updated_at,
            });
            setDeposits(dep.data.deposits || []);
            setSummary(sum.data);
        } catch (e) { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        loadAll();
        const id = setInterval(loadAll, 15000);
        return () => clearInterval(id);
    }, [loadAll]);

    const active = useMemo(() => methods.find(m => m.key === activeMethod) || null, [methods, activeMethod]);

    const cryptoForAmount = useMemo(() => {
        if (!active || !amountEur) return 0;
        return amountEur / Math.max(active.rate_eur, 0.01);
    }, [active, amountEur]);

    const createDeposit = async () => {
        if (!active) return;
        if (amountEur < methodsMeta.min_eur) {
            toast.error(`Monto mínimo: ${methodsMeta.min_eur} EUR`);
            return;
        }
        setCreating(true);
        try {
            const r = await api.post('/mt5-invest/deposit', {
                method: active.key,
                amount_eur: Number(amountEur),
            });
            setCurrentDeposit(r.data.deposit);
            setProofHash('');
            toast.success('Orden de depósito creada · envía los fondos a la dirección');
            await loadAll();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error creando el depósito');
        } finally {
            setCreating(false);
        }
    };

    const submitProof = async () => {
        if (!currentDeposit) return;
        if (!proofHash || proofHash.trim().length < 10) {
            toast.error('Pega un TX hash válido (10+ caracteres)');
            return;
        }
        setSubmittingProof(true);
        try {
            const r = await api.post(`/mt5-invest/deposit/${currentDeposit.id}/proof`, {
                tx_hash: proofHash.trim(),
            });
            setCurrentDeposit(r.data.deposit);
            toast.success('Comprobante enviado · verificando en blockchain');
            await loadAll();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al enviar el comprobante');
        } finally {
            setSubmittingProof(false);
        }
    };

    const scrollToTerminal = () => {
        const el = document.querySelector('[data-testid="mt5-trading-suite"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    if (loading && methods.length === 0) {
        return <p className="text-slate-500 text-sm py-6 text-center">Cargando métodos de inversión…</p>;
    }

    const hasConfirmed = summary?.has_confirmed_deposit;
    const totalInvested = summary?.total_invested_eur || 0;
    const mt5acc = summary?.mt5_account || {};
    const ops = summary?.operations || { open: 0, closed: 0, recent_pl: 0, recent_closed: [] };

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
            data-testid="mt5-invest-section"
        >
            {/* Section header */}
            <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-cyan-500" />
                    <h2 className="text-[13px] font-semibold text-slate-200 tracking-wide uppercase">Inversión Profesional MT5</h2>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500">
                    <Sparkles className="w-3 h-3 text-cyan-400" />
                    Min. {methodsMeta.min_eur} EUR · tasas BCE + CoinGecko
                </span>
            </div>

            {/* Hero banner with disclaimer */}
            <Card className="relative overflow-hidden bg-gradient-to-br from-[#0b1b34] via-[#0c1f3d]/90 to-slate-950 border-cyan-500/20 p-5 sm:p-6">
                <div
                    aria-hidden="true"
                    className="absolute -right-12 -top-12 w-64 h-64 rounded-full opacity-30 blur-3xl"
                    style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.30), transparent 70%)' }}
                />
                <div className="relative flex items-start gap-4 flex-wrap">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-cyan-500/25 to-cyan-700/15 ring-1 ring-cyan-400/40 flex items-center justify-center flex-shrink-0">
                        <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-200" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/90 font-bold">Infraestructura verificada</p>
                        <h3 className="text-white text-lg sm:text-xl font-bold mt-0.5" style={{ letterSpacing: '-0.01em' }}>
                            Financia tu cuenta MT5 con criptoactivos
                        </h3>
                        <p className="text-slate-300 text-[12.5px] mt-2 leading-relaxed max-w-3xl">
                            {methodsMeta.disclaimer}
                        </p>
                    </div>
                </div>
            </Card>

            {/* USDT recommendation strip */}
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30 text-emerald-200 text-[12px]">
                <Sparkles className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                    <span className="font-bold">Recomendado:</span> USDT (TRC20) por su rápida confirmación y menores comisiones de red.
                </span>
            </div>

            {/* Method tabs */}
            <div className="grid grid-cols-3 gap-2">
                {methods.map(m => {
                    const visuals = METHOD_VISUALS[m.key] || METHOD_VISUALS.usdt_trc20;
                    const isActive = activeMethod === m.key;
                    return (
                        <button
                            key={m.key}
                            type="button"
                            onClick={() => { setActiveMethod(m.key); setCurrentDeposit(null); }}
                            data-no-hover
                            data-testid={`mt5-invest-tab-${m.key}`}
                            className={`group relative overflow-hidden rounded-xl p-3 sm:p-4 text-left transition-all ring-1 ${
                                isActive
                                    ? `${visuals.ring} bg-gradient-to-br ${visuals.grad} shadow-lg`
                                    : 'ring-slate-800/80 bg-slate-900/60 hover:bg-slate-900'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div
                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[11px]"
                                        style={{ backgroundColor: m.color }}
                                    >
                                        {m.crypto_symbol[0]}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-white text-[13px] font-bold leading-tight truncate">{m.crypto_symbol}</p>
                                        <p className="text-slate-500 text-[10px] truncate">{m.network}</p>
                                    </div>
                                </div>
                                {m.recommended && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/20 ring-1 ring-emerald-500/40 text-emerald-300 text-[8.5px] font-bold tracking-wider uppercase">
                                        <Sparkles className="w-2.5 h-2.5" /> Rec.
                                    </span>
                                )}
                            </div>
                            <p className="text-slate-400 text-[10px] mt-2 truncate">{m.name}</p>
                            <div className="mt-2 flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${visuals.dot} ${isActive ? 'animate-pulse' : ''}`} />
                                <span className="text-[9.5px] text-slate-500">
                                    ~{m.avg_confirmation_min} min · fee ~€{m.fee_eur_est}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Deposit form & QR */}
            {active && (
                <Card className="bg-slate-900/70 border-slate-800/80 p-4 sm:p-5" data-testid="mt5-invest-deposit-card">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Left: amount + address */}
                        <div className="space-y-3 order-2 md:order-1">
                            <label className="block">
                                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Monto a invertir (EUR)</span>
                                <div className="relative mt-1">
                                    <input
                                        type="number"
                                        min={methodsMeta.min_eur}
                                        max={500000}
                                        step="50"
                                        value={amountEur}
                                        onChange={(e) => setAmountEur(Math.max(0, parseFloat(e.target.value) || 0))}
                                        data-testid="mt5-invest-amount-eur"
                                        className="w-full h-11 pl-3 pr-14 rounded-lg bg-slate-950 border border-slate-800 text-white text-lg font-mono tabular-nums font-bold focus:outline-none focus:border-cyan-500/50"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">EUR</span>
                                </div>
                                {amountEur < methodsMeta.min_eur && (
                                    <p className="text-rose-300 text-[10px] mt-1">Monto mínimo: {methodsMeta.min_eur} EUR</p>
                                )}
                            </label>

                            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-950/60 ring-1 ring-slate-800">
                                <div>
                                    <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">Recibirás aprox.</p>
                                    <p className="text-white font-mono tabular-nums font-bold text-sm" data-testid="mt5-invest-crypto-preview">
                                        {fmtCrypto(cryptoForAmount, active.key === 'usdt_trc20' ? 2 : 8)} {active.crypto_symbol}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">Tasa actual</p>
                                    <p className="text-slate-300 font-mono tabular-nums text-[11px]">€{fmtEUR(active.rate_eur)}</p>
                                </div>
                            </div>

                            {/* Wallet address + copy */}
                            <div className="rounded-lg bg-slate-950/60 ring-1 ring-slate-800 p-3">
                                <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Dirección de wallet · {active.network_full}</p>
                                <p className="text-white font-mono text-[11px] break-all leading-relaxed" data-testid="mt5-invest-wallet-address">
                                    {active.wallet_address}
                                </p>
                                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                                    <CopyButton value={active.wallet_address} testId="mt5-invest-copy-address" />
                                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-300/80">
                                        <AlertTriangle className="w-3 h-3" />
                                        Usa solo la red {active.network}
                                    </span>
                                </div>
                            </div>

                            <Button
                                onClick={createDeposit}
                                disabled={creating || amountEur < methodsMeta.min_eur}
                                data-testid="mt5-invest-create-deposit-btn"
                                className="w-full h-11 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold tracking-wider"
                            >
                                <Zap className="w-4 h-4 mr-1.5" />
                                {creating ? 'Creando orden…' : `Generar orden de depósito · €${fmtEUR(amountEur)}`}
                            </Button>
                        </div>

                        {/* Right: QR */}
                        <div className="flex flex-col items-center justify-center gap-3 order-1 md:order-2">
                            <QRImage data={active.wallet_address} size={200} />
                            <div className="text-center">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">QR de pago</p>
                                <p className="text-slate-300 text-[11px] mt-0.5">Escanea desde tu wallet cripto</p>
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {/* Proof upload panel (visible once a deposit order is created) */}
            {currentDeposit && (
                <Card
                    className="relative overflow-hidden bg-gradient-to-br from-amber-500/5 via-slate-900/80 to-slate-900 border-amber-500/30 p-4 sm:p-5"
                    data-testid="mt5-invest-proof-card"
                >
                    <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-500/15 ring-1 ring-amber-500/30 flex items-center justify-center flex-shrink-0">
                            <Upload className="w-4 h-4 text-amber-300" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase tracking-[0.14em] text-amber-300 font-bold">Orden #{currentDeposit.id.slice(0, 8)}</p>
                            <h4 className="text-white text-sm font-bold">Envía tu comprobante de pago</h4>
                            <p className="text-slate-400 text-[11px] mt-0.5">
                                Envía <span className="text-white font-mono font-bold">{currentDeposit.amount_crypto} {currentDeposit.crypto_symbol}</span> a la dirección de arriba y luego pega el <span className="font-semibold">TX hash</span> de la transacción.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                        <input
                            type="text"
                            placeholder="Pega el TX hash de tu transacción blockchain"
                            value={proofHash}
                            onChange={(e) => setProofHash(e.target.value)}
                            data-testid="mt5-invest-tx-hash"
                            className="h-10 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono text-[12px] focus:outline-none focus:border-amber-500/50"
                        />
                        <Button
                            onClick={submitProof}
                            disabled={submittingProof || !proofHash}
                            data-testid="mt5-invest-submit-proof-btn"
                            className="h-10 px-5 bg-amber-500/90 hover:bg-amber-500 text-slate-950 font-bold tracking-wider"
                        >
                            {submittingProof ? 'Enviando…' : 'Validar transacción'}
                        </Button>
                    </div>

                    <p className="mt-2 text-[10px] text-slate-500 flex items-center gap-1.5">
                        <Info className="w-3 h-3" />
                        Tras enviar el comprobante, nuestro sistema validará la transacción en blockchain y acreditará el saldo a tu cuenta MT5 automáticamente.
                    </p>
                </Card>
            )}

            {/* Post-deposit unlock CTA */}
            {hasConfirmed && (
                <Card className="relative overflow-hidden bg-gradient-to-r from-emerald-600/15 via-emerald-500/10 to-transparent border-emerald-500/40 p-4 sm:p-5" data-testid="mt5-invest-unlock-card">
                    <div className="relative flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 ring-1 ring-emerald-400/50 flex items-center justify-center flex-shrink-0">
                                <CheckCircle2 className="w-5 h-5 text-emerald-200" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wider text-emerald-300/80 font-bold">Fondos acreditados</p>
                                <h4 className="text-white text-sm sm:text-base font-bold">Tu cuenta MT5 está operativa</h4>
                                <p className="text-slate-300 text-[11px]">Balance invertido total: <span className="text-emerald-200 font-mono font-bold">€{fmtEUR(totalInvested)}</span></p>
                            </div>
                        </div>
                        <Button
                            onClick={scrollToTerminal}
                            data-testid="mt5-invest-open-mt5-btn"
                            className="bg-emerald-500/90 hover:bg-emerald-500 text-slate-950 font-bold h-11"
                        >
                            <Activity className="w-4 h-4 mr-1.5" />
                            Abrir operación en MetaTrader 5
                        </Button>
                    </div>
                </Card>
            )}

            {/* Investment dashboard (appears once any deposit exists) */}
            {deposits.length > 0 && (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                        <MiniKpi icon={Wallet} label="Balance invertido" value={`€${fmtEUR(totalInvested)}`} color="#22d3ee" testId="mt5-invest-kpi-invested" />
                        <MiniKpi icon={TrendingUp} label="P/L reciente" value={`${ops.recent_pl >= 0 ? '+' : '−'}$${Math.abs(ops.recent_pl).toFixed(2)}`} color={ops.recent_pl >= 0 ? '#0ecb81' : '#f6465d'} testId="mt5-invest-kpi-pl" />
                        <MiniKpi icon={Activity} label="Op. abiertas" value={ops.open} color="#F0B90B" testId="mt5-invest-kpi-open" />
                        <MiniKpi icon={Banknote} label="Op. cerradas" value={ops.closed} color="#94a3b8" testId="mt5-invest-kpi-closed" />
                    </div>

                    {/* Deposit history */}
                    <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 overflow-hidden" data-testid="mt5-invest-deposit-history">
                        <div className="px-4 py-2.5 border-b border-slate-800/70 flex items-center justify-between">
                            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Historial de depósitos</p>
                            <span className="text-[10px] text-slate-600">{deposits.length} registros</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-[11.5px]">
                                <thead>
                                    <tr className="text-slate-600 text-left border-b border-slate-800/70">
                                        <th className="py-2 px-3 font-semibold uppercase tracking-wider">Fecha</th>
                                        <th className="py-2 px-3 font-semibold uppercase tracking-wider">Método</th>
                                        <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right">EUR</th>
                                        <th className="py-2 px-3 font-semibold uppercase tracking-wider text-right hidden sm:table-cell">Cripto</th>
                                        <th className="py-2 px-3 font-semibold uppercase tracking-wider">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {deposits.map(d => {
                                        const st = STATUS_STYLE[d.status] || STATUS_STYLE.pending_payment;
                                        const StatusIcon = st.icon;
                                        return (
                                            <tr key={d.id} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                                                <td className="py-2 px-3 text-slate-400">
                                                    <p>{fmtDateTime(d.created_at)}</p>
                                                    {d.confirmed_at && <p className="text-[9.5px] text-emerald-300/70">Conf. {fmtDateTime(d.confirmed_at)}</p>}
                                                </td>
                                                <td className="py-2 px-3 text-slate-300">
                                                    <span className="font-mono font-semibold">{d.crypto_symbol}</span>
                                                    <span className="text-[9.5px] text-slate-500 ml-1">· {d.network}</span>
                                                </td>
                                                <td className="py-2 px-3 text-right text-white font-mono tabular-nums font-bold">€{fmtEUR(d.amount_eur)}</td>
                                                <td className="py-2 px-3 text-right text-slate-400 font-mono tabular-nums hidden sm:table-cell">{d.amount_crypto}</td>
                                                <td className="py-2 px-3">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ring-1 text-[10px] font-bold ${st.color} ${st.bg} ${st.ring}`}>
                                                        <StatusIcon className="w-3 h-3" /> {st.label}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Broker + account state */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        <Card className="bg-slate-900/60 border-slate-800/80 p-3.5">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-emerald-300" />
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Broker regulado asociado</p>
                            </div>
                            <p className="text-white text-sm font-bold mt-1">IC Markets Global</p>
                            <p className="text-slate-500 text-[10px]">ASIC AFSL 335692 · CySEC 362/18</p>
                        </Card>
                        <Card className="bg-slate-900/60 border-slate-800/80 p-3.5">
                            <div className="flex items-center gap-2">
                                <ExternalLink className="w-4 h-4 text-cyan-300" />
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Cuenta MT5 vinculada</p>
                            </div>
                            <p className="text-white text-sm font-bold font-mono mt-1">#{mt5acc.login || '—'}</p>
                            <p className="text-slate-500 text-[10px]">
                                {mt5acc.server || '—'} · {mt5acc.status === 'active' ? 'Operativa' : 'Pendiente de acreditar'}
                            </p>
                        </Card>
                    </div>
                </div>
            )}
        </motion.div>
    );
};

// Small KPI card
const MiniKpi = ({ icon: Icon, label, value, color, testId }) => (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3" data-testid={testId}>
        <div className="flex items-center gap-1.5 mb-1.5">
            <Icon className="w-3 h-3" style={{ color }} />
            <span className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">{label}</span>
        </div>
        <p className="text-white text-[15px] sm:text-[17px] font-mono tabular-nums font-bold leading-tight" style={{ color }}>{value}</p>
    </div>
);

export default MT5InvestSection;
