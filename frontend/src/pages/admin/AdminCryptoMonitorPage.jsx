import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../../components/layout/Layout';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { StatusPill } from '../../components/crypto/CryptoPaymentMonitor';
import { Radar, RefreshCw, ExternalLink, CheckCircle, XCircle, Loader2, AlertTriangle, Clock, ShieldCheck } from 'lucide-react';

const TABS = [
    { key: 'all', label: 'Todos' },
    { key: 'pending', label: 'Pendientes' },
    { key: 'confirmed', label: 'Confirmados' },
    { key: 'incidents', label: 'Incidencias' },
];

const EXPLORERS = {
    BTC: 'https://mempool.space/tx/',
    BTC_LEGACY: 'https://mempool.space/tx/',
    USDT: 'https://tronscan.org/#/transaction/',
    ETH: 'https://etherscan.io/tx/',
    BNB: 'https://bscscan.com/tx/',
};

export default function AdminCryptoMonitorPage() {
    const [tab, setTab] = useState('all');
    const [data, setData] = useState({ intents: [], stats: {} });
    const [loading, setLoading] = useState(true);
    const [checking, setChecking] = useState(false);
    const [resolving, setResolving] = useState(null);

    const load = useCallback((group) => {
        api.get(`/admin/crypto-monitor?status_group=${group}`)
            .then((r) => setData(r.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        setLoading(true);
        load(tab);
        const iv = setInterval(() => load(tab), 30000);
        return () => clearInterval(iv);
    }, [tab, load]);

    const runCheck = async () => {
        setChecking(true);
        try {
            await api.post('/admin/crypto-monitor/run-check');
            toast.success('Verificación en blockchain ejecutada');
            setTimeout(() => load(tab), 2000);
        } catch {
            toast.error('Error al ejecutar la verificación');
        } finally {
            setChecking(false);
        }
    };

    const resolve = async (id, action) => {
        setResolving(id + action);
        try {
            await api.post(`/admin/crypto-monitor/${id}/resolve`, { action });
            toast.success(action === 'confirm' ? 'Pago confirmado manualmente' : 'Pago rechazado');
            load(tab);
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error');
        } finally {
            setResolving(null);
        }
    };

    const stats = data.stats || {};

    return (
        <Layout>
            <div className="max-w-6xl mx-auto space-y-6" data-testid="admin-crypto-monitor-page">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25">
                            <Radar className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Monitor de Pagos Cripto</h1>
                            <p className="text-sm text-slate-400 font-light">Detección automática en blockchain · BTC y USDT</p>
                        </div>
                    </div>
                    <Button onClick={runCheck} disabled={checking} className="bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25" data-testid="run-check-btn">
                        {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                        Verificar blockchain ahora
                    </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="monitor-stats">
                    {[
                        { label: 'Pendientes', value: stats.pending || 0, icon: Clock, color: 'text-amber-400' },
                        { label: 'Confirmados', value: stats.confirmed || 0, icon: ShieldCheck, color: 'text-emerald-400' },
                        { label: 'Incidencias', value: stats.incidents || 0, icon: AlertTriangle, color: 'text-rose-400' },
                        { label: 'Total', value: stats.total || 0, icon: Radar, color: 'text-cyan-400' },
                    ].map((s) => (
                        <div key={s.label} className="p-4 rounded-xl border border-slate-800 bg-slate-950/60" data-testid={`stat-${s.label.toLowerCase()}`}>
                            <s.icon className={`w-4 h-4 ${s.color} mb-2`} />
                            <p className="text-white text-2xl font-bold tabular-nums">{s.value}</p>
                            <p className="text-slate-500 text-xs">{s.label}</p>
                        </div>
                    ))}
                </div>

                <div className="flex gap-2 flex-wrap">
                    {TABS.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${tab === t.key ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'}`}
                            data-testid={`tab-${t.key}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-amber-400 animate-spin" /></div>
                ) : data.intents.length === 0 ? (
                    <div className="text-center py-16 text-slate-500 text-sm" data-testid="monitor-empty">No hay pagos en esta categoría.</div>
                ) : (
                    <div className="space-y-3" data-testid="monitor-intents-list">
                        {data.intents.map((it) => (
                            <div key={it.id} className="p-4 rounded-xl border border-slate-800 bg-slate-950/60" data-testid={`admin-intent-${it.id}`}>
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-white text-sm font-bold">{it.user_name}</p>
                                            <span className="text-slate-500 text-xs">{it.user_email}</span>
                                            <StatusPill status={it.status} />
                                        </div>
                                        <p className="text-slate-400 text-xs mt-1">
                                            {it.coin_name} · {it.network} · Esperado: <span className="text-white font-bold">{it.expected_amount}</span>
                                            {it.detected_amount != null && <> · Recibido: <span className="text-emerald-400 font-bold">{it.detected_amount}</span></>}
                                            {' '}· Conf: <span className="text-white font-bold">{it.confirmations}/{it.required_confirmations}</span>
                                        </p>
                                        {it.txid && (
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <span className="font-mono text-[10px] text-slate-500 truncate max-w-md">{it.txid}</span>
                                                <a href={`${EXPLORERS[it.coin] || ''}${it.txid}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 flex-shrink-0">
                                                    <ExternalLink className="w-3 h-3" />
                                                </a>
                                            </div>
                                        )}
                                        {it.incident_note && (
                                            <p className="text-rose-300 text-[11px] mt-1.5 flex items-start gap-1"><AlertTriangle className="w-3 h-3 mt-px flex-shrink-0" /> {it.incident_note}</p>
                                        )}
                                        <p className="text-slate-600 text-[10px] mt-1">{new Date(it.created_at).toLocaleString('es-ES')}{it.context ? ` · ${it.context}` : ''}</p>
                                    </div>
                                    {!['confirmed', 'cancelled', 'rejected'].includes(it.status) && (
                                        <div className="flex gap-2 flex-shrink-0">
                                            <Button size="sm" onClick={() => resolve(it.id, 'confirm')} disabled={resolving === it.id + 'confirm'}
                                                className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 h-8 text-xs" data-testid={`resolve-confirm-${it.id}`}>
                                                <CheckCircle className="w-3.5 h-3.5 mr-1" /> Confirmar
                                            </Button>
                                            <Button size="sm" onClick={() => resolve(it.id, 'reject')} disabled={resolving === it.id + 'reject'}
                                                className="bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25 h-8 text-xs" data-testid={`resolve-reject-${it.id}`}>
                                                <XCircle className="w-3.5 h-3.5 mr-1" /> Rechazar
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Layout>
    );
}
