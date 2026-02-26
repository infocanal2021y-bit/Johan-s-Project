import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { FileText, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Filter } from 'lucide-react';
import { toast } from 'sonner';

export const AdminTransactionsPage = () => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');

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

    const typeConfig = {
        deposit: { icon: ArrowDownLeft, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
        withdraw: { icon: ArrowUpRight, color: 'text-red-400', bg: 'bg-red-500/20' },
        transfer: { icon: ArrowLeftRight, color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
    };

    const statusConfig = {
        completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
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
                        <SelectTrigger className="w-36 bg-slate-900 border-slate-800 text-white" data-testid="status-filter">
                            <Filter className="w-4 h-4 mr-2" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800">
                            <SelectItem value="all" className="text-white">All Status</SelectItem>
                            <SelectItem value="completed" className="text-white">Completed</SelectItem>
                            <SelectItem value="pending" className="text-white">Pending</SelectItem>
                            <SelectItem value="rejected" className="text-white">Rejected</SelectItem>
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
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Type</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Amount</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">User ID</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Status</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Date</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {transactions.map((tx) => {
                                                const config = typeConfig[tx.transaction_type] || typeConfig.deposit;
                                                const Icon = config.icon;

                                                return (
                                                    <TableRow key={tx.id} className="border-slate-800/50 hover:bg-slate-800/30" data-testid={`admin-tx-row-${tx.id}`}>
                                                        <TableCell>
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center`}>
                                                                    <Icon className={`w-5 h-5 ${config.color}`} />
                                                                </div>
                                                                <span className="font-medium text-white capitalize">
                                                                    {tx.transaction_type}
                                                                </span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className={`font-mono font-medium ${config.color}`}>
                                                            {tx.currency === 'USD' ? '$' : '€'}{tx.amount.toFixed(2)}
                                                        </TableCell>
                                                        <TableCell className="text-slate-400 font-mono text-xs">
                                                            {tx.user_id.slice(0, 8)}...
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusConfig[tx.status]}`}>
                                                                {tx.status}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-slate-500 text-sm">
                                                            {formatDate(tx.created_at)}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Select
                                                                value={tx.status}
                                                                onValueChange={(value) => handleStatusChange(tx.id, value)}
                                                            >
                                                                <SelectTrigger className="w-32 h-8 bg-slate-950 border-slate-800 text-white text-xs" data-testid={`status-select-${tx.id}`}>
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent className="bg-slate-900 border-slate-800">
                                                                    <SelectItem value="completed" className="text-white text-xs">Completed</SelectItem>
                                                                    <SelectItem value="pending" className="text-white text-xs">Pending</SelectItem>
                                                                    <SelectItem value="rejected" className="text-white text-xs">Rejected</SelectItem>
                                                                </SelectContent>
                                                            </Select>
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
