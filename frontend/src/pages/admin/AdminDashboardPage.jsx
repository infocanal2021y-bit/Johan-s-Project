import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Card, CardContent } from '../../components/ui/card';
import { Users, FileText, Clock, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

export const AdminDashboardPage = () => {
    const [stats, setStats] = useState({
        totalUsers: 0,
        totalTransactions: 0,
        pendingWithdrawals: 0,
        totalBalance: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const [usersRes, txRes, withdrawalsRes] = await Promise.all([
                    adminAPI.getUsers(),
                    adminAPI.getTransactions(),
                    adminAPI.getPendingWithdrawals(),
                ]);

                const users = usersRes.data;
                const totalBalance = users.reduce((sum, u) => sum + (u.total_balance_usd || 0), 0);

                setStats({
                    totalUsers: users.length,
                    totalTransactions: txRes.data.length,
                    pendingWithdrawals: withdrawalsRes.data.length,
                    totalBalance,
                });
            } catch (error) {
                toast.error('Failed to load admin stats');
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    const statCards = [
        { title: 'Total Users', value: stats.totalUsers, icon: Users, color: 'emerald' },
        { title: 'Total Transactions', value: stats.totalTransactions, icon: FileText, color: 'cyan' },
        { title: 'Pending Withdrawals', value: stats.pendingWithdrawals, icon: Clock, color: 'amber' },
        { title: 'Total Balance (USD)', value: `$${stats.totalBalance.toFixed(2)}`, icon: DollarSign, color: 'violet' },
    ];

    const colorClasses = {
        emerald: 'bg-emerald-500/20 text-emerald-400',
        cyan: 'bg-cyan-500/20 text-cyan-400',
        amber: 'bg-amber-500/20 text-amber-400',
        violet: 'bg-violet-500/20 text-violet-400',
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="admin-dashboard-page">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl font-heading font-bold text-white">Admin Dashboard</h1>
                    <p className="text-slate-500 mt-1">System overview and management</p>
                </motion.div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {statCards.map((stat, index) => (
                        <motion.div
                            key={stat.title}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                        >
                            <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-slate-500">{stat.title}</p>
                                            <p className="text-3xl font-heading font-bold text-white mt-2">
                                                {loading ? '...' : stat.value}
                                            </p>
                                        </div>
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClasses[stat.color]}`}>
                                            <stat.icon className="w-6 h-6" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            </div>
        </Layout>
    );
};

export default AdminDashboardPage;
