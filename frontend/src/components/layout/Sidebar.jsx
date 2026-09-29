import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n/LanguageContext';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { ConnectionIndicator } from '../ConnectionIndicator';
import { SidebarHealthRing } from './SidebarHealthRing';
import { NotificationBell } from '../NotificationBell';
import { LevelBadge } from '../dashboard/LevelBadge';
import {
    LogOut, Menu, X, BadgeCheck, AlertTriangle, Sparkles, ChevronDown,
    PanelLeftClose, PanelLeftOpen, Wrench, Crown, Search,
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { Button } from '../ui/button';
import { messagesAPI } from '../../lib/api';
import { USER_NAV, ADMIN_NAV, ADMIN_SECTION, canAccess, findActiveGroupId } from '../../config/navigation';
import { useSidebarCollapsed } from '../../hooks/useSidebarCollapsed';
import { SidebarSearch } from './SidebarSearch';

const pathOf = (to) => to.split(/[?#]/)[0];

export const Sidebar = () => {
    const { user, logout, isAdmin } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const t = useT();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [collapsed, setCollapsed] = useSidebarCollapsed();
    const [openGroup, setOpenGroup] = useState(null);
    const [openAdminGroup, setOpenAdminGroup] = useState(null);
    const [unreadTickets, setUnreadTickets] = useState(0);
    const role = user?.role || 'user';

    useEffect(() => { setOpenGroup(null); setOpenAdminGroup(null); setMobileOpen(false); }, [location.pathname, location.search, location.hash]);

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

    const badges = { tickets: unreadTickets };
    const fullPath = location.pathname + location.search + location.hash;

    const adminNav = useMemo(() => ADMIN_NAV
        .map((g) => ({ ...g, items: g.items.filter((it) => canAccess(role, it.minRole)) }))
        .filter((g) => g.items.length > 0 && canAccess(role, g.minRole)), [role]);

    const exactMatchExists = useMemo(() => {
        const all = [...USER_NAV, ...adminNav].flatMap((g) => [...(g.items || []), ...(g.tools || [])]);
        return all.some((it) => it.to === fullPath);
    }, [fullPath, adminNav]);

    const isItemActive = (item) => {
        if (item.to === fullPath) return true;
        if (item.end) return location.pathname === item.to && !exactMatchExists;
        return pathOf(item.to) === location.pathname && item.to === pathOf(item.to) && !exactMatchExists;
    };

    const activeUserGroup = findActiveGroupId(USER_NAV, location.pathname, location.search, location.hash);
    const activeAdminGroup = location.pathname.startsWith('/admin')
        ? (findActiveGroupId(adminNav, location.pathname, location.search, location.hash) || 'adm-control')
        : null;

    const handleLogout = () => { logout(); navigate('/login'); };

    const getVerificationBadge = () => {
        const status = user?.verification_status;
        if (status === 'verified') return <BadgeCheck className="w-4 h-4 text-emerald-400" />;
        if (status === 'pending_verification') return <AlertTriangle className="w-4 h-4 text-amber-400" />;
        return null;
    };

    /* ── Link ── */
    const NavItem = ({ item, accent = 'cyan', rail = false }) => {
        const collapsed = rail;
        const active = isItemActive(item);
        const badge = item.badgeKey ? badges[item.badgeKey] : 0;
        const tone = accent === 'amber'
            ? { active: 'from-amber-500/20 via-amber-500/10', hover: 'hover:from-amber-500/15', icon: 'text-amber-300', bar: 'from-amber-300 to-amber-600', glow: 'rgba(251,191,36,0.6)' }
            : { active: 'from-cyan-500/20 via-[#1973B8]/15', hover: 'hover:from-cyan-500/15', icon: 'text-cyan-300', bar: 'from-cyan-300 to-[#1973B8]', glow: 'rgba(34,211,238,0.6)' };
        return (
            <Link
                to={item.to}
                title={t(item.label)}
                onClick={() => setMobileOpen(false)}
                data-testid={`nav-${pathOf(item.to).replace(/^\//, '').replace(/\//g, '-') || 'root'}${item.to.includes('?') || item.to.includes('#') ? '-' + item.to.split(/[?#]/)[1].replace(/[^a-z0-9]/gi, '') : ''}`}
                className={`group relative flex items-center gap-3 ${collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2'} rounded-md transition-all duration-200 ease-out touch-manipulation overflow-hidden ${
                    active
                        ? `bg-gradient-to-r ${tone.active} to-transparent text-white font-semibold shadow-[inset_0_0_0_1px_rgba(124,177,229,0.18)]`
                        : `text-slate-400/90 hover:bg-gradient-to-r ${tone.hover} hover:via-white/[0.06] hover:to-transparent hover:text-white`
                }`}
                aria-current={active ? 'page' : undefined}
            >
                {!collapsed && (
                    <span aria-hidden="true" className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-gradient-to-b ${tone.bar} transition-all duration-200 ${active ? 'h-7 opacity-100' : 'h-0 opacity-0 group-hover:h-5 group-hover:opacity-70'}`}
                        style={active ? { boxShadow: `0 0 8px ${tone.glow}` } : undefined} />
                )}
                <item.icon className={`w-[17px] h-[17px] flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${active ? tone.icon : ''}`} />
                {!collapsed && (
                    <span className="text-[12.5px] lg:text-[13px] relative z-10 truncate" style={{ fontWeight: 500 }}>{t(item.label)}</span>
                )}
                {badge > 0 && (
                    <span data-testid={`sidebar-badge-${pathOf(item.to).replace(/\//g, '')}`}
                        className={`${collapsed ? 'absolute top-1 right-1' : 'ml-auto'} relative z-10 min-w-[17px] h-[17px] px-1 rounded-full bg-cyan-500 text-black text-[10px] font-bold flex items-center justify-center animate-pulse`}>
                        {badge > 9 ? '9+' : badge}
                    </span>
                )}
            </Link>
        );
    };

    /* ── Group (accordion) ── */
    const NavGroup = ({ group, isOpen, hasActive, onToggle, accent = 'cyan', rail = false }) => {
        const collapsed = rail;
        const groupBadge = [...(group.items || []), ...(group.tools || [])].reduce((a, it) => a + (it.badgeKey ? badges[it.badgeKey] || 0 : 0), 0);
        const activeCls = accent === 'amber' ? 'text-amber-200 bg-amber-500/[0.08]' : 'text-white bg-white/[0.06]';
        const iconCls = accent === 'amber' ? 'text-amber-300' : 'text-cyan-300';
        if (collapsed) {
            return (
                <button
                    onClick={() => { setCollapsed(false); onToggle(true); }}
                    title={t(group.label)}
                    data-testid={`sidebar-group-toggle-${group.id}`}
                    className={`relative w-full flex items-center justify-center py-2.5 rounded-md transition-colors ${hasActive ? activeCls : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                >
                    <group.icon className={`w-[18px] h-[18px] ${hasActive ? iconCls : ''}`} />
                    {groupBadge > 0 && <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
                </button>
            );
        }
        return (
            <div data-testid={`sidebar-group-${group.id}`}>
                <button
                    onClick={() => onToggle(!isOpen)}
                    data-testid={`sidebar-group-toggle-${group.id}`}
                    aria-expanded={isOpen}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors duration-200 touch-manipulation ${hasActive ? activeCls : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                >
                    <group.icon className={`w-[17px] h-[17px] flex-shrink-0 ${hasActive ? iconCls : ''}`} />
                    <span className="text-[11.5px] uppercase tracking-[0.08em] flex-1 text-left truncate" style={{ fontWeight: 600 }}>{t(group.label)}</span>
                    {groupBadge > 0 && !isOpen && (
                        <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-cyan-500 text-black text-[9px] font-bold flex items-center justify-center">{groupBadge > 9 ? '9+' : groupBadge}</span>
                    )}
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                    <div className="ml-3 pl-2.5 border-l space-y-0.5 py-1" style={{ borderColor: accent === 'amber' ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.1)' }}>
                        {group.items.map((it) => <NavItem key={it.to} item={it} accent={accent} rail={rail} />)}
                        {group.tools?.length > 0 && (
                            <>
                                <p className="flex items-center gap-1.5 px-3 pt-2.5 pb-1 text-[9.5px] uppercase tracking-[0.14em] text-slate-500" style={{ fontWeight: 600 }}>
                                    <Wrench className="w-3 h-3" /> {t('Herramientas')}
                                </p>
                                {group.tools.map((it) => <NavItem key={it.to} item={it} accent={accent} rail={rail} />)}
                            </>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const SidebarContent = ({ rail = false }) => {
        const collapsed = rail;
        return (
        <div className="flex flex-col h-full">
            {/* Header · marca */}
            <div className={`${collapsed ? 'p-3' : 'p-5'} border-b`} style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'justify-between gap-2'}`}>
                    <Link to="/dashboard" className="flex items-center gap-3 min-w-0" data-testid="sidebar-brand">
                        <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-white/15" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <img src="/lionsbit-logo.jpg" alt="Lionsbit Verificación" className="w-full h-full object-cover" draggable="false" />
                        </div>
                        {!collapsed && (
                            <div className="leading-tight min-w-0">
                                <h1 className="text-white truncate" style={{ fontFamily: 'Poppins', fontSize: '0.95rem', fontWeight: 600, letterSpacing: '-0.01em' }}>LIONSBIT</h1>
                                <p className="text-[#7CB1E5] tracking-[0.18em] uppercase truncate" style={{ fontSize: '0.56rem', fontWeight: 600 }}>Verificación</p>
                            </div>
                        )}
                    </Link>
                    <NotificationBell />
                </div>
            </div>

            <div className={`flex-1 ${collapsed ? 'px-2 py-3' : 'p-3'} overflow-y-auto overflow-x-hidden`}>
                {/* Buscador rápido del menú */}
                {collapsed ? (
                    <button onClick={() => setCollapsed(false)} title="Buscar sección" data-testid="sidebar-search-rail"
                        className="w-full flex items-center justify-center py-2.5 mb-1 rounded-md text-slate-400 hover:bg-white/5 hover:text-white transition-colors">
                        <Search className="w-[18px] h-[18px]" />
                    </button>
                ) : (
                    <SidebarSearch groups={isAdmin ? [...USER_NAV, ...adminNav] : USER_NAV} t={t} onNavigate={() => setMobileOpen(false)} />
                )}
                {/* Navegación de usuario */}
                <div className="space-y-0.5" data-testid="sidebar-nav-groups">
                    {USER_NAV.map((group) => {
                        const hasActive = activeUserGroup === group.id;
                        const isOpen = openGroup ? openGroup === group.id : hasActive;
                        return (
                            <NavGroup key={group.id} group={group} isOpen={isOpen} hasActive={hasActive} rail={rail}
                                onToggle={(open) => setOpenGroup(open ? group.id : '__none__')} />
                        );
                    })}
                </div>

                {/* Administración · sección separada */}
                {isAdmin && canAccess(role, ADMIN_SECTION.minRole) && (
                    <div className={`mt-5 pt-4 border-t ${collapsed ? '' : 'rounded-xl px-1 pb-2'}`}
                        style={{ borderColor: 'rgba(251,191,36,0.25)', background: collapsed ? 'transparent' : 'linear-gradient(180deg, rgba(251,191,36,0.05), rgba(0,0,0,0))' }}
                        data-testid="sidebar-admin-section">
                        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2 px-3'} mb-2`}>
                            <ADMIN_SECTION.icon className="w-3.5 h-3.5 text-amber-300" />
                            {!collapsed && (
                                <>
                                    <p className="text-[10px] text-amber-300 uppercase tracking-[0.16em] flex-1" style={{ fontWeight: 700 }}>{t(ADMIN_SECTION.label)}</p>
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider bg-amber-500/15 text-amber-200 border border-amber-500/30" style={{ fontWeight: 700 }} data-testid="sidebar-role-badge">
                                        {role === 'superadmin' && <Crown className="w-3 h-3" />}{role === 'superadmin' ? 'Superadmin' : 'Admin'}
                                    </span>
                                </>
                            )}
                        </div>
                        <div className="space-y-0.5">
                            {adminNav.map((group) => {
                                const hasActive = activeAdminGroup === group.id;
                                const isOpen = openAdminGroup ? openAdminGroup === group.id : hasActive;
                                return (
                                    <NavGroup key={group.id} group={group} isOpen={isOpen} hasActive={hasActive} accent="amber" rail={rail}
                                        onToggle={(open) => setOpenAdminGroup(open ? group.id : '__none__')} />
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Usuario · acciones */}
            <div className={`${collapsed ? 'p-2' : 'p-4'} border-t`} style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.15)' }}>
                {!collapsed && (
                    <div className="flex items-center gap-3 px-3 py-2.5 mb-2">
                        {!isAdmin ? <SidebarHealthRing user={user} /> : (
                            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1973B8, #004481)' }}>
                                <span className="text-sm text-white" style={{ fontWeight: 600 }}>{user?.name?.charAt(0).toUpperCase()}</span>
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-[13px] text-white truncate" style={{ fontWeight: 600 }}>{user?.name}</p>
                                {getVerificationBadge()}
                            </div>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">{user?.email}</p>
                            {!isAdmin && <div className="mt-1"><LevelBadge /></div>}
                        </div>
                        {isAdmin && (
                            <span className="px-2 py-0.5 text-[10px] bg-[#1973B8]/20 text-[#7CB1E5] border border-[#1973B8]/30 rounded" style={{ fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                {role === 'superadmin' ? 'Super' : 'Admin'}
                            </span>
                        )}
                    </div>
                )}
                {!collapsed && (
                    <>
                        <div className="mb-2 flex justify-end"><ConnectionIndicator variant="sidebar" /></div>
                        <div className="mb-2.5"><LanguageSwitcher variant="sidebar" /></div>
                        <Button variant="ghost" className="w-full justify-start text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 mb-1"
                            onClick={async () => { try { const mod = await import('../onboarding/OnboardingTour'); mod.triggerOnboardingTour(); } catch (e) { /* silent */ } }}
                            data-testid="retake-tour-btn">
                            <Sparkles className="w-4 h-4 mr-2.5" /><span className="text-[12px]">Volver a ver el tour</span>
                        </Button>
                    </>
                )}
                <Button variant="ghost" className={`w-full ${collapsed ? 'justify-center px-0' : 'justify-start'} text-slate-300 hover:text-rose-300 hover:bg-rose-500/10`}
                    onClick={handleLogout} data-testid="logout-btn" title={t('Cerrar Sesión')}>
                    <LogOut className={`w-4 h-4 ${collapsed ? '' : 'mr-2.5'}`} />
                    {!collapsed && <span className="text-[13px]">{t('Cerrar Sesión')}</span>}
                </Button>
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className={`hidden lg:flex w-full items-center ${collapsed ? 'justify-center' : 'justify-start gap-2.5 px-3'} mt-1 py-2 rounded-md text-slate-500 hover:text-white hover:bg-white/5 transition-colors`}
                    title={collapsed ? 'Expandir menú' : 'Contraer menú'}
                    data-testid="sidebar-collapse-toggle"
                >
                    {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <><PanelLeftClose className="w-4 h-4" /><span className="text-[11.5px]">Contraer menú</span></>}
                </button>
            </div>
        </div>
        );
    };

    return (
        <>
            <Button variant="ghost" size="icon"
                className="fixed top-3 left-3 z-50 lg:hidden w-11 h-11 rounded-lg shadow-md text-white touch-manipulation"
                style={{ background: '#050505', border: '1px solid rgba(255,255,255,0.12)' }}
                onClick={() => setMobileOpen(!mobileOpen)} data-testid="mobile-menu-btn" aria-label="Menú">
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>

            {mobileOpen && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden" onClick={() => setMobileOpen(false)} />}

            {/* Móvil: drawer siempre expandido */}
            <aside className={`fixed inset-y-0 left-0 z-40 w-[280px] max-w-[85vw] border-r transform transition-transform duration-300 lg:hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
                style={{ background: '#050505', borderColor: 'rgba(255,255,255,0.08)' }} data-testid="sidebar-mobile">
                <SidebarContent rail={false} />
            </aside>

            {/* Escritorio: rail colapsable */}
            <aside className={`hidden lg:block fixed inset-y-0 left-0 border-r transition-[width] duration-300 ${collapsed ? 'w-[76px]' : 'w-64'}`}
                style={{ background: '#050505', borderColor: 'rgba(255,255,255,0.08)' }} data-testid="sidebar-desktop" data-collapsed={collapsed ? 'true' : 'false'}>
                <SidebarContent rail={collapsed} />
            </aside>
        </>
    );
};
