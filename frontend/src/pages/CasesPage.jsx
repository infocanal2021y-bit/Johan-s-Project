import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/ui/card';
import api from '../lib/api';
import { toast } from 'sonner';
import {
    Search, FileText, ChevronRight, Copy, Check, Loader2,
    Banknote, LifeBuoy, Unlock, FolderArchive, ShieldCheck,
    AlertCircle, Filter, RefreshCw,
} from 'lucide-react';


const ENTITY_META = {
    withdrawal:     { label: 'Retiro',            icon: Banknote,     color: '#10b981' },
    support_ticket: { label: 'Soporte',           icon: LifeBuoy,     color: '#06b6d4' },
    partial_unlock: { label: 'Liberación 40%',    icon: Unlock,       color: '#a78bfa' },
    mt5_deposit:    { label: 'Depósito MT5',      icon: ShieldCheck,  color: '#f59e0b' },
    vault_doc:      { label: 'Vault',             icon: FolderArchive, color: '#1973B8' },
};


const STATUS_BADGE = (status) => {
    const s = (status || '').toLowerCase();
    if (['completed', 'approved', 'resolved', 'closed'].includes(s)) {
        return { color: '#10b981', bg: 'bg-emerald-500/15', ring: 'ring-emerald-500/40', label: status };
    }
    if (['rejected', 'failed', 'expired'].includes(s)) {
        return { color: '#ef4444', bg: 'bg-rose-500/15', ring: 'ring-rose-500/40', label: status };
    }
    if (['in_review', 'compliance_review', 'transfer_in_progress', 'pending_payment', 'awaiting_code'].includes(s)) {
        return { color: '#f59e0b', bg: 'bg-amber-500/15', ring: 'ring-amber-500/40', label: status };
    }
    return { color: '#06b6d4', bg: 'bg-cyan-500/15', ring: 'ring-cyan-500/40', label: status || '—' };
};


const fmtDate = (iso) => {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
    } catch { return iso; }
};


