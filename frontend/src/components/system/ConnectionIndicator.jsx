import { useEffect, useState, useRef } from 'react';
import { Wifi, WifiOff, AlertTriangle, Loader2 } from 'lucide-react';
import { probeHealth } from '../../lib/diagnostics';

/**
 * Real-time connection indicator.
 * - Polls /api/health every 25s when online, every 8s while degraded/offline.
 * - Hides itself when status is 'ok' AND latency < 1500ms (clean state).
 * - Becomes a fixed pill on bottom-left when there's anything to report.
 * - Triple-state: ok (green), degraded (amber), offline (red).
 */
export const ConnectionIndicator = () => {
    const [state, setState] = useState({ status: 'checking', latency: null, lastCheck: null });
    const intervalRef = useRef(null);

    useEffect(() => {
        let cancelled = false;

        const check = async () => {
            const r = await probeHealth({ timeoutMs: 4000 });
            if (cancelled) return;
            const next = r.ok
                ? {
                    status: r.elapsed_ms > 1500 ? 'degraded' : 'ok',
                    latency: r.elapsed_ms,
                    lastCheck: Date.now(),
                }
                : { status: 'offline', latency: null, lastCheck: Date.now() };

            setState(next);

            // Adaptive polling — speed up when things are bad
            const nextDelay = next.status === 'ok' ? 25000 : 8000;
            if (intervalRef.current) clearTimeout(intervalRef.current);
            intervalRef.current = setTimeout(check, nextDelay);
        };

        check();
        // Also re-check on window focus (catches sleep/wake on laptops)
        const onFocus = () => check();
        window.addEventListener('focus', onFocus);
        return () => {
            cancelled = true;
            if (intervalRef.current) clearTimeout(intervalRef.current);
            window.removeEventListener('focus', onFocus);
        };
    }, []);

    // Hide indicator entirely when everything is fine
    if (state.status === 'ok') return null;

    const config = {
        checking: {
            icon: Loader2,
            iconClass: 'animate-spin',
            label: 'Verificando conexión...',
            bg: 'bg-slate-800/95 border-slate-700',
            color: 'text-slate-300',
        },
        degraded: {
            icon: AlertTriangle,
            iconClass: '',
            label: `Conexión lenta · ${state.latency}ms`,
            bg: 'bg-amber-500/15 border-amber-500/40',
            color: 'text-amber-300',
        },
        offline: {
            icon: WifiOff,
            iconClass: 'animate-pulse',
            label: 'Reconectando con el servidor...',
            bg: 'bg-rose-500/15 border-rose-500/40',
            color: 'text-rose-300',
        },
    }[state.status] || { icon: Wifi, iconClass: '', label: '...', bg: 'bg-slate-800/95 border-slate-700', color: 'text-slate-300' };

    const Icon = config.icon;

    return (
        <div
            className={`fixed bottom-4 left-4 z-[10000] flex items-center gap-2 px-3 py-2 rounded-full border backdrop-blur-md shadow-lg ${config.bg} ${config.color}`}
            data-testid="connection-indicator"
            data-state={state.status}
            role="status"
            aria-live="polite"
        >
            <Icon className={`w-4 h-4 ${config.iconClass}`} />
            <span className="text-xs font-medium">{config.label}</span>
        </div>
    );
};

export default ConnectionIndicator;
