import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent } from '../components/ui/card';
import {
    Users, TrendingUp, Bitcoin, Globe, Briefcase, Clock, Lock,
    BarChart3, FileText, Bell, ChevronRight
} from 'lucide-react';

const ANALYSTS = [
    {
        id: 'lale',
        name: 'Lale Akoner',
        role: 'Estratega de Inversion Global',
        specialty: 'Macroeconomia & Multiactivos',
        description: 'Estratega de inversion y analista de mercados globales, experta en macroeconomia y soluciones multiactivos. Lidera el analisis de tendencias economicas internacionales para orientar decisiones de inversion a largo plazo.',
        experience: '15+ anos',
        icon: Globe,
        status: 'active',
        image: 'https://images.unsplash.com/photo-1765005204058-10418f5123c5?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1NzZ8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBidXNpbmVzcyUyMHdvbWFuJTIwaGVhZHNob3QlMjBjb3Jwb3JhdGV8ZW58MHx8fHwxNzc2MzExMzkxfDA&ixlib=rb-4.1.0&q=85&w=400',
        tags: ['Forex', 'Indices', 'Macroeconomia'],
    },
    {
        id: 'marc',
        name: 'Marc Touati',
        role: 'Economista y Asesor Senior',
        specialty: 'Economia Global & Tendencias',
        description: 'Reconocido economista y asesor economico que aporta analisis profundo sobre tendencias globales, politicas monetarias y su impacto en los mercados financieros. Referente en prevision economica.',
        experience: '20+ anos',
        icon: BarChart3,
        status: 'active',
        image: 'https://images.unsplash.com/photo-1741675121621-df90e3195f9d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODd8MHwxfHNlYXJjaHwzfHxwcm9mZXNzaW9uYWwlMjBidXNpbmVzcyUyMG1hbiUyMHN1aXQlMjBoZWFkc2hvdCUyMGZpbmFuY2V8ZW58MHx8fHwxNzc2MzExMzkxfDA&ixlib=rb-4.1.0&q=85&w=400',
        tags: ['Economia', 'Politica Monetaria', 'Prevision'],
    },
    {
        id: 'mati',
        name: 'Mati Alon',
        role: 'Editor Jefe de Analisis',
        specialty: 'Analisis de Valores & Estrategia',
        description: 'Editor jefe del equipo de analistas, con mas de 25 anos de experiencia en analisis de valores, renta variable y mercados emergentes. Coordina la estrategia de investigacion de la plataforma.',
        experience: '25+ anos',
        icon: TrendingUp,
        status: 'active',
        image: 'https://images.unsplash.com/photo-1738750908048-14200459c3c9?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBidXNpbmVzcyUyMG1hbiUyMHN1aXQlMjBoZWFkc2hvdCUyMGZpbmFuY2V8ZW58MHx8fHwxNzc2MzExMzkxfDA&ixlib=rb-4.1.0&q=85&w=400',
        tags: ['Renta Variable', 'Mercados Emergentes', 'Estrategia'],
    },
    {
        id: 'pawel',
        name: 'Pawel Majtkowski',
        role: 'Analista de Mercados Europeos',
        specialty: 'Mercados Europeos & Finanzas',
        description: 'Analista especializado en mercados europeos y finanzas personales. Proporciona cobertura detallada de activos europeos, analisis de divisas y recomendaciones adaptadas al perfil del inversor.',
        experience: '12+ anos',
        icon: Briefcase,
        status: 'active',
        image: 'https://images.unsplash.com/photo-1733348137468-90b917d2ebf1?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODd8MHwxfHNlYXJjaHwyfHxwcm9mZXNzaW9uYWwlMjBidXNpbmVzcyUyMG1hbiUyMHN1aXQlMjBoZWFkc2hvdCUyMGZpbmFuY2V8ZW58MHx8fHwxNzc2MzExMzkxfDA&ixlib=rb-4.1.0&q=85&w=400',
        tags: ['Europa', 'Divisas', 'Finanzas Personales'],
    },
];

const UPCOMING_FEATURES = [
    { icon: FileText, label: 'Publicacion de analisis de mercado' },
    { icon: TrendingUp, label: 'Recomendaciones de inversion personalizadas' },
    { icon: Bell, label: 'Alertas y senales de trading' },
    { icon: BarChart3, label: 'Informes periodicos del equipo' },
];

