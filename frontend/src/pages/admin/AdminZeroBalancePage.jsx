import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../../components/layout/Layout';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
    UserX, Search, Loader2, Archive, RotateCcw, ScrollText,
    Users, AlertTriangle, TrendingUp, RefreshCw, CheckSquare, Square,
} from 'lucide-react';
import { toast } from 'sonner';

const fmtDate = (d) => (d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtEur = (n) => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 });

const STATUS_BADGE = {
    archived: 'bg-slate-500/15 text-slate-400',
    suspended: 'bg-rose-500/15 text-rose-400',
    active: 'bg-emerald-500/15 text-emerald-400',
};

const IndicatorConfigCard = () => {
    const [cfg, setCfg] = useState(null);
    const [auto, setAuto] = useState(null);
    const [saving, setSaving] = useState(false);
    const [mode, setMode] = useState('auto');
    const [manualTotal, setManualTotal] = useState('');
    const [manualUsers, setManualUsers] = useState('');

    const load = useCallback(() => {
        api.get('/admin/credited-funds-config').then((r) => {
            setCfg(r.data.config);
            setAuto(r.data.auto_metrics);
            setMode(r.data.config?.mode || 'auto');
            if (r.data.config?.manual_total != null) setManualTotal(String(r.data.config.manual_total));
            if (r.data.config?.manual_users_count != null) setManualUsers(String(r.data.config.manual_users_count));
        }).catch(() => {});
    }, []);

    useEffect(() => { load(); }, [load]);

    const save = async () => {
        setSaving(true);
        try {
            await api.post('/admin/credited-funds-config', {
                mode,
                manual_total: mode === 'manual' ? parseFloat(manualTotal || '0') : null,
                manual_users_count: mode === 'manual' ? parseInt(manualUsers || '0', 10) : null,
            });
            toast.success('Configuración del indicador guardada');
            load();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al guardar');
        }
        setSaving(false);
    };

    return (
        <div className="p-5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] space-y-4" data-testid="credited-funds-config-card">
            <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                <h2 className="text-white font-semibold">Indicador público · Fondos acreditados</h2>
            </div>
            {auto && (
                <p className="text-slate-400 text-sm">
                    Cálculo automático actual: <span className="text-white font-bold">{fmtEur(auto.total_credited)} €</span> · <span className="text-cyan-400">{auto.users_count}</span> usuarios con saldo
                </p>
            )}
            <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                    <label className="text-xs text-slate-500">Modo</label>
                    <Select value={mode} onValueChange={setMode}>
                        <SelectTrigger className="w-44 bg-slate-950 border-slate-700 text-white" data-testid="funds-mode-select">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="auto">Automático (tiempo real)</SelectItem>
                            <SelectItem value="manual">Ajuste manual</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {mode === 'manual' && (
                    <>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-500">Total (EUR)</label>
                            <Input value={manualTotal} onChange={(e) => setManualTotal(e.target.value)} type="number" className="w-44 bg-slate-950 border-slate-700 text-white" data-testid="funds-manual-total-input" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-500">Nº usuarios</label>
                            <Input value={manualUsers} onChange={(e) => setManualUsers(e.target.value)} type="number" className="w-32 bg-slate-950 border-slate-700 text-white" data-testid="funds-manual-users-input" />
                        </div>
                    </>
                )}
                <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="funds-config-save-btn">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
                </Button>
            </div>
            {cfg?.updated_at && (
                <p className="text-slate-600 text-xs">Última modificación: {fmtDate(cfg.updated_at)} por {cfg.updated_by_name || '—'}</p>
            )}
        </div>
    );
};

