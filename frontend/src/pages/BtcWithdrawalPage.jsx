import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import api from '../lib/api';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import {
    Bitcoin, Loader2, CheckCircle2, XCircle, AlertTriangle, Copy, Check,
    ExternalLink, Send, Clock, Info, RefreshCw, ShieldCheck,
} from 'lucide-react';

const HAPPY_PATH = ['solicitado', 'pendiente_abono', 'pendiente_validacion', 'en_revision',
    'aprobado', 'procesando', 'enviado', 'completado'];

const fmtEur = (n) => `€${(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
const fmtBtc = (n) => `${(n || 0).toFixed(8)} BTC`;
const fmtDate = (d) => d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const CopyBtn = ({ text, testId }) => {
    const [copied, setCopied] = useState(false);
    return (
        <button type="button" data-testid={testId}
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors flex-shrink-0">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
    );
};

/* ── Línea de tiempo de estados ── */
const StatusTimeline = ({ request }) => {
    const reached = new Set((request.status_history || []).map((h) => h.status));
    const idx = HAPPY_PATH.indexOf(request.status);
    return (
        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4" data-testid="btc-status-timeline">
            <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500 font-semibold mb-3">Estado del retiro</p>
            <div className="space-y-2">
                {HAPPY_PATH.map((s, i) => {
                    const done = reached.has(s) && (idx === -1 || i <= idx);
                    const current = s === request.status;
                    return (
                        <div key={s} className="flex items-center gap-2.5">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center border flex-shrink-0 ${
                                current ? 'bg-cyan-500/20 border-cyan-500/60' : done ? 'bg-emerald-500/15 border-emerald-500/40' : 'bg-slate-800 border-slate-700'
                            }`}>
                                {done && !current ? <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    : current ? <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                        : <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />}
                            </div>
                            <span className={`text-xs ${current ? 'text-cyan-300 font-bold' : done ? 'text-slate-300' : 'text-slate-600'}`}>
                                {{ solicitado: 'Solicitado', pendiente_abono: 'Pendiente de abono', pendiente_validacion: 'Pendiente de validación', en_revision: 'En revisión', aprobado: 'Aprobado', procesando: 'Procesando', enviado: 'Enviado', completado: 'Completado' }[s]}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

