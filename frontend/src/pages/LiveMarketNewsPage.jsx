import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { 
    Newspaper, TrendingUp, TrendingDown, Clock, Zap, 
    Droplet, CircleDollarSign, Bitcoin, BarChart3, RefreshCw, 
    Globe, AlertCircle, Sparkles
} from 'lucide-react';

// Simulated live market news
const LIVE_NEWS = [
    {
        id: 1,
        title: 'Bitcoin alcanza nuevo máximo mensual en $68,500',
        summary: 'La criptomoneda líder continúa su rally alcista impulsada por la demanda institucional y la anticipación del halving.',
        category: 'Criptomonedas',
        asset: 'BTC',
        trend: 'up',
        change: '+5.2%',
        time: '2 min',
        priority: 'high',
        icon: Bitcoin
    },
    {
        id: 2,
        title: 'Petróleo sube 2.8% por tensiones en Medio Oriente',
        summary: 'Los precios del crudo Brent superan los $85 por barril ante preocupaciones geopolíticas que afectan el suministro global.',
        category: 'Commodities',
        asset: 'OIL',
        trend: 'up',
        change: '+2.8%',
        time: '15 min',
        priority: 'high',
        icon: Droplet
    },
    {
        id: 3,
        title: 'Oro mantiene nivel de $2,150 como refugio seguro',
        summary: 'El metal precioso se estabiliza cerca de máximos históricos mientras los inversores buscan protección ante la incertidumbre.',
        category: 'Metales',
        asset: 'GOLD',
        trend: 'stable',
        change: '+0.3%',
        time: '32 min',
        priority: 'medium',
        icon: CircleDollarSign
    },
    {
        id: 4,
        title: 'Ethereum supera los $3,500 tras actualización exitosa',
        summary: 'La red Ethereum completa una actualización técnica que mejora la escalabilidad y reduce las tarifas de gas.',
        category: 'Criptomonedas',
        asset: 'ETH',
        trend: 'up',
        change: '+4.1%',
        time: '45 min',
        priority: 'high',
        icon: Bitcoin
    },
    {
        id: 5,
        title: 'S&P 500 cierra en verde por tercera sesión consecutiva',
        summary: 'Las acciones tecnológicas lideran las ganancias mientras los inversores digieren datos económicos positivos.',
        category: 'Acciones',
        asset: 'SP500',
        trend: 'up',
        change: '+1.2%',
        time: '1 hora',
        priority: 'medium',
        icon: BarChart3
    },
    {
        id: 6,
        title: 'Gas natural cae 5% por inventarios elevados',
        summary: 'Los futuros de gas natural retroceden ante niveles de almacenamiento superiores al promedio histórico.',
        category: 'Commodities',
        asset: 'GAS',
        trend: 'down',
        change: '-5.1%',
        time: '2 horas',
        priority: 'medium',
        icon: Droplet
    },
    {
        id: 7,
        title: 'Solana registra volumen récord en DEX',
        summary: 'La blockchain de Solana procesa más de $2B en intercambios descentralizados en las últimas 24 horas.',
        category: 'Criptomonedas',
        asset: 'SOL',
        trend: 'up',
        change: '+8.3%',
        time: '3 horas',
        priority: 'high',
        icon: Bitcoin
    },
    {
        id: 8,
        title: 'Plata sube impulsada por demanda industrial',
        summary: 'El metal plateado gana terreno ante el aumento de la demanda del sector de energía solar.',
        category: 'Metales',
        asset: 'SILVER',
        trend: 'up',
        change: '+2.1%',
        time: '4 horas',
        priority: 'low',
        icon: CircleDollarSign
    },
];

// Live market prices
const MARKET_PRICES = [
    { symbol: 'BTC', name: 'Bitcoin', price: 67845.32, change: 5.2, icon: '₿', color: 'orange' },
    { symbol: 'ETH', name: 'Ethereum', price: 3521.45, change: 4.1, icon: 'Ξ', color: 'blue' },
    { symbol: 'OIL', name: 'Petróleo WTI', price: 85.42, change: 2.8, icon: '🛢️', color: 'slate' },
    { symbol: 'GOLD', name: 'Oro', price: 2152.80, change: 0.3, icon: '🥇', color: 'yellow' },
    { symbol: 'SP500', name: 'S&P 500', price: 5234.18, change: 1.2, icon: '📈', color: 'green' },
    { symbol: 'EUR/USD', name: 'EUR/USD', price: 1.0842, change: -0.15, icon: '💱', color: 'cyan' },
];

