import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
    Smartphone, Apple, ChevronRight, TrendingUp, Wallet, Bell,
    Sparkles, ShieldCheck, BarChart3,
} from 'lucide-react';
import { WaitlistCounter } from './WaitlistCounter';


// Compact phone mockup tuned for a horizontal banner (smaller than the dedicated /mobile-app page).
const BannerPhone = () => (
    <motion.div
        initial={{ opacity: 0, y: 20, rotate: -8 }}
        animate={{ opacity: 1, y: 0, rotate: -8 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative"
    >
        {/* Glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/40 via-[#1973B8]/30 to-emerald-500/30 blur-3xl rounded-full" />

        <div className="relative w-[180px] h-[360px] rounded-[32px] bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 ring-[5px] ring-slate-950 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)]">
            {/* Notch */}
            <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-16 h-3.5 rounded-full bg-black z-10" />

            <div className="absolute inset-1.5 rounded-[28px] overflow-hidden bg-gradient-to-br from-[#0a1628] via-[#072146] to-slate-950">
                <div className="absolute inset-0 p-3 pt-6 flex flex-col">
                    <div className="flex items-center justify-between text-white text-[7.5px] font-bold opacity-80 mb-2">
                        <span>9:41</span>
                        <span className="flex items-center gap-0.5">●●●● 5G</span>
                    </div>
                    <div className="flex items-center gap-1 mb-1.5">
                        <ShieldCheck className="w-2.5 h-2.5 text-cyan-300" />
                        <p className="text-cyan-300 text-[7px] font-bold tracking-[0.18em] uppercase">PayLionsBit</p>
                    </div>
                    <p className="text-slate-400 text-[7px]">Balance disponible</p>
                    <p className="text-white text-[16px] font-bold tabular-nums tracking-tight mt-0.5">€48.250</p>
                    <p className="text-emerald-400 text-[7px] font-bold mt-0">▲ +2,4% semana</p>

                    {/* Quick actions */}
                    <div className="grid grid-cols-4 gap-1 mt-2.5">
                        {[Wallet, BarChart3, TrendingUp, Bell].map((Ic, i) => (
                            <div key={i} className="bg-white/5 ring-1 ring-white/10 rounded-md py-1.5 flex flex-col items-center gap-0.5">
                                <Ic className="w-2.5 h-2.5 text-cyan-300" />
                            </div>
                        ))}
                    </div>

                    {/* Chart */}
                    <div className="bg-white/5 ring-1 ring-white/10 rounded-md p-1.5 mt-2 mb-1.5">
                        <p className="text-white text-[6.5px] font-bold uppercase tracking-wider mb-0.5">Inversiones</p>
                        <svg viewBox="0 0 200 40" className="w-full">
                            <defs>
                                <linearGradient id="bp-chart" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.7" />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path d="M0,30 L25,25 L50,20 L75,22 L100,12 L125,16 L150,8 L175,12 L200,5 L200,40 L0,40 Z" fill="url(#bp-chart)" />
                            <path d="M0,30 L25,25 L50,20 L75,22 L100,12 L125,16 L150,8 L175,12 L200,5" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </div>

                    {/* Multi-currency mini cards */}
                    <div className="grid grid-cols-3 gap-0.5 mt-auto">
                        {[
                            { f: '🇺🇸', c: 'USD', v: '5.2k' },
                            { f: '🇬🇧', c: 'GBP', v: '1.8k' },
                            { f: '🇲🇽', c: 'MXN', v: '88k' },
                        ].map((m) => (
                            <div key={m.c} className="bg-white/5 ring-1 ring-white/10 rounded p-1">
                                <p className="text-white/70 text-[6px] font-bold">{m.f} {m.c}</p>
                                <p className="text-white text-[8px] font-bold font-mono">{m.v}</p>
                            </div>
                        ))}
                    </div>

                    {/* Notification */}
                    <div className="bg-cyan-500/10 ring-1 ring-cyan-500/30 rounded-md p-1 flex items-start gap-1 mt-1">
                        <Bell className="w-2 h-2 text-cyan-300 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-cyan-200 text-[6.5px] font-bold">Conversión USD→EUR ✓</p>
                            <p className="text-cyan-300/70 text-[6px]">Hace 2 min</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="absolute right-[-2px] top-20 w-[2px] h-8 bg-slate-700 rounded-l" />
            <div className="absolute left-[-2px] top-16 w-[2px] h-5 bg-slate-700 rounded-r" />
            <div className="absolute left-[-2px] top-24 w-[2px] h-9 bg-slate-700 rounded-r" />
        </div>
    </motion.div>
);


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

            <div className="relative grid lg:grid-cols-[1fr_auto] gap-6 lg:gap-10 items-center p-6 sm:p-8">
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
                        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-black/60 ring-1 ring-slate-700 opacity-90 cursor-not-allowed select-none" title="Próximamente">
                            <Apple className="w-5 h-5 text-white" />
                            <div className="text-left leading-tight">
                                <p className="text-slate-400 text-[8.5px] uppercase tracking-wider font-semibold">Pronto en</p>
                                <p className="text-white text-[12px] font-bold">App Store</p>
                            </div>
                        </div>
                        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-black/60 ring-1 ring-slate-700 opacity-90 cursor-not-allowed select-none" title="Próximamente">
                            <Smartphone className="w-5 h-5 text-emerald-400" />
                            <div className="text-left leading-tight">
                                <p className="text-slate-400 text-[8.5px] uppercase tracking-wider font-semibold">Pronto en</p>
                                <p className="text-white text-[12px] font-bold">Google Play</p>
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

                {/* ── Right phone mockup ────────────────────── */}
                <div className="hidden md:block relative">
                    <BannerPhone />
                </div>
            </div>
        </motion.div>
    );
};

export default MobileAppBanner;
