import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../context/AuthContext';
import {
    Users, Search, Shield, BadgeCheck, TrendingUp, Crown, Flame, CheckCircle2,
    ArrowUpRight, Wallet, Receipt, Sparkles, Filter, Loader2, Globe,
    Banknote, ShieldCheck, FileCheck, Truck, Trophy
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STATUS_LABELS = {
    activo:           { label: 'Activo',            cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
    en_revision:      { label: 'En revisión',       cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',         dot: 'bg-amber-400'   },
    retiro_pendiente: { label: 'Retiro pendiente',  cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',            dot: 'bg-cyan-400'    },
    completado:       { label: 'Retirado',          cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30',            dot: 'bg-blue-400'    },
};

const BADGE_DEFS = {
    verified:             { label: 'Usuario Verificado',   icon: BadgeCheck,  cls: 'from-emerald-500 to-emerald-600', text: 'text-emerald-200', glow: 'shadow-[0_0_12px_rgba(16,185,129,0.45)]' },
    withdrawal_processed: { label: 'Retiro Procesado',     icon: ShieldCheck, cls: 'from-cyan-500 to-cyan-600',       text: 'text-cyan-200',    glow: 'shadow-[0_0_12px_rgba(6,182,212,0.45)]' },
    premium:              { label: 'Cuenta Premium',       icon: Crown,       cls: 'from-amber-500 to-amber-600',     text: 'text-amber-100',   glow: 'shadow-[0_0_12px_rgba(245,158,11,0.5)]' },
    high_priority:        { label: 'Prioridad Alta',       icon: Flame,       cls: 'from-rose-500 to-rose-600',       text: 'text-rose-100',    glow: 'shadow-[0_0_12px_rgba(244,63,94,0.5)]' },
};

const PROGRESS_STAGES = [
    { key: 1, label: 'Verificación', icon: ShieldCheck },
    { key: 2, label: 'Impuesto',     icon: Receipt    },
    { key: 3, label: 'Revisión',     icon: FileCheck  },
    { key: 4, label: 'Transferencia', icon: Truck     },
    { key: 5, label: 'Retirado',     icon: Trophy     },
];

const fmtEUR = (n) => `€${(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const timeAgo = (iso) => {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.max(1, Math.floor(ms / 60000));
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    return `hace ${d} d`;
};

const ProgressBar = ({ step }) => {
    const fullyCompleted = step >= 5;
    // When fully completed → render in BLUE (premium completion); otherwise emerald/cyan default
    const doneCls = fullyCompleted
        ? 'bg-blue-500 border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.65)]'
        : 'bg-emerald-500 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]';
    const doneTextCls = fullyCompleted ? 'text-blue-300' : 'text-emerald-300';
    const connectorCls = fullyCompleted ? 'bg-blue-500' : 'bg-emerald-500';
    return (
        <div className="flex items-center gap-1 mt-3" data-testid="community-progress-bar" data-fully-completed={fullyCompleted ? 'true' : 'false'}>
            {PROGRESS_STAGES.map((s, i) => {
                const done = step >= s.key;
                const current = step === s.key && !fullyCompleted;
                const Icon = s.icon;
                return (
                    <div key={s.key} className="flex-1 flex items-center gap-1">
                        <div className="flex flex-col items-center gap-1 flex-1">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all ${
                                done ? doneCls :
                                current ? 'bg-cyan-500/20 border-cyan-400 ring-2 ring-cyan-400/40 animate-pulse' :
                                'bg-slate-800/50 border-slate-700'
                            }`}>
                                <Icon className={`w-3.5 h-3.5 ${done ? 'text-white' : current ? 'text-cyan-300' : 'text-slate-600'}`} />
                            </div>
                            <span className={`text-[9px] font-mono uppercase tracking-tight ${done ? doneTextCls : current ? 'text-cyan-300' : 'text-slate-600'}`}>
                                {s.label}
                            </span>
                        </div>
                        {i < PROGRESS_STAGES.length - 1 && (
                            <div className={`h-0.5 flex-1 mb-4 ${done && step > s.key ? connectorCls : 'bg-slate-800'}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

const BadgeCloud = ({ badges }) => {
    if (!badges?.length) return null;
    return (
        <div className="flex flex-wrap gap-1.5">
            {badges.map(b => {
                const def = BADGE_DEFS[b];
                if (!def) return null;
                const Icon = def.icon;
                return (
                    <div key={b}
                        data-testid={`community-badge-${b}`}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-br ${def.cls} ${def.glow} text-[10px] font-bold ${def.text} uppercase tracking-wider`}
                    >
                        <Icon className="w-3 h-3" />
                        {def.label}
                    </div>
                );
            })}
        </div>
    );
};

