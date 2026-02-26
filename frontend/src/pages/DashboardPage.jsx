import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { BalanceCard } from '../components/dashboard/BalanceCard';
import { RecentTransactions } from '../components/dashboard/RecentTransactions';
import { accountsAPI, transactionsAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export const DashboardPage = () => {
    const { user } = useAuth();
    const [summary, setSummary] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currency, setCurrency] = useState('USD');

    const fetchData = async () => {
        try {
            setLoading(true);
            const [summaryRes, txRes] = await Promise.all([
                accountsAPI.getSummary(),
                transactionsAPI.getAll({ limit: 10 }),
            ]);
            setSummary(summaryRes.data);
            setTransactions(txRes.data);
        } catch (error) {
            toast.error('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const getBalanceForCurrency = (balanceObj) => {
        if (!balanceObj) return 0;
        return currency === 'USD' ? balanceObj.usd : balanceObj.eur;
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="dashboard-page">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                    <div>
                        <h1 className="text-3xl font-heading font-bold text-white">
                            Welcome back, {user?.name?.split(' ')[0]}
                        </h1>
                        <p className="text-slate-500 mt-1">Here's your financial overview</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Select value={currency} onValueChange={setCurrency}>
                            <SelectTrigger className="w-24 bg-slate-900 border-slate-800 text-white" data-testid="currency-selector">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800">
                                <SelectItem value="USD" className="text-white">USD</SelectItem>
                                <SelectItem value="EUR" className="text-white">EUR</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={fetchData}
                            disabled={loading}
                            className="border-slate-800 hover:bg-slate-800"
                            data-testid="refresh-btn"
                        >
                            <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </motion.div>

                {/* Balance Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <BalanceCard
                        title="Total Balance"
                        amount={getBalanceForCurrency(summary?.total)}
                        currency={currency}
                        type="total"
                        delay={0}
                    />
                    <BalanceCard
                        title="Available Balance"
                        amount={getBalanceForCurrency(summary?.available)}
                        currency={currency}
                        type="available"
                        delay={0.1}
                    />
                    <BalanceCard
                        title="Invested (Savings)"
                        amount={getBalanceForCurrency(summary?.invested)}
                        currency={currency}
                        type="invested"
                        delay={0.2}
                    />
                </div>

                {/* Recent Transactions */}
                <RecentTransactions transactions={transactions} loading={loading} />
            </div>
        </Layout>
    );
};

export default DashboardPage;
