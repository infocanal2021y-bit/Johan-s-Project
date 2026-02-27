import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { 
    Bitcoin, 
    Clock, 
    CheckCircle, 
    XCircle, 
    Eye,
    Loader2,
    ExternalLink,
    AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

const CRYPTO_ICONS = {
    BTC: '₿',
    ETH: 'Ξ',
    USDT: '₮',
    LTC: 'Ł'
};

const CRYPTO_COLORS = {
    BTC: 'text-orange-400',
    ETH: 'text-blue-400',
    USDT: 'text-green-400',
    LTC: 'text-slate-300'
};

export const AdminCryptoPaymentsPage = () => {
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPayment, setSelectedPayment] = useState(null);
    const [proofDialogOpen, setProofDialogOpen] = useState(false);
    const [proofImage, setProofImage] = useState(null);
    const [loadingProof, setLoadingProof] = useState(false);
    const [actionDialogOpen, setActionDialogOpen] = useState(false);
    const [actionType, setActionType] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [processing, setProcessing] = useState(false);

    const fetchPayments = async () => {
        try {
            const response = await adminAPI.getPendingCryptoPayments();
            setPayments(response.data);
        } catch (error) {
            toast.error('Failed to load crypto payments');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPayments();
    }, []);

    const handleViewProof = async (payment) => {
        setSelectedPayment(payment);
        setProofDialogOpen(true);
        setLoadingProof(true);
        
        try {
            const response = await adminAPI.getCryptoPaymentProof(payment.id);
            setProofImage(response.data.proof_image);
        } catch (error) {
            toast.error('Failed to load proof image');
        } finally {
            setLoadingProof(false);
        }
    };

    const handleOpenActionDialog = (payment, action) => {
        setSelectedPayment(payment);
        setActionType(action);
        setRejectionReason('');
        setActionDialogOpen(true);
    };

    const handleAction = async () => {
        if (!selectedPayment || !actionType) return;
        
        if (actionType === 'reject' && !rejectionReason.trim()) {
            toast.error('Please provide a rejection reason');
            return;
        }

        setProcessing(true);
        try {
            await adminAPI.cryptoPaymentAction({
                payment_id: selectedPayment.id,
                action: actionType,
                rejection_reason: actionType === 'reject' ? rejectionReason : null
            });
            
            toast.success(actionType === 'approve' 
                ? 'Payment approved and transfer released!' 
                : 'Payment rejected'
            );
            setActionDialogOpen(false);
            fetchPayments();
        } catch (error) {
            toast.error(error.response?.data?.detail || `Failed to ${actionType} payment`);
        } finally {
            setProcessing(false);
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="admin-crypto-payments-page">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl font-heading font-bold text-white flex items-center gap-3">
                        <Bitcoin className="w-8 h-8 text-orange-400" />
                        Pending Crypto Payments
                    </h1>
                    <p className="text-slate-500 mt-1">Review and process cryptocurrency tax payments</p>
                </motion.div>

                {/* Summary Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                                        <Clock className="w-6 h-6 text-orange-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-500">Pending Reviews</p>
                                        <p className="text-3xl font-heading font-bold text-white">{payments.length}</p>
                                    </div>
                                </div>
                                {payments.length > 0 && (
                                    <div className="text-right">
                                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Cryptocurrencies</p>
                                        <div className="flex gap-2">
                                            {['BTC', 'ETH', 'USDT', 'LTC'].map(crypto => {
                                                const count = payments.filter(p => p.crypto_type === crypto).length;
                                                if (count === 0) return null;
                                                return (
                                                    <span key={crypto} className={`px-2 py-1 rounded text-sm font-mono ${CRYPTO_COLORS[crypto]} bg-slate-800`}>
                                                        {CRYPTO_ICONS[crypto]} {count}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Payments Table */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader className="border-b border-slate-800">
                            <CardTitle className="text-white font-heading">
                                Payments Awaiting Review
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-8 space-y-4">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="h-20 bg-slate-800/50 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : payments.length === 0 ? (
                                <div className="py-16 text-center">
                                    <CheckCircle className="w-12 h-12 mx-auto text-emerald-400 mb-4" />
                                    <p className="text-slate-400">No pending crypto payments</p>
                                    <p className="text-sm text-slate-600 mt-1">All payments have been reviewed</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-800 hover:bg-transparent">
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">User</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Transfer</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Crypto</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">TXID</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Amount Sent</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Submitted</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {payments.map((payment) => (
                                                <TableRow 
                                                    key={payment.id} 
                                                    className="border-slate-800/50 hover:bg-slate-800/30"
                                                    data-testid={`crypto-payment-row-${payment.id}`}
                                                >
                                                    <TableCell>
                                                        <div>
                                                            <p className="text-white font-medium">{payment.user?.name}</p>
                                                            <p className="text-xs text-slate-500">{payment.user?.email}</p>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="space-y-1">
                                                            <p className="font-mono text-xs text-slate-400">
                                                                {payment.transaction?.transaction_reference}
                                                            </p>
                                                            <p className="text-emerald-400 font-mono">
                                                                ${payment.transaction?.amount?.toFixed(2)}
                                                            </p>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-xl ${CRYPTO_COLORS[payment.crypto_type]}`}>
                                                                {CRYPTO_ICONS[payment.crypto_type]}
                                                            </span>
                                                            <div>
                                                                <p className="text-white font-medium">{payment.crypto_type}</p>
                                                                <p className="text-xs text-slate-500">{payment.network}</p>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <code className="text-xs text-slate-400 max-w-[120px] truncate">
                                                                {payment.txid}
                                                            </code>
                                                            <a
                                                                href={`https://www.blockchain.com/search?search=${payment.txid}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-cyan-400 hover:text-cyan-300"
                                                            >
                                                                <ExternalLink className="w-4 h-4" />
                                                            </a>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={`font-mono font-medium ${CRYPTO_COLORS[payment.crypto_type]}`}>
                                                            {payment.amount_sent} {payment.crypto_type}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-slate-400 text-sm">
                                                        {formatDate(payment.submitted_at)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleViewProof(payment)}
                                                                className="border-slate-700 hover:bg-slate-800"
                                                                data-testid={`view-proof-${payment.id}`}
                                                            >
                                                                <Eye className="w-4 h-4 mr-1" />
                                                                Proof
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleOpenActionDialog(payment, 'approve')}
                                                                className="bg-emerald-500 hover:bg-emerald-600"
                                                                data-testid={`approve-${payment.id}`}
                                                            >
                                                                <CheckCircle className="w-4 h-4 mr-1" />
                                                                Approve
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="destructive"
                                                                onClick={() => handleOpenActionDialog(payment, 'reject')}
                                                                className="bg-red-500 hover:bg-red-600"
                                                                data-testid={`reject-${payment.id}`}
                                                            >
                                                                <XCircle className="w-4 h-4 mr-1" />
                                                                Reject
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* Proof Image Dialog */}
            <Dialog open={proofDialogOpen} onOpenChange={setProofDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <Eye className="w-5 h-5 text-cyan-400" />
                            Payment Proof - {selectedPayment?.crypto_type}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        {selectedPayment && (
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-slate-500">TXID:</span>
                                    <p className="text-white font-mono text-xs break-all">{selectedPayment.txid}</p>
                                </div>
                                <div>
                                    <span className="text-slate-500">Amount:</span>
                                    <p className="text-white font-mono">{selectedPayment.amount_sent} {selectedPayment.crypto_type}</p>
                                </div>
                            </div>
                        )}
                        
                        <div className="border border-slate-700 rounded-lg overflow-hidden">
                            {loadingProof ? (
                                <div className="flex items-center justify-center py-16">
                                    <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                                </div>
                            ) : proofImage ? (
                                <img 
                                    src={proofImage} 
                                    alt="Payment proof" 
                                    className="w-full max-h-[400px] object-contain bg-slate-800"
                                />
                            ) : (
                                <div className="py-16 text-center">
                                    <AlertTriangle className="w-12 h-12 mx-auto text-amber-400 mb-4" />
                                    <p className="text-slate-400">No proof image uploaded</p>
                                </div>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Action Confirmation Dialog */}
            <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            {actionType === 'approve' ? (
                                <>
                                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                                    Approve Payment
                                </>
                            ) : (
                                <>
                                    <XCircle className="w-5 h-5 text-red-400" />
                                    Reject Payment
                                </>
                            )}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        {selectedPayment && (
                            <div className="p-4 rounded-lg bg-slate-800/50 space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">User:</span>
                                    <span className="text-white">{selectedPayment.user?.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Crypto:</span>
                                    <span className={CRYPTO_COLORS[selectedPayment.crypto_type]}>
                                        {selectedPayment.amount_sent} {selectedPayment.crypto_type}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">TXID:</span>
                                    <span className="text-white font-mono text-xs">{selectedPayment.txid?.slice(0, 20)}...</span>
                                </div>
                            </div>
                        )}

                        {actionType === 'approve' ? (
                            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                                <p className="text-emerald-400 text-sm">
                                    Approving this payment will:
                                </p>
                                <ul className="text-sm text-emerald-400/70 mt-2 space-y-1 list-disc list-inside">
                                    <li>Mark the transfer as completed</li>
                                    <li>Release funds to the recipient</li>
                                    <li>Record the crypto payment in history</li>
                                </ul>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                                    <p className="text-red-400 text-sm">
                                        Rejecting this payment will return the transfer to "pending_tax" status.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-slate-300">Rejection Reason *</Label>
                                    <Input
                                        value={rejectionReason}
                                        onChange={(e) => setRejectionReason(e.target.value)}
                                        placeholder="e.g., Invalid TXID, Amount doesn't match..."
                                        className="bg-slate-950 border-slate-800 text-white"
                                        data-testid="rejection-reason-input"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                onClick={() => setActionDialogOpen(false)}
                                className="flex-1 border-slate-700"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleAction}
                                disabled={processing || (actionType === 'reject' && !rejectionReason.trim())}
                                className={`flex-1 ${actionType === 'approve' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'}`}
                                data-testid="confirm-action-btn"
                            >
                                {processing ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    `Confirm ${actionType === 'approve' ? 'Approval' : 'Rejection'}`
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </Layout>
    );
};

export default AdminCryptoPaymentsPage;
