import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Bell, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, X, Settings, Bitcoin } from 'lucide-react';
import { Button } from '../components/ui/button';

// Simulated market alerts
const INITIAL_ALERTS = [
    {
        id: 1,
        type: 'price_up',
        title: 'Bitcoin subió 5% hoy',
        message: 'BTC alcanzó un nuevo máximo de 24 horas en $67,500',
        timestamp: new Date(Date.now() - 1000 * 60 * 15),
        read: false,
        icon: TrendingUp,
        color: 'emerald'
    },
    {
        id: 2,
        type: 'trending',
        title: 'Ethereum está en tendencia',
        message: 'ETH muestra un aumento en el volumen de operaciones del 25%',
        timestamp: new Date(Date.now() - 1000 * 60 * 45),
        read: false,
        icon: TrendingUp,
        color: 'blue'
    },
    {
        id: 3,
        type: 'price_down',
        title: 'Alerta de caída: Dogecoin',
        message: 'DOGE bajó un 3.5% en la última hora',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
        read: true,
        icon: TrendingDown,
        color: 'red'
    },
    {
        id: 4,
        type: 'news',
        title: 'Actualización del mercado',
        message: 'El mercado cripto muestra señales de recuperación después de la corrección',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5),
        read: true,
        icon: AlertTriangle,
        color: 'amber'
    },
    {
        id: 5,
        type: 'milestone',
        title: 'Solana alcanza nuevo récord',
        message: 'SOL supera los $140 por primera vez en 6 meses',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8),
        read: true,
        icon: CheckCircle,
        color: 'purple'
    },
];

const NEW_ALERT_MESSAGES = [
    { type: 'price_up', title: 'Bitcoin en alza', message: 'BTC sube un 2.3% en la última hora', icon: TrendingUp, color: 'emerald' },
    { type: 'trending', title: 'Volumen récord en ETH', message: 'Ethereum registra $15B en volumen de 24h', icon: TrendingUp, color: 'blue' },
    { type: 'price_down', title: 'Corrección en Solana', message: 'SOL cae un 1.8% después del rally', icon: TrendingDown, color: 'orange' },
    { type: 'news', title: 'Mercados en movimiento', message: 'Alta volatilidad detectada en el mercado cripto', icon: AlertTriangle, color: 'amber' },
    { type: 'milestone', title: 'Cardano rompe resistencia', message: 'ADA supera la barrera de $0.45', icon: CheckCircle, color: 'cyan' },
];

