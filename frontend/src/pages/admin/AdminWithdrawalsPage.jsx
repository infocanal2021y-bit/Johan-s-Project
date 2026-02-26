import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table';
import { Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export const AdminWithdrawalsPage = () => {
    const [withdrawals, setWithdrawals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);

    const fetchWithdrawals = async () => {
        try {
            const response = await adminAPI.getPendingWithdrawals();
            setWithdrawals(response.data);
        } catch (error) {
            toast.error('Failed to load withdrawals');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWithdrawals();
    }, []);

    const handleApprove = async (transactionId) => {
        setProcessingId(transactionId);
        try {
            await adminAPI.approveWithdrawal(transactionId);
            toast.success('Withdrawal approved');
            fetchWithdrawals();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to approve withdrawal');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (transactionId) => {
        setProcessingId(transactionId);
        try {
            await adminAPI.rejectWithdrawal(transactionId);
            toast.success('Withdrawal rejected');
            fetchWithdrawals();
        } catch (error) {
            toast.error('Failed to reject withdrawal');
        } finally {
            setProcessingId(null);
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
            <div className="max-w-7xl mx-auto space-y-8" data-testid="admin-withdrawals-page">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl font-heading font-bold text-white">Pending Withdrawals</h1>
                    <p className="text-slate-500 mt-1">Review and process withdrawal requests</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader className="border-b border-slate-800">
                            <CardTitle className="text-white font-heading flex items-center gap-2">
                                <Clock className="w-5 h-5 text-amber-400" />
                                Awaiting Approval ({withdrawals.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-8 space-y-4">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="h-16 bg-slate-800/50 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : withdrawals.length === 0 ? (
                                <div className="py-16 text-center">
                                    <CheckCircle className="w-12 h-12 mx-auto text-emerald-400 mb-4" />
                                    <p className="text-slate-500">No pending withdrawals</p>
                                    <p className="text-sm text-slate-600 mt-1">All requests have been processed</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-800 hover:bg-transparent">
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">User</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Amount</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Description</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Requested</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {withdrawals.map((w) => (
                                                <TableRow key={w.id} className="border-slate-800/50 hover:bg-slate-800/30" data-testid={`withdrawal-row-${w.id}`}>
                                                    <TableCell>
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                                                                <span className="text-sm font-medium text-white">
                                                                    {w.user?.name?.charAt(0).toUpperCase() || '?'}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <p className="font-medium text-white">{w.user?.name || 'Unknown'}</p>
                                                                <p className="text-xs text-slate-500">{w.user?.email || ''}</p>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="font-mono font-medium text-red-400">
                                                        -{w.currency === 'USD' ? '$' : '€'}{w.amount.toFixed(2)}
                                                    </TableCell>
                                                    <TableCell className="text-slate-400 max-w-[200px] truncate">
                                                        {w.description || 'No description'}
                                                    </TableCell>
                                                    <TableCell className="text-slate-500 text-sm">
                                                        {formatDate(w.created_at)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleApprove(w.id)}
                                                                disabled={processingId === w.id}
                                                                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                                                                data-testid={`approve-btn-${w.id}`}
                                                            >
                                                                {processingId === w.id ? (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <CheckCircle className="w-4 h-4 mr-1" />
                                                                        Approve
                                                                    </>
                                                                )}
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleReject(w.id)}
                                                                disabled={processingId === w.id}
                                                                className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                                                                data-testid={`reject-btn-${w.id}`}
                                                            >
                                                                {processingId === w.id ? (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <XCircle className="w-4 h-4 mr-1" />
                                                                        Reject
                                                                    </>
                                                                )}
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
        </Layout>
    );
};

export default AdminWithdrawalsPage;
