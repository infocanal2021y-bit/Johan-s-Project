import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import api from '../lib/api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import {
    LayoutDashboard, Wallet, ArrowRightLeft, Banknote, Boxes, Sparkles,
    Bell, ShieldCheck, Send, RefreshCw, Clock, CheckCircle2, ChevronRight,
    TrendingUp, FileText, AlertCircle, Unlock, ArrowUpRight, ArrowRight,
    Loader2, Activity, Globe,
} from 'lucide-react';
import { MobileAppWidget } from '../components/command-center/MobileAppWidget';

const fmt = (n, d = 2) => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
});
const fmtRelative = (iso) => {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    return fmtDate(iso);
};

const STATUS_COLORS = {
    awaiting_code: '#94a3b8',
    received: '#1973B8',
    conversion_done: '#06b6d4',
    compliance_review: '#a78bfa',
    transfer_in_progress: '#f59e0b',
    completed: '#10b981',
    rejected: '#ef4444',
    pending: '#f59e0b',
    certified: '#10b981',
    pending_payment: '#f59e0b',
    in_review: '#a78bfa',
    approved: '#10b981',
};
const STATUS_LABELS = {
    awaiting_code: 'Código', received: 'Recibido', conversion_done: 'Conv. hecha',
    compliance_review: 'Cumplimiento', transfer_in_progress: 'En transferencia',
    completed: 'Completado', rejected: 'Rechazado',
    pending: 'Pendiente', certified: 'Certificado',
    pending_payment: 'Esperando pago', in_review: 'En revisión', approved: 'Aprobado',
};


// ─── Reusable status pill ────────────────────────────────────────
const StatusPill = ({ status }) => {
    const color = STATUS_COLORS[status] || '#94a3b8';
    const label = STATUS_LABELS[status] || status;
    return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider whitespace-nowrap"
            style={{ background: color + '20', color }}>
            {label}
        </span>
    );
};


// ─── Widget Card wrapper ─────────────────────────────────────────
const Widget = ({ title, icon: Icon, accent = '#1973B8', action, children, dense, testid }) => (
    <Card className="bg-gradient-to-br from-slate-900/70 to-slate-950 ring-1 ring-slate-800 border-0 overflow-hidden" data-testid={testid}>
        <div className={`px-4 ${dense ? 'py-2.5' : 'py-3'} border-b border-slate-800/80 flex items-center justify-between bg-slate-900/40`}>
            <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md flex items-center justify-center"
                    style={{ background: accent + '20', color: accent }}>
                    <Icon className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-white text-[12.5px] font-bold uppercase tracking-wider">{title}</h3>
            </div>
            {action}
        </div>
        <div className={dense ? 'p-3' : 'p-4'}>
            {children}
        </div>
    </Card>
);


