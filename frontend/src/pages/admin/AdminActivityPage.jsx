import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table';
import { 
    Activity, RefreshCw, UserPlus, LogIn, FileCheck, ArrowUpRight, 
    DollarSign, CreditCard, HelpCircle, Users, Clock, MapPin, Globe, 
    Filter, TrendingUp, ExternalLink, PlusCircle, Loader2, Flame, Crown, Search, X, MinusCircle
} from 'lucide-react';
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

const activityIcons = {
    register: { icon: UserPlus, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    login: { icon: LogIn, color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
    kyc: { icon: FileCheck, color: 'text-purple-400', bg: 'bg-purple-500/20' },
    withdrawal: { icon: ArrowUpRight, color: 'text-red-400', bg: 'bg-red-500/20' },
    tax_payment: { icon: DollarSign, color: 'text-orange-400', bg: 'bg-orange-500/20' },
    deposit: { icon: CreditCard, color: 'text-green-400', bg: 'bg-green-500/20' },
    support_ticket: { icon: HelpCircle, color: 'text-amber-400', bg: 'bg-amber-500/20' },
};

const activityLabels = {
    register: 'Registro',
    login: 'Inicio de Sesion',
    kyc: 'Verificacion KYC',
    withdrawal: 'Solicitud de Retiro',
    tax_payment: 'Pago de Impuesto',
    deposit: 'Deposito',
    support_ticket: 'Ticket de Soporte',
};

export const AdminActivityPage = () => {
    const navigate = useNavigate();
    const [activities, setActivities] = useState([]);
    const [stats, setStats] = useState(null);
    const [frequentUsers, setFrequentUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(true);

    // Add balance dialog
    const [balanceDialog, setBalanceDialog] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [balanceAmount, setBalanceAmount] = useState('');
    const [balanceCurrency, setBalanceCurrency] = useState('USD');
    const [addingBalance, setAddingBalance] = useState(false);

    // Debit balance dialog
    const [debitDialog, setDebitDialog] = useState(false);
    const [debitTarget, setDebitTarget] = useState(null);
    const [debitAmount, setDebitAmount] = useState('');
    const [debitCurrency, setDebitCurrency] = useState('USD');
    const [debitReason, setDebitReason] = useState('');
    const [debitNotify, setDebitNotify] = useState(true);
    const [debitConfirm, setDebitConfirm] = useState(false);
    const [debiting, setDebiting] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const [activitiesRes, statsRes, frequentRes] = await Promise.all([
                adminAPI.getActivity({ limit: 100, activity_type: filterType === 'all' ? null : filterType }),
                adminAPI.getActivityStats(),
                adminAPI.getFrequentUsers()
            ]);
            setActivities(activitiesRes.data);
            setStats(statsRes.data);
            setFrequentUsers(frequentRes.data);
        } catch (error) {
            toast.error('Error al cargar actividad');
        } finally {
            setLoading(false);
        }
    }, [filterType]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [autoRefresh, fetchData]);

    // Client-side name/email search filter
    const filteredActivities = activities.filter(a => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        return (
            (a.user_name || '').toLowerCase().includes(q) ||
            (a.user_email || '').toLowerCase().includes(q) ||
            (a.description || '').toLowerCase().includes(q)
        );
    });

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const diffMs = Date.now() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        if (diffMins < 1) return 'Ahora mismo';
        if (diffMins < 60) return `Hace ${diffMins} min`;
        if (diffHours < 24) return `Hace ${diffHours}h`;
        return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    };

    const getActivityConfig = (type) => activityIcons[type] || { icon: Activity, color: 'text-slate-400', bg: 'bg-slate-500/20' };

    const openUserProfile = (userId) => {
        if (userId) navigate(`/admin/users?highlight=${userId}`);
    };

    const openAddBalance = (userId, userName, userEmail) => {
        setSelectedUser({ id: userId, name: userName, email: userEmail });
        setBalanceAmount('');
        setBalanceCurrency('USD');
        setBalanceDialog(true);
    };

    const handleAddBalance = async () => {
        const amount = parseFloat(balanceAmount);
        if (!amount || amount <= 0) { toast.error('Ingrese un monto valido'); return; }
        setAddingBalance(true);
        try {
            await adminAPI.addBalance({
                user_id: selectedUser.id,
                amount,
                currency: balanceCurrency,
                description: `Saldo agregado desde Monitor de Actividad`
            });
            toast.success(`$${amount.toLocaleString()} ${balanceCurrency} agregados a ${selectedUser.name}`);
            setBalanceDialog(false);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Error al agregar saldo');
        } finally {
            setAddingBalance(false);
        }
    };

    const openDebit = (userId, userName, userEmail) => {
        setDebitTarget({ id: userId, name: userName, email: userEmail });
        setDebitAmount('');
        setDebitCurrency('USD');
        setDebitReason('Mantenimiento de cuenta');
        setDebitNotify(true);
        setDebitConfirm(false);
        setDebitDialog(true);
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
                    user_id: debitTarget.id,
                    amount,
                    currency: debitCurrency,
                    reason: debitReason.trim(),
                    notify_user: debitNotify,
                })
            });
            const data = await resp.json();
            if (resp.ok) {
                toast.success(
                    `Debitado ${amount.toLocaleString()} ${debitCurrency} de ${debitTarget.name}` +
                    (debitNotify ? ' · Email enviado' : '')
                );
                setDebitDialog(false);
                fetchData();
            } else {
                toast.error(data.detail || 'Error al debitar');
            }
        } catch (e) {
            toast.error('Error de conexion');
        } finally {
            setDebiting(false);
        }
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-6" data-testid="admin-activity-page">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl text-white font-bold tracking-tight">Monitor de Actividad</h1>
                        <p className="text-slate-500 mt-1 text-sm">Monitoreo en tiempo real de toda la actividad del sistema</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant={autoRefresh ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setAutoRefresh(!autoRefresh)}
                            className={autoRefresh ? 'bg-emerald-500 hover:bg-emerald-600' : 'border-slate-700'}
                        >
                            <Activity className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-pulse' : ''}`} />
                            {autoRefresh ? 'En Vivo' : 'Pausado'}
                        </Button>
                        <Button onClick={fetchData} variant="outline" className="border-slate-700 hover:bg-slate-800">
                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Actualizar
                        </Button>
                    </div>
                </div>

                {/* Stats Cards */}
                {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { icon: Users, color: 'emerald', label: 'Usuarios Totales', value: stats.totals?.users || 0 },
                            { icon: TrendingUp, color: 'cyan', label: 'Actividad Hoy', value: stats.today?.total || 0 },
                            { icon: FileCheck, color: 'purple', label: 'KYC Pendientes', value: stats.totals?.pending_kyc || 0 },
                            { icon: ArrowUpRight, color: 'orange', label: 'Retiros Pendientes', value: stats.totals?.pending_withdrawals || 0 },
                        ].map((s, i) => (
                            <Card key={i} className="bg-slate-900/70 border-slate-800">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-lg bg-${s.color}-500/20 flex items-center justify-center`}>
                                            <s.icon className={`w-5 h-5 text-${s.color}-400`} />
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500">{s.label}</p>
                                            <p className="text-xl text-white font-semibold tabular-nums">{s.value}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Frequent Users Section */}
                {frequentUsers.length > 0 && (
                    <Card className="bg-slate-900/70 border-slate-800">
                        <CardHeader className="border-b border-slate-800 pb-3">
                            <CardTitle className="text-white flex items-center gap-2 text-base font-bold">
                                <Flame className="w-5 h-5 text-orange-400" />
                                Perfiles mas Activos
                                <span className="text-slate-500 text-xs font-normal ml-2">(ultimos 30 dias)</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                {frequentUsers.slice(0, 8).map((u, i) => (
                                    <div key={u.user_id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-colors" data-testid={`frequent-user-${i}`}>
                                        {/* Rank badge */}
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                            i === 0 ? 'bg-amber-500/20' : i === 1 ? 'bg-slate-400/20' : i === 2 ? 'bg-orange-700/20' : 'bg-slate-800'
                                        }`}>
                                            {i < 3 ? (
                                                <Crown className={`w-4 h-4 ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : 'text-orange-600'}`} />
                                            ) : (
                                                <span className="text-slate-500 text-xs font-bold">#{i + 1}</span>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <button
                                                onClick={() => openUserProfile(u.user_id)}
                                                className="text-white text-sm font-medium hover:text-cyan-400 transition-colors truncate block text-left w-full"
                                                data-testid={`frequent-user-link-${i}`}
                                            >
                                                {u.user_name || u.user_email}
                                            </button>
                                            <p className="text-slate-500 text-[10px] truncate">{u.user_email}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            <span className="text-orange-400 text-sm font-bold tabular-nums">{u.login_count}</span>
                                            <LogIn className="w-3 h-3 text-slate-600" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Activity Feed */}
                <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                    <CardHeader className="border-b border-slate-800">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <CardTitle className="text-white flex items-center gap-2 font-bold">
                                <Activity className="w-5 h-5 text-emerald-400" />
                                Historial de Actividad
                                {searchQuery && (
                                    <span className="text-xs font-normal text-slate-400 ml-2">
                                        ({filteredActivities.length} de {activities.length})
                                    </span>
                                )}
                            </CardTitle>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <div className="relative flex-1 sm:min-w-[240px]">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Buscar por nombre, email..."
                                        className="w-full pl-10 pr-8 h-10 bg-slate-950 border border-slate-800 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/40 placeholder-slate-500"
                                        data-testid="activity-search-input"
                                    />
                                    {searchQuery && (
                                        <button
                                            onClick={() => setSearchQuery('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-800 transition-colors"
                                            data-testid="activity-search-clear"
                                            aria-label="Limpiar busqueda"
                                        >
                                            <X className="w-3.5 h-3.5 text-slate-500" />
                                        </button>
                                    )}
                                </div>
                                <Select value={filterType} onValueChange={setFilterType}>
                                    <SelectTrigger className="w-full sm:w-48 bg-slate-950 border-slate-800 text-white">
                                        <Filter className="w-4 h-4 mr-2" />
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-700">
                                        <SelectItem value="all">Todos los Eventos</SelectItem>
                                        <SelectItem value="register">Registros</SelectItem>
                                        <SelectItem value="login">Inicios de Sesion</SelectItem>
                                        <SelectItem value="kyc">Verificaciones KYC</SelectItem>
                                        <SelectItem value="withdrawal">Retiros</SelectItem>
                                        <SelectItem value="tax_payment">Pagos de Impuesto</SelectItem>
                                        <SelectItem value="deposit">Depositos</SelectItem>
                                        <SelectItem value="support_ticket">Tickets de Soporte</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="p-8 space-y-4">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="h-16 bg-slate-800/50 rounded animate-pulse" />
                                ))}
                            </div>
                        ) : filteredActivities.length === 0 ? (
                            <div className="py-16 text-center">
                                <Activity className="w-12 h-12 mx-auto text-slate-600 mb-4" />
                                <p className="text-slate-500">
                                    {searchQuery
                                        ? `Sin resultados para "${searchQuery}"`
                                        : 'No hay actividad registrada'}
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-slate-800 hover:bg-transparent">
                                            <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Evento</TableHead>
                                            <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Usuario</TableHead>
                                            <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Descripcion</TableHead>
                                            <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Ubicacion</TableHead>
                                            <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium text-right">Hora</TableHead>
                                            <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium text-center w-32">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredActivities.map((activity, index) => {
                                            const config = getActivityConfig(activity.type);
                                            const Icon = config.icon;

                                            return (
                                                <motion.tr
                                                    key={activity.id}
                                                    initial={{ opacity: 0, x: -20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: index * 0.02 }}
                                                    className="border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                                                >
                                                    <TableCell className="py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center`}>
                                                                <Icon className={`w-5 h-5 ${config.color}`} />
                                                            </div>
                                                            <span className={`text-sm font-medium ${config.color}`}>
                                                                {activityLabels[activity.type] || activity.type}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div>
                                                            <button
                                                                onClick={() => openUserProfile(activity.user_id)}
                                                                className="text-white font-medium hover:text-cyan-400 transition-colors text-left flex items-center gap-1 group"
                                                                data-testid={`user-link-${activity.id}`}
                                                            >
                                                                {activity.user_name || 'N/A'}
                                                                <ExternalLink className="w-3 h-3 text-slate-600 group-hover:text-cyan-400 transition-colors" />
                                                            </button>
                                                            <p className="text-xs text-slate-500">{activity.user_email || ''}</p>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <p className="text-slate-300 text-sm max-w-[260px] truncate">{activity.description}</p>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2 text-xs">
                                                            {activity.ip_address && (
                                                                <span className="text-slate-400 px-2 py-1 rounded bg-slate-800 tabular-nums">
                                                                    <MapPin className="w-3 h-3 inline mr-1" />{activity.ip_address}
                                                                </span>
                                                            )}
                                                            {activity.country && (
                                                                <span className="text-slate-400 px-2 py-1 rounded bg-slate-800">
                                                                    <Globe className="w-3 h-3 inline mr-1" />{activity.country}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <span className="text-slate-400 text-sm tabular-nums">
                                                            <Clock className="w-3 h-3 inline mr-1" />{formatDate(activity.created_at)}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {activity.user_id && (
                                                            <div className="flex items-center justify-center gap-1">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); openAddBalance(activity.user_id, activity.user_name, activity.user_email); }}
                                                                    className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                                                                    title="Agregar saldo"
                                                                    data-testid={`add-balance-btn-${activity.id}`}
                                                                >
                                                                    <PlusCircle className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); openDebit(activity.user_id, activity.user_name, activity.user_email); }}
                                                                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors"
                                                                    title="Debitar saldo"
                                                                    data-testid={`debit-balance-btn-${activity.id}`}
                                                                >
                                                                    <MinusCircle className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                </motion.tr>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Live indicator */}
                {autoRefresh && (
                    <div className="fixed bottom-6 right-6">
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-emerald-400 text-sm font-medium">En Vivo</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Add Balance Dialog */}
            <Dialog open={balanceDialog} onOpenChange={setBalanceDialog}>
                <DialogContent className="bg-slate-900 border-slate-700 max-w-sm" data-testid="add-balance-dialog">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <PlusCircle className="w-5 h-5 text-emerald-400" />
                            Agregar Saldo
                        </DialogTitle>
                    </DialogHeader>
                    {selectedUser && (
                        <div className="space-y-4">
                            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                                <p className="text-white text-sm font-medium">{selectedUser.name}</p>
                                <p className="text-slate-500 text-xs">{selectedUser.email}</p>
                            </div>

                            <div className="space-y-2">
                                <p className="text-slate-300 text-sm font-medium">Monto</p>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={balanceAmount}
                                        onChange={(e) => setBalanceAmount(e.target.value)}
                                        placeholder="0.00"
                                        className="flex-1 bg-slate-950/50 border border-slate-800 rounded-lg text-white text-sm p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                                        data-testid="balance-amount-input"
                                    />
                                    <Select value={balanceCurrency} onValueChange={setBalanceCurrency}>
                                        <SelectTrigger className="w-24 bg-slate-950 border-slate-800 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-slate-700">
                                            <SelectItem value="USD">USD</SelectItem>
                                            <SelectItem value="EUR">EUR</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <Button
                                onClick={handleAddBalance}
                                disabled={addingBalance || !balanceAmount}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 disabled:opacity-40"
                                data-testid="confirm-add-balance-btn"
                            >
                                {addingBalance
                                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Procesando...</>
                                    : <><DollarSign className="w-4 h-4 mr-2" /> Agregar Saldo</>
                                }
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Debit Balance Dialog */}
            <Dialog open={debitDialog} onOpenChange={setDebitDialog}>
                <DialogContent className="bg-slate-900 border-rose-500/30 max-w-md" data-testid="activity-debit-dialog">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <MinusCircle className="w-5 h-5 text-rose-400" />
                            Debitar Saldo
                        </DialogTitle>
                    </DialogHeader>
                    {debitTarget && (
                        <div className="space-y-4 pt-2">
                            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                                <p className="text-white text-sm font-medium">{debitTarget.name}</p>
                                <p className="text-slate-500 text-xs">{debitTarget.email}</p>
                            </div>

                            <div className="space-y-1.5">
                                <p className="text-slate-300 text-sm font-medium">Monto a debitar *</p>
                                <div className="flex gap-2">
                                    <input
                                        type="number" min="0" step="0.01"
                                        value={debitAmount}
                                        onChange={(e) => setDebitAmount(e.target.value)}
                                        placeholder="0.00"
                                        className="flex-1 bg-slate-950/50 border border-rose-500/30 rounded-lg text-white text-sm p-3 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                                        data-testid="activity-debit-amount"
                                    />
                                    <Select value={debitCurrency} onValueChange={setDebitCurrency}>
                                        <SelectTrigger className="w-24 bg-slate-950 border-slate-800 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-slate-700">
                                            <SelectItem value="USD">USD</SelectItem>
                                            <SelectItem value="EUR">EUR</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <p className="text-slate-300 text-sm font-medium">Motivo del debito *</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {DEBIT_REASON_PRESETS.map((preset) => {
                                        const active = debitReason === preset;
                                        return (
                                            <button
                                                key={preset}
                                                type="button"
                                                onClick={() => setDebitReason(preset)}
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
                                            className="text-[11px] px-2 py-1 rounded-full border border-slate-700 text-slate-500 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
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
                                    data-testid="activity-debit-reason"
                                />
                            </div>

                            <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-300">
                                <input type="checkbox" checked={debitNotify}
                                    onChange={(e) => setDebitNotify(e.target.checked)}
                                    className="mt-0.5 accent-cyan-500" />
                                <span>Notificar al usuario por email con el motivo del debito</span>
                            </label>

                            <label className="flex items-start gap-2 cursor-pointer text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md p-3">
                                <input type="checkbox" checked={debitConfirm}
                                    onChange={(e) => setDebitConfirm(e.target.checked)}
                                    className="mt-0.5 accent-rose-500"
                                    data-testid="activity-debit-confirm" />
                                <span><strong>Confirmo</strong> que deseo debitar este monto del saldo del usuario. Esta accion queda registrada permanentemente en el ledger administrativo.</span>
                            </label>

                            <Button
                                onClick={handleDebit}
                                disabled={debiting || !debitConfirm}
                                className="w-full bg-rose-600 hover:bg-rose-700 text-white py-4 disabled:opacity-40"
                                data-testid="activity-debit-submit"
                            >
                                {debiting
                                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Procesando...</>
                                    : <><MinusCircle className="w-4 h-4 mr-2" /> Confirmar debito</>
                                }
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </Layout>
    );
};

export default AdminActivityPage;
