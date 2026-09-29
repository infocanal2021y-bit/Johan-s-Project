import {
    LayoutDashboard, BarChart3, Users, Receipt, BadgeCheck, TrendingUp, Landmark, PieChart, History,
    LineChart, Bot, Calculator, Wallet, Building2, ArrowLeftRight, Banknote, ClipboardList, Bitcoin, Boxes,
    Upload, Send, CreditCard, Award, FileText, CandlestickChart, Newspaper, Radio, RefreshCw, Scale, Globe,
    Bell, MessageSquare, PhoneCall, Megaphone, FolderKanban, HeadphonesIcon, Activity, Shield, Settings,
    UserCircle2, KeyRound, Crown, ShieldAlert, Server, Wifi, UserX, FileSpreadsheet, Mail, Vault, PlusCircle,
    MessageCircleQuestion, Unlock, Radar, Image as ImageIcon, FileCheck, Share2, Lock,
} from 'lucide-react';

/* Niveles de acceso. Un único SUPERADMIN concentra el acceso administrativo total;
   `minRole` en cada grupo/ítem prepara la arquitectura sin alterar los permisos actuales. */
export const ROLE_LEVELS = { user: 0, admin: 1, superadmin: 2 };
export const canAccess = (role, minRole = 'user') => (ROLE_LEVELS[role] ?? 0) >= (ROLE_LEVELS[minRole] ?? 0);

/* ───────────── NAVEGACIÓN DE USUARIO ─────────────
   items: opciones principales · tools: herramientas complementarias (misma sección, visualmente secundarias) */
export const USER_NAV = [
    {
        id: 'principal', label: 'Principal', icon: LayoutDashboard,
        items: [
            { to: '/command-center', icon: LayoutDashboard, label: 'Centro de Control' },
            { to: '/dashboard', icon: BarChart3, label: 'Dashboard' },
            { to: '/community', icon: Users, label: 'Comunidad' },
            { to: '/retiros-recientes', icon: Receipt, label: 'Retiros Recientes' },
            { to: '/transacciones-autorizadas', icon: BadgeCheck, label: 'Transacciones Autorizadas' },
        ],
    },
    {
        id: 'trading', label: 'Inversiones y Trading', icon: TrendingUp, prefixes: ['/mt5', '/trading', '/investing', '/investment', '/portfolio', '/advisors'],
        items: [
            { to: '/mt5?tab=funds', icon: Landmark, label: 'Depósitos MT5 Invest' },
            { to: '/portfolio', icon: PieChart, label: 'Rendimiento' },
            { to: '/mt5?tab=history', icon: History, label: 'Historial de Inversiones' },
        ],
        tools: [
            { to: '/investing-pro', icon: TrendingUp, label: 'InvestingPro' },
            { to: '/trading-demo', icon: LineChart, label: 'Trading Demo' },
            { to: '/trading-bot', icon: Bot, label: 'Trading Bot' },
            { to: '/advisors', icon: Users, label: 'Asesores y Analistas' },
            { to: '/investment-simulator', icon: Calculator, label: 'Proyecciones' },
        ],
    },
    {
        id: 'banca', label: 'Banca y Cuentas', icon: Wallet, prefixes: ['/accounts', '/wallet/multi-currency', '/wallet/vault', '/binance-wallet', '/transfer', '/bank-transfer', '/transactions'],
        items: [
            { to: '/accounts', icon: Wallet, label: 'Mis Cuentas Bancarias' },
            { to: '/bank-transfer', icon: Building2, label: 'Transferencias Bancarias' },
            { to: '/wallet/multi-currency', icon: Banknote, label: 'Tasas Multidivisa' },
            { to: '/transactions', icon: ClipboardList, label: 'Movimientos' },
        ],
        tools: [
            { to: '/transfer', icon: ArrowLeftRight, label: 'Transferencias Internas' },
            { to: '/binance-wallet', icon: Bitcoin, label: 'Wallet / Activos' },
            { to: '/wallet/vault', icon: Boxes, label: 'Vault Blockchain' },
        ],
    },
    {
        id: 'retiros', label: 'Retiros', icon: Upload, prefixes: ['/withdraw', '/wallet/solicitar-retiro', '/wallet/bank-withdrawal', '/wallet/retiro-btc', '/wallet/plan-retiros', '/retiro-especial-45', '/pagos-servicios', '/fiscal-documents', '/complete-withdrawal'],
        items: [
            { to: '/wallet/solicitar-retiro', icon: Send, label: 'Solicitar Retiro' },
            { to: '/retiros-recientes', icon: Receipt, label: 'Retiros Recientes' },
            { to: '/transactions?filter=withdraw', icon: History, label: 'Historial de Retiros' },
            { to: '/wallet/bank-withdrawal', icon: Banknote, label: 'Retiros Bancarios' },
            { to: '/wallet/retiro-btc', icon: Bitcoin, label: 'Retiros BTC' },
            { to: '/retiro-especial-45', icon: Award, label: 'Retiros Especiales +45' },
        ],
        tools: [
            { to: '/withdraw', icon: Upload, label: 'Nuevo Retiro' },
            { to: '/wallet/plan-retiros', icon: ClipboardList, label: 'Plan de Retiros' },
            { to: '/pagos-servicios', icon: CreditCard, label: 'Pagos de Servicios' },
            { to: '/withdraw-methods', icon: CreditCard, label: 'Métodos de Retiro' },
            { to: '/fiscal-documents', icon: FileText, label: 'Documentación Fiscal' },
        ],
    },
    {
        id: 'mercados', label: 'Mercados y Análisis', icon: CandlestickChart, prefixes: ['/realtime-market', '/crypto-market', '/live-news', '/converter', '/investment-comparator', '/global-market-map', '/market-reports', '/alerts'],
        items: [
            { to: '/realtime-market', icon: CandlestickChart, label: 'Cotizaciones' },
            { to: '/market-reports', icon: Newspaper, label: 'Estadísticas' },
        ],
        tools: [
            { to: '/crypto-market', icon: TrendingUp, label: 'Mercado Cripto' },
            { to: '/live-news', icon: Radio, label: 'Noticias en Vivo' },
            { to: '/converter', icon: RefreshCw, label: 'Conversor' },
            { to: '/investment-comparator', icon: Scale, label: 'Comparador' },
            { to: '/global-market-map', icon: Globe, label: 'Mapa Global' },
            { to: '/alerts', icon: Bell, label: 'Alertas' },
        ],
    },
    {
        id: 'soporte', label: 'Soporte y Comunicación', icon: MessageSquare, prefixes: ['/messages', '/support', '/solicitar-llamada', '/communications', '/notifications', '/cases', '/status'],
        items: [
            { to: '/messages', icon: MessageSquare, label: 'Tickets', badgeKey: 'tickets' },
            { to: '/solicitar-llamada', icon: PhoneCall, label: 'Citas de Llamada' },
            { to: '/communications', icon: Megaphone, label: 'Comunicaciones' },
        ],
        tools: [
            { to: '/support', icon: HeadphonesIcon, label: 'Centro de Ayuda' },
            { to: '/notifications', icon: Bell, label: 'Notificaciones' },
            { to: '/cases', icon: FolderKanban, label: 'Mis Casos PLB' },
            { to: '/status', icon: Activity, label: 'Estado de Servicios' },
        ],
    },
    {
        id: 'perfil', label: 'Perfil y Seguridad', icon: Shield, prefixes: ['/settings', '/kyc'],
        items: [
            { to: '/settings', icon: UserCircle2, label: 'Mi Perfil' },
            { to: '/settings#security', icon: KeyRound, label: 'Seguridad' },
            { to: '/settings#access', icon: History, label: 'Historial de Accesos' },
            { to: '/kyc', icon: BadgeCheck, label: 'Verificación / KYC' },
        ],
    },
];

