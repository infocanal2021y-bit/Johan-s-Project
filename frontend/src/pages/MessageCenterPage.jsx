import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../components/ui/dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { supportAPI, messagesAPI } from '../lib/api';
import api from '../lib/api';
import { toast } from 'sonner';
import {
    ShieldCheck, MessageSquare, Megaphone, Bell, Inbox, Send, Plus,
    RefreshCw, Loader2, Lock, ChevronLeft, CheckCheck, Clock,
} from 'lucide-react';

const KIND_META = {
    ticket: { label: 'Ticket', Icon: MessageSquare, color: 'text-cyan-400', bg: 'bg-cyan-500/15' },
    broadcast: { label: 'Comunicado', Icon: Megaphone, color: 'text-amber-400', bg: 'bg-amber-500/15' },
    notification: { label: 'Notificación', Icon: Bell, color: 'text-violet-400', bg: 'bg-violet-500/15' },
};

const STATUS_META = {
    open: { label: 'Abierto', cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
    in_progress: { label: 'En curso', cls: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30' },
    resolved: { label: 'Resuelto', cls: 'bg-slate-500/15 text-slate-300 ring-slate-500/30' },
    closed: { label: 'Cerrado', cls: 'bg-slate-600/15 text-slate-400 ring-slate-600/30' },
};

const fmtDate = (iso) => !iso ? '' : new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const FILTERS = [
    { key: 'all', label: 'Todos', Icon: Inbox },
    { key: 'ticket', label: 'Tickets', Icon: MessageSquare },
    { key: 'broadcast', label: 'Comunicados', Icon: Megaphone },
    { key: 'notification', label: 'Notificaciones', Icon: Bell },
];

const InboxRow = ({ item, active, onClick }) => {
    const meta = KIND_META[item.kind];
    return (
        <button
            onClick={onClick}
            data-testid={`inbox-item-${item.id}`}
            className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                active ? 'bg-cyan-500/10 border-cyan-500/40' : 'bg-slate-900/60 border-slate-800 hover:border-slate-600'
            }`}
        >
            <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                    <meta.Icon className={`w-4 h-4 ${meta.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <p className={`text-sm truncate ${item.unread ? 'text-white font-semibold' : 'text-slate-300'}`}>{item.title}</p>
                        {item.unread && <span className="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0" data-testid={`unread-dot-${item.id}`} />}
                    </div>
                    <p className="text-slate-500 text-xs truncate mt-0.5">{item.preview}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide ${meta.color}`}>{meta.label}</span>
                        {item.case_code && <span className="text-[10px] font-mono text-sky-400">{item.case_code}</span>}
                        {item.kind === 'ticket' && STATUS_META[item.status] && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ring-1 font-bold uppercase ${STATUS_META[item.status].cls}`}>
                                {STATUS_META[item.status].label}
                            </span>
                        )}
                        <span className="text-slate-600 text-[10px] ml-auto">{fmtDate(item.updated_at)}</span>
                    </div>
                </div>
            </div>
        </button>
    );
};

