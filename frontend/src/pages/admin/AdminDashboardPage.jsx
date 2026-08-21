import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { EmailQuotaCard } from '../../components/admin/EmailQuotaCard';
import { adminAPI } from '../../lib/api';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { OdometerValue } from '../../components/dashboard/OdometerValue';
import {
    Users, FileText, Clock, DollarSign, ShieldCheck, Wifi, Bitcoin, HeadphonesIcon,
    Megaphone, Activity, History, CreditCard, ArrowUpRight, ArrowRight,
    Landmark, CheckCircle2, XCircle, AlertTriangle, TrendingUp, HeartPulse,
} from 'lucide-react';
import { toast } from 'sonner';

/* ============================================================
   Internal atoms — bank-grade admin visual language
   ============================================================ */

const KpiCard = ({ icon: Icon, label, value, sub, color, to, loading, testId }) => {
    const navigate = useNavigate();
    const palette = {
        blue:    { ring: 'ring-[#14549C]/40',      bg: 'bg-[#14549C]/15',     text: 'text-[#4a9eff]',     glow: 'shadow-[#14549C]/25' },
        cyan:    { ring: 'ring-cyan-500/40',        bg: 'bg-cyan-500/15',      text: 'text-cyan-300',      glow: 'shadow-cyan-500/20' },
        amber:   { ring: 'ring-amber-500/40',       bg: 'bg-amber-500/15',     text: 'text-amber-300',     glow: 'shadow-amber-500/20' },
        emerald: { ring: 'ring-emerald-500/40',     bg: 'bg-emerald-500/15',   text: 'text-emerald-300',   glow: 'shadow-emerald-500/25' },
        violet:  { ring: 'ring-violet-500/40',      bg: 'bg-violet-500/15',    text: 'text-violet-300',    glow: 'shadow-violet-500/20' },
        rose:    { ring: 'ring-rose-500/40',        bg: 'bg-rose-500/15',      text: 'text-rose-300',      glow: 'shadow-rose-500/20' },
        sky:     { ring: 'ring-sky-500/40',         bg: 'bg-sky-500/15',       text: 'text-sky-300',       glow: 'shadow-sky-500/20' },
        slate:   { ring: 'ring-slate-500/30',       bg: 'bg-slate-700/30',     text: 'text-slate-300',     glow: 'shadow-slate-900/40' },
    }[color] || {};

    return (
        <Card
            role="button"
            tabIndex={0}
            onClick={() => navigate(to)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(to)}
            data-testid={testId}
            className={`relative cursor-pointer bg-gradient-to-br from-slate-900/90 to-slate-950 border-slate-800/80 p-5 overflow-hidden group ${palette.glow}`}
        >
            <div className="flex items-start justify-between mb-4">
                <div className={`w-11 h-11 rounded-xl ${palette.bg} ${palette.text} ring-1 ${palette.ring} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
                    <Icon className="w-5 h-5" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold">{label}</p>
            <p className="text-3xl text-white mt-1.5 tabular-nums font-numbers" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                {loading ? '···' : <OdometerValue value={String(value)} staggerMs={40} />}
            </p>
            {sub && <p className="text-[11px] text-slate-500 mt-1.5">{sub}</p>}
        </Card>
    );
};

const QuickAccessTile = ({ icon: Icon, label, to, color = 'slate' }) => {
    const navigate = useNavigate();
    const palettes = {
        blue:   'hover:bg-[#14549C]/10 hover:border-[#14549C]/40 hover:text-[#4a9eff]',
        cyan:   'hover:bg-cyan-500/10 hover:border-cyan-500/40 hover:text-cyan-300',
        violet: 'hover:bg-violet-500/10 hover:border-violet-500/40 hover:text-violet-300',
        rose:   'hover:bg-rose-500/10 hover:border-rose-500/40 hover:text-rose-300',
        sky:    'hover:bg-sky-500/10 hover:border-sky-500/40 hover:text-sky-300',
        slate:  'hover:bg-slate-700/20 hover:border-slate-600 hover:text-slate-100',
    };
    return (
        <button
            type="button"
            onClick={() => navigate(to)}
            className={`flex items-center gap-3 p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/50 text-slate-400 text-sm transition-all text-left ${palettes[color]}`}
            data-testid={`quick-${to.replace(/\//g, '-')}`}
        >
            <div className="w-9 h-9 rounded-lg bg-slate-800/80 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4" />
            </div>
            <span className="font-medium flex-1 truncate">{label}</span>
            <ArrowRight className="w-4 h-4 opacity-50" />
        </button>
    );
};

const fmtMoney = (value, currency = 'USD') => {
    const n = Number(value) || 0;
    return `${currency === 'USD' ? '$' : '€'}${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/* ============================================================
   Main page
   ============================================================ */

export const AdminDashboardPage = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalUsers: 0,
        totalTransactions: 0,
        pendingWithdrawals: 0,
        totalBalanceUsd: 0,
        totalBalanceEur: 0,
        onlineUsers: 0,
        kycPending: 0,
        cryptoPending: 0,
        verifiedUsers: 0,
        suspendedUsers: 0,
    });
    const [recentUsers, setRecentUsers] = useState([]);
    const [recentTransactions, setRecentTransactions] = useState([]);
    const [pendingWithdrawals, setPendingWithdrawals] = useState([]);
    const [processingId, setProcessingId] = useState(null);

    const loadAll = async () => {
        try {
            const results = await Promise.allSettled([
                adminAPI.getUsers(),
                adminAPI.getTransactions(),
                adminAPI.getPendingWithdrawals(),
                adminAPI.getPendingKYC(),
                adminAPI.getPendingCryptoPayments(),
            ]);
            const [usersR, txR, withdR, kycR, cryptoR] = results;

            const users = usersR.status === 'fulfilled' ? usersR.value.data : [];
            const txs = txR.status === 'fulfilled' ? txR.value.data : [];
            const withdrawals = withdR.status === 'fulfilled' ? withdR.value.data : [];
            const kyc = kycR.status === 'fulfilled' ? kycR.value.data : [];
            const crypto = cryptoR.status === 'fulfilled' ? cryptoR.value.data : [];

            const totalBalanceUsd = users.reduce((s, u) => s + (u.total_balance_usd || 0), 0);
            const totalBalanceEur = users.reduce((s, u) => s + (u.total_balance_eur || 0), 0);

            setStats({
                totalUsers: users.length,
                totalTransactions: txs.length,
                pendingWithdrawals: withdrawals.length,
                totalBalanceUsd,
                totalBalanceEur,
                onlineUsers: users.filter((u) => u.is_online).length,
                kycPending: kyc.length,
                cryptoPending: crypto.length,
                verifiedUsers: users.filter((u) => u.verification_status === 'verified').length,
                suspendedUsers: users.filter((u) => u.account_status === 'suspended').length,
            });

            setRecentUsers(
                [...users]
                    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
                    .slice(0, 5)
            );
            setRecentTransactions(
                [...txs]
                    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
                    .slice(0, 5)
            );
            setPendingWithdrawals(withdrawals.slice(0, 5));
        } catch (err) {
            toast.error('Error al cargar datos del panel');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAll();
    }, []);

    const handleApprove = async (id) => {
        setProcessingId(id);
        try {
            await adminAPI.approveWithdrawal(id);
            toast.success('Retiro aprobado');
            loadAll();
        } catch (e) {
            toast.error('Error al aprobar');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (id) => {
        setProcessingId(id);
        try {
            await adminAPI.rejectWithdrawal(id);
            toast.success('Retiro rechazado');
            loadAll();
        } catch (e) {
            toast.error('Error al rechazar');
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="admin-dashboard-page">
                {/* ── Executive Header ──────────────────────────── */}
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-start gap-3">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#14549C] to-[#0b3f75] ring-1 ring-white/10 flex items-center justify-center shadow-lg shadow-[#14549C]/30">
                                <Landmark className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.18em] text-[#4a9eff] font-bold">
                                    LIONSBIT · Panel de Administración
                                </p>
                                <h1 className="text-2xl sm:text-3xl text-white mt-0.5" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                                    Centro de Control
                                </h1>
                                <p className="text-slate-400 text-sm mt-1">
                                    Visión general de la plataforma y acceso rápido a todas las operaciones.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-emerald-300 text-xs font-medium">Sistema operativo</span>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* ── Primary KPIs ──────────────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KpiCard icon={Users}       label="Usuarios totales"    value={stats.totalUsers}        sub={`${stats.verifiedUsers} verificados`} color="blue"    to="/admin/users"          loading={loading} testId="kpi-total-users" />
                    <KpiCard icon={Wifi}        label="Usuarios en línea"   value={stats.onlineUsers}       sub="Conectados ahora"                     color="emerald" to="/admin/online-users"   loading={loading} testId="kpi-online-users" />
                    <KpiCard icon={FileText}    label="Transacciones"       value={stats.totalTransactions} sub="Histórico total"                      color="cyan"    to="/admin/transactions"   loading={loading} testId="kpi-transactions" />
                    <KpiCard icon={Clock}       label="Retiros pendientes"  value={stats.pendingWithdrawals} sub="Requieren revisión"                  color="amber"   to="/admin/withdrawals"    loading={loading} testId="kpi-pending-withdrawals" />
                </div>

                {/* ── Secondary KPIs ────────────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KpiCard icon={DollarSign}  label="Balance total USD"   value={fmtMoney(stats.totalBalanceUsd, 'USD')} sub="Consolidado activos" color="violet"  to="/admin/treasury"       loading={loading} testId="kpi-balance-usd" />
                    <KpiCard icon={ShieldCheck} label="KYC pendiente"       value={stats.kycPending}         sub="Documentos por revisar"               color="sky"     to="/admin/kyc"            loading={loading} testId="kpi-kyc-pending" />
                    <KpiCard icon={Bitcoin}     label="Pagos cripto"        value={stats.cryptoPending}      sub="Pendientes de validar"                color="rose"    to="/admin/crypto-payments" loading={loading} testId="kpi-crypto-pending" />
                    <KpiCard icon={AlertTriangle} label="Suspendidos"       value={stats.suspendedUsers}     sub="Cuentas bloqueadas"                   color="slate"   to="/admin/users"          loading={loading} testId="kpi-suspended" />
                </div>

                {/* ── Email quota ───────────────────────────────── */}
                <EmailQuotaCard />

                {/* ── Pending Withdrawals Action Panel ──────────── */}
                {pendingWithdrawals.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <Card className="bg-gradient-to-br from-amber-950/30 via-slate-900/80 to-slate-900/90 border-amber-500/25 p-5" data-testid="pending-withdrawals-panel">
                            <div className="flex items-center justify-between mb-4 gap-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-9 h-9 rounded-lg bg-amber-500/15 ring-1 ring-amber-500/30 flex items-center justify-center">
                                        <Clock className="w-4 h-4 text-amber-300" />
                                    </div>
                                    <div>
                                        <h2 className="text-white font-semibold">Retiros pendientes de aprobación</h2>
                                        <p className="text-slate-500 text-xs mt-0.5">Acciones rápidas sobre los últimos {pendingWithdrawals.length} retiros</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => navigate('/admin/withdrawals')} className="text-amber-300 hover:text-amber-200 hover:bg-amber-500/10" data-testid="see-all-withdrawals">
                                    Ver todos <ArrowRight className="w-3.5 h-3.5 ml-1" />
                                </Button>
                            </div>
                            <div className="divide-y divide-slate-800/80">
                                {pendingWithdrawals.map((w) => (
                                    <div key={w.id} className="flex items-center justify-between gap-3 py-3" data-testid={`withd-row-${w.id}`}>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-white text-sm font-medium truncate">{w.user?.name || w.user?.email || 'Usuario'}</p>
                                            <p className="text-slate-500 text-xs mt-0.5 font-mono truncate">{w.description || 'Retiro bancario'}</p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="text-amber-300 text-sm font-bold tabular-nums">
                                                {fmtMoney(w.amount, w.currency || 'USD')}
                                            </p>
                                            <p className="text-slate-600 text-[10px] mt-0.5">
                                                {w.created_at ? new Date(w.created_at).toLocaleDateString('es-ES') : ''}
                                            </p>
                                        </div>
                                        <div className="flex gap-1.5 flex-shrink-0">
                                            <Button size="sm" disabled={processingId === w.id} onClick={() => handleApprove(w.id)} className="h-8 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white" data-testid={`approve-${w.id}`}>
                                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprobar
                                            </Button>
                                            <Button size="sm" variant="outline" disabled={processingId === w.id} onClick={() => handleReject(w.id)} className="h-8 px-2.5 text-xs border-red-500/40 text-red-300 hover:bg-red-500/10" data-testid={`reject-${w.id}`}>
                                                <XCircle className="w-3.5 h-3.5 mr-1" /> Rechazar
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </motion.div>
                )}

                {/* ── Recent users + transactions side-by-side ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Recent Users */}
                    <Card className="bg-slate-900/70 border-slate-800/80 p-5" data-testid="recent-users-panel">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg bg-[#14549C]/15 ring-1 ring-[#14549C]/30 flex items-center justify-center">
                                    <Users className="w-4 h-4 text-[#4a9eff]" />
                                </div>
                                <h2 className="text-white font-semibold">Últimos usuarios</h2>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/users')} className="text-slate-400 hover:text-white" data-testid="see-all-users">
                                Gestionar <ArrowRight className="w-3.5 h-3.5 ml-1" />
                            </Button>
                        </div>
                        <div className="divide-y divide-slate-800/80">
                            {loading && <p className="text-slate-500 text-sm py-6 text-center">Cargando...</p>}
                            {!loading && recentUsers.length === 0 && <p className="text-slate-500 text-sm py-6 text-center">Sin usuarios recientes</p>}
                            {recentUsers.map((u) => (
                                <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => navigate('/admin/users')}
                                    className="w-full flex items-center gap-3 py-3 text-left hover:bg-slate-800/40 rounded-lg px-2 -mx-2 transition-colors"
                                    data-no-hover
                                    data-testid={`recent-user-${u.id}`}
                                >
                                    <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                                        <span className="text-xs font-semibold text-white">{u.name?.charAt(0).toUpperCase() || '?'}</span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-white text-sm font-medium truncate">{u.name}</p>
                                        <p className="text-slate-500 text-xs truncate">{u.email}</p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-emerald-300 text-xs font-mono tabular-nums">
                                            {fmtMoney(u.total_balance_usd || 0, 'USD')}
                                        </p>
                                        <p className="text-slate-600 text-[10px] mt-0.5">
                                            {u.verification_status === 'verified' ? '✓ Verificado' : 'Sin verificar'}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </Card>

                    {/* Recent Transactions */}
                    <Card className="bg-slate-900/70 border-slate-800/80 p-5" data-testid="recent-tx-panel">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg bg-cyan-500/15 ring-1 ring-cyan-500/30 flex items-center justify-center">
                                    <TrendingUp className="w-4 h-4 text-cyan-300" />
                                </div>
                                <h2 className="text-white font-semibold">Transacciones recientes</h2>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/transactions')} className="text-slate-400 hover:text-white" data-testid="see-all-tx">
                                Ver todas <ArrowRight className="w-3.5 h-3.5 ml-1" />
                            </Button>
                        </div>
                        <div className="divide-y divide-slate-800/80">
                            {loading && <p className="text-slate-500 text-sm py-6 text-center">Cargando...</p>}
                            {!loading && recentTransactions.length === 0 && <p className="text-slate-500 text-sm py-6 text-center">Sin transacciones recientes</p>}
                            {recentTransactions.map((t) => {
                                const isOut = ['withdraw', 'withdrawal', 'transfer_out', 'send'].includes(t.transaction_type || t.type);
                                const txType = t.transaction_type || t.type || '';
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => navigate('/admin/transactions')}
                                        className="w-full flex items-center gap-3 py-3 text-left hover:bg-slate-800/40 rounded-lg px-2 -mx-2 transition-colors"
                                        data-no-hover
                                        data-testid={`recent-tx-${t.id}`}
                                    >
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isOut ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                                            <FileText className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-white text-sm font-medium truncate">{t.description || txType || 'Transacción'}</p>
                                            <p className="text-slate-500 text-xs truncate">
                                                {t.user?.name || t.user?.email || '—'} · <span className="capitalize">{t.status}</span>
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className={`text-sm font-mono tabular-nums ${isOut ? 'text-rose-300' : 'text-emerald-300'}`}>
                                                {isOut ? '−' : '+'}{fmtMoney(t.amount, t.currency || 'USD')}
                                            </p>
                                            <p className="text-slate-600 text-[10px] mt-0.5">
                                                {t.created_at ? new Date(t.created_at).toLocaleDateString('es-ES') : ''}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </Card>
                </div>

                {/* ── Quick access to all admin tools ─────────── */}
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-5 rounded-full bg-[#14549C]" />
                        <h2 className="text-sm font-semibold text-slate-200 tracking-wide uppercase">Herramientas</h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        <QuickAccessTile icon={Users}          label="Gestión de usuarios"    to="/admin/users"           color="blue" />
                        <QuickAccessTile icon={FileText}       label="Transacciones"          to="/admin/transactions"    color="cyan" />
                        <QuickAccessTile icon={Clock}          label="Retiros"                to="/admin/withdrawals"     color="rose" />
                        <QuickAccessTile icon={ShieldCheck}    label="Verificación KYC"       to="/admin/kyc"             color="sky" />
                        <QuickAccessTile icon={Bitcoin}        label="Pagos cripto"           to="/admin/crypto-payments" color="rose" />
                        <QuickAccessTile icon={DollarSign}     label="Tesorería"              to="/admin/treasury"        color="violet" />
                        <QuickAccessTile icon={CreditCard}     label="Créditos & comisiones"  to="/admin/credits"         color="violet" />
                        <QuickAccessTile icon={Megaphone}      label="Difusión masiva"        to="/admin/broadcast"       color="rose" />
                        <QuickAccessTile icon={HeadphonesIcon} label="Centro de soporte"      to="/admin/support"         color="sky" />
                        <QuickAccessTile icon={Activity}       label="Actividad del sistema"  to="/admin/activity"        color="cyan" />
                        <QuickAccessTile icon={Wifi}           label="Usuarios en línea"      to="/admin/online-users"    color="blue" />
                        <QuickAccessTile icon={History}        label="Historial de accesos"   to="/admin/login-history"   color="slate" />
                        <QuickAccessTile icon={HeartPulse}     label="Salud de integraciones" to="/admin/health"          color="rose" />
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default AdminDashboardPage;
