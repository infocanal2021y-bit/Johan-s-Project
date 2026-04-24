import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import api from '../../lib/api';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
    Wallet, CheckCircle2, XCircle, Clock, Upload, Copy, Check,
    Loader2, ExternalLink, AlertTriangle, Filter, RefreshCw,
    ShieldCheck, Activity,
} from 'lucide-react';

const fmtEUR = (n) => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDateTime = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const METHOD_COLOR = {
    'usdt_trc20': '#26A17B',
    'btc':        '#F7931A',
    'eth':        '#627EEA',
};

const STATUS = {
    pending_payment: { label: 'Esperando pago',      color: 'text-slate-300',   bg: 'bg-slate-500/15',   ring: 'ring-slate-500/30',   icon: Clock },
    under_review:    { label: 'Verificando',         color: 'text-amber-300',   bg: 'bg-amber-500/15',   ring: 'ring-amber-500/30',   icon: Upload },
    confirmed:       { label: 'Confirmado',          color: 'text-emerald-300', bg: 'bg-emerald-500/15', ring: 'ring-emerald-500/30', icon: CheckCircle2 },
    rejected:        { label: 'Rechazado',           color: 'text-rose-300',    bg: 'bg-rose-500/15',    ring: 'ring-rose-500/30',    icon: XCircle },
};

const TX_EXPLORER = {
    btc:        (h) => `https://mempool.space/tx/${h}`,
    eth:        (h) => `https://etherscan.io/tx/${h}`,
    usdt_trc20: (h) => `https://tronscan.org/#/transaction/${h}`,
};

// ────────── Atoms ──────────
const KpiCard = ({ icon: Icon, label, value, color, testId }) => (
    <Card className="p-4 bg-gradient-to-br from-slate-900/90 to-slate-950 border-slate-800/80" data-testid={testId}>
        <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center ring-1" style={{ backgroundColor: color + '22', color, borderColor: color + '55' }}>
                <Icon className="w-4 h-4" />
            </div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-bold">{label}</p>
        </div>
        <p className="text-white text-2xl font-mono tabular-nums font-bold" style={{ letterSpacing: '-0.02em' }}>{value}</p>
    </Card>
);

const CopyHashButton = ({ value }) => {
    const [copied, setCopied] = useState(false);
    if (!value) return <span className="text-slate-600">—</span>;
    const short = `${value.slice(0, 6)}…${value.slice(-6)}`;
    return (
        <button
            type="button"
            onClick={async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(value);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                    toast.success('Hash copiado');
                } catch {}
            }}
            data-no-hover
            className="inline-flex items-center gap-1 text-slate-300 font-mono text-[11px] hover:text-cyan-300 transition-colors"
            title={value}
        >
            {short}
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 opacity-60" />}
        </button>
    );
};

