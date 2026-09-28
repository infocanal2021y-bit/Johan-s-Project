import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import {
    BadgeCheck, Loader2, RefreshCw, Clock, Pause, Play, Zap, Settings2, Users, ShieldCheck,
    X, Fingerprint, CalendarCheck, Receipt, History, CheckCircle2, ClipboardList,
} from 'lucide-react';

const POLL_MS = 15000;

const fmtEur = (n) => `€${(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const fmtDateTime = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

const EVENT_META = {
    authorized: { icon: ShieldCheck, color: '#10b981' },
    registered: { icon: ClipboardList, color: '#06b6d4' },
    payment_registered: { icon: Receipt, color: '#f59e0b' },
    updated: { icon: History, color: '#94a3b8' },
};


// ─── Progress ────────────────────────────────────────────────────
const ProgressIndicator = ({ count, total, pct }) => (
    <Card className="p-4 sm:p-5 bg-slate-900/60 border border-slate-800" data-testid="authorized-tx-progress">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
            <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#7CB1E5] font-bold">Indicador de progreso</p>
                <p className="text-white text-lg sm:text-xl font-bold mt-0.5 tabular-nums" data-testid="authorized-tx-progress-label">
                    {count} <span className="text-slate-500 font-normal">/ {total}</span> <span className="text-[13px] text-slate-300 font-semibold">usuarios incorporados</span>
                </p>
            </div>
            <p className="text-emerald-300 text-2xl font-bold font-mono tabular-nums" data-testid="authorized-tx-progress-pct">{pct}%</p>
        </div>
        <div className="h-3 rounded-full bg-slate-800 overflow-hidden ring-1 ring-slate-700/60" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
                className="h-full rounded-full bg-gradient-to-r from-[#1973B8] via-cyan-400 to-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.45)]"
                data-testid="authorized-tx-progress-bar"
            />
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-slate-500 font-mono">
            <span>0</span><span>{Math.round(total / 2)}</span><span>{total}</span>
        </div>
    </Card>
);


// ─── Timeline ────────────────────────────────────────────────────
const Timeline = ({ events, updatedAt }) => {
    const list = [...(events || []), { type: 'updated', label: 'Última actualización', at: updatedAt, note: 'Registro al día' }];
    return (
        <ol className="relative border-l-2 border-slate-800 ml-2 space-y-3.5" data-testid="authorized-tx-timeline">
            {list.map((ev, i) => {
                const meta = EVENT_META[ev.type] || EVENT_META.updated;
                const Icon = meta.icon;
                return (
                    <li key={`${ev.type}-${i}`} className="ml-4 pl-2" data-testid={`authorized-tx-event-${ev.type}`}>
                        <span className="absolute -left-3 w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-slate-950" style={{ background: meta.color + '25' }}>
                            <Icon className="w-3 h-3" style={{ color: meta.color }} />
                        </span>
                        <div className="flex items-center justify-between gap-2">
                            <p className="font-bold text-[12.5px]" style={{ color: meta.color }}>{ev.label}</p>
                            <span className="text-slate-400 text-[10.5px] font-mono whitespace-nowrap">{fmtDateTime(ev.at)}</span>
                        </div>
                        {ev.note && <p className="text-slate-400 text-[11px] mt-0.5">{ev.note}</p>}
                    </li>
                );
            })}
        </ol>
    );
};


// ─── Ficha individual ────────────────────────────────────────────
const Field = ({ label, value, mono, testid }) => (
    <div className="min-w-0">
        <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">{label}</p>
        <p className={`text-white text-[12.5px] mt-0.5 break-all ${mono ? 'font-mono' : 'font-semibold'}`} data-testid={testid}>{value ?? '—'}</p>
    </div>
);

const DetailModal = ({ tx, loading, onClose }) => (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm" onClick={onClose} data-testid="authorized-tx-detail-modal">
        <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 rounded-t-2xl sm:rounded-2xl ring-1 ring-[#1973B8]/40 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="px-5 py-4 border-b border-slate-800 bg-gradient-to-r from-[#072146] to-[#004481] flex items-start justify-between gap-3 sticky top-0">
                <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-[#7CB1E5] font-bold">Ficha individual</p>
                    <h3 className="text-white text-lg font-bold mt-0.5 truncate" data-testid="authorized-tx-detail-username">{tx?.username || '…'}</h3>
                    {tx && <StatusBadge label={tx.status_label} />}
                </div>
                <button onClick={onClose} className="text-slate-300 hover:text-white p-1 rounded-md hover:bg-white/10" data-testid="authorized-tx-detail-close"><X className="w-5 h-5" /></button>
            </div>

            {loading || !tx ? (
                <div className="text-center py-14 text-slate-400"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
            ) : (
                <div className="p-5 space-y-6">
                    <section>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-bold mb-3 flex items-center gap-1.5"><Fingerprint className="w-3.5 h-3.5" /> Información completa</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4">
                            <Field label="Nº consecutivo" value={`#${tx.sequence}`} mono />
                            <Field label="Usuario" value={tx.username} />
                            <Field label="Estado actual" value={tx.status_label} testid="authorized-tx-detail-status" />
                            <Field label="Monto autorizado" value={fmtEur(tx.authorized_amount)} mono />
                            <Field label="Monto abonado" value={fmtEur(tx.paid_amount)} mono />
                            <Field label="Moneda" value={tx.currency} mono />
                            <Field label="Fecha de incorporación" value={fmtDateTime(tx.published_at)} mono testid="authorized-tx-detail-published" />
                            <Field label="Referencia" value={tx.reference} mono />
                            <Field label="Última actualización" value={fmtDateTime(tx.updated_at)} mono />
                        </div>
                        <div className="mt-3 rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Identificador único (transacción)" value={tx.id} mono testid="authorized-tx-detail-id" />
                            <Field label="Identificador de usuario" value={tx.user_id} mono />
                        </div>
                    </section>

                    <section>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-bold mb-3 flex items-center gap-1.5"><CalendarCheck className="w-3.5 h-3.5" /> Timeline de la transacción</p>
                        <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 pl-5">
                            <Timeline events={tx.events} updatedAt={tx.updated_at} />
                        </div>
                    </section>

                    <section>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-bold mb-3 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Historial de cambios</p>
                        <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 divide-y divide-slate-800" data-testid="authorized-tx-detail-history">
                            {(tx.events || []).map((ev, i) => (
                                <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[11.5px]">
                                    <span className="text-slate-300"><span className="text-white font-semibold">{ev.label}</span> · {ev.note}</span>
                                    <span className="text-slate-500 font-mono whitespace-nowrap">{fmtDateTime(ev.at)}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-bold mb-3 flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5" /> Historial de abonos</p>
                        <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 overflow-x-auto">
                            <table className="w-full text-[12px]" data-testid="authorized-tx-detail-payments">
                                <thead>
                                    <tr className="text-[9.5px] uppercase tracking-[0.1em] text-slate-500 bg-slate-950/60">
                                        <th className="text-left px-4 py-2.5 font-bold">Referencia</th>
                                        <th className="text-left px-4 py-2.5 font-bold">Estado</th>
                                        <th className="text-left px-4 py-2.5 font-bold whitespace-nowrap">Fecha y hora</th>
                                        <th className="text-right px-4 py-2.5 font-bold">Importe</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(tx.payments || []).map(p => (
                                        <tr key={p.id} className="border-t border-slate-800">
                                            <td className="px-4 py-2.5 text-white font-mono">{p.reference}</td>
                                            <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1 text-emerald-300 text-[11px] font-bold"><CheckCircle2 className="w-3 h-3" /> {p.status_label}</span></td>
                                            <td className="px-4 py-2.5 text-slate-300 font-mono whitespace-nowrap">{fmtDateTime(p.at)}</td>
                                            <td className="px-4 py-2.5 text-right text-emerald-300 font-mono font-bold">{fmtEur(p.amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t border-slate-700 bg-slate-950/40">
                                        <td colSpan={3} className="px-4 py-2.5 text-[10px] uppercase tracking-wider text-slate-400 font-bold">Total abonado</td>
                                        <td className="px-4 py-2.5 text-right text-white font-mono font-bold">{fmtEur((tx.payments || []).reduce((a, p) => a + (p.amount || 0), 0))}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </section>
                </div>
            )}
        </motion.div>
    </div>
);

const StatusBadge = ({ label }) => (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px] font-bold uppercase tracking-[0.06em] whitespace-nowrap">
        <BadgeCheck className="w-3 h-3" /> {label}
    </span>
);


// ─── Admin controls (solo admin/superadmin) ─────────────────────
const AdminControls = ({ data, onChanged }) => {
    const cfg = data.config || {};
    const [busy, setBusy] = useState(false);
    const [batch, setBatch] = useState(cfg.batch_size || 3);
    const [hours, setHours] = useState(cfg.interval_hours || 24);

    useEffect(() => { setBatch(cfg.batch_size || 3); setHours(cfg.interval_hours || 24); }, [cfg.batch_size, cfg.interval_hours]);

    const run = async (fn, okMsg) => {
        setBusy(true);
        try { await fn(); toast.success(okMsg); onChanged(); }
        catch (err) { toast.error(err.response?.data?.detail || 'Operación no realizada'); }
        finally { setBusy(false); }
    };

    return (
        <Card className="p-4 bg-slate-900/60 border border-amber-500/20" data-testid="authorized-tx-admin-panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-amber-300 font-bold flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5" /> Administración · Programación</p>
                    <p className="text-slate-400 text-[11.5px] mt-1">
                        Estado: <span className={`font-bold ${cfg.paused ? 'text-amber-300' : 'text-emerald-300'}`} data-testid="authorized-tx-admin-state">{cfg.paused ? 'En pausa' : 'Activo'}</span>
                        {' · '}Próximo lote: <span className="text-white font-mono" data-testid="authorized-tx-admin-next">{data.completed ? 'Completado' : fmtDate(cfg.next_batch_at)}</span>
                        {' · '}Último: <span className="text-slate-300 font-mono">{fmtDate(cfg.last_batch_at)}</span>
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <label className="text-[11px] text-slate-400 flex items-center gap-1.5">Lote
                        <input type="number" min={1} max={10} value={batch} onChange={e => setBatch(Number(e.target.value))}
                            className="w-14 h-8 px-2 rounded-md bg-slate-950 border border-slate-700 text-white text-[12px]" data-testid="authorized-tx-batch-input" />
                    </label>
                    <label className="text-[11px] text-slate-400 flex items-center gap-1.5">Cada (h)
                        <input type="number" min={1} max={168} value={hours} onChange={e => setHours(Number(e.target.value))}
                            className="w-16 h-8 px-2 rounded-md bg-slate-950 border border-slate-700 text-white text-[12px]" data-testid="authorized-tx-hours-input" />
                    </label>
                    <Button size="sm" disabled={busy} variant="outline" className="h-8 border-slate-700 text-slate-200 hover:bg-slate-800"
                        onClick={() => run(() => api.put('/admin/authorized-transactions/config', { batch_size: batch, interval_hours: hours }), 'Configuración guardada')}
                        data-testid="authorized-tx-save-config">Guardar</Button>
                    <Button size="sm" disabled={busy} variant="outline" className="h-8 border-slate-700 text-slate-200 hover:bg-slate-800"
                        onClick={() => run(() => api.put('/admin/authorized-transactions/config', { paused: !cfg.paused }), cfg.paused ? 'Programación reanudada' : 'Programación en pausa')}
                        data-testid="authorized-tx-toggle-pause">
                        {cfg.paused ? <><Play className="w-3.5 h-3.5 mr-1" /> Reanudar</> : <><Pause className="w-3.5 h-3.5 mr-1" /> Pausar</>}
                    </Button>
                    <Button size="sm" disabled={busy || data.completed} className="h-8 bg-[#1973B8] hover:bg-[#1F89D8] text-white font-bold"
                        onClick={() => run(() => api.post('/admin/authorized-transactions/publish-now'), 'Lote incorporado')}
                        data-testid="authorized-tx-publish-now">
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Zap className="w-3.5 h-3.5 mr-1" /> Incorporar lote ahora</>}
                    </Button>
                </div>
            </div>
        </Card>
    );
};


// ─── Main page ───────────────────────────────────────────────────
const AuthorizedTransactionsPage = () => {
    const { isAdmin } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState(null);
    const prevCount = useRef(null);

    const openDetail = async (row) => {
        setDetail({ tx: null, loading: true });
        try {
            const r = await api.get(`/authorized-transactions/${row.id}`);
            setDetail({ tx: r.data, loading: false });
        } catch {
            toast.error('No se pudo cargar la ficha');
            setDetail(null);
        }
    };

    const load = useCallback(async (silent = false) => {
        try {
            const r = await api.get('/authorized-transactions');
            setData(r.data);
            if (prevCount.current !== null && r.data.count > prevCount.current) {
                toast.success(`${r.data.count - prevCount.current} nueva(s) transacción(es) autorizada(s) incorporada(s)`);
            }
            prevCount.current = r.data.count;
        } catch {
            if (!silent) toast.error('No se pudo cargar el listado');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const iv = setInterval(() => load(true), POLL_MS);
        return () => clearInterval(iv);
    }, [load]);

    const items = data?.items || [];
    const totals = data?.totals || { authorized: 0, paid: 0 };

    return (
        <Layout>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6" data-testid="authorized-tx-page">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-[10.5px] uppercase tracking-[0.14em] text-[#7CB1E5] font-bold">Principal · Operaciones</p>
                        <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1 flex items-center gap-2" data-testid="authorized-tx-title">
                            <ShieldCheck className="w-7 h-7 text-emerald-300" />
                            Transacciones autorizadas
                        </h1>
                        <p className="text-slate-400 text-[13px] mt-1.5">
                            Registro de transacciones autorizadas incorporadas automáticamente · actualización en tiempo real
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {data && !data.completed && (
                            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-slate-400 bg-white/5 border border-white/10 rounded-full px-3 py-1.5" data-testid="authorized-tx-next">
                                <Clock className="w-3.5 h-3.5 text-[#7CB1E5]" /> Próxima incorporación: <span className="text-white font-mono">{fmtDate(data.config?.next_batch_at)}</span>
                            </span>
                        )}
                        <Button onClick={() => load()} variant="outline" className="bg-white/5 border-white/15 text-white hover:bg-white/10" data-testid="authorized-tx-refresh">
                            <RefreshCw className="w-4 h-4 mr-1.5" /> Refrescar
                        </Button>
                    </div>
                </div>

                {isAdmin && data && <AdminControls data={data} onChanged={() => load(true)} />}

                {data && <ProgressIndicator count={data.count} total={data.total_planned} pct={data.progress_pct ?? Math.round(data.count * 100 / data.total_planned)} />}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Card className="p-4 bg-gradient-to-br from-[#072146] to-[#004481] border-0">
                        <p className="text-[9.5px] uppercase tracking-wider text-[#7CB1E5] font-bold flex items-center gap-1"><Users className="w-3 h-3" /> Incorporados</p>
                        <p className="text-white text-2xl font-bold mt-1 tabular-nums" data-testid="authorized-tx-count">{data?.count ?? 0}<span className="text-[#7CB1E5] text-sm font-normal"> / {data?.total_planned ?? 70}</span></p>
                    </Card>
                    <Card className="p-4 bg-white/5 border-white/10">
                        <p className="text-[9.5px] uppercase tracking-wider text-emerald-300 font-bold">Estado</p>
                        <p className="text-emerald-300 text-lg font-bold mt-1.5">{data?.completed ? 'Incorporación completada' : 'Incorporación en curso'}</p>
                    </Card>
                    <Card className="p-4 bg-white/5 border-white/10 col-span-2 sm:col-span-1">
                        <p className="text-[9.5px] uppercase tracking-wider text-slate-400 font-bold">Última incorporación</p>
                        <p className="text-white text-lg font-bold mt-1.5 font-mono">{fmtDate(items[items.length - 1]?.published_at)}</p>
                    </Card>
                </div>

                <Card className="bg-slate-900/60 border border-slate-800 overflow-hidden">
                    {loading ? (
                        <div className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
                    ) : items.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 text-[13px]" data-testid="authorized-tx-empty">Aún no hay transacciones autorizadas incorporadas.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12.5px]" data-testid="authorized-tx-table">
                                <thead>
                                    <tr className="bg-slate-950/60 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                                        <th className="text-left px-3 sm:px-4 py-3 font-bold w-12">#</th>
                                        <th className="text-left px-3 sm:px-4 py-3 font-bold whitespace-nowrap">Usuario</th>
                                        <th className="text-left px-3 sm:px-4 py-3 font-bold whitespace-nowrap">Estado</th>
                                        <th className="text-right px-3 sm:px-4 py-3 font-bold whitespace-nowrap">Monto autorizado</th>
                                        <th className="text-right px-3 sm:px-4 py-3 font-bold whitespace-nowrap">Monto abonado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((it, i) => (
                                        <motion.tr
                                            key={it.id}
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: Math.min(i, 20) * 0.02 }}
                                            className="border-t border-slate-800/80 hover:bg-slate-800/40 transition-colors cursor-pointer"
                                            onClick={() => openDetail(it)}
                                            title="Ver ficha individual"
                                            data-testid={`authorized-tx-row-${it.sequence}`}
                                        >
                                            <td className="px-3 sm:px-4 py-3 text-slate-500 font-mono tabular-nums">{it.sequence}</td>
                                            <td className="px-3 sm:px-4 py-3" data-testid={`authorized-tx-user-${it.sequence}`}>
                                                <p className="text-white font-semibold hover:text-[#7CB1E5] transition-colors">{it.username}</p>
                                                <p className="text-slate-500 text-[10px] font-mono mt-0.5 hidden sm:block">Últ. actualización {fmtDate(it.updated_at || it.published_at)}</p>
                                            </td>
                                            <td className="px-3 sm:px-4 py-3"><StatusBadge label={it.status_label} /></td>
                                            <td className="px-3 sm:px-4 py-3 text-right text-white font-mono font-semibold tabular-nums">{fmtEur(it.authorized_amount)}</td>
                                            <td className="px-3 sm:px-4 py-3 text-right text-emerald-300 font-mono font-semibold tabular-nums">{fmtEur(it.paid_amount)}</td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="authorized-tx-totals">
                    <Card className="p-5 bg-gradient-to-br from-[#072146] to-[#004481] border-0 flex items-center justify-between gap-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[#7CB1E5] font-bold">Total autorizado</p>
                        <p className="text-white text-xl sm:text-2xl font-bold font-mono tabular-nums" data-testid="authorized-tx-total-authorized">{fmtEur(totals.authorized)}</p>
                    </Card>
                    <Card className="p-5 bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-emerald-300 font-bold">Total abonado</p>
                        <p className="text-emerald-300 text-xl sm:text-2xl font-bold font-mono tabular-nums" data-testid="authorized-tx-total-paid">{fmtEur(totals.paid)}</p>
                    </Card>
                </div>
            </div>

            {detail && <DetailModal tx={detail.tx} loading={detail.loading} onClose={() => setDetail(null)} />}
        </Layout>
    );
};

export default AuthorizedTransactionsPage;
