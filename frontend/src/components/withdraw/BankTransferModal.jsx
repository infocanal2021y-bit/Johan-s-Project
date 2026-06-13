import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import api from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
    Building2, Copy, Check, Upload, Loader2, X, AlertTriangle,
    Clock, CheckCircle2, XCircle, FileText, ArrowRight,
} from 'lucide-react';


const STATUS_PILL = {
    in_review: {
        icon: Loader2,
        label: 'Transferencia en revisión',
        cls: 'bg-[#4DA3FF]/14 text-[#4DA3FF] ring-1 ring-[#4DA3FF]/40 shadow-[0_0_18px_-6px_rgba(77,163,255,.45)]',
        spin: true,
    },
    approved: {
        icon: CheckCircle2,
        label: 'Aprobada',
        cls: 'bg-[#00D084]/14 text-[#00D084] ring-1 ring-[#00D084]/40 shadow-[0_0_18px_-6px_rgba(0,208,132,.45)]',
    },
    rejected: {
        icon: XCircle,
        label: 'Rechazada',
        cls: 'bg-[#FF5C5C]/14 text-[#FF5C5C] ring-1 ring-[#FF5C5C]/40 shadow-[0_0_18px_-6px_rgba(255,92,92,.45)]',
    },
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
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const [b, p] = await Promise.all([
                    api.get('/bank-transfer-proofs/treasury-account'),
                    api.get('/bank-transfer-proofs/me'),
                ]);
                if (cancelled) return;
                setBank(b.data);
                setProofs(p.data?.proofs || []);
            } catch (e) {
                /* ignore */
            }
        })();
        return () => { cancelled = true; };
    }, [open]);

    // Prefill amount once when modal opens
    useEffect(() => {
        if (open && !amount && remainingEur != null) {
            setAmount(String(Number(remainingEur).toFixed(2)));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const handleFile = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (f.size > 5 * 1024 * 1024) {
            toast.error('Archivo supera 5MB');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setProofB64(String(reader.result));
            setProofMime(f.type);
            setProofFilename(f.name);
            setProofPreview(String(reader.result));
        };
        reader.readAsDataURL(f);
    };

    const copy = (v) => {
        navigator.clipboard.writeText(v);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
        toast.success('Copiado');
    };

    const submit = async () => {
        if (!amount || parseFloat(amount) < 500) {
            toast.error('Monto mínimo €500');
            return;
        }
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
            toast.success(`Transferencia en revisión · ${data.case_code}`);
            // reset form
            setHolder(''); setReference(''); setProofB64(''); setProofMime(''); setProofFilename(''); setProofPreview('');
            // refresh list
            const p = await api.get('/bank-transfer-proofs/me');
            setProofs(p.data?.proofs || []);
            onSubmitted?.();
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Error al enviar');
        } finally {
            setSubmitting(false);
        }
    };

    const lastRejected = proofs.find(p => p.status === 'rejected');

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
                                        <p className="text-slate-400 text-[11px] mt-0.5">Sube el comprobante para que sea revisado.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex-shrink-0"
                                    aria-label="Cerrar"
                                    data-testid="bank-transfer-modal-close"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="px-5 py-5 space-y-4">
                            {/* Rejected-state callout — appears at top so user notices */}
                            {lastRejected && (
                                <div className="p-3 rounded-xl bg-[#FF5C5C]/10 ring-1 ring-[#FF5C5C]/40" data-testid="bank-transfer-rejected-banner">
                                    <div className="flex items-start gap-2">
                                        <XCircle className="w-4 h-4 text-[#FF5C5C] flex-shrink-0 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="text-[#FF5C5C] text-[12px] font-bold">Transferencia rechazada · {lastRejected.case_code}</p>
                                            <p className="text-rose-200/80 text-[11.5px] mt-0.5">{lastRejected.reject_reason || 'Sin motivo especificado'}</p>
                                            <p className="text-slate-400 text-[10.5px] mt-1">Puedes subir un nuevo comprobante a continuación.</p>
                                        </div>
                                    </div>
                                </div>
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
                                        <p className="text-amber-200 text-[10.5px] leading-snug">
                                            <span className="font-bold">Importante:</span> {bank.reference_hint}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Form */}
                            <div className="rounded-xl bg-slate-900/40 ring-1 ring-slate-800 p-4 space-y-3">
                                <p className="text-slate-400 text-[10.5px] font-bold uppercase tracking-[0.16em]">Datos del pago</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-slate-400 text-[11.5px]">Monto enviado (EUR) <span className="text-rose-400">*</span></Label>
                                        <Input
                                            type="number" step="1" min="500"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="Mín. 500"
                                            className="bg-slate-950 border-slate-800 text-white font-mono h-9"
                                            data-testid="bank-transfer-amount-input"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-slate-400 text-[11.5px]">Referencia / concepto <span className="text-rose-400">*</span></Label>
                                        <Input
                                            value={reference}
                                            onChange={(e) => setReference(e.target.value)}
                                            placeholder="Ej. PLB-2026-XXXXXX"
                                            className="bg-slate-950 border-slate-800 text-white text-sm h-9"
                                            data-testid="bank-transfer-reference-input"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-slate-400 text-[11.5px]">Nombre del titular emisor <span className="text-rose-400">*</span></Label>
                                    <Input
                                        value={holder}
                                        onChange={(e) => setHolder(e.target.value)}
                                        placeholder="Ej. Jorge Lamberti"
                                        className="bg-slate-950 border-slate-800 text-white text-sm h-9"
                                        data-testid="bank-transfer-holder-input"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-slate-400 text-[11.5px]">Comprobante <span className="text-rose-400">*</span></Label>
                                    <label className="cursor-pointer block">
                                        <div className={`p-3 rounded-lg border-2 border-dashed transition-colors ${proofPreview ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-800 hover:border-slate-700'}`}>
                                            <div className="flex flex-col items-center gap-1.5">
                                                {proofPreview ? (
                                                    <img src={proofPreview} alt="Comprobante" className="max-h-32 rounded" />
                                                ) : (
                                                    <>
                                                        <Upload className="w-5 h-5 text-slate-500" />
                                                        <p className="text-[11.5px] text-slate-500">Subir captura/PDF (máx. 5MB)</p>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <input type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" data-testid="bank-transfer-proof-input" />
                                    </label>
                                </div>
                                <Button
                                    onClick={submit}
                                    disabled={submitting}
                                    className="w-full h-11 text-white font-bold tracking-wide bg-gradient-to-r from-[#4DA3FF] to-[#1973B8] hover:opacity-95 shadow-[0_10px_30px_-8px_rgba(77,163,255,.55)]"
                                    data-testid="bank-transfer-submit-btn"
                                >
                                    {submitting ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando…</>
                                    ) : (
                                        <><Upload className="w-4 h-4 mr-2" /> Subir comprobante</>
                                    )}
                                </Button>
                                {copied && <p className="text-emerald-300 text-[10.5px] text-center">Copiado al portapapeles</p>}
                            </div>

                            {/* My recent transfers — status list */}
                            {proofs.length > 0 && (
                                <div className="rounded-xl bg-slate-900/40 ring-1 ring-slate-800 p-3 space-y-2" data-testid="bank-transfer-history">
                                    <p className="text-slate-400 text-[10.5px] font-bold uppercase tracking-[0.16em]">Mis transferencias</p>
                                    <div className="space-y-1.5">
                                        {proofs.slice(0, 6).map((p) => {
                                            const cfg = STATUS_PILL[p.status] || STATUS_PILL.in_review;
                                            const Icon = cfg.icon;
                                            return (
                                                <div key={p.id} className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg bg-slate-950 ring-1 ring-slate-800">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <FileText className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                                                        <div className="min-w-0">
                                                            <p className="text-white text-[12px] font-bold tabular-nums">€{Number(p.amount_eur || 0).toFixed(2)}</p>
                                                            <p className="text-slate-500 text-[10px] font-mono truncate">{p.case_code}</p>
                                                        </div>
                                                    </div>
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wide ${cfg.cls}`}>
                                                        <Icon className={`w-2.5 h-2.5 ${cfg.spin ? 'animate-spin' : ''}`} />
                                                        {cfg.label}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
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
            <button
                onClick={onCopy}
                className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex-shrink-0"
                title="Copiar"
            >
                <Copy className="w-3 h-3" />
            </button>
        )}
    </div>
);


export default BankTransferModal;
