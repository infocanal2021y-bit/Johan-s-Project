import { useState, useEffect } from 'react';
import { transactionsAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { 
    Bitcoin, Copy, Check, Upload, Loader2, AlertTriangle, Clock,
    CheckCircle, XCircle, Shield, ExternalLink, Wallet, ShoppingCart,
    FileText, ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';

// Wallet provider links
const WALLET_PROVIDERS = [
    { name: 'Trust Wallet', url: 'https://trustwallet.com', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    { name: 'Binance', url: 'https://www.binance.com', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    { name: 'Coinbase', url: 'https://www.coinbase.com/wallet', color: 'bg-blue-600/20 text-blue-400 border-blue-600/30' },
    { name: 'Exodus', url: 'https://www.exodus.com', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    { name: 'Blockchain', url: 'https://www.blockchain.com/wallet', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
];

// Buy crypto providers
const BUY_PROVIDERS = [
    { name: 'MoonPay', url: 'https://www.moonpay.com', color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
    { name: 'Simplex', url: 'https://www.simplex.com', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
];

// Validate BTC address (Legacy: 1..., SegWit: 3..., Bech32: bc1...)
const validateBTCAddress = (address) => {
    if (!address) return { valid: false, error: '' };
    const trimmed = address.trim();
    
    // Legacy (P2PKH): starts with 1, 25-34 chars
    if (/^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(trimmed)) return { valid: true, type: 'Legacy (P2PKH)' };
    // SegWit (P2SH): starts with 3, 25-34 chars
    if (/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(trimmed)) return { valid: true, type: 'SegWit (P2SH)' };
    // Bech32: starts with bc1, 42-62 chars
    if (/^bc1[a-zA-HJ-NP-Z0-9]{39,59}$/.test(trimmed)) return { valid: true, type: 'Bech32 (Native SegWit)' };
    
    return { valid: false, error: 'Dirección BTC inválida. Debe comenzar con 1, 3, o bc1.' };
};

// Payment status config
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
    const [copiedAddress, setCopiedAddress] = useState(false);
    const [btcAddress, setBtcAddress] = useState('');
    const [btcAddressValid, setBtcAddressValid] = useState(null);
    const [btcAddressError, setBtcAddressError] = useState('');
    const [btcAddressType, setBtcAddressType] = useState('');
    const [txid, setTxid] = useState('');
    const [amountSent, setAmountSent] = useState('');
    const [proofImage, setProofImage] = useState(null);
    const [proofPreview, setProofPreview] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);

    const taxRequired = transaction?.tax_required || 4850;
    const taxPaid = transaction?.tax_paid || 0;
    const taxRemaining = Math.max(0, taxRequired - taxPaid);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [walletsRes, paymentRes] = await Promise.all([
                    transactionsAPI.getCryptoWallets(),
                    transactionsAPI.getCryptoPaymentStatus(transaction.id)
                ]);
                setWallets(walletsRes.data);
                // Handle both single payment and array of payments
                const paymentData = paymentRes.data;
                if (Array.isArray(paymentData)) {
                    setPayments(paymentData);
                } else if (paymentData && paymentData.id) {
                    setPayments([paymentData]);
                }
            } catch {
                // No existing payment, that's fine
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [transaction.id]);

    // Validate BTC address
    useEffect(() => {
        if (btcAddress.length > 0) {
            const result = validateBTCAddress(btcAddress);
            setBtcAddressValid(result.valid);
            setBtcAddressError(result.error || '');
            setBtcAddressType(result.type || '');
        } else {
            setBtcAddressValid(null);
            setBtcAddressError('');
            setBtcAddressType('');
        }
    }, [btcAddress]);

    const handleCopyAddress = (address) => {
        navigator.clipboard.writeText(address);
        setCopiedAddress(true);
        toast.success('Dirección copiada al portapapeles');
        setTimeout(() => setCopiedAddress(false), 2000);
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
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
        }
    };

    const handleSubmit = async () => {
        if (!btcAddressValid) {
            toast.error('Ingrese una dirección BTC válida');
            return;
        }
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
                crypto_type: 'BTC',
                network: 'BTC',
                txid: txid.trim(),
                amount_sent: amountSent,
                btc_address: btcAddress.trim(),
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

    const formatDate = (iso) => {
        if (!iso) return '-';
        return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const btcWallet = wallets?.BTC;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            </div>
        );
    }

    return (
        <div className="space-y-6" data-testid="crypto-payment-section">
            {/* Tax Progress */}
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-sm">Progreso del Impuesto</span>
                    <span className="text-white font-mono text-sm">${taxPaid.toFixed(2)} / ${taxRequired.toFixed(2)}</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-3">
                    <div 
                        className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (taxPaid / taxRequired) * 100)}%` }}
                    />
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-2 rounded bg-slate-900/50">
                        <p className="text-xs text-slate-500">Requerido</p>
                        <p className="text-orange-400 font-bold font-mono">${taxRequired.toFixed(2)}</p>
                    </div>
                    <div className="p-2 rounded bg-slate-900/50">
                        <p className="text-xs text-slate-500">Abonado</p>
                        <p className="text-emerald-400 font-bold font-mono">${taxPaid.toFixed(2)}</p>
                    </div>
                    <div className="p-2 rounded bg-slate-900/50">
                        <p className="text-xs text-slate-500">Restante</p>
                        <p className="text-red-400 font-bold font-mono">${taxRemaining.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            {/* BTC Wallet Address to send to */}
            {btcWallet && (
                <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30 space-y-3">
                    <div className="flex items-center gap-2">
                        <Bitcoin className="w-5 h-5 text-orange-400" />
                        <p className="text-orange-400 font-medium">Enviar Bitcoin (BTC) a esta dirección:</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 text-sm bg-slate-900 p-3 rounded-lg text-orange-300 break-all font-mono" data-testid="btc-receive-address">
                            {btcWallet.address}
                        </code>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopyAddress(btcWallet.address)}
                            className="border-orange-500/30 hover:bg-orange-500/10 text-orange-400"
                            data-testid="copy-btc-address-btn"
                        >
                            {copiedAddress ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
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
                        <a
                            key={wp.name}
                            href={wp.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all hover:opacity-80 ${wp.color}`}
                            data-testid={`wallet-link-${wp.name.toLowerCase().replace(/\s/g, '-')}`}
                        >
                            {wp.name}
                            <ExternalLink className="w-3 h-3" />
                        </a>
                    ))}
                </div>
            </div>

            {/* Buy Crypto */}
            <div className="p-4 rounded-lg bg-violet-500/10 border border-violet-500/30 space-y-3">
                <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-violet-400" />
                    <p className="text-violet-400 text-sm font-medium">
                        ¿No tienes Bitcoin? Compra aquí de forma segura.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {BUY_PROVIDERS.map((bp) => (
                        <a
                            key={bp.name}
                            href={bp.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium transition-all hover:opacity-80 ${bp.color}`}
                            data-testid={`buy-crypto-${bp.name.toLowerCase()}`}
                        >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            {bp.name}
                            <ExternalLink className="w-3 h-3" />
                        </a>
                    ))}
                </div>
            </div>

            {/* User BTC Address Validation */}
            <div className="space-y-3">
                <Label className="text-slate-300 flex items-center gap-2">
                    <Bitcoin className="w-4 h-4 text-orange-400" />
                    Su dirección de wallet BTC (desde donde envía) <span className="text-red-400">*</span>
                </Label>
                <div className="relative">
                    <Input
                        value={btcAddress}
                        onChange={(e) => setBtcAddress(e.target.value)}
                        placeholder="Ej: bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
                        className={`bg-slate-950/50 border-slate-800 text-white font-mono text-sm pr-10 ${
                            btcAddressValid === true ? 'border-emerald-500' :
                            btcAddressValid === false ? 'border-red-500' : ''
                        }`}
                        data-testid="btc-address-input"
                    />
                    {btcAddressValid === true && (
                        <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-400" />
                    )}
                    {btcAddressValid === false && (
                        <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-400" />
                    )}
                </div>
                {btcAddressError && (
                    <p className="text-red-400 text-xs flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {btcAddressError}
                    </p>
                )}
                {btcAddressValid && btcAddressType && (
                    <p className="text-emerald-400 text-xs flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Dirección válida - Tipo: {btcAddressType}
                    </p>
                )}
            </div>

            {/* Payment Form */}
            <div className="p-4 rounded-lg bg-slate-800/30 border border-slate-700 space-y-4">
                <h3 className="text-white font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4 text-cyan-400" />
                    Registrar Pago
                </h3>

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
                            <a
                                href={`https://www.blockchain.com/explorer/transactions/btc/${txid.trim()}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                                data-testid="view-txid-link"
                            >
                                Ver transacción en Blockchain
                                <ExternalLink className="w-3 h-3" />
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
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="hidden"
                            data-testid="crypto-proof-input"
                        />
                    </label>
                </div>

                {/* Submit Button */}
                <Button
                    onClick={handleSubmit}
                    disabled={submitting || !btcAddressValid || !txid || txid.length < 10 || !amountSent || parseFloat(amountSent) < 200}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white py-5 text-base"
                    data-testid="submit-crypto-payment-btn"
                >
                    {submitting ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Enviando pago...
                        </>
                    ) : (
                        <>
                            <Bitcoin className="w-4 h-4 mr-2" />
                            Confirmar Pago en Bitcoin
                        </>
                    )}
                </Button>
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
                                        return (
                                            <tr key={p.id || i} className="border-b border-slate-800/50 hover:bg-slate-800/30" data-testid={`payment-row-${i}`}>
                                                <td className="py-3 px-2 text-slate-400">{formatDate(p.submitted_at || p.created_at)}</td>
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
                                                        <a
                                                            href={`https://www.blockchain.com/explorer/transactions/btc/${p.txid}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                                                            data-testid={`view-blockchain-${i}`}
                                                        >
                                                            Ver en blockchain
                                                            <ExternalLink className="w-3 h-3" />
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
        </div>
    );
};