const AnalystCard = ({ analyst, index }) => {
    const Icon = analyst.icon;
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
        >
            <Card className="bg-slate-900/70 border-slate-800 overflow-hidden hover:border-[#14549C]/40 transition-all duration-300 group h-full" data-testid={`analyst-${analyst.id}`}>
                <CardContent className="p-0">
                    {/* Image + Status */}
                    <div className="relative h-56 overflow-hidden">
                        <img
                            src={analyst.image}
                            alt={analyst.name}
                            className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/30 to-transparent" />

                        {/* Status badge */}
                        <div className="absolute top-3 right-3">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 backdrop-blur-sm ${
                                analyst.status === 'active'
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${analyst.status === 'active' ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`} />
                                {analyst.status === 'active' ? 'Activo' : 'Proximamente'}
                            </span>
                        </div>

                        {/* Name overlay */}
                        <div className="absolute bottom-3 left-4 right-4">
                            <h3 className="text-white text-lg font-bold">{analyst.name}</h3>
                            <p className="text-[#14549C] text-xs font-semibold">{analyst.role}</p>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-5 space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-[#14549C]/15 flex items-center justify-center">
                                <Icon className="w-4 h-4 text-[#14549C]" />
                            </div>
                            <div>
                                <p className="text-slate-400 text-[10px] uppercase tracking-wider">Especialidad</p>
                                <p className="text-white text-xs font-semibold">{analyst.specialty}</p>
                            </div>
                        </div>

                        <p className="text-slate-400 text-sm leading-relaxed">{analyst.description}</p>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                                <Clock className="w-3.5 h-3.5" />
                                <span>{analyst.experience} experiencia</span>
                            </div>
                        </div>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-1.5">
                            {analyst.tags.map(tag => (
                                <span key={tag} className="px-2.5 py-1 rounded-full bg-[#14549C]/10 text-[#14549C] text-[10px] font-medium border border-[#14549C]/20">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
};

export const AdvisorsPage = () => {
    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="advisors-page">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-white flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[#14549C]/20 flex items-center justify-center">
                                    <Users className="w-5 h-5 text-[#14549C]" />
                                </div>
                                Asesores y Analistas
                            </h1>
                            <p className="text-slate-500 mt-2 max-w-2xl leading-relaxed">
                                Conozca al equipo de profesionales que formara parte de la nueva etapa de la plataforma.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#14549C]/10 border border-[#14549C]/20">
                            <Lock className="w-4 h-4 text-[#14549C]" />
                            <span className="text-[#14549C] text-xs font-bold">LIONSBIT 2.0</span>
                        </div>
                    </div>
                </motion.div>

                {/* Main message card */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <Card className="bg-gradient-to-r from-slate-900 via-slate-900 to-[#14549C]/10 border-[#14549C]/20">
                        <CardContent className="p-6 md:p-8">
                            <div className="flex flex-col md:flex-row gap-6">
                                <div className="flex-1 space-y-3">
                                    <p className="text-slate-300 leading-relaxed">
                                        <strong className="text-white">LIONSBIT 2.0</strong> contara con un equipo de asesores y analistas especializados que ofreceran orientacion, analisis de mercado y estrategias de inversion avanzadas.
                                    </p>
                                    <p className="text-slate-400 text-sm leading-relaxed">
                                        Estos profesionales formaran parte de la nueva etapa de la plataforma, la cual sera habilitada proximamente.
                                    </p>
                                </div>
                                <div className="flex-shrink-0">
                                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                        <span className="relative flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                                        </span>
                                        <span className="text-amber-400 text-xs font-bold">Proximamente disponible</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Analyst Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                    {ANALYSTS.map((analyst, idx) => (
                        <AnalystCard key={analyst.id} analyst={analyst} index={idx} />
                    ))}
                </div>

                {/* Upcoming Features */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardContent className="p-6">
                            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-[#14549C]" />
                                Funcionalidades Proximas
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                {UPCOMING_FEATURES.map((feat, i) => {
                                    const FIcon = feat.icon;
                                    return (
                                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                                            <div className="w-8 h-8 rounded-lg bg-[#14549C]/10 flex items-center justify-center flex-shrink-0">
                                                <FIcon className="w-4 h-4 text-[#14549C]" />
                                            </div>
                                            <span className="text-slate-300 text-xs">{feat.label}</span>
                                            <ChevronRight className="w-3 h-3 text-slate-600 ml-auto" />
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Disclaimer */}
                <div className="text-center pb-4">
                    <p className="text-slate-600 text-xs">
                        Los perfiles mostrados corresponden al equipo de analistas de la plataforma LIONSBIT. La informacion es exclusivamente informativa.
                    </p>
                </div>
            </div>
        </Layout>
    );
};

export default AdvisorsPage;
