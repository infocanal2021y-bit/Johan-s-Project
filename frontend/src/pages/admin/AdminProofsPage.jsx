import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
    Image as ImageIcon, Loader2, RefreshCw, Search, X,
    Bitcoin, Banknote, Landmark, Unlock, FileText, ExternalLink, Download,
    Check, XCircle, Eye, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { safeApiCall } from '../../lib/diagnostics';
import { Textarea } from '../../components/ui/textarea';

const TYPE_META = {
    crypto: {
        icon: Bitcoin, label: 'Pago Crypto',
        cardCls: 'bg-amber-500/5 border-amber-500/30',
        labelCls: 'text-amber-300',
        countCls: 'text-amber-300',
        chipCls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    },
    bank: {
        icon: Banknote, label: 'Transferencia Bancaria',
        cardCls: 'bg-cyan-500/5 border-cyan-500/30',
        labelCls: 'text-cyan-300',
        countCls: 'text-cyan-300',
        chipCls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    },
    mt5: {
        icon: Landmark, label: 'Depósito MT5',
        cardCls: 'bg-emerald-500/5 border-emerald-500/30',
        labelCls: 'text-emerald-300',
        countCls: 'text-emerald-300',
        chipCls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    },
    'partial-unlock': {
        icon: Unlock, label: 'Desbloqueo 40%',
        cardCls: 'bg-violet-500/5 border-violet-500/30',
        labelCls: 'text-violet-300',
        countCls: 'text-violet-300',
        chipCls: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    },
};

const STATUS_STYLE = {
    pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    pending_verification: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    rejected: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    partial: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
};

const fmtMoney = (amount, currency) => {
    const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : '';
    return `${sym}${(Number(amount) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || ''}`.trim();
};

