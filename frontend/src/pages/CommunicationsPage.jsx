import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { Megaphone, Landmark, ShieldCheck, Loader2, CalendarDays, ChevronDown, Plus, Mail } from 'lucide-react';

const formatDate = (iso) => {
    try {
        return new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch {
        return iso;
    }
};

const CommunicationCard = ({ comm, index, defaultOpen }) => {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.08 }}
            className="rounded-2xl border border-amber-500/15 bg-[#0a0a0a]/90 backdrop-blur-xl ring-1 ring-white/5 overflow-hidden"
            data-testid={`communication-card-${comm.slug}`}
        >
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center gap-4 px-5 sm:px-7 py-5 text-left hover:bg-white/[0.03] transition-colors"
                data-testid={`communication-toggle-${comm.slug}`}
            >
                <div className="flex items-center justify-center w-11 h-11 shrink-0 rounded-xl bg-amber-500/10 border border-amber-500/25">
                    <Landmark className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">{comm.title}</h2>
                    <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {formatDate(comm.published_at)}
                    </p>
                </div>
                <ChevronDown className={`w-5 h-5 text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="px-5 sm:px-7 pb-6 border-t border-white/5">
                    <div className="pt-5 space-y-4 text-sm leading-relaxed text-slate-300" data-testid={`communication-body-${comm.slug}`}>
                        {comm.body.map((paragraph, i) => (
                            <p key={i}>{paragraph}</p>
                        ))}
                    </div>
                    {comm.signature && (
                        <div className="mt-6 flex items-center gap-2 text-xs text-amber-400/90 font-medium">
                            <ShieldCheck className="w-4 h-4" />
                            {comm.signature} · {formatDate(comm.published_at)}
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
};

const ComposeDialog = ({ open, onOpenChange, onPublished }) => {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [sendEmail, setSendEmail] = useState(true);
    const [publishing, setPublishing] = useState(false);

    const handlePublish = async () => {
        if (!title.trim() || !body.trim()) {
            toast.error('El título y el contenido son obligatorios');
            return;
        }
        setPublishing(true);
        try {
            const r = await api.post('/admin/communications', { title, body, send_email: sendEmail });
            const queued = r.data.queued_emails;
            toast.success(
                sendEmail
                    ? `Comunicado publicado · ${queued} correos encolados en la cola inteligente`
                    : 'Comunicado publicado'
            );
            onPublished(r.data.communication);
            setTitle('');
            setBody('');
            setSendEmail(true);
            onOpenChange(false);
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al publicar el comunicado');
        } finally {
            setPublishing(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#0a0a0a] border-amber-500/20 text-white max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Megaphone className="w-5 h-5 text-amber-400" />
                        Nuevo comunicado oficial
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Se publicará en el historial visible para todos los usuarios.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <Input
                        placeholder="Título del comunicado"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-600"
                        data-testid="communication-title-input"
                    />
                    <Textarea
                        placeholder="Contenido del comunicado. Separe los párrafos con una línea en blanco."
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={9}
                        className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-600 resize-none"
                        data-testid="communication-body-input"
                    />
                    <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/40 cursor-pointer hover:border-amber-500/30 transition-colors">
                        <input
                            type="checkbox"
                            checked={sendEmail}
                            onChange={(e) => setSendEmail(e.target.checked)}
                            className="w-4 h-4 accent-amber-500"
                            data-testid="communication-send-email-checkbox"
                        />
                        <span className="flex items-center gap-2 text-sm text-slate-300">
                            <Mail className="w-4 h-4 text-amber-400" />
                            Enviar por correo a todos los usuarios (cola inteligente · prioridad P2)
                        </span>
                    </label>
                    <Button
                        onClick={handlePublish}
                        disabled={publishing}
                        className="w-full bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                        data-testid="communication-publish-btn"
                    >
                        {publishing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Megaphone className="w-4 h-4 mr-2" />}
                        Publicar comunicado
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default function CommunicationsPage() {
    const [communications, setCommunications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [composeOpen, setComposeOpen] = useState(false);
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';

    useEffect(() => {
        api.get('/communications')
            .then((r) => setCommunications(r.data.communications || []))
            .catch(() => setCommunications([]))
            .finally(() => setLoading(false));
    }, []);

    return (
        <Layout>
            <div className="max-w-3xl mx-auto space-y-6" data-testid="communications-page">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25">
                            <Megaphone className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Comunicados Oficiales</h1>
                            <p className="text-sm text-slate-400 font-light">Historial de anuncios oficiales de la plataforma</p>
                        </div>
                    </div>
                    {isAdmin && (
                        <Button
                            onClick={() => setComposeOpen(true)}
                            className="bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                            data-testid="new-communication-btn"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Nuevo Comunicado
                        </Button>
                    )}
                </div>

                {isAdmin && (
                    <ComposeDialog
                        open={composeOpen}
                        onOpenChange={setComposeOpen}
                        onPublished={(comm) => setCommunications((prev) => [comm, ...prev])}
                    />
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                    </div>
                ) : communications.length === 0 ? (
                    <div className="text-center py-20 text-slate-500 text-sm" data-testid="communications-empty">
                        No hay comunicados publicados por el momento.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {communications.map((comm, i) => (
                            <CommunicationCard key={comm.slug || comm.id} comm={comm} index={i} defaultOpen={i === 0} />
                        ))}
                    </div>
                )}
            </div>
        </Layout>
    );
}
