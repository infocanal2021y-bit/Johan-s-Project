import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../lib/api';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import {
    Zap, CalendarClock, Activity, ShieldCheck, ShieldAlert,
    ArrowDownToLine, ArrowUpFromLine, Globe2, X, Loader2,
    CheckCircle2, Clock, AlertTriangle, Hash, ExternalLink,
    Sparkles, Banknote,
} from 'lucide-react';

const fmtEUR = (n) => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const scrollTo = (selector) => {
    const el = document.querySelector(selector);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ════════════════════════════════════════════════════════════════
//  Primary CTA strip: 3 main actions
// ════════════════════════════════════════════════════════════════
export const MT5PrimaryActions = ({ onReserveClick }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-2.5"
            data-testid="mt5-primary-actions"
        >
            <button
                type="button"
                onClick={() => scrollTo('[data-testid="mt5-invest-section"]')}
                data-no-hover
                data-testid="mt5-cta-invest-now"
                className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-700 hover:from-cyan-400 hover:to-cyan-600 text-white p-4 text-left shadow-lg shadow-cyan-500/20 transition-all"
            >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_60%)]" />
                <div className="relative flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/15 ring-1 ring-white/30 flex items-center justify-center flex-shrink-0">
                        <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-100/90 font-bold">Acción inmediata</p>
                        <p className="text-white text-base font-bold leading-tight">Invertir ahora</p>
                        <p className="text-cyan-100/80 text-[10.5px] mt-0.5">Comprar BTC / USDT / ETH y acreditar MT5</p>
                    </div>
                </div>
            </button>

            <button
                type="button"
                onClick={onReserveClick}
                data-no-hover
                data-testid="mt5-cta-reserve"
                className="group relative overflow-hidden rounded-xl bg-slate-900/90 hover:bg-slate-900 ring-1 ring-cyan-500/30 hover:ring-cyan-400/50 text-white p-4 text-left transition-all"
            >
                <div className="relative flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-cyan-500/15 ring-1 ring-cyan-500/30 flex items-center justify-center flex-shrink-0">
                        <CalendarClock className="w-5 h-5 text-cyan-300" />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-300 font-bold">Programar</p>
                        <p className="text-white text-base font-bold leading-tight">Reservar inversión futura</p>
                        <p className="text-slate-400 text-[10.5px] mt-0.5">Bloquea tasa hasta 180 días</p>
                    </div>
                </div>
            </button>

            <button
                type="button"
                onClick={() => scrollTo('[data-testid="mt5-trading-suite"]')}
                data-no-hover
                data-testid="mt5-cta-open-trade"
                className="group relative overflow-hidden rounded-xl bg-emerald-500/90 hover:bg-emerald-500 text-white p-4 text-left shadow-lg shadow-emerald-500/20 transition-all"
            >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.20),transparent_60%)]" />
                <div className="relative flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/15 ring-1 ring-white/30 flex items-center justify-center flex-shrink-0">
                        <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-100/90 font-bold">Trading</p>
                        <p className="text-white text-base font-bold leading-tight">Abrir operación MT5</p>
                        <p className="text-emerald-100/80 text-[10.5px] mt-0.5">Mercado · pendientes · gestión</p>
                    </div>
                </div>
            </button>
        </motion.div>
    );
};


