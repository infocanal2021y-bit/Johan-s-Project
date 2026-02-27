import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { transactionsAPI } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Download, FileText, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Filter, AlertTriangle, Loader2, FileDown, Bitcoin, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { CryptoPaymentSection } from '../components/crypto/CryptoPaymentSection';

export const TransactionsPage = () => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [taxDialogOpen, setTaxDialogOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [taxAmount, setTaxAmount] = useState('');
    const [payingTax, setPayingTax] = useState(false);

    const fetchTransactions = async () => {
        try {
            const response = await transactionsAPI.getAllHistory();
            setTransactions(response.data);
        } catch (error) {
            toast.error('Failed to load transactions');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTransactions();
    }, []);

    const handleExportCSV = async () => {
        try {
            const response = await transactionsAPI.exportCSV();
            const blob = new Blob([response.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'transactions.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success('Transactions exported successfully');
        } catch (error) {
            toast.error('Failed to export transactions');
        }
    };

    const handleDownloadReceipt = async (tx) => {
        try {
            const response = await transactionsAPI.getReceipt(tx.id);
            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `receipt_${tx.transaction_reference || tx.id.slice(0, 8)}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success('Receipt downloaded');
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to download receipt');
        }
    };

    const handleOpenTaxDialog = (tx) => {
        setSelectedTransaction(tx);
        setTaxAmount('');
        setTaxDialogOpen(true);
    };

    const handlePayTax = async () => {
        if (!selectedTransaction || !taxAmount || parseFloat(taxAmount) <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }

        setPayingTax(true);
        try {
            await transactionsAPI.payTax(selectedTransaction.id, { amount: parseFloat(taxAmount) });
            toast.success('Tax payment processed successfully');
            setTaxDialogOpen(false);
            fetchTransactions();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to process tax payment');
        } finally {
            setPayingTax(false);
        }
    };

    const filteredTransactions = transactions.filter((tx) => {
        if (filter === 'all') return true;
        return tx.transaction_type === filter;
    });

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatAmount = (amount, currency) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
        }).format(amount);
    };

    const typeConfig = {
        deposit: { icon: ArrowDownLeft, color: 'text-emerald-400', bg: 'bg-emerald-500/20', sign: '+' },
        withdraw: { icon: ArrowUpRight, color: 'text-red-400', bg: 'bg-red-500/20', sign: '-' },
        transfer: { icon: ArrowLeftRight, color: 'text-cyan-400', bg: 'bg-cyan-500/20', sign: '-' },
    };

    const statusConfig = {
        completed: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Completed' },
        pending: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', label: 'Pending' },
        pending_tax: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', label: 'Pending Tax' },
        rejected: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', label: 'Rejected' },
        under_review: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', label: 'Under Review' },
        crypto_payment_under_review: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', label: 'Crypto Review' },
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="transactions-page">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                    <div>
                        <h1 className="text-3xl font-heading font-bold text-white">Transaction History</h1>
                        <p className="text-slate-500 mt-1">View all your past transactions</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Select value={filter} onValueChange={setFilter}>
                            <SelectTrigger className="w-36 bg-slate-900 border-slate-800 text-white" data-testid="filter-selector">
                                <Filter className="w-4 h-4 mr-2" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800">
                                <SelectItem value="all" className="text-white">All Types</SelectItem>
                                <SelectItem value="deposit" className="text-white">Deposits</SelectItem>
                                <SelectItem value="withdraw" className="text-white">Withdrawals</SelectItem>
                                <SelectItem value="transfer" className="text-white">Transfers</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            onClick={handleExportCSV}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white"
                            data-testid="export-csv-btn"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Export CSV
                        </Button>
                    </div>
                </motion.div>

                {/* Transactions Table */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader className="border-b border-slate-800">
                            <CardTitle className="text-white font-heading flex items-center gap-2">
                                <FileText className="w-5 h-5 text-emerald-400" />
                                All Transactions ({filteredTransactions.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-8 space-y-4">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className="h-16 bg-slate-800/50 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : filteredTransactions.length === 0 ? (
                                <div className="py-16 text-center">
                                    <FileText className="w-12 h-12 mx-auto text-slate-600 mb-4" />
                                    <p className="text-slate-500">No transactions found</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-800 hover:bg-transparent">
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase tracking-wider">Reference</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase tracking-wider">Type</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase tracking-wider">Amount</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase tracking-wider">Status</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase tracking-wider">Tax Progress</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase tracking-wider text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredTransactions.map((tx) => {
                                                const config = typeConfig[tx.transaction_type] || typeConfig.deposit;
                                                const Icon = config.icon;
                                                const isPendingTax = tx.status === 'pending_tax';
                                                const isCompleted = tx.status === 'completed';
                                                const taxRequired = tx.tax_required || 0;
                                                const taxPaid = tx.tax_paid || 0;
                                                const taxProgress = taxRequired > 0 ? (taxPaid / taxRequired) * 100 : 0;
                                                const statusCfg = statusConfig[tx.status] || statusConfig.pending;

                                                return (
                                                    <TableRow
                                                        key={tx.id}
                                                        className="border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                                                        data-testid={`transaction-row-${tx.id}`}
                                                    >
                                                        <TableCell className="py-4">
                                                            <span className="font-mono text-sm text-slate-300">
                                                                {tx.transaction_reference || tx.id.slice(0, 12)}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center`}>
                                                                    <Icon className={`w-5 h-5 ${config.color}`} />
                                                                </div>
                                                                <div>
                                                                    <span className="font-medium text-white capitalize">
                                                                        {tx.transaction_type}
                                                                    </span>
                                                                    <p className="text-xs text-slate-500">
                                                                        {formatDate(tx.created_at)}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className={`font-mono font-medium ${config.color}`}>
                                                                {config.sign}{formatAmount(tx.amount, tx.currency)}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                                                                {statusCfg.label}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>
                                                            {tx.transaction_type === 'transfer' && taxRequired > 0 ? (
                                                                <div className="space-y-2 min-w-[180px]">
                                                                    <div className="flex justify-between text-xs">
                                                                        <span className="text-slate-500">Tax Progress</span>
                                                                        <span className={isPendingTax ? 'text-orange-400' : 'text-emerald-400'}>
                                                                            ${taxPaid.toFixed(0)} / ${taxRequired.toFixed(0)}
                                                                        </span>
                                                                    </div>
                                                                    <Progress 
                                                                        value={taxProgress} 
                                                                        className="h-2 bg-slate-700"
                                                                    />
                                                                    {isPendingTax && (
                                                                        <Button
                                                                            size="sm"
                                                                            onClick={() => handleOpenTaxDialog(tx)}
                                                                            className="w-full bg-orange-500 hover:bg-orange-600 text-white text-xs"
                                                                            data-testid={`pay-tax-btn-${tx.id}`}
                                                                        >
                                                                            <AlertTriangle className="w-3 h-3 mr-1" />
                                                                            Pay Tax (${(taxRequired - taxPaid).toFixed(0)} remaining)
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span className="text-slate-600">-</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {tx.transaction_type === 'transfer' && isCompleted && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => handleDownloadReceipt(tx)}
                                                                    className="border-slate-700 hover:bg-slate-800 text-slate-300"
                                                                    data-testid={`download-receipt-${tx.id}`}
                                                                >
                                                                    <FileDown className="w-4 h-4 mr-1" />
                                                                    Receipt
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* Tax Payment Dialog */}
            <Dialog open={taxDialogOpen} onOpenChange={setTaxDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-orange-400" />
                            Pay Transfer Tax
                        </DialogTitle>
                    </DialogHeader>
                    {selectedTransaction && (
                        <div className="space-y-6 pt-4">
                            {/* Tax Summary */}
                            <div className="p-4 rounded-lg bg-slate-800/50 space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Reference:</span>
                                    <span className="text-white font-mono">
                                        {selectedTransaction.transaction_reference || selectedTransaction.id.slice(0, 12)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Transfer Amount:</span>
                                    <span className="text-white font-mono">
                                        ${selectedTransaction.amount?.toFixed(2)}
                                    </span>
                                </div>
                                <hr className="border-slate-700" />
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Tax Required:</span>
                                    <span className="text-orange-400 font-mono">
                                        ${(selectedTransaction.tax_required || 4850).toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Tax Paid:</span>
                                    <span className="text-emerald-400 font-mono">
                                        ${(selectedTransaction.tax_paid || 0).toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-white font-medium">Remaining:</span>
                                    <span className="text-red-400 font-mono font-bold">
                                        ${Math.max(0, (selectedTransaction.tax_required || 4850) - (selectedTransaction.tax_paid || 0)).toFixed(2)}
                                    </span>
                                </div>
                                
                                {/* Progress Bar */}
                                <div className="pt-2">
                                    <Progress 
                                        value={((selectedTransaction.tax_paid || 0) / (selectedTransaction.tax_required || 4850)) * 100} 
                                        className="h-3 bg-slate-700"
                                    />
                                </div>
                            </div>

                            {/* Payment Methods Tabs */}
                            <Tabs defaultValue="fiat" className="w-full">
                                <TabsList className="grid w-full grid-cols-2 bg-slate-800">
                                    <TabsTrigger value="fiat" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
                                        Pay with EUR Balance
                                    </TabsTrigger>
                                    <TabsTrigger value="crypto" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400">
                                        <Bitcoin className="w-4 h-4 mr-2" />
                                        Pay with Crypto
                                    </TabsTrigger>
                                </TabsList>
                                
                                <TabsContent value="fiat" className="space-y-4 pt-4">
                                    {/* Payment Input */}
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Payment Amount (USD)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            placeholder="Enter amount to pay"
                                            value={taxAmount}
                                            onChange={(e) => setTaxAmount(e.target.value)}
                                            className="bg-slate-950 border-slate-800 text-white font-mono"
                                            data-testid="tax-amount-input"
                                        />
                                        <p className="text-xs text-slate-500">
                                            You can pay in parts. Once the full tax is paid, the transfer will be completed.
                                        </p>
                                    </div>

                                    {/* Submit Button */}
                                    <Button
                                        onClick={handlePayTax}
                                        disabled={payingTax || !taxAmount || parseFloat(taxAmount) <= 0}
                                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                                        data-testid="confirm-tax-payment-btn"
                                    >
                                        {payingTax ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Processing...
                                            </>
                                        ) : (
                                            'Confirm EUR Payment'
                                        )}
                                    </Button>
                                </TabsContent>
                                
                                <TabsContent value="crypto" className="pt-4">
                                    <CryptoPaymentSection 
                                        transaction={selectedTransaction}
                                        onPaymentSubmitted={() => {
                                            setTaxDialogOpen(false);
                                            fetchTransactions();
                                        }}
                                    />
                                </TabsContent>
                            </Tabs>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </Layout>
    );
};

export default TransactionsPage;
