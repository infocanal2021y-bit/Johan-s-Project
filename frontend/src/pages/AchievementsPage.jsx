import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { engagementAPI } from '../lib/api';
import { Trophy, Lock, CheckCircle, X, Sparkles } from 'lucide-react';

const CATEGORY_LABELS = {
    basico: 'Basicos',
    inversion: 'Inversion',
    transacciones: 'Transacciones',
    actividad: 'Actividad',
    niveles: 'Niveles',
};

const CATEGORY_ORDER = ['basico', 'transacciones', 'inversion', 'actividad', 'niveles'];

// Celebration popup
const AchievementPopup = ({ achievement, onClose }) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        data-testid="achievement-popup"
    >
        <motion.div
            initial={{ scale: 0.3, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.3, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 250, damping: 18 }}
            className="bg-slate-900 border border-yellow-500/30 rounded-2xl shadow-2xl shadow-yellow-500/10 max-w-sm w-full overflow-hidden"
        >
            <div className="relative p-8 text-center bg-gradient-to-b from-yellow-500/10 to-transparent">
                <button onClick={onClose} className="absolute top-3 right-3 text-slate-500 hover:text-white">
                    <X className="w-5 h-5" />
                </button>
                <motion.div
                    initial={{ y: -30 }}
                    animate={{ y: 0 }}
                    transition={{ delay: 0.2, type: 'spring' }}
                    className="text-6xl mb-4"
                >
                    {achievement.icon}
                </motion.div>
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-xs uppercase tracking-widest text-yellow-400/80 mb-2"
                >
                    Logro Desbloqueado
                </motion.p>
                <motion.h3
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-2xl font-bold text-white mb-2"
                >
                    {achievement.name}
                </motion.h3>
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-slate-400 text-sm"
                >
                    {achievement.desc}
                </motion.p>
            </div>
            <div className="p-4 border-t border-slate-800">
                <button
                    onClick={onClose}
                    className="w-full py-2.5 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors font-semibold text-sm"
                    data-testid="achievement-popup-close"
                >
                    Continuar
                </button>
            </div>
        </motion.div>
    </motion.div>
);

// Single achievement card
const AchievementCard = ({ achievement, index }) => {
    const unlocked = achievement.unlocked;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`relative p-4 rounded-xl border transition-all ${
                unlocked
                    ? 'bg-slate-900/70 border-yellow-500/30 hover:border-yellow-500/50 shadow-lg shadow-yellow-500/5'
                    : 'bg-slate-900/30 border-slate-800/50 opacity-60'
            }`}
            data-testid={`achievement-${achievement.id}`}
        >
            <div className="flex items-start gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    unlocked ? 'bg-yellow-500/15' : 'bg-slate-800/50'
                }`}>
                    {unlocked ? (
                        <span className="text-2xl">{achievement.icon}</span>
                    ) : (
                        <Lock className="w-5 h-5 text-slate-600" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h4 className={`text-sm font-semibold truncate ${unlocked ? 'text-white' : 'text-slate-500'}`}>
                            {achievement.name}
                        </h4>
                        {unlocked && <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                    </div>
                    <p className={`text-xs mt-0.5 ${unlocked ? 'text-slate-400' : 'text-slate-600'}`}>
                        {achievement.desc}
                    </p>
                    {unlocked && achievement.unlocked_at && (
                        <p className="text-xs text-slate-600 mt-1">
                            {new Date(achievement.unlocked_at).toLocaleDateString('es-ES', {
                                day: '2-digit', month: 'short', year: 'numeric'
                            })}
                        </p>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export const AchievementsPage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [popupAchievement, setPopupAchievement] = useState(null);

    useEffect(() => {
        engagementAPI.getAchievements().then(res => {
            setData(res.data);
            if (res.data?.newly_unlocked?.length > 0) {
                setPopupAchievement(res.data.newly_unlocked[0]);
            }
        }).catch(() => {}).finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <Layout>
                <div className="flex justify-center py-24">
                    <div className="w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                </div>
            </Layout>
        );
    }

    const achievements = data?.achievements || [];
    const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
        const items = achievements.filter(a => a.category === cat);
        if (items.length > 0) acc.push({ category: cat, items });
        return acc;
    }, []);

    return (
        <Layout>
            <div className="space-y-6" data-testid="achievements-page">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-heading font-bold text-white flex items-center gap-3">
                            <Trophy className="w-8 h-8 text-yellow-400" />
                            Logros
                        </h1>
                        <p className="text-slate-500 mt-1">Tu progreso y medallas desbloqueadas</p>
                    </div>
                </div>

                {/* Overall Progress */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-5 rounded-xl bg-gradient-to-r from-yellow-500/10 to-amber-500/5 border border-yellow-500/20"
                    data-testid="achievements-progress"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-yellow-400" />
                            <span className="text-white font-semibold">Progreso General</span>
                        </div>
                        <span className="text-yellow-400 font-bold text-lg" data-testid="achievements-count">
                            {data?.completed}/{data?.total}
                        </span>
                    </div>
                    <div className="h-3 rounded-full bg-slate-800/80 overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${data?.progress || 0}%` }}
                            transition={{ duration: 1.2, ease: 'easeOut' }}
                            className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-amber-400"
                            data-testid="achievements-progress-bar"
                        />
                    </div>
                    <p className="text-slate-500 text-xs mt-2">
                        {data?.progress}% completado — {(data?.total || 0) - (data?.completed || 0)} logros restantes
                    </p>
                </motion.div>

                {/* Achievements by Category */}
                {grouped.map(({ category, items }) => (
                    <div key={category} className="space-y-3">
                        <h2 className="text-sm uppercase tracking-wider text-slate-500 font-semibold pl-1">
                            {CATEGORY_LABELS[category] || category}
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {items.map((ach, i) => (
                                <AchievementCard key={ach.id} achievement={ach} index={i} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Celebration popup */}
            <AnimatePresence>
                {popupAchievement && (
                    <AchievementPopup
                        achievement={popupAchievement}
                        onClose={() => setPopupAchievement(null)}
                    />
                )}
            </AnimatePresence>
        </Layout>
    );
};

export default AchievementsPage;
