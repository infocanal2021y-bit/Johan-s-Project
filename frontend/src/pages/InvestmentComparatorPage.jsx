import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { TrendingUp, TrendingDown, Scale, Trophy, Target, Zap } from 'lucide-react';

// Historical performance data (simulated but realistic)
const ASSETS = {
    BTC: { name: 'Bitcoin', symbol: 'BTC', icon: '₿', color: 'orange', 
           returns: { '1Y': 156, '3Y': 890, '5Y': 2400, '10Y': 45000 } },
    ETH: { name: 'Ethereum', symbol: 'ETH', icon: 'Ξ', color: 'blue',
           returns: { '1Y': 98, '3Y': 650, '5Y': 1800, '10Y': 12000 } },
    GOLD: { name: 'Oro', symbol: 'GOLD', icon: '🥇', color: 'yellow',
            returns: { '1Y': 12, '3Y': 35, '5Y': 65, '10Y': 120 } },
    SP500: { name: 'S&P 500', symbol: 'SP500', icon: '📈', color: 'green',
             returns: { '1Y': 24, '3Y': 45, '5Y': 85, '10Y': 180 } },
    NASDAQ: { name: 'NASDAQ', symbol: 'NASDAQ', icon: '💹', color: 'cyan',
              returns: { '1Y': 32, '3Y': 65, '5Y': 140, '10Y': 350 } },
    OIL: { name: 'Petróleo', symbol: 'OIL', icon: '🛢️', color: 'slate',
           returns: { '1Y': -5, '3Y': 25, '5Y': 15, '10Y': 45 } },
    SILVER: { name: 'Plata', symbol: 'SILVER', icon: '🥈', color: 'gray',
              returns: { '1Y': 8, '3Y': 28, '5Y': 55, '10Y': 95 } },
    REAL_ESTATE: { name: 'Bienes Raíces', symbol: 'RE', icon: '🏠', color: 'emerald',
                   returns: { '1Y': 6, '3Y': 22, '5Y': 45, '10Y': 110 } },
};

const PRESET_COMPARISONS = [
    { asset1: 'BTC', asset2: 'GOLD', title: 'Bitcoin vs Oro', description: 'Activo digital vs refugio tradicional' },
    { asset1: 'BTC', asset2: 'SP500', title: 'Bitcoin vs S&P 500', description: 'Cripto vs mercado de acciones' },
    { asset1: 'ETH', asset2: 'BTC', title: 'Ethereum vs Bitcoin', description: 'Las dos mayores criptomonedas' },
    { asset1: 'GOLD', asset2: 'SP500', title: 'Oro vs Acciones', description: 'Refugio seguro vs crecimiento' },
    { asset1: 'BTC', asset2: 'NASDAQ', title: 'Bitcoin vs NASDAQ', description: 'Cripto vs tecnología' },
    { asset1: 'OIL', asset2: 'GOLD', title: 'Petróleo vs Oro', description: 'Commodities tradicionales' },
];

