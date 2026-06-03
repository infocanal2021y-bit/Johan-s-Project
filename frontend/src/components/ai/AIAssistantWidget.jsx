import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import {
    MessageCircle, X, Send, Sparkles, Loader2, RefreshCw, Plus,
    Bot, User as UserIcon, Trash2, ChevronLeft, ChevronRight,
    Wallet, ArrowUpRight, FileText, AlertCircle, HelpCircle, Receipt,
} from 'lucide-react';
import { SUPPORT_EMAIL } from '../../config/branding';
import { InlineWithdrawalWizard } from './InlineWithdrawalWizard';
import { DiagnosticPanel } from '../diagnostics/DiagnosticPanel';

const fmtTime = (iso) => !iso ? '' : new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });


// Lightweight markdown for the assistant: bold + lists
const renderMarkdown = (text) => {
    if (!text) return null;
    const lines = text.split('\n');
    const blocks = [];
    let currentList = null;
    lines.forEach((ln, i) => {
        const listMatch = ln.match(/^[-*]\s+(.*)$/);
        if (listMatch) {
            if (!currentList) currentList = [];
            currentList.push(listMatch[1]);
        } else {
            if (currentList) {
                blocks.push({ type: 'ul', items: currentList, key: `ul-${i}` });
                currentList = null;
            }
            if (ln.trim()) blocks.push({ type: 'p', text: ln, key: `p-${i}` });
        }
    });
    if (currentList) blocks.push({ type: 'ul', items: currentList, key: 'ul-end' });

    const renderInline = (s) => {
        // **bold** + `code`
        const parts = [];
        let rest = s;
        let key = 0;
        while (rest) {
            const bold = rest.match(/\*\*(.+?)\*\*/);
            const code = rest.match(/`(.+?)`/);
            const next = [bold, code].filter(Boolean).sort((a, b) => a.index - b.index)[0];
            if (!next) { parts.push(rest); break; }
            if (next.index > 0) parts.push(rest.slice(0, next.index));
            if (next === bold) parts.push(<strong key={`b${key++}`} className="font-bold text-cyan-300">{bold[1]}</strong>);
            else parts.push(<code key={`c${key++}`} className="px-1 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[11px]">{code[1]}</code>);
            rest = rest.slice(next.index + next[0].length);
        }
        return parts;
    };

    return blocks.map(b => {
        if (b.type === 'ul') return (
            <ul key={b.key} className="list-disc list-inside space-y-0.5 ml-1 mb-2">
                {b.items.map((it, i) => <li key={i} className="text-[12.5px]">{renderInline(it)}</li>)}
            </ul>
        );
        return <p key={b.key} className="text-[12.5px] leading-relaxed mb-2 last:mb-0">{renderInline(b.text)}</p>;
    });
};


// ─── Proactive AI Copilot insight ─────────────────────────────────
// Renders a smart card that reacts to combined account state and offers
// a single clear action. Tone-aware styling.
const INSIGHT_TONE = {
    success: { color: '#10b981', bg: 'from-emerald-500/15', ring: 'ring-emerald-500/40 hover:ring-emerald-400/70', shadow: 'rgba(16,185,129,0.2)' },
    info:    { color: '#06b6d4', bg: 'from-cyan-500/15',    ring: 'ring-cyan-500/40 hover:ring-cyan-400/70',       shadow: 'rgba(6,182,212,0.2)' },
    warn:    { color: '#f59e0b', bg: 'from-amber-500/15',   ring: 'ring-amber-500/40 hover:ring-amber-400/70',     shadow: 'rgba(245,158,11,0.2)' },
};

