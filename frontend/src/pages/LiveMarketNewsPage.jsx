import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { marketAPI } from '../lib/api';
import { 
    TrendingUp, Zap, RefreshCw, Globe, Shield, BarChart3,
    ArrowUpRight, Flame, Star
} from 'lucide-react';

const formatPrice = (p) => {
    if (!p && p !== 0) return '-';
    if (p >= 1) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${p.toFixed(6)}`;
};

const formatNumber = (n) => {
    if (!n) return '-';
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    return `$${n.toLocaleString()}`;
};

export const LiveMarketNewsPage = () => {
    const [trending, setTrending] = useState([]);
    const [categories, setCategories] = useState([]);
    const [globalData, setGlobalData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async (showRefresh = false) => {
        if (showRefresh) setRefreshing(true);
        try {
            const [trendRes, globalRes] = await Promise.all([
                marketAPI.getTrending(),
                marketAPI.getGlobal()
            ]);
            const trendData = trendRes.data;
            setTrending(trendData?.coins || []);
            setCategories(trendData?.categories || []);
            setGlobalData(globalRes.data || null);
        } catch {
            // cached data may be used
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(() => fetchData(), 300000); // 5 min
        return () => clearInterval(interval);
    }, [fetchData]);

    const mcapChange = globalData?.market_cap_change_percentage_24h_usd || 0;

    return (
        <Layout>
            <div className="space-y-6" data-testid="live-market-news">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-heading font-bold text-white">Noticias del Mercado</h1>
                        <p className="text-slate-500 mt-1">Tendencias y movimientos en tiempo real</p>
                    </div>
                    <Button onClick={() => fetchData(true)} variant="outline" size="sm" className="border-slate-700 text-slate-300 hover:bg-slate-800" data-testid="refresh-news">
                        <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                        Actualizar
                    </Button>
                </div>

                {/* Live indicator */}
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                    </span>
                    EN VIVO — Datos de CoinGecko
                </div>

                {/* Global Market Summary */}
                {globalData && (
                    <Card className="bg-gradient-to-r from-slate-900 to-slate-800 border-slate-700">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Globe className="w-5 h-5 text-cyan-400" />
                                <h2 className="text-white font-medium">Resumen del Mercado Global</h2>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <p className="text-xs text-slate-500">Market Cap Total</p>
                                    <p className="text-white font-bold font-mono">{formatNumber(globalData.total_market_cap?.usd)}</p>
                                    <span className={`text-xs ${mcapChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {mcapChange >= 0 ? '+' : ''}{mcapChange.toFixed(2)}% 24h
                                    </span>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Volumen 24h</p>
                                    <p className="text-cyan-400 font-bold font-mono">{formatNumber(globalData.total_volume?.usd)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Dominancia BTC</p>
                                    <p className="text-orange-400 font-bold font-mono">{(globalData.market_cap_percentage?.btc || 0).toFixed(1)}%</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Dominancia ETH</p>
                                    <p className="text-violet-400 font-bold font-mono">{(globalData.market_cap_percentage?.eth || 0).toFixed(1)}%</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {loading ? (
                    <div className="flex justify-center py-16">
                        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* Trending Coins */}
                        <Card className="bg-slate-900 border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white flex items-center gap-2">
                                    <Flame className="w-5 h-5 text-orange-400" />
                                    Criptomonedas en Tendencia
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {trending.length === 0 ? (
                                    <p className="text-slate-500 text-center py-8">No hay datos de tendencia disponibles</p>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {trending.map((item, idx) => {
                                            const coin = item.item;
                                            const priceData = coin.data || {};
                                            const change24h = priceData.price_change_percentage_24h?.usd || 0;
                                            const positive = change24h >= 0;
                                            
                                            return (
                                                <div
                                                    key={coin.id || idx}
                                                    className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 hover:border-slate-600 transition-colors"
                                                    data-testid={`trending-coin-${idx}`}
                                                >
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-2.5">
                                                            {coin.thumb && (
                                                                <img src={coin.thumb} alt={coin.name} className="w-7 h-7 rounded-full" />
                                                            )}
                                                            <div>
                                                                <p className="text-white font-medium text-sm">{coin.name}</p>
                                                                <p className="text-xs text-slate-500 uppercase">{coin.symbol}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1 text-xs text-slate-500 bg-slate-900/50 px-2 py-1 rounded-full">
                                                            <Star className="w-3 h-3 text-amber-400" />
                                                            #{coin.market_cap_rank || idx + 1}
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex items-end justify-between">
                                                        <div>
                                                            <p className="text-white font-bold font-mono">
                                                                {priceData.price ? formatPrice(typeof priceData.price === 'number' ? priceData.price : parseFloat(String(priceData.price).replace(/[$,]/g, ''))) : '-'}
                                                            </p>
                                                            {priceData.market_cap && (
                                                                <p className="text-xs text-slate-500 mt-1">MCap: {priceData.market_cap}</p>
                                                            )}
                                                        </div>
                                                        <span className={`inline-flex items-center gap-0.5 text-sm font-mono px-2 py-1 rounded ${
                                                            positive ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'
                                                        }`}>
                                                            <ArrowUpRight className={`w-3 h-3 ${!positive ? 'rotate-180' : ''}`} />
                                                            {Math.abs(change24h).toFixed(2)}%
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Trending Categories */}
                        {categories.length > 0 && (
                            <Card className="bg-slate-900 border-slate-800">
                                <CardHeader>
                                    <CardTitle className="text-white flex items-center gap-2">
                                        <BarChart3 className="w-5 h-5 text-cyan-400" />
                                        Categorías en Tendencia
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {categories.slice(0, 6).map((cat, idx) => {
                                            const data = cat.data || {};
                                            const mcChange = data.market_cap_change_percentage_24h?.usd || 0;
                                            const positive = mcChange >= 0;
                                            
                                            return (
                                                <div
                                                    key={cat.id || idx}
                                                    className="flex items-center justify-between bg-slate-800/50 rounded-lg p-4 border border-slate-700/50"
                                                    data-testid={`trending-category-${idx}`}
                                                >
                                                    <div>
                                                        <p className="text-white font-medium">{cat.name}</p>
                                                        {data.market_cap && (
                                                            <p className="text-xs text-slate-500 mt-1">MCap: {data.market_cap}</p>
                                                        )}
                                                    </div>
                                                    <span className={`text-sm font-mono ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {positive ? '+' : ''}{mcChange.toFixed(2)}%
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Market Signals */}
                        <Card className="bg-slate-900 border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white flex items-center gap-2">
                                    <Zap className="w-5 h-5 text-amber-400" />
                                    Señales del Mercado
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {globalData && (
                                    <>
                                        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/30">
                                            <TrendingUp className={`w-5 h-5 ${mcapChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
                                            <div>
                                                <p className="text-white text-sm font-medium">
                                                    Mercado crypto {mcapChange >= 0 ? 'en alza' : 'en baja'} ({mcapChange >= 0 ? '+' : ''}{mcapChange.toFixed(2)}%)
                                                </p>
                                                <p className="text-xs text-slate-500">Market cap global: {formatNumber(globalData.total_market_cap?.usd)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/30">
                                            <BarChart3 className="w-5 h-5 text-cyan-400" />
                                            <div>
                                                <p className="text-white text-sm font-medium">
                                                    Volumen de mercado: {formatNumber(globalData.total_volume?.usd)}
                                                </p>
                                                <p className="text-xs text-slate-500">{(globalData.active_cryptocurrencies || 0).toLocaleString()} criptomonedas activas</p>
                                            </div>
                                        </div>
                                        {trending.length > 0 && (
                                            <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                                                <Flame className="w-5 h-5 text-orange-400" />
                                                <div>
                                                    <p className="text-white text-sm font-medium">
                                                        {trending.length} criptomonedas en tendencia ahora
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        Top: {trending.slice(0, 3).map(t => t.item?.symbol?.toUpperCase()).join(', ')}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}

                {/* Disclaimer */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <Shield className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-slate-500 leading-relaxed">
                            <strong className="text-slate-400">Aviso legal:</strong> La información presentada proviene de CoinGecko y es exclusivamente informativa. LIONSBIT VERIFICACION no ofrece asesoramiento financiero ni está habilitada para inversiones reales.
                        </p>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default LiveMarketNewsPage;
