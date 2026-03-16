import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table';
import { 
    Activity, RefreshCw, UserPlus, LogIn, FileCheck, ArrowUpRight, 
    DollarSign, CreditCard, HelpCircle, Users, Clock, MapPin, Globe, 
    Bell, Filter, TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';

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
    login: 'Inicio de Sesión',
    kyc: 'Verificación KYC',
    withdrawal: 'Solicitud de Retiro',
    tax_payment: 'Pago de Impuesto',
    deposit: 'Depósito',
    support_ticket: 'Ticket de Soporte',
};

export const AdminActivityPage = () => {
    const [activities, setActivities] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('all');
    const [autoRefresh, setAutoRefresh] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            const [activitiesRes, statsRes] = await Promise.all([
                adminAPI.getActivity({ limit: 100, activity_type: filterType === 'all' ? null : filterType }),
                adminAPI.getActivityStats()
            ]);
            setActivities(activitiesRes.data);
            setStats(statsRes.data);
        } catch (error) {
            toast.error('Error al cargar actividad');
        } finally {
            setLoading(false);
        }
    }, [filterType]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [autoRefresh, fetchData]);

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        
        if (diffMins < 1) return 'Ahora mismo';
        if (diffMins < 60) return `Hace ${diffMins} min`;
        if (diffHours < 24) return `Hace ${diffHours}h`;
        
        return date.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getActivityConfig = (type) => {
        return activityIcons[type] || { icon: Activity, color: 'text-slate-400', bg: 'bg-slate-500/20' };
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="admin-activity-page">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                    <div>
                        <h1 className="text-3xl text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                            Monitor de Actividad
                        </h1>
                        <p className="text-slate-500 mt-1 font-light">
                            Monitoreo en tiempo real de toda la actividad del sistema
                        </p>
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
                        <Button
                            onClick={fetchData}
                            variant="outline"
                            className="border-slate-700 hover:bg-slate-800"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Actualizar
                        </Button>
                    </div>
                </motion.div>

                {/* Stats Cards */}
                {stats && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid grid-cols-2 md:grid-cols-4 gap-4"
                    >
                        <Card className="bg-slate-900/70 border-slate-800">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                        <Users className="w-5 h-5 text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-normal">Usuarios Totales</p>
                                        <p className="text-xl text-white" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                            {stats.totals?.users || 0}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        
                        <Card className="bg-slate-900/70 border-slate-800">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                                        <TrendingUp className="w-5 h-5 text-cyan-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-normal">Actividad Hoy</p>
                                        <p className="text-xl text-white" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                            {stats.today?.total || 0}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        
                        <Card className="bg-slate-900/70 border-slate-800">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                        <FileCheck className="w-5 h-5 text-purple-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-normal">KYC Pendientes</p>
                                        <p className="text-xl text-white" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                            {stats.totals?.pending_kyc || 0}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        
                        <Card className="bg-slate-900/70 border-slate-800">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                                        <ArrowUpRight className="w-5 h-5 text-orange-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-normal">Retiros Pendientes</p>
                                        <p className="text-xl text-white" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                            {stats.totals?.pending_withdrawals || 0}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}

                {/* Activity Feed */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader className="border-b border-slate-800">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-white flex items-center gap-2" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                                    <Activity className="w-5 h-5 text-emerald-400" />
                                    Historial de Actividad
                                </CardTitle>
                                <Select value={filterType} onValueChange={setFilterType}>
                                    <SelectTrigger className="w-48 bg-slate-950 border-slate-800 text-white">
                                        <Filter className="w-4 h-4 mr-2" />
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-700">
                                        <SelectItem value="all">Todos los Eventos</SelectItem>
                                        <SelectItem value="register">Registros</SelectItem>
                                        <SelectItem value="login">Inicios de Sesión</SelectItem>
                                        <SelectItem value="kyc">Verificaciones KYC</SelectItem>
                                        <SelectItem value="withdrawal">Retiros</SelectItem>
                                        <SelectItem value="tax_payment">Pagos de Impuesto</SelectItem>
                                        <SelectItem value="deposit">Depósitos</SelectItem>
                                        <SelectItem value="support_ticket">Tickets de Soporte</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-8 space-y-4">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className="h-16 bg-slate-800/50 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : activities.length === 0 ? (
                                <div className="py-16 text-center">
                                    <Activity className="w-12 h-12 mx-auto text-slate-600 mb-4" />
                                    <p className="text-slate-500 font-normal">No hay actividad registrada</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-800 hover:bg-transparent">
                                                <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Evento</TableHead>
                                                <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Usuario</TableHead>
                                                <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Descripción</TableHead>
                                                <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Ubicación</TableHead>
                                                <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium text-right">Hora</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {activities.map((activity, index) => {
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
                                                                <span className={`text-sm ${config.color}`} style={{ fontWeight: 500 }}>
                                                                    {activityLabels[activity.type] || activity.type}
                                                                </span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div>
                                                                <p className="text-white" style={{ fontWeight: 500 }}>
                                                                    {activity.user_name || 'N/A'}
                                                                </p>
                                                                <p className="text-xs text-slate-500 font-light">
                                                                    {activity.user_email || ''}
                                                                </p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <p className="text-slate-300 text-sm font-normal max-w-[300px] truncate">
                                                                {activity.description}
                                                            </p>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2 text-xs">
                                                                {activity.ip_address && (
                                                                    <span 
                                                                        className="text-slate-400 px-2 py-1 rounded bg-slate-800"
                                                                        style={{ fontVariantNumeric: 'tabular-nums' }}
                                                                    >
                                                                        <MapPin className="w-3 h-3 inline mr-1" />
                                                                        {activity.ip_address}
                                                                    </span>
                                                                )}
                                                                {activity.country && (
                                                                    <span className="text-slate-400 px-2 py-1 rounded bg-slate-800">
                                                                        <Globe className="w-3 h-3 inline mr-1" />
                                                                        {activity.country}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <span 
                                                                className="text-slate-400 text-sm"
                                                                style={{ fontVariantNumeric: 'tabular-nums' }}
                                                            >
                                                                <Clock className="w-3 h-3 inline mr-1" />
                                                                {formatDate(activity.created_at)}
                                                            </span>
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
                </motion.div>

                {/* Live indicator */}
                {autoRefresh && (
                    <div className="fixed bottom-6 right-6">
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-emerald-400 text-sm" style={{ fontWeight: 500 }}>En Vivo</span>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default AdminActivityPage;
