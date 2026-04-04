import { useEffect, useRef, useCallback } from 'react';
import { engagementAPI } from '../lib/api';
import { useLocation } from 'react-router-dom';

/**
 * Tracks user activity: page visits, time on platform, button interactions.
 * Sends events to the backend for activity scoring.
 */
export const useActivityTracker = (isLoggedIn) => {
    const location = useLocation();
    const sessionStart = useRef(Date.now());
    const lastPage = useRef('');

    // Track page visits
    useEffect(() => {
        if (!isLoggedIn) return;
        if (location.pathname === lastPage.current) return;
        lastPage.current = location.pathname;

        engagementAPI.trackActivity({
            event_type: 'page_visit',
            page: location.pathname,
        }).catch(() => {});
    }, [location.pathname, isLoggedIn]);

    // Track session duration every 60s
    useEffect(() => {
        if (!isLoggedIn) return;
        const interval = setInterval(() => {
            const minutes = Math.floor((Date.now() - sessionStart.current) / 60000);
            engagementAPI.trackActivity({
                event_type: 'session_active',
                details: `${minutes}min`,
            }).catch(() => {});
        }, 60000);
        return () => clearInterval(interval);
    }, [isLoggedIn]);

    const trackClick = useCallback((buttonName) => {
        if (!isLoggedIn) return;
        engagementAPI.trackActivity({
            event_type: 'button_click',
            details: buttonName,
        }).catch(() => {});
    }, [isLoggedIn]);

    return { trackClick };
};
