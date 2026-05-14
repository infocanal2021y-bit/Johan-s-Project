import { useEffect, useState, useRef, useCallback } from 'react';
import { Wifi, WifiOff, AlertTriangle, Loader2, CheckCircle2, RotateCw } from 'lucide-react';
import { probeHealth } from '../../lib/diagnostics';

/**
 * Real-time connection indicator with:
 * - Adaptive polling (25s ok / 4s problems)
 * - Recovery toast ("Conectado") for 2s after offline→ok transition
 * - Manual "Reintentar" button after 2+ failed probes
 * - Hidden when status='ok' AND no recovery flash pending
 */
export const ConnectionIndicator = () => {
    const [state, setState] = useState({ status: 'checking', latency: null });
    const [failCount, setFailCount] = useState(0);
    const [showRecovery, setShowRecovery] = useState(false);
    const intervalRef = useRef(null);
    const prevStatusRef = useRef('checking');

    const check = useCallback(async () => {
        const r = await probeHealth({ timeoutMs: 4000 });
        const next = r.ok
            ? {
                status: r.elapsed_ms > 1500 ? 'degraded' : 'ok',
                latency: r.elapsed_ms,
            }
            : { status: 'offline', latency: null };

        setState(next);

        // Recovery flash when transitioning out of offline/degraded
        if (
            (prevStatusRef.current === 'offline' || prevStatusRef.current === 'degraded') &&
            next.status === 'ok'
        ) {
            setShowRecovery(true);
            setTimeout(() => setShowRecovery(false), 2200);
        }
        prevStatusRef.current = next.status;

        if (next.status === 'ok') {
            setFailCount(0);
        } else {
            setFailCount((c) => c + 1);
        }

        const nextDelay = next.status === 'ok' ? 25000 : 4000;
        if (intervalRef.current) clearTimeout(intervalRef.current);
        intervalRef.current = setTimeout(check, nextDelay);
    }, []);

    useEffect(() => {
        check();
        const onFocus = () => check();
        const onOnline = () => check();
        window.addEventListener('focus', onFocus);
        window.addEventListener('online', onOnline);
        return () => {
            if (intervalRef.current) clearTimeout(intervalRef.current);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('online', onOnline);
        };
    }, [check]);

    const handleManualRetry = (e) => {
        e.stopPropagation();
        setState({ status: 'checking', latency: null });
        check();
    };

    // Hidden when everything is ok and no recovery flash
    if (state.status === 'ok' && !showRecovery) return null;

    // Recovery flash
    if (showRecovery && state.status === 'ok') {
        return (
            <div
                className="fixed bottom-4 left-4 z-[10000] flex items-center gap-2 px-3 py-2 rounded-full border backdrop-blur-md shadow-lg bg-emerald-500/15 border-emerald-500/40 text-emerald-300 animate-in slide-in-from-bottom-2"
                data-testid="connection-indicator"
                data-state="recovered"
                role="status"
            >
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-medium">Conectado · {state.latency}ms</span>
            </div>
        );
    }

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
            label: failCount >= 3
                ? 'Servidor no responde'
                : 'Reconectando con el servidor...',
            bg: 'bg-rose-500/15 border-rose-500/40',
            color: 'text-rose-300',
        },
    }[state.status] || { icon: Wifi, iconClass: '', label: '...', bg: 'bg-slate-800/95 border-slate-700', color: 'text-slate-300' };

    const Icon = config.icon;
    const showRetry = state.status === 'offline' && failCount >= 2;

    return (
        <div
            className={`fixed bottom-4 left-4 z-[10000] flex items-center gap-2 px-3 py-2 rounded-full border backdrop-blur-md shadow-lg ${config.bg} ${config.color}`}
            data-testid="connection-indicator"
            data-state={state.status}
            role="status"
            aria-live="polite"
        >
            <Icon className={`w-4 h-4 flex-shrink-0 ${config.iconClass}`} />
            <span className="text-xs font-medium">{config.label}</span>
            {showRetry && (
                <button
                    type="button"
                    onClick={handleManualRetry}
                    className="ml-1 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/30 hover:bg-rose-500/50 text-rose-100 transition-colors"
                    data-testid="connection-retry-btn"
                    aria-label="Reintentar conexión"
                >
                    <RotateCw className="w-3 h-3" />
                    Reintentar
                </button>
            )}
        </div>
    );
};

export default ConnectionIndicator;
