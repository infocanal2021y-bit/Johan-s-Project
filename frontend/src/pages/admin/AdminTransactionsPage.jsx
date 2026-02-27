import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Progress } from '../../components/ui/progress';
import { FileText, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Filter, Unlock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export const AdminTransactionsPage = () => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [processingId, setProcessingId] = useState(null);

    const fetchTransactions = async () => {
        try {
            const status = statusFilter === 'all' ? undefined : statusFilter;
            const response = await adminAPI.getTransactions(status);
            setTransactions(response.data);
        } catch (error) {
            toast.error('Failed to load transactions');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTransactions();
    }, [statusFilter]);

    const handleStatusChange = async (transactionId, newStatus) => {
        try {
            await adminAPI.updateTransactionStatus({
                transaction_id: transactionId,
                status: newStatus,
            });
            toast.success('Transaction status updated');
            fetchTransactions();
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    const handleForceRelease = async (transactionId) => {
        setProcessingId(transactionId);
        try {
            await adminAPI.forceRelease({ transaction_id: transactionId });
            toast.success('Transfer force released');
            fetchTransactions();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to force release');
        } finally {
            setProcessingId(null);
        }
    };

    const typeConfig = {
        deposit: { icon: ArrowDownLeft, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
        withdraw: { icon: ArrowUpRight, color: 'text-red-400', bg: 'bg-red-500/20' },
        transfer: { icon: ArrowLeftRight, color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
    };

    const statusConfig = {
        completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        pending_tax: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
        under_review: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="admin-transactions-page">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                    <div>
                        <h1 className="text-3xl font-heading font-bold text-white">All Transactions</h1>
                        <p className="text-slate-500 mt-1">View and manage all system transactions</p>
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-40 bg-slate-900 border-slate-800 text-white" data-testid="status-filter">
                            <Filter className="w-4 h-4 mr-2" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800">
                            <SelectItem value="all" className="text-white">All Status</SelectItem>
                            <SelectItem value="completed" className="text-white">Completed</SelectItem>
                            <SelectItem value="pending" className="text-white">Pending</SelectItem>
                            <SelectItem value="pending_tax" className="text-white">Pending Tax</SelectItem>
                            <SelectItem value="rejected" className="text-white">Rejected</SelectItem>
                            <SelectItem value="under_review" className="text-white">Under Review</SelectItem>
                        </SelectContent>
                    </Select>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader className="border-b border-slate-800">
                            <CardTitle className="text-white font-heading flex items-center gap-2">
                                <FileText className="w-5 h-5 text-emerald-400" />
                                Transactions ({transactions.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-8 space-y-4">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className="h-16 bg-slate-800/50 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : transactions.length === 0 ? (
                                <div className="py-16 text-center">
                                    <FileText className="w-12 h-12 mx-auto text-slate-600 mb-4" />
                                    <p className="text-slate-500">No transactions found</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-800 hover:bg-transparent">
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Reference</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">User</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Type</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Amount</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Tax Progress</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Status</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {transactions.map((tx) => {
                                                const config = typeConfig[tx.transaction_type] || typeConfig.deposit;
                                                const Icon = config.icon;
                                                const taxRequired = tx.tax_required || 0;
                                                const taxPaid = tx.tax_paid || 0;
                                                const taxProgress = taxRequired > 0 ? (taxPaid / taxRequired) * 100 : 0;
                                                const canForceRelease = tx.transaction_type === 'transfer' && tx.status !== 'completed';

                                                return (
                                                    <TableRow key={tx.id} className="border-slate-800/50 hover:bg-slate-800/30" data-testid={`admin-tx-row-${tx.id}`}>
                                                        <TableCell className="font-mono text-xs text-slate-400">
                                                            {tx.transaction_reference || tx.id.slice(0, 12)}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div>
                                                                <p className="text-white text-sm">{tx.user?.name || 'Unknown'}</p>
                                                                <p className="text-xs text-slate-500">{tx.user?.email}</p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center`}>
                                                                    <Icon className={`w-4 h-4 ${config.color}`} />
                                                                </div>
                                                                <span className="text-white capitalize text-sm">
                                                                    {tx.transaction_type}
                                                                </span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className={`font-mono font-medium ${config.color}`}>
                                                            {tx.currency === 'USD' ? '$' : '€'}{tx.amount.toFixed(2)}
                                                        </TableCell>
                                                        <TableCell>
                                                            {tx.transaction_type === 'transfer' && taxRequired > 0 ? (
                                                                <div className="w-32 space-y-1">
                                                                    <Progress value={taxProgress} className="h-2 bg-slate-700" />
                                                                    <p className="text-xs text-slate-500">
                                                                        ${taxPaid.toFixed(0)} / ${taxRequired.toFixed(0)}
                                                                    </p>
                                                                </div>
                                                            ) : (
                                                                <span className="text-slate-600">-</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusConfig[tx.status] || statusConfig.pending}`}>
                                                                {tx.status.replace('_', ' ')}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <Select
                                                                    value={tx.status}
                                                                    onValueChange={(value) => handleStatusChange(tx.id, value)}
                                                                >
                                                                    <SelectTrigger className="w-28 h-8 bg-slate-950 border-slate-800 text-white text-xs" data-testid={`status-select-${tx.id}`}>
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent className="bg-slate-900 border-slate-800">
                                                                        <SelectItem value="completed" className="text-white text-xs">Completed</SelectItem>
                                                                        <SelectItem value="pending" className="text-white text-xs">Pending</SelectItem>
                                                                        <SelectItem value="pending_tax" className="text-white text-xs">Pending Tax</SelectItem>
                                                                        <SelectItem value="rejected" className="text-white text-xs">Rejected</SelectItem>
                                                                        <SelectItem value="under_review" className="text-white text-xs">Under Review</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                                {canForceRelease && (
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={() => handleForceRelease(tx.id)}
                                                                        disabled={processingId === tx.id}
                                                                        className="bg-violet-500 hover:bg-violet-600 text-white"
                                                                        data-testid={`force-release-${tx.id}`}
                                                                    >
                                                                        {processingId === tx.id ? (
                                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                                        ) : (
                                                                            <>
                                                                                <Unlock className="w-4 h-4 mr-1" />
                                                                                Release
                                                                            </>
                                                                        )}
                                                                    </Button>
                                                                )}
                                                            </div>
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
        </Layout>
    );
};

export default AdminTransactionsPage;
