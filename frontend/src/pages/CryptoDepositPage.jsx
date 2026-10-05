import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Layout } from '../components/layout/Layout';
import api from '../lib/api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Bitcoin, Copy, Check, Loader2, Coins, AlertTriangle, RefreshCw, History } from 'lucide-react';

const STATUS_STYLE = {
    pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    confirming: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    confirmed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    rejected: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};
export const StatusPill = ({ status, label }) => (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${STATUS_STYLE[status] || 'bg-slate-500/15 text-slate-300 border-slate-500/30'}`}>{label || status}</span>
);
const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const short = (s) => !s ? '—' : s.length > 18 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s;

const CryptoDepositPage = () => {
    const [assets, setAssets] = useState(null);
    const [coin, setCoin] = useState('BTC');
    const [network, setNetwork] = useState('bitcoin');
    const [amount, setAmount] = useState('');
    const [txid, setTxid] = useState('');
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [history, setHistory] = useState([]);

    const loadHistory = useCallback(async () => {
        try { const r = await api.get('/crypto-treasury/deposits'); setHistory(r.data.items); } catch { /* silent */ }
    }, []);

    useEffect(() => {
        api.get('/crypto-treasury/assets').then((r) => setAssets(r.data.assets)).catch(() => toast.error('No se pudieron cargar los activos'));
        loadHistory();
        const iv = setInterval(loadHistory, 30000);
        return () => clearInterval(iv);
    }, [loadHistory]);

    const asset = assets?.find((a) => a.coin === coin);
    const net = asset?.networks.find((n) => n.id === network) || asset?.networks[0];

    const selectCoin = (c) => { setCoin(c); const a = assets?.find((x) => x.coin === c); setNetwork(a?.networks[0]?.id); };

    const copy = async () => { try { await navigator.clipboard.writeText(net.address); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ } };

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            await api.post('/crypto-treasury/deposits', { coin, network: net.id, amount: Number(amount), txid: txid.trim() || null });
            toast.success('Depósito registrado. Te avisaremos cuando se confirme.');
            setAmount(''); setTxid(''); loadHistory();
        } catch (err) { toast.error(err.response?.data?.detail || 'No se pudo registrar el depósito'); }
        finally { setBusy(false); }
    };

    return (
        <Layout>
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6" data-testid="crypto-deposit-page">
                <div>
                    <p className="text-[10.5px] uppercase tracking-[0.14em] text-[#7CB1E5] font-bold">Banca y Cuentas · Crypto Treasury</p>
                    <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1 flex items-center gap-2"><Coins className="w-7 h-7 text-amber-300" /> Depositar Crypto</h1>
                    <p className="text-slate-400 text-[13px] mt-1.5">Envía BTC o USDT a la dirección de depósito y registra la operación para su seguimiento.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                    <Card className="lg:col-span-3 p-5 bg-slate-900/60 border border-slate-800 space-y-5">
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">1 · Moneda</p>
                            <div className="grid grid-cols-2 gap-2">
                                {(assets || []).map((a) => (
                                    <button key={a.coin} onClick={() => selectCoin(a.coin)} data-testid={`deposit-coin-${a.coin}`}
                                        className={`flex items-center gap-3 rounded-xl px-4 py-3 border text-left transition-colors ${coin === a.coin ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-950/60 border-slate-800 hover:border-slate-600'}`}>
                                        <span className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${a.coin === 'BTC' ? 'bg-orange-500/20 text-orange-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{a.coin === 'BTC' ? <Bitcoin className="w-5 h-5" /> : '₮'}</span>
                                        <span><span className="block text-white font-bold text-[14px]">{a.coin}</span><span className="block text-slate-500 text-[11px]">{a.name}</span></span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">2 · Red</p>
                            <div className="flex flex-wrap gap-2">
                                {(asset?.networks || []).map((n) => (
                                    <button key={n.id} onClick={() => setNetwork(n.id)} disabled={!n.available} data-testid={`deposit-network-${n.id}`}
                                        className={`px-3 py-2 rounded-lg border text-[12.5px] font-semibold transition-colors disabled:opacity-40 ${net?.id === n.id ? 'bg-cyan-500/15 border-cyan-500/40 text-white' : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-600'}`}>{n.label}</button>
                                ))}
                            </div>
                            {net && <p className="text-[11px] text-slate-500 mt-2">Mínimo {net.min_deposit} {coin} · {net.confirmations} confirmaciones de red</p>}
                        </div>
                        {net?.address && (
                            <div className="rounded-xl bg-slate-950/70 ring-1 ring-slate-800 p-4 flex flex-col sm:flex-row items-center gap-5" data-testid="deposit-address-box">
                                <div className="p-2.5 bg-white rounded-xl"><QRCodeSVG value={net.address} size={132} level="H" /></div>
                                <div className="flex-1 min-w-0 w-full">
                                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Dirección de depósito · {coin} · {net.label}</p>
                                    <p className="text-white font-mono text-[12.5px] break-all mt-1.5" data-testid="deposit-address">{net.address}</p>
                                    <Button size="sm" onClick={copy} className="mt-3 bg-[#1973B8] hover:bg-[#1F89D8] text-white" data-testid="deposit-copy-btn">{copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}{copied ? 'Copiada' : 'Copiar dirección'}</Button>
                                    <p className="text-[11px] text-amber-300/90 mt-3 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> Envía únicamente {coin} por la red {net.label}. Otros activos o redes podrían perderse.</p>
                                </div>
                            </div>
                        )}
                    </Card>

                    <Card className="lg:col-span-2 p-5 bg-slate-900/60 border border-slate-800">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-3">3 · Registrar depósito</p>
                        <form onSubmit={submit} className="space-y-3" data-testid="deposit-form">
                            <div><label className="text-[11.5px] text-slate-400">Importe enviado ({coin})</label>
                                <Input type="number" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder={`0.00 ${coin}`} className="mt-1 bg-slate-950 border-slate-700 text-white" data-testid="deposit-amount-input" /></div>
                            <div><label className="text-[11.5px] text-slate-400">TXID / Hash (opcional, acelera la confirmación)</label>
                                <Input value={txid} onChange={(e) => setTxid(e.target.value)} placeholder="Hash de la transacción" className="mt-1 bg-slate-950 border-slate-700 text-white font-mono text-[12px]" data-testid="deposit-txid-input" /></div>
                            <Button type="submit" disabled={busy || !amount || !net?.address} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold" data-testid="deposit-submit-btn">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar depósito'}</Button>
                        </form>
                        <p className="text-[11px] text-slate-500 mt-3">Estados: <span className="text-amber-300">Pendiente</span> → <span className="text-cyan-300">Confirmando</span> → <span className="text-emerald-300">Confirmado</span> · <span className="text-rose-300">Rechazado</span></p>
                    </Card>
                </div>

                <Card className="bg-slate-900/60 border border-slate-800 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                        <p className="text-[10.5px] uppercase tracking-[0.14em] text-[#7CB1E5] font-bold flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Historial de depósitos</p>
                        <button onClick={loadHistory} className="text-slate-400 hover:text-white" data-testid="deposit-history-refresh"><RefreshCw className="w-4 h-4" /></button>
                    </div>
                    {history.length === 0 ? <p className="px-4 py-8 text-center text-slate-500 text-[12.5px]" data-testid="deposit-history-empty">Aún no has registrado depósitos.</p> : (
                        <div className="overflow-x-auto"><table className="w-full text-[12.5px]" data-testid="deposit-history-table">
                            <thead><tr className="bg-slate-950/60 text-[10px] uppercase tracking-[0.1em] text-slate-400"><th className="text-left px-4 py-2.5 font-bold">Fecha</th><th className="text-left px-4 py-2.5 font-bold">Moneda · Red</th><th className="text-right px-4 py-2.5 font-bold">Importe</th><th className="text-left px-4 py-2.5 font-bold">TXID</th><th className="text-left px-4 py-2.5 font-bold">Estado</th></tr></thead>
                            <tbody>{history.map((d) => (
                                <tr key={d.id} className="border-t border-slate-800/80" data-testid={`deposit-row-${d.id}`}>
                                    <td className="px-4 py-2.5 text-slate-300 font-mono text-[11px] whitespace-nowrap">{fmtDate(d.created_at)}</td>
                                    <td className="px-4 py-2.5 text-white"><b>{d.coin}</b> <span className="text-slate-500">· {d.network_label}</span></td>
                                    <td className="px-4 py-2.5 text-right text-white font-mono font-semibold">{d.amount} {d.coin}</td>
                                    <td className="px-4 py-2.5 text-slate-400 font-mono text-[11px]">{short(d.txid)}</td>
                                    <td className="px-4 py-2.5"><StatusPill status={d.status} label={d.status_label} /></td>
                                </tr>
                            ))}</tbody>
                        </table></div>
                    )}
                </Card>
            </div>
        </Layout>
    );
};

export default CryptoDepositPage;
