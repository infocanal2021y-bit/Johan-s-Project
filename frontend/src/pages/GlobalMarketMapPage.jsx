import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Globe, TrendingUp, TrendingDown, MapPin, Users, DollarSign, Zap } from 'lucide-react';

// Global market data by region (simulated)
const REGIONS_DATA = {
    northAmerica: {
        name: 'América del Norte',
        countries: [
            { name: 'Estados Unidos', code: 'US', flag: '🇺🇸', cryptoAdoption: 16, btcHolders: '46M', marketShare: 38, trend: 'up', topCrypto: 'BTC' },
            { name: 'Canadá', code: 'CA', flag: '🇨🇦', cryptoAdoption: 13, btcHolders: '3.2M', marketShare: 4, trend: 'up', topCrypto: 'ETH' },
            { name: 'México', code: 'MX', flag: '🇲🇽', cryptoAdoption: 12, btcHolders: '4.1M', marketShare: 2, trend: 'up', topCrypto: 'BTC' },
        ],
        totalVolume: '$45B',
        trend: 'up'
    },
    europe: {
        name: 'Europa',
        countries: [
            { name: 'Reino Unido', code: 'UK', flag: '🇬🇧', cryptoAdoption: 11, btcHolders: '5.8M', marketShare: 8, trend: 'up', topCrypto: 'BTC' },
            { name: 'Alemania', code: 'DE', flag: '🇩🇪', cryptoAdoption: 9, btcHolders: '4.2M', marketShare: 6, trend: 'stable', topCrypto: 'ETH' },
            { name: 'España', code: 'ES', flag: '🇪🇸', cryptoAdoption: 10, btcHolders: '3.5M', marketShare: 3, trend: 'up', topCrypto: 'BTC' },
            { name: 'Francia', code: 'FR', flag: '🇫🇷', cryptoAdoption: 8, btcHolders: '3.8M', marketShare: 4, trend: 'up', topCrypto: 'ETH' },
            { name: 'Suiza', code: 'CH', flag: '🇨🇭', cryptoAdoption: 14, btcHolders: '0.9M', marketShare: 5, trend: 'up', topCrypto: 'BTC' },
        ],
        totalVolume: '$28B',
        trend: 'up'
    },
    asia: {
        name: 'Asia',
        countries: [
            { name: 'Japón', code: 'JP', flag: '🇯🇵', cryptoAdoption: 11, btcHolders: '8.2M', marketShare: 12, trend: 'stable', topCrypto: 'BTC' },
            { name: 'Corea del Sur', code: 'KR', flag: '🇰🇷', cryptoAdoption: 24, btcHolders: '7.5M', marketShare: 10, trend: 'up', topCrypto: 'ETH' },
            { name: 'Singapur', code: 'SG', flag: '🇸🇬', cryptoAdoption: 18, btcHolders: '1.2M', marketShare: 4, trend: 'up', topCrypto: 'BTC' },
            { name: 'India', code: 'IN', flag: '🇮🇳', cryptoAdoption: 7, btcHolders: '25M', marketShare: 8, trend: 'up', topCrypto: 'BTC' },
            { name: 'Vietnam', code: 'VN', flag: '🇻🇳', cryptoAdoption: 21, btcHolders: '12M', marketShare: 3, trend: 'up', topCrypto: 'USDT' },
        ],
        totalVolume: '$52B',
        trend: 'up'
    },
    latam: {
        name: 'América Latina',
        countries: [
            { name: 'Brasil', code: 'BR', flag: '🇧🇷', cryptoAdoption: 16, btcHolders: '15M', marketShare: 5, trend: 'up', topCrypto: 'BTC' },
            { name: 'Argentina', code: 'AR', flag: '🇦🇷', cryptoAdoption: 23, btcHolders: '5.2M', marketShare: 2, trend: 'up', topCrypto: 'USDT' },
            { name: 'Colombia', code: 'CO', flag: '🇨🇴', cryptoAdoption: 15, btcHolders: '3.8M', marketShare: 1.5, trend: 'up', topCrypto: 'BTC' },
            { name: 'El Salvador', code: 'SV', flag: '🇸🇻', cryptoAdoption: 46, btcHolders: '2.1M', marketShare: 0.5, trend: 'stable', topCrypto: 'BTC' },
            { name: 'Venezuela', code: 'VE', flag: '🇻🇪', cryptoAdoption: 12, btcHolders: '2.8M', marketShare: 0.8, trend: 'up', topCrypto: 'USDT' },
        ],
        totalVolume: '$12B',
        trend: 'up'
    },
    africa: {
        name: 'África',
        countries: [
            { name: 'Nigeria', code: 'NG', flag: '🇳🇬', cryptoAdoption: 32, btcHolders: '22M', marketShare: 3, trend: 'up', topCrypto: 'BTC' },
            { name: 'Sudáfrica', code: 'ZA', flag: '🇿🇦', cryptoAdoption: 13, btcHolders: '4.2M', marketShare: 1, trend: 'stable', topCrypto: 'BTC' },
            { name: 'Kenia', code: 'KE', flag: '🇰🇪', cryptoAdoption: 8, btcHolders: '2.1M', marketShare: 0.5, trend: 'up', topCrypto: 'BTC' },
        ],
        totalVolume: '$5B',
        trend: 'up'
    },
};

