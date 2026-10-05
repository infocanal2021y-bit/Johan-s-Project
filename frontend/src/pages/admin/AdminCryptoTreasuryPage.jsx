import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import api from '../../lib/api';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { Bitcoin, Loader2, RefreshCw, Vault, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, ExternalLink } from 'lucide-react';
import { StatusPill } from '../CryptoDepositPage';

const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const short = (s) => !s ? '—' : s.length > 20 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s;
const TYPE = { deposit: { label: 'Depósito', icon: ArrowDownToLine, cls: 'text-emerald-300' }, withdrawal: { label: 'Retiro', icon: ArrowUpFromLine, cls: 'text-amber-300' }, movement: { label: 'Movimiento', icon: ArrowLeftRight, cls: 'text-cyan-300' } };
const STATUS_FILTERS = [['', 'Todos'], ['pending', 'Pendiente'], ['confirming', 'Confirmando'], ['confirmed', 'Confirmado'], ['rejected', 'Rechazado']];

const CoinCard = ({ coin, s }) => (
    <Card className="p-4 bg-slate-900/60 border border-slate-800" data-testid={`treasury-coin-${coin}`}>
        <div className="flex items-center gap-2 mb-3">
            <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${coin === 'BTC' ? 'bg-orange-500/20 text-orange-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{coin === 'BTC' ? <Bitcoin className="w-4 h-4" /> : '₮'}</span>
            <p className="text-white font-bold">{coin}</p>
            {s?.pending > 0 && <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">{s.pending} pendientes</span>}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
            {[['Depósitos', s?.deposits], ['Retiros', s?.withdrawals], ['Movimientos', s?.movements]].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-slate-950/60 py-2"><p className="text-white text-lg font-bold tabular-nums">{v ?? 0}</p><p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">{l}</p></div>
            ))}
        </div>
    </Card>
);

