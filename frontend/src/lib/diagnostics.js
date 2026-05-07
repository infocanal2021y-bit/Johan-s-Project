// Advanced fetch wrapper for resilient admin operations.
//
// Features:
//   - Granular error classification (NETWORK · TIMEOUT · AUTH · PERMISSION · NOT_FOUND · VALIDATION · DB · SERVER · PARSE · UNKNOWN)
//   - Exponential backoff retry for transient failures (network, 502, 503, 504)
//   - In-flight request deduplication (idempotent GETs only)
//   - AbortController-based timeout
//   - Self-healing: invalid tokens are auto-cleaned from localStorage
//   - Diagnostic ping to /api/health when we get "Failed to fetch" so we can
//     differentiate "backend down" vs "this specific endpoint not deployed"

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const ERROR_LABELS = {
    NETWORK: 'Conexión',
    TIMEOUT: 'Timeout',
    AUTH_MISSING: 'Sin autenticación',
    AUTH_INVALID: 'Sesión expirada',
    PERMISSION: 'Sin permisos',
    NOT_FOUND: 'Endpoint no disponible',
    VALIDATION: 'Datos inválidos',
    CONFLICT: 'Conflicto',
    SERVER: 'Error del servidor',
    DB: 'Error de base de datos',
    PARSE: 'Respuesta inválida',
    MAINTENANCE: 'Mantenimiento',
    UNKNOWN: 'Error desconocido',
};

// Statuses that should trigger a retry. Network errors (status=0) also retry.
const RETRY_STATUSES = new Set([0, 408, 429, 502, 503, 504]);

// In-flight GET dedup map: { url -> Promise }
const inflightGets = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Single attempt — used internally by safeApiCall with retry logic on top.
async function _singleAttempt({ url, method, headers, body, signal }) {
    const start = performance.now();
    try {
        const resp = await fetch(url, { method, headers, body, signal });
        const elapsed = Math.round(performance.now() - start);

        let data = null;
        let raw = '';
        const ctype = resp.headers.get('content-type') || '';
        try {
            if (ctype.includes('application/json')) {
                data = await resp.json();
            } else {
                raw = (await resp.text()).slice(0, 300);
            }
        } catch (parseErr) {
            return {
                ok: false,
                kind: 'PARSE',
                status: resp.status,
                message: `${ERROR_LABELS.PARSE} (${resp.status}): ${parseErr.message}`,
                detail: raw || 'Respuesta no es JSON válido',
                elapsed_ms: elapsed,
                _retryable: false,
            };
        }

        if (resp.ok) {
            return { ok: true, status: resp.status, data, elapsed_ms: elapsed };
        }

        let kind = 'SERVER';
        let message = ERROR_LABELS.SERVER;
        let retryable = false;
        const detail = (data && (data.detail || data.message)) || raw || `HTTP ${resp.status}`;

        if (resp.status === 401) {
            kind = 'AUTH_INVALID';
            message = `${ERROR_LABELS.AUTH_INVALID}: vuelva a iniciar sesión`;
            try { localStorage.removeItem('token'); } catch (_) {}
        } else if (resp.status === 403) {
            kind = 'PERMISSION';
            message = `${ERROR_LABELS.PERMISSION}: solo administradores pueden ejecutar esta acción`;
        } else if (resp.status === 404) {
            kind = 'NOT_FOUND';
            message = `${ERROR_LABELS.NOT_FOUND}. Si esto es PRODUCCIÓN, redeploy desde "Save to GitHub → Deploy"`;
        } else if (resp.status === 408 || resp.status === 504) {
            kind = 'TIMEOUT';
            message = `${ERROR_LABELS.TIMEOUT}: el servidor tardó demasiado en responder`;
            retryable = true;
        } else if (resp.status === 422 || resp.status === 400) {
            kind = 'VALIDATION';
            let validationMsg = detail;
            if (Array.isArray(data?.detail)) {
                validationMsg = data.detail.map(d => `${(d.loc || []).join('.')}: ${d.msg}`).join(' · ');
            }
            message = `${ERROR_LABELS.VALIDATION}: ${validationMsg}`;
        } else if (resp.status === 409) {
            kind = 'CONFLICT';
            message = `${ERROR_LABELS.CONFLICT}: ${detail}`;
        } else if (resp.status === 503) {
            kind = 'MAINTENANCE';
            message = `${ERROR_LABELS.MAINTENANCE}: ${detail}`;
            retryable = true;
        } else if (resp.status >= 500) {
            const detailLower = String(detail).toLowerCase();
            if (detailLower.includes('mongo') || detailLower.includes('database') || detailLower.includes('duplicate key')) {
                kind = 'DB';
                message = `${ERROR_LABELS.DB}: ${detail}`;
            } else {
                kind = 'SERVER';
                message = `${ERROR_LABELS.SERVER} (${resp.status}): ${detail}`;
            }
            retryable = RETRY_STATUSES.has(resp.status);
        } else {
            message = `Error ${resp.status}: ${detail}`;
        }

        return { ok: false, kind, status: resp.status, message, detail, elapsed_ms: elapsed, data, _retryable: retryable };
    } catch (err) {
        const elapsed = Math.round(performance.now() - start);

        if (err.name === 'AbortError') {
            return {
                ok: false,
                kind: 'TIMEOUT',
                status: 0,
                message: `${ERROR_LABELS.TIMEOUT}: la solicitud fue abortada`,
                detail: `Aborted after ${elapsed}ms`,
                elapsed_ms: elapsed,
                _retryable: false, // user already aborted
            };
        }

        const isFailedFetch = err.message === 'Failed to fetch'
            || err.message === 'NetworkError when attempting to fetch resource.'
            || err.message?.includes('ERR_NETWORK');

        if (isFailedFetch) {
            // Diagnostic: ping /api/health to differentiate scenarios
            let healthOk = false;
            try {
                const h = await fetch(`${API_URL}/api/health`, { method: 'GET' });
                healthOk = h.ok;
            } catch (_) { healthOk = false; }

            return {
                ok: false,
                kind: 'NETWORK',
                status: 0,
                message: healthOk
                    ? `${ERROR_LABELS.NETWORK}: el endpoint específico no responde (¿desplegado?). Backend general SÍ responde.`
                    : `${ERROR_LABELS.NETWORK}: backend inalcanzable. Reintentando automáticamente...`,
                detail: `${err.message} · health=${healthOk ? 'OK' : 'FAIL'} · ${elapsed}ms`,
                elapsed_ms: elapsed,
                _retryable: true,
            };
        }

        return {
            ok: false,
            kind: 'UNKNOWN',
            status: 0,
            message: `${ERROR_LABELS.UNKNOWN}: ${err.message}`,
            detail: String(err),
            elapsed_ms: elapsed,
            _retryable: false,
        };
    }
}

