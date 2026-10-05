import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
    Banknote, Loader2, ChevronDown, MessageCircleQuestion, CheckCircle2,
    Clock, FileSearch, Send, RefreshCw, Search, Zap, Volume2, VolumeX, XCircle,
} from 'lucide-react';
import { WithdrawalQuestions } from '../components/community/WithdrawalQuestions';
import { CancelWithdrawalDialog } from '../components/dashboard/CancelWithdrawalDialog';
import { WithdrawalHistoryTimeline } from '../components/dashboard/WithdrawalHistoryTimeline';
import { timeAgo } from '../components/community/constants';

const POLL_MS = 15000;

let _audioCtx = null;
const playChime = () => {
    try {
        _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const ctx = _audioCtx;
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime;
        [[880, 0], [1174.66, 0.12]].forEach(([freq, delay]) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, t0 + delay);
            gain.gain.exponentialRampToValueAtTime(0.05, t0 + delay + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.35);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t0 + delay);
            osc.stop(t0 + delay + 0.4);
        });
    } catch { /* autoplay bloqueado: silencioso */ }
};

const STAGES = [
    { key: 'solicitado', label: 'Solicitado', icon: Send },
    { key: 'en_revision', label: 'En revisión', icon: FileSearch },
    { key: 'procesado', label: 'Procesado', icon: Clock },
    { key: 'completado', label: 'Completado', icon: CheckCircle2 },
];

const STAGE_BADGE = {
    solicitado: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    en_revision: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    procesado: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    completado: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    cancelado: 'bg-red-500/15 text-red-300 border-red-500/30',
};

const STAGE_LABEL = { ...Object.fromEntries(STAGES.map((s) => [s.key, s.label])), cancelado: 'Cancelado' };
const FILTERS = [{ key: 'all', label: 'Todos' }, ...STAGES, { key: 'cancelado', label: 'Cancelado' }];
const CANCELLABLE = ['solicitado', 'en_revision', 'procesado'];

