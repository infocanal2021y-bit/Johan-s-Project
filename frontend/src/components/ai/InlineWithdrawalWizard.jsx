import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../lib/api';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import {
    ArrowLeft, ArrowRight, Loader2, CheckCircle2, ShieldCheck,
    AlertTriangle, Wallet, Building2, Mail, Hash, ChevronRight,
} from 'lucide-react';
import { BankTipsCard } from '../banks/BankTipsCard';


const fmtEUR = (n) => `€${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Conversational withdrawal wizard rendered inside the AI Assistant chat panel.
 *
 * Steps:
 *   0 eligibility   → fetch quick-context + bank-withdrawal/config, decide if user can proceed
 *   1 amount        → choose source currency + destination country + amount
 *   2 bank          → bank name, holder, account/IBAN, optional SWIFT
 *   3 confirm       → review summary, request 6-digit code by email
 *   4 code          → enter 6-digit code, finalise
 *   5 done          → success screen with reference
 */
export const InlineWithdrawalWizard = ({ onClose, onCompleted }) => {
    const [step, setStep] = useState(0);
    const [ctx, setCtx] = useState(null);
    const [cfg, setCfg] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const [form, setForm] = useState({
        from_currency: 'EUR',
        country: 'ES',
        amount: '',
        bank_name: '',
        bank_holder: '',
        bank_account: '',
        bank_swift: '',
    });
    const [request, setRequest] = useState(null);   // server response after initiate
    const [code, setCode] = useState('');
    const [final, setFinal] = useState(null);       // after confirm-code

    useEffect(() => {
        let alive = true;
        Promise.all([
            api.get('/ai-assistant/quick-context'),
            api.get('/bank-withdrawal/config'),
        ])
            .then(([cx, cf]) => {
                if (!alive) return;
                setCtx(cx.data);
                setCfg(cf.data);
                setLoading(false);
                // Skip eligibility step if everything OK
                if (cx.data?.has_withdrawable_funds && cx.data?.pending_tax_eur === 0 && !cx.data?.partial_unlock) {
                    setStep(1);
                }
            })
            .catch(() => {
                setError('No se pudo cargar la información de tu cuenta. Inténtalo de nuevo.');
                setLoading(false);
            });
        return () => { alive = false; };
    }, []);

    const countries = cfg?.countries || {};
    const country = countries[form.country];

    const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

    // ─── Step 1 → 2 validation ────────────────────────────────────
    const canProceedAmount = () => {
        const n = Number(form.amount);
        return n > 0 && form.from_currency && form.country;
    };
    const canProceedBank = () =>
        form.bank_name.trim() && form.bank_holder.trim() && form.bank_account.trim().length >= 6;

    // ─── Initiate (step 3 → 4) ────────────────────────────────────
    const submitInitiate = async () => {
        setSubmitting(true);
        setError(null);
        try {
            const r = await api.post('/bank-withdrawal/initiate', {
                from_currency: form.from_currency,
                country: form.country,
                amount: Number(form.amount),
                bank_name: form.bank_name.trim(),
                bank_holder: form.bank_holder.trim(),
                bank_account: form.bank_account.trim(),
                bank_swift: form.bank_swift.trim() || undefined,
            });
            setRequest(r.data);
            setStep(4);
            toast.success('Código enviado a tu correo');
        } catch (err) {
            setError(err.response?.data?.detail || 'No se pudo iniciar el retiro');
        } finally {
            setSubmitting(false);
        }
    };

    // ─── Confirm code (step 4 → 5) ────────────────────────────────
    const submitConfirm = async () => {
        if (code.length !== 6) {
            setError('El código debe tener 6 dígitos');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const r = await api.post(`/bank-withdrawal/${request.request_id}/confirm-code`, { code });
            setFinal(r.data);
            setStep(5);
            toast.success('Retiro confirmado · referencia generada');
            onCompleted?.(r.data);
        } catch (err) {
            setError(err.response?.data?.detail || 'No se pudo confirmar el código');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="py-12 text-center" data-testid="ai-wizard-loading">
                <Loader2 className="w-6 h-6 mx-auto animate-spin text-cyan-400" />
                <p className="text-slate-400 text-[11.5px] mt-3">Cargando tu información…</p>
            </div>
        );
    }

    return (
        <div className="py-1" data-testid="ai-withdrawal-wizard">
            {/* Header */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white p-1 -ml-1"
                        data-testid="ai-wizard-back-to-chat"
                        aria-label="Volver al chat"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                    <div>
                        <p className="text-[9.5px] uppercase tracking-wider text-cyan-300 font-bold">Retiro asistido</p>
                        <p className="text-white text-[12.5px] font-bold leading-tight">Paso {Math.min(step + 1, 5)} de 5</p>
                    </div>
                </div>
                <div className="flex gap-0.5">
                    {[0, 1, 2, 3, 4].map((s) => (
                        <div
                            key={s}
                            className={`h-1 w-5 rounded-full transition-colors ${
                                s < step ? 'bg-emerald-500'
                                    : s === step ? 'bg-cyan-400'
                                        : 'bg-slate-700'
                            }`}
                        />
                    ))}
                </div>
            </div>

            {/* Error inline */}
            {error && (
                <div className="mb-3 px-3 py-2 rounded-md bg-rose-500/10 ring-1 ring-rose-500/30 text-rose-300 text-[11px] flex items-start gap-1.5" data-testid="ai-wizard-error">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* ── STEP 0 — eligibility blockers ─────────────────── */}
            <AnimatePresence mode="wait">
                {step === 0 && (
                    <motion.div key="s0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <p className="text-slate-300 text-[12.5px] mb-3 leading-relaxed">
                            Antes de continuar revisemos el estado de tu cuenta:
                        </p>
                        <ul className="space-y-1.5 mb-4" data-testid="ai-wizard-eligibility-list">
                            <EligibilityRow
                                ok={ctx?.has_withdrawable_funds}
                                label="Fondos disponibles"
                                value={fmtEUR(ctx?.total_eur)}
                            />
                            <EligibilityRow
                                ok={(ctx?.pending_tax_eur || 0) === 0}
                                label="Impuestos al día"
                                value={(ctx?.pending_tax_eur || 0) === 0 ? 'Sin pendientes' : `Falta ${fmtEUR(ctx?.pending_tax_eur)}`}
                            />
                            <EligibilityRow
                                ok={!ctx?.partial_unlock}
                                label="Sin liberación parcial pendiente"
                                value={ctx?.partial_unlock ? `Estado: ${ctx.partial_unlock.status}` : 'OK'}
                            />
                        </ul>
                        <Button
                            disabled={!ctx?.has_withdrawable_funds}
                            onClick={() => setStep(1)}
                            className="w-full bg-[#1973B8] hover:bg-[#1F89D8] text-white font-bold text-[12px]"
                            data-testid="ai-wizard-start"
                        >
                            {ctx?.has_withdrawable_funds ? 'Continuar' : 'Sin saldo suficiente'}
                            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                        </Button>
                    </motion.div>
                )}

                {/* ── STEP 1 — amount + currency + country ────────── */}
                {step === 1 && (
                    <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Field label="Moneda origen">
                            <select
                                value={form.from_currency}
                                onChange={(e) => set('from_currency', e.target.value)}
                                className="w-full h-9 px-2 rounded-md bg-slate-900 ring-1 ring-slate-700 focus:ring-cyan-500 text-white text-[12px] outline-none"
                                data-testid="ai-wizard-from-currency"
                            >
                                {['EUR', 'USD', 'GBP'].map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </Field>
                        <Field label="País destino">
                            <select
                                value={form.country}
                                onChange={(e) => set('country', e.target.value)}
                                className="w-full h-9 px-2 rounded-md bg-slate-900 ring-1 ring-slate-700 focus:ring-cyan-500 text-white text-[12px] outline-none"
                                data-testid="ai-wizard-country"
                            >
                                {Object.entries(countries).map(([code, c]) => (
                                    <option key={code} value={code}>{c.flag} {c.name} ({c.currency})</option>
                                ))}
                            </select>
                        </Field>
                        <Field label={`Monto en ${form.from_currency}`}>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.amount}
                                onChange={(e) => set('amount', e.target.value)}
                                placeholder="0.00"
                                className="w-full h-9 px-2 rounded-md bg-slate-900 ring-1 ring-slate-700 focus:ring-cyan-500 text-white text-[13px] font-bold outline-none"
                                data-testid="ai-wizard-amount"
                                autoFocus
                            />
                            <p className="text-[10px] text-slate-500 mt-1">
                                Disponible: <strong className="text-slate-300">{fmtEUR(ctx?.total_eur)}</strong>
                            </p>
                        </Field>
                        <WizardNav onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!canProceedAmount()} />
                    </motion.div>
                )}

                {/* ── STEP 2 — bank details ─────────────────────────── */}
                {step === 2 && (
                    <motion.div key="s2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Field label="Banco">
                            <select
                                value={form.bank_name}
                                onChange={(e) => set('bank_name', e.target.value)}
                                className="w-full h-9 px-2 rounded-md bg-slate-900 ring-1 ring-slate-700 focus:ring-cyan-500 text-white text-[12px] outline-none"
                                data-testid="ai-wizard-bank-name"
                            >
                                <option value="">— Selecciona banco —</option>
                                {(country?.banks || []).map((b) => <option key={b} value={b}>{b}</option>)}
                                <option value="Otro banco">Otro banco…</option>
                            </select>
                        </Field>

                        {/* Bank-specific tips — only shown for Spanish banks we have data on */}
                        {form.country === 'ES' && form.bank_name && form.bank_name !== 'Otro banco' && (
                            <BankTipsCard bankName={form.bank_name} />
                        )}
                        <Field label="Titular de la cuenta">
                            <input
                                type="text"
                                value={form.bank_holder}
                                onChange={(e) => set('bank_holder', e.target.value)}
                                placeholder="Nombre completo"
                                className="w-full h-9 px-2 rounded-md bg-slate-900 ring-1 ring-slate-700 focus:ring-cyan-500 text-white text-[12px] outline-none"
                                data-testid="ai-wizard-bank-holder"
                            />
                        </Field>
                        <Field label="IBAN / Número de cuenta">
                            <input
                                type="text"
                                value={form.bank_account}
                                onChange={(e) => set('bank_account', e.target.value.toUpperCase())}
                                placeholder={form.country === 'ES' ? 'ES00 0000 0000 0000 0000 0000' : 'IBAN o cuenta'}
                                className="w-full h-9 px-2 rounded-md bg-slate-900 ring-1 ring-slate-700 focus:ring-cyan-500 text-white font-mono text-[11.5px] outline-none"
                                data-testid="ai-wizard-bank-account"
                            />
                        </Field>
                        <Field label="SWIFT / BIC (opcional)">
                            <input
                                type="text"
                                value={form.bank_swift}
                                onChange={(e) => set('bank_swift', e.target.value.toUpperCase())}
                                placeholder="BBVAESMM"
                                className="w-full h-9 px-2 rounded-md bg-slate-900 ring-1 ring-slate-700 focus:ring-cyan-500 text-white font-mono text-[11.5px] outline-none"
                                data-testid="ai-wizard-bank-swift"
                            />
                        </Field>
                        <WizardNav onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!canProceedBank()} />
                    </motion.div>
                )}

                {/* ── STEP 3 — review + send code ──────────────────── */}
                {step === 3 && (
                    <motion.div key="s3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <p className="text-slate-300 text-[12px] mb-2">Revisa los detalles antes de enviar:</p>
                        <div className="rounded-lg bg-slate-900/70 ring-1 ring-slate-800 p-3 space-y-1.5 text-[11.5px]" data-testid="ai-wizard-summary">
                            <SummaryRow label="Monto" value={`${Number(form.amount).toLocaleString('es-ES')} ${form.from_currency}`} />
                            <SummaryRow label="Destino" value={`${country?.flag} ${country?.name} · ${country?.currency}`} />
                            <SummaryRow label="Banco" value={form.bank_name} />
                            <SummaryRow label="Titular" value={form.bank_holder} />
                            <SummaryRow label="IBAN/Cuenta" value={form.bank_account} mono />
                            {form.bank_swift && <SummaryRow label="SWIFT" value={form.bank_swift} mono />}
                            <p className="text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-800">
                                Comisión: {cfg?.fee_pct}% · Te enviaremos un código de 6 dígitos por email para confirmar.
                            </p>
                        </div>
                        <WizardNav
                            onBack={() => setStep(2)}
                            onNext={submitInitiate}
                            nextLabel={submitting ? null : 'Enviar código de verificación'}
                            nextDisabled={submitting}
                            loading={submitting}
                        />
                    </motion.div>
                )}

                {/* ── STEP 4 — enter 6-digit code ─────────────────── */}
                {step === 4 && request && (
                    <motion.div key="s4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="rounded-lg bg-cyan-500/10 ring-1 ring-cyan-500/30 p-3 mb-3 flex items-start gap-2" data-testid="ai-wizard-code-sent">
                            <Mail className="w-4 h-4 text-cyan-300 flex-shrink-0 mt-0.5" />
                            <p className="text-cyan-200 text-[11.5px] leading-relaxed">
                                Código enviado a <strong className="text-white">{request.masked_email || 'tu email'}</strong>.
                                Válido por 15 minutos.
                            </p>
                        </div>
                        <Field label="Código de 6 dígitos">
                            <input
                                type="text"
                                inputMode="numeric"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="000000"
                                maxLength={6}
                                className="w-full h-11 px-3 rounded-md bg-slate-900 ring-1 ring-slate-700 focus:ring-cyan-500 text-white text-center font-mono text-xl tracking-[0.5em] outline-none"
                                data-testid="ai-wizard-code-input"
                                autoFocus
                            />
                        </Field>
                        <WizardNav
                            onBack={null}
                            onNext={submitConfirm}
                            nextLabel={submitting ? null : 'Confirmar retiro'}
                            nextDisabled={code.length !== 6 || submitting}
                            loading={submitting}
                        />
                    </motion.div>
                )}

                {/* ── STEP 5 — success ─────────────────────────────── */}
                {step === 5 && final && (
                    <motion.div key="s5" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-center py-2">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', damping: 12 }}
                            className="w-14 h-14 rounded-full bg-emerald-500/20 ring-2 ring-emerald-400/50 mx-auto flex items-center justify-center mb-3"
                        >
                            <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                        </motion.div>
                        <p className="text-white font-bold text-[14px]">¡Retiro confirmado!</p>
                        <p className="text-slate-400 text-[11.5px] mt-1">Referencia:</p>
                        <p className="text-cyan-300 font-mono font-bold text-[13px]">{final.reference}</p>
                        <div className="mt-4 p-3 rounded-lg bg-slate-900/60 ring-1 ring-slate-800 text-left text-[11px] space-y-1" data-testid="ai-wizard-success">
                            <SummaryRow label="Estado" value="Recibido — en cola" />
                            <SummaryRow label="Tiempo estimado" value="2-5 días hábiles" />
                            <SummaryRow label="Te notificaremos" value="Por email en cada cambio" />
                        </div>
                        <Button
                            onClick={onClose}
                            className="w-full mt-4 bg-[#1973B8] hover:bg-[#1F89D8] text-white font-bold text-[12px]"
                            data-testid="ai-wizard-done"
                        >
                            Volver al chat <ChevronRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};


// ─── Sub-components ──────────────────────────────────────────────
const Field = ({ label, children }) => (
    <label className="block mb-2.5">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">
            {label}
        </span>
        {children}
    </label>
);

const SummaryRow = ({ label, value, mono }) => (
    <div className="flex items-center justify-between gap-2">
        <span className="text-slate-500">{label}</span>
        <span className={`text-white font-semibold ${mono ? 'font-mono text-[10.5px]' : ''} text-right truncate`}>
            {value || '—'}
        </span>
    </div>
);

const EligibilityRow = ({ ok, label, value }) => (
    <li
        className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md bg-slate-900/60 ring-1 ring-slate-800"
        data-testid={`ai-wizard-eligibility-${ok ? 'ok' : 'fail'}`}
    >
        <div className="flex items-center gap-1.5">
            {ok
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
            <span className="text-[11.5px] text-slate-200">{label}</span>
        </div>
        <span className={`text-[11px] font-bold ${ok ? 'text-emerald-300' : 'text-amber-300'}`}>{value}</span>
    </li>
);

const WizardNav = ({ onBack, onNext, nextLabel = 'Continuar', nextDisabled, loading }) => (
    <div className="flex items-center gap-2 mt-3">
        {onBack && (
            <Button
                variant="outline"
                onClick={onBack}
                className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 h-9 text-[11.5px]"
                data-testid="ai-wizard-back"
            >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Atrás
            </Button>
        )}
        <Button
            onClick={onNext}
            disabled={nextDisabled}
            className={`${onBack ? 'flex-1' : 'w-full'} bg-[#1973B8] hover:bg-[#1F89D8] text-white font-bold h-9 text-[11.5px]`}
            data-testid="ai-wizard-next"
        >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : nextLabel}
            {!loading && nextLabel && <ArrowRight className="w-3.5 h-3.5 ml-1" />}
        </Button>
    </div>
);


export default InlineWithdrawalWizard;
