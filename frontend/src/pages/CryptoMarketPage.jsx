import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent } from '../components/ui/card';
import { OdometerValue } from '../components/dashboard/OdometerValue';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { marketAPI } from '../lib/api';
import { 
    TrendingUp, TrendingDown, Search, RefreshCw, BarChart3,
    Globe, ArrowUpRight, ArrowDownRight, Minus, Shield
} from 'lucide-react';

const formatNumber = (n) => {
    if (!n && n !== 0) return '-';
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
};

const formatPrice = (p) => {
    if (!p && p !== 0) return '-';
    if (p >= 1) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${p.toFixed(6)}`;
};

const ChangeCell = ({ value }) => {
    if (!value && value !== 0) return <span className="text-slate-500">-</span>;
    const positive = value >= 0;
    return (
        <span className={`inline-flex items-center gap-0.5 font-mono text-sm ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {positive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {Math.abs(value).toFixed(2)}%
        </span>
    );
};

export const CryptoMarketPage = () => {
    const [coins, setCoins] = useState([]);
    const [globalData, setGlobalData] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(null);

    const fetchData = useCallback(async (showRefresh = false) => {
        if (showRefresh) setRefreshing(true);
        try {
            const [cryptoRes, globalRes] = await Promise.all([
                marketAPI.getCrypto(),
                marketAPI.getGlobal()
            ]);
            setCoins(cryptoRes.data || []);
            setGlobalData(globalRes.data || null);
            setLastUpdate(new Date());
        } catch {
            // Use cached data
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(() => fetchData(), 60000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const filtered = coins.filter(c =>
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.symbol?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalMcap = globalData?.total_market_cap?.usd || 0;
    const totalVol = globalData?.total_volume?.usd || 0;
    const btcDom = globalData?.market_cap_percentage?.btc || 0;
    const activeCryptos = globalData?.active_cryptocurrencies || 0;

    return (
        <Layout>
            <div className="space-y-6" data-testid="crypto-market-page">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-heading font-bold text-white">Mercado Crypto</h1>
                        <p className="text-slate-500 mt-1">Datos en tiempo real via CoinGecko</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {lastUpdate && (
                            <span className="text-xs text-slate-600">
                                Actualizado: {lastUpdate.toLocaleTimeString('es-ES')}
                            </span>
                        )}
                        <Button onClick={() => fetchData(true)} variant="outline" size="sm" className="border-slate-700 text-slate-300 hover:bg-slate-800" data-testid="refresh-market">
                            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                            Actualizar
                        </Button>
                    </div>
                </div>

                {/* Global Stats Panel */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Card className="bg-slate-900 border-slate-800">
                        <CardContent className="pt-4 pb-4">
                            <p className="text-xs text-slate-500 uppercase tracking-wider">Market Cap Global</p>
                            <p className="text-lg font-bold font-numbers text-white mt-1"><OdometerValue value={formatNumber(totalMcap)} staggerMs={35} /></p>
                        </CardContent>
                    </Card>
                    <Card className="bg-slate-900 border-slate-800">
                        <CardContent className="pt-4 pb-4">
                            <p className="text-xs text-slate-500 uppercase tracking-wider">Volumen 24h</p>
                            <p className="text-lg font-bold font-numbers text-cyan-400 mt-1"><OdometerValue value={formatNumber(totalVol)} staggerMs={35} /></p>
                        </CardContent>
                    </Card>
                    <Card className="bg-slate-900 border-slate-800">
                        <CardContent className="pt-4 pb-4">
                            <p className="text-xs text-slate-500 uppercase tracking-wider">Dominancia BTC</p>
                            <p className="text-lg font-bold font-numbers text-orange-400 mt-1"><OdometerValue value={`${btcDom.toFixed(1)}%`} staggerMs={35} /></p>
                        </CardContent>
                    </Card>
                    <Card className="bg-slate-900 border-slate-800">
                        <CardContent className="pt-4 pb-4">
                            <p className="text-xs text-slate-500 uppercase tracking-wider">Criptomonedas Activas</p>
                            <p className="text-lg font-bold font-numbers text-violet-400 mt-1"><OdometerValue value={activeCryptos.toLocaleString()} staggerMs={35} /></p>
                        </CardContent>
                    </Card>
                </div>

                {/* Top 3 coins quick cards */}
                {coins.length >= 3 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {coins.slice(0, 3).map(coin => (
                            <Card key={coin.id} className="bg-slate-900 border-slate-800">
                                <CardContent className="pt-5 pb-5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <img src={coin.image} alt={coin.name} className="w-8 h-8 rounded-full" />
                                        <div>
                                            <p className="text-white font-medium">{coin.name}</p>
                                            <p className="text-xs text-slate-500 uppercase">{coin.symbol}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-end justify-between">
                                        <p className="text-xl font-bold font-mono text-white">{formatPrice(coin.current_price)}</p>
                                        <ChangeCell value={coin.price_change_percentage_24h} />
                                    </div>
                                    <div className="flex justify-between mt-2 text-xs text-slate-500">
                                        <span>MCap: {formatNumber(coin.market_cap)}</span>
                                        <span>Vol: {formatNumber(coin.total_volume)}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                        placeholder="Buscar criptomoneda..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-slate-900 border-slate-800 pl-10 text-white"
                        data-testid="crypto-search"
                    />
                </div>

                {/* Market Table */}
                <Card className="bg-slate-900 border-slate-800 overflow-hidden">
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="flex justify-center py-16">
                                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : filtered.length === 0 && !searchTerm ? (
                            <div className="text-center py-12">
                                <BarChart3 className="w-12 h-12 mx-auto text-slate-700 mb-4" />
                                <p className="text-slate-500">Cargando datos del mercado...</p>
                                <p className="text-xs text-slate-600 mt-1">Los datos se actualizan cada 2 minutos desde CoinGecko</p>
                                <Button onClick={() => fetchData(true)} variant="outline" size="sm" className="mt-4 border-slate-700 text-slate-400">
                                    <RefreshCw className="w-3 h-3 mr-1" /> Reintentar
                                </Button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-800">
                                            <th className="text-left text-slate-500 text-xs uppercase py-3 px-4">#</th>
                                            <th className="text-left text-slate-500 text-xs uppercase py-3 px-4">Moneda</th>
                                            <th className="text-right text-slate-500 text-xs uppercase py-3 px-4">Precio</th>
                                            <th className="text-right text-slate-500 text-xs uppercase py-3 px-4">24h</th>
                                            <th className="text-right text-slate-500 text-xs uppercase py-3 px-4 hidden md:table-cell">7d</th>
                                            <th className="text-right text-slate-500 text-xs uppercase py-3 px-4 hidden lg:table-cell">Market Cap</th>
                                            <th className="text-right text-slate-500 text-xs uppercase py-3 px-4 hidden lg:table-cell">Volumen 24h</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((coin) => (
                                            <tr key={coin.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors" data-testid={`coin-row-${coin.id}`}>
                                                <td className="py-3 px-4 text-slate-500 font-mono text-xs">{coin.market_cap_rank}</td>
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2.5">
                                                        <img src={coin.image} alt={coin.name} className="w-6 h-6 rounded-full" />
                                                        <div>
                                                            <span className="text-white font-medium">{coin.name}</span>
                                                            <span className="text-slate-500 text-xs ml-2 uppercase">{coin.symbol}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-right text-white font-mono">{formatPrice(coin.current_price)}</td>
                                                <td className="py-3 px-4 text-right">
                                                    <ChangeCell value={coin.price_change_percentage_24h} />
                                                </td>
                                                <td className="py-3 px-4 text-right hidden md:table-cell">
                                                    <ChangeCell value={coin.price_change_percentage_24h_in_currency || coin.price_change_percentage_7d_in_currency} />
                                                </td>
                                                <td className="py-3 px-4 text-right text-slate-400 font-mono hidden lg:table-cell">{formatNumber(coin.market_cap)}</td>
                                                <td className="py-3 px-4 text-right text-slate-400 font-mono hidden lg:table-cell">{formatNumber(coin.total_volume)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Disclaimer */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <Shield className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-slate-500 leading-relaxed">
                            <strong className="text-slate-400">Aviso legal:</strong> Los datos mostrados provienen de CoinGecko y son exclusivamente informativos. LIONSBIT VERIFICACION no está habilitada para inversiones reales. Los precios se actualizan cada 60 segundos.
                        </p>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default CryptoMarketPage;
