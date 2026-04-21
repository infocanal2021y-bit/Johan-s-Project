import { motion } from 'framer-motion';

/**
 * AuthBackground — reusable ambient background for the auth pages (login, register, reset).
 *
 * Layers (bottom → top):
 *   1. Deep navy gradient (matches Lionsbit corporate blue #14549C family)
 *   2. Soft radial spotlights (corporate cyan + amber accent)
 *   3. Subtle grid pattern — financial-terminal feel
 *   4. Animated stock ticker lines (pure SVG, no extra images)
 *   5. Grain / noise overlay
 */
export const AuthBackground = () => {
    return (
        <div aria-hidden="true" className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
            {/* 1. Base gradient */}
            <div
                className="absolute inset-0"
                style={{
                    background: 'linear-gradient(135deg, #040914 0%, #081327 45%, #0a1e3c 100%)',
                }}
            />

            {/* 2. Radial spotlights */}
            <div
                className="absolute inset-0"
                style={{
                    backgroundImage:
                        'radial-gradient(ellipse 900px 500px at 15% 10%, rgba(20, 84, 156, 0.35), transparent 60%),' +
                        'radial-gradient(ellipse 700px 450px at 90% 90%, rgba(20, 84, 156, 0.28), transparent 65%),' +
                        'radial-gradient(circle 600px at 50% 110%, rgba(34, 211, 238, 0.08), transparent 70%)',
                }}
            />

            {/* 3. Subtle dotted grid */}
            <div
                className="absolute inset-0 opacity-[0.25]"
                style={{
                    backgroundImage:
                        'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)',
                    backgroundSize: '40px 40px',
                    maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 80%)',
                    WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 80%)',
                }}
            />

            {/* 4. Animated chart / ticker lines (decorative SVG) */}
            <svg
                className="absolute inset-0 w-full h-full"
                preserveAspectRatio="none"
                viewBox="0 0 1920 1080"
                style={{ opacity: 0.22 }}
            >
                <defs>
                    <linearGradient id="chartLineA" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#14549C" stopOpacity="0" />
                        <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.9" />
                        <stop offset="100%" stopColor="#14549C" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="chartLineB" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#F0B90B" stopOpacity="0" />
                        <stop offset="50%" stopColor="#F0B90B" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#F0B90B" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="chartAreaA" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#14549C" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#14549C" stopOpacity="0" />
                    </linearGradient>
                </defs>

                {/* Background curve with area fill */}
                <motion.path
                    d="M -50 720 Q 220 640 420 680 T 800 620 T 1200 660 T 1600 580 T 2000 620 L 2000 1100 L -50 1100 Z"
                    fill="url(#chartAreaA)"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 2, ease: 'easeOut' }}
                />

                {/* Main bullish line */}
                <motion.path
                    d="M -50 720 Q 220 640 420 680 T 800 620 T 1200 660 T 1600 580 T 2000 620"
                    fill="none"
                    stroke="url(#chartLineA)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 3.2, ease: 'easeInOut' }}
                />

                {/* Secondary thinner line (amber) */}
                <motion.path
                    d="M -50 820 Q 300 780 500 800 T 900 760 T 1400 790 T 2000 740"
                    fill="none"
                    stroke="url(#chartLineB)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeDasharray="6 8"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.6 }}
                    transition={{ duration: 3.8, delay: 0.4, ease: 'easeInOut' }}
                />

                {/* Candlestick-style vertical ticks */}
                {Array.from({ length: 22 }).map((_, i) => {
                    const x = 60 + i * 86;
                    const high = 520 + Math.sin(i * 1.3) * 80;
                    const low = 620 + Math.cos(i * 0.9) * 70;
                    const up = i % 3 !== 0;
                    const open = up ? low - 20 : high + 20;
                    const close = up ? high + 20 : low - 20;
                    const color = up ? '#0ecb81' : '#f6465d';
                    return (
                        <motion.g
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 0.35, y: 0 }}
                            transition={{ duration: 1, delay: 0.6 + i * 0.04, ease: 'easeOut' }}
                        >
                            <line x1={x} y1={high} x2={x} y2={low} stroke={color} strokeWidth="1" />
                            <rect
                                x={x - 5}
                                y={Math.min(open, close)}
                                width="10"
                                height={Math.abs(close - open) + 3}
                                fill={color}
                                opacity="0.55"
                            />
                        </motion.g>
                    );
                })}
            </svg>

            {/* 5. Subtle vignette */}
            <div
                className="absolute inset-0"
                style={{
                    background:
                        'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)',
                }}
            />

            {/* 6. Very faint grain */}
            <div
                className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
                style={{
                    backgroundImage:
                        'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\'/></filter><rect width=\'200\' height=\'200\' filter=\'url(%23n)\'/></svg>")',
                }}
            />

            {/* 7. Floating glowing orbs for depth */}
            <motion.div
                className="absolute w-[520px] h-[520px] rounded-full pointer-events-none"
                style={{
                    left: '-15%',
                    top: '10%',
                    background: 'radial-gradient(circle, rgba(20,84,156,0.35) 0%, transparent 70%)',
                    filter: 'blur(40px)',
                }}
                animate={{ y: [0, 30, 0], x: [0, 20, 0] }}
                transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
                className="absolute w-[420px] h-[420px] rounded-full pointer-events-none"
                style={{
                    right: '-10%',
                    bottom: '12%',
                    background: 'radial-gradient(circle, rgba(34,211,238,0.18) 0%, transparent 70%)',
                    filter: 'blur(40px)',
                }}
                animate={{ y: [0, -25, 0], x: [0, -15, 0] }}
                transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
            />
        </div>
    );
};

export default AuthBackground;
