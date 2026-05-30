import { useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Users } from 'lucide-react';
import api from '../../lib/api';


/**
 * Compact social-proof pill — counts up from 0 to the real waitlist total on mount.
 *
 * Props:
 *   - boost?: number — locally bumps the total (e.g. by 1 right after the user
 *             joins, before the next fetch). Optional.
 *   - variant?: 'dark' | 'light' — adjust styling for dark cards vs light surfaces.
 *   - size?: 'sm' | 'md'
 *   - testid?: string
 */
export const WaitlistCounter = ({ boost = 0, variant = 'dark', size = 'sm', testid = 'waitlist-counter' }) => {
    const [target, setTarget] = useState(null);
    const motionValue = useMotionValue(0);
    const rounded = useTransform(motionValue, (v) => Math.floor(v).toLocaleString('es-ES'));

    useEffect(() => {
        let alive = true;
        api.get('/mobile-app/waitlist/count')
            .then((r) => { if (alive) setTarget((r.data?.total ?? 0)); })
            .catch(() => { if (alive) setTarget(0); });
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        if (target === null) return;
        const final = Math.max(0, target + boost);
        const controls = animate(motionValue, final, {
            duration: 1.2,
            ease: [0.16, 1, 0.3, 1],
        });
        return () => controls.stop();
    }, [target, boost, motionValue]);

    if (target === null) return null;

    const isDark = variant === 'dark';
    const sizes = size === 'md' ? {
        pad: 'px-3 py-1.5',
        text: 'text-[12px]',
        icon: 'w-3.5 h-3.5',
        dot: 'w-1.5 h-1.5',
    } : {
        pad: 'px-2 py-1',
        text: 'text-[10.5px]',
        icon: 'w-3 h-3',
        dot: 'w-1 h-1',
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${sizes.pad} ${sizes.text} ${
                isDark
                    ? 'bg-white/5 ring-1 ring-white/10 text-slate-200'
                    : 'bg-slate-100 ring-1 ring-slate-200 text-slate-700'
            }`}
            data-testid={testid}
        >
            <span className="relative flex items-center justify-center">
                <span className={`${sizes.dot} rounded-full bg-emerald-400`} />
                <span className={`absolute ${sizes.dot} rounded-full bg-emerald-400 animate-ping opacity-75`} />
            </span>
            <Users className={`${sizes.icon} opacity-70`} />
            <span>
                <motion.span className="tabular-nums font-bold text-emerald-300" data-testid={`${testid}-value`}>
                    {rounded}
                </motion.span>
                <span className={isDark ? 'text-slate-300/90 ml-1' : 'text-slate-600 ml-1'}>
                    {target + boost === 1 ? 'persona ya espera' : 'personas ya esperan'}
                </span>
            </span>
        </motion.div>
    );
};

export default WaitlistCounter;
