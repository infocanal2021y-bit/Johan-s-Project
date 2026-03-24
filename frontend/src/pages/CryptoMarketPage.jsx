import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { TrendingUp, TrendingDown, Search, RefreshCw, Bitcoin, DollarSign } from 'lucide-react';

// Simulated crypto data with realistic values
const INITIAL_CRYPTO_DATA = [
    { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', price: 67234.50, change24h: 2.34, marketCap: 1320000000000, volume: 28500000000, icon: '₿' },
    { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', price: 3456.78, change24h: -1.23, marketCap: 415000000000, volume: 15200000000, icon: 'Ξ' },
    { id: 'tether', name: 'Tether', symbol: 'USDT', price: 1.00, change24h: 0.01, marketCap: 95000000000, volume: 52000000000, icon: '₮' },
    { id: 'bnb', name: 'BNB', symbol: 'BNB', price: 584.32, change24h: 1.87, marketCap: 87000000000, volume: 1800000000, icon: 'B' },
    { id: 'solana', name: 'Solana', symbol: 'SOL', price: 142.56, change24h: 5.67, marketCap: 62000000000, volume: 3200000000, icon: 'S' },
    { id: 'xrp', name: 'XRP', symbol: 'XRP', price: 0.5234, change24h: -0.45, marketCap: 28000000000, volume: 1100000000, icon: 'X' },
    { id: 'cardano', name: 'Cardano', symbol: 'ADA', price: 0.4567, change24h: 3.21, marketCap: 16000000000, volume: 450000000, icon: 'A' },
    { id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE', price: 0.1234, change24h: -2.34, marketCap: 17000000000, volume: 890000000, icon: 'D' },
    { id: 'polkadot', name: 'Polkadot', symbol: 'DOT', price: 7.89, change24h: 1.56, marketCap: 9800000000, volume: 320000000, icon: 'P' },
    { id: 'polygon', name: 'Polygon', symbol: 'MATIC', price: 0.5678, change24h: -0.89, marketCap: 5200000000, volume: 280000000, icon: 'M' },
];

export const CryptoMarketPage = () => {
    const [cryptoData, setCryptoData] = useState(INITIAL_CRYPTO_DATA);
    const [searchTerm, setSearchTerm] = useState('');
    const [lastUpdate, setLastUpdate] = useState(new Date());
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Simulate price updates every 10 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setCryptoData(prevData => 
                prevData.map(crypto => ({
                    ...crypto,
                    price: crypto.price * (1 + (Math.random() - 0.5) * 0.002),
                    change24h: crypto.change24h + (Math.random() - 0.5) * 0.1,
                    volume: crypto.volume * (1 + (Math.random() - 0.5) * 0.01)
                }))
            );
            setLastUpdate(new Date());
        }, 10000);

        return () => clearInterval(interval);
    }, []);

    const handleRefresh = () => {
        setIsRefreshing(true);
        setCryptoData(prevData => 
            prevData.map(crypto => ({
                ...crypto,
                price: crypto.price * (1 + (Math.random() - 0.5) * 0.005),
                change24h: crypto.change24h + (Math.random() - 0.5) * 0.2
            }))
        );
        setLastUpdate(new Date());
        setTimeout(() => setIsRefreshing(false), 500);
    };

    const filteredData = cryptoData.filter(crypto =>
        crypto.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        crypto.symbol.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatNumber = (num) => {
        if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
        if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
        return `$${num.toLocaleString()}`;
    };

    const formatPrice = (price) => {
        if (price >= 1000) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (price >= 1) return `$${price.toFixed(2)}`;
        return `$${price.toFixed(4)}`;
    };

    return (
        <Layout>
            <div className="space-y-6" data-testid="crypto-market-page">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                    <div>
                        <h1 className="text-3xl text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                            Mercado Cripto
                        </h1>
                        <p className="text-slate-500 mt-1 font-light">
                            Precios informativos de las principales criptomonedas
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <Input
                                placeholder="Buscar criptomoneda..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 bg-slate-800/50 border-slate-700 text-white w-64"
                            />
                        </div>
                        <button
                            onClick={handleRefresh}
                            className="p-2 rounded-lg bg-slate-800/50 border border-slate-700 hover:bg-slate-700 transition-colors"
                        >
                            <RefreshCw className={`w-5 h-5 text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </motion.div>

                {/* Last Update */}
                <div className="text-sm text-slate-500">
                    Última actualización: {lastUpdate.toLocaleTimeString()}
                </div>

                {/* Market Overview Cards */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-4"
                >
                    <Card className="bg-gradient-to-br from-orange-500/10 to-yellow-500/10 border-orange-500/30">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-orange-400/70">Bitcoin (BTC)</p>
                                    <p className="text-2xl text-orange-400 mt-1" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                        {formatPrice(cryptoData[0].price)}
                                    </p>
                                </div>
                                <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center">
                                    <span className="text-2xl text-orange-400">₿</span>
                                </div>
                            </div>
                            <div className={`mt-2 text-sm flex items-center gap-1 ${cryptoData[0].change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {cryptoData[0].change24h >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                {cryptoData[0].change24h >= 0 ? '+' : ''}{cryptoData[0].change24h.toFixed(2)}% (24h)
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/30">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-blue-400/70">Ethereum (ETH)</p>
                                    <p className="text-2xl text-blue-400 mt-1" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                        {formatPrice(cryptoData[1].price)}
                                    </p>
                                </div>
                                <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                                    <span className="text-2xl text-blue-400">Ξ</span>
                                </div>
                            </div>
                            <div className={`mt-2 text-sm flex items-center gap-1 ${cryptoData[1].change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {cryptoData[1].change24h >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                {cryptoData[1].change24h >= 0 ? '+' : ''}{cryptoData[1].change24h.toFixed(2)}% (24h)
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border-emerald-500/30">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-emerald-400/70">Cap. Total del Mercado</p>
                                    <p className="text-2xl text-emerald-400 mt-1" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                        {formatNumber(cryptoData.reduce((acc, c) => acc + c.marketCap, 0))}
                                    </p>
                                </div>
                                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                    <DollarSign className="w-6 h-6 text-emerald-400" />
                                </div>
                            </div>
                            <p className="mt-2 text-sm text-slate-500">
                                Volumen 24h: {formatNumber(cryptoData.reduce((acc, c) => acc + c.volume, 0))}
                            </p>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Crypto Table */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white" style={{ fontWeight: 700 }}>
                                Todas las Criptomonedas
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-800">
                                            <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">#</th>
                                            <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Nombre</th>
                                            <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Precio</th>
                                            <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">24h %</th>
                                            <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Cap. de Mercado</th>
                                            <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Volumen (24h)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredData.map((crypto, index) => (
                                            <motion.tr
                                                key={crypto.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: index * 0.05 }}
                                                className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                                            >
                                                <td className="py-4 px-4 text-slate-500">{index + 1}</td>
                                                <td className="py-4 px-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold">
                                                            {crypto.icon}
                                                        </div>
                                                        <div>
                                                            <p className="text-white font-medium">{crypto.name}</p>
                                                            <p className="text-slate-500 text-sm">{crypto.symbol}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-4 text-right text-white font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                    {formatPrice(crypto.price)}
                                                </td>
                                                <td className={`py-4 px-4 text-right font-medium ${crypto.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                    <div className="flex items-center justify-end gap-1">
                                                        {crypto.change24h >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                                        {crypto.change24h >= 0 ? '+' : ''}{crypto.change24h.toFixed(2)}%
                                                    </div>
                                                </td>
                                                <td className="py-4 px-4 text-right text-slate-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                    {formatNumber(crypto.marketCap)}
                                                </td>
                                                <td className="py-4 px-4 text-right text-slate-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                    {formatNumber(crypto.volume)}
                                                </td>
                                            </motion.tr>
                                        ))}
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

export default CryptoMarketPage;
