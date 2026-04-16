import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
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
    LineChart
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { ChevronDown } from 'lucide-react';

export const Sidebar = () => {
    const { user, logout, isAdmin } = useAuth();
    const navigate = useNavigate();
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
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/trading-demo', icon: LineChart, label: 'Trading Demo' },
        { to: '/investing-pro', icon: TrendingUp, label: 'InvestingPro' },
        { to: '/advisors', icon: Users, label: 'Asesores y Analistas' },
    ];
    const userLinksBottom = [
        { to: '/transactions', icon: ClipboardList, label: 'Transactions' },
        { to: '/bank-transfer', icon: Banknote, label: 'Transferencia Bancaria' },
        { to: '/bitcoin-outputs', icon: Hash, label: 'Bitcoin Outputs' },
        { to: '/transfer', icon: ArrowLeftRight, label: 'Transfer' },
        { to: '/withdraw', icon: Upload, label: 'Withdraw' },
        { to: '/withdraw-methods', icon: CreditCard, label: 'Metodos de Retiro' },
        { to: '/binance-wallet', icon: Bitcoin, label: 'Wallet / Activos' },
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
        { to: '/admin/transactions', icon: ClipboardList, label: 'Transacciones' },
        { to: '/admin/withdrawals', icon: Upload, label: 'Retiros Pendientes' },
        { to: '/admin/kyc', icon: BadgeCheck, label: 'Solicitudes KYC' },
        { to: '/admin/treasury', icon: Vault, label: 'Tesorería' },
        { to: '/admin/support', icon: MessageSquare, label: 'Tickets Soporte' },
    ];

    const NavLinks = ({ links }) => (
        <nav className="space-y-1">
            {links.map((link) => (
                <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                        `flex items-center gap-3 px-4 py-4 lg:py-3 rounded-lg transition-colors duration-200 touch-manipulation ${
                            isActive
                                ? 'bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500'
                                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 active:bg-slate-800'
                        }`
                    }
                >
                    <link.icon className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm lg:text-base" style={{ fontWeight: 500 }}>{link.label}</span>
                </NavLink>
            ))}
        </nav>
    );

    const SidebarContent = () => (
        <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="p-6 border-b border-slate-800">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                            <Shield className="w-6 h-6 text-emerald-400" />
                        </div>
                        <div>
                            <h1 className="text-lg text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>LIONSBIT VERIFICACION</h1>
                            <p className="text-xs text-slate-500 font-light">Plataforma de Verificación Digital</p>
                        </div>
                    </div>
                    <NotificationBell />
                </div>
            </div>

            {/* User Links */}
            <div className="flex-1 p-4 overflow-y-auto">
                <p className="text-xs text-slate-500 uppercase tracking-wider px-4 mb-3" style={{ fontWeight: 500 }}>
                    Banca
                </p>
                <NavLinks links={userLinksTop} />

                {/* Accounts Collapsible with Tx Pagadas / Tx Recibidas */}
                <div className="space-y-0.5" data-testid="sidebar-accounts-group">
                    <button
                        onClick={() => setAccountsOpen(!accountsOpen)}
                        data-testid="sidebar-accounts-toggle"
                        className={`w-full flex items-center gap-3 px-4 py-4 lg:py-3 rounded-lg transition-colors duration-200 touch-manipulation ${
                            accountsOpen
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 active:bg-slate-800'
                        }`}
                    >
                        <Wallet className="w-5 h-5 flex-shrink-0" />
                        <span className="text-sm lg:text-base flex-1 text-left" style={{ fontWeight: 500 }}>Accounts</span>
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${accountsOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {accountsOpen && (
                        <div className="ml-4 pl-4 border-l border-slate-800 space-y-0.5" data-testid="sidebar-accounts-submenu">
                            <NavLink
                                to="/accounts"
                                onClick={() => setMobileOpen(false)}
                                data-testid="sidebar-accounts-link"
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-200 ${
                                        isActive
                                            ? 'bg-emerald-500/10 text-emerald-400'
                                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                                    }`
                                }
                            >
                                <Wallet className="w-4 h-4 flex-shrink-0" />
                                <span style={{ fontWeight: 500 }}>Mis Cuentas</span>
                            </NavLink>
                            <button
                                onClick={() => window.open('https://gz.blockchair.com/bitcoin/inputs/', '_blank')}
                                data-testid="sidebar-tx-paid-btn"
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-orange-500/10 hover:text-orange-400 transition-colors duration-200"
                            >
                                <ArrowUpRight className="w-4 h-4 flex-shrink-0" />
                                <span style={{ fontWeight: 500 }}>Tx Pagadas</span>
                                <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                            </button>
                            <button
                                onClick={() => window.open('https://gz.blockchair.com/bitcoin/outputs/', '_blank')}
                                data-testid="sidebar-tx-received-btn"
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors duration-200"
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
                <p className="text-xs text-slate-500 uppercase tracking-wider px-4 mb-3 mt-6" style={{ fontWeight: 500 }}>
                    Análisis Financiero
                </p>
                <NavLinks links={cryptoLinks} />

                {isAdmin && (
                    <>
                        <p className="text-xs text-slate-500 uppercase tracking-wider px-4 mb-3 mt-6" style={{ fontWeight: 500 }}>
                            Administración
                        </p>
                        <NavLinks links={adminLinks} />
                    </>
                )}
            </div>

            {/* User Info & Logout */}
            <div className="p-4 border-t border-slate-800">
                <div className="flex items-center gap-3 px-4 py-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                        <span className="text-sm text-white" style={{ fontWeight: 500 }}>
                            {user?.name?.charAt(0).toUpperCase()}
                        </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-sm text-white truncate" style={{ fontWeight: 500 }}>{user?.name}</p>
                            {getVerificationBadge()}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-slate-500 truncate font-light">{user?.email}</p>
                        </div>
                        {!isAdmin && <div className="mt-1"><LevelBadge /></div>}
                    </div>
                    {isAdmin && (
                        <span className="px-2 py-1 text-xs bg-emerald-500/20 text-emerald-400 rounded" style={{ fontWeight: 500 }}>
                            Admin
                        </span>
                    )}
                </div>
                <Button
                    variant="ghost"
                    className="w-full justify-start text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                    onClick={handleLogout}
                    data-testid="logout-btn"
                >
                    <LogOut className="w-5 h-5 mr-3" />
                    Cerrar Sesión
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
                className="fixed top-3 left-3 z-50 lg:hidden w-12 h-12 bg-slate-900/90 backdrop-blur-sm border border-slate-800 rounded-xl touch-manipulation"
                onClick={() => setMobileOpen(!mobileOpen)}
                data-testid="mobile-menu-btn"
            >
                {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </Button>

            {/* Mobile Overlay */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Sidebar - Mobile */}
            <aside
                className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-950 border-r border-slate-800 transform transition-transform duration-300 lg:hidden ${
                    mobileOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                <SidebarContent />
            </aside>

            {/* Sidebar - Desktop */}
            <aside className="hidden lg:block fixed inset-y-0 left-0 w-64 bg-slate-950 border-r border-slate-800">
                <SidebarContent />
            </aside>
        </>
    );
};