const ProofViewerModal = ({ item, onClose, onActionComplete }) => {
    const [loading, setLoading] = useState(true);
    const [dataUri, setDataUri] = useState(null);
    const [error, setError] = useState(null);
    const [actionLoading, setActionLoading] = useState(null); // 'approve' | 'reject' | 'reviewed'
    const [note, setNote] = useState('');
    const [confirmReject, setConfirmReject] = useState(false);

    useEffect(() => {
        if (!item || !item.has_file) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            setLoading(true);
            const result = await safeApiCall({
                url: `/api/admin/proofs/${item.type}/${item.id}/file`,
                method: 'GET',
                timeoutMs: 20000,
            });
            if (cancelled) return;
            setLoading(false);
            if (result.ok) {
                setDataUri(result.data?.data_uri || null);
            } else {
                setError(result.message);
            }
        })();
        return () => { cancelled = true; };
    }, [item]);

    const doAction = async (action) => {
        if (action === 'reject' && !note.trim()) {
            setConfirmReject(true);
            toast.error('Motivo requerido para rechazar', { duration: 4000 });
            return;
        }
        setActionLoading(action);
        const result = await safeApiCall({
            url: `/api/admin/proofs/${item.type}/${item.id}/action`,
            method: 'POST',
            body: { action, note: note.trim() || null },
            timeoutMs: 15000,
        });
        setActionLoading(null);
        if (result.ok) {
            const labels = { approve: 'Aprobado', reject: 'Rechazado', reviewed: 'Marcado como revisado' };
            toast.success(labels[action], { duration: 3500 });
            onActionComplete && onActionComplete({ ...item, ...result.data });
            onClose();
        } else {
            toast.error(result.message, { description: `[HTTP ${result.status}]`, duration: 6000 });
        }
    };

    if (!item) return null;
    const isPdf = dataUri?.startsWith('data:application/pdf');
    const alreadyReviewed = item.admin_review_action;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                data-testid="proof-viewer-modal"
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-slate-900 border border-slate-700 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
                >
                    <div className="flex items-center justify-between p-4 border-b border-slate-800">
                        <div className="min-w-0">
                            <h3 className="text-white font-bold text-sm truncate">{item.type_label} · {item.user_name || 'Usuario'}</h3>
                            <p className="text-xs text-slate-500 truncate">{item.user_email} · {fmtMoney(item.amount, item.currency)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {dataUri && (
                                <a href={dataUri} download={item.proof_filename || `proof_${item.id}`}
                                    className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-slate-800"
                                    data-testid="proof-download-btn">
                                    <Download className="w-4 h-4" />
                                </a>
                            )}
                            <button onClick={onClose} className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-slate-800" data-testid="proof-close-btn">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto bg-slate-950 p-4 flex items-center justify-center min-h-[300px]">
                        {loading ? (
                            <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                        ) : error ? (
                            <p className="text-rose-400 text-sm">{error}</p>
                        ) : !item.has_file ? (
                            <div className="text-center">
                                <p className="text-slate-400 text-sm mb-2">Este comprobante no tiene archivo adjunto.</p>
                                {item.reference && (
                                    <p className="text-xs text-slate-500 font-mono break-all">Hash/Ref: {item.reference}</p>
                                )}
                            </div>
                        ) : isPdf ? (
                            <iframe src={dataUri} title="proof-pdf" className="w-full h-[70vh] bg-white rounded" />
                        ) : (
                            <img src={dataUri} alt="comprobante" className="max-w-full max-h-[70vh] object-contain rounded" data-testid="proof-image" />
                        )}
                    </div>
                    <div className="p-3 border-t border-slate-800 text-xs text-slate-500 grid grid-cols-2 gap-2">
                        <span>ID: <span className="font-mono text-slate-400">{item.id}</span></span>
                        <span>Fecha: <span className="text-slate-400">{new Date(item.created_at).toLocaleString('es-ES')}</span></span>
                        {item.reference && (
                            <span className="col-span-2 truncate">Ref: <span className="font-mono text-slate-400">{item.reference}</span></span>
                        )}
                        {alreadyReviewed && (
                            <span className="col-span-2 mt-1 inline-flex items-center gap-1 text-amber-300">
                                <ShieldCheck className="w-3 h-3" />
                                Última acción: <strong className="text-amber-200">{alreadyReviewed}</strong>
                                {item.admin_reviewed_by_name && <> por <span className="text-slate-400">{item.admin_reviewed_by_name}</span></>}
                                {item.admin_reviewed_at && <> · {new Date(item.admin_reviewed_at).toLocaleString('es-ES')}</>}
                                {item.admin_review_note && <span className="block text-slate-400 mt-0.5 italic">"{item.admin_review_note}"</span>}
                            </span>
                        )}
                    </div>

                    {/* Action panel */}
                    <div className="p-4 border-t border-slate-800 bg-slate-950/50 space-y-3" data-testid="proof-action-panel">
                        <div className="flex items-center justify-between gap-2">
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                                Nota interna (obligatoria para rechazar)
                            </label>
                            <span className="text-[10px] text-slate-600 tabular-nums">{note.length}/300</span>
                        </div>
                        <Textarea
                            value={note}
                            onChange={(e) => { setNote(e.target.value.slice(0, 300)); if (confirmReject) setConfirmReject(false); }}
                            placeholder="Ej: TXID no coincide con la blockchain pública. Ref. anti-fraude #..."
                            className={`bg-slate-900 border-slate-800 text-white text-sm min-h-[60px] resize-none ${confirmReject ? 'border-rose-500/60 ring-1 ring-rose-500/40' : ''}`}
                            data-testid="proof-action-note"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                onClick={() => doAction('reviewed')}
                                disabled={!!actionLoading}
                                variant="outline"
                                className="border-slate-700 hover:bg-slate-800 text-slate-200"
                                data-testid="proof-action-reviewed-btn"
                            >
                                {actionLoading === 'reviewed' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                                Marcar revisado
                            </Button>
                            <Button
                                onClick={() => doAction('approve')}
                                disabled={!!actionLoading}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
                                data-testid="proof-action-approve-btn"
                            >
                                {actionLoading === 'approve' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                                Aprobar
                            </Button>
                            <Button
                                onClick={() => doAction('reject')}
                                disabled={!!actionLoading}
                                className="bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40"
                                data-testid="proof-action-reject-btn"
                            >
                                {actionLoading === 'reject' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                                Rechazar
                            </Button>
                            <p className="text-[10px] text-slate-500 ml-auto max-w-[260px] text-right">
                                Aprobar/Rechazar solo cambia el estado y registra audit trail. El crédito de saldo se gestiona desde la cola dedicada.
                            </p>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export const AdminProofsPage = () => {
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState([]);
    const [type, setType] = useState('all');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(null);
    const [exporting, setExporting] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const result = await safeApiCall({
            url: `/api/admin/proofs?type=${type}&limit=300`,
            method: 'GET',
            timeoutMs: 20000,
        });
        setLoading(false);
        if (result.ok) {
            setItems(result.data?.items || []);
        } else {
            toast.error(result.message, { description: `[${result.kind} · HTTP ${result.status}]`, duration: 6000 });
        }
    }, [type]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleExportCsv = async () => {
        setExporting(true);
        try {
            const apiUrl = process.env.REACT_APP_BACKEND_URL || '';
            const token = localStorage.getItem('token');
            const resp = await fetch(`${apiUrl}/api/admin/proofs/export.csv?type=${type}`, {
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
            a.download = `comprobantes_${type}_${today}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success(`CSV descargado · ${items.length} comprobantes`);
        } catch (e) {
            toast.error(`Fallo al descargar: ${e.message}`);
        } finally {
            setExporting(false);
        }
    };

    const filtered = items.filter((i) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (
            (i.user_name || '').toLowerCase().includes(q) ||
            (i.user_email || '').toLowerCase().includes(q) ||
            (i.reference || '').toLowerCase().includes(q) ||
            (i.id || '').toLowerCase().includes(q)
        );
    });

    const counts = items.reduce((acc, i) => {
        acc[i.type] = (acc[i.type] || 0) + 1;
        return acc;
    }, {});

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-5" data-testid="admin-proofs-page">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl sm:text-3xl text-white font-bold tracking-tight flex items-center gap-2">
                            <ImageIcon className="w-7 h-7 text-amber-400" />
                            Comprobantes Subidos
                        </h1>
                        <p className="text-slate-500 mt-1 text-sm">
                            Vista unificada de pagos crypto, transferencias bancarias, depósitos MT5 y hashes de desbloqueo
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={handleExportCsv} disabled={exporting || items.length === 0}
                            className="bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-40"
                            data-testid="proofs-export-csv-btn">
                            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                            Exportar CSV ({items.length})
                        </Button>
                        <Button onClick={fetchData} variant="outline" className="border-slate-700 hover:bg-slate-800" data-testid="proofs-refresh-btn">
                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refrescar
                        </Button>
                    </div>
                </motion.div>

                {/* Tipo KPI strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(TYPE_META).map(([key, meta]) => {
                        const Icon = meta.icon;
                        return (
                            <Card key={key} className={meta.cardCls}>
                                <CardContent className="p-4">
                                    <div className={`flex items-center gap-2 text-[10px] uppercase tracking-wider ${meta.labelCls} font-bold mb-1`}>
                                        <Icon className="w-3 h-3" /> {meta.label}
                                    </div>
                                    <p className={`${meta.countCls} font-bold text-2xl tabular-nums`}>{counts[key] || 0}</p>
                                    <p className="text-[10px] text-slate-500 mt-1">comprobantes</p>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                {/* Filters */}
                <Card className="bg-slate-900/70 border-slate-800">
                    <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">Tipo</label>
                            <Select value={type} onValueChange={setType}>
                                <SelectTrigger className="bg-slate-950 border-slate-800 text-white" data-testid="proofs-filter-type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700">
                                    <SelectItem value="all">Todos los tipos</SelectItem>
                                    <SelectItem value="crypto">Pagos Crypto</SelectItem>
                                    <SelectItem value="bank">Transferencias Bancarias</SelectItem>
                                    <SelectItem value="mt5">Depósitos MT5</SelectItem>
                                    <SelectItem value="partial-unlock">Desbloqueos 40%</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="sm:col-span-2">
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">Buscar (nombre / email / ref / id)</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                <Input value={search} onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Eduardo, txid, 0xabc..."
                                    className="bg-slate-950 border-slate-800 text-white pl-9" data-testid="proofs-filter-search" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Grid */}
                <Card className="bg-slate-900/70 border-slate-800">
                    <CardHeader className="border-b border-slate-800 pb-3">
                        <CardTitle className="text-white text-base font-bold flex items-center gap-2">
                            <FileText className="w-5 h-5 text-amber-400" />
                            Resultados · {filtered.length}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                        {loading && filtered.length === 0 ? (
                            <div className="py-16 flex items-center justify-center">
                                <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="py-16 text-center text-slate-500 text-sm">
                                Sin comprobantes con los filtros actuales.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="proofs-grid">
                                {filtered.map((item) => {
                                    const meta = TYPE_META[item.type] || TYPE_META.crypto;
                                    const Icon = meta.icon;
                                    const statusCls = STATUS_STYLE[item.status] || 'bg-slate-500/15 text-slate-300 border-slate-500/30';
                                    return (
                                        <button
                                            key={`${item.type}-${item.id}`}
                                            onClick={() => setSelected(item)}
                                            className="text-left bg-slate-950/60 border border-slate-800 rounded-lg p-3 hover:border-amber-500/50 hover:bg-slate-900/80 transition-all group"
                                            data-testid={`proof-card-${item.type}-${item.id}`}
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${meta.chipCls}`}>
                                                    <Icon className="w-3 h-3" /> {meta.label}
                                                </span>
                                                {item.status && (
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusCls}`}>
                                                        {item.status}
                                                    </span>
                                                )}
                                            </div>
                                            {item.admin_review_action && (
                                                <div className="mb-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[9px] font-bold text-amber-300">
                                                    <ShieldCheck className="w-2.5 h-2.5" />
                                                    {item.admin_review_action}
                                                    {item.admin_reviewed_by_name && <span className="text-amber-400/70 font-normal"> · {item.admin_reviewed_by_name}</span>}
                                                </div>
                                            )}
                                            <p className="text-white font-medium text-sm truncate">{item.user_name || '—'}</p>
                                            <p className="text-xs text-slate-500 truncate">{item.user_email || '—'}</p>
                                            <p className="text-amber-300 font-bold text-base tabular-nums mt-2">
                                                {fmtMoney(item.amount, item.currency)}
                                            </p>
                                            {item.reference && (
                                                <p className="text-[10px] text-slate-500 font-mono truncate mt-1" title={item.reference}>
                                                    Ref: {item.reference}
                                                </p>
                                            )}
                                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
                                                <span className="text-[10px] text-slate-500">
                                                    {item.created_at ? new Date(item.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                                                </span>
                                                <span className="text-[10px] text-amber-400 group-hover:text-amber-300 flex items-center gap-1 font-semibold">
                                                    {item.has_file ? 'Ver archivo' : 'Ver detalles'} <ExternalLink className="w-3 h-3" />
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {selected && (
                <ProofViewerModal
                    item={selected}
                    onClose={() => setSelected(null)}
                    onActionComplete={() => { fetchData(); }}
                />
            )}
        </Layout>
    );
};

export default AdminProofsPage;
