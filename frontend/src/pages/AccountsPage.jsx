import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { accountsAPI } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Wallet, PiggyBank, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { toast } from 'sonner';

export const AccountsPage = () => {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currency, setCurrency] = useState('USD');

    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const response = await accountsAPI.getAll();
                setAccounts(response.data);
            } catch (error) {
                toast.error('Failed to load accounts');
            } finally {
                setLoading(false);
            }
        };
        fetchAccounts();
    }, []);

    const formatAmount = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
        }).format(amount);
    };

    const getBalance = (account) => {
        return currency === 'USD' ? account.balance_usd : account.balance_eur;
    };

    const accountIcons = {
        checking: Wallet,
        savings: PiggyBank,
    };

    if (loading) {
        return (
            <Layout>
                <div className="max-w-7xl mx-auto space-y-8">
                    <div className="h-8 w-48 bg-slate-800 rounded animate-pulse" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {[1, 2].map((i) => (
                            <div key={i} className="h-64 bg-slate-800 rounded-xl animate-pulse" />
                        ))}
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="accounts-page">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                    <div>
                        <h1 className="text-3xl font-heading font-bold text-white">Your Accounts</h1>
                        <p className="text-slate-500 mt-1">Manage your checking and savings</p>
                    </div>
                    <Select value={currency} onValueChange={setCurrency}>
                        <SelectTrigger className="w-24 bg-slate-900 border-slate-800 text-white" data-testid="currency-selector">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800">
                            <SelectItem value="USD" className="text-white">USD</SelectItem>
                            <SelectItem value="EUR" className="text-white">EUR</SelectItem>
                        </SelectContent>
                    </Select>
                </motion.div>

                {/* Account Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {accounts.map((account, index) => {
                        const Icon = accountIcons[account.account_type] || Wallet;
                        const isChecking = account.account_type === 'checking';

                        return (
                            <motion.div
                                key={account.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                            >
                                <Card className="relative overflow-hidden bg-slate-900/70 backdrop-blur-xl border-slate-800 tracing-beam" data-testid={`account-card-${account.account_type}`}>
                                    {/* Background image overlay */}
                                    <div 
                                        className="absolute inset-0 opacity-10 bg-cover bg-center"
                                        style={{
                                            backgroundImage: isChecking 
                                                ? 'url(https://images.unsplash.com/photo-1762009365851-c5b5b1aae3b9?w=800)'
                                                : 'url(https://images.pexels.com/photos/28428591/pexels-photo-28428591.jpeg?w=800)'
                                        }}
                                    />
                                    
                                    <CardHeader className="relative">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                                    isChecking ? 'bg-cyan-500/20' : 'bg-emerald-500/20'
                                                }`}>
                                                    <Icon className={`w-6 h-6 ${isChecking ? 'text-cyan-400' : 'text-emerald-400'}`} />
                                                </div>
                                                <div>
                                                    <CardTitle className="text-xl font-heading text-white capitalize">
                                                        {account.account_type} Account
                                                    </CardTitle>
                                                    <p className="text-xs text-slate-500 font-mono mt-1">
                                                        {account.id.slice(0, 8)}...{account.id.slice(-4)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    
                                    <CardContent className="relative space-y-6">
                                        <div>
                                            <p className="text-sm text-slate-500 mb-1">Current Balance</p>
                                            <p className="text-4xl font-mono font-bold text-white">
                                                {formatAmount(getBalance(account))}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 rounded-lg bg-slate-800/50">
                                                <p className="text-xs text-slate-500 mb-1">USD Balance</p>
                                                <p className="text-lg font-mono text-white">
                                                    ${account.balance_usd.toFixed(2)}
                                                </p>
                                            </div>
                                            <div className="p-4 rounded-lg bg-slate-800/50">
                                                <p className="text-xs text-slate-500 mb-1">EUR Balance</p>
                                                <p className="text-lg font-mono text-white">
                                                    €{account.balance_eur.toFixed(2)}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                                isChecking 
                                                    ? 'bg-cyan-500/20 text-cyan-400' 
                                                    : 'bg-emerald-500/20 text-emerald-400'
                                            }`}>
                                                {isChecking ? 'Everyday Spending' : 'Long-term Savings'}
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </Layout>
    );
};

export default AccountsPage;
