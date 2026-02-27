import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { NotificationBell } from '../notifications/NotificationBell';
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
    BarChart3
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';

export const Sidebar = () => {
    const { user, logout, isAdmin } = useAuth();
    const navigate = useNavigate();
    const [mobileOpen, setMobileOpen] = useState(false);

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

    // User links - removed Deposit (only admin can add balance now)
    const userLinks = [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/accounts', icon: Wallet, label: 'Accounts' },
        { to: '/transactions', icon: ClipboardList, label: 'Transactions' },
        { to: '/transfer', icon: ArrowLeftRight, label: 'Transfer' },
        { to: '/withdraw', icon: Upload, label: 'Withdraw' },
        { to: '/kyc', icon: BadgeCheck, label: 'Verification' },
    ];

    const adminLinks = [
        { to: '/admin', icon: Shield, label: 'Admin Dashboard' },
        { to: '/admin/credits', icon: PlusCircle, label: 'Add Balance' },
        { to: '/admin/crypto-payments', icon: Bitcoin, label: 'Crypto Payments' },
        { to: '/admin/crypto-stats', icon: BarChart3, label: 'Crypto Analytics' },
        { to: '/admin/users', icon: Users, label: 'Users' },
        { to: '/admin/transactions', icon: ClipboardList, label: 'All Transactions' },
        { to: '/admin/withdrawals', icon: Upload, label: 'Pending Withdrawals' },
        { to: '/admin/kyc', icon: BadgeCheck, label: 'KYC Requests' },
        { to: '/admin/treasury', icon: Vault, label: 'Treasury' },
    ];

    const NavLinks = ({ links }) => (
        <nav className="space-y-1">
            {links.map((link) => (
                <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                        `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
                            isActive
                                ? 'bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500'
                                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                        }`
                    }
                >
                    <link.icon className="w-5 h-5" />
                    <span className="font-medium">{link.label}</span>
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
                            <h1 className="font-heading text-lg font-bold text-white tracking-wide">LIONSBIT BANK</h1>
                            <p className="text-xs text-slate-500">Private Digital Banking Platform</p>
                        </div>
                    </div>
                    <NotificationBell />
                </div>
            </div>

            {/* User Links */}
            <div className="flex-1 p-4 overflow-y-auto">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider px-4 mb-3">
                    Banking
                </p>
                <NavLinks links={userLinks} />

                {isAdmin && (
                    <>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider px-4 mb-3 mt-8">
                            Administration
                        </p>
                        <NavLinks links={adminLinks} />
                    </>
                )}
            </div>

            {/* User Info & Logout */}
            <div className="p-4 border-t border-slate-800">
                <div className="flex items-center gap-3 px-4 py-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                        <span className="text-sm font-medium text-white">
                            {user?.name?.charAt(0).toUpperCase()}
                        </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                            {getVerificationBadge()}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                    </div>
                    {isAdmin && (
                        <span className="px-2 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-400 rounded">
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
                    Logout
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
                className="fixed top-4 left-4 z-50 lg:hidden"
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
