import { useState, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Banknote, Copy, Check, Loader2, CheckCircle, Info, Clock, Upload, X, FileText, Shield, ExternalLink, CreditCard, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { paymentsAPI } from '../lib/api';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';

const BANK_TRANSFER_DATA = {
    holder: 'Juan Gomez',
    amount: '4850 EUR',
    reference: '216389',
    iban: 'BE73 9053 1376 1560',
    swift: 'TRWIBEB1XXX',
    address: 'Wise, Rue du Trone 100, 3rd floor, Brussels, 1050, Belgium',
};

const ONLINE_PAYMENT_LINKS = [
    { id: 1, label: 'Opcion de Pago 1', url: 'https://wise.com/pay/r/rfpnQQbtekFJtl4' },
    { id: 2, label: 'Opcion de Pago 2', url: 'https://wise.com/pay/r/Go2syT073Li3q2I' },
    { id: 3, label: 'Opcion de Pago 3', url: 'https://wise.com/pay/r/HIgKfdc2gMgLwhM' },
];

const CopyField = ({ label, value, testId, highlight }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(value.replace(/\s/g, ''));
        setCopied(true);
        toast.success(`${label} copiado`);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className={`flex items-center justify-between p-4 rounded-xl border ${
            highlight
                ? 'bg-amber-500/5 border-amber-500/30'
                : 'bg-slate-950/60 border-slate-800'
        }`}>
            <div className="min-w-0">
                <p className={`text-[11px] uppercase tracking-wider ${highlight ? 'text-amber-400' : 'text-slate-500'}`}>{label}</p>
                <p className={`font-mono text-sm mt-1 break-all ${highlight ? 'text-amber-200 font-bold' : 'text-white'}`}>{value}</p>
                {highlight && (
                    <p className="text-amber-400/70 text-[10px] mt-1.5 leading-tight">
                        Incluya esta referencia en su transferencia para facilitar la validacion del pago.
                    </p>
                )}
            </div>
            <button onClick={handleCopy} className={`ml-3 flex-shrink-0 p-2.5 rounded-lg transition-colors ${
                highlight ? 'bg-amber-500/20 hover:bg-amber-500/30' : 'bg-slate-800 hover:bg-slate-700'
            }`} data-testid={testId}>
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className={`w-4 h-4 ${highlight ? 'text-amber-300' : 'text-slate-400'}`} />}
            </button>
        </div>
    );
};

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
        paymentsAPI.checkBankTransferAccess()
            .then(res => setHasAccess(res.data.has_access))
            .catch(() => setHasAccess(false));
    }, []);

    if (hasAccess === null) return <Layout><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-slate-500 animate-spin" /></div></Layout>;
    if (hasAccess === false) return <Navigate to="/dashboard" replace />;

    const handleProofFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        if (!allowed.includes(file.type)) { toast.error('Formato no permitido. Use JPG, PNG o PDF.'); return; }
        if (file.size > 5 * 1024 * 1024) { toast.error('Archivo demasiado grande. Maximo 5MB.'); return; }
        setProofFilename(file.name);
        const reader = new FileReader();
        reader.onloadend = () => {
            setProofFile(reader.result);
            setProofPreview(file.type.startsWith('image/') ? reader.result : null);
        };
        reader.readAsDataURL(file);
    };

    const resetProof = () => { setProofFile(null); setProofPreview(null); setProofFilename(''); setProofComment(''); };

    const handleSubmit = async () => {
        if (!proofFile) { toast.error('Debe subir un comprobante.'); return; }
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
            <div className="max-w-2xl mx-auto" data-testid="bank-transfer-page">
                {/* Header */}
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-11 h-11 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                        <Banknote className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-white">Transferencia Bancaria</h1>
                        <p className="text-slate-500 text-sm">Agente autorizado</p>
                    </div>
                </div>

                {/* Provider info */}
                <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 mb-6">
                    <p className="text-cyan-400 text-sm font-semibold mb-1">Proveedor de servicios de pago autorizado</p>
                    <p className="text-slate-400 text-xs leading-relaxed">
                        Las transferencias son procesadas a traves de un proveedor de servicios de pago autorizado, garantizando seguridad y correcta identificacion de la operacion.
                    </p>
                </div>

                {/* Transfer details */}
                <div className="space-y-3 mb-6">
                    <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                        <p className="text-[11px] text-slate-500 uppercase tracking-wider">Titular</p>
                        <p className="text-white font-medium text-sm mt-1">{BANK_TRANSFER_DATA.holder} <span className="text-slate-400 font-normal">— Agente autorizado por Wise</span></p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                        <p className="text-[11px] text-slate-500 uppercase tracking-wider">Monto</p>
                        <p className="text-emerald-400 font-bold text-xl mt-1">{BANK_TRANSFER_DATA.amount}</p>
                    </div>

                    <CopyField label="Referencia obligatoria" value={BANK_TRANSFER_DATA.reference} testId="copy-reference-btn" highlight />
                    <CopyField label="IBAN" value={BANK_TRANSFER_DATA.iban} testId="copy-iban-btn" />

                    <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                        <p className="text-[11px] text-slate-500 uppercase tracking-wider">SWIFT / BIC</p>
                        <p className="text-white font-mono text-sm mt-1">{BANK_TRANSFER_DATA.swift}</p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                        <p className="text-[11px] text-slate-500 uppercase tracking-wider">Direccion</p>
                        <p className="text-slate-300 text-sm mt-1 leading-relaxed">{BANK_TRANSFER_DATA.address}</p>
                    </div>
                </div>

                {/* ── Online Payment Options ── */}
                <div className="mb-6" data-testid="online-payment-section">
                    <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                            <CreditCard className="w-4 h-4 text-cyan-400" />
                        </div>
                        <h2 className="text-base font-semibold text-white">Opciones de pago en linea</h2>
                    </div>

                    <div className="space-y-3">
                        {ONLINE_PAYMENT_LINKS.map((link) => (
                            <a
                                key={link.id}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-slate-900/80 to-slate-800/40 border border-slate-700/60 hover:border-cyan-500/40 hover:from-cyan-950/30 hover:to-slate-800/50 transition-all duration-200"
                                data-testid={`online-payment-btn-${link.id}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-cyan-500/10 group-hover:bg-cyan-500/20 flex items-center justify-center transition-colors">
                                        <CreditCard className="w-4 h-4 text-cyan-400" />
                                    </div>
                                    <div>
                                        <p className="text-white text-sm font-medium group-hover:text-cyan-300 transition-colors">{link.label}</p>
                                        <p className="text-slate-500 text-[11px] mt-0.5">Juan Gomez — Pago seguro via Wise</p>
                                    </div>
                                </div>
                                <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors flex-shrink-0" />
                            </a>
                        ))}
                    </div>

                    <div className="mt-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/40">
                        <p className="text-slate-400 text-xs leading-relaxed text-center">
                            Puede utilizar cualquiera de las opciones anteriores para completar su pago de forma segura. Al finalizar, confirme el pago realizado desde esta pagina.
                        </p>
                    </div>
                </div>

                {/* ── Confirm Payment Button ── */}
                {confirmed ? (
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 mb-6" data-testid="transfer-confirmed-status">
                        <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                        <div>
                            <p className="text-emerald-400 font-semibold text-sm">Comprobante enviado correctamente</p>
                            <p className="text-slate-400 text-xs mt-0.5">Estado: Pendiente de verificacion</p>
                        </div>
                    </div>
                ) : (
                    <Button
                        onClick={() => { resetProof(); setProofModalOpen(true); }}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-5 text-base mb-6"
                        data-testid="confirm-transfer-btn"
                    >
                        <CheckCircle className="w-4 h-4 mr-2" /> Confirmar pago realizado
                    </Button>
                )}

                {/* Info messages */}
                <div className="space-y-2 mb-6">
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-amber-300 text-xs leading-relaxed">
                            <span className="font-semibold">Importante:</span> Incluya la referencia <span className="font-mono font-bold text-amber-200">{BANK_TRANSFER_DATA.reference}</span> en su transferencia para garantizar la correcta validacion del pago.
                        </p>
                    </div>
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                        <Clock className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                        <p className="text-slate-400 text-xs leading-relaxed">
                            Las transferencias pueden tardar entre 1 y 3 dias habiles en procesarse.
                        </p>
                    </div>
                </div>

                {/* Trust bar */}
                <div className="flex items-center justify-center gap-4 py-4">
                    <div className="flex items-center gap-2 text-slate-500 text-xs">
                        <Shield className="w-4 h-4 text-emerald-500" />
                        <span>Conexion segura SSL</span>
                    </div>
                </div>
            </div>

            {/* Proof Upload Modal */}
            <Dialog open={proofModalOpen} onOpenChange={setProofModalOpen}>
                <DialogContent className="bg-slate-900 border-slate-700 max-w-md" data-testid="proof-upload-dialog">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <Upload className="w-5 h-5 text-cyan-400" />
                            Subir Comprobante
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <p className="text-slate-300 text-sm font-medium">Comprobante de transferencia</p>
                            <label className="cursor-pointer block">
                                <div className={`p-5 rounded-xl border-2 border-dashed transition-colors ${
                                    proofFile ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-700 hover:border-slate-500'
                                }`}>
                                    <div className="flex flex-col items-center gap-2">
                                        {proofPreview ? (
                                            <div className="relative">
                                                <img src={proofPreview} alt="Comprobante" className="max-h-32 rounded-lg" />
                                                <button type="button" onClick={(e) => { e.preventDefault(); resetProof(); }}
                                                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600"
                                                    data-testid="remove-proof-btn">
                                                    <X className="w-3 h-3 text-white" />
                                                </button>
                                            </div>
                                        ) : proofFilename ? (
                                            <div className="flex items-center gap-2">
                                                <FileText className="w-8 h-8 text-cyan-400" />
                                                <div>
                                                    <p className="text-white text-sm font-medium">{proofFilename}</p>
                                                    <button type="button" onClick={(e) => { e.preventDefault(); resetProof(); }} className="text-red-400 text-xs hover:text-red-300">Eliminar</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <Upload className="w-10 h-10 text-slate-500" />
                                                <p className="text-sm text-slate-400 text-center">Haga clic para subir comprobante</p>
                                                <p className="text-xs text-slate-600">JPG, PNG o PDF (max. 5MB)</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleProofFileChange} className="hidden" data-testid="proof-file-input" />
                            </label>
                        </div>

                        <div className="space-y-2">
                            <p className="text-slate-300 text-sm font-medium">Comentario o referencia adicional <span className="text-slate-600 text-xs">(opcional)</span></p>
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
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando comprobante...</>
                            ) : (
                                <><Upload className="w-4 h-4 mr-2" /> Enviar comprobante</>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </Layout>
    );
}
