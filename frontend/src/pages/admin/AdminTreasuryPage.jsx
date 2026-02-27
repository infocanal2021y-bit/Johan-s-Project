import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Vault, DollarSign, Euro, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

export const AdminTreasuryPage = () => {
    const [treasury, setTreasury] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchTreasury = async () => {
        try {
            setLoading(true);
            const response = await adminAPI.getTreasury();
            setTreasury(response.data);
        } catch (error) {
            toast.error('Failed to load treasury');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTreasury();
    }, []);

    const formatAmount = (amount) => {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount || 0);
    };

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-8" data-testid="admin-treasury-page">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between"
                >
                    <div>
                        <h1 className="text-3xl font-heading font-bold text-white">Government Treasury</h1>
                        <p className="text-slate-500 mt-1">View collected tax payments</p>
                    </div>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={fetchTreasury}
                        disabled={loading}
                        className="border-slate-800 hover:bg-slate-800"
                    >
                        <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800 overflow-hidden">
                        {/* Header with icon */}
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-cyan-500/10" />
                            <CardHeader className="relative">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                                        <Vault className="w-8 h-8 text-emerald-400" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-2xl font-heading text-white">
                                            Government Treasury
                                        </CardTitle>
                                        <p className="text-slate-400 mt-1">
                                            All tax payments collected from transfers
                                        </p>
                                    </div>
                                </div>
                            </CardHeader>
                        </div>

                        <CardContent className="p-6">
                            {loading ? (
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="h-32 bg-slate-800/50 rounded-xl animate-pulse" />
                                    <div className="h-32 bg-slate-800/50 rounded-xl animate-pulse" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* USD Balance */}
                                    <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                                <DollarSign className="w-5 h-5 text-emerald-400" />
                                            </div>
                                            <span className="text-slate-400 font-medium">USD Balance</span>
                                        </div>
                                        <p className="text-4xl font-mono font-bold text-white">
                                            ${formatAmount(treasury?.balance_usd)}
                                        </p>
                                        <p className="text-sm text-slate-500 mt-2">US Dollar</p>
                                    </div>

                                    {/* EUR Balance */}
                                    <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                                                <Euro className="w-5 h-5 text-cyan-400" />
                                            </div>
                                            <span className="text-slate-400 font-medium">EUR Balance</span>
                                        </div>
                                        <p className="text-4xl font-mono font-bold text-white">
                                            €{formatAmount(treasury?.balance_eur)}
                                        </p>
                                        <p className="text-sm text-slate-500 mt-2">Euro</p>
                                    </div>
                                </div>
                            )}

                            {/* Info */}
                            <div className="mt-6 p-4 rounded-lg bg-slate-800/30 border border-slate-700">
                                <p className="text-sm text-slate-400">
                                    <span className="text-emerald-400 font-medium">Note:</span> This account receives all tax payments 
                                    from user transfers. The standard tax rate is $4,850 per transfer.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </Layout>
    );
};

export default AdminTreasuryPage;
