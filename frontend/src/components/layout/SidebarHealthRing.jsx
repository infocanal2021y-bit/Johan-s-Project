import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { HealthScoreRing } from '../diagnostics/HealthScoreRing';


// In-memory cache so the ring doesn't re-fetch on every nav. Listens to
// `health-score-refresh` window events to invalidate.
let CACHE = null;
let LAST_FETCH = 0;
const TTL_MS = 60_000;  // 1 minute

/**
 * Mini health-score ring shown around the user avatar in the sidebar.
 *
 * - Fetches `/api/diagnostics/me` lazily, caches for 60s.
 * - Refreshes when window dispatches `health-score-refresh` (e.g. after
 *   a withdrawal completes or a finding is resolved).
 * - Click → opens the floating diagnostic panel via `open-diagnostic` event.
 */
export const SidebarHealthRing = ({ user }) => {
    const [data, setData] = useState(CACHE);
    const initial = user?.name?.charAt(0)?.toUpperCase() || 'U';

    const load = (force = false) => {
        if (!force && CACHE && Date.now() - LAST_FETCH < TTL_MS) {
            setData(CACHE);
            return;
        }
        api.get('/diagnostics/me')
            .then((r) => {
                CACHE = r.data;
                LAST_FETCH = Date.now();
                setData(r.data);
            })
            .catch(() => { /* silent — fall back to no ring */ });
    };

    useEffect(() => {
        load(false);
        const handler = () => load(true);
        window.addEventListener('health-score-refresh', handler);
        return () => window.removeEventListener('health-score-refresh', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const score = data?.health_score;
    const color = data?.health_score_color || '#1973B8';
    const label = data?.health_score_label;

    return (
        <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-diagnostic'))}
            data-testid="sidebar-health-ring"
            className="relative group flex-shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-full transition-transform hover:scale-105"
            title={
                score != null
                    ? `Salud de cuenta: ${score}/100 (${label}) · click para ver detalle`
                    : 'Diagnóstico de cuenta'
            }
            aria-label="Ver diagnóstico de cuenta"
        >
            {score != null ? (
                <HealthScoreRing score={score} color={color} label="" size="sm" showNumber={false} />
            ) : (
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1973B8, #004481)' }}>
                    <span className="text-sm text-white font-semibold">{initial}</span>
                </div>
            )}
            {/* Avatar initial centered on top of the ring */}
            {score != null && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1973B8, #004481)' }}>
                        <span className="text-xs text-white font-bold">{initial}</span>
                    </div>
                </div>
            )}
            {/* Score badge bottom-right */}
            {score != null && (
                <div
                    className="absolute -bottom-0.5 -right-0.5 min-w-[22px] h-[18px] px-1 rounded-full flex items-center justify-center ring-2 ring-slate-950 text-[9.5px] font-bold tabular-nums shadow-lg pointer-events-none"
                    style={{ background: color, color: '#0a0f1e' }}
                    data-testid="sidebar-health-score-badge"
                >
                    {score}
                </div>
            )}
        </button>
    );
};


export default SidebarHealthRing;
