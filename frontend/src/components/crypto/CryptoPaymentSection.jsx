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
    FileText, ArrowRight, HelpCircle, MessageSquare, X
} from 'lucide-react';
import { toast } from 'sonner';

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
    under_review: { label: 'En Revisión', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/20' },
    approved: { label: 'Aprobado', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
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
    // Payment issue dialog
    const [issueDialogOpen, setIssueDialogOpen] = useState(false);
    const [issueMessage, setIssueMessage] = useState('');
    const [issueSending, setIssueSending] = useState(false);
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
        if (!amountSent || parseFloat(amountSent) < 200) {
            toast.error('El monto mínimo es $200 USD');
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
                tx_hash: txid || null,
                message: issueMessage.trim()
            });
            toast.success('Reporte enviado. Su transacción ha sido marcada como En Revisión.');
            setIssueDialogOpen(false);
            setIssueMessage('');
            onPaymentSubmitted?.();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Error al enviar el reporte');
        } finally {
            setIssueSending(false);
        }
    };

    const formatDate = (iso) => {
        if (!iso) return '-';
        return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

            {/* Tax Progress */}
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-sm">Progreso del Impuesto</span>
                    <span className="text-white font-mono text-sm">${taxPaid.toFixed(2)} / ${taxRequired.toFixed(2)}</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-3">
                    <div 
                        className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (taxPaid / taxRequired) * 100)}%` }}
                        data-testid="tax-progress-bar"
                    />
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-2 rounded-lg bg-slate-900/50">
                        <p className="text-xs text-slate-500">Requerido</p>
                        <p className="text-orange-400 font-bold font-mono">${taxRequired.toFixed(2)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900/50">
                        <p className="text-xs text-slate-500">Abonado</p>
                        <p className="text-emerald-400 font-bold font-mono">${taxPaid.toFixed(2)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900/50">
                        <p className="text-xs text-slate-500">Restante</p>
                        <p className="text-red-400 font-bold font-mono">${taxRemaining.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            {/* Crypto Selector Tabs */}
            <div className="space-y-3">
                <p className="text-slate-300 text-sm font-medium">Seleccione criptomoneda para pagar:</p>
                <div className="grid grid-cols-4 gap-2" data-testid="crypto-selector">
                    {CRYPTO_OPTIONS.map((crypto) => (
                        <button
                            key={crypto.key}
                            onClick={() => setSelectedCrypto(crypto.key)}
                            data-testid={`crypto-tab-${crypto.key}`}
                            className={`relative p-3 rounded-xl border-2 text-center transition-all duration-200 ${
                                selectedCrypto === crypto.key
                                    ? `${crypto.border} ${crypto.bg} ring-1 ring-offset-1 ring-offset-slate-950 ${crypto.border.replace('border-', 'ring-')}`
                                    : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                            }`}
                        >
                            <p className={`font-bold text-sm ${selectedCrypto === crypto.key ? crypto.text : 'text-slate-400'}`}>
                                {crypto.short}
                            </p>
                            <p className={`text-[10px] mt-0.5 ${selectedCrypto === crypto.key ? 'text-slate-300' : 'text-slate-500'}`}>
                                {crypto.label}
                            </p>
                            {selectedCrypto === crypto.key && (
                                <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-r ${crypto.color} flex items-center justify-center`}>
                                    <Check className="w-2.5 h-2.5 text-white" />
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* QR Code + Wallet Address */}
            {currentWallet && (
                <div className={`p-5 rounded-xl ${currentCryptoConfig.bg} border ${currentCryptoConfig.border} space-y-4`}>
                    <div className="flex items-center gap-2 mb-2">
                        <p className={`${currentCryptoConfig.text} font-medium text-sm`}>
                            Enviar {currentCryptoConfig.label} ({currentWallet.network}) a:
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        {/* QR Code */}
                        <div className="bg-white p-3 rounded-xl shadow-lg flex-shrink-0" data-testid="crypto-qr-code">
                            <QRCodeSVG
                                value={currentWallet.address}
                                size={140}
                                level="H"
                                includeMargin={false}
                            />
                        </div>

                        {/* Address */}
                        <div className="flex-1 w-full space-y-2">
                            <p className="text-xs text-slate-500 uppercase tracking-wide">Dirección de Wallet</p>
                            <code className="block text-sm bg-slate-900/80 p-3 rounded-lg break-all font-mono leading-relaxed" data-testid="crypto-receive-address">
                                <span className={currentCryptoConfig.text}>{currentWallet.address}</span>
                            </code>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    onClick={() => handleCopyAddress(currentWallet.address)}
                                    className={`${currentCryptoConfig.bg} ${currentCryptoConfig.text} border ${currentCryptoConfig.border} hover:opacity-80`}
                                    variant="outline"
                                    data-testid="copy-address-btn"
                                >
                                    {copiedAddress ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                                    {copiedAddress ? 'Copiado' : 'Copiar'}
                                </Button>
                            </div>
                            <p className="text-xs text-slate-500">
                                Red: <span className="text-slate-400">{currentWallet.network}</span>
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Wallet Providers */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-slate-400" />
                    <p className="text-slate-300 text-sm font-medium">Abrir su Wallet:</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {WALLET_PROVIDERS.map((wp) => (
                        <a key={wp.name} href={wp.url} target="_blank" rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all hover:opacity-80 ${wp.color}`}
                            data-testid={`wallet-link-${wp.name.toLowerCase().replace(/\s/g, '-')}`}
                        >
                            {wp.name} <ExternalLink className="w-3 h-3" />
                        </a>
                    ))}
                </div>
            </div>

            {/* Buy Crypto */}
            <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/30 space-y-3">
                <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-violet-400" />
                    <p className="text-violet-400 text-sm font-medium">¿No tienes cripto? Compra aquí de forma segura.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {BUY_PROVIDERS.map((bp) => (
                        <a key={bp.name} href={bp.url} target="_blank" rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium transition-all hover:opacity-80 ${bp.color}`}
                            data-testid={`buy-crypto-${bp.name.toLowerCase()}`}
                        >
                            <ShoppingCart className="w-3.5 h-3.5" /> {bp.name} <ExternalLink className="w-3 h-3" />
                        </a>
                    ))}
                </div>
            </div>

            {/* Payment Form */}
            <div className="p-5 rounded-xl bg-slate-800/30 border border-slate-700 space-y-4">
                <h3 className="text-white font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4 text-cyan-400" />
                    Registrar Pago en {currentCryptoConfig.label}
                </h3>

                {/* Sender Address (optional) */}
                <div className="space-y-2">
                    <Label className="text-slate-300 text-sm">
                        Su dirección de wallet (desde donde envía) <span className="text-slate-500 text-xs">(opcional)</span>
                    </Label>
                    <Input
                        value={senderAddress}
                        onChange={(e) => setSenderAddress(e.target.value)}
                        placeholder={selectedCrypto === 'BTC' ? 'Ej: bc1qxy2kgdyg...' : selectedCrypto === 'ETH' || selectedCrypto === 'BNB' ? 'Ej: 0x3ab1d32...' : 'Ej: TWsDm...'}
                        className="bg-slate-950/50 border-slate-800 text-white font-mono text-sm"
                        data-testid="sender-address-input"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-slate-300">
                            TXID / Hash de Transacción <span className="text-red-400">*</span>
                        </Label>
                        <Input
                            value={txid}
                            onChange={(e) => setTxid(e.target.value)}
                            placeholder="Ej: a1b2c3d4e5f6..."
                            className="bg-slate-950/50 border-slate-800 text-white font-mono text-sm"
                            data-testid="crypto-txid-input"
                        />
                        {txid.length >= 10 && (
                            <a href={currentCryptoConfig.explorer(txid.trim())} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                                data-testid="view-txid-link"
                            >
                                Ver transacción en blockchain <ExternalLink className="w-3 h-3" />
                            </a>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label className="text-slate-300">
                            Monto Enviado (USD) <span className="text-red-400">*</span>
                        </Label>
                        <Input
                            type="number"
                            step="0.01"
                            min="200"
                            value={amountSent}
                            onChange={(e) => setAmountSent(e.target.value)}
                            placeholder="Mínimo $200 USD"
                            className="bg-slate-950/50 border-slate-800 text-white font-mono"
                            data-testid="crypto-amount-input"
                        />
                        {amountSent && parseFloat(amountSent) < 200 && (
                            <p className="text-red-400 text-xs">Monto mínimo: $200 USD</p>
                        )}
                    </div>
                </div>

                {/* Proof Upload */}
                <div className="space-y-2">
                    <Label className="text-slate-300">Comprobante (Captura de pantalla)</Label>
                    <label className="cursor-pointer block">
                        <div className={`p-4 rounded-lg border-2 border-dashed transition-colors ${
                            proofPreview ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-700 hover:border-slate-600'
                        }`}>
                            <div className="flex flex-col items-center gap-2">
                                {proofPreview ? (
                                    <img src={proofPreview} alt="Comprobante" className="max-h-32 rounded" />
                                ) : (
                                    <>
                                        <Upload className="w-8 h-8 text-slate-500" />
                                        <p className="text-sm text-slate-500">Haga clic para subir comprobante (máx. 5MB)</p>
                                    </>
                                )}
                            </div>
                        </div>
                        <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" data-testid="crypto-proof-input" />
                    </label>
                </div>

                {/* Submit + Issue buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                        onClick={handleSubmit}
                        disabled={submitting || !txid || txid.length < 10 || !amountSent || parseFloat(amountSent) < 200}
                        className={`flex-1 bg-gradient-to-r ${currentCryptoConfig.color} hover:opacity-90 text-white py-5 text-base`}
                        data-testid="submit-crypto-payment-btn"
                    >
                        {submitting ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando pago...</>
                        ) : (
                            <><ArrowRight className="w-4 h-4 mr-2" /> Confirmar Pago en {currentCryptoConfig.short}</>
                        )}
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() => setIssueDialogOpen(true)}
                        className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 py-5"
                        data-testid="report-issue-btn"
                    >
                        <HelpCircle className="w-4 h-4 mr-2" />
                        Problema con el pago
                    </Button>
                </div>
            </div>

            {/* Payment History */}
            {payments.length > 0 && (
                <Card className="bg-slate-900/70 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white text-base flex items-center gap-2">
                            <Clock className="w-4 h-4 text-cyan-400" />
                            Historial de Pagos de Impuesto
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

            {/* Important Messages */}
            <div className="space-y-3">
                <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-start gap-2">
                    <Shield className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                    <p className="text-cyan-400 text-sm">
                        Todas las transacciones son verificables en la blockchain pública.
                    </p>
                </div>
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-red-400 text-sm">
                        Las transacciones en blockchain no se pueden revertir. Verifique su dirección antes de enviar.
                    </p>
                </div>
            </div>

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
                            Se notificara a info@lionbit.es y info@paylionsbit.es
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
