import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../../components/layout/Layout';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import api from '../../lib/api';
import { toast } from 'sonner';
import {
    Megaphone, ShieldCheck, Pin, PinOff, Eye, EyeOff, Trash2, Send, Pencil,
    CalendarClock, CornerDownRight, Loader2, Plus, Check, X,
} from 'lucide-react';

const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} · ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
};
const toLocalInput = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const STATUS_CHIP = {
    published: ['Publicada', 'bg-emerald-500/15 text-emerald-300'],
    scheduled: ['Programada', 'bg-sky-500/15 text-sky-300'],
    hidden:    ['Oculta', 'bg-slate-500/20 text-slate-400'],
};

const PostRow = ({ post, onAction }) => {
    const [editing, setEditing] = useState(false);
    const [body, setBody] = useState(post.body);
    const [dateEdit, setDateEdit] = useState(false);
    const [dateVal, setDateVal] = useState(toLocalInput(post.publish_at));
    const [replyOpen, setReplyOpen] = useState(false);
    const [replyText, setReplyText] = useState('');
    const chip = STATUS_CHIP[post.status] || STATUS_CHIP.published;

    const save = async (payload, msg) => {
        try {
            await api.put(`/admin/community-posts/${post.id}`, payload);
            toast.success(msg);
            onAction();
        } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    };

    return (
        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4" data-testid={`admin-post-${post.id}`}>
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white text-xs font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#F3D372]" /> Supports Lionsbit
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${chip[1]}`}>{chip[0]}</span>
                {post.pinned && <span className="text-amber-300 text-[10px] font-bold flex items-center gap-1"><Pin className="w-3 h-3" /> Fijada</span>}
                {post.auto_published && <span className="text-slate-500 text-[10px]">auto</span>}
                <span className="text-slate-500 text-[11px] ml-auto flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" />
                    {fmtDate(post.status === 'published' ? (post.published_at || post.publish_at) : post.publish_at)}
                </span>
            </div>

            {editing ? (
                <div className="mt-2 space-y-2">
                    <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm resize-none"
                        data-testid={`edit-body-${post.id}`} />
                    <div className="flex gap-2">
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 h-8 text-xs"
                            onClick={() => { save({ body }, 'Publicación actualizada'); setEditing(false); }}>
                            <Check className="w-3.5 h-3.5 mr-1" /> Guardar
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs border-slate-700 text-slate-300"
                            onClick={() => { setEditing(false); setBody(post.body); }}>
                            <X className="w-3.5 h-3.5 mr-1" /> Cancelar
                        </Button>
                    </div>
                </div>
            ) : (
                <p className="text-slate-300 text-[13px] mt-2 leading-relaxed">{post.body}</p>
            )}

            {(post.replies || []).map((r) => (
                <div key={r.id} className="mt-2 ml-2 pl-3 border-l-2 border-slate-800 flex items-start justify-between gap-2">
                    <p className="text-slate-400 text-[12px] leading-relaxed">
                        <CornerDownRight className="w-3 h-3 inline mr-1 text-slate-600" />{r.body}
                    </p>
                    <button type="button" className="text-slate-600 hover:text-red-400 flex-shrink-0"
                        onClick={async () => {
                            await api.delete(`/admin/community-posts/${post.id}/replies/${r.id}`);
                            toast.success('Respuesta eliminada'); onAction();
                        }} data-testid={`del-reply-${r.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            ))}

            {replyOpen && (
                <div className="mt-2 flex gap-2">
                    <input value={replyText} onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Respuesta oficial…"
                        className="flex-1 h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs"
                        data-testid={`reply-input-${post.id}`} />
                    <Button size="sm" className="bg-[#1973B8] hover:bg-[#1F89D8] h-9 text-xs" disabled={!replyText.trim()}
                        onClick={async () => {
                            try {
                                await api.post(`/admin/community-posts/${post.id}/replies`, { body: replyText });
                                toast.success('Respuesta añadida'); setReplyText(''); setReplyOpen(false); onAction();
                            } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
                        }} data-testid={`reply-save-${post.id}`}>Responder</Button>
                </div>
            )}

            {dateEdit && (
                <div className="mt-2 flex gap-2 items-center">
                    <input type="datetime-local" value={dateVal} onChange={(e) => setDateVal(e.target.value)}
                        className="h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs"
                        data-testid={`date-input-${post.id}`} />
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 h-9 text-xs"
                        onClick={() => { save({ publish_at: new Date(dateVal).toISOString() }, 'Fecha actualizada'); setDateEdit(false); }}>
                        Guardar fecha
                    </Button>
                </div>
            )}

            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                {post.status === 'scheduled' && (
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 h-7 text-[11px]" data-testid={`publish-now-${post.id}`}
                        onClick={async () => { await api.post(`/admin/community-posts/${post.id}/publish-now`); toast.success('Publicada ahora'); onAction(); }}>
                        <Send className="w-3 h-3 mr-1" /> Publicar ahora
                    </Button>
                )}
                <button type="button" className="px-2 py-1 rounded-md bg-slate-800 text-slate-300 text-[11px] font-semibold hover:text-white"
                    onClick={() => setEditing((v) => !v)} data-testid={`edit-btn-${post.id}`}>
                    <Pencil className="w-3 h-3 inline mr-1" /> Editar
                </button>
                <button type="button" className="px-2 py-1 rounded-md bg-slate-800 text-slate-300 text-[11px] font-semibold hover:text-white"
                    onClick={() => setDateEdit((v) => !v)} data-testid={`date-btn-${post.id}`}>
                    <CalendarClock className="w-3 h-3 inline mr-1" /> Fecha
                </button>
                <button type="button" className="px-2 py-1 rounded-md bg-slate-800 text-slate-300 text-[11px] font-semibold hover:text-white"
                    onClick={() => setReplyOpen((v) => !v)} data-testid={`reply-btn-${post.id}`}>
                    <CornerDownRight className="w-3 h-3 inline mr-1" /> Responder
                </button>
                <button type="button" className="px-2 py-1 rounded-md bg-slate-800 text-amber-300 text-[11px] font-semibold"
                    onClick={() => save({ pinned: !post.pinned }, post.pinned ? 'Desfijada' : 'Fijada')} data-testid={`pin-btn-${post.id}`}>
                    {post.pinned ? <PinOff className="w-3 h-3 inline mr-1" /> : <Pin className="w-3 h-3 inline mr-1" />}
                    {post.pinned ? 'Desfijar' : 'Fijar'}
                </button>
                {post.status !== 'scheduled' && (
                    <button type="button" className="px-2 py-1 rounded-md bg-slate-800 text-slate-300 text-[11px] font-semibold"
                        onClick={() => save({ status: post.status === 'hidden' ? 'published' : 'hidden' }, post.status === 'hidden' ? 'Visible de nuevo' : 'Oculta')}
                        data-testid={`hide-btn-${post.id}`}>
                        {post.status === 'hidden' ? <Eye className="w-3 h-3 inline mr-1" /> : <EyeOff className="w-3 h-3 inline mr-1" />}
                        {post.status === 'hidden' ? 'Mostrar' : 'Ocultar'}
                    </button>
                )}
                <button type="button" className="px-2 py-1 rounded-md bg-red-500/10 text-red-300 text-[11px] font-semibold ml-auto"
                    onClick={async () => {
                        if (!window.confirm('¿Eliminar esta publicación definitivamente?')) return;
                        await api.delete(`/admin/community-posts/${post.id}`);
                        toast.success('Publicación eliminada'); onAction();
                    }} data-testid={`delete-btn-${post.id}`}>
                    <Trash2 className="w-3 h-3 inline mr-1" /> Eliminar
                </button>
            </div>
        </div>
    );
};

