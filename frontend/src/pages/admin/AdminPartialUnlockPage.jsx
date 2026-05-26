import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import api from '../../lib/api';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
    Unlock, CheckCircle2, XCircle, Clock, Loader2, ExternalLink,
    AlertTriangle, RefreshCw, ShieldCheck, Hash, Copy, Check,
    Filter, Mail, History,
} from 'lucide-react';

const fmtEUR = (n) => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const STATUS = {
    pending_payment: { label: 'Esperando pago', color: 'text-slate-300',   bg: 'bg-slate-500/15',   ring: 'ring-slate-500/30',   Icon: Clock },
    in_review:       { label: 'En revisión',     color: 'text-amber-300',   bg: 'bg-amber-500/15',   ring: 'ring-amber-500/30',   Icon: Loader2 },
    approved:        { label: 'Aprobado',        color: 'text-emerald-300', bg: 'bg-emerald-500/15', ring: 'ring-emerald-500/30', Icon: CheckCircle2 },
    rejected:        { label: 'Rechazado',       color: 'text-rose-300',    bg: 'bg-rose-500/15',    ring: 'ring-rose-500/30',    Icon: XCircle },
};

const FILTERS = [
    { id: 'in_review',       label: 'En revisión' },
    { id: 'pending_payment', label: 'Esperando pago' },
    { id: 'approved',        label: 'Aprobados' },
    { id: 'rejected',        label: 'Rechazados' },
    { id: 'all',             label: 'Todos' },
];

const KpiCard = ({ Icon, label, value, color, testId }) => (
    <Card className="p-4 bg-gradient-to-br from-slate-900/90 to-slate-950 border-slate-800/80" data-testid={testId}>
        <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center ring-1"
                style={{ backgroundColor: color + '22', color, borderColor: color + '55' }}>
                <Icon className="w-4 h-4" />
            </div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-bold">{label}</p>
        </div>
        <p className="text-white text-2xl font-mono tabular-nums font-bold" style={{ letterSpacing: '-0.02em' }}>
            {value}
        </p>
    </Card>
);

