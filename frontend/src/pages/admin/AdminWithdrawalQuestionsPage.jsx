import { useState, useEffect } from 'react';
import { Layout } from '../../components/layout/Layout';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { toast } from 'sonner';
import {
    MessageCircleQuestion, Loader2, Send, Clock, CheckCircle, ListFilter,
    EyeOff, Eye, Trash2, Pencil, Search, Star,
} from 'lucide-react';

const TABS = [
    { key: 'pending', label: 'Pendientes', Icon: Clock, cls: 'text-amber-400' },
    { key: 'answered', label: 'Respondidas', Icon: CheckCircle, cls: 'text-emerald-400' },
    { key: 'all', label: 'Todas', Icon: ListFilter, cls: 'text-slate-400' },
];

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const QuestionRow = ({ q, onDone }) => {
    const [replying, setReplying] = useState(false);
    const [text, setText] = useState(q.reply?.message || '');
    const [busy, setBusy] = useState(false);

    const doAction = async (fn, ok) => {
        setBusy(true);
        try { await fn(); toast.success(ok); setReplying(false); onDone(); }
        catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
        finally { setBusy(false); }
    };

    return (
        <div className={`px-4 py-3.5 space-y-2 ${q.status === 'hidden' ? 'opacity-50' : ''}`} data-testid={`wq-row-${q.id}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
                <span className="text-white font-semibold">{q.user_name}</span>
                <span className="text-slate-500">{q.user_email}</span>
                <span className="text-slate-600">→ retiro de <span className="text-cyan-300">{q.target_user_name}</span></span>
                <span className="text-emerald-400 font-mono font-bold">{Number(q.amount).toLocaleString('es-ES')} {q.currency}</span>
                <span className="text-slate-600">{fmtDate(q.created_at)}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    q.status === 'pending' ? 'bg-amber-500/15 text-amber-300' :
                    q.status === 'answered' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-400'
                }`}>{q.status === 'pending' ? 'Pendiente' : q.status === 'answered' ? 'Respondida' : 'Oculta'}</span>
                {q.featured && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 flex items-center gap-1" data-testid={`wq-featured-badge-${q.id}`}>
                        <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" /> Destacada
                    </span>
                )}
            </div>
            <p className="text-slate-200 text-sm">{q.message}</p>
            {q.reply && !replying && (
                <div className="pl-3 border-l-2 border-cyan-500/40">
                    <p className="text-cyan-300 text-[11px] font-bold">Respuesta {q.reply.updated_at ? '(editada)' : ''}</p>
                    <p className="text-slate-300 text-[13px]">{q.reply.message}</p>
                </div>
            )}
            {replying ? (
                <div className="space-y-2">
                    <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Escriba la respuesta pública..."
                        className="bg-slate-950 border-slate-700 text-white text-sm min-h-[70px]" data-testid={`wq-reply-input-${q.id}`} />
                    <div className="flex gap-2">
                        <Button size="sm" disabled={busy || !text.trim()}
                            onClick={() => doAction(() => api.post(`/admin/withdrawal-questions/${q.id}/reply`, { message: text.trim() }),
                                q.reply ? 'Respuesta editada' : 'Respuesta publicada y usuario notificado')}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white h-8" data-testid={`wq-reply-send-${q.id}`}>
                            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                            {q.reply ? 'Guardar edición' : 'Publicar respuesta'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setReplying(false)} className="border-slate-700 text-slate-400 h-8">Cancelar</Button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" onClick={() => setReplying(true)}
                        className="bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 h-7 text-xs"
                        data-testid={`wq-reply-btn-${q.id}`}>
                        {q.reply ? <><Pencil className="w-3 h-3 mr-1" /> Editar respuesta</> : <><Send className="w-3 h-3 mr-1" /> Responder</>}
                    </Button>
                    {q.reply && (
                        <Button size="sm" disabled={busy}
                            onClick={() => doAction(() => api.post(`/admin/withdrawal-questions/${q.id}/feature`), q.featured ? 'Pregunta quitada de destacados' : 'Pregunta destacada — aparecerá primero')}
                            className={`h-7 text-xs border ${q.featured
                                ? 'bg-amber-500/25 border-amber-500/50 text-amber-200 hover:bg-amber-500/35'
                                : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'}`}
                            data-testid={`wq-feature-btn-${q.id}`}>
                            <Star className={`w-3 h-3 mr-1 ${q.featured ? 'fill-amber-400' : ''}`} />
                            {q.featured ? 'Quitar de destacados' : 'Destacar pregunta'}
                        </Button>
                    )}
                    <Button size="sm" disabled={busy}
                        onClick={() => doAction(() => api.post(`/admin/withdrawal-questions/${q.id}/hide`), q.status === 'hidden' ? 'Pregunta visible de nuevo' : 'Pregunta oculta')}
                        className="bg-slate-500/15 border border-slate-500/40 text-slate-300 hover:bg-slate-500/25 h-7 text-xs"
                        data-testid={`wq-hide-btn-${q.id}`}>
                        {q.status === 'hidden' ? <><Eye className="w-3 h-3 mr-1" /> Mostrar</> : <><EyeOff className="w-3 h-3 mr-1" /> Ocultar</>}
                    </Button>
                    <Button size="sm" disabled={busy}
                        onClick={() => { if (window.confirm('¿Eliminar esta pregunta definitivamente?')) doAction(() => api.delete(`/admin/withdrawal-questions/${q.id}`), 'Pregunta eliminada'); }}
                        className="bg-red-500/15 border border-red-500/40 text-red-300 hover:bg-red-500/25 h-7 text-xs"
                        data-testid={`wq-delete-btn-${q.id}`}>
                        <Trash2 className="w-3 h-3 mr-1" /> Eliminar
                    </Button>
                </div>
            )}
        </div>
    );
};

