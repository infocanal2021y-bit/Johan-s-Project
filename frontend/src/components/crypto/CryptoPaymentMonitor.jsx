import { useEffect, useState, useCallback } from 'react';
import api from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { toast } from 'sonner';
import { Bitcoin, Copy, Check, Loader2, ExternalLink, ShieldCheck, AlertTriangle, Clock, XCircle, Radar, Ban } from 'lucide-react';

const STATUS_STYLES = {
    waiting: { label: 'Esperando pago', color: 'text-slate-300', bg: 'bg-slate-500/15 border-slate-500/40' },
    detected: { label: 'Pago detectado', color: 'text-cyan-300', bg: 'bg-cyan-500/15 border-cyan-500/40' },
    confirming: { label: 'Confirmando', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-500/40' },
    confirmed: { label: 'Confirmado', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/40' },
    incident: { label: 'Incidencia', color: 'text-rose-300', bg: 'bg-rose-500/15 border-rose-500/40' },
    expired: { label: 'Expirado', color: 'text-orange-300', bg: 'bg-orange-500/15 border-orange-500/40' },
    cancelled: { label: 'Cancelado', color: 'text-slate-400', bg: 'bg-slate-600/15 border-slate-600/40' },
    rejected: { label: 'Rechazado', color: 'text-rose-300', bg: 'bg-rose-500/15 border-rose-500/40' },
};

export const StatusPill = ({ status }) => {
    const s = STATUS_STYLES[status] || STATUS_STYLES.waiting;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${s.bg} ${s.color}`} data-testid={`intent-status-${status}`}>
            {['waiting', 'detected', 'confirming'].includes(status) && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
            {s.label}
        </span>
    );
};

const DeclareModal = ({ open, onOpenChange, coins, onCreated, context }) => {
    const enabled = coins.filter((c) => c.enabled);
    const disabled = coins.filter((c) => !c.enabled);
    const [coin, setCoin] = useState(null);
    const [amount, setAmount] = useState('');
    const [txid, setTxid] = useState('');
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    const selected = enabled.find((c) => c.key === coin);
    const qrUrl = selected ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(selected.address)}&size=160x160&bgcolor=0f172a&color=e2e8f0` : null;

    const submit = async () => {
        if (!selected) { toast.error('Seleccione una moneda'); return; }
        if (!amount || Number(amount) <= 0) { toast.error('Indique el monto exacto enviado'); return; }
        setSaving(true);
        try {
            const r = await api.post('/crypto-monitor/intents', {
                coin: selected.key,
                expected_amount: Number(amount),
                declared_txid: txid.trim() || null,
                context: context || null,
            });
            toast.success('Pago registrado. Vigilando la blockchain...');
            onCreated(r.data);
            setCoin(null); setAmount(''); setTxid('');
            onOpenChange(false);
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al registrar el pago');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#0a0a0a] border-amber-500/20 text-white max-w-lg max-h-[90vh] overflow-y-auto" data-testid="declare-payment-dialog">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Radar className="w-5 h-5 text-amber-400" /> He realizado el pago</DialogTitle>
                    <DialogDescription className="text-slate-400">El sistema detectará su pago automáticamente en la blockchain.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <p className="text-xs text-slate-400 mb-2 font-medium">Moneda y red</p>
                        <div className="grid grid-cols-1 gap-2">
                            {enabled.map((c) => (
                                <button
                                    key={c.key}
                                    onClick={() => setCoin(c.key)}
                                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${coin === c.key ? 'border-amber-500/60 bg-amber-500/10' : 'border-slate-800 bg-slate-950/50 hover:border-slate-600'}`}
                                    data-testid={`coin-option-${c.key}`}
                                >
                                    <span className="flex items-center gap-2.5">
                                        <Bitcoin className="w-4 h-4 text-orange-400" />
                                        <span>
                                            <span className="text-sm font-semibold block">{c.name}</span>
                                            <span className="text-[11px] text-slate-500">{c.network}</span>
                                        </span>
                                    </span>
                                    {coin === c.key && <Check className="w-4 h-4 text-amber-400" />}
                                </button>
                            ))}
                            {disabled.map((c) => (
                                <div key={c.key} className="flex items-center justify-between p-3 rounded-xl border border-slate-800/60 bg-slate-950/30 opacity-50 cursor-not-allowed" data-testid={`coin-disabled-${c.key}`}>
                                    <span className="flex items-center gap-2.5">
                                        <Ban className="w-4 h-4 text-slate-600" />
                                        <span>
                                            <span className="text-sm font-semibold block text-slate-400">{c.name}</span>
                                            <span className="text-[11px] text-slate-600">{c.network}</span>
                                        </span>
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-medium px-2 py-0.5 rounded bg-slate-800">Red no habilitada</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {selected && (
                        <div className="p-4 rounded-xl border border-amber-500/20 bg-slate-950/60 space-y-3" data-testid="selected-coin-details">
                            <div className="flex items-start gap-4">
                                <img src={qrUrl} alt="QR" className="rounded-lg flex-shrink-0" width={110} height={110} data-testid="declare-qr-img" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] text-slate-500 uppercase tracking-wider">Red</p>
                                    <p className="text-amber-300 text-sm font-bold">{selected.network}</p>
                                    <p className="text-[11px] text-slate-500 uppercase tracking-wider mt-2">Dirección oficial</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <p className="font-mono text-[11px] text-slate-300 break-all flex-1">{selected.address}</p>
                                        <button
                                            onClick={() => { navigator.clipboard.writeText(selected.address); setCopied(true); toast.success('Dirección copiada'); setTimeout(() => setCopied(false), 2000); }}
                                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 flex-shrink-0"
                                            data-testid="declare-copy-address"
                                        >
                                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <p className="text-[11px] text-red-300 font-semibold flex items-start gap-1.5 p-2 rounded-lg bg-red-500/10 border border-red-500/40">
                                <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0 text-red-400" />
                                Envíe únicamente {selected.name} por {selected.network}. Enviar otra moneda u otra red causará la pérdida total de los fondos.
                            </p>
                        </div>
                    )}

                    <div>
                        <p className="text-xs text-slate-400 mb-1.5 font-medium">Monto exacto enviado {selected ? `(${selected.name})` : ''}</p>
                        <Input type="number" step="any" min="0" placeholder="Ej: 0.0045" value={amount} onChange={(e) => setAmount(e.target.value)}
                            className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-600" data-testid="declare-amount-input" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 mb-1.5 font-medium">TXID / Hash de la transacción <span className="text-slate-600">(opcional, acelera la detección)</span></p>
                        <Input placeholder="Hash de la transacción" value={txid} onChange={(e) => setTxid(e.target.value)}
                            className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-600 font-mono text-xs" data-testid="declare-txid-input" />
                    </div>
                    <Button onClick={submit} disabled={saving} className="w-full bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25" data-testid="declare-submit-btn">
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Radar className="w-4 h-4 mr-2" />}
                        Registrar pago y vigilar blockchain
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

const IntentCard = ({ intent, config, onCancel }) => {
    const coinCfg = config?.coins?.find((c) => c.key === intent.coin);
    const explorer = coinCfg?.explorer;
    const pct = Math.min(100, Math.round((intent.confirmations / intent.required_confirmations) * 100));

    return (
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-3" data-testid={`intent-card-${intent.id}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5">
                    <Bitcoin className="w-4 h-4 text-orange-400" />
                    <div>
                        <p className="text-white text-sm font-semibold">{intent.coin_name} · {intent.expected_amount}</p>
                        <p className="text-slate-500 text-[10px]">{intent.network} · {new Date(intent.created_at).toLocaleString('es-ES')}</p>
                    </div>
                </div>
                <StatusPill status={intent.status} />
            </div>

            {intent.txid && (
                <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-slate-500 uppercase tracking-wider flex-shrink-0">TXID</span>
                    <span className="font-mono text-slate-300 truncate" data-testid={`intent-txid-${intent.id}`}>{intent.txid}</span>
                    {explorer && (
                        <a href={`${explorer}${intent.txid}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 flex-shrink-0" data-testid={`intent-explorer-${intent.id}`}>
                            <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                    )}
                </div>
            )}

            {['detected', 'confirming', 'confirmed'].includes(intent.status) && (
                <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-slate-500">Confirmaciones</span>
                        <span className="text-white font-bold tabular-nums" data-testid={`intent-confs-${intent.id}`}>{intent.confirmations} / {intent.required_confirmations}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${intent.status === 'confirmed' ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                    {intent.detected_amount != null && (
                        <p className="text-[11px] text-slate-400 mt-1.5">Monto recibido: <span className="text-emerald-400 font-bold">{intent.detected_amount} {intent.coin_name}</span></p>
                    )}
                </div>
            )}

            {intent.status === 'confirmed' && (
                <p className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium"><ShieldCheck className="w-3.5 h-3.5" /> Pago validado en blockchain</p>
            )}
            {(intent.incident_note || intent.status === 'incident') && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30" data-testid={`intent-incident-${intent.id}`}>
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 mt-px flex-shrink-0" />
                    <p className="text-rose-300 text-[11px] leading-relaxed">{intent.incident_note}</p>
                </div>
            )}
            {intent.status === 'waiting' && (
                <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-slate-500 text-[11px]"><Clock className="w-3 h-3" /> Vigilando la blockchain cada 2 min</p>
                    <button onClick={() => onCancel(intent.id)} className="text-slate-500 hover:text-rose-400 text-[11px] flex items-center gap-1" data-testid={`intent-cancel-${intent.id}`}>
                        <XCircle className="w-3 h-3" /> Cancelar
                    </button>
                </div>
            )}
        </div>
    );
};

export const CryptoPaymentMonitor = ({ context }) => {
    const [config, setConfig] = useState(null);
    const [intents, setIntents] = useState([]);
    const [declareOpen, setDeclareOpen] = useState(false);

    const load = useCallback(() => {
        api.get('/crypto-monitor/intents/my').then((r) => setIntents(r.data.intents)).catch(() => {});
    }, []);

    useEffect(() => {
        api.get('/crypto-monitor/config').then((r) => setConfig(r.data)).catch(() => {});
        load();
        const iv = setInterval(load, 15000);
        return () => clearInterval(iv);
    }, [load]);

    const cancel = async (id) => {
        try {
            await api.post(`/crypto-monitor/intents/${id}/cancel`);
            toast.success('Pago cancelado');
            load();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al cancelar');
        }
    };

    if (!config) return null;

    return (
        <div className="space-y-4" data-testid="crypto-payment-monitor">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h3 className="text-white font-bold text-base flex items-center gap-2"><Radar className="w-4 h-4 text-amber-400" /> Detección automática de pagos</h3>
                    <p className="text-slate-500 text-xs mt-0.5">Registre su pago y el sistema lo validará en la blockchain en tiempo real</p>
                </div>
                <Button onClick={() => setDeclareOpen(true)} className="bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25" data-testid="open-declare-btn">
                    <Radar className="w-4 h-4 mr-2" /> He realizado el pago
                </Button>
            </div>

            <DeclareModal open={declareOpen} onOpenChange={setDeclareOpen} coins={config.coins} context={context} onCreated={() => setTimeout(load, 1500)} />

            {intents.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="my-intents-list">
                    {intents.map((it) => (
                        <IntentCard key={it.id} intent={it} config={config} onCancel={cancel} />
                    ))}
                </div>
            )}
        </div>
    );
};
