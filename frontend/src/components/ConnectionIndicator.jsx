import { useEffect, useState, useCallback } from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useT } from '../i18n/LanguageContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const PING_INTERVAL_MS = 30 * 1000;
const FETCH_TIMEOUT_MS = 5000;

// =============================================================================
// ConnectionIndicator — small status pill that pings /api/health every 30s.
//
// States:
//   • 'connecting' — initial check in flight (gray, spinner)
//   • 'online'     — backend OK (green dot, "Conectado")
//   • 'offline'    — backend unreachable (amber, "Modo demo")
//
// Silent: no toasts. The badge itself is the only signal — users who want
// details can hover for the title tooltip.
// =============================================================================
export const ConnectionIndicator = ({ variant = 'sidebar' }) => {
    const t = useT();
    const [status, setStatus] = useState('connecting');

    const ping = useCallback(async () => {
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
            const r = await fetch(`${API_URL}/api/health`, { signal: ctrl.signal });
            clearTimeout(tid);
            setStatus(r.ok ? 'online' : 'offline');
        } catch (e) {
            setStatus('offline');
        }
    }, []);

    useEffect(() => {
        ping();
        const id = setInterval(ping, PING_INTERVAL_MS);
        const onFocus = () => ping();
        window.addEventListener('focus', onFocus);
        return () => {
            clearInterval(id);
            window.removeEventListener('focus', onFocus);
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
            title={
                status === 'online'
                    ? 'Servidor conectado'
                    : status === 'offline'
                        ? 'Sin conexión al servidor — usando datos demo'
                        : 'Verificando conexión'
            }
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
