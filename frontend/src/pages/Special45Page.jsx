import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import api from '../lib/api';
import { toast } from 'sonner';
import {
    Award, ShieldCheck, CheckCircle2, XCircle, Loader2, Landmark, Bitcoin,
    AlertTriangle, Clock, Send, BadgeCheck,
} from 'lucide-react';

const fmtEur = (n) => {
    const [int, dec] = Number(n || 0).toFixed(2).split('.');
    return `€${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
};
const maskIban = (v) => {
    const a = (v || '').replace(/\s+/g, '');
    return a.length > 8 ? `${a.slice(0, 4)} •••• ${a.slice(-4)}` : a;
};
const maskBtc = (a) => (a && a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a || '');

const STATUS_STYLE = {
    solicitado: 'bg-sky-500/15 text-sky-300',
    pendiente_validacion: 'bg-amber-500/15 text-amber-300',
    en_revision: 'bg-indigo-500/15 text-indigo-300',
    aprobado: 'bg-emerald-500/15 text-emerald-300',
    procesando: 'bg-cyan-500/15 text-cyan-300',
    completado: 'bg-emerald-600/20 text-emerald-300',
    rechazado: 'bg-rose-500/15 text-rose-300',
};

const Row = ({ label, value, valueClass = 'text-white', mono }) => (
    <div className="flex justify-between items-center gap-3 text-xs">
        <span className="text-slate-500">{label}</span>
        <span className={`font-semibold text-right ${mono ? 'font-mono' : ''} ${valueClass}`}>{value}</span>
    </div>
);

const ActiveRequest = ({ req, onRefresh }) => {
    const [msg, setMsg] = useState('');
    const [txid, setTxid] = useState('');
    const [sending, setSending] = useState(false);
    return (
        <div className="rounded-xl bg-slate-900/70 border border-[#D4AF37]/25 p-5 space-y-3" data-testid="s45-active-request">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-white font-bold flex items-center gap-2"><Award className="w-4 h-4 text-[#F3D372]" /> Su solicitud +45</p>
                <span className={`px-2 py-1 rounded-md text-[11px] font-bold ${STATUS_STYLE[req.status] || ''}`} data-testid="s45-status">
                    {req.status_label}
                </span>
            </div>
            <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3.5 space-y-2">
                <Row label="Importe" value={fmtEur(req.amount_eur)} mono />
                <Row label="Destino" value={req.destination_type === 'bank'
                    ? `${req.bank_name || 'Banco'} · ${maskIban(req.bank_iban)}`
                    : `Bitcoin · ${req.btc_address_masked || maskBtc(req.btc_address)}`} mono />
                <Row label="Titularidad" value={req.ownership_validated ? 'Validada ✓' : 'Pendiente de validación'}
                    valueClass={req.ownership_validated ? 'text-emerald-400' : 'text-amber-300'} />
                <Row label="Abono de autorización" value={`${fmtEur(req.fee_eur)} ${req.fee_informed ? '· informado ✓' : '· pendiente'}`}
                    valueClass={req.fee_informed ? 'text-emerald-400' : 'text-amber-300'} />
            </div>
            {req.status === 'pendiente_validacion' && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-[11.5px] text-amber-200 flex gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{req.ownership_note || 'Los datos del destino no coinciden con su perfil. El equipo validará la titularidad; puede que se le solicite documentación adicional.'}</span>
                </div>
            )}
            {!req.fee_informed && (
                <div className="space-y-2 pt-1">
                    <p className="text-[11px] text-slate-400">¿Ya realizó el abono de {fmtEur(req.fee_eur)}? Infórmelo aquí:</p>
                    <input value={txid} onChange={(e) => setTxid(e.target.value)} placeholder="TXID / referencia (opcional)"
                        className="w-full h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs" data-testid="s45-abono-txid" />
                    <div className="flex gap-2">
                        <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Mensaje para el equipo (opcional)"
                            className="flex-1 h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs" />
                        <Button size="sm" disabled={sending} className="bg-[#1973B8] hover:bg-[#1F89D8] h-9 text-xs" data-testid="s45-abono-submit"
                            onClick={async () => {
                                setSending(true);
                                try {
                                    await api.post(`/special45/${req.id}/submit-abono`, { message: msg, txid });
                                    toast.success('Abono informado al equipo');
                                    onRefresh();
                                } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
                                finally { setSending(false); }
                            }}>
                            <Send className="w-3.5 h-3.5 mr-1" /> Informar abono
                        </Button>
                    </div>
                </div>
            )}
            <div className="pt-1">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">Progreso</p>
                {(req.timeline || []).slice().reverse().map((t, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px] py-1">
                        <Clock className="w-3 h-3 text-slate-600 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-400">
                            <span className="text-white font-semibold">{t.label}</span>
                            {t.note ? ` — ${t.note}` : ''} · {new Date(t.at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const RequestForm = ({ config, onCreated }) => {
    const [amount, setAmount] = useState('');
    const [dob, setDob] = useState('');
    const [destType, setDestType] = useState('bank');
    const [holder, setHolder] = useState('');
    const [iban, setIban] = useState('');
    const [bankName, setBankName] = useState('');
    const [btcAddr, setBtcAddr] = useState('');
    const [showSummary, setShowSummary] = useState(false);
    const [creating, setCreating] = useState(false);

    const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000)) : null;
    const amountOk = Number(amount) > 0 && Number(amount) <= config.max_eur;
    const destOk = destType === 'bank' ? (holder.trim() && iban.replace(/\s/g, '').length >= 14) : btcAddr.trim().length >= 26;
    const canContinue = amountOk && age !== null && age >= config.min_age && destOk;

    const create = async () => {
        setCreating(true);
        try {
            const payload = {
                amount_eur: Number(amount), date_of_birth: dob, destination_type: destType,
                ...(destType === 'bank' ? { bank_holder: holder, bank_iban: iban, bank_name: bankName } : { btc_address: btcAddr.trim() }),
            };
            await api.post('/special45/initiate', payload);
            toast.success('Solicitud de Retiro Especial +45 registrada');
            onCreated();
        } catch (e) { toast.error(e.response?.data?.detail || 'Error al crear la solicitud'); }
        finally { setCreating(false); }
    };

    return (
        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-5 space-y-4" data-testid="s45-form">
            <p className="text-white font-bold text-sm">Nueva solicitud</p>

            <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Fecha de nacimiento</span>
                <input type="date" value={dob} onChange={(e) => setDob(e.target.value)}
                    className="block w-full h-10 px-3 mt-1 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm"
                    data-testid="s45-dob-input" />
                {age !== null && (
                    <p className={`text-[11px] mt-1 font-semibold ${age >= config.min_age ? 'text-emerald-400' : 'text-rose-400'}`} data-testid="s45-age-check">
                        {age >= config.min_age ? `✓ ${age} años — cumple el requisito +45` : `✗ ${age} años — esta modalidad es exclusiva para +45`}
                    </p>
                )}
                <p className="text-[10.5px] text-slate-500 mt-1">El equipo validará esta fecha contra el documento de identidad de su KYC.</p>
            </label>

            <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Importe (máx. {fmtEur(config.max_eur)})</span>
                <input type="number" min="1" max={config.max_eur} value={amount} onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="block w-full h-10 px-3 mt-1 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm font-mono"
                    data-testid="s45-amount-input" />
                {amount && !amountOk && <p className="text-rose-400 text-[11px] mt-1">El importe debe ser entre €1 y {fmtEur(config.max_eur)}.</p>}
            </label>

            <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Destino</span>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                    <button type="button" onClick={() => setDestType('bank')} data-testid="s45-dest-bank"
                        className={`flex items-center justify-center gap-2 h-11 rounded-lg text-xs font-bold transition-all ${
                            destType === 'bank' ? 'bg-[#1973B8]/20 text-sky-300 ring-1 ring-[#1973B8]/50' : 'bg-slate-950 text-slate-500 border border-slate-800'
                        }`}>
                        <Landmark className="w-4 h-4" /> Cuenta bancaria
                    </button>
                    <button type="button" onClick={() => setDestType('btc')} data-testid="s45-dest-btc"
                        className={`flex items-center justify-center gap-2 h-11 rounded-lg text-xs font-bold transition-all ${
                            destType === 'btc' ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40' : 'bg-slate-950 text-slate-500 border border-slate-800'
                        }`}>
                        <Bitcoin className="w-4 h-4" /> Wallet BTC
                    </button>
                </div>
            </div>

            {destType === 'bank' ? (
                <div className="space-y-2.5">
                    <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Titular de la cuenta"
                        className="w-full h-10 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm" data-testid="s45-holder-input" />
                    <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="IBAN (ES91 2100 ...)"
                        className="w-full h-10 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm font-mono" data-testid="s45-iban-input" />
                    <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Banco (opcional)"
                        className="w-full h-10 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm" />
                    <p className="text-[10.5px] text-slate-500">La cuenta debe estar a su nombre. Si el titular no coincide, la solicitud quedará <span className="text-amber-300">Pendiente de validación</span>.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    <input value={btcAddr} onChange={(e) => setBtcAddr(e.target.value)} placeholder="Dirección BTC (bc1... / 1... / 3...)"
                        className="w-full h-10 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm font-mono" data-testid="s45-btc-input" />
                    <p className="text-[10.5px] text-slate-500">Las wallets de su lista blanca se validan automáticamente. Otras direcciones requerirán validación manual de titularidad.</p>
                </div>
            )}

            {!showSummary ? (
                <Button disabled={!canContinue} onClick={() => setShowSummary(true)}
                    className="w-full bg-[#D4AF37] hover:bg-[#c6a230] text-slate-950 font-bold h-11" data-testid="s45-continue-btn">
                    Continuar al resumen
                </Button>
            ) : (
                <div className="rounded-xl bg-slate-950/70 border border-emerald-500/30 p-4 space-y-3" data-testid="s45-summary">
                    <p className="text-white font-bold flex items-center gap-2 text-sm"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Resumen antes de retirar</p>
                    <div className="text-center py-1">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Retirar</p>
                        <p className="text-2xl font-bold text-white font-mono">{fmtEur(Number(amount))}</p>
                    </div>
                    <div className="space-y-2">
                        <Row label="Modalidad" value="Retiro Especial +45" valueClass="text-[#F3D372]" />
                        <Row label="Edad declarada" value={`${age} años`} />
                        {destType === 'bank' ? (
                            <>
                                <Row label="Destino" value="Transferencia bancaria" />
                                <Row label="Titular" value={holder} />
                                <Row label="IBAN" value={maskIban(iban)} mono />
                            </>
                        ) : (
                            <>
                                <Row label="Destino" value="Bitcoin · Red Bitcoin" />
                                <Row label="Dirección" value={maskBtc(btcAddr.trim())} mono />
                            </>
                        )}
                        <Row label="Comisión de transferencia" value="Sin comisión" valueClass="text-emerald-400" />
                        <div className="border-t border-slate-800 pt-2">
                            <Row label="Recibirás" value={fmtEur(Number(amount))} valueClass="text-emerald-400 font-bold text-sm" mono />
                        </div>
                    </div>
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
                        <p className="text-amber-300 text-xs font-semibold">Abono de autorización: {fmtEur(config.fee_eur)}</p>
                        <p className="text-slate-400 text-[10.5px] mt-1">Requerido para procesar esta modalidad especial. Se informa después de crear la solicitud.</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setShowSummary(false)} className="flex-1 border-slate-700 text-slate-300 h-11">Volver</Button>
                        <Button disabled={creating} onClick={create}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-11" data-testid="s45-confirm-btn">
                            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1.5" />} Confirmar retiro
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default function Special45Page() {
    const [config, setConfig] = useState(null);
    const [mine, setMine] = useState([]);

    const load = useCallback(async () => {
        try {
            const [c, m] = await Promise.all([api.get('/special45/config'), api.get('/special45/mine')]);
            setConfig(c.data);
            setMine(m.data.requests || []);
        } catch { toast.error('No se pudo cargar'); }
    }, []);
    useEffect(() => { load(); }, [load]);

    if (!config) return <Layout><div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div></Layout>;

    const active = config.active_request;
    const activeFresh = active ? (mine.find((r) => r.id === active.id) || active) : null;

    return (
        <Layout>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-4 p-3 sm:p-5" data-testid="special45-page">
                <div className="relative overflow-hidden rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#0A111F] via-[#0E182A] to-[#080E1A] p-5">
                    <div aria-hidden="true" className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />
                    <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/15 ring-1 ring-[#D4AF37]/40 flex items-center justify-center flex-shrink-0">
                            <Award className="w-6 h-6 text-[#F3D372]" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-[#E5C158] font-bold">Modalidad exclusiva</p>
                            <h1 className="text-xl sm:text-2xl font-bold text-white">Retiro Especial +45</h1>
                            <p className="text-slate-400 text-xs mt-1">Para clientes de 45 años o más con perfil verificado y KYC aprobado. Hasta {fmtEur(config.max_eur)} por solicitud.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-4" data-testid="s45-requirements">
                        {[
                            ['+45 años', true, 'Se valida con su DNI'],
                            ['Perfil verificado', config.verified_ok],
                            ['KYC aprobado', config.kyc_ok],
                        ].map(([label, ok]) => (
                            <div key={label} className={`rounded-lg px-2.5 py-2 text-center border ${ok ? 'bg-emerald-500/5 border-emerald-500/25' : 'bg-rose-500/5 border-rose-500/25'}`}>
                                {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" /> : <XCircle className="w-4 h-4 text-rose-400 mx-auto" />}
                                <p className={`text-[10px] font-bold mt-1 ${ok ? 'text-emerald-300' : 'text-rose-300'}`}>{label}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {activeFresh ? (
                    <ActiveRequest req={activeFresh} onRefresh={load} />
                ) : config.eligible ? (
                    <RequestForm config={config} onCreated={load} />
                ) : (
                    <div className="rounded-xl bg-slate-900/70 border border-amber-500/25 p-5" data-testid="s45-not-eligible">
                        <p className="text-amber-300 font-bold text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> No disponible por ahora</p>
                        <ul className="mt-2 space-y-1">
                            {config.reasons.map((r, i) => <li key={i} className="text-slate-400 text-xs">• {r}</li>)}
                        </ul>
                    </div>
                )}

                {mine.filter((r) => !activeFresh || r.id !== activeFresh.id).length > 0 && (
                    <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Solicitudes anteriores</p>
                        {mine.filter((r) => !activeFresh || r.id !== activeFresh.id).map((r) => (
                            <div key={r.id} className="flex items-center justify-between py-1.5 text-xs border-b border-slate-800/50 last:border-0">
                                <span className="text-white font-mono">{fmtEur(r.amount_eur)}</span>
                                <span className="text-slate-500">{new Date(r.created_at).toLocaleDateString('es-ES')}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${STATUS_STYLE[r.status] || ''}`}>{r.status_label}</span>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-lg bg-slate-900/50 border border-slate-800">
                    <BadgeCheck className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[10.5px] text-slate-500 leading-relaxed">
                        Antes de aprobar el retiro validamos que la cuenta bancaria o wallet pertenezca al titular del perfil.
                        Si los datos no coinciden, la solicitud permanecerá en Pendiente de validación hasta acreditar la titularidad.
                    </p>
                </div>
            </motion.div>
        </Layout>
    );
}
