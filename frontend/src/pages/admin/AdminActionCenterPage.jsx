import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { toast } from 'sonner';
import {
    ShieldAlert, Loader2, ArrowRight, CheckCircle, Radar, FileCheck,
    Bell, Clock, Info, KeyRound,
} from 'lucide-react';

const ACTION_ICON = {
    authorize_withdrawal: FileCheck,
    review_incident: ShieldAlert,
    validate_txid: Radar,
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const CategoryCard = ({ title, items, count, icon: Icon, color, testid }) => (
    <div className={`rounded-2xl bg-slate-900/70 border border-slate-800 overflow-hidden`} data-testid={testid}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-white font-semibold text-sm">{title}</span>
            </div>
            <span className={`min-w-[26px] text-center px-2 py-0.5 rounded-full text-xs font-bold ${color} bg-slate-800`}>{count}</span>
        </div>
        <div className="divide-y divide-slate-800/60 max-h-64 overflow-y-auto">
            {items.length === 0 ? (
                <p className="text-slate-600 text-xs px-4 py-6 text-center">Sin elementos</p>
            ) : items.map((n, i) => (
                <div key={n.id || i} className="px-4 py-2.5">
                    <p className="text-slate-200 text-[13px] font-medium">{n.title || n.message}</p>
                    {n.title && n.message && <p className="text-slate-500 text-[11px] mt-0.5 line-clamp-2">{n.message}</p>}
                    <p className="text-slate-600 text-[10px] mt-1">{fmtDate(n.created_at)}</p>
                </div>
            ))}
        </div>
    </div>
);

const AdminActionCenterPage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [twofa, setTwofa] = useState(true);
    const navigate = useNavigate();

    const load = async () => {
        try {
            const [ac, tf] = await Promise.all([adminAPI.getActionCenter(), adminAPI.get2fa()]);
            setData(ac.data);
            setTwofa(!!tf.data.enabled);
        } catch {
            toast.error('Error al cargar el centro de acciones');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const toggle2fa = async (val) => {
        setTwofa(val);
        try {
            await adminAPI.set2fa(val);
            toast.success(val ? '2FA por email activado para administradores' : '2FA desactivado');
        } catch {
            setTwofa(!val);
            toast.error('No se pudo actualizar el ajuste de 2FA');
        }
    };

    const actions = data?.actions || [];
    const counts = data?.counts || {};
    const notifs = data?.notifications || {};

    return (
        <Layout>
            <div className="max-w-6xl mx-auto space-y-6" data-testid="admin-action-center-page">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25">
                        <ShieldAlert className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Centro de Acciones</h1>
                        <p className="text-sm text-slate-400 font-light">Operaciones que requieren su decisión · Notificaciones administrativas</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
                ) : (
                    <>
                        {/* Acciones que requieren mi autorización */}
                        <div className="rounded-2xl bg-slate-900/70 border border-amber-500/25 overflow-hidden" data-testid="requires-authorization-block">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-amber-500/5">
                                <div className="flex items-center gap-2">
                                    <FileCheck className="w-4 h-4 text-amber-400" />
                                    <span className="text-white font-semibold">Acciones que requieren mi autorización</span>
                                </div>
                                <span className="min-w-[26px] text-center px-2 py-0.5 rounded-full text-xs font-bold text-amber-300 bg-amber-500/15" data-testid="actions-count">{actions.length}</span>
                            </div>
                            <div className="divide-y divide-slate-800/60">
                                {actions.length === 0 ? (
                                    <div className="px-4 py-10 text-center">
                                        <CheckCircle className="w-8 h-8 text-emerald-500/60 mx-auto mb-2" />
                                        <p className="text-slate-400 text-sm">No hay acciones pendientes de autorización.</p>
                                    </div>
                                ) : actions.map((a, i) => {
                                    const Icon = ACTION_ICON[a.type] || Bell;
                                    return (
                                        <div key={a.entity_id || i} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/30" data-testid={`action-item-${i}`}>
                                            <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                                                <Icon className="w-4 h-4 text-amber-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-sm font-semibold">{a.label}</p>
                                                <p className="text-slate-500 text-xs truncate">
                                                    {a.user_email} · {a.reference || a.entity_id?.slice(0, 8)}
                                                    {a.amount ? ` · ${a.amount} ${a.currency || ''}` : ''}
                                                </p>
                                            </div>
                                            <Button size="sm" onClick={() => navigate(a.link)}
                                                className="bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 h-8"
                                                data-testid={`action-go-${i}`}>
                                                Revisar <ArrowRight className="w-3.5 h-3.5 ml-1" />
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Notificaciones categorizadas */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <CategoryCard title="Requieren acción" items={notifs.requires_action || []} count={counts.requires_action || 0} icon={ShieldAlert} color="text-amber-400" testid="cat-requires-action" />
                            <CategoryCard title="Pendientes de revisión" items={notifs.pending_review || []} count={counts.pending_review || 0} icon={Clock} color="text-cyan-400" testid="cat-pending-review" />
                            <CategoryCard title="Informativas" items={notifs.informative || []} count={counts.informative || 0} icon={Info} color="text-slate-400" testid="cat-informative" />
                        </div>

                        {/* Seguridad: 2FA admin */}
                        <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 flex items-center justify-between" data-testid="admin-2fa-toggle-block">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
                                    <KeyRound className="w-5 h-5 text-emerald-400" />
                                </div>
                                <div>
                                    <p className="text-white font-semibold text-sm">Verificación en dos pasos (email) para administradores</p>
                                    <p className="text-slate-500 text-xs">Solicita un código de 6 dígitos al iniciar sesión como administrador.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold ${twofa ? 'text-emerald-400' : 'text-slate-500'}`}>{twofa ? 'Activado' : 'Desactivado'}</span>
                                <Switch checked={twofa} onCheckedChange={toggle2fa} data-testid="admin-2fa-switch" />
                            </div>
                        </div>
                    </>
                )}
            </div>
        </Layout>
    );
};

export default AdminActionCenterPage;
