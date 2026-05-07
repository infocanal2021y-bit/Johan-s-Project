// Advanced error diagnostics for admin operations.
// Differentiates: connection · auth · permissions · endpoint not found · timeout · server · DB · validation
//
// Usage:
//   const result = await safeApiCall({
//     url: '/api/admin/debit-balance',
//     method: 'POST',
//     body: { ... },
//     timeoutMs: 15000,
//   });
//   if (result.ok) { ... } else { toast.error(result.message); }

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
    UNKNOWN: 'Error desconocido',
};

export async function safeApiCall({ url, method = 'GET', body = null, timeoutMs = 15000, requireAuth = true }) {
    const start = performance.now();
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const resp = await fetch(fullUrl, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const elapsed = Math.round(performance.now() - start);

        // Parse body safely (server might return HTML on 502/504/Cloudflare)
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
            };
        }

        if (resp.ok) {
            return { ok: true, status: resp.status, data, elapsed_ms: elapsed };
        }

        // Map HTTP status to error kind
        let kind = 'SERVER';
        let message = ERROR_LABELS.SERVER;
        const detail = (data && (data.detail || data.message)) || raw || `HTTP ${resp.status}`;

        if (resp.status === 401) {
            kind = 'AUTH_INVALID';
            message = `${ERROR_LABELS.AUTH_INVALID}: vuelva a iniciar sesión`;
            // Auto-cleanup invalid token
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
        } else if (resp.status === 422 || resp.status === 400) {
            kind = 'VALIDATION';
            // FastAPI validation errors come as a list of dicts
            let validationMsg = detail;
            if (Array.isArray(data?.detail)) {
                validationMsg = data.detail.map(d => `${(d.loc || []).join('.')}: ${d.msg}`).join(' · ');
            }
            message = `${ERROR_LABELS.VALIDATION}: ${validationMsg}`;
        } else if (resp.status === 409) {
            kind = 'CONFLICT';
            message = `${ERROR_LABELS.CONFLICT}: ${detail}`;
        } else if (resp.status >= 500) {
            kind = 'SERVER';
            // Differentiate DB errors when the backend hints at it
            const detailLower = String(detail).toLowerCase();
            if (detailLower.includes('mongo') || detailLower.includes('database') || detailLower.includes('duplicate key')) {
                kind = 'DB';
                message = `${ERROR_LABELS.DB}: ${detail}`;
            } else {
                message = `${ERROR_LABELS.SERVER} (${resp.status}): ${detail}`;
            }
        } else {
            message = `Error ${resp.status}: ${detail}`;
        }

        return { ok: false, kind, status: resp.status, message, detail, elapsed_ms: elapsed, data };

    } catch (err) {
        clearTimeout(timeoutId);
        const elapsed = Math.round(performance.now() - start);

        if (err.name === 'AbortError') {
            return {
                ok: false,
                kind: 'TIMEOUT',
                status: 0,
                message: `${ERROR_LABELS.TIMEOUT}: la solicitud tardó más de ${Math.round(timeoutMs / 1000)}s`,
                detail: `Aborted after ${elapsed}ms`,
                elapsed_ms: elapsed,
            };
        }

        // TypeError "Failed to fetch" → red/CORS/SSL/backend caído
        const isFailedFetch = err.message === 'Failed to fetch' || err.message === 'NetworkError when attempting to fetch resource.';
        if (isFailedFetch) {
            // Quick diagnosis: ping /api/health to figure out if backend is reachable
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
                    : `${ERROR_LABELS.NETWORK}: backend inalcanzable. Verifique su conexión a Internet, VPN o que el backend esté en línea.`,
                detail: `${err.message} · health=${healthOk ? 'OK' : 'FAIL'} · ${elapsed}ms`,
                elapsed_ms: elapsed,
            };
        }

        return {
            ok: false,
            kind: 'UNKNOWN',
            status: 0,
            message: `${ERROR_LABELS.UNKNOWN}: ${err.message}`,
            detail: String(err),
            elapsed_ms: elapsed,
        };
    }
}

// Helper for the toast: returns multi-line message with diagnostic details
export function formatDiagnostic(result) {
    if (result.ok) return 'OK';
    return `${result.message}\n[${result.kind} · ${result.status} · ${result.elapsed_ms}ms]`;
}