const ProactiveInsight = ({ insight, onOpenWizard, onNavigate }) => {
    const tone = INSIGHT_TONE[insight.tone] || INSIGHT_TONE.info;
    const handleClick = () => {
        if (insight.cta_path === 'wizard://start') onOpenWizard?.();
        else if (insight.cta_path) onNavigate?.(insight.cta_path);
    };
    return (
        <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleClick}
            className={`w-full text-left mb-4 group relative overflow-hidden rounded-xl bg-gradient-to-br ${tone.bg} via-transparent to-transparent ring-1 ${tone.ring} hover:shadow-[0_8px_30px] p-3 transition-all`}
            style={{ '--tw-shadow-color': tone.shadow }}
            data-testid="ai-proactive-insight"
        >
            <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: tone.color + '25', boxShadow: `inset 0 0 0 1px ${tone.color}50` }}>
                    <Sparkles className="w-4 h-4" style={{ color: tone.color }} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.14em] font-bold mb-0.5" style={{ color: tone.color }}>
                        Copiloto financiero
                    </p>
                    <p className="text-[12px] font-bold leading-tight" style={{ color: tone.color }}>
                        {insight.title}
                    </p>
                    <p className="text-slate-300 text-[11px] mt-1 leading-relaxed">
                        {insight.body}
                    </p>
                    {insight.cta_label && (
                        <p className="text-[11px] font-semibold mt-1.5 inline-flex items-center gap-1 group-hover:gap-1.5 transition-all" style={{ color: tone.color }}>
                            {insight.cta_label} <ChevronRight className="w-3 h-3" />
                        </p>
                    )}
                </div>
            </div>
        </motion.button>
    );
};