export const CasesPage = () => {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [copiedCode, setCopiedCode] = useState(null);

    const load = async (silent = false) => {
        if (!silent) setLoading(true); else setRefreshing(true);
        try {
            const r = await api.get('/cases/me');
            setItems(r.data.items || []);
        } catch (err) {
            toast.error('No se pudieron cargar tus casos');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        let list = items;
        if (filter !== 'all') {
            list = list.filter(c => c.entity_type === filter);
        }
        const q = search.trim().toLowerCase();
        if (q) {
            list = list.filter(c =>
                (c.code || '').toLowerCase().includes(q)
                || (c.entity_ref || '').toLowerCase().includes(q)
                || (c.summary || '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [items, filter, search]);

    const counts = useMemo(() => {
        const c = { all: items.length };
        items.forEach(it => { c[it.entity_type] = (c[it.entity_type] || 0) + 1; });
        return c;
    }, [items]);

    const copyCode = async (code) => {
        try {
            await navigator.clipboard.writeText(code);
            setCopiedCode(code);
            setTimeout(() => setCopiedCode(null), 1500);
        } catch { /* ignore */ }
    };

    const lookupExact = async () => {
        const q = search.trim().toUpperCase();
        if (!/^PLB-\d{4}-\d{6}$/.test(q)) return;
        try {
            const r = await api.get(`/cases/lookup/${q}`);
            if (r.data?.nav_path) navigate(r.data.nav_path);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se encontró ese caso');
        }
    };

    return (
        <Layout>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <p className="text-[10.5px] uppercase tracking-[0.18em] text-cyan-300 font-bold">Mis Casos</p>
                        <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1.5">Bandeja de referencias PLB</h1>
                        <p className="text-slate-400 text-[13px] mt-1">
                            Todos los retiros, tickets de soporte y liberaciones que has generado, con su código único PLB-AAAA-XXXXXX para consultas rápidas.
                        </p>
                    </div>
                    <button
                        onClick={() => load(true)}
                        disabled={refreshing}
                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-slate-900 ring-1 ring-slate-700 hover:ring-cyan-500/50 text-slate-300 text-[12px] font-semibold disabled:opacity-50"
                        data-testid="cases-refresh-btn"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                        Actualizar
                    </button>
                </div>

                {/* Search + filters */}
                <Card className="p-3 bg-slate-900/60 ring-1 ring-slate-800 border-0">
                    <div className="flex items-stretch gap-2 mb-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') lookupExact(); }}
                                placeholder="Buscar por código (PLB-2026-…), referencia o palabra clave…"
                                className="w-full h-10 pl-10 pr-3 rounded-md bg-slate-950 ring-1 ring-slate-700 focus:ring-cyan-500 text-white text-[13px] outline-none font-mono"
                                data-testid="cases-search"
                            />
                        </div>
                    </div>

                    {/* Type tabs */}
                    <div className="flex flex-wrap gap-1.5" data-testid="cases-filters">
                        {[
                            { k: 'all', label: 'Todos' },
                            { k: 'withdrawal', label: 'Retiros' },
                            { k: 'support_ticket', label: 'Soporte' },
                            { k: 'partial_unlock', label: 'Liberación 40%' },
                            { k: 'mt5_deposit', label: 'Depósitos MT5' },
                            { k: 'vault_doc', label: 'Vault' },
                        ].map((t) => {
                            const active = filter === t.k;
                            const count = counts[t.k] || 0;
                            if (t.k !== 'all' && count === 0) return null;
                            return (
                                <button
                                    key={t.k}
                                    onClick={() => setFilter(t.k)}
                                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors inline-flex items-center gap-1 ${
                                        active
                                            ? 'bg-cyan-500/20 ring-1 ring-cyan-500/50 text-cyan-200'
                                            : 'bg-slate-900 ring-1 ring-slate-800 text-slate-400 hover:text-slate-200'
                                    }`}
                                    data-testid={`cases-filter-${t.k}`}
                                >
                                    {t.label}
                                    <span className={`text-[9.5px] tabular-nums ${active ? 'text-cyan-300' : 'text-slate-500'}`}>{count}</span>
                                </button>
                            );
                        })}
                    </div>
                </Card>

                {/* List */}
                {loading ? (
                    <div className="py-16 text-center" data-testid="cases-loading">
                        <Loader2 className="w-6 h-6 mx-auto animate-spin text-cyan-400" />
                        <p className="text-slate-400 text-[12px] mt-3">Cargando tus casos…</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <Card className="p-10 text-center bg-slate-900/60 ring-1 ring-slate-800 border-0" data-testid="cases-empty">
                        <FileText className="w-10 h-10 mx-auto text-slate-700 mb-3" />
                        <p className="text-slate-300 font-bold">Sin casos para mostrar</p>
                        <p className="text-slate-500 text-[12px] mt-1">
                            {search ? 'Prueba con otro código o palabra clave.' : 'Cuando inicies un retiro o abras un ticket aparecerá aquí.'}
                        </p>
                    </Card>
                ) : (
                    <ul className="space-y-2" data-testid="cases-list">
                        <AnimatePresence>
                            {filtered.map((c, i) => {
                                const meta = ENTITY_META[c.entity_type] || { label: c.type_label || '—', icon: FileText, color: '#94a3b8' };
                                const Sicon = meta.icon;
                                const badge = STATUS_BADGE(c.status);
                                return (
                                    <motion.li
                                        key={c.code}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.02 }}
                                        className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 hover:ring-cyan-500/40 transition-colors p-3 sm:p-4"
                                        data-testid={`case-row-${c.code}`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: meta.color + '20', boxShadow: `inset 0 0 0 1px ${meta.color}40` }}>
                                                    <Sicon className="w-4 h-4" style={{ color: meta.color }} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <button
                                                            onClick={() => copyCode(c.code)}
                                                            className="inline-flex items-center gap-1 font-mono text-[12px] font-bold text-cyan-300 hover:text-cyan-200 group"
                                                            title="Copiar código"
                                                            data-testid={`case-copy-${c.code}`}
                                                        >
                                                            {c.code}
                                                            {copiedCode === c.code
                                                                ? <Check className="w-3 h-3 text-emerald-400" />
                                                                : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                                        </button>
                                                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">·</span>
                                                        <span className="text-[10.5px] uppercase tracking-wider font-bold" style={{ color: meta.color }}>
                                                            {meta.label}
                                                        </span>
                                                        {c.entity_ref && (
                                                            <>
                                                                <span className="text-[10px] text-slate-600">·</span>
                                                                <span className="text-[10.5px] text-slate-400 font-mono">{c.entity_ref}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                    <p className="text-slate-200 text-[12.5px] mt-1 leading-snug truncate">
                                                        {c.summary || 'Sin descripción'}
                                                    </p>
                                                    <p className="text-slate-500 text-[10.5px] mt-1">
                                                        {fmtDate(c.created_at)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                                <span className={`px-2 py-0.5 rounded-full ring-1 text-[10px] font-bold uppercase tracking-wider ${badge.bg} ${badge.ring}`} style={{ color: badge.color }}>
                                                    {badge.label}
                                                </span>
                                                {c.nav_path && (
                                                    <Link
                                                        to={c.nav_path}
                                                        className="inline-flex items-center gap-1 text-[10.5px] text-cyan-300 hover:text-cyan-200 font-bold"
                                                        data-testid={`case-view-${c.code}`}
                                                    >
                                                        Ver detalle <ChevronRight className="w-3 h-3" />
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    </motion.li>
                                );
                            })}
                        </AnimatePresence>
                    </ul>
                )}

                <p className="text-[10px] text-slate-600 text-center mt-4">
                    Cada caso PLB-AAAA-XXXXXX es único y permanente. Cítalo cuando contactes con soporte para acelerar la atención.
                </p>
            </div>
        </Layout>
    );
};


export default CasesPage;
