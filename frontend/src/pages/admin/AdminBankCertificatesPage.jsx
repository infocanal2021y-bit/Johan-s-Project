import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { Layout } from '../../components/layout/Layout';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
    FileText, RefreshCw, CheckCircle2, XCircle, Loader2, Eye, X,
    Filter, Download, Mail, ShieldCheck, MessageSquare, User as UserIcon,
    Clock, AlertCircle, Printer, History,
} from 'lucide-react';


const STATUS_CFG = {
    pending: { label: 'Pendiente de emisión', cls: 'lb-badge lb-badge-pending', icon: Clock },
    issued: { label: 'Emitido', cls: 'lb-badge lb-badge-review', icon: CheckCircle2 },
    downloaded: { label: 'Descargado', cls: 'lb-badge lb-badge-approved', icon: Download },
    verified: { label: 'Verificado', cls: 'lb-badge lb-badge-approved', icon: ShieldCheck },
    rejected: { label: 'Rechazada', cls: 'lb-badge lb-badge-error', icon: XCircle },
};


const AdminBankCertificatesPage = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pending');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(null);
    const [rejecting, setRejecting] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [issuingObs, setIssuingObs] = useState('');
    const [issuingFor, setIssuingFor] = useState(null);
    const [obsText, setObsText] = useState('');
    const [obsFor, setObsFor] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);

    const fetchList = async () => {
        setLoading(true);
        try {
            const params = {};
            if (filter) params.status = filter;
            if (search.trim()) params.q = search.trim();
            const { data } = await api.get('/admin/bank-certificate-requests', { params });
            setItems(data?.requests || []);
        } catch (e) { toast.error('Error al cargar'); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        fetchList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter]);

    const issue = async () => {
        if (!issuingFor) return;
        setActionLoading(true);
        try {
            await api.post(`/admin/bank-certificate-requests/${issuingFor.id}/issue`, { observations: issuingObs.trim() });
            toast.success(`Justificante emitido · ${issuingFor.ref}`);
            setIssuingFor(null); setIssuingObs(''); setSelected(null);
            await fetchList();
        } catch (e) { toast.error(e?.response?.data?.detail || 'Error'); }
        finally { setActionLoading(false); }
    };

    const reject = async () => {
        if (!rejecting) return;
        if (!rejectReason || rejectReason.length < 5) { toast.error('Motivo mín. 5 chars'); return; }
        setActionLoading(true);
        try {
            await api.post(`/admin/bank-certificate-requests/${rejecting.id}/reject`, { reason: rejectReason.trim() });
            toast.success('Solicitud rechazada');
            setRejecting(null); setRejectReason(''); setSelected(null);
            await fetchList();
        } catch (e) { toast.error(e?.response?.data?.detail || 'Error'); }
        finally { setActionLoading(false); }
    };

    const addObservation = async () => {
        if (!obsFor || !obsText.trim()) return;
        try {
            await api.post(`/admin/bank-certificate-requests/${obsFor.id}/observations`, { text: obsText.trim() });
            toast.success('Observación añadida');
            setObsFor(null); setObsText('');
            await fetchList();
        } catch (e) { toast.error(e?.response?.data?.detail || 'Error'); }
    };

    const verify = async (r) => {
        try {
            await api.post(`/admin/bank-certificate-requests/${r.id}/verify`);
            toast.success('Marcado como verificado');
            await fetchList();
        } catch (e) { toast.error(e?.response?.data?.detail || 'Error'); }
    };

    const downloadPdf = async (r) => {
        try {
            const { data } = await api.get(`/admin/bank-certificate-requests/${r.id}/download`);
            const a = document.createElement('a');
            a.href = data.pdf_b64;
            a.download = data.filename || `justificante-${r.ref}.pdf`;
            a.click();
        } catch (e) { toast.error(e?.response?.data?.detail || 'Error'); }
    };

    const sendEmail = async (r) => {
        try {
            await api.post(`/admin/bank-certificate-requests/${r.id}/email`);
            toast.success('Enviado por correo (cola)');
            await fetchList();
        } catch (e) { toast.error(e?.response?.data?.detail || 'Error'); }
    };

    const printPdf = async (r) => {
        try {
            const { data } = await api.get(`/admin/bank-certificate-requests/${r.id}/download`);
            const w = window.open();
            if (w) {
                w.document.write(`<iframe src="${data.pdf_b64}" style="width:100%;height:100vh;border:0" onload="this.contentWindow.print()"></iframe>`);
            }
        } catch (e) { toast.error('Error al imprimir'); }
    };

    return (
        <Layout>
            <div className="max-w-6xl mx-auto space-y-6" data-testid="admin-bank-certificates-page">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#4DA3FF] to-[#1973B8] flex items-center justify-center shadow-[0_6px_20px_-4px_rgba(77,163,255,0.55)]">
                            <FileText className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-white text-xl sm:text-2xl font-bold leading-tight">Justificantes Bancarios</h1>
                            <p className="text-slate-400 text-[12.5px] mt-0.5">Gestión documental · emisión, envío y verificación</p>
                        </div>
                    </div>
                    <button onClick={fetchList} className="lb-btn-secondary text-[12px]"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar</button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {[
                        { k: 'pending', label: 'Pendientes' },
                        { k: 'issued', label: 'Emitidas' },
                        { k: 'downloaded', label: 'Descargadas' },
                        { k: 'verified', label: 'Verificadas' },
                        { k: 'rejected', label: 'Rechazadas' },
                        { k: '', label: 'Todas' },
                    ].map((t) => (
                        <button key={t.k} onClick={() => setFilter(t.k)} className={`px-3 py-1.5 rounded-full text-[11.5px] font-bold transition-colors ${filter === t.k ? 'bg-cyan-400 text-cyan-950' : 'bg-slate-800/60 text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800'}`}>
                            <Filter className="w-3 h-3 inline mr-1" /> {t.label}
                        </button>
                    ))}
                </div>

                <Card className="bg-slate-900/60 border-slate-800 p-3">
                    <div className="flex items-center gap-2">
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') fetchList(); }} placeholder="Buscar email / referencia BCR / nombre" className="bg-slate-950 border-slate-800 text-white text-[12.5px] h-9" />
                        <button onClick={fetchList} className="lb-btn-primary text-[12px]"><Filter className="w-3.5 h-3.5" /> Buscar</button>
                    </div>
                </Card>

                {/* Card-style list (per request) */}
                {loading ? (
                    <div className="p-10 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Cargando…</div>
                ) : items.length === 0 ? (
                    <div className="p-10 text-center text-slate-500">Sin solicitudes para este filtro.</div>
                ) : (
                    <div className="space-y-3">
                        {items.map((r) => {
                            const cfg = STATUS_CFG[r.status] || STATUS_CFG.pending;
                            const Icon = cfg.icon;
                            const date = (r.requested_at || '').slice(0, 10);
                            return (
                                <Card key={r.id} className="bg-slate-900/60 border-slate-800 p-4 lb-card-glow">
                                    <div className="flex flex-col lg:flex-row gap-4">
                                        {/* Left info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <FileText className="w-4 h-4 text-cyan-300" />
                                                <p className="text-white font-bold text-[13px]">Solicitud de Justificante Bancario</p>
                                                <span className={`${cfg.cls} text-[9px]`}><Icon className="w-2.5 h-2.5" /> {cfg.label}</span>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                                                <p className="text-slate-400">Referencia: <span className="text-cyan-300 font-mono font-bold">{r.ref}</span></p>
                                                <p className="text-slate-400">Usuario: <span className="text-white">{r.user_email}</span></p>
                                                <p className="text-slate-400">Fecha: <span className="text-white">{date}</span></p>
                                                {r.note && <p className="text-slate-400 sm:col-span-2">Nota: <span className="text-slate-200 italic">"{r.note}"</span></p>}
                                                {r.observations && <p className="text-slate-400 sm:col-span-2">Observaciones: <span className="text-amber-200">{r.observations}</span></p>}
                                                {r.rejected_reason && <p className="text-slate-400 sm:col-span-2">Motivo rechazo: <span className="text-rose-300">{r.rejected_reason}</span></p>}
                                            </div>
                                        </div>

                                        {/* Right actions */}
                                        <div className="flex flex-wrap gap-2 items-start lg:justify-end lg:flex-shrink-0">
                                            {r.status === 'pending' && (
                                                <>
                                                    <Button onClick={() => { setIssuingFor(r); setIssuingObs(''); }} className="bg-[#00D084] hover:bg-[#00b876] text-slate-950 font-bold text-[11.5px] h-8" data-testid={`bcr-issue-${r.ref}`}><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Emitir justificante</Button>
                                                    <Button onClick={() => { setRejecting(r); setRejectReason(''); }} className="bg-[#FF5C5C] hover:bg-[#e54848] text-white font-bold text-[11.5px] h-8" data-testid={`bcr-reject-${r.ref}`}><XCircle className="w-3.5 h-3.5 mr-1" /> Rechazar</Button>
                                                </>
                                            )}
                                            {(r.status === 'issued' || r.status === 'downloaded' || r.status === 'verified') && (
                                                <>
                                                    <Button onClick={() => downloadPdf(r)} className="bg-[#4DA3FF]/15 hover:bg-[#4DA3FF]/25 ring-1 ring-[#4DA3FF]/40 text-[#4DA3FF] font-bold text-[11.5px] h-8" data-testid={`bcr-download-${r.ref}`}><Download className="w-3.5 h-3.5 mr-1" /> Descargar PDF</Button>
                                                    <Button onClick={() => sendEmail(r)} className="bg-amber-500/15 hover:bg-amber-500/25 ring-1 ring-amber-500/40 text-amber-300 font-bold text-[11.5px] h-8"><Mail className="w-3.5 h-3.5 mr-1" /> Enviar correo</Button>
                                                    <Button onClick={() => printPdf(r)} className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11.5px] h-8"><Printer className="w-3.5 h-3.5 mr-1" /> Imprimir</Button>
                                                </>
                                            )}
                                            {(r.status === 'issued' || r.status === 'downloaded') && (
                                                <Button onClick={() => verify(r)} className="bg-[#00D084]/15 hover:bg-[#00D084]/25 ring-1 ring-[#00D084]/40 text-[#00D084] font-bold text-[11.5px] h-8"><ShieldCheck className="w-3.5 h-3.5 mr-1" /> Verificar</Button>
                                            )}
                                            <Button onClick={() => { setObsFor(r); setObsText(r.observations || ''); }} className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11.5px] h-8"><MessageSquare className="w-3.5 h-3.5 mr-1" /> Observaciones</Button>
                                            <Button onClick={() => setSelected(r)} className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11.5px] h-8"><Eye className="w-3.5 h-3.5 mr-1" /> Ver perfil</Button>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}

                {/* Detail / User profile + audit */}
                {selected && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setSelected(null)}>
                        <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-2xl bg-slate-950 ring-1 ring-slate-800 rounded-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
                            <div className="bg-gradient-to-br from-[#072146] via-[#0a1c3d] to-slate-950 px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <UserIcon className="w-5 h-5 text-cyan-300" />
                                    <div>
                                        <h3 className="text-white font-bold leading-tight">Perfil del solicitante</h3>
                                        <p className="text-slate-400 text-[11.5px] mt-0.5 font-mono">{selected.ref}</p>
                                    </div>
                                </div>
                                <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"><X className="w-4 h-4" /></button>
                            </div>
                            <div className="p-5 space-y-3">
                                <Row label="Nombre" value={selected.user_name || '—'} />
                                <Row label="Email" value={selected.user_email} />
                                <Row label="User ID" value={selected.user_id} mono />
                                <Row label="Unlock ID" value={selected.unlock_id || '—'} mono />
                                <div className="border-t border-slate-800 my-2" />
                                <p className="text-slate-500 text-[10.5px] font-bold uppercase tracking-[0.16em]">Estado y fechas</p>
                                <Row label="Estado" value={(STATUS_CFG[selected.status] || STATUS_CFG.pending).label} />
                                <Row label="Solicitado" value={(selected.requested_at || '').replace('T', ' ').slice(0, 19)} mono />
                                {selected.issued_at && <Row label="Emitido" value={selected.issued_at.replace('T', ' ').slice(0, 19)} mono />}
                                {selected.downloaded_at && <Row label="Descargado" value={selected.downloaded_at.replace('T', ' ').slice(0, 19)} mono />}
                                {selected.verified_at && <Row label="Verificado" value={selected.verified_at.replace('T', ' ').slice(0, 19)} mono />}
                                {selected.rejected_at && <Row label="Rechazado" value={selected.rejected_at.replace('T', ' ').slice(0, 19)} mono />}

                                {/* Audit history */}
                                {selected.audit?.history?.length > 0 && (
                                    <>
                                        <div className="border-t border-slate-800 my-2" />
                                        <p className="text-slate-500 text-[10.5px] font-bold uppercase tracking-[0.16em] flex items-center gap-1"><History className="w-3 h-3" /> Historial de acciones</p>
                                        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                                            {[...selected.audit.history].reverse().map((h, i) => (
                                                <div key={i} className="px-2 py-1.5 rounded-md bg-slate-900 ring-1 ring-slate-800 text-[11px]">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-cyan-300 font-bold uppercase tracking-wider">{h.event}</span>
                                                        <span className="text-slate-500 font-mono text-[10px]">{(h.at || '').replace('T', ' ').slice(0, 19)}</span>
                                                    </div>
                                                    <div className="text-slate-400 mt-0.5">por <span className="text-slate-200">{h.by || '—'}</span>{h.ip ? <> · <span className="font-mono text-slate-500">{h.ip}</span></> : null}</div>
                                                    {h.reason && <p className="text-rose-300 mt-0.5">Motivo: {h.reason}</p>}
                                                    {h.observations && <p className="text-amber-200 mt-0.5">Obs: {h.observations}</p>}
                                                    {h.text && <p className="text-amber-200 mt-0.5">"{h.text}"</p>}
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Issue modal */}
                {issuingFor && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setIssuingFor(null)}>
                        <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md bg-slate-950 ring-1 ring-[#00D084]/40 rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-[#00D084]" /><h3 className="text-white font-bold">Emitir justificante · {issuingFor.ref}</h3></div>
                            <div className="p-5 space-y-3">
                                <p className="text-slate-400 text-[12.5px]">Se generará el PDF institucional y el usuario será notificado. Las observaciones se incluirán en el documento.</p>
                                <Label className="text-slate-400 text-[11.5px]">Observaciones (opcional)</Label>
                                <Textarea value={issuingObs} onChange={(e) => setIssuingObs(e.target.value)} placeholder="Ej. Documento emitido para activación de retiro parcial..." className="bg-slate-900 border-slate-800 text-white text-sm" />
                                <div className="flex gap-2 pt-2">
                                    <Button onClick={() => setIssuingFor(null)} variant="outline" className="flex-1">Cancelar</Button>
                                    <Button onClick={issue} disabled={actionLoading} className="flex-1 bg-[#00D084] hover:bg-[#00b876] text-slate-950 font-bold" data-testid="bcr-issue-confirm">{actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Emitir PDF'}</Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Reject modal */}
                {rejecting && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setRejecting(null)}>
                        <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md bg-slate-950 ring-1 ring-[#FF5C5C]/40 rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2"><XCircle className="w-5 h-5 text-[#FF5C5C]" /><h3 className="text-white font-bold">Rechazar solicitud · {rejecting.ref}</h3></div>
                            <div className="p-5 space-y-3">
                                <Label className="text-slate-400 text-[11.5px]">Motivo <span className="text-rose-400">*</span></Label>
                                <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Ej. Información insuficiente / no corresponde al usuario / no cumple requisitos" className="bg-slate-900 border-slate-800 text-white text-sm" />
                                <div className="flex gap-2 pt-2">
                                    <Button onClick={() => setRejecting(null)} variant="outline" className="flex-1">Cancelar</Button>
                                    <Button onClick={reject} disabled={actionLoading || rejectReason.length < 5} className="flex-1 bg-[#FF5C5C] hover:bg-[#e54848] text-white font-bold" data-testid="bcr-reject-confirm">{actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar rechazo'}</Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Observations modal */}
                {obsFor && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setObsFor(null)}>
                        <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md bg-slate-950 ring-1 ring-amber-500/40 rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2"><MessageSquare className="w-5 h-5 text-amber-300" /><h3 className="text-white font-bold">Añadir observación · {obsFor.ref}</h3></div>
                            <div className="p-5 space-y-3">
                                <Textarea value={obsText} onChange={(e) => setObsText(e.target.value)} placeholder="Observación interna o nota para el documento" className="bg-slate-900 border-slate-800 text-white text-sm" />
                                <div className="flex gap-2 pt-2">
                                    <Button onClick={() => setObsFor(null)} variant="outline" className="flex-1">Cancelar</Button>
                                    <Button onClick={addObservation} className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">Guardar</Button>
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


export default AdminBankCertificatesPage;
