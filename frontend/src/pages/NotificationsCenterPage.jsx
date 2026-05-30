import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import api from '../lib/api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import {
    Bell, CheckCheck, Trash2, Banknote, FileText, Mail, ShieldCheck,
    RefreshCw, Filter, Inbox, Eye, EyeOff, Loader2, ChevronRight,
} from 'lucide-react';

const ICON_BY_CATEGORY = { transactions: Banknote, documents: FileText, messages: Mail, expediente: ShieldCheck, system: Bell };

const fmtTime = (iso) => !iso ? '' : new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

const fmtDayLabel = (dayKey) => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (dayKey === today) return 'Hoy';
    if (dayKey === yesterday) return 'Ayer';
    const d = new Date(dayKey + 'T00:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};


const NotificationsCenterPage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [category, setCategory] = useState('all');
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [marking, setMarking] = useState(false);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const r = await api.get('/notifications/center', {
                params: { category: category === 'all' ? undefined : category, unread_only: unreadOnly, limit: 200 },
            });
            setData(r.data);
        } catch (err) {
            console.error('[notif-center] load', err);
            toast.error('No se pudieron cargar las notificaciones');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [category, unreadOnly]);

    useEffect(() => { load(); }, [load]);

    const markRead = async (id) => {
        try {
            await api.put(`/notifications/${id}/read`);
            load(true);
        } catch (err) {
            toast.error('No se pudo marcar como leída');
        }
    };

    const markAllRead = async () => {
        if (!data?.unread_total) return;
        setMarking(true);
        try {
            const r = await api.put('/notifications/read-all');
            toast.success(`${r.data.updated || 0} notificaciones marcadas como leídas`);
            load(true);
        } catch (err) {
            toast.error('No se pudo marcar todas como leídas');
        } finally {
            setMarking(false);
        }
    };

    const deleteOne = async (id) => {
        if (!window.confirm('¿Eliminar esta notificación?')) return;
        try {
            await api.delete(`/notifications/${id}`);
            toast.success('Notificación eliminada');
            load(true);
        } catch (err) {
            toast.error('No se pudo eliminar');
        }
    };

    const renderFilterTabs = () => {
        if (!data) return null;
        const tabs = [{ id: 'all', label: 'Todas', count: data.total }];
        Object.entries(data.category_meta).forEach(([id, meta]) => {
            tabs.push({ id, label: meta.label, count: data.counts_by_category[id] || 0, color: meta.color });
        });
        return (
            <Card className="bg-slate-900/70 ring-1 ring-slate-800 border-0 p-2 flex flex-wrap items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-500 ml-1" />
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setCategory(t.id)}
                        className={`px-3 py-1.5 rounded-md text-[11.5px] font-bold uppercase tracking-wider transition-all ${
                            category === t.id
                                ? 'bg-[#1973B8] text-white shadow-md'
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                        data-testid={`notif-filter-${t.id}`}
                    >
                        <span style={category !== t.id && t.color ? { color: t.color } : {}}>{t.label}</span>
                        <span className="ml-1 text-[10px] opacity-70">{t.count}</span>
                    </button>
                ))}
            </Card>
        );
    };

    return (
        <Layout>
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-[10.5px] uppercase tracking-[0.14em] text-[#7CB1E5] font-bold flex items-center gap-1.5">
                            <Bell className="w-3 h-3" /> Centro de notificaciones
                        </p>
                        <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1" data-testid="notif-center-title">
                            Bandeja de actividad
                        </h1>
                        {data && (
                            <p className="text-slate-400 text-[13px] mt-1.5">
                                <strong className="text-white">{data.total}</strong> notificaciones totales ·{' '}
                                {data.unread_total > 0 ? (
                                    <strong className="text-amber-300">{data.unread_total} sin leer</strong>
                                ) : (
                                    <span className="text-emerald-400">Todo al día ✓</span>
                                )}
                            </p>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            onClick={() => setUnreadOnly(!unreadOnly)}
                            variant="outline"
                            className={`${unreadOnly ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/15 text-white'} hover:bg-white/10`}
                            data-testid="notif-toggle-unread"
                        >
                            {unreadOnly ? <Eye className="w-4 h-4 mr-1.5" /> : <EyeOff className="w-4 h-4 mr-1.5" />}
                            {unreadOnly ? 'Mostrando solo sin leer' : 'Mostrar todas'}
                        </Button>
                        <Button
                            onClick={() => { setRefreshing(true); load(true); }}
                            variant="outline"
                            className="bg-white/5 border-white/15 text-white hover:bg-white/10"
                            data-testid="notif-refresh"
                        >
                            <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} /> Refrescar
                        </Button>
                        {data?.unread_total > 0 && (
                            <Button
                                onClick={markAllRead}
                                disabled={marking}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                                data-testid="notif-mark-all-read"
                            >
                                {marking ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCheck className="w-4 h-4 mr-1.5" />}
                                Marcar todas como leídas
                            </Button>
                        )}
                    </div>
                </div>

                {/* Filter tabs */}
                {renderFilterTabs()}

                {/* List */}
                {loading ? (
                    <div className="text-center py-16 text-slate-400"><Loader2 className="w-8 h-8 mx-auto animate-spin" /></div>
                ) : !data?.grouped_by_day?.length ? (
                    <Card className="p-12 bg-slate-900/50 ring-1 ring-slate-800 border-0 text-center">
                        <Inbox className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                        <p className="text-white font-bold text-[14px]">Sin notificaciones</p>
                        <p className="text-slate-500 text-[12px] mt-1">
                            {unreadOnly || category !== 'all' ? 'Prueba ajustando los filtros.' : 'Aquí aparecerán las actualizaciones de tu actividad.'}
                        </p>
                    </Card>
                ) : (
                    <div className="space-y-5">
                        <AnimatePresence>
                            {data.grouped_by_day.map(group => (
                                <motion.div
                                    key={group.day}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.25 }}
                                >
                                    <div className="flex items-center gap-2 mb-2 px-1">
                                        <div className="w-1 h-4 bg-[#1973B8] rounded" />
                                        <p className="text-[10.5px] uppercase tracking-[0.14em] text-[#7CB1E5] font-bold">
                                            {fmtDayLabel(group.day)}
                                        </p>
                                        <span className="text-slate-500 text-[10px] font-mono">· {group.items.length}</span>
                                    </div>
                                    <div className="space-y-1.5">
                                        {group.items.map((n, idx) => {
                                            const meta = data.category_meta[n.category] || data.category_meta.system;
                                            const IconC = ICON_BY_CATEGORY[n.category] || Bell;
                                            const isUnread = !n.read;
                                            return (
                                                <motion.div
                                                    key={n.id}
                                                    initial={{ opacity: 0, x: -8 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: idx * 0.025 }}
                                                    className={`group flex items-start gap-3 p-3.5 rounded-xl ring-1 transition-all ${
                                                        isUnread
                                                            ? 'bg-slate-900 ring-cyan-500/20 hover:ring-cyan-500/40'
                                                            : 'bg-slate-900/40 ring-slate-800 hover:ring-slate-700'
                                                    }`}
                                                    data-testid={`notif-row-${n.id}`}
                                                >
                                                    {/* Icon */}
                                                    <div
                                                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ring-1"
                                                        style={{ background: meta.color + '20', color: meta.color, borderColor: meta.color + '40' }}
                                                    >
                                                        <IconC className="w-4 h-4" />
                                                    </div>

                                                    {/* Body */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-start gap-2 justify-between">
                                                            <div className="flex-1 min-w-0">
                                                                <p className={`text-[13px] ${isUnread ? 'text-white font-bold' : 'text-slate-300 font-semibold'}`}>
                                                                    {n.title}
                                                                </p>
                                                                <p className="text-slate-400 text-[11.5px] mt-0.5 leading-relaxed">
                                                                    {n.message}
                                                                </p>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                                                <span
                                                                    className="text-[9.5px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
                                                                    style={{ background: meta.color + '20', color: meta.color }}
                                                                >
                                                                    {meta.label}
                                                                </span>
                                                                <p className="text-slate-500 text-[10px] font-mono">{fmtTime(n.created_at)}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Actions */}
                                                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {isUnread && (
                                                            <button
                                                                onClick={() => markRead(n.id)}
                                                                className="p-1.5 rounded text-emerald-400 hover:bg-emerald-500/10"
                                                                title="Marcar como leída"
                                                                data-testid={`notif-mark-read-${n.id}`}
                                                            >
                                                                <CheckCheck className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => deleteOne(n.id)}
                                                            className="p-1.5 rounded text-rose-400 hover:bg-rose-500/10"
                                                            title="Eliminar"
                                                            data-testid={`notif-delete-${n.id}`}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>

                                                    {/* Unread dot */}
                                                    {isUnread && (
                                                        <div className="absolute -mt-1 -ml-1">
                                                            <span className="w-2 h-2 rounded-full bg-cyan-400 ring-2 ring-slate-950 animate-pulse" />
                                                        </div>
                                                    )}
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default NotificationsCenterPage;
