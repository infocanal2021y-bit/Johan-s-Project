import { motion } from 'framer-motion';

/**
 * AppBackground — ambient premium background for the authenticated shell.
 *
 * Same photographic base as AuthBackground (Manhattan financial skyline)
 * but with a significantly darker overlay to preserve dashboard readability.
 * Kept behind all content via z-index 0; Layout children sit above at z-index 10.
 */
export const AppBackground = () => {
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

            {/* 2. Heavy dark overlay — keeps dashboard content highly readable */}
            <div
                className="absolute inset-0"
                style={{
                    background:
                        'linear-gradient(180deg, rgba(2,6,16,0.94) 0%, rgba(4,10,22,0.92) 40%, rgba(6,14,28,0.95) 100%)',
                }}
            />

            {/* 3. Subtle corporate accent lights */}
            <div
                className="absolute inset-0"
                style={{
                    backgroundImage:
                        'radial-gradient(ellipse 900px 500px at 12% 8%, rgba(20, 84, 156, 0.22), transparent 60%),' +
                        'radial-gradient(ellipse 700px 450px at 92% 88%, rgba(240, 185, 11, 0.06), transparent 65%)',
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

            {/* 5. Ambient floating orbs for depth */}
            <motion.div
                className="absolute w-[520px] h-[520px] rounded-full"
                style={{
                    left: '-18%',
                    top: '5%',
                    background: 'radial-gradient(circle, rgba(20,84,156,0.22) 0%, transparent 70%)',
                    filter: 'blur(50px)',
                }}
                animate={{ y: [0, 25, 0], x: [0, 15, 0] }}
                transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
                className="absolute w-[420px] h-[420px] rounded-full"
                style={{
                    right: '-12%',
                    bottom: '8%',
                    background: 'radial-gradient(circle, rgba(240,185,11,0.08) 0%, transparent 70%)',
                    filter: 'blur(50px)',
                }}
                animate={{ y: [0, -20, 0], x: [0, -12, 0] }}
                transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
            />
        </div>
    );
};

export default AppBackground;
