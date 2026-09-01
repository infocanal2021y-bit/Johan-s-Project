import { useState, useEffect, useRef, useCallback } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
    Wallet, TrendingUp, TrendingDown, RefreshCw, Lock,
    Activity, BarChart3, Loader2, Wifi, WifiOff, AlertTriangle, DollarSign, ExternalLink
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const API_URL = '/api';

const CHART_COLORS = [
    '#f59e0b', '#6366f1', '#1973B8', '#8b5cf6', '#ef4444',
    '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#3b82f6'
];

const formatUSD = (val) => {
    if (!val || val === 0) return '$0.00';
    return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatPrice = (price) => {
    if (!price) return '$0';
    if (price >= 1000) return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return '$' + price.toFixed(4);
    return '$' + price.toFixed(6);
};

const formatQty = (qty) => {
    if (!qty) return '0';
    if (qty >= 10000) return qty.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (qty >= 1) return qty.toFixed(4);
    return qty.toFixed(8);
};

const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-xl">
                <p className="text-white text-sm font-medium">{data.name || data.coin}</p>
                <p className="text-emerald-400 text-sm font-mono">{formatUSD(data.value)}</p>
                <p className="text-slate-400 text-xs">{data.percentage}%</p>
            </div>
        );
    }
    return null;
};