export const AdminCryptoTreasuryPage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('');
    const [coin, setCoin] = useState('');
    const [type, setType] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try { const r = await api.get('/admin/crypto-treasury/operations', { params: { status: status || undefined, coin: coin || undefined, type: type || undefined } }); setData(r.data); }
        catch { toast.error('No se pudo cargar Crypto Treasury'); }
        finally { setLoading(false); }
    }, [status, coin, type]);
    useEffect(() => { load(); }, [load]);

    const changeStatus = async (op, newStatus) => {
        if (!newStatus || newStatus === op.status) return;
        const note = newStatus === 'rejected' ? window.prompt('Motivo del rechazo (se enviará al usuario):') : null;
        if (newStatus === 'rejected' && note === null) return;
        try { await api.put(`/admin/crypto-treasury/operations/${op.id}/status`, { status: newStatus, note }); toast.success(`Estado actualizado: ${data.statuses[newStatus]}`); load(); }
        catch (e) { toast.error(e.response?.data?.detail || 'No se pudo actualizar'); }
    };

    const Chip = ({ active, onClick, children, testid }) => (
        <button onClick={onClick} data-testid={testid} className={`px-3 py-1.5 rounded-full text-[11.5px] font-semibold border transition-colors ${active ? 'bg-amber-500/15 text-amber-200 border-amber-500/40' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}>{children}</button>
    );

    return (
        <Layout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5" data-testid="admin-crypto-treasury-page">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-[10.5px] uppercase tracking-[0.14em] text-amber-300 font-bold">Administración · Tesorería</p>
                        <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1 flex items-center gap-2"><Vault className="w-7 h-7 text-amber-300" /> Crypto Treasury</h1>
                        <p className="text-slate-400 text-[13px] mt-1.5">Depósitos, retiros y movimientos en BTC y USDT · proveedor: <span className="text-white font-mono">{data?.provider || '—'}</span> <span className="text-slate-600">(preparado para Fireblocks)</span></p>
                    </div>
                    <Button onClick={load} variant="outline" className="bg-white/5 border-white/15 text-white hover:bg-white/10" data-testid="treasury-refresh"><RefreshCw className="w-4 h-4 mr-1.5" /> Refrescar</Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><CoinCard coin="BTC" s={data?.summary?.BTC} /><CoinCard coin="USDT" s={data?.summary?.USDT} /></div>

                <div className="flex flex-wrap items-center gap-2" data-testid="treasury-filters">
                    {STATUS_FILTERS.map(([v, l]) => <Chip key={v} active={status === v} onClick={() => setStatus(v)} testid={`treasury-status-${v || 'all'}`}>{l}</Chip>)}
                    <span className="w-px h-5 bg-slate-800 mx-1" />
                    {[['', 'BTC + USDT'], ['BTC', 'BTC'], ['USDT', 'USDT']].map(([v, l]) => <Chip key={v} active={coin === v} onClick={() => setCoin(v)} testid={`treasury-coin-filter-${v || 'all'}`}>{l}</Chip>)}
                    <span className="w-px h-5 bg-slate-800 mx-1" />
                    {[['', 'Todo'], ['deposit', 'Depósitos'], ['withdrawal', 'Retiros'], ['movement', 'Movimientos']].map(([v, l]) => <Chip key={v} active={type === v} onClick={() => setType(v)} testid={`treasury-type-${v || 'all'}`}>{l}</Chip>)}
                </div>

                <Card className="bg-slate-900/60 border border-slate-800 overflow-hidden">
                    {loading ? <div className="py-12 text-center text-slate-400"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
                        : !data?.items?.length ? <p className="py-12 text-center text-slate-500 text-[13px]" data-testid="treasury-empty">Sin operaciones para este filtro.</p> : (
                        <div className="overflow-x-auto"><table className="w-full text-[12.5px]" data-testid="treasury-table">
                            <thead><tr className="bg-slate-950/60 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                                {['Fecha', 'Tipo', 'Usuario', 'Moneda', 'Red', 'Importe', 'TXID', 'Estado', ''].map((h, i) => <th key={i} className={`px-3 py-3 font-bold text-left whitespace-nowrap ${h === 'Importe' ? 'text-right' : ''}`}>{h}</th>)}
                            </tr></thead>
                            <tbody>{data.items.map((op) => { const t = TYPE[op.type] || TYPE.movement; const Icon = t.icon; return (
                                <tr key={`${op.source}-${op.id}`} className="border-t border-slate-800/80 hover:bg-slate-800/40" data-testid={`treasury-row-${op.id}`}>
                                    <td className="px-3 py-2.5 text-slate-300 font-mono text-[11px] whitespace-nowrap">{fmtDate(op.created_at)}</td>
                                    <td className={`px-3 py-2.5 font-semibold whitespace-nowrap ${t.cls}`}><Icon className="w-3.5 h-3.5 inline mr-1" />{t.label}</td>
                                    <td className="px-3 py-2.5 min-w-[160px]">{op.user_id ? <Link to={`/admin/users/${op.user_id}`} className="text-white hover:text-cyan-300"><span className="block font-semibold truncate max-w-[200px]">{op.user_name || '—'}</span><span className="block text-slate-500 text-[11px] truncate max-w-[200px]">{op.user_email}</span></Link> : '—'}</td>
                                    <td className="px-3 py-2.5 text-white font-bold">{op.coin || '—'}</td>
                                    <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">{op.network_label || '—'}</td>
                                    <td className="px-3 py-2.5 text-right text-white font-mono font-semibold whitespace-nowrap">{op.amount ?? '—'} {op.coin}{op.amount_eur ? <span className="block text-[10.5px] text-slate-500">€{Number(op.amount_eur).toLocaleString('de-DE')}</span> : null}</td>
                                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400">{op.txid ? (op.coin === 'BTC' ? <a href={`https://mempool.space/es/tx/${op.txid}`} target="_blank" rel="noreferrer" className="hover:text-cyan-300 inline-flex items-center gap-1">{short(op.txid)} <ExternalLink className="w-3 h-3" /></a> : short(op.txid)) : '—'}</td>
                                    <td className="px-3 py-2.5"><StatusPill status={op.status} label={op.status_label} /></td>
                                    <td className="px-3 py-2.5">{op.editable && (
                                        <select value={op.status} onChange={(e) => changeStatus(op, e.target.value)} className="h-8 rounded-md bg-slate-950 border border-slate-700 text-white text-[11.5px] px-2" data-testid={`treasury-status-select-${op.id}`}>
                                            {Object.entries(data.statuses).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                        </select>)}</td>
                                </tr>); })}</tbody>
                        </table></div>
                    )}
                </Card>
            </div>
        </Layout>
    );
};

export default AdminCryptoTreasuryPage;
