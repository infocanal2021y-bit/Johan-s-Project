import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import {
    ArrowLeft, Banknote, Bitcoin, Copy, Check, Loader2, CheckCircle,
    CreditCard, ExternalLink, AlertTriangle, Clock, Shield, Upload,
    X, FileText, ChevronRight, Wallet
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { transactionsAPI, paymentsAPI } from '../lib/api';
import { toast } from 'sonner';
import api from '../lib/api';

const BANK_TRANSFER_DATA = {
    holder: 'Juan Gomez',
    amount: '4850 EUR',
    reference: '216389',
    iban: 'ES22 2100 1935 5701 0100 9946',
    swift: 'CAIXESBBXXX',
    bank: 'CaixaBank',
    role: 'Agente autorizado',
};

const CRYPTO_ICONS = {
    BTC: { color: 'text-orange-400', bg: 'bg-orange-500/15', label: 'Bitcoin' },
    BTC_LEGACY: { color: 'text-orange-400', bg: 'bg-orange-500/15', label: 'Bitcoin (SafePal)' },
    ETH: { color: 'text-blue-400', bg: 'bg-blue-500/15', label: 'Ethereum' },
    BNB: { color: 'text-yellow-400', bg: 'bg-yellow-500/15', label: 'BNB' },
    USDT: { color: 'text-emerald-400', bg: 'bg-emerald-500/15', label: 'Tether USDT' },
};

/* ── Copy Field ── */
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
            highlight ? 'bg-amber-500/5 border-amber-500/30' : 'bg-slate-950/60 border-slate-800'
        }`}>
            <div className="min-w-0 flex-1">
                <p className={`text-[11px] uppercase tracking-wider ${highlight ? 'text-amber-400' : 'text-slate-500'}`}>{label}</p>
                <p className={`font-mono text-sm mt-1 break-all ${highlight ? 'text-amber-200 font-bold' : 'text-white'}`}>{value}</p>
                {highlight && (
                    <p className="text-amber-400/70 text-[10px] mt-1.5 leading-tight">
                        Incluya esta referencia para facilitar la validacion del pago.
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

/* ── Crypto Address Card ── */
const CryptoAddressCard = ({ coinKey, wallet }) => {
    const [copied, setCopied] = useState(false);
    const [showQR, setShowQR] = useState(false);
    const icon = CRYPTO_ICONS[coinKey] || { color: 'text-slate-400', bg: 'bg-slate-500/15', label: coinKey };
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(wallet.address)}&size=180x180&bgcolor=0f172a&color=e2e8f0`;

    const handleCopy = () => {
        navigator.clipboard.writeText(wallet.address);
        setCopied(true);
        toast.success(`Direccion ${wallet.name} copiada`);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-colors" data-testid={`crypto-wallet-${coinKey}`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg ${icon.bg} flex items-center justify-center`}>
                        <Bitcoin className={`w-4 h-4 ${icon.color}`} />
                    </div>
                    <div>
                        <p className="text-white text-sm font-semibold">{wallet.name}</p>
                        <p className="text-slate-500 text-[11px]">{wallet.network}</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowQR(!showQR)}
                    className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${showQR ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                    data-testid={`qr-toggle-${coinKey}`}
                >
                    {showQR ? 'Ocultar QR' : 'Ver QR'}
                </button>
            </div>

            {showQR && (
                <div className="flex justify-center mb-3 p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                    <img src={qrUrl} alt={`QR ${wallet.name}`} className="rounded-lg" width={150} height={150} data-testid={`qr-img-${coinKey}`} />
                </div>
            )}

            <div className="flex items-center gap-2">
                <p className="font-mono text-xs text-slate-300 break-all flex-1 bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
                    {wallet.address}
                </p>
                <button
                    onClick={handleCopy}
                    className="flex-shrink-0 p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
                    data-testid={`copy-crypto-${coinKey}`}
                >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                </button>
            </div>
        </div>
    );
};

