/**
 * Captures unhandled JS errors + promise rejections in the frontend
 * and ships them to /api/client-errors (no auth, fire-and-forget).
 *
 * Init from index.js: import './lib/clientErrorReporter';
 */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const SAMPLE_RATE = 1.0; // 100% in prod, lower if traffic gets huge

// Don't report these benign known errors
const IGNORED_PATTERNS = [
    /ResizeObserver loop/i,
    /ResizeObserver loop completed/i,
    /Non-Error promise rejection captured/i,
    /script error/i, // cross-origin script errors are not actionable
];

const seen = new Set();

function shouldReport(message) {
    if (!message) return false;
    if (Math.random() > SAMPLE_RATE) return false;
    for (const p of IGNORED_PATTERNS) {
        if (p.test(message)) return false;
    }
    // Dedup per session (avoid spamming server with same error)
    if (seen.has(message)) return false;
    seen.add(message);
    if (seen.size > 50) seen.clear();
    return true;
}

function reportError({ message, stack, component, severity = 'error' }) {
    if (!shouldReport(message)) return;
    try {
        const body = JSON.stringify({
            message: String(message).slice(0, 1000),
            stack: String(stack || '').slice(0, 3000),
            url: window.location.href,
            user_agent: navigator.userAgent.slice(0, 300),
            component: component || null,
            severity,
        });
        const url = `${API_URL}/api/client-errors`;
        if (navigator.sendBeacon) {
            navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        } else {
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                keepalive: true,
            }).catch(() => {});
        }
    } catch (_) { /* never break the app */ }
}

if (typeof window !== 'undefined') {
    window.addEventListener('error', (e) => {
        reportError({
            message: e.message || 'window.error',
            stack: e.error?.stack,
            severity: 'error',
        });
    });

    window.addEventListener('unhandledrejection', (e) => {
        const reason = e.reason;
        reportError({
            message: reason?.message || String(reason) || 'unhandledrejection',
            stack: reason?.stack,
            severity: 'error',
        });
    });
}

export { reportError };
