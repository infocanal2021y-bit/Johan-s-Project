import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { 
    TrendingUp, 
    TrendingDown, 
    Activity,
    BarChart3,
    Loader2
} from 'lucide-react';

// Trading pairs configuration
const TRADING_PAIRS = [
    { symbol: 'BINANCE:BTCUSDT', label: 'BTC/USDT', name: 'Bitcoin', icon: '₿' },
    { symbol: 'BINANCE:ETHUSDT', label: 'ETH/USDT', name: 'Ethereum', icon: 'Ξ' },
    { symbol: 'BINANCE:BNBUSDT', label: 'BNB/USDT', name: 'BNB', icon: 'BNB' },
];

// TradingView Widget Component
const TradingViewWidget = ({ symbol }) => {
    const containerRef = useRef(null);
    
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        
        // Clear previous widget
        container.innerHTML = '';
        
        // Create widget container
        const widgetContainer = document.createElement('div');
        widgetContainer.className = 'tradingview-widget-container';
        widgetContainer.style.height = '100%';
        widgetContainer.style.width = '100%';
        
        const widgetDiv = document.createElement('div');
        widgetDiv.className = 'tradingview-widget-container__widget';
        widgetDiv.style.height = '100%';
        widgetDiv.style.width = '100%';
        
        widgetContainer.appendChild(widgetDiv);
        container.appendChild(widgetContainer);
        
        // Create and load TradingView script
        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
        script.type = 'text/javascript';
        script.async = true;
        script.innerHTML = JSON.stringify({
            "autosize": true,
            "symbol": symbol,
            "interval": "1",
            "timezone": "Europe/Madrid",
            "theme": "dark",
            "style": "1",
            "locale": "es",
            "backgroundColor": "rgba(15, 23, 42, 1)",
            "gridColor": "rgba(30, 41, 59, 0.5)",
            "hide_top_toolbar": false,
            "hide_legend": false,
            "allow_symbol_change": false,
            "save_image": false,
            "calendar": false,
            "hide_volume": false,
            "support_host": "https://www.tradingview.com",
            "studies": [
                "Volume@tv-basicstudies"
            ],
            "show_popup_button": false,
            "popup_width": "1000",
            "popup_height": "650"
        });
        
        widgetContainer.appendChild(script);
        
        return () => {
            if (container) {
                container.innerHTML = '';
            }
        };
    }, [symbol]);
    
    return (
        <div 
            ref={containerRef} 
            className="w-full h-full min-h-[500px] lg:min-h-[600px]"
            data-testid="tradingview-widget"
        />
    );
};

// Mini Ticker Widget for price info
const MiniTickerWidget = ({ symbol }) => {
    const containerRef = useRef(null);
    
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        
        container.innerHTML = '';
        
        const widgetContainer = document.createElement('div');
        widgetContainer.className = 'tradingview-widget-container';
        
        const widgetDiv = document.createElement('div');
        widgetDiv.className = 'tradingview-widget-container__widget';
        
        widgetContainer.appendChild(widgetDiv);
        container.appendChild(widgetContainer);
        
        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js';
        script.type = 'text/javascript';
        script.async = true;
        script.innerHTML = JSON.stringify({
            "symbol": symbol,
            "width": "100%",
            "isTransparent": true,
            "colorTheme": "dark",
            "locale": "es"
        });
        
        widgetContainer.appendChild(script);
        
        return () => {
            if (container) {
                container.innerHTML = '';
            }
        };
    }, [symbol]);
    
    return <div ref={containerRef} className="w-full" />;
};

export const RealTimeMarketPage = () => {
    const [selectedPair, setSelectedPair] = useState(TRADING_PAIRS[0]);
    const [isLoading, setIsLoading] = useState(false);
    
    const handlePairChange = (pair) => {
        if (pair.symbol === selectedPair.symbol) return;
        setIsLoading(true);
        setSelectedPair(pair);
        // Small delay to show loading state
        setTimeout(() => setIsLoading(false), 500);
    };
    
    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-6" data-testid="realtime-market-page">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-4"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                            <Activity className="w-6 h-6 text-emerald-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                                Mercado en Tiempo Real
                            </h1>
                            <p className="text-slate-500 text-sm font-light">
                                Gráficos profesionales con datos de Binance
                            </p>
                        </div>
                    </div>
                </motion.div>
                
                {/* Trading Pair Selector */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="flex flex-wrap gap-2 sm:gap-3"
                >
                    {TRADING_PAIRS.map((pair) => (
                        <Button
                            key={pair.symbol}
                            onClick={() => handlePairChange(pair)}
                            variant={selectedPair.symbol === pair.symbol ? "default" : "outline"}
                            className={`
                                flex items-center gap-2 px-4 py-3 min-h-[48px] text-sm sm:text-base
                                transition-all duration-200 touch-manipulation
                                ${selectedPair.symbol === pair.symbol 
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600' 
                                    : 'bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-slate-600'
                                }
                            `}
                            data-testid={`pair-btn-${pair.label.replace('/', '-')}`}
                        >
                            <span className="text-lg font-bold">{pair.icon}</span>
                            <span className="font-medium">{pair.label}</span>
                        </Button>
                    ))}
                </motion.div>
                
                {/* Price Info Card */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800 overflow-hidden">
                        <CardContent className="p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                                        <span className="text-2xl font-bold text-amber-400">{selectedPair.icon}</span>
                                    </div>
                                    <div>
                                        <h2 className="text-xl sm:text-2xl text-white font-bold">{selectedPair.name}</h2>
                                        <p className="text-slate-400 text-sm">{selectedPair.label} • Binance</p>
                                    </div>
                                </div>
                                
                                {/* TradingView Mini Ticker */}
                                <div className="flex-1 max-w-md">
                                    <MiniTickerWidget symbol={selectedPair.symbol} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
                
                {/* TradingView Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800 overflow-hidden">
                        <CardContent className="p-0 relative">
                            {isLoading && (
                                <div className="absolute inset-0 bg-slate-900/80 z-10 flex items-center justify-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                                        <p className="text-slate-400 text-sm">Cargando grafico...</p>
                                    </div>
                                </div>
                            )}
                            <div className="h-[500px] sm:h-[550px] lg:h-[600px]">
                                <TradingViewWidget symbol={selectedPair.symbol} />
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
                
                {/* Info Cards */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="grid grid-cols-1 sm:grid-cols-3 gap-4"
                >
                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                                <BarChart3 className="w-5 h-5 text-cyan-400" />
                            </div>
                            <div>
                                <p className="text-slate-400 text-xs">Intervalo</p>
                                <p className="text-white font-medium">1 Minuto</p>
                            </div>
                        </CardContent>
                    </Card>
                    
                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                <Activity className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-slate-400 text-xs">Fuente</p>
                                <p className="text-white font-medium">Binance</p>
                            </div>
                        </CardContent>
                    </Card>
                    
                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                                <TrendingUp className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                                <p className="text-slate-400 text-xs">Tipo</p>
                                <p className="text-white font-medium">Velas (Candlestick)</p>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
                
                {/* Disclaimer */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30"
                >
                    <p className="text-amber-400 text-sm">
                        <strong>⚠️ Aviso Importante:</strong> Los datos mostrados en esta plataforma relacionados con mercados financieros y criptomonedas son únicamente informativos. No constituyen asesoramiento financiero ni representan una invitación a invertir. La plataforma no está habilitada para realizar inversiones.
                    </p>
                </motion.div>
            </div>
        </Layout>
    );
};

export default RealTimeMarketPage;
