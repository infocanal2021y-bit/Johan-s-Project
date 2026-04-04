import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { engagementAPI } from '../../lib/api';
import { Trophy, ChevronRight, Sparkles, Zap, Crown, Shield, Star, X } from 'lucide-react';

const LEVEL_COLORS = {
    bronce: { bg: 'from-amber-900/30 to-amber-800/10', border: 'border-amber-700/40', text: 'text-amber-400', bar: 'bg-amber-500', glow: 'shadow-amber-500/20' },
    plata: { bg: 'from-slate-400/20 to-slate-500/10', border: 'border-slate-400/40', text: 'text-slate-300', bar: 'bg-slate-400', glow: 'shadow-slate-400/20' },
    oro: { bg: 'from-yellow-600/20 to-yellow-500/10', border: 'border-yellow-500/40', text: 'text-yellow-400', bar: 'bg-yellow-500', glow: 'shadow-yellow-500/20' },
    platino: { bg: 'from-cyan-500/20 to-purple-500/10', border: 'border-cyan-400/40', text: 'text-cyan-300', bar: 'bg-gradient-to-r from-cyan-400 to-purple-400', glow: 'shadow-cyan-500/30' },
};

const LEVEL_ICONS = {
    bronce: Shield,
    plata: Star,
    oro: Crown,
    platino: Sparkles,
};

// Level-up celebration popup
const LevelUpPopup = ({ levelData, onClose }) => (
    <AnimatePresence>
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            data-testid="level-up-popup"
        >
            <motion.div
                initial={{ scale: 0.5, opacity: 0, rotate: -5 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            >
                {/* Sparkle header */}
                <div className={`p-6 bg-gradient-to-r ${LEVEL_COLORS[levelData.level]?.bg} relative overflow-hidden`}>
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                        className="absolute -top-8 -right-8 w-32 h-32 bg-white/5 rounded-full"
                    />
                    <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                    <div className="text-center relative z-10">
                        <motion.div
                            initial={{ y: -20 }}
                            animate={{ y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="text-5xl mb-3"
                        >
                            {levelData.icon}
                        </motion.div>
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            className="text-xs uppercase tracking-widest text-slate-400 mb-1"
                        >
                            Has alcanzado
                        </motion.p>
                        <motion.h2
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.5 }}
                            className={`text-3xl font-bold ${LEVEL_COLORS[levelData.level]?.text}`}
                        >
                            Nivel {levelData.label}
                        </motion.h2>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-slate-400 text-sm text-center">Felicidades! Ahora disfrutas de nuevos beneficios:</p>
                    <div className="space-y-2">
                        {levelData.benefits.map((b, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.6 + i * 0.1 }}
                                className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/50"
                            >
                                <Zap className={`w-4 h-4 ${LEVEL_COLORS[levelData.level]?.text} flex-shrink-0`} />
                                <span className="text-sm text-slate-300">{b}</span>
                            </motion.div>
                        ))}
                    </div>
                    <button
                        onClick={onClose}
                        className={`w-full py-3 rounded-lg font-semibold text-sm text-white ${LEVEL_COLORS[levelData.level]?.bar} hover:opacity-90 transition-opacity`}
                        data-testid="level-up-close"
                    >
                        Continuar
                    </button>
                </div>
            </motion.div>
        </motion.div>
    </AnimatePresence>
);

export const UserLevelCard = () => {
    const [levelData, setLevelData] = useState(null);
    const [showLevelUp, setShowLevelUp] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        engagementAPI.getUserLevel().then(res => {
            setLevelData(res.data);
            if (res.data?.leveled_up) setShowLevelUp(true);
        }).catch(() => {}).finally(() => setLoading(false));
    }, []);

    if (loading || !levelData) return null;

    const colors = LEVEL_COLORS[levelData.level] || LEVEL_COLORS.bronce;
    const LevelIcon = LEVEL_ICONS[levelData.level] || Shield;
    const nextInfo = levelData.next;

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl border ${colors.border} bg-gradient-to-r ${colors.bg} p-5 shadow-lg ${colors.glow}`}
                data-testid="user-level-card"
            >
                {/* Level header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-xl bg-slate-900/50 flex items-center justify-center`}>
                            <span className="text-2xl">{levelData.icon}</span>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider">Tu Nivel</p>
                            <h3 className={`text-xl font-bold ${colors.text}`} data-testid="user-level-label">
                                {levelData.label}
                            </h3>
                        </div>
                    </div>
                    <LevelIcon className={`w-6 h-6 ${colors.text} opacity-60`} />
                </div>

                {/* Benefits */}
                <div className="space-y-1.5 mb-4">
                    {levelData.benefits.slice(0, 2).map((b, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <Zap className={`w-3.5 h-3.5 ${colors.text} flex-shrink-0`} />
                            <span className="text-xs text-slate-400">{b}</span>
                        </div>
                    ))}
                </div>

                {/* Progress to next level */}
                {nextInfo && (
                    <div className="space-y-2 pt-3 border-t border-slate-800/50">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">Progreso a {nextInfo.next_label} {nextInfo.next_icon}</span>
                            <span className={`font-medium ${colors.text}`}>{nextInfo.progress}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800/80 overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${nextInfo.progress}%` }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                                className={`h-full rounded-full ${colors.bar}`}
                                data-testid="level-progress-bar"
                            />
                        </div>

                        {/* Dynamic message */}
                        {nextInfo.balance_needed > 0 && (
                            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1" data-testid="level-progress-message">
                                <ChevronRight className="w-3 h-3" />
                                Te faltan <strong className={colors.text}>
                                    €{nextInfo.balance_needed.toLocaleString('es-ES')}
                                </strong> para alcanzar {nextInfo.next_label}
                            </p>
                        )}
                    </div>
                )}

                {/* Max level */}
                {!nextInfo && (
                    <div className="pt-3 border-t border-slate-800/50">
                        <p className={`text-xs ${colors.text} flex items-center gap-1.5`}>
                            <Trophy className="w-3.5 h-3.5" />
                            Nivel maximo alcanzado
                        </p>
                    </div>
                )}

                {/* Psychological message */}
                {levelData.message && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="mt-3 p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/50"
                    >
                        <p className="text-xs text-slate-400 italic" data-testid="level-dynamic-message">
                            {levelData.message}
                        </p>
                    </motion.div>
                )}
            </motion.div>

            {/* Level-up popup */}
            {showLevelUp && levelData && (
                <LevelUpPopup levelData={levelData} onClose={() => setShowLevelUp(false)} />
            )}
        </>
    );
};
