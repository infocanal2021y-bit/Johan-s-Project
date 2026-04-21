import { motion } from 'framer-motion';

/**
 * AuthLogo — branded logo + wordmark block used on all auth pages.
 *
 * Variant "full"   → Logo + text (LIONSBIT VERIFICACION) side-by-side.
 * Variant "compact"→ Logo only, slightly smaller (used in sub-steps).
 */
export const AuthLogo = ({ variant = 'full', subtitle = 'Plataforma de Verificación Digital' }) => {
    const size = variant === 'compact' ? 'w-14 h-14' : 'w-16 h-16';

    return (
        <div className="text-center">
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="inline-flex items-center gap-4 mb-3"
            >
                {/* Brand mark */}
                <div className="relative">
                    {/* Golden halo */}
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 rounded-2xl blur-xl opacity-70"
                        style={{
                            background:
                                'radial-gradient(circle, rgba(240,185,11,0.55) 0%, rgba(240,185,11,0.15) 55%, transparent 75%)',
                        }}
                    />
                    <div
                        className={`relative ${size} rounded-2xl overflow-hidden ring-1 ring-amber-400/40 shadow-[0_10px_40px_-10px_rgba(240,185,11,0.55)]`}
                        style={{
                            background: 'linear-gradient(135deg, #0b1b34 0%, #142b52 100%)',
                        }}
                    >
                        <img
                            src="/lionsbit-logo.jpg"
                            alt="Lionsbit Verificación"
                            className="w-full h-full object-cover"
                            draggable="false"
                        />
                        {/* Subtle inner glow */}
                        <div className="absolute inset-0 ring-1 ring-white/10 rounded-2xl pointer-events-none" />
                    </div>
                </div>

                {/* Wordmark */}
                <div className="text-left leading-tight">
                    <h1
                        className="text-white"
                        style={{
                            fontSize: variant === 'compact' ? '1.35rem' : '1.55rem',
                            fontWeight: 800,
                            letterSpacing: '-0.01em',
                            textShadow: '0 2px 12px rgba(0,0,0,0.6)',
                        }}
                    >
                        LIONSBIT
                    </h1>
                    <p
                        className="text-amber-400/90 tracking-[0.28em] uppercase"
                        style={{
                            fontSize: '0.62rem',
                            fontWeight: 600,
                            textShadow: '0 1px 6px rgba(0,0,0,0.8)',
                        }}
                    >
                        VERIFICACIÓN
                    </p>
                </div>
            </motion.div>

            {subtitle && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                    className="text-slate-300/80 font-light text-sm"
                    style={{ textShadow: '0 1px 8px rgba(0,0,0,0.7)' }}
                >
                    {subtitle}
                </motion.p>
            )}
        </div>
    );
};

export default AuthLogo;