export default function CompleteWithdrawalPage() {
    const { transactionId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [transaction, setTransaction] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedMethod, setSelectedMethod] = useState(null); // 'bank' | 'crypto'
    const [cryptoWallets, setCryptoWallets] = useState(null);
    const [confirmed, setConfirmed] = useState(false);

    // Proof upload state
    const [proofModalOpen, setProofModalOpen] = useState(false);
    const [proofFile, setProofFile] = useState(null);
    const [proofPreview, setProofPreview] = useState(null);
    const [proofFilename, setProofFilename] = useState('');
    const [proofComment, setProofComment] = useState('');
    const [confirming, setConfirming] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [txRes, walletsRes] = await Promise.all([
                    transactionsAPI.getAll(),
                    api.get('/crypto-wallets'),
                ]);
                const found = txRes.data.find(t => t.id === transactionId);
                if (found) setTransaction(found);
                setCryptoWallets(walletsRes.data);
            } catch (err) {
                toast.error('Error al cargar datos');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [transactionId]);

    const resetProof = () => { setProofFile(null); setProofPreview(null); setProofFilename(''); setProofComment(''); };

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

    const handleConfirmPayment = async () => {
        if (!proofFile) { toast.error('Debe subir un comprobante.'); return; }
        setConfirming(true);
        try {
            await paymentsAPI.confirmBankTransfer({
                reference: BANK_TRANSFER_DATA.reference,
                comment: proofComment.trim() || `Pago via ${selectedMethod === 'bank' ? 'transferencia bancaria' : 'criptomonedas'} - Retiro ${transactionId}`,
                proof_file: proofFile,
                proof_filename: proofFilename,
            });
            setConfirmed(true);
            setProofModalOpen(false);
            toast.success('Comprobante enviado correctamente. Su pago sera verificado.');
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Error al enviar el comprobante');
        } finally {
            setConfirming(false);
        }
    };

    if (loading) {
        return (
            <Layout>
                <div className="flex justify-center py-20">
                    <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
                </div>
            </Layout>
        );
    }

    if (!transaction) {
        return (
            <Layout>
                <div className="max-w-xl mx-auto text-center py-20">
                    <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
                    <p className="text-white text-lg font-semibold">Transaccion no encontrada</p>
                    <Button onClick={() => navigate('/dashboard')} className="mt-4 bg-slate-800 hover:bg-slate-700 text-white">
                        Volver al Dashboard
                    </Button>
                </div>
            </Layout>
        );
    }

    /* ── Method Selection Screen ── */
    if (!selectedMethod) {
        return (
            <Layout>
                <div className="max-w-2xl mx-auto" data-testid="complete-withdrawal-page">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-2">
                        <button onClick={() => navigate('/dashboard')} className="p-2 rounded-lg hover:bg-slate-800 transition-colors" data-testid="back-btn">
                            <ArrowLeft className="w-5 h-5 text-slate-400" />
                        </button>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-white">Completar Proceso de Retiro</h1>
                            <p className="text-slate-500 text-sm">Seleccione su metodo de pago preferido</p>
                        </div>
                    </div>

                    {/* Transaction Summary */}
                    <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 mb-6 mt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-slate-500 text-xs uppercase tracking-wider">Retiro en proceso</p>
                                <p className="text-white text-xl font-bold mt-1">
                                    {transaction.currency === 'USD' ? '$' : '\u20AC'}{transaction.amount?.toLocaleString('en-US', { minimumFractionDigits: 2 })} {transaction.currency}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/15">
                                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                                <span className="text-cyan-400 text-xs font-medium">Procesando</span>
                            </div>
                        </div>
                        {transaction.transaction_reference && (
                            <p className="text-slate-500 text-xs mt-2 font-mono">Ref: {transaction.transaction_reference}</p>
                        )}
                    </div>

                    {/* Method Selection */}
                    <p className="text-slate-400 text-sm mb-4">Seleccione como desea completar el proceso:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                        {/* Bank Transfer Card */}
                        <button
                            onClick={() => setSelectedMethod('bank')}
                            className="group relative p-6 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-800/50 border border-slate-700/60 hover:border-emerald-500/40 hover:from-emerald-950/20 hover:to-slate-800/60 transition-all duration-300 text-left"
                            data-testid="method-bank-transfer"
                        >
                            <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center mb-4 group-hover:bg-emerald-500/25 transition-colors">
                                <Banknote className="w-6 h-6 text-emerald-400" />
                            </div>
                            <h3 className="text-white font-semibold text-base mb-1">Transferencia Bancaria</h3>
                            <p className="text-slate-500 text-sm leading-relaxed">Datos bancarios oficiales del agente autorizado</p>
                            <ChevronRight className="absolute top-1/2 right-4 -translate-y-1/2 w-5 h-5 text-slate-600 group-hover:text-emerald-400 transition-colors" />
                        </button>

                        {/* Crypto Card */}
                        <button
                            onClick={() => setSelectedMethod('crypto')}
                            className="group relative p-6 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-800/50 border border-slate-700/60 hover:border-orange-500/40 hover:from-orange-950/20 hover:to-slate-800/60 transition-all duration-300 text-left"
                            data-testid="method-crypto"
                        >
                            <div className="w-12 h-12 rounded-xl bg-orange-500/15 flex items-center justify-center mb-4 group-hover:bg-orange-500/25 transition-colors">
                                <Bitcoin className="w-6 h-6 text-orange-400" />
                            </div>
                            <h3 className="text-white font-semibold text-base mb-1">Criptomonedas</h3>
                            <p className="text-slate-500 text-sm leading-relaxed">BTC, ETH, USDT, BNB — envie a las direcciones disponibles</p>
                            <ChevronRight className="absolute top-1/2 right-4 -translate-y-1/2 w-5 h-5 text-slate-600 group-hover:text-orange-400 transition-colors" />
                        </button>
                    </div>

                    {/* Info */}
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                        <Shield className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <p className="text-slate-400 text-xs leading-relaxed">
                            Todos los pagos son procesados de forma segura. Una vez confirmado, su retiro sera verificado y completado por el equipo de administracion.
                        </p>
                    </div>
                </div>
            </Layout>
        );
    }

    /* ── Bank Transfer Detail ── */
    if (selectedMethod === 'bank') {
        return (
            <Layout>
                <div className="max-w-2xl mx-auto" data-testid="complete-bank-section">
                    <div className="flex items-center gap-3 mb-6">
                        <button onClick={() => setSelectedMethod(null)} className="p-2 rounded-lg hover:bg-slate-800 transition-colors" data-testid="back-to-methods-btn">
                            <ArrowLeft className="w-5 h-5 text-slate-400" />
                        </button>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-white">Transferencia Bancaria</h1>
                            <p className="text-slate-500 text-sm">{BANK_TRANSFER_DATA.bank} · {BANK_TRANSFER_DATA.role}</p>
                        </div>
                    </div>

                    {/* Provider info */}
                    <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 mb-6">
                        <p className="text-cyan-400 text-sm font-semibold mb-1">Proveedor de servicios de pago autorizado</p>
                        <p className="text-slate-400 text-xs leading-relaxed">
                            Las transferencias son procesadas a traves de un proveedor de servicios de pago autorizado, garantizando seguridad y correcta identificacion de la operacion.
                        </p>
                    </div>

                    {/* Transfer Details */}
                    <div className="space-y-3 mb-6">
                        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Titular</p>
                            <p className="text-white font-medium text-sm mt-1">{BANK_TRANSFER_DATA.holder} <span className="text-slate-400 font-normal">&mdash; {BANK_TRANSFER_DATA.role}</span></p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Monto</p>
                            <p className="text-emerald-400 font-bold text-xl mt-1">{BANK_TRANSFER_DATA.amount}</p>
                        </div>
                        <CopyField label="Referencia obligatoria" value={BANK_TRANSFER_DATA.reference} testId="copy-ref-bank" highlight />
                        <CopyField label="IBAN" value={BANK_TRANSFER_DATA.iban} testId="copy-iban-complete" />
                        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                            <p className="text-[11px] text-slate-500 uppercase tracking-wider">SWIFT / BIC</p>
                            <p className="text-white font-mono text-sm mt-1">{BANK_TRANSFER_DATA.swift}</p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Banco</p>
                            <p className="text-slate-300 text-sm mt-1 leading-relaxed">{BANK_TRANSFER_DATA.bank}</p>
                        </div>
                    </div>

                    {/* Confirm Button */}
                    {confirmed ? (
                        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 mb-6" data-testid="payment-confirmed">
                            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                            <div>
                                <p className="text-emerald-400 font-semibold text-sm">Comprobante enviado correctamente</p>
                                <p className="text-slate-400 text-xs mt-0.5">Su pago sera verificado por el equipo de administracion.</p>
                            </div>
                        </div>
                    ) : (
                        <Button onClick={() => { resetProof(); setProofModalOpen(true); }}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-5 text-base mb-6"
                            data-testid="confirm-bank-btn"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" /> Confirmar pago realizado
                        </Button>
                    )}

                    {/* Info */}
                    <div className="space-y-2 mb-6">
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                            <p className="text-amber-300 text-xs leading-relaxed">
                                <span className="font-semibold">Importante:</span> Incluya la referencia <span className="font-mono font-bold text-amber-200">{BANK_TRANSFER_DATA.reference}</span> en su transferencia.
                            </p>
                        </div>
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                            <Clock className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                            <p className="text-slate-400 text-xs leading-relaxed">
                                Las transferencias pueden tardar entre 1 y 3 dias habiles en procesarse.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Proof Upload Modal */}
                <ProofUploadModal
                    open={proofModalOpen}
                    onOpenChange={setProofModalOpen}
                    proofFile={proofFile}
                    proofPreview={proofPreview}
                    proofFilename={proofFilename}
                    proofComment={proofComment}
                    confirming={confirming}
                    onFileChange={handleProofFileChange}
                    onCommentChange={setProofComment}
                    onResetProof={resetProof}
                    onSubmit={handleConfirmPayment}
                />
            </Layout>
        );
    }

    /* ── Crypto Detail ── */
    if (selectedMethod === 'crypto') {
        return (
            <Layout>
                <div className="max-w-2xl mx-auto" data-testid="complete-crypto-section">
                    <div className="flex items-center gap-3 mb-6">
                        <button onClick={() => setSelectedMethod(null)} className="p-2 rounded-lg hover:bg-slate-800 transition-colors" data-testid="back-to-methods-crypto-btn">
                            <ArrowLeft className="w-5 h-5 text-slate-400" />
                        </button>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-white">Pago con Criptomonedas</h1>
                            <p className="text-slate-500 text-sm">Envie a cualquiera de las direcciones disponibles</p>
                        </div>
                    </div>

                    {/* Transaction context */}
                    <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 mb-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-slate-500 text-xs uppercase tracking-wider">Monto del retiro</p>
                                <p className="text-white text-xl font-bold mt-1">
                                    {transaction.currency === 'USD' ? '$' : '\u20AC'}{transaction.amount?.toLocaleString('en-US', { minimumFractionDigits: 2 })} {transaction.currency}
                                </p>
                            </div>
                            <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center">
                                <Wallet className="w-5 h-5 text-orange-400" />
                            </div>
                        </div>
                    </div>

                    {/* Crypto Info Banner */}
                    <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 mb-6">
                        <p className="text-orange-400 text-sm font-semibold mb-1">Pago en criptomonedas</p>
                        <p className="text-slate-400 text-xs leading-relaxed">
                            Realice el envio a cualquiera de las direcciones que se muestran a continuacion. Asegurese de utilizar la red correcta para evitar la perdida de fondos.
                        </p>
                    </div>

                    {/* Crypto Wallets List */}
                    <div className="space-y-3 mb-6" data-testid="crypto-wallets-list">
                        {cryptoWallets && Object.entries(cryptoWallets).map(([key, wallet]) => (
                            <CryptoAddressCard key={key} coinKey={key} wallet={wallet} />
                        ))}
                    </div>

                    {/* Confirm Button */}
                    {confirmed ? (
                        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 mb-6" data-testid="crypto-payment-confirmed">
                            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                            <div>
                                <p className="text-emerald-400 font-semibold text-sm">Comprobante enviado correctamente</p>
                                <p className="text-slate-400 text-xs mt-0.5">Su pago sera verificado por el equipo de administracion.</p>
                            </div>
                        </div>
                    ) : (
                        <Button onClick={() => { resetProof(); setProofModalOpen(true); }}
                            className="w-full bg-orange-600 hover:bg-orange-700 text-white py-5 text-base mb-6"
                            data-testid="confirm-crypto-btn"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" /> Confirmar pago realizado
                        </Button>
                    )}

                    {/* Warnings */}
                    <div className="space-y-2 mb-6">
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                            <p className="text-amber-300 text-xs leading-relaxed">
                                <span className="font-semibold">Importante:</span> Verifique la direccion y la red antes de enviar. Las transacciones en blockchain son irreversibles.
                            </p>
                        </div>
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                            <Clock className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                            <p className="text-slate-400 text-xs leading-relaxed">
                                Los pagos en criptomonedas se verifican una vez confirmados en la blockchain correspondiente.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Proof Upload Modal */}
                <ProofUploadModal
                    open={proofModalOpen}
                    onOpenChange={setProofModalOpen}
                    proofFile={proofFile}
                    proofPreview={proofPreview}
                    proofFilename={proofFilename}
                    proofComment={proofComment}
                    confirming={confirming}
                    onFileChange={handleProofFileChange}
                    onCommentChange={setProofComment}
                    onResetProof={resetProof}
                    onSubmit={handleConfirmPayment}
                />
            </Layout>
        );
    }

    return null;
}

