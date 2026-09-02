import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n/LanguageContext';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { ConnectionIndicator } from '../ConnectionIndicator';
import { SidebarHealthRing } from './SidebarHealthRing';
import { NotificationBell } from '../NotificationBell';
import { LevelBadge } from '../dashboard/LevelBadge';
import { 
    LayoutDashboard, 
    Wallet, 
    ArrowLeftRight, 
    Upload, 
    Users, 
    ClipboardList,
    LogOut,
    Shield,
    Menu,
    X,
    BadgeCheck,
    Vault,
    AlertTriangle,
    PlusCircle,
    Bitcoin,
    Radar,
    ShieldAlert,
    Receipt,
    BarChart3,
    Settings,
    MessageSquare,
    HeadphonesIcon,
    Activity,
    TrendingUp,
    RefreshCw,
    Calculator,
    PieChart,
    Bell,
    Newspaper,
    Scale,
    Globe,
    Radio,
    CandlestickChart,
    History,
    Wifi,
    CreditCard,
    Banknote,
    Trophy,
    ArrowUpRight,
    ArrowDownLeft,
    ExternalLink,
    Hash,
    LineChart,
    Megaphone,
    Bot,
    Landmark,
    Unlock,
    FileSpreadsheet,
    Mail,
    Send,
    Boxes,
    Smartphone,
    FolderKanban,
    Sparkles,
    Share2,
    FileText,
    Server,
    Building2,
    UserX,
    Image as ImageIcon
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { ChevronDown } from 'lucide-react';
import { messagesAPI } from '../../lib/api';

export const Sidebar = () => {
    const { user, logout, isAdmin } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const t = useT();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [openGroup, setOpenGroup] = useState(null);
    const [unreadTickets, setUnreadTickets] = useState(0);

    useEffect(() => {
        setOpenGroup(null);
    }, [location.pathname]);

    useEffect(() => {
        if (!user) return undefined;
        let alive = true;
        const poll = async () => {
            try {
                const r = await messagesAPI.getUnreadCount();
                if (alive) setUnreadTickets(r.data.unread_tickets || 0);
            } catch { /* silent */ }
        };
        poll();
        const iv = setInterval(poll, 60000);
        return () => { alive = false; clearInterval(iv); };
    }, [user]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const getVerificationBadge = () => {
        const status = user?.verification_status;
        if (status === 'verified') {
            return <BadgeCheck className="w-4 h-4 text-emerald-400" />;
        } else if (status === 'pending_verification') {
            return <AlertTriangle className="w-4 h-4 text-amber-400" />;
        }
        return null;
    };

    // ── Grouped navigation (7 collapsible groups, only active section open) ──
    const NAV_GROUPS = [
        {
            id: 'principal', label: 'Principal', icon: LayoutDashboard,
            items: [
                { to: '/command-center', icon: LayoutDashboard, label: 'Centro de Control' },
                { to: '/dashboard', icon: BarChart3, label: 'Dashboard' },
                { to: '/community', icon: Users, label: 'Comunidad' },
            ],
        },
        {
            id: 'trading', label: 'Inversiones y Trading', icon: TrendingUp,
            items: [
                { to: '/trading-demo', icon: LineChart, label: 'Trading Demo' },
                { to: '/trading-bot', icon: Bot, label: 'Trading Bot' },
                { to: '/mt5', icon: Landmark, label: 'MT5 Profesional' },
                { to: '/investing-pro', icon: TrendingUp, label: 'InvestingPro' },
                { to: '/advisors', icon: Users, label: 'Asesores y Analistas' },
                { to: '/portfolio', icon: PieChart, label: 'Portafolio' },
                { to: '/investment-simulator', icon: Calculator, label: 'Proyecciones' },
            ],
        },
        {
            id: 'banca', label: 'Banca y Cuentas', icon: Wallet,
            items: [
                { to: '/accounts', icon: Wallet, label: 'Resumen de Cuentas' },
                { to: '/transactions', icon: ClipboardList, label: 'Movimientos' },
                { to: '/transfer', icon: ArrowLeftRight, label: 'Transferencias' },
                { to: '/wallet/multi-currency', icon: Banknote, label: 'Cuenta Multidivisa' },
                { to: '/binance-wallet', icon: Bitcoin, label: 'Wallet / Activos' },
                { to: '/wallet/vault', icon: Boxes, label: 'Vault Blockchain' },
            ],
        },
        {
            id: 'retiros', label: 'Retiros', icon: Upload,
            items: [
                { to: '/withdraw', icon: Upload, label: 'Nuevo Retiro' },
                { to: '/wallet/bank-withdrawal', icon: Send, label: 'Retiro a Banco' },
                { to: '/withdraw-methods', icon: CreditCard, label: 'Métodos de Retiro' },
                { to: '/transactions?filter=withdraw', icon: History, label: 'Historial de Retiros' },
            ],
        },
        {
            id: 'mercados', label: 'Mercados y Análisis', icon: CandlestickChart,
            items: [
                { to: '/realtime-market', icon: CandlestickChart, label: 'Mercado en Vivo' },
                { to: '/crypto-market', icon: TrendingUp, label: 'Mercado Cripto' },
                { to: '/live-news', icon: Radio, label: 'Noticias en Vivo' },
                { to: '/converter', icon: RefreshCw, label: 'Conversor' },
                { to: '/investment-comparator', icon: Scale, label: 'Comparador' },
                { to: '/global-market-map', icon: Globe, label: 'Mapa Global' },
                { to: '/market-reports', icon: Newspaper, label: 'Reportes' },
                { to: '/alerts', icon: Bell, label: 'Alertas' },
            ],
        },
        {
            id: 'soporte', label: 'Soporte y Comunicación', icon: MessageSquare,
            items: [
                { to: '/messages', icon: MessageSquare, label: 'Centro de Mensajes', badge: unreadTickets },
                { to: '/notifications', icon: Bell, label: 'Notificaciones' },
                { to: '/communications', icon: Megaphone, label: 'Comunicados Oficiales' },
                { to: '/cases', icon: FolderKanban, label: 'Mis Casos PLB' },
                { to: '/support', icon: HeadphonesIcon, label: 'Soporte' },
                { to: '/status', icon: Activity, label: 'Estado de Servicios' },
            ],
        },
        {
            id: 'perfil', label: 'Perfil y Seguridad', icon: Shield,
            items: [
                { to: '/kyc', icon: BadgeCheck, label: 'Verificación de Identidad' },
                { to: '/settings#security', icon: Shield, label: 'Seguridad de la Cuenta' },
                { to: '/settings', icon: Settings, label: 'Configuración' },
            ],
        },
    ];

    const findActiveGroup = () => {
        const path = location.pathname;
        for (const g of NAV_GROUPS) {
            if (g.items.some((it) => it.to.split(/[?#]/)[0] === path)) return g.id;
        }
        if (path.startsWith('/wallet')) return 'banca';
        if (path.startsWith('/withdraw')) return 'retiros';
        return 'principal';
    };

    const adminLinks = [
        { to: '/admin', icon: Shield, label: 'Panel Admin' },
        { to: '/admin/activity', icon: Activity, label: 'Monitor Actividad' },
        { to: '/admin/login-history', icon: History, label: 'Historial Accesos' },
        { to: '/admin/online-users', icon: Wifi, label: 'Usuarios Conectados' },
        { to: '/admin/credits', icon: PlusCircle, label: 'Agregar Saldo' },
        { to: '/admin/crypto-payments', icon: Bitcoin, label: 'Pagos Crypto' },
        { to: '/admin/action-center', icon: ShieldAlert, label: 'Centro de Acciones' },
        { to: '/admin/crypto-monitor', icon: Radar, label: 'Monitor Blockchain' },
        { to: '/admin/wallets', icon: Wallet, label: 'Wallets de Plataforma' },
        { to: '/admin/pending-abonos', icon: Receipt, label: 'Abonos Pendientes' },
        { to: '/admin/crypto-stats', icon: BarChart3, label: 'Analíticas Crypto' },
        { to: '/admin/users', icon: Users, label: 'Usuarios Registrados' },
        { to: '/admin/zero-balance', icon: UserX, label: 'Saldo Cero' },
        { to: '/admin/community-progress', icon: Activity, label: 'Avance Comunidad' },
        { to: '/admin/share-analytics', icon: Share2, label: 'Share Analytics' },
        { to: '/admin/admin-ops', icon: FileText, label: 'Auditoría Admin' },
        { to: '/admin/audit-history', icon: History, label: 'Historial de auditoría' },
        { to: '/admin/system-status', icon: Server, label: 'System Status' },
        { to: '/admin/proofs', icon: ImageIcon, label: 'Comprobantes' },
        { to: '/admin/journey-analytics', icon: Activity, label: 'Journey Analytics' },
        { to: '/admin/transactions', icon: ClipboardList, label: 'Transacciones' },
        { to: '/admin/withdrawals', icon: Upload, label: 'Retiros Pendientes' },
        { to: '/admin/kyc', icon: BadgeCheck, label: 'Solicitudes KYC' },
        { to: '/admin/treasury', icon: Vault, label: 'Tesorería' },
        { to: '/admin/support', icon: MessageSquare, label: 'Tickets Soporte' },
        { to: '/admin/broadcast', icon: Megaphone, label: 'Difusion a Usuarios' },
        { to: '/admin/mt5-invest', icon: Bitcoin, label: 'Depositos MT5 Invest' },
        { to: '/admin/partial-unlock', icon: Unlock, label: 'Desbloqueos 40%' },
        { to: '/admin/exchange-rates', icon: RefreshCw, label: 'Tasas Multidivisa' },
        { to: '/admin/bank-withdrawals', icon: Banknote, label: 'Retiros Bancarios' },
        { to: '/admin/bank-transfers', icon: Building2, label: 'Transferencias Bancarias' },
        { to: '/admin/bank-certificates', icon: FileText, label: 'Justificantes Bancarios' },
        { to: '/admin/client-import', icon: FileSpreadsheet, label: 'Importar clientes' },
        { to: '/admin/client-import/analytics', icon: TrendingUp, label: 'Analytics importación' },
        { to: '/admin/reactivation', icon: Mail, label: 'Reactivación · Overview' },
        { to: '/admin/email-campaign', icon: Mail, label: 'Email · Campaña' },
    ];

    const NavLinks = ({ links }) => (
        <nav className="space-y-0.5 group/nav">
            {links.map((link) => (
                <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                        `group relative flex items-center gap-3 px-4 py-2.5 rounded-md transition-all duration-300 ease-out touch-manipulation overflow-hidden ${
                            isActive
                                ? 'sb-active bg-gradient-to-r from-cyan-500/20 via-[#1973B8]/15 to-transparent text-white font-semibold shadow-[inset_0_0_0_1px_rgba(124,177,229,0.18)]'
                                : 'text-slate-400/90 hover:bg-gradient-to-r hover:from-cyan-500/15 hover:via-white/[0.06] hover:to-transparent hover:text-white active:bg-white/10 group-hover/nav:opacity-70 hover:!opacity-100'
                        }`
                    }
                >
                    {/* Left accent bar — visible on hover (subtle) and active (bold) */}
                    <span
                        aria-hidden="true"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-gradient-to-b from-cyan-300 to-[#1973B8] transition-all duration-300
                                   h-0 opacity-0
                                   group-hover:h-6 group-hover:opacity-80
                                   group-[.sb-active]:h-8 group-[.sb-active]:opacity-100 group-[.sb-active]:shadow-[0_0_8px_rgba(34,211,238,0.6)]"
                    />
                    {/* Icon with glow + grow on hover/active */}
                    <link.icon
                        className="w-[18px] h-[18px] flex-shrink-0 transition-all duration-300 ease-out origin-center
                                   group-hover:scale-125 group-hover:text-cyan-300 group-hover:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.65))]
                                   group-[.sb-active]:scale-110 group-[.sb-active]:text-cyan-300 group-[.sb-active]:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.7))]"
                    />
                    {/* Label with subtle grow on hover */}
                    <span
                        className="text-[13px] lg:text-sm relative z-10 transition-all duration-300 ease-out origin-left
                                   group-hover:scale-[1.07] group-hover:tracking-wide
                                   group-[.sb-active]:scale-[1.03]"
                        style={{ fontWeight: 500 }}
                    >
                        {t(link.label)}
                    </span>
                    {/* Unread badge — pulsing cyan pill */}
                    {link.badge > 0 && (
                        <span
                            data-testid={`sidebar-badge-${link.to.replace(/\//g, '')}`}
                            className="ml-auto relative z-10 min-w-[18px] h-[18px] px-1 rounded-full bg-cyan-500 text-black
                                       text-[10px] font-bold flex items-center justify-center animate-pulse"
                        >
                            {link.badge > 9 ? '9+' : link.badge}
                        </span>
                    )}
                </NavLink>
            ))}
        </nav>
    );

    const SidebarContent = () => (
        <div className="flex flex-col h-full">
            {/* Logo header — BBVA navy style */}
            <div className="p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                        <div
                            className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-white/15"
                            style={{ background: 'rgba(255,255,255,0.06)' }}
                        >
                            <img
                                src="/lionsbit-logo.jpg"
                                alt="Lionsbit Verificación"
                                className="w-full h-full object-cover"
                                draggable="false"
                            />
                        </div>
                        <div className="leading-tight min-w-0">
                            <h1
                                className="text-white truncate"
                                style={{ fontFamily: 'Poppins', fontSize: '0.95rem', fontWeight: 600, letterSpacing: '-0.01em' }}
                            >
                                LIONSBIT
                            </h1>
                            <p
                                className="text-[#7CB1E5] tracking-[0.18em] uppercase truncate"
                                style={{ fontSize: '0.56rem', fontWeight: 600 }}
                            >
                                Verificación
                            </p>
                        </div>
                    </div>
                    <NotificationBell />
                </div>
            </div>

            {/* User Links — grouped accordion */}
            <div className="flex-1 p-4 overflow-y-auto">
                <div className="space-y-1" data-testid="sidebar-nav-groups">
                    {NAV_GROUPS.map((group) => {
                        const activeGroupId = findActiveGroup();
                        const isOpen = openGroup ? openGroup === group.id : activeGroupId === group.id;
                        const groupHasActive = activeGroupId === group.id;
                        const groupBadge = group.items.reduce((acc, it) => acc + (it.badge || 0), 0);
                        return (
                            <div key={group.id} data-testid={`sidebar-group-${group.id}`}>
                                <button
                                    onClick={() => setOpenGroup(isOpen ? '__none__' : group.id)}
                                    data-testid={`sidebar-group-toggle-${group.id}`}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md transition-colors duration-200 touch-manipulation ${
                                        groupHasActive
                                            ? 'text-white bg-white/[0.06]'
                                            : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                    }`}
                                >
                                    <group.icon className={`w-[17px] h-[17px] flex-shrink-0 ${groupHasActive ? 'text-cyan-300' : ''}`} />
                                    <span className="text-[12px] uppercase tracking-[0.08em] flex-1 text-left" style={{ fontWeight: 600 }}>
                                        {t(group.label)}
                                    </span>
                                    {groupBadge > 0 && !isOpen && (
                                        <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-cyan-500 text-black text-[9px] font-bold flex items-center justify-center">
                                            {groupBadge > 9 ? '9+' : groupBadge}
                                        </span>
                                    )}
                                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {isOpen && (
                                    <div className="ml-3 pl-3 border-l space-y-0.5 py-1" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                                        <NavLinks links={group.items} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {isAdmin && (
                    <>
                        <p className="text-[10px] text-slate-500 uppercase tracking-[0.14em] px-4 mb-2 mt-6" style={{ fontWeight: 600 }}>
                            Administración
                        </p>
                        <NavLinks links={adminLinks} />
                    </>
                )}
            </div>

            {/* User Info & Logout */}
            <div className="p-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.15)' }}>
                <div className="flex items-center gap-3 px-3 py-2.5 mb-2">
                    {!isAdmin ? (
                        <SidebarHealthRing user={user} />
                    ) : (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1973B8, #004481)' }}>
                            <span className="text-sm text-white" style={{ fontWeight: 600 }}>
                                {user?.name?.charAt(0).toUpperCase()}
                            </span>
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-[13px] text-white truncate" style={{ fontWeight: 600 }}>{user?.name}</p>
                            {getVerificationBadge()}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                        </div>
                        {!isAdmin && <div className="mt-1"><LevelBadge /></div>}
                    </div>
                    {isAdmin && (
                        <span className="px-2 py-0.5 text-[10px] bg-[#1973B8]/20 text-[#7CB1E5] border border-[#1973B8]/30 rounded" style={{ fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            Admin
                        </span>
                    )}
                </div>
                <div className="mb-2 flex justify-end">
                    <ConnectionIndicator variant="sidebar" />
                </div>
                <div className="mb-2.5">
                    <LanguageSwitcher variant="sidebar" />
                </div>
                <Button
                    variant="ghost"
                    className="w-full justify-start text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 mb-1"
                    onClick={async () => {
                        try {
                            const mod = await import('../onboarding/OnboardingTour');
                            mod.triggerOnboardingTour();
                        } catch (e) { /* silent */ }
                    }}
                    data-testid="retake-tour-btn"
                >
                    <Sparkles className="w-4 h-4 mr-2.5" />
                    <span className="text-[12px]">Volver a ver el tour</span>
                </Button>
                <Button
                    variant="ghost"
                    className="w-full justify-start text-slate-300 hover:text-rose-300 hover:bg-rose-500/10"
                    onClick={handleLogout}
                    data-testid="logout-btn"
                >
                    <LogOut className="w-4 h-4 mr-2.5" />
                    <span className="text-[13px]">{t('Cerrar Sesión')}</span>
                </Button>
            </div>
        </div>
    );

    return (
        <>
            {/* Mobile Menu Button */}
            <Button
                variant="ghost"
                size="icon"
                className="fixed top-3 left-3 z-50 lg:hidden w-11 h-11 rounded-lg shadow-md text-white touch-manipulation"
                style={{ background: '#050505', border: '1px solid rgba(255,255,255,0.12)' }}
                onClick={() => setMobileOpen(!mobileOpen)}
                data-testid="mobile-menu-btn"
            >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>

            {/* Mobile Overlay */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Sidebar - Mobile */}
            <aside
                className={`fixed inset-y-0 left-0 z-40 w-64 border-r transform transition-transform duration-300 lg:hidden ${
                    mobileOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
                style={{ background: '#050505', borderColor: 'rgba(255,255,255,0.08)' }}
            >
                <SidebarContent />
            </aside>

            {/* Sidebar - Desktop */}
            <aside
                className="hidden lg:block fixed inset-y-0 left-0 w-64 border-r"
                style={{ background: '#050505', borderColor: 'rgba(255,255,255,0.08)' }}
            >
                <SidebarContent />
            </aside>
        </>
    );
};
