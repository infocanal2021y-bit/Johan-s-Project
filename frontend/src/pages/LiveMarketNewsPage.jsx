import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { marketAPI } from '../lib/api';
import {
    RefreshCw, Globe, Shield, Newspaper, ExternalLink,
    Clock, TrendingUp, Bitcoin, BarChart3
} from 'lucide-react';

const LiveMarketNewsPage = () => {
    const [articles, setArticles] = useState([]);
    const [category, setCategory] = useState('general');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchNews = useCallback(async (showRefresh = false) => {
        if (showRefresh) setRefreshing(true);
        else setLoading(true);
        try {
            const res = await marketAPI.getNews(category);
            setArticles(res.data || []);
        } catch {
            // keep previous data
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [category]);

    useEffect(() => {
        fetchNews();
        const interval = setInterval(() => fetchNews(), 300000);
        return () => clearInterval(interval);
    }, [fetchNews]);

    const formatDate = (ts) => {
        if (!ts) return '-';
        const d = new Date(ts * 1000);
        return d.toLocaleDateString('es-ES', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const timeSince = (ts) => {
        if (!ts) return '';
        const seconds = Math.floor(Date.now() / 1000 - ts);
        if (seconds < 60) return 'Hace un momento';
        if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)}m`;
        if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)}h`;
        return `Hace ${Math.floor(seconds / 86400)}d`;
    };

    const categories = [
        { key: 'general', label: 'General', icon: Globe },
        { key: 'crypto', label: 'Crypto', icon: Bitcoin },
        { key: 'forex', label: 'Forex', icon: TrendingUp },
        { key: 'merger', label: 'Fusiones', icon: BarChart3 },
    ];

    return (
        <Layout>
            <div className="space-y-6" data-testid="live-market-news">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-heading font-bold text-white">Noticias del Mercado</h1>
                        <p className="text-slate-500 mt-1">Noticias financieras en tiempo real via Finnhub</p>
                    </div>
                    <Button
                        onClick={() => fetchNews(true)}
                        variant="outline"
                        size="sm"
                        className="border-slate-700 text-slate-300 hover:bg-slate-800"
                        data-testid="refresh-news"
                    >
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
                    EN VIVO — Datos de Finnhub
                </div>

                {/* Category Tabs */}
                <div className="flex gap-2 flex-wrap" data-testid="news-categories">
                    {categories.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => setCategory(key)}
                            data-testid={`news-tab-${key}`}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                category === key
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                    : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-800 hover:text-slate-300'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {label}
                        </button>
                    ))}
                </div>

                {/* Articles */}
                {loading ? (
                    <div className="flex justify-center py-16">
                        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : articles.length === 0 ? (
                    <Card className="bg-slate-900 border-slate-800">
                        <CardContent className="py-16 text-center">
                            <Newspaper className="w-16 h-16 mx-auto text-slate-700 mb-4" />
                            <p className="text-slate-500 text-lg">No hay noticias disponibles</p>
                            <p className="text-slate-600 text-sm mt-1">Intenta con otra categoria o actualiza mas tarde</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {articles.map((article, idx) => (
                            <Card
                                key={article.id || idx}
                                className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors overflow-hidden group"
                                data-testid={`news-article-${idx}`}
                            >
                                <div className="flex flex-col h-full">
                                    {article.image && (
                                        <div className="h-40 overflow-hidden">
                                            <img
                                                src={article.image}
                                                alt=""
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                onError={(e) => { e.target.style.display = 'none'; }}
                                            />
                                        </div>
                                    )}
                                    <div className="p-4 flex flex-col flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 font-medium">
                                                {article.source}
                                            </span>
                                            {article.related && (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400">
                                                    {article.related.split(',')[0]}
                                                </span>
                                            )}
                                        </div>

                                        <h3 className="text-white font-medium text-sm leading-snug mb-2 line-clamp-2">
                                            {article.headline}
                                        </h3>

                                        <p className="text-slate-400 text-xs leading-relaxed mb-3 line-clamp-3 flex-1">
                                            {article.summary}
                                        </p>

                                        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-800">
                                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                <Clock className="w-3.5 h-3.5" />
                                                <span title={formatDate(article.datetime)}>
                                                    {timeSince(article.datetime)}
                                                </span>
                                            </div>
                                            <a
                                                href={article.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                                                data-testid={`news-link-${idx}`}
                                            >
                                                Leer mas
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Disclaimer */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <Shield className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-slate-500 leading-relaxed">
                            <strong className="text-slate-400">Aviso legal:</strong> Las noticias provienen de Finnhub y son exclusivamente informativas. LIONSBIT VERIFICACION no ofrece asesoramiento financiero ni esta habilitada para inversiones reales.
                        </p>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export { LiveMarketNewsPage };
export default LiveMarketNewsPage;
