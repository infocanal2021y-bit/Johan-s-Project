import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { Checkbox } from '../../components/ui/checkbox';
import {
    Activity, Users, ArrowDown, Clock, AlertTriangle, BellRing, MapPin,
    Loader2, RefreshCw, TrendingDown, CheckCircle, Filter, Mail, Send, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { safeApiCall } from '../../lib/diagnostics';

const STAGE_COLORS = {
    registered:         'from-slate-600 to-slate-500',
    dashboard_entered:  'from-sky-700 to-sky-500',
    balance_viewed:     'from-cyan-700 to-cyan-500',
    withdraw_initiated: 'from-indigo-700 to-indigo-500',
    kyc_reached:        'from-violet-700 to-violet-500',
    proof_uploaded:     'from-amber-600 to-amber-400',
    pending_review:     'from-orange-600 to-orange-400',
    completed:          'from-emerald-700 to-emerald-500',
};

const STATUS_OPTIONS = [
    { value: 'all', label: 'Todos los estados' },
    { value: 'completed', label: 'Completado' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'under_review', label: 'En revisión' },
    { value: 'in_transfer', label: 'En transferencia' },
    { value: 'approved', label: 'Aprobado' },
    { value: 'rejected', label: 'Rechazado' },
];

const METHOD_OPTIONS = [
    { value: 'all', label: 'Todos los métodos' },
    { value: 'crypto', label: 'Crypto' },
    { value: 'bank', label: 'Transferencia bancaria' },
    { value: 'mt5', label: 'MT5 Invest' },
    { value: 'partial-unlock', label: 'Desbloqueo 40%' },
];

const fmtHours = (h) => {
    if (h === null || h === undefined) return '—';
    if (h < 1) return `${Math.round(h * 60)} min`;
    if (h < 48) return `${h.toFixed(1)} h`;
    return `${(h / 24).toFixed(1)} días`;
};

const fmtDateTime = (iso) => {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
};

// Pre-built templates by stage. The placeholders {name}, {hours}, {hours_short}
// are interpolated when the modal opens.
const NUDGE_TEMPLATES = {
    pending_review: {
        title: 'Tu retiro está siendo revisado',
        message:
            'Hola {name},\n\n' +
            'Vemos que tu solicitud de retiro está pendiente de revisión desde hace {hours_short}. ' +
            'Nuestro equipo de cumplimiento la está procesando y muy pronto recibirás novedades.\n\n' +
            'Si tienes alguna duda o información adicional para acelerar el proceso, ' +
            'responde a este mensaje o contáctanos en info@paylionsbit.es.\n\n' +
            'Gracias por tu paciencia.\n\nEquipo LIONSBIT',
    },
    withdraw_initiated: {
        title: 'Falta un paso para completar tu retiro',
        message:
            'Hola {name},\n\n' +
            'Notamos que iniciaste un retiro hace {hours_short} pero todavía no hemos recibido tu comprobante. ' +
            'Para procesarlo necesitamos que subas el justificante de pago correspondiente.\n\n' +
            'Ingresa a tu panel y completa el último paso. Si tienes problemas con la subida, ' +
            'escríbenos a info@paylionsbit.es y te ayudamos al instante.\n\n' +
            'Equipo LIONSBIT',
    },
};

const _interp = (text, row) => {
    const hours = row?.hours_in_stage ?? 0;
    const hours_short = hours < 24
        ? `${Math.round(hours)} horas`
        : `${(hours / 24).toFixed(1)} días`;
    return (text || '')
        .replace(/\{name\}/g, (row?.name || 'cliente').split(' ')[0])
        .replace(/\{hours_short\}/g, hours_short)
        .replace(/\{hours\}/g, String(Math.round(hours)));
};

const NudgeModal = ({ row, onClose, onSent }) => {
    const tpl = NUDGE_TEMPLATES[row?.stage] || NUDGE_TEMPLATES.withdraw_initiated;
    const [title, setTitle] = useState(_interp(tpl.title, row));
    const [message, setMessage] = useState(_interp(tpl.message, row));
    const [sendInApp, setSendInApp] = useState(true);
    const [sendEmail, setSendEmail] = useState(true);
    const [sending, setSending] = useState(false);

    const doSend = async () => {
        if (!title.trim() || !message.trim()) {
            toast.error('Título y mensaje son obligatorios');
            return;
        }
        if (!sendInApp && !sendEmail) {
            toast.error('Selecciona al menos un canal');
            return;
        }
        setSending(true);
        const result = await safeApiCall({
            url: '/api/admin/broadcast',
            method: 'POST',
            body: {
                title: title.trim(),
                message: message.trim(),
                send_in_app: sendInApp,
                send_email: sendEmail,
                audience: 'single',
                target_user_id: row.user_id,
            },
            timeoutMs: 20000,
        });
        setSending(false);
        if (result.ok) {
            toast.success(`Nudge enviado a ${row.name || row.email}`);
            onSent && onSent(row);
            onClose();
        } else {
            toast.error(result.message, { description: `[HTTP ${result.status}]`, duration: 6000 });
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                data-testid="nudge-modal"
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 8 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 8 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-slate-900 border border-amber-500/30 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl shadow-amber-500/10"
                >
                    <div className="px-5 py-4 border-b border-slate-800 bg-gradient-to-r from-amber-500/5 to-transparent flex items-center justify-between">
                        <div className="min-w-0">
                            <h3 className="text-white font-bold text-base flex items-center gap-2">
                                <Send className="w-4 h-4 text-amber-400" /> Enviar nudge a {row.name || 'usuario'}
                            </h3>
                            <p className="text-slate-500 text-xs truncate mt-0.5">{row.email} · {row.stage} · {Math.round(row.hours_in_stage)}h</p>
                        </div>
                        <button onClick={onClose} className="text-slate-500 hover:text-white p-1 rounded hover:bg-slate-800" data-testid="nudge-close-btn">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="p-5 space-y-3">
                        <div>
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block mb-1">Título</label>
                            <Input
                                value={title}
                                onChange={(e) => setTitle(e.target.value.slice(0, 200))}
                                className="bg-slate-950 border-slate-700 text-white"
                                data-testid="nudge-title-input"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block mb-1">Mensaje</label>
                            <Textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value.slice(0, 5000))}
                                rows={9}
                                className="bg-slate-950 border-slate-700 text-white text-sm resize-none"
                                data-testid="nudge-message-input"
                            />
                            <p className="text-[10px] text-slate-600 mt-1 text-right tabular-nums">{message.length}/5000</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 pt-1">
                            <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-sm" data-testid="nudge-channel-inapp">
                                <Checkbox checked={sendInApp} onCheckedChange={setSendInApp} />
                                <span>Notificación in-app</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-sm" data-testid="nudge-channel-email">
                                <Checkbox checked={sendEmail} onCheckedChange={setSendEmail} />
                                <span>Email</span>
                            </label>
                        </div>
                    </div>

                    <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/40 flex items-center justify-end gap-2">
                        <Button variant="outline" onClick={onClose} disabled={sending} className="border-slate-700 hover:bg-slate-800">Cancelar</Button>
                        <Button onClick={doSend} disabled={sending} className="bg-amber-600 hover:bg-amber-700 text-white" data-testid="nudge-send-btn">
                            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                            Enviar nudge
                        </Button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

const FunnelBar = ({ stage, max, isBiggestDrop }) => {
    const widthPct = max > 0 ? Math.max(2, (stage.count / max) * 100) : 0;
    return (
        <div className="space-y-1" data-testid={`funnel-stage-${stage.key}`}>
            <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">{stage.label}</span>
                <div className="flex items-center gap-3">
                    {stage.dropoff_pct_from_prev !== null && stage.dropoff_pct_from_prev !== undefined && (
                        <span className={`tabular-nums font-bold ${
                            stage.dropoff_pct_from_prev > 60 ? 'text-rose-400'
                                : stage.dropoff_pct_from_prev > 30 ? 'text-amber-400'
                                : 'text-slate-400'
                        }`}>
                            ↓ {stage.dropoff_pct_from_prev}%
                        </span>
                    )}
                    <span className="text-white font-bold tabular-nums">{stage.count.toLocaleString('es-ES')}</span>
                </div>
            </div>
            <div className="relative h-7 bg-slate-900/60 rounded overflow-hidden border border-slate-800">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${widthPct}%` }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    className={`absolute inset-y-0 left-0 bg-gradient-to-r ${STAGE_COLORS[stage.key] || 'from-slate-600 to-slate-500'} ${isBiggestDrop ? 'ring-1 ring-rose-400/60' : ''}`}
                />
                {isBiggestDrop && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold uppercase tracking-wider text-rose-300 bg-rose-500/20 px-1.5 py-0.5 rounded">
                        Mayor fuga
                    </span>
                )}
            </div>
        </div>
    );
};

const StageGapCard = ({ icon: Icon, label, value, color = 'text-amber-300' }) => (
    <div className="bg-slate-900/60 rounded-lg border border-slate-800 p-3 flex items-center gap-3">
        <Icon className={`w-5 h-5 ${color} flex-shrink-0`} />
        <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold truncate">{label}</p>
            <p className={`${color} font-bold text-base tabular-nums`}>{fmtHours(value)}</p>
        </div>
    </div>
);

const UserRow = ({ row, accent = 'amber', onNudge, nudgedIds }) => {
    const accentMap = {
        amber: { dot: 'bg-amber-400', text: 'text-amber-300' },
        rose: { dot: 'bg-rose-400', text: 'text-rose-300' },
    };
    const c = accentMap[accent];
    const alreadyNudged = nudgedIds?.has(`${row.user_id}-${row.stage}`);
    return (
        <div className="p-3 hover:bg-slate-900/40 flex items-center gap-3 border-b border-slate-800/60 last:border-0" data-testid={`journey-user-row-${row.user_id}`}>
            <span className={`w-2 h-2 rounded-full ${c.dot} flex-shrink-0`} />
            <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{row.name || '—'}</p>
                <p className="text-slate-500 text-xs truncate">{row.email}</p>
            </div>
            <div className="text-right hidden lg:block">
                <p className="text-slate-400 text-xs">{row.country || '—'}</p>
                <p className={`${c.text} text-[10px] font-bold uppercase tracking-wider`}>{row.stage}</p>
            </div>
            <div className="text-right flex-shrink-0">
                <p className={`${c.text} text-sm font-bold tabular-nums`}>{fmtHours(row.hours_in_stage)}</p>
                <p className="text-slate-600 text-[10px]">en esta etapa</p>
            </div>
            <button
                type="button"
                onClick={() => onNudge && onNudge(row)}
                disabled={alreadyNudged}
                className={`flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                    alreadyNudged
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 cursor-default'
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
                }`}
                data-testid={`nudge-btn-${row.user_id}`}
                aria-label={alreadyNudged ? 'Nudge enviado' : 'Enviar nudge'}
            >
                {alreadyNudged ? (
                    <><CheckCircle className="w-3 h-3" /> Enviado</>
                ) : (
                    <><Send className="w-3 h-3" /> Nudge</>
                )}
            </button>
        </div>
    );
};

export const AdminJourneyAnalyticsPage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [country, setCountry] = useState('all');
    const [method, setMethod] = useState('all');
    const [status, setStatus] = useState('all');
    const [days, setDays] = useState(30);
    const [nudgeTarget, setNudgeTarget] = useState(null);
    const [nudgedIds, setNudgedIds] = useState(() => new Set());

    const fetchData = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (country !== 'all') params.set('country', country);
        if (method !== 'all') params.set('method', method);
        if (status !== 'all') params.set('status', status);
        params.set('days', String(days));
        const result = await safeApiCall({
            url: `/api/admin/journey-analytics?${params.toString()}`,
            method: 'GET',
            timeoutMs: 30000,
        });
        setLoading(false);
        if (result.ok) {
            setData(result.data);
        } else {
            toast.error(result.message, { description: `[HTTP ${result.status}]`, duration: 6000 });
        }
    }, [country, method, status, days]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const biggestDropKey = useMemo(() => {
        if (!data?.stages) return null;
        let max = -1, key = null;
        data.stages.forEach((s) => {
            const v = s.dropoff_pct_from_prev;
            if (v !== null && v !== undefined && v > max) { max = v; key = s.key; }
        });
        return max > 30 ? key : null;
    }, [data]);

    const countryOptions = useMemo(() => {
        if (!data?.by_country) return [];
        return data.by_country.map((c) => c.country).filter(Boolean);
    }, [data]);

    const stages = data?.stages || [];
    const maxStage = stages.length ? stages[0].count : 0;

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-5" data-testid="admin-journey-analytics-page">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl sm:text-3xl text-white font-bold tracking-tight flex items-center gap-2">
                            <Activity className="w-7 h-7 text-amber-400" />
                            Journey Analytics · Retiros
                        </h1>
                        <p className="text-slate-500 mt-1 text-sm">
                            Funnel completo del retiro · {data?.total_users?.toLocaleString('es-ES') ?? '...'} usuarios analizados · ventana {days} días
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                            <CheckCircle className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-300 text-[11px] font-bold uppercase tracking-wider">
                                Conv. global {data?.overall_conversion_pct ?? 0}%
                            </span>
                        </div>
                        <Button onClick={fetchData} variant="outline" className="border-slate-700 hover:bg-slate-800" data-testid="journey-refresh-btn">
                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refrescar
                        </Button>
                    </div>
                </motion.div>

                {/* Filters */}
                <Card className="bg-slate-900/70 border-slate-800">
                    <CardContent className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block flex items-center gap-1"><MapPin className="w-3 h-3" /> País</label>
                            <Select value={country} onValueChange={setCountry}>
                                <SelectTrigger className="bg-slate-950 border-slate-800 text-white" data-testid="journey-filter-country"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700 max-h-72">
                                    <SelectItem value="all">Todos los países</SelectItem>
                                    {countryOptions.map((c) => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">Método</label>
                            <Select value={method} onValueChange={setMethod}>
                                <SelectTrigger className="bg-slate-950 border-slate-800 text-white" data-testid="journey-filter-method"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700">
                                    {METHOD_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">Estado del retiro</label>
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger className="bg-slate-950 border-slate-800 text-white" data-testid="journey-filter-status"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700">
                                    {STATUS_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">Ventana</label>
                            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                                <SelectTrigger className="bg-slate-950 border-slate-800 text-white" data-testid="journey-filter-days"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700">
                                    <SelectItem value="7">7 días</SelectItem>
                                    <SelectItem value="30">30 días</SelectItem>
                                    <SelectItem value="90">90 días</SelectItem>
                                    <SelectItem value="180">180 días</SelectItem>
                                    <SelectItem value="365">1 año</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* Main funnel chart */}
                <Card className="bg-slate-900/70 border-slate-800">
                    <CardHeader className="border-b border-slate-800 pb-3">
                        <CardTitle className="text-white text-base font-bold flex items-center gap-2">
                            <TrendingDown className="w-5 h-5 text-amber-400" />
                            Funnel de Retiro
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5">
                        {loading && !data ? (
                            <div className="py-16 flex items-center justify-center">
                                <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
                            </div>
                        ) : (
                            <div className="space-y-4" data-testid="funnel-chart">
                                {stages.map((s) => (
                                    <FunnelBar key={s.key} stage={s} max={maxStage} isBiggestDrop={s.key === biggestDropKey} />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Avg time between stages */}
                <Card className="bg-slate-900/70 border-slate-800">
                    <CardHeader className="border-b border-slate-800 pb-3">
                        <CardTitle className="text-white text-base font-bold flex items-center gap-2">
                            <Clock className="w-5 h-5 text-violet-400" />
                            Tiempo promedio entre etapas
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <StageGapCard icon={Users} label="Registro → 1er login" value={data?.avg_hours_between?.registered_to_first_login} color="text-sky-300" />
                        <StageGapCard icon={ArrowDown} label="Dashboard → Retiro" value={data?.avg_hours_between?.dashboard_to_withdraw} color="text-cyan-300" />
                        <StageGapCard icon={ArrowDown} label="Retiro → Comprobante" value={data?.avg_hours_between?.withdraw_to_proof} color="text-amber-300" />
                        <StageGapCard icon={CheckCircle} label="Comprobante → Completado" value={data?.avg_hours_between?.proof_to_completed} color="text-emerald-300" />
                    </CardContent>
                </Card>

                {/* Two tables: stuck + followup */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <Card className="bg-slate-900/70 border-rose-500/20">
                        <CardHeader className="border-b border-slate-800 pb-3">
                            <CardTitle className="text-white text-base font-bold flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-rose-400" />
                                Usuarios atascados <span className="text-rose-300 text-xs font-normal">(&gt; 72h sin progreso)</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0" data-testid="stuck-users-table">
                            {(data?.stuck_users || []).length === 0 ? (
                                <p className="p-6 text-center text-slate-500 text-sm">Sin usuarios atascados en esta ventana. 🎉</p>
                            ) : (
                                <div className="max-h-[400px] overflow-y-auto">
                                    {data.stuck_users.map((r) => (<UserRow key={`${r.user_id}-${r.stage}`} row={r} accent="rose" onNudge={setNudgeTarget} nudgedIds={nudgedIds} />))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/70 border-amber-500/20">
                        <CardHeader className="border-b border-slate-800 pb-3">
                            <CardTitle className="text-white text-base font-bold flex items-center gap-2">
                                <BellRing className="w-5 h-5 text-amber-400" />
                                Listos para seguimiento <span className="text-amber-300 text-xs font-normal">(24-72h)</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0" data-testid="followup-users-table">
                            {(data?.followup_users || []).length === 0 ? (
                                <p className="p-6 text-center text-slate-500 text-sm">Sin candidatos para nudge en este momento.</p>
                            ) : (
                                <div className="max-h-[400px] overflow-y-auto">
                                    {data.followup_users.map((r) => (<UserRow key={`${r.user_id}-${r.stage}`} row={r} accent="amber" onNudge={setNudgeTarget} nudgedIds={nudgedIds} />))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Country + method breakdowns + recent active */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <Card className="bg-slate-900/70 border-slate-800">
                        <CardHeader className="border-b border-slate-800 pb-3">
                            <CardTitle className="text-white text-sm font-bold flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-sky-400" /> Por país (top 10)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 space-y-1.5" data-testid="by-country-table">
                            {(data?.by_country || []).slice(0, 10).map((c) => (
                                <div key={c.country} className="flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-slate-800/40">
                                    <span className="text-slate-300 truncate flex-1">{c.country}</span>
                                    <span className="text-slate-500 tabular-nums w-12 text-right">{c.total}</span>
                                    <span className="text-emerald-400 font-semibold tabular-nums w-12 text-right">{c.completed}</span>
                                </div>
                            ))}
                            <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-slate-600 px-2 pt-2 border-t border-slate-800">
                                <span>País</span><span>Total</span><span>OK</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/70 border-slate-800">
                        <CardHeader className="border-b border-slate-800 pb-3">
                            <CardTitle className="text-white text-sm font-bold flex items-center gap-2">
                                <Filter className="w-4 h-4 text-violet-400" /> Por método de pago
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 space-y-1.5" data-testid="by-method-table">
                            {(data?.by_method || []).map((m) => (
                                <div key={m.method} className="flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-slate-800/40">
                                    <span className="text-slate-300 capitalize truncate flex-1">{m.method.replace('-', ' ')}</span>
                                    <span className="text-slate-500 tabular-nums w-10 text-right">{m.users}</span>
                                    <span className="text-emerald-400 font-semibold tabular-nums w-12 text-right">{m.completion_pct}%</span>
                                </div>
                            ))}
                            <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-slate-600 px-2 pt-2 border-t border-slate-800">
                                <span>Método</span><span>Users</span><span>Conv.</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/70 border-slate-800">
                        <CardHeader className="border-b border-slate-800 pb-3">
                            <CardTitle className="text-white text-sm font-bold flex items-center gap-2">
                                <Activity className="w-4 h-4 text-emerald-400" /> Recién activos
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0" data-testid="recent-active-table">
                            <div className="max-h-[280px] overflow-y-auto">
                                {(data?.recent_active || []).map((r) => (
                                    <div key={r.user_id} className="px-3 py-2 hover:bg-slate-800/40 border-b border-slate-800/60 last:border-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-white text-xs font-medium truncate">{r.name || '—'}</p>
                                            {r.completed && <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                                        </div>
                                        <p className="text-slate-500 text-[10px] truncate">{r.email}</p>
                                        <p className="text-slate-600 text-[9px] mt-0.5">{fmtDateTime(r.last_active)}</p>
                                    </div>
                                ))}
                                {(data?.recent_active || []).length === 0 && (
                                    <p className="p-6 text-center text-slate-500 text-xs">Sin actividad reciente.</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Footer info strip */}
                <div className="text-[10px] text-slate-600 flex flex-wrap items-center gap-2 pb-4">
                    <Mail className="w-3 h-3" />
                    <span>Actualizado: {fmtDateTime(data?.updated_at)}</span>
                    <span className="mx-1">·</span>
                    <span>Filtros aplicados: {JSON.stringify(data?.filters || {})}</span>
                </div>
            </div>

            {nudgeTarget && (
                <NudgeModal
                    row={nudgeTarget}
                    onClose={() => setNudgeTarget(null)}
                    onSent={(r) => setNudgedIds((prev) => { const n = new Set(prev); n.add(`${r.user_id}-${r.stage}`); return n; })}
                />
            )}
        </Layout>
    );
};

export default AdminJourneyAnalyticsPage;
