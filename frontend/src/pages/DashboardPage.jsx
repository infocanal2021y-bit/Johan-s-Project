import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { BalanceCard } from '../components/dashboard/BalanceCard';
import { RecentTransactions } from '../components/dashboard/RecentTransactions';
import { TransactionChart } from '../components/dashboard/TransactionChart';
import { accountsAPI, transactionsAPI, kycAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { RefreshCw, AlertTriangle, BadgeCheck, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

export const DashboardPage = () => {
    const { user } = useAuth();
    const [summary, setSummary] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currency, setCurrency] = useState('USD');
    const [kycStatus, setKycStatus] = useState(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [summaryRes, txRes, kycRes] = await Promise.all([
                accountsAPI.getSummary(),
                transactionsAPI.getAll({ limit: 10 }),
                kycAPI.getStatus(),
            ]);
            setSummary(summaryRes.data);
            setTransactions(txRes.data);
            setKycStatus(kycRes.data);
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

    const getKYCBanner = () => {
        if (!kycStatus) return null;
        
        if (kycStatus.verification_status === 'unverified') {
            return (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-3"
                >
                    <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-amber-400 font-medium">Account Not Verified</p>
                        <p className="text-sm text-amber-400/70 mt-1">
                            Complete your identity verification to unlock higher transfer limits (up to €10,000/day).
                            Currently limited to €1,000 per transfer.
                        </p>
                    </div>
                    <Link to="/kyc">
                        <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black">
                            Verify Now
                        </Button>
                    </Link>
                </motion.div>
            );
        }
        
        if (kycStatus.verification_status === 'pending_verification') {
            return (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center gap-3"
                >
                    <AlertTriangle className="w-5 h-5 text-cyan-400" />
                    <p className="text-cyan-400">
                        <span className="font-medium">Verification Pending</span> - Your documents are being reviewed.
                    </p>
                </motion.div>
            );
        }
        
        if (kycStatus.verification_status === 'verified') {
            return (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3"
                >
                    <BadgeCheck className="w-5 h-5 text-emerald-400" />
                    <p className="text-emerald-400">
                        <span className="font-medium">Verified Account</span> - You have full access to all features.
                    </p>
                </motion.div>
            );
        }
        
        return null;
    };

    const getAccountStatusBanner = () => {
        if (user?.account_status === 'suspended') {
            return (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-3"
                >
                    <ShieldAlert className="w-5 h-5 text-red-400" />
                    <p className="text-red-400">
                        <span className="font-medium">Account Suspended</span> - Please contact support for assistance.
                    </p>
                </motion.div>
            );
        }
        
        if (user?.account_status === 'under_review') {
            return (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-3"
                >
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                    <p className="text-red-400">
                        <span className="font-medium">Account Under Review</span> - Transfers are temporarily disabled due to suspicious activity.
                    </p>
                </motion.div>
            );
        }
        
        return null;
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

                {/* Status Banners */}
                {getAccountStatusBanner()}
                {getKYCBanner()}

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

                {/* Transaction Chart */}
                <TransactionChart />

                {/* Recent Transactions */}
                <RecentTransactions transactions={transactions} loading={loading} />
            </div>
        </Layout>
    );
};

export default DashboardPage;
