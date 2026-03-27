import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { authAPI, transactionsAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { 
    Settings, 
    Lock, 
    History, 
    Monitor,
    Globe,
    Clock,
    Loader2,
    Eye,
    EyeOff,
    CheckCircle,
    ArrowDownCircle,
    TrendingUp,
    AlertCircle,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import { toast } from 'sonner';

export const SettingsPage = () => {
    const { user } = useAuth();
    const [loginHistory, setLoginHistory] = useState([]);
    const [withdrawalHistory, setWithdrawalHistory] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingWithdrawals, setLoadingWithdrawals] = useState(true);
    const [expandedDates, setExpandedDates] = useState({});
    const [passwords, setPasswords] = useState({
        current: '',
        new: '',
        confirm: ''
    });
    const [showPasswords, setShowPasswords] = useState({
        current: false,
        new: false,
        confirm: false
    });
    const [changingPassword, setChangingPassword] = useState(false);

    useEffect(() => {
        const fetchLoginHistory = async () => {
            try {
                const response = await authAPI.getLoginHistory();
                setLoginHistory(response.data);
            } catch (error) {
                console.error('Failed to load login history');
            } finally {
                setLoading(false);
            }
        };
        
        const fetchWithdrawalHistory = async () => {
            try {
                const response = await transactionsAPI.getWithdrawalHistory();
                setWithdrawalHistory(response.data);
                // Auto-expand today and yesterday
                const expanded = {};
                if (response.data.history?.length > 0) {
                    response.data.history.slice(0, 2).forEach(day => {
                        expanded[day.date] = true;
                    });
                }
                setExpandedDates(expanded);
            } catch (error) {
                console.error('Failed to load withdrawal history');
            } finally {
                setLoadingWithdrawals(false);
            }
        };
        
        fetchLoginHistory();
        fetchWithdrawalHistory();
    }, []);

    const toggleDateExpand = (date) => {
        setExpandedDates(prev => ({
            ...prev,
            [date]: !prev[date]
        }));
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'completed': return 'text-emerald-400 bg-emerald-500/20';
            case 'pending_tax': return 'text-amber-400 bg-amber-500/20';
            case 'processing': return 'text-blue-400 bg-blue-500/20';
            case 'transfer_in_progress': return 'text-cyan-400 bg-cyan-500/20';
            case 'rejected': return 'text-red-400 bg-red-500/20';
            default: return 'text-slate-400 bg-slate-500/20';
        }
    };

    const getStatusLabel = (status) => {
        switch (status) {
            case 'completed': return 'Completado';
            case 'pending_tax': return 'Pendiente Impuesto';
            case 'processing': return 'Procesando';
            case 'transfer_in_progress': return 'En Transferencia';
            case 'rejected': return 'Rechazado';
            case 'pending': return 'Pendiente';
            default: return status;
        }
    };

    const handleChangePassword = async () => {
        if (!passwords.current || !passwords.new || !passwords.confirm) {
            toast.error('Please fill in all password fields');
            return;
        }
        
        if (passwords.new.length < 6) {
            toast.error('New password must be at least 6 characters');
            return;
        }
        
        if (passwords.new !== passwords.confirm) {
            toast.error('New passwords do not match');
            return;
        }

        setChangingPassword(true);
        try {
            await authAPI.changePassword({
                current_password: passwords.current,
                new_password: passwords.new
            });
            toast.success('Password changed successfully');
            setPasswords({ current: '', new: '', confirm: '' });
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to change password');
        } finally {
            setChangingPassword(false);
        }
    };

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-8">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl font-heading font-bold text-white flex items-center gap-3">
                        <Settings className="w-8 h-8 text-emerald-400" />
                        Configuración de Cuenta
                    </h1>
                    <p className="text-slate-500 mt-1">Gestiona la seguridad y preferencias de tu cuenta</p>
                </motion.div>

                {/* Withdrawal History Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white font-heading flex items-center gap-2">
                                <ArrowDownCircle className="w-5 h-5 text-emerald-400" />
                                Historial de Retiros
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loadingWithdrawals ? (
                                <div className="space-y-3">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="h-16 bg-slate-800/50 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : !withdrawalHistory || withdrawalHistory.history?.length === 0 ? (
                                <div className="text-center py-8">
                                    <ArrowDownCircle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                                    <p className="text-slate-400">No hay retiros registrados</p>
                                    <p className="text-slate-500 text-sm mt-1">Tus retiros aparecerán aquí</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Statistics Summary */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                                            <p className="text-2xl font-bold text-white">{withdrawalHistory.statistics?.total_count || 0}</p>
                                            <p className="text-xs text-slate-400">Total Retiros</p>
                                        </div>
                                        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                                            <p className="text-2xl font-bold text-emerald-400">
                                                €{(withdrawalHistory.statistics?.total_amount || 0).toLocaleString()}
                                            </p>
                                            <p className="text-xs text-slate-400">Monto Total</p>
                                        </div>
                                        <div className="bg-emerald-500/10 rounded-lg p-3 text-center border border-emerald-500/30">
                                            <p className="text-2xl font-bold text-emerald-400">{withdrawalHistory.statistics?.completed_count || 0}</p>
                                            <p className="text-xs text-slate-400">Completados</p>
                                        </div>
                                        <div className="bg-amber-500/10 rounded-lg p-3 text-center border border-amber-500/30">
                                            <p className="text-2xl font-bold text-amber-400">{withdrawalHistory.statistics?.pending_count || 0}</p>
                                            <p className="text-xs text-slate-400">En Proceso</p>
                                        </div>
                                    </div>

                                    {/* Grouped by Date */}
                                    <div className="space-y-3">
                                        {withdrawalHistory.history?.map((day) => (
                                            <div key={day.date} className="border border-slate-800 rounded-lg overflow-hidden">
                                                {/* Date Header - Clickable */}
                                                <button
                                                    onClick={() => toggleDateExpand(day.date)}
                                                    className="w-full flex items-center justify-between p-4 bg-slate-800/50 hover:bg-slate-800/70 transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                                            <Clock className="w-5 h-5 text-emerald-400" />
                                                        </div>
                                                        <div className="text-left">
                                                            <p className="text-white font-medium">{day.label}</p>
                                                            <p className="text-sm text-slate-400">
                                                                {day.count} retiro{day.count !== 1 ? 's' : ''} • €{day.total_amount.toLocaleString()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {expandedDates[day.date] ? (
                                                        <ChevronUp className="w-5 h-5 text-slate-400" />
                                                    ) : (
                                                        <ChevronDown className="w-5 h-5 text-slate-400" />
                                                    )}
                                                </button>

                                                {/* Withdrawals List - Expandable */}
                                                {expandedDates[day.date] && (
                                                    <div className="divide-y divide-slate-800">
                                                        {day.withdrawals.map((withdrawal) => (
                                                            <div key={withdrawal.id} className="p-4 bg-slate-900/50 flex items-center justify-between">
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`w-2 h-2 rounded-full ${
                                                                        withdrawal.status === 'completed' ? 'bg-emerald-400' :
                                                                        withdrawal.status === 'rejected' ? 'bg-red-400' :
                                                                        'bg-amber-400'
                                                                    }`} />
                                                                    <div>
                                                                        <p className="text-white font-medium">
                                                                            €{withdrawal.amount.toLocaleString()}
                                                                        </p>
                                                                        <p className="text-xs text-slate-500">
                                                                            {new Date(withdrawal.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(withdrawal.status)}`}>
                                                                    {getStatusLabel(withdrawal.status)}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Login Info Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white font-heading flex items-center gap-2">
                                <History className="w-5 h-5 text-cyan-400" />
                                Actividad de Inicio de Sesión
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="space-y-3">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="h-16 bg-slate-800/50 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : loginHistory.length === 0 ? (
                                <p className="text-slate-400 text-center py-8">No hay historial de inicio de sesión</p>
                            ) : (
                                <div className="space-y-3">
                                    {loginHistory.map((login, index) => (
                                        <div
                                            key={login.id}
                                            className={`p-4 rounded-lg ${index === 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/50'}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${index === 0 ? 'bg-emerald-500/20' : 'bg-slate-700'}`}>
                                                        <Monitor className={`w-5 h-5 ${index === 0 ? 'text-emerald-400' : 'text-slate-400'}`} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-white font-medium">
                                                                {login.browser} on {login.device}
                                                            </p>
                                                            {index === 0 && (
                                                                <span className="text-xs text-emerald-400 px-2 py-0.5 bg-emerald-500/20 rounded">
                                                                    Sesión Actual
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                                                            <span className="flex items-center gap-1">
                                                                <Globe className="w-3 h-3" />
                                                                {login.ip_address}
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <Clock className="w-3 h-3" />
                                                                {login.location}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm text-slate-400">
                                                        {new Date(login.logged_in_at).toLocaleDateString()}
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        {new Date(login.logged_in_at).toLocaleTimeString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Change Password Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white font-heading flex items-center gap-2">
                                <Lock className="w-5 h-5 text-amber-400" />
                                Cambiar Contraseña
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-slate-300">Contraseña Actual</Label>
                                <div className="relative">
                                    <Input
                                        type={showPasswords.current ? 'text' : 'password'}
                                        value={passwords.current}
                                        onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                                        className="bg-slate-950 border-slate-800 text-white pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                    >
                                        {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <Label className="text-slate-300">Nueva Contraseña</Label>
                                <div className="relative">
                                    <Input
                                        type={showPasswords.new ? 'text' : 'password'}
                                        value={passwords.new}
                                        onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                                        className="bg-slate-950 border-slate-800 text-white pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                    >
                                        {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <Label className="text-slate-300">Confirmar Nueva Contraseña</Label>
                                <div className="relative">
                                    <Input
                                        type={showPasswords.confirm ? 'text' : 'password'}
                                        value={passwords.confirm}
                                        onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                                        className="bg-slate-950 border-slate-800 text-white pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                    >
                                        {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <Button
                                onClick={handleChangePassword}
                                disabled={changingPassword}
                                className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                            >
                                {changingPassword ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                )}
                                Actualizar Contraseña
                            </Button>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Account Info Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white font-heading">Información de Cuenta</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-slate-500">Nombre</p>
                                    <p className="text-white">{user?.name}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500">Correo</p>
                                    <p className="text-white">{user?.email}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500">Rol</p>
                                    <p className="text-white capitalize">{user?.role === 'admin' ? 'Administrador' : 'Usuario'}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500">Estado de Verificación</p>
                                    <p className={`capitalize ${user?.verification_status === 'verified' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        {user?.verification_status === 'verified' ? 'Verificado' : 
                                         user?.verification_status === 'pending' ? 'Pendiente' : 'No Verificado'}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </Layout>
    );
};

export default SettingsPage;
