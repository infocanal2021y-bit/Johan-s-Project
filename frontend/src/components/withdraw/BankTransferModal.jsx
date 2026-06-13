import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import api from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
    Building2, Copy, Check, Upload, Loader2, X, AlertTriangle,
    Clock, CheckCircle2, XCircle, FileText, Download, ZoomIn, ZoomOut,
    RefreshCw, History, Eye, Hourglass,
} from 'lucide-react';


const STATUS_PILL = {
    in_review: { icon: Loader2, label: 'En revisión', cls: 'lb-badge lb-badge-review', spin: true },
    approved: { icon: CheckCircle2, label: 'Aprobada', cls: 'lb-badge lb-badge-approved' },
    rejected: { icon: XCircle, label: 'Rechazada', cls: 'lb-badge lb-badge-error' },
};


// Pipeline timeline
const TIMELINE_STAGES = [
    { key: 'received', label: 'Transferencia recibida' },
    { key: 'in_review', label: 'En revisión' },
    { key: 'verified', label: 'Verificada' },
    { key: 'approved', label: 'Pago aprobado' },
    { key: 'withdrawal_enabled', label: 'Retiro habilitado' },
];

const computeStage = (proof) => {
    // 0=not done, 1=current(active), 2=done
    const state = {};
    if (!proof) return state;
    const s = proof.status;
    if (s === 'rejected') {
        state.received = 2; state.in_review = -1; // rejected branch
        return state;
    }
    state.received = 2;
    state.in_review = s === 'in_review' ? 1 : 2;
    state.verified = s === 'approved' ? 2 : (s === 'in_review' ? 0 : 0);
    state.approved = s === 'approved' ? 2 : 0;
    state.withdrawal_enabled = s === 'approved' ? 1 : 0;
    return state;
};


