import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/ui/card';
import {
    Smartphone, Apple, Bell, TrendingUp, FolderKanban, RefreshCw,
    Zap, ShieldCheck, ChevronRight, Sparkles, BarChart3, Wallet,
    Clock, Star, Globe, Lock,
} from 'lucide-react';


// ─── Premium feature card ─────────────────────────────────────────
const FeatureCard = ({ icon: Icon, title, desc, color, delay = 0 }) => (
    <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.4 }}
        whileHover={{ y: -3 }}
        className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900/80 via-slate-950 to-slate-950 ring-1 ring-slate-800 hover:ring-cyan-400/40 hover:shadow-[0_12px_40px_rgba(6,182,212,0.18)] p-5 transition-all"
        data-testid={`mobile-feature-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
        <div
            className="absolute -top-16 -right-16 w-40 h-40 rounded-full opacity-10 blur-3xl group-hover:opacity-30 transition-opacity"
            style={{ background: color }}
        />
        <div
            className="relative w-11 h-11 rounded-xl flex items-center justify-center mb-4"
            style={{ background: color + '18', boxShadow: `0 0 0 1px ${color}30` }}
        >
            <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <p className="relative text-white font-bold text-[14px] tracking-tight">{title}</p>
        <p className="relative text-slate-400 text-[12px] mt-1.5 leading-relaxed">{desc}</p>
    </motion.div>
);


// ─── Store badge (looks like the official one but disabled) ──────
const StoreBadge = ({ store, primary, secondary, icon: Icon, accent }) => (
    <div
        className="group relative inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-black ring-1 ring-slate-700 opacity-90 cursor-not-allowed select-none"
        data-testid={`store-badge-${store.toLowerCase()}`}
        title="Próximamente"
    >
        <Icon className="w-7 h-7 text-white flex-shrink-0" style={{ color: accent }} />
        <div className="text-left leading-tight">
            <p className="text-slate-400 text-[9.5px] uppercase tracking-wider font-semibold">{primary}</p>
            <p className="text-white text-[14px] font-bold">{secondary}</p>
        </div>
        <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-400 text-amber-950">
            Próximamente
        </span>
    </div>
);


// ─── Phone mockup with shine ──────────────────────────────────────
const PhoneMockup = () => (
    <motion.div
        initial={{ opacity: 0, scale: 0.92, rotate: -4 }}
        animate={{ opacity: 1, scale: 1, rotate: -4 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative mx-auto"
        style={{ perspective: '1000px' }}
    >
        {/* Glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/30 via-[#1973B8]/20 to-emerald-500/20 blur-3xl rounded-full" />

        {/* Phone frame */}
        <div className="relative w-[260px] h-[520px] mx-auto rounded-[44px] bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 ring-[6px] ring-slate-950 shadow-[0_30px_80px_-15px_rgba(0,0,0,0.7)]">
            {/* Notch */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-5 rounded-full bg-black z-10" />

            {/* Screen */}
            <div className="absolute inset-2 rounded-[38px] overflow-hidden bg-gradient-to-br from-[#0a1628] via-[#072146] to-slate-950">
                <div className="absolute inset-0 p-4 pt-9 flex flex-col">
                    {/* Status bar */}
                    <div className="flex items-center justify-between text-white text-[10px] font-bold opacity-80 mb-3">
                        <span>9:41</span>
                        <span className="flex items-center gap-1">●●●● <span className="ml-1">5G</span></span>
                    </div>
                    {/* Brand */}
                    <div className="flex items-center gap-1.5 mb-4">
                        <ShieldCheck className="w-3.5 h-3.5 text-cyan-300" />
                        <p className="text-cyan-300 text-[10px] font-bold tracking-[0.18em] uppercase">PayLionsBit</p>
                    </div>
                    <p className="text-white text-[11px] font-bold">¡Hola, Jorge!</p>
                    <p className="text-slate-400 text-[9px] mt-0.5">Balance total disponible</p>

                    {/* Big balance */}
                    <div className="mt-2 mb-4">
                        <p className="text-white text-[26px] font-bold tabular-nums tracking-tight">€48.250,00</p>
                        <p className="text-emerald-400 text-[9.5px] font-bold mt-0.5">▲ +2,4% esta semana</p>
                    </div>

                    {/* Quick actions */}
                    <div className="grid grid-cols-4 gap-1.5 mb-4">
                        {[Wallet, RefreshCw, BarChart3, Bell].map((Ic, i) => (
                            <div key={i} className="bg-white/5 ring-1 ring-white/10 rounded-lg py-2 flex flex-col items-center gap-1">
                                <Ic className="w-3.5 h-3.5 text-cyan-300" />
                                <span className="text-[7.5px] text-white/70 font-bold uppercase tracking-wide">
                                    {['Wallet', 'Convert', 'Stats', 'Alertas'][i]}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Faux chart */}
                    <div className="bg-white/5 ring-1 ring-white/10 rounded-lg p-2.5 mb-3">
                        <p className="text-white text-[9px] font-bold uppercase tracking-wider mb-1.5">Inversiones</p>
                        <svg viewBox="0 0 200 50" className="w-full">
                            <defs>
                                <linearGradient id="phChart" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.6" />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path
                                d="M0,35 L25,30 L50,25 L75,28 L100,18 L125,22 L150,12 L175,18 L200,10 L200,50 L0,50 Z"
                                fill="url(#phChart)"
                            />
                            <path
                                d="M0,35 L25,30 L50,25 L75,28 L100,18 L125,22 L150,12 L175,18 L200,10"
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="2"
                                strokeLinecap="round"
                            />
                        </svg>
                    </div>

                    {/* Notification card */}
                    <div className="bg-cyan-500/10 ring-1 ring-cyan-500/30 rounded-lg p-2 flex items-start gap-2 mt-auto">
                        <Bell className="w-3 h-3 text-cyan-300 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-cyan-200 text-[9px] font-bold">Expediente actualizado</p>
                            <p className="text-cyan-300/70 text-[8px]">USD-EUR conversión completada</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Power button */}
            <div className="absolute right-[-2px] top-32 w-[3px] h-12 bg-slate-700 rounded-l" />
            {/* Volume */}
            <div className="absolute left-[-2px] top-24 w-[3px] h-8 bg-slate-700 rounded-r" />
            <div className="absolute left-[-2px] top-36 w-[3px] h-14 bg-slate-700 rounded-r" />
        </div>
    </motion.div>
);


// ─── Notify form (waitlist) ───────────────────────────────────────
const NotifyMe = () => {
    const [email, setEmail] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const submit = (e) => {
        e.preventDefault();
        if (!email || !email.includes('@')) return;
        setSubmitted(true);
    };
    return (
        <Card className="p-6 bg-gradient-to-br from-[#072146] via-[#004481] to-[#072146] border-0 ring-1 ring-cyan-500/20">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <p className="text-cyan-300 text-[10px] uppercase tracking-[0.18em] font-bold flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Lista de espera
                    </p>
                    <h3 className="text-white text-xl font-bold mt-1.5">Sé de los primeros en probarla</h3>
                    <p className="text-slate-300 text-[13px] mt-1">
                        Te avisaremos por email en cuanto la app esté disponible en App Store y Google Play.
                    </p>
                </div>
                {submitted ? (
                    <div className="px-5 py-3 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/40 text-emerald-300 text-[13px] font-bold flex items-center gap-2" data-testid="mobile-waitlist-success">
                        <Star className="w-4 h-4" /> ¡Te avisaremos pronto!
                    </div>
                ) : (
                    <form onSubmit={submit} className="flex gap-2" data-testid="mobile-waitlist-form">
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="tu@email.com"
                            className="h-11 px-4 rounded-xl bg-white/10 ring-1 ring-white/20 text-white placeholder-slate-400 outline-none focus:ring-cyan-400/60 text-[13px] w-64"
                            data-testid="mobile-waitlist-input"
                        />
                        <button
                            type="submit"
                            className="h-11 px-5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-cyan-950 font-bold text-[13px] inline-flex items-center gap-1.5 transition-colors"
                            data-testid="mobile-waitlist-submit"
                        >
                            Avisarme <ChevronRight className="w-4 h-4" />
                        </button>
                    </form>
                )}
            </div>
        </Card>
    );
};


// ─── Main Page ────────────────────────────────────────────────────
const MobileAppPage = () => {
    const features = [
        {
            icon: TrendingUp, color: '#10b981',
            title: 'Gestión de inversiones',
            desc: 'Visualiza tu portafolio, rendimientos y operaciones MT5 directamente desde tu bolsillo.',
        },
        {
            icon: FolderKanban, color: '#06b6d4',
            title: 'Seguimiento de expedientes',
            desc: 'Consulta el estado de tus liberaciones, KYC y validaciones en tiempo real.',
        },
        {
            icon: RefreshCw, color: '#1973B8',
            title: 'Conversión de divisas',
            desc: 'Convierte EUR · USD · GBP · DOP · MXN · COP al instante con tasas institucionales.',
        },
        {
            icon: Bell, color: '#f59e0b',
            title: 'Alertas en tiempo real',
            desc: 'Notificaciones push instantáneas: movimientos, certificaciones Vault y oportunidades.',
        },
        {
            icon: Zap, color: '#a855f7',
            title: 'Acceso rápido',
            desc: 'Tu centro financiero personal optimizado para iOS y Android, con login biométrico.',
        },
        {
            icon: ShieldCheck, color: '#ec4899',
            title: 'Seguridad de banca privada',
            desc: 'Encriptación de extremo a extremo, 2FA y verificación Face ID / huella dactilar.',
        },
    ];

    return (
        <Layout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">

                {/* ── HERO ───────────────────────────────────────── */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#072146] via-[#0a1c3d] to-slate-950 ring-1 ring-cyan-500/20 p-8 sm:p-12">
                    {/* Background blobs */}
                    <div className="pointer-events-none absolute -top-20 -right-20 w-[400px] h-[400px] rounded-full bg-cyan-500/10 blur-3xl" />
                    <div className="pointer-events-none absolute -bottom-20 left-1/3 w-[420px] h-[420px] rounded-full bg-emerald-500/10 blur-3xl" />

                    <div className="relative grid lg:grid-cols-2 gap-10 items-center">
                        {/* Left copy */}
                        <div>
                            <motion.span
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 ring-1 ring-amber-400/40 text-amber-300 text-[10.5px] font-bold uppercase tracking-[0.15em]"
                                data-testid="mobile-hero-pill"
                            >
                                <Sparkles className="w-3 h-3" />
                                Próximamente · Q2 2026
                            </motion.span>

                            <motion.h1
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="text-white text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] mt-5"
                                data-testid="mobile-hero-title"
                            >
                                Tu banca <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-emerald-300">institucional</span>, en tu bolsillo.
                            </motion.h1>

                            <motion.p
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="text-slate-300 text-[15px] mt-5 leading-relaxed max-w-xl"
                            >
                                La aplicación móvil de <strong className="text-white">PayLionsBit</strong> está en desarrollo.
                                Pronto podrás gestionar inversiones, seguir tus expedientes y operar tu cuenta multidivisa
                                desde iPhone y Android — con la misma experiencia institucional que ya conoces.
                            </motion.p>

                            {/* Store badges */}
                            <motion.div
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="flex flex-wrap gap-3 mt-7"
                            >
                                <StoreBadge
                                    store="ios"
                                    primary="Disponible pronto en"
                                    secondary="App Store"
                                    icon={Apple}
                                    accent="#ffffff"
                                />
                                <StoreBadge
                                    store="android"
                                    primary="Disponible pronto en"
                                    secondary="Google Play"
                                    icon={Smartphone}
                                    accent="#10b981"
                                />
                            </motion.div>

                            {/* Trust strip */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.4 }}
                                className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-7 text-[11px] text-slate-400"
                            >
                                <span className="flex items-center gap-1.5">
                                    <Lock className="w-3.5 h-3.5 text-emerald-400" /> Cifrado de extremo a extremo
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" /> 2FA + biometría
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Globe className="w-3.5 h-3.5 text-amber-400" /> 6 divisas live
                                </span>
                            </motion.div>
                        </div>

                        {/* Right phone mockup */}
                        <div className="relative">
                            <PhoneMockup />
                        </div>
                    </div>
                </div>

                {/* ── FEATURES GRID ──────────────────────────────── */}
                <div>
                    <div className="flex items-end justify-between mb-5">
                        <div>
                            <p className="text-cyan-300 text-[10.5px] uppercase tracking-[0.18em] font-bold">¿Qué traerá?</p>
                            <h2 className="text-white text-2xl sm:text-3xl font-bold mt-1.5">Tu centro financiero personal</h2>
                            <p className="text-slate-400 text-[13px] mt-1.5 max-w-2xl">
                                Diseñada exclusivamente para los clientes PayLionsBit. Cada función pensada para movimiento real,
                                no para reemplazar el desktop — sino para complementarlo.
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {features.map((f, i) => (
                            <FeatureCard key={f.title} {...f} delay={0.05 * i} />
                        ))}
                    </div>
                </div>

                {/* ── ROADMAP STRIP ──────────────────────────────── */}
                <Card className="p-6 bg-slate-900/60 ring-1 ring-slate-800 border-0">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 ring-1 ring-cyan-500/30 flex items-center justify-center">
                                <Clock className="w-4 h-4 text-cyan-300" />
                            </div>
                            <div>
                                <p className="text-white font-bold text-[14px]">Estado del desarrollo</p>
                                <p className="text-slate-400 text-[11.5px] mt-0.5">Fase actual: diseño UX final · construcción nativa en curso</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10.5px]">
                            {[
                                { label: 'Diseño', done: true },
                                { label: 'Desarrollo', done: true },
                                { label: 'Beta cerrada', done: false },
                                { label: 'Lanzamiento', done: false },
                            ].map((s, i) => (
                                <div key={s.label} className="flex items-center gap-2">
                                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${s.done ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40' : 'bg-slate-800 text-slate-500 ring-1 ring-slate-700'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${s.done ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                                        {s.label}
                                    </div>
                                    {i < 3 && <ChevronRight className="w-3 h-3 text-slate-600" />}
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>

                {/* ── WAITLIST ───────────────────────────────────── */}
                <NotifyMe />

                {/* ── Footer note ────────────────────────────────── */}
                <p className="text-center text-slate-500 text-[11px]">
                    PayLionsBit Mobile · Disponible próximamente para iOS 16+ y Android 10+ · Lista de espera abierta
                </p>
            </div>
        </Layout>
    );
};

export default MobileAppPage;
