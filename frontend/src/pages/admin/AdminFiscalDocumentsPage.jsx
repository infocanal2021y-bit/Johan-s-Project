import { useState, useEffect } from 'react';
import { Layout } from '../../components/layout/Layout';
import { fiscalAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { openFiscalDoc } from '../FiscalDocumentsPage';
import {
    FileCheck, Loader2, CheckCircle, XCircle, Clock, RefreshCw, Eye,
} from 'lucide-react';

const TABS = [
    { key: 'pending_review', label: 'Pendientes', Icon: Clock, cls: 'text-amber-400' },
    { key: 'accepted', label: 'Aceptados', Icon: CheckCircle, cls: 'text-emerald-400' },
    { key: 'rejected', label: 'Rechazados', Icon: XCircle, cls: 'text-red-400' },
    { key: 'resubmission_requested', label: 'Solicitados de nuevo', Icon: RefreshCw, cls: 'text-cyan-400' },
];

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const AdminFiscalDocumentsPage = () => {
    const [docs, setDocs] = useState([]);
    const [counts, setCounts] = useState({});
    const [tab, setTab] = useState('pending_review');
    const [loading, setLoading] = useState(true);
    const [review, setReview] = useState(null); // { doc, action }
    const [observation, setObservation] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await fiscalAPI.adminList();
            setDocs(data.documents || []);
            setCounts(data.counts || {});
        } catch {
            toast.error('Error al cargar documentos fiscales');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const submitReview = async () => {
        if ((review.action === 'reject' || review.action === 'request_again') && !observation.trim()) {
            toast.error('Debe indicar un motivo/observación.');
            return;
        }
        setSubmitting(true);
        try {
            await fiscalAPI.adminReview(review.doc.id, { action: review.action, observation: observation.trim() });
            toast.success('Revisión registrada y usuario notificado');
            setReview(null); setObservation('');
            load();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al registrar la revisión');
        } finally {
            setSubmitting(false);
        }
    };

    const visible = docs.filter((d) => d.status === tab);
    const ACTION_TITLES = { accept: 'Aceptar documento', reject: 'Rechazar documento', request_again: 'Solicitar nuevamente' };

    return (
        <Layout>
            <div className="max-w-5xl mx-auto space-y-6" data-testid="admin-fiscal-page">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25">
                        <FileCheck className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Documentos Fiscales</h1>
                        <p className="text-sm text-slate-400 font-light">Revisión administrativa · Aceptar, rechazar o solicitar de nuevo</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {TABS.map((t) => (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                                tab === t.key ? 'bg-slate-800 border-slate-600 text-white' : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                            data-testid={`fiscal-tab-${t.key}`}>
                            <t.Icon className={`w-4 h-4 ${t.cls}`} /> {t.label}
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300">{counts[t.key] || 0}</span>
                        </button>
                    ))}
                </div>

                <div className="rounded-2xl bg-slate-900/70 border border-slate-800 overflow-hidden">
                    {loading ? (
                        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>
                    ) : visible.length === 0 ? (
                        <p className="text-slate-600 text-sm text-center py-12">Sin documentos en esta categoría.</p>
                    ) : (
                        <div className="divide-y divide-slate-800/60">
                            {visible.map((d) => (
                                <div key={d.id} className="px-4 py-3.5 flex flex-wrap items-center gap-3" data-testid={`admin-fiscal-doc-${d.id}`}>
                                    <div className="flex-1 min-w-[220px]">
                                        <p className="text-white text-sm font-semibold">{d.name}</p>
                                        <p className="text-slate-500 text-xs">{d.user_name} · {d.user_email} · {fmtDate(d.created_at)} · {(d.size_bytes / 1024).toFixed(0)} KB</p>
                                        {d.note && <p className="text-slate-400 text-xs mt-0.5">Nota del usuario: {d.note}</p>}
                                        {d.observation && <p className="text-amber-300 text-xs mt-0.5">Observación: {d.observation}</p>}
                                        {d.reviewed_by && <p className="text-slate-600 text-[10.5px] mt-0.5">Revisado por {d.reviewed_by} · {fmtDate(d.reviewed_at)}</p>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button size="sm" variant="outline" onClick={() => openFiscalDoc(d.id)}
                                            className="border-slate-700 text-slate-300 hover:bg-slate-800 h-8" data-testid={`admin-fiscal-view-${d.id}`}>
                                            <Eye className="w-3.5 h-3.5 mr-1" /> Ver
                                        </Button>
                                        {d.status === 'pending_review' && (
                                            <>
                                                <Button size="sm" onClick={() => { setReview({ doc: d, action: 'accept' }); setObservation(''); }}
                                                    className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 h-8"
                                                    data-testid={`admin-fiscal-accept-${d.id}`}>
                                                    <CheckCircle className="w-3.5 h-3.5 mr-1" /> Aceptar
                                                </Button>
                                                <Button size="sm" onClick={() => { setReview({ doc: d, action: 'reject' }); setObservation(''); }}
                                                    className="bg-red-500/15 border border-red-500/40 text-red-300 hover:bg-red-500/25 h-8"
                                                    data-testid={`admin-fiscal-reject-${d.id}`}>
                                                    <XCircle className="w-3.5 h-3.5 mr-1" /> Rechazar
                                                </Button>
                                                <Button size="sm" onClick={() => { setReview({ doc: d, action: 'request_again' }); setObservation(''); }}
                                                    className="bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 h-8"
                                                    data-testid={`admin-fiscal-request-${d.id}`}>
                                                    <RefreshCw className="w-3.5 h-3.5 mr-1" /> Solicitar de nuevo
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <Dialog open={!!review} onOpenChange={(o) => !o && setReview(null)}>
                    <DialogContent className="max-w-md bg-slate-900 border-slate-700 text-white" data-testid="fiscal-review-dialog">
                        <DialogHeader>
                            <DialogTitle className="text-white">{review ? ACTION_TITLES[review.action] : ''}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3 py-1">
                            <p className="text-slate-400 text-sm">Documento: <span className="text-white">{review?.doc?.name}</span></p>
                            <Textarea
                                value={observation}
                                onChange={(e) => setObservation(e.target.value)}
                                placeholder={review?.action === 'accept' ? 'Observación (opcional)' : 'Motivo / observación (obligatorio)'}
                                className="bg-slate-950 border-slate-800 text-white text-sm min-h-[90px]"
                                data-testid="fiscal-observation-input"
                            />
                        </div>
                        <DialogFooter className="gap-2">
                            <Button variant="outline" onClick={() => setReview(null)} className="border-slate-700 text-slate-300 hover:bg-slate-800">Cancelar</Button>
                            <Button onClick={submitReview} disabled={submitting}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white" data-testid="fiscal-review-confirm-btn">
                                {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1.5" />}
                                Confirmar
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </Layout>
    );
};

export default AdminFiscalDocumentsPage;