const CopyHash = ({ value }) => {
    const [c, setC] = useState(false);
    if (!value) return <span className="text-slate-600">—</span>;
    return (
        <button
            type="button"
            onClick={async (e) => {
                e.stopPropagation();
                try { await navigator.clipboard.writeText(value); setC(true); setTimeout(() => setC(false), 1500); toast.success('Hash copiado'); } catch (err) { console.error('[clipboard] copy failed', err); }
            }}
            data-no-hover
            className="inline-flex items-center gap-1 text-slate-300 font-mono text-[11px] hover:text-cyan-300 transition-colors"
            title={value}
        >
            {value.slice(0, 6)}…{value.slice(-6)}
            {c ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 opacity-60" />}
        </button>
    );
};


const AuditHistoryButton = ({ item }) => {
    const [open, setOpen] = useState(false);
    const log = Array.isArray(item.audit_log) ? item.audit_log : [];
    if (log.length === 0) return null;
    return (
        <>
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(true); }}
                className="ml-1.5 inline-flex items-center gap-1 text-[9.5px] text-cyan-400/80 hover:text-cyan-300 underline decoration-dotted"
                data-testid={`admin-unlock-history-btn-${item.id}`}
                title="Ver historial de cambios"
            >
                <History className="w-3 h-3" /> {log.length}
            </button>
            {open && (
                <div
                    className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
                    onClick={() => setOpen(false)}
                    data-testid={`admin-unlock-history-modal-${item.id}`}
                >
                    <div
                        className="w-full max-w-lg bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 ring-1 ring-cyan-500/30 rounded-2xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold">Historial de cambios</p>
                                <h3 className="text-white text-base font-bold mt-0.5">{item.user_email}</h3>
                                <p className="text-amber-300/90 text-[10px] font-mono mt-0.5">{item.payment_reference || item.id.slice(0, 8)}</p>
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="text-slate-400 hover:text-white p-1"
                                aria-label="Cerrar"
                            >
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-2.5">
                            {log.slice().reverse().map((row, i) => (
                                <div
                                    key={i}
                                    className="bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2.5"
                                    data-testid={`admin-unlock-history-row-${item.id}-${log.length - 1 - i}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-[10px] font-mono text-slate-500">{fmtDate(row.at)}</p>
                                        <span className={`text-[9.5px] px-1.5 py-0.5 rounded ring-1 font-bold uppercase ${
                                            row.actor_role === 'admin'
                                                ? 'bg-cyan-500/15 ring-cyan-500/30 text-cyan-300'
                                                : 'bg-slate-500/15 ring-slate-500/30 text-slate-300'
                                        }`}>
                                            {row.actor_role}
                                        </span>
                                    </div>
                                    <p className="text-white text-[12px] mt-1">
                                        <span className="text-slate-500">{row.previous_status || '—'}</span>
                                        <span className="text-slate-600 mx-1.5">→</span>
                                        <span className="font-bold">{row.new_status}</span>
                                    </p>
                                    <p className="text-slate-400 text-[10.5px] mt-0.5">
                                        Por <span className="text-slate-200">{row.actor_name || row.actor_email || '—'}</span>
                                    </p>
                                    {row.note && (
                                        <p className="text-slate-300 text-[10.5px] mt-1 italic border-l-2 border-cyan-500/40 pl-2">
                                            “{row.note}”
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};


export const AdminPartialUnlockPage = () => {
    const [items, setItems] = useState([]);
    const [counts, setCounts] = useState({ pending_payment: 0, in_review: 0, approved: 0, rejected: 0 });
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('in_review');
    const [busyId, setBusyId] = useState(null);
    const [rejectFor, setRejectFor] = useState(null); // { id, note }
    const [search, setSearch] = useState('');

    const load = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const r = await api.get('/admin/partial-unlock/queue', { params: { status: filter } });
            setItems(r.data?.items || []);
            setCounts(r.data?.counts || {});
        } catch (e) {
            if (!silent) toast.error('Error al cargar la cola');
        } finally { setLoading(false); }
    }, [filter]);

    useEffect(() => {
        load();
        const id = setInterval(() => load(true), 20000);
        return () => clearInterval(id);
    }, [load]);

    const approve = async (item) => {
        if (!window.confirm(`¿Aprobar el desbloqueo del 40% para ${item.user_email}? Se habilitará un retiro de hasta €${fmtEUR(item.max_withdraw_eur_snapshot)}.`)) return;
        setBusyId(item.id);
        try {
            await api.post(`/admin/partial-unlock/${item.id}/approve`);
            toast.success('Solicitud aprobada · usuario notificado');
            await load(true);
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al aprobar');
        } finally { setBusyId(null); }
    };

    const submitReject = async () => {
        if (!rejectFor) return;
        if (!rejectFor.note.trim()) { toast.error('Indica un motivo'); return; }
        setBusyId(rejectFor.id);
        try {
            await api.post(`/admin/partial-unlock/${rejectFor.id}/reject`, { admin_note: rejectFor.note.trim() });
            toast.success('Solicitud rechazada · usuario notificado');
            setRejectFor(null);
            await load(true);
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al rechazar');
        } finally { setBusyId(null); }
    };

    const totalEurInQueue = items
        .filter(i => i.status === 'in_review')
        .reduce((s, i) => s + (i.required_eur || 2660), 0);

    return (
        <Layout>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto p-3 sm:p-5 space-y-5" data-testid="admin-partial-unlock-page">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/25 to-cyan-700/15 ring-1 ring-cyan-500/40 flex items-center justify-center">
                            <Unlock className="w-5 h-5 text-cyan-200" strokeWidth={2.4} />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300 font-bold">Cumplimiento · Validación</p>
                            <h1 className="text-2xl sm:text-3xl text-white font-bold" style={{ letterSpacing: '-0.02em' }}>
                                Desbloqueos 40% · Cola de validación
                            </h1>
                            <p className="text-slate-400 text-[12px] sm:text-sm mt-1 max-w-2xl">
                                Validación manual de pagos de activación (USDT TRC20 · €2.660). Procesado por orden FIFO de prioridad.
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => load()} className="border-slate-700 text-slate-300 hover:bg-slate-800 h-9" data-testid="admin-unlock-refresh">
                        <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refrescar
                    </Button>
                </div>

                {/* KPI strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KpiCard Icon={Loader2} label="En revisión"     color="#f0b90b" value={counts.in_review || 0}       testId="kpi-in-review" />
                    <KpiCard Icon={Clock}   label="Esperando pago"  color="#94a3b8" value={counts.pending_payment || 0} testId="kpi-pending-payment" />
                    <KpiCard Icon={CheckCircle2} label="Aprobados (total)" color="#0ecb81" value={counts.approved || 0} testId="kpi-approved" />
                    <KpiCard Icon={ShieldCheck}  label="EUR por validar"   color="#22d3ee" value={`€${fmtEUR(totalEurInQueue)}`} testId="kpi-eur-in-queue" />
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                    <Filter className="w-3.5 h-3.5 text-slate-500" />
                    {FILTERS.map(f => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => setFilter(f.id)}
                            data-no-hover
                            data-testid={`admin-unlock-filter-${f.id}`}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide transition-all ${
                                filter === f.id
                                    ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40'
                                    : 'bg-slate-900 text-slate-400 ring-1 ring-slate-800 hover:text-slate-200'
                            }`}
                        >{f.label}</button>
                    ))}
                    <div className="flex-1 min-w-[180px] sm:max-w-xs ml-auto">
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar email · R40-... · TX hash"
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-950 ring-1 ring-slate-800 focus:ring-cyan-500/40 text-[11.5px] text-white placeholder:text-slate-600 outline-none transition-all"
                            data-testid="admin-unlock-search"
                        />
                    </div>
                </div>

                {/* Warning banner */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 text-amber-200 text-[11.5px]">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                        <span className="font-bold">Verifica siempre la TX en Tronscan</span> antes de aprobar. Confirmar libera el retiro 40% del usuario inmediatamente y queda registrado en el log regulatorio (irreversible).
                    </span>
                </div>

                {/* Queue table */}
                <Card className="bg-slate-900/60 border-slate-800/80 overflow-hidden" data-testid="admin-unlock-table">
                    {loading && <p className="text-slate-500 text-sm py-10 text-center">Cargando cola…</p>}
                    {!loading && items.length === 0 && (
                        <p className="text-slate-500 text-sm py-10 text-center">No hay solicitudes en este filtro.</p>
                    )}
                    {!loading && items.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12px]">
                                <thead className="bg-slate-950/60 border-b border-slate-800">
                                    <tr className="text-slate-500 text-left">
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px]">#</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px]">Usuario</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px] text-right">40% snapshot</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px]">TX hash</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px]">Subido</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px]">Estado</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[10px] text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items
                                        .filter((it) => {
                                            if (!search.trim()) return true;
                                            const q = search.trim().toLowerCase();
                                            return (
                                                (it.user_email || '').toLowerCase().includes(q) ||
                                                (it.payment_reference || '').toLowerCase().includes(q) ||
                                                (it.tx_hash || '').toLowerCase().includes(q) ||
                                                (it.id || '').toLowerCase().includes(q)
                                            );
                                        })
                                        .map((it) => {
                                        const s = STATUS[it.status] || STATUS.pending_payment;
                                        const SI = s.Icon;
                                        const canAct = it.status === 'in_review' || it.status === 'pending_payment';
                                        return (
                                            <tr key={it.id} className="border-b border-slate-800/60 hover:bg-slate-900/40 transition-colors" data-testid={`admin-unlock-row-${it.id}`}>
                                                <td className="py-2.5 px-3 text-slate-500 font-mono text-[10.5px]">
                                                    {it.priority_rank ? <span className="text-cyan-300 font-bold">#{it.priority_rank}</span> : '—'}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <p className="text-white font-semibold text-[12.5px]">{it.user_email}</p>
                                                    <p className="text-slate-600 text-[10px] font-mono">{it.id.slice(0, 8)}</p>
                                                    {it.payment_reference && (
                                                        <p className="text-amber-300/90 text-[10px] font-mono mt-0.5 tracking-wider" data-testid={`admin-unlock-ref-${it.id}`}>
                                                            {it.payment_reference}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-3 text-right">
                                                    <p className="text-cyan-300 font-mono tabular-nums font-bold">€{fmtEUR(it.max_withdraw_eur_snapshot)}</p>
                                                    <p className="text-slate-600 text-[10px]">de €{fmtEUR(it.available_balance_eur_snapshot)}</p>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <CopyHash value={it.tx_hash} />
                                                        {it.tx_hash && (
                                                            <a
                                                                href={`https://tronscan.org/#/transaction/${it.tx_hash}`}
                                                                target="_blank" rel="noopener noreferrer"
                                                                className="text-cyan-400 hover:text-cyan-300"
                                                                title="Ver en Tronscan"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <ExternalLink className="w-3 h-3" />
                                                            </a>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-2.5 px-3 text-slate-400 text-[10.5px] whitespace-nowrap">{fmtDate(it.proof_uploaded_at)}</td>
                                                <td className="py-2.5 px-3">
                                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded ${s.bg} ring-1 ${s.ring} ${s.color} text-[10.5px] font-bold`}>
                                                        <SI className={`w-3 h-3 ${it.status === 'in_review' ? 'animate-spin' : ''}`} />
                                                        {s.label}
                                                    </span>
                                                    <AuditHistoryButton item={it} />
                                                    {it.admin_note && it.status === 'rejected' && (
                                                        <p className="text-rose-400/80 text-[9.5px] mt-1 italic max-w-[220px] truncate" title={it.admin_note}>
                                                            “{it.admin_note}”
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-3 text-right">
                                                    {canAct ? (
                                                        <div className="inline-flex items-center gap-1.5">
                                                            <Button
                                                                size="sm"
                                                                onClick={() => approve(it)}
                                                                disabled={busyId === it.id}
                                                                data-testid={`admin-unlock-approve-${it.id}`}
                                                                className="h-7 px-2.5 text-[10.5px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                                                            >
                                                                {busyId === it.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                                                                Aprobar
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                onClick={() => setRejectFor({ id: it.id, email: it.user_email, note: '' })}
                                                                disabled={busyId === it.id}
                                                                data-testid={`admin-unlock-reject-${it.id}`}
                                                                variant="outline"
                                                                className="h-7 px-2.5 text-[10.5px] border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                                                            >
                                                                <XCircle className="w-3 h-3 mr-1" /> Rechazar
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-600 text-[10.5px] inline-flex items-center gap-1">
                                                            <Mail className="w-3 h-3" /> {it.admin_validated_by || 'Notificado'}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                {/* Reject modal */}
                {rejectFor && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" data-testid="admin-unlock-reject-modal">
                        <div className="w-full max-w-md bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 ring-1 ring-rose-500/30 rounded-2xl shadow-2xl">
                            <div className="px-5 py-4 border-b border-slate-800/80">
                                <p className="text-[10px] uppercase tracking-wider text-rose-300 font-bold">Rechazar solicitud</p>
                                <h3 className="text-white text-base font-bold mt-0.5">{rejectFor.email}</h3>
                            </div>
                            <div className="px-5 py-5 space-y-3">
                                <label className="block">
                                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Motivo (visible para el usuario)</span>
                                    <textarea
                                        rows={3}
                                        autoFocus
                                        value={rejectFor.note}
                                        onChange={(e) => setRejectFor({ ...rejectFor, note: e.target.value.slice(0, 300) })}
                                        placeholder="ej. TX no localizada en Tronscan..."
                                        data-testid="admin-unlock-reject-note"
                                        className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-[12px] focus:outline-none focus:border-rose-500/50 resize-none"
                                    />
                                    <span className="text-[9.5px] text-slate-600 mt-0.5 block text-right">{rejectFor.note.length}/300</span>
                                </label>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" onClick={() => setRejectFor(null)} className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800">
                                        Cancelar
                                    </Button>
                                    <Button
                                        onClick={submitReject}
                                        disabled={busyId === rejectFor.id || !rejectFor.note.trim()}
                                        data-testid="admin-unlock-reject-submit"
                                        className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold"
                                    >
                                        {busyId === rejectFor.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
                                        Confirmar rechazo
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </motion.div>
        </Layout>
    );
};

export default AdminPartialUnlockPage;