const AdminWithdrawalQuestionsPage = () => {
    const [tab, setTab] = useState('pending');
    const [search, setSearch] = useState('');
    const [questions, setQuestions] = useState([]);
    const [counts, setCounts] = useState({});
    const [loading, setLoading] = useState(true);

    const load = async (t = tab, s = search) => {
        setLoading(true);
        try {
            const params = {};
            if (t !== 'all') params.status = t;
            if (s.trim()) params.search = s.trim();
            const { data } = await api.get('/admin/withdrawal-questions', { params });
            setQuestions(data.questions || []);
            setCounts(data.counts || {});
        } catch { toast.error('Error al cargar preguntas'); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(tab, search); /* eslint-disable-next-line */ }, [tab]);

    return (
        <Layout>
            <div className="max-w-5xl mx-auto space-y-6" data-testid="admin-questions-page">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center">
                            <MessageCircleQuestion className="w-6 h-6 text-cyan-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Preguntas de Retiros</h1>
                            <p className="text-sm text-slate-400 font-light">Preguntas públicas sobre Retiros Recientes · Respuestas anónimas</p>
                        </div>
                    </div>
                    <span className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-sm font-bold" data-testid="pending-counter">
                        {counts.pending || 0} preguntas pendientes
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {TABS.map((t) => (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                                tab === t.key ? 'bg-slate-800 border-slate-600 text-white' : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white'
                            }`} data-testid={`wq-tab-${t.key}`}>
                            <t.Icon className={`w-4 h-4 ${t.cls}`} /> {t.label}
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
                                {t.key === 'all' ? (counts.total || 0) : (counts[t.key] || 0)}
                            </span>
                        </button>
                    ))}
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && load(tab, search)}
                            placeholder="Filtrar por usuario, retiro o texto... (Enter)"
                            className="pl-9 bg-slate-900 border-slate-800 text-white text-sm h-10" data-testid="wq-search-input" />
                    </div>
                </div>

                <div className="rounded-2xl bg-slate-900/70 border border-slate-800 overflow-hidden divide-y divide-slate-800/60">
                    {loading ? (
                        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-cyan-400 animate-spin" /></div>
                    ) : questions.length === 0 ? (
                        <p className="text-slate-600 text-sm text-center py-12">Sin preguntas en esta categoría.</p>
                    ) : questions.map((q) => <QuestionRow key={q.id} q={q} onDone={() => load(tab, search)} />)}
                </div>
            </div>
        </Layout>
    );
};

export default AdminWithdrawalQuestionsPage;
