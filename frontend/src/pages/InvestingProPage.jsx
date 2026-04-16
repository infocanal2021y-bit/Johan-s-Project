import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
    Brain, Target, BarChart3, MessageSquare, TrendingUp, ExternalLink,
    Zap, ShieldCheck, LineChart, PieChart, DollarSign, Star, Lock,
    ArrowRight, CheckCircle, Sparkles
} from 'lucide-react';

const FEATURES = [
    {
        id: 'propicks',
        name: 'ProPicks IA',
        subtitle: 'Carteras con Inteligencia Artificial',
        description: 'Carteras generadas por inteligencia artificial que buscan superar a los indices de mercado. El algoritmo analiza miles de acciones y selecciona las mas prometedoras basandose en datos historicos, fundamentales y tecnicos.',
        icon: Brain,
        color: '#8B5CF6',
        highlights: [
            'Seleccion automatica de acciones de alto potencial',
            'Rebalanceo mensual basado en datos',
            'Rendimiento historico superior a los indices',
            'Diversificacion inteligente por sectores',
        ],
    },
    {
        id: 'fairvalue',
        name: 'Valor Razonable (Fair Value)',
        subtitle: 'Valoracion Intrinseca de Acciones',
        description: 'Calcula el valor intrinseco de una accion para saber si esta cara o barata. Utiliza multiples modelos de valoracion (DCF, comparables, dividendos) para determinar el precio justo de cualquier activo.',
        icon: Target,
        color: '#10B981',
        highlights: [
            'Modelos DCF, comparables y dividendos',
            'Indicador visual: Infravalorada / Sobrevalorada',
            'Margenes de seguridad calculados',
            'Actualizacion en tiempo real',
        ],
    },
    {
        id: 'fundamental',
        name: 'Analisis Fundamental',
        subtitle: 'Datos Financieros Detallados',
        description: 'Datos detallados financieros, dividendos, noticias y comparacion con empresas similares (peers). Todo lo que necesitas para tomar decisiones informadas sobre cualquier empresa cotizada.',
        icon: BarChart3,
        color: '#F59E0B',
        highlights: [
            'Balances, estados de resultados y flujo de caja',
            'Historial de dividendos y proyecciones',
            'Comparacion con empresas del sector',
            'Ratios financieros clave (P/E, EV/EBITDA, ROE)',
        ],
    },
    {
        id: 'warrenai',
        name: 'WarrenAI',
        subtitle: 'IA Generativa Financiera',
        description: 'Una IA generativa enfocada en finanzas que analiza acciones y responde preguntas financieras especificas. Inspirada en los principios de inversion de Warren Buffett, ofrece analisis profundo en lenguaje natural.',
        icon: MessageSquare,
        color: '#06B6D4',
        highlights: [
            'Preguntas en lenguaje natural sobre acciones',
            'Analisis comparativo entre empresas',
            'Resumen de earnings y eventos clave',
            'Recomendaciones basadas en tu perfil',
        ],
    },
];

const STATS = [
    { label: 'Acciones Cubiertas', value: '135,000+', icon: LineChart },
    { label: 'Mercados Globales', value: '70+', icon: PieChart },
    { label: 'Modelos de Valoracion', value: '14', icon: Target },
    { label: 'Usuarios Pro', value: '3M+', icon: Star },
];