export const InvestmentComparatorPage = () => {
    const [asset1, setAsset1] = useState('BTC');
    const [asset2, setAsset2] = useState('GOLD');
    const [period, setPeriod] = useState('5Y');

    const asset1Data = ASSETS[asset1];
    const asset2Data = ASSETS[asset2];
    const return1 = asset1Data.returns[period];
    const return2 = asset2Data.returns[period];
    const winner = return1 > return2 ? asset1 : asset2;
    const difference = Math.abs(return1 - return2);

    const getColorClass = (color) => {
        const colors = {
            orange: 'text-orange-400 bg-orange-500/20 border-orange-500/30',
            blue: 'text-blue-400 bg-blue-500/20 border-blue-500/30',
            yellow: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
            green: 'text-green-400 bg-green-500/20 border-green-500/30',
            cyan: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30',
            slate: 'text-slate-400 bg-slate-500/20 border-slate-500/30',
            gray: 'text-gray-400 bg-gray-500/20 border-gray-500/30',
            emerald: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
        };
        return colors[color] || colors.blue;
    };

    const calculateInvestmentGrowth = (initialAmount, returnPercent) => {
        return initialAmount * (1 + returnPercent / 100);
    };

    const investmentAmount = 10000;
    const growth1 = calculateInvestmentGrowth(investmentAmount, return1);
    const growth2 = calculateInvestmentGrowth(investmentAmount, return2);

    return (
        <Layout>
            <div className="space-y-6" data-testid="investment-comparator-page">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl text-white flex items-center gap-3" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                        <Scale className="w-8 h-8 text-emerald-400" />
                        Comparador de Inversiones
                    </h1>
                    <p className="text-slate-500 mt-1 font-light">
                        Compara el rendimiento histórico de diferentes activos (datos informativos)
                    </p>
                </motion.div>

                {/* Quick Comparisons */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
                >
                    {PRESET_COMPARISONS.map((comparison, index) => (
                        <button
                            key={index}
                            onClick={() => {
                                setAsset1(comparison.asset1);
                                setAsset2(comparison.asset2);
                            }}
                            className={`p-3 rounded-lg border text-left transition-all ${
                                asset1 === comparison.asset1 && asset2 === comparison.asset2
                                    ? 'bg-emerald-500/20 border-emerald-500/50'
                                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                            }`}
                        >
                            <p className="text-white text-sm font-medium">{comparison.title}</p>
                            <p className="text-slate-500 text-xs mt-1">{comparison.description}</p>
                        </button>
                    ))}
                </motion.div>

                {/* Comparison Selector */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardContent className="p-6">
                            <div className="flex flex-wrap items-center gap-4">
                                <div className="flex-1 min-w-[200px]">
                                    <label className="text-sm text-slate-400 mb-2 block">Activo 1</label>
                                    <Select value={asset1} onValueChange={setAsset1}>
                                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-800 border-slate-700">
                                            {Object.entries(ASSETS).map(([key, asset]) => (
                                                <SelectItem key={key} value={key} className="text-white hover:bg-slate-700">
                                                    {asset.icon} {asset.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-center">
                                    <span className="text-2xl text-slate-500">VS</span>
                                </div>

                                <div className="flex-1 min-w-[200px]">
                                    <label className="text-sm text-slate-400 mb-2 block">Activo 2</label>
                                    <Select value={asset2} onValueChange={setAsset2}>
                                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-800 border-slate-700">
                                            {Object.entries(ASSETS).map(([key, asset]) => (
                                                <SelectItem key={key} value={key} className="text-white hover:bg-slate-700">
                                                    {asset.icon} {asset.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex-1 min-w-[150px]">
                                    <label className="text-sm text-slate-400 mb-2 block">Período</label>
                                    <Select value={period} onValueChange={setPeriod}>
                                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-800 border-slate-700">
                                            <SelectItem value="1Y" className="text-white hover:bg-slate-700">1 Año</SelectItem>
                                            <SelectItem value="3Y" className="text-white hover:bg-slate-700">3 Años</SelectItem>
                                            <SelectItem value="5Y" className="text-white hover:bg-slate-700">5 Años</SelectItem>
                                            <SelectItem value="10Y" className="text-white hover:bg-slate-700">10 Años</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Winner Banner */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                >
                    <Card className={`border-2 ${getColorClass(ASSETS[winner].color)}`}>
                        <CardContent className="p-6 text-center">
                            <Trophy className={`w-12 h-12 mx-auto mb-3 ${getColorClass(ASSETS[winner].color).split(' ')[0]}`} />
                            <h2 className="text-2xl text-white" style={{ fontWeight: 700 }}>
                                {ASSETS[winner].icon} {ASSETS[winner].name} Gana
                            </h2>
                            <p className="text-slate-400 mt-2">
                                Con un rendimiento de <span className="text-emerald-400 font-bold">+{ASSETS[winner].returns[period]}%</span> en {period === '1Y' ? '1 año' : period === '3Y' ? '3 años' : period === '5Y' ? '5 años' : '10 años'}
                            </p>
                            <p className="text-slate-500 text-sm mt-1">
                                Diferencia: +{difference.toLocaleString()}% sobre {ASSETS[winner === asset1 ? asset2 : asset1].name}
                            </p>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Comparison Cards */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6"
                >
                    {/* Asset 1 */}
                    <Card className={`border ${getColorClass(asset1Data.color)}`}>
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-3" style={{ fontWeight: 700 }}>
                                <span className="text-3xl">{asset1Data.icon}</span>
                                {asset1Data.name}
                                {winner === asset1 && <Trophy className="w-5 h-5 text-yellow-400" />}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <p className="text-slate-400 text-sm">Rendimiento ({period === '1Y' ? '1 año' : period === '3Y' ? '3 años' : period === '5Y' ? '5 años' : '10 años'})</p>
                                <p className={`text-4xl ${return1 >= 0 ? 'text-emerald-400' : 'text-red-400'}`} style={{ fontWeight: 700 }}>
                                    {return1 >= 0 ? '+' : ''}{return1.toLocaleString()}%
                                </p>
                            </div>
                            <div className="p-4 rounded-lg bg-slate-800/50">
                                <p className="text-slate-400 text-sm">Si hubieras invertido $10,000</p>
                                <p className="text-2xl text-white mt-1" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                    ${growth1.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </p>
                                <p className="text-emerald-400 text-sm">
                                    +${(growth1 - investmentAmount).toLocaleString(undefined, { maximumFractionDigits: 0 })} ganancia
                                </p>
                            </div>
                            {/* Mini chart simulation */}
                            <div className="h-20 flex items-end gap-1">
                                {[...Array(12)].map((_, i) => {
                                    const height = 20 + Math.random() * 60 + (i / 12) * (return1 > 0 ? 20 : -10);
                                    return (
                                        <motion.div
                                            key={i}
                                            initial={{ height: 0 }}
                                            animate={{ height: `${Math.max(10, Math.min(100, height))}%` }}
                                            transition={{ delay: 0.3 + i * 0.05 }}
                                            className={`flex-1 rounded-t ${return1 >= 0 ? 'bg-emerald-500/50' : 'bg-red-500/50'}`}
                                        />
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Asset 2 */}
                    <Card className={`border ${getColorClass(asset2Data.color)}`}>
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-3" style={{ fontWeight: 700 }}>
                                <span className="text-3xl">{asset2Data.icon}</span>
                                {asset2Data.name}
                                {winner === asset2 && <Trophy className="w-5 h-5 text-yellow-400" />}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <p className="text-slate-400 text-sm">Rendimiento ({period === '1Y' ? '1 año' : period === '3Y' ? '3 años' : period === '5Y' ? '5 años' : '10 años'})</p>
                                <p className={`text-4xl ${return2 >= 0 ? 'text-emerald-400' : 'text-red-400'}`} style={{ fontWeight: 700 }}>
                                    {return2 >= 0 ? '+' : ''}{return2.toLocaleString()}%
                                </p>
                            </div>
                            <div className="p-4 rounded-lg bg-slate-800/50">
                                <p className="text-slate-400 text-sm">Si hubieras invertido $10,000</p>
                                <p className="text-2xl text-white mt-1" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                    ${growth2.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </p>
                                <p className={`text-sm ${growth2 - investmentAmount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {growth2 - investmentAmount >= 0 ? '+' : ''}${(growth2 - investmentAmount).toLocaleString(undefined, { maximumFractionDigits: 0 })} {growth2 - investmentAmount >= 0 ? 'ganancia' : 'pérdida'}
                                </p>
                            </div>
                            {/* Mini chart simulation */}
                            <div className="h-20 flex items-end gap-1">
                                {[...Array(12)].map((_, i) => {
                                    const height = 20 + Math.random() * 60 + (i / 12) * (return2 > 0 ? 20 : -10);
                                    return (
                                        <motion.div
                                            key={i}
                                            initial={{ height: 0 }}
                                            animate={{ height: `${Math.max(10, Math.min(100, height))}%` }}
                                            transition={{ delay: 0.3 + i * 0.05 }}
                                            className={`flex-1 rounded-t ${return2 >= 0 ? 'bg-emerald-500/50' : 'bg-red-500/50'}`}
                                        />
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* All Periods Comparison */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white" style={{ fontWeight: 700 }}>
                                Comparación por Períodos
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-800">
                                            <th className="text-left py-3 px-4 text-slate-400 font-medium">Período</th>
                                            <th className="text-right py-3 px-4 text-slate-400 font-medium">{asset1Data.icon} {asset1Data.name}</th>
                                            <th className="text-right py-3 px-4 text-slate-400 font-medium">{asset2Data.icon} {asset2Data.name}</th>
                                            <th className="text-center py-3 px-4 text-slate-400 font-medium">Ganador</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {['1Y', '3Y', '5Y', '10Y'].map((p) => {
                                            const r1 = asset1Data.returns[p];
                                            const r2 = asset2Data.returns[p];
                                            const periodWinner = r1 > r2 ? asset1 : asset2;
                                            
                                            return (
                                                <tr key={p} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                                                    <td className="py-4 px-4 text-white">
                                                        {p === '1Y' ? '1 Año' : p === '3Y' ? '3 Años' : p === '5Y' ? '5 Años' : '10 Años'}
                                                    </td>
                                                    <td className={`py-4 px-4 text-right font-medium ${r1 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {r1 >= 0 ? '+' : ''}{r1.toLocaleString()}%
                                                    </td>
                                                    <td className={`py-4 px-4 text-right font-medium ${r2 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {r2 >= 0 ? '+' : ''}{r2.toLocaleString()}%
                                                    </td>
                                                    <td className="py-4 px-4 text-center">
                                                        <span className={`px-3 py-1 rounded-full text-sm ${getColorClass(ASSETS[periodWinner].color)}`}>
                                                            {ASSETS[periodWinner].icon} {ASSETS[periodWinner].symbol}
                                                        </span>
                                                    </td>
                                                </tr>
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

export default InvestmentComparatorPage;
