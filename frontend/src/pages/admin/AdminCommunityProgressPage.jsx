import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
    ShieldCheck, Receipt, FileCheck, Truck, Trophy, Clock, Search,
    ArrowRight, Loader2, RotateCcw, CheckCircle2, Activity, Zap, Play, Calendar
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STAGES = [
    { key: 1, label: 'Verificación', icon: ShieldCheck },
    { key: 2, label: 'Impuesto',     icon: Receipt    },
    { key: 3, label: 'Revisión',     icon: FileCheck  },
    { key: 4, label: 'Transferencia', icon: Truck     },
    { key: 5, label: 'Retirado',     icon: Trophy     },
];

const STAGE_CLS = {
    1: 'border-amber-500/40 bg-amber-500/[0.06] text-amber-300',
    2: 'border-amber-500/40 bg-amber-500/[0.06] text-amber-300',
    3: 'border-amber-500/40 bg-amber-500/[0.06] text-amber-300',
    4: 'border-amber-500/40 bg-amber-500/[0.06] text-amber-300',
    5: 'border-emerald-500/40 bg-emerald-500/[0.06] text-emerald-300',
};

const AdminCommunityProgressPage = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [stepFilter, setStepFilter] = useState('all');  // 'all' | 1..5
    const [advancingId, setAdvancingId] = useState(null);

    // Auto-advance daily scheduler state
    const [autoAdvance, setAutoAdvance] = useState({ runs: [], pool: null });
    const [autoAdvanceLoading, setAutoAdvanceLoading] = useState(false);
    const [autoTriggering, setAutoTriggering] = useState(false);

    const fetchAutoAdvance = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const r = await fetch(`${API_URL}/api/admin/community/auto-advance/log?limit=10`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await r.json();
            setAutoAdvance({ runs: d.runs || [], pool: d.pool || null });
        } catch (e) { /* silent */ }
    }, []);

    const triggerAutoAdvance = async () => {
        setAutoTriggering(true);
        try {
            const token = localStorage.getItem('token');
            const r = await fetch(`${API_URL}/api/admin/community/auto-advance/run`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await r.json();
            if (d.status === 'ok' && d.count > 0) {
                toast.success(`${d.count} cuenta(s) avanzadas a Retirado`);
            } else if (d.status === 'ok_empty') {
                toast.info('Pool agotado · no quedan cuentas en proceso');
            } else {
                toast.info('Sin cambios');
            }
            await Promise.all([fetchAutoAdvance(), fetchQueue()]);
        } catch (e) {
            toast.error('Error al ejecutar el avance automático');
        } finally {
            setAutoTriggering(false);
        }
    };

    const fetchQueue = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const r = await fetch(`${API_URL}/api/admin/community/progress-queue`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await r.json();
            setItems(d.items || []);
        } catch (e) { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        fetchQueue();
        const id = setInterval(fetchQueue, 30000);
        return () => clearInterval(id);
    }, [fetchQueue]);

    useEffect(() => {
        fetchAutoAdvance();
        const id = setInterval(fetchAutoAdvance, 60000);
        return () => clearInterval(id);
    }, [fetchAutoAdvance]);

    const advance = async (userId, currentStep) => {
        setAdvancingId(userId);
        try {
            const token = localStorage.getItem('token');
            const r = await fetch(`${API_URL}/api/admin/community/advance/${userId}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await r.json();
            if (r.ok) {
                toast.success(`Avanzado a etapa ${d.new_step}/5 · ${d.label}`);
                setItems(prev => prev.map(it => it.id === userId ? { ...it, step: d.new_step, step_label: d.label, has_override: true } : it));
            } else {
                toast.error(d.detail || 'Error');
            }
        } catch (e) { toast.error('Error de red'); }
        finally { setAdvancingId(null); }
    };

    const reset = async (userId) => {
        try {
            const token = localStorage.getItem('token');
            const r = await fetch(`${API_URL}/api/admin/community/reset/${userId}`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}` },
            });
            if (r.ok) { toast.success('Override eliminado'); fetchQueue(); }
            else toast.error('Error');
        } catch (e) { toast.error('Error'); }
    };

    const filtered = useMemo(() => {
        let out = items;
        if (stepFilter !== 'all') out = out.filter(x => x.step === Number(stepFilter));
        if (search.trim()) {
            const q = search.toLowerCase().trim();
            out = out.filter(x => x.name.toLowerCase().includes(q) || x.country.toLowerCase().includes(q));
        }
        return out;
    }, [items, search, stepFilter]);

    const counts = useMemo(() => {
        const c = { all: items.length, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        items.forEach(x => { c[x.step] = (c[x.step] || 0) + 1; });
        return c;
    }, [items]);

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-5 pb-12" data-testid="admin-community-progress-page">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden">
                        <div className="h-0.5 bg-gradient-to-r from-amber-500 via-emerald-500 to-transparent" />
                        <div className="px-6 py-5">
                            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500 mb-2">
                                <Activity className="w-3 h-3" />
                                Panel administrativo · Comunidad
                            </div>
                            <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                                Avance manual de etapas
                            </h1>
                            <p className="text-slate-400 mt-1.5 max-w-2xl text-[13px] leading-relaxed">
                                Aprueba manualmente la siguiente etapa para cada cuenta. El usuario verá el avance en tiempo real
                                en su panel de comunidad y recibirá una notificación in-app por cada confirmación.
                            </p>
                        </div>
                        {/* Stage breakdown row */}
                        <div className="grid grid-cols-2 md:grid-cols-5 border-t border-slate-800/80 divide-x divide-slate-800/80">
                            {STAGES.map(s => {
                                const Icon = s.icon;
                                const isFinal = s.key === 5;
                                return (
                                    <button
                                        key={s.key}
                                        type="button"
                                        onClick={() => setStepFilter(stepFilter === String(s.key) ? 'all' : String(s.key))}
                                        data-testid={`progress-filter-${s.key}`}
                                        className={`px-4 py-4 text-left transition-colors hover:bg-slate-800/30 ${stepFilter === String(s.key) ? 'bg-slate-800/50' : ''}`}
                                    >
                                        <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.12em] text-slate-500">
                                            <Icon className={`w-3 h-3 ${isFinal ? 'text-emerald-400' : 'text-amber-400'}`} />
                                            {s.label}
                                        </div>
                                        <p className={`text-lg font-semibold font-mono tabular-nums mt-1 ${isFinal ? 'text-emerald-300' : 'text-amber-300'}`}>
                                            {(counts[s.key] || 0).toLocaleString('es-ES')}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </motion.div>

                {/* Daily auto-advance scheduler panel */}
                <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="rounded-lg border border-cyan-500/30 bg-gradient-to-br from-cyan-500/[0.04] to-emerald-500/[0.03] overflow-hidden"
                    data-testid="auto-advance-panel"
                >
                    <div className="h-0.5 bg-gradient-to-r from-cyan-500 via-emerald-500 to-transparent" />
                    <div className="px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
                                <Zap className="w-4 h-4 text-cyan-300" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-cyan-300/80 mb-1">
                                    <Calendar className="w-3 h-3" />
                                    Avance automático diario
                                </div>
                                <p className="text-sm font-semibold text-white">
                                    {autoAdvance.pool?.daily_count ?? 2} cuenta{(autoAdvance.pool?.daily_count ?? 2) === 1 ? '' : 's'} promovida{(autoAdvance.pool?.daily_count ?? 2) === 1 ? '' : 's'} cada día a Retirado
                                </p>
                                <p className="text-[12px] text-slate-400 mt-0.5 leading-relaxed">
                                    El sistema verifica y completa automáticamente {autoAdvance.pool?.daily_count ?? 2} sesiones diarias del pool en proceso, simulando el flujo orgánico de aprobación.
                                </p>
                            </div>
                        </div>
                        <Button
                            onClick={triggerAutoAdvance}
                            disabled={autoTriggering}
                            className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs h-9 px-4 flex-shrink-0"
                            data-testid="auto-advance-trigger-btn"
                        >
                            {autoTriggering ? (
                                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Procesando…</>
                            ) : (
                                <><Play className="w-3.5 h-3.5 mr-1.5" /> Ejecutar ahora</>
                            )}
                        </Button>
                    </div>
                    {/* Pool status row */}
                    {autoAdvance.pool && (
                        <div className="grid grid-cols-2 md:grid-cols-4 border-t border-slate-800/80 divide-x divide-slate-800/80" data-testid="auto-advance-pool">
                            <div className="px-4 py-3">
                                <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">Pool total</p>
                                <p className="text-base font-semibold font-mono tabular-nums text-slate-200 mt-0.5">{autoAdvance.pool.pool_total}</p>
                            </div>
                            <div className="px-4 py-3">
                                <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">En proceso</p>
                                <p className="text-base font-semibold font-mono tabular-nums text-amber-300 mt-0.5">{autoAdvance.pool.in_process_remaining}</p>
                            </div>
                            <div className="px-4 py-3">
                                <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">Completados</p>
                                <p className="text-base font-semibold font-mono tabular-nums text-emerald-300 mt-0.5">{autoAdvance.pool.completed_so_far}</p>
                            </div>
                            <div className="px-4 py-3">
                                <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">Días restantes</p>
                                <p className="text-base font-semibold font-mono tabular-nums text-cyan-300 mt-0.5">{autoAdvance.pool.days_remaining}</p>
                            </div>
                        </div>
                    )}
                    {/* Recent runs */}
                    {autoAdvance.runs.length > 0 && (
                        <div className="border-t border-slate-800/80 px-5 py-3" data-testid="auto-advance-runs">
                            <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500 mb-2">Últimas ejecuciones</p>
                            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                                {autoAdvance.runs.map(run => (
                                    <div key={run.id || run.date} className="flex items-center justify-between gap-3 text-xs py-1.5 border-b border-slate-800/40 last:border-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${run.count > 0 ? 'text-emerald-400' : 'text-slate-600'}`} />
                                            <span className="font-mono tabular-nums text-slate-300 text-[11px]">{run.date}</span>
                                            <span className="text-slate-500 text-[10px] truncate">
                                                {run.advanced && run.advanced.length > 0
                                                    ? run.advanced.map(a => a.name).join(' · ')
                                                    : (run.note === 'no_candidates_available' ? 'pool agotado' : 'sin cambios')}
                                            </span>
                                        </div>
                                        <span className={`font-mono tabular-nums text-[11px] flex-shrink-0 ${run.count > 0 ? 'text-emerald-300' : 'text-slate-500'}`}>
                                            +{run.count}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </motion.div>

                {/* Search + filter chips */}
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <Input
                            placeholder="Buscar por nombre o país..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-10 bg-slate-950 border-slate-800 text-white text-sm h-10"
                            data-testid="progress-search"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setStepFilter('all')}
                            className={`inline-flex items-center gap-2 px-3 h-7 rounded-md text-[11px] font-medium border transition-colors border-slate-700 text-slate-300 bg-slate-800/50 ${stepFilter === 'all' ? 'ring-1 ring-emerald-400/70' : 'opacity-70 hover:opacity-100'}`}
                            data-testid="progress-filter-all"
                        >
                            Todos <span className="font-mono tabular-nums text-[10px] text-slate-400">{counts.all}</span>
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-800 bg-slate-900/60">
                                    <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">Usuario</th>
                                    <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">País</th>
                                    <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">Etapa actual</th>
                                    <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">Override</th>
                                    <th className="px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-wider text-slate-500">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                <AnimatePresence>
                                    {loading ? (
                                        <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500 text-xs">Cargando...</td></tr>
                                    ) : filtered.length === 0 ? (
                                        <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500 text-xs">Sin usuarios coincidentes.</td></tr>
                                    ) : filtered.map(u => {
                                        const isFinal = u.step === 5;
                                        const Icon = STAGES[u.step - 1]?.icon || Clock;
                                        return (
                                            <motion.tr
                                                key={u.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                data-testid={`progress-row-${u.id}`}
                                                className="hover:bg-slate-800/30"
                                            >
                                                <td className="px-4 py-2.5">
                                                    <p className="text-slate-100 font-medium text-[13px]">{u.name}</p>
                                                    <p className="text-[10px] font-mono text-slate-500 mt-0.5">LB-{u.id.slice(0, 8).toUpperCase()}</p>
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-300 text-[13px]">
                                                    <span className="mr-1.5">{u.country_flag}</span>{u.country}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium tracking-wide border ${STAGE_CLS[u.step]}`}>
                                                        <Icon className="w-3 h-3" />
                                                        {u.step}/5 · {u.step_label}
                                                        {!isFinal && <Clock className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: '4s' }} />}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2.5 text-[10px]">
                                                    {u.has_override ? (
                                                        <span className="text-emerald-400/80 uppercase tracking-widest">Manual</span>
                                                    ) : (
                                                        <span className="text-slate-600 uppercase tracking-widest">Auto</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {u.has_override && (
                                                            <button
                                                                type="button"
                                                                onClick={() => reset(u.id)}
                                                                title="Quitar override"
                                                                data-testid={`progress-reset-${u.id}`}
                                                                className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors"
                                                            >
                                                                <RotateCcw className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                        <Button
                                                            size="sm"
                                                            onClick={() => advance(u.id, u.step)}
                                                            disabled={isFinal || advancingId === u.id}
                                                            data-testid={`progress-advance-${u.id}`}
                                                            className={`h-7 text-[11px] font-medium ${
                                                                isFinal
                                                                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/15 cursor-default'
                                                                    : 'bg-amber-500 hover:bg-amber-600 text-slate-900'
                                                            }`}
                                                        >
                                                            {advancingId === u.id ? (
                                                                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                                            ) : isFinal ? (
                                                                <CheckCircle2 className="w-3 h-3 mr-1.5" />
                                                            ) : (
                                                                <ArrowRight className="w-3 h-3 mr-1.5" />
                                                            )}
                                                            {isFinal ? 'Completado' : `Aprobar ${STAGES[u.step]?.label || ''}`}
                                                        </Button>
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default AdminCommunityProgressPage;
