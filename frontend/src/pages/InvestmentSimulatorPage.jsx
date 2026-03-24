import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Button } from '../components/ui/button';
import { TrendingUp, Calculator, DollarSign, Calendar, PiggyBank, BarChart3 } from 'lucide-react';

const INVESTMENT_STRATEGIES = [
    { id: 'conservative', name: 'Conservador', monthlyReturn: 0.5, risk: 'Bajo', description: 'Inversiones estables con bajo riesgo' },
    { id: 'moderate', name: 'Moderado', monthlyReturn: 1.5, risk: 'Medio', description: 'Balance entre crecimiento y seguridad' },
    { id: 'aggressive', name: 'Agresivo', monthlyReturn: 3.5, risk: 'Alto', description: 'Mayor potencial de crecimiento con más riesgo' },
    { id: 'crypto', name: 'Cripto', monthlyReturn: 5, risk: 'Muy Alto', description: 'Inversión en criptomonedas (alta volatilidad)' },
];

export const InvestmentSimulatorPage = () => {
    const [initialAmount, setInitialAmount] = useState('10000');
    const [monthlyContribution, setMonthlyContribution] = useState('500');
    const [strategy, setStrategy] = useState('moderate');
    const [showResults, setShowResults] = useState(false);

    const selectedStrategy = INVESTMENT_STRATEGIES.find(s => s.id === strategy);

    const calculateGrowth = (months) => {
        const initial = parseFloat(initialAmount) || 0;
        const monthly = parseFloat(monthlyContribution) || 0;
        const rate = selectedStrategy.monthlyReturn / 100;
        
        let total = initial;
        for (let i = 0; i < months; i++) {
            total = total * (1 + rate) + monthly;
        }
        return total;
    };

    const calculateTotalContributed = (months) => {
        const initial = parseFloat(initialAmount) || 0;
        const monthly = parseFloat(monthlyContribution) || 0;
        return initial + (monthly * months);
    };

    const formatCurrency = (value) => {
        return value.toLocaleString(undefined, { 
            style: 'currency', 
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2 
        });
    };

    const periods = [
        { months: 1, label: '1 Mes' },
        { months: 6, label: '6 Meses' },
        { months: 12, label: '1 Año' },
        { months: 36, label: '3 Años' },
        { months: 60, label: '5 Años' },
        { months: 120, label: '10 Años' },
    ];

    const handleSimulate = () => {
        setShowResults(true);
    };

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-6" data-testid="investment-simulator-page">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                        Calculadora de Proyecciones
                    </h1>
                    <p className="text-slate-500 mt-1 font-light">
                        Herramienta informativa para proyectar escenarios de crecimiento
                    </p>
                </motion.div>

                {/* Input Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2" style={{ fontWeight: 700 }}>
                                <Calculator className="w-5 h-5 text-emerald-400" />
                                Configurar Proyección
                            </CardTitle>
                            <CardDescription className="text-slate-500">
                                Ingresa los parámetros para calcular escenarios informativos
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Initial Amount */}
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-400 flex items-center gap-2">
                                        <DollarSign className="w-4 h-4" />
                                        Inversión Inicial
                                    </label>
                                    <Input
                                        type="number"
                                        value={initialAmount}
                                        onChange={(e) => setInitialAmount(e.target.value)}
                                        className="bg-slate-800 border-slate-700 text-white text-lg"
                                        placeholder="10000"
                                    />
                                </div>

                                {/* Monthly Contribution */}
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-400 flex items-center gap-2">
                                        <PiggyBank className="w-4 h-4" />
                                        Aporte Mensual
                                    </label>
                                    <Input
                                        type="number"
                                        value={monthlyContribution}
                                        onChange={(e) => setMonthlyContribution(e.target.value)}
                                        className="bg-slate-800 border-slate-700 text-white text-lg"
                                        placeholder="500"
                                    />
                                </div>
                            </div>

                            {/* Strategy Selection */}
                            <div className="space-y-3">
                                <label className="text-sm text-slate-400 flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4" />
                                    Estrategia de Inversión
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {INVESTMENT_STRATEGIES.map((strat) => (
                                        <div
                                            key={strat.id}
                                            onClick={() => setStrategy(strat.id)}
                                            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                                                strategy === strat.id
                                                    ? 'border-emerald-500/50 bg-emerald-500/10'
                                                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                                            }`}
                                        >
                                            <p className="text-white font-medium">{strat.name}</p>
                                            <p className="text-emerald-400 text-sm mt-1">+{strat.monthlyReturn}%/mes</p>
                                            <p className={`text-xs mt-1 ${
                                                strat.risk === 'Bajo' ? 'text-emerald-400' :
                                                strat.risk === 'Medio' ? 'text-amber-400' :
                                                strat.risk === 'Alto' ? 'text-orange-400' : 'text-red-400'
                                            }`}>
                                                Riesgo: {strat.risk}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-slate-500">{selectedStrategy.description}</p>
                            </div>

                            <Button
                                onClick={handleSimulate}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                                <TrendingUp className="w-4 h-4 mr-2" />
                                Calcular Proyección
                            </Button>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Results */}
                {showResults && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="space-y-6"
                    >
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Card className="bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border-emerald-500/30">
                                <CardContent className="p-6">
                                    <p className="text-sm text-emerald-400/70">Proyección a 1 Año</p>
                                    <p className="text-3xl text-emerald-400 mt-2" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                        {formatCurrency(calculateGrowth(12))}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-2">
                                        Ganancia: {formatCurrency(calculateGrowth(12) - calculateTotalContributed(12))}
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/30">
                                <CardContent className="p-6">
                                    <p className="text-sm text-blue-400/70">Proyección a 5 Años</p>
                                    <p className="text-3xl text-blue-400 mt-2" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                        {formatCurrency(calculateGrowth(60))}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-2">
                                        Ganancia: {formatCurrency(calculateGrowth(60) - calculateTotalContributed(60))}
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="bg-gradient-to-br from-orange-500/10 to-yellow-500/10 border-orange-500/30">
                                <CardContent className="p-6">
                                    <p className="text-sm text-orange-400/70">Proyección a 10 Años</p>
                                    <p className="text-3xl text-orange-400 mt-2" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                        {formatCurrency(calculateGrowth(120))}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-2">
                                        Ganancia: {formatCurrency(calculateGrowth(120) - calculateTotalContributed(120))}
                                    </p>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Detailed Table */}
                        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white" style={{ fontWeight: 700 }}>
                                    Proyección Detallada
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-slate-800">
                                                <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Período</th>
                                                <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Contribuido</th>
                                                <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Valor Total</th>
                                                <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Ganancia</th>
                                                <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">% Retorno</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {periods.map((period, index) => {
                                                const total = calculateGrowth(period.months);
                                                const contributed = calculateTotalContributed(period.months);
                                                const gain = total - contributed;
                                                const returnPct = (gain / contributed) * 100;

                                                return (
                                                    <motion.tr
                                                        key={period.months}
                                                        initial={{ opacity: 0, x: -10 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: 0.3 + index * 0.05 }}
                                                        className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                                                    >
                                                        <td className="py-4 px-4">
                                                            <div className="flex items-center gap-2">
                                                                <Calendar className="w-4 h-4 text-slate-500" />
                                                                <span className="text-white">{period.label}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-4 px-4 text-right text-slate-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                            {formatCurrency(contributed)}
                                                        </td>
                                                        <td className="py-4 px-4 text-right text-white font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                            {formatCurrency(total)}
                                                        </td>
                                                        <td className="py-4 px-4 text-right text-emerald-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                            +{formatCurrency(gain)}
                                                        </td>
                                                        <td className="py-4 px-4 text-right text-emerald-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                            +{returnPct.toFixed(1)}%
                                                        </td>
                                                    </motion.tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Visual Chart Placeholder */}
                        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white" style={{ fontWeight: 700 }}>
                                    Gráfico de Crecimiento
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-64 flex items-end gap-2 p-4">
                                    {periods.map((period, index) => {
                                        const total = calculateGrowth(period.months);
                                        const maxTotal = calculateGrowth(120);
                                        const height = (total / maxTotal) * 100;

                                        return (
                                            <motion.div
                                                key={period.months}
                                                initial={{ height: 0 }}
                                                animate={{ height: `${height}%` }}
                                                transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
                                                className="flex-1 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-lg relative group cursor-pointer"
                                            >
                                                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                    {formatCurrency(total)}
                                                </div>
                                                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-slate-500 whitespace-nowrap">
                                                    {period.label}
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}

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

export default InvestmentSimulatorPage;
