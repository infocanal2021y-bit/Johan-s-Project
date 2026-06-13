import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { Layout } from '../../components/layout/Layout';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
    Building2, RefreshCw, CheckCircle2, XCircle, Loader2,
    Eye, X, Filter, FileText, Download,
} from 'lucide-react';


const STATUS_BADGE = {
    in_review: { label: 'En revisión', cls: 'lb-badge lb-badge-review' },
    approved: { label: 'Aprobada', cls: 'lb-badge lb-badge-approved' },
    rejected: { label: 'Rechazada', cls: 'lb-badge lb-badge-error' },
};


const AdminBankTransfersPage = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('in_review');
    const [search, setSearch] = useState('');
    const [amountMin, setAmountMin] = useState('');
    const [amountMax, setAmountMax] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selected, setSelected] = useState(null);
    const [proofBlob, setProofBlob] = useState(null);
    const [rejecting, setRejecting] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    const fetchList = async () => {
        setLoading(true);
        try {
            const params = {};
            if (filter) params.status = filter;
            if (search.trim()) params.q = search.trim();
            if (amountMin) params.amount_min = parseFloat(amountMin);
            if (amountMax) params.amount_max = parseFloat(amountMax);
            if (dateFrom) params.date_from = dateFrom;
            if (dateTo) params.date_to = dateTo;
            const { data } = await api.get('/admin/bank-transfer-proofs', { params });
            setItems(data?.proofs || []);
        } catch (e) {
            toast.error('Error al cargar');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter]);

    const clearFilters = () => {
        setSearch(''); setAmountMin(''); setAmountMax(''); setDateFrom(''); setDateTo('');
        setTimeout(fetchList, 50);
    };

    const view = async (p) => {
        setSelected(p);
        setProofBlob(null);
        try {
            const { data } = await api.get(`/admin/bank-transfer-proofs/${p.id}/file`);
            setProofBlob(data);
        } catch (e) {
            toast.error('No se pudo cargar el comprobante');
        }
    };

    const approve = async (p) => {
        if (actionLoading) return;
        setActionLoading(true);
        try {
            await api.post(`/admin/bank-transfer-proofs/${p.id}/approve`);
            toast.success('Transferencia aprobada');
            setSelected(null);
            setProofBlob(null);
            await fetchList();
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Error al aprobar');
        } finally { setActionLoading(false); }
    };

    const reject = async () => {
        if (!rejecting) return;
        if (!rejectReason || rejectReason.length < 5) {
            toast.error('Motivo obligatorio (mínimo 5 caracteres)');
            return;
        }
        setActionLoading(true);
        try {
            await api.post(`/admin/bank-transfer-proofs/${rejecting.id}/reject`, { reason: rejectReason.trim() });
            toast.success('Transferencia rechazada');
            setRejecting(null); setRejectReason(''); setSelected(null); setProofBlob(null);
            await fetchList();
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Error al rechazar');
        } finally { setActionLoading(false); }
    };

    return (
        <Layout>
            <div className="max-w-6xl mx-auto space-y-6" data-testid="admin-bank-transfers-page">
                {/* Header */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#4DA3FF] to-[#1973B8] flex items-center justify-center shadow-[0_6px_20px_-4px_rgba(77,163,255,0.55)]">
                            <Building2 className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-white text-xl sm:text-2xl font-bold leading-tight">Transferencias bancarias</h1>
                            <p className="text-slate-400 text-[12.5px] mt-0.5">Revisión de comprobantes de pago</p>
                        </div>
                    </div>
                    <button
                        onClick={fetchList}
                        className="lb-btn-secondary text-[12px]"
                        data-testid="admin-bank-transfers-refresh"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
                    </button>
                </div>

                {/* Filter tabs */}
                <div className="flex items-center gap-2 flex-wrap">
                    {[
                        { k: 'in_review', label: 'En revisión' },
                        { k: 'approved', label: 'Aprobadas' },
                        { k: 'rejected', label: 'Rechazadas' },
                        { k: '', label: 'Todas' },
                    ].map((t) => (
                        <button
                            key={t.k}
                            onClick={() => setFilter(t.k)}
                            data-testid={`admin-bank-transfers-filter-${t.k || 'all'}`}
                            className={`px-3 py-1.5 rounded-full text-[11.5px] font-bold transition-colors ${filter === t.k ? 'bg-cyan-400 text-cyan-950' : 'bg-slate-800/60 text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800'}`}
                        >
                            <Filter className="w-3 h-3 inline mr-1" /> {t.label}
                        </button>
                    ))}
                </div>

                {/* Advanced filters */}
                <Card className="bg-slate-900/60 border-slate-800 p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                        <div className="space-y-1 lg:col-span-2">
                            <Label className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Buscar email / referencia / TRF</Label>
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') fetchList(); }}
                                placeholder="usuario@correo.com / TRF-2026-… / PLB-…"
                                className="bg-slate-950 border-slate-800 text-white text-[12.5px] h-9"
                                data-testid="admin-bank-transfers-search"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Monto mín. €</Label>
                            <Input type="number" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} placeholder="0" className="bg-slate-950 border-slate-800 text-white font-mono text-[12.5px] h-9" data-testid="admin-bank-transfers-amount-min" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Monto máx. €</Label>
                            <Input type="number" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} placeholder="∞" className="bg-slate-950 border-slate-800 text-white font-mono text-[12.5px] h-9" data-testid="admin-bank-transfers-amount-max" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Desde</Label>
                            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-slate-950 border-slate-800 text-white text-[12.5px] h-9" data-testid="admin-bank-transfers-date-from" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Hasta</Label>
                            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-slate-950 border-slate-800 text-white text-[12.5px] h-9" data-testid="admin-bank-transfers-date-to" />
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3 justify-end">
                        <button onClick={clearFilters} className="text-slate-400 hover:text-white text-[11.5px] underline-offset-2 hover:underline" data-testid="admin-bank-transfers-clear-filters">Limpiar filtros</button>
                        <button onClick={fetchList} className="lb-btn-primary text-[12px]" data-testid="admin-bank-transfers-apply-filters"><Filter className="w-3.5 h-3.5" /> Aplicar</button>
                    </div>
                </Card>

                {/* List */}
                <Card className="bg-slate-900/60 border-slate-800">
                    {loading ? (
                        <div className="p-10 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Cargando…</div>
                    ) : items.length === 0 ? (
                        <div className="p-10 text-center text-slate-500">Sin transferencias para este filtro.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-800 text-slate-500 text-[10.5px] uppercase tracking-wider">
                                        <th className="text-left py-2 px-3 font-bold">Fecha</th>
                                        <th className="text-left py-2 px-3 font-bold">TRF</th>
                                        <th className="text-left py-2 px-3 font-bold">Usuario</th>
                                        <th className="text-left py-2 px-3 font-bold">Titular emisor</th>
                                        <th className="text-left py-2 px-3 font-bold">Referencia</th>
                                        <th className="text-right py-2 px-3 font-bold">Monto</th>
                                        <th className="text-center py-2 px-3 font-bold">Estado</th>
                                        <th className="text-right py-2 px-3 font-bold">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((p, i) => {
                                        const cfg = STATUS_BADGE[p.status] || STATUS_BADGE.in_review;
                                        return (
                                            <tr key={p.id} className="border-b border-slate-800/60 hover:bg-slate-800/30" data-testid={`admin-bank-transfer-row-${i}`}>
                                                <td className="py-3 px-3 text-slate-400 text-[11.5px] whitespace-nowrap">{(p.submitted_at || '').slice(0, 16).replace('T', ' ')}</td>
                                                <td className="py-3 px-3 text-cyan-300 font-mono text-[11px] font-bold">{p.tracking_ref}</td>
                                                <td className="py-3 px-3">
                                                    <p className="text-white text-[12.5px] font-bold">{p.user_name || '—'}</p>
                                                    <p className="text-slate-500 text-[10.5px]">{p.user_email}</p>
                                                </td>
                                                <td className="py-3 px-3 text-slate-200 text-[12px]">{p.holder_name}</td>
                                                <td className="py-3 px-3 text-cyan-300 font-mono text-[11px]">{p.reference}</td>
                                                <td className="py-3 px-3 text-right text-white font-mono font-bold tabular-nums">€{Number(p.amount_eur || 0).toFixed(2)}</td>
                                                <td className="py-3 px-3 text-center"><span className={cfg.cls}>{cfg.label}</span></td>
                                                <td className="py-3 px-3 text-right">
                                                    <div className="inline-flex gap-1.5">
                                                        <button
                                                            onClick={() => view(p)}
                                                            className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold inline-flex items-center gap-1"
                                                            data-testid={`admin-bank-transfer-view-${i}`}
                                                        >
                                                            <Eye className="w-3 h-3" /> Ver
                                                        </button>
                                                        {p.status === 'in_review' && (
                                                            <>
                                                                <button
                                                                    onClick={() => approve(p)}
                                                                    disabled={actionLoading}
                                                                    className="px-2.5 py-1 rounded-md bg-[#00D084]/15 hover:bg-[#00D084]/25 text-[#00D084] text-[11px] font-bold inline-flex items-center gap-1 ring-1 ring-[#00D084]/40"
                                                                    data-testid={`admin-bank-transfer-approve-${i}`}
                                                                >
                                                                    <CheckCircle2 className="w-3 h-3" /> Aceptar
                                                                </button>
                                                                <button
                                                                    onClick={() => { setRejecting(p); setRejectReason(''); }}
                                                                    className="px-2.5 py-1 rounded-md bg-[#FF5C5C]/15 hover:bg-[#FF5C5C]/25 text-[#FF5C5C] text-[11px] font-bold inline-flex items-center gap-1 ring-1 ring-[#FF5C5C]/40"
                                                                    data-testid={`admin-bank-transfer-reject-${i}`}
                                                                >
                                                                    <XCircle className="w-3 h-3" /> Rechazar
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                {/* View proof modal */}
                {selected && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => { setSelected(null); setProofBlob(null); }}>
                        <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-3xl bg-slate-950 ring-1 ring-slate-800 rounded-2xl overflow-hidden max-h-[92vh] overflow-y-auto" data-testid="admin-bank-transfer-detail-modal">
                            <div className="bg-gradient-to-br from-[#072146] via-[#0a1c3d] to-slate-950 px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <FileText className="w-5 h-5 text-cyan-300" />
                                    <div>
                                        <h3 className="text-white font-bold leading-tight">Comprobante de transferencia</h3>
                                        <p className="text-slate-400 text-[11.5px] mt-0.5 font-mono">{selected.case_code}</p>
                                    </div>
                                </div>
                                <button onClick={() => { setSelected(null); setProofBlob(null); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"><X className="w-4 h-4" /></button>
                            </div>
                            <div className="grid md:grid-cols-[1.4fr_1fr] gap-0">
                                {/* Image */}
                                <div className="p-4 bg-slate-900/40 border-r border-slate-800 min-h-[300px] flex items-center justify-center">
                                    {!proofBlob ? (
                                        <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
                                    ) : proofBlob.proof_mime?.includes('pdf') ? (
                                        <a href={proofBlob.proof_b64} download={proofBlob.proof_filename || 'comprobante.pdf'} className="lb-btn-primary inline-flex">
                                            <FileText className="w-4 h-4" /> Descargar PDF
                                        </a>
                                    ) : (
                                        <img src={proofBlob.proof_b64} alt="Comprobante" className="max-h-[480px] rounded-lg ring-1 ring-slate-800" />
                                    )}
                                </div>
                                {/* Data */}
                                <div className="p-4 space-y-3">
                                    <p className="text-slate-500 text-[10.5px] font-bold uppercase tracking-[0.16em]">Datos del usuario</p>
                                    <Row label="Nombre" value={selected.user_name || '—'} />
                                    <Row label="Email" value={selected.user_email} />
                                    <Row label="User ID" value={selected.user_id} mono />
                                    <div className="border-t border-slate-800 my-2" />
                                    <p className="text-slate-500 text-[10.5px] font-bold uppercase tracking-[0.16em]">Datos del pago</p>
                                    <Row label="Tracking ref" value={selected.tracking_ref || '—'} mono />
                                    <Row label="Case code" value={selected.case_code || '—'} mono />
                                    <Row label="Titular emisor" value={selected.holder_name} />
                                    <Row label="Referencia" value={selected.reference} mono />
                                    <Row label="Monto" value={`€${Number(selected.amount_eur || 0).toFixed(2)}`} mono />
                                    <Row label="Estado" value={(STATUS_BADGE[selected.status] || STATUS_BADGE.in_review).label} />
                                    {selected.reject_reason && <Row label="Motivo rechazo" value={selected.reject_reason} />}

                                    <div className="border-t border-slate-800 my-2" />
                                    <p className="text-slate-500 text-[10.5px] font-bold uppercase tracking-[0.16em]">Auditoría</p>
                                    <Row label="Fecha subida" value={(selected.submitted_at || '').replace('T', ' ').slice(0, 19)} mono />
                                    <Row label="IP subida" value={selected.audit?.submitted_ip || '—'} mono />
                                    {selected.audit?.approved_at && (
                                        <>
                                            <Row label="Aprobado el" value={(selected.audit.approved_at || '').replace('T', ' ').slice(0, 19)} mono />
                                            <Row label="Aprobado por" value={selected.audit?.approved_by_email || '—'} />
                                            <Row label="IP aprobación" value={selected.audit?.approved_ip || '—'} mono />
                                        </>
                                    )}
                                    {selected.audit?.rejected_at && (
                                        <>
                                            <Row label="Rechazado el" value={(selected.audit.rejected_at || '').replace('T', ' ').slice(0, 19)} mono />
                                            <Row label="Rechazado por" value={selected.audit?.rejected_by_email || '—'} />
                                            <Row label="IP rechazo" value={selected.audit?.rejected_ip || '—'} mono />
                                        </>
                                    )}

                                    {/* Download */}
                                    {proofBlob && (
                                        <div className="pt-2">
                                            <a href={proofBlob.proof_b64} download={proofBlob.proof_filename || `comprobante-${selected.tracking_ref}`} className="lb-btn-secondary text-[11.5px] inline-flex w-full justify-center" data-testid="admin-bank-transfer-download">
                                                <Download className="w-3.5 h-3.5" /> Descargar comprobante
                                            </a>
                                        </div>
                                    )}

                                    {selected.status === 'in_review' && (
                                        <div className="pt-3 grid grid-cols-2 gap-2">
                                            <Button onClick={() => approve(selected)} disabled={actionLoading} className="bg-[#00D084] hover:bg-[#00b876] text-slate-950 font-bold" data-testid="admin-bank-transfer-detail-approve">
                                                <CheckCircle2 className="w-4 h-4 mr-2" /> Aceptar
                                            </Button>
                                            <Button onClick={() => { setRejecting(selected); setRejectReason(''); }} className="bg-[#FF5C5C] hover:bg-[#e54848] text-white font-bold" data-testid="admin-bank-transfer-detail-reject">
                                                <XCircle className="w-4 h-4 mr-2" /> Rechazar
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Reject reason modal */}
                {rejecting && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setRejecting(null)}>
                        <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md bg-slate-950 ring-1 ring-[#FF5C5C]/40 rounded-2xl overflow-hidden" data-testid="admin-bank-transfer-reject-modal">
                            <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
                                <XCircle className="w-5 h-5 text-[#FF5C5C]" />
                                <h3 className="text-white font-bold">Rechazar transferencia</h3>
                            </div>
                            <div className="p-5 space-y-3">
                                <p className="text-slate-400 text-[12.5px]">Indica el motivo del rechazo. El usuario lo verá y podrá subir un nuevo comprobante.</p>
                                <Label className="text-slate-400 text-[11.5px]">Motivo <span className="text-rose-400">*</span></Label>
                                <Input
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="Ej. Comprobante ilegible / no coincide el monto / referencia errónea…"
                                    className="bg-slate-900 border-slate-800 text-white text-sm"
                                    data-testid="admin-bank-transfer-reject-reason"
                                />
                                <div className="flex gap-2 pt-2">
                                    <Button onClick={() => setRejecting(null)} variant="outline" className="flex-1">Cancelar</Button>
                                    <Button onClick={reject} disabled={actionLoading || rejectReason.length < 5} className="flex-1 bg-[#FF5C5C] hover:bg-[#e54848] text-white font-bold" data-testid="admin-bank-transfer-reject-confirm">
                                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar rechazo'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
};


const Row = ({ label, value, mono }) => (
    <div className="flex items-start justify-between gap-2">
        <span className="text-slate-500 text-[11px] font-bold">{label}</span>
        <span className={`text-white text-[12px] text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
);


export default AdminBankTransfersPage;
