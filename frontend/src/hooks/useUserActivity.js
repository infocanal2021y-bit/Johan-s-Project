import { useEffect, useState } from 'react';

/**
 * useUserActivity — tracks whether the user is currently "active" or "idle".
 *
 * Active   = at least one mouse/keyboard/touch event in the last `idleAfterMs`.
 * Idle     = no interaction during `idleAfterMs`.
 *
 * The hook listens to mousemove, keydown, click, scroll and touchstart, and
 * exposes a single boolean. Returning to active state (after any interaction)
 * is instant — going idle takes the configured threshold so we never trigger
 * spurious flips from short pauses.
 */
export const useUserActivity = ({ idleAfterMs = 60000 } = {}) => {
    const [isActive, setIsActive] = useState(true);

    useEffect(() => {
        let timeoutId = null;

        const markActive = () => {
            setIsActive(true);
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => setIsActive(false), idleAfterMs);
        };

        // Kick off the first idle countdown
        markActive();

        const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
        events.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));

        // Tab visibility — hidden tab counts as idle immediately so we don't
        // burn through the daily notification budget while the user is away.
        const onVisibility = () => {
            if (document.hidden) {
                if (timeoutId) clearTimeout(timeoutId);
                setIsActive(false);
            } else {
                markActive();
            }
        };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            events.forEach((ev) => window.removeEventListener(ev, markActive));
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [idleAfterMs]);

    return isActive;
};