const ActionButtons = ({ member, onAction }) => {
    if (!member.is_self) return null;
    const status = member.account_status;
    const hasTax = member.has_pending_tax;
    const unlocked = member.partial_withdraw_unlocked;

    return (
        <div className="flex flex-wrap gap-2 mt-3" data-testid="community-self-actions">
            {hasTax && (
                <Link to="/transactions" className="flex-1 min-w-[140px]">
                    <Button size="sm" className="w-full bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold shadow-[0_0_14px_rgba(245,158,11,0.4)]" data-testid="community-pay-tax-btn">
                        <Receipt className="w-3.5 h-3.5 mr-1.5" />
                        Pagar Impuesto
                    </Button>
                </Link>
            )}
            <Link to="/withdraw" className="flex-1 min-w-[120px]" onClick={() => onAction?.('withdraw')}>
                <Button size="sm" className={`w-full ${unlocked
                    ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-[0_0_14px_rgba(16,185,129,0.45)]'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                } font-semibold`} data-testid="community-withdraw-btn">
                    <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
                    {unlocked ? 'Retirar' : 'Activar Retiro'}
                </Button>
            </Link>
            <Link to="/withdraw" className="flex-1 min-w-[120px]">
                <Button size="sm" variant="outline" className="w-full border-cyan-500/40 hover:bg-cyan-500/10 text-cyan-300" data-testid="community-pay-tax-partial-btn">
                    <Wallet className="w-3.5 h-3.5 mr-1.5" />
                    Abonar Impuesto
                </Button>
            </Link>
        </div>
    );
};

