import { useState, useEffect, useRef, useCallback } from 'react';
import { transactionsAPI, supportAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { QRCodeSVG } from 'qrcode.react';
import { 
    Copy, Check, Upload, Loader2, AlertTriangle, Clock,
    CheckCircle, XCircle, Shield, ExternalLink, Wallet, ShoppingCart,
    FileText, ArrowRight, HelpCircle, MessageSquare, X, Bitcoin
} from 'lucide-react';
import { toast } from 'sonner';
import { SUPPORT_EMAIL } from '../../config/branding';

const CRYPTO_OPTIONS = [
    { key: 'BTC', label: 'Bitcoin', short: 'BTC', color: 'from-orange-500 to-amber-600', border: 'border-orange-500/40', bg: 'bg-orange-500/10', text: 'text-orange-400', explorer: (txid) => `https://www.blockchain.com/explorer/transactions/btc/${txid}` },
    { key: 'ETH', label: 'Ethereum', short: 'ETH', color: 'from-indigo-500 to-blue-600', border: 'border-indigo-500/40', bg: 'bg-indigo-500/10', text: 'text-indigo-400', explorer: (txid) => `https://etherscan.io/tx/${txid}` },
    { key: 'BNB', label: 'BNB', short: 'BNB', color: 'from-yellow-500 to-yellow-600', border: 'border-yellow-500/40', bg: 'bg-yellow-500/10', text: 'text-yellow-400', explorer: (txid) => `https://bscscan.com/tx/${txid}` },
    { key: 'USDT', label: 'Tether', short: 'USDT', color: 'from-teal-500 to-emerald-600', border: 'border-teal-500/40', bg: 'bg-teal-500/10', text: 'text-teal-400', explorer: (txid) => `https://tronscan.org/#/transaction/${txid}` },
];

const WALLET_PROVIDERS = [
    { name: 'Trust Wallet', url: 'https://trustwallet.com', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    { name: 'Binance', url: 'https://www.binance.com', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    { name: 'Coinbase', url: 'https://www.coinbase.com/wallet', color: 'bg-blue-600/20 text-blue-400 border-blue-600/30' },
    { name: 'Exodus', url: 'https://www.exodus.com', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    { name: 'Blockchain', url: 'https://www.blockchain.com/wallet', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
];

const BUY_PROVIDERS = [
    { name: 'MoonPay', url: 'https://www.moonpay.com', color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
    { name: 'Simplex', url: 'https://www.simplex.com', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
];

const PAYMENT_STATUS = {
    pending: { label: 'Pendiente', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/20' },
    confirming: { label: 'Confirmando', icon: Loader2, color: 'text-cyan-400', bg: 'bg-cyan-500/20', animate: true },
    confirmed: { label: 'Confirmado', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    under_review: { label: 'Pago cripto recibido · Pendiente de confirmaciones', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/20' },
    approved: { label: 'Pago cripto verificado', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    rejected: { label: 'Rechazado', icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20' },
};

export const CryptoPaymentSection = ({ transaction, onPaymentSubmitted }) => {
    const [wallets, setWallets] = useState({});
    const [selectedCrypto, setSelectedCrypto] = useState('BTC');
    const [copiedAddress, setCopiedAddress] = useState(false);
    const [txid, setTxid] = useState('');
    const [amountSent, setAmountSent] = useState('');
    const [senderAddress, setSenderAddress] = useState('');
    const [proofImage, setProofImage] = useState(null);
    const [proofPreview, setProofPreview] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [prices, setPrices] = useState({});
    const [quotedAt, setQuotedAt] = useState(null);
    // Payment issue dialog
    const [issueDialogOpen, setIssueDialogOpen] = useState(false);
    const [issueMessage, setIssueMessage] = useState('');
    const [issueSending, setIssueSending] = useState(false);
    const [issueProofImage, setIssueProofImage] = useState(null);
    const [issueProofPreview, setIssueProofPreview] = useState(null);
    const [issueTxHash, setIssueTxHash] = useState('');
    // Main payment modal
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    // Inactivity popup
    const [showInactivityPopup, setShowInactivityPopup] = useState(false);
    const inactivityTimerRef = useRef(null);
    const lastActivityRef = useRef(Date.now());

    const taxRequired = transaction?.tax_required || 4850;
    const taxPaid = transaction?.tax_paid || 0;
    const taxRemaining = Math.max(0, taxRequired - taxPaid);

    const currentCryptoConfig = CRYPTO_OPTIONS.find(c => c.key === selectedCrypto) || CRYPTO_OPTIONS[0];
    const currentWallet = wallets[selectedCrypto];

    // Fetch data
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [walletsRes, paymentRes] = await Promise.all([
                    transactionsAPI.getCryptoWallets(),
                    transactionsAPI.getCryptoPaymentStatus(transaction.id)
                ]);
                setWallets(walletsRes.data);
                transactionsAPI.getCryptoPrices()
                    .then((pr) => { setPrices(pr.data?.prices || {}); setQuotedAt(pr.data?.quoted_at || null); })
                    .catch(() => {});
                const paymentData = paymentRes.data;
                if (Array.isArray(paymentData)) {
                    setPayments(paymentData);
                } else if (paymentData && paymentData.id) {
                    setPayments([paymentData]);
                }
            } catch {
                // No existing payment
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [transaction.id]);

    // Inactivity detection (90s on this section)
    const resetInactivityTimer = useCallback(() => {
        lastActivityRef.current = Date.now();
        setShowInactivityPopup(false);
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = setTimeout(() => {
            setShowInactivityPopup(true);
        }, 90000);
    }, []);

    useEffect(() => {
        resetInactivityTimer();
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        events.forEach(e => window.addEventListener(e, resetInactivityTimer));
        return () => {
            events.forEach(e => window.removeEventListener(e, resetInactivityTimer));
            if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        };
    }, [resetInactivityTimer]);

    const handleCopyAddress = (address) => {
        navigator.clipboard.writeText(address);
        setCopiedAddress(true);
        toast.success('Dirección copiada al portapapeles');
        setTimeout(() => setCopiedAddress(false), 2000);
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Imagen muy grande. Máximo 5MB');
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            setProofImage(reader.result);
            setProofPreview(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async () => {
        if (!txid || txid.trim().length < 10) {
            toast.error('Ingrese un TXID válido (mínimo 10 caracteres)');
            return;
        }
        if (!amountSent || parseFloat(amountSent) < 1000) {
            toast.error('El monto minimo permitido es de 1,000 EUR');
            return;
        }

        setSubmitting(true);
        try {
            await transactionsAPI.submitCryptoPayment(transaction.id, {
                transaction_id: transaction.id,
                crypto_type: selectedCrypto,
                network: currentWallet?.network || selectedCrypto,
                txid: txid.trim(),
                amount_sent: amountSent,
                btc_address: senderAddress.trim() || null,
                proof_image: proofImage
            });
            toast.success('Pago registrado exitosamente. Será verificado por nuestro equipo.');
            setPaymentModalOpen(false);
            onPaymentSubmitted?.();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Error al enviar el pago');
        } finally {
            setSubmitting(false);
        }
    };

    const handleReportIssue = async () => {
        if (!issueMessage.trim() || issueMessage.trim().length < 10) {
            toast.error('Describa el problema con al menos 10 caracteres');
            return;
        }
        setIssueSending(true);
        try {
            await supportAPI.reportPaymentIssue({
                transaction_id: transaction.id,
                crypto_type: selectedCrypto,
                network: currentWallet?.network || selectedCrypto,
                amount: amountSent || null,
                wallet_address: currentWallet?.address || null,
                tx_hash: issueTxHash.trim() || txid || null,
                message: issueMessage.trim(),
                proof_image: issueProofImage || null
            });
            toast.success('Reporte enviado. Su transacción ha sido marcada como En Revisión.');
            setIssueDialogOpen(false);
            setIssueMessage('');
            setIssueTxHash('');
            setIssueProofImage(null);
            setIssueProofPreview(null);
            onPaymentSubmitted?.();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Error al enviar el reporte');
        } finally {
            setIssueSending(false);
        }
    };

    const handleIssueImageChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Imagen muy grande. Máximo 5MB');
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            setIssueProofImage(reader.result);
            setIssueProofPreview(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const formatDate = (iso) => {
        if (!iso) return '-';
        return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const CRYPTO_DECIMALS = { BTC: 8, ETH: 6, BNB: 4, USDT: 2 };
    const cryptoEquivalent = (eurAmount, coin) => {
        const price = prices[coin];
        if (!price || price <= 0) return '—';
        return (eurAmount / price).toFixed(CRYPTO_DECIMALS[coin] ?? 6);
    };
    const formatQuoteTime = (iso) => {
        if (!iso) return '—';
        return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            </div>
        );
    }

    return (
        <div className="space-y-6" data-testid="crypto-payment-section">
            {/* Inactivity Popup */}
            {showInactivityPopup && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" data-testid="payment-inactivity-popup">
                    <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-6 max-w-sm mx-4 shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                                <Clock className="w-5 h-5 text-amber-400" />
                            </div>
                            <h3 className="text-white font-semibold text-lg">¿Necesita ayuda?</h3>
                        </div>
                        <p className="text-slate-300 text-sm mb-4">
                            Notamos que lleva un momento en esta sección. Si tiene dificultades con el pago, nuestro equipo puede ayudarle.
                        </p>
                        <div className="flex gap-2">
                            <Button
                                onClick={() => { setShowInactivityPopup(false); setIssueDialogOpen(true); }}
                                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-sm"
                                data-testid="inactivity-help-btn"
                            >
                                <HelpCircle className="w-4 h-4 mr-1.5" />
                                Reportar problema
                            </Button>
                            <Button
                                onClick={() => { setShowInactivityPopup(false); resetInactivityTimer(); }}
                                variant="outline"
                                className="flex-1 border-slate-700 text-slate-300 text-sm"
                                data-testid="inactivity-dismiss-btn"
                            >
                                Continuar
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Requisito de plataforma */}
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-slate-400 text-sm">Requisito de plataforma · <span className="text-cyan-400 font-semibold">Método de abono cripto</span></span>
                    <span className="text-white font-mono text-sm">€{taxPaid.toFixed(2)} / €{taxRequired.toFixed(2)}</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-3 relative overflow-hidden">
                    <div 
                        className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (taxPaid / taxRequired) * 100)}%` }}
                        data-testid="tax-progress-bar"
                    />
                </div>
                <div className="text-right">
                    <span className="text-emerald-400 text-xs font-bold font-mono" data-testid="tax-progress-pct">
                        {Math.min(100, (taxPaid / taxRequired) * 100).toFixed(1)}% completado
                    </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-2 rounded-lg bg-slate-900/50">
                        <p className="text-xs text-slate-500">Requerido</p>
                        <p className="text-orange-400 font-bold font-mono">€{taxRequired.toFixed(2)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900/50">
                        <p className="text-xs text-slate-500">Abonado</p>
                        <p className="text-emerald-400 font-bold font-mono">€{taxPaid.toFixed(2)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900/50">
                        <p className="text-xs text-slate-500">Restante</p>
                        <p className="text-red-400 font-bold font-mono">€{taxRemaining.toFixed(2)}</p>
                    </div>
                </div>
                <p className="text-slate-500 text-[11px]">
                    Concepto: Cargo de autorización y procesamiento del retiro · Método disponible: <span className="text-cyan-400 font-semibold">Criptomonedas únicamente</span>
                </p>
            </div>

            {/* ── MAIN CTA: Pagar en cripto ───────────────────────── */}
            <button
                onClick={() => setPaymentModalOpen(true)}
                data-testid="open-crypto-payment-modal-btn"
                className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-500 via-cyan-400 to-emerald-400 p-[1.5px] shadow-[0_10px_40px_-10px_rgba(6,182,212,0.6)] hover:shadow-[0_15px_50px_-10px_rgba(6,182,212,0.8)] transition-shadow"
            >
                <div className="relative flex items-center justify-center gap-3 rounded-[14px] bg-slate-950/90 group-hover:bg-slate-950/70 py-5 px-6 transition-colors">
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-transparent to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Bitcoin className="w-6 h-6 text-cyan-300 group-hover:scale-110 transition-transform" />
                    <span className="text-white text-lg font-bold tracking-tight relative">Completar requisito de retiro</span>
                    <ArrowRight className="w-5 h-5 text-cyan-300 group-hover:translate-x-1 transition-transform relative" />
                </div>
            </button>

            {/* Payment History */}
            {payments.length > 0 && (
                <Card className="bg-slate-900/70 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white text-base flex items-center gap-2">
                            <Clock className="w-4 h-4 text-cyan-400" />
                            Historial de Pagos
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-800">
                                        <th className="text-left text-slate-500 text-xs uppercase py-2 px-2">Fecha</th>
                                        <th className="text-left text-slate-500 text-xs uppercase py-2 px-2">Cripto</th>
                                        <th className="text-left text-slate-500 text-xs uppercase py-2 px-2">Monto</th>
                                        <th className="text-left text-slate-500 text-xs uppercase py-2 px-2">TXID</th>
                                        <th className="text-left text-slate-500 text-xs uppercase py-2 px-2">Estado</th>
                                        <th className="text-right text-slate-500 text-xs uppercase py-2 px-2">Verificar</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map((p, i) => {
                                        const statusCfg = PAYMENT_STATUS[p.status] || PAYMENT_STATUS.pending;
                                        const StatusIcon = statusCfg.icon;
                                        const cryptoCfg = CRYPTO_OPTIONS.find(c => c.key === p.crypto_type) || CRYPTO_OPTIONS[0];
                                        return (
                                            <tr key={p.id || i} className="border-b border-slate-800/50 hover:bg-slate-800/30" data-testid={`payment-row-${i}`}>
                                                <td className="py-3 px-2 text-slate-400 text-xs">{formatDate(p.submitted_at || p.created_at)}</td>
                                                <td className="py-3 px-2">
                                                    <span className={`text-xs font-medium ${cryptoCfg.text}`}>{p.crypto_type || 'BTC'}</span>
                                                </td>
                                                <td className="py-3 px-2 text-white font-mono">${p.amount_sent || '0'}</td>
                                                <td className="py-3 px-2">
                                                    <code className="text-xs text-slate-400 font-mono">{(p.txid || '').slice(0, 16)}...</code>
                                                </td>
                                                <td className="py-3 px-2">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${statusCfg.bg} ${statusCfg.color}`}>
                                                        <StatusIcon className={`w-3 h-3 ${statusCfg.animate ? 'animate-spin' : ''}`} />
                                                        {statusCfg.label}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-2 text-right">
                                                    {p.txid && (
                                                        <a href={cryptoCfg.explorer(p.txid)} target="_blank" rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                                                            data-testid={`view-blockchain-${i}`}
                                                        >
                                                            Ver <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Important Messages — condensed */}
            <div className="grid sm:grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-start gap-2">
                    <Shield className="w-3.5 h-3.5 text-cyan-400 mt-0.5 flex-shrink-0" />
                    <p className="text-cyan-400 text-xs">Verificable en blockchain pública</p>
                </div>
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-red-400 text-xs">Transacciones irreversibles. Verifique la dirección</p>
                </div>
            </div>

            {/* ── PAYMENT MODAL ────────────────────────────────── */}
            <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
                <DialogContent
                    className="bg-slate-950 border-slate-800 max-w-2xl max-h-[92vh] overflow-y-auto p-0"
                    data-testid="crypto-payment-modal"
                >
                    {/* Premium header */}
                    <div className="relative bg-gradient-to-br from-[#072146] via-[#0a1c3d] to-slate-950 p-6 border-b border-slate-800">
                        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-cyan-500/20 blur-3xl pointer-events-none" />
                        <DialogHeader>
                            <DialogTitle className="text-white text-xl flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-400 flex items-center justify-center shadow-[0_4px_16px_-2px_rgba(6,182,212,0.5)]">
                                    <Bitcoin className="w-5 h-5 text-slate-950" />
                                </div>
                                Completar requisito de retiro
                            </DialogTitle>
                        </DialogHeader>
                        <p className="text-slate-400 text-[13px] mt-2">Método de abono cripto · Seleccione la moneda y envíe a la dirección indicada.</p>
                    </div>

                    <div className="p-6 space-y-5">
                        {/* 1. Crypto chips */}
                        <div>
                            <p className="text-slate-400 text-[11px] font-bold uppercase tracking-[0.14em] mb-2">Moneda</p>
                            <div className="grid grid-cols-4 gap-2" data-testid="crypto-selector">
                                {CRYPTO_OPTIONS.map((crypto) => (
                                    <button
                                        key={crypto.key}
                                        onClick={() => setSelectedCrypto(crypto.key)}
                                        data-testid={`crypto-tab-${crypto.key}`}
                                        className={`relative p-3 rounded-xl border transition-all duration-200 ${
                                            selectedCrypto === crypto.key
                                                ? `${crypto.border} ${crypto.bg} ring-2 ring-offset-2 ring-offset-slate-950 ${crypto.border.replace('border-', 'ring-')}`
                                                : 'border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60'
                                        }`}
                                    >
                                        <p className={`font-bold text-sm ${selectedCrypto === crypto.key ? crypto.text : 'text-slate-400'}`}>
                                            {crypto.short}
                                        </p>
                                        {selectedCrypto === crypto.key && (
                                            <div className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gradient-to-r ${crypto.color} flex items-center justify-center ring-2 ring-slate-950`}>
                                                <Check className="w-2.5 h-2.5 text-white" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 2. Payment details card (Red + Monto + Wallet + QR) */}
                        {currentWallet && (
                            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
                                {/* Network + Amount row */}
                                <div className="grid grid-cols-2 divide-x divide-slate-800 bg-slate-900/40">
                                    <div className="p-3">
                                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Red</p>
                                        <p className={`${currentCryptoConfig.text} font-bold text-sm mt-0.5`}>{currentWallet.network}</p>
                                    </div>
                                    <div className="p-3">
                                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Monto a pagar</p>
                                        <p className="text-white font-bold text-sm mt-0.5 font-mono">€{taxRemaining.toFixed(2)} <span className="text-slate-500 text-[11px] font-sans">EUR</span></p>
                                        {prices[selectedCrypto] ? (
                                            <p className={`${currentCryptoConfig.text} font-bold text-[13px] mt-1 font-mono`} data-testid="crypto-equivalent">
                                                ≈ {cryptoEquivalent(taxRemaining, selectedCrypto)} {selectedCrypto}
                                            </p>
                                        ) : (
                                            <p className="text-slate-500 text-[11px] mt-1">Calculando equivalente…</p>
                                        )}
                                    </div>
                                </div>

                                {/* Exchange rate + quote timestamp */}
                                {prices[selectedCrypto] && (
                                    <div className="px-4 pt-2 flex items-center justify-between text-[10.5px] text-slate-500" data-testid="crypto-rate-row">
                                        <span>Tasa: <span className="text-slate-300 font-mono">€{Number(prices[selectedCrypto]).toLocaleString('es-ES', { maximumFractionDigits: 2 })}/{selectedCrypto}</span></span>
                                        <span>Cotización: {formatQuoteTime(quotedAt)} · CoinGecko</span>
                                    </div>
                                )}

                                {/* Network warning */}
                                <div className="mx-4 mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2" data-testid="network-warning">
                                    <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                                    <p className="text-red-300 text-[11px] leading-snug">
                                        Envíe únicamente mediante la red <span className="font-bold">{currentWallet.network}</span>. Una transferencia realizada mediante una red incorrecta puede provocar la pérdida de los fondos.
                                    </p>
                                </div>

                                {/* QR + Address */}
                                <div className="p-4 flex flex-col sm:flex-row items-center gap-4">
                                    <div className="bg-white p-3 rounded-xl shadow-xl flex-shrink-0" data-testid="crypto-qr-code">
                                        <QRCodeSVG value={currentWallet.address} size={140} level="H" includeMargin={false} />
                                    </div>
                                    <div className="flex-1 w-full space-y-2 min-w-0">
                                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Dirección wallet</p>
                                        <code
                                            className={`block text-[12px] bg-slate-950 ring-1 ring-slate-800 p-2.5 rounded-lg break-all font-mono leading-relaxed ${currentCryptoConfig.text}`}
                                            data-testid="crypto-receive-address"
                                        >
                                            {currentWallet.address}
                                        </code>
                                        <Button
                                            onClick={() => handleCopyAddress(currentWallet.address)}
                                            className={`w-full ${copiedAddress ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : `${currentCryptoConfig.bg} ${currentCryptoConfig.text} ${currentCryptoConfig.border}`} border hover:opacity-80`}
                                            variant="outline"
                                            data-testid="copy-address-btn"
                                        >
                                            {copiedAddress ? <><Check className="w-4 h-4 mr-2" /> Dirección copiada</> : <><Copy className="w-4 h-4 mr-2" /> Copiar dirección</>}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 3. Confirm payment (collapsible-feel) */}
                        <details className="group rounded-xl bg-slate-900/40 ring-1 ring-slate-800 overflow-hidden">
                            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-900/60 transition-colors list-none">
                                <span className="text-white font-semibold text-sm flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                                    Ya pagué — confirmar mi transacción
                                </span>
                                <ArrowRight className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-90" />
                            </summary>
                            <div className="p-4 pt-0 space-y-3 border-t border-slate-800 mt-0">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-slate-400 text-xs">TXID <span className="text-red-400">*</span></Label>
                                        <Input
                                            value={txid}
                                            onChange={(e) => setTxid(e.target.value)}
                                            placeholder="a1b2c3d4e5..."
                                            className="bg-slate-950 border-slate-800 text-white font-mono text-sm h-9"
                                            data-testid="crypto-txid-input"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-slate-400 text-xs">Monto enviado (EUR) <span className="text-red-400">*</span></Label>
                                        <Input
                                            type="number" step="1" min="1000"
                                            value={amountSent}
                                            onChange={(e) => setAmountSent(e.target.value)}
                                            placeholder="Mínimo 1.000"
                                            className="bg-slate-950 border-slate-800 text-white font-mono h-9"
                                            data-testid="crypto-amount-input"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-slate-400 text-xs">Comprobante (captura)</Label>
                                    <label className="cursor-pointer block">
                                        <div className={`p-3 rounded-lg border-2 border-dashed transition-colors ${proofPreview ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-800 hover:border-slate-700'}`}>
                                            <div className="flex flex-col items-center gap-1.5">
                                                {proofPreview ? (
                                                    <img src={proofPreview} alt="Comprobante" className="max-h-24 rounded" />
                                                ) : (
                                                    <>
                                                        <Upload className="w-5 h-5 text-slate-500" />
                                                        <p className="text-xs text-slate-500">Subir captura (máx. 5MB)</p>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" data-testid="crypto-proof-input" />
                                    </label>
                                </div>

                                <Button
                                    onClick={handleSubmit}
                                    disabled={submitting || !txid || txid.length < 10 || !amountSent || parseFloat(amountSent) < 1000}
                                    className={`w-full bg-gradient-to-r ${currentCryptoConfig.color} hover:opacity-90 text-white`}
                                    data-testid="submit-crypto-payment-btn"
                                >
                                    {submitting ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                                    ) : (
                                        <><ArrowRight className="w-4 h-4 mr-2" /> Confirmar pago</>
                                    )}
                                </Button>
                            </div>
                        </details>

                        {/* 4. Tools row — minimal */}
                        <div className="flex items-center justify-between pt-1 text-[11px]">
                            <button
                                onClick={() => { setPaymentModalOpen(false); setIssueDialogOpen(true); }}
                                className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors"
                                data-testid="report-issue-btn"
                            >
                                <HelpCircle className="w-3.5 h-3.5" /> Reportar problema
                            </button>
                            <details className="relative">
                                <summary className="list-none cursor-pointer text-slate-500 hover:text-slate-300 transition-colors inline-flex items-center gap-1">
                                    <ShoppingCart className="w-3.5 h-3.5" /> ¿No tienes cripto?
                                </summary>
                                <div className="absolute right-0 mt-2 w-64 p-3 rounded-xl bg-slate-900 ring-1 ring-slate-800 shadow-2xl z-10">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-2">Wallets</p>
                                    <div className="flex flex-wrap gap-1 mb-3">
                                        {WALLET_PROVIDERS.map((wp) => (
                                            <a key={wp.name} href={wp.url} target="_blank" rel="noopener noreferrer"
                                                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] border ${wp.color}`}
                                                data-testid={`wallet-link-${wp.name.toLowerCase().replace(/\s/g, '-')}`}
                                            >
                                                {wp.name}
                                            </a>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-2">Comprar</p>
                                    <div className="flex flex-wrap gap-1">
                                        {BUY_PROVIDERS.map((bp) => (
                                            <a key={bp.name} href={bp.url} target="_blank" rel="noopener noreferrer"
                                                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] border ${bp.color}`}
                                                data-testid={`buy-crypto-${bp.name.toLowerCase()}`}
                                            >
                                                {bp.name}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            </details>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Payment Issue Dialog */}
            <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-700 max-w-md" data-testid="payment-issue-dialog">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-amber-400" />
                            Reportar Problema con el Pago
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {/* Pre-filled context */}
                        <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700 space-y-2">
                            <p className="text-xs text-slate-500 uppercase tracking-wide">Datos del pago (auto-completados)</p>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                    <span className="text-slate-500">Cripto:</span>
                                    <span className={`ml-2 ${currentCryptoConfig.text} font-medium`}>{currentCryptoConfig.label}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500">Red:</span>
                                    <span className="ml-2 text-slate-300">{currentWallet?.network || '-'}</span>
                                </div>
                                {amountSent && (
                                    <div>
                                        <span className="text-slate-500">Monto:</span>
                                        <span className="ml-2 text-white font-mono">${amountSent}</span>
                                    </div>
                                )}
                                {txid && (
                                    <div className="col-span-2">
                                        <span className="text-slate-500">TXID:</span>
                                        <span className="ml-2 text-slate-300 font-mono text-xs break-all">{txid.slice(0, 30)}...</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Guided message */}
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                            <p className="text-amber-400 text-sm font-medium mb-2">
                                <HelpCircle className="w-4 h-4 inline mr-1" />
                                Guía para describir el problema:
                            </p>
                            <ul className="text-amber-300/80 text-xs space-y-1 list-disc list-inside">
                                <li>¿El pago fue enviado pero no aparece confirmado?</li>
                                <li>¿Se envió a la dirección correcta?</li>
                                <li>¿Cuánto tiempo ha pasado desde el envío?</li>
                                <li>¿Tiene el hash/TXID de la transacción?</li>
                            </ul>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-slate-300">
                                Describa el problema <span className="text-red-400">*</span>
                            </Label>
                            <Textarea
                                value={issueMessage}
                                onChange={(e) => setIssueMessage(e.target.value)}
                                placeholder="Ej: Envié $500 en BTC hace 2 horas pero no se refleja en mi cuenta..."
                                className="bg-slate-950/50 border-slate-800 text-white min-h-[100px] resize-none"
                                data-testid="issue-message-input"
                            />
                        </div>

                        {/* TX Hash field for issue */}
                        <div className="space-y-2">
                            <Label className="text-slate-300 text-sm">
                                Hash / TXID de la transacción
                                <span className="text-slate-500 text-xs ml-1">(si no fue completado arriba)</span>
                            </Label>
                            <Input
                                value={issueTxHash}
                                onChange={(e) => setIssueTxHash(e.target.value)}
                                placeholder="Ej: 0xabc123... o a1b2c3d4..."
                                className="bg-slate-950/50 border-slate-800 text-white font-mono text-sm"
                                data-testid="issue-tx-hash-input"
                            />
                        </div>

                        {/* Proof image upload for issue */}
                        <div className="space-y-2">
                            <Label className="text-slate-300 text-sm">
                                Comprobante de pago (captura de pantalla)
                            </Label>
                            <label className="cursor-pointer block">
                                <div className={`p-3 rounded-lg border-2 border-dashed transition-colors ${
                                    issueProofPreview ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-700 hover:border-slate-600'
                                }`}>
                                    <div className="flex flex-col items-center gap-2">
                                        {issueProofPreview ? (
                                            <div className="relative">
                                                <img src={issueProofPreview} alt="Comprobante" className="max-h-24 rounded" />
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.preventDefault(); setIssueProofImage(null); setIssueProofPreview(null); }}
                                                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center"
                                                    data-testid="issue-remove-proof-btn"
                                                >
                                                    <X className="w-3 h-3 text-white" />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <Upload className="w-6 h-6 text-slate-500" />
                                                <p className="text-xs text-slate-500">Adjuntar comprobante (máx. 5MB)</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <input type="file" accept="image/*" onChange={handleIssueImageChange} className="hidden" data-testid="issue-proof-input" />
                            </label>
                        </div>

                        <div className="flex gap-3">
                            <Button
                                onClick={handleReportIssue}
                                disabled={issueSending || !issueMessage.trim() || issueMessage.trim().length < 10}
                                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                                data-testid="submit-issue-btn"
                            >
                                {issueSending ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                                ) : (
                                    <><MessageSquare className="w-4 h-4 mr-2" /> Enviar Reporte</>
                                )}
                            </Button>
                            <Button variant="outline" onClick={() => setIssueDialogOpen(false)} className="border-slate-700 text-slate-400">
                                Cancelar
                            </Button>
                        </div>

                        <p className="text-xs text-slate-500 text-center">
                            Se notificara a info@lionbit.es y {SUPPORT_EMAIL}
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
