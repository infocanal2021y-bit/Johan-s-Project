import { motion } from 'framer-motion';

/**
 * AuthBackground — full-bleed premium background for all auth pages.
 *
 * Composition (bottom → top):
 *   1. Hi-res Manhattan financial district skyline photo (Unsplash CDN)
 *   2. Deep navy gradient overlay for brand consistency and contrast
 *   3. Soft corporate radial spotlights (Lionsbit blue + amber accent)
 *   4. Decorative animated candlestick/chart SVG overlay (subtle)
 *   5. Vignette + grain for cinematic feel
 */
export const AuthBackground = () => {
    return (
        <div aria-hidden="true" className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
            {/* 1. Photographic background — NYC financial district at night */}
            <div
                className="absolute inset-0 bg-center bg-cover"
                style={{
                    backgroundImage:
                        'url("https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=2400&q=80")',
                    backgroundColor: '#050a18',
                }}
            />

            {/* 2. Deep navy brand gradient overlay (keeps Lionsbit #14549C family) */}
            <div
                className="absolute inset-0"
                style={{
                    background:
                        'linear-gradient(135deg, rgba(4,9,20,0.88) 0%, rgba(8,19,39,0.82) 45%, rgba(10,30,60,0.78) 100%)',
                }}
            />

            {/* 3. Radial spotlights — corporate accents */}
            <div
                className="absolute inset-0"
                style={{
                    backgroundImage:
                        'radial-gradient(ellipse 900px 500px at 15% 10%, rgba(20, 84, 156, 0.45), transparent 60%),' +
                        'radial-gradient(ellipse 700px 450px at 88% 85%, rgba(240, 185, 11, 0.12), transparent 65%),' +
                        'radial-gradient(circle 600px at 50% 110%, rgba(34, 211, 238, 0.10), transparent 70%)',
                }}
            />

            {/* 4. Subtle animated chart ribbon at bottom (keeps financial motion) */}
            <svg
                className="absolute bottom-0 left-0 w-full"
                preserveAspectRatio="none"
                viewBox="0 0 1920 400"
                style={{ height: '45vh', opacity: 0.35 }}
            >
                <defs>
                    <linearGradient id="abChartLine" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#14549C" stopOpacity="0" />
                        <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.95" />
                        <stop offset="100%" stopColor="#14549C" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="abChartArea" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#14549C" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#14549C" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="abGoldLine" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#F0B90B" stopOpacity="0" />
                        <stop offset="50%" stopColor="#F0B90B" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#F0B90B" stopOpacity="0" />
                    </linearGradient>
                </defs>

                <motion.path
                    d="M -50 260 Q 220 180 420 220 T 800 160 T 1200 200 T 1600 120 T 2000 160 L 2000 420 L -50 420 Z"
                    fill="url(#abChartArea)"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1.8, ease: 'easeOut' }}
                />

                <motion.path
                    d="M -50 260 Q 220 180 420 220 T 800 160 T 1200 200 T 1600 120 T 2000 160"
                    fill="none"
                    stroke="url(#abChartLine)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 3.2, ease: 'easeInOut' }}
                />

                <motion.path
                    d="M -50 340 Q 300 300 500 320 T 900 280 T 1400 310 T 2000 260"
                    fill="none"
                    stroke="url(#abGoldLine)"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeDasharray="6 8"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.7 }}
                    transition={{ duration: 3.8, delay: 0.4, ease: 'easeInOut' }}
                />
            </svg>

            {/* 5. Vignette */}
            <div
                className="absolute inset-0"
                style={{
                    background:
                        'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.65) 100%)',
                }}
            />

            {/* 6. Faint grain */}
            <div
                className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
                style={{
                    backgroundImage:
                        'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\'/></filter><rect width=\'200\' height=\'200\' filter=\'url(%23n)\'/></svg>")',
                }}
            />

            {/* 7. Ambient floating orbs for depth */}
            <motion.div
                className="absolute w-[520px] h-[520px] rounded-full"
                style={{
                    left: '-15%',
                    top: '8%',
                    background: 'radial-gradient(circle, rgba(20,84,156,0.35) 0%, transparent 70%)',
                    filter: 'blur(40px)',
                }}
                animate={{ y: [0, 30, 0], x: [0, 20, 0] }}
                transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
                className="absolute w-[420px] h-[420px] rounded-full"
                style={{
                    right: '-10%',
                    bottom: '10%',
                    background: 'radial-gradient(circle, rgba(240,185,11,0.15) 0%, transparent 70%)',
                    filter: 'blur(40px)',
                }}
                animate={{ y: [0, -25, 0], x: [0, -15, 0] }}
                transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
            />
        </div>
    );
};

export default AuthBackground;
