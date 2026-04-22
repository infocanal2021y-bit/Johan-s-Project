import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useMemo } from 'react';

/**
 * AppBackground — ambient premium background for the authenticated shell.
 *
 * Same photographic base as AuthBackground (Manhattan financial skyline) with
 * a heavy dark overlay so dashboard content remains perfectly legible, plus
 * subtle section-aware accent lights so users feel a visual shift between
 * areas (Trading → cyan, Wallet → gold, Admin → crimson, Investing → emerald)
 * without breaking brand coherence.
 */

// Section → accent palette. Alpha values kept low so the base stays neutral.
const SECTION_TONES = {
    default: {
        primary: 'rgba(20, 84, 156, 0.22)',     // corporate blue
        secondary: 'rgba(240, 185, 11, 0.06)',  // amber hint
        orbPrimary: 'rgba(20, 84, 156, 0.22)',
        orbSecondary: 'rgba(240, 185, 11, 0.08)',
    },
    trading: {
        primary: 'rgba(34, 211, 238, 0.22)',    // cyan
        secondary: 'rgba(20, 84, 156, 0.18)',
        orbPrimary: 'rgba(34, 211, 238, 0.20)',
        orbSecondary: 'rgba(20, 84, 156, 0.18)',
    },
    wallet: {
        primary: 'rgba(240, 185, 11, 0.18)',    // gold
        secondary: 'rgba(20, 84, 156, 0.14)',
        orbPrimary: 'rgba(240, 185, 11, 0.16)',
        orbSecondary: 'rgba(20, 84, 156, 0.14)',
    },
    admin: {
        primary: 'rgba(220, 38, 38, 0.14)',     // crimson
        secondary: 'rgba(20, 84, 156, 0.18)',
        orbPrimary: 'rgba(220, 38, 38, 0.14)',
        orbSecondary: 'rgba(20, 84, 156, 0.18)',
    },
    investing: {
        primary: 'rgba(16, 185, 129, 0.16)',    // emerald
        secondary: 'rgba(20, 84, 156, 0.18)',
        orbPrimary: 'rgba(16, 185, 129, 0.14)',
        orbSecondary: 'rgba(20, 84, 156, 0.18)',
    },
};

function resolveSection(pathname) {
    if (!pathname) return 'default';
    if (pathname.startsWith('/trading') || pathname.startsWith('/trade')) return 'trading';
    if (
        pathname.startsWith('/withdraw') ||
        pathname.startsWith('/transactions') ||
        pathname.startsWith('/transfer') ||
        pathname.startsWith('/bitcoin') ||
        pathname.startsWith('/wallet') ||
        pathname.startsWith('/accounts')
    ) {
        return 'wallet';
    }
    if (pathname.startsWith('/admin')) return 'admin';
    if (pathname.startsWith('/investing') || pathname.startsWith('/advisors')) return 'investing';
    return 'default';
}

export const AppBackground = () => {
    const { pathname } = useLocation();
    const tone = useMemo(() => SECTION_TONES[resolveSection(pathname)], [pathname]);

    return (
        <div aria-hidden="true" className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
            {/* 1. Photographic base */}
            <div
                className="absolute inset-0 bg-center bg-cover"
                style={{
                    backgroundImage:
                        'url("https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=2400&q=70")',
                    backgroundColor: '#050a18',
                    opacity: 0.55,
                }}
            />

            {/* 2. Heavy dark overlay — dashboard readability */}
            <div
                className="absolute inset-0"
                style={{
                    background:
                        'linear-gradient(180deg, rgba(2,6,16,0.94) 0%, rgba(4,10,22,0.92) 40%, rgba(6,14,28,0.95) 100%)',
                }}
            />

            {/* 3. Section-aware accent lights (cross-fade on route change) */}
            <motion.div
                key={`accent-${tone.primary}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
                className="absolute inset-0"
                style={{
                    backgroundImage:
                        `radial-gradient(ellipse 900px 500px at 12% 8%, ${tone.primary}, transparent 60%),` +
                        `radial-gradient(ellipse 700px 450px at 92% 88%, ${tone.secondary}, transparent 65%)`,
                }}
            />

            {/* 4. Faint grain */}
            <div
                className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
                style={{
                    backgroundImage:
                        'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\'/></filter><rect width=\'200\' height=\'200\' filter=\'url(%23n)\'/></svg>")',
                }}
            />

            {/* 5. Ambient floating orbs — color varies by section */}
            <motion.div
                key={`orb-a-${tone.orbPrimary}`}
                className="absolute w-[520px] h-[520px] rounded-full"
                style={{
                    left: '-18%',
                    top: '5%',
                    background: `radial-gradient(circle, ${tone.orbPrimary} 0%, transparent 70%)`,
                    filter: 'blur(50px)',
                }}
                animate={{ y: [0, 25, 0], x: [0, 15, 0] }}
                transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
                key={`orb-b-${tone.orbSecondary}`}
                className="absolute w-[420px] h-[420px] rounded-full"
                style={{
                    right: '-12%',
                    bottom: '8%',
                    background: `radial-gradient(circle, ${tone.orbSecondary} 0%, transparent 70%)`,
                    filter: 'blur(50px)',
                }}
                animate={{ y: [0, -20, 0], x: [0, -12, 0] }}
                transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
            />
        </div>
    );
};

export default AppBackground;
