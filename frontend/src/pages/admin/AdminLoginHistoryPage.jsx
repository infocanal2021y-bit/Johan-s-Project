import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { adminAPI } from '../../lib/api';
import { toast } from 'sonner';
import { History, AlertTriangle, Globe, Monitor, RefreshCw, MapPin, Shield, Clock } from 'lucide-react';
import { Button } from '../../components/ui/button';

export const AdminLoginHistoryPage = () => {
    const [history, setHistory] = useState([]);
    const [suspicious, setSuspicious] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [historyRes, suspiciousRes] = await Promise.all([
                adminAPI.getLoginHistory(),
                adminAPI.getSuspiciousLogins()
            ]);
            setHistory(historyRes.data);
            setSuspicious(suspiciousRes.data);
        } catch {
            toast.error('Error al cargar historial de accesos');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filtered = history.filter(h =>
        (h.user_email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (h.user_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (h.ip_address || '').includes(searchTerm) ||
        (h.location || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatDate = (iso) => {
        if (!iso) return '-';
        const d = new Date(iso);
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) +
            ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="space-y-6" data-testid="admin-login-history">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-heading font-bold text-white">Historial de Accesos</h1>
                    <p className="text-slate-500 mt-1">Registro de inicios de sesión de todos los usuarios</p>
                </div>
                <Button onClick={fetchData} variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800" data-testid="refresh-login-history">
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
                                <p className="text-sm text-slate-500">Accesos Totales</p>
                                <p className="text-2xl font-bold font-mono text-white">{history.length}</p>
                            </div>
                            <History className="w-8 h-8 text-emerald-400 opacity-50" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Usuarios Únicos</p>
                                <p className="text-2xl font-bold font-mono text-white">
                                    {new Set(history.map(h => h.user_id)).size}
                                </p>
                            </div>
                            <Globe className="w-8 h-8 text-cyan-400 opacity-50" />
                        </div>
                    </CardContent>
                </Card>
                <Card className={`border-slate-800 ${suspicious.length > 0 ? 'bg-red-950/50 border-red-800/50' : 'bg-slate-900'}`}>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Alertas Sospechosas</p>
                                <p className={`text-2xl font-bold font-mono ${suspicious.length > 0 ? 'text-red-400' : 'text-white'}`}>
                                    {suspicious.length}
                                </p>
                            </div>
                            <AlertTriangle className={`w-8 h-8 opacity-50 ${suspicious.length > 0 ? 'text-red-400' : 'text-slate-600'}`} />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Suspicious Alerts */}
            {suspicious.length > 0 && (
                <Card className="bg-red-950/30 border-red-800/50">
                    <CardHeader>
                        <CardTitle className="text-red-400 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" />
                            Accesos Sospechosos Detectados
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {suspicious.map((s, i) => (
                            <div key={i} className="bg-red-950/50 rounded-lg p-4 border border-red-800/30" data-testid={`suspicious-alert-${i}`}>
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div>
                                        <p className="text-white font-medium">{s.user_name || s.user_email}</p>
                                        <p className="text-sm text-red-300">{s.user_email}</p>
                                    </div>
                                    <div className="bg-red-900/60 text-red-300 text-xs px-3 py-1 rounded-full font-mono">
                                        {s.alert}
                                    </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {s.countries.map((c, ci) => (
                                        <span key={ci} className="text-xs bg-red-900/40 text-red-200 px-2 py-1 rounded">
                                            <MapPin className="w-3 h-3 inline mr-1" />{c}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Search */}
            <div className="flex items-center gap-3">
                <input
                    type="text"
                    placeholder="Buscar por email, nombre, IP o ubicación..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    data-testid="login-history-search"
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
            </div>

            {/* History Table */}
            <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white font-heading flex items-center gap-2">
                        <Clock className="w-5 h-5 text-emerald-400" />
                        Accesos Recientes ({filtered.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-12">
                            <History className="w-12 h-12 mx-auto text-slate-600 mb-4" />
                            <p className="text-slate-500">No hay registros de acceso</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-slate-800 hover:bg-transparent">
                                        <TableHead className="text-slate-500 font-mono text-xs uppercase">Usuario</TableHead>
                                        <TableHead className="text-slate-500 font-mono text-xs uppercase">Email</TableHead>
                                        <TableHead className="text-slate-500 font-mono text-xs uppercase">Ubicación</TableHead>
                                        <TableHead className="text-slate-500 font-mono text-xs uppercase">IP</TableHead>
                                        <TableHead className="text-slate-500 font-mono text-xs uppercase">Dispositivo</TableHead>
                                        <TableHead className="text-slate-500 font-mono text-xs uppercase text-right">Fecha / Hora</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filtered.map((login, idx) => (
                                        <TableRow key={login.id || idx} className="border-slate-800 hover:bg-slate-800/50">
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-emerald-400">
                                                        {(login.user_name || login.user_email || '?')[0].toUpperCase()}
                                                    </div>
                                                    <span className="text-white text-sm">{login.user_name || '-'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-slate-400 text-sm">{login.user_email || '-'}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5">
                                                    <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                                                    <span className="text-slate-300 text-sm">{login.location || 'Desconocido'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-slate-400 font-mono text-xs">{login.ip_address}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5">
                                                    <Monitor className="w-3.5 h-3.5 text-slate-500" />
                                                    <span className="text-slate-400 text-sm">{login.browser} / {login.device}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right text-slate-400 text-sm">{formatDate(login.logged_in_at)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Legal Disclaimer */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-slate-500 leading-relaxed">
                        <strong className="text-slate-400">Aviso:</strong> Este registro de accesos es exclusivamente para fines de seguridad y auditoría interna de la plataforma LIONSBIT VERIFICACION. Los datos son tratados conforme a las políticas de privacidad vigentes.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AdminLoginHistoryPage;