/* ───────────── ADMINISTRACIÓN (visible sólo para admin / superadmin) ───────────── */
export const ADMIN_NAV = [
    {
        id: 'adm-control', label: 'Control', icon: ShieldAlert,
        items: [
            { to: '/admin/super-editor', icon: Crown, label: 'Editor Superadmin', minRole: 'superadmin' },
            { to: '/admin', icon: Shield, label: 'Panel Admin', end: true },
            { to: '/admin/action-center', icon: ShieldAlert, label: 'Centro de Acciones' },
            { to: '/admin/activity', icon: Activity, label: 'Monitor Actividad' },
            { to: '/admin/system-status', icon: Server, label: 'System Status' },
        ],
    },
    {
        id: 'adm-usuarios', label: 'Usuarios', icon: Users,
        items: [
            { to: '/admin/users', icon: Users, label: 'Usuarios Registrados' },
            { to: '/admin/online-users', icon: Wifi, label: 'Usuarios Conectados' },
            { to: '/admin/kyc', icon: BadgeCheck, label: 'Solicitudes KYC' },
            { to: '/admin/zero-balance', icon: UserX, label: 'Saldo Cero' },
            { to: '/admin/client-import', icon: FileSpreadsheet, label: 'Importar Clientes' },
            { to: '/admin/client-import/analytics', icon: TrendingUp, label: 'Analytics Importación' },
            { to: '/admin/reactivation', icon: Mail, label: 'Reactivación · Overview' },
        ],
    },
    {
        id: 'adm-tesoreria', label: 'Tesorería', icon: Vault,
        items: [
            { to: '/admin/treasury', icon: Vault, label: 'Tesorería' },
            { to: '/admin/credits', icon: PlusCircle, label: 'Agregar Saldo' },
            { to: '/admin/pending-abonos', icon: Receipt, label: 'Abonos Pendientes' },
            { to: '/admin/wallets', icon: Wallet, label: 'Wallets de Plataforma' },
            { to: '/admin/exchange-rates', icon: RefreshCw, label: 'Tasas Multidivisa' },
        ],
    },
    {
        id: 'adm-retiros', label: 'Retiros', icon: Upload,
        items: [
            { to: '/admin/withdrawals', icon: Upload, label: 'Retiros Pendientes' },
            { to: '/admin/questions', icon: MessageCircleQuestion, label: 'Preguntas de Retiros' },
            { to: '/admin/partial-unlock', icon: Unlock, label: 'Desbloqueos 40%' },
            { to: '/admin/bank-withdrawals', icon: Banknote, label: 'Retiros Bancarios' },
            { to: '/admin/btc-withdrawals', icon: Bitcoin, label: 'Retiros BTC' },
            { to: '/admin/special45', icon: Award, label: 'Retiros Especiales +45' },
        ],
    },
    {
        id: 'adm-pagos', label: 'Pagos', icon: CreditCard,
        items: [
            { to: '/admin/crypto-payments', icon: Bitcoin, label: 'Pagos Crypto' },
            { to: '/admin/service-payments', icon: CreditCard, label: 'Pagos Stripe' },
            { to: '/admin/transactions', icon: ClipboardList, label: 'Transacciones' },
            { to: '/admin/mt5-invest', icon: Landmark, label: 'Depósitos MT5 Invest' },
            { to: '/admin/bank-transfers', icon: Building2, label: 'Transferencias Bancarias' },
        ],
    },
    {
        id: 'adm-blockchain', label: 'Blockchain', icon: Radar,
        items: [
            { to: '/admin/crypto-monitor', icon: Radar, label: 'Monitor Blockchain' },
            { to: '/admin/crypto-stats', icon: BarChart3, label: 'Analíticas Crypto' },
        ],
    },
    {
        id: 'adm-documentos', label: 'Documentos', icon: FileCheck,
        items: [
            { to: '/admin/proofs', icon: ImageIcon, label: 'Comprobantes' },
            { to: '/admin/bank-certificates', icon: FileText, label: 'Justificantes Bancarios' },
            { to: '/admin/fiscal-documents', icon: FileCheck, label: 'Documentos Fiscales' },
        ],
    },
    {
        id: 'adm-comunidad', label: 'Comunidad', icon: Users,
        items: [
            { to: '/admin/community-posts', icon: Newspaper, label: 'Publicaciones Comunidad' },
            { to: '/admin/community-progress', icon: Activity, label: 'Avance Comunidad' },
            { to: '/admin/share-analytics', icon: Share2, label: 'Share Analytics' },
        ],
    },
    {
        id: 'adm-soporte', label: 'Soporte', icon: HeadphonesIcon,
        items: [
            { to: '/admin/support', icon: MessageSquare, label: 'Tickets Soporte' },
            { to: '/admin/callbacks', icon: PhoneCall, label: 'Citas de Llamada' },
        ],
    },
    {
        id: 'adm-comunicaciones', label: 'Comunicaciones', icon: Megaphone,
        items: [
            { to: '/admin/broadcast', icon: Megaphone, label: 'Difusión a Usuarios' },
            { to: '/admin/email-campaign', icon: Mail, label: 'Email · Campaña' },
            { to: '/admin/weekly-digest', icon: Newspaper, label: 'Resumen Semanal' },
        ],
    },
    {
        id: 'adm-auditoria', label: 'Analítica y Auditoría', icon: FileText,
        items: [
            { to: '/admin/journey-analytics', icon: Activity, label: 'Journey Analytics' },
            { to: '/admin/admin-ops', icon: FileText, label: 'Auditoría Admin' },
            { to: '/admin/audit-history', icon: History, label: 'Historial de Auditoría' },
            { to: '/admin/login-history', icon: History, label: 'Historial de Accesos' },
        ],
    },
];

export const ADMIN_SECTION = { label: 'Administración', icon: Lock, minRole: 'admin' };

const pathOf = (to) => to.split(/[?#]/)[0];

export const findActiveGroupId = (groups, pathname, search = '', hash = '') => {
    const full = pathname + search + hash;
    for (const g of groups) {
        const all = [...(g.items || []), ...(g.tools || [])];
        if (all.some((it) => it.to === full)) return g.id;
    }
    for (const g of groups) {
        const all = [...(g.items || []), ...(g.tools || [])];
        if (all.some((it) => pathOf(it.to) === pathname)) return g.id;
    }
    for (const g of groups) {
        if ((g.prefixes || []).some((p) => pathname.startsWith(p))) return g.id;
    }
    return null;
};
