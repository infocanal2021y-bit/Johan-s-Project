import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import api from '../lib/api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import {
    Wallet, ArrowRightLeft, RefreshCw, TrendingUp, Clock, X,
    ChevronRight, History, AlertCircle, CheckCircle2, Loader2, Copy, Check,
} from 'lucide-react';

const fmt = (n, c, decimals) => {
    if (n === null || n === undefined) return '—';
    const d = decimals ?? 2;
    return Number(n).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
};

const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});


// ─── Currency Card (Revolut/N26-style) ────────────────────────────
const CurrencyCard = ({ account, onConvert, onWithdraw }) => {
    const accent = account.color || '#1973B8';
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -3 }}
            transition={{ duration: 0.25 }}
            className="relative rounded-2xl bg-white shadow-[0_1px_3px_rgba(7,33,70,0.04),0_6px_20px_rgba(7,33,70,0.06)] hover:shadow-[0_8px_32px_rgba(7,33,70,0.12)] transition-shadow overflow-hidden"
            data-testid={`multi-currency-card-${account.currency}`}
        >
            <div className="h-1" style={{ backgroundColor: accent }} />
            <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl"
                            style={{ backgroundColor: accent + '15' }}
                        >
                            <span>{account.flag}</span>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-bold">
                                {account.name}
                            </p>
                            <p className="text-[13px] font-mono font-bold" style={{ color: accent }}>
                                {account.currency} · {account.symbol}
                            </p>
                        </div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Activa
                    </span>
                </div>

                <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Saldo disponible</p>
                    <p className="text-3xl font-bold tabular-nums tracking-tight mt-1" style={{ color: '#072146' }}>
                        {account.symbol}{fmt(account.balance, account.currency, account.decimals)}
                    </p>
                    {account.pending > 0 && (
                        <p className="text-[11px] text-amber-600 mt-1 font-medium">
                            <Clock className="w-3 h-3 inline mr-1" />
                            Pendiente: {account.symbol}{fmt(account.pending, account.currency, account.decimals)}
                        </p>
                    )}
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[10.5px] text-slate-500">
                    <span>Último movimiento</span>
                    <span className="font-medium">{fmtDate(account.last_movement_at)}</span>
                </div>

                <div className="flex gap-2 mt-4">
                    <Button
                        onClick={() => onConvert(account)}
                        className="flex-1 h-9 text-[12px] font-bold bg-[#1973B8] hover:bg-[#1F89D8] text-white"
                        data-testid={`convert-btn-${account.currency}`}
                    >
                        <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" /> Convertir
                    </Button>
                    <Button
                        onClick={() => onWithdraw(account)}
                        variant="outline"
                        className="flex-1 h-9 text-[12px] font-bold border-slate-300 text-slate-700 hover:bg-slate-50"
                        disabled
                        title="Próximamente en Fase 2"
                        data-testid={`withdraw-btn-${account.currency}`}
                    >
                        Retirar
                    </Button>
                </div>
            </div>
        </motion.div>
    );
};


