import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ArrowRightLeft, RefreshCw } from 'lucide-react';

// Exchange rates (simulated but realistic)
const BASE_RATES = {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    BTC: 0.0000149,
    ETH: 0.000289,
    USDT: 1.0,
};

const CURRENCY_INFO = {
    USD: { name: 'Dólar Estadounidense', symbol: '$', icon: '🇺🇸' },
    EUR: { name: 'Euro', symbol: '€', icon: '🇪🇺' },
    GBP: { name: 'Libra Esterlina', symbol: '£', icon: '🇬🇧' },
    BTC: { name: 'Bitcoin', symbol: '₿', icon: '₿' },
    ETH: { name: 'Ethereum', symbol: 'Ξ', icon: 'Ξ' },
    USDT: { name: 'Tether', symbol: '₮', icon: '₮' },
};

export const ConverterPage = () => {
    const [fromCurrency, setFromCurrency] = useState('USD');
    const [toCurrency, setToCurrency] = useState('EUR');
    const [amount, setAmount] = useState('1000');
    const [rates, setRates] = useState(BASE_RATES);
    const [lastUpdate, setLastUpdate] = useState(new Date());
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Simulate rate fluctuations
    useEffect(() => {
        const interval = setInterval(() => {
            setRates(prevRates => ({
                ...prevRates,
                EUR: BASE_RATES.EUR * (1 + (Math.random() - 0.5) * 0.001),
                GBP: BASE_RATES.GBP * (1 + (Math.random() - 0.5) * 0.001),
                BTC: BASE_RATES.BTC * (1 + (Math.random() - 0.5) * 0.002),
                ETH: BASE_RATES.ETH * (1 + (Math.random() - 0.5) * 0.003),
            }));
            setLastUpdate(new Date());
        }, 15000);

        return () => clearInterval(interval);
    }, []);

    const handleRefresh = () => {
        setIsRefreshing(true);
        setRates(prevRates => ({
            ...prevRates,
            EUR: BASE_RATES.EUR * (1 + (Math.random() - 0.5) * 0.002),
            GBP: BASE_RATES.GBP * (1 + (Math.random() - 0.5) * 0.002),
            BTC: BASE_RATES.BTC * (1 + (Math.random() - 0.5) * 0.005),
            ETH: BASE_RATES.ETH * (1 + (Math.random() - 0.5) * 0.005),
        }));
        setLastUpdate(new Date());
        setTimeout(() => setIsRefreshing(false), 500);
    };

    const swapCurrencies = () => {
        setFromCurrency(toCurrency);
        setToCurrency(fromCurrency);
    };

    const convertAmount = () => {
        const numAmount = parseFloat(amount) || 0;
        // Convert from source to USD, then from USD to target
        const amountInUSD = numAmount / rates[fromCurrency];
        const result = amountInUSD * rates[toCurrency];
        return result;
    };

    const getExchangeRate = () => {
        const rate = rates[toCurrency] / rates[fromCurrency];
        return rate;
    };

    const formatResult = (value) => {
        if (['BTC', 'ETH'].includes(toCurrency)) {
            return value.toFixed(8);
        }
        return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatRate = (rate) => {
        if (rate < 0.0001) {
            return rate.toFixed(8);
        }
        if (rate < 1) {
            return rate.toFixed(6);
        }
        return rate.toFixed(4);
    };

    return (
        <Layout>
            <div className="max-w-3xl mx-auto space-y-6" data-testid="converter-page">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                        Conversor de Monedas
                    </h1>
                    <p className="text-slate-500 mt-1 font-light">
                        Convierte entre monedas fiat y criptomonedas (simulación)
                    </p>
                </motion.div>

                {/* Converter Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-white" style={{ fontWeight: 700 }}>
                                Convertir
                            </CardTitle>
                            <button
                                onClick={handleRefresh}
                                className="p-2 rounded-lg bg-slate-800/50 border border-slate-700 hover:bg-slate-700 transition-colors"
                            >
                                <RefreshCw className={`w-4 h-4 text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} />
                            </button>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* From */}
                            <div className="space-y-2">
                                <label className="text-sm text-slate-400">De</label>
                                <div className="flex gap-3">
                                    <Select value={fromCurrency} onValueChange={setFromCurrency}>
                                        <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-800 border-slate-700">
                                            {Object.entries(CURRENCY_INFO).map(([code, info]) => (
                                                <SelectItem key={code} value={code} className="text-white hover:bg-slate-700">
                                                    <span className="flex items-center gap-2">
                                                        <span>{info.icon}</span>
                                                        <span>{code}</span>
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="flex-1 bg-slate-800 border-slate-700 text-white text-xl"
                                        style={{ fontVariantNumeric: 'tabular-nums' }}
                                    />
                                </div>
                                <p className="text-xs text-slate-500">{CURRENCY_INFO[fromCurrency].name}</p>
                            </div>

                            {/* Swap Button */}
                            <div className="flex justify-center">
                                <button
                                    onClick={swapCurrencies}
                                    className="p-3 rounded-full bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
                                >
                                    <ArrowRightLeft className="w-5 h-5 text-emerald-400" />
                                </button>
                            </div>

                            {/* To */}
                            <div className="space-y-2">
                                <label className="text-sm text-slate-400">A</label>
                                <div className="flex gap-3">
                                    <Select value={toCurrency} onValueChange={setToCurrency}>
                                        <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-800 border-slate-700">
                                            {Object.entries(CURRENCY_INFO).map(([code, info]) => (
                                                <SelectItem key={code} value={code} className="text-white hover:bg-slate-700">
                                                    <span className="flex items-center gap-2">
                                                        <span>{info.icon}</span>
                                                        <span>{code}</span>
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <div className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-4 py-2 flex items-center">
                                        <span className="text-xl text-emerald-400" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                            {CURRENCY_INFO[toCurrency].symbol} {formatResult(convertAmount())}
                                        </span>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500">{CURRENCY_INFO[toCurrency].name}</p>
                            </div>

                            {/* Exchange Rate */}
                            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-400">Tipo de cambio</span>
                                    <span className="text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        1 {fromCurrency} = {formatRate(getExchangeRate())} {toCurrency}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    Última actualización: {lastUpdate.toLocaleTimeString()}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Quick Conversions */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white text-lg" style={{ fontWeight: 600 }}>
                                Conversiones Rápidas
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {[
                                    { from: 'USD', to: 'EUR', amount: 1000 },
                                    { from: 'USD', to: 'BTC', amount: 1000 },
                                    { from: 'USD', to: 'ETH', amount: 1000 },
                                    { from: 'EUR', to: 'USD', amount: 1000 },
                                    { from: 'BTC', to: 'USD', amount: 1 },
                                    { from: 'ETH', to: 'USD', amount: 1 },
                                ].map((conversion, index) => {
                                    const amountInUSD = conversion.amount / rates[conversion.from];
                                    const result = amountInUSD * rates[conversion.to];
                                    const displayResult = ['BTC', 'ETH'].includes(conversion.to) 
                                        ? result.toFixed(6) 
                                        : result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    
                                    return (
                                        <div
                                            key={index}
                                            className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer"
                                            onClick={() => {
                                                setFromCurrency(conversion.from);
                                                setToCurrency(conversion.to);
                                                setAmount(conversion.amount.toString());
                                            }}
                                        >
                                            <p className="text-slate-400 text-sm">
                                                {conversion.amount} {conversion.from}
                                            </p>
                                            <p className="text-white text-lg mt-1" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                                {CURRENCY_INFO[conversion.to].symbol} {displayResult}
                                            </p>
                                            <p className="text-slate-500 text-xs mt-1">{conversion.to}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Disclaimer */}
                <div className="text-center text-xs text-slate-600 p-4">
                    Los tipos de cambio son simulados y solo con fines informativos. No constituyen asesoramiento financiero.
                </div>
            </div>
        </Layout>
    );
};

export default ConverterPage;
