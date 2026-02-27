import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { 
    Bitcoin, 
    TrendingUp, 
    Clock, 
    CheckCircle, 
    XCircle,
    Users,
    BarChart3,
    Activity,
    Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
);

const CRYPTO_COLORS = {
    BTC: { bg: 'bg-orange-500/20', text: 'text-orange-400', chart: '#f97316' },
    ETH: { bg: 'bg-blue-500/20', text: 'text-blue-400', chart: '#3b82f6' },
    USDT: { bg: 'bg-green-500/20', text: 'text-green-400', chart: '#22c55e' },
    LTC: { bg: 'bg-slate-500/20', text: 'text-slate-300', chart: '#94a3b8' }
};

const CRYPTO_ICONS = {
    BTC: '₿',
    ETH: 'Ξ',
    USDT: '₮',
    LTC: 'Ł'
};

export const AdminCryptoStatsPage = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await adminAPI.getCryptoPaymentsStats();
                setStats(response.data);
            } catch (error) {
                toast.error('Failed to load crypto statistics');
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    if (loading) {
        return (
            <Layout>
                <div className="flex items-center justify-center h-96">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                </div>
            </Layout>
        );
    }

    // Chart data for trend
    const trendChartData = {
        labels: stats?.recent_trend?.slice(-14).map(d => {
            const date = new Date(d.date);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }) || [],
        datasets: [
            {
                label: 'Total Submissions',
                data: stats?.recent_trend?.slice(-14).map(d => d.count) || [],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.4,
            },
            {
                label: 'Approved',
                data: stats?.recent_trend?.slice(-14).map(d => d.approved) || [],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.4,
            }
        ]
    };

    // Doughnut chart for crypto distribution
    const cryptoDistributionData = {
        labels: Object.keys(stats?.by_crypto || {}),
        datasets: [{
            data: Object.values(stats?.by_crypto || {}).map(c => c.total),
            backgroundColor: Object.keys(stats?.by_crypto || {}).map(c => CRYPTO_COLORS[c]?.chart || '#64748b'),
            borderColor: '#1e293b',
            borderWidth: 2,
        }]
    };

    // Bar chart for approval rates by crypto
    const approvalRateData = {
        labels: Object.keys(stats?.by_crypto || {}),
        datasets: [{
            label: 'Approval Rate %',
            data: Object.values(stats?.by_crypto || {}).map(c => c.rate),
            backgroundColor: Object.keys(stats?.by_crypto || {}).map(c => CRYPTO_COLORS[c]?.chart || '#64748b'),
            borderRadius: 8,
        }]
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: '#94a3b8' }
            }
        },
        scales: {
            x: {
                ticks: { color: '#64748b' },
                grid: { color: '#334155' }
            },
            y: {
                ticks: { color: '#64748b' },
                grid: { color: '#334155' }
            }
        }
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="admin-crypto-stats-page">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl font-heading font-bold text-white flex items-center gap-3">
                        <BarChart3 className="w-8 h-8 text-emerald-400" />
                        Crypto Payment Analytics
                    </h1>
                    <p className="text-slate-500 mt-1">Comprehensive statistics and trends for cryptocurrency tax payments</p>
                </motion.div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-500">Total Payments</p>
                                        <p className="text-3xl font-heading font-bold text-white">{stats?.total_payments || 0}</p>
                                    </div>
                                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                        <Bitcoin className="w-6 h-6 text-emerald-400" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-500">Approval Rate</p>
                                        <p className="text-3xl font-heading font-bold text-emerald-400">{stats?.approval_rate || 0}%</p>
                                    </div>
                                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                        <TrendingUp className="w-6 h-6 text-emerald-400" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-500">Avg. Processing Time</p>
                                        <p className="text-3xl font-heading font-bold text-cyan-400">
                                            {stats?.avg_processing_time ? `${stats.avg_processing_time}h` : 'N/A'}
                                        </p>
                                    </div>
                                    <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                                        <Clock className="w-6 h-6 text-cyan-400" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-500">Pending Review</p>
                                        <p className="text-3xl font-heading font-bold text-amber-400">{stats?.by_status?.under_review || 0}</p>
                                    </div>
                                    <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                                        <Activity className="w-6 h-6 text-amber-400" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>

                {/* Status Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}>
                        <Card className="bg-emerald-500/10 border-emerald-500/30">
                            <CardContent className="p-4 flex items-center gap-4">
                                <CheckCircle className="w-8 h-8 text-emerald-400" />
                                <div>
                                    <p className="text-2xl font-bold text-emerald-400">{stats?.by_status?.approved || 0}</p>
                                    <p className="text-sm text-emerald-400/70">Approved</p>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 }}>
                        <Card className="bg-red-500/10 border-red-500/30">
                            <CardContent className="p-4 flex items-center gap-4">
                                <XCircle className="w-8 h-8 text-red-400" />
                                <div>
                                    <p className="text-2xl font-bold text-red-400">{stats?.by_status?.rejected || 0}</p>
                                    <p className="text-sm text-red-400/70">Rejected</p>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}>
                        <Card className="bg-amber-500/10 border-amber-500/30">
                            <CardContent className="p-4 flex items-center gap-4">
                                <Clock className="w-8 h-8 text-amber-400" />
                                <div>
                                    <p className="text-2xl font-bold text-amber-400">{stats?.by_status?.under_review || 0}</p>
                                    <p className="text-sm text-amber-400/70">Under Review</p>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Trend Chart */}
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        transition={{ delay: 0.45 }}
                        className="lg:col-span-2"
                    >
                        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white font-heading flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                                    Payment Trend (Last 14 Days)
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-64">
                                    <Line data={trendChartData} options={chartOptions} />
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Crypto Distribution */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white font-heading flex items-center gap-2">
                                    <Bitcoin className="w-5 h-5 text-orange-400" />
                                    By Cryptocurrency
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-64 flex items-center justify-center">
                                    {Object.keys(stats?.by_crypto || {}).length > 0 ? (
                                        <Doughnut 
                                            data={cryptoDistributionData} 
                                            options={{
                                                ...chartOptions,
                                                plugins: {
                                                    ...chartOptions.plugins,
                                                    legend: {
                                                        position: 'bottom',
                                                        labels: { color: '#94a3b8', padding: 15 }
                                                    }
                                                }
                                            }} 
                                        />
                                    ) : (
                                        <p className="text-slate-500">No data yet</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>

                {/* Crypto Stats Cards + Top Users */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Crypto Stats Cards */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
                        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white font-heading">Cryptocurrency Breakdown</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {Object.entries(stats?.by_crypto || {}).map(([crypto, data]) => (
                                    <div 
                                        key={crypto} 
                                        className={`p-4 rounded-lg ${CRYPTO_COLORS[crypto]?.bg || 'bg-slate-800'} flex items-center justify-between`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className={`text-3xl ${CRYPTO_COLORS[crypto]?.text}`}>
                                                {CRYPTO_ICONS[crypto]}
                                            </span>
                                            <div>
                                                <p className="font-medium text-white">{crypto}</p>
                                                <p className="text-sm text-slate-400">{data.total} payments</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-xl font-bold ${CRYPTO_COLORS[crypto]?.text}`}>
                                                {data.rate}%
                                            </p>
                                            <p className="text-xs text-slate-500">approval rate</p>
                                        </div>
                                    </div>
                                ))}
                                {Object.keys(stats?.by_crypto || {}).length === 0 && (
                                    <p className="text-center text-slate-500 py-8">No payments recorded yet</p>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Top Users */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white font-heading flex items-center gap-2">
                                    <Users className="w-5 h-5 text-cyan-400" />
                                    Top Users by Payments
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {stats?.top_users?.map((user, index) => (
                                        <div 
                                            key={index}
                                            className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                                    index === 0 ? 'bg-amber-500/20 text-amber-400' :
                                                    index === 1 ? 'bg-slate-400/20 text-slate-300' :
                                                    index === 2 ? 'bg-orange-700/20 text-orange-600' :
                                                    'bg-slate-700/50 text-slate-500'
                                                }`}>
                                                    {index + 1}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-white">{user.name}</p>
                                                    <p className="text-xs text-slate-500">{user.email}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-lg font-bold text-emerald-400">{user.payment_count}</p>
                                                <p className="text-xs text-slate-500">payments</p>
                                            </div>
                                        </div>
                                    ))}
                                    {(!stats?.top_users || stats.top_users.length === 0) && (
                                        <p className="text-center text-slate-500 py-8">No users yet</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>

                {/* Approval Rate by Crypto Chart */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}>
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white font-heading">Approval Rate by Cryptocurrency</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-64">
                                <Bar 
                                    data={approvalRateData} 
                                    options={{
                                        ...chartOptions,
                                        plugins: {
                                            ...chartOptions.plugins,
                                            legend: { display: false }
                                        },
                                        scales: {
                                            ...chartOptions.scales,
                                            y: {
                                                ...chartOptions.scales.y,
                                                max: 100,
                                                ticks: {
                                                    ...chartOptions.scales.y.ticks,
                                                    callback: (value) => `${value}%`
                                                }
                                            }
                                        }
                                    }} 
                                />
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </Layout>
    );
};

export default AdminCryptoStatsPage;
