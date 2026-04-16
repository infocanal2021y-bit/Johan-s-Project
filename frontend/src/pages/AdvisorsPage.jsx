import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import {
    Users, TrendingUp, Globe, Briefcase, Clock, Lock,
    BarChart3, FileText, Bell, ChevronRight, ChevronDown, X
} from 'lucide-react';

const ANALYSTS = [
    {
        id: 'mati', name: 'Mati Alon', role: 'Editor Jefe', specialty: 'Analisis de Valores & Estrategia',
        bio: 'Mati es un analista de valores con 25 anos de experiencia que dirige el equipo de analistas y ejerce de editor jefe. Combina una gran capacidad analitica con dotes de liderazgo y criterio editorial, lo que garantiza que el trabajo del equipo sea perspicaz y este en consonancia con los objetivos estrategicos generales.',
        experience: '25+ anos', tags: ['Renta Variable', 'Liderazgo Editorial', 'Estrategia'],
        image: 'https://images.unsplash.com/photo-1738750908048-14200459c3c9?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBidXNpbmVzcyUyMG1hbiUyMHN1aXQlMjBoZWFkc2hvdCUyMGZpbmFuY2V8ZW58MHx8fHwxNzc2MzExMzkxfDA&ixlib=rb-4.1.0&q=85&w=400',
    },
    {
        id: 'lale', name: 'Lale Akoner', role: 'Analista de Mercados Globales', specialty: 'Macroeconomia & Multiactivos',
        bio: 'Lale es una reconocida estratega de inversion con experiencia en soluciones multi-activos y macroeconomia global. Ella ha aparecido en publicaciones financieras importantes y comparte de forma frecuente sus analisis sobre los mercados mundiales.',
        experience: '15+ anos', tags: ['Multiactivos', 'Macroeconomia', 'Mercados Globales'],
        image: 'https://images.unsplash.com/photo-1765005204058-10418f5123c5?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1NzZ8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBidXNpbmVzcyUyMHdvbWFuJTIwaGVhZHNob3QlMjBjb3Jwb3JhdGV8ZW58MHx8fHwxNzc2MzExMzkxfDA&ixlib=rb-4.1.0&q=85&w=400',
    },
    {
        id: 'jeanpaul', name: 'Jean-Paul van Oudheusden', role: 'Analista de Mercados', specialty: 'Mercados Neerlandeses e Internacionales',
        bio: 'Jean-Paul es un analista de mercados especializado en mercados neerlandeses e internacionales. El se enfoca en macro y microeconomia, analisis fundamental general, y en los sectores de tecnologia, energia y automotriz.',
        experience: '18+ anos', tags: ['Macro/Micro', 'Tecnologia', 'Energia'],
        image: 'https://images.unsplash.com/photo-1762522927402-f390672558d8?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTZ8MHwxfHNlYXJjaHw0fHxidXNpbmVzcyUyMHByb2Zlc3Npb25hbCUyMHBvcnRyYWl0fGVufDB8fHx8MTc3NjMxMTc3M3ww&ixlib=rb-4.1.0&q=85&w=400',
    },
    {
        id: 'neza', name: 'Neza Molk', role: 'Analista de Mercados', specialty: 'Biotecnologia & Divulgacion Financiera',
        bio: 'Neza es una analista financiera y Popular Investor con formacion en biotecnologia. Como colaboradora del podcast Comprender e invertir, es reconocida por su habilidad para simplificar temas financieros complejos y convertirlos en ideas claras y accesibles.',
        experience: '10+ anos', tags: ['Biotecnologia', 'Divulgacion', 'Podcast'],
        image: 'https://images.unsplash.com/photo-1581065178047-8ee15951ede6?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTZ8MHwxfHNlYXJjaHwzfHxidXNpbmVzcyUyMHByb2Zlc3Npb25hbCUyMHBvcnRyYWl0fGVufDB8fHx8MTc3NjMxMTc3M3ww&ixlib=rb-4.1.0&q=85&w=400',
    },
    {
        id: 'bret', name: 'Bret Kenwell', role: 'Analista de Inversiones y Opciones', specialty: 'Mercado Bursatil US & Opciones',
        bio: 'Bret es un analista financiero con mas de una decada de experiencia en el mercado bursatil estadounidense. El se especializa en el analisis general del mercado y la cobertura profunda de sectores combinando perspectivas fundamentales y tecnicas.',
        experience: '12+ anos', tags: ['Opciones', 'Renta Variable US', 'Sectorial'],
        image: 'https://images.unsplash.com/photo-1771898343647-bd979ad8cca5?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODF8MHwxfHNlYXJjaHwxfHxleGVjdXRpdmUlMjBtYW4lMjBwb3J0cmFpdCUyMGNvcnBvcmF0ZSUyMGhlYWRzaG90fGVufDB8fHx8MTc3NjMxMTc3OXww&ixlib=rb-4.1.0&q=85&w=400',
    },
    {
        id: 'sam', name: 'Sam North', role: 'Analista y Presentador de Podcast', specialty: 'Mercados & Divulgacion',
        bio: 'Sam North es analista de mercados y presentador del podcast Comprender e invertir. En sus mas de 10 anos de experiencia en inversion, ha asesorado a aspirantes a inversores y ha colaborado frecuentemente con analisis en varias publicaciones financieras. Su podcast acumula mas de 1.7M de visualizaciones.',
        experience: '10+ anos', tags: ['Podcast', 'Divulgacion', 'Inversion'],
        image: 'https://images.unsplash.com/photo-1762522926157-bcc04bf0b10a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODF8MHwxfHNlYXJjaHwzfHxleGVjdXRpdmUlMjBtYW4lMjBwb3J0cmFpdCUyMGNvcnBvcmF0ZSUyMGhlYWRzaG90fGVufDB8fHx8MTc3NjMxMTc3OXww&ixlib=rb-4.1.0&q=85&w=400',
    },
    {
        id: 'max', name: 'Maximilian Wienke', role: 'Analista de Mercados', specialty: 'Tendencias & Psicologia del Trader',
        bio: 'Maximilian es un experimentado analista de mercados que guia a los inversores a traves de las tendencias del mercado y la psicologia del trader para ayudarles a refinar sus estrategias de inversion y a gestionar el riesgo.',
        experience: '14+ anos', tags: ['Psicologia', 'Tendencias', 'Gestion de Riesgo'],
        image: 'https://images.unsplash.com/photo-1769636929261-e913ed023c83?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODF8MHwxfHNlYXJjaHwyfHxleGVjdXRpdmUlMjBtYW4lMjBwb3J0cmFpdCUyMGNvcnBvcmF0ZSUyMGhlYWRzaG90fGVufDB8fHx8MTc3NjMxMTc3OXww&ixlib=rb-4.1.0&q=85&w=400',
    },
    {
        id: 'antoine', name: 'Antoine Fraysse-Soulier', role: 'Analista de Mercado', specialty: 'Analisis Tecnico & Pronosticos',
        bio: 'Antoine es un analista financiero con mas de 15 anos de experiencia. El comparte su experiencia con los inversores y realiza analisis tecnico para pronosticar las tendencias del mercado en el corto y mediano plazo.',
        experience: '15+ anos', tags: ['Analisis Tecnico', 'Corto Plazo', 'Pronosticos'],
        image: 'https://images.unsplash.com/photo-1629507208649-70919ca33793?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTZ8MHwxfHNlYXJjaHwxfHxidXNpbmVzcyUyMHByb2Zlc3Npb25hbCUyMHBvcnRyYWl0fGVufDB8fHx8MTc3NjMxMTc3M3ww&ixlib=rb-4.1.0&q=85&w=400',
    },
    {
        id: 'javier', name: 'Javier Molina Jorda', role: 'Analista para Espana y Latam', specialty: 'Activos Digitales & Cripto',
        bio: 'Javier es un experimentado analista de mercados que orienta a inversores en Espana y America Latina. El se especializa en analisis tecnico y fundamental, con un enfoque en la creacion de riqueza en el largo plazo y la gestion de riesgos. Su experiencia abarca activos digitales y criptomonedas.',
        experience: '16+ anos', tags: ['Espana/Latam', 'Cripto', 'Largo Plazo'],
        image: 'https://images.pexels.com/photos/28442317/pexels-photo-28442317.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    },
    {
        id: 'gabriel', name: 'Gabriel Debach', role: 'Analista de Mercados Italianos', specialty: 'Finanzas Globales & Diversificacion',
        bio: 'Gabriel Debach es un analista de mercados que comparte sus conocimientos sobre finanzas globales y diversificacion de carteras. Sus analisis aparecen regularmente en publicaciones destacadas para ayudar a los inversores a navegar por los mercados financieros.',
        experience: '12+ anos', tags: ['Italia', 'Diversificacion', 'Carteras'],
        image: 'https://images.unsplash.com/photo-1758518729314-b02874db8c37?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODF8MHwxfHNlYXJjaHw0fHxleGVjdXRpdmUlMjBtYW4lMjBwb3J0cmFpdCUyMGNvcnBvcmF0ZSUyMGhlYWRzaG90fGVufDB8fHx8MTc3NjMxMTc3OXww&ixlib=rb-4.1.0&q=85&w=400',
    },
    {
        id: 'josh', name: 'Josh Gilbert', role: 'Analista de Mercados', specialty: 'Renta Variable AU/US & Cripto',
        bio: 'Josh es analista de mercados y se especializa en renta variable australiana y estadounidense, como tambien en criptoactivos. El colabora en el podcast Comprender e invertir y es conocido por su habilidad para simplificar temas financieros complejos.',
        experience: '10+ anos', tags: ['Australia', 'EEUU', 'Criptoactivos'],
        image: 'https://images.unsplash.com/photo-1733348137468-90b917d2ebf1?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODd8MHwxfHNlYXJjaHwyfHxwcm9mZXNzaW9uYWwlMjBidXNpbmVzcyUyMG1hbiUyMHN1aXQlMjBoZWFkc2hvdCUyMGZpbmFuY2V8ZW58MHx8fHwxNzc2MzExMzkxfDA&ixlib=rb-4.1.0&q=85&w=400',
    },
    {
        id: 'pawel', name: 'Pawel Majtkowski', role: 'Analista del Mercado Polaco', specialty: 'Bolsa & Macroeconomia',
        bio: 'Pawel es un destacado analista del mercado polaco que tiene mas de 18 anos de experiencia. El es reconocido por su experiencia en el mercado bursatil, analisis macroeconomico y finanzas personales. Pawel aparece regularmente en los medios de comunicacion para ofrecer informacion a los inversores minoristas.',
        experience: '18+ anos', tags: ['Polonia', 'Bolsa', 'Finanzas Personales'],
        image: 'https://images.unsplash.com/photo-1741675121621-df90e3195f9d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODd8MHwxfHNlYXJjaHwzfHxwcm9mZXNzaW9uYWwlMjBidXNpbmVzcyUyMG1hbiUyMHN1aXQlMjBoZWFkc2hvdCUyMGZpbmFuY2V8ZW58MHx8fHwxNzc2MzExMzkxfDA&ixlib=rb-4.1.0&q=85&w=400',
    },
    {
        id: 'bogdan', name: 'Bogdan Maioreanu', role: 'Analista para Rumania', specialty: 'Servicios Financieros & Banca',
        bio: 'Bogdan Maioreanu es un analista de mercados con mas de 20 anos de experiencia en servicios financieros y banca corporativa. El realiza comentarios frecuentes sobre los mercados financieros para ayudar a los inversores.',
        experience: '20+ anos', tags: ['Rumania', 'Banca', 'Servicios Financieros'],
        image: 'https://images.pexels.com/photos/31880922/pexels-photo-31880922.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    },
    {
        id: 'jakub', name: 'Jakub Rochlitz', role: 'Analista & Popular Investor Elite', specialty: 'Analisis Fundamental & Carteras',
        bio: 'Jakub es un Popular Investor de elite y analista de mercado que posee un historial robusto de rendimientos superiores a los del mercado ano tras ano. Posee formacion en finanzas y varios anos de experiencia practica en el campo de las inversiones. Se especializa en el analisis fundamental y la gestion de carteras a largo plazo.',
        experience: '8+ anos', tags: ['Popular Investor', 'Fundamental', 'Carteras'],
        image: 'https://images.unsplash.com/photo-1629507313712-f21468afdf2e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTZ8MHwxfHNlYXJjaHwyfHxidXNpbmVzcyUyMHByb2Zlc3Npb25hbCUyMHBvcnRyYWl0fGVufDB8fHx8MTc3NjMxMTc3M3ww&ixlib=rb-4.1.0&q=85&w=400',
    },
    {
        id: 'martin', name: 'Martin Juul-Olsen', role: 'Analista de Mercados — Dinamarca', specialty: 'Inversion a Largo Plazo',
        bio: 'Martin es un inversor en el largo plazo con mas de una decada de experiencia en los mercados financieros. Su especialidad es hacer que la bolsa sea mas simple para los inversores que desean crear una cartera duradera y diversificada.',
        experience: '10+ anos', tags: ['Dinamarca', 'Largo Plazo', 'Diversificacion'],
        image: 'https://images.unsplash.com/photo-1629507208649-70919ca33793?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTZ8MHwxfHNlYXJjaHwxfHxidXNpbmVzcyUyMHByb2Zlc3Npb25hbCUyMHBvcnRyYWl0fGVufDB8fHx8MTc3NjMxMTc3M3ww&ixlib=rb-4.1.0&q=85&w=400',
    },
    {
        id: 'zavier', name: 'Zavier Wong', role: 'Analista de Mercado — Singapur', specialty: 'Macroeconomia & Mercados Asiaticos',
        bio: 'Zavier es un analista de mercado de Singapur. Su especialidad es ofrecer analisis claros y con una narrativa coherente sobre tendencias macroeconomicas y mercados bursatiles. Sus comentarios aparecen en algunos de los medios financieros mas destacados de la region.',
        experience: '9+ anos', tags: ['Singapur', 'Asia', 'Macroeconomia'],
        image: 'https://images.unsplash.com/photo-1762522926157-bcc04bf0b10a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODF8MHwxfHNlYXJjaHwzfHxleGVjdXRpdmUlMjBtYW4lMjBwb3J0cmFpdCUyMGNvcnBvcmF0ZSUyMGhlYWRzaG90fGVufDB8fHx8MTc3NjMxMTc3OXww&ixlib=rb-4.1.0&q=85&w=400',
    },
];

const UPCOMING_FEATURES = [
    { icon: FileText, label: 'Publicacion de analisis de mercado' },
    { icon: TrendingUp, label: 'Recomendaciones de inversion personalizadas' },
    { icon: Bell, label: 'Alertas y senales de trading' },
    { icon: BarChart3, label: 'Informes periodicos del equipo' },
];

const AnalystCard = ({ analyst, index, onClick }) => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.05, 0.4) }}>
        <button onClick={() => onClick(analyst)} className="text-left w-full" data-testid={`analyst-${analyst.id}`}>
            <Card className="bg-slate-900/70 border-slate-800 overflow-hidden hover:border-[#14549C]/40 transition-all duration-300 group h-full">
                <CardContent className="p-0">
                    <div className="relative h-48 overflow-hidden">
                        <img src={analyst.image} alt={analyst.name}
                            className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => { e.target.style.display = 'none'; }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent" />
                        <div className="absolute top-3 right-3">
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 backdrop-blur-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Activo
                            </span>
                        </div>
                        <div className="absolute bottom-3 left-4 right-4">
                            <h3 className="text-white text-base font-bold leading-tight">{analyst.name}</h3>
                            <p className="text-[#14549C] text-[11px] font-semibold">{analyst.role}</p>
                        </div>
                    </div>
                    <div className="p-4 space-y-2.5">
                        <p className="text-slate-400 text-xs leading-relaxed line-clamp-2">{analyst.bio}</p>
                        <div className="flex items-center justify-between">
                            <span className="text-slate-600 text-[10px] flex items-center gap-1"><Clock className="w-3 h-3" />{analyst.experience}</span>
                            <span className="text-[#14549C] text-[10px] font-semibold group-hover:underline">Mas info</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {analyst.tags.map(tag => (
                                <span key={tag} className="px-2 py-0.5 rounded-full bg-[#14549C]/8 text-[#14549C] text-[9px] font-medium border border-[#14549C]/15">{tag}</span>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </button>
    </motion.div>
);

export const AdvisorsPage = () => {
    const [selected, setSelected] = useState(null);

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="advisors-page">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-white flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[#14549C]/20 flex items-center justify-center"><Users className="w-5 h-5 text-[#14549C]" /></div>
                                Conoce Nuestros Expertos
                            </h1>
                            <p className="text-slate-500 mt-2 max-w-2xl">Equipo de asesores y analistas especializados de la plataforma.</p>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#14549C]/10 border border-[#14549C]/20">
                            <Lock className="w-4 h-4 text-[#14549C]" /><span className="text-[#14549C] text-xs font-bold">LIONSBIT 2.0</span>
                        </div>
                    </div>
                </motion.div>

                {/* Message */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <Card className="bg-gradient-to-r from-slate-900 via-slate-900 to-[#14549C]/10 border-[#14549C]/20">
                        <CardContent className="p-6 md:p-8 flex flex-col md:flex-row gap-4 items-start">
                            <div className="flex-1 space-y-2">
                                <p className="text-slate-300 leading-relaxed"><strong className="text-white">LIONSBIT 2.0</strong> contara con un equipo de asesores y analistas especializados que ofreceran orientacion, analisis de mercado y estrategias de inversion avanzadas.</p>
                                <p className="text-slate-500 text-sm">Estos profesionales formaran parte de la nueva etapa de la plataforma, la cual sera habilitada proximamente.</p>
                            </div>
                            <div className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute h-full w-full rounded-full bg-amber-400 opacity-75" /><span className="relative rounded-full h-2.5 w-2.5 bg-amber-500" /></span>
                                <span className="text-amber-400 text-xs font-bold">Proximamente disponible</span>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Grid - 16 analysts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {ANALYSTS.map((a, i) => <AnalystCard key={a.id} analyst={a} index={i} onClick={setSelected} />)}
                </div>

                {/* Upcoming */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardContent className="p-6">
                            <h3 className="text-white font-bold mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-[#14549C]" /> Funcionalidades Proximas</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                {UPCOMING_FEATURES.map((f, i) => { const I = f.icon; return (
                                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                                        <div className="w-8 h-8 rounded-lg bg-[#14549C]/10 flex items-center justify-center flex-shrink-0"><I className="w-4 h-4 text-[#14549C]" /></div>
                                        <span className="text-slate-300 text-xs">{f.label}</span><ChevronRight className="w-3 h-3 text-slate-600 ml-auto" />
                                    </div>
                                ); })}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                <p className="text-slate-600 text-xs text-center pb-4">Los perfiles mostrados corresponden al equipo de analistas de la plataforma LIONSBIT. La informacion es exclusivamente informativa.</p>

                {/* Detail Dialog */}
                <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
                    <DialogContent className="bg-slate-900 border-slate-800 max-w-lg" data-testid="analyst-detail-dialog">
                        {selected && (
                            <>
                                <DialogHeader>
                                    <DialogTitle className="text-white flex items-center gap-3">
                                        <img src={selected.image} alt="" className="w-14 h-14 rounded-xl object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                                        <div>
                                            <span className="block">{selected.name}</span>
                                            <span className="text-[#14549C] text-xs font-normal block mt-0.5">{selected.role}</span>
                                        </div>
                                    </DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 pt-2">
                                    <div className="flex items-center gap-4">
                                        <span className="text-emerald-400 text-xs flex items-center gap-1"><span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" /> Activo</span>
                                        <span className="text-slate-500 text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> {selected.experience}</span>
                                    </div>
                                    <div className="bg-slate-800/50 rounded-lg p-4">
                                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Especialidad</p>
                                        <p className="text-white text-sm font-semibold">{selected.specialty}</p>
                                    </div>
                                    <p className="text-slate-300 text-sm leading-relaxed">{selected.bio}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {selected.tags.map(t => <span key={t} className="px-2.5 py-1 rounded-full bg-[#14549C]/10 text-[#14549C] text-[10px] font-medium border border-[#14549C]/20">{t}</span>)}
                                    </div>
                                    <Button onClick={() => setSelected(null)} variant="outline" className="w-full border-slate-700 text-slate-400 hover:text-white">Cerrar</Button>
                                </div>
                            </>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </Layout>
    );
};

export default AdvisorsPage;
