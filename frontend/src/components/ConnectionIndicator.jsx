import { useEffect, useState, useCallback, useRef } from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useT } from '../i18n/LanguageContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const PING_INTERVAL_MS = 30 * 1000;
const FETCH_TIMEOUT_MS = 5000;
// How many consecutive failed pings before we surface a persistent toast.
// One miss can be a flaky network — two means the backend is really gone.
const FAILURES_BEFORE_TOAST = 2;


// Categorise a ping failure so the toast can show a precise reason.
//   • offline  → no network connectivity at all
//   • cors     → fetch threw before reaching the server (most likely CORS,
//                DNS, or mixed-content) and the browser has internet
//   • timeout  → AbortController fired before response arrived
//   • server   → server replied but with 5xx
//   • notfound → server replied 404 (deploy mismatch / wrong env URL)
//   • unknown  → fallback bucket
const classifyError = (err, response) => {
    if (response) {
        if (response.status >= 500) return 'server';
        if (response.status === 404) return 'notfound';
        return 'unknown';
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
    if (err?.name === 'AbortError') return 'timeout';
    if (err?.name === 'TypeError' && /fetch/i.test(err?.message || '')) return 'cors';
    return 'unknown';
};

const ERROR_COPY = {
    offline:  { title: 'Sin conexión a internet',     desc: 'No detectamos red. Mostrando datos de ejemplo.' },
    cors:     { title: 'Servidor inalcanzable (CORS)', desc: 'El navegador bloqueó la respuesta. Intentando reconectar cada 30 s.' },
    timeout:  { title: 'Tiempo de espera agotado',     desc: 'El servidor tardó más de 5 s en responder. Reintentando cada 30 s.' },
    server:   { title: 'Error temporal del servidor',  desc: 'El servidor devolvió un error 5xx. Reintentando cada 30 s.' },
    notfound: { title: 'Endpoint no encontrado',       desc: 'El servidor responde pero no expone /api/health. Verifica la versión desplegada.' },
    unknown:  { title: 'Modo demo activado',           desc: 'Mostrando datos de ejemplo. El servidor no responde, reintentando cada 30 s.' },
};

// =============================================================================
// ConnectionIndicator — small status pill that pings /api/health every 30s.
//
// States:
//   • 'connecting' — initial check in flight (gray, spinner)
//   • 'online'     — backend OK (green dot, "Conectado")
//   • 'offline'    — backend unreachable (amber, "Modo demo")
//
// Designed for the sidebar footer / topbar — variant 'sidebar' uses dark BBVA
// styling matching the existing nav, variant 'inline' uses a light style.
// =============================================================================
export const ConnectionIndicator = ({ variant = 'sidebar' }) => {
    const t = useT();
    const [status, setStatus] = useState('connecting');
    // Counters live in refs so the ping callback never goes stale.
    const failureCountRef = useRef(0);
    const offlineToastIdRef = useRef(null);

    const ping = useCallback(async () => {
        let response = null;
        let thrown = null;
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
            response = await fetch(`${API_URL}/api/health`, { signal: ctrl.signal });
            clearTimeout(tid);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            // Recovery: reset counters and dismiss any active offline toast
            if (failureCountRef.current >= FAILURES_BEFORE_TOAST) {
                toast.success(t('Conexión restablecida'), { duration: 4000 });
            }
            failureCountRef.current = 0;
            if (offlineToastIdRef.current != null) {
                toast.dismiss(offlineToastIdRef.current);
                offlineToastIdRef.current = null;
            }
            setStatus('online');
            return;
        } catch (e) {
            thrown = e;
        }
        // ─── Failure path ──────────────────────────────────────────────────
        failureCountRef.current += 1;
        setStatus('offline');
        if (
            failureCountRef.current >= FAILURES_BEFORE_TOAST
            && offlineToastIdRef.current == null
        ) {
            const kind = classifyError(thrown, response && !response.ok ? response : null);
            const copy = ERROR_COPY[kind] || ERROR_COPY.unknown;
            offlineToastIdRef.current = toast.warning(t(copy.title), {
                duration: Infinity,
                description: t(copy.desc),
                action: {
                    label: t('Reintentar ahora'),
                    onClick: () => ping(),
                },
            });
        }
    }, [t]);

    useEffect(() => {
        ping();
        const id = setInterval(ping, PING_INTERVAL_MS);
        const onFocus = () => ping();
        window.addEventListener('focus', onFocus);
        return () => {
            clearInterval(id);
            window.removeEventListener('focus', onFocus);
            // Cleanup any sticky toast on unmount
            if (offlineToastIdRef.current != null) {
                toast.dismiss(offlineToastIdRef.current);
                offlineToastIdRef.current = null;
            }
        };
    }, [ping]);

    const isSidebar = variant === 'sidebar';
    const tone = {
        connecting: { fg: '#94a3b8', bg: 'rgba(148,163,184,0.10)', label: t('Conectando…') },
        online:     { fg: '#16A34A', bg: 'rgba(22,163,74,0.12)',  label: t('Conectado') },
        offline:    { fg: '#F59E0B', bg: 'rgba(245,158,11,0.12)', label: t('Modo demo') },
    }[status];

    const Icon = status === 'connecting' ? Loader2 : status === 'online' ? Wifi : WifiOff;

    return (
        <div
            className={`inline-flex items-center gap-1.5 px-2.5 h-6 rounded-md border text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                isSidebar ? '' : ''
            }`}
            style={{
                color: tone.fg,
                background: tone.bg,
                borderColor: `${tone.fg}33`,
            }}
            data-testid="connection-indicator"
            data-status={status}
            title={status === 'online' ? 'Servidor conectado' : status === 'offline' ? 'Sin conexión al servidor — usando datos demo' : 'Verificando conexión'}
        >
            {status === 'online' ? (
                <span className="relative flex w-1.5 h-1.5">
                    <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: tone.fg }} />
                    <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: tone.fg }} />
                </span>
            ) : (
                <Icon className={`w-3 h-3 ${status === 'connecting' ? 'animate-spin' : ''}`} />
            )}
            <span>{tone.label}</span>
        </div>
    );
};