const PipelineTimeline = ({ proof }) => {
    const states = computeStage(proof);
    const rejected = proof?.status === 'rejected';

    if (rejected) {
        return (
            <div className="px-3 py-2.5 rounded-xl bg-[#FF5C5C]/10 ring-1 ring-[#FF5C5C]/40 flex items-start gap-2" data-testid="bank-transfer-timeline-rejected">
                <XCircle className="w-4 h-4 text-[#FF5C5C] flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <p className="text-[#FF5C5C] text-[12px] font-bold">Transferencia rechazada · {proof.tracking_ref}</p>
                    <p className="text-rose-200/80 text-[11px] mt-0.5"><span className="font-bold">Motivo del rechazo:</span> {proof.reject_reason || 'Sin motivo'}</p>
                    <p className="text-slate-400 text-[10.5px] mt-1">Puedes subir un nuevo comprobante.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-3" data-testid="bank-transfer-timeline">
            <div className="flex items-center gap-1 mb-2">
                <Hourglass className="w-3.5 h-3.5 text-cyan-300" />
                <p className="text-cyan-300 text-[10.5px] font-bold uppercase tracking-[0.16em]">Estado de la transferencia</p>
            </div>
            {/* Stages */}
            <div className="relative flex items-center justify-between">
                {/* Background bar */}
                <div className="absolute left-3 right-3 top-[10px] h-[3px] bg-slate-800 rounded-full" />
                {/* Progress bar */}
                <div
                    className="absolute left-3 top-[10px] h-[3px] rounded-full transition-all duration-700 ease-out"
                    style={{
                        width: `calc(${(Math.max(0, Object.values(states).filter(v => v === 2).length - 1) / (TIMELINE_STAGES.length - 1)) * 100}% - 0px)`,
                        background: 'linear-gradient(90deg,#FFB800 0%,#FFB800 25%,#00D084 50%,#00D084 100%)',
                    }}
                />
                {TIMELINE_STAGES.map((st) => {
                    const v = states[st.key] || 0;
                    const isDone = v === 2;
                    const isActive = v === 1;
                    const isPending = v === 0;
                    return (
                        <div key={st.key} className="relative z-10 flex flex-col items-center gap-1.5 flex-1" data-testid={`tl-stage-${st.key}`}>
                            <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-slate-950 transition-colors ${
                                    isDone ? 'bg-[#00D084]' : isActive ? 'bg-[#FFB800]' : isPending ? 'bg-slate-700' : 'bg-slate-700'
                                }`}
                                style={isActive ? { boxShadow: '0 0 0 4px rgba(255,184,0,0.18), 0 0 14px rgba(255,184,0,0.45)' } : isDone ? { boxShadow: '0 0 10px rgba(0,208,132,0.5)' } : {}}
                            >
                                {isDone ? (
                                    <Check className="w-2.5 h-2.5 text-slate-950" />
                                ) : isActive ? (
                                    <Loader2 className="w-2.5 h-2.5 text-slate-950 animate-spin" />
                                ) : (
                                    <span className="w-1 h-1 rounded-full bg-slate-500" />
                                )}
                            </div>
                            <p className={`text-[9px] font-bold text-center leading-tight ${isDone ? 'text-[#00D084]' : isActive ? 'text-[#FFB800]' : 'text-slate-500'}`}>
                                {st.label}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};


// Proof preview modal with zoom
const ProofPreviewLightbox = ({ src, mime, filename, onClose, onChange }) => {
    const [zoom, setZoom] = useState(1);
    const isPdf = (mime || '').includes('pdf');
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <div className="absolute top-4 right-4 left-4 flex items-center justify-between z-10 gap-2">
                    <div className="text-white text-[11.5px] font-mono bg-slate-900/80 rounded-md px-3 py-1.5 truncate max-w-md">{filename || 'comprobante'}</div>
                    <div className="flex items-center gap-2">
                        {!isPdf && (
                            <>
                                <button onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(0.5, z - 0.25)); }} className="w-9 h-9 rounded-lg bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center ring-1 ring-slate-700" data-testid="proof-zoom-out"><ZoomOut className="w-4 h-4" /></button>
                                <span className="text-white text-[11.5px] font-mono bg-slate-900/80 rounded-md px-2 py-1.5 ring-1 ring-slate-700">{Math.round(zoom * 100)}%</span>
                                <button onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(3, z + 0.25)); }} className="w-9 h-9 rounded-lg bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center ring-1 ring-slate-700" data-testid="proof-zoom-in"><ZoomIn className="w-4 h-4" /></button>
                            </>
                        )}
                        {onChange && (
                            <button onClick={(e) => { e.stopPropagation(); onChange(); }} className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 ring-1 ring-amber-500/40 text-[11.5px] font-bold inline-flex items-center gap-1" data-testid="proof-change-file"><RefreshCw className="w-3 h-3" /> Cambiar archivo</button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="w-9 h-9 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 flex items-center justify-center ring-1 ring-rose-500/40"><X className="w-4 h-4" /></button>
                    </div>
                </div>
                <div className="max-w-5xl max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                    {isPdf ? (
                        <div className="bg-slate-900 rounded-xl p-8 ring-1 ring-slate-800 flex flex-col items-center gap-3">
                            <FileText className="w-12 h-12 text-slate-500" />
                            <p className="text-white font-bold">{filename}</p>
                            <a href={src} download={filename} className="lb-btn-primary inline-flex"><Download className="w-4 h-4" /> Descargar PDF</a>
                        </div>
                    ) : (
                        <img src={src} alt="Comprobante" style={{ transform: `scale(${zoom})`, transformOrigin: 'center', transition: 'transform 200ms ease' }} className="max-w-full max-h-[85vh] rounded-lg ring-1 ring-slate-800 shadow-2xl" />
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
};


export const BankTransferModal = ({ open, onClose, remainingEur, onSubmitted }) => {
    const [bank, setBank] = useState(null);
    const [proofs, setProofs] = useState([]);
    const [amount, setAmount] = useState('');
    const [holder, setHolder] = useState('');
    const [reference, setReference] = useState('');
    const [proofB64, setProofB64] = useState('');
    const [proofMime, setProofMime] = useState('');
    const [proofFilename, setProofFilename] = useState('');
    const [proofPreview, setProofPreview] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [historyPreview, setHistoryPreview] = useState(null); // {src,mime,filename}

    const fetchData = async () => {
        try {
            const [b, p] = await Promise.all([
                api.get('/bank-transfer-proofs/treasury-account'),
                api.get('/bank-transfer-proofs/me'),
            ]);
            setBank(b.data);
            setProofs(p.data?.proofs || []);
        } catch (e) { /* ignore */ }
    };

    useEffect(() => {
        if (!open) return undefined;
        fetchData();
        return undefined;
    }, [open]);

    useEffect(() => {
        if (open && !amount && remainingEur != null) {
            setAmount(String(Number(remainingEur).toFixed(2)));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const handleFile = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (f.size > 5 * 1024 * 1024) { toast.error('Archivo supera 5MB'); return; }
        const reader = new FileReader();
        reader.onload = () => {
            setProofB64(String(reader.result));
            setProofMime(f.type);
            setProofFilename(f.name);
            setProofPreview(String(reader.result));
        };
        reader.readAsDataURL(f);
    };

    const copy = (v) => { navigator.clipboard.writeText(v); toast.success('Copiado'); };

    const clearForm = () => {
        setHolder(''); setReference(''); setProofB64(''); setProofMime(''); setProofFilename(''); setProofPreview('');
    };

    const submit = async () => {
        if (!amount || parseFloat(amount) < 500) { toast.error('Monto mínimo €500'); return; }
        if (!holder || holder.length < 3) { toast.error('Nombre titular obligatorio'); return; }
        if (!reference || reference.length < 2) { toast.error('Referencia obligatoria'); return; }
        if (!proofB64) { toast.error('Comprobante requerido'); return; }

        setSubmitting(true);
        try {
            const { data } = await api.post('/bank-transfer-proofs/submit', {
                amount_eur: parseFloat(amount),
                holder_name: holder.trim(),
                reference: reference.trim(),
                proof_b64: proofB64,
                proof_mime: proofMime,
                proof_filename: proofFilename,
            });
            toast.success(`Comprobante recibido · ${data.tracking_ref}`);
            clearForm();
            await fetchData();
            onSubmitted?.();
        } catch (e) {
            const msg = e?.response?.data?.detail || 'Error al enviar';
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const downloadOwn = async (p) => {
        try {
            const { data } = await api.get(`/bank-transfer-proofs/me/${p.id}/file`);
            // trigger browser download
            const a = document.createElement('a');
            a.href = data.proof_b64;
            a.download = data.proof_filename || `comprobante-${p.tracking_ref}`;
            a.click();
        } catch (e) { toast.error('No se pudo descargar'); }
    };

    const viewOwn = async (p) => {
        try {
            const { data } = await api.get(`/bank-transfer-proofs/me/${p.id}/file`);
            setHistoryPreview({ src: data.proof_b64, mime: data.proof_mime, filename: data.proof_filename || p.tracking_ref });
        } catch (e) { toast.error('No se pudo cargar'); }
    };

    const activeProof = useMemo(() => proofs.find(p => p.status === 'in_review' || p.status === 'approved'), [proofs]);
    const lastRejected = useMemo(() => proofs.find(p => p.status === 'rejected'), [proofs]);
    const canSubmitNew = !activeProof; // duplicate detection backend will also enforce

    const formatDate = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                    onClick={onClose}
                    data-testid="bank-transfer-modal"
                >
                    <motion.div
                        initial={{ y: 24, scale: 0.96, opacity: 0 }}
                        animate={{ y: 0, scale: 1, opacity: 1 }}
                        exit={{ y: 24, scale: 0.96, opacity: 0 }}
                        transition={{ type: 'spring', damping: 24, stiffness: 320 }}
                        className="relative w-full max-w-2xl bg-slate-950 ring-1 ring-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="relative bg-gradient-to-br from-[#072146] via-[#0a1c3d] to-slate-950 px-5 py-4 border-b border-slate-800">
                            <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-[#4DA3FF]/20 blur-3xl pointer-events-none" />
                            <div className="relative flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4DA3FF] to-[#1973B8] flex items-center justify-center shadow-[0_4px_16px_-2px_rgba(77,163,255,0.5)] flex-shrink-0">
                                        <Building2 className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-white text-base font-bold leading-tight">Pagar por transferencia bancaria</h3>
                                        <p className="text-slate-400 text-[11px] mt-0.5">Si ya realizó la transferencia, suba su comprobante para iniciar la validación administrativa.</p>
                                    </div>
                                </div>
                                <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex-shrink-0" aria-label="Cerrar" data-testid="bank-transfer-modal-close">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="px-5 py-5 space-y-4">
                            {/* Active proof timeline (in_review or approved) — highlights current status */}
                            {activeProof && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-slate-400 text-[10.5px] font-bold uppercase tracking-[0.16em]">Mi última transferencia</p>
                                        <span className="text-cyan-300 text-[10.5px] font-mono font-bold">{activeProof.tracking_ref}</span>
                                    </div>
                                    <PipelineTimeline proof={activeProof} />
                                </div>
                            )}

                            {/* Rejected callout */}
                            {!activeProof && lastRejected && (
                                <PipelineTimeline proof={lastRejected} />
                            )}

                            {/* Bank details */}
                            {bank && (
                                <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 overflow-hidden">
                                    <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
                                        <p className="text-slate-400 text-[10.5px] font-bold uppercase tracking-[0.16em]">Datos para transferir</p>
                                        <span className="text-slate-500 text-[10px]">{bank.country} · {bank.currency}</span>
                                    </div>
                                    <div className="divide-y divide-slate-800" data-testid="bank-transfer-treasury-details">
                                        <BankRow label="Titular" value={bank.holder} onCopy={() => copy(bank.holder)} />
                                        <BankRow label="Banco" value={bank.bank} />
                                        <BankRow label="IBAN" value={bank.iban} mono onCopy={() => copy(bank.iban)} />
                                        <BankRow label="BIC / SWIFT" value={bank.bic} mono onCopy={() => copy(bank.bic)} />
                                    </div>
                                    <div className="px-3 py-2 bg-amber-500/8 border-t border-amber-500/20">
                                        <p className="text-amber-200 text-[10.5px] leading-snug"><span className="font-bold">Importante:</span> {bank.reference_hint}</p>
                                    </div>
                                </div>
                            )}

                            {/* Form — disabled if there is already an active proof */}
                            <div className={`rounded-xl bg-slate-900/40 ring-1 ring-slate-800 p-4 space-y-3 ${!canSubmitNew ? 'opacity-60 pointer-events-none' : ''}`}>
                                <div className="flex items-center justify-between">
                                    <p className="text-slate-400 text-[10.5px] font-bold uppercase tracking-[0.16em]">Datos del pago</p>
                                    {!canSubmitNew && (
                                        <span className="lb-badge lb-badge-review text-[8.5px]">Ya existe una solicitud activa</span>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-slate-400 text-[11.5px]">Monto enviado (EUR) <span className="text-rose-400">*</span></Label>
                                        <Input type="number" step="1" min="500" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Mín. 500" className="bg-slate-950 border-slate-800 text-white font-mono h-9" data-testid="bank-transfer-amount-input" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-slate-400 text-[11.5px]">Referencia / concepto <span className="text-rose-400">*</span></Label>
                                        <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej. TRF-2026-XXXXXX" className="bg-slate-950 border-slate-800 text-white text-sm h-9" data-testid="bank-transfer-reference-input" />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-slate-400 text-[11.5px]">Nombre del titular emisor <span className="text-rose-400">*</span></Label>
                                    <Input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Ej. Jorge Lamberti" className="bg-slate-950 border-slate-800 text-white text-sm h-9" data-testid="bank-transfer-holder-input" />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-slate-400 text-[11.5px]">Comprobante <span className="text-rose-400">*</span></Label>
                                    {proofPreview ? (
                                        <div className="p-2 rounded-lg border-2 border-emerald-500/50 bg-emerald-500/10">
                                            <div className="flex items-center gap-3">
                                                {proofMime?.includes('pdf') ? (
                                                    <div className="w-16 h-16 rounded-md bg-slate-800 flex items-center justify-center flex-shrink-0">
                                                        <FileText className="w-7 h-7 text-cyan-300" />
                                                    </div>
                                                ) : (
                                                    <img src={proofPreview} alt="Comprobante" className="w-16 h-16 rounded-md object-cover ring-1 ring-slate-700 flex-shrink-0 cursor-zoom-in" onClick={() => setPreviewOpen(true)} />
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white text-[12px] font-bold truncate">{proofFilename}</p>
                                                    <p className="text-slate-500 text-[10.5px]">{proofMime || 'image'}</p>
                                                </div>
                                                <div className="flex gap-1.5 flex-shrink-0">
                                                    <button onClick={() => setPreviewOpen(true)} className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] inline-flex items-center gap-1" data-testid="proof-preview-btn"><Eye className="w-3 h-3" /> Vista previa</button>
                                                    <label className="cursor-pointer px-2.5 py-1.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 ring-1 ring-amber-500/40 text-[11px] inline-flex items-center gap-1">
                                                        <RefreshCw className="w-3 h-3" /> Cambiar
                                                        <input type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" />
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <label className="cursor-pointer block">
                                            <div className="p-3 rounded-lg border-2 border-dashed transition-colors border-slate-800 hover:border-slate-700">
                                                <div className="flex flex-col items-center gap-1.5">
                                                    <Upload className="w-5 h-5 text-slate-500" />
                                                    <p className="text-[11.5px] text-slate-500">Subir captura/PDF (máx. 5MB)</p>
                                                </div>
                                            </div>
                                            <input type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" data-testid="bank-transfer-proof-input" />
                                        </label>
                                    )}
                                </div>

                                <Button
                                    onClick={submit}
                                    disabled={submitting || !canSubmitNew}
                                    className="w-full h-11 text-white font-bold tracking-wide bg-gradient-to-r from-[#4DA3FF] to-[#1973B8] hover:opacity-95 shadow-[0_10px_30px_-8px_rgba(77,163,255,.55)]"
                                    data-testid="bank-transfer-submit-btn"
                                >
                                    {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando…</> : <><Upload className="w-4 h-4 mr-2" /> Subir comprobante</>}
                                </Button>

                                <p className="text-center text-slate-500 text-[10.5px] flex items-center justify-center gap-1.5">
                                    <Clock className="w-3 h-3" /> Tiempo medio de validación: <span className="text-cyan-300 font-bold">24-48 horas laborables</span>
                                </p>
                            </div>

                            {/* History */}
                            {proofs.length > 0 && (
                                <div className="rounded-xl bg-slate-900/40 ring-1 ring-slate-800 overflow-hidden" data-testid="bank-transfer-history">
                                    <div className="px-3 py-2 border-b border-slate-800 flex items-center gap-1.5">
                                        <History className="w-3.5 h-3.5 text-slate-400" />
                                        <p className="text-slate-400 text-[10.5px] font-bold uppercase tracking-[0.16em]">Historial de comprobantes</p>
                                    </div>
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-slate-500 text-[9.5px] uppercase tracking-wider">
                                                <th className="text-left py-2 px-3 font-bold">Fecha</th>
                                                <th className="text-left py-2 px-3 font-bold">Referencia</th>
                                                <th className="text-right py-2 px-3 font-bold">Monto</th>
                                                <th className="text-center py-2 px-3 font-bold">Estado</th>
                                                <th className="text-right py-2 px-3 font-bold">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {proofs.slice(0, 10).map((p) => {
                                                const cfg = STATUS_PILL[p.status] || STATUS_PILL.in_review;
                                                const Icon = cfg.icon;
                                                return (
                                                    <tr key={p.id} className="border-t border-slate-800/60 hover:bg-slate-800/20">
                                                        <td className="py-2.5 px-3 text-slate-400 text-[11px] whitespace-nowrap">{formatDate(p.submitted_at)}</td>
                                                        <td className="py-2.5 px-3 text-cyan-300 font-mono text-[11px]">{p.tracking_ref}</td>
                                                        <td className="py-2.5 px-3 text-right text-white font-mono font-bold tabular-nums text-[12px]">€{Number(p.amount_eur || 0).toFixed(2)}</td>
                                                        <td className="py-2.5 px-3 text-center">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${cfg.cls}`}>
                                                                <Icon className={`w-2.5 h-2.5 ${cfg.spin ? 'animate-spin' : ''}`} /> {cfg.label}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right">
                                                            <div className="inline-flex gap-1">
                                                                <button onClick={() => viewOwn(p)} className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300" title="Ver" data-testid={`history-view-${p.id}`}><Eye className="w-3 h-3" /></button>
                                                                <button onClick={() => downloadOwn(p)} className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300" title="Descargar" data-testid={`history-download-${p.id}`}><Download className="w-3 h-3" /></button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </motion.div>

                    {/* Preview lightbox for current upload */}
                    {previewOpen && proofPreview && (
                        <ProofPreviewLightbox
                            src={proofPreview} mime={proofMime} filename={proofFilename}
                            onClose={() => setPreviewOpen(false)}
                            onChange={() => { setPreviewOpen(false); document.querySelector('[data-testid="bank-transfer-proof-input"]')?.click(); }}
                        />
                    )}

                    {/* Preview lightbox for history item */}
                    {historyPreview && (
                        <ProofPreviewLightbox
                            src={historyPreview.src} mime={historyPreview.mime} filename={historyPreview.filename}
                            onClose={() => setHistoryPreview(null)}
                        />
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
};


const BankRow = ({ label, value, mono, onCopy }) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
        <span className="text-slate-500 text-[10.5px] font-bold uppercase tracking-wider flex-shrink-0">{label}</span>
        <code className={`text-white text-[12.5px] flex-1 text-right truncate ${mono ? 'font-mono' : ''}`}>{value}</code>
        {onCopy && (
            <button onClick={onCopy} className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex-shrink-0" title="Copiar">
                <Copy className="w-3 h-3" />
            </button>
        )}
    </div>
);


export default BankTransferModal;