// ─── Welcome view (shown on a fresh, empty chat) ─────────────────
const fmtEUR = (n) => `€${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const WelcomeView = ({ user, ctx, suggestions, onSend, onNavigate, onOpenWizard, onOpenDiagnostic }) => {
    const firstName = ctx?.first_name || (user?.name || user?.email || 'Cliente').split(' ')[0];

    // 6 quick actions
    const actions = [
        {
            id: 'withdraw',
            label: 'Realizar un retiro',
            icon: ArrowUpRight,
            color: '#10b981',
            kind: 'wizard',
        },
        {
            id: 'balance',
            label: 'Consultar saldo disponible',
            icon: Wallet,
            color: '#06b6d4',
            kind: 'send',
            prompt: '¿Cuál es mi saldo disponible actualmente en cada moneda?',
        },
        {
            id: 'transfer-status',
            label: 'Estado de mi transferencia',
            icon: FileText,
            color: '#1973B8',
            kind: 'send',
            prompt: '¿Cuál es el estado actual de mis transferencias y retiros en curso?',
        },
        {
            id: 'taxes',
            label: 'Impuestos pendientes',
            icon: Receipt,
            color: '#f59e0b',
            kind: 'send',
            prompt: '¿Tengo impuestos o pagos pendientes? Indícame el detalle y los pasos para regularizarlos.',
        },
        {
            id: 'diagnostic',
            label: 'Analizar mi caso',
            icon: Sparkles,
            color: '#a78bfa',
            kind: 'diagnostic',
        },
        {
            id: 'support',
            label: 'Hablar con soporte',
            icon: HelpCircle,
            color: '#94a3b8',
            kind: 'navigate',
            path: '/support',
        },
    ];

    return (
        <div className="py-2" data-testid="ai-welcome-view">
            {/* Greeting bubble — like an assistant message */}
            <div className="flex items-start gap-2 mb-4">
                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center bg-cyan-500/20 ring-1 ring-cyan-400/40 text-cyan-300">
                    <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="inline-block max-w-full px-3 py-2.5 rounded-xl bg-slate-900/60 ring-1 ring-slate-800 text-slate-200">
                        <p className="text-[12.5px] leading-relaxed">
                            Hola, <strong className="text-cyan-300">{firstName}</strong>. Bienvenido nuevamente.
                            Soy su asistente virtual. ¿En qué puedo ayudarle hoy?
                            Si desea realizar un retiro, puedo guiarle durante el proceso.
                        </p>
                    </div>
                </div>
            </div>

            {/* Proactive Copilot insight — smart message based on combined state */}
            {ctx?.proactive_insight && (
                <ProactiveInsight
                    insight={ctx.proactive_insight}
                    onOpenWizard={onOpenWizard}
                    onNavigate={onNavigate}
                />
            )}

            {/* Active withdrawal notice (read-only fallback when no insight) */}
            {!ctx?.proactive_insight && ctx?.active_withdrawals > 0 && ctx?.latest_withdrawal && (
                <div
                    className="mb-4 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3"
                    data-testid="ai-active-withdrawal-info"
                >
                    <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
                        <div className="text-[11px] text-amber-200 leading-relaxed">
                            Tiene un retiro en curso:
                            {' '}<span className="font-mono">{ctx.latest_withdrawal.reference || '—'}</span>
                            {' · '}estado: <strong className="text-amber-100">{ctx.latest_withdrawal.status}</strong>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick action grid */}
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-bold mb-2 px-1">
                Acciones rápidas
            </p>
            <div className="grid grid-cols-2 gap-1.5 mb-3" data-testid="ai-quick-actions">
                {actions.map((a) => (
                    <button
                        key={a.id}
                        onClick={() => {
                            if (a.kind === 'send') onSend(a.prompt);
                            else if (a.kind === 'navigate') onNavigate(a.path);
                            else if (a.kind === 'wizard') onOpenWizard?.();
                            else if (a.kind === 'diagnostic') onOpenDiagnostic?.();
                            else if (a.kind === 'focus') {
                                setTimeout(() => {
                                    document.querySelector('[data-testid="ai-input"]')?.focus();
                                }, 30);
                            }
                        }}
                        className="group text-left rounded-lg bg-slate-900/60 hover:bg-slate-800 ring-1 ring-slate-800 hover:ring-cyan-500/40 px-2.5 py-2 transition-all"
                        data-testid={`ai-quick-${a.id}`}
                    >
                        <a.icon className="w-3.5 h-3.5 mb-1.5" style={{ color: a.color }} />
                        <p className="text-[11px] font-semibold text-slate-200 group-hover:text-white leading-tight">
                            {a.label}
                        </p>
                    </button>
                ))}
            </div>

            {/* Free-form prompt hint */}
            {suggestions?.length > 0 && (
                <details className="mt-3 group" data-testid="ai-more-suggestions">
                    <summary className="text-[10.5px] text-slate-500 hover:text-slate-300 cursor-pointer font-semibold inline-flex items-center gap-1 select-none">
                        Más sugerencias <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="space-y-1 mt-2">
                        {suggestions.slice(0, 4).map((s, i) => (
                            <button
                                key={i}
                                onClick={() => onSend(s)}
                                className="block w-full text-left px-3 py-1.5 rounded-md bg-slate-900/40 hover:bg-slate-800 text-[10.5px] text-slate-400 hover:text-slate-200 transition-colors"
                                data-testid={`ai-suggestion-${i}`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </details>
            )}
        </div>
    );
};


export const AIAssistantWidget = () => {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [view, setView] = useState('chat'); // chat | sessions
    const [sessionId, setSessionId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [loadingSession, setLoadingSession] = useState(false);
    const [quickCtx, setQuickCtx] = useState(null);
    const [wizardOpen, setWizardOpen] = useState(false);
    const [diagOpen, setDiagOpen] = useState(false);
    const scrollRef = useRef(null);
    const inputRef = useRef(null);

    const scrollBottom = useCallback(() => {
        setTimeout(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }, 50);
    }, []);

    useEffect(() => {
        if (open && view === 'chat') {
            scrollBottom();
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [open, view, messages, scrollBottom]);

    // Load suggestions once when opened
    useEffect(() => {
        if (!open || suggestions.length) return;
        api.get('/ai-assistant/suggestions')
            .then(r => setSuggestions(r.data.suggestions || []))
            .catch(() => {});
    }, [open, suggestions.length]);

    // Load personalised quick-context (balance, pending taxes, withdrawals)
    // when the panel opens. Used by the welcome view + proactive banner.
    useEffect(() => {
        if (!open || quickCtx) return;
        api.get('/ai-assistant/quick-context')
            .then((r) => setQuickCtx(r.data))
            .catch(() => { /* silent; welcome view still works without ctx */ });
    }, [open, quickCtx]);

    // Auto-open on first dashboard visit per session (welcome behaviour)
    useEffect(() => {
        if (!user || open) return;
        if (!location.pathname.startsWith('/dashboard')) return;
        const key = `ai_welcomed_${user.id || user.email}`;
        if (sessionStorage.getItem(key)) return;
        const t = setTimeout(() => {
            setOpen(true);
            sessionStorage.setItem(key, '1');
        }, 1200);
        return () => clearTimeout(t);
    }, [user, location.pathname, open]);

    // External trigger: dashboard "Analizar mi caso" button dispatches this event
    useEffect(() => {
        const handler = () => {
            setOpen(true);
            setWizardOpen(false);
            setDiagOpen(true);
        };
        window.addEventListener('open-diagnostic', handler);
        return () => window.removeEventListener('open-diagnostic', handler);
    }, []);

    const loadSessions = useCallback(async () => {
        try {
            const r = await api.get('/ai-assistant/sessions');
            setSessions(r.data.items || []);
        } catch (err) {
            toast.error('No se pudieron cargar las conversaciones');
        }
    }, []);

    const openSession = async (sid) => {
        setLoadingSession(true);
        try {
            const r = await api.get(`/ai-assistant/sessions/${sid}/messages`);
            setSessionId(sid);
            setMessages(r.data.messages || []);
            setView('chat');
        } catch (err) {
            toast.error('No se pudo cargar la conversación');
        } finally {
            setLoadingSession(false);
        }
    };

    const startNewChat = () => {
        setSessionId(null);
        setMessages([]);
        setView('chat');
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const send = async (txtOverride) => {
        const text = (txtOverride ?? input).trim();
        if (!text || sending) return;
        setSending(true);
        // Optimistic UI: show user message immediately
        const optimistic = { id: 'tmp-' + Date.now(), role: 'user', content: text, created_at: new Date().toISOString() };
        setMessages(prev => [...prev, optimistic]);
        setInput('');
        scrollBottom();
        try {
            const r = await api.post('/ai-assistant/chat', { message: text, session_id: sessionId || undefined });
            const { session_id, user_message, assistant_message } = r.data;
            setSessionId(session_id);
            setMessages(prev => [
                ...prev.filter(m => m.id !== optimistic.id),
                user_message,
                assistant_message,
            ]);
            scrollBottom();
        } catch (err) {
            // Roll back optimistic message + show error inline
            setMessages(prev => prev.filter(m => m.id !== optimistic.id));
            toast.error(err.response?.data?.detail || 'No se pudo enviar el mensaje');
        } finally {
            setSending(false);
        }
    };

    const deleteSession = async (sid, e) => {
        e.stopPropagation();
        if (!window.confirm('¿Eliminar esta conversación?')) return;
        try {
            await api.post(`/ai-assistant/sessions/${sid}/delete`);
            setSessions(s => s.filter(x => x.id !== sid));
            if (sessionId === sid) startNewChat();
            toast.success('Conversación eliminada');
        } catch (err) {
            toast.error('No se pudo eliminar');
        }
    };

    if (!user) return null;

    return (
        <>
            {/* Floating launcher */}
            <AnimatePresence>
                {!open && (
                    <motion.button
                        key="launcher"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        whileHover={{ scale: 1.05 }}
                        onClick={() => setOpen(true)}
                        className="fixed bottom-24 right-6 z-[90] w-14 h-14 rounded-full bg-gradient-to-br from-[#1973B8] to-[#072146] shadow-[0_8px_30px_rgba(25,115,184,0.5)] flex items-center justify-center text-white ring-2 ring-cyan-400/30 hover:ring-cyan-400/60 transition-shadow"
                        data-testid="ai-assistant-launcher"
                        aria-label="Abrir asistente IA"
                    >
                        <Sparkles className="w-6 h-6" />
                        <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Chat panel */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        key="panel"
                        initial={{ opacity: 0, y: 24, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24, scale: 0.96 }}
                        transition={{ type: 'spring', damping: 24, stiffness: 280 }}
                        className="fixed bottom-24 right-6 z-[90] w-[calc(100vw-3rem)] sm:w-[400px] h-[calc(100vh-7rem)] sm:h-[600px] max-h-[680px] rounded-2xl shadow-2xl ring-1 ring-cyan-500/30 bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 flex flex-col overflow-hidden"
                        data-testid="ai-assistant-panel"
                    >
                        {/* Header */}
                        <div className="px-4 py-3 bg-gradient-to-r from-[#072146] to-[#004481] flex items-center justify-between border-b border-cyan-500/20">
                            <div className="flex items-center gap-2.5">
                                {view === 'sessions' && (
                                    <button onClick={() => setView('chat')} className="text-white/70 hover:text-white p-1 -ml-1" data-testid="ai-back-to-chat">
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                )}
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400/30 to-cyan-600/30 flex items-center justify-center ring-1 ring-cyan-400/40">
                                    <Sparkles className="w-4 h-4 text-cyan-300" />
                                </div>
                                <div>
                                    <p className="text-white font-bold text-[13px] leading-tight">LIONS Assistant</p>
                                    <p className="text-[10px] text-emerald-300 leading-tight flex items-center gap-1 mt-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> 24/7 · IA financiera
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {view === 'chat' && (
                                    <>
                                        <button onClick={() => { loadSessions(); setView('sessions'); }} className="text-white/70 hover:text-white p-1.5 rounded-md hover:bg-white/10" title="Conversaciones" data-testid="ai-show-sessions">
                                            <RefreshCw className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={startNewChat} className="text-white/70 hover:text-white p-1.5 rounded-md hover:bg-white/10" title="Nueva conversación" data-testid="ai-new-chat">
                                            <Plus className="w-3.5 h-3.5" />
                                        </button>
                                    </>
                                )}
                                <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white p-1.5 rounded-md hover:bg-white/10" data-testid="ai-close" aria-label="Cerrar">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        {view === 'sessions' ? (
                            <div className="flex-1 overflow-y-auto p-3 space-y-1.5" data-testid="ai-sessions-list">
                                {sessions.length === 0 ? (
                                    <p className="text-slate-500 text-[12px] text-center py-8">Sin conversaciones previas.</p>
                                ) : sessions.map(s => (
                                    <button
                                        key={s.id}
                                        onClick={() => openSession(s.id)}
                                        className="w-full text-left bg-slate-900/60 hover:bg-slate-800/80 ring-1 ring-slate-800 rounded-lg p-2.5 transition-colors group"
                                        data-testid={`ai-session-${s.id}`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-[12px] font-semibold truncate">{s.title || 'Sin título'}</p>
                                                <p className="text-[10px] text-slate-500 mt-0.5">
                                                    {s.message_count} mensajes · {fmtTime(s.last_message_at)}
                                                </p>
                                            </div>
                                            <button
                                                onClick={(e) => deleteSession(s.id, e)}
                                                className="text-slate-500 hover:text-rose-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                data-testid={`ai-session-delete-${s.id}`}
                                                aria-label="Eliminar"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <>
                                <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3" data-testid="ai-messages-list">
                                    {messages.length === 0 && !loadingSession && !wizardOpen && !diagOpen && (
                                        <WelcomeView
                                            user={user}
                                            ctx={quickCtx}
                                            suggestions={suggestions}
                                            onSend={send}
                                            onNavigate={(path) => { setOpen(false); navigate(path); }}
                                            onOpenWizard={() => setWizardOpen(true)}
                                            onOpenDiagnostic={() => setDiagOpen(true)}
                                        />
                                    )}
                                    {wizardOpen && (
                                        <InlineWithdrawalWizard
                                            onClose={() => {
                                                setWizardOpen(false);
                                                setQuickCtx(null);
                                            }}
                                            onCompleted={() => {
                                                setMessages((m) => [...m, {
                                                    role: 'assistant',
                                                    content: 'Tu solicitud de retiro fue registrada con éxito. Recibirás notificaciones por email en cada cambio de estado. ¿Algo más en lo que pueda ayudarte?',
                                                    created_at: new Date().toISOString(),
                                                }]);
                                                // Notify the sidebar health ring to refresh
                                                window.dispatchEvent(new CustomEvent('health-score-refresh'));
                                            }}
                                        />
                                    )}
                                    {diagOpen && (
                                        <DiagnosticPanel
                                            compact
                                            autoRun
                                            onClose={() => setDiagOpen(false)}
                                        />
                                    )}
                                    {loadingSession && (
                                        <div className="text-center py-8 text-slate-500"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>
                                    )}
                                    {messages.map((m) => (
                                        <div
                                            key={m.id}
                                            className={`flex items-start gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                                            data-testid={`ai-msg-${m.role}-${m.id}`}
                                        >
                                            <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ring-1 ${
                                                m.role === 'user'
                                                    ? 'bg-[#1973B8]/30 ring-[#1973B8]/50 text-[#7CB1E5]'
                                                    : 'bg-cyan-500/20 ring-cyan-400/40 text-cyan-300'
                                            }`}>
                                                {m.role === 'user' ? <UserIcon className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                                            </div>
                                            <div className={`flex-1 min-w-0 ${m.role === 'user' ? 'text-right' : ''}`}>
                                                <div className={`inline-block max-w-[88%] px-3 py-2 rounded-xl ${
                                                    m.role === 'user'
                                                        ? 'bg-[#1973B8]/20 ring-1 ring-[#1973B8]/40 text-white text-left'
                                                        : 'bg-slate-900/60 ring-1 ring-slate-800 text-slate-200'
                                                }`}>
                                                    {m.role === 'assistant' ? renderMarkdown(m.content) : (
                                                        <p className="text-[12.5px] whitespace-pre-wrap">{m.content}</p>
                                                    )}
                                                </div>
                                                <p className="text-[9.5px] text-slate-500 mt-1 px-1">{fmtTime(m.created_at)}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {sending && (
                                        <div className="flex items-start gap-2" data-testid="ai-typing">
                                            <div className="w-7 h-7 rounded-full bg-cyan-500/20 ring-1 ring-cyan-400/40 text-cyan-300 flex items-center justify-center">
                                                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                                            </div>
                                            <div className="bg-slate-900/60 ring-1 ring-slate-800 rounded-xl px-3 py-2 flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" style={{ animationDelay: '0.15s' }} />
                                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" style={{ animationDelay: '0.3s' }} />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Input */}
                                <div className="border-t border-slate-800 bg-slate-950/80 p-2.5">
                                    <div className="flex items-end gap-1.5">
                                        <textarea
                                            ref={inputRef}
                                            rows={1}
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                                            }}
                                            placeholder="Escribe tu pregunta…"
                                            className="flex-1 resize-none bg-slate-900 ring-1 ring-slate-700 focus:ring-cyan-500 rounded-lg px-3 py-2 text-[12.5px] text-white placeholder-slate-500 outline-none max-h-24"
                                            data-testid="ai-input"
                                        />
                                        <Button
                                            onClick={() => send()}
                                            disabled={!input.trim() || sending}
                                            className="h-9 px-3 bg-[#1973B8] hover:bg-[#1F89D8] text-white"
                                            data-testid="ai-send-btn"
                                        >
                                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                        </Button>
                                    </div>
                                    <p className="text-[9.5px] text-slate-600 mt-1.5 px-1">
                                        ⚠ Información orientativa. Para casos críticos contacta a {SUPPORT_EMAIL}.
                                    </p>
                                </div>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default AIAssistantWidget;