export default function BinanceWalletPage() {
    const [wallet, setWallet] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [wsConnected, setWsConnected] = useState(false);
    const [livePrices, setLivePrices] = useState({});
    const [error, setError] = useState(null);
    const wsRef = useRef(null);
    const reconnectRef = useRef(null);

    const token = localStorage.getItem('token');

    const fetchWallet = useCallback(async (showRefresh = false) => {
        if (showRefresh) setRefreshing(true);
        try {
            const resp = await fetch(`${API_URL}/binance/wallet`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!resp.ok) throw new Error('Error al cargar wallet');
            const data = await resp.json();
            setWallet(data);
            setError(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [token]);

    useEffect(() => { fetchWallet(); }, [fetchWallet]);
    useEffect(() => {
        const interval = setInterval(() => fetchWallet(), 60000);
        return () => clearInterval(interval);
    }, [fetchWallet]);

    // Binance WebSocket for live price ticks
    const connectWs = useCallback(() => {
        if (wsRef.current) wsRef.current.close();
        const streams = ['btcusdt', 'ethusdt', 'bnbusdt', 'solusdt', 'xrpusdt', 'adausdt', 'dogeusdt', 'dotusdt', 'avaxusdt', 'linkusdt']
            .map(s => `${s}@miniTicker`).join('/');
        const ws = new WebSocket(`wss://stream.binance.us:9443/stream?streams=${streams}`);
        ws.onopen = () => setWsConnected(true);
        ws.onclose = () => {
            setWsConnected(false);
            reconnectRef.current = setTimeout(connectWs, 5000);
        };
        ws.onerror = () => setWsConnected(false);
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.data) {
                    const d = msg.data;
                    const MAP = {
                        'BTCUSDT': 'BTC', 'ETHUSDT': 'ETH', 'BNBUSDT': 'BNB',
                        'SOLUSDT': 'SOL', 'XRPUSDT': 'XRP', 'ADAUSDT': 'ADA',
                        'DOGEUSDT': 'DOGE', 'DOTUSDT': 'DOT', 'AVAXUSDT': 'AVAX',
                        'LINKUSDT': 'LINK',
                    };
                    const coin = MAP[d.s];
                    if (coin) setLivePrices(prev => ({ ...prev, [coin]: { price: parseFloat(d.c) } }));
                }
            } catch { /* ignore */ }
        };
        wsRef.current = ws;
    }, []);

    useEffect(() => {
        connectWs();
        return () => {
            if (wsRef.current) wsRef.current.close();
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
        };
    }, [connectWs]);

    // Merge live prices into wallet assets for display
    const getAssets = () => {
        if (!wallet?.assets) return [];
        return wallet.assets.map(a => {
            const livePrice = livePrices[a.coin]?.price;
            if (livePrice && wallet.total_value_usd > 0) {
                // Recalculate qty with live price
                const allocValue = a.value_usd; // stays same (allocation)
                const newQty = allocValue / livePrice;
                const availRatio = wallet.total_available_usd / wallet.total_value_usd;
                return {
                    ...a,
                    price: livePrice,
                    total: newQty,
                    available: newQty * availRatio,
                    locked: newQty * (1 - availRatio),
                };
            }
            return a;
        });
    };

    const assets = getAssets();
    const distribution = (wallet?.distribution || []).filter(d => d.value > 0);

    if (loading) {
        return (
            <Layout>
                <div className="flex items-center justify-center min-h-[60vh]">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="space-y-6 max-w-7xl mx-auto" data-testid="binance-wallet-page">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
                            <Wallet className="w-7 h-7 text-amber-400" />
                            Wallet / Activos
                        </h1>
                        <p className="text-slate-400 text-sm mt-1">Saldo real con precios de mercado en tiempo real</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                            wsConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'
                        }`} data-testid="ws-status">
                            {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                            {wsConnected ? 'En vivo' : 'Reconectando...'}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => window.location.href = '/bitcoin-outputs'}
                            className="border-slate-700 text-slate-300 hover:text-white" data-testid="blockchain-tools-btn">
                            <Lock className="w-4 h-4 mr-1.5" /> Herramientas Blockchain
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => fetchWallet(true)} disabled={refreshing}
                            className="border-slate-700 text-slate-300 hover:text-white" data-testid="refresh-wallet-btn">
                            <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} /> Actualizar
                        </Button>
                    </div>
                </div>

                {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        <p className="text-red-400 text-sm">{error}</p>
                    </div>
                )}

                {/* Summary: 2 cards only - Available & Locked */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Card className="bg-slate-900/70 border-slate-800" data-testid="available-value-card">
                        <CardContent className="p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                    <DollarSign className="w-5 h-5 text-emerald-400" />
                                </div>
                                <p className="text-slate-400 text-sm">Saldo Disponible</p>
                            </div>
                            <p className="text-3xl font-bold text-emerald-400 font-mono" data-testid="available-value">
                                {formatUSD(wallet?.total_available_usd)}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/70 border-slate-800" data-testid="locked-value-card">
                        <CardContent className="p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                                    <Lock className="w-5 h-5 text-orange-400" />
                                </div>
                                <p className="text-slate-400 text-sm">Saldo Bloqueado (Inversion)</p>
                            </div>
                            <p className="text-3xl font-bold text-orange-400 font-mono" data-testid="locked-value">
                                {formatUSD(wallet?.total_locked_usd)}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Distribution + Top Assets */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Donut Chart */}
                    <Card className="bg-slate-900/70 border-slate-800 lg:col-span-1" data-testid="distribution-chart">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-white text-base flex items-center gap-2">
                                <Activity className="w-4 h-4 text-indigo-400" />
                                Distribucion de Activos
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[220px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={distribution} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                                            paddingAngle={2} dataKey="value" stroke="none">
                                            {distribution.map((_, idx) => (
                                                <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-3">
                                {distribution.slice(0, 6).map((d, i) => (
                                    <div key={d.coin} className="flex items-center gap-2 text-xs">
                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                                        <span className="text-slate-400">{d.coin}</span>
                                        <span className="text-slate-500 ml-auto">{d.percentage}%</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Top Assets */}
                    <Card className="bg-slate-900/70 border-slate-800 lg:col-span-2" data-testid="top-assets-card">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-white text-base flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                                Top Activos
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {assets.slice(0, 5).map((asset, i) => (
                                    <div key={asset.coin} className="flex items-center gap-4 p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 transition-colors" data-testid={`top-asset-${asset.coin}`}>
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm" style={{ backgroundColor: `${CHART_COLORS[i]}20`, color: CHART_COLORS[i] }}>
                                            {asset.coin.slice(0, 2)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white font-medium text-sm">{asset.name}</p>
                                            <p className="text-slate-500 text-xs">{formatPrice(asset.price)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-white font-mono text-sm">{formatUSD(asset.value_usd)}</p>
                                            <div className={`flex items-center justify-end gap-1 text-xs ${asset.price_change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {asset.price_change_pct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                {asset.price_change_pct >= 0 ? '+' : ''}{asset.price_change_pct.toFixed(2)}%
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Asset Table */}
                <Card className="bg-slate-900/70 border-slate-800" data-testid="asset-list-card">
                    <CardHeader>
                        <CardTitle className="text-white text-base flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-amber-400" />
                            Equivalente en Criptomonedas
                        </CardTitle>
                        <p className="text-slate-500 text-xs mt-1">Su saldo convertido a equivalentes cripto segun precios actuales</p>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm" data-testid="asset-table">
                                <thead>
                                    <tr className="border-b border-slate-800">
                                        <th className="text-left text-slate-500 text-xs uppercase py-3 px-3">Activo</th>
                                        <th className="text-right text-slate-500 text-xs uppercase py-3 px-3">Precio</th>
                                        <th className="text-right text-slate-500 text-xs uppercase py-3 px-3">24h</th>
                                        <th className="text-right text-slate-500 text-xs uppercase py-3 px-3">Cantidad</th>
                                        <th className="text-right text-slate-500 text-xs uppercase py-3 px-3">Valor USD</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {assets.map((asset, i) => (
                                        <tr key={asset.coin} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors" data-testid={`asset-row-${asset.coin}`}>
                                            <td className="py-4 px-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: `${CHART_COLORS[i % CHART_COLORS.length]}20`, color: CHART_COLORS[i % CHART_COLORS.length] }}>
                                                        {asset.coin.slice(0, 2)}
                                                    </div>
                                                    <div>
                                                        <p className="text-white font-medium">{asset.coin}</p>
                                                        <p className="text-slate-500 text-xs">{asset.name}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 px-3 text-right text-white font-mono">{formatPrice(asset.price)}</td>
                                            <td className="py-4 px-3 text-right">
                                                <span className={`inline-flex items-center gap-1 text-xs font-medium ${asset.price_change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {asset.price_change_pct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                    {asset.price_change_pct >= 0 ? '+' : ''}{asset.price_change_pct.toFixed(2)}%
                                                </span>
                                            </td>
                                            <td className="py-4 px-3 text-right text-slate-300 font-mono text-xs">{formatQty(asset.total)} {asset.coin}</td>
                                            <td className="py-4 px-3 text-right text-white font-mono font-medium">{formatUSD(asset.value_usd)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                {/* Blockchain Verification Button */}
                <a
                    href="https://blockchair.com/bitcoin/blocks?q=guessed_miner(Unknown)"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="blockchain-verify-btn"
                    className="group block w-full p-[1px] rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:via-orange-400 hover:to-amber-500 transition-all duration-300 shadow-lg shadow-amber-500/10 hover:shadow-amber-500/25"
                >
                    <div className="flex items-center justify-center gap-3 px-6 py-4 rounded-[11px] bg-slate-950 group-hover:bg-slate-950/80 transition-colors">
                        <svg className="w-5 h-5 text-amber-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 3h-8l-2 4h12z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" />
                        </svg>
                        <span className="text-amber-400 font-semibold text-sm tracking-wide">
                            Ver transacciones verificadas en Blockchain
                        </span>
                        <ExternalLink className="w-4 h-4 text-amber-500/60 group-hover:text-amber-400 transition-colors flex-shrink-0" />
                    </div>
                </a>

                {/* Recommended Wallets Section */}
                <Card className="bg-slate-900/70 border-slate-800 overflow-hidden" data-testid="recommended-wallets-section">
                    <CardHeader className="pb-2 border-b border-slate-800">
                        <div className="space-y-2">
                            <CardTitle className="text-white text-lg flex items-center gap-2">
                                <Wallet className="w-5 h-5 text-emerald-400" />
                                Carteras recomendadas para transacciones
                            </CardTitle>
                            <h3 className="text-amber-400 font-semibold text-base">No tienes wallet? Creala en 2 minutos</h3>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                Selecciona una de las siguientes plataformas para crear tu wallet, recibir fondos y comenzar a operar en la red Bitcoin de forma segura.
                            </p>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[
                                { name: 'Binance', desc: 'Exchange global con la mayor liquidez del mercado. Ideal para comprar, vender y almacenar criptomonedas.', type: 'Exchange', level: 'Intermedio', url: 'https://www.binance.com', action: 'Crear cuenta', color: 'from-yellow-500 to-amber-600', badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
                                { name: 'Coinbase', desc: 'Plataforma regulada y facil de usar, perfecta para principiantes que inician en el mundo cripto.', type: 'Exchange', level: 'Basico', url: 'https://www.coinbase.com', action: 'Crear cuenta', color: 'from-blue-500 to-indigo-600', badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
                                { name: 'SafePal', desc: 'Wallet hardware y software con soporte multi-cadena. Maxima seguridad para tus activos digitales.', type: 'Wallet', level: 'Avanzado', url: 'https://www.safepal.com', action: 'Descargar', color: 'from-purple-500 to-violet-600', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
                                { name: 'Trust Wallet', desc: 'Wallet movil oficial de Binance. Soporta miles de tokens y conexion directa con dApps.', type: 'Wallet', level: 'Basico', url: 'https://trustwallet.com', action: 'Descargar', color: 'from-cyan-500 to-blue-600', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
                                { name: 'Exodus', desc: 'Wallet de escritorio y movil con interfaz elegante. Incluye exchange integrado y staking.', type: 'Wallet', level: 'Intermedio', url: 'https://www.exodus.com', action: 'Descargar', color: 'from-violet-500 to-purple-600', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
                                { name: 'Electrum', desc: 'Wallet de escritorio especializada en Bitcoin. Ligera, rapida y con funciones avanzadas.', type: 'Wallet', level: 'Avanzado', url: 'https://electrum.org', action: 'Descargar', color: 'from-sky-500 to-cyan-600', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
                                { name: 'Blockchain.com', desc: 'Plataforma web y movil con wallet integrada. Mas de 80 millones de wallets creadas globalmente.', type: 'Exchange', level: 'Basico', url: 'https://www.blockchain.com', action: 'Crear cuenta', color: 'from-teal-500 to-emerald-600', badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
                            ].map((w) => (
                                <div key={w.name} className="group flex flex-col rounded-xl border border-slate-800 bg-slate-800/30 hover:bg-slate-800/60 hover:border-slate-700 transition-all duration-200" data-testid={`wallet-card-${w.name.toLowerCase().replace(/\s|\./g, '-')}`}>
                                    <div className="p-4 flex-1 space-y-3">
                                        {/* Header */}
                                        <div className="flex items-start justify-between gap-2">
                                            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${w.color} flex items-center justify-center font-bold text-white text-sm shadow-lg`}>
                                                {w.name.slice(0, 2).toUpperCase()}
                                            </div>
                                            <div className="flex gap-1.5 flex-wrap justify-end">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${w.badge}`}>
                                                    {w.type}
                                                </span>
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border bg-slate-700/50 text-slate-400 border-slate-600">
                                                    {w.level}
                                                </span>
                                            </div>
                                        </div>
                                        {/* Name + Description */}
                                        <div>
                                            <p className="text-white font-semibold text-sm">{w.name}</p>
                                            <p className="text-slate-500 text-xs mt-1 leading-relaxed">{w.desc}</p>
                                        </div>
                                    </div>
                                    {/* Action */}
                                    <div className="px-4 pb-4">
                                        <a href={w.url} target="_blank" rel="noopener noreferrer"
                                            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gradient-to-r ${w.color} text-white text-xs font-semibold hover:opacity-90 transition-opacity shadow-md`}
                                            data-testid={`wallet-action-${w.name.toLowerCase().replace(/\s|\./g, '-')}`}
                                        >
                                            {w.action} <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Notice */}
                        <div className="mt-5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                            <p className="text-amber-400/80 text-xs leading-relaxed">
                                Se recomienda siempre descargar las aplicaciones desde sus sitios oficiales. La plataforma no gestiona fondos directamente.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Disclaimer */}
                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                    <p className="text-slate-500 text-xs text-center">
                        Precios en tiempo real via Binance. Los equivalentes en criptomonedas son una representacion de su saldo basada en precios actuales de mercado.
                        LIONSBIT VERIFICACION es exclusivamente informativa y no esta habilitada para inversiones reales ni trading.
                    </p>
                </div>
            </div>
        </Layout>
    );
}
