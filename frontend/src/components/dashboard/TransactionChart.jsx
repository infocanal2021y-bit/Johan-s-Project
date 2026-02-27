import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { transactionsAPI } from '../../lib/api';
import { TrendingUp } from 'lucide-react';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

export const TransactionChart = () => {
    const [chartData, setChartData] = useState(null);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await transactionsAPI.getStats();
                const data = response.data;
                setStats(data);

                const labels = data.chart_data.map(d => {
                    const date = new Date(d.date);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                });

                setChartData({
                    labels,
                    datasets: [
                        {
                            label: 'Sent',
                            data: data.chart_data.map(d => d.sent),
                            borderColor: 'rgb(239, 68, 68)',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            fill: true,
                            tension: 0.4,
                        },
                        {
                            label: 'Received',
                            data: data.chart_data.map(d => d.received),
                            borderColor: 'rgb(16, 185, 129)',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            fill: true,
                            tension: 0.4,
                        },
                        {
                            label: 'Tax Paid',
                            data: data.chart_data.map(d => d.tax),
                            borderColor: 'rgb(251, 146, 60)',
                            backgroundColor: 'rgba(251, 146, 60, 0.1)',
                            fill: true,
                            tension: 0.4,
                        },
                    ],
                });
            } catch (error) {
                console.error('Failed to fetch stats');
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    color: '#94a3b8',
                    usePointStyle: true,
                    padding: 20,
                },
            },
            tooltip: {
                backgroundColor: '#1e293b',
                titleColor: '#fff',
                bodyColor: '#94a3b8',
                borderColor: '#334155',
                borderWidth: 1,
                padding: 12,
                callbacks: {
                    label: (context) => `${context.dataset.label}: $${context.parsed.y.toFixed(2)}`,
                },
            },
        },
        scales: {
            x: {
                grid: {
                    color: 'rgba(148, 163, 184, 0.1)',
                },
                ticks: {
                    color: '#64748b',
                    maxRotation: 45,
                    minRotation: 45,
                },
            },
            y: {
                grid: {
                    color: 'rgba(148, 163, 184, 0.1)',
                },
                ticks: {
                    color: '#64748b',
                    callback: (value) => `$${value}`,
                },
            },
        },
    };

    if (loading) {
        return (
            <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                <CardContent className="p-6">
                    <div className="h-[300px] flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
            <CardHeader className="border-b border-slate-800">
                <CardTitle className="text-white font-heading flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                    Transaction Activity (Last 30 Days)
                </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
                {/* Stats Summary */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="p-4 rounded-lg bg-slate-800/50">
                        <p className="text-xs text-slate-500">Total Sent</p>
                        <p className="text-xl font-mono font-bold text-red-400">
                            ${stats?.total_sent?.toFixed(2) || '0.00'}
                        </p>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-800/50">
                        <p className="text-xs text-slate-500">Total Received</p>
                        <p className="text-xl font-mono font-bold text-emerald-400">
                            ${stats?.total_received?.toFixed(2) || '0.00'}
                        </p>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-800/50">
                        <p className="text-xs text-slate-500">Tax Paid</p>
                        <p className="text-xl font-mono font-bold text-orange-400">
                            ${stats?.total_tax_paid?.toFixed(2) || '0.00'}
                        </p>
                    </div>
                </div>

                {/* Daily Limit */}
                {stats && (
                    <div className="mb-6 p-4 rounded-lg bg-slate-800/30 border border-slate-700">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-slate-400">Daily Transfer Limit</span>
                            <span className="text-sm text-slate-300">
                                €{stats.daily_used?.toFixed(2)} / €{stats.daily_limit?.toFixed(2)}
                            </span>
                        </div>
                        <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, (stats.daily_used / stats.daily_limit) * 100)}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Chart */}
                <div className="h-[250px]">
                    {chartData && <Line data={chartData} options={options} />}
                </div>
            </CardContent>
        </Card>
    );
};
