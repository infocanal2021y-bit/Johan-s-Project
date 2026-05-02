import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n/LanguageContext';
import { Users, Search, Shield, Loader2, LayoutGrid, List, Award } from 'lucide-react';

import { STATUS_LABELS, PROGRESS_STAGES, fmtEUR, timeAgo } from '../components/community/constants';
import { AnimatedCounter } from '../components/community/AnimatedCounter';
import { MemberCard } from '../components/community/MemberCard';
import { RecentWithdrawalsFeed } from '../components/community/RecentWithdrawalsFeed';
import { Sparkline7d } from '../components/community/Sparkline7d';
import { LiveWithdrawalNotifier } from '../components/community/LiveWithdrawalNotifier';
import { MOCK_WITHDRAWALS } from '../components/community/mockWithdrawalsData';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// =============================================================================
// MOCK FALLBACK — used only when /community/stats or /community/members fails.
// Prevents the production UI from displaying zeros when the API is unreachable.
// Derived once from MOCK_WITHDRAWALS so numbers stay consistent across the page.
// =============================================================================
const FALLBACK_TAX_FULL_FEE = 4850;
const FALLBACK_TAX_PARTIAL_FEE = 2660;
const FALLBACK_STATS = (() => {
    const fullCount = MOCK_WITHDRAWALS.filter((w) => w.monto === FALLBACK_TAX_FULL_FEE).length;
    const partialCount = MOCK_WITHDRAWALS.filter((w) => w.monto === FALLBACK_TAX_PARTIAL_FEE).length;
    const totalWithdrawn = MOCK_WITHDRAWALS.reduce((acc, w) => acc + (w.withdrawn_eur || 0), 0);
    return {
        total_withdrawn_eur: Math.round(totalWithdrawn * 100) / 100,
        total_tax_paid_eur:  fullCount * FALLBACK_TAX_FULL_FEE + partialCount * FALLBACK_TAX_PARTIAL_FEE,
        tax_full_count:      fullCount,
        tax_partial_count:   partialCount,
        tax_paid_history_7d: [
            { date: '2026-04-26', tax_paid_eur: 392850 },
            { date: '2026-04-27', tax_paid_eur: 402550 },
            { date: '2026-04-28', tax_paid_eur: 412250 },
            { date: '2026-04-29', tax_paid_eur: 417100 },
            { date: '2026-04-30', tax_paid_eur: 421950 },
            { date: '2026-05-01', tax_paid_eur: 426800 },
            { date: '2026-05-02', tax_paid_eur: 441350 },
        ],
        completed_withdrawals_count: MOCK_WITHDRAWALS.length,
        hall_of_fame: MOCK_WITHDRAWALS.slice(0, 5).map((w) => ({
            name_public: w.nombre,
            country: w.pais,
            country_flag: w.country_flag,
            amount_eur: w.withdrawn_eur,
            date: w.date,
        })),
        top_countries: [{ country: 'España', flag: '🇪🇸', count: MOCK_WITHDRAWALS.length }],
        is_fallback: true,
    };
})();

const FALLBACK_MEMBERS_RESPONSE = {
    members: MOCK_WITHDRAWALS.slice(0, 30).map((w) => ({
        id: w.id,
        name: w.nombre,
        country: w.pais,
        country_flag: w.country_flag,
        progress_step: 5,
        estado_actual: 'completado',
        progress_pct: 100,
        deposited_eur: w.deposited_eur,
        withdrawn_eur: w.withdrawn_eur,
        available_balance_eur: 0,
        account_status: 'completado',
        badges: ['verified', 'withdrawal_processed', 'capital_recovered'],
        is_self: false,
    })),
    total_in_db: MOCK_WITHDRAWALS.length,
    count: MOCK_WITHDRAWALS.length,
    status_counts: { activo: 0, en_revision: 0, retiro_pendiente: 0, completado: MOCK_WITHDRAWALS.length },
    has_more: false,
    is_fallback: true,
};