const GLOBAL_STATS = [
    { label: 'Usuarios Cripto Global', value: '420M+', change: '+12%', icon: Users },
    { label: 'Volumen 24h Global', value: '$142B', change: '+8%', icon: DollarSign },
    { label: 'Países con Regulación', value: '85+', change: '+15', icon: Globe },
    { label: 'Adopción Promedio', value: '14.2%', change: '+2.3%', icon: Zap },
];

export const GlobalMarketMapPage = () => {
    const [selectedRegion, setSelectedRegion] = useState('northAmerica');
    const [hoveredCountry, setHoveredCountry] = useState(null);

    const regionData = REGIONS_DATA[selectedRegion];

    // Top 10 countries by adoption
    const topCountries = Object.values(REGIONS_DATA)
        .flatMap(region => region.countries)
        .sort((a, b) => b.cryptoAdoption - a.cryptoAdoption)
        .slice(0, 10);

    return (
        <Layout>
            <div className="space-y-6" data-testid="global-market-map-page">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl text-white flex items-center gap-3" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                        <Globe className="w-8 h-8 text-cyan-400" />
                        Mapa Global del Mercado
                    </h1>
                    <p className="text-slate-500 mt-1 font-light">
                        Adopción de criptomonedas y tendencias por región (datos simulados)
                    </p>
                </motion.div>

                {/* Global Stats */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="grid grid-cols-2 md:grid-cols-4 gap-4"
                >
                    {GLOBAL_STATS.map((stat, index) => (
                        <Card key={index} className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/30">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                                        <stat.icon className="w-5 h-5 text-cyan-400" />
                                    </div>
                                    <div>
                                        <p className="text-2xl text-white" style={{ fontWeight: 700 }}>{stat.value}</p>
                                        <p className="text-xs text-slate-400">{stat.label}</p>
                                        <p className="text-xs text-emerald-400">{stat.change}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </motion.div>

                {/* Region Selector */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="flex flex-wrap gap-2"
                >
                    {Object.entries(REGIONS_DATA).map(([key, region]) => (
                        <button
                            key={key}
                            onClick={() => setSelectedRegion(key)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                                selectedRegion === key
                                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                                    : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:border-slate-600'
                            }`}
                        >
                            <Globe className="w-4 h-4" />
                            {region.name}
                            {region.trend === 'up' && <TrendingUp className="w-3 h-3 text-emerald-400" />}
                        </button>
                    ))}
                </motion.div>

                {/* Region Details */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                >
                    {/* Region Overview */}
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2" style={{ fontWeight: 700 }}>
                                <MapPin className="w-5 h-5 text-cyan-400" />
                                {regionData.name}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-4 rounded-lg bg-slate-800/50">
                                <p className="text-slate-400 text-sm">Volumen Total 24h</p>
                                <p className="text-3xl text-cyan-400" style={{ fontWeight: 700 }}>
                                    {regionData.totalVolume}
                                </p>
                                <div className="flex items-center gap-1 mt-1 text-emerald-400 text-sm">
                                    <TrendingUp className="w-4 h-4" />
                                    Tendencia alcista
                                </div>
                            </div>
                            <div className="space-y-2">
                                <p className="text-slate-400 text-sm">Países principales</p>
                                {regionData.countries.slice(0, 3).map((country, index) => (
                                    <div key={index} className="flex items-center justify-between p-2 rounded bg-slate-800/30">
                                        <span className="text-white">
                                            {country.flag} {country.name}
                                        </span>
                                        <span className="text-cyan-400 text-sm">{country.cryptoAdoption}%</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Countries Table */}
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800 lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-white" style={{ fontWeight: 700 }}>
                                Países en {regionData.name}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-800">
                                            <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">País</th>
                                            <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Adopción</th>
                                            <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Holders</th>
                                            <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Mercado</th>
                                            <th className="text-center py-3 px-4 text-slate-400 font-medium text-sm">Top Cripto</th>
                                            <th className="text-center py-3 px-4 text-slate-400 font-medium text-sm">Tendencia</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {regionData.countries.map((country, index) => (
                                            <motion.tr
                                                key={country.code}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 0.25 + index * 0.05 }}
                                                className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                                            >
                                                <td className="py-4 px-4">
                                                    <span className="text-white font-medium">
                                                        {country.flag} {country.name}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                                                            <motion.div
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${Math.min(country.cryptoAdoption * 2, 100)}%` }}
                                                                className="h-full bg-cyan-500 rounded-full"
                                                            />
                                                        </div>
                                                        <span className="text-cyan-400 text-sm w-10 text-right">{country.cryptoAdoption}%</span>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-4 text-right text-slate-300">
                                                    {country.btcHolders}
                                                </td>
                                                <td className="py-4 px-4 text-right text-slate-300">
                                                    {country.marketShare}%
                                                </td>
                                                <td className="py-4 px-4 text-center">
                                                    <span className="px-2 py-1 rounded bg-slate-800 text-orange-400 text-xs font-medium">
                                                        {country.topCrypto}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4 text-center">
                                                    {country.trend === 'up' ? (
                                                        <TrendingUp className="w-5 h-5 text-emerald-400 mx-auto" />
                                                    ) : country.trend === 'down' ? (
                                                        <TrendingDown className="w-5 h-5 text-red-400 mx-auto" />
                                                    ) : (
                                                        <span className="text-slate-400">—</span>
                                                    )}
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Top 10 Countries */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2" style={{ fontWeight: 700 }}>
                                🏆 Top 10 Países por Adopción Cripto
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                {topCountries.map((country, index) => (
                                    <motion.div
                                        key={country.code}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.35 + index * 0.05 }}
                                        className={`p-4 rounded-lg border ${
                                            index === 0 ? 'bg-yellow-500/10 border-yellow-500/30' :
                                            index === 1 ? 'bg-slate-400/10 border-slate-400/30' :
                                            index === 2 ? 'bg-orange-700/10 border-orange-700/30' :
                                            'bg-slate-800/50 border-slate-700'
                                        }`}
                                    >
                                        <div className="text-center">
                                            <span className="text-2xl">{country.flag}</span>
                                            <p className="text-white font-medium mt-2">{country.name}</p>
                                            <p className="text-3xl text-cyan-400 mt-1" style={{ fontWeight: 700 }}>
                                                {country.cryptoAdoption}%
                                            </p>
                                            <p className="text-xs text-slate-500 mt-1">#{index + 1} Global</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Disclaimer */}
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <p className="text-amber-400 text-sm">
                        <strong>Aviso:</strong> Los datos de adopción y tendencias mostrados son simulados con fines educativos. Las cifras reales pueden variar significativamente.
                    </p>
                </div>
            </div>
        </Layout>
    );
};

export default GlobalMarketMapPage;