const FeatureCard = ({ feature, index }) => {
    const Icon = feature.icon;
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
        >
            <Card className="bg-slate-900/70 border-slate-800 hover:border-slate-700 transition-all duration-300 h-full group" data-testid={`feature-${feature.id}`}>
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${feature.color}15`, border: `1px solid ${feature.color}30` }}>
                            <Icon className="w-6 h-6" style={{ color: feature.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-white font-bold text-lg">{feature.name}</h3>
                            <p className="text-sm mt-0.5" style={{ color: feature.color }}>{feature.subtitle}</p>
                        </div>
                    </div>

                    <p className="text-slate-400 text-sm leading-relaxed">{feature.description}</p>

                    <div className="space-y-2 pt-2">
                        {feature.highlights.map((h, i) => (
                            <div key={i} className="flex items-start gap-2">
                                <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: feature.color }} />
                                <span className="text-slate-300 text-xs leading-relaxed">{h}</span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
};

export const InvestingProPage = () => {
    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="investingpro-page">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-white flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[#FF6600]/20 flex items-center justify-center">
                                    <Zap className="w-5 h-5 text-[#FF6600]" />
                                </div>
                                InvestingPro
                            </h1>
                            <p className="text-slate-500 mt-2 max-w-2xl">Herramientas avanzadas de analisis utilizadas por inversores profesionales y traders de todo el mundo.</p>
                        </div>
                        <a href="https://www.investing.com/pro/" target="_blank" rel="noopener noreferrer">
                            <Button className="bg-[#FF6600] hover:bg-[#FF6600]/90 text-white font-bold shadow-lg shadow-[#FF6600]/20" data-testid="go-investingpro-btn">
                                <ExternalLink className="w-4 h-4 mr-2" /> Ir a InvestingPro
                            </Button>
                        </a>
                    </div>
                </motion.div>

                {/* Hero Card */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <Card className="bg-gradient-to-r from-slate-900 via-[#0f172a] to-[#FF6600]/10 border-[#FF6600]/20 overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-80 h-80 bg-[#FF6600]/5 rounded-full blur-[100px] translate-x-1/4 -translate-y-1/4" />
                        <CardContent className="p-6 md:p-8 relative">
                            <div className="flex flex-col lg:flex-row gap-8 items-start">
                                <div className="flex-1 space-y-4">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="w-5 h-5 text-[#FF6600]" />
                                        <span className="text-[#FF6600] text-xs font-bold uppercase tracking-wider">Plataforma de Referencia</span>
                                    </div>
                                    <h2 className="text-white text-2xl md:text-3xl font-bold leading-tight">
                                        La herramienta principal de los inversores profesionales
                                    </h2>
                                    <p className="text-slate-300 leading-relaxed">
                                        <strong className="text-white">InvestingPro</strong> es la plataforma de pago que ha ganado popularidad entre traders e inversores profesionales por sus funciones avanzadas de analisis, valoracion y seleccion de acciones impulsadas por inteligencia artificial.
                                    </p>
                                    <p className="text-slate-400 text-sm leading-relaxed">
                                        Integrada en el ecosistema <strong className="text-white">LIONSBIT 2.0</strong>, esta herramienta complementa nuestro modulo de trading demo con informacion y analisis de grado institucional.
                                    </p>
                                    <div className="flex flex-wrap gap-3 pt-2">
                                        <a href="https://www.investing.com/pro/" target="_blank" rel="noopener noreferrer">
                                            <Button className="bg-[#FF6600] hover:bg-[#FF6600]/90 text-white font-bold" data-testid="hero-investingpro-btn">
                                                <ExternalLink className="w-4 h-4 mr-2" /> Explorar InvestingPro
                                            </Button>
                                        </a>
                                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700">
                                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                                            <span className="text-slate-300 text-xs font-medium">Recomendado por LIONSBIT</span>
                                        </div>
                                    </div>
                                </div>
                                {/* Stats */}
                                <div className="grid grid-cols-2 gap-3 lg:w-[280px] flex-shrink-0">
                                    {STATS.map((s, i) => {
                                        const SI = s.icon;
                                        return (
                                            <div key={i} className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700/50">
                                                <SI className="w-5 h-5 text-[#FF6600] mx-auto mb-2" />
                                                <p className="text-white text-lg font-bold font-mono">{s.value}</p>
                                                <p className="text-slate-500 text-[10px] uppercase tracking-wider mt-0.5">{s.label}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Features Grid */}
                <div>
                    <h2 className="text-white font-bold text-xl mb-5 flex items-center gap-2">
                        <Brain className="w-5 h-5 text-[#FF6600]" /> Funciones Principales
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {FEATURES.map((f, i) => <FeatureCard key={f.id} feature={f} index={i} />)}
                    </div>
                </div>

                {/* CTA */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                    <Card className="bg-gradient-to-r from-[#FF6600]/10 to-slate-900 border-[#FF6600]/20">
                        <CardContent className="p-6 md:p-8 text-center space-y-4">
                            <Zap className="w-10 h-10 text-[#FF6600] mx-auto" />
                            <h3 className="text-white text-xl font-bold">Comienza a analizar como un profesional</h3>
                            <p className="text-slate-400 max-w-xl mx-auto text-sm leading-relaxed">
                                Accede a las mismas herramientas que utilizan los inversores institucionales. InvestingPro te ofrece datos, analisis y valoraciones para tomar decisiones informadas.
                            </p>
                            <div className="flex justify-center gap-3 pt-2">
                                <a href="https://www.investing.com/pro/" target="_blank" rel="noopener noreferrer">
                                    <Button className="bg-[#FF6600] hover:bg-[#FF6600]/90 text-white font-bold text-base px-8 py-3 h-auto" data-testid="cta-investingpro-btn">
                                        Ir a InvestingPro <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </a>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                <p className="text-slate-600 text-xs text-center pb-4">
                    InvestingPro es un producto de Investing.com. LIONSBIT no esta afiliada directamente a Investing.com. La informacion presentada es exclusivamente con fines informativos.
                </p>
            </div>
        </Layout>
    );
};

export default InvestingProPage;
