import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { TrendingUp, TrendingDown, PieChart, Wallet, RefreshCw, Plus, Eye, EyeOff } from 'lucide-react';
import { Button } from '../components/ui/button';
import { OdometerValue } from '../components/dashboard/OdometerValue';
const INITIAL_PORTFOLIO = [
    { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', amount: 0.5, avgBuyPrice: 45000, currentPrice: 67234.50, icon: '₿', color: 'orange' },
    { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', amount: 5.2, avgBuyPrice: 2800, currentPrice: 3456.78, icon: 'Ξ', color: 'blue' },
    { id: 'solana', name: 'Solana', symbol: 'SOL', amount: 50, avgBuyPrice: 95, currentPrice: 142.56, icon: 'S', color: 'purple' },
    { id: 'cardano', name: 'Cardano', symbol: 'ADA', amount: 5000, avgBuyPrice: 0.35, currentPrice: 0.4567, icon: 'A', color: 'cyan' },
];

export const PortfolioPage = () => {
    const [portfolio, setPortfolio] = useState(INITIAL_PORTFOLIO);
    const [showValues, setShowValues] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(new Date());

    // Simulate price updates
    useEffect(() => {
        const interval = setInterval(() => {
            setPortfolio(prevPortfolio =>
                prevPortfolio.map(asset => ({
                    ...asset,
                    currentPrice: asset.currentPrice * (1 + (Math.random() - 0.5) * 0.002)
                }))
            );
            setLastUpdate(new Date());
        }, 15000);

        return () => clearInterval(interval);
    }, []);

    const handleRefresh = () => {
        setIsRefreshing(true);
        setPortfolio(prevPortfolio =>
            prevPortfolio.map(asset => ({
                ...asset,
                currentPrice: asset.currentPrice * (1 + (Math.random() - 0.5) * 0.01)
            }))
        );
        setLastUpdate(new Date());
        setTimeout(() => setIsRefreshing(false), 500);
    };

    const calculateAssetValue = (asset) => asset.amount * asset.currentPrice;
    const calculateAssetCost = (asset) => asset.amount * asset.avgBuyPrice;
    const calculateAssetPnL = (asset) => calculateAssetValue(asset) - calculateAssetCost(asset);
    const calculateAssetPnLPercent = (asset) => ((calculateAssetPnL(asset) / calculateAssetCost(asset)) * 100);

    const totalValue = portfolio.reduce((sum, asset) => sum + calculateAssetValue(asset), 0);
    const totalCost = portfolio.reduce((sum, asset) => sum + calculateAssetCost(asset), 0);
    const totalPnL = totalValue - totalCost;
    const totalPnLPercent = (totalPnL / totalCost) * 100;

    const formatCurrency = (value) => {
        if (!showValues) return '••••••';
        return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
    };

    const formatPercent = (value) => {
        if (!showValues) return '••••';
        return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
    };

    const getColorClasses = (color) => {
        const colors = {
            orange: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
            blue: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
            purple: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
            cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
        };
        return colors[color] || colors.blue;
    };

    return (
        <Layout>
            <div className="space-y-6" data-testid="portfolio-page">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                    <div>
                        <h1 className="text-3xl text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                            Mi Portafolio
                        </h1>
                        <p className="text-slate-500 mt-1 font-light">
                            Seguimiento informativo de activos digitales
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowValues(!showValues)}
                            className="p-2 rounded-lg bg-slate-800/50 border border-slate-700 hover:bg-slate-700 transition-colors"
                        >
                            {showValues ? (
                                <EyeOff className="w-5 h-5 text-slate-400" />
                            ) : (
                                <Eye className="w-5 h-5 text-slate-400" />
                            )}
                        </button>
                        <button
                            onClick={handleRefresh}
                            className="p-2 rounded-lg bg-slate-800/50 border border-slate-700 hover:bg-slate-700 transition-colors"
                        >
                            <RefreshCw className={`w-5 h-5 text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </motion.div>

                {/* Total Value Card */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border-emerald-500/30">
                        <CardContent className="p-6">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div>
                                    <p className="text-sm text-emerald-400/70 flex items-center gap-2">
                                        <Wallet className="w-4 h-4" />
                                        Valor Total del Portafolio
                                    </p>
                                    <p className="text-4xl text-emerald-400 mt-2" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                        {formatCurrency(totalValue)}
                                    </p>
                                    <div className={`mt-2 flex items-center gap-2 ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {totalPnL >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                                        <span className="text-lg" style={{ fontWeight: 600 }}>
                                            {formatCurrency(Math.abs(totalPnL))} ({formatPercent(totalPnLPercent)})
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-slate-500 text-sm">Costo Total</p>
                                    <p className="text-white text-xl font-numbers" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                        <OdometerValue value={formatCurrency(totalCost)} staggerMs={35} />
                                    </p>
                                    <p className="text-xs text-slate-500 mt-2">
                                        Última actualización: {lastUpdate.toLocaleTimeString()}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Portfolio Distribution */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="grid grid-cols-1 md:grid-cols-4 gap-4"
                >
                    {portfolio.map((asset, index) => {
                        const value = calculateAssetValue(asset);
                        const percentage = (value / totalValue) * 100;
                        const colors = getColorClasses(asset.color);
                        const pnl = calculateAssetPnL(asset);
                        const pnlPercent = calculateAssetPnLPercent(asset);

                        return (
                            <motion.div
                                key={asset.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.2 + index * 0.05 }}
                            >
                                <Card className={`${colors.bg} ${colors.border} border`}>
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-8 h-8 rounded-full ${colors.bg} flex items-center justify-center`}>
                                                    <span className={`${colors.text} font-bold`}>{asset.icon}</span>
                                                </div>
                                                <div>
                                                    <p className="text-white font-medium text-sm">{asset.symbol}</p>
                                                    <p className="text-slate-500 text-xs">{percentage.toFixed(1)}%</p>
                                                </div>
                                            </div>
                                        </div>
                                        <p className={`${colors.text} text-lg`} style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                            {formatCurrency(value)}
                                        </p>
                                        <p className="text-slate-500 text-xs mt-1">
                                            {showValues ? `${asset.amount} ${asset.symbol}` : '•••• ' + asset.symbol}
                                        </p>
                                        <div className={`mt-2 text-xs ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {formatPercent(pnlPercent)}
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        );
                    })}
                </motion.div>

                {/* Assets Table */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2" style={{ fontWeight: 700 }}>
                                <PieChart className="w-5 h-5 text-emerald-400" />
                                Detalle de Activos
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-800">
                                            <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Activo</th>
                                            <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Cantidad</th>
                                            <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Precio Actual</th>
                                            <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Precio Compra</th>
                                            <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Valor</th>
                                            <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">P&L</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {portfolio.map((asset, index) => {
                                            const value = calculateAssetValue(asset);
                                            const pnl = calculateAssetPnL(asset);
                                            const pnlPercent = calculateAssetPnLPercent(asset);
                                            const colors = getColorClasses(asset.color);

                                            return (
                                                <motion.tr
                                                    key={asset.id}
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: 0.4 + index * 0.05 }}
                                                    className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                                                >
                                                    <td className="py-4 px-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-10 h-10 rounded-full ${colors.bg} flex items-center justify-center`}>
                                                                <span className={`${colors.text} font-bold text-lg`}>{asset.icon}</span>
                                                            </div>
                                                            <div>
                                                                <p className="text-white font-medium">{asset.name}</p>
                                                                <p className="text-slate-500 text-sm">{asset.symbol}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-4 text-right text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                        {showValues ? asset.amount : '••••'}
                                                    </td>
                                                    <td className="py-4 px-4 text-right text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                        {formatCurrency(asset.currentPrice)}
                                                    </td>
                                                    <td className="py-4 px-4 text-right text-slate-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                        {formatCurrency(asset.avgBuyPrice)}
                                                    </td>
                                                    <td className="py-4 px-4 text-right text-white font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                        {formatCurrency(value)}
                                                    </td>
                                                    <td className={`py-4 px-4 text-right font-medium ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                        <div>
                                                            {formatCurrency(Math.abs(pnl))}
                                                        </div>
                                                        <div className="text-xs">
                                                            {formatPercent(pnlPercent)}
                                                        </div>
                                                    </td>
                                                </motion.tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Disclaimer */}
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <p className="text-amber-400 text-sm">
                        <strong>⚠️ Aviso Importante:</strong> Los datos mostrados en esta plataforma relacionados con mercados financieros y criptomonedas son únicamente informativos. No constituyen asesoramiento financiero ni representan una invitación a invertir. La plataforma no está habilitada para realizar inversiones .
                    </p>
                </div>
            </div>
        </Layout>
    );
};

export default PortfolioPage;
