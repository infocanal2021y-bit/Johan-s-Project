import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import api from '../../lib/api';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { MailCheck, Loader2, RefreshCw, Send, Search, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { OnboardUsersForm } from '../../components/admin/OnboardUsersForm';

const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const STATUS = {
    activated: { label: 'Activado', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', Icon: CheckCircle2 },
    pending: { label: 'Pendiente', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', Icon: Clock },
    expired: { label: 'Enlace caducado', cls: 'bg-red-500/15 text-red-300 border-red-500/30', Icon: AlertTriangle },
};
const FILTERS = [{ id: '', label: 'Todos' }, { id: 'pending', label: 'Pendientes' }, { id: 'expired', label: 'Caducados' }, { id: 'activated', label: 'Activados' }];

const MAIL_CLS = { sent: 'text-emerald-300', failed: 'text-red-300', skipped: 'text-amber-300', pending: 'text-slate-400' };

export const AdminInvitationsPage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [q, setQ] = useState('');
    const [resending, setResending] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try { const r = await api.get('/admin/users/invitations'); setData(r.data); }
        catch { toast.error('No se pudieron cargar las invitaciones'); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const items = useMemo(() => {
        let list = data?.items || [];
        if (filter) list = list.filter((i) => i.activation === filter);
        const nq = q.trim().toLowerCase();
        if (nq) list = list.filter((i) => [i.name, i.email, i.phone].some((v) => (v || '').toLowerCase().includes(nq)));
        return list;
    }, [data, filter, q]);

    const counts = useMemo(() => (data?.items || []).reduce((acc, i) => ({ ...acc, [i.activation]: (acc[i.activation] || 0) + 1 }), {}), [data]);

    const resend = async (u) => {
        setResending(u.user_id);
        try {
            const { data: r } = await api.post(`/admin/users/invitations/${u.user_id}/resend`);
            r.ok ? toast.success(`Enlace reenviado a ${r.email}`) : toast.error(`Correo ${r.email_status}: ${r.email_error || ''}`);
            load();
        } catch (e) { toast.error(e.response?.data?.detail || 'No se pudo reenviar'); }
        finally { setResending(''); }
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5" data-testid="admin-invitations-page">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-[10.5px] uppercase tracking-[0.14em] text-amber-300 font-bold">Administración · Usuarios 360°</p>
                        <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1 flex items-center gap-2"><MailCheck className="w-7 h-7 text-amber-300" /> Invitaciones y Activación</h1>
                        <p className="text-slate-400 text-[13px] mt-1.5">Alta de usuarios desde el panel y seguimiento de quién ha activado su cuenta</p>
                    </div>
                    <Button onClick={load} variant="outline" className="bg-white/5 border-white/15 text-white hover:bg-white/10" data-testid="invitations-refresh"><RefreshCw className="w-4 h-4 mr-1.5" /> Refrescar</Button>
                </div>

                <OnboardUsersForm onDone={load} />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card className="p-4 bg-gradient-to-br from-[#072146] to-[#004481] border-0"><p className="text-[9.5px] uppercase tracking-wider text-[#7CB1E5] font-bold">Invitados</p><p className="text-white text-2xl font-bold mt-1 tabular-nums" data-testid="inv-count-total">{data?.count ?? 0}</p></Card>
                    <Card className="p-4 bg-white/5 border-white/10"><p className="text-[9.5px] uppercase tracking-wider text-emerald-300 font-bold">Activados</p><p className="text-white text-2xl font-bold mt-1 tabular-nums" data-testid="inv-count-activated">{counts.activated || 0}</p></Card>
                    <Card className="p-4 bg-white/5 border-white/10"><p className="text-[9.5px] uppercase tracking-wider text-amber-300 font-bold">Pendientes</p><p className="text-white text-2xl font-bold mt-1 tabular-nums" data-testid="inv-count-pending">{counts.pending || 0}</p></Card>
                    <Card className="p-4 bg-white/5 border-white/10"><p className="text-[9.5px] uppercase tracking-wider text-red-300 font-bold">Caducados</p><p className="text-white text-2xl font-bold mt-1 tabular-nums" data-testid="inv-count-expired">{counts.expired || 0}</p></Card>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {FILTERS.map((f) => (
                        <button key={f.id} onClick={() => setFilter(f.id)} data-testid={`inv-filter-${f.id || 'all'}`}
                            className={`px-3 py-1.5 rounded-full text-[11.5px] font-semibold border transition-colors ${filter === f.id ? 'bg-amber-500/15 text-amber-200 border-amber-500/40' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}>{f.label}</button>
                    ))}
                    <div className="ml-auto flex items-center gap-2 h-9 px-3 rounded-md bg-white/5 border border-white/10 min-w-[220px]">
                        <Search className="w-3.5 h-3.5 text-slate-500" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre, correo, teléfono…" className="flex-1 bg-transparent outline-none text-[12.5px] text-white placeholder:text-slate-500" data-testid="inv-search" />
                    </div>
                </div>

                <Card className="bg-slate-900/60 border border-slate-800 overflow-hidden">
                    {loading && !data ? <div className="py-12 text-center text-slate-400"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
                        : items.length === 0 ? <p className="py-12 text-center text-slate-500 text-[13px]" data-testid="inv-empty">No hay invitaciones para este filtro.</p> : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12.5px]" data-testid="inv-table">
                                <thead><tr className="bg-slate-950/60 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                                    <th className="text-left px-4 py-3 font-bold">Usuario</th><th className="text-left px-4 py-3 font-bold">Estado</th><th className="text-left px-4 py-3 font-bold">Invitado</th><th className="text-left px-4 py-3 font-bold">Activado</th><th className="text-left px-4 py-3 font-bold">Último correo</th><th className="px-4 py-3" />
                                </tr></thead>
                                <tbody>{items.map((u) => {
                                    const s = STATUS[u.activation] || STATUS.pending;
                                    return (
                                        <tr key={u.user_id} className="border-t border-slate-800/80 hover:bg-slate-800/40" data-testid={`inv-row-${u.user_id}`} data-activation={u.activation}>
                                            <td className="px-4 py-2.5">
                                                <a href={`/admin/users/${u.user_id}`} className="text-white font-semibold hover:text-cyan-300">{u.name || '—'}</a>
                                                <p className="text-slate-500 text-[11px] font-mono">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10.5px] font-bold uppercase ${s.cls}`} data-testid={`inv-status-${u.user_id}`}><s.Icon className="w-3 h-3" /> {s.label}</span>
                                                {u.activation !== 'activated' && u.token_expires_at && <p className="text-slate-500 text-[10.5px] mt-1">Enlace hasta {fmtDate(u.token_expires_at)}</p>}
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-300 font-mono text-[11px] whitespace-nowrap">{fmtDate(u.invited_at)}<p className="text-slate-500 text-[10px] font-sans">{u.invited_by || ''}</p></td>
                                            <td className="px-4 py-2.5 text-slate-300 font-mono text-[11px] whitespace-nowrap">{u.activation === 'activated' ? fmtDate(u.activated_at || u.last_login) : '—'}</td>
                                            <td className="px-4 py-2.5 text-[11px]">
                                                {u.last_email ? <><p className={`font-semibold ${MAIL_CLS[u.last_email.status] || 'text-slate-300'}`}>{u.last_email.status}</p><p className="text-slate-500 truncate max-w-[220px]">{u.last_email.subject}</p><p className="text-slate-600 font-mono text-[10px]">{fmtDate(u.last_email.created_at)}</p></> : <span className="text-slate-600">—</span>}
                                            </td>
                                            <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                                {u.activation !== 'activated' && (
                                                    <Button size="sm" variant="outline" onClick={() => resend(u)} disabled={resending === u.user_id}
                                                        className="h-8 border-cyan-600/40 text-cyan-300 hover:bg-cyan-500/10" data-testid={`inv-resend-${u.user_id}`}>
                                                        {resending === u.user_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />} Reenviar enlace
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}</tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>
        </Layout>
    );
};

export default AdminInvitationsPage;
