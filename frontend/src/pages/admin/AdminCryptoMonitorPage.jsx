import { useEffect, useState, useCallback, useRef } from 'react';
import { Layout } from '../../components/layout/Layout';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { StatusPill } from '../../components/crypto/CryptoPaymentMonitor';
import { Radar, RefreshCw, ExternalLink, CheckCircle, XCircle, Loader2, AlertTriangle, Clock, ShieldCheck, Volume2, VolumeX, Bell, ArrowUpCircle, Mail, BarChart3 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const WeeklyCryptoChart = () => {
    const [data, setData] = useState(null);
    useEffect(() => {
        api.get('/admin/crypto-monitor/weekly')
            .then((r) => setData(r.data))
            .catch(() => setData({ series: [], total_eur: 0, total_count: 0 }));
    }, []);

    if (!data) return null;
    return (
        <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5" data-testid="weekly-crypto-chart">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-violet-400" />
                    <span className="text-white font-semibold text-sm">Evolución semanal de pagos cripto (EUR)</span>
                </div>
                <span className="text-xs text-slate-400">
                    8 semanas · <span className="text-emerald-400 font-bold font-mono">€{Number(data.total_eur || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span> · {data.total_count} pagos
                </span>
            </div>
            <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="week" stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#1e293b' }} />
                        <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false}
                            tickFormatter={(v) => `€${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                        <Tooltip
                            contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, fontSize: 12 }}
                            labelStyle={{ color: '#94a3b8' }}
                            formatter={(v, name) => name === 'eur'
                                ? [`€${Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2 })}`, 'EUR detectado']
                                : [v, 'Pagos']}
                        />
                        <Bar dataKey="eur" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={44} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

const playAlert = (kind) => {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const tones = kind === 'incident' ? [[880, 0], [660, 0.18], [880, 0.36], [660, 0.54]] : [[523, 0], [784, 0.18]];
        tones.forEach(([freq, delay]) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.16);
            osc.start(ctx.currentTime + delay);
            osc.stop(ctx.currentTime + delay + 0.2);
        });
        setTimeout(() => ctx.close(), 1500);
    } catch { /* audio not available */ }
};

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
    const [alerts, setAlerts] = useState([]);
    const [showAlerts, setShowAlerts] = useState(false);
    const [soundOn, setSoundOn] = useState(() => localStorage.getItem('cryptoMonitorSound') !== 'off');
    const prevStats = useRef(null);
    const soundOnRef = useRef(soundOn);
    soundOnRef.current = soundOn;

    const load = useCallback((group) => {
        api.get(`/admin/crypto-monitor?status_group=${group}`)
            .then((r) => {
                const s = r.data.stats || {};
                const prev = prevStats.current;
                if (prev) {
                    if ((s.total || 0) > (prev.total || 0)) {
                        if (soundOnRef.current) playAlert('new');
                        toast.info('Nuevo pago cripto registrado', { description: 'Un usuario declaró un nuevo pago.' });
                    }
                    if ((s.incidents || 0) > (prev.incidents || 0)) {
                        if (soundOnRef.current) playAlert('incident');
                        toast.error('Incidencia en pago cripto', { description: 'Revise la pestaña Incidencias.' });
                    }
                }
                prevStats.current = s;
                setData(r.data);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        setLoading(true);
        load(tab);
        const iv = setInterval(() => load(tab), 15000);
        return () => clearInterval(iv);
    }, [tab, load]);

    const loadAlerts = useCallback(() => {
        api.get('/admin/crypto-monitor/alerts').then((r) => setAlerts(r.data.alerts)).catch(() => {});
    }, []);

    useEffect(() => {
        loadAlerts();
        const iv = setInterval(loadAlerts, 20000);
        return () => clearInterval(iv);
    }, [loadAlerts]);

    const toggleSound = () => {
        const next = !soundOn;
        setSoundOn(next);
        localStorage.setItem('cryptoMonitorSound', next ? 'on' : 'off');
        if (next) playAlert('new');
        toast.success(next ? 'Alertas sonoras activadas' : 'Alertas sonoras silenciadas');
    };

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

    const [sendingSummary, setSendingSummary] = useState(false);
    const sendSummary = async () => {
        setSendingSummary(true);
        try {
            const { data: res } = await api.post('/admin/crypto-monitor/daily-summary/send');
            toast.success('Resumen cripto enviado al email del admin', {
                description: `${res.payments} pagos · €${(res.total_eur || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} detectados en 24h`,
            });
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al enviar el resumen');
        } finally {
            setSendingSummary(false);
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
                            <p className="text-sm text-slate-400 font-light">Detección automática en blockchain · BTC, USDT, ETH y BNB</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={() => setShowAlerts((v) => !v)} variant="outline"
                            className={`relative border ${showAlerts ? 'border-amber-500/40 text-amber-300 bg-amber-500/10' : 'border-slate-700 text-slate-400 bg-slate-900 hover:bg-slate-800'}`}
                            data-testid="alerts-toggle-btn" title="Historial de alertas">
                            <Bell className="w-4 h-4" />
                            {alerts.length > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center">{alerts.length}</span>
                            )}
                        </Button>
                        <Button onClick={toggleSound} variant="outline"
                            className={`border ${soundOn ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20' : 'border-slate-700 text-slate-400 bg-slate-900 hover:bg-slate-800'}`}
                            data-testid="sound-toggle-btn" title={soundOn ? 'Alertas sonoras activadas' : 'Alertas sonoras silenciadas'}>
                            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                        </Button>
                        <Button onClick={sendSummary} disabled={sendingSummary} variant="outline"
                            className="border border-violet-500/40 text-violet-300 bg-violet-500/10 hover:bg-violet-500/20" data-testid="send-summary-btn"
                            title="Enviar resumen diario al email del admin ahora">
                            {sendingSummary ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                            Enviar resumen
                        </Button>
                        <Button onClick={runCheck} disabled={checking} className="bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25" data-testid="run-check-btn">
                            {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                            Verificar blockchain ahora
                        </Button>
                    </div>
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

                <WeeklyCryptoChart />

                {showAlerts && (
                    <div className="p-4 rounded-2xl border border-amber-500/20 bg-[#0a0a0a]/70" data-testid="alerts-history-panel">
                        <div className="flex items-center gap-2 mb-3">
                            <Bell className="w-4 h-4 text-amber-400" />
                            <h3 className="text-white font-bold text-sm">Historial de alertas</h3>
                            <span className="text-slate-500 text-xs">· últimos avisos de pagos e incidencias</span>
                        </div>
                        {alerts.length === 0 ? (
                            <p className="text-slate-500 text-xs py-4 text-center" data-testid="alerts-empty">No hay alertas registradas.</p>
                        ) : (
                            <div className="space-y-2 max-h-72 overflow-y-auto">
                                {alerts.map((a) => {
                                    const isIncident = a.type === 'crypto_payment_incident';
                                    return (
                                        <div key={a.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800" data-testid={`alert-${a.id}`}>
                                            {isIncident
                                                ? <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
                                                : <ArrowUpCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />}
                                            <div className="min-w-0 flex-1">
                                                <p className="text-slate-200 text-xs leading-relaxed">{a.message}</p>
                                                <p className="text-slate-500 text-[10px] mt-0.5 tabular-nums" data-testid={`alert-time-${a.id}`}>
                                                    {a.user_name ? `${a.user_name} · ` : ''}{new Date(a.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                </p>
                                            </div>
                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${isIncident ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                                                {isIncident ? 'INCIDENCIA' : 'AVANCE'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

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
                                            {it.eur_equivalent != null && <> · <span className="text-cyan-400 font-bold" data-testid={`eur-equivalent-${it.id}`}>≈ {Number(it.eur_equivalent).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span></>}
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
                                        {it.from_address && (
                                            <p className="text-[10px] text-slate-500 mt-1" data-testid={`from-address-${it.id}`}>
                                                Wallet de origen: <span className="font-mono text-amber-400/90">{it.from_address}</span>
                                                {' '}<span className="text-slate-600">→ destino:</span> <span className="font-mono text-slate-400">{it.address?.slice(0, 14)}...</span>
                                            </p>
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
