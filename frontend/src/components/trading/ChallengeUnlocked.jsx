import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Sparkles, X } from 'lucide-react';

/**
 * Animated celebration overlay when a challenge is unlocked.
 * Renders one card per challenge in the queue. Auto-dismisses after 5s.
 */
export const ChallengeUnlocked = ({ queue, onDismiss }) => {
    // Auto-dismiss top item after 5s
    useEffect(() => {
        if (!queue || queue.length === 0) return;
        const t = setTimeout(() => onDismiss(queue[0].id), 5000);
        return () => clearTimeout(t);
    }, [queue, onDismiss]);

    return (
        <div className="fixed top-20 right-6 z-50 flex flex-col gap-3 pointer-events-none" data-testid="challenge-unlocked-container">
            <AnimatePresence>
                {queue.slice(0, 3).map((ch) => (
                    <motion.div
                        key={ch.id}
                        layout
                        initial={{ opacity: 0, x: 80, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 80, scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                        className="relative w-80 pointer-events-auto overflow-hidden rounded-xl shadow-2xl bg-gradient-to-br from-[#1a1f26] via-[#14181d] to-[#0b0e11] border border-[#F0B90B]/40"
                        data-testid={`challenge-unlocked-${ch.id}`}
                    >
                        {/* Shimmer */}
                        <motion.div
                            className="absolute inset-0 pointer-events-none"
                            style={{
                                background: 'linear-gradient(110deg, transparent 40%, rgba(240, 185, 11, 0.15) 50%, transparent 60%)',
                            }}
                            initial={{ x: '-100%' }}
                            animate={{ x: '100%' }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                        />
                        <div className="relative flex items-start gap-3 p-4">
                            <motion.div
                                initial={{ rotate: -30, scale: 0.5 }}
                                animate={{ rotate: 0, scale: 1 }}
                                transition={{ type: 'spring', stiffness: 300 }}
                                className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F0B90B] to-amber-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#F0B90B]/30"
                            >
                                <Trophy className="w-6 h-6 text-black" />
                            </motion.div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] text-[#F0B90B] uppercase tracking-widest font-bold flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" /> Reto desbloqueado
                                </p>
                                <p className="text-white font-bold text-sm mt-0.5 truncate">{ch.name}</p>
                                <p className="text-slate-400 text-[11px] leading-snug mt-1 line-clamp-2">{ch.desc}</p>
                                <div className="mt-2 flex items-center gap-2">
                                    <span className="text-[10px] bg-[#F0B90B]/15 text-[#F0B90B] px-2 py-0.5 rounded font-bold">+{ch.xp} XP</span>
                                    {ch.badge && (
                                        <span className="text-[10px] bg-cyan-500/15 text-cyan-300 px-2 py-0.5 rounded font-bold">{ch.badge}</span>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => onDismiss(ch.id)}
                                className="text-slate-500 hover:text-white transition-colors flex-shrink-0"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        {/* Bottom highlight */}
                        <motion.div
                            className="absolute bottom-0 left-0 h-0.5 bg-[#F0B90B]"
                            initial={{ width: '100%' }}
                            animate={{ width: 0 }}
                            transition={{ duration: 5, ease: 'linear' }}
                        />
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};

export default ChallengeUnlocked;