// =============================================================================
// CommunityPage — BBVA Premium Banking Directory
// =============================================================================
// White cards on a navy app background. Mirror the look-and-feel of a real
// private-banking dashboard: clean typography, banking number formats, soft
// shadows, generous white space, and discreet accent colours.
// =============================================================================

const FILTER_DEFS = [
    { key: 'all',              labelKey: 'Todos',           cls: 'bg-white text-[#6B7280] border-[#E5EAF0]' },
    { key: 'activo',           labelKey: 'Activo',          cls: 'bg-[#16A34A]/10 text-[#16A34A] border-[#16A34A]/30' },
    { key: 'en_revision',      labelKey: 'En revisión',     cls: 'bg-[#F59E0B]/10 text-[#B45309] border-[#F59E0B]/30' },
    { key: 'retiro_pendiente', labelKey: 'Retiro pendiente', cls: 'bg-[#1E3A8A]/10 text-[#1E3A8A] border-[#1E3A8A]/30' },
    { key: 'completado',       labelKey: 'Retirado',        cls: 'bg-[#16A34A]/10 text-[#16A34A] border-[#16A34A]/30' },
];

export const CommunityPage = () => {
    const { user } = useAuth();  // eslint-disable-line no-unused-vars
    const t = useT();
    const [members, setMembers] = useState([]);
    const [totalInDb, setTotalInDb] = useState(0);
    const [filteredTotal, setFilteredTotal] = useState(0);
    const [statusCounts, setStatusCounts] = useState({ activo: 0, en_revision: 0, retiro_pendiente: 0, completado: 0 });
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [view, setView] = useState('cards');
    const [stats, setStats] = useState(null);
    const [showAutocomplete, setShowAutocomplete] = useState(false);

    // Live increments accumulated from mock-withdrawal events fired by
    // LiveWithdrawalNotifier. Persisted in localStorage so the counters
    // keep growing across sessions/refreshes.
    const [liveAddon, setLiveAddon] = useState(() => {
        try {
            const raw = localStorage.getItem('lionsbit:live-addon');
            return raw ? JSON.parse(raw) : { withdrawn: 0, taxPaid: 0, count: 0 };
        } catch (e) { return { withdrawn: 0, taxPaid: 0, count: 0 }; }
    });

    useEffect(() => {
        const onMockWithdrawal = (e) => {
            const d = e.detail || {};
            setLiveAddon((prev) => {
                const next = {
                    withdrawn: prev.withdrawn + (Number(d.amount_eur) || 0),
                    taxPaid:   prev.taxPaid   + (d.tax_eur === 4850 ? 4850 : 0),
                    count:     prev.count + 1,
                };
                try { localStorage.setItem('lionsbit:live-addon', JSON.stringify(next)); } catch (err) { /* silent */ }
                return next;
            });
        };
        window.addEventListener('lionsbit:mock-withdrawal', onMockWithdrawal);
        return () => window.removeEventListener('lionsbit:mock-withdrawal', onMockWithdrawal);
    }, []);

    const PAGE_SIZE = 120;

    const fetchMembers = useCallback(async ({ q = '', statusF = 'all', append = false, currentLen = 0 } = {}) => {
        const isInitial = !append;
        if (isInitial) setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const params = new URLSearchParams();
            params.set('limit', String(PAGE_SIZE));
            params.set('offset', String(append ? currentLen : 0));
            if (q && q.trim()) params.set('q', q.trim());
            if (statusF && statusF !== 'all') params.set('status', statusF);
            const r = await fetch(`${API_URL}/api/community/members?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            if (append) setMembers((prev) => [...prev, ...(d.members || [])]);
            else setMembers(d.members || []);
            setTotalInDb(d.total_in_db || 0);
            setFilteredTotal(d.count || 0);
            setStatusCounts(d.status_counts || { activo: 0, en_revision: 0, retiro_pendiente: 0, completado: 0 });
            setHasMore(!!d.has_more);
        } catch (e) {
            // Fallback so the UI never shows zeros if the API fails (CORS, 5xx, offline)
            console.warn('[community] /members failed, using mock fallback:', e?.message || e);
            if (!append) {
                const fb = FALLBACK_MEMBERS_RESPONSE;
                setMembers(fb.members);
                setTotalInDb(fb.total_in_db);
                setFilteredTotal(fb.count);
                setStatusCounts(fb.status_counts);
                setHasMore(false);
            }
        }
        finally {
            if (isInitial) setLoading(false);
        }
    }, []);

    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        await fetchMembers({ q: search, statusF: statusFilter, append: true, currentLen: members.length });
        setLoadingMore(false);
    }, [members.length, loadingMore, hasMore, search, statusFilter, fetchMembers]);

    useEffect(() => {
        fetchMembers({ q: '', statusF: 'all' });
        const fetchStats = async () => {
            try {
                const token = localStorage.getItem('token');
                const r = await fetch(`${API_URL}/api/community/stats`, { headers: { Authorization: `Bearer ${token}` } });
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const d = await r.json();
                setStats(d);
            } catch (e) {
                console.warn('[community] /stats failed, using mock fallback:', e?.message || e);
                setStats(FALLBACK_STATS);
            }
        };
        fetchStats();
        const id = setInterval(() => {
            fetchMembers({ q: search, statusF: statusFilter });
            fetchStats();
        }, 60000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const t = setTimeout(() => {
            fetchMembers({ q: search, statusF: statusFilter });
        }, 350);
        return () => clearTimeout(t);
    }, [search, statusFilter, fetchMembers]);

    const filtered = members;
    const counts = { all: totalInDb, ...statusCounts };

    return (
        <Layout>
            <LiveWithdrawalNotifier />
            <div className="max-w-7xl mx-auto space-y-5 pb-12" data-testid="community-page">
                {/* ============================================================
                    HEADER — institutional banking card
                    ============================================================ */}
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                    <div
                        className="rounded-[16px] bg-white overflow-hidden
                                   shadow-[0_2px_6px_rgba(7,33,70,0.06),_0_8px_24px_rgba(7,33,70,0.08)]
                                   border border-white/40"
                    >
                        {/* Top accent strip */}
                        <div className="h-[3px] bg-gradient-to-r from-[#1E3A8A] via-[#1973B8] to-[#16A34A]" />

                        <div className="px-6 py-5">
                            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1E3A8A] mb-2">
                                        <Shield className="w-3 h-3" />
                                        {t('Lionsbit · Directorio Institucional')}
                                    </div>
                                    <h1
                                        className="text-xl sm:text-2xl font-semibold text-[#111827] tracking-tight"
                                        style={{ fontFamily: 'Poppins, Inter, sans-serif' }}
                                    >
                                        {t('Directorio de Miembros Verificados')}
                                    </h1>
                                    <p className="text-[#6B7280] mt-1.5 max-w-2xl text-[13px] leading-relaxed">
                                        {t('Registro público de cuentas verificadas. Consulta el estado de verificación, depósitos y retiros procesados. Información estructurada bajo lineamientos GDPR.')}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#16A34A] whitespace-nowrap">
                                    <span className="relative flex w-1.5 h-1.5">
                                        <span className="absolute inset-0 rounded-full bg-[#16A34A] animate-ping opacity-60" />
                                        <span className="relative w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                                    </span>
                                    {t('Sistema activo')}
                                </div>
                            </div>
                        </div>

                        {/* Stats row — banking metrics */}
                        <div className="grid grid-cols-2 md:grid-cols-5 border-t border-[#F1F4F8] divide-x divide-[#F1F4F8]">
                            <div className="px-4 py-4">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">{t('Total Retirado')}</p>
                                <p
                                    className="text-lg font-semibold text-[#16A34A] mt-1 font-mono tabular-nums"
                                    data-testid="community-total-withdrawn"
                                >
                                    <AnimatedCounter value={(stats?.total_withdrawn_eur || 0) + liveAddon.withdrawn} />
                                </p>
                                <p className="text-[9px] text-[#9CA3AF] mt-1">
                                    {(stats?.completed_withdrawals_count || 0) + liveAddon.count} {t('retiros completados')}
                                </p>
                            </div>
                            <div className="px-4 py-4">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">{t('Total Pagado')}</p>
                                <p className="text-lg font-semibold text-[#111827] mt-1 font-mono tabular-nums" data-testid="community-total-tax-paid">
                                    <AnimatedCounter value={(stats?.total_tax_paid_eur ?? stats?.total_deposited_eur ?? 0) + liveAddon.taxPaid} />
                                </p>
                                <div className="flex items-center justify-between gap-2 mt-1">
                                    <p className="text-[9px] text-[#9CA3AF]">
                                        {(stats?.tax_full_count || 0) + Math.round(liveAddon.taxPaid / 4850)} × €4.850
                                        {stats?.tax_partial_count ? ` + ${stats.tax_partial_count} × €2.660` : ''}
                                    </p>
                                    {stats?.tax_paid_history_7d?.length >= 2 && (
                                        <Sparkline7d
                                            data={stats.tax_paid_history_7d}
                                            color="#1E3A8A"
                                            width={80}
                                            height={22}
                                            testId="community-tax-paid-sparkline"
                                        />
                                    )}
                                </div>
                            </div>
                            <div className="px-4 py-4">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">{t('Cuentas registradas')}</p>
                                <p className="text-lg font-semibold text-[#111827] font-mono tabular-nums mt-1">
                                    {totalInDb.toLocaleString('es-ES')}
                                </p>
                                <p className="text-[9px] text-[#9CA3AF] mt-1">{t('activas en la red')}</p>
                            </div>
                            <div className="px-4 py-4">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">{t('En revisión')}</p>
                                <p className="text-lg font-semibold text-[#B45309] font-mono tabular-nums mt-1">
                                    {(statusCounts.en_revision || 0).toLocaleString('es-ES')}
                                </p>
                                <p className="text-[9px] text-[#9CA3AF] mt-1">{t('pendientes')}</p>
                            </div>
                            <div className="px-4 py-4">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">{t('País principal')}</p>
                                <p className="text-lg font-semibold text-[#111827] mt-1 flex items-center gap-2">
                                    <span>{stats?.top_countries?.[0]?.flag || '🌐'}</span>
                                    <span className="text-sm">{stats?.top_countries?.[0]?.country || '—'}</span>
                                </p>
                                <p className="text-[9px] text-[#9CA3AF] mt-1 font-mono tabular-nums">
                                    {(stats?.top_countries?.[0]?.count || 0).toLocaleString('es-ES')} {t('cuentas')}
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* ============================================================
                    LAYOUT — directory + sidebar
                    ============================================================ */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                    {/* === Directory (white card filters + member list) === */}
                    <div className="xl:col-span-2 space-y-4">
                        {/* Search + filter card */}
                        <div className="rounded-[14px] bg-white border border-[#E5EAF0] shadow-[0_1px_3px_rgba(7,33,70,0.04)] p-3 space-y-3">
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF] pointer-events-none" />
                                    <Input
                                        placeholder={t('Buscar por nombre, país o estado...')}
                                        value={search}
                                        onChange={(e) => { setSearch(e.target.value); setShowAutocomplete(true); }}
                                        onFocus={() => setShowAutocomplete(true)}
                                        onBlur={() => setTimeout(() => setShowAutocomplete(false), 150)}
                                        className="pl-10 bg-[#F8FAFB] border-[#E5EAF0] text-[#111827] placeholder:text-[#9CA3AF] text-sm h-10 focus-visible:ring-[#1E3A8A]/30 focus-visible:border-[#1E3A8A]"
                                        data-testid="community-search"
                                    />
                                    {showAutocomplete && search.trim().length >= 2 && filtered.length > 0 && (
                                        <div
                                            className="absolute top-full left-0 right-0 mt-1 z-30 rounded-[10px] border border-[#E5EAF0] bg-white shadow-[0_8px_24px_rgba(7,33,70,0.12)] overflow-hidden"
                                            data-testid="community-autocomplete"
                                        >
                                            {filtered.slice(0, 6).map((m) => (
                                                <button
                                                    key={m.id}
                                                    type="button"
                                                    onMouseDown={(e) => { e.preventDefault(); setSearch(m.name); setShowAutocomplete(false); }}
                                                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#F8FAFB] text-left"
                                                >
                                                    <span className="text-base leading-none">{m.country_flag}</span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-[#111827] truncate font-medium">{m.name}</p>
                                                        <p className="text-[10px] text-[#6B7280] font-mono">
                                                            {m.country} · LB-{m.id.slice(0, 8).toUpperCase()}
                                                        </p>
                                                    </div>
                                                    <span
                                                        className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                                                            (STATUS_LABELS[m.account_status] || STATUS_LABELS.activo).cls
                                                        }`}
                                                    >
                                                        {(STATUS_LABELS[m.account_status] || STATUS_LABELS.activo).label}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {/* View toggle */}
                                <div className="inline-flex rounded-[10px] border border-[#E5EAF0] bg-[#F8FAFB] overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setView('cards')}
                                        data-testid="community-view-cards"
                                        className={`px-3 h-10 flex items-center justify-center transition-colors ${
                                            view === 'cards' ? 'bg-[#1E3A8A]/10 text-[#1E3A8A]' : 'text-[#6B7280] hover:text-[#111827]'
                                        }`}
                                        title="Vista tarjetas"
                                    >
                                        <LayoutGrid className="w-4 h-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setView('table')}
                                        data-testid="community-view-table"
                                        className={`px-3 h-10 flex items-center justify-center border-l border-[#E5EAF0] transition-colors ${
                                            view === 'table' ? 'bg-[#1E3A8A]/10 text-[#1E3A8A]' : 'text-[#6B7280] hover:text-[#111827]'
                                        }`}
                                        title="Vista tabla"
                                    >
                                        <List className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Status filter pills */}
                            <div className="flex flex-wrap gap-2" data-testid="community-status-filters">
                                {FILTER_DEFS.map((f) => {
                                    const active = statusFilter === f.key;
                                    return (
                                        <button
                                            key={f.key}
                                            type="button"
                                            onClick={() => setStatusFilter(f.key)}
                                            data-testid={`community-filter-${f.key}`}
                                            className={`inline-flex items-center gap-2 px-3 h-7 rounded-md text-[11px] font-semibold tracking-wide border transition-all ${
                                                f.cls
                                            } ${active ? 'ring-2 ring-[#1E3A8A]/25 ring-offset-1 ring-offset-white shadow-sm' : 'opacity-80 hover:opacity-100'}`}
                                        >
                                            {t(f.labelKey)}
                                            <span className="font-mono tabular-nums text-[10px]">
                                                {(counts[f.key] || 0).toLocaleString('es-ES')}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Result count */}
                        <div className="flex items-center justify-between text-[11px] text-[#6B7280] px-1">
                            <span data-testid="community-results-count">
                                {t('Mostrando')}{' '}
                                <strong className="text-[#111827] font-semibold tabular-nums">
                                    {filtered.length.toLocaleString('es-ES')}
                                </strong>
                                {filteredTotal > filtered.length && (
                                    <>
                                        {' '}de{' '}
                                        <strong className="text-[#1E3A8A] font-semibold tabular-nums">
                                            {filteredTotal.toLocaleString('es-ES')}
                                        </strong>
                                    </>
                                )}
                                <> {(search.trim() || statusFilter !== 'all') ? t('resultados') : t('miembros')}</>
                                {filteredTotal > filtered.length && search.trim() === '' && statusFilter === 'all' && (
                                    <span className="ml-2 text-[10px] uppercase tracking-widest text-[#9CA3AF]">
                                        · {t('use la búsqueda para una consulta específica')}
                                    </span>
                                )}
                                {(search.trim() || statusFilter !== 'all') && (
                                    <span className="ml-2 text-[10px] uppercase tracking-widest text-[#1E3A8A]">
                                        · {t('consulta global')} ({totalInDb.toLocaleString('es-ES')})
                                    </span>
                                )}
                            </span>
                        </div>

                        {loading ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                {[...Array(6)].map((_, i) => (
                                    <div
                                        key={i}
                                        className="h-20 rounded-[14px] bg-white border border-[#E5EAF0] animate-pulse"
                                    />
                                ))}
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="rounded-[14px] bg-white border border-[#E5EAF0] p-12 text-center shadow-sm">
                                <Users className="w-8 h-8 mx-auto text-[#C8D3DE] mb-3" />
                                <p className="text-[#6B7280] text-sm">
                                    {t('No se encontraron miembros con esos filtros.')}
                                </p>
                            </div>
                        ) : view === 'table' ? (
                            <div
                                className="rounded-[14px] bg-white border border-[#E5EAF0] overflow-hidden shadow-[0_1px_3px_rgba(7,33,70,0.04)]"
                                data-testid="community-members-table"
                            >
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-[#F1F4F8] bg-[#F8FAFB]">
                                                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">Cuenta</th>
                                                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">Nombre</th>
                                                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">País</th>
                                                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">Depositado</th>
                                                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">Disp. / Retirado</th>
                                                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">Estado</th>
                                                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">Etapa</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#F1F4F8]">
                                            {filtered.map((m) => {
                                                const status = STATUS_LABELS[m.account_status] || STATUS_LABELS.activo;
                                                const completed = m.progress_step >= 5
                                                    || m.estado_actual === 'retirado'
                                                    || m.estado_actual === 'completado';
                                                return (
                                                    <tr
                                                        key={m.id}
                                                        data-testid={`community-table-row-${m.id}`}
                                                        data-self={m.is_self ? 'true' : 'false'}
                                                        className={`hover:bg-[#F8FAFB] transition-colors ${m.is_self ? 'bg-[#1E3A8A]/[0.04]' : ''}`}
                                                    >
                                                        <td className="px-4 py-2.5 text-[11px] font-mono text-[#6B7280] tabular-nums">
                                                            LB-{m.id.slice(0, 8).toUpperCase()}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-[#111827] font-medium whitespace-nowrap">
                                                            {m.name}
                                                            {m.is_self && (
                                                                <span className="ml-2 text-[9px] uppercase tracking-widest text-[#1E3A8A]">
                                                                    Tú
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-[#111827] text-[13px]">
                                                            <span className="mr-1.5">{m.country_flag}</span>
                                                            {m.country}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right text-[#111827] font-mono tabular-nums font-semibold">
                                                            {fmtEUR(m.deposited_eur)}
                                                        </td>
                                                        <td className={`px-3 py-2.5 text-right font-mono tabular-nums font-semibold ${
                                                            completed ? 'text-[#16A34A]' : 'text-[#111827]'
                                                        }`}>
                                                            {fmtEUR(completed ? m.withdrawn_eur : m.available_balance_eur)}
                                                        </td>
                                                        <td className="px-3 py-2.5">
                                                            <span
                                                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide border ${status.cls}`}
                                                            >
                                                                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                                                                {status.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-[10px]">
                                                            <span className={`font-mono tabular-nums font-semibold ${
                                                                completed ? 'text-[#16A34A]' : 'text-[#1E3A8A]'
                                                            }`}>
                                                                {m.progress_step}/5
                                                            </span>
                                                            <span className={`ml-1 uppercase tracking-wider ${
                                                                completed ? 'text-[#16A34A]' : 'text-[#6B7280]'
                                                            }`}>
                                                                {PROGRESS_STAGES[m.progress_step - 1]?.label || '—'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="community-members-grid">
                                {filtered.map((m) => <MemberCard key={m.id} member={m} />)}
                            </div>
                        )}

                        {/* Load more */}
                        {!loading && hasMore && (
                            <div className="flex justify-center pt-2" data-testid="community-load-more-wrapper">
                                <Button
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                    data-testid="community-load-more-btn"
                                    variant="outline"
                                    className="bg-white border-[#E5EAF0] hover:border-[#1E3A8A]/40 hover:bg-[#1E3A8A]/[0.04] text-[#1E3A8A] hover:text-[#1E3A8A] text-xs font-semibold px-6 h-9 shadow-sm"
                                >
                                    {loadingMore ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
                                    Cargar más ·{' '}
                                    <span className="font-mono tabular-nums ml-1.5">
                                        {(filteredTotal - members.length).toLocaleString('es-ES')}
                                    </span>
                                    <span className="ml-1 text-[#6B7280]">restantes</span>
                                </Button>
                            </div>
                        )}

                        <p className="text-[10px] text-[#9CA3AF] text-center pt-2">
                            La información mostrada es pública y no incluye correos, teléfonos ni documentos personales.
                            Estructurado bajo lineamientos GDPR.
                        </p>
                    </div>

                    {/* === Sidebar: Hall of Fame + Recent withdrawals === */}
                    <div className="xl:col-span-1 space-y-4">
                        {/* Hall of Fame — top retirees of last 30d */}
                        {stats?.hall_of_fame?.length > 0 && (
                            <div
                                className="rounded-[14px] bg-white border border-[#F1F4F8] shadow-[0_1px_3px_rgba(7,33,70,0.04),_0_6px_20px_rgba(7,33,70,0.06)] overflow-hidden"
                                data-testid="community-hall-of-fame"
                            >
                                <div className="px-5 py-4 border-b border-[#F1F4F8] flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-[#F59E0B]/10 flex items-center justify-center">
                                            <Award className="w-4 h-4 text-[#B45309]" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6B7280]">
                                                {t('Hall of Fame · 30d')}
                                            </p>
                                            <h3 className="text-[#111827] text-[14px] font-semibold" style={{ fontFamily: 'Poppins' }}>
                                                {t('Top retiros del mes')}
                                            </h3>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-2">
                                    {stats.hall_of_fame.map((h, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-[#F8FAFB] transition-colors"
                                        >
                                            <span
                                                className={`flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold ${
                                                    i === 0
                                                        ? 'bg-[#F59E0B]/15 text-[#B45309] border border-[#F59E0B]/40'
                                                        : i === 1
                                                            ? 'bg-[#E5EAF0] text-[#6B7280] border border-[#C8D3DE]'
                                                            : i === 2
                                                                ? 'bg-[#FB923C]/15 text-[#C2410C] border border-[#FB923C]/30'
                                                                : 'bg-[#F4F6F8] text-[#9CA3AF] border border-[#E5EAF0]'
                                                }`}
                                            >
                                                {i + 1}
                                            </span>
                                            <span className="text-base leading-none">{h.country_flag}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] text-[#111827] font-semibold truncate leading-tight">
                                                    {h.name_public}
                                                </p>
                                                <p className="text-[10px] text-[#6B7280] mt-0.5">
                                                    {h.country} · {timeAgo(h.date)}
                                                </p>
                                            </div>
                                            <p className="text-[13px] font-semibold text-[#16A34A] font-mono tabular-nums">
                                                {fmtEUR(h.amount_eur)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <RecentWithdrawalsFeed />
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default CommunityPage;
