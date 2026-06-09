import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
    ChevronRight, TrendingUp, Wallet, Bell, Sparkles, ShieldCheck,
    BarChart3, ArrowUpRight, ArrowDownRight, RefreshCw, Globe,
    CheckCircle2,
} from 'lucide-react';
import { WaitlistCounter } from './WaitlistCounter';


// ─── Shared mini status bar ───────────────────────────────────────
const MiniStatusBar = () => (
    <div className="flex items-center justify-between text-white text-[7.5px] font-bold opacity-90 mb-2">
        <span>9:41</span>
        <span className="flex items-center gap-1">
            <span className="flex items-end gap-[1px]">
                <span className="w-[1.5px] h-[2px] bg-white rounded-sm" />
                <span className="w-[1.5px] h-[3px] bg-white rounded-sm" />
                <span className="w-[1.5px] h-[4px] bg-white rounded-sm" />
                <span className="w-[1.5px] h-[5px] bg-white rounded-sm" />
            </span>
            <span className="text-[7px] tracking-tight">5G</span>
            <div className="relative ml-0.5 w-[14px] h-[7px] rounded-[2px] ring-[1px] ring-white/80 flex items-center px-[1px]">
                <div className="w-[80%] h-[4px] rounded-[1px] bg-white" />
            </div>
        </span>
    </div>
);


// ─── Screen 1: Balance / Inversiones ─────────────────────────────
const ScreenBalance = () => (
    <div className="absolute inset-0 p-3 pt-6 flex flex-col">
        <MiniStatusBar />
        <div className="flex items-center gap-1 mb-1">
            <ShieldCheck className="w-2.5 h-2.5 text-cyan-300" />
            <p className="text-cyan-300 text-[7px] font-bold tracking-[0.18em] uppercase">PayLionsBit</p>
        </div>

        {/* Balance card */}
        <div className="bg-gradient-to-br from-slate-900/80 via-[#072146]/60 to-slate-950/80 ring-1 ring-white/5 rounded-xl p-2 mt-1">
            <p className="text-slate-400 text-[6.5px] font-bold uppercase tracking-wider">Balance Total</p>
            <p className="text-white text-[17px] font-bold tabular-nums tracking-tight leading-none mt-0.5">€48.250<span className="text-slate-500 text-[10px]">,00</span></p>
            <div className="flex items-center justify-between mt-1">
                <div>
                    <p className="text-slate-500 text-[6px]">Disponible</p>
                    <p className="text-white text-[8.5px] font-bold font-mono">€32.840</p>
                </div>
                <div>
                    <p className="text-slate-500 text-[6px]">Inv. activas</p>
                    <p className="text-emerald-300 text-[8.5px] font-bold font-mono">€15.410</p>
                </div>
                <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/40">
                    <ArrowUpRight className="w-2 h-2 text-emerald-300" />
                    <span className="text-emerald-300 text-[6.5px] font-bold">+2,4%</span>
                </span>
            </div>
        </div>

        {/* Monthly performance */}
        <div className="bg-white/[0.04] ring-1 ring-white/10 rounded-lg p-1.5 mt-1.5">
            <div className="flex items-center justify-between mb-1">
                <p className="text-white text-[6.5px] font-bold uppercase tracking-wider">Rendimiento mensual</p>
                <span className="text-emerald-400 text-[6.5px] font-bold">+€1.158</span>
            </div>
            <svg viewBox="0 0 200 40" className="w-full">
                <defs>
                    <linearGradient id="sb-chart" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <g stroke="rgba(255,255,255,0.05)" strokeWidth="0.5">
                    <line x1="0" y1="12" x2="200" y2="12" />
                    <line x1="0" y1="25" x2="200" y2="25" />
                </g>
                <path d="M0,32 L20,28 L40,24 L60,26 L80,18 L100,20 L120,14 L140,17 L160,9 L180,12 L200,5 L200,40 L0,40 Z" fill="url(#sb-chart)" />
                <path d="M0,32 L20,28 L40,24 L60,26 L80,18 L100,20 L120,14 L140,17 L160,9 L180,12 L200,5" fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="200" cy="5" r="2" fill="#34d399" />
                <circle cx="200" cy="5" r="3.5" fill="#34d399" opacity="0.3" />
            </svg>
        </div>

        {/* Bottom KPI row */}
        <div className="grid grid-cols-2 gap-1 mt-1.5 mt-auto">
            <div className="bg-white/[0.04] ring-1 ring-white/10 rounded-lg p-1.5">
                <p className="text-slate-500 text-[6px] uppercase tracking-wide">ROI 30d</p>
                <p className="text-emerald-300 text-[9px] font-bold tabular-nums">+8,42%</p>
            </div>
            <div className="bg-white/[0.04] ring-1 ring-white/10 rounded-lg p-1.5">
                <p className="text-slate-500 text-[6px] uppercase tracking-wide">Sharpe</p>
                <p className="text-cyan-300 text-[9px] font-bold tabular-nums">1.84</p>
            </div>
        </div>

        <div className="mx-auto mt-2 w-[60px] h-[2.5px] rounded-full bg-white/80" />
    </div>
);