// ─── Convert Modal (preview + confirm) ────────────────────────────
const ConvertModal = ({ account, accounts, ratesData, onClose, onSuccess }) => {
    const [toCurrency, setToCurrency] = useState(account?.currency === 'EUR' ? 'USD' : 'EUR');
    const [amount, setAmount] = useState('');
    const [preview, setPreview] = useState(null);
    const [previewing, setPreviewing] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const fromCurrency = account?.currency;
    const fromAcc = account;
    const toAcc = useMemo(() => accounts.find(a => a.currency === toCurrency), [accounts, toCurrency]);

    const debouncedAmount = useDebounced(amount, 350);

    useEffect(() => {
        if (!debouncedAmount || isNaN(Number(debouncedAmount)) || Number(debouncedAmount) <= 0) {
            setPreview(null);
            return;
        }
        if (fromCurrency === toCurrency) {
            setPreview(null);
            return;
        }
        setPreviewing(true);
        api.post('/multi-currency/preview', {
            from_currency: fromCurrency,
            to_currency: toCurrency,
            amount: Number(debouncedAmount),
        })
            .then((r) => setPreview(r.data))
            .catch((err) => {
                setPreview(null);
                if (err.response?.data?.detail) toast.error(err.response.data.detail);
            })
            .finally(() => setPreviewing(false));
    }, [debouncedAmount, fromCurrency, toCurrency]);

    const handleConfirm = async () => {
        if (!preview) return;
        if (Number(amount) > fromAcc.balance + 1e-9) {
            toast.error(`Saldo insuficiente. Disponible: ${fmt(fromAcc.balance, fromCurrency, fromAcc.decimals)} ${fromCurrency}`);
            return;
        }
        setConfirming(true);
        try {
            const r = await api.post('/multi-currency/convert', {
                from_currency: fromCurrency,
                to_currency: toCurrency,
                amount: Number(amount),
            });
            toast.success(`Conversión completada · Ref: ${r.data.conversion.reference}`);
            onSuccess();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Error al convertir');
        } finally {
            setConfirming(false);
        }
    };

    if (!account) return null;

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            data-testid="convert-modal"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 py-5 bg-gradient-to-r from-[#072146] to-[#004481] flex items-center justify-between">
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-[#7CB1E5] font-bold">Conversión de divisas</p>
                        <h3 className="text-white text-xl font-bold mt-0.5">
                            {fromAcc?.flag} {fromCurrency} → {toAcc?.flag} {toCurrency}
                        </h3>
                    </div>
                    <button onClick={onClose} className="text-white/70 hover:text-white p-1" aria-label="Cerrar">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* From */}
                    <div>
                        <label className="block text-[10.5px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">
                            Convertir desde {fromCurrency}
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm">
                                {fromAcc?.symbol}
                            </span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="w-full h-12 pl-10 pr-3 rounded-lg border border-slate-200 focus:border-[#1973B8] focus:ring-1 focus:ring-[#1973B8] outline-none text-xl font-bold text-[#072146] bg-white"
                                data-testid="convert-amount-input"
                                autoFocus
                            />
                        </div>
                        <p className="text-[10.5px] text-slate-500 mt-1">
                            Disponible: <span className="font-bold text-slate-700">{fmt(fromAcc?.balance, fromCurrency, fromAcc?.decimals)} {fromCurrency}</span>
                        </p>
                    </div>

                    {/* To selector */}
                    <div>
                        <label className="block text-[10.5px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">
                            Convertir a
                        </label>
                        <select
                            value={toCurrency}
                            onChange={(e) => setToCurrency(e.target.value)}
                            className="w-full h-12 px-3 rounded-lg border border-slate-200 focus:border-[#1973B8] focus:ring-1 focus:ring-[#1973B8] outline-none text-[14px] font-bold text-[#072146] bg-white"
                            data-testid="convert-to-select"
                        >
                            {accounts.filter(a => a.currency !== fromCurrency).map(a => (
                                <option key={a.currency} value={a.currency}>
                                    {a.flag} {a.currency} · {a.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Preview */}
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 min-h-[140px]">
                        {previewing && (
                            <div className="flex items-center justify-center py-8 text-slate-500 text-sm">
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Calculando…
                            </div>
                        )}
                        {!previewing && !preview && (
                            <p className="text-center py-8 text-slate-400 text-sm">
                                Ingresa un monto para ver el preview
                            </p>
                        )}
                        {!previewing && preview && (
                            <div className="space-y-2.5 text-[13px]">
                                <Row label="Monto a convertir"
                                    value={`${fmt(preview.amount_in, fromCurrency)} ${fromCurrency}`} />
                                <Row label="Tipo de cambio"
                                    value={`1 ${fromCurrency} = ${preview.rate.toFixed(6)} ${toCurrency}`} mono />
                                <Row label={`Comisión (${preview.fee_pct}%)`}
                                    value={`−${fmt(preview.fee_amount, toCurrency, toAcc?.decimals)} ${toCurrency}`}
                                    valueClass="text-amber-700" />
                                <div className="border-t border-slate-200 pt-2.5 mt-2.5">
                                    <Row
                                        label="Total a recibir"
                                        value={`${fmt(preview.amount_out, toCurrency, toAcc?.decimals)} ${toCurrency}`}
                                        valueClass="text-emerald-600 text-lg font-bold"
                                        bold
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1">Tasa actualizada: {fmtDate(preview.rate_at)}</p>
                            </div>
                        )}
                    </div>

                    {Number(amount) > (fromAcc?.balance ?? 0) + 1e-9 && (
                        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[12px]">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            Saldo insuficiente — disponible {fmt(fromAcc?.balance, fromCurrency, fromAcc?.decimals)} {fromCurrency}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button
                            variant="outline"
                            onClick={onClose}
                            className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-50"
                            data-testid="convert-cancel-btn"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleConfirm}
                            disabled={!preview || confirming || Number(amount) > (fromAcc?.balance ?? 0) + 1e-9}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                            data-testid="convert-confirm-btn"
                        >
                            {confirming ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                            Confirmar conversión
                        </Button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};


const Row = ({ label, value, mono, valueClass = 'text-[#072146]', bold }) => (
    <div className="flex items-center justify-between gap-3">
        <span className="text-slate-500">{label}</span>
        <span className={`${mono ? 'font-mono tabular-nums' : ''} ${bold ? 'font-bold' : 'font-semibold'} ${valueClass}`}>
            {value}
        </span>
    </div>
);


// ─── Conversion History Table ────────────────────────────────────
const ConversionHistory = ({ items }) => {
    if (!items.length) {
        return (
            <Card className="p-8 text-center bg-white border-slate-200">
                <History className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-slate-500 text-sm">Aún no has realizado conversiones.</p>
            </Card>
        );
    }
    return (
        <Card className="bg-white border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-[13px]" data-testid="conversion-history-table">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr className="text-slate-500 text-left">
                            <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px]">Fecha</th>
                            <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px]">Origen</th>
                            <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px]">Destino</th>
                            <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px] text-right">Tipo de cambio</th>
                            <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px] text-right">Comisión</th>
                            <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px] text-right">Recibido</th>
                            <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px]">Estado</th>
                            <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px]">Ref</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((c) => (
                            <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`conversion-row-${c.id}`}>
                                <td className="py-2.5 px-3 text-slate-500 text-[11px] whitespace-nowrap">{fmtDate(c.created_at)}</td>
                                <td className="py-2.5 px-3">
                                    <span className="font-mono font-bold text-[#072146]">{fmt(c.amount_in)} {c.from_currency || '—'}</span>
                                </td>
                                <td className="py-2.5 px-3 font-mono font-bold text-emerald-600">{c.to_currency}</td>
                                <td className="py-2.5 px-3 text-right font-mono text-slate-600">{c.rate ? c.rate.toFixed(6) : '—'}</td>
                                <td className="py-2.5 px-3 text-right font-mono text-amber-700">{c.fee_amount ? `${fmt(c.fee_amount)} ${c.to_currency}` : '—'}</td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600">{fmt(c.amount_out)} {c.to_currency}</td>
                                <td className="py-2.5 px-3">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase">
                                        <CheckCircle2 className="w-2.5 h-2.5" /> {c.status}
                                    </span>
                                </td>
                                <td className="py-2.5 px-3">
                                    <CopyRef value={c.reference} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};


