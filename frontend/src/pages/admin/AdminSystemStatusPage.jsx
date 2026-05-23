import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
    Activity, Database, RefreshCw, Loader2, AlertOctagon,
    CheckCircle2, XCircle, Clock, AlertTriangle, Bug, Server,
} from 'lucide-react';
import { toast } from 'sonner';
import { safeApiCall } from '../../lib/diagnostics';

const fmtTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-ES', {
        day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
};

const statusColor = (code) => {
    if (code >= 500) return 'text-rose-300 bg-rose-500/15 border-rose-500/30';
    if (code >= 400) return 'text-amber-300 bg-amber-500/15 border-amber-500/30';
    if (code >= 200) return 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30';
    return 'text-slate-300 bg-slate-700/30 border-slate-700';
};

const latencyColor = (ms) => {
    if (ms < 0) return 'text-rose-300';
    if (ms < 200) return 'text-emerald-300';
    if (ms < 1000) return 'text-amber-300';
    return 'text-rose-300';
};

export const AdminSystemStatusPage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const fetchData = useCallback(async () => {
        const result = await safeApiCall({
            url: '/api/admin/system-status',
            method: 'GET',
            timeoutMs: 10000,
        });
        if (result.ok) {
            setData(result.data);
        } else {
            toast.error(result.message);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        if (!autoRefresh) return;
        const id = setInterval(fetchData, 15000);
        return () => clearInterval(id);
    }, [autoRefresh, fetchData]);

    if (loading && !data) {
        return (
            <Layout>
                <div className="py-24 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                </div>
            </Layout>
        );
    }

    const dbOk = data?.db?.ok;
    const dbLatency = data?.db?.latency_ms;
    const maintEnabled = data?.maintenance?.enabled;
    const adminReqs = data?.admin_requests || {};
    const clientErr = data?.client_errors || {};
    const logs = adminReqs.last_50 || [];

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-5" data-testid="admin-system-status-page">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl sm:text-3xl text-white font-bold tracking-tight flex items-center gap-2">
                            <Server className="w-7 h-7 text-cyan-400" />
                            System Status
                        </h1>
                        <p className="text-slate-500 mt-1 text-sm">
                            Estado del backend, logs admin y errores frontend en tiempo real · refresca cada 15s
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={() => setAutoRefresh(!autoRefresh)} variant="outline"
                            className={`border-slate-700 ${autoRefresh ? 'bg-emerald-500/10 text-emerald-300' : ''}`}>
                            <RefreshCw className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-spin-slow' : ''}`} />
                            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
                        </Button>
                        <Button onClick={fetchData} variant="outline" className="border-slate-700">
                            <RefreshCw className="w-4 h-4 mr-2" /> Refrescar
                        </Button>
                    </div>
                </motion.div>

                {/* KPI Strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card className={`${dbOk ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/40'}`}>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold mb-1">
                                <Database className={`w-3 h-3 ${dbOk ? 'text-emerald-300' : 'text-rose-300'}`} />
                                <span className={dbOk ? 'text-emerald-300' : 'text-rose-300'}>MongoDB</span>
                            </div>
                            <p className={`font-bold text-base flex items-center gap-2 ${dbOk ? 'text-emerald-300' : 'text-rose-300'}`}>
                                {dbOk ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                {dbOk ? 'Online' : 'Offline'}
                            </p>
                            <p className={`text-xs mt-1 ${latencyColor(dbLatency)}`} data-testid="db-latency">
                                {dbLatency >= 0 ? `${dbLatency}ms ping` : 'sin respuesta'}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className={`${maintEnabled ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-900/70 border-slate-800'}`}>
                        <CardContent className="p-4">
                            <div className={`flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold mb-1 ${maintEnabled ? 'text-amber-300' : 'text-slate-400'}`}>
                                <AlertOctagon className="w-3 h-3" />
                                Mantenimiento
                            </div>
                            <p className={`font-bold text-base ${maintEnabled ? 'text-amber-300' : 'text-slate-300'}`}>
                                {maintEnabled ? 'ACTIVO' : 'Desactivado'}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1">
                                Toggle en <a href="/admin/health" className="text-cyan-400 hover:underline">/admin/health</a>
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="bg-cyan-500/5 border-cyan-500/30">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-cyan-300 font-bold mb-1">
                                <Activity className="w-3 h-3" /> Requests Admin
                            </div>
                            <p className="text-cyan-300 font-bold text-base tabular-nums">{adminReqs.count_1h || 0} <span className="text-xs text-slate-500">/ 1h</span></p>
                            <p className="text-[10px] text-slate-500 mt-1">{adminReqs.count_24h || 0} en 24h · avg {adminReqs.avg_latency_1h_ms || 0}ms</p>
                        </CardContent>
                    </Card>

                    <Card className={`${(adminReqs.errors_24h || 0) > 0 || (clientErr.count_24h || 0) > 0 ? 'bg-rose-500/5 border-rose-500/30' : 'bg-emerald-500/5 border-emerald-500/30'}`}>
                        <CardContent className="p-4">
                            <div className={`flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold mb-1 ${(adminReqs.errors_24h || 0) > 0 || (clientErr.count_24h || 0) > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                                <Bug className="w-3 h-3" /> Errores 24h
                            </div>
                            <p className={`font-bold text-base tabular-nums ${(adminReqs.errors_24h || 0) > 0 || (clientErr.count_24h || 0) > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                                {(adminReqs.errors_24h || 0) + (clientErr.count_24h || 0)}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1">
                                {adminReqs.errors_24h || 0} backend · {clientErr.count_24h || 0} frontend
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Admin requests log */}
                <Card className="bg-slate-900/70 border-slate-800">
                    <CardHeader className="border-b border-slate-800 pb-3">
                        <CardTitle className="text-white text-base font-bold flex items-center gap-2">
                            <Activity className="w-5 h-5 text-cyan-400" />
                            Últimos {logs.length} requests admin
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {logs.length === 0 ? (
                            <p className="text-center text-slate-500 text-sm py-8">Sin requests registrados aún</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[760px] text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                                            <th className="text-left p-3 font-semibold whitespace-nowrap">Hora</th>
                                            <th className="text-left p-3 font-semibold whitespace-nowrap">Método</th>
                                            <th className="text-left p-3 font-semibold">Path</th>
                                            <th className="text-right p-3 font-semibold whitespace-nowrap">Status</th>
                                            <th className="text-right p-3 font-semibold whitespace-nowrap">Latencia</th>
                                            <th className="text-left p-3 font-semibold whitespace-nowrap">IP</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map(log => (
                                            <tr key={log.id} className="border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors" data-testid={`log-row-${log.id}`}>
                                                <td className="p-2.5 whitespace-nowrap text-slate-400 text-xs font-mono">
                                                    {fmtTime(log.created_at)}
                                                </td>
                                                <td className="p-2.5 whitespace-nowrap">
                                                    <span className="text-cyan-300 font-mono text-[10px] font-bold">{log.method}</span>
                                                </td>
                                                <td className="p-2.5 text-slate-300 text-xs font-mono truncate max-w-[280px]" title={log.path}>
                                                    {log.path}
                                                </td>
                                                <td className="p-2.5 whitespace-nowrap text-right">
                                                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${statusColor(log.status)}`}>
                                                        {log.status}
                                                    </span>
                                                </td>
                                                <td className={`p-2.5 whitespace-nowrap text-right tabular-nums text-xs ${latencyColor(log.elapsed_ms)}`}>
                                                    {log.elapsed_ms}ms
                                                </td>
                                                <td className="p-2.5 whitespace-nowrap text-[11px] text-slate-500 font-mono">
                                                    {log.ip || '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Client errors */}
                <Card className={`${(clientErr.recent || []).length > 0 ? 'bg-rose-500/5 border-rose-500/30' : 'bg-slate-900/70 border-slate-800'}`}>
                    <CardHeader className="border-b border-slate-800 pb-3">
                        <CardTitle className="text-white text-base font-bold flex items-center gap-2">
                            <Bug className="w-5 h-5 text-rose-400" />
                            Errores frontend recientes ({(clientErr.recent || []).length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                        {(clientErr.recent || []).length === 0 ? (
                            <div className="text-center py-6">
                                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
                                <p className="text-emerald-300 text-sm font-medium">Sin errores reportados</p>
                                <p className="text-[10px] text-slate-500 mt-1">Los errores JS no manejados se capturan automáticamente</p>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                                {(clientErr.recent || []).map(err => (
                                    <div key={err.id} className="p-3 rounded-lg bg-slate-950/60 border border-slate-800" data-testid={`client-err-${err.id}`}>
                                        <div className="flex items-start justify-between gap-2 mb-1">
                                            <p className="text-rose-300 text-xs font-mono flex-1 break-all">{err.message}</p>
                                            <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">{fmtTime(err.created_at)}</span>
                                        </div>
                                        {err.component && (
                                            <p className="text-[10px] text-cyan-400 mt-1">@ {err.component}</p>
                                        )}
                                        {err.url && (
                                            <p className="text-[10px] text-slate-500 mt-1 truncate">{err.url}</p>
                                        )}
                                        {err.stack && (
                                            <details className="mt-2">
                                                <summary className="text-[10px] text-slate-400 cursor-pointer hover:text-cyan-400">Stack</summary>
                                                <pre className="text-[10px] text-slate-400 mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">{err.stack}</pre>
                                            </details>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <p className="text-center text-[10px] text-slate-600 font-mono">
                    Última actualización: {fmtTime(data?.timestamp)}
                </p>
            </div>
        </Layout>
    );
};

export default AdminSystemStatusPage;
