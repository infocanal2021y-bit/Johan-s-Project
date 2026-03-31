import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { adminAPI } from '../../lib/api';
import { toast } from 'sonner';
import { Wifi, WifiOff, RefreshCw, MapPin, Monitor, Shield, Clock, Users } from 'lucide-react';
import { Button } from '../../components/ui/button';

export const AdminOnlineUsersPage = () => {
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchOnline = useCallback(async () => {
        try {
            const res = await adminAPI.getOnlineUsers();
            setOnlineUsers(res.data);
        } catch {
            toast.error('Error al cargar usuarios conectados');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchOnline();
        const interval = setInterval(fetchOnline, 15000);
        return () => clearInterval(interval);
    }, [fetchOnline]);

    const formatTime = (iso) => {
        if (!iso) return '-';
        const d = new Date(iso);
        return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const formatDate = (iso) => {
        if (!iso) return '-';
        const d = new Date(iso);
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) +
            ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    };

    const timeSince = (iso) => {
        if (!iso) return '-';
        const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
        if (seconds < 60) return `hace ${seconds}s`;
        if (seconds < 3600) return `hace ${Math.floor(seconds / 60)}m`;
        return `hace ${Math.floor(seconds / 3600)}h`;
    };

    const admins = onlineUsers.filter(u => u.role === 'admin');
    const regularUsers = onlineUsers.filter(u => u.role !== 'admin');

    return (
        <div className="space-y-6" data-testid="admin-online-users">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-heading font-bold text-white">Usuarios Conectados</h1>
                    <p className="text-slate-500 mt-1">Monitoreo en tiempo real de usuarios activos</p>
                </div>
                <Button onClick={fetchOnline} variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800" data-testid="refresh-online-users">
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Actualizar
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Total Conectados</p>
                                <p className="text-3xl font-bold font-mono text-emerald-400">{onlineUsers.length}</p>
                            </div>
                            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                <Wifi className="w-6 h-6 text-emerald-400" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Administradores</p>
                                <p className="text-2xl font-bold font-mono text-violet-400">{admins.length}</p>
                            </div>
                            <Shield className="w-8 h-8 text-violet-400 opacity-50" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Usuarios</p>
                                <p className="text-2xl font-bold font-mono text-cyan-400">{regularUsers.length}</p>
                            </div>
                            <Users className="w-8 h-8 text-cyan-400 opacity-50" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Live Indicator */}
            <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                Actualización automática cada 15 segundos
            </div>

            {/* Online Users Table */}
            <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white font-heading flex items-center gap-2">
                        <Wifi className="w-5 h-5 text-emerald-400" />
                        Usuarios Activos ({onlineUsers.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : onlineUsers.length === 0 ? (
                        <div className="text-center py-16">
                            <WifiOff className="w-16 h-16 mx-auto text-slate-700 mb-4" />
                            <p className="text-slate-500 text-lg">No hay usuarios conectados</p>
                            <p className="text-slate-600 text-sm mt-1">Los usuarios aparecerán aquí cuando inicien sesión</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-slate-800 hover:bg-transparent">
                                        <TableHead className="text-slate-500 font-mono text-xs uppercase">Estado</TableHead>
                                        <TableHead className="text-slate-500 font-mono text-xs uppercase">Usuario</TableHead>
                                        <TableHead className="text-slate-500 font-mono text-xs uppercase">Email</TableHead>
                                        <TableHead className="text-slate-500 font-mono text-xs uppercase">Rol</TableHead>
                                        <TableHead className="text-slate-500 font-mono text-xs uppercase">Ubicación</TableHead>
                                        <TableHead className="text-slate-500 font-mono text-xs uppercase">Dispositivo</TableHead>
                                        <TableHead className="text-slate-500 font-mono text-xs uppercase">IP</TableHead>
                                        <TableHead className="text-slate-500 font-mono text-xs uppercase text-right">Última Actividad</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {onlineUsers.map((user) => (
                                        <TableRow key={user.id} className="border-slate-800 hover:bg-slate-800/50" data-testid={`online-user-${user.id}`}>
                                            <TableCell>
                                                <span className="relative flex h-3 w-3">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center text-sm font-bold text-emerald-400">
                                                        {(user.name || '?')[0].toUpperCase()}
                                                    </div>
                                                    <span className="text-white text-sm font-medium">{user.name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-slate-400 text-sm">{user.email}</TableCell>
                                            <TableCell>
                                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                                    user.role === 'admin'
                                                        ? 'bg-violet-500/20 text-violet-400'
                                                        : 'bg-cyan-500/20 text-cyan-400'
                                                }`}>
                                                    {user.role === 'admin' ? 'Admin' : 'Usuario'}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5">
                                                    <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                                                    <span className="text-slate-300 text-sm">{user.login_location}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5">
                                                    <Monitor className="w-3.5 h-3.5 text-slate-500" />
                                                    <span className="text-slate-400 text-sm">{user.login_device}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-slate-400 font-mono text-xs">{user.login_ip}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className="text-emerald-400 text-sm font-medium">{timeSince(user.last_active)}</span>
                                                    <span className="text-slate-600 text-xs">{formatTime(user.last_active)}</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Disclaimer */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-slate-500 leading-relaxed">
                        <strong className="text-slate-400">Nota:</strong> Un usuario se considera "conectado" si ha tenido actividad en los últimos 2 minutos. El estado se actualiza automáticamente cada 15 segundos.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AdminOnlineUsersPage;