export default function AdminCommunityPostsPage() {
    const [data, setData] = useState(null);
    const [tab, setTab] = useState('scheduled');
    const [newOpen, setNewOpen] = useState(false);
    const [nBody, setNBody] = useState('');
    const [nReply, setNReply] = useState('');
    const [nDate, setNDate] = useState('');
    const [nNow, setNNow] = useState(false);
    const [saving, setSaving] = useState(false);
    const [daily, setDaily] = useState('');
    const [maxP, setMaxP] = useState('');

    const load = useCallback(async () => {
        try {
            const r = await api.get('/admin/community-posts');
            setData(r.data);
            setDaily(String(r.data.settings.daily_count ?? 2));
            setMaxP(String(r.data.settings.max_posts ?? 100));
        } catch { toast.error('No se pudo cargar'); }
    }, []);
    useEffect(() => { load(); }, [load]);

    if (!data) return <Layout><div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div></Layout>;

    const { settings, counts } = data;
    const posts = data.posts.filter((p) => tab === 'all' ? true : p.status === tab);
    const scheduledByDay = {};
    data.posts.filter((p) => p.status === 'scheduled').forEach((p) => {
        const day = new Date(p.publish_at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        (scheduledByDay[day] = scheduledByDay[day] || []).push(p);
    });

    const saveSettings = async (payload) => {
        try {
            const r = await api.put('/admin/community-posts-settings', payload);
            toast.success('Configuración guardada');
            setData((d) => ({ ...d, settings: r.data.settings, counts: { ...d.counts, max: r.data.settings.max_posts } }));
        } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    };

    const createPost = async () => {
        setSaving(true);
        try {
            await api.post('/admin/community-posts', {
                body: nBody, reply: nReply || undefined,
                publish_at: nDate ? new Date(nDate).toISOString() : undefined,
                publish_now: nNow,
            });
            toast.success('Publicación creada');
            setNBody(''); setNReply(''); setNDate(''); setNNow(false); setNewOpen(false);
            load();
        } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
        finally { setSaving(false); }
    };

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-5 p-3 sm:p-5" data-testid="admin-community-posts-page">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-[#072146] ring-1 ring-[#D4AF37]/30 flex items-center justify-center">
                            <Megaphone className="w-5 h-5 text-[#F3D372]" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-white">Publicaciones programadas</h1>
                            <p className="text-slate-400 text-xs">Administración → Comunidad · canal oficial Supports Lionsbit</p>
                        </div>
                    </div>
                    <Button onClick={() => setNewOpen((v) => !v)} className="bg-[#1973B8] hover:bg-[#1F89D8] h-9 text-xs" data-testid="new-post-btn">
                        <Plus className="w-4 h-4 mr-1" /> Nueva publicación
                    </Button>
                </div>

                {/* Contador + configuración */}
                <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 space-y-4" data-testid="autopost-settings">
                    <div>
                        <div className="flex items-center justify-between">
                            <p className="text-white text-sm font-bold" data-testid="posts-counter">
                                Publicaciones actuales: <span className="text-[#F3D372] font-mono">{counts.published} / {counts.max}</span>
                            </p>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold ${settings.enabled ? 'text-emerald-300' : 'text-amber-300'}`}>
                                    {settings.enabled ? 'Autopublicación activa' : 'En pausa'}
                                </span>
                                <Switch checked={!!settings.enabled}
                                    onCheckedChange={(v) => saveSettings({ enabled: v })}
                                    data-testid="autopost-toggle" />
                            </div>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800 mt-2 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-[#D4AF37] to-[#F3D372] transition-all"
                                style={{ width: `${Math.min((counts.published / (counts.max || 1)) * 100, 100)}%` }} />
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1.5">
                            {counts.scheduled} programadas en cola · {counts.hidden} ocultas ·
                            al alcanzar el máximo la publicación automática se detiene sola
                        </p>
                    </div>
                    <div className="flex items-end gap-3 flex-wrap">
                        <label className="block">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Publicaciones por día</span>
                            <input type="number" min="1" max="20" value={daily} onChange={(e) => setDaily(e.target.value)}
                                className="block w-28 h-9 px-3 mt-1 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm font-mono"
                                data-testid="daily-count-input" />
                        </label>
                        <label className="block">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Límite máximo</span>
                            <input type="number" min="1" max="1000" value={maxP} onChange={(e) => setMaxP(e.target.value)}
                                className="block w-28 h-9 px-3 mt-1 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm font-mono"
                                data-testid="max-posts-input" />
                        </label>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 h-9 text-xs"
                            onClick={() => saveSettings({ daily_count: Number(daily), max_posts: Number(maxP) })}
                            data-testid="save-settings-btn">
                            Guardar configuración
                        </Button>
                    </div>
                </div>

                {/* Nueva publicación */}
                {newOpen && (
                    <div className="rounded-xl bg-slate-900/70 border border-[#D4AF37]/25 p-4 space-y-2.5" data-testid="new-post-form">
                        <textarea value={nBody} onChange={(e) => setNBody(e.target.value)} rows={3}
                            placeholder="Texto de la publicación oficial…"
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm resize-none"
                            data-testid="new-post-body" />
                        <input value={nReply} onChange={(e) => setNReply(e.target.value)}
                            placeholder="Respuesta / información adicional (opcional)"
                            className="w-full h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs" />
                        <div className="flex items-center gap-3 flex-wrap">
                            <input type="datetime-local" value={nDate} onChange={(e) => setNDate(e.target.value)} disabled={nNow}
                                className="h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs disabled:opacity-40"
                                data-testid="new-post-date" />
                            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={nNow} onChange={(e) => setNNow(e.target.checked)} className="accent-emerald-500"
                                    data-testid="new-post-now" />
                                Publicar inmediatamente
                            </label>
                            <Button size="sm" disabled={saving || !nBody.trim()} onClick={createPost}
                                className="bg-emerald-600 hover:bg-emerald-500 h-9 text-xs ml-auto" data-testid="new-post-save">
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />} Crear
                            </Button>
                        </div>
                    </div>
                )}

                {/* Calendario de próximas */}
                {counts.scheduled > 0 && (
                    <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4" data-testid="schedule-calendar">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-[#E5C158] font-bold mb-2.5 flex items-center gap-1.5">
                            <CalendarClock className="w-3.5 h-3.5" /> Calendario de próximas publicaciones
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                            {Object.entries(scheduledByDay).map(([day, list]) => (
                                <div key={day} className="rounded-lg bg-slate-950/60 border border-slate-800 p-2.5">
                                    <p className="text-sky-300 text-[11px] font-bold capitalize">{day}</p>
                                    {list.map((p) => (
                                        <p key={p.id} className="text-slate-400 text-[11px] mt-1 truncate">
                                            <span className="text-slate-500 font-mono">{new Date(p.publish_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span> · {p.body}
                                        </p>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Listado con filtros */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    {[['scheduled', `Programadas (${counts.scheduled})`], ['published', `Publicadas (${counts.published})`], ['hidden', `Ocultas (${counts.hidden})`], ['all', 'Todas']].map(([id, label]) => (
                        <button key={id} type="button" onClick={() => setTab(id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                tab === id ? 'bg-[#D4AF37]/15 text-[#F3D372] ring-1 ring-[#D4AF37]/30' : 'text-slate-500 hover:text-white'
                            }`} data-testid={`filter-${id}`}>{label}</button>
                    ))}
                </div>
                <div className="space-y-3">
                    {posts.length === 0 && <p className="text-slate-500 text-sm text-center py-8">Sin publicaciones en este filtro.</p>}
                    {posts.map((p) => <PostRow key={p.id} post={p} onAction={load} />)}
                </div>
            </div>
        </Layout>
    );
}
