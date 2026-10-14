import { useState } from 'react';
import { ArrowRight, Loader2, Mail, RotateCcw, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';

const fmt = (n, c) => `${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;

export const PayPalWithdrawForm = ({ accounts, config, onDone }) => {
    const [currency, setCurrency] = useState('EUR');
    const [amount, setAmount] = useState('');
    const [step, setStep] = useState('form'); // form | code | done
    const [draft, setDraft] = useState(null);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    const acc = accounts.find((a) => a.currency === currency);
    const available = acc ? Number(acc.balance) - Number(acc.pending || 0) : 0;
    const amt = Number(amount);
    const canInit = !!config?.account && amt >= config.min_amount && amt <= available + 1e-9 && !busy;

    const initiate = async () => {
        setBusy(true);
        try {
            const { data } = await api.post('/paypal-withdrawal/initiate', { amount: amt, currency });
            setDraft(data); setStep('code');
            toast[data.email_sent ? 'success' : 'warning'](data.email_sent ? `Código enviado a ${data.masked_email}` : 'No se pudo enviar el código por correo');
        } catch (e) { toast.error(e.response?.data?.detail || 'No se pudo iniciar el retiro'); }
        finally { setBusy(false); }
    };
    const resend = async () => {
        try { const { data } = await api.post(`/paypal-withdrawal/${draft.request_id}/resend-code`); toast.success(`Nuevo código enviado a ${data.masked_email}`); }
        catch (e) { toast.error(e.response?.data?.detail || 'No se pudo reenviar'); }
    };
    const confirm = async () => {
        setBusy(true);
        try {
            const { data } = await api.post(`/paypal-withdrawal/${draft.request_id}/confirm-code`, { code });
            setResult(data); setStep('done'); onDone?.();
        } catch (e) { toast.error(e.response?.data?.detail || 'Código incorrecto'); }
        finally { setBusy(false); }
    };
    const reset = () => { setStep('form'); setDraft(null); setCode(''); setAmount(''); setResult(null); };

    if (step === 'done') {
        return (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center space-y-2" data-testid="paypal-success">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <p className="text-white font-bold text-lg">Retiro solicitado</p>
                <p className="text-slate-300 text-sm">Referencia <span className="font-mono text-cyan-300" data-testid="paypal-success-reference">{result.request.reference}</span>{result.case_code && <> · Caso <span className="font-mono text-cyan-300">{result.case_code}</span></>}</p>
                <p className="text-slate-400 text-xs">{fmt(result.request.net_amount, result.request.currency)} a {result.request.paypal_email} · Tiempo estimado: {config.eta}</p>
                <button onClick={reset} className="mt-2 h-9 px-4 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold" data-testid="paypal-new-request">Nuevo retiro</button>
            </div>
        );
    }

    if (step === 'code') {
        return (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4" data-testid="paypal-code-step">
                <div className="flex items-center gap-3"><Mail className="w-5 h-5 text-[#009cde]" /><div><p className="text-white font-semibold text-sm">Confirma con el código enviado a {draft.masked_email}</p><p className="text-slate-400 text-xs">Caduca en 15 minutos · referencia {draft.reference}</p></div></div>
                <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3 text-xs text-slate-300 flex justify-between"><span>{fmt(draft.preview.amount, draft.preview.currency)} → PayPal {draft.preview.paypal_email}</span><span className="text-emerald-300">Sin comisión</span></div>
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" inputMode="numeric"
                    className="h-14 w-full text-center tracking-[0.6em] font-mono text-2xl rounded-xl bg-slate-950/70 border border-slate-800 text-white focus:outline-none focus:border-[#009cde]/70" data-testid="paypal-code-input" />
                <div className="flex items-center justify-between gap-2">
                    <button onClick={resend} className="text-xs text-slate-400 hover:text-white flex items-center gap-1" data-testid="paypal-resend-code"><RotateCcw className="w-3.5 h-3.5" /> Reenviar código</button>
                    <div className="flex gap-2">
                        <button onClick={reset} className="h-10 px-3 rounded-lg border border-slate-700 text-slate-300 text-xs font-semibold" data-testid="paypal-code-cancel">Cancelar</button>
                        <button onClick={confirm} disabled={code.length !== 6 || busy} className="h-10 px-5 rounded-lg bg-[#009cde] hover:bg-[#0088c4] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50" data-testid="paypal-code-confirm">
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Confirmar retiro
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4" data-testid="paypal-withdraw-form">
            <p className="text-white font-semibold text-sm">Solicitar retiro a PayPal</p>
            <div className="grid grid-cols-2 gap-2">
                {config?.currencies.map((c) => {
                    const a = accounts.find((x) => x.currency === c);
                    return (
                        <button key={c} onClick={() => setCurrency(c)} data-testid={`paypal-currency-${c}`}
                            className={`rounded-xl border p-3 text-left transition-colors ${currency === c ? 'border-[#009cde]/60 bg-[#009cde]/10' : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'}`}>
                            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{a?.flag} {c}</p>
                            <p className="text-white font-mono text-sm mt-0.5">{fmt(a ? Number(a.balance) - Number(a.pending || 0) : 0, '')}</p>
                            <p className="text-slate-500 text-[10px]">disponible</p>
                        </button>
                    );
                })}
            </div>
            <div>
                <div className="flex items-center justify-between mb-1"><label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Importe</label><button onClick={() => setAmount(String(Math.max(0, Math.floor(available * 100) / 100)))} className="text-[10px] text-[#009cde] hover:underline" data-testid="paypal-amount-max">Usar máximo</button></div>
                <div className="relative"><input value={amount} onChange={(e) => setAmount(e.target.value.replace(',', '.'))} placeholder={`Mínimo ${config?.min_amount || 50}`} inputMode="decimal"
                    className="h-12 w-full px-4 pr-16 rounded-xl bg-slate-950/70 border border-slate-800 text-white font-mono text-lg focus:outline-none focus:border-[#009cde]/70" data-testid="paypal-amount-input" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">{currency}</span></div>
                {amt > 0 && amt < (config?.min_amount || 50) && <p className="text-[11px] text-amber-300 mt-1" data-testid="paypal-amount-error">El mínimo es {config.min_amount} {currency}</p>}
                {amt > available + 1e-9 && <p className="text-[11px] text-rose-300 mt-1" data-testid="paypal-amount-error">Saldo insuficiente</p>}
            </div>
            <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3 text-xs space-y-1">
                <div className="flex justify-between text-slate-400"><span>Destino</span><span className="text-white font-mono">{config?.account?.email || 'Vincula tu cuenta PayPal'}</span></div>
                <div className="flex justify-between text-slate-400"><span>Comisión</span><span className="text-emerald-300">Sin comisión</span></div>
                <div className="flex justify-between text-slate-400"><span>Recibirás</span><span className="text-white font-semibold" data-testid="paypal-net-amount">{fmt(amt || 0, currency)}</span></div>
                <div className="flex justify-between text-slate-400"><span>Tiempo estimado</span><span className="text-white">{config?.eta}</span></div>
            </div>
            <button onClick={initiate} disabled={!canInit} className="h-11 w-full rounded-xl bg-[#009cde] hover:bg-[#0088c4] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed" data-testid="paypal-initiate">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Continuar · enviar código
            </button>
        </div>
    );
};
