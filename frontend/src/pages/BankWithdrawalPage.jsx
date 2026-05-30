import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import api from '../lib/api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import {
    Send, ArrowRight, ChevronRight, Building2, Mail, Loader2, CheckCircle2,
    XCircle, Clock, AlertTriangle, RefreshCw, Copy, Check,
    Banknote, ShieldCheck,
} from 'lucide-react';

const fmt = (n, d = 2) => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});


// ─── Stepper indicator ───────────────────────────────────────────
const Stepper = ({ step }) => (
    <div className="flex items-center gap-2 mb-6" data-testid="wd-stepper">
        {[
            { n: 1, label: 'Datos bancarios' },
            { n: 2, label: 'Resumen' },
            { n: 3, label: 'Confirmar' },
        ].map((s, i, arr) => {
            const done = step > s.n;
            const active = step === s.n;
            return (
                <div key={s.n} className="flex items-center gap-2 flex-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
                        done ? 'bg-emerald-500 text-white' : active ? 'bg-[#1973B8] text-white' : 'bg-slate-200 text-slate-500'
                    }`}>
                        {done ? <Check className="w-3.5 h-3.5" /> : s.n}
                    </div>
                    <span className={`text-[11.5px] font-bold uppercase tracking-wider ${active ? 'text-[#072146]' : 'text-slate-500'}`}>
                        {s.label}
                    </span>
                    {i < arr.length - 1 && (
                        <div className={`flex-1 h-0.5 ${done ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                    )}
                </div>
            );
        })}
    </div>
);


