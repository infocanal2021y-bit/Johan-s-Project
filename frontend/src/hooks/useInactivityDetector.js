import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Detects user inactivity (60-90 seconds) and shows a help prompt.
 * Resets when user interacts with the page.
 */
export const useInactivityDetector = (timeoutMs = 75000) => {
    const [showPrompt, setShowPrompt] = useState(false);
    const timerRef = useRef(null);

    const resetTimer = useCallback(() => {
        setShowPrompt(false);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setShowPrompt(true), timeoutMs);
    }, [timeoutMs]);

    const dismiss = useCallback(() => {
        setShowPrompt(false);
        resetTimer();
    }, [resetTimer]);

    useEffect(() => {
        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
        events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
        resetTimer();
        return () => {
            events.forEach(e => window.removeEventListener(e, resetTimer));
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [resetTimer]);

    return { showPrompt, dismiss };
};