const TicketThread = ({ item, onReplied }) => {
    const [ticket, setTicket] = useState(null);
    const [loading, setLoading] = useState(true);
    const [reply, setReply] = useState('');
    const [sending, setSending] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await supportAPI.getTicket(item.id);
            setTicket(r.data);
            await messagesAPI.markTicketSeen(item.id);
        } catch {
            toast.error('No se pudo cargar la conversación');
        } finally {
            setLoading(false);
        }
    }, [item.id]);

    useEffect(() => { load(); }, [load]);

    const sendReply = async () => {
        if (reply.trim().length < 2) return;
        setSending(true);
        try {
            await supportAPI.replyToTicket(item.id, { message: reply.trim() });
            setReply('');
            await load();
            onReplied?.();
            toast.success('Respuesta enviada de forma segura');
        } catch {
            toast.error('No se pudo enviar la respuesta');
        } finally {
            setSending(false);
        }
    };

    if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-cyan-400 animate-spin" /></div>;
    if (!ticket) return null;

    const thread = [
        { id: 'orig', message: ticket.message, from_admin: false, author_name: ticket.user_name, created_at: ticket.created_at },
        ...(ticket.replies || []),
    ];
    const isClosed = ['resolved', 'closed'].includes(ticket.status);

    return (
        <div className="flex flex-col h-full" data-testid="ticket-thread">
            <div className="pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-white font-semibold text-base">{ticket.subject}</h3>
                    {STATUS_META[ticket.status] && (
                        <span className={`text-[10px] px-2 py-0.5 rounded ring-1 font-bold uppercase ${STATUS_META[ticket.status].cls}`}>
                            {STATUS_META[ticket.status].label}
                        </span>
                    )}
                </div>
                <p className="text-slate-500 text-xs mt-1 font-mono">
                    {ticket.ticket_number}{item.case_code ? ` · ${item.case_code}` : ''}
                </p>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3 max-h-[45vh]">
                {thread.map((m) => (
                    <div key={m.id} className={`flex ${m.from_admin ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                            m.from_admin
                                ? 'bg-cyan-500/10 border border-cyan-500/25'
                                : 'bg-slate-800/80 border border-slate-700'
                        }`}>
                            <p className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${m.from_admin ? 'text-cyan-400' : 'text-slate-400'}`}>
                                {m.from_admin ? 'Equipo LIONSBIT' : 'Usted'}
                            </p>
                            <p className="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">{m.message}</p>
                            <p className="text-slate-600 text-[10px] mt-1.5">{fmtDate(m.created_at)}</p>
                        </div>
                    </div>
                ))}
            </div>

            {!isClosed ? (
                <div className="pt-3 border-t border-slate-800">
                    <div className="flex gap-2">
                        <Textarea
                            value={reply}
                            onChange={(e) => setReply(e.target.value)}
                            placeholder="Escriba su respuesta segura..."
                            rows={2}
                            className="bg-slate-900 border-slate-700 text-white text-sm resize-none"
                            data-testid="ticket-reply-input"
                        />
                        <Button
                            onClick={sendReply}
                            disabled={sending || reply.trim().length < 2}
                            className="bg-cyan-600 hover:bg-cyan-700 self-end"
                            data-testid="ticket-reply-send-btn"
                        >
                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </Button>
                    </div>
                    <p className="text-slate-600 text-[10px] mt-2 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Canal cifrado · solo visible para usted y el equipo de soporte
                    </p>
                </div>
            ) : (
                <div className="pt-3 border-t border-slate-800">
                    <p className="text-slate-500 text-xs flex items-center gap-1.5">
                        <CheckCheck className="w-3.5 h-3.5" /> Conversación finalizada. Cree un nuevo mensaje si necesita más ayuda.
                    </p>
                </div>
            )}
        </div>
    );
};

const NoticeDetail = ({ item, onRead }) => {
    useEffect(() => {
        if (item.unread) {
            api.put(`/notifications/${item.id}/read`).then(() => onRead?.()).catch(() => {});
        }
    }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const meta = KIND_META[item.kind];
    return (
        <div data-testid="notice-detail">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${meta.bg}`}>
                    <meta.Icon className={`w-5 h-5 ${meta.color}`} />
                </div>
                <div>
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${meta.color}`}>
                        {item.kind === 'broadcast' ? 'Comunicado oficial · LIONSBIT' : 'Notificación del sistema'}
                    </p>
                    <h3 className="text-white font-semibold text-base">{item.title}</h3>
                </div>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap py-5">{item.message || item.preview}</p>
            <p className="text-slate-600 text-xs flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> {fmtDate(item.created_at)}
            </p>
        </div>
    );
};

const NewMessageDialog = ({ open, onOpenChange, onCreated }) => {
    const [subject, setSubject] = useState('');
    const [category, setCategory] = useState('general');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);

    const submit = async () => {
        if (subject.trim().length < 3 || message.trim().length < 10) {
            toast.error('Complete el asunto (mín. 3) y el mensaje (mín. 10 caracteres)');
            return;
        }
        setSending(true);
        try {
            const r = await supportAPI.createTicket({ subject: subject.trim(), message: message.trim(), category });
            toast.success(`Mensaje enviado · Caso ${r.data.case_code || r.data.ticket_number}`, { duration: 6000 });
            setSubject(''); setMessage(''); setCategory('general');
            onOpenChange(false);
            onCreated?.();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo enviar el mensaje');
        } finally {
            setSending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-lg" data-testid="new-message-dialog">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-cyan-400" /> Nuevo mensaje seguro
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Se creará un ticket con código PLB rastreable. Respuesta habitual en 24-48h laborables.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <Input
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Asunto"
                        className="bg-slate-950 border-slate-700 text-white"
                        data-testid="new-message-subject"
                    />
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="bg-slate-950 border-slate-700 text-white" data-testid="new-message-category">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700 text-white">
                            <SelectItem value="general">Consulta general</SelectItem>
                            <SelectItem value="payment_issue">Problema con un pago</SelectItem>
                            <SelectItem value="withdrawal">Retiros</SelectItem>
                            <SelectItem value="kyc">Verificación KYC</SelectItem>
                            <SelectItem value="account">Mi cuenta</SelectItem>
                        </SelectContent>
                    </Select>
                    <Textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Describa su consulta con el máximo detalle posible..."
                        rows={5}
                        className="bg-slate-950 border-slate-700 text-white resize-none"
                        data-testid="new-message-body"
                    />
                    <Button
                        onClick={submit}
                        disabled={sending}
                        className="w-full bg-cyan-600 hover:bg-cyan-700"
                        data-testid="new-message-submit"
                    >
                        {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                        Enviar de forma segura
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default function MessageCenterPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [selected, setSelected] = useState(null);
    const [newOpen, setNewOpen] = useState(false);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const r = await messagesAPI.getInbox();
            setData(r.data);
        } catch {
            toast.error('No se pudo cargar el centro de mensajes');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const items = (data?.items || []).filter((i) => filter === 'all' || i.kind === filter);
    const counts = data?.unread_counts || {};

    return (
        <Layout>
            <div className="max-w-6xl mx-auto space-y-6" data-testid="message-center-page">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
                            <ShieldCheck className="w-6 h-6 text-cyan-400" />
                        </div>
                        <div>
                            <h1 className="text-white text-2xl font-bold tracking-tight">Centro de Mensajes Seguro</h1>
                            <p className="text-slate-400 text-sm flex items-center gap-1.5">
                                <Lock className="w-3 h-3" /> Bandeja unificada · tickets, comunicados y notificaciones
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => load()} data-testid="inbox-refresh-btn">
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={() => setNewOpen(true)} data-testid="new-message-btn">
                            <Plus className="w-4 h-4 mr-1.5" /> Nuevo mensaje
                        </Button>
                    </div>
                </motion.div>

                {/* Filter tabs */}
                <div className="flex flex-wrap gap-2" data-testid="inbox-filters">
                    {FILTERS.map((f) => {
                        const unread = f.key === 'all' ? counts.total : counts[f.key];
                        return (
                            <button
                                key={f.key}
                                onClick={() => { setFilter(f.key); setSelected(null); }}
                                data-testid={`inbox-filter-${f.key}`}
                                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                                    filter === f.key
                                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-600'
                                }`}
                            >
                                <f.Icon className="w-4 h-4" /> {f.label}
                                {unread > 0 && (
                                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-cyan-500 text-black text-[10px] font-bold flex items-center justify-center">
                                        {unread}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Two-pane inbox */}
                <div className="grid lg:grid-cols-12 gap-5">
                    <div className={`lg:col-span-5 space-y-2 ${selected ? 'hidden lg:block' : ''}`} data-testid="inbox-list">
                        {loading ? (
                            <div className="flex items-center justify-center py-20"><Loader2 className="w-7 h-7 text-cyan-400 animate-spin" /></div>
                        ) : items.length === 0 ? (
                            <div className="text-center py-16 rounded-2xl bg-slate-900/50 border border-slate-800" data-testid="inbox-empty">
                                <Inbox className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                                <p className="text-slate-400 text-sm">No hay mensajes en esta bandeja</p>
                            </div>
                        ) : (
                            items.map((item) => (
                                <InboxRow
                                    key={`${item.kind}-${item.id}`}
                                    item={item}
                                    active={selected?.id === item.id}
                                    onClick={() => setSelected(item)}
                                />
                            ))
                        )}
                    </div>

                    <div className={`lg:col-span-7 ${!selected ? 'hidden lg:block' : ''}`}>
                        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 min-h-[420px]" data-testid="inbox-detail-pane">
                            {selected ? (
                                <>
                                    <button
                                        onClick={() => setSelected(null)}
                                        className="lg:hidden flex items-center gap-1 text-slate-400 text-sm mb-3"
                                        data-testid="inbox-back-btn"
                                    >
                                        <ChevronLeft className="w-4 h-4" /> Volver a la bandeja
                                    </button>
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={`${selected.kind}-${selected.id}`}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            className="h-full"
                                        >
                                            {selected.kind === 'ticket'
                                                ? <TicketThread item={selected} onReplied={() => load(true)} />
                                                : <NoticeDetail item={selected} onRead={() => load(true)} />}
                                        </motion.div>
                                    </AnimatePresence>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-[380px] text-center">
                                    <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-4">
                                        <Lock className="w-7 h-7 text-cyan-500/70" />
                                    </div>
                                    <p className="text-slate-400 text-sm font-medium">Seleccione un mensaje para leerlo</p>
                                    <p className="text-slate-600 text-xs mt-1 max-w-xs">
                                        Todas las comunicaciones están protegidas y solo son visibles para usted y el equipo LIONSBIT.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <NewMessageDialog open={newOpen} onOpenChange={setNewOpen} onCreated={() => load(true)} />
            </div>
        </Layout>
    );
}