/* ── Shared Proof Upload Modal ── */
function ProofUploadModal({ open, onOpenChange, proofFile, proofPreview, proofFilename, proofComment, confirming, onFileChange, onCommentChange, onResetProof, onSubmit }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-slate-900 border-slate-700 max-w-md" data-testid="proof-upload-dialog">
                <DialogHeader>
                    <DialogTitle className="text-white flex items-center gap-2">
                        <Upload className="w-5 h-5 text-cyan-400" />
                        Subir Comprobante
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <p className="text-slate-300 text-sm font-medium">Comprobante de pago</p>
                        <label className="cursor-pointer block">
                            <div className={`p-5 rounded-xl border-2 border-dashed transition-colors ${
                                proofFile ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-700 hover:border-slate-500'
                            }`}>
                                <div className="flex flex-col items-center gap-2">
                                    {proofPreview ? (
                                        <div className="relative">
                                            <img src={proofPreview} alt="Comprobante" className="max-h-32 rounded-lg" />
                                            <button type="button" onClick={(e) => { e.preventDefault(); onResetProof(); }}
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
                                                <button type="button" onClick={(e) => { e.preventDefault(); onResetProof(); }} className="text-red-400 text-xs hover:text-red-300">Eliminar</button>
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
                            <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={onFileChange} className="hidden" data-testid="proof-file-input" />
                        </label>
                    </div>
                    <div className="space-y-2">
                        <p className="text-slate-300 text-sm font-medium">Comentario <span className="text-slate-600 text-xs">(opcional)</span></p>
                        <textarea
                            value={proofComment}
                            onChange={(e) => onCommentChange(e.target.value)}
                            placeholder="Ej: Hash de transaccion, referencia bancaria..."
                            className="w-full bg-slate-950/50 border border-slate-800 rounded-lg text-white text-sm p-3 min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                            data-testid="proof-comment-input"
                        />
                    </div>
                    <Button onClick={onSubmit} disabled={confirming || !proofFile}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-5 text-base disabled:opacity-40"
                        data-testid="submit-proof-btn"
                    >
                        {confirming
                            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando comprobante...</>
                            : <><Upload className="w-4 h-4 mr-2" /> Enviar comprobante</>
                        }
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
