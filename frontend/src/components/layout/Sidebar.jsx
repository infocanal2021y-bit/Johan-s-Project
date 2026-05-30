import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n/LanguageContext';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { ConnectionIndicator } from '../ConnectionIndicator';
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
    Share2,
    FileText,
    Server,
    Image as ImageIcon
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { ChevronDown } from 'lucide-react';

export const Sidebar = () => {
    const { user, logout, isAdmin } = useAuth();
    const navigate = useNavigate();
    const t = useT();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [accountsOpen, setAccountsOpen] = useState(false);

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

    // User links - split for blockchain insertion after Accounts
    const userLinksTop = [
        { to: '/command-center', icon: LayoutDashboard, label: 'Command Center', highlight: true },
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/trading-demo', icon: LineChart, label: 'Trading Demo' },
        { to: '/trading-bot', icon: Bot, label: 'Trading Bot' },
        { to: '/mt5', icon: Landmark, label: 'MT5 Profesional' },
        { to: '/investing-pro', icon: TrendingUp, label: 'InvestingPro' },
        { to: '/advisors', icon: Users, label: 'Asesores y Analistas' },
        { to: '/community', icon: Users, label: 'Comunidad' },
    ];
    const userLinksBottom = [
        { to: '/transactions', icon: ClipboardList, label: 'Transactions' },
        { to: '/bank-transfer', icon: Banknote, label: 'Transferencia Bancaria' },
        { to: '/bitcoin-outputs', icon: Hash, label: 'Bitcoin Outputs' },
        { to: '/transfer', icon: ArrowLeftRight, label: 'Transfer' },
        { to: '/withdraw', icon: Upload, label: 'Withdraw' },
        { to: '/withdraw-methods', icon: CreditCard, label: 'Metodos de Retiro' },
        { to: '/binance-wallet', icon: Bitcoin, label: 'Wallet / Activos' },
        { to: '/wallet/multi-currency', icon: Wallet, label: 'Cuenta Multidivisa' },
        { to: '/wallet/bank-withdrawal', icon: Send, label: 'Retiro a Banco' },
        { to: '/wallet/vault', icon: Boxes, label: 'Vault Blockchain' },
        { to: '/achievements', icon: Trophy, label: 'Logros' },
        { to: '/kyc', icon: BadgeCheck, label: 'Verification' },
        { to: '/support', icon: HeadphonesIcon, label: 'Support' },
        { to: '/settings', icon: Settings, label: 'Settings' },
    ];

    // Crypto/Finance links
    const cryptoLinks = [
        { to: '/realtime-market', icon: CandlestickChart, label: 'Mercado en Vivo' },
        { to: '/crypto-market', icon: TrendingUp, label: 'Mercado Cripto' },
        { to: '/converter', icon: RefreshCw, label: 'Conversor' },
        { to: '/investment-simulator', icon: Calculator, label: 'Proyecciones' },
        { to: '/portfolio', icon: PieChart, label: 'Portafolio' },
        { to: '/alerts', icon: Bell, label: 'Alertas' },
        { to: '/market-reports', icon: Newspaper, label: 'Reportes' },
        { to: '/investment-comparator', icon: Scale, label: 'Comparador' },
        { to: '/global-market-map', icon: Globe, label: 'Mapa Global' },
        { to: '/live-news', icon: Radio, label: 'Noticias en Vivo' },
    ];

    const adminLinks = [
        { to: '/admin', icon: Shield, label: 'Panel Admin' },
        { to: '/admin/activity', icon: Activity, label: 'Monitor Actividad' },
        { to: '/admin/login-history', icon: History, label: 'Historial Accesos' },
        { to: '/admin/online-users', icon: Wifi, label: 'Usuarios Conectados' },
        { to: '/admin/credits', icon: PlusCircle, label: 'Agregar Saldo' },
        { to: '/admin/crypto-payments', icon: Bitcoin, label: 'Pagos Crypto' },
        { to: '/admin/crypto-stats', icon: BarChart3, label: 'Analíticas Crypto' },
        { to: '/admin/users', icon: Users, label: 'Usuarios Registrados' },
        { to: '/admin/community-progress', icon: Activity, label: 'Avance Comunidad' },
        { to: '/admin/share-analytics', icon: Share2, label: 'Share Analytics' },
        { to: '/admin/admin-ops', icon: FileText, label: 'Auditoría Admin' },
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
        { to: '/admin/client-import', icon: FileSpreadsheet, label: 'Importar clientes' },
        { to: '/admin/client-import/analytics', icon: TrendingUp, label: 'Analytics importación' },
        { to: '/admin/reactivation', icon: Mail, label: 'Reactivación · Overview' },
        { to: '/admin/email-campaign', icon: Mail, label: 'Email · Campaña' },
    ];

    const NavLinks = ({ links }) => (
        <nav className="space-y-0.5">
            {links.map((link) => (
                <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                        `group relative flex items-center gap-3 px-4 py-2.5 rounded-md transition-all duration-200 ease-out touch-manipulation overflow-hidden ${
                            isActive
                                ? 'bg-white/10 text-white font-medium'
                                : 'text-slate-300 hover:bg-white/5 hover:text-white active:bg-white/10'
                        }`
                    }
                >
                    {/* Right accent bar on active */}
                    <span
                        aria-hidden="true"
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-r-full bg-[#1973B8] opacity-0 group-[.active]:opacity-100 transition-opacity duration-200"
                    />
                    <link.icon className="w-[18px] h-[18px] flex-shrink-0 transition-transform duration-200 group-hover:scale-105" />
                    <span className="text-[13px] lg:text-sm" style={{ fontWeight: 500 }}>{t(link.label)}</span>
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

            {/* User Links */}
            <div className="flex-1 p-4 overflow-y-auto">
                <p className="text-[10px] text-slate-500 uppercase tracking-[0.14em] px-4 mb-2" style={{ fontWeight: 600 }}>
                    {t('Banca')}
                </p>
                <NavLinks links={userLinksTop} />

                {/* Accounts Collapsible with Tx Pagadas / Tx Recibidas */}
                <div className="space-y-0.5" data-testid="sidebar-accounts-group">
                    <button
                        onClick={() => setAccountsOpen(!accountsOpen)}
                        data-testid="sidebar-accounts-toggle"
                        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md transition-colors duration-200 touch-manipulation ${
                            accountsOpen
                                ? 'bg-white/10 text-white'
                                : 'text-slate-300 hover:bg-white/5 hover:text-white active:bg-white/10'
                        }`}
                    >
                        <Wallet className="w-[18px] h-[18px] flex-shrink-0" />
                        <span className="text-[13px] lg:text-sm flex-1 text-left" style={{ fontWeight: 500 }}>{t('Accounts')}</span>
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${accountsOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {accountsOpen && (
                        <div className="ml-4 pl-4 border-l space-y-0.5" style={{ borderColor: 'rgba(255,255,255,0.1)' }} data-testid="sidebar-accounts-submenu">
                            <NavLink
                                to="/accounts"
                                onClick={() => setMobileOpen(false)}
                                data-testid="sidebar-accounts-link"
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-colors duration-200 ${
                                        isActive
                                            ? 'bg-white/10 text-white font-medium'
                                            : 'text-slate-300 hover:bg-white/5 hover:text-white'
                                    }`
                                }
                            >
                                <Wallet className="w-4 h-4 flex-shrink-0" />
                                <span style={{ fontWeight: 500 }}>Mis Cuentas</span>
                            </NavLink>
                            <button
                                onClick={() => window.open('https://gz.blockchair.com/bitcoin/inputs/', '_blank')}
                                data-testid="sidebar-tx-paid-btn"
                                className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] text-slate-300 hover:bg-white/5 hover:text-amber-300 transition-colors duration-200"
                            >
                                <ArrowUpRight className="w-4 h-4 flex-shrink-0" />
                                <span style={{ fontWeight: 500 }}>Tx Pagadas</span>
                                <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                            </button>
                            <button
                                onClick={() => window.open('https://gz.blockchair.com/bitcoin/outputs/', '_blank')}
                                data-testid="sidebar-tx-received-btn"
                                className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] text-slate-300 hover:bg-white/5 hover:text-emerald-300 transition-colors duration-200"
                            >
                                <ArrowDownLeft className="w-4 h-4 flex-shrink-0" />
                                <span style={{ fontWeight: 500 }}>Tx Recibidas</span>
                                <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                            </button>
                        </div>
                    )}
                </div>

                <NavLinks links={userLinksBottom} />

                {/* Crypto/Finance Section */}
                <p className="text-[10px] text-slate-500 uppercase tracking-[0.14em] px-4 mb-2 mt-6" style={{ fontWeight: 600 }}>
                    {t('Análisis Financiero')}
                </p>
                <NavLinks links={cryptoLinks} />

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
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1973B8, #004481)' }}>
                        <span className="text-sm text-white" style={{ fontWeight: 600 }}>
                            {user?.name?.charAt(0).toUpperCase()}
                        </span>
                    </div>
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
                style={{ background: '#072146', border: '1px solid rgba(255,255,255,0.12)' }}
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
                style={{ background: '#072146', borderColor: 'rgba(255,255,255,0.08)' }}
            >
                <SidebarContent />
            </aside>

            {/* Sidebar - Desktop */}
            <aside
                className="hidden lg:block fixed inset-y-0 left-0 w-64 border-r"
                style={{ background: '#072146', borderColor: 'rgba(255,255,255,0.08)' }}
            >
                <SidebarContent />
            </aside>
        </>
    );
};