// ════════════════════════════════════════════════════════════════
//  KYC + Limits chips strip
// ════════════════════════════════════════════════════════════════
export const MT5LimitsAndKyc = ({ data }) => {
    if (!data) return null;
    const tone = data.kyc?.tone || 'slate';
    const TONE = {
        emerald: { bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/30', text: 'text-emerald-200', icon: ShieldCheck, dot: 'bg-emerald-400' },
        amber:   { bg: 'bg-amber-500/10',   ring: 'ring-amber-500/30',   text: 'text-amber-200',   icon: Loader2,      dot: 'bg-amber-400'   },
        slate:   { bg: 'bg-slate-700/40',   ring: 'ring-slate-600/40',   text: 'text-slate-300',   icon: ShieldAlert,  dot: 'bg-slate-400'   },
        rose:    { bg: 'bg-rose-500/10',    ring: 'ring-rose-500/30',    text: 'text-rose-200',    icon: AlertTriangle,dot: 'bg-rose-400'    },
    }[tone];
    const Icon = TONE.icon;

    return (
        <div className="flex flex-wrap items-center gap-2" data-testid="mt5-limits-strip">
            <div className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${TONE.bg} ring-1 ${TONE.ring}`} data-testid="mt5-kyc-status">
                <span className={`relative flex w-2 h-2`}>
                    <span className={`absolute inset-0 rounded-full ${TONE.dot} animate-ping opacity-60`} />
                    <span className={`relative w-2 h-2 rounded-full ${TONE.dot}`} />
                </span>
                <Icon className={`w-3.5 h-3.5 ${TONE.text} ${tone === 'amber' ? 'animate-spin' : ''}`} />
                <span className={`text-[11px] font-bold tracking-wide ${TONE.text}`}>{data.kyc.label}</span>
                <span className="text-slate-600 text-[10px]">· Nivel {data.kyc.level}/3</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/70 ring-1 ring-slate-800">
                <Banknote className="w-3 h-3 text-cyan-400" />
                <span className="text-slate-300 text-[11px]">
                    <span className="text-white font-bold">{Math.round(data.min_invest_eur)} EUR</span> mínimo
                </span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/70 ring-1 ring-slate-800">
                <ArrowDownToLine className="w-3 h-3 text-emerald-400" />
                <span className="text-slate-300 text-[11px]">
                    Abonos desde <span className="text-white font-bold">{Math.round(data.min_topup_eur)} EUR</span>
                </span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/70 ring-1 ring-slate-800">
                <ArrowUpFromLine className="w-3 h-3 text-amber-400" />
                <span className="text-slate-300 text-[11px]">
                    Retiro parcial hasta <span className="text-white font-bold">{Math.round(data.max_partial_withdraw_pct)}%</span>
                </span>
            </div>
        </div>
    );
};


// ════════════════════════════════════════════════════════════════
//  Global recent withdrawals (social proof feed)
// ════════════════════════════════════════════════════════════════
export const GlobalWithdrawalsFeed = () => {
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);

    const load = useCallback(async () => {
        try {
            const r = await api.get('/mt5-hub/global-feed');
            setItems(r.data?.items || []);
            setTotal(r.data?.total_24h_eur || 0);
        } catch { /* silent */ }
    }, []);

    useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, [load]);

    return (
        <Card className="bg-slate-900/60 border-slate-800/80 p-4 overflow-hidden" data-testid="mt5-global-feed">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-cyan-500" />
                    <h3 className="text-[13px] font-semibold text-slate-200 tracking-wide uppercase">Retiros recientes en la red</h3>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 ring-1 ring-emerald-500/30 text-emerald-300 text-[9px] font-bold tracking-wider uppercase">
                        <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" /> Live
                    </span>
                </div>
                <p className="text-[10.5px] text-slate-500">
                    Últimas 24h: <span className="text-emerald-300 font-mono font-bold">€{fmtEUR(total)}</span>
                </p>
            </div>
            <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[11.5px]">
                    <tbody>
                        {items.slice(0, 8).map(it => (
                            <tr key={it.id} className="border-b border-slate-800/40 last:border-0">
                                <td className="py-1.5 px-1 whitespace-nowrap">
                                    <span className="text-base mr-1.5" aria-label={it.country}>{it.flag}</span>
                                    <span className="text-slate-200 font-semibold">{it.name}</span>
                                </td>
                                <td className="py-1.5 px-1 text-slate-500 whitespace-nowrap text-[10.5px]">{it.city}, {it.country}</td>
                                <td className="py-1.5 px-1 text-right whitespace-nowrap">
                                    <span
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold text-[10px]"
                                        style={{ backgroundColor: it.method_color + '22', color: it.method_color, border: '1px solid ' + it.method_color + '55' }}
                                    >
                                        {it.method}
                                    </span>
                                </td>
                                <td className="py-1.5 px-1 text-right text-emerald-300 font-mono tabular-nums font-bold">
                                    €{fmtEUR(it.amount_eur)}
                                </td>
                                <td className="py-1.5 px-1 text-right text-slate-600 text-[10px] whitespace-nowrap">
                                    hace {it.minutes_ago} min
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="mt-2 text-[9.5px] text-slate-600 inline-flex items-center gap-1">
                <Globe2 className="w-2.5 h-2.5" /> Datos agregados de retiros completados en la plataforma · iniciales y ciudad anonimizada
            </p>
        </Card>
    );
};


// ════════════════════════════════════════════════════════════════
//  Blockchain transactions (paid / received)
// ════════════════════════════════════════════════════════════════
const TX_EXPLORER = {
    BTC:  (h) => `https://mempool.space/tx/${h}`,
    ETH:  (h) => `https://etherscan.io/tx/${h}`,
    USDT: (h) => `https://tronscan.org/#/transaction/${h}`,
};

export const BlockchainTransactions = () => {
    const [direction, setDirection] = useState('received');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async (dir) => {
        setLoading(true);
        try {
            const r = await api.get('/mt5-hub/blockchain-txs', { params: { direction: dir } });
            setItems(r.data?.items || []);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(direction); }, [direction, load]);

    return (
        <Card className="bg-slate-900/60 border-slate-800/80 p-4" data-testid="mt5-blockchain-tx">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-amber-500" />
                    <h3 className="text-[13px] font-semibold text-slate-200 tracking-wide uppercase">Transacciones blockchain</h3>
                </div>
                <div className="inline-flex items-center gap-1 rounded-lg bg-slate-950/70 ring-1 ring-slate-800 p-1">
                    <button
                        type="button"
                        onClick={() => setDirection('received')}
                        data-no-hover
                        data-testid="mt5-tx-tab-received"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-bold tracking-wider transition-all ${
                            direction === 'received'
                                ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'
                                : 'text-slate-500 hover:text-slate-200'
                        }`}
                    >
                        <ArrowDownToLine className="w-3 h-3" /> Recibidas
                    </button>
                    <button
                        type="button"
                        onClick={() => setDirection('paid')}
                        data-no-hover
                        data-testid="mt5-tx-tab-paid"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-bold tracking-wider transition-all ${
                            direction === 'paid'
                                ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40'
                                : 'text-slate-500 hover:text-slate-200'
                        }`}
                    >
                        <ArrowUpFromLine className="w-3 h-3" /> Pagadas
                    </button>
                </div>
            </div>

            {loading && <p className="text-slate-500 text-sm py-6 text-center">Cargando…</p>}
            {!loading && items.length === 0 && (
                <p className="text-slate-500 text-[12px] py-6 text-center">
                    {direction === 'received' ? 'Aún no has recibido transacciones blockchain.' : 'Aún no tienes transacciones pagadas.'}
                </p>
            )}
            {!loading && items.length > 0 && (
                <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-[11.5px]">
                        <thead>
                            <tr className="text-slate-600 text-left border-b border-slate-800/70">
                                <th className="py-1.5 px-1 font-semibold uppercase tracking-wider">Fecha</th>
                                <th className="py-1.5 px-1 font-semibold uppercase tracking-wider">Tipo</th>
                                <th className="py-1.5 px-1 font-semibold uppercase tracking-wider text-right">Monto</th>
                                <th className="py-1.5 px-1 font-semibold uppercase tracking-wider hidden md:table-cell">Hash</th>
                                <th className="py-1.5 px-1 font-semibold uppercase tracking-wider"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.slice(0, 10).map(it => {
                                const cryptoKey = (it.crypto || '').toUpperCase().includes('USDT') ? 'USDT' : (it.crypto || '').toUpperCase();
                                const explorer = it.tx_hash && TX_EXPLORER[cryptoKey] ? TX_EXPLORER[cryptoKey](it.tx_hash) : null;
                                return (
                                    <tr key={it.id} className="border-b border-slate-800/40 last:border-0">
                                        <td className="py-1.5 px-1 text-slate-400 whitespace-nowrap">{fmtDate(it.when_iso)}</td>
                                        <td className="py-1.5 px-1">
                                            <span className="text-slate-200 font-mono font-semibold">{it.crypto}</span>
                                            <span className="text-slate-600 text-[9.5px] ml-1">· {it.network}</span>
                                        </td>
                                        <td className={`py-1.5 px-1 text-right font-mono tabular-nums font-bold ${direction === 'received' ? 'text-emerald-300' : 'text-rose-300'}`}>
                                            {direction === 'received' ? '+' : '−'}€{fmtEUR(it.amount_eur)}
                                        </td>
                                        <td className="py-1.5 px-1 hidden md:table-cell">
                                            {it.tx_hash ? (
                                                <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-[10.5px]">
                                                    <Hash className="w-2.5 h-2.5" />
                                                    {it.tx_hash.slice(0, 6)}…{it.tx_hash.slice(-6)}
                                                </span>
                                            ) : (
                                                <span className="text-slate-600">—</span>
                                            )}
                                        </td>
                                        <td className="py-1.5 px-1 text-right">
                                            {explorer && (
                                                <a
                                                    href={explorer}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex text-cyan-400 hover:text-cyan-300"
                                                    data-no-hover
                                                    title="Ver en explorer"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                </a>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
};


// ════════════════════════════════════════════════════════════════
//  Reserve future investment modal
// ════════════════════════════════════════════════════════════════
export const ReserveInvestmentModal = ({ open, onClose }) => {
    const [amount, setAmount] = useState(500);
    const [method, setMethod] = useState('usdt_trc20');
    const [date, setDate] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(null);

    useEffect(() => {
        if (!open) return;
        const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // default +7 days
        setDate(d.toISOString().slice(0, 10));
        setAmount(500);
        setMethod('usdt_trc20');
        setSuccess(null);
    }, [open]);

    const submit = async () => {
        if (amount < 300) { toast.error('Monto mínimo: 300 EUR'); return; }
        if (!date) { toast.error('Selecciona una fecha'); return; }
        setSubmitting(true);
        try {
            const r = await api.post('/mt5-invest/reserve', {
                amount_eur: Number(amount),
                method,
                target_date: new Date(date + 'T12:00:00Z').toISOString(),
            });
            setSuccess(r.data.reservation);
            toast.success('Reserva creada · tasa bloqueada 24h');
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al crear la reserva');
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;
    const methods = [
        { id: 'usdt_trc20', label: 'USDT (TRC20)', color: '#26A17B' },
        { id: 'btc',        label: 'Bitcoin',       color: '#F7931A' },
        { id: 'eth',        label: 'Ethereum',      color: '#627EEA' },
    ];

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
                onClick={onClose}
                data-testid="mt5-reserve-modal"
            >
                <motion.div
                    initial={{ y: 24, opacity: 0, scale: 0.96 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: 24, opacity: 0, scale: 0.96 }}
                    transition={{ type: 'spring', damping: 22, stiffness: 320 }}
                    className="relative w-full max-w-md max-h-[92vh] overflow-y-auto bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 ring-1 ring-cyan-500/25 rounded-2xl shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-800/80">
                        <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-lg bg-cyan-500/15 ring-1 ring-cyan-500/30 flex items-center justify-center">
                                <CalendarClock className="w-4.5 h-4.5 text-cyan-300" />
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-300 font-bold">Reservar inversión</p>
                                <h3 className="text-white text-base font-bold">Bloqueo de tasa hasta 180 días</h3>
                            </div>
                        </div>
                        <button type="button" onClick={onClose} data-testid="mt5-reserve-close" className="w-8 h-8 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="px-5 py-5 space-y-3.5">
                        {success ? (
                            <div className="text-center py-4" data-testid="mt5-reserve-success">
                                <div className="inline-flex w-12 h-12 rounded-full bg-emerald-500/20 ring-1 ring-emerald-400/50 items-center justify-center mx-auto">
                                    <CheckCircle2 className="w-6 h-6 text-emerald-200" />
                                </div>
                                <p className="text-emerald-200 text-sm font-bold mt-3">Reserva confirmada</p>
                                <p className="text-slate-400 text-[12px] mt-1">
                                    €{fmtEUR(success.amount_eur)} en {success.method.replace('_', ' ').toUpperCase()}<br />
                                    para el <span className="text-white font-mono">{fmtDate(success.target_date)}</span>
                                </p>
                                <p className="text-slate-500 text-[10.5px] mt-2 font-mono">Ref. {success.id.slice(0, 8)}</p>
                                <p className="text-amber-300/80 text-[10.5px] mt-3 inline-flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Confirma el pago antes de 24h para mantener la tasa
                                </p>
                                <Button onClick={onClose} className="mt-4 bg-cyan-600 hover:bg-cyan-500 text-white">Listo</Button>
                            </div>
                        ) : (
                            <>
                                <label className="block">
                                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Monto (EUR)</span>
                                    <input
                                        type="number"
                                        min={300}
                                        max={500000}
                                        step="50"
                                        value={amount}
                                        onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                                        data-testid="mt5-reserve-amount"
                                        className="w-full h-11 mt-1 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-lg font-mono tabular-nums font-bold focus:outline-none focus:border-cyan-500/50"
                                    />
                                </label>

                                <div>
                                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Método</span>
                                    <div className="grid grid-cols-3 gap-2 mt-1">
                                        {methods.map(m => (
                                            <button
                                                key={m.id}
                                                type="button"
                                                onClick={() => setMethod(m.id)}
                                                data-no-hover
                                                data-testid={`mt5-reserve-method-${m.id}`}
                                                className={`h-10 rounded-lg text-[11.5px] font-bold transition-all ring-1 ${
                                                    method === m.id
                                                        ? 'text-white shadow-md'
                                                        : 'bg-slate-900 text-slate-400 ring-slate-800 hover:text-slate-200'
                                                }`}
                                                style={method === m.id ? { backgroundColor: m.color + '22', borderColor: m.color, color: m.color } : {}}
                                            >{m.label}</button>
                                        ))}
                                    </div>
                                </div>

                                <label className="block">
                                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Fecha objetivo</span>
                                    <input
                                        type="date"
                                        value={date}
                                        min={new Date(Date.now() + 24*60*60*1000).toISOString().slice(0, 10)}
                                        max={new Date(Date.now() + 180*24*60*60*1000).toISOString().slice(0, 10)}
                                        onChange={(e) => setDate(e.target.value)}
                                        data-testid="mt5-reserve-date"
                                        className="w-full h-11 mt-1 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500/50"
                                    />
                                </label>

                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/25 text-amber-200 text-[10.5px]">
                                    <Sparkles className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                    Bloquea la tasa actual del activo. Tienes <span className="font-bold">24 horas</span> para enviar el pago una vez creada la reserva.
                                </div>

                                <Button
                                    onClick={submit}
                                    disabled={submitting || amount < 300}
                                    data-testid="mt5-reserve-submit"
                                    className="w-full h-11 bg-gradient-to-r from-cyan-600 to-cyan-500 text-white font-bold tracking-wider"
                                >
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CalendarClock className="w-4 h-4 mr-2" />}
                                    Crear reserva · €{fmtEUR(amount)}
                                </Button>
                            </>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