export default function AdminZeroBalancePage() {
    const [data, setData] = useState({ users: [], stats: {} });
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [selected, setSelected] = useState(new Set());
    const [archiveOpen, setArchiveOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [processing, setProcessing] = useState(false);
    const [auditLogs, setAuditLogs] = useState(null);

    const load = useCallback(async (s = search, st = statusFilter) => {
        setLoading(true);
        try {
            const r = await api.get('/admin/zero-balance-users', { params: { search: s || undefined, status: st } });
            setData(r.data);
            setSelected(new Set());
        } catch { /* noop */ }
        setLoading(false);
    }, [search, statusFilter]);

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);

    const toggleAll = () => {
        const selectable = data.users.filter((u) => u.account_status !== 'archived');
        if (selected.size === selectable.length && selectable.length > 0) setSelected(new Set());
        else setSelected(new Set(selectable.map((u) => u.id)));
    };

    const toggle = (id) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelected(next);
    };

    const archive = async () => {
        setProcessing(true);
        try {
            const r = await api.post('/admin/zero-balance-users/archive', { user_ids: [...selected], reason });
            toast.success(r.data.message);
            if (r.data.skipped?.length) toast.warning(`${r.data.skipped.length} usuario(s) omitidos (validación)`);
            setArchiveOpen(false);
            setReason('');
            load();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al archivar');
        }
        setProcessing(false);
    };

    const restore = async (ids) => {
        try {
            const r = await api.post('/admin/zero-balance-users/restore', { user_ids: ids });
            toast.success(r.data.message);
            load();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al restaurar');
        }
    };

    const loadAudit = async () => {
        if (auditLogs) { setAuditLogs(null); return; }
        const r = await api.get('/admin/zero-balance-users/audit-log');
        setAuditLogs(r.data.logs);
    };

    const stats = data.stats || {};

    return (
        <Layout>
            <div className="max-w-6xl mx-auto space-y-6" data-testid="admin-zero-balance-page">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/25">
                            <UserX className="w-6 h-6 text-cyan-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Usuarios con Saldo Cero</h1>
                            <p className="text-sm text-slate-400 font-light">Gestión, archivado con trazabilidad e indicador público de fondos</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={loadAudit} variant="outline" className="border-slate-700 text-slate-300 bg-slate-900 hover:bg-slate-800" data-testid="audit-log-btn">
                            <ScrollText className="w-4 h-4 mr-2" /> {auditLogs ? 'Ocultar registro' : 'Registro de acciones'}
                        </Button>
                        <Button onClick={() => load()} variant="outline" className="border-slate-700 text-slate-300 bg-slate-900 hover:bg-slate-800" data-testid="refresh-zero-balance-btn">
                            <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
                        </Button>
                    </div>
                </div>

                <IndicatorConfigCard />

                {auditLogs && (
                    <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-2 max-h-72 overflow-y-auto" data-testid="audit-log-panel">
                        <p className="text-white text-sm font-semibold">Registro de acciones (trazabilidad)</p>
                        {auditLogs.length === 0 ? (
                            <p className="text-slate-500 text-xs">Sin acciones registradas.</p>
                        ) : auditLogs.map((l) => (
                            <div key={l.id} className="text-xs text-slate-400 border-b border-slate-800/60 pb-1.5">
                                <span className={l.action === 'archive' ? 'text-amber-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                                    {l.action === 'archive' ? 'ARCHIVADO' : 'RESTAURADO'}
                                </span>{' '}
                                · {l.user_name} ({l.user_email}) · por <span className="text-white">{l.admin_name}</span> · {fmtDate(l.created_at)}
                                {l.reason && <span className="text-slate-500"> · Motivo: {l.reason}</span>}
                            </div>
                        ))}
                    </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="zero-balance-stats">
                    {[
                        { label: 'Total saldo cero', value: stats.total || 0, icon: Users, color: 'text-cyan-400' },
                        { label: 'Activos', value: stats.active || 0, icon: AlertTriangle, color: 'text-amber-400' },
                        { label: 'Archivados', value: stats.archived || 0, icon: Archive, color: 'text-slate-400' },
                        { label: 'Nunca accedieron', value: stats.never_logged_in || 0, icon: UserX, color: 'text-rose-400' },
                    ].map((s) => (
                        <div key={s.label} className="p-4 rounded-xl border border-slate-800 bg-slate-950/60">
                            <s.icon className={`w-4 h-4 ${s.color} mb-2`} />
                            <p className="text-white text-2xl font-bold tabular-nums">{Number(s.value).toLocaleString('es-ES')}</p>
                            <p className="text-slate-500 text-xs">{s.label}</p>
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-56">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && load()}
                            placeholder="Buscar por nombre o email... (Enter)"
                            className="pl-9 bg-slate-950 border-slate-700 text-white"
                            data-testid="zero-balance-search-input"
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-44 bg-slate-950 border-slate-700 text-white" data-testid="zero-balance-status-filter">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los estados</SelectItem>
                            <SelectItem value="active">Activos</SelectItem>
                            <SelectItem value="archived">Archivados</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        onClick={() => setArchiveOpen(true)}
                        disabled={selected.size === 0}
                        className="bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-40"
                        data-testid="bulk-archive-btn"
                    >
                        <Archive className="w-4 h-4 mr-2" /> Archivar seleccionados ({selected.size})
                    </Button>
                </div>

                {loading ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-cyan-400 animate-spin" /></div>
                ) : data.users.length === 0 ? (
                    <div className="text-center py-16 text-slate-500 text-sm" data-testid="zero-balance-empty">No se encontraron usuarios con saldo cero.</div>
                ) : (
                    <div className="rounded-xl border border-slate-800 overflow-hidden">
                        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-slate-950 z-10">
                                    <tr className="text-left text-slate-500 text-xs uppercase tracking-wider border-b border-slate-800">
                                        <th className="p-3 w-10">
                                            <button onClick={toggleAll} className="text-slate-400 hover:text-white" data-testid="select-all-btn">
                                                {selected.size > 0 ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                            </button>
                                        </th>
                                        <th className="p-3">Usuario</th>
                                        <th className="p-3">Estado</th>
                                        <th className="p-3">Registro</th>
                                        <th className="p-3">Último acceso</th>
                                        <th className="p-3 text-right">Saldo</th>
                                        <th className="p-3"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.users.map((u) => {
                                        const isArchived = u.account_status === 'archived';
                                        return (
                                            <tr key={u.id} className={`border-b border-slate-800/50 hover:bg-slate-900/40 ${isArchived ? 'opacity-60' : ''}`} data-testid={`zero-balance-row-${u.id}`}>
                                                <td className="p-3">
                                                    {!isArchived && (
                                                        <button onClick={() => toggle(u.id)} className="text-slate-400 hover:text-white" data-testid={`select-user-${u.id}`}>
                                                            {selected.has(u.id) ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4" />}
                                                        </button>
                                                    )}
                                                </td>
                                                <td className="p-3">
                                                    <p className="text-white font-medium">{u.name}</p>
                                                    <p className="text-slate-500 text-xs">{u.email}</p>
                                                </td>
                                                <td className="p-3">
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[u.account_status] || 'bg-cyan-500/15 text-cyan-400'}`}>
                                                        {u.account_status || 'active'}
                                                    </span>
                                                    {isArchived && u.archive_reason && (
                                                        <p className="text-slate-600 text-[10px] mt-0.5 max-w-48 truncate" title={u.archive_reason}>
                                                            {u.archive_reason} · {u.archived_by_name}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="p-3 text-slate-400 text-xs">{fmtDate(u.created_at)}</td>
                                                <td className="p-3 text-slate-400 text-xs">{u.last_active || u.first_login_at ? fmtDate(u.last_active || u.first_login_at) : <span className="text-rose-400/70">Nunca</span>}</td>
                                                <td className="p-3 text-right text-slate-300 font-mono tabular-nums">{fmtEur(u.total_eur)} €</td>
                                                <td className="p-3 text-right">
                                                    {isArchived && (
                                                        <Button size="sm" variant="outline" onClick={() => restore([u.id])} className="border-slate-700 text-emerald-400 bg-transparent hover:bg-slate-800 h-7 text-xs" data-testid={`restore-user-${u.id}`}>
                                                            <RotateCcw className="w-3 h-3 mr-1" /> Restaurar
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
                    <DialogContent className="bg-slate-950 border-slate-800 text-white" data-testid="archive-confirm-dialog">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2"><Archive className="w-5 h-5 text-amber-400" /> Archivar {selected.size} usuario(s)</DialogTitle>
                            <DialogDescription className="text-slate-400">
                                Se validará que cada usuario tenga saldo cero antes de archivarlo. La acción queda registrada con su nombre, fecha y motivo (trazabilidad). Los usuarios archivados pueden restaurarse.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2">
                            <label className="text-sm text-slate-300">Motivo del archivado <span className="text-rose-400">*</span></label>
                            <Textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Ej: Cuenta inactiva sin saldo desde importación FX2026"
                                className="bg-slate-900 border-slate-700 text-white"
                                data-testid="archive-reason-input"
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setArchiveOpen(false)} className="border-slate-700 text-slate-300 bg-transparent hover:bg-slate-800">Cancelar</Button>
                            <Button onClick={archive} disabled={processing || reason.trim().length < 5} className="bg-amber-600 hover:bg-amber-700 text-white" data-testid="archive-confirm-btn">
                                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar archivado'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </Layout>
    );
}