export const LiveMarketNewsPage = () => {
    const [news, setNews] = useState(LIVE_NEWS);
    const [prices, setPrices] = useState(MARKET_PRICES);
    const [lastUpdate, setLastUpdate] = useState(new Date());
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [filter, setFilter] = useState('all');
    const [marketSummary, setMarketSummary] = useState('');

    // Generate AI-style market summary
    const generateMarketSummary = useCallback(() => {
        const btcTrend = prices.find(p => p.symbol === 'BTC')?.change > 0 ? 'alcista' : 'bajista';
        const oilTrend = prices.find(p => p.symbol === 'OIL')?.change > 0 ? 'al alza' : 'a la baja';
        const goldStatus = prices.find(p => p.symbol === 'GOLD')?.change > 0 ? 'en territorio positivo' : 'estable';
        
        const summaries = [
            `📊 Hoy el mercado muestra una tendencia ${btcTrend} en criptomonedas, con Bitcoin liderando las ganancias. El petróleo continúa ${oilTrend} por tensiones geopolíticas, mientras el oro se mantiene ${goldStatus} como activo refugio.`,
            `🌍 Los mercados globales operan con optimismo. Las criptomonedas registran momentum positivo, el sector energético muestra fortaleza con el petróleo ${oilTrend}, y los metales preciosos mantienen su atractivo defensivo.`,
            `💹 Sesión activa en los mercados financieros. Bitcoin y Ethereum lideran el rally cripto, el crudo WTI se fortalece, y los índices bursátiles estadounidenses extienden sus ganancias semanales.`,
        ];
        
        return summaries[Math.floor(Math.random() * summaries.length)];
    }, [prices]);

    useEffect(() => {
        setMarketSummary(generateMarketSummary());
        
        // Simulate price updates every 15 seconds
        const interval = setInterval(() => {
            setPrices(prev => prev.map(p => ({
                ...p,
                price: p.price * (1 + (Math.random() - 0.5) * 0.001),
                change: p.change + (Math.random() - 0.5) * 0.1
            })));
            setLastUpdate(new Date());
        }, 15000);

        return () => clearInterval(interval);
    }, [generateMarketSummary]);

    const handleRefresh = () => {
        setIsRefreshing(true);
        setPrices(prev => prev.map(p => ({
            ...p,
            price: p.price * (1 + (Math.random() - 0.5) * 0.002),
            change: p.change + (Math.random() - 0.5) * 0.3
        })));
        setMarketSummary(generateMarketSummary());
        setLastUpdate(new Date());
        setTimeout(() => setIsRefreshing(false), 500);
    };

    const filteredNews = filter === 'all' 
        ? news 
        : news.filter(n => n.category === filter);

    const categories = ['all', 'Criptomonedas', 'Commodities', 'Acciones', 'Metales'];

    const getColorClass = (color) => {
        const colors = {
            orange: 'text-orange-400 bg-orange-500/20',
            blue: 'text-blue-400 bg-blue-500/20',
            yellow: 'text-yellow-400 bg-yellow-500/20',
            green: 'text-green-400 bg-green-500/20',
            slate: 'text-slate-400 bg-slate-500/20',
            cyan: 'text-cyan-400 bg-cyan-500/20',
        };
        return colors[color] || colors.blue;
    };

    return (
        <Layout>
            <div className="space-y-6" data-testid="live-market-news-page">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                    <div>
                        <h1 className="text-3xl text-white flex items-center gap-3" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                            <Newspaper className="w-8 h-8 text-red-400" />
                            Noticias en Vivo
                            <span className="flex items-center gap-1 px-2 py-1 bg-red-500/20 rounded-full text-red-400 text-sm animate-pulse">
                                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                                LIVE
                            </span>
                        </h1>
                        <p className="text-slate-500 mt-1 font-light">
                            Noticias del mercado financiero internacional en tiempo real
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-500">
                            Última actualización: {lastUpdate.toLocaleTimeString()}
                        </span>
                        <button
                            onClick={handleRefresh}
                            className="p-2 rounded-lg bg-slate-800/50 border border-slate-700 hover:bg-slate-700 transition-colors"
                        >
                            <RefreshCw className={`w-5 h-5 text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </motion.div>

                {/* Live Price Ticker */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="overflow-hidden"
                >
                    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                        {prices.map((price, index) => (
                            <motion.div
                                key={price.symbol}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.1 + index * 0.05 }}
                                className={`flex-shrink-0 p-4 rounded-lg border ${getColorClass(price.color)} border-slate-700 min-w-[180px]`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-2xl">{price.icon}</span>
                                    {price.change >= 0 ? (
                                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                                    ) : (
                                        <TrendingDown className="w-4 h-4 text-red-400" />
                                    )}
                                </div>
                                <p className="text-white font-medium mt-2">{price.name}</p>
                                <p className="text-xl text-white" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                    ${price.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                                <p className={`text-sm ${price.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {price.change >= 0 ? '+' : ''}{price.change.toFixed(2)}%
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>

                {/* AI Market Summary */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                >
                    <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30">
                        <CardContent className="p-6">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                                    <Sparkles className="w-6 h-6 text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="text-purple-400 font-semibold flex items-center gap-2">
                                        Resumen Automático del Mercado
                                        <span className="text-xs px-2 py-0.5 bg-purple-500/20 rounded">AI</span>
                                    </h3>
                                    <p className="text-white mt-2 text-lg leading-relaxed">
                                        {marketSummary}
                                    </p>
                                    <p className="text-purple-400/60 text-xs mt-3">
                                        Generado automáticamente · {lastUpdate.toLocaleTimeString()}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Category Filter */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-wrap gap-2"
                >
                    {categories.map((category) => (
                        <button
                            key={category}
                            onClick={() => setFilter(category)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                filter === category
                                    ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                                    : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:border-slate-600'
                            }`}
                        >
                            {category === 'all' ? 'Todas' : category}
                        </button>
                    ))}
                </motion.div>

                {/* News Feed */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="space-y-4"
                >
                    <AnimatePresence>
                        {filteredNews.map((item, index) => {
                            const IconComponent = item.icon;
                            
                            return (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ delay: index * 0.05 }}
                                >
                                    <Card className={`bg-slate-900/70 backdrop-blur-xl border-slate-800 hover:border-slate-700 transition-all cursor-pointer ${
                                        item.priority === 'high' ? 'border-l-4 border-l-red-500' : ''
                                    }`}>
                                        <CardContent className="p-6">
                                            <div className="flex items-start gap-4">
                                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                                    item.trend === 'up' ? 'bg-emerald-500/20' :
                                                    item.trend === 'down' ? 'bg-red-500/20' : 'bg-slate-500/20'
                                                }`}>
                                                    <IconComponent className={`w-6 h-6 ${
                                                        item.trend === 'up' ? 'text-emerald-400' :
                                                        item.trend === 'down' ? 'text-red-400' : 'text-slate-400'
                                                    }`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                                                                    {item.category}
                                                                </span>
                                                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                                                    item.trend === 'up' ? 'bg-emerald-500/20 text-emerald-400' :
                                                                    item.trend === 'down' ? 'bg-red-500/20 text-red-400' :
                                                                    'bg-slate-500/20 text-slate-400'
                                                                }`}>
                                                                    {item.asset} {item.change}
                                                                </span>
                                                                {item.priority === 'high' && (
                                                                    <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400 flex items-center gap-1">
                                                                        <Zap className="w-3 h-3" />
                                                                        Urgente
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <h3 className="text-lg text-white font-semibold">
                                                                {item.title}
                                                            </h3>
                                                            <p className="text-slate-400 mt-2 text-sm">
                                                                {item.summary}
                                                            </p>
                                                        </div>
                                                        <div className="text-right flex-shrink-0">
                                                            {item.trend === 'up' ? (
                                                                <TrendingUp className="w-8 h-8 text-emerald-400" />
                                                            ) : item.trend === 'down' ? (
                                                                <TrendingDown className="w-8 h-8 text-red-400" />
                                                            ) : (
                                                                <BarChart3 className="w-8 h-8 text-slate-400" />
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />
                                                            Hace {item.time}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <Globe className="w-3 h-3" />
                                                            Internacional
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </motion.div>

                {/* Breaking News Alert */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <Card className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border-red-500/30">
                        <CardContent className="p-4 flex items-center gap-4">
                            <AlertCircle className="w-6 h-6 text-red-400 animate-pulse" />
                            <div className="flex-1">
                                <p className="text-red-400 font-semibold">Alertas Activas</p>
                                <p className="text-slate-400 text-sm">
                                    Recibirás notificaciones cuando ocurran movimientos significativos en el mercado.
                                </p>
                            </div>
                            <button className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors">
                                Configurar
                            </button>
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

export default LiveMarketNewsPage;
