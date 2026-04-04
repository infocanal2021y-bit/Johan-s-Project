import { useState, useEffect } from 'react';
import { engagementAPI } from '../../lib/api';

const BADGE_COLORS = {
    bronce: 'bg-amber-900/40 text-amber-400 border-amber-700/40',
    plata: 'bg-slate-600/30 text-slate-300 border-slate-400/40',
    oro: 'bg-yellow-900/30 text-yellow-400 border-yellow-500/40',
    platino: 'bg-cyan-900/30 text-cyan-300 border-cyan-400/40',
};

export const LevelBadge = () => {
    const [level, setLevel] = useState(null);

    useEffect(() => {
        engagementAPI.getUserLevel()
            .then(res => setLevel(res.data))
            .catch(() => {});
    }, []);

    if (!level) return null;

    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border ${BADGE_COLORS[level.level] || BADGE_COLORS.bronce}`}
            style={{ fontWeight: 500 }}
            data-testid="sidebar-level-badge"
        >
            {level.icon} {level.label}
        </span>
    );
};
