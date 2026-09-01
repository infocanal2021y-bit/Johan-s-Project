import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ScrollText, Search, Loader2, RefreshCw, Lock } from 'lucide-react';

const fmtDate = (d) => (d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');

const ACTION_LABELS = {
    created: { label: 'Solicitud creada', color: 'bg-cyan-500/15 text-cyan-400' },
    crypto_txid_submitted: { label: 'TxID declarado', color: 'bg-amber-500/15 text-amber-400' },
    crypto_confirmed: { label: 'Cripto confirmada', color: 'bg-emerald-500/15 text-emerald-400' },
    verify_amount: { label: 'Importe verificado', color: 'bg-emerald-500/15 text-emerald-400' },
    authorize: { label: 'Autorizado', color: 'bg-blue-500/15 text-blue-400' },
    advance: { label: 'Avance de estado', color: 'bg-violet-500/15 text-violet-400' },
    status_change: { label: 'Cambio de estado', color: 'bg-slate-500/15 text-slate-300' },
    request_documentation: { label: 'Documentación solicitada', color: 'bg-orange-500/15 text-orange-400' },
    internal_note: { label: 'Nota interna', color: 'bg-slate-500/15 text-slate-400' },
    reject: { label: 'Rechazado', color: 'bg-rose-500/15 text-rose-400' },
};

export default function AdminAuditHistoryPage() {
    const [data, setData] = useState({ logs: [], actions: [], total: 0 });
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [action, setAction] = useState('all');

    const load = useCallback(async (s = search, a = action) => {
        setLoading(true);
        try {
            const r = await adminAPI.getAuditHistory({ search: s || undefined, action: a });
            setData(r.data);
        } catch { /* noop */ }
        setLoading(false);
    }, [search, action]);

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [action]);

    return (
        <Layout>
            <div className="max-w-6xl mx-auto space-y-6" data-testid="admin-audit-history-page">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/25">
                            <ScrollText className="w-6 h-6 text-violet-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Historial de Auditoría</h1>
                            <p className="text-sm text-slate-400 font-light flex items-center gap-1.5">
                                <Lock className="w-3.5 h-3.5" /> Registro inmutable de operaciones de retiro · {data.total} entradas
                            </p>
                        </div>
                    </div>
                    <Button onClick={() => load()} variant="outline" className="border-slate-700 text-slate-300 bg-slate-900 hover:bg-slate-800" data-testid="audit-refresh-btn">
                        <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
                    </Button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-56">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && load()}
                            placeholder="Buscar por referencia, usuario, admin o TxID... (Enter)"
                            className="pl-9 bg-slate-950 border-slate-700 text-white"
                            data-testid="audit-search-input"
                        />
                    </div>
                    <Select value={action} onValueChange={setAction}>
                        <SelectTrigger className="w-56 bg-slate-950 border-slate-700 text-white" data-testid="audit-action-filter">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas las acciones</SelectItem>
                            {data.actions.map((a) => (
                                <SelectItem key={a} value={a}>{ACTION_LABELS[a]?.label || a}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {loading ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-violet-400 animate-spin" /></div>
                ) : data.logs.length === 0 ? (
                    <div className="text-center py-16 text-slate-500 text-sm" data-testid="audit-empty">No hay registros de auditoría.</div>
                ) : (
                    <div className="rounded-xl border border-slate-800 overflow-hidden">
                        <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-slate-950 z-10">
                                    <tr className="text-left text-slate-500 text-xs uppercase tracking-wider border-b border-slate-800">
                                        <th className="p-3">Fecha y hora</th>
                                        <th className="p-3">Acción</th>
                                        <th className="p-3">Referencia</th>
                                        <th className="p-3">Usuario</th>
                                        <th className="p-3">Administrador</th>
                                        <th className="p-3">Estado</th>
                                        <th className="p-3 text-right">Importe</th>
                                        <th className="p-3">Detalles</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.logs.map((l) => {
                                        const cfg = ACTION_LABELS[l.action] || { label: l.action, color: 'bg-slate-500/15 text-slate-400' };
                                        return (
                                            <tr key={l.id} className="border-b border-slate-800/50 hover:bg-slate-900/40 align-top" data-testid={`audit-row-${l.id}`}>
                                                <td className="p-3 text-slate-400 text-xs whitespace-nowrap">{fmtDate(l.created_at)}</td>
                                                <td className="p-3">
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.color}`}>{cfg.label}</span>
                                                </td>
                                                <td className="p-3 text-cyan-400 font-mono text-xs">{l.reference || '—'}</td>
                                                <td className="p-3 text-slate-300 text-xs">{l.user_name || '—'}</td>
                                                <td className="p-3 text-white text-xs font-medium">{l.admin_name || <span className="text-slate-600">Sistema</span>}</td>
                                                <td className="p-3 text-xs whitespace-nowrap">
                                                    {l.old_status || l.new_status ? (
                                                        <span className="text-slate-500">{l.old_status || '—'} <span className="text-slate-600">→</span> <span className="text-slate-300">{l.new_status || '—'}</span></span>
                                                    ) : '—'}
                                                </td>
                                                <td className="p-3 text-right text-slate-300 font-mono text-xs whitespace-nowrap">
                                                    {l.amount != null ? `${Number(l.amount).toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${l.currency || ''}` : '—'}
                                                </td>
                                                <td className="p-3 text-slate-500 text-xs max-w-72">
                                                    <span className="line-clamp-2" title={l.notes || ''}>{l.notes || '—'}</span>
                                                    {l.txid && <p className="text-slate-600 font-mono text-[10px] truncate" title={l.txid}>TxID: {l.txid}</p>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
