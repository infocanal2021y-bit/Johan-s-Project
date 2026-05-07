import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
    FileText, Download, Filter, Loader2, RefreshCw,
    ArrowDownCircle, ArrowUpCircle, X,
    DollarSign, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { safeApiCall } from '../../lib/diagnostics';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const fmtMoney = (amount, currency) => {
    const sym = currency === 'EUR' ? '€' : '$';
    return `${sym}${(Number(amount) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

export const AdminOpsPage = () => {
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [data, setData] = useState(null);

    // Filters
    const [type, setType] = useState('all');
    const [dateFrom, setDateFrom] = useState(daysAgoISO(90));
    const [dateTo, setDateTo] = useState(todayISO());
    const [adminId, setAdminId] = useState('all');
    const [userSearch, setUserSearch] = useState('');
    const [currency, setCurrency] = useState('all');
    const [minAmount, setMinAmount] = useState('');
    const [maxAmount, setMaxAmount] = useState('');
    const [reasonContains, setReasonContains] = useState('');
    const [page, setPage] = useState(0);
    const limit = 100;

    const buildQuery = useCallback(() => {
        const q = new URLSearchParams();
        if (type && type !== 'all') q.set('type', type);
        if (dateFrom) q.set('date_from', dateFrom);
        if (dateTo) q.set('date_to', dateTo);
        if (adminId && adminId !== 'all') q.set('admin_id', adminId);
        if (userSearch.trim()) q.set('user_search', userSearch.trim());
        if (currency && currency !== 'all') q.set('currency', currency);
        if (minAmount) q.set('min_amount', minAmount);
        if (maxAmount) q.set('max_amount', maxAmount);
        if (reasonContains.trim()) q.set('reason_contains', reasonContains.trim());
        return q;
    }, [type, dateFrom, dateTo, adminId, userSearch, currency, minAmount, maxAmount, reasonContains]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const q = buildQuery();
        q.set('skip', String(page * limit));
        q.set('limit', String(limit));
        const result = await safeApiCall({
            url: `/api/admin/admin-ops?${q.toString()}`,
            method: 'GET',
            timeoutMs: 15000,
        });
        setLoading(false);
        if (result.ok) {
            setData(result.data);
        } else {
            toast.error(result.message, { description: `[${result.kind} · HTTP ${result.status}]`, duration: 8000 });
        }
    }, [buildQuery, page]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleExport = async () => {
        setExporting(true);
        try {
            const q = buildQuery();
            const token = localStorage.getItem('token');
            const resp = await fetch(`${API_URL}/api/admin/admin-ops/export.csv?${q.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!resp.ok) {
                toast.error(`Error al exportar (HTTP ${resp.status})`);
                return;
            }
            const blob = await resp.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const today = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
            a.download = `admin_ops_${today}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success(`CSV descargado · ${data?.total || 0} operaciones`);
        } catch (e) {
            toast.error(`Fallo al descargar: ${e.message}`);
        } finally {
            setExporting(false);
        }
    };

    const resetFilters = () => {
        setType('all');
        setDateFrom(daysAgoISO(90));
        setDateTo(todayISO());
        setAdminId('all');
        setUserSearch('');
        setCurrency('all');
        setMinAmount('');
        setMaxAmount('');
        setReasonContains('');
        setPage(0);
    };

    const totals = data?.totals || {};
    const rows = data?.rows || [];
    const adminOptions = data?.admin_options || [];
    const total = data?.total || 0;
    const hasMore = data?.pagination?.has_more;

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-5" data-testid="admin-ops-page">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl sm:text-3xl text-white font-bold tracking-tight flex items-center gap-2">
                            <FileText className="w-7 h-7 text-amber-400" />
                            Auditoría Admin · Débitos & Créditos
                        </h1>
                        <p className="text-slate-500 mt-1 text-sm">
                            Ledger completo de operaciones administrativas para reportes trimestrales y compliance
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={fetchData} variant="outline" className="border-slate-700 hover:bg-slate-800" data-testid="ops-refresh-btn">
                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refrescar
                        </Button>
                        <Button onClick={handleExport} disabled={exporting || total === 0}
                            className="bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-40"
                            data-testid="ops-export-csv-btn">
                            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                            Exportar CSV ({total})
                        </Button>
                    </div>
                </motion.div>

                {/* Totals KPI strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card className="bg-emerald-500/5 border-emerald-500/30">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-emerald-300 font-bold mb-1">
                                <ArrowUpCircle className="w-3 h-3" /> Acreditado
                            </div>
                            <p className="text-emerald-300 font-bold text-base tabular-nums">{fmtMoney(totals.sum_credit_usd, 'USD')}</p>
                            <p className="text-emerald-400/70 text-xs tabular-nums">{fmtMoney(totals.sum_credit_eur, 'EUR')}</p>
                            <p className="text-[10px] text-slate-500 mt-1">{totals.count_credit || 0} operaciones</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-rose-500/5 border-rose-500/30">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-rose-300 font-bold mb-1">
                                <ArrowDownCircle className="w-3 h-3" /> Debitado
                            </div>
                            <p className="text-rose-300 font-bold text-base tabular-nums">{fmtMoney(totals.sum_debit_usd, 'USD')}</p>
                            <p className="text-rose-400/70 text-xs tabular-nums">{fmtMoney(totals.sum_debit_eur, 'EUR')}</p>
                            <p className="text-[10px] text-slate-500 mt-1">{totals.count_debit || 0} operaciones</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-cyan-500/5 border-cyan-500/30">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-cyan-300 font-bold mb-1">
                                <DollarSign className="w-3 h-3" /> Neto USD
                            </div>
                            <p className={`font-bold text-base tabular-nums ${(totals.net_usd || 0) >= 0 ? 'text-cyan-300' : 'text-rose-300'}`}>
                                {fmtMoney(totals.net_usd, 'USD')}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1">crédito − débito</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-cyan-500/5 border-cyan-500/30">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-cyan-300 font-bold mb-1">
                                <DollarSign className="w-3 h-3" /> Neto EUR
                            </div>
                            <p className={`font-bold text-base tabular-nums ${(totals.net_eur || 0) >= 0 ? 'text-cyan-300' : 'text-rose-300'}`}>
                                {fmtMoney(totals.net_eur, 'EUR')}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1">crédito − débito</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Filters */}
                <Card className="bg-slate-900/70 border-slate-800">
                    <CardHeader className="border-b border-slate-800 pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-white flex items-center gap-2 text-base font-bold">
                                <Filter className="w-5 h-5 text-cyan-400" />
                                Filtros
                            </CardTitle>
                            <Button onClick={resetFilters} variant="ghost" size="sm" className="text-slate-400 hover:text-white text-xs h-8" data-testid="ops-reset-filters">
                                <X className="w-3 h-3 mr-1" /> Limpiar
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div>
                                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">Tipo</label>
                                <Select value={type} onValueChange={(v) => { setType(v); setPage(0); }}>
                                    <SelectTrigger className="bg-slate-950 border-slate-800 text-white" data-testid="ops-filter-type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-700">
                                        <SelectItem value="all">Todos</SelectItem>
                                        <SelectItem value="debit">Solo Débitos</SelectItem>
                                        <SelectItem value="credit">Solo Créditos</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">Desde</label>
                                <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                                    className="bg-slate-950 border-slate-800 text-white" data-testid="ops-filter-from" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">Hasta</label>
                                <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                                    className="bg-slate-950 border-slate-800 text-white" data-testid="ops-filter-to" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">Admin que ejecutó</label>
                                <Select value={adminId} onValueChange={(v) => { setAdminId(v); setPage(0); }}>
                                    <SelectTrigger className="bg-slate-950 border-slate-800 text-white" data-testid="ops-filter-admin">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-700">
                                        <SelectItem value="all">Todos los Admins</SelectItem>
                                        {adminOptions.map(a => (
                                            <SelectItem key={a.admin_id} value={a.admin_id}>{a.admin_name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="lg:col-span-2">
                                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">Buscar usuario (nombre / email)</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                    <Input value={userSearch} onChange={(e) => { setUserSearch(e.target.value); setPage(0); }}
                                        placeholder="Eduardo, eduardo@test.com..."
                                        className="bg-slate-950 border-slate-800 text-white pl-9" data-testid="ops-filter-user" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">Moneda</label>
                                <Select value={currency} onValueChange={(v) => { setCurrency(v); setPage(0); }}>
                                    <SelectTrigger className="bg-slate-950 border-slate-800 text-white" data-testid="ops-filter-currency">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-700">
                                        <SelectItem value="all">Todas</SelectItem>
                                        <SelectItem value="USD">USD</SelectItem>
                                        <SelectItem value="EUR">EUR</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">Monto min</label>
                                    <Input type="number" min="0" step="0.01" value={minAmount} onChange={(e) => { setMinAmount(e.target.value); setPage(0); }}
                                        placeholder="0" className="bg-slate-950 border-slate-800 text-white" data-testid="ops-filter-min" />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">Monto máx</label>
                                    <Input type="number" min="0" step="0.01" value={maxAmount} onChange={(e) => { setMaxAmount(e.target.value); setPage(0); }}
                                        placeholder="∞" className="bg-slate-950 border-slate-800 text-white" data-testid="ops-filter-max" />
                                </div>
                            </div>
                            <div className="lg:col-span-3">
                                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">Buscar en motivo / descripción</label>
                                <Input value={reasonContains} onChange={(e) => { setReasonContains(e.target.value); setPage(0); }}
                                    placeholder="Mantenimiento, reversión, ajuste..."
                                    className="bg-slate-950 border-slate-800 text-white" data-testid="ops-filter-reason" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Table */}
                <Card className="bg-slate-900/70 border-slate-800">
                    <CardHeader className="border-b border-slate-800 pb-3">
                        <CardTitle className="text-white text-base font-bold flex items-center gap-2">
                            <FileText className="w-5 h-5 text-amber-400" />
                            Operaciones · {total.toLocaleString('es-ES')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {loading && rows.length === 0 ? (
                            <div className="py-16 flex items-center justify-center">
                                <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
                            </div>
                        ) : rows.length === 0 ? (
                            <div className="py-16 text-center text-slate-500 text-sm">
                                Sin resultados con los filtros actuales.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[860px] text-sm" data-testid="ops-table">
                                    <thead>
                                        <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                                            <th className="text-left p-3 font-semibold whitespace-nowrap">Fecha</th>
                                            <th className="text-left p-3 font-semibold whitespace-nowrap">Tipo</th>
                                            <th className="text-left p-3 font-semibold whitespace-nowrap">Usuario</th>
                                            <th className="text-right p-3 font-semibold whitespace-nowrap">Monto</th>
                                            <th className="text-left p-3 font-semibold">Motivo</th>
                                            <th className="text-left p-3 font-semibold whitespace-nowrap">Admin</th>
                                            <th className="text-right p-3 font-semibold whitespace-nowrap">Saldo Después</th>
                                            <th className="text-left p-3 font-semibold whitespace-nowrap">Ref.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((r) => {
                                            const isDebit = r.transaction_type === 'admin_debit';
                                            return (
                                                <tr key={r.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                                                    data-testid={`ops-row-${r.id}`}>
                                                    <td className="p-3 whitespace-nowrap text-slate-300 text-xs font-mono">
                                                        {new Date(r.created_at).toLocaleString('es-ES', {
                                                            day: '2-digit', month: 'short', year: '2-digit',
                                                            hour: '2-digit', minute: '2-digit'
                                                        })}
                                                    </td>
                                                    <td className="p-3 whitespace-nowrap">
                                                        {isDebit ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                                                <ArrowDownCircle className="w-3 h-3" /> DÉBITO
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                                                <ArrowUpCircle className="w-3 h-3" /> CRÉDITO
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 whitespace-nowrap">
                                                        <p className="text-white font-medium text-xs">{r.user_name || '—'}</p>
                                                        <p className="text-[10px] text-slate-500">{r.user_email}</p>
                                                    </td>
                                                    <td className={`p-3 whitespace-nowrap text-right tabular-nums font-bold ${isDebit ? 'text-rose-300' : 'text-emerald-300'}`}>
                                                        {isDebit ? '-' : '+'}{fmtMoney(r.amount, r.currency)}
                                                    </td>
                                                    <td className="p-3 text-slate-300 text-xs max-w-[280px]">
                                                        {r.reason || r.description || '—'}
                                                    </td>
                                                    <td className="p-3 whitespace-nowrap text-cyan-300 text-xs">
                                                        {r.admin_name || '—'}
                                                    </td>
                                                    <td className="p-3 whitespace-nowrap text-right tabular-nums text-slate-400 text-xs">
                                                        {r.balance_after != null ? fmtMoney(r.balance_after, r.currency) : '—'}
                                                    </td>
                                                    <td className="p-3 whitespace-nowrap font-mono text-[10px] text-slate-500">
                                                        {r.transaction_reference || '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Pagination */}
                {total > limit && (
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">
                            Mostrando {page * limit + 1}–{Math.min((page + 1) * limit, total)} de {total}
                        </span>
                        <div className="flex gap-2">
                            <Button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                                variant="outline" size="sm" className="border-slate-700">Anterior</Button>
                            <Button onClick={() => setPage(page + 1)} disabled={!hasMore}
                                variant="outline" size="sm" className="border-slate-700">Siguiente</Button>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default AdminOpsPage;
