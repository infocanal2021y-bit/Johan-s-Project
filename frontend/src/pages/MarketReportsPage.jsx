import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Newspaper, TrendingUp, TrendingDown, Clock, ExternalLink, BookOpen, BarChart3 } from 'lucide-react';

// Simulated market reports/news
const MARKET_REPORTS = [
    {
        id: 1,
        title: 'Bitcoin mantiene soporte clave en $65,000',
        summary: 'A pesar de la volatilidad reciente, BTC ha mostrado fuerza al mantener niveles críticos de soporte. Los analistas sugieren que esto podría señalar una próxima tendencia alcista.',
        category: 'Análisis Técnico',
        sentiment: 'bullish',
        date: '17 Mar 2026',
        readTime: '3 min',
    },
    {
        id: 2,
        title: 'Ethereum 2.0: Impacto en el ecosistema DeFi',
        summary: 'Las actualizaciones continuas de Ethereum están mejorando la escalabilidad y reduciendo costos de transacción, beneficiando a todo el ecosistema de finanzas descentralizadas.',
        category: 'Tecnología',
        sentiment: 'bullish',
        date: '16 Mar 2026',
        readTime: '5 min',
    },
    {
        id: 3,
        title: 'Regulaciones cripto: Panorama global 2026',
        summary: 'Los principales mercados financieros avanzan en la regulación de criptomonedas. Europa y EE.UU. lideran con marcos regulatorios más claros.',
        category: 'Regulación',
        sentiment: 'neutral',
        date: '15 Mar 2026',
        readTime: '4 min',
    },
    {
        id: 4,
        title: 'Solana registra récord de transacciones',
        summary: 'La blockchain de Solana procesó más de 50 millones de transacciones en un solo día, demostrando su capacidad de escalamiento.',
        category: 'Noticias',
        sentiment: 'bullish',
        date: '14 Mar 2026',
        readTime: '2 min',
    },
    {
        id: 5,
        title: 'Advertencia: Volatilidad esperada esta semana',
        summary: 'Con decisiones de la Fed y datos económicos importantes, los analistas esperan movimientos significativos en los mercados de criptomonedas.',
        category: 'Mercado',
        sentiment: 'bearish',
        date: '13 Mar 2026',
        readTime: '3 min',
    },
    {
        id: 6,
        title: 'Adopción institucional de Bitcoin aumenta 40%',
        summary: 'Nuevos datos revelan un aumento significativo en la adopción de Bitcoin por parte de instituciones financieras durante el primer trimestre de 2026.',
        category: 'Institucional',
        sentiment: 'bullish',
        date: '12 Mar 2026',
        readTime: '4 min',
    },
];

const MARKET_INSIGHTS = [
    {
        title: 'Índice de Miedo y Codicia',
        value: 72,
        label: 'Codicia',
        color: 'emerald',
        description: 'El mercado muestra sentimiento optimista'
    },
    {
        title: 'Dominancia Bitcoin',
        value: 52.4,
        label: '52.4%',
        color: 'orange',
        description: 'BTC domina más de la mitad del mercado'
    },
    {
        title: 'Volumen 24h',
        value: 85,
        label: '$85B',
        color: 'blue',
        description: 'Volumen total del mercado cripto'
    },
    {
        title: 'Altcoin Season',
        value: 45,
        label: '45/100',
        color: 'purple',
        description: 'Tendencia moderada hacia altcoins'
    },
];