export const AlertsPage = () => {
    const [alerts, setAlerts] = useState(INITIAL_ALERTS);
    const [filter, setFilter] = useState('all');

    // Simulate new alerts every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            const randomAlert = NEW_ALERT_MESSAGES[Math.floor(Math.random() * NEW_ALERT_MESSAGES.length)];
            const newAlert = {
                id: Date.now(),
                ...randomAlert,
                timestamp: new Date(),
                read: false,
            };
            setAlerts(prev => [newAlert, ...prev].slice(0, 20)); // Keep only last 20 alerts
        }, 30000);

        return () => clearInterval(interval);
    }, []);

    const markAsRead = (alertId) => {
        setAlerts(prev =>
            prev.map(alert =>
                alert.id === alertId ? { ...alert, read: true } : alert
            )
        );
    };

    const markAllAsRead = () => {
        setAlerts(prev => prev.map(alert => ({ ...alert, read: true })));
    };

    const deleteAlert = (alertId) => {
        setAlerts(prev => prev.filter(alert => alert.id !== alertId));
    };

    const clearAll = () => {
        setAlerts([]);
    };

    const filteredAlerts = alerts.filter(alert => {
        if (filter === 'unread') return !alert.read;
        if (filter === 'read') return alert.read;
        return true;
    });

    const unreadCount = alerts.filter(a => !a.read).length;

    const formatTimestamp = (date) => {
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Ahora mismo';
        if (minutes < 60) return `Hace ${minutes} min`;
        if (hours < 24) return `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
        return `Hace ${days} día${days > 1 ? 's' : ''}`;
    };

    const getColorClasses = (color) => {
        const colors = {
            emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
            blue: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
            red: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
            amber: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
            purple: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
            orange: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
            cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
        };
        return colors[color] || colors.blue;
    };

    return (
        <Layout>
            <div className="max-w-3xl mx-auto space-y-6" data-testid="alerts-page">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                    <div>
                        <h1 className="text-3xl text-white flex items-center gap-3" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                            <Bell className="w-8 h-8 text-emerald-400" />
                            Alertas del Mercado
                            {unreadCount > 0 && (
                                <span className="bg-red-500 text-white text-sm px-2 py-1 rounded-full">
                                    {unreadCount}
                                </span>
                            )}
                        </h1>
                        <p className="text-slate-500 mt-1 font-light">
                            Notificaciones informativas sobre movimientos del mercado cripto
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={markAllAsRead}
                            className="border-slate-700 text-slate-300 hover:bg-slate-800"
                        >
                            Marcar todo leído
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={clearAll}
                            className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                        >
                            Limpiar todo
                        </Button>
                    </div>
                </motion.div>

                {/* Filters */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="flex gap-2"
                >
                    {[
                        { value: 'all', label: 'Todas' },
                        { value: 'unread', label: 'No leídas' },
                        { value: 'read', label: 'Leídas' },
                    ].map((option) => (
                        <button
                            key={option.value}
                            onClick={() => setFilter(option.value)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                filter === option.value
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:bg-slate-700'
                            }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </motion.div>

                {/* Alerts List */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-3"
                >
                    {filteredAlerts.length === 0 ? (
                        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                            <CardContent className="p-8 text-center">
                                <Bell className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                                <p className="text-slate-400">No hay alertas para mostrar</p>
                            </CardContent>
                        </Card>
                    ) : (
                        filteredAlerts.map((alert, index) => {
                            const colors = getColorClasses(alert.color);
                            const IconComponent = alert.icon;

                            return (
                                <motion.div
                                    key={alert.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                >
                                    <Card
                                        className={`bg-slate-900/70 backdrop-blur-xl border-slate-800 ${
                                            !alert.read ? 'border-l-4 border-l-emerald-500' : ''
                                        } hover:bg-slate-800/50 transition-colors cursor-pointer`}
                                        onClick={() => markAsRead(alert.id)}
                                    >
                                        <CardContent className="p-4">
                                            <div className="flex items-start gap-4">
                                                <div className={`w-10 h-10 rounded-full ${colors.bg} flex items-center justify-center flex-shrink-0`}>
                                                    <IconComponent className={`w-5 h-5 ${colors.text}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div>
                                                            <p className={`font-medium ${!alert.read ? 'text-white' : 'text-slate-300'}`}>
                                                                {alert.title}
                                                            </p>
                                                            <p className="text-sm text-slate-500 mt-1">
                                                                {alert.message}
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                deleteAlert(alert.id);
                                                            }}
                                                            className="p-1 rounded hover:bg-slate-700 transition-colors"
                                                        >
                                                            <X className="w-4 h-4 text-slate-500" />
                                                        </button>
                                                    </div>
                                                    <p className="text-xs text-slate-600 mt-2">
                                                        {formatTimestamp(alert.timestamp)}
                                                    </p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            );
                        })
                    )}
                </motion.div>

                {/* Info Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <Card className="bg-cyan-500/10 border-cyan-500/30">
                        <CardContent className="p-4 flex items-center gap-3">
                            <Bitcoin className="w-6 h-6 text-cyan-400" />
                            <div>
                                <p className="text-cyan-400 text-sm font-medium">Alertas en tiempo real</p>
                                <p className="text-cyan-400/70 text-xs">
                                    Las alertas se actualizan automáticamente cada 30 segundos con información del mercado.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Disclaimer */}
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <p className="text-amber-400 text-sm">
                        <strong>⚠️ Aviso Importante:</strong> Los datos mostrados en esta plataforma relacionados con mercados financieros y criptomonedas son únicamente informativos. No constituyen asesoramiento financiero ni representan una invitación a invertir. La plataforma no está habilitada para realizar inversiones .
                    </p>
                </div>
            </div>
        </Layout>
    );
};

export default AlertsPage;
