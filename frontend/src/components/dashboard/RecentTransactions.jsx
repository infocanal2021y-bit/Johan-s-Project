import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { TransactionRow } from './TransactionRow';
import { Table, TableHeader, TableBody, TableHead, TableRow } from '../ui/table';
import { FileText } from 'lucide-react';

export const RecentTransactions = ({ transactions = [], loading = false }) => {
    if (loading) {
        return (
            <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                        Recent Transactions
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-slate-800 animate-pulse" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-slate-800 rounded animate-pulse w-1/3" />
                                    <div className="h-3 bg-slate-800 rounded animate-pulse w-1/4" />
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
        >
            <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                <CardHeader className="border-b border-slate-800">
                    <CardTitle className="text-white flex items-center gap-2" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                        <FileText className="w-5 h-5 text-emerald-400" />
                        Recent Transactions
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {transactions.length === 0 ? (
                        <div className="py-12 text-center">
                            <FileText className="w-12 h-12 mx-auto text-slate-600 mb-4" />
                            <p className="text-slate-500 font-normal">No transactions yet</p>
                            <p className="text-sm text-slate-600 mt-1 font-light">
                                Make a deposit to get started
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-slate-800 hover:bg-transparent">
                                        <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">
                                            Transaction
                                        </TableHead>
                                        <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">
                                            Amount
                                        </TableHead>
                                        <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">
                                            Status
                                        </TableHead>
                                        <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium text-right">
                                            Date
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.map((tx, index) => (
                                        <TransactionRow key={tx.id} transaction={tx} index={index} />
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    );
};