/* ── Panel de abono €4,850 + envío de comprobante ── */
const AbonoPanel = ({ request, onSubmitted }) => {
    const [info, setInfo] = useState(null);
    const [selected, setSelected] = useState(null);
    const [message, setMessage] = useState('');
    const [feeTxid, setFeeTxid] = useState('');
    const [sending, setSending] = useState(false);

    useEffect(() => {
        api.get('/btc-withdrawal/payment-info').then((r) => {
            setInfo(r.data);
            const first = r.data.btc_addresses?.[0];
            if (first) setSelected({ coin: 'BTC', address: first.address, network: first.network, label: first.wallet_label });
        }).catch(() => {});
    }, []);

    const submit = async () => {
        if (!message.trim() && !feeTxid.trim()) { toast.error('Incluya la información o el TXID del abono'); return; }
        setSending(true);
        try {
            const { data } = await api.post(`/btc-withdrawal/${request.id}/submit-info`, {
                message, fee_txid: feeTxid, coin_used: selected?.coin, address_used: selected?.address,
            });
            toast.success('Información enviada: su abono quedó pendiente de validación');
            onSubmitted(data.request);
        } catch (e) { toast.error(e.response?.data?.detail || 'Error al enviar'); }
        finally { setSending(false); }
    };

    if (!info) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>;

    const options = [
        ...info.btc_addresses.map((a) => ({ coin: 'BTC', address: a.address, network: a.network, label: a.wallet_label })),
        ...info.other_coins.map((c) => ({ coin: c.coin, address: c.address, network: c.network, label: c.coin })),
    ];

    return (
        <div className="rounded-xl bg-slate-900/70 border border-amber-500/30 p-5 space-y-4" data-testid="btc-abono-panel">
            <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="text-white font-bold text-base">Abono requerido: {fmtEur(info.fee_eur)}</p>
                    <p className="text-amber-300/90 text-xs mt-1 font-semibold">{info.concept}</p>
                    <p className="text-slate-400 text-xs mt-2 leading-relaxed">{info.conditions}</p>
                </div>
            </div>
            <Button className="w-full bg-[#635BFF] hover:bg-[#7a73ff] text-white font-bold h-10" data-testid="btc-pay-card-btn"
                onClick={async () => {
                    try {
                        const r = await api.post('/service-payments/checkout', {
                            lookup_key: 'abono_btc_eur', origin_url: window.location.origin,
                            context_kind: 'btc_withdrawal', context_request_id: request.id,
                        });
                        window.location.href = r.data.checkout_url;
                    } catch (e) { toast.error(e.response?.data?.detail || 'No se pudo iniciar el pago'); }
                }}>
                💳 Pagar abono con tarjeta ({fmtEur(info.fee_eur)}) — se valida automáticamente
            </Button>
            <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Pagar con</p>
                <div className="flex flex-wrap gap-1.5">
                    {options.map((o) => (
                        <button key={`${o.coin}-${o.address}`} type="button" onClick={() => setSelected(o)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                                selected?.address === o.address ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`} data-testid={`abono-coin-${o.coin}-${o.address.slice(0, 6)}`}>
                            {o.coin}{o.coin === 'BTC' && o.label !== 'BTC' ? ` · ${o.label}` : ''}
                        </button>
                    ))}
                </div>
            </div>
            {selected && (
                <div className="flex flex-col sm:flex-row items-center gap-4 rounded-xl bg-slate-950/60 border border-slate-800 p-4">
                    <div className="bg-white p-2.5 rounded-xl flex-shrink-0" data-testid="btc-abono-qr">
                        <QRCodeSVG value={selected.address} size={120} level="H" />
                    </div>
                    <div className="flex-1 min-w-0 w-full">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Red: <span className="text-emerald-400">{selected.network || 'Bitcoin'}</span> — envíe únicamente {selected.coin} por esta red</p>
                        <div className="flex items-center gap-2 mt-2">
                            <p className="text-[11.5px] text-white font-mono break-all" data-testid="btc-abono-address">{selected.address}</p>
                            <CopyBtn text={selected.address} testId="btc-abono-copy" />
                        </div>
                    </div>
                </div>
            )}
            <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Informar el abono realizado</p>
                <input value={feeTxid} onChange={(e) => setFeeTxid(e.target.value)}
                    placeholder="TXID / hash de la transacción (opcional)"
                    className="w-full h-10 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50"
                    data-testid="btc-fee-txid-input" />
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
                    placeholder="Información del pago: monto enviado, moneda, fecha, wallet de origen..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 resize-none"
                    data-testid="btc-fee-message-input" />
                <Button onClick={submit} disabled={sending}
                    className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold" data-testid="btc-submit-info-btn">
                    {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    Enviar información para validación
                </Button>
            </div>
        </div>
    );
};

/* ── Vista de una solicitud existente ── */
const RequestView = ({ request, onUpdate }) => {
    const specialBanner = {
        validacion_rechazada: { color: 'red', icon: XCircle, title: 'Validación rechazada', text: request.rejection_reason },
        accion_requerida: { color: 'amber', icon: AlertTriangle, title: 'Acción requerida por el usuario', text: request.action_required_message },
        retiro_rechazado: { color: 'red', icon: XCircle, title: 'Retiro rechazado', text: request.rejection_reason },
    }[request.status];
    const showAbono = ['pendiente_abono', 'accion_requerida', 'validacion_rechazada'].includes(request.status);
    const sent = ['enviado', 'completado'].includes(request.status);

    return (
        <div className="space-y-4" data-testid="btc-request-view">
            <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Retiro Bitcoin</p>
                        <p className="text-2xl font-bold text-white font-mono">{fmtEur(request.amount_eur)}</p>
                        <p className="text-slate-400 text-xs mt-1">≈ {fmtBtc(request.quote?.net_btc)} neto estimado · destino {request.btc_address_masked}</p>
                    </div>
                    <span className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold text-cyan-300" data-testid="btc-request-status">
                        {request.status_label}
                    </span>
                </div>
            </div>

            {specialBanner && (
                <div className={`rounded-xl border p-4 flex items-start gap-3 ${
                    specialBanner.color === 'red' ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'
                }`} data-testid={`btc-banner-${request.status}`}>
                    <specialBanner.icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${specialBanner.color === 'red' ? 'text-red-400' : 'text-amber-400'}`} />
                    <div>
                        <p className={`font-bold text-sm ${specialBanner.color === 'red' ? 'text-red-300' : 'text-amber-300'}`}>{specialBanner.title}</p>
                        {specialBanner.text && <p className="text-slate-300 text-xs mt-1">{specialBanner.text}</p>}
                        {request.status === 'accion_requerida' && (
                            <p className="text-slate-400 text-[11px] mt-2">Complete el proceso nuevamente enviando la información solicitada más abajo.</p>
                        )}
                    </div>
                </div>
            )}

            {sent && (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-5 space-y-3" data-testid="btc-sent-summary">
                    <p className="text-emerald-300 font-bold text-sm flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> BTC enviado a su billetera</p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div><p className="text-slate-500 uppercase text-[9px] font-semibold">Monto retirado</p><p className="text-white font-mono mt-0.5">{fmtEur(request.amount_eur)}</p></div>
                        <div><p className="text-slate-500 uppercase text-[9px] font-semibold">BTC enviado</p><p className="text-emerald-400 font-mono font-bold mt-0.5" data-testid="btc-sent-amount">{fmtBtc(request.btc_sent)}</p></div>
                        <div><p className="text-slate-500 uppercase text-[9px] font-semibold">Dirección</p><p className="text-white font-mono mt-0.5" data-testid="btc-sent-address">{request.btc_address_masked}</p></div>
                        <div><p className="text-slate-500 uppercase text-[9px] font-semibold">Fecha</p><p className="text-white mt-0.5">{fmtDate(request.sent_at)}</p></div>
                    </div>
                    {request.txid && (
                        <a href={request.txid_explorer_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-lg bg-slate-950/60 border border-slate-800 p-3 hover:border-emerald-500/40 transition-colors group"
                            data-testid="btc-txid-link">
                            <div className="flex-1 min-w-0">
                                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">TXID — verificar en explorador público</p>
                                <p className="text-[11px] text-emerald-400 font-mono break-all mt-0.5">{request.txid}</p>
                            </div>
                            <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 flex-shrink-0" />
                        </a>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <StatusTimeline request={request} />
                <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 text-xs space-y-2.5">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500 font-semibold">Detalle de la solicitud</p>
                    <div className="flex justify-between"><span className="text-slate-500">Dirección destino</span><span className="text-white font-mono">{request.btc_address_masked}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Tipo</span><span className="text-slate-300">{request.address_type_label}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Cotización EUR/BTC</span><span className="text-slate-300 font-mono">{fmtEur(request.quote?.btc_rate_eur)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Comisión de red est.</span><span className="text-slate-300 font-mono">{fmtBtc(request.quote?.network_fee_btc)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">BTC neto estimado</span><span className="text-emerald-400 font-mono font-bold">{fmtBtc(request.quote?.net_btc)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Solicitado</span><span className="text-slate-300">{fmtDate(request.created_at)}</span></div>
                </div>
            </div>

            {showAbono && <AbonoPanel request={request} onSubmitted={onUpdate} />}
        </div>
    );
};

/* ── Formulario de nueva solicitud ── */
const maskAddr = (a) => (a && a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a || '');

const SummaryLine = ({ label, value, valueClass = 'text-white', mono, testId }) => (
    <div className="flex justify-between items-center gap-3">
        <span className="text-slate-500">{label}</span>
        <span className={`font-semibold ${mono ? 'font-mono' : ''} ${valueClass}`} data-testid={testId}>{value}</span>
    </div>
);

const NewRequestForm = ({ onCreated }) => {
    const [amount, setAmount] = useState('');
    const [address, setAddress] = useState('');
    const [validation, setValidation] = useState(null);
    const [validating, setValidating] = useState(false);
    const [quote, setQuote] = useState(null);
    const [confirmed, setConfirmed] = useState(false);
    const [creating, setCreating] = useState(false);
    const [feeInfo, setFeeInfo] = useState(null);
    const [wallets, setWallets] = useState([]);

    useEffect(() => {
        api.get('/btc-wallets').then((r) => setWallets(r.data.wallets || [])).catch(() => {});
    }, []);

    useEffect(() => {
        setValidation(null); setConfirmed(false);
        const a = address.trim();
        if (a.length < 26) return;
        setValidating(true);
        const t = setTimeout(() => {
            api.get('/btc/validate-address', { params: { address: a } })
                .then((r) => setValidation(r.data)).catch(() => setValidation(null))
                .finally(() => setValidating(false));
        }, 500);
        return () => { clearTimeout(t); setValidating(false); };
    }, [address]);

    useEffect(() => {
        setQuote(null);
        const n = parseFloat(amount);
        if (!n || n <= 0) return;
        const t = setTimeout(() => {
            api.get('/btc-withdrawal/quote', { params: { amount_eur: n } })
                .then((r) => setQuote(r.data)).catch(() => {});
        }, 500);
        return () => clearTimeout(t);
    }, [amount]);

    useEffect(() => {
        if (confirmed && !feeInfo) {
            api.get('/btc-withdrawal/payment-info').then((r) => setFeeInfo(r.data)).catch(() => {});
        }
    }, [confirmed, feeInfo]);

    const create = async () => {
        setCreating(true);
        try {
            const { data } = await api.post('/btc-withdrawal/initiate', {
                amount_eur: parseFloat(amount), btc_address: address.trim(), address_confirmed: true,
            });
            toast.success('Solicitud de retiro Bitcoin creada');
            onCreated(data.request);
        } catch (e) { toast.error(e.response?.data?.detail || 'Error al crear la solicitud'); }
        finally { setCreating(false); }
    };

    return (
        <div className="space-y-4" data-testid="btc-new-request-form">
            <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-5 space-y-4">
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Monto a retirar (EUR)</label>
                    <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full h-11 px-3 mt-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-lg font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50"
                        data-testid="btc-amount-input" />
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Dirección Bitcoin de destino</label>
                    <input value={address} onChange={(e) => setAddress(e.target.value)}
                        placeholder="1..., 3..., bc1q... o bc1p..."
                        className="w-full h-11 px-3 mt-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50"
                        data-testid="btc-address-input" />
                    {validating && <p className="text-slate-500 text-xs mt-1.5 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Validando dirección...</p>}
                    {validation && validation.valid && (
                        <div className="mt-2" data-testid="btc-address-valid">
                            <p className="text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Dirección Bitcoin válida · {validation.type_label}
                            </p>
                            <p className="text-slate-500 text-[10.5px] mt-1 flex items-start gap-1"><Info className="w-3 h-3 flex-shrink-0 mt-0.5" /> {validation.note}</p>
                        </div>
                    )}
                    {validation && !validation.valid && (
                        <p className="text-red-400 text-xs font-semibold mt-2 flex items-center gap-1.5" data-testid="btc-address-invalid">
                            <XCircle className="w-3.5 h-3.5" /> {validation.reason}
                        </p>
                    )}
                </div>
                {quote && (
                    <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3.5 space-y-2 text-xs" data-testid="btc-quote-panel">
                        <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5"><RefreshCw className="w-3 h-3" /> Conversión estimada (en vivo)</p>
                        <div className="flex justify-between"><span className="text-slate-500">Cotización EUR/BTC</span><span className="text-white font-mono">{fmtEur(quote.btc_rate_eur)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Equivalente BTC</span><span className="text-white font-mono">{fmtBtc(quote.amount_btc)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Comisión de red estimada</span><span className="text-amber-300 font-mono">− {fmtBtc(quote.network_fee_btc)}</span></div>
                        <div className="flex justify-between border-t border-slate-800 pt-2"><span className="text-slate-300 font-semibold">BTC neto estimado a recibir</span><span className="text-emerald-400 font-mono font-bold" data-testid="btc-net-estimate">{fmtBtc(quote.net_btc)}</span></div>
                    </div>
                )}
                {validation?.valid && quote && (
                    <label className="flex items-start gap-2.5 cursor-pointer select-none" data-testid="btc-confirm-checkbox-label">
                        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
                            className="mt-0.5 w-4 h-4 accent-amber-500" data-testid="btc-confirm-checkbox" />
                        <span className="text-slate-300 text-xs leading-relaxed">
                            Confirmo que la dirección Bitcoin introducida es correcta.
                        </span>
                    </label>
                )}
            </div>

            {confirmed && feeInfo && quote && (() => {
                const trustedWallet = wallets.find((w) => w.address === address.trim() && w.status === 'trusted');
                return (
                    <div className="rounded-xl bg-slate-900/70 border border-emerald-500/30 p-5 space-y-4" data-testid="btc-final-summary">
                        <p className="text-white font-bold flex items-center gap-2 text-base">
                            <ShieldCheck className="w-5 h-5 text-emerald-400" /> Resumen antes de retirar
                        </p>
                        <div className="text-center py-1">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Retirar</p>
                            <p className="text-3xl font-bold text-white font-mono" data-testid="btc-summary-amount">{fmtEur(parseFloat(amount))}</p>
                        </div>
                        <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-4 space-y-2.5 text-xs">
                            <SummaryLine label="Destino" value="Bitcoin · Red Bitcoin" />
                            <SummaryLine label="Wallet" value={trustedWallet ? trustedWallet.label : 'Wallet externa'} testId="btc-summary-wallet" />
                            <SummaryLine label="Dirección" value={maskAddr(address.trim())} mono testId="btc-summary-address" />
                            <SummaryLine label="BTC estimado" value={fmtBtc(quote.amount_btc)} mono />
                            <SummaryLine label="Comisión de red" value={`− ${fmtBtc(quote.network_fee_btc)}`} mono valueClass="text-amber-300" />
                            <div className="border-t border-slate-800 pt-2.5">
                                <SummaryLine label="Recibirás" value={fmtBtc(quote.net_btc)} mono
                                    valueClass="text-emerald-400 font-bold text-sm" testId="btc-summary-net" />
                            </div>
                        </div>
                        <div className="space-y-1.5 text-xs" data-testid="btc-summary-security">
                            {trustedWallet ? (
                                <p className="text-emerald-400 font-semibold flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Seguridad: Wallet verificada ✓ (lista blanca)
                                </p>
                            ) : (
                                <p className="text-amber-300 font-semibold flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5" /> Wallet no verificada — pasará por revisión adicional
                                </p>
                            )}
                            <p className="text-emerald-400 font-semibold flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Identidad: Verificada ✓
                            </p>
                        </div>
                        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
                            <p className="text-amber-300 text-xs font-semibold">Abono requerido: {fmtEur(feeInfo.fee_eur)}</p>
                            <p className="text-slate-400 text-[11px] mt-1 leading-relaxed">{feeInfo.concept}. {feeInfo.conditions}</p>
                        </div>
                        <Button onClick={create} disabled={creating}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-12 text-base" data-testid="btc-confirm-withdrawal-btn">
                            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-5 h-5 mr-2" />}
                            Confirmar retiro
                        </Button>
                    </div>
                );
            })()}
        </div>
    );
};

/* ── Mis wallets BTC (lista blanca) ── */
const MyBtcWallets = ({ onLockChange }) => {
    const [data, setData] = useState(null);
    const [addr, setAddr] = useState('');
    const [label, setLabel] = useState('');
    const [adding, setAdding] = useState(false);
    const [open, setOpen] = useState(false);

    const load = () => api.get('/btc-wallets').then((r) => { setData(r.data); onLockChange(r.data.lock); }).catch(() => {});
    useEffect(() => { load(); }, []); // eslint-disable-line

    const add = async () => {
        setAdding(true);
        try {
            await api.post('/btc-wallets', { address: addr.trim(), label: label.trim() });
            toast.success(`Wallet registrada — pendiente de revisión. Retiros BTC bloqueados ${data?.lock_hours || 48}h por seguridad.`);
            setAddr(''); setLabel(''); load();
        } catch (e) { toast.error(e.response?.data?.detail || 'Dirección inválida'); }
        finally { setAdding(false); }
    };

    if (!data) return null;
    const chip = { pending_review: ['Pendiente de revisión', 'bg-amber-500/15 text-amber-300'], trusted: ['★ Wallet de confianza', 'bg-emerald-500/15 text-emerald-300'], rejected: ['Rechazada', 'bg-red-500/15 text-red-300'] };

    return (
        <div className="rounded-xl bg-slate-900/70 border border-slate-800" data-testid="my-btc-wallets">
            <button type="button" onClick={() => setOpen((o) => !o)} className="w-full px-4 py-3 flex items-center justify-between text-left">
                <p className="text-white text-sm font-bold flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" /> Mis wallets BTC
                    <span className="text-slate-500 font-normal text-xs">({data.wallets.length})</span>
                </p>
                <span className="text-slate-500 text-xs">{open ? 'Ocultar' : 'Gestionar'}</span>
            </button>
            {open && (
                <div className="px-4 pb-4 space-y-2">
                    {data.wallets.map((w) => (
                        <div key={w.id} className="rounded-lg bg-slate-950/60 border border-slate-800 p-2.5 text-xs" data-testid={`my-wallet-${w.id}`}>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-white font-semibold">{w.label}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${chip[w.status]?.[1]}`}>{chip[w.status]?.[0]}</span>
                            </div>
                            <p className="text-slate-400 font-mono break-all mt-1">{w.address}</p>
                            {w.rejection_reason && <p className="text-red-300 mt-1">Motivo: {w.rejection_reason}</p>}
                        </div>
                    ))}
                    <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Nueva dirección BTC (1..., 3..., bc1q..., bc1p...)"
                        className="w-full h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs font-mono" data-testid="wallet-add-address" />
                    <div className="flex gap-2">
                        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Etiqueta (ej. Mi SafePal)"
                            className="flex-1 h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs" data-testid="wallet-add-label" />
                        <Button size="sm" disabled={adding || !addr.trim()} onClick={add} className="bg-emerald-600 hover:bg-emerald-500 text-white h-9" data-testid="wallet-add-btn">
                            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar'}
                        </Button>
                    </div>
                    <p className="text-slate-500 text-[10px]">Al registrar una nueva dirección se activa un bloqueo de seguridad de {data.lock_hours}h sobre los retiros BTC.</p>
                </div>
            )}
        </div>
    );
};

const fmtRemaining = (secs) => `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;

export default function BtcWithdrawalPage() {
    const [requests, setRequests] = useState(null);
    const [showNew, setShowNew] = useState(false);
    const [lock, setLock] = useState(null);

    const load = async () => {
        try {
            const { data } = await api.get('/btc-withdrawal/list');
            setRequests(data.requests || []);
            setShowNew(false);
        } catch { setRequests([]); }
    };
    useEffect(() => { load(); }, []);

    const active = (requests || []).find((r) => !['completado', 'retiro_rechazado'].includes(r.status));
    const latest = (requests || [])[0];
    const shown = active || (latest && ['enviado', 'completado'].includes(latest.status) ? latest : null);
    const canStartNew = !active && shown;

    return (
        <Layout>
            <div className="max-w-3xl mx-auto space-y-6" data-testid="btc-withdrawal-page">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center">
                            <Bitcoin className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Retiro en Bitcoin</h1>
                            <p className="text-sm text-slate-400 font-light">Reciba sus fondos en su propia billetera BTC · Red Bitcoin</p>
                        </div>
                    </div>
                    {canStartNew && !showNew && (
                        <Button onClick={() => setShowNew(true)} className="bg-amber-600 hover:bg-amber-500 text-white text-xs h-9" data-testid="btc-new-request-btn">
                            <Bitcoin className="w-3.5 h-3.5 mr-1.5" /> Nueva solicitud
                        </Button>
                    )}
                </div>
                {requests === null ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
                ) : (
                    <>
                        <MyBtcWallets onLockChange={setLock} />
                        {lock?.locked && (
                            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 flex items-start gap-3" data-testid="btc-lock-banner">
                                <Clock className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-amber-300 font-bold text-sm">Bloqueo de seguridad activo</p>
                                    <p className="text-slate-300 text-xs mt-1">
                                        Motivo: {lock.reason || 'cambio de seguridad reciente'}. Por su seguridad, los retiros están pausados.
                                        Tiempo restante: <span className="font-bold text-amber-300" data-testid="btc-lock-remaining">{fmtRemaining(lock.remaining_seconds)}</span>.
                                        Puede solicitar una verificación adicional al equipo para levantarlo antes.
                                    </p>
                                </div>
                            </div>
                        )}
                        {shown && !showNew ? (
                            <RequestView request={shown} onUpdate={() => load()} />
                        ) : lock?.locked ? null : (
                            <NewRequestForm onCreated={() => load()} />
                        )}
                    </>
                )}
            </div>
        </Layout>
    );
}