// ─── Screen 2: Retiros & Historial ─────────────────────────────
const ScreenWithdrawals = () => {
    const items = [
        { i: ArrowUpRight, c: '#10b981', label: 'Liberación Vault', amt: '+€12.300', sub: 'PLB-2026-274912', done: true },
        { i: ArrowDownRight, c: '#06b6d4', label: 'Retiro BBVA', amt: '−€8.500', sub: 'PLB-2026-275741', done: true },
        { i: RefreshCw, c: '#a78bfa', label: 'Conv. EUR→USD', amt: '$5.200', sub: 'PLB-2026-274880', done: true },
        { i: ArrowDownRight, c: '#f59e0b', label: 'Retiro Santander', amt: '−€3.200', sub: 'PLB-2026-273944', pending: true },
    ];
    return (
        <div className="absolute inset-0 p-3 pt-6 flex flex-col">
            <MiniStatusBar />
            <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1">
                    <Wallet className="w-2.5 h-2.5 text-cyan-300" />
                    <p className="text-cyan-300 text-[7px] font-bold tracking-[0.18em] uppercase">Movimientos</p>
                </div>
                <span className="text-slate-400 text-[6.5px] font-bold">Feb 2026</span>
            </div>

            {/* Net flow */}
            <div className="bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent ring-1 ring-emerald-500/25 rounded-xl p-2">
                <p className="text-emerald-200/80 text-[6.5px] font-bold uppercase tracking-wider">Flujo neto · mes</p>
                <p className="text-white text-[15px] font-bold tabular-nums tracking-tight leading-tight mt-0.5">+€6.958<span className="text-slate-500 text-[9px]">,40</span></p>
                <div className="flex items-end gap-[2px] h-[16px] mt-1">
                    {[10, 14, 8, 12, 18, 16, 9, 17, 12, 15, 18, 14].map((h, i) => (
                        <div key={i} className="flex-1 rounded-[1px]" style={{ height: `${h * 0.85}px`, background: i >= 9 ? 'linear-gradient(180deg,#34d399,#059669)' : 'rgba(255,255,255,0.12)' }} />
                    ))}
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-1 mt-1.5 mb-1">
                {[{ l: 'Todo', a: true }, { l: 'Retiros' }, { l: 'FX' }].map((p) => (
                    <span key={p.l} className={`px-1.5 py-0.5 rounded-full text-[6px] font-bold ${p.a ? 'bg-cyan-400 text-cyan-950' : 'bg-white/5 text-white/60 ring-1 ring-white/10'}`}>{p.l}</span>
                ))}
            </div>

            {/* List */}
            <div className="space-y-1 flex-1">
                {items.map((it, i) => (
                    <div key={i} className="bg-white/[0.04] ring-1 ring-white/5 rounded-lg p-1.5 flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ background: it.c + '22' }}>
                            <it.i className="w-2 h-2" style={{ color: it.c }} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white text-[7.5px] font-bold leading-tight truncate">{it.label}</p>
                            <p className="text-slate-500 text-[6px] font-mono mt-0.5">{it.sub}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-white text-[7.5px] font-bold tabular-nums">{it.amt}</p>
                            <p className={`text-[5.5px] font-bold ${it.pending ? 'text-amber-300' : 'text-emerald-400/70'}`}>
                                {it.pending ? '· Pendiente' : '✓'}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Notification */}
            <div className="bg-cyan-500/10 ring-1 ring-cyan-500/30 rounded-lg p-1 flex items-start gap-1 mt-1">
                <Bell className="w-2 h-2 text-cyan-300 mt-0.5 flex-shrink-0" />
                <div>
                    <p className="text-cyan-200 text-[6.5px] font-bold">Retiro confirmado</p>
                    <p className="text-cyan-300/70 text-[6px]">PLB-2026-275741 · ahora</p>
                </div>
            </div>

            <div className="mx-auto mt-1.5 w-[60px] h-[2.5px] rounded-full bg-white/80" />
        </div>
    );
};


// ─── Screen 3: Conversor multidivisa ─────────────────────────────
const ScreenConverter = () => (
    <div className="absolute inset-0 p-3 pt-6 flex flex-col">
        <MiniStatusBar />
        <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1">
                <Globe className="w-2.5 h-2.5 text-violet-300" />
                <p className="text-violet-300 text-[7px] font-bold tracking-[0.18em] uppercase">Conversor</p>
            </div>
            <span className="text-emerald-400 text-[6px] font-bold flex items-center gap-0.5">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" /> LIVE
            </span>
        </div>

        {/* FROM */}
        <div className="bg-white/[0.04] ring-1 ring-white/10 rounded-xl p-2">
            <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[6.5px] font-bold">DESDE</span>
                <span className="text-white/70 text-[6px]">Saldo: €48.250</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[12px]">🇪🇺</span>
                <span className="text-white text-[9px] font-bold">EUR</span>
                <span className="text-white text-[14px] font-bold tabular-nums ml-auto">1.000,00</span>
            </div>
        </div>

        {/* Swap btn */}
        <div className="flex justify-center -my-1 relative z-10">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 ring-2 ring-slate-950 flex items-center justify-center shadow-lg">
                <RefreshCw className="w-2.5 h-2.5 text-white" />
            </div>
        </div>

        {/* TO */}
        <div className="bg-gradient-to-br from-violet-500/20 via-violet-500/5 to-transparent ring-1 ring-violet-500/30 rounded-xl p-2">
            <div className="flex items-center justify-between">
                <span className="text-violet-200/80 text-[6.5px] font-bold">A</span>
                <span className="text-emerald-300 text-[6px] font-bold">+0,12% hoy</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[12px]">🇺🇸</span>
                <span className="text-white text-[9px] font-bold">USD</span>
                <span className="text-emerald-300 text-[14px] font-bold tabular-nums ml-auto">1.085,42</span>
            </div>
        </div>

        {/* Rate info */}
        <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-slate-500 text-[6.5px]">Tasa institucional</span>
            <span className="text-white text-[7px] font-bold font-mono">1 EUR = 1,0854 USD</span>
        </div>

        {/* Other rates */}
        <p className="text-white/50 text-[6px] font-bold uppercase tracking-wider mt-1.5 mb-0.5">Tasas en vivo</p>
        <div className="space-y-0.5 flex-1">
            {[
                { f: '🇬🇧', c: 'GBP', v: '0,8402', up: true },
                { f: '🇲🇽', c: 'MXN', v: '18,2410', up: false },
                { f: '🇩🇴', c: 'DOP', v: '58,12', up: true },
            ].map((r) => (
                <div key={r.c} className="bg-white/[0.04] ring-1 ring-white/10 rounded p-1 flex items-center gap-1.5">
                    <span className="text-[9px]">{r.f}</span>
                    <span className="text-white text-[7px] font-bold flex-1">EUR → {r.c}</span>
                    <span className="text-white text-[7px] font-bold tabular-nums">{r.v}</span>
                    <span className={`text-[6px] ${r.up ? 'text-emerald-400' : 'text-rose-400'}`}>{r.up ? '▲' : '▼'}</span>
                </div>
            ))}
        </div>

        {/* CTA */}
        <button className="mt-1.5 w-full h-6 rounded-lg bg-gradient-to-r from-cyan-400 to-violet-400 text-slate-950 text-[7.5px] font-bold flex items-center justify-center gap-1 shadow-[0_4px_12px_-2px_rgba(6,182,212,0.5)]">
            <CheckCircle2 className="w-2.5 h-2.5" /> Convertir ahora
        </button>

        <div className="mx-auto mt-1.5 w-[60px] h-[2.5px] rounded-full bg-white/80" />
    </div>
);


// ─── 3-screen carousel + floating 3D iPhone Pro ───────────────────
const SCREENS = [
    { key: 'balance', label: 'Balance & Inversiones', Comp: ScreenBalance },
    { key: 'withdrawals', label: 'Retiros & Movimientos', Comp: ScreenWithdrawals },
    { key: 'converter', label: 'Conversor Multidivisa', Comp: ScreenConverter },
];

const BannerPhone = () => {
    const [idx, setIdx] = useState(0);

    useEffect(() => {
        const t = setInterval(() => setIdx((i) => (i + 1) % SCREENS.length), 5000);
        return () => clearInterval(t);
    }, []);

    const Active = SCREENS[idx].Comp;

    return (
        <div className="relative" style={{ perspective: '1200px' }}>
            {/* Ambient blue glow */}
            <div className="absolute -inset-10 bg-gradient-to-br from-cyan-500/40 via-[#1973B8]/30 to-emerald-500/25 blur-3xl rounded-full pointer-events-none" />
            <div className="absolute -inset-6 bg-gradient-to-tr from-violet-500/15 to-transparent blur-2xl rounded-full pointer-events-none" />

            {/* Floor shadow — dynamic, scales with phone hover */}
            <motion.div
                animate={{ scaleX: [1, 0.78, 1], opacity: [0.7, 0.45, 0.7] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
                className="absolute bottom-[-22px] left-1/2 -translate-x-1/2 w-[200px] max-w-[80%] h-[26px] rounded-[50%] bg-black blur-xl pointer-events-none"
            />

            {/* Floating + 3D Y-axis rotation — continuous, GPU accelerated */}
            <motion.div
                initial={{ opacity: 0, y: 30, rotateY: -15, scale: 0.92 }}
                animate={{
                    opacity: 1,
                    y: [0, -10, 0],
                    rotateY: [-8, 8, -8],
                    rotateZ: [-3, 0, -3],
                    scale: 1,
                }}
                transition={{
                    opacity: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
                    scale: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
                    y: { duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.7 },
                    rotateY: { duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 0.7 },
                    rotateZ: { duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 0.7 },
                }}
                className="relative will-change-transform"
                style={{
                    transformStyle: 'preserve-3d',
                    backfaceVisibility: 'hidden',
                    filter: 'drop-shadow(0 30px 40px rgba(0,0,0,0.55)) drop-shadow(0 12px 20px rgba(6,182,212,0.18))',
                }}
            >
                {/* Titanium iPhone frame */}
                <div
                    className="relative w-[190px] h-[388px] rounded-[36px] p-[2.5px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.06)_inset]"
                    style={{
                        background: 'linear-gradient(135deg, #3a3a3c 0%, #1c1c1e 30%, #2c2c2e 50%, #1a1a1c 100%)',
                    }}
                >
                    {/* Glass top reflection */}
                    <div className="absolute top-0 left-1/4 right-1/4 h-9 bg-gradient-to-b from-white/[0.10] to-transparent rounded-b-full pointer-events-none z-30" />

                    <div className="relative w-full h-full rounded-[34px] bg-black overflow-hidden">
                        {/* Dynamic Island */}
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[70px] h-[18px] rounded-full bg-black ring-1 ring-slate-900/80 z-20 flex items-center justify-between px-2">
                            <div className="w-0.5 h-0.5 rounded-full bg-slate-700" />
                            <div className="w-1 h-1 rounded-full bg-slate-800 ring-[0.5px] ring-slate-700" />
                        </div>

                        {/* Screen container */}
                        <div
                            className="absolute inset-1 rounded-[32px] overflow-hidden"
                            style={{ background: 'linear-gradient(180deg, #0a1628 0%, #062046 25%, #051937 50%, #030f24 100%)' }}
                        >
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={SCREENS[idx].key}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                                    className="absolute inset-0"
                                >
                                    <Active />
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Subtle screen glare overlay */}
                        <div
                            className="absolute inset-0 rounded-[32px] pointer-events-none"
                            style={{
                                background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 35%, transparent 65%, rgba(255,255,255,0.03) 100%)',
                                mixBlendMode: 'overlay',
                            }}
                        />
                    </div>

                    {/* Hardware buttons */}
                    <div className="absolute right-[-2.5px] top-24 w-[2.5px] h-11 bg-gradient-to-b from-slate-700 to-slate-800 rounded-l" />
                    <div className="absolute left-[-2.5px] top-16 w-[2.5px] h-6 bg-gradient-to-b from-slate-700 to-slate-800 rounded-r" />
                    <div className="absolute left-[-2.5px] top-24 w-[2.5px] h-10 bg-gradient-to-b from-slate-700 to-slate-800 rounded-r" />
                    <div className="absolute left-[-2.5px] top-11 w-[2.5px] h-3.5 bg-gradient-to-b from-slate-600 to-slate-700 rounded-r" />
                </div>
            </motion.div>

            {/* Dots indicators */}
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-30">
                {SCREENS.map((s, i) => (
                    <button
                        key={s.key}
                        onClick={() => setIdx(i)}
                        className="group flex items-center"
                        data-testid={`banner-phone-dot-${s.key}`}
                        aria-label={s.label}
                    >
                        <span className={`block rounded-full transition-all duration-500 ${i === idx ? 'w-5 h-1 bg-cyan-300' : 'w-1 h-1 bg-white/30 group-hover:bg-white/60'}`} />
                    </button>
                ))}
            </div>
        </div>
    );
};


export const MobileAppBanner = () => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            data-testid="dashboard-mobile-app-banner"
            className="relative overflow-hidden rounded-2xl ring-1 ring-cyan-500/20 bg-gradient-to-br from-[#072146] via-[#0a1c3d] to-slate-950"
        >
            {/* Background blobs */}
            <div className="pointer-events-none absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full bg-cyan-500/12 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 left-1/4 w-[420px] h-[420px] rounded-full bg-emerald-500/10 blur-3xl" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{
                backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                backgroundSize: '24px 24px',
            }} />

            <div className="relative grid lg:grid-cols-[1fr_auto] gap-8 lg:gap-10 items-center p-6 sm:p-8">
                {/* ── Left content ──────────────────────────── */}
                <div>
                    <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400/15 ring-1 ring-amber-400/40 text-amber-300 text-[10px] font-bold uppercase tracking-[0.16em]"
                    >
                        <Sparkles className="w-3 h-3" />
                        Próximamente · Q2 2026
                    </motion.span>

                    <motion.h2
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="text-white text-2xl sm:text-3xl lg:text-[34px] font-bold leading-[1.1] tracking-tight mt-4"
                    >
                        <span className="block">PayLionsBit Mobile</span>
                        <span className="block text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-300 text-xl sm:text-2xl lg:text-[26px] mt-1.5">
                            Próximamente en App Store y Google Play
                        </span>
                    </motion.h2>

                    <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-slate-300 text-[13px] sm:text-[14px] leading-relaxed mt-3 max-w-xl"
                    >
                        Gestiona tus inversiones, sigue tus expedientes y opera tu cuenta multidivisa
                        directamente desde tu iPhone o Android · con notificaciones en tiempo real
                        y la misma experiencia institucional que ya conoces.
                    </motion.p>

                    {/* Feature pills */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.25 }}
                        className="flex flex-wrap gap-2 mt-4"
                    >
                        {[
                            { i: TrendingUp, label: 'Inversiones', color: '#10b981' },
                            { i: BarChart3, label: 'Gráficos en vivo', color: '#06b6d4' },
                            { i: Wallet, label: 'Multidivisa', color: '#1973B8' },
                            { i: Bell, label: 'Alertas push', color: '#f59e0b' },
                        ].map((f) => (
                            <span
                                key={f.label}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 ring-1 ring-white/10 text-[11px] font-semibold text-slate-200"
                            >
                                <f.i className="w-3 h-3" style={{ color: f.color }} />
                                {f.label}
                            </span>
                        ))}
                    </motion.div>

                    {/* Store badges + CTA */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-wrap items-center gap-3 mt-6"
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-black ring-1 ring-white/10 cursor-not-allowed select-none" title="Próximamente">
                            <svg viewBox="0 0 384 512" width="22" height="26" className="flex-shrink-0">
                                <path fill="#ffffff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                            </svg>
                            <div className="text-left leading-tight">
                                <p className="text-white text-[8.5px] tracking-wide font-medium">Pronto en</p>
                                <p className="text-white text-[13px] font-semibold -mt-0.5">App Store</p>
                            </div>
                        </div>
                        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-black ring-1 ring-white/10 cursor-not-allowed select-none" title="Próximamente">
                            <svg viewBox="0 0 32 36" width="20" height="24" className="flex-shrink-0">
                                <defs>
                                    <linearGradient id="gp-b-blue" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#00C2FF" /><stop offset="100%" stopColor="#1492DA" />
                                    </linearGradient>
                                    <linearGradient id="gp-b-green" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#00F076" /><stop offset="100%" stopColor="#00A852" />
                                    </linearGradient>
                                    <linearGradient id="gp-b-yellow" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#FFD834" /><stop offset="100%" stopColor="#FFBD00" />
                                    </linearGradient>
                                    <linearGradient id="gp-b-red" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#FF3A44" /><stop offset="100%" stopColor="#C31162" />
                                    </linearGradient>
                                </defs>
                                <path d="M0.5 1.5 L0.5 34.5 L17 18 Z" fill="url(#gp-b-blue)" />
                                <path d="M0.5 1.5 L17 18 L24.5 10.5 Z" fill="url(#gp-b-green)" />
                                <path d="M24.5 10.5 L17 18 L24.5 25.5 L31 18 Z" fill="url(#gp-b-yellow)" />
                                <path d="M17 18 L0.5 34.5 L24.5 25.5 Z" fill="url(#gp-b-red)" />
                            </svg>
                            <div className="text-left leading-tight">
                                <p className="text-white text-[8.5px] tracking-wide font-medium">Pronto en</p>
                                <p className="text-white text-[13px] font-semibold -mt-0.5">Google Play</p>
                            </div>
                        </div>

                        <Link
                            to="/mobile-app"
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-cyan-950 font-bold text-[12.5px] transition-colors shadow-[0_6px_20px_-4px_rgba(34,211,238,0.5)]"
                            data-testid="banner-mobile-cta"
                        >
                            Más info <ChevronRight className="w-4 h-4" />
                        </Link>
                    </motion.div>

                    {/* Social proof */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.45 }}
                        className="mt-4"
                    >
                        <WaitlistCounter variant="dark" size="md" testid="banner-waitlist-counter" />
                    </motion.div>
                </div>

                {/* ── Right phone mockup (centered, visible on all screens) ───── */}
                <div className="relative flex items-center justify-center mt-4 lg:mt-0 lg:pl-6 lg:pr-2 lg:py-6 mx-auto pb-8">
                    <BannerPhone />
                </div>
            </div>
        </motion.div>
    );
};

export default MobileAppBanner;
