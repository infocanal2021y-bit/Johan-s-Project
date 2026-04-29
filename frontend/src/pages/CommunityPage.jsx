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
    Banknote, ShieldCheck, FileCheck, Truck, Trophy, LayoutGrid, List, Award, Clock
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STATUS_LABELS = {
    activo:           { label: 'Activo',            cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
    en_revision:      { label: 'En revisión',       cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',         dot: 'bg-amber-400'   },
    retiro_pendiente: { label: 'Retiro pendiente',  cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',         dot: 'bg-amber-400'   },
    completado:       { label: 'Retirado',          cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',   dot: 'bg-emerald-400' },
};

const BADGE_DEFS = {
    verified:             { label: 'Verificado',     icon: BadgeCheck,  cls: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/[0.07]' },
    withdrawal_processed: { label: 'Retiro Procesado', icon: ShieldCheck, cls: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/[0.07]' },
    premium:              { label: 'Premium',        icon: Crown,       cls: 'border-amber-500/40 text-amber-300 bg-amber-500/[0.07]' },
    high_priority:        { label: 'Prioritario',    icon: Flame,       cls: 'border-rose-500/40 text-rose-300 bg-rose-500/[0.07]' },
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

// Animated number counter — counts up from 0 to value over `duration` ms
const AnimatedCounter = ({ value = 0, duration = 1400, prefix = '€', testid }) => {
    const [n, setN] = useState(0);
    useEffect(() => {
        if (!value) return;
        let start;
        let frame;
        const step = (ts) => {
            if (!start) start = ts;
            const t = Math.min(1, (ts - start) / duration);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - t, 3);
            setN(value * eased);
            if (t < 1) frame = requestAnimationFrame(step);
            else setN(value);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [value, duration]);
    return (
        <span className="font-mono tabular-nums" data-testid={testid}>
            {prefix}{n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </span>
    );
};

// ROI badge for completed profiles only
const RoiBadge = ({ deposited, withdrawn }) => {
    if (!deposited || !withdrawn) return null;
    const ratio = withdrawn / deposited;
    if (ratio >= 1.05) {
        const pct = Math.round((ratio - 1) * 100);
        return (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-emerald-500/40 text-emerald-300 bg-emerald-500/[0.07] text-[10px] font-medium tracking-wide" data-testid="community-roi-badge">
                <TrendingUp className="w-2.5 h-2.5" />
                ROI +{pct}%
            </div>
        );
    }
    if (ratio >= 0.65) {
        return (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-emerald-500/40 text-emerald-300 bg-emerald-500/[0.07] text-[10px] font-medium tracking-wide" data-testid="community-roi-badge">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Capital recuperado
            </div>
        );
    }
    return null;
};

const ProgressBar = ({ step }) => {
    const fullyCompleted = step >= 5;
    const pct = Math.round(((step - 1) / 4) * 100);  // 0/25/50/75/100
    return (
        <div className="space-y-2" data-testid="community-progress-bar" data-fully-completed={fullyCompleted ? 'true' : 'false'}>
            <div className="flex items-center gap-1 mt-4">
                {PROGRESS_STAGES.map((s, i) => {
                    const done = step >= s.key;
                    const current = step === s.key && !fullyCompleted;
                    const isFinal = s.key === 5;
                    const Icon = s.icon;
                    const doneRing  = isFinal ? 'border-emerald-500 bg-emerald-500/20' : 'border-amber-500 bg-amber-500/20';
                    const doneIcon  = isFinal ? 'text-emerald-300' : 'text-amber-300';
                    const doneLabel = isFinal ? 'text-emerald-300/90' : 'text-amber-300/90';
                    const nextIsFinal = s.key + 1 === 5;
                    const lineDoneCls = nextIsFinal ? 'bg-emerald-500/70' : 'bg-amber-500/70';
                    return (
                        <div key={s.key} className="flex-1 flex items-center gap-1">
                            <div className="flex flex-col items-center gap-1.5 flex-1 relative">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors relative ${
                                    done ? doneRing :
                                    current ? 'bg-amber-500/15 border-amber-400 ring-2 ring-amber-400/30' :
                                    'bg-slate-900 border-slate-700'
                                }`}>
                                    <Icon className={`w-3 h-3 ${done ? doneIcon : current ? 'text-amber-300' : 'text-slate-600'}`} />
                                    {current && (
                                        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 border border-slate-900 flex items-center justify-center" title="En proceso">
                                            <Clock className="w-2 h-2 text-slate-900 animate-spin" style={{ animationDuration: '4s' }} />
                                        </span>
                                    )}
                                </div>
                                <span className={`text-[8.5px] font-medium uppercase tracking-[0.08em] ${done ? doneLabel : current ? 'text-amber-300' : 'text-slate-600'}`}>
                                    {s.label}
                                </span>
                            </div>
                            {i < PROGRESS_STAGES.length - 1 && (
                                <div className={`h-px flex-1 mb-4 ${done && step > s.key ? lineDoneCls : 'bg-slate-800'}`} />
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest pt-1">
                <span className={`font-medium ${fullyCompleted ? 'text-emerald-400' : 'text-amber-400'} flex items-center gap-1.5`}>
                    {!fullyCompleted && <Clock className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: '4s' }} />}
                    {fullyCompleted ? 'Proceso completado' : `En proceso · ${PROGRESS_STAGES[step - 1]?.label || ''}`}
                </span>
                <span className={`font-mono tabular-nums font-semibold ${fullyCompleted ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {pct}%
                </span>
            </div>
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
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${def.cls} text-[10px] font-medium tracking-wide`}
                    >
                        <Icon className="w-2.5 h-2.5" />
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
    const accountId = `LB-${(member.id || '').slice(0, 8).toUpperCase()}`;
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            data-testid={`community-member-${member.id}`}
            data-self={member.is_self ? 'true' : 'false'}
            className={`relative rounded-lg border bg-slate-900/40 transition-colors ${
                member.is_self
                    ? 'border-blue-500/40 ring-1 ring-blue-500/20'
                    : 'border-slate-800 hover:border-slate-700'
            }`}
        >
            {member.is_self && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-lg" />
            )}

            {/* Header row: avatar · name + ID · status pill */}
            <div className="flex items-start justify-between gap-3 p-4 pb-3 border-b border-slate-800/60">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={`w-10 h-10 rounded-md flex items-center justify-center text-sm font-semibold flex-shrink-0 border ${
                        member.is_self ? 'bg-blue-500/10 text-blue-200 border-blue-500/30' : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}>
                        {(member.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-white text-sm font-semibold truncate leading-tight">{member.name}</h3>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                            <span className="inline-flex items-center gap-1">
                                <span className="text-sm leading-none">{member.country_flag}</span>
                                {member.country}
                            </span>
                            <span className="text-slate-700">·</span>
                            <span className="font-mono text-[10px] tracking-wide">{accountId}</span>
                            {member.is_self && (
                                <span className="ml-auto text-[9px] font-medium uppercase tracking-widest text-blue-300">Su cuenta</span>
                            )}
                        </div>
                    </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium tracking-wide border ${status.cls} flex-shrink-0`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                </span>
            </div>

            {/* Financial summary row — banking ledger style */}
            <div className="grid grid-cols-2 divide-x divide-slate-800/60">
                <div className="px-4 py-3">
                    <p className="text-[9px] font-medium uppercase tracking-[0.1em] text-slate-500">Depositado</p>
                    <p className="text-base font-semibold text-white font-mono tabular-nums mt-0.5" data-testid="community-member-deposited">
                        {fmtEUR(member.deposited_eur)}
                    </p>
                </div>
                {member.progress_step >= 5 ? (
                    <div className="px-4 py-3 bg-emerald-500/[0.05]">
                        <p className="text-[9px] font-medium uppercase tracking-[0.1em] text-emerald-300/80">Retirado</p>
                        <p className="text-base font-semibold text-emerald-300 font-mono tabular-nums mt-0.5" data-testid="community-member-withdrawn">
                            {fmtEUR(member.withdrawn_eur)}
                        </p>
                    </div>
                ) : (
                    <div className="px-4 py-3">
                        <p className="text-[9px] font-medium uppercase tracking-[0.1em] text-slate-500">Disponible</p>
                        <p className="text-base font-semibold text-slate-100 font-mono tabular-nums mt-0.5" data-testid="community-member-available">
                            {fmtEUR(member.available_balance_eur)}
                        </p>
                    </div>
                )}
            </div>

            {/* Compliance markers + progress timeline */}
            <div className="px-4 pt-3 pb-4 space-y-3 border-t border-slate-800/60">
                <div className="flex flex-wrap gap-1.5">
                    {member.progress_step >= 5 && (
                        <RoiBadge deposited={member.deposited_eur} withdrawn={member.withdrawn_eur} />
                    )}
                    {member.badges?.length > 0 && member.badges.map(b => {
                        const def = BADGE_DEFS[b];
                        if (!def) return null;
                        const Icon = def.icon;
                        return (
                            <div key={b}
                                data-testid={`community-badge-${b}`}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${def.cls} text-[10px] font-medium tracking-wide`}
                            >
                                <Icon className="w-2.5 h-2.5" />
                                {def.label}
                            </div>
                        );
                    })}
                </div>
                <ProgressBar step={member.progress_step} />
            </div>

            {/* Self-only action buttons (footer) */}
            {member.is_self && (
                <div className="px-4 pb-4">
                    <ActionButtons member={member} />
                </div>
            )}
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
        <div className="rounded-lg border border-slate-800 bg-slate-900/40" data-testid="community-recent-withdrawals">
            <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500 mb-1">Libro de transacciones</p>
                    <h3 className="text-white text-sm font-semibold">Retiros verificados</h3>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-widest text-emerald-400">
                    <span className="relative flex w-1.5 h-1.5">
                        <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
                        <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    </span>
                    Live · 30s
                </div>
            </div>
            <div className="p-3">
                {loading ? (
                    <div className="space-y-2">
                        {[...Array(3)].map((_, i) => <div key={i} className="h-11 bg-slate-800/40 rounded-md animate-pulse" />)}
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-xs">
                        <Sparkles className="w-5 h-5 mx-auto mb-2 text-slate-600" />
                        Sin retiros verificados aún.<br />
                        <span className="text-[11px] text-slate-600">El libro se actualizará en cuanto haya transacciones completadas.</span>
                    </div>
                ) : (
                    <div className="space-y-px max-h-[520px] overflow-y-auto pr-1">
                        <AnimatePresence>
                            {items.map(it => (
                                <motion.div
                                    key={it.id}
                                    initial={{ opacity: 0, x: -6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-slate-800/30 transition-colors"
                                >
                                    <div className="text-base leading-none">{it.country_flag}</div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] text-slate-200 font-medium truncate leading-tight">{it.name_public}</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">{it.country} · {timeAgo(it.date)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[13px] font-semibold text-emerald-300 font-mono tabular-nums leading-tight">{fmtEUR(it.amount_eur)}</p>
                                        <p className="text-[9px] text-emerald-400/80 uppercase tracking-widest mt-0.5 flex items-center gap-1 justify-end">
                                            <CheckCircle2 className="w-2.5 h-2.5" />
                                            {it.status === 'completed' ? 'Retirado' : 'En transferencia'}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
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
    const [view, setView] = useState('cards');  // 'cards' | 'table'
    const [stats, setStats] = useState(null);
    const [showAutocomplete, setShowAutocomplete] = useState(false);

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
        // Stats — fetch once on mount + every 60s
        const fetchStats = async () => {
            try {
                const token = localStorage.getItem('token');
                const r = await fetch(`${API_URL}/api/community/stats`, { headers: { Authorization: `Bearer ${token}` } });
                const d = await r.json();
                setStats(d);
            } catch (e) { /* silent */ }
        };
        fetchStats();
        const id = setInterval(() => {
            fetchMembers({ q: search, statusF: statusFilter });
            fetchStats();
        }, 60000);
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
            <div className="max-w-7xl mx-auto space-y-5 pb-12" data-testid="community-page">
                {/* Institutional header — solid, no gradient blobs */}
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden">
                        {/* Top accent line */}
                        <div className="h-0.5 bg-gradient-to-r from-blue-500 via-blue-500/50 to-transparent" />
                        <div className="px-6 py-5">
                            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500 mb-2">
                                        <Shield className="w-3 h-3" />
                                        Lionsbit · Directorio Institucional
                                    </div>
                                    <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                                        Directorio de Miembros Verificados
                                    </h1>
                                    <p className="text-slate-400 mt-1.5 max-w-2xl text-[13px] leading-relaxed">
                                        Registro público de cuentas verificadas. Consulta el estado de verificación,
                                        depósitos y retiros procesados. Información estructurada bajo lineamientos GDPR.
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-emerald-400 whitespace-nowrap">
                                    <span className="relative flex w-1.5 h-1.5">
                                        <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
                                        <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                    </span>
                                    Sistema activo
                                </div>
                            </div>
                        </div>

                        {/* Stats row — banking dashboard metrics */}
                        <div className="grid grid-cols-2 md:grid-cols-5 border-t border-slate-800/80 divide-x divide-slate-800/80">
                            <div className="px-4 py-4">
                                <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-slate-500">Total Retirado</p>
                                <p className="text-lg font-semibold text-emerald-300 mt-1" data-testid="community-total-withdrawn">
                                    <AnimatedCounter value={stats?.total_withdrawn_eur || 0} />
                                </p>
                                <p className="text-[9px] text-slate-600 mt-1">
                                    {stats?.completed_withdrawals_count || 0} retiros completados
                                </p>
                            </div>
                            <div className="px-4 py-4">
                                <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-slate-500">Total Depositado</p>
                                <p className="text-lg font-semibold text-slate-100 mt-1">
                                    <AnimatedCounter value={stats?.total_deposited_eur || 0} />
                                </p>
                                <p className="text-[9px] text-slate-600 mt-1">en la plataforma</p>
                            </div>
                            <div className="px-4 py-4">
                                <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-slate-500">Cuentas registradas</p>
                                <p className="text-lg font-semibold text-white font-mono tabular-nums mt-1">{totalInDb.toLocaleString('es-ES')}</p>
                                <p className="text-[9px] text-slate-600 mt-1">activas en la red</p>
                            </div>
                            <div className="px-4 py-4">
                                <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-slate-500">En revisión</p>
                                <p className="text-lg font-semibold text-amber-300 font-mono tabular-nums mt-1">
                                    {(statusCounts.en_revision || 0).toLocaleString('es-ES')}
                                </p>
                                <p className="text-[9px] text-slate-600 mt-1">pendientes</p>
                            </div>
                            <div className="px-4 py-4">
                                <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-slate-500">País principal</p>
                                <p className="text-lg font-semibold text-white mt-1 flex items-center gap-2">
                                    <span>{stats?.top_countries?.[0]?.flag || '🌐'}</span>
                                    <span className="text-sm">{stats?.top_countries?.[0]?.country || '—'}</span>
                                </p>
                                <p className="text-[9px] text-slate-600 mt-1 font-mono tabular-nums">
                                    {(stats?.top_countries?.[0]?.count || 0).toLocaleString('es-ES')} cuentas
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Layout: directory + recent withdrawals sidebar */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                    {/* Directory */}
                    <div className="xl:col-span-2 space-y-4">
                        {/* Search + Filters + View toggle */}
                        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 space-y-3">
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                    <Input
                                        placeholder="Buscar por nombre, país o estado..."
                                        value={search}
                                        onChange={e => { setSearch(e.target.value); setShowAutocomplete(true); }}
                                        onFocus={() => setShowAutocomplete(true)}
                                        onBlur={() => setTimeout(() => setShowAutocomplete(false), 150)}
                                        className="pl-10 bg-slate-950 border-slate-800 text-white text-sm h-10"
                                        data-testid="community-search"
                                    />
                                    {showAutocomplete && search.trim().length >= 2 && filtered.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 z-30 rounded-md border border-slate-700 bg-slate-950/95 backdrop-blur-xl shadow-xl overflow-hidden" data-testid="community-autocomplete">
                                            {filtered.slice(0, 6).map(m => (
                                                <button
                                                    key={m.id}
                                                    type="button"
                                                    onMouseDown={(e) => { e.preventDefault(); setSearch(m.name); setShowAutocomplete(false); }}
                                                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-800/60 text-left"
                                                >
                                                    <span className="text-base leading-none">{m.country_flag}</span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-slate-100 truncate">{m.name}</p>
                                                        <p className="text-[10px] text-slate-500">{m.country} · LB-{m.id.slice(0, 8).toUpperCase()}</p>
                                                    </div>
                                                    <span className={`text-[9px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border ${(STATUS_LABELS[m.account_status] || STATUS_LABELS.activo).cls}`}>
                                                        {(STATUS_LABELS[m.account_status] || STATUS_LABELS.activo).label}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="inline-flex rounded-md border border-slate-800 bg-slate-950 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setView('cards')}
                                        data-testid="community-view-cards"
                                        className={`px-3 h-10 flex items-center justify-center transition-colors ${view === 'cards' ? 'bg-blue-500/15 text-blue-300' : 'text-slate-500 hover:text-slate-300'}`}
                                        title="Vista tarjetas"
                                    >
                                        <LayoutGrid className="w-4 h-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setView('table')}
                                        data-testid="community-view-table"
                                        className={`px-3 h-10 flex items-center justify-center border-l border-slate-800 transition-colors ${view === 'table' ? 'bg-blue-500/15 text-blue-300' : 'text-slate-500 hover:text-slate-300'}`}
                                        title="Vista tabla"
                                    >
                                        <List className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2" data-testid="community-status-filters">
                                {[
                                    { key: 'all',              label: 'Todos',           cls: 'border-slate-700 text-slate-300 bg-slate-800/50' },
                                    { key: 'activo',           label: 'Activo',          cls: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/[0.06]' },
                                    { key: 'en_revision',      label: 'En revisión',     cls: 'border-amber-500/40 text-amber-300 bg-amber-500/[0.06]' },
                                    { key: 'retiro_pendiente', label: 'Retiro pendiente', cls: 'border-amber-500/40 text-amber-300 bg-amber-500/[0.06]' },
                                    { key: 'completado',       label: 'Retirado',         cls: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/[0.06]' },
                                ].map(f => {
                                    const active = statusFilter === f.key;
                                    return (
                                        <button
                                            key={f.key}
                                            type="button"
                                            onClick={() => setStatusFilter(f.key)}
                                            data-testid={`community-filter-${f.key}`}
                                            className={`inline-flex items-center gap-2 px-3 h-7 rounded-md text-[11px] font-medium tracking-wide border transition-colors ${f.cls} ${active ? 'ring-1 ring-emerald-400/70 ring-offset-1 ring-offset-slate-900' : 'opacity-70 hover:opacity-100'}`}
                                        >
                                            {f.label}
                                            <span className="font-mono tabular-nums text-[10px] text-slate-400">{(counts[f.key] || 0).toLocaleString('es-ES')}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Members grid */}
                        <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                            <span data-testid="community-results-count">
                                Mostrando <strong className="text-slate-200 font-semibold tabular-nums">{filtered.length.toLocaleString('es-ES')}</strong>
                                {filteredTotal > filtered.length && (
                                    <> de <strong className="text-blue-300 font-semibold tabular-nums">{filteredTotal.toLocaleString('es-ES')}</strong></>
                                )}
                                <> {(search.trim() || statusFilter !== 'all') ? 'resultados' : 'miembros'}</>
                                {filteredTotal > filtered.length && search.trim() === '' && statusFilter === 'all' && (
                                    <span className="ml-2 text-[10px] uppercase tracking-widest text-slate-600">
                                        · use la búsqueda para una consulta específica
                                    </span>
                                )}
                                {(search.trim() || statusFilter !== 'all') && (
                                    <span className="ml-2 text-[10px] uppercase tracking-widest text-blue-400/80">
                                        · consulta global ({totalInDb.toLocaleString('es-ES')})
                                    </span>
                                )}
                            </span>
                        </div>
                        {loading ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                {[...Array(6)].map((_, i) => (
                                    <div key={i} className="h-56 rounded-lg bg-slate-900/40 border border-slate-800 animate-pulse" />
                                ))}
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-12 text-center">
                                <Users className="w-8 h-8 mx-auto text-slate-600 mb-3" />
                                <p className="text-slate-400 text-sm">No se encontraron miembros con esos filtros.</p>
                            </div>
                        ) : view === 'table' ? (
                            <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden" data-testid="community-members-table">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-800 bg-slate-900/60">
                                                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">Cuenta</th>
                                                <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">Nombre</th>
                                                <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">País</th>
                                                <th className="px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-wider text-slate-500">Depositado</th>
                                                <th className="px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-wider text-slate-500">Disp. / Retirado</th>
                                                <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">Estado</th>
                                                <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">Etapa</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/60">
                                            {filtered.map(m => {
                                                const status = STATUS_LABELS[m.account_status] || STATUS_LABELS.activo;
                                                const completed = m.progress_step >= 5;
                                                return (
                                                    <tr key={m.id} data-testid={`community-table-row-${m.id}`} data-self={m.is_self ? 'true' : 'false'} className={`hover:bg-slate-800/30 transition-colors ${m.is_self ? 'bg-blue-500/[0.04]' : ''}`}>
                                                        <td className="px-4 py-2.5 text-[11px] font-mono text-slate-500 tabular-nums">LB-{m.id.slice(0, 8).toUpperCase()}</td>
                                                        <td className="px-3 py-2.5 text-slate-100 font-medium whitespace-nowrap">
                                                            {m.name}
                                                            {m.is_self && <span className="ml-2 text-[9px] uppercase tracking-widest text-blue-300">Tú</span>}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-slate-300 text-[13px]">
                                                            <span className="mr-1.5">{m.country_flag}</span>{m.country}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right text-slate-100 font-mono tabular-nums">{fmtEUR(m.deposited_eur)}</td>
                                                        <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${completed ? 'text-emerald-300' : 'text-slate-100'}`}>
                                                            {fmtEUR(completed ? m.withdrawn_eur : m.available_balance_eur)}
                                                        </td>
                                                        <td className="px-3 py-2.5">
                                                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium tracking-wide border ${status.cls}`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                                                                {status.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-[10px] text-slate-400">
                                                            <span className={`font-mono tabular-nums ${completed ? 'text-emerald-300' : 'text-amber-300'}`}>{m.progress_step}/5</span>
                                                            <span className="ml-1 uppercase tracking-wider">{PROGRESS_STAGES[m.progress_step - 1]?.label || '—'}</span>
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
                                {filtered.map(m => <MemberCard key={m.id} member={m} />)}
                            </div>
                        )}

                        {/* Load more — works also during search/filter (server-side pagination) */}
                        {!loading && hasMore && (
                            <div className="flex justify-center pt-2" data-testid="community-load-more-wrapper">
                                <Button
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                    data-testid="community-load-more-btn"
                                    variant="outline"
                                    className="border-slate-700 hover:border-blue-500/50 hover:bg-blue-500/[0.04] text-slate-300 hover:text-blue-200 text-xs font-medium px-6 h-9"
                                >
                                    {loadingMore ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
                                    Cargar más · <span className="font-mono tabular-nums ml-1.5">{(filteredTotal - members.length).toLocaleString('es-ES')}</span>
                                    <span className="ml-1 text-slate-500">restantes</span>
                                </Button>
                            </div>
                        )}

                        <p className="text-[10px] text-slate-600 text-center pt-2">
                            La información mostrada es pública y no incluye correos, teléfonos ni documentos personales.
                            Estructurado bajo lineamientos GDPR.
                        </p>
                    </div>

                    {/* Recent withdrawals feed */}
                    <div className="xl:col-span-1 space-y-4">
                        {/* Hall of Fame — top withdrawals last 30d */}
                        {stats?.hall_of_fame?.length > 0 && (
                            <div className="rounded-lg border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.04] to-transparent" data-testid="community-hall-of-fame">
                                <div className="px-5 py-4 border-b border-amber-500/15 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Award className="w-4 h-4 text-amber-300" />
                                        <div>
                                            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-amber-300/80">Hall of Fame · 30d</p>
                                            <h3 className="text-white text-sm font-semibold">Top retiros del mes</h3>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-3 space-y-1">
                                    {stats.hall_of_fame.map((h, i) => (
                                        <div key={i} className="flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-slate-800/30">
                                            <span className={`flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold ${
                                                i === 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                                                i === 1 ? 'bg-slate-700/60 text-slate-200 border border-slate-600' :
                                                i === 2 ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30' :
                                                'bg-slate-800/50 text-slate-400 border border-slate-700'
                                            }`}>{i + 1}</span>
                                            <span className="text-base leading-none">{h.country_flag}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] text-slate-100 font-medium truncate leading-tight">{h.name_public}</p>
                                                <p className="text-[10px] text-slate-500 mt-0.5">{h.country} · {timeAgo(h.date)}</p>
                                            </div>
                                            <p className="text-[13px] font-semibold text-amber-200 font-mono tabular-nums">{fmtEUR(h.amount_eur)}</p>
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
