import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../../components/ui/hover-card';
import { Users, Edit, Shield, User, BadgeCheck, AlertTriangle, Ban, CheckCircle, Flame, Snowflake, TrendingUp, DollarSign, Search, Loader2, Activity, UserPlus, Wallet, FileCheck, Banknote, Copy, MinusCircle, History, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const DEBIT_REASON_PRESETS = [
    'Mantenimiento de cuenta',
    'Reversión de pago duplicado',
    'Ajuste operativo',
    'Comisión de retiro',
    'Corrección de saldo',
    'Penalización por incumplimiento',
];

const HEALTH_STYLES = {
    green:  { dot: 'bg-emerald-400', ring: 'ring-emerald-400/30', glow: 'shadow-[0_0_10px_rgba(52,211,153,0.6)]', label: 'Saludable',  text: 'text-emerald-300' },
    yellow: { dot: 'bg-amber-400',   ring: 'ring-amber-400/30',   glow: 'shadow-[0_0_10px_rgba(251,191,36,0.6)]', label: 'Atencion',   text: 'text-amber-300' },
    red:    { dot: 'bg-rose-500',    ring: 'ring-rose-500/30',    glow: 'shadow-[0_0_10px_rgba(244,63,94,0.7)]',  label: 'Critico',    text: 'text-rose-300' },
};

const HealthDot = ({ health, testId }) => {
    const level = health?.level || 'yellow';
    const style = HEALTH_STYLES[level] || HEALTH_STYLES.yellow;
    const reasons = Array.isArray(health?.reasons) ? health.reasons : [];

    return (
        <HoverCard openDelay={120} closeDelay={80}>
            <HoverCardTrigger asChild>
                <button
                    type="button"
                    aria-label={`Health: ${style.label}`}
                    data-testid={testId}
                    data-health-level={level}
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full hover:bg-slate-800/60 transition-colors"
                >
                    <span className={`relative w-2.5 h-2.5 rounded-full ${style.dot} ${style.glow} ring-2 ${style.ring}`}>
                        {level !== 'green' && (
                            <span className={`absolute inset-0 rounded-full ${style.dot} opacity-60 animate-ping`} />
                        )}
                    </span>
                </button>
            </HoverCardTrigger>
            <HoverCardContent
                side="right"
                align="start"
                className="w-72 bg-slate-950/95 border-slate-800 text-slate-200 backdrop-blur-xl"
                data-testid={testId ? `${testId}-tooltip` : undefined}
            >
                <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                        <Activity className={`w-4 h-4 ${style.text}`} />
                        <span className={`font-mono text-xs uppercase tracking-wider ${style.text}`}>
                            Estado · {style.label}
                        </span>
                    </div>
                    {reasons.length === 0 ? (
                        <p className="text-xs text-slate-400 leading-relaxed">
                            La cuenta esta provisionada, verificada y con acceso registrado.
                        </p>
                    ) : (
                        <ul className="space-y-1.5">
                            {reasons.map((r, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                                    <span className={`mt-1 w-1.5 h-1.5 rounded-full ${style.dot} flex-shrink-0`} />
                                    <span>{r}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {health?.flags && (
                        <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono uppercase tracking-wider">
                            <span className={health.flags.has_checking ? 'text-emerald-400' : 'text-rose-400'}>
                                {health.flags.has_checking ? 'OK' : '--'} Checking
                            </span>
                            <span className={health.flags.has_savings ? 'text-emerald-400' : 'text-slate-500'}>
                                {health.flags.has_savings ? 'OK' : '--'} Savings
                            </span>
                            <span className={health.flags.verified ? 'text-emerald-400' : 'text-amber-400'}>
                                {health.flags.verified ? 'OK' : '--'} KYC
                            </span>
                            <span className={health.flags.logged_in ? 'text-emerald-400' : 'text-slate-500'}>
                                {health.flags.logged_in ? 'OK' : '--'} Login
                            </span>
                        </div>
                    )}
                </div>
            </HoverCardContent>
        </HoverCard>
    );
};

const getScoreBadge = (score) => {
    switch (score) {
        case 'hot':
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30"><Flame className="w-3 h-3" />Alto</span>;
        case 'warm':
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30"><TrendingUp className="w-3 h-3" />Medio</span>;
        case 'cold':
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30"><Snowflake className="w-3 h-3" />Frio</span>;
        default:
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-700 text-slate-500">Sin datos</span>;
    }
};

const getVerificationBadge = (status) => {
    switch (status) {
        case 'verified':
            return <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400 flex items-center gap-1"><BadgeCheck className="w-3 h-3" /> Verificado</span>;
        case 'pending_verification':
            return <span className="px-2 py-1 rounded text-xs bg-cyan-500/20 text-cyan-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Pendiente</span>;
        default:
            return <span className="px-2 py-1 rounded text-xs bg-slate-700 text-slate-400">Sin verificar</span>;
    }
};

const getAccountStatusBadge = (status) => {
    switch (status) {
        case 'suspended':
            return <span className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400">Suspendido</span>;
        case 'under_review':
            return <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-400">En revision</span>;
        default:
            return <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400">Activo</span>;
    }
};

export const AdminUsersPage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [balanceUsd, setBalanceUsd] = useState('');
    const [balanceEur, setBalanceEur] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [roleDialogOpen, setRoleDialogOpen] = useState(false);
    const [newRole, setNewRole] = useState('');
    // Add balance dialog
    const [addBalanceOpen, setAddBalanceOpen] = useState(false);
    const [addBalanceUser, setAddBalanceUser] = useState(null);
    const [addAmount, setAddAmount] = useState('');
    const [addCurrency, setAddCurrency] = useState('USD');
    const [addDesc, setAddDesc] = useState('');
    const [addingBalance, setAddingBalance] = useState(false);

    // Debit balance dialog
    const [debitOpen, setDebitOpen] = useState(false);
    const [debitUser, setDebitUser] = useState(null);
    const [debitAmount, setDebitAmount] = useState('');
    const [debitCurrency, setDebitCurrency] = useState('USD');
    const [debitReason, setDebitReason] = useState('');
    const [debitNotify, setDebitNotify] = useState(true);
    const [debitConfirm, setDebitConfirm] = useState(false);
    const [debiting, setDebiting] = useState(false);

    // Admin transaction history dialog
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyUser, setHistoryUser] = useState(null);
    const [historyData, setHistoryData] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);

    const fetchUsers = async () => {
        try {
            const response = await adminAPI.getUsers();
            setUsers(response.data);
        } catch (error) {
            toast.error('Error al cargar usuarios');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchUsers(); }, []);

    const [healthFilter, setHealthFilter] = useState('all');  // all | green | yellow | red
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkSubject, setBulkSubject] = useState('Recordatorio de su cuenta LIONSBIT');
    const [bulkIntro, setBulkIntro] = useState('');
    const [bulkSending, setBulkSending] = useState(false);

    // Manual user creation
    const [createOpen, setCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState({
        name: '', email: '', phone: '', country_name: '', country_code: '',
        seed_balance_eur: '', seed_balance_usd: '', role: 'user', force_password_change: true,
    });
    const [creating, setCreating] = useState(false);
    const [createResult, setCreateResult] = useState(null);  // { user_id, temporary_password, provisioned }

    const resetCreateForm = () => {
        setCreateForm({
            name: '', email: '', phone: '', country_name: '', country_code: '',
            seed_balance_eur: '', seed_balance_usd: '', role: 'user', force_password_change: true,
        });
        setCreateResult(null);
    };

    const handleManualCreate = async () => {
        if (!createForm.name.trim()) { toast.error('Nombre requerido'); return; }
        if (!createForm.email.trim() || !createForm.email.includes('@')) { toast.error('Email valido requerido'); return; }
        setCreating(true);
        try {
            const token = localStorage.getItem('token');
            const payload = {
                name: createForm.name.trim(),
                email: createForm.email.trim().toLowerCase(),
                phone: createForm.phone.trim() || null,
                country_code: createForm.country_code.trim() || null,
                country_name: createForm.country_name.trim() || null,
                seed_balance_eur: parseFloat(createForm.seed_balance_eur) || 0,
                seed_balance_usd: parseFloat(createForm.seed_balance_usd) || 0,
                role: createForm.role,
                force_password_change: createForm.force_password_change,
            };
            const resp = await fetch(`${API_URL}/api/admin/users/manual-create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const data = await resp.json();
            if (resp.ok) {
                toast.success(`Usuario ${createForm.name} creado y estructura financiera lista`);
                setCreateResult({
                    user_id: data.user_id,
                    email: payload.email,
                    name: payload.name,
                    temporary_password: data.temporary_password,
                    provisioned: data.provisioned,
                    seed_eur: payload.seed_balance_eur,
                    seed_usd: payload.seed_balance_usd,
                });
                fetchUsers();
            } else {
                toast.error(data.detail || 'Error creando usuario');
            }
        } catch (e) {
            toast.error('Error de red');
        } finally {
            setCreating(false);
        }
    };

    const healthCounts = users.reduce((acc, u) => {
        const lvl = u.health?.level || 'yellow';
        acc[lvl] = (acc[lvl] || 0) + 1;
        return acc;
    }, { green: 0, yellow: 0, red: 0 });

    const filteredUsers = users.filter(u => {
        if (healthFilter !== 'all' && (u.health?.level || 'yellow') !== healthFilter) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    });

    const handleBulkNotify = async () => {
        if (!bulkSubject.trim()) { toast.error('El asunto es obligatorio'); return; }
        if (healthFilter === 'all') { toast.error('Selecciona un nivel de health'); return; }
        setBulkSending(true);
        try {
            const token = localStorage.getItem('token');
            const resp = await fetch(`${API_URL}/api/admin/users/bulk-notify-by-health`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ level: healthFilter, subject: bulkSubject, intro: bulkIntro }),
            });
            const data = await resp.json();
            if (resp.ok) {
                toast.success(`Notificación enviada a ${data.sent} usuarios (${data.failed} fallidos)`);
                setBulkOpen(false);
                setBulkIntro('');
            } else {
                toast.error(data.detail || 'Error enviando notificación');
            }
        } catch (e) {
            toast.error('Error de red');
        } finally {
            setBulkSending(false);
        }
    };

    const handleEditBalance = (user, account) => {
        setSelectedUser(user);
        setSelectedAccount(account);
        setBalanceUsd(account.balance_usd.toString());
        setBalanceEur(account.balance_eur.toString());
        setDialogOpen(true);
    };

    const handleSaveBalance = async () => {
        try {
            await adminAPI.updateBalance({
                account_id: selectedAccount.id,
                balance_usd: parseFloat(balanceUsd),
                balance_eur: parseFloat(balanceEur),
            });
            toast.success('Saldo actualizado correctamente');
            setDialogOpen(false);
            fetchUsers();
        } catch (error) {
            toast.error('Error al actualizar saldo');
        }
    };

    const handleOpenAddBalance = (user) => {
        setAddBalanceUser(user);
        setAddAmount('');
        setAddCurrency('USD');
        setAddDesc('');
        setAddBalanceOpen(true);
    };

    const handleAddBalance = async () => {
        const amount = parseFloat(addAmount);
        if (!amount || amount <= 0) { toast.error('Ingrese un monto valido'); return; }
        setAddingBalance(true);
        try {
            const token = localStorage.getItem('token');
            const resp = await fetch(`${API_URL}/api/admin/add-balance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    user_id: addBalanceUser.id,
                    amount,
                    currency: addCurrency,
                    description: addDesc || `Saldo agregado por administrador`
                })
            });
            const data = await resp.json();
            if (resp.ok) {
                toast.success(`$${amount.toLocaleString()} ${addCurrency} agregados a ${addBalanceUser.name}`);
                setAddBalanceOpen(false);
                fetchUsers();
            } else {
                toast.error(data.detail || 'Error al agregar saldo');
            }
        } catch (e) {
            toast.error('Error de conexion');
        } finally {
            setAddingBalance(false);
        }
    };

    const handleOpenDebit = (user) => {
        setDebitUser(user);
        setDebitAmount('');
        setDebitCurrency('USD');
        setDebitReason('Mantenimiento de cuenta');
        setDebitNotify(true);
        setDebitConfirm(false);
        setDebitOpen(true);
    };

    const handleDebit = async () => {
        const amount = parseFloat(debitAmount);
        if (!amount || amount <= 0) { toast.error('Ingrese un monto valido'); return; }
        if (!debitReason.trim() || debitReason.trim().length < 3) {
            toast.error('El motivo es obligatorio (min. 3 caracteres)');
            return;
        }
        if (!debitConfirm) {
            toast.error('Debe confirmar la operacion');
            return;
        }
        setDebiting(true);
        try {
            const token = localStorage.getItem('token');
            const resp = await fetch(`${API_URL}/api/admin/debit-balance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    user_id: debitUser.id,
                    amount,
                    currency: debitCurrency,
                    reason: debitReason.trim(),
                    notify_user: debitNotify,
                })
            });
            // Robust parse: production may return HTML 404/502 if endpoint not deployed
            let data = null;
            const ctype = resp.headers.get('content-type') || '';
            if (ctype.includes('application/json')) {
                try { data = await resp.json(); } catch (_) { data = null; }
            } else {
                const txt = await resp.text();
                data = { _raw: txt.slice(0, 200) };
            }
            if (resp.ok) {
                toast.success(
                    `Debitado ${amount.toLocaleString()} ${debitCurrency} de ${debitUser.name}` +
                    (debitNotify ? ' · Email enviado' : '')
                );
                setDebitOpen(false);
                fetchUsers();
            } else if (resp.status === 404) {
                toast.error('Endpoint no disponible en este entorno. Si esto es PRODUCCION, redeploy desde "Save to GitHub → Deploy".');
            } else if (resp.status === 401 || resp.status === 403) {
                toast.error('Sesion expirada o sin permisos. Vuelva a iniciar sesion.');
            } else {
                toast.error((data && data.detail) || `Error ${resp.status} al debitar`);
            }
        } catch (e) {
            toast.error(`Fallo de red: ${e.message || 'sin detalle'}`);
        } finally {
            setDebiting(false);
        }
    };

    const handleOpenHistory = async (user) => {
        setHistoryUser(user);
        setHistoryData(null);
        setHistoryOpen(true);
        setHistoryLoading(true);
        try {
            const res = await adminAPI.getUserAdminTransactions(user.id);
            setHistoryData(res.data);
        } catch (e) {
            toast.error('Error al cargar historial');
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleEditRole = (user) => {
        setSelectedUser(user);
        setNewRole(user.role);
        setRoleDialogOpen(true);
    };

    const handleSaveRole = async () => {
        try {
            await adminAPI.updateUserRole({ user_id: selectedUser.id, role: newRole });
            toast.success('Rol actualizado correctamente');
            setRoleDialogOpen(false);
            fetchUsers();
        } catch (error) {
            toast.error('Error al actualizar rol');
        }
    };

    const handleSuspendUser = async (userId, action) => {
        try {
            await adminAPI.suspendUser({ user_id: userId, action });
            toast.success(action === 'suspend' ? 'Usuario suspendido' : 'Usuario activado');
            fetchUsers();
        } catch (error) {
            toast.error('Error al actualizar estado');
        }
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-6" data-testid="admin-users-page">
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-white">Usuarios Registrados</h1>
                            <p className="text-slate-500 mt-1">Gestionar usuarios, saldos y puntuacion de interes</p>
                        </div>
                        <Button
                            onClick={() => { resetCreateForm(); setCreateOpen(true); }}
                            data-testid="manual-create-user-btn"
                            className="bg-gradient-to-br from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white font-semibold shadow-[0_0_20px_rgba(34,211,238,0.35)] h-10 px-5"
                        >
                            <UserPlus className="w-4 h-4 mr-2" />
                            Nuevo Usuario
                        </Button>
                    </div>
                </motion.div>

                {/* Health filter chips + bulk-notify */}
                <div className="flex flex-wrap items-center gap-2" data-testid="health-filter-bar">
                    {[
                        { key: 'all',    label: 'Todos',     count: users.length,                  cls: 'bg-slate-800 text-slate-200 border-slate-700' },
                        { key: 'green',  label: 'Saludable', count: healthCounts.green || 0,       cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
                        { key: 'yellow', label: 'Atencion',  count: healthCounts.yellow || 0,      cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
                        { key: 'red',    label: 'Critico',   count: healthCounts.red || 0,         cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
                    ].map(chip => {
                        const active = healthFilter === chip.key;
                        return (
                            <button
                                key={chip.key}
                                type="button"
                                onClick={() => setHealthFilter(chip.key)}
                                data-testid={`health-filter-${chip.key}`}
                                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono uppercase tracking-wider border transition-all ${chip.cls} ${active ? 'ring-2 ring-cyan-400/60 shadow-[0_0_14px_rgba(34,211,238,0.35)]' : 'opacity-70 hover:opacity-100'}`}
                            >
                                {chip.key !== 'all' && (
                                    <span className={`w-2 h-2 rounded-full ${
                                        chip.key === 'green' ? 'bg-emerald-400' :
                                        chip.key === 'yellow' ? 'bg-amber-400' : 'bg-rose-500'
                                    }`} />
                                )}
                                <span>{chip.label}</span>
                                <span className="font-bold">{chip.count}</span>
                            </button>
                        );
                    })}

                    {healthFilter !== 'all' && filteredUsers.length > 0 && (
                        <Button
                            size="sm"
                            onClick={() => setBulkOpen(true)}
                            data-testid="bulk-notify-btn"
                            className="ml-auto bg-cyan-500 hover:bg-cyan-600 text-white text-xs h-9"
                        >
                            <Activity className="w-3.5 h-3.5 mr-1.5" />
                            Notificar a {filteredUsers.length} usuarios
                        </Button>
                    )}
                </div>

                {/* Search */}
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                        placeholder="Buscar por nombre o email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10 bg-slate-900 border-slate-800 text-white"
                        data-testid="users-search"
                    />
                </div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader className="border-b border-slate-800">
                            <CardTitle className="text-white font-heading flex items-center gap-2">
                                <Users className="w-5 h-5 text-emerald-400" />
                                Usuarios Registrados ({filteredUsers.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-8 space-y-4">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="h-16 bg-slate-800/50 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : (
                                <>
                                {/* Desktop Table */}
                                <div className="hidden md:block overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-800 hover:bg-transparent">
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Usuario</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase text-center" data-testid="users-th-health">Health</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Interes</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Rol</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">KYC</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Estado</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Saldos</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase text-right">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredUsers.map((user) => {
                                                const checkingAcc = user.accounts?.find(a => a.account_type === 'checking');
                                                const savingsAcc = user.accounts?.find(a => a.account_type === 'savings');
                                                return (
                                                    <TableRow key={user.id} className="border-slate-800/50 hover:bg-slate-800/30" data-testid={`user-row-${user.id}`}>
                                                        <TableCell>
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                                                                    <span className="text-sm font-medium text-white">{user.name?.charAt(0).toUpperCase()}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="font-medium text-white">{user.name}</span>
                                                                    <p className="text-xs text-slate-500">{user.email}</p>
                                                                    {user.phone && <p className="text-[10px] text-slate-600">{user.phone}</p>}
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <HealthDot health={user.health} testId={`health-${user.id}`} />
                                                        </TableCell>
                                                        <TableCell>{getScoreBadge(user.interest_score)}</TableCell>
                                                        <TableCell>
                                                            <span className={`px-2 py-1 rounded text-xs font-medium ${user.role === 'admin' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300'}`}>
                                                                {user.role === 'admin' ? 'Admin' : 'Usuario'}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>{getVerificationBadge(user.verification_status)}</TableCell>
                                                        <TableCell>{getAccountStatusBadge(user.account_status)}</TableCell>
                                                        <TableCell>
                                                            <div className="space-y-1 text-xs font-mono">
                                                                <p className="text-slate-400">
                                                                    Corriente: <span className="text-white">${checkingAcc?.balance_usd?.toFixed(2) || '0.00'}</span>
                                                                    {checkingAcc && (
                                                                        <Button variant="ghost" size="icon" className="h-5 w-5 ml-1" onClick={() => handleEditBalance(user, checkingAcc)}>
                                                                            <Edit className="w-3 h-3 text-slate-400" />
                                                                        </Button>
                                                                    )}
                                                                </p>
                                                                <p className="text-slate-400">
                                                                    Ahorro: <span className="text-white">${savingsAcc?.balance_usd?.toFixed(2) || '0.00'}</span>
                                                                    {savingsAcc && (
                                                                        <Button variant="ghost" size="icon" className="h-5 w-5 ml-1" onClick={() => handleEditBalance(user, savingsAcc)}>
                                                                            <Edit className="w-3 h-3 text-slate-400" />
                                                                        </Button>
                                                                    )}
                                                                </p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-2.5 text-xs"
                                                                    onClick={() => handleOpenAddBalance(user)} data-testid={`add-balance-${user.id}`}>
                                                                    <DollarSign className="w-3.5 h-3.5 mr-1" />Saldo
                                                                </Button>
                                                                <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white h-8 px-2.5 text-xs"
                                                                    onClick={() => handleOpenDebit(user)} data-testid={`debit-balance-${user.id}`}>
                                                                    <MinusCircle className="w-3.5 h-3.5 mr-1" />Debitar
                                                                </Button>
                                                                <Button size="sm" variant="outline" className="border-slate-700 hover:bg-slate-800 h-8 px-2 text-xs"
                                                                    onClick={() => handleOpenHistory(user)} data-testid={`history-${user.id}`} title="Historial admin">
                                                                    <History className="w-3.5 h-3.5" />
                                                                </Button>
                                                                <Button size="sm" variant="outline" className="border-slate-700 hover:bg-slate-800 h-8 px-2.5 text-xs"
                                                                    onClick={() => handleEditRole(user)} data-testid={`edit-role-${user.id}`}>
                                                                    {user.role === 'admin' ? <Shield className="w-3.5 h-3.5 mr-1" /> : <User className="w-3.5 h-3.5 mr-1" />}Rol
                                                                </Button>
                                                                {user.account_status === 'active' || user.account_status === 'under_review' ? (
                                                                    <Button size="sm" variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10 h-8 px-2.5 text-xs"
                                                                        onClick={() => handleSuspendUser(user.id, 'suspend')} data-testid={`suspend-${user.id}`}>
                                                                        <Ban className="w-3.5 h-3.5 mr-1" />Susp.
                                                                    </Button>
                                                                ) : (
                                                                    <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 h-8 px-2.5 text-xs"
                                                                        onClick={() => handleSuspendUser(user.id, 'activate')} data-testid={`activate-${user.id}`}>
                                                                        <CheckCircle className="w-3.5 h-3.5 mr-1" />Act.
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                                {/* Mobile Cards */}
                                <div className="md:hidden divide-y divide-slate-800/50">
                                    {filteredUsers.map((user) => {
                                        const checkingAcc = user.accounts?.find(a => a.account_type === 'checking');
                                        return (
                                            <div key={user.id} className="p-4 space-y-3" data-testid={`mobile-user-${user.id}`}>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                                                            <span className="text-sm font-medium text-white">{user.name?.charAt(0).toUpperCase()}</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium text-white text-sm">{user.name}</span>
                                                            <p className="text-xs text-slate-500">{user.email}</p>
                                                        </div>
                                                    </div>
                                                    {getScoreBadge(user.interest_score)}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <HealthDot health={user.health} testId={`mobile-health-${user.id}`} />
                                                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                                                        {HEALTH_STYLES[user.health?.level || 'yellow'].label}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                    <div><span className="text-slate-500">Rol:</span> <span className={`ml-1 ${user.role === 'admin' ? 'text-amber-400' : 'text-slate-300'}`}>{user.role === 'admin' ? 'Admin' : 'Usuario'}</span></div>
                                                    <div><span className="text-slate-500">KYC:</span> <span className="ml-1">{getVerificationBadge(user.verification_status)}</span></div>
                                                    <div><span className="text-slate-500">USD:</span> <span className="text-emerald-400 ml-1">${checkingAcc?.balance_usd?.toFixed(2) || '0.00'}</span></div>
                                                    <div><span className="text-slate-500">EUR:</span> <span className="text-emerald-400 ml-1">{checkingAcc?.balance_eur?.toFixed(2) || '0.00'}</span></div>
                                                </div>
                                                <div className="flex gap-2 flex-wrap">
                                                    <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9" onClick={() => handleOpenAddBalance(user)}>
                                                        <DollarSign className="w-3 h-3 mr-1" />Saldo
                                                    </Button>
                                                    <Button size="sm" className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-xs h-9" onClick={() => handleOpenDebit(user)} data-testid={`mobile-debit-${user.id}`}>
                                                        <MinusCircle className="w-3 h-3 mr-1" />Debitar
                                                    </Button>
                                                    <Button size="sm" variant="outline" className="border-slate-700 text-xs h-9 px-3" onClick={() => handleOpenHistory(user)} title="Historial">
                                                        <History className="w-3 h-3" />
                                                    </Button>
                                                    <Button size="sm" variant="outline" className="border-slate-700 text-xs h-9" onClick={() => handleEditRole(user)}><Shield className="w-3 h-3 mr-1" />Rol</Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Add Balance Dialog */}
                <Dialog open={addBalanceOpen} onOpenChange={setAddBalanceOpen}>
                    <DialogContent className="bg-slate-900 border-slate-800" data-testid="add-balance-dialog">
                        <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                                <DollarSign className="w-5 h-5 text-emerald-400" />
                                Agregar Saldo - {addBalanceUser?.name}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                            <p className="text-sm text-slate-400">{addBalanceUser?.email}</p>
                            <div className="flex gap-2">
                                <div className="flex-1 space-y-1.5">
                                    <Label className="text-slate-300 text-sm">Monto</Label>
                                    <Input type="number" step="0.01" placeholder="0.00" value={addAmount}
                                        onChange={(e) => setAddAmount(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-white" data-testid="add-balance-amount" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-slate-300 text-sm">Moneda</Label>
                                    <select value={addCurrency} onChange={(e) => setAddCurrency(e.target.value)}
                                        className="h-10 bg-slate-950 border border-slate-800 text-white rounded-md px-3 text-sm"
                                        data-testid="add-balance-currency">
                                        <option value="USD">USD</option>
                                        <option value="EUR">EUR</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-slate-300 text-sm">Descripcion (opcional)</Label>
                                <Input placeholder="Motivo del deposito..." value={addDesc}
                                    onChange={(e) => setAddDesc(e.target.value)}
                                    className="bg-slate-950 border-slate-800 text-white" data-testid="add-balance-desc" />
                            </div>
                            <Button onClick={handleAddBalance} disabled={addingBalance}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white" data-testid="add-balance-submit">
                                {addingBalance ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DollarSign className="w-4 h-4 mr-2" />}
                                Agregar Saldo
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Debit Balance Dialog */}
                <Dialog open={debitOpen} onOpenChange={setDebitOpen}>
                    <DialogContent className="bg-slate-900 border-rose-500/30 max-w-md" data-testid="debit-balance-dialog">
                        <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                                <MinusCircle className="w-5 h-5 text-rose-400" />
                                Debitar Saldo - {debitUser?.name}
                            </DialogTitle>
                            <DialogDescription className="text-slate-400 text-xs">
                                Esta operacion descontara el monto del saldo del usuario y quedara registrada en el historial con el motivo indicado.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                                <p className="text-sm text-white font-medium">{debitUser?.email}</p>
                                {debitUser?.accounts?.find(a => a.account_type === 'checking') && (
                                    <p className="text-[11px] text-slate-500 font-mono mt-1">
                                        Saldo actual: ${(debitUser.accounts.find(a => a.account_type === 'checking').balance_usd || 0).toFixed(2)} USD
                                        {' · '}
                                        €{(debitUser.accounts.find(a => a.account_type === 'checking').balance_eur || 0).toFixed(2)} EUR
                                    </p>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <div className="flex-1 space-y-1.5">
                                    <Label className="text-slate-300 text-sm">Monto a debitar *</Label>
                                    <Input type="number" step="0.01" min="0" placeholder="0.00" value={debitAmount}
                                        onChange={(e) => setDebitAmount(e.target.value)}
                                        className="bg-slate-950 border-rose-500/30 text-white focus-visible:ring-rose-500"
                                        data-testid="debit-amount" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-slate-300 text-sm">Moneda</Label>
                                    <select value={debitCurrency} onChange={(e) => setDebitCurrency(e.target.value)}
                                        className="h-10 bg-slate-950 border border-slate-800 text-white rounded-md px-3 text-sm"
                                        data-testid="debit-currency">
                                        <option value="USD">USD</option>
                                        <option value="EUR">EUR</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-slate-300 text-sm">Motivo del debito *</Label>
                                <div className="flex flex-wrap gap-1.5" data-testid="debit-reason-presets">
                                    {DEBIT_REASON_PRESETS.map((preset) => {
                                        const active = debitReason === preset;
                                        return (
                                            <button
                                                key={preset}
                                                type="button"
                                                onClick={() => setDebitReason(preset)}
                                                data-testid={`debit-preset-${preset.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`}
                                                className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                                                    active
                                                        ? 'bg-rose-500/20 border-rose-400 text-rose-200 shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                                                        : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-rose-500/50 hover:text-rose-200'
                                                }`}
                                            >
                                                {preset}
                                            </button>
                                        );
                                    })}
                                    {debitReason && (
                                        <button
                                            type="button"
                                            onClick={() => setDebitReason('')}
                                            data-testid="debit-preset-clear"
                                            className="text-[11px] px-2 py-1 rounded-full border border-slate-700 text-slate-500 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                                            title="Limpiar motivo"
                                        >
                                            Limpiar
                                        </button>
                                    )}
                                </div>
                                <textarea
                                    rows={3}
                                    value={debitReason}
                                    onChange={(e) => setDebitReason(e.target.value)}
                                    placeholder="Seleccione un motivo o escriba uno personalizado..."
                                    className="w-full bg-slate-950 border border-rose-500/30 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50 resize-none"
                                    data-testid="debit-reason"
                                />
                                <p className="text-[10px] text-slate-500">
                                    Este motivo quedara en el historial y sera enviado al usuario por email si la notificacion esta activa.
                                </p>
                            </div>

                            <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-300">
                                <input type="checkbox" checked={debitNotify}
                                    onChange={(e) => setDebitNotify(e.target.checked)}
                                    className="mt-0.5 accent-cyan-500"
                                    data-testid="debit-notify-toggle" />
                                <span>Notificar al usuario por email con el motivo del debito (Resend)</span>
                            </label>

                            <label className="flex items-start gap-2 cursor-pointer text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md p-3">
                                <input type="checkbox" checked={debitConfirm}
                                    onChange={(e) => setDebitConfirm(e.target.checked)}
                                    className="mt-0.5 accent-rose-500"
                                    data-testid="debit-confirm-toggle" />
                                <span><strong>Confirmo</strong> que deseo debitar este monto del saldo del usuario. Esta accion queda registrada permanentemente en el ledger administrativo.</span>
                            </label>

                            <Button onClick={handleDebit} disabled={debiting || !debitConfirm}
                                className="w-full bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40"
                                data-testid="debit-submit">
                                {debiting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MinusCircle className="w-4 h-4 mr-2" />}
                                Confirmar debito
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Admin Transaction History Dialog */}
                <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                    <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="admin-history-dialog">
                        <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                                <History className="w-5 h-5 text-cyan-400" />
                                Historial administrativo · {historyUser?.name}
                            </DialogTitle>
                            <DialogDescription className="text-slate-400 text-xs">
                                Ledger de operaciones admin_credit y admin_debit para este usuario.
                            </DialogDescription>
                        </DialogHeader>
                        {historyLoading ? (
                            <div className="py-12 flex items-center justify-center">
                                <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                            </div>
                        ) : historyData ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                                        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-emerald-300 mb-1">
                                            <ArrowUpCircle className="w-3.5 h-3.5" />
                                            Total acreditado
                                        </div>
                                        <p className="text-lg font-bold text-emerald-300 font-mono">
                                            ${historyData.totals?.credit_usd?.toFixed(2) || '0.00'}
                                        </p>
                                        <p className="text-[11px] text-emerald-400/70 font-mono">
                                            €{historyData.totals?.credit_eur?.toFixed(2) || '0.00'}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
                                        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-rose-300 mb-1">
                                            <ArrowDownCircle className="w-3.5 h-3.5" />
                                            Total debitado
                                        </div>
                                        <p className="text-lg font-bold text-rose-300 font-mono">
                                            ${historyData.totals?.debit_usd?.toFixed(2) || '0.00'}
                                        </p>
                                        <p className="text-[11px] text-rose-400/70 font-mono">
                                            €{historyData.totals?.debit_eur?.toFixed(2) || '0.00'}
                                        </p>
                                    </div>
                                </div>

                                {(historyData.transactions || []).length === 0 ? (
                                    <div className="py-8 text-center text-slate-500 text-sm">
                                        Sin operaciones administrativas registradas.
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                                        {historyData.transactions.map(tx => {
                                            const isDebit = tx.transaction_type === 'admin_debit';
                                            return (
                                                <div key={tx.id}
                                                    className={`rounded-lg border p-3 ${isDebit ? 'border-rose-500/25 bg-rose-500/5' : 'border-emerald-500/25 bg-emerald-500/5'}`}
                                                    data-testid={`history-row-${tx.id}`}>
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            {isDebit
                                                                ? <ArrowDownCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                                                                : <ArrowUpCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                                                            <div className="min-w-0">
                                                                <p className={`text-sm font-semibold ${isDebit ? 'text-rose-300' : 'text-emerald-300'}`}>
                                                                    {isDebit ? 'Debito' : 'Credito'} · {isDebit ? '-' : '+'}{tx.amount?.toFixed(2)} {tx.currency}
                                                                </p>
                                                                <p className="text-[10px] font-mono text-slate-500 truncate">
                                                                    Ref: {tx.transaction_reference || tx.id?.slice(0, 8)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">
                                                            {new Date(tx.created_at).toLocaleString('es-ES', {
                                                                day: '2-digit', month: 'short', year: '2-digit',
                                                                hour: '2-digit', minute: '2-digit'
                                                            })}
                                                        </span>
                                                    </div>
                                                    {tx.reason && (
                                                        <div className="mt-2 pl-6 text-xs text-slate-300 border-l-2 border-rose-500/40 ml-1.5">
                                                            <span className="text-slate-500 uppercase text-[9px] tracking-wider">Motivo: </span>
                                                            {tx.reason}
                                                        </div>
                                                    )}
                                                    {!tx.reason && tx.description && (
                                                        <p className="mt-1.5 pl-6 text-[11px] text-slate-400">{tx.description}</p>
                                                    )}
                                                    {tx.admin_name && (
                                                        <p className="mt-1.5 pl-6 text-[10px] text-slate-500">
                                                            Admin: <span className="text-cyan-300">{tx.admin_name}</span>
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="py-8 text-center text-slate-500 text-sm">Sin datos</div>
                        )}
                    </DialogContent>
                </Dialog>

                {/* Edit Balance Dialog */}
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogContent className="bg-slate-900 border-slate-800">
                        <DialogHeader>
                            <DialogTitle className="text-white">
                                Editar Saldo - {selectedUser?.name} ({selectedAccount?.account_type === 'checking' ? 'Corriente' : 'Ahorro'})
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label className="text-slate-300">Saldo USD</Label>
                                <Input type="number" step="0.01" value={balanceUsd} onChange={(e) => setBalanceUsd(e.target.value)}
                                    className="bg-slate-950 border-slate-800 text-white" data-testid="edit-balance-usd" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-slate-300">Saldo EUR</Label>
                                <Input type="number" step="0.01" value={balanceEur} onChange={(e) => setBalanceEur(e.target.value)}
                                    className="bg-slate-950 border-slate-800 text-white" data-testid="edit-balance-eur" />
                            </div>
                            <Button onClick={handleSaveBalance} className="w-full bg-emerald-500 hover:bg-emerald-600" data-testid="save-balance-btn">
                                Guardar Cambios
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Edit Role Dialog */}
                <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
                    <DialogContent className="bg-slate-900 border-slate-800">
                        <DialogHeader>
                            <DialogTitle className="text-white">Cambiar Rol - {selectedUser?.name}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label className="text-slate-300">Rol</Label>
                                <Select value={newRole} onValueChange={setNewRole}>
                                    <SelectTrigger className="bg-slate-950 border-slate-800 text-white" data-testid="role-selector">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-800">
                                        <SelectItem value="user" className="text-white">Usuario</SelectItem>
                                        <SelectItem value="admin" className="text-white">Administrador</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button onClick={handleSaveRole} className="w-full bg-emerald-500 hover:bg-emerald-600" data-testid="save-role-btn">
                                Actualizar Rol
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
                {/* Manual user create dialog */}
                <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) resetCreateForm(); }}>
                    <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="manual-create-dialog">
                        <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                                <UserPlus className="w-5 h-5 text-cyan-400" />
                                {createResult ? 'Usuario creado · estructura financiera lista' : 'Crear usuario manualmente'}
                            </DialogTitle>
                            <DialogDescription className="text-slate-400 text-xs">
                                {createResult
                                    ? 'Toda la estructura financiera fue provisionada automaticamente.'
                                    : 'Crea un nuevo usuario con su estructura financiera completa: cuentas corriente y de ahorro, wallet de cripto, defaults de KYC y transaccion inicial de apertura.'}
                            </DialogDescription>
                        </DialogHeader>

                        {!createResult ? (
                            <div className="space-y-4 pt-2">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-slate-300 text-sm">Nombre completo *</Label>
                                        <Input
                                            value={createForm.name}
                                            onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))}
                                            placeholder="Juan Perez"
                                            className="bg-slate-950 border-slate-800 text-white"
                                            data-testid="manual-create-name"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-slate-300 text-sm">Email *</Label>
                                        <Input
                                            type="email"
                                            value={createForm.email}
                                            onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))}
                                            placeholder="cliente@email.com"
                                            className="bg-slate-950 border-slate-800 text-white"
                                            data-testid="manual-create-email"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-slate-300 text-sm">Telefono</Label>
                                        <Input
                                            value={createForm.phone}
                                            onChange={(e) => setCreateForm(f => ({ ...f, phone: e.target.value }))}
                                            placeholder="+34 600 000 000"
                                            className="bg-slate-950 border-slate-800 text-white"
                                            data-testid="manual-create-phone"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-slate-300 text-sm">Pais</Label>
                                        <Input
                                            value={createForm.country_name}
                                            onChange={(e) => setCreateForm(f => ({ ...f, country_name: e.target.value }))}
                                            placeholder="Espana"
                                            className="bg-slate-950 border-slate-800 text-white"
                                            data-testid="manual-create-country"
                                        />
                                    </div>
                                </div>

                                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
                                    <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-cyan-300">
                                        <Banknote className="w-4 h-4" />
                                        Saldo inicial (opcional)
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-slate-300 text-xs">EUR · Cuenta corriente</Label>
                                            <Input
                                                type="number" step="0.01" min="0"
                                                value={createForm.seed_balance_eur}
                                                onChange={(e) => setCreateForm(f => ({ ...f, seed_balance_eur: e.target.value }))}
                                                placeholder="0.00"
                                                className="bg-slate-950 border-slate-800 text-white"
                                                data-testid="manual-create-seed-eur"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-slate-300 text-xs">USD · Cuenta corriente</Label>
                                            <Input
                                                type="number" step="0.01" min="0"
                                                value={createForm.seed_balance_usd}
                                                onChange={(e) => setCreateForm(f => ({ ...f, seed_balance_usd: e.target.value }))}
                                                placeholder="0.00"
                                                className="bg-slate-950 border-slate-800 text-white"
                                                data-testid="manual-create-seed-usd"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-2">
                                    <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-400">
                                        <Shield className="w-3.5 h-3.5" />
                                        Configuracion de acceso
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex-1">
                                            <p className="text-xs text-slate-300">Forzar cambio de contrasena en el primer login</p>
                                            <p className="text-[10px] text-slate-500">El usuario recibira la contrasena temporal <code className="font-mono text-cyan-300">lionsbit2.0</code></p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setCreateForm(f => ({ ...f, force_password_change: !f.force_password_change }))}
                                            data-testid="manual-create-force-toggle"
                                            className={`relative w-11 h-6 rounded-full transition-colors ${createForm.force_password_change ? 'bg-cyan-500' : 'bg-slate-700'}`}
                                        >
                                            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${createForm.force_password_change ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                        </button>
                                    </div>
                                </div>

                                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                                    <p className="text-[11px] font-mono uppercase tracking-wider text-emerald-300 mb-2">Se creara automaticamente:</p>
                                    <div className="grid grid-cols-2 gap-1.5 text-xs text-slate-300">
                                        <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-emerald-400" />Cuenta corriente</span>
                                        <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-emerald-400" />Cuenta de ahorro</span>
                                        <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-emerald-400" />Wallet de cripto</span>
                                        <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-emerald-400" />KYC pendiente</span>
                                        <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-emerald-400" />Withdrawal status idle</span>
                                        <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-emerald-400" />Historial inicial</span>
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-1">
                                    <Button variant="outline" onClick={() => setCreateOpen(false)}
                                        className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                                        data-testid="manual-create-cancel">
                                        Cancelar
                                    </Button>
                                    <Button onClick={handleManualCreate} disabled={creating}
                                        className="flex-1 bg-gradient-to-br from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white disabled:opacity-50"
                                        data-testid="manual-create-submit">
                                        {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                                        Crear usuario y provisionar
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 pt-2" data-testid="manual-create-result">
                                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center gap-3">
                                    <CheckCircle className="w-8 h-8 text-emerald-400 flex-shrink-0" />
                                    <div>
                                        <p className="font-bold text-white">{createResult.name}</p>
                                        <p className="text-xs text-slate-300">{createResult.email}</p>
                                        <p className="text-[10px] font-mono text-emerald-300 mt-1">ID: {createResult.user_id}</p>
                                    </div>
                                </div>

                                {createResult.temporary_password && (
                                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                                        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-amber-300 mb-2">
                                            <Shield className="w-3.5 h-3.5" />
                                            Contrasena temporal · entregar al cliente
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 bg-slate-950 border border-amber-500/30 rounded px-3 py-2 font-mono text-amber-200 text-sm">
                                                {createResult.temporary_password}
                                            </code>
                                            <Button
                                                variant="outline" size="icon"
                                                onClick={() => { navigator.clipboard.writeText(createResult.temporary_password); toast.success('Copiado'); }}
                                                className="border-amber-500/40 hover:bg-amber-500/10"
                                                data-testid="copy-temp-password"
                                            >
                                                <Copy className="w-4 h-4 text-amber-300" />
                                            </Button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-2">El usuario debera cambiarla obligatoriamente en su primer acceso.</p>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <p className="text-[11px] font-mono uppercase tracking-wider text-cyan-300">Estructura financiera provisionada</p>
                                    <div className="grid grid-cols-1 gap-2">
                                        <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                                            <Banknote className="w-5 h-5 text-cyan-400" />
                                            <div className="flex-1">
                                                <p className="text-sm text-white">Cuenta corriente</p>
                                                <p className="text-[10px] font-mono text-slate-500">{createResult.provisioned?.checking_id}</p>
                                            </div>
                                            <div className="text-right text-xs">
                                                <p className="text-emerald-400 font-mono">€{(createResult.seed_eur || 0).toFixed(2)}</p>
                                                <p className="text-slate-500 font-mono">${(createResult.seed_usd || 0).toFixed(2)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                                            <Banknote className="w-5 h-5 text-emerald-400" />
                                            <div className="flex-1">
                                                <p className="text-sm text-white">Cuenta de ahorro</p>
                                                <p className="text-[10px] font-mono text-slate-500">{createResult.provisioned?.savings_id}</p>
                                            </div>
                                            <span className="text-xs text-slate-500 font-mono">€0.00</span>
                                        </div>
                                        <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                                            <Wallet className="w-5 h-5 text-purple-400" />
                                            <div className="flex-1">
                                                <p className="text-sm text-white">Wallet de cripto</p>
                                                <p className="text-[10px] font-mono text-slate-500">{createResult.provisioned?.wallet_id}</p>
                                            </div>
                                            <span className="text-xs text-slate-500">vacio</span>
                                        </div>
                                        <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                                            <FileCheck className="w-5 h-5 text-amber-400" />
                                            <div className="flex-1">
                                                <p className="text-sm text-white">KYC + withdrawal status</p>
                                                <p className="text-[10px] font-mono text-slate-500">kyc_status=pending · withdrawal_status=idle</p>
                                            </div>
                                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                                        </div>
                                        <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                                            <Activity className="w-5 h-5 text-blue-400" />
                                            <div className="flex-1">
                                                <p className="text-sm text-white">Historial inicial</p>
                                                <p className="text-[10px] font-mono text-slate-500">transaction_type=account_opening</p>
                                            </div>
                                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-1">
                                    <Button variant="outline" onClick={() => { resetCreateForm(); }}
                                        className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                                        data-testid="manual-create-another">
                                        <UserPlus className="w-4 h-4 mr-2" />
                                        Crear otro usuario
                                    </Button>
                                    <Button onClick={() => setCreateOpen(false)}
                                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                                        data-testid="manual-create-close">
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        Cerrar
                                    </Button>
                                </div>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

                {/* Bulk-notify-by-health Dialog */}
                <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
                    <DialogContent className="bg-slate-900 border-slate-800 max-w-lg" data-testid="bulk-notify-dialog">
                        <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                                <Activity className="w-5 h-5 text-cyan-400" />
                                Notificar a {filteredUsers.length} usuarios
                                <span className={`text-xs font-mono uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                    healthFilter === 'green' ? 'bg-emerald-500/20 text-emerald-300' :
                                    healthFilter === 'yellow' ? 'bg-amber-500/20 text-amber-300' :
                                    healthFilter === 'red' ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-700 text-slate-300'
                                }`}>
                                    {healthFilter === 'green' ? 'Saludable' : healthFilter === 'yellow' ? 'Atencion' : healthFilter === 'red' ? 'Critico' : ''}
                                </span>
                            </DialogTitle>
                            <DialogDescription className="text-slate-400 text-xs">
                                Envío masivo a usuarios filtrados por nivel de health.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Cada destinatario recibirá un correo institucional vía Resend + una notificación en la campanita.
                                Esta acción no se puede deshacer.
                            </p>
                            <div className="space-y-1.5">
                                <Label className="text-slate-300 text-sm">Asunto</Label>
                                <Input
                                    value={bulkSubject}
                                    onChange={(e) => setBulkSubject(e.target.value)}
                                    placeholder="Recordatorio de su cuenta LIONSBIT"
                                    className="bg-slate-950 border-slate-800 text-white"
                                    data-testid="bulk-notify-subject"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-slate-300 text-sm">Mensaje (opcional)</Label>
                                <textarea
                                    value={bulkIntro}
                                    onChange={(e) => setBulkIntro(e.target.value)}
                                    rows={4}
                                    placeholder="Le recordamos que aún tiene pendiente completar su verificación KYC..."
                                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-md px-3 py-2 text-sm resize-none"
                                    data-testid="bulk-notify-intro"
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setBulkOpen(false)}
                                    className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                                    data-testid="bulk-notify-cancel">
                                    Cancelar
                                </Button>
                                <Button onClick={handleBulkNotify} disabled={bulkSending || !bulkSubject.trim()}
                                    className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white disabled:opacity-50"
                                    data-testid="bulk-notify-submit">
                                    {bulkSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
                                    Enviar a {filteredUsers.length}
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </Layout>
    );
};

export default AdminUsersPage;