// ────────── Main page ──────────
export const AdminMT5InvestPage = () => {
    const [all, setAll] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [busyId, setBusyId] = useState(null);
    const [noteFor, setNoteFor] = useState(null); // { id, mode: 'confirm'|'reject', note: '' }

    const load = useCallback(async () => {
        try {
            // Admin pending + full history (via user-facing endpoint won't suffice for admin;
            // we use /admin/pending plus refetching each user's deposits would be heavy — the
            // pending endpoint covers active items; for confirmed/rejected we query via a
            // direct 'all statuses' aggregator here).
            const [pending] = await Promise.all([
                api.get('/mt5-invest/admin/pending'),
            ]);
            setAll(pending.data.pending || []);
        } catch (e) {
            toast.error('Error cargando depósitos');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, 20000);
        return () => clearInterval(id);
    }, [load]);

    const counts = {
        all: all.length,
        pending_payment: all.filter(d => d.status === 'pending_payment').length,
        under_review:    all.filter(d => d.status === 'under_review').length,
    };
    const totalUnderReviewEur = all
        .filter(d => d.status === 'under_review')
        .reduce((s, d) => s + (d.amount_eur || 0), 0);

    const filtered = all.filter(d => statusFilter === 'all' || d.status === statusFilter);

    const doAction = async (id, mode, note) => {
        setBusyId(id);
        try {
            await api.post(`/mt5-invest/admin/${id}/${mode}`, { admin_note: note || '' });
            toast.success(mode === 'confirm' ? 'Depósito confirmado · fondos acreditados' : 'Depósito rechazado');
            await load();
            setNoteFor(null);
        } catch (e) {
            toast.error(e.response?.data?.detail || `Error al ${mode === 'confirm' ? 'confirmar' : 'rechazar'}`);
        } finally {
            setBusyId(null);
        }
    };

    return (
        <Layout>
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-6xl mx-auto space-y-5 p-3 sm:p-5"
                data-testid="admin-mt5-invest-page"
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-700/10 ring-1 ring-cyan-400/40 flex items-center justify-center flex-shrink-0">
                            <ShieldCheck className="w-6 h-6 text-cyan-200" />
                        </div>
                        <div>
                            <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-cyan-300 font-bold">
                                Admin · Tesorería MT5
                            </p>
                            <h1 className="text-2xl sm:text-3xl text-white mt-0.5 font-bold" style={{ letterSpacing: '-0.02em' }}>
                                Depósitos Inversión MT5
                            </h1>
                            <p className="text-slate-400 text-xs mt-1 max-w-xl">
                                Confirma o rechaza depósitos cripto (BTC / USDT-TRC20 / ETH). Al confirmar, los fondos se acreditan automáticamente a la cuenta MT5 del usuario.
                            </p>
                        </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={load} disabled={loading} className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs h-9" data-testid="admin-mt5-invest-refresh">
                        <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Actualizar
                    </Button>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KpiCard icon={Clock} label="En cola total" value={counts.all} color="#22d3ee" testId="admin-mt5-invest-kpi-total" />
                    <KpiCard icon={Upload} label="Verificando" value={counts.under_review} color="#f59e0b" testId="admin-mt5-invest-kpi-under" />
                    <KpiCard icon={Wallet} label="Esperando pago" value={counts.pending_payment} color="#94a3b8" testId="admin-mt5-invest-kpi-pending" />
                    <KpiCard icon={Activity} label="EUR por validar" value={`€${fmtEUR(totalUnderReviewEur)}`} color="#0ecb81" testId="admin-mt5-invest-kpi-eur" />
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                    <Filter className="w-3.5 h-3.5 text-slate-500" />
                    {[
                        { id: 'all',             label: 'Todos' },
                        { id: 'under_review',    label: 'Verificando' },
                        { id: 'pending_payment', label: 'Esperando pago' },
                    ].map(f => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => setStatusFilter(f.id)}
                            data-no-hover
                            data-testid={`admin-mt5-invest-filter-${f.id}`}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                statusFilter === f.id
                                    ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30'
                                    : 'text-slate-500 hover:text-slate-200'
                            }`}
                        >{f.label}</button>
                    ))}
                </div>

                {/* Table */}
                <Card className="overflow-hidden bg-slate-900/60 border-slate-800/80" data-testid="admin-mt5-invest-table">
                    {loading && filtered.length === 0 && (
                        <div className="p-10 text-center text-slate-500 text-sm inline-flex items-center gap-2 justify-center w-full">
                            <Loader2 className="w-4 h-4 animate-spin" /> Cargando depósitos…
                        </div>
                    )}
                    {!loading && filtered.length === 0 && (
                        <p className="p-10 text-center text-slate-500 text-sm">Sin depósitos en esta vista. ¡Cola limpia!</p>
                    )}
                    {filtered.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[11.5px]">
                                <thead>
                                    <tr className="text-slate-500 text-left border-b border-slate-800/80 bg-slate-950/60">
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider">Orden</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider">Usuario</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider">Método</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-right">EUR</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-right hidden md:table-cell">Cripto</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider hidden lg:table-cell">TX Hash</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider">Estado</th>
                                        <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(d => {
                                        const st = STATUS[d.status] || STATUS.pending_payment;
                                        const StatusIcon = st.icon;
                                        const methodColor = METHOD_COLOR[d.method] || '#64748b';
                                        const canAct = d.status !== 'confirmed' && d.status !== 'rejected';
                                        const isBusy = busyId === d.id;
                                        const explorer = d.tx_hash && TX_EXPLORER[d.method] ? TX_EXPLORER[d.method](d.tx_hash) : null;

                                        return (
                                            <tr key={d.id} className="border-b border-slate-800/40 hover:bg-slate-800/20" data-testid={`admin-mt5-invest-row-${d.id.slice(0, 8)}`}>
                                                <td className="py-2 px-3">
                                                    <p className="text-white font-mono text-[11px]">#{d.id.slice(0, 8)}</p>
                                                    <p className="text-slate-600 text-[9.5px]">{fmtDateTime(d.created_at)}</p>
                                                </td>
                                                <td className="py-2 px-3">
                                                    <p className="text-slate-200 text-[11.5px] truncate max-w-[150px]" title={d.user_email}>{d.user_email}</p>
                                                    <p className="text-slate-600 text-[9.5px] font-mono">{d.user_id?.slice(0, 8)}…</p>
                                                </td>
                                                <td className="py-2 px-3">
                                                    <span
                                                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ring-1 text-[10.5px] font-bold"
                                                        style={{ color: methodColor, backgroundColor: methodColor + '20', borderColor: methodColor + '55' }}
                                                    >
                                                        {d.crypto_symbol}
                                                    </span>
                                                    <p className="text-slate-600 text-[9.5px] mt-0.5">{d.network}</p>
                                                </td>
                                                <td className="py-2 px-3 text-right">
                                                    <p className="text-white font-mono tabular-nums font-bold">€{fmtEUR(d.amount_eur)}</p>
                                                </td>
                                                <td className="py-2 px-3 text-right text-slate-300 font-mono tabular-nums hidden md:table-cell">
                                                    {d.amount_crypto}
                                                </td>
                                                <td className="py-2 px-3 hidden lg:table-cell">
                                                    <div className="flex items-center gap-1">
                                                        <CopyHashButton value={d.tx_hash} />
                                                        {explorer && (
                                                            <a
                                                                href={explorer}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-slate-500 hover:text-cyan-300 transition-colors"
                                                                title="Ver en explorer"
                                                                data-no-hover
                                                            >
                                                                <ExternalLink className="w-3 h-3" />
                                                            </a>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-2 px-3">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ring-1 text-[10px] font-bold ${st.color} ${st.bg} ${st.ring}`}>
                                                        <StatusIcon className="w-3 h-3" /> {st.label}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-3 text-right">
                                                    {canAct && (
                                                        <div className="inline-flex gap-1">
                                                            <Button
                                                                size="sm"
                                                                onClick={() => doAction(d.id, 'confirm', '')}
                                                                disabled={isBusy}
                                                                data-testid={`admin-mt5-invest-confirm-${d.id.slice(0, 8)}`}
                                                                className="h-7 px-2 text-[11px] bg-emerald-600/85 hover:bg-emerald-600 text-white"
                                                                title="Confirmar + acreditar"
                                                            >
                                                                {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-0.5" />}
                                                                Confirmar
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                onClick={() => setNoteFor({ id: d.id, mode: 'reject', note: '' })}
                                                                disabled={isBusy}
                                                                data-testid={`admin-mt5-invest-reject-${d.id.slice(0, 8)}`}
                                                                className="h-7 px-2 text-[11px] bg-rose-600/85 hover:bg-rose-600 text-white"
                                                                title="Rechazar"
                                                            >
                                                                <XCircle className="w-3 h-3 mr-0.5" />
                                                                Rechazar
                                                            </Button>
                                                        </div>
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

                {/* Footer info */}
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/25 text-amber-200 text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                        Antes de confirmar, verifica el <span className="font-semibold">TX hash</span> en el explorador correspondiente (mempool.space / etherscan / tronscan). La confirmación es <span className="font-semibold">irreversible</span> y acredita fondos automáticamente a la cuenta MT5 del usuario.
                    </span>
                </div>
            </motion.div>

            {/* Reject note modal */}
            {noteFor && noteFor.mode === 'reject' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setNoteFor(null)}>
                    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-white font-bold text-base flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-rose-400" />
                            Rechazar depósito
                        </h3>
                        <p className="text-slate-400 text-xs mt-1">Opcional: añade un motivo visible para el usuario (máx 200 caracteres).</p>
                        <textarea
                            value={noteFor.note}
                            onChange={(e) => setNoteFor({ ...noteFor, note: e.target.value.slice(0, 200) })}
                            maxLength={200}
                            rows={3}
                            placeholder="Ej: TX hash no encontrado en blockchain"
                            data-testid="admin-mt5-invest-reject-note"
                            className="w-full mt-3 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-rose-500/50"
                        />
                        <div className="flex items-center justify-end gap-2 mt-4">
                            <Button variant="outline" onClick={() => setNoteFor(null)} className="border-slate-700 text-slate-300">Cancelar</Button>
                            <Button
                                onClick={() => doAction(noteFor.id, 'reject', noteFor.note)}
                                disabled={busyId === noteFor.id}
                                data-testid="admin-mt5-invest-reject-confirm"
                                className="bg-rose-600 hover:bg-rose-500 text-white"
                            >
                                {busyId === noteFor.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 mr-1.5" />}
                                Rechazar depósito
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default AdminMT5InvestPage;