/**
 * Resilient API call with retry + timeout + dedup + auto-auth-cleanup.
 *
 * @param {Object} opts
 * @param {string} opts.url           - relative or absolute URL
 * @param {string} opts.method        - 'GET' | 'POST' | etc. Default GET.
 * @param {Object} [opts.body]        - JSON body
 * @param {number} [opts.timeoutMs]   - per-attempt timeout. Default 15000.
 * @param {number} [opts.retries]     - retry count for transient failures. Default 2 (3 total attempts).
 * @param {boolean} [opts.requireAuth] - whether to require a JWT. Default true.
 * @param {boolean} [opts.dedup]      - dedupe identical concurrent GETs. Default true.
 * @param {function} [opts.onRetry]   - callback invoked on retry: ({attempt, lastResult})
 */
export async function safeApiCall({
    url,
    method = 'GET',
    body = null,
    timeoutMs = 15000,
    retries = 2,
    requireAuth = true,
    dedup = true,
    onRetry = null,
}) {
    const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;

    const token = requireAuth ? localStorage.getItem('token') : null;
    if (requireAuth && !token) {
        return {
            ok: false,
            kind: 'AUTH_MISSING',
            status: 0,
            message: `${ERROR_LABELS.AUTH_MISSING}: vuelva a iniciar sesión`,
            detail: 'No hay token JWT en localStorage',
            elapsed_ms: 0,
        };
    }

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    // Dedup only idempotent GETs (no body)
    const dedupKey = (dedup && method === 'GET') ? `${method} ${fullUrl}` : null;
    if (dedupKey && inflightGets.has(dedupKey)) {
        return inflightGets.get(dedupKey);
    }

    const runner = (async () => {
        let lastResult = null;
        const totalAttempts = Math.max(1, retries + 1);

        for (let attempt = 1; attempt <= totalAttempts; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            const result = await _singleAttempt({
                url: fullUrl,
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (result.ok) {
                if (attempt > 1 && lastResult) {
                    // Annotate that we recovered after retries
                    result.recovered_after = attempt - 1;
                }
                return result;
            }

            lastResult = result;

            // Don't retry on terminal errors (auth, validation, 404, conflict)
            if (!result._retryable || attempt === totalAttempts) {
                // Final failure: clean up and surface
                delete result._retryable;
                return result;
            }

            // Exponential backoff: 500ms, 1500ms, 3000ms (jittered)
            const baseDelay = 500 * Math.pow(2, attempt - 1);
            const jitter = Math.random() * 250;
            const delay = Math.min(4000, baseDelay + jitter);

            if (typeof onRetry === 'function') {
                try { onRetry({ attempt, lastResult: result, delay_ms: delay }); } catch (_) {}
            }

            await sleep(delay);
        }

        return lastResult || {
            ok: false,
            kind: 'UNKNOWN',
            status: 0,
            message: 'Error desconocido sin resultado',
            elapsed_ms: 0,
        };
    })();

    if (dedupKey) {
        inflightGets.set(dedupKey, runner);
        runner.finally(() => inflightGets.delete(dedupKey));
    }

    return runner;
}

// Helper for the toast: returns multi-line message with diagnostic details
export function formatDiagnostic(result) {
    if (result.ok) {
        const recovered = result.recovered_after ? ` · recuperado tras ${result.recovered_after} reintento(s)` : '';
        return `OK · ${result.elapsed_ms}ms${recovered}`;
    }
    return `${result.message}\n[${result.kind} · HTTP ${result.status} · ${result.elapsed_ms}ms]`;
}

// Health probe utilities consumed by ConnectionIndicator + system-status panel.
export async function probeHealth({ full = false, timeoutMs = 4000 } = {}) {
    const path = full ? '/api/health/full' : '/api/health';
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const start = performance.now();
    try {
        const r = await fetch(`${API_URL}${path}`, { signal: controller.signal });
        clearTimeout(t);
        const elapsed = Math.round(performance.now() - start);
        if (!r.ok) return { ok: false, status: r.status, elapsed_ms: elapsed };
        const data = await r.json();
        return { ok: true, status: 200, data, elapsed_ms: elapsed };
    } catch (err) {
        clearTimeout(t);
        return {
            ok: false,
            status: 0,
            elapsed_ms: Math.round(performance.now() - start),
            error: err.message,
        };
    }
}