// ─── Step 1: Bank Form ────────────────────────────────────────────
const StepBankForm = ({ accounts, config, form, setForm, onNext }) => {
    const country = config.countries[form.country];
    const fromAcc = accounts.find(a => a.currency === form.from_currency);
    const insuf = Number(form.amount || 0) > (fromAcc?.balance || 0);
    return (
        <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="País destino">
                    <select
                        value={form.country}
                        onChange={(e) => setForm({ ...form, country: e.target.value })}
                        className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:border-[#1973B8] focus:ring-1 focus:ring-[#1973B8] outline-none text-[14px] font-bold text-[#072146] bg-white"
                        data-testid="wd-country-select"
                    >
                        {Object.entries(config.countries).map(([code, c]) => (
                            <option key={code} value={code}>{c.flag} {c.name} ({c.currency})</option>
                        ))}
                    </select>
                </Field>
                <Field label="Banco destino">
                    <select
                        value={form.bank_name}
                        onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                        className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:border-[#1973B8] focus:ring-1 focus:ring-[#1973B8] outline-none text-[14px] font-bold text-[#072146] bg-white"
                        data-testid="wd-bank-select"
                    >
                        {country.banks.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                </Field>
            </div>

            <Field label="Titular de la cuenta">
                <input
                    type="text"
                    value={form.bank_holder}
                    onChange={(e) => setForm({ ...form, bank_holder: e.target.value })}
                    placeholder="Nombre completo del titular"
                    className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:border-[#1973B8] focus:ring-1 focus:ring-[#1973B8] outline-none text-[14px] text-[#072146]"
                    data-testid="wd-holder-input"
                />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Número de cuenta / IBAN">
                    <input
                        type="text"
                        value={form.bank_account}
                        onChange={(e) => setForm({ ...form, bank_account: e.target.value })}
                        placeholder="ES22 2100 1935 5701..."
                        className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:border-[#1973B8] focus:ring-1 focus:ring-[#1973B8] outline-none text-[14px] font-mono text-[#072146]"
                        data-testid="wd-account-input"
                    />
                </Field>
                <Field label="SWIFT/BIC (opcional)">
                    <input
                        type="text"
                        value={form.bank_swift}
                        onChange={(e) => setForm({ ...form, bank_swift: e.target.value })}
                        placeholder="CAIXESBBXXX"
                        className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:border-[#1973B8] focus:ring-1 focus:ring-[#1973B8] outline-none text-[14px] font-mono text-[#072146]"
                        data-testid="wd-swift-input"
                    />
                </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Moneda origen">
                    <select
                        value={form.from_currency}
                        onChange={(e) => setForm({ ...form, from_currency: e.target.value })}
                        className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:border-[#1973B8] focus:ring-1 focus:ring-[#1973B8] outline-none text-[14px] font-bold text-[#072146] bg-white"
                        data-testid="wd-from-cur-select"
                    >
                        {accounts.map(a => (
                            <option key={a.currency} value={a.currency}>
                                {a.flag} {a.currency} · {fmt(a.balance, a.decimals)} disponible
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label={`Monto a retirar (${form.from_currency})`}>
                    <input
                        type="number"
                        step="0.01"
                        value={form.amount}
                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                        placeholder="0.00"
                        className={`w-full h-11 px-3 rounded-lg border ${insuf ? 'border-rose-400' : 'border-slate-200'} focus:border-[#1973B8] focus:ring-1 focus:ring-[#1973B8] outline-none text-[14px] font-mono font-bold text-[#072146]`}
                        data-testid="wd-amount-input"
                    />
                </Field>
            </div>

            {insuf && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[12px]">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    Saldo insuficiente en {form.from_currency} — disponible {fmt(fromAcc?.balance, fromAcc?.decimals)} {form.from_currency}
                </div>
            )}

            <Button
                onClick={onNext}
                disabled={!form.bank_holder || !form.bank_account || !form.amount || Number(form.amount) <= 0 || insuf}
                className="w-full h-11 bg-[#1973B8] hover:bg-[#1F89D8] text-white font-bold"
                data-testid="wd-next-step1"
            >
                Continuar al resumen <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
        </div>
    );
};


const Field = ({ label, children }) => (
    <label className="block">
        <span className="block text-[10.5px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">{label}</span>
        {children}
    </label>
);


// ─── Step 2: Summary ──────────────────────────────────────────────
const StepSummary = ({ preview, form, config, accounts, onBack, onInitiate, initiating }) => {
    if (!preview) return <div className="text-center py-8 text-slate-500">Calculando…</div>;
    const country = config.countries[form.country];
    return (
        <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-5 space-y-3">
                <SummaryRow label="País destino" value={`${country.flag} ${country.name}`} />
                <SummaryRow label="Banco" value={form.bank_name} />
                <SummaryRow label="Titular" value={form.bank_holder} />
                <SummaryRow label="Cuenta" value={form.bank_account} mono />
                {form.bank_swift && <SummaryRow label="SWIFT" value={form.bank_swift} mono />}
            </div>

            <div className="rounded-xl bg-white border-2 border-[#1973B8]/20 p-5 space-y-3">
                <p className="text-[10.5px] uppercase tracking-wider text-[#1973B8] font-bold mb-2">Conversión</p>
                <SummaryRow label="Monto original"
                    value={`${fmt(preview.amount_in)} ${preview.from_currency}`} />
                <SummaryRow label="Tipo de cambio"
                    value={`1 ${preview.from_currency} = ${preview.rate.toFixed(6)} ${preview.to_currency}`} mono />
                <SummaryRow label={`Comisión (${preview.fee_pct}%)`}
                    value={`−${fmt(preview.fee_amount)} ${preview.to_currency}`} valueClass="text-amber-700" />
                <div className="border-t border-slate-200 pt-3">
                    <SummaryRow
                        label="Total a recibir"
                        value={`${fmt(preview.amount_out)} ${preview.to_currency}`}
                        valueClass="text-emerald-600 text-lg font-bold" bold
                    />
                </div>
                <p className="text-[11px] text-slate-500">
                    <Clock className="w-3 h-3 inline mr-1" />
                    Tiempo estimado: <strong>2-5 días hábiles</strong>
                </p>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-900">
                <ShieldCheck className="w-4 h-4 inline mr-1.5" />
                Al continuar enviaremos un código de 6 dígitos a tu email para confirmar la operación.
            </div>

            <div className="flex gap-3 pt-2">
                <Button onClick={onBack} variant="outline" className="flex-1 border-slate-300" data-testid="wd-back-step2">
                    Volver
                </Button>
                <Button
                    onClick={onInitiate}
                    disabled={initiating}
                    className="flex-1 bg-[#1973B8] hover:bg-[#1F89D8] text-white font-bold"
                    data-testid="wd-initiate-btn"
                >
                    {initiating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                    Enviar código por email
                </Button>
            </div>
        </div>
    );
};


const SummaryRow = ({ label, value, mono, valueClass = 'text-[#072146]', bold }) => (
    <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="text-slate-500">{label}</span>
        <span className={`${mono ? 'font-mono' : ''} ${bold ? 'font-bold' : 'font-semibold'} ${valueClass}`}>
            {value}
        </span>
    </div>
);


// ─── Step 3: Confirm code ─────────────────────────────────────────
const StepConfirm = ({ initiateResp, onConfirm, confirming, onBack }) => {
    const [code, setCode] = useState('');
    return (
        <div className="space-y-5">
            <div className="text-center">
                <Mail className="w-12 h-12 mx-auto text-[#1973B8] mb-3" />
                <p className="text-[#072146] text-[15px]">
                    Enviamos un código de 6 dígitos a <strong>{initiateResp.masked_email}</strong>
                </p>
                <p className="text-slate-500 text-[12px] mt-1">
                    Expira el {fmtDate(initiateResp.expires_at)}
                </p>
            </div>

            <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full h-16 text-center text-3xl font-mono font-bold tracking-[0.4em] text-[#072146] bg-slate-50 border-2 border-[#1973B8]/30 focus:border-[#1973B8] focus:ring-2 focus:ring-[#1973B8]/20 rounded-xl outline-none"
                data-testid="wd-code-input"
                autoFocus
            />

            <div className="bg-slate-50 rounded-lg p-3 text-[12px] text-slate-600">
                <p>Referencia: <span className="font-mono text-[#1973B8]">{initiateResp.reference}</span></p>
                <p className="mt-1">
                    {fmt(initiateResp.preview.from_amount)} {initiateResp.preview.from_currency} →
                    <strong className="text-emerald-600 ml-1">{fmt(initiateResp.preview.to_amount)} {initiateResp.preview.to_currency}</strong>
                </p>
            </div>

            <div className="flex gap-3">
                <Button onClick={onBack} variant="outline" className="flex-1" data-testid="wd-back-step3">
                    Cancelar
                </Button>
                <Button
                    onClick={() => onConfirm(code)}
                    disabled={code.length !== 6 || confirming}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                    data-testid="wd-confirm-code-btn"
                >
                    {confirming ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Confirmar retiro
                </Button>
            </div>
        </div>
    );
};


// ─── Timeline ────────────────────────────────────────────────────
const Timeline = ({ statuses, statusLabels, currentStatus, timeline }) => {
    const isRejected = currentStatus === 'rejected';
    return (
        <div className="space-y-2.5">
            {statuses.map((s, i) => {
                const meta = statusLabels[s] || { label: s, color: '#94a3b8' };
                const idx = statuses.indexOf(currentStatus);
                const reached = !isRejected && idx >= 0 && i <= idx;
                const isCurrent = !isRejected && i === idx;
                const entry = (timeline || []).find(t => t.status === s);
                return (
                    <div key={s} className="flex items-start gap-3" data-testid={`timeline-step-${s}`}>
                        <div className={`w-3.5 h-3.5 rounded-full mt-1 flex-shrink-0 ring-2 ${
                            reached ? '' : 'ring-slate-300 bg-white'
                        }`} style={reached ? { background: meta.color, boxShadow: `0 0 0 3px ${meta.color}33` } : {}} />
                        <div className="flex-1 -mt-0.5">
                            <p className={`text-[12.5px] font-bold ${reached ? 'text-white' : 'text-slate-500'}`}>
                                {meta.label}
                                {isCurrent && <Clock className="inline w-3 h-3 ml-1.5 animate-spin" />}
                            </p>
                            {entry?.at && (
                                <p className="text-[10.5px] text-slate-400 mt-0.5">{fmtDate(entry.at)} · {entry.actor_role}</p>
                            )}
                            {entry?.note && (
                                <p className="text-[11px] text-slate-300 italic mt-0.5">"{entry.note}"</p>
                            )}
                        </div>
                    </div>
                );
            })}
            {isRejected && (
                <div className="flex items-start gap-3 mt-3 pt-3 border-t border-slate-700">
                    <XCircle className="w-4 h-4 text-rose-400 mt-0.5" />
                    <div>
                        <p className="text-rose-300 text-[12.5px] font-bold">Rechazado</p>
                        {(timeline || []).filter(t => t.status === 'rejected').map((e, i) => (
                            <p key={i} className="text-[10.5px] text-slate-400 mt-0.5">
                                {fmtDate(e.at)} · {e.note}
                            </p>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};


// ─── History Item ────────────────────────────────────────────────
const HistoryItem = ({ item, config, onView }) => {
    const meta = config?.status_labels?.[item.status] || { label: item.status, color: '#94a3b8' };
    return (
        <button
            onClick={() => onView(item)}
            className="w-full text-left bg-white border border-slate-200 hover:border-[#1973B8] hover:shadow-md rounded-xl p-4 transition-all"
            data-testid={`wd-history-item-${item.id}`}
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-mono text-[11px] text-cyan-700">{item.reference}</p>
                    <p className="text-[#072146] font-bold mt-0.5 text-[14px]">
                        {fmt(item.from_amount)} {item.from_currency}
                        <ArrowRight className="inline w-3.5 h-3.5 mx-2 text-slate-400" />
                        <span className="text-emerald-600">{fmt(item.net_to_amount)} {item.to_currency}</span>
                    </p>
                    <p className="text-slate-500 text-[12px] mt-1">
                        {item.country_flag} {item.bank_name} · {item.bank_holder}
                    </p>
                </div>
                <div className="text-right">
                    <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{ background: meta.color + '20', color: meta.color }}
                    >
                        {meta.label}
                    </span>
                    <p className="text-[10.5px] text-slate-400 mt-1">{fmtDate(item.created_at)}</p>
                </div>
            </div>
        </button>
    );
};


// ─── Detail Modal ────────────────────────────────────────────────
const DetailModal = ({ item, config, onClose }) => {
    if (!item) return null;
    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose} data-testid="wd-detail-modal">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-2xl bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 rounded-2xl ring-1 ring-cyan-500/30 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 py-4 border-b border-slate-800 flex items-start justify-between">
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold">Detalle del retiro</p>
                        <h3 className="text-white text-lg font-bold font-mono mt-0.5">{item.reference}</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><XCircle className="w-5 h-5" /></button>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Operación</p>
                        <p className="text-white text-2xl font-bold tabular-nums">
                            {fmt(item.from_amount)} <span className="text-slate-400 text-sm">{item.from_currency}</span>
                        </p>
                        <ArrowRight className="w-4 h-4 text-slate-500 my-1" />
                        <p className="text-emerald-400 text-2xl font-bold tabular-nums">
                            {fmt(item.net_to_amount)} <span className="text-slate-400 text-sm">{item.to_currency}</span>
                        </p>
                        <p className="text-slate-500 text-[11px] mt-2 font-mono">
                            Tasa: {Number(item.fx_rate).toFixed(6)} · Comisión: {fmt(item.fx_fee_amount)} {item.to_currency}
                        </p>

                        <div className="mt-6 space-y-1.5 text-[12px]">
                            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Destino</p>
                            <p className="text-white">{item.country_flag} {item.country_name}</p>
                            <p className="text-white">{item.bank_name}</p>
                            <p className="text-slate-300">Titular: {item.bank_holder}</p>
                            <p className="text-slate-300 font-mono text-[10.5px]">{item.bank_account}</p>
                            {item.bank_swift && <p className="text-slate-400 font-mono text-[10.5px]">SWIFT: {item.bank_swift}</p>}
                        </div>

                        {item.proof_url && (
                            <a
                                href={item.proof_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-5 inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-[12px] font-bold underline"
                                data-testid="wd-download-proof"
                            >
                                <Banknote className="w-3.5 h-3.5" /> Descargar comprobante
                            </a>
                        )}
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-3">Timeline</p>
                        <Timeline
                            statuses={['received', 'conversion_done', 'compliance_review', 'transfer_in_progress', 'completed']}
                            statusLabels={config?.status_labels || {}}
                            currentStatus={item.status}
                            timeline={item.status_timeline}
                        />
                    </div>
                </div>
            </motion.div>
        </div>
    );
};


// ─── Main Page ────────────────────────────────────────────────────
const BankWithdrawalPage = () => {
    const [tab, setTab] = useState('new'); // new | history
    const [accounts, setAccounts] = useState([]);
    const [config, setConfig] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    // wizard state
    const [step, setStep] = useState(1);
    const [form, setForm] = useState({
        country: 'ES', bank_name: 'CaixaBank', bank_holder: '', bank_account: '',
        bank_swift: '', from_currency: 'EUR', amount: '',
    });
    const [preview, setPreview] = useState(null);
    const [initiating, setInitiating] = useState(false);
    const [initiateResp, setInitiateResp] = useState(null);
    const [confirming, setConfirming] = useState(false);

    // detail modal
    const [detailItem, setDetailItem] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [accR, cfgR, histR] = await Promise.all([
                api.get('/multi-currency/accounts'),
                api.get('/bank-withdrawal/config'),
                api.get('/bank-withdrawal/list'),
            ]);
            setAccounts(accR.data.accounts || []);
            setConfig(cfgR.data);
            setHistory(histR.data.items || []);
        } catch (err) {
            console.error('[bank-wd] load failed', err);
            toast.error('No se pudo cargar la página de retiros');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Auto-fill bank_name when country changes
    useEffect(() => {
        if (!config) return;
        const c = config.countries?.[form.country];
        if (c?.banks?.length && !c.banks.includes(form.bank_name)) {
            setForm(f => ({ ...f, bank_name: c.banks[0] }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.country, config]);

    const handleGotoSummary = async () => {
        const toCur = config.countries[form.country].currency;
        // Same-currency transfer: no conversion needed, build preview locally
        if (form.from_currency === toCur) {
            const amt = Number(form.amount);
            const feePct = config.fee_pct ?? 0.5;
            const feeAmount = Number((amt * (feePct / 100)).toFixed(2));
            setPreview({
                from_currency: form.from_currency,
                to_currency: toCur,
                amount_in: amt,
                rate: 1.0,
                fee_pct: feePct,
                fee_amount: feeAmount,
                gross_out: amt,
                amount_out: Number((amt - feeAmount).toFixed(2)),
                rate_at: new Date().toISOString(),
            });
            setStep(2);
            return;
        }
        try {
            const r = await api.post('/multi-currency/preview', {
                from_currency: form.from_currency,
                to_currency: toCur,
                amount: Number(form.amount),
            });
            setPreview(r.data);
            setStep(2);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo calcular el preview');
        }
    };

    const handleInitiate = async () => {
        setInitiating(true);
        try {
            const r = await api.post('/bank-withdrawal/initiate', {
                from_currency: form.from_currency,
                country: form.country,
                bank_name: form.bank_name,
                bank_holder: form.bank_holder,
                bank_account: form.bank_account,
                bank_swift: form.bank_swift || undefined,
                amount: Number(form.amount),
            });
            setInitiateResp(r.data);
            toast.success(`Código enviado a ${r.data.masked_email}`);
            setStep(3);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo iniciar la solicitud');
        } finally {
            setInitiating(false);
        }
    };

    const handleConfirmCode = async (code) => {
        setConfirming(true);
        try {
            await api.post(`/bank-withdrawal/${initiateResp.request_id}/confirm-code`, { code });
            toast.success('¡Retiro confirmado!');
            // Reset wizard
            setStep(1);
            setForm({ ...form, amount: '', bank_holder: '', bank_account: '', bank_swift: '' });
            setPreview(null);
            setInitiateResp(null);
            setTab('history');
            load();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Código inválido');
        } finally {
            setConfirming(false);
        }
    };

    return (
        <Layout>
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
                {/* Header */}
                <div>
                    <p className="text-[10.5px] uppercase tracking-[0.14em] text-[#7CB1E5] font-bold">Banking · Retiros</p>
                    <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1" data-testid="bank-wd-title">
                        Retiro a banco local
                    </h1>
                    <p className="text-slate-400 text-[13px] mt-1.5">
                        Convierte tu saldo multidivisa y recíbelo en tu cuenta bancaria local · confirmación por código
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 border-b border-white/10">
                    {[
                        { id: 'new', label: 'Nuevo retiro', icon: Send },
                        { id: 'history', label: 'Mis retiros', icon: Banknote, count: history.length },
                    ].map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`px-4 py-2.5 text-[12.5px] font-bold uppercase tracking-wider flex items-center gap-1.5 border-b-2 transition-colors ${
                                tab === t.id ? 'border-[#1973B8] text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                            data-testid={`wd-tab-${t.id}`}
                        >
                            <t.icon className="w-3.5 h-3.5" />
                            {t.label}
                            {t.count !== undefined && (
                                <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">{t.count}</span>
                            )}
                        </button>
                    ))}
                </div>

                {tab === 'new' && config && (
                    <Card className="bg-white border-slate-200 p-6">
                        <Stepper step={step} />
                        <AnimatePresence mode="wait">
                            {step === 1 && (
                                <motion.div key="s1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                                    <StepBankForm
                                        accounts={accounts}
                                        config={config}
                                        form={form}
                                        setForm={setForm}
                                        onNext={handleGotoSummary}
                                    />
                                </motion.div>
                            )}
                            {step === 2 && (
                                <motion.div key="s2" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                                    <StepSummary
                                        preview={preview}
                                        form={form}
                                        config={config}
                                        accounts={accounts}
                                        onBack={() => setStep(1)}
                                        onInitiate={handleInitiate}
                                        initiating={initiating}
                                    />
                                </motion.div>
                            )}
                            {step === 3 && initiateResp && (
                                <motion.div key="s3" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                                    <StepConfirm
                                        initiateResp={initiateResp}
                                        onConfirm={handleConfirmCode}
                                        confirming={confirming}
                                        onBack={() => { setStep(2); setInitiateResp(null); }}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </Card>
                )}

                {tab === 'history' && (
                    <div className="space-y-3">
                        {loading && <div className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>}
                        {!loading && history.length === 0 && (
                            <Card className="p-10 bg-white text-center">
                                <Banknote className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                                <p className="text-slate-500 text-[14px]">Aún no has realizado retiros bancarios.</p>
                                <Button onClick={() => setTab('new')} className="mt-4 bg-[#1973B8] hover:bg-[#1F89D8] text-white">
                                    Nuevo retiro
                                </Button>
                            </Card>
                        )}
                        {history.map(it => (
                            <HistoryItem key={it.id} item={it} config={config} onView={setDetailItem} />
                        ))}
                    </div>
                )}
            </div>

            <DetailModal item={detailItem} config={config} onClose={() => setDetailItem(null)} />
        </Layout>
    );
};

export default BankWithdrawalPage;
