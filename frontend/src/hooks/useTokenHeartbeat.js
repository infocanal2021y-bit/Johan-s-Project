import { useEffect, useRef } from 'react';
import { safeApiCall } from '../lib/diagnostics';

/**
 * Validates the JWT token periodically by hitting /api/auth/me.
 * If the server returns 401, the localStorage token is auto-cleaned (by safeApiCall)
 * and the user is redirected to /login.
 *
 * Runs every 60s while the tab is focused. Pauses while hidden.
 */
export function useTokenHeartbeat({ onExpired } = {}) {
    const timerRef = useRef(null);

    useEffect(() => {
        let cancelled = false;

        const tick = async () => {
            if (document.hidden) return; // skip while tab is hidden
            const token = localStorage.getItem('token');
            if (!token) return;

            const r = await safeApiCall({
                url: '/api/auth/me',
                method: 'GET',
                timeoutMs: 6000,
                retries: 0, // no retries here — quick check
                requireAuth: true,
                dedup: true,
            });
            if (cancelled) return;

            if (r.kind === 'AUTH_INVALID' || r.kind === 'AUTH_MISSING') {
                if (typeof onExpired === 'function') {
                    onExpired(r);
                } else {
                    // Default: redirect to login
                    try { localStorage.removeItem('token'); } catch (_) {}
                    if (window.location.pathname !== '/login') {
                        window.location.assign('/login');
                    }
                }
            }
        };

        // First check after 30s, then every 60s
        timerRef.current = setTimeout(function loop() {
            tick();
            timerRef.current = setTimeout(loop, 60000);
        }, 30000);

        const onFocus = () => tick();
        window.addEventListener('focus', onFocus);

        return () => {
            cancelled = true;
            if (timerRef.current) clearTimeout(timerRef.current);
            window.removeEventListener('focus', onFocus);
        };
    }, [onExpired]);
}

export default useTokenHeartbeat;