const CopyRef = ({ value }) => {
    const [c, setC] = useState(false);
    if (!value) return <span className="text-slate-400">—</span>;
    return (
        <button
            type="button"
            onClick={async () => {
                try { await navigator.clipboard.writeText(value); setC(true); setTimeout(() => setC(false), 1500); toast.success('Referencia copiada'); } catch (err) { console.error('[clipboard] copy failed', err); }
            }}
            className="inline-flex items-center gap-1 text-cyan-700 font-mono text-[10.5px] hover:text-cyan-900"
            title={value}
        >
            {value}
            {c ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 opacity-50" />}
        </button>
    );
};


// ─── Live Rates strip ────────────────────────────────────────────
const RatesStrip = ({ ratesData }) => {
    if (!ratesData) return null;
    const others = Object.entries(ratesData.rates || {}).filter(([c]) => c !== 'EUR');
    return (
        <Card className="p-4 bg-gradient-to-br from-[#072146] to-[#004481] border-0">
            <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-[#7CB1E5]" />
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#7CB1E5] font-bold">Tipo de cambio en vivo · base EUR</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {others.map(([cur, rate]) => {
                    const meta = ratesData.meta?.[cur] || {};
                    return (
                        <div key={cur} className="bg-white/5 rounded-lg px-3 py-2 ring-1 ring-white/10" data-testid={`rate-${cur}`}>
                            <div className="flex items-center gap-1.5 text-[10px] text-white/70 font-bold uppercase">
                                <span className="text-sm">{meta.flag || ''}</span>
                                {cur}
                            </div>
                            <p className="text-white font-mono font-bold tabular-nums mt-0.5 text-[14px]">
                                {Number(rate).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
                            </p>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
};


// ─── Debounce hook ────────────────────────────────────────────────
function useDebounced(value, ms = 300) {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setV(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return v;
}


// ─── Main Page ────────────────────────────────────────────────────
const MultiCurrencyWalletPage = () => {
    const [accounts, setAccounts] = useState([]);
    const [ratesData, setRatesData] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [convertFor, setConvertFor] = useState(null);

    const totalEUR = useMemo(() => {
        if (!ratesData?.rates || !accounts.length) return 0;
        // sum balances converted back to EUR for an estimated portfolio total
        return accounts.reduce((acc, a) => {
            const r = ratesData.rates[a.currency];
            if (!r || r === 0) return acc;
            // a.balance is in `a.currency` units → divide by rate to get EUR
            return acc + (a.balance / r);
        }, 0);
    }, [accounts, ratesData]);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [accR, ratesR, histR] = await Promise.all([
                api.get('/multi-currency/accounts'),
                api.get('/multi-currency/rates'),
                api.get('/multi-currency/conversions?limit=50'),
            ]);
            setAccounts(accR.data.accounts || []);
            setRatesData(ratesR.data);
            setHistory(histR.data.items || []);
        } catch (err) {
            console.error('[multi-currency] load failed', err);
            toast.error('No se pudo cargar el wallet multidivisa');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleConvertSuccess = () => {
        setConvertFor(null);
        load(true);
    };

    const handleWithdraw = () => {
        toast.info('El retiro multidivisa estará disponible en la Fase 2 (próximamente).');
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-[10.5px] uppercase tracking-[0.14em] text-[#7CB1E5] font-bold">Banking · Multidivisa</p>
                        <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1" data-testid="multi-currency-title">
                            Cuenta multidivisa
                        </h1>
                        <p className="text-slate-400 text-[13px] mt-1.5">
                            Saldos separados por moneda · convierte al instante con tasas institucionales · comisión 0.5%
                        </p>
                    </div>
                    <Button
                        onClick={() => { setRefreshing(true); load(true); }}
                        variant="outline"
                        className="bg-white/5 border-white/15 text-white hover:bg-white/10"
                        data-testid="refresh-btn"
                    >
                        <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} /> Refrescar
                    </Button>
                </div>

                {/* Total */}
                <Card className="p-5 bg-white border-slate-200">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10.5px] uppercase tracking-wider text-slate-500 font-bold">Valor estimado del portfolio</p>
                            <p className="text-[#072146] text-4xl font-bold tabular-nums mt-1" data-testid="portfolio-total">
                                €{fmt(totalEUR)}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-1">
                                Suma de todos los saldos convertidos a EUR usando tasas actuales
                            </p>
                        </div>
                        <Wallet className="w-12 h-12 text-[#1973B8]/30" />
                    </div>
                </Card>

                {/* Live rates */}
                <RatesStrip ratesData={ratesData} />

                {/* Currency Cards Grid */}
                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {Array.from({ length: 7 }).map((_, i) => (
                            <Card key={i} className="h-48 animate-pulse bg-white/10 border-0" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="currency-cards-grid">
                        {accounts.map(a => (
                            <CurrencyCard
                                key={a.currency}
                                account={a}
                                onConvert={setConvertFor}
                                onWithdraw={handleWithdraw}
                            />
                        ))}
                    </div>
                )}

                {/* History */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-white text-lg font-bold flex items-center gap-2">
                            <History className="w-4 h-4 text-[#7CB1E5]" />
                            Historial de conversiones
                        </h2>
                        <span className="text-[10.5px] text-slate-400 font-mono">{history.length} operaciones</span>
                    </div>
                    <ConversionHistory items={history} />
                </div>
            </div>

            {convertFor && (
                <ConvertModal
                    account={convertFor}
                    accounts={accounts}
                    ratesData={ratesData}
                    onClose={() => setConvertFor(null)}
                    onSuccess={handleConvertSuccess}
                />
            )}
        </Layout>
    );
};

export default MultiCurrencyWalletPage;
