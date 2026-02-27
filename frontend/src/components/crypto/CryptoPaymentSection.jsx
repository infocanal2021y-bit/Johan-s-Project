import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { transactionsAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { 
    Bitcoin, 
    Copy, 
    Check, 
    Upload, 
    Loader2, 
    AlertTriangle,
    Clock,
    CheckCircle,
    XCircle
} from 'lucide-react';
import { toast } from 'sonner';

const CRYPTO_ICONS = {
    BTC: '₿',
    ETH: 'Ξ',
    USDT: '₮',
    LTC: 'Ł'
};

const CRYPTO_COLORS = {
    BTC: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
    ETH: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
    USDT: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
    LTC: { bg: 'bg-slate-500/20', text: 'text-slate-300', border: 'border-slate-500/30' }
};

export const CryptoPaymentSection = ({ transaction, onPaymentSubmitted }) => {
    const [wallets, setWallets] = useState({});
    const [selectedCrypto, setSelectedCrypto] = useState(null);
    const [copiedAddress, setCopiedAddress] = useState(null);
    const [txid, setTxid] = useState('');
    const [amountSent, setAmountSent] = useState('');
    const [proofImage, setProofImage] = useState(null);
    const [proofPreview, setProofPreview] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [existingPayment, setExistingPayment] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [walletsRes, paymentRes] = await Promise.all([
                    transactionsAPI.getCryptoWallets(),
                    transactionsAPI.getCryptoPaymentStatus(transaction.id)
                ]);
                setWallets(walletsRes.data);
                setExistingPayment(paymentRes.data);
            } catch (error) {
                console.error('Failed to load crypto data:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [transaction.id]);

    const handleCopyAddress = (cryptoType, address) => {
        navigator.clipboard.writeText(address);
        setCopiedAddress(cryptoType);
        toast.success('Address copied to clipboard');
        setTimeout(() => setCopiedAddress(null), 2000);
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                toast.error('Image too large. Maximum size is 5MB');
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
        if (!selectedCrypto || !txid || !amountSent) {
            toast.error('Please fill in all required fields');
            return;
        }

        if (txid.length < 10) {
            toast.error('Please enter a valid TXID');
            return;
        }

        setSubmitting(true);
        try {
            await transactionsAPI.submitCryptoPayment(transaction.id, {
                transaction_id: transaction.id,
                crypto_type: selectedCrypto,
                txid: txid.trim(),
                amount_sent: amountSent,
                proof_image: proofImage
            });
            
            toast.success('Payment submitted for review');
            onPaymentSubmitted?.();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to submit payment');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            </div>
        );
    }

    // Show existing payment status
    if (existingPayment) {
        const statusConfig = {
            under_review: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'Under Review' },
            approved: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Approved' },
            rejected: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20', label: 'Rejected' }
        };
        
        const status = statusConfig[existingPayment.status] || statusConfig.under_review;
        const StatusIcon = status.icon;

        return (
            <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white font-heading flex items-center gap-2">
                        <Bitcoin className="w-5 h-5 text-orange-400" />
                        Crypto Payment Status
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className={`p-4 rounded-lg ${status.bg} flex items-center gap-3`}>
                        <StatusIcon className={`w-6 h-6 ${status.color}`} />
                        <div>
                            <p className={`font-medium ${status.color}`}>{status.label}</p>
                            <p className="text-sm text-slate-400">
                                {existingPayment.crypto_type} payment submitted
                            </p>
                        </div>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-slate-500">Cryptocurrency:</span>
                            <span className="text-white font-mono">{existingPayment.crypto_type}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">Amount Sent:</span>
                            <span className="text-white font-mono">{existingPayment.amount_sent}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">TXID:</span>
                            <span className="text-white font-mono text-xs break-all">{existingPayment.txid}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">Submitted:</span>
                            <span className="text-white">
                                {new Date(existingPayment.submitted_at).toLocaleString()}
                            </span>
                        </div>
                    </div>

                    {existingPayment.status === 'rejected' && existingPayment.rejection_reason && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                            <p className="text-red-400 text-sm">
                                <strong>Rejection Reason:</strong> {existingPayment.rejection_reason}
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
            <CardHeader>
                <CardTitle className="text-white font-heading flex items-center gap-2">
                    <Bitcoin className="w-5 h-5 text-orange-400" />
                    Pay Tax in Cryptocurrency
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Warning */}
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-amber-400 font-medium">Important Notice</p>
                        <p className="text-sm text-amber-400/70 mt-1">
                            Send ONLY on the indicated network. Payments sent on wrong networks cannot be recovered.
                            An administrator will manually verify your payment.
                        </p>
                    </div>
                </div>

                {/* Crypto Wallet Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(wallets).map(([type, wallet]) => {
                        const colors = CRYPTO_COLORS[type];
                        const isSelected = selectedCrypto === type;
                        
                        return (
                            <div
                                key={type}
                                onClick={() => setSelectedCrypto(type)}
                                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                                    isSelected 
                                        ? `${colors.border} ${colors.bg}` 
                                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-2xl ${colors.text}`}>
                                            {CRYPTO_ICONS[type]}
                                        </span>
                                        <div>
                                            <p className="font-medium text-white">{wallet.name}</p>
                                            <p className="text-xs text-slate-500">{wallet.network}</p>
                                        </div>
                                    </div>
                                    {isSelected && (
                                        <Check className={`w-5 h-5 ${colors.text}`} />
                                    )}
                                </div>
                                
                                {isSelected && (
                                    <div className="space-y-3 mt-4">
                                        {/* QR Code */}
                                        <div className="flex justify-center p-3 bg-white rounded-lg">
                                            <QRCodeSVG 
                                                value={wallet.address} 
                                                size={120}
                                                level="M"
                                            />
                                        </div>
                                        
                                        {/* Address */}
                                        <div className="space-y-2">
                                            <p className="text-xs text-slate-500 uppercase tracking-wider">
                                                Wallet Address
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <code className="flex-1 text-xs bg-slate-900 p-2 rounded text-slate-300 break-all">
                                                    {wallet.address}
                                                </code>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCopyAddress(type, wallet.address);
                                                    }}
                                                    className="border-slate-600 hover:bg-slate-700"
                                                >
                                                    {copiedAddress === type ? (
                                                        <Check className="w-4 h-4 text-emerald-400" />
                                                    ) : (
                                                        <Copy className="w-4 h-4" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Payment Form */}
                {selectedCrypto && (
                    <div className="space-y-4 pt-4 border-t border-slate-700">
                        <h3 className="text-lg font-medium text-white">
                            Payment Details
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-slate-300">
                                    TXID / Transaction Hash <span className="text-red-400">*</span>
                                </Label>
                                <Input
                                    value={txid}
                                    onChange={(e) => setTxid(e.target.value)}
                                    placeholder="Enter transaction ID"
                                    className="bg-slate-950/50 border-slate-800 text-white font-mono text-sm"
                                    data-testid="crypto-txid-input"
                                />
                            </div>
                            
                            <div className="space-y-2">
                                <Label className="text-slate-300">
                                    Amount Sent ({selectedCrypto}) <span className="text-red-400">*</span>
                                </Label>
                                <Input
                                    value={amountSent}
                                    onChange={(e) => setAmountSent(e.target.value)}
                                    placeholder="e.g., 0.05"
                                    className="bg-slate-950/50 border-slate-800 text-white font-mono"
                                    data-testid="crypto-amount-input"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-slate-300">
                                Upload Proof (Screenshot)
                            </Label>
                            <div className="flex items-center gap-4">
                                <label className="flex-1 cursor-pointer">
                                    <div className={`p-4 rounded-lg border-2 border-dashed transition-colors ${
                                        proofPreview 
                                            ? 'border-emerald-500/50 bg-emerald-500/10' 
                                            : 'border-slate-700 hover:border-slate-600'
                                    }`}>
                                        <div className="flex flex-col items-center gap-2">
                                            {proofPreview ? (
                                                <img 
                                                    src={proofPreview} 
                                                    alt="Proof" 
                                                    className="max-h-32 rounded"
                                                />
                                            ) : (
                                                <>
                                                    <Upload className="w-8 h-8 text-slate-500" />
                                                    <p className="text-sm text-slate-500">
                                                        Click to upload proof (max 5MB)
                                                    </p>
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
                        </div>

                        <Button
                            onClick={handleSubmit}
                            disabled={submitting || !txid || !amountSent}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                            data-testid="submit-crypto-payment-btn"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Submitting...
                                </>
                            ) : (
                                <>
                                    <Check className="w-4 h-4 mr-2" />
                                    I Have Made The Payment
                                </>
                            )}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