const MemberCard = ({ member }) => {
    const status = STATUS_LABELS[member.account_status] || STATUS_LABELS.activo;
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            data-testid={`community-member-${member.id}`}
            data-self={member.is_self ? 'true' : 'false'}
            className={`group relative rounded-2xl p-4 border transition-all hover:scale-[1.01] ${
                member.is_self
                    ? 'bg-gradient-to-br from-cyan-500/10 to-emerald-500/10 border-cyan-500/40 shadow-[0_0_30px_rgba(6,182,212,0.25)]'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
        >
            {member.is_self && (
                <div className="absolute -top-2 left-4 px-2 py-0.5 bg-gradient-to-br from-cyan-500 to-emerald-500 rounded-full text-[9px] font-bold uppercase tracking-widest text-white shadow-lg">
                    Tu cuenta
                </div>
            )}
            <div className="flex items-start gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0 ${
                    member.is_self ? 'bg-gradient-to-br from-cyan-500 to-emerald-500 text-white' : 'bg-slate-800 text-slate-300'
                }`}>
                    {(member.name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="text-white font-semibold truncate">{member.name}</h3>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider border ${status.cls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                            {status.label}
                        </span>
                    </div>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                        <span className="text-base leading-none">{member.country_flag}</span>
                        {member.country}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-2.5">
                    <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Depositado</p>
                    <p className="text-sm font-bold text-emerald-300 font-mono mt-0.5" data-testid="community-member-deposited">
                        {fmtEUR(member.deposited_eur)}
                    </p>
                </div>
                {member.progress_step >= 5 ? (
                    <div className="rounded-lg bg-blue-500/5 border border-blue-500/30 p-2.5">
                        <p className="text-[9px] font-mono uppercase tracking-wider text-blue-300">Retirado</p>
                        <p className="text-sm font-bold text-blue-300 font-mono mt-0.5" data-testid="community-member-withdrawn">
                            {fmtEUR(member.withdrawn_eur)}
                        </p>
                    </div>
                ) : (
                    <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-2.5">
                        <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Disponible</p>
                        <p className="text-sm font-bold text-cyan-300 font-mono mt-0.5" data-testid="community-member-available">
                            {fmtEUR(member.available_balance_eur)}
                        </p>
                    </div>
                )}
            </div>

            <div className="mt-3">
                <BadgeCloud badges={member.badges} />
            </div>

            <ProgressBar step={member.progress_step} />

            <ActionButtons member={member} />
        </motion.div>
    );
};

const RecentWithdrawalsFeed = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchFeed = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const r = await fetch(`${API_URL}/api/community/recent-withdrawals?limit=12`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await r.json();
            setItems(d.items || []);
        } catch (e) {
            // silent
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFeed();
        const id = setInterval(fetchFeed, 30000);
        return () => clearInterval(id);
    }, [fetchFeed]);

    return (
        <Card className="bg-slate-900/70 border-slate-800 backdrop-blur-xl" data-testid="community-recent-withdrawals">
            <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        </div>
                        <h3 className="text-white font-semibold">Retiros recientes verificados</h3>
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Live · 30s</span>
                </div>

                {loading ? (
                    <div className="space-y-2">
                        {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-slate-800/40 rounded-lg animate-pulse" />)}
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                        <Sparkles className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                        Aún no hay retiros verificados públicos. <br />
                        <span className="text-xs">Esta sección se actualizará en cuanto haya transacciones completadas.</span>
                    </div>
                ) : (
                    <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
                        <AnimatePresence>
                            {items.map(it => (
                                <motion.div
                                    key={it.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/60 hover:border-emerald-500/30 transition-colors"
                                >
                                    <div className="text-xl">{it.country_flag}</div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-white font-medium truncate">{it.name_public}</p>
                                        <p className="text-[10px] text-slate-500">{it.country} · {timeAgo(it.date)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-emerald-300 font-mono">{fmtEUR(it.amount_eur)}</p>
                                        <p className="text-[9px] text-emerald-400 uppercase tracking-wider flex items-center gap-1 justify-end">
                                            <CheckCircle2 className="w-3 h-3" />
                                            {it.status === 'completed' ? 'Retirado' : 'En transferencia'}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export const CommunityPage = () => {
    const { user } = useAuth();
    const [members, setMembers] = useState([]);
    const [totalInDb, setTotalInDb] = useState(0);
    const [filteredTotal, setFilteredTotal] = useState(0);
    const [statusCounts, setStatusCounts] = useState({ activo: 0, en_revision: 0, retiro_pendiente: 0, completado: 0 });
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const PAGE_SIZE = 120;

    // Server-side fetch — receives q + status, returns matching slice from the entire DB
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
            const d = await r.json();
            if (append) {
                setMembers(prev => [...prev, ...(d.members || [])]);
            } else {
                setMembers(d.members || []);
            }
            setTotalInDb(d.total_in_db || 0);
            setFilteredTotal(d.count || 0);
            setStatusCounts(d.status_counts || { activo: 0, en_revision: 0, retiro_pendiente: 0, completado: 0 });
            setHasMore(!!d.has_more);
        } catch (e) {
            // silent
        } finally {
            if (isInitial) setLoading(false);
        }
    }, []);

    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        await fetchMembers({ q: search, statusF: statusFilter, append: true, currentLen: members.length });
        setLoadingMore(false);
    }, [members.length, loadingMore, hasMore, search, statusFilter, fetchMembers]);

    // Initial load + auto-refresh every 60s (preserves current search/filter)
    useEffect(() => {
        fetchMembers({ q: '', statusF: 'all' });
        const id = setInterval(() => fetchMembers({ q: search, statusF: statusFilter }), 60000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Debounced server-side search/filter — refetch when user types or changes filter
    useEffect(() => {
        const t = setTimeout(() => {
            fetchMembers({ q: search, statusF: statusFilter });
        }, 350);
        return () => clearTimeout(t);
    }, [search, statusFilter, fetchMembers]);

    // No more client-side filtering — backend returns the right slice
    const filtered = members;

    // Counts come from server (global, not from current page slice)
    const counts = { all: totalInDb, ...statusCounts };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-6 pb-12" data-testid="community-page">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="rounded-2xl p-6 bg-gradient-to-br from-cyan-500/10 via-slate-900 to-emerald-500/10 border border-cyan-500/20 backdrop-blur-xl relative overflow-hidden">
                        <div className="absolute -top-20 -right-20 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl" />
                        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
                        <div className="relative">
                            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-cyan-300 mb-2">
                                <Users className="w-4 h-4" />
                                Comunidad LIONSBIT
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-white">
                                Directorio de miembros verificados
                            </h1>
                            <p className="text-slate-400 mt-2 max-w-2xl text-sm">
                                Transparencia institucional. Consulta en tiempo real el estado de los perfiles de la plataforma:
                                depósitos, saldos disponibles, etapa de verificación y retiros procesados. Sin información sensible.
                            </p>
                            <div className="flex flex-wrap gap-3 mt-4 text-xs">
                                <div className="flex items-center gap-1.5 text-emerald-300">
                                    <Shield className="w-3.5 h-3.5" />
                                    <span>Datos públicos de miembros</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-cyan-300">
                                    <Globe className="w-3.5 h-3.5" />
                                    <span>{totalInDb.toLocaleString('es-ES')} cuentas activas</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-violet-300">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>Actualización en vivo</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Layout: directory + recent withdrawals sidebar */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Directory */}
                    <div className="xl:col-span-2 space-y-4">
                        {/* Search + Filters */}
                        <Card className="bg-slate-900/70 border-slate-800 backdrop-blur-xl">
                            <CardContent className="p-4 space-y-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <Input
                                        placeholder="Buscar por nombre, país o estado..."
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        className="pl-10 bg-slate-950 border-slate-800 text-white"
                                        data-testid="community-search"
                                    />
                                </div>
                                <div className="flex flex-wrap gap-2" data-testid="community-status-filters">
                                    {[
                                        { key: 'all',              label: 'Todos',           cls: 'bg-slate-800 text-slate-200 border-slate-700' },
                                        { key: 'activo',           label: 'Activo',          cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
                                        { key: 'en_revision',      label: 'En revisión',     cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
                                        { key: 'retiro_pendiente', label: 'Retiro pendiente', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
                                        { key: 'completado',       label: 'Retirado',         cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
                                    ].map(f => {
                                        const active = statusFilter === f.key;
                                        return (
                                            <button
                                                key={f.key}
                                                type="button"
                                                onClick={() => setStatusFilter(f.key)}
                                                data-testid={`community-filter-${f.key}`}
                                                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider border transition-all ${f.cls} ${active ? 'ring-2 ring-cyan-400/60' : 'opacity-70 hover:opacity-100'}`}
                                            >
                                                <Filter className="w-3 h-3" />
                                                {f.label}
                                                <span className="font-bold">{counts[f.key] || 0}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Members grid */}
                        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                            <span data-testid="community-results-count">
                                Mostrando <strong className="text-white">{filtered.length.toLocaleString('es-ES')}</strong>
                                {filteredTotal > filtered.length && (
                                    <> de <strong className="text-cyan-300">{filteredTotal.toLocaleString('es-ES')}</strong></>
                                )}
                                <> {(search.trim() || statusFilter !== 'all') ? 'resultados' : 'miembros'}</>
                                {filteredTotal > filtered.length && search.trim() === '' && statusFilter === 'all' && (
                                    <span className="ml-2 text-[10px] font-mono uppercase tracking-wider text-amber-400">
                                        · usa la búsqueda para encontrar a alguien específico
                                    </span>
                                )}
                                {(search.trim() || statusFilter !== 'all') && (
                                    <span className="ml-2 text-[10px] font-mono uppercase tracking-wider text-cyan-400">
                                        · búsqueda en toda la base ({totalInDb.toLocaleString('es-ES')})
                                    </span>
                                )}
                            </span>
                        </div>
                        {loading ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                {[...Array(6)].map((_, i) => (
                                    <div key={i} className="h-64 rounded-2xl bg-slate-900/50 border border-slate-800 animate-pulse" />
                                ))}
                            </div>
                        ) : filtered.length === 0 ? (
                            <Card className="bg-slate-900/70 border-slate-800">
                                <CardContent className="p-12 text-center">
                                    <Users className="w-10 h-10 mx-auto text-slate-600 mb-3" />
                                    <p className="text-slate-400">No se encontraron miembros con esos filtros.</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="community-members-grid">
                                {filtered.map(m => <MemberCard key={m.id} member={m} />)}
                            </div>
                        )}

                        {/* Load more — works also during search/filter (server-side pagination) */}
                        {!loading && hasMore && (
                            <div className="flex justify-center pt-3" data-testid="community-load-more-wrapper">
                                <Button
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                    data-testid="community-load-more-btn"
                                    className="bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 hover:from-cyan-500/30 hover:to-emerald-500/30 border border-cyan-500/40 text-cyan-200 font-semibold px-8 h-11 backdrop-blur-xl"
                                >
                                    {loadingMore ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                                    Cargar más · {(filteredTotal - members.length).toLocaleString('es-ES')} restantes
                                </Button>
                            </div>
                        )}

                        <p className="text-[10px] text-slate-600 text-center pt-2">
                            La información mostrada es pública y no incluye correos, teléfonos ni documentos personales.
                            Estructurado bajo lineamientos GDPR.
                        </p>
                    </div>

                    {/* Recent withdrawals feed */}
                    <div className="xl:col-span-1">
                        <RecentWithdrawalsFeed />
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default CommunityPage;
