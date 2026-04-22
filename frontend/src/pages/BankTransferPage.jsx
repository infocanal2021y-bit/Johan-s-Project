import { useState, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import {
    Copy, Check, Loader2, CheckCircle, Clock, Upload, X, FileText,
    Shield, ExternalLink, CreditCard, AlertTriangle, Lock, BadgeCheck,
    Building2, Landmark, ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { paymentsAPI } from '../lib/api';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';

const BANK_TRANSFER_DATA = {
    holder: 'Juan Gomez',
    amount: '4850',
    currency: 'EUR',
    reference: '216389',
    iban: 'BE73 9053 1376 1560',
    swift: 'TRWIBEB1XXX',
    address: 'Wise, Rue du Trone 100, 3rd floor, Brussels, 1050, Belgium',
};

const ONLINE_PAYMENT_LINKS = [
    { id: 1, label: 'Enlace de pago #1', url: 'https://wise.com/pay/r/rfpnQQbtekFJtl4' },
    { id: 2, label: 'Enlace de pago #2', url: 'https://wise.com/pay/r/Go2syT073Li3q2I' },
    { id: 3, label: 'Enlace de pago #3', url: 'https://wise.com/pay/r/HIgKfdc2gMgLwhM' },
];

// Brand seal for Wise (pure inline SVG, no external deps)
const WiseMark = ({ className = 'w-8 h-8' }) => (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#9FE870" />
        <path
            d="M18 19h22l-4.2 5.4h-10.8l-1.6 2.3h9.7L29 32.2h-8.4L15 39.8h23l-3 4.6H13.4l6.3-8.6-2.5-3.7 6.3-8.8-5.5-4.3Z"
            fill="#163300"
        />
    </svg>
);

const StatRow = ({ label, value, mono = true, testId, tone = 'default' }) => {
    const tones = {
        default: 'text-white',
        success: 'text-emerald-300',
    };
    return (
        <div className="flex items-center justify-between gap-4 py-3.5 border-b border-slate-800/80 last:border-b-0">
            <span className="text-[12px] uppercase tracking-[0.14em] text-slate-500 font-medium shrink-0">{label}</span>
            <span
                className={`text-sm ${mono ? 'font-mono tabular-nums' : 'font-medium'} ${tones[tone]} text-right break-all`}
                data-testid={testId}
            >
                {value}
            </span>
        </div>
    );
};

const CopyRow = ({ label, value, testId, highlight }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(value.replace(/\s/g, ''));
        setCopied(true);
        toast.success(`${label} copiado al portapapeles`);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div
            className={`group relative overflow-hidden rounded-xl border transition-all duration-200 ${
                highlight
                    ? 'bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/40 shadow-[inset_0_1px_0_rgba(245,158,11,0.2)]'
                    : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
            }`}
        >
            <div className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0 flex-1">
                    <p
                        className={`text-[11px] uppercase tracking-[0.16em] font-semibold ${
                            highlight ? 'text-amber-400' : 'text-slate-500'
                        }`}
                    >
                        {label}
                    </p>
                    <p
                        className={`font-mono text-base mt-1.5 break-all tabular-nums ${
                            highlight ? 'text-amber-100 font-bold tracking-wider' : 'text-white font-medium'
                        }`}
                    >
                        {value}
                    </p>
                    {highlight && (
                        <p className="text-amber-400/80 text-[11px] mt-2 leading-relaxed">
                            Incluya esta referencia en el concepto de su transferencia para facilitar la
                            validación del pago.
                        </p>
                    )}
                </div>
                <button
                    onClick={handleCopy}
                    data-no-hover
                    className={`flex-shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold transition-all duration-200 ${
                        highlight
                            ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 ring-1 ring-amber-500/40'
                            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 ring-1 ring-slate-700/60'
                    }`}
                    data-testid={testId}
                >
                    {copied ? (
                        <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Copiado</span>
                        </>
                    ) : (
                        <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

const TrustBadge = ({ icon: Icon, label, sub }) => (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
        <div className="w-8 h-8 rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/25 flex items-center justify-center">
            <Icon className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="leading-tight">
            <p className="text-[12px] font-semibold text-slate-200">{label}</p>
            <p className="text-[10px] text-slate-500">{sub}</p>
        </div>
    </div>
);

export default function BankTransferPage() {
    const { user } = useAuth();
    const [proofModalOpen, setProofModalOpen] = useState(false);
    const [proofFile, setProofFile] = useState(null);
    const [proofPreview, setProofPreview] = useState(null);
    const [proofFilename, setProofFilename] = useState('');
    const [proofComment, setProofComment] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [hasAccess, setHasAccess] = useState(null);

    useEffect(() => {
        paymentsAPI
            .checkBankTransferAccess()
            .then((res) => setHasAccess(res.data.has_access))
            .catch(() => setHasAccess(false));
    }, []);

    if (hasAccess === null)
        return (
            <Layout>
                <div className="flex justify-center py-20">
                    <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
                </div>
            </Layout>
        );
    if (hasAccess === false) return <Navigate to="/dashboard" replace />;

    const handleProofFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        if (!allowed.includes(file.type)) {
            toast.error('Formato no permitido. Use JPG, PNG o PDF.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Archivo demasiado grande. Máximo 5MB.');
            return;
        }
        setProofFilename(file.name);
        const reader = new FileReader();
        reader.onloadend = () => {
            setProofFile(reader.result);
            setProofPreview(file.type.startsWith('image/') ? reader.result : null);
        };
        reader.readAsDataURL(file);
    };

    const resetProof = () => {
        setProofFile(null);
        setProofPreview(null);
        setProofFilename('');
        setProofComment('');
    };

    const handleSubmit = async () => {
        if (!proofFile) {
            toast.error('Debe subir un comprobante.');
            return;
        }
        setConfirming(true);
        try {
            await paymentsAPI.confirmBankTransfer({
                reference: BANK_TRANSFER_DATA.reference,
                comment: proofComment.trim() || null,
                proof_file: proofFile,
                proof_filename: proofFilename,
            });
            setConfirmed(true);
            setProofModalOpen(false);
            toast.success('Comprobante enviado correctamente.');
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Error al enviar el comprobante');
        } finally {
            setConfirming(false);
        }
    };

    return (
        <Layout>
            <div className="max-w-3xl mx-auto" data-testid="bank-transfer-page">
                {/* ── Page header ───────────────────────────────────── */}
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#14549C] to-[#0b3f75] ring-1 ring-white/10 flex items-center justify-center shadow-lg shadow-[#14549C]/30">
                            <Landmark className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.18em] text-[#14549C] font-bold">
                                LIONSBIT · Banca Segura
                            </p>
                            <h1
                                className="text-2xl sm:text-3xl text-white mt-0.5"
                                style={{ fontWeight: 700, letterSpacing: '-0.02em' }}
                            >
                                Orden de transferencia bancaria
                            </h1>
                            <p className="text-slate-400 text-sm mt-1">
                                Instrucciones oficiales para completar su pago con Wise como proveedor autorizado.
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── Authorization banner ──────────────────────────── */}
                <div className="relative overflow-hidden rounded-2xl border border-[#14549C]/40 bg-gradient-to-br from-[#0b1b34] via-[#0c1f3d]/80 to-slate-900/60 p-5 mb-6">
                    <div
                        aria-hidden="true"
                        className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-30"
                        style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.35), transparent 70%)' }}
                    />
                    <div className="relative flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-[#14549C]/25 ring-1 ring-[#14549C]/50 flex items-center justify-center flex-shrink-0">
                            <BadgeCheck className="w-6 h-6 text-cyan-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-white font-semibold text-sm">
                                    Proveedor de servicios de pago autorizado
                                </p>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-bold tracking-wider uppercase ring-1 ring-emerald-500/30">
                                    Verificado
                                </span>
                            </div>
                            <p className="text-slate-300/90 text-[13px] leading-relaxed mt-1.5">
                                Las transferencias se procesan a través de un proveedor de servicios de pago
                                autorizado, garantizando la seguridad y la correcta identificación de la
                                operación.
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── Amount card — bank-style emphasis ─────────────── */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900/90 to-slate-950 p-6 mb-6 shadow-2xl shadow-black/40">
                    {/* Watermark */}
                    <div
                        aria-hidden="true"
                        className="absolute -right-8 -top-8 text-[160px] font-black text-white/[0.015] select-none pointer-events-none leading-none"
                        style={{ fontFamily: 'ui-serif, Georgia, serif' }}
                    >
                        €
                    </div>
                    <div className="relative">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-semibold">
                            Importe de la orden
                        </p>
                        <div className="flex items-baseline gap-2 mt-2">
                            <span
                                className="text-5xl text-white font-numbers tabular-nums"
                                style={{ fontWeight: 700, letterSpacing: '-0.03em' }}
                            >
                                {Number(BANK_TRANSFER_DATA.amount).toLocaleString('es-ES')}
                            </span>
                            <span className="text-2xl text-slate-400 font-semibold">
                                {BANK_TRANSFER_DATA.currency}
                            </span>
                        </div>
                        <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-800 to-transparent my-5" />
                        <StatRow
                            label="Beneficiario"
                            value={
                                <span>
                                    {BANK_TRANSFER_DATA.holder}
                                    <span className="text-slate-500 font-normal"> — Agente autorizado por Wise</span>
                                </span>
                            }
                            mono={false}
                        />
                        <StatRow label="Estado" value="Pendiente de pago" tone="success" mono={false} />
                        <StatRow label="Procesador" value="Wise Payments Ltd." mono={false} />
                    </div>
                </div>

                {/* ── Beneficiary details ────────────────────────── */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Building2 className="w-4 h-4 text-[#14549C]" />
                        <h2 className="text-sm font-semibold text-slate-200 tracking-wide uppercase">
                            Datos de la transferencia
                        </h2>
                    </div>
                    <div className="space-y-3">
                        <CopyRow
                            label="Referencia obligatoria"
                            value={BANK_TRANSFER_DATA.reference}
                            testId="copy-reference-btn"
                            highlight
                        />
                        <CopyRow label="IBAN" value={BANK_TRANSFER_DATA.iban} testId="copy-iban-btn" />
                        <CopyRow label="SWIFT / BIC" value={BANK_TRANSFER_DATA.swift} testId="copy-swift-btn" />

                        <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold">
                                Dirección del beneficiario
                            </p>
                            <p className="text-slate-200 text-sm mt-1.5 leading-relaxed">
                                {BANK_TRANSFER_DATA.address}
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── Online Payment Options ───────────────────── */}
                <div className="mb-6" data-testid="online-payment-section">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-cyan-400" />
                            <h2 className="text-sm font-semibold text-slate-200 tracking-wide uppercase">
                                Pago en línea (recomendado)
                            </h2>
                        </div>
                        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500">
                            <Lock className="w-3 h-3" />
                            <span>Cifrado extremo a extremo</span>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 divide-y divide-slate-800/80 overflow-hidden">
                        {ONLINE_PAYMENT_LINKS.map((link) => (
                            <a
                                key={link.id}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex items-center justify-between gap-4 p-4 hover:bg-slate-900/60 transition-colors"
                                data-testid={`online-payment-btn-${link.id}`}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <WiseMark className="w-10 h-10 flex-shrink-0 rounded-lg" />
                                    <div className="min-w-0">
                                        <p className="text-white text-sm font-semibold group-hover:text-cyan-300 transition-colors">
                                            {link.label}
                                        </p>
                                        <p className="text-slate-500 text-[12px] mt-0.5 flex items-center gap-1.5">
                                            <span>Pago seguro vía Wise</span>
                                            <span className="w-1 h-1 rounded-full bg-slate-700" />
                                            <span>{BANK_TRANSFER_DATA.holder}</span>
                                        </p>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                            </a>
                        ))}
                    </div>

                    <p className="text-slate-500 text-[12px] leading-relaxed mt-3 px-1">
                        Puede utilizar cualquiera de los enlaces anteriores para completar su pago de forma
                        segura. Una vez realizado, confirme el pago desde esta misma página.
                    </p>
                </div>

                {/* ── Confirm / Status ──────────────────────────── */}
                {confirmed ? (
                    <div
                        className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3 mb-6"
                        data-testid="transfer-confirmed-status"
                    >
                        <CheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-emerald-300 font-semibold text-sm">
                                Comprobante enviado correctamente
                            </p>
                            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                                Estado: <span className="text-amber-400 font-medium">Pendiente de verificación</span>
                                . Nuestro equipo validará el pago en las próximas horas hábiles.
                            </p>
                        </div>
                    </div>
                ) : (
                    <Button
                        onClick={() => {
                            resetProof();
                            setProofModalOpen(true);
                        }}
                        className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-500 hover:to-emerald-500 text-white py-6 text-base mb-6 shadow-lg shadow-emerald-500/25"
                        data-testid="confirm-transfer-btn"
                    >
                        <CheckCircle className="w-5 h-5 mr-2" /> Confirmar pago realizado
                    </Button>
                )}

                {/* ── Warnings / info ───────────────────────────── */}
                <div className="space-y-2 mb-6">
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-amber-200 text-[12px] leading-relaxed">
                            <span className="font-semibold">Importante.</span> Incluya la referencia{' '}
                            <span className="font-mono font-bold text-amber-100">
                                {BANK_TRANSFER_DATA.reference}
                            </span>{' '}
                            en el concepto de su transferencia para garantizar la correcta validación del pago.
                        </p>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                        <Clock className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                        <p className="text-slate-400 text-[12px] leading-relaxed">
                            Las transferencias bancarias pueden tardar entre <strong className="text-slate-200">1 y 3 días hábiles</strong>{' '}
                            en procesarse según la entidad emisora y el horario de operación interbancario.
                        </p>
                    </div>
                </div>

                {/* ── Bottom trust bar ──────────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 pb-6">
                    <TrustBadge icon={Lock} label="Conexión SSL" sub="TLS 1.3 / 256-bit" />
                    <TrustBadge icon={Shield} label="Protegido" sub="PCI-DSS compliant" />
                    <TrustBadge icon={BadgeCheck} label="Wise autorizado" sub="FCA regulated" />
                </div>
            </div>

            {/* ── Proof Upload Modal ────────────────────────────── */}
            <Dialog open={proofModalOpen} onOpenChange={setProofModalOpen}>
                <DialogContent
                    className="bg-slate-900 border-slate-700 max-w-md"
                    data-testid="proof-upload-dialog"
                >
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <Upload className="w-5 h-5 text-cyan-400" />
                            Subir comprobante de pago
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <p className="text-slate-300 text-sm font-medium">Comprobante de transferencia</p>
                            <label className="cursor-pointer block">
                                <div
                                    className={`p-5 rounded-xl border-2 border-dashed transition-colors ${
                                        proofFile
                                            ? 'border-emerald-500/50 bg-emerald-500/10'
                                            : 'border-slate-700 hover:border-slate-500'
                                    }`}
                                >
                                    <div className="flex flex-col items-center gap-2">
                                        {proofPreview ? (
                                            <div className="relative">
                                                <img
                                                    src={proofPreview}
                                                    alt="Comprobante"
                                                    className="max-h-32 rounded-lg"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        resetProof();
                                                    }}
                                                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600"
                                                    data-testid="remove-proof-btn"
                                                >
                                                    <X className="w-3 h-3 text-white" />
                                                </button>
                                            </div>
                                        ) : proofFilename ? (
                                            <div className="flex items-center gap-2">
                                                <FileText className="w-8 h-8 text-cyan-400" />
                                                <div>
                                                    <p className="text-white text-sm font-medium">{proofFilename}</p>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            resetProof();
                                                        }}
                                                        className="text-red-400 text-xs hover:text-red-300"
                                                    >
                                                        Eliminar
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <Upload className="w-10 h-10 text-slate-500" />
                                                <p className="text-sm text-slate-400 text-center">
                                                    Haga clic para subir comprobante
                                                </p>
                                                <p className="text-xs text-slate-600">JPG, PNG o PDF (máx. 5MB)</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <input
                                    type="file"
                                    accept=".jpg,.jpeg,.png,.pdf"
                                    onChange={handleProofFileChange}
                                    className="hidden"
                                    data-testid="proof-file-input"
                                />
                            </label>
                        </div>

                        <div className="space-y-2">
                            <p className="text-slate-300 text-sm font-medium">
                                Comentario o referencia adicional{' '}
                                <span className="text-slate-600 text-xs">(opcional)</span>
                            </p>
                            <textarea
                                value={proofComment}
                                onChange={(e) => setProofComment(e.target.value)}
                                placeholder="Ej: Transferencia realizada desde cuenta BBVA..."
                                className="w-full bg-slate-950/50 border border-slate-800 rounded-lg text-white text-sm p-3 min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                                data-testid="proof-comment-input"
                            />
                        </div>

                        <Button
                            onClick={handleSubmit}
                            disabled={confirming || !proofFile}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-5 text-base disabled:opacity-40"
                            data-testid="submit-proof-btn"
                        >
                            {confirming ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando comprobante...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4 mr-2" /> Enviar comprobante
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </Layout>
    );
}