export const MarketReportsPage = () => {
    const [selectedCategory, setSelectedCategory] = useState('all');

    const categories = ['all', 'Análisis Técnico', 'Tecnología', 'Regulación', 'Noticias', 'Mercado', 'Institucional'];

    const filteredReports = selectedCategory === 'all'
        ? MARKET_REPORTS
        : MARKET_REPORTS.filter(r => r.category === selectedCategory);

    const getSentimentColor = (sentiment) => {
        switch (sentiment) {
            case 'bullish': return 'text-emerald-400';
            case 'bearish': return 'text-red-400';
            default: return 'text-slate-400';
        }
    };

    const getSentimentIcon = (sentiment) => {
        switch (sentiment) {
            case 'bullish': return TrendingUp;
            case 'bearish': return TrendingDown;
            default: return BarChart3;
        }
    };

    const getColorClasses = (color) => {
        const colors = {
            emerald: { bg: 'bg-emerald-500', bgLight: 'bg-emerald-500/20', text: 'text-emerald-400' },
            orange: { bg: 'bg-orange-500', bgLight: 'bg-orange-500/20', text: 'text-orange-400' },
            blue: { bg: 'bg-blue-500', bgLight: 'bg-blue-500/20', text: 'text-blue-400' },
            purple: { bg: 'bg-purple-500', bgLight: 'bg-purple-500/20', text: 'text-purple-400' },
        };
        return colors[color] || colors.blue;
    };

    return (
        <Layout>
            <div className="space-y-6" data-testid="market-reports-page">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                        Reportes del Mercado
                    </h1>
                    <p className="text-slate-500 mt-1 font-light">
                        Análisis y noticias del mercado de criptomonedas (contenido simulado)
                    </p>
                </motion.div>

                {/* Market Insights */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="grid grid-cols-2 md:grid-cols-4 gap-4"
                >
                    {MARKET_INSIGHTS.map((insight, index) => {
                        const colors = getColorClasses(insight.color);
                        return (
                            <Card key={index} className={`${colors.bgLight} border-slate-800`}>
                                <CardContent className="p-4">
                                    <p className="text-sm text-slate-400">{insight.title}</p>
                                    <div className="flex items-end gap-2 mt-2">
                                        <p className={`text-2xl ${colors.text}`} style={{ fontWeight: 700 }}>
                                            {insight.label}
                                        </p>
                                    </div>
                                    {/* Progress bar */}
                                    <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${insight.value}%` }}
                                            transition={{ delay: 0.3 + index * 0.1, duration: 0.5 }}
                                            className={`h-full ${colors.bg} rounded-full`}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">{insight.description}</p>
                                </CardContent>
                            </Card>
                        );
                    })}
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
                            onClick={() => setSelectedCategory(category)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                selectedCategory === category
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:bg-slate-700'
                            }`}
                        >
                            {category === 'all' ? 'Todos' : category}
                        </button>
                    ))}
                </motion.div>

                {/* Reports Grid */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                    {filteredReports.map((report, index) => {
                        const SentimentIcon = getSentimentIcon(report.sentiment);

                        return (
                            <motion.div
                                key={report.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 + index * 0.05 }}
                            >
                                <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800 hover:border-slate-700 transition-colors cursor-pointer h-full">
                                    <CardContent className="p-6">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-xs px-2 py-1 rounded-full bg-slate-800 text-slate-400">
                                                        {report.category}
                                                    </span>
                                                    <SentimentIcon className={`w-4 h-4 ${getSentimentColor(report.sentiment)}`} />
                                                </div>
                                                <h3 className="text-lg text-white font-semibold mb-2">
                                                    {report.title}
                                                </h3>
                                                <p className="text-sm text-slate-400 line-clamp-3">
                                                    {report.summary}
                                                </p>
                                                <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {report.readTime}
                                                    </span>
                                                    <span>{report.date}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        );
                    })}
                </motion.div>

                {/* Educational Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                >
                    <Card className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/30">
                        <CardHeader>
                            <CardTitle className="text-cyan-400 flex items-center gap-2" style={{ fontWeight: 700 }}>
                                <BookOpen className="w-5 h-5" />
                                Centro de Aprendizaje
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[
                                { title: '¿Qué es Bitcoin?', desc: 'Introducción a la primera criptomoneda' },
                                { title: 'DeFi Explicado', desc: 'Guía de finanzas descentralizadas' },
                                { title: 'Análisis Técnico', desc: 'Cómo leer gráficos de precios' },
                            ].map((item, index) => (
                                <div
                                    key={index}
                                    className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-cyan-500/30 transition-colors cursor-pointer"
                                >
                                    <p className="text-white font-medium">{item.title}</p>
                                    <p className="text-slate-500 text-sm mt-1">{item.desc}</p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Disclaimer */}
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <p className="text-amber-400 text-sm">
                        <strong>Aviso:</strong> El contenido de esta sección es simulado y solo con fines educativos. No constituye asesoramiento financiero ni recomendaciones de inversión.
                    </p>
                </div>
            </div>
        </Layout>
    );
};

export default MarketReportsPage;