const fmtMoney = (n, cur) => cur === 'USD'
    ? `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
    : `€${(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const fmtExact = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const StageBar = ({ stageIndex }) => (
    <div className="flex items-center gap-1 mt-3">
        {STAGES.map((s, i) => {
            const Icon = s.icon;
            const done = i + 1 < stageIndex;
            const current = i + 1 === stageIndex;
            const allDone = stageIndex === 4;
            const circle = allDone || done
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                : current
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                    : 'bg-slate-800 border-slate-700 text-slate-600';
            const label = allDone || done ? 'text-emerald-400' : current ? 'text-cyan-300' : 'text-slate-600';
            return (
                <div key={s.key} className="flex-1 flex items-center gap-1">
                    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center border ${circle}`}>
                            <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className={`text-[8px] font-semibold uppercase tracking-[0.05em] text-center leading-tight ${label}`}>
                            {s.label}
                        </span>
                    </div>
                    {i < STAGES.length - 1 && (
                        <div className={`h-[2px] flex-1 mb-4 rounded-full ${allDone || i + 1 < stageIndex ? 'bg-emerald-500/50' : 'bg-slate-800'}`} />
                    )}
                </div>
            );
        })}
    </div>
);

const WithdrawalRow = ({ item, expanded, onToggle, isNew, isAdmin, onSetStage, onCancel }) => {
    const isCancelled = item.stage === 'cancelado';
    return (
    <div className={`rounded-xl bg-slate-900/70 border transition-colors overflow-hidden ${
        isNew ? 'border-emerald-500/60 ring-1 ring-emerald-500/30' : isCancelled ? 'border-red-500/20 hover:border-red-500/40' : 'border-slate-800 hover:border-slate-700'
    }`}
        data-testid={`rw-row-${item.withdrawal_id}`} data-new={isNew ? 'true' : 'false'} data-stage={item.stage}>
        <button type="button" onClick={onToggle}
            className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-slate-800/40 transition-colors">
            <span className="text-xl leading-none flex-shrink-0">{item.country_flag}</span>
            <div className="flex-1 min-w-0">
                <p className="text-[13.5px] text-white font-semibold truncate flex items-center gap-2">
                    {item.name_full || item.name_public}
                    {isNew && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[8.5px] font-bold uppercase tracking-[0.1em] animate-pulse"
                            data-testid={`rw-new-badge-${item.withdrawal_id}`}>
                            Nuevo
                        </span>
                    )}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                    {item.country} · {timeAgo(item.date)} · <span className="font-mono">{item.reference}</span>
                </p>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 flex-shrink-0">
                <MessageCircleQuestion className="w-3.5 h-3.5" />
                <span data-testid={`rw-qcount-${item.withdrawal_id}`}>{item.questions_count}</span>
            </div>
            <div className="text-right flex-shrink-0">
                <p className="text-[14px] font-semibold font-mono tabular-nums text-white leading-tight">
                    {fmtMoney(item.amount, item.currency)} <span className="text-[10px] text-slate-500">{item.currency}</span>
                </p>
                <span className={`inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-[0.08em] ${STAGE_BADGE[item.stage]}`}
                    data-testid={`rw-stage-badge-${item.withdrawal_id}`}>
                    {STAGE_LABEL[item.stage]}
                </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence initial={false}>
            {expanded && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    className="overflow-hidden"
                >
                    <div className="px-4 pb-4 pt-1 border-t border-slate-800">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-3 text-[11px]">
                            <div>
                                <p className="text-slate-600 uppercase tracking-wider text-[9px] font-semibold">Referencia</p>
                                <p className="text-slate-300 font-mono mt-0.5">{item.reference}</p>
                            </div>
                            <div>
                                <p className="text-slate-600 uppercase tracking-wider text-[9px] font-semibold">Fecha y hora</p>
                                <p className="text-slate-300 mt-0.5">{fmtExact(item.date)}</p>
                            </div>
                            <div>
                                <p className="text-slate-600 uppercase tracking-wider text-[9px] font-semibold">Monto</p>
                                <p className="text-emerald-400 font-mono font-semibold mt-0.5">{fmtMoney(item.amount, item.currency)} {item.currency}</p>
                            </div>
                            <div>
                                <p className="text-slate-600 uppercase tracking-wider text-[9px] font-semibold">Preguntas</p>
                                <p className="text-slate-300 mt-0.5">{item.questions_count}</p>
                            </div>
                        </div>
                        <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500 font-semibold">Estado del retiro</p>
                        {isCancelled ? (
                            <div className="mt-2 rounded-lg bg-red-500/10 border border-red-500/25 p-3 text-[11px] space-y-1.5" data-testid={`rw-cancel-info-${item.withdrawal_id}`}>
                                <p className="flex items-center gap-1.5 text-red-300 font-semibold uppercase tracking-[0.08em] text-[10px]">
                                    <XCircle className="w-3.5 h-3.5" /> Solicitud cancelada
                                </p>
                                <p className="text-slate-400">Fecha y hora: <span className="text-slate-200">{fmtExact(item.cancelled_at)}</span></p>
                                <p className="text-slate-400">Cancelado por: <span className="text-slate-200">{item.cancelled_by || 'Administración'}</span></p>
                                <p className="text-slate-400">Motivo: <span className="text-slate-200">{item.cancellation_reason || '—'}</span></p>
                            </div>
                        ) : (
                            <StageBar stageIndex={item.stage_index} />
                        )}
                        {isAdmin && !isCancelled && (
                            <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid={`rw-admin-stage-${item.withdrawal_id}`}>
                                <span className="text-[9px] uppercase tracking-[0.12em] text-slate-500 font-semibold mr-1">Cambiar estado:</span>
                                {STAGES.map((s, i) => (
                                    <button key={s.key} type="button"
                                        onClick={() => onSetStage(item.withdrawal_id, s.key)}
                                        className={`px-2 py-1 rounded-md border text-[10px] font-semibold transition-colors ${
                                            item.stage === s.key
                                                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                                                : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-white hover:border-slate-600'
                                        }`}
                                        data-testid={`rw-set-stage-${s.key}-${item.withdrawal_id}`}>
                                        {i + 1}. {s.label}
                                    </button>
                                ))}
                                {CANCELLABLE.includes(item.stage) && (
                                    <button type="button" onClick={() => onCancel(item)}
                                        className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-semibold bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20 transition-colors"
                                        data-testid={`rw-cancel-btn-${item.withdrawal_id}`}>
                                        <XCircle className="w-3 h-3" /> Cancelar solicitud
                                    </button>
                                )}
                            </div>
                        )}
                        <WithdrawalHistoryTimeline history={item.history} withdrawalId={item.withdrawal_id} />
                        {item.questions_enabled ? (
                            <div className="mt-3 rounded-xl bg-white p-3">
                                <WithdrawalQuestions withdrawalId={item.withdrawal_id} />
                            </div>
                        ) : isCancelled ? null : (
                            <p className="mt-3 text-[11px] text-slate-500 flex items-center gap-1.5">
                                <MessageCircleQuestion className="w-3.5 h-3.5" />
                                Las preguntas estarán disponibles cuando el retiro esté completado.
                            </p>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    </div>
    );
};

export default function RecentWithdrawalsPage() {
    const [searchParams] = useSearchParams();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
    const targetWid = searchParams.get('withdrawal');
    const [items, setItems] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [newIds, setNewIds] = useState(() => new Set());
    const [simEnabled, setSimEnabled] = useState(null);
    const [soundOn, setSoundOn] = useState(() => localStorage.getItem('rw_sound') !== 'off');
    const [cancelTarget, setCancelTarget] = useState(null);
    const expandedRef = useRef(null);
    const knownIdsRef = useRef(null);
    const soundOnRef = useRef(soundOn);
    const hiddenCountRef = useRef(0);
    expandedRef.current = expandedId;
    soundOnRef.current = soundOn;

    const load = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const { data } = await api.get('/community/recent-withdrawals/detailed', { params: { limit: 60 } });
            const fresh = data.items || [];
            if (knownIdsRef.current) {
                const incoming = fresh.filter((i) => !knownIdsRef.current.has(i.withdrawal_id)).map((i) => i.withdrawal_id);
                if (incoming.length > 0) {
                    if (soundOnRef.current) playChime();
                    if (document.hidden) {
                        hiddenCountRef.current += incoming.length;
                        document.title = `(${hiddenCountRef.current}) Retiros nuevos · LIONSBIT`;
                    }
                    setNewIds((prev) => new Set([...prev, ...incoming]));
                    setTimeout(() => {
                        setNewIds((prev) => {
                            const next = new Set(prev);
                            incoming.forEach((id) => next.delete(id));
                            return next;
                        });
                    }, 12000);
                }
            }
            knownIdsRef.current = new Set(fresh.map((i) => i.withdrawal_id));
            setItems(fresh);
        } catch { if (!silent) setItems([]); } finally { if (!silent) setLoading(false); }
    };

    useEffect(() => {
        load();
        const iv = setInterval(() => {
            // Pausa mientras hay una tarjeta expandida para no mover el contenido
            if (!expandedRef.current) load(true);
        }, POLL_MS);
        const baseTitle = document.title;
        const onVisible = () => {
            if (!document.hidden) {
                hiddenCountRef.current = 0;
                document.title = baseTitle;
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(iv);
            document.removeEventListener('visibilitychange', onVisible);
            document.title = baseTitle;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggleSound = () => {
        const next = !soundOn;
        setSoundOn(next);
        localStorage.setItem('rw_sound', next ? 'on' : 'off');
        if (next) playChime();
    };

    useEffect(() => {
        if (isAdmin) {
            api.get('/admin/live-withdrawals-sim').then((r) => setSimEnabled(r.data.enabled)).catch(() => {});
        }
    }, [isAdmin]);

    const toggleSim = async () => {
        try {
            const { data } = await api.post('/admin/live-withdrawals-sim/toggle');
            setSimEnabled(data.enabled);
        } catch { /* silencioso */ }
    };

    const setStage = async (wid, stage) => {
        try {
            await api.post(`/admin/recent-withdrawals/${wid}/stage`, { stage });
            await reloadSilently();
        } catch { /* silencioso */ }
    };

    const reloadSilently = async () => {
        const { data } = await api.get('/community/recent-withdrawals/detailed', { params: { limit: 60 } });
        knownIdsRef.current = new Set((data.items || []).map((i) => i.withdrawal_id));
        setItems(data.items || []);
    };

    useEffect(() => {
        if (targetWid && items) {
            const found = items.find((i) => i.withdrawal_id === targetWid);
            if (found) setExpandedId(found.withdrawal_id);
        }
    }, [targetWid, items]);

    const filtered = useMemo(() => {
        let list = items || [];
        if (filter !== 'all') list = list.filter((i) => i.stage === filter);
        if (search.trim()) {
            const s = search.trim().toLowerCase();
            list = list.filter((i) =>
                i.name_public.toLowerCase().includes(s) ||
                i.country.toLowerCase().includes(s) ||
                (i.reference || '').toLowerCase().includes(s));
        }
        return list;
    }, [items, filter, search]);

    const completedCount = (items || []).filter((i) => i.stage === 'completado').length;

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-6" data-testid="recent-withdrawals-page">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
                            <Banknote className="w-6 h-6 text-emerald-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Retiros Recientes</h1>
                            <p className="text-sm text-slate-400 font-light">
                                {items ? `${items.length} retiros · ${completedCount} completados` : 'Actividad verificada de la comunidad'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-[10px] font-bold uppercase tracking-[0.14em]"
                            style={{ color: expandedId ? '#94a3b8' : '#10b981' }}
                            data-testid="rw-live-indicator" data-paused={expandedId ? 'true' : 'false'}>
                            <span className="relative flex w-1.5 h-1.5">
                                {!expandedId && (
                                    <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: '#10b981' }} />
                                )}
                                <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: expandedId ? '#64748b' : '#10b981' }} />
                            </span>
                            {expandedId ? 'En pausa' : 'En vivo · 15s'}
                        </div>
                        <button type="button" onClick={toggleSound}
                            className={`p-2.5 rounded-xl border transition-colors ${
                                soundOn
                                    ? 'bg-slate-900 border-slate-800 text-emerald-400 hover:text-emerald-300'
                                    : 'bg-slate-900 border-slate-800 text-slate-600 hover:text-slate-400'
                            }`}
                            title={soundOn ? 'Sonido de nuevos retiros: activado' : 'Sonido: silenciado'}
                            data-testid="rw-sound-toggle" data-sound={soundOn ? 'on' : 'off'}>
                            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                        </button>
                        {isAdmin && simEnabled !== null && (
                            <button type="button" onClick={toggleSim}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-[0.1em] transition-colors ${
                                    simEnabled
                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                                        : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                                }`}
                                title="Solo visible para administradores: genera retiros demo automáticamente"
                                data-testid="rw-sim-toggle">
                                <Zap className="w-3 h-3" />
                                {simEnabled ? 'Actividad auto: ON' : 'Actividad auto: OFF'}
                            </button>
                        )}
                        <button type="button" onClick={() => load()}
                            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
                            data-testid="rw-refresh-btn">
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {FILTERS.map((t) => (
                        <button key={t.key} onClick={() => setFilter(t.key)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                                filter === t.key ? 'bg-slate-800 border-slate-600 text-white' : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white'
                            }`} data-testid={`rw-filter-${t.key}`}>
                            {t.label}
                        </button>
                    ))}
                    <div className="relative flex-1 min-w-[180px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar por nombre, país o referencia..."
                            className="w-full h-9 pl-8 pr-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-slate-600"
                            data-testid="rw-search-input" />
                    </div>
                </div>

                {loading && !items ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /></div>
                ) : filtered.length === 0 ? (
                    <p className="text-slate-600 text-sm text-center py-16">No hay retiros que coincidan.</p>
                ) : (
                    <div className="space-y-2" data-testid="rw-list">
                        <AnimatePresence initial={false}>
                            {filtered.map((it) => (
                                <motion.div
                                    key={it.withdrawal_id}
                                    layout
                                    initial={{ opacity: 0, y: -24, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.98 }}
                                    transition={{ duration: 0.45, ease: 'easeOut' }}
                                >
                                    <WithdrawalRow item={it}
                                        isNew={newIds.has(it.withdrawal_id)}
                                        isAdmin={isAdmin}
                                        onSetStage={setStage}
                                        onCancel={setCancelTarget}
                                        expanded={expandedId === it.withdrawal_id}
                                        onToggle={() => setExpandedId((c) => (c === it.withdrawal_id ? null : it.withdrawal_id))} />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
                {isAdmin && (
                    <CancelWithdrawalDialog item={cancelTarget} open={!!cancelTarget}
                        onClose={() => setCancelTarget(null)}
                        onCancelled={() => reloadSilently().catch(() => {})} />
                )}
            </div>
        </Layout>
    );
}