// ─── Hero portfolio card ─────────────────────────────────────────
const PortfolioHero = ({ data }) => {
    const navigate = useNavigate();
    const top = data.portfolio.currencies.slice(0, 6);
    return (
        <Card className="bg-gradient-to-br from-[#072146] via-[#0a2a5a] to-[#004481] border-0 overflow-hidden p-6 relative">
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-[10.5px] uppercase tracking-[0.14em] text-[#7CB1E5] font-bold flex items-center gap-1.5">
                        <Wallet className="w-3 h-3" /> Portfolio total (estimado EUR)
                    </p>
                    <p className="text-white text-5xl font-bold tabular-nums mt-2" data-testid="cc-portfolio-total">
                        €{fmt(data.portfolio.total_eur)}
                    </p>
                    <p className="text-slate-300 text-[12px] mt-2">
                        Distribuido en <strong className="text-cyan-300">{data.portfolio.currency_count}</strong> divisas activas
                        {data.activity_24h.conversions > 0 && (
                            <> · <strong className="text-emerald-400">{data.activity_24h.conversions}</strong> {data.activity_24h.conversions === 1 ? 'conversión' : 'conversiones'} en 24h</>
                        )}
                    </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button onClick={() => navigate('/wallet/multi-currency')}
                        className="bg-white text-[#072146] hover:bg-slate-100 font-bold"
                        data-testid="cc-action-multicurrency">
                        <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" /> Convertir
                    </Button>
                    <Button onClick={() => navigate('/wallet/bank-withdrawal')}
                        className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold"
                        data-testid="cc-action-withdraw">
                        <Send className="w-3.5 h-3.5 mr-1.5" /> Retirar
                    </Button>
                </div>
            </div>

            {top.length > 0 && (
                <div className="relative mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    {top.map(c => (
                        <div key={c.currency} className="bg-white/10 ring-1 ring-white/15 backdrop-blur rounded-lg p-2.5">
                            <div className="flex items-center gap-1.5 text-[10px] text-white/70 font-bold uppercase">
                                <span className="text-base">{c.flag}</span>{c.currency}
                            </div>
                            <p className="text-white font-mono font-bold tabular-nums mt-1 text-[13px]">
                                {c.symbol}{fmt(c.balance, c.currency === 'BTC' ? 8 : (c.currency === 'COP' ? 0 : 2))}
                            </p>
                            <p className="text-[9.5px] text-cyan-200 mt-0.5 tabular-nums">≈ €{fmt(c.eur_equivalent)}</p>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
};


// ─── Active withdrawals ──────────────────────────────────────────
const ActiveWithdrawals = ({ items }) => {
    const navigate = useNavigate();
    return (
        <Widget
            title="Retiros activos"
            icon={Banknote}
            accent="#f59e0b"
            testid="cc-active-withdrawals"
            action={
                <Button size="sm" variant="ghost" onClick={() => navigate('/wallet/bank-withdrawal')}
                    className="h-7 px-2 text-[10.5px] text-slate-400 hover:text-white">
                    Ver todos <ChevronRight className="w-3 h-3 ml-0.5" />
                </Button>
            }
        >
            {items.length === 0 ? (
                <p className="text-slate-500 text-[11.5px] text-center py-3">Sin retiros activos.</p>
            ) : (
                <div className="space-y-2">
                    {items.slice(0, 3).map(w => (
                        <div key={w.id} className="bg-slate-900/60 ring-1 ring-slate-800 rounded-lg p-2.5 flex items-center justify-between gap-2"
                            data-testid={`cc-wd-${w.id}`}>
                            <div className="flex-1 min-w-0">
                                <p className="font-mono text-cyan-300 text-[10.5px] font-bold">{w.reference}</p>
                                <p className="text-white text-[12px] font-bold mt-0.5">
                                    {fmt(w.from_amount)} {w.from_currency}
                                    <ArrowRight className="inline w-3 h-3 mx-1 text-slate-500" />
                                    <span className="text-emerald-400">{fmt(w.net_to_amount)} {w.to_currency}</span>
                                </p>
                                <p className="text-slate-500 text-[10.5px] mt-0.5">{w.country_flag} {w.bank_name}</p>
                            </div>
                            <StatusPill status={w.status} />
                        </div>
                    ))}
                </div>
            )}
        </Widget>
    );
};


// ─── Recent conversions ─────────────────────────────────────────
const RecentConversions = ({ items }) => (
    <Widget title="Últimas conversiones" icon={ArrowRightLeft} accent="#06b6d4" testid="cc-recent-conv">
        {items.length === 0 ? (
            <p className="text-slate-500 text-[11.5px] text-center py-3">Sin conversiones aún.</p>
        ) : (
            <div className="space-y-1.5">
                {items.slice(0, 4).map(c => (
                    <div key={c.id} className="flex items-center justify-between gap-2 text-[11.5px] py-1 border-b border-slate-800/50 last:border-0"
                        data-testid={`cc-conv-${c.id}`}>
                        <div className="flex items-center gap-1.5 min-w-0">
                            <ArrowUpRight className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                            <div className="font-mono tabular-nums truncate">
                                <span className="text-slate-300">{fmt(c.amount_in)} {c.from_currency || '—'}</span>
                                <span className="text-slate-600 mx-1">→</span>
                                <span className="text-emerald-400 font-bold">{fmt(c.amount_out)} {c.to_currency}</span>
                            </div>
                        </div>
                        <span className="text-slate-500 text-[10px] whitespace-nowrap">{fmtRelative(c.created_at)}</span>
                    </div>
                ))}
            </div>
        )}
    </Widget>
);


// ─── Vault widget ────────────────────────────────────────────────
const VaultWidget = ({ data }) => {
    const navigate = useNavigate();
    return (
        <Widget
            title="Vault Blockchain"
            icon={Boxes}
            accent="#06b6d4"
            testid="cc-vault"
            action={
                <Button size="sm" variant="ghost" onClick={() => navigate('/wallet/vault')}
                    className="h-7 px-2 text-[10.5px] text-slate-400 hover:text-white">
                    Abrir <ChevronRight className="w-3 h-3 ml-0.5" />
                </Button>
            }
        >
            <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-emerald-500/10 ring-1 ring-emerald-500/20 rounded-md p-2 text-center">
                    <p className="text-emerald-300 text-[9.5px] uppercase font-bold tracking-wider">Certificados</p>
                    <p className="text-emerald-300 text-xl font-bold mt-0.5 tabular-nums">{data.certified}</p>
                </div>
                <div className="bg-amber-500/10 ring-1 ring-amber-500/20 rounded-md p-2 text-center">
                    <p className="text-amber-300 text-[9.5px] uppercase font-bold tracking-wider">Pendientes</p>
                    <p className="text-amber-300 text-xl font-bold mt-0.5 tabular-nums">{data.pending}</p>
                </div>
            </div>
            {data.recent.length === 0 ? (
                <p className="text-slate-500 text-[11px] text-center py-2">Sin documentos.</p>
            ) : (
                <div className="space-y-1">
                    {data.recent.slice(0, 3).map(d => (
                        <div key={d.id} className="flex items-center gap-2 text-[11px] py-1">
                            <FileText className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                            <span className="text-slate-300 truncate flex-1">{d.name}</span>
                            <StatusPill status={d.status} />
                        </div>
                    ))}
                </div>
            )}
        </Widget>
    );
};


// ─── Partial unlock 40% ─────────────────────────────────────────
const PartialUnlockWidget = ({ partial }) => {
    const navigate = useNavigate();
    if (!partial) return null;
    return (
        <Widget
            title="Desbloqueo 40%"
            icon={Unlock}
            accent="#a78bfa"
            testid="cc-partial-unlock"
            action={
                <Button size="sm" onClick={() => navigate('/withdraw')}
                    className="h-7 px-2 text-[10.5px] bg-violet-500 hover:bg-violet-400 text-white font-bold">
                    Continuar <ChevronRight className="w-3 h-3 ml-0.5" />
                </Button>
            }
        >
            <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-slate-400">Referencia</span>
                    <span className="font-mono text-violet-300 text-[10.5px]">{partial.payment_reference}</span>
                </div>
                <div>
                    <div className="flex items-center justify-between text-[11.5px] mb-1">
                        <span className="text-slate-400">Progreso</span>
                        <span className="text-white font-bold">{partial.progress_pct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${partial.progress_pct}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                            className="h-full bg-gradient-to-r from-violet-500 to-violet-300"
                        />
                    </div>
                    <p className="text-[10.5px] text-slate-500 mt-1">
                        Pagado <strong className="text-emerald-400">€{fmt(partial.paid_eur)}</strong> de <strong className="text-white">€{fmt(partial.required_eur)}</strong>
                    </p>
                </div>
                <StatusPill status={partial.status} />
            </div>
        </Widget>
    );
};


// ─── KYC status ─────────────────────────────────────────────────
const KYCWidget = ({ user }) => {
    const verified = user.is_verified;
    return (
        <Widget title="Verificación" icon={ShieldCheck} accent={verified ? '#10b981' : '#f59e0b'} testid="cc-kyc">
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    verified ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                    {verified ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                </div>
                <div>
                    <p className="text-white font-bold text-[13px]">
                        {verified ? 'Cuenta verificada' : 'Verificación pendiente'}
                    </p>
                    <p className="text-slate-400 text-[10.5px]">
                        {user.country && <>📍 {user.country} · </>}
                        Miembro desde {fmtDate(user.member_since)}
                    </p>
                </div>
            </div>
        </Widget>
    );
};


// ─── Notifications widget ──────────────────────────────────────
const NotificationsWidget = ({ data }) => {
    return (
        <Widget
            title="Notificaciones"
            icon={Bell}
            accent="#f59e0b"
            testid="cc-notifications"
            action={
                data.unread_count > 0 && (
                    <span className="bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded text-[9.5px] font-bold">
                        {data.unread_count} nuevas
                    </span>
                )
            }
        >
            {data.items.length === 0 ? (
                <p className="text-slate-500 text-[11.5px] text-center py-3">Sin notificaciones.</p>
            ) : (
                <div className="space-y-1.5">
                    {data.items.slice(0, 4).map(n => (
                        <div key={n.id} className={`text-[11px] py-1.5 px-2 rounded ${n.read ? '' : 'bg-amber-500/5'}`}
                            data-testid={`cc-notif-${n.id}`}>
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-white font-semibold truncate flex-1">{n.title}</p>
                                <span className="text-slate-500 text-[9.5px] whitespace-nowrap">{fmtRelative(n.created_at)}</span>
                            </div>
                            <p className="text-slate-400 text-[10.5px] mt-0.5 line-clamp-1">{n.message}</p>
                        </div>
                    ))}
                </div>
            )}
        </Widget>
    );
};


// ─── AI Assistant CTA ──────────────────────────────────────────
const AIAssistantCard = ({ sessionCount }) => (
    <Card className="bg-gradient-to-br from-cyan-900/40 to-slate-950 ring-1 ring-cyan-500/30 border-0 p-4 overflow-hidden relative" data-testid="cc-ai-cta">
        <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-cyan-500/15 blur-2xl" />
        <div className="relative flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400/30 to-cyan-600/30 flex items-center justify-center ring-1 ring-cyan-400/40 flex-shrink-0">
                <Sparkles className="w-5 h-5 text-cyan-300" />
            </div>
            <div className="flex-1">
                <p className="text-white font-bold text-[13px]">LIONS Assistant 24/7</p>
                <p className="text-slate-400 text-[11px] mt-0.5">
                    {sessionCount > 0
                        ? `Tienes ${sessionCount} ${sessionCount === 1 ? 'conversación' : 'conversaciones'} previas`
                        : 'Pregunta sobre SWIFT, IBAN, retiros, KYC y más'}
                </p>
                <p className="text-cyan-300 text-[10.5px] font-bold mt-2">
                    Toca el icono <Sparkles className="inline w-3 h-3" /> abajo a la derecha para hablar →
                </p>
            </div>
        </div>
    </Card>
);


// ─── 24h activity strip ────────────────────────────────────────
const Activity24h = ({ activity }) => (
    <Card className="bg-slate-900/60 ring-1 ring-slate-800 border-0 p-3" data-testid="cc-activity-24h">
        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1 mb-2">
            <Activity className="w-3 h-3" /> Actividad · últimas 24h
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
            <div>
                <p className="text-cyan-400 text-xl font-bold tabular-nums">{activity.conversions}</p>
                <p className="text-slate-500 text-[10px] uppercase">Conversiones</p>
            </div>
            <div>
                <p className="text-amber-400 text-xl font-bold tabular-nums">{activity.withdrawals}</p>
                <p className="text-slate-500 text-[10px] uppercase">Retiros</p>
            </div>
            <div>
                <p className="text-emerald-400 text-xl font-bold tabular-nums">{activity.documents}</p>
                <p className="text-slate-500 text-[10px] uppercase">Docs</p>
            </div>
        </div>
    </Card>
);


// ─── Quick links grid ──────────────────────────────────────────
const QuickLinks = () => {
    const navigate = useNavigate();
    const links = [
        { to: '/wallet/multi-currency', label: 'Multidivisa', icon: Wallet, color: '#1973B8' },
        { to: '/wallet/bank-withdrawal', label: 'Retiro', icon: Send, color: '#10b981' },
        { to: '/wallet/vault', label: 'Vault', icon: Boxes, color: '#06b6d4' },
        { to: '/community', label: 'Comunidad', icon: Globe, color: '#a78bfa' },
    ];
    return (
        <Card className="bg-slate-900/60 ring-1 ring-slate-800 border-0 p-3" data-testid="cc-quick-links">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2.5">Acceso rápido</p>
            <div className="grid grid-cols-2 gap-2">
                {links.map(l => (
                    <button
                        key={l.to}
                        onClick={() => navigate(l.to)}
                        className="bg-slate-800/60 hover:bg-slate-700 ring-1 ring-slate-700 hover:ring-cyan-500/40 rounded-lg px-2.5 py-2 flex items-center gap-2 transition-all"
                        data-testid={`cc-quick-${l.label.toLowerCase()}`}
                    >
                        <l.icon className="w-3.5 h-3.5" style={{ color: l.color }} />
                        <span className="text-white text-[11.5px] font-bold">{l.label}</span>
                    </button>
                ))}
            </div>
        </Card>
    );
};


// ─── Main Page ────────────────────────────────────────────────────
const CommandCenterPage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            const r = await api.get('/command-center/overview');
            setData(r.data);
        } catch (err) {
            console.error('[command-center] load failed', err);
            toast.error('No se pudo cargar el Command Center');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        load();
        // Auto-refresh every 60s
        const t = setInterval(load, 60000);
        return () => clearInterval(t);
    }, [load]);

    if (loading) {
        return (
            <Layout>
                <div className="flex items-center justify-center min-h-[60vh]">
                    <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                </div>
            </Layout>
        );
    }
    if (!data) {
        return <Layout><div className="text-center text-white py-12">Sin datos.</div></Layout>;
    }

    return (
        <Layout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-[10.5px] uppercase tracking-[0.14em] text-[#7CB1E5] font-bold flex items-center gap-1.5">
                            <LayoutDashboard className="w-3 h-3" /> Financial Command Center
                        </p>
                        <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1" data-testid="cc-title">
                            Hola, {data.user.name?.split(' ')[0] || 'Usuario'} 👋
                        </h1>
                        <p className="text-slate-400 text-[13px] mt-1.5">
                            Vista unificada de tu cuenta financiera · snapshot {fmtRelative(data.snapshot_at)} · auto-refresh cada 60s
                        </p>
                    </div>
                    <Button
                        onClick={() => { setRefreshing(true); load(); }}
                        variant="outline"
                        className="bg-white/5 border-white/15 text-white hover:bg-white/10"
                        data-testid="cc-refresh"
                    >
                        <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} /> Refrescar
                    </Button>
                </div>

                {/* Portfolio hero */}
                <PortfolioHero data={data} />

                {/* 3-column grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Left col: withdrawals + conversions */}
                    <div className="space-y-4">
                        <ActiveWithdrawals items={data.withdrawals.active} />
                        <RecentConversions items={data.conversions.recent} />
                    </div>

                    {/* Middle col: vault + partial */}
                    <div className="space-y-4">
                        <VaultWidget data={data.vault} />
                        {data.partial_unlock && <PartialUnlockWidget partial={data.partial_unlock} />}
                        {!data.partial_unlock && <AIAssistantCard sessionCount={data.ai_assistant.session_count} />}
                    </div>

                    {/* Right col: notifications + KYC + activity + quick links */}
                    <div className="space-y-4">
                        <NotificationsWidget data={data.notifications} />
                        <MobileAppWidget />
                        <KYCWidget user={data.user} />
                        <Activity24h activity={data.activity_24h} />
                        <QuickLinks />
                        {data.partial_unlock && <AIAssistantCard sessionCount={data.ai_assistant.session_count} />}
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default CommandCenterPage;
