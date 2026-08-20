/**
 * GlobalSearchBar — persistent header search for PLB cases, clients and refs.
 *
 * • Trigger: floating button (top-right) OR keyboard shortcut ⌘/Ctrl + K
 * • Opens a command-palette style modal (backdrop + centered panel).
 * • Debounced 250 ms → GET /api/search/global?q=...
 * • Results grouped: CASES (all users) + USERS (admin only).
 * • Click result → navigates to `nav_path` (case) or `/admin/users?q=<email>` (user).
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Command, Loader2, FileText, User as UserIcon, ArrowRight, Compass } from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const QUICK_PAGES = [
    { path: '/withdraw', label: 'Retiros', keywords: 'retiro retiros withdraw sacar dinero' },
    { path: '/withdraw-methods', label: 'Métodos de Retiro', keywords: 'metodos retiro transferencia crypto pago' },
    { path: '/wallet/vault', label: 'Vault Blockchain', keywords: 'vault blockchain boveda certificados hash' },
    { path: '/wallet/multi-currency', label: 'Cuenta Multidivisa', keywords: 'multidivisa divisas eur usd wallet cambio' },
    { path: '/bank-transfer', label: 'Transferencia Bancaria', keywords: 'transferencia bancaria banco santander iban pago' },
    { path: '/wallet/bank-withdrawal', label: 'Retiro a Banco', keywords: 'retiro banco iban swift cuenta bancaria' },
    { path: '/messages', label: 'Centro de Mensajes', keywords: 'mensajes tickets soporte comunicados inbox seguro' },
    { path: '/notifications', label: 'Notificaciones', keywords: 'notificaciones avisos alertas campana' },
    { path: '/cases', label: 'Mis Casos PLB', keywords: 'casos plb expedientes seguimiento' },
    { path: '/kyc', label: 'Verificación KYC', keywords: 'kyc verificacion identidad documentos dni pasaporte' },
    { path: '/transactions', label: 'Transacciones', keywords: 'transacciones historial movimientos' },
    { path: '/support', label: 'Soporte', keywords: 'soporte ayuda contacto ticket' },
    { path: '/community', label: 'Comunidad', keywords: 'comunidad miembros retirados directorio' },
    { path: '/status', label: 'Estado de Servicios', keywords: 'estado servicios status incidencias monitorizacion' },
    { path: '/dashboard', label: 'Dashboard', keywords: 'dashboard inicio panel resumen' },
    { path: '/admin/users', label: 'Admin · Usuarios', keywords: 'admin usuarios clientes gestion', adminOnly: true },
    { path: '/admin/withdrawals', label: 'Admin · Retiros', keywords: 'admin retiros aprobar withdrawals', adminOnly: true },
    { path: '/admin/bank-transfers', label: 'Admin · Transferencias', keywords: 'admin transferencias comprobantes justificantes', adminOnly: true },
    { path: '/admin/support', label: 'Admin · Tickets', keywords: 'admin tickets soporte responder', adminOnly: true },
    { path: '/admin/health', label: 'Admin · Salud Sistema', keywords: 'admin salud sistema health servicios', adminOnly: true },
];

const POPULAR_PATHS = ['/withdraw', '/wallet/vault', '/bank-transfer', '/messages', '/wallet/multi-currency', '/cases'];

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const STATUS_COLORS = {
    open: 'bg-blue-500/15 text-blue-300 ring-blue-500/30',
    in_review: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
    approved: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
    completed: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
    rejected: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
    closed: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
};

const statusPill = (status) => STATUS_COLORS[status] || 'bg-slate-500/15 text-slate-300 ring-slate-500/30';

export const GlobalSearchBar = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState({ cases: [], users: [], is_admin: false });
    const inputRef = useRef(null);
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

    // Keyboard shortcut (⌘/Ctrl + K) + ESC to close
    useEffect(() => {
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen((v) => !v);
            } else if (e.key === 'Escape' && open) {
                setOpen(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    // Focus input when opened
    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 50);
        else { setQ(''); setData({ cases: [], users: [], is_admin: false }); }
    }, [open]);

    // Debounced fetch
    useEffect(() => {
        if (!open) return undefined;
        const term = q.trim();
        if (term.length < 2) { setData({ cases: [], users: [], is_admin: false }); return undefined; }
        setLoading(true);
        const t = setTimeout(async () => {
            try {
                const { data: r } = await api.get('/search/global', { params: { q: term } });
                setData(r);
            } catch (e) {
                setData({ cases: [], users: [], is_admin: false });
            } finally {
                setLoading(false);
            }
        }, 250);
        return () => clearTimeout(t);
    }, [q, open]);

    const goto = useCallback((path) => {
        setOpen(false);
        if (path) navigate(path);
    }, [navigate]);

    const isAdmin = user?.role === 'admin';

    // Quick page navigation: popular shortcuts when idle, filtered matches when typing
    const pageMatches = useMemo(() => {
        const pool = QUICK_PAGES.filter((p) => !p.adminOnly || isAdmin);
        const term = norm(q.trim());
        if (term.length < 2) return pool.filter((p) => POPULAR_PATHS.includes(p.path));
        return pool.filter((p) => norm(p.label).includes(term) || norm(p.keywords).includes(term)).slice(0, 6);
    }, [q, isAdmin]);

    const hasResults = data.cases.length > 0 || data.users.length > 0;
    const showEmpty = q.trim().length >= 2 && !loading && !hasResults && pageMatches.length === 0;
    const showTips = q.trim().length < 2;

    // Trigger button (always visible top-right, above content)
    const trigger = (
        <button
            data-testid="global-search-trigger"
            onClick={() => setOpen(true)}
            aria-label="Buscar expedientes PLB"
            className="fixed top-3 right-4 lg:top-5 lg:right-6 z-[60] group flex items-center gap-2 pl-3 pr-2 py-2 rounded-full
                       bg-slate-900/70 backdrop-blur-md border border-white/10 shadow-lg
                       hover:bg-slate-800/80 hover:border-white/20 transition-all duration-200"
            style={{ WebkitBackdropFilter: 'blur(12px)' }}
        >
            <Search className="w-4 h-4 text-slate-300 group-hover:text-white transition-colors" />
            <span className="hidden md:inline text-[12px] text-slate-300 group-hover:text-white pr-2">
                Buscar caso, cliente…
            </span>
            <kbd className="hidden md:inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5
                            rounded bg-slate-950/60 text-slate-400 ring-1 ring-white/10">
                {isMac ? <Command className="w-2.5 h-2.5" /> : <span>Ctrl</span>}
                <span>K</span>
            </kbd>
        </button>
    );

    return (
        <>
            {trigger}

            {open && (
                <div
                    data-testid="global-search-overlay"
                    className="fixed inset-0 z-[100] flex items-start justify-center pt-[8vh] px-4"
                    style={{ background: 'rgba(3,10,24,0.72)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
                    onClick={() => setOpen(false)}
                >
                    <div
                        className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10"
                        style={{ background: 'linear-gradient(180deg,#0b1c3a 0%,#08152b 100%)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Input row */}
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
                            <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
                            <input
                                ref={inputRef}
                                data-testid="global-search-input"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder={
                                    isAdmin
                                        ? 'Buscar por código PLB, cliente, email, referencia…'
                                        : 'Buscar por código PLB, referencia o concepto…'
                                }
                                className="flex-1 bg-transparent text-white text-[15px] outline-none placeholder-slate-500"
                            />
                            {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
                            <button
                                data-testid="global-search-close"
                                onClick={() => setOpen(false)}
                                className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
                                aria-label="Cerrar búsqueda"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="max-h-[60vh] overflow-y-auto">
                            {/* Quick page navigation */}
                            {pageMatches.length > 0 && (
                                <SectionHeader label={showTips ? 'Navegación rápida' : 'Ir a página'} />
                            )}
                            {pageMatches.map((p) => (
                                <ResultRow
                                    key={`p-${p.path}`}
                                    testid={`gsearch-page-${p.path.replace(/\//g, '-').slice(1)}`}
                                    icon={<Compass className="w-4 h-4 text-cyan-300" />}
                                    primary={p.label}
                                    secondary={<span className="font-mono text-[10px]">{p.path}</span>}
                                    onClick={() => goto(p.path)}
                                />
                            ))}

                            {showTips && (
                                <div className="px-6 py-8 text-center">
                                    <p className="text-[13px] text-slate-400 mb-4">
                                        Escriba al menos 2 caracteres para buscar
                                    </p>
                                    <div className="flex flex-wrap justify-center gap-2 text-[11px] text-slate-500">
                                        <ExampleChip>PLB-2026-000123</ExampleChip>
                                        <ExampleChip>TRF-2026-XXXXXX</ExampleChip>
                                        {isAdmin && <ExampleChip>Jorge Lamberti</ExampleChip>}
                                        {isAdmin && <ExampleChip>usuario@correo.com</ExampleChip>}
                                    </div>
                                </div>
                            )}

                            {showEmpty && (
                                <div className="px-6 py-10 text-center">
                                    <p className="text-[13px] text-slate-400">
                                        Sin resultados para <span className="text-white font-mono">&quot;{q}&quot;</span>
                                    </p>
                                </div>
                            )}

                            {data.users.length > 0 && (
                                <SectionHeader label={`Clientes · ${data.users.length}`} />
                            )}
                            {data.users.map((u) => (
                                <ResultRow
                                    key={`u-${u.id}`}
                                    testid={`gsearch-user-${u.id}`}
                                    icon={<UserIcon className="w-4 h-4 text-blue-300" />}
                                    primary={u.name || u.email}
                                    secondary={u.email}
                                    right={
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ring-1 ${statusPill(u.verification_status)}`}>
                                            {u.verification_status || 'unknown'}
                                        </span>
                                    }
                                    onClick={() => goto(`/admin/users?q=${encodeURIComponent(u.email || u.name || '')}`)}
                                />
                            ))}

                            {data.cases.length > 0 && (
                                <SectionHeader label={`Expedientes · ${data.cases.length}`} />
                            )}
                            {data.cases.map((c) => (
                                <ResultRow
                                    key={`c-${c.code}`}
                                    testid={`gsearch-case-${c.code}`}
                                    icon={<FileText className="w-4 h-4 text-emerald-300" />}
                                    primary={
                                        <div className="flex items-baseline gap-2">
                                            <span className="font-mono text-[13px] text-white">{c.code}</span>
                                            <span className="text-[11px] text-slate-500">{c.type_label}</span>
                                        </div>
                                    }
                                    secondary={
                                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                            {c.entity_ref && <span className="font-mono">{c.entity_ref}</span>}
                                            {c.user_name && (isAdmin) && <span>· {c.user_name}</span>}
                                            {c.summary && <span className="truncate">· {c.summary}</span>}
                                        </div>
                                    }
                                    right={
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ring-1 ${statusPill(c.status)}`}>
                                            {c.status || '—'}
                                        </span>
                                    }
                                    onClick={() => goto(c.nav_path || '/dashboard')}
                                />
                            ))}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between px-4 py-2 border-t border-white/10 text-[10px] text-slate-500">
                            <span>Navegación segura · Búsqueda cifrada</span>
                            <span className="flex items-center gap-2">
                                <kbd className="px-1.5 py-0.5 rounded bg-slate-950/60 ring-1 ring-white/10">ESC</kbd>
                                cerrar
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

const SectionHeader = ({ label }) => (
    <div className="px-4 pt-3 pb-1 text-[10px] tracking-[0.15em] uppercase text-slate-500 font-semibold">
        {label}
    </div>
);

const ResultRow = ({ icon, primary, secondary, right, onClick, testid }) => (
    <button
        data-testid={testid}
        onClick={onClick}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors group"
    >
        <div className="flex-shrink-0 w-8 h-8 rounded-md bg-white/5 ring-1 ring-white/10 flex items-center justify-center">
            {icon}
        </div>
        <div className="flex-1 min-w-0">
            <div className="text-[13px] text-white truncate">{primary}</div>
            {secondary && <div className="text-[11px] text-slate-400 truncate">{secondary}</div>}
        </div>
        {right}
        <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition-colors flex-shrink-0" />
    </button>
);

const ExampleChip = ({ children }) => (
    <span className="px-2 py-0.5 rounded-full bg-white/5 ring-1 ring-white/10 font-mono">{children}</span>
);

export default GlobalSearchBar;
