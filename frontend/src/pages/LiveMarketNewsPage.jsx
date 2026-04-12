import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { marketAPI } from '../lib/api';
import {
    RefreshCw, Globe, Shield, ExternalLink,
    Clock, TrendingUp, Bitcoin, Landmark, Newspaper, ImageOff
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const proxyImage = (url) => {
    if (!url) return '';
    return `${API_URL}/api/market/news/image-proxy?url=${encodeURIComponent(url)}`;
};

const categories = [
    { key: 'general', label: 'General', icon: Globe },
    { key: 'crypto', label: 'Crypto', icon: Bitcoin },
    { key: 'forex', label: 'Forex', icon: TrendingUp },
    { key: 'economy', label: 'Economia', icon: Landmark },
];

const timeSince = (isoDate) => {
    if (!isoDate) return '';
    const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
    if (seconds < 60) return 'Ahora';
    if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)}h`;
    return `Hace ${Math.floor(seconds / 86400)}d`;
};

const sourceColor = (source) => {
    const s = (source || '').toLowerCase();
    if (s.includes('reuters')) return 'bg-orange-100 text-orange-700';
    if (s.includes('bloomberg')) return 'bg-purple-100 text-purple-700';
    if (s.includes('investing')) return 'bg-blue-100 text-blue-700';
    if (s.includes('cnbc')) return 'bg-yellow-100 text-yellow-700';
    return 'bg-slate-100 text-slate-600';
};

const NewsCard = ({ article, featured = false }) => {
    const [imgError, setImgError] = useState(false);
    const hasImage = article.image && !imgError;

    if (featured && hasImage) {
        return (
            <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block col-span-full rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-lg transition-all duration-300 border border-slate-100"
                data-testid="news-featured"
            >
                <div className="grid grid-cols-1 md:grid-cols-2">
                    <div className="h-56 md:h-72 overflow-hidden">
                        <img
                            src={proxyImage(article.image)}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            onError={() => setImgError(true)}
                        />
                    </div>
                    <div className="p-6 md:p-8 flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-3">
                            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${sourceColor(article.source)}`}>
                                {article.source}
                            </span>
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {timeSince(article.datetime_iso)}
                            </span>
                        </div>
                        <h2 className="text-xl md:text-2xl font-bold text-slate-900 leading-tight mb-3 group-hover:text-[#14549C] transition-colors line-clamp-3">
                            {article.headline}
                        </h2>
                        <div className="flex items-center gap-1.5 text-[#14549C] font-semibold text-sm mt-auto">
                            Leer articulo completo
                            <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                    </div>
                </div>
            </a>
        );
    }

    return (
        <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-lg transition-all duration-300 border border-slate-100"
            data-testid="news-card"
        >
            {hasImage ? (
                <div className="h-44 overflow-hidden">
                    <img
                        src={proxyImage(article.image)}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={() => setImgError(true)}
                    />
                </div>
            ) : (
                <div className="h-32 bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center">
                    <ImageOff className="w-8 h-8 text-slate-300" />
                </div>
            )}
            <div className="p-5">
                <div className="flex items-center gap-2 mb-2.5">
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${sourceColor(article.source)}`}>
                        {article.source}
                    </span>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {timeSince(article.datetime_iso)}
                    </span>
                </div>
                <h3 className="text-[15px] font-bold text-slate-900 leading-snug mb-3 line-clamp-3 group-hover:text-[#14549C] transition-colors">
                    {article.headline}
                </h3>
                <div className="flex items-center gap-1 text-[#14549C] font-semibold text-xs">
                    Leer mas
                    <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
            </div>
        </a>
    );
};

const SkeletonCard = () => (
    <div className="rounded-2xl overflow-hidden bg-white shadow-sm border border-slate-100 animate-pulse">
        <div className="h-44 bg-slate-100" />
        <div className="p-5 space-y-3">
            <div className="flex gap-2">
                <div className="h-5 w-20 rounded-full bg-slate-100" />
                <div className="h-5 w-16 rounded-full bg-slate-100" />
            </div>
            <div className="h-4 w-full bg-slate-100 rounded" />
            <div className="h-4 w-3/4 bg-slate-100 rounded" />
            <div className="h-3 w-20 bg-slate-100 rounded" />
        </div>
    </div>
);

const LiveMarketNewsPage = () => {
    const [articles, setArticles] = useState([]);
    const [category, setCategory] = useState('general');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [animating, setAnimating] = useState(false);

    const fetchNews = useCallback(async (showRefresh = false) => {
        if (showRefresh) setRefreshing(true);
        else setLoading(true);
        try {
            const res = await marketAPI.getNews(category);
            setArticles(res.data || []);
        } catch {
            // keep previous
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [category]);

    useEffect(() => {
        setAnimating(true);
        fetchNews();
        const t = setTimeout(() => setAnimating(false), 400);
        const interval = setInterval(() => fetchNews(), 300000);
        return () => { clearInterval(interval); clearTimeout(t); };
    }, [fetchNews]);

    const handleCategoryChange = (key) => {
        if (key === category) return;
        setAnimating(true);
        setCategory(key);
    };

    const featured = articles[0];
    const rest = articles.slice(1);

    return (
        <Layout>
            <div className="min-h-screen -m-4 md:-m-6 lg:-m-8" style={{ background: '#F5F7FA' }}>
                <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 space-y-6" data-testid="live-market-news">

                    {/* Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-slate-900" style={{ fontFamily: "'Inter', sans-serif" }}>
                                Noticias del Mercado
                            </h1>
                            <p className="text-slate-500 text-sm mt-1">Noticias financieras en tiempo real via Investing.com</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                                EN VIVO
                            </div>
                            <Button
                                onClick={() => fetchNews(true)}
                                size="sm"
                                className="bg-[#14549C] hover:bg-[#0f3f7a] text-white rounded-full px-4 shadow-sm"
                                data-testid="refresh-news"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
                                Actualizar
                            </Button>
                        </div>
                    </div>

                    {/* Category Filters */}
                    <div className="flex gap-2 flex-wrap" data-testid="news-categories">
                        {categories.map(({ key, label, icon: Icon }) => (
                            <button
                                key={key}
                                onClick={() => handleCategoryChange(key)}
                                data-testid={`news-tab-${key}`}
                                className={`flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                                    category === key
                                        ? 'bg-[#14549C] text-white shadow-md shadow-blue-200/50'
                                        : 'bg-white text-slate-600 border border-slate-200 hover:border-[#14549C]/30 hover:text-[#14549C] shadow-sm'
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className={`transition-all duration-300 ${animating ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
                        {loading ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
                            </div>
                        ) : articles.length === 0 ? (
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 py-20 text-center">
                                <Newspaper className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                                <p className="text-slate-500 text-lg font-medium">No hay noticias disponibles</p>
                                <p className="text-slate-400 text-sm mt-1">Intenta con otra categoria o actualiza mas tarde</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                {/* Featured article */}
                                {featured && <NewsCard article={featured} featured={true} />}

                                {/* Rest */}
                                {rest.map((article, idx) => (
                                    <NewsCard key={article.id || idx} article={article} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Disclaimer */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                        <div className="flex items-start gap-3">
                            <Shield className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-slate-500 leading-relaxed">
                                <strong className="text-slate-600">Aviso legal:</strong> Las noticias provienen de Investing.com y son exclusivamente informativas. LIONSBIT VERIFICACION no ofrece asesoramiento financiero ni esta habilitada para inversiones reales.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export { LiveMarketNewsPage };
export default LiveMarketNewsPage;
