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


// ─── Official Apple App Store badge (recreated with proper brand styling) ──
const AppStoreBadge = ({ disabled = true }) => (
    <div
        className={`group relative inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-black ring-1 ring-white/10 select-none ${disabled ? 'cursor-not-allowed opacity-95' : 'cursor-pointer hover:ring-white/30'} transition-all`}
        data-testid="store-badge-ios"
        title={disabled ? 'Próximamente' : 'Descargar en App Store'}
    >
        {/* Apple logo — proper SVG so it scales crisp */}
        <svg viewBox="0 0 384 512" width="28" height="32" className="flex-shrink-0">
            <path
                fill="#ffffff"
                d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
            />
        </svg>
        <div className="text-left leading-tight">
            <p className="text-white text-[9.5px] tracking-wide font-medium">Disponible pronto en</p>
            <p className="text-white text-[18px] font-semibold -mt-0.5" style={{ fontFamily: 'system-ui, -apple-system, "SF Pro Display", sans-serif' }}>
                App Store
            </p>
        </div>
        {disabled && (
            <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-400 text-amber-950">
                Próximamente
            </span>
        )}
    </div>
);


// ─── Official Google Play badge (with the colorful 4-tone triangle logo) ──
const GooglePlayBadge = ({ disabled = true }) => (
    <div
        className={`group relative inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-black ring-1 ring-white/10 select-none ${disabled ? 'cursor-not-allowed opacity-95' : 'cursor-pointer hover:ring-white/30'} transition-all`}
        data-testid="store-badge-android"
        title={disabled ? 'Próximamente' : 'Disponible en Google Play'}
    >
        {/* Google Play colorful triangle */}
        <svg viewBox="0 0 32 36" width="26" height="32" className="flex-shrink-0">
            <defs>
                <linearGradient id="gp-blue" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#00C2FF" />
                    <stop offset="100%" stopColor="#1492DA" />
                </linearGradient>
                <linearGradient id="gp-green" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#00F076" />
                    <stop offset="100%" stopColor="#00A852" />
                </linearGradient>
                <linearGradient id="gp-yellow" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#FFD834" />
                    <stop offset="100%" stopColor="#FFBD00" />
                </linearGradient>
                <linearGradient id="gp-red" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#FF3A44" />
                    <stop offset="100%" stopColor="#C31162" />
                </linearGradient>
            </defs>
            {/* Blue triangle (left) */}
            <path d="M0.5 1.5 L0.5 34.5 L17 18 Z" fill="url(#gp-blue)" />
            {/* Green triangle (top right) */}
            <path d="M0.5 1.5 L17 18 L24.5 10.5 Z" fill="url(#gp-green)" />
            {/* Yellow triangle (right tip) */}
            <path d="M24.5 10.5 L17 18 L24.5 25.5 L31 18 Z" fill="url(#gp-yellow)" />
            {/* Red triangle (bottom right) */}
            <path d="M17 18 L0.5 34.5 L24.5 25.5 Z" fill="url(#gp-red)" />
        </svg>
        <div className="text-left leading-tight">
            <p className="text-white text-[9.5px] tracking-wide font-medium">Disponible pronto en</p>
            <p className="text-white text-[18px] font-semibold -mt-0.5" style={{ fontFamily: 'system-ui, "Product Sans", sans-serif' }}>
                Google Play
            </p>
        </div>
        {disabled && (
            <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-400 text-amber-950">
                Próximamente
            </span>
        )}
    </div>
);


