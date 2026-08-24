import { motion } from 'framer-motion';

/**
 * AuthBackground — full black brand background with the lion watermark,
 * matching the in-app AppBackground for 100% brand consistency.
 */
export const AuthBackground = () => {
    return (
        <div aria-hidden="true" className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
            {/* Pure black base */}
            <div className="absolute inset-0" style={{ background: '#000000' }} />

            {/* Subtle radial glow (top-left) */}
            <div
                className="absolute -top-32 -left-32 w-[640px] h-[640px] rounded-full opacity-40 blur-3xl"
                style={{ background: 'radial-gradient(circle, rgba(25, 115, 184, 0.35) 0%, transparent 60%)' }}
            />

            {/* Subtle radial glow (bottom-right) */}
            <div
                className="absolute -bottom-40 -right-40 w-[720px] h-[720px] rounded-full opacity-30 blur-3xl"
                style={{ background: 'radial-gradient(circle, rgba(0, 68, 129, 0.55) 0%, transparent 65%)' }}
            />

            {/* Top brand gradient strip */}
            <div
                className="absolute inset-x-0 top-0 h-[280px]"
                style={{
                    background: 'linear-gradient(180deg, rgba(0, 68, 129, 0.35) 0%, rgba(0, 0, 0, 0) 100%)',
                }}
            />

            {/* Lion watermark — large, centred, very low opacity */}
            <div className="absolute inset-0 flex items-center justify-center">
                <img
                    src="/lionsbit-logo.jpg"
                    alt=""
                    aria-hidden="true"
                    draggable="false"
                    className="select-none"
                    style={{
                        width: 'min(70vw, 900px)',
                        height: 'min(70vw, 900px)',
                        maxWidth: '900px',
                        maxHeight: '900px',
                        objectFit: 'contain',
                        opacity: 0.07,
                        filter: 'grayscale(100%) brightness(1.6)',
                        mixBlendMode: 'screen',
                    }}
                />
            </div>

            {/* Ambient floating orbs for depth */}
            <motion.div
                className="absolute w-[420px] h-[420px] rounded-full"
                style={{
                    right: '-10%',
                    bottom: '10%',
                    background: 'radial-gradient(circle, rgba(240,185,11,0.10) 0%, transparent 70%)',
                    filter: 'blur(40px)',
                }}
                animate={{ y: [0, -25, 0], x: [0, -15, 0] }}
                transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
            />

            {/* Vignette to focus the centre */}
            <div
                className="absolute inset-0"
                style={{
                    background: 'radial-gradient(ellipse at center, transparent 0%, transparent 50%, rgba(0, 0, 0, 0.6) 100%)',
                }}
            />
        </div>
    );
};

export default AuthBackground;