// ─── Reusable iPhone 15 Pro frame ─────────────────────────────────
const PhoneFrame = ({ children, scale = 1 }) => (
    <div
        className="relative rounded-[48px] p-[3px] shadow-[0_30px_80px_-15px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.05)_inset]"
        style={{
            width: 280 * scale,
            height: 568 * scale,
            background: 'linear-gradient(135deg, #3a3a3c 0%, #1c1c1e 30%, #2c2c2e 50%, #1a1a1c 100%)',
        }}
    >
        {/* Inner black ring */}
        <div className="relative w-full h-full rounded-[45px] bg-black overflow-hidden">
            {/* Subtle highlight on top edge (light reflection) */}
            <div className="absolute top-0 left-1/4 right-1/4 h-12 bg-gradient-to-b from-white/[0.08] to-transparent rounded-b-full pointer-events-none" />

            {/* Dynamic Island */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[100px] h-[28px] rounded-full bg-black ring-1 ring-slate-900/80 z-20 flex items-center justify-between px-2.5">
                <div className="w-1 h-1 rounded-full bg-slate-700" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-800 ring-1 ring-slate-700" />
            </div>

            {/* Screen */}
            <div
                className="absolute inset-1.5 rounded-[42px] overflow-hidden"
                style={{ background: 'linear-gradient(180deg, #0a1628 0%, #062046 25%, #051937 50%, #030f24 100%)' }}
            >
                {children}
            </div>
        </div>

        {/* Hardware buttons */}
        <div className="absolute right-[-3px] top-32 w-[3px] h-16 bg-gradient-to-b from-slate-700 to-slate-800 rounded-l" />
        <div className="absolute left-[-3px] top-24 w-[3px] h-8 bg-gradient-to-b from-slate-700 to-slate-800 rounded-r" />
        <div className="absolute left-[-3px] top-36 w-[3px] h-14 bg-gradient-to-b from-slate-700 to-slate-800 rounded-r" />
        <div className="absolute left-[-3px] top-16 w-[3px] h-5 bg-gradient-to-b from-slate-600 to-slate-700 rounded-r" />
    </div>
);


// ─── Reusable status bar (9:41 + signal + battery) ────────────────
const StatusBar = () => (
    <div className="absolute top-3 left-5 right-5 flex items-center justify-between text-white text-[10.5px] font-semibold opacity-90 z-10">
        <span style={{ fontFamily: 'system-ui, -apple-system, "SF Pro Display", sans-serif' }}>9:41</span>
        <span className="flex items-center gap-1.5">
            <span className="flex items-end gap-0.5">
                <span className="w-[2.5px] h-[3px] rounded-sm bg-white" />
                <span className="w-[2.5px] h-[5px] rounded-sm bg-white" />
                <span className="w-[2.5px] h-[7px] rounded-sm bg-white" />
                <span className="w-[2.5px] h-[9px] rounded-sm bg-white" />
            </span>
            <span className="text-[9px] font-bold tracking-tight">5G</span>
            <div className="relative ml-1 w-[22px] h-[10px] rounded-[3px] ring-[1.2px] ring-white/80 flex items-center px-[1.5px]">
                <div className="w-[80%] h-[6px] rounded-[1.5px] bg-white" />
                <div className="absolute -right-[2.5px] top-1/2 -translate-y-1/2 w-[1.5px] h-[4px] rounded-r bg-white/80" />
            </div>
        </span>
    </div>
);


// ─── FRONT screen: Dashboard / Wallet view ────────────────────────
const ScreenDashboard = () => (
    <div className="absolute inset-0 p-4 pt-12 flex flex-col">
        <StatusBar />

        <div className="flex items-center gap-1.5 mb-3">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-300" />
            <p className="text-cyan-300 text-[10px] font-bold tracking-[0.2em] uppercase">PayLionsBit</p>
        </div>

        <p className="text-slate-400 text-[10px]">Buenos días, Jorge</p>
        <p className="text-slate-500 text-[8.5px] mt-0.5">Balance total disponible</p>

        <div className="mt-1.5 mb-3 bg-gradient-to-br from-slate-900/80 via-[#072146]/60 to-slate-950/80 ring-1 ring-white/5 rounded-2xl p-3 backdrop-blur-sm">
            <p className="text-white text-[28px] font-bold tabular-nums tracking-tight">
                €48.250<span className="text-slate-500 text-[16px]">,00</span>
            </p>
            <div className="flex items-center gap-1.5 mt-1">
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
                    <span className="text-emerald-400 text-[8px]">▲</span>
                    <span className="text-emerald-300 text-[8.5px] font-bold">+2,4%</span>
                </span>
                <span className="text-slate-500 text-[8.5px]">esta semana</span>
            </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5 mb-3">
            {[
                { icon: Wallet, label: 'Wallet', color: '#06b6d4' },
                { icon: RefreshCw, label: 'Convertir', color: '#10b981' },
                { icon: BarChart3, label: 'Stats', color: '#a78bfa' },
                { icon: Bell, label: 'Alertas', color: '#f59e0b' },
            ].map((a, i) => (
                <div key={i} className="bg-white/[0.04] ring-1 ring-white/5 backdrop-blur-sm rounded-xl py-2 flex flex-col items-center gap-1">
                    <a.icon className="w-3.5 h-3.5" style={{ color: a.color }} />
                    <span className="text-[7.5px] text-white/60 font-semibold uppercase tracking-wide">{a.label}</span>
                </div>
            ))}
        </div>

        <div className="bg-white/[0.04] ring-1 ring-white/5 backdrop-blur-sm rounded-xl p-2.5 mb-3">
            <div className="flex items-center justify-between mb-1">
                <p className="text-white text-[9px] font-bold uppercase tracking-wider">Mis Inversiones</p>
                <span className="text-emerald-400 text-[8.5px] font-bold">+€1.158</span>
            </div>
            <svg viewBox="0 0 200 50" className="w-full">
                <defs>
                    <linearGradient id="ph-chart-pro" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d="M0,40 L20,35 L40,28 L60,30 L80,22 L100,18 L120,20 L140,12 L160,15 L180,8 L200,10 L200,50 L0,50 Z" fill="url(#ph-chart-pro)" />
                <path d="M0,40 L20,35 L40,28 L60,30 L80,22 L100,18 L120,20 L140,12 L160,15 L180,8 L200,10" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="200" cy="10" r="2.5" fill="#10b981" />
                <circle cx="200" cy="10" r="4" fill="#10b981" opacity="0.3" />
            </svg>
        </div>

        <div className="grid grid-cols-3 gap-1.5 mb-3">
            {[
                { f: '🇺🇸', c: 'USD', v: '5,2k', up: true },
                { f: '🇬🇧', c: 'GBP', v: '1,8k', up: true },
                { f: '🇲🇽', c: 'MXN', v: '88k', up: false },
            ].map((m) => (
                <div key={m.c} className="bg-white/[0.04] ring-1 ring-white/5 backdrop-blur-sm rounded-lg px-1.5 py-1.5">
                    <div className="flex items-center justify-between">
                        <p className="text-white/70 text-[7px] font-bold">{m.f} {m.c}</p>
                        <span className={`text-[7.5px] ${m.up ? 'text-emerald-400' : 'text-rose-400'}`}>{m.up ? '▲' : '▼'}</span>
                    </div>
                    <p className="text-white text-[10px] font-bold font-mono mt-0.5">{m.v}</p>
                </div>
            ))}
        </div>

        <div className="bg-gradient-to-r from-cyan-500/15 to-cyan-500/5 ring-1 ring-cyan-500/40 backdrop-blur-sm rounded-xl p-2 flex items-start gap-1.5 mt-auto">
            <div className="w-5 h-5 rounded-full bg-cyan-500/25 flex items-center justify-center flex-shrink-0">
                <Bell className="w-2.5 h-2.5 text-cyan-300" />
            </div>
            <div>
                <p className="text-cyan-100 text-[9px] font-bold">Retiro completado ✓</p>
                <p className="text-cyan-300/70 text-[8px] mt-0.5">PLB-2026-275741 · hace 2 min</p>
            </div>
        </div>

        <div className="mx-auto mt-3 w-[120px] h-[4px] rounded-full bg-white/80" />
    </div>
);


// ─── BACK screen: Movimientos / Retiros view ──────────────────────
const ScreenTransactions = () => {
    const txs = [
        { type: 'out', icon: '↗', label: 'Retiro a BBVA', code: 'PLB-2026-275741', amt: '−€8.500,00', sub: 'Hoy · 09:12', color: '#06b6d4', done: true },
        { type: 'in', icon: '↘', label: 'Liberación Vault', code: 'PLB-2026-274912', amt: '+€12.300,00', sub: 'Ayer · 18:45', color: '#10b981', done: true },
        { type: 'fx', icon: '⇄', label: 'EUR → USD', code: 'PLB-2026-274880', amt: '$5.200,00', sub: 'Ayer · 14:20', color: '#a78bfa', done: true },
        { type: 'in', icon: '↘', label: 'Rendimiento MT5', code: 'PLB-2026-274601', amt: '+€1.158,40', sub: '13 feb · 23:59', color: '#10b981', done: true },
        { type: 'out', icon: '↗', label: 'Retiro a Santander', code: 'PLB-2026-273944', amt: '−€3.200,00', sub: '11 feb · 16:08', color: '#06b6d4', pending: true },
    ];

    return (
        <div className="absolute inset-0 p-4 pt-12 flex flex-col">
            <StatusBar />

            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-cyan-300" />
                    <p className="text-cyan-300 text-[10px] font-bold tracking-[0.2em] uppercase">Movimientos</p>
                </div>
                <span className="text-slate-400 text-[8.5px] font-semibold">Feb 2026</span>
            </div>

            {/* Net flow card */}
            <div className="bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent ring-1 ring-emerald-500/25 rounded-2xl p-3 mb-3">
                <p className="text-emerald-200/80 text-[8.5px] font-bold uppercase tracking-wider">Flujo neto del mes</p>
                <p className="text-white text-[24px] font-bold tabular-nums tracking-tight mt-1">
                    +€6.958<span className="text-slate-500 text-[14px]">,40</span>
                </p>
                {/* Mini bar chart */}
                <div className="flex items-end gap-[3px] h-[22px] mt-2">
                    {[12, 16, 9, 14, 22, 18, 11, 20, 14, 17, 21, 16].map((h, i) => (
                        <div
                            key={i}
                            className="flex-1 rounded-[1.5px]"
                            style={{
                                height: `${h * 0.9}px`,
                                background: i >= 9 ? 'linear-gradient(180deg,#34d399,#059669)' : 'rgba(255,255,255,0.12)',
                            }}
                        />
                    ))}
                </div>
            </div>

            {/* Filter pills */}
            <div className="flex gap-1.5 mb-2.5">
                {[
                    { l: 'Todo', a: true },
                    { l: 'Entradas', a: false },
                    { l: 'Retiros', a: false },
                    { l: 'FX', a: false },
                ].map((p) => (
                    <span
                        key={p.l}
                        className={`px-2 py-0.5 rounded-full text-[8px] font-bold ${p.a ? 'bg-cyan-400 text-cyan-950' : 'bg-white/[0.04] text-white/60 ring-1 ring-white/10'}`}
                    >
                        {p.l}
                    </span>
                ))}
            </div>

            {/* Transactions list */}
            <div className="space-y-1.5 flex-1 overflow-hidden">
                {txs.map((t, i) => (
                    <div key={i} className="bg-white/[0.04] ring-1 ring-white/5 backdrop-blur-sm rounded-xl p-2 flex items-center gap-2">
                        <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[12px] font-bold"
                            style={{ background: t.color + '20', color: t.color }}
                        >
                            {t.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white text-[9.5px] font-bold leading-tight truncate">{t.label}</p>
                            <p className="text-slate-500 text-[7.5px] mt-0.5 truncate font-mono">{t.code}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                            <p className={`text-[9.5px] font-bold tabular-nums ${t.type === 'out' ? 'text-white' : t.type === 'in' ? 'text-emerald-300' : 'text-violet-300'}`}>
                                {t.amt}
                            </p>
                            <p className={`text-[7px] mt-0.5 font-semibold ${t.pending ? 'text-amber-300' : 'text-slate-500'}`}>
                                {t.pending ? '· Pendiente' : t.sub}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Floating CTA */}
            <button className="mt-2 w-full h-9 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 text-cyan-950 font-bold text-[10.5px] tracking-wide flex items-center justify-center gap-1.5 shadow-[0_8px_24px_-6px_rgba(6,182,212,0.6)]">
                <RefreshCw className="w-3 h-3" /> Nuevo retiro
            </button>

            <div className="mx-auto mt-2 w-[120px] h-[4px] rounded-full bg-white/80" />
        </div>
    );
};


// ─── Dual phone stack — back phone behind, front phone in focus ──
const DualPhoneStack = () => (
    <div className="relative mx-auto w-full flex items-center justify-center" style={{ perspective: '1400px' }}>
        {/* Ambient glow halo */}
        <div className="absolute inset-0 -m-12 bg-gradient-to-br from-cyan-500/25 via-[#1973B8]/15 to-emerald-500/20 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute inset-0 -m-12 bg-gradient-to-tr from-violet-500/10 to-transparent blur-2xl rounded-full pointer-events-none" />

        {/* Floor reflection / shadow puddle */}
        <div className="absolute bottom-[-20px] left-1/2 -translate-x-1/2 w-[420px] max-w-[80%] h-[40px] rounded-[50%] bg-black/70 blur-2xl pointer-events-none" />

        {/* BACK PHONE — Transactions screen (hidden on small screens) */}
        <motion.div
            initial={{ opacity: 0, y: 40, rotate: 12, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, rotate: 12, scale: 0.92 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
            className="hidden sm:block absolute z-10 origin-bottom"
            style={{
                transform: 'translateX(70px) translateY(-25px)',
                filter: 'drop-shadow(0 25px 40px rgba(0,0,0,0.55))',
            }}
        >
            <PhoneFrame scale={0.92}>
                <ScreenTransactions />
            </PhoneFrame>
        </motion.div>

        {/* FRONT PHONE — Dashboard (always visible) */}
        <motion.div
            initial={{ opacity: 0, y: 30, rotate: -6, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, rotate: -5, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            className="relative z-20"
            style={{
                transform: 'translateX(-40px)',
                filter: 'drop-shadow(0 35px 55px rgba(0,0,0,0.7))',
            }}
        >
            <PhoneFrame>
                <ScreenDashboard />
            </PhoneFrame>
        </motion.div>
    </div>
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
                                <AppStoreBadge disabled />
                                <GooglePlayBadge disabled />
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

                        {/* Right phone mockups (dual stacked) */}
                        <div className="relative min-h-[600px] flex items-center justify-center">
                            <DualPhoneStack />
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
