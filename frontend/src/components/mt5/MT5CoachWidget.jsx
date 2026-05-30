import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../lib/api';
import { Button } from '../ui/button';
import { Sparkles, Send, X, Loader2, Bot, RotateCcw, MessageCircle } from 'lucide-react';
import { SUPPORT_EMAIL } from '../../config/branding';

const SUGGESTIONS = [
    '¿Por qué tarda mi depósito?',
    '¿Cómo configuro un Stop Loss?',
    '¿Qué es el ratio R:R?',
    'Explícame la regla del 2%',
];

const SESSION_KEY = 'mt5_coach_session';

const Bubble = ({ role, text }) => {
    const isUser = role === 'user';
    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap ${
                    isUser
                        ? 'bg-cyan-500/20 text-cyan-50 ring-1 ring-cyan-400/30'
                        : 'bg-slate-800/80 text-slate-100 ring-1 ring-slate-700/60'
                }`}
            >
                {text}
            </div>
        </div>
    );
};

export const MT5CoachWidget = () => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [sessionId, setSessionId] = useState(() => {
        try { return localStorage.getItem(SESSION_KEY) || null; } catch { return null; }
    });
    const scrollerRef = useRef(null);

    // Auto-scroll on new messages
    useEffect(() => {
        if (scrollerRef.current) {
            scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
        }
    }, [messages, loading]);

    // Greet on first open
    useEffect(() => {
        if (open && messages.length === 0) {
            setMessages([{
                role: 'assistant',
                text: 'Buenas, soy Leo · su asistente de soporte de LIONSBIT. Estoy aquí para resolver dudas sobre depósitos, MetaTrader 5, gestión de riesgo y operativa profesional. ¿En qué puedo ayudarle?',
            }]);
        }
    }, [open, messages.length]);

    const send = useCallback(async (text) => {
        const msg = (text || input).trim();
        if (!msg || loading) return;
        setMessages(prev => [...prev, { role: 'user', text: msg }]);
        setInput('');
        setLoading(true);
        try {
            const res = await api.post('/mt5-coach/chat', {
                message: msg,
                session_id: sessionId || undefined,
            });
            const newSid = res.data.session_id;
            if (newSid && newSid !== sessionId) {
                setSessionId(newSid);
                try { localStorage.setItem(SESSION_KEY, newSid); } catch { /* noop */ }
            }
            setMessages(prev => [...prev, { role: 'assistant', text: res.data.reply }]);
        } catch (e) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                text: `Disculpe, no he podido procesar su mensaje. Por favor inténtelo de nuevo o contacte a soporte ${SUPPORT_EMAIL}`,
            }]);
        } finally {
            setLoading(false);
        }
    }, [input, loading, sessionId]);

    const reset = async () => {
        if (sessionId) {
            try { await api.post('/mt5-coach/reset', { session_id: sessionId }); } catch { /* noop */ }
        }
        try { localStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
        setSessionId(null);
        setMessages([]);
    };

    const handleKey = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    };

    return (
        <>
            {/* Floating launcher button */}
            <AnimatePresence>
                {!open && (
                    <motion.button
                        type="button"
                        onClick={() => setOpen(true)}
                        data-testid="mt5-coach-launcher"
                        data-no-hover
                        initial={{ scale: 0.8, opacity: 0, y: 16 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.8, opacity: 0, y: 16 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.96 }}
                        className="fixed bottom-24 right-5 z-40 group"
                        aria-label="Abrir asistente AI"
                    >
                        <div className="relative">
                            <div className="absolute inset-0 rounded-full bg-cyan-500/40 blur-xl group-hover:bg-cyan-400/50 transition-colors" />
                            <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-cyan-700 ring-2 ring-cyan-300/60 shadow-lg shadow-cyan-500/30 flex items-center justify-center">
                                <Bot className="w-6 h-6 text-white" strokeWidth={2.2} />
                            </div>
                            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-slate-950 animate-pulse" />
                        </div>
                        <span className="absolute -top-9 right-0 text-[10px] uppercase tracking-wider font-bold text-cyan-300 bg-slate-950/90 ring-1 ring-cyan-500/40 px-2 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            Soporte 24/7
                        </span>
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Chat panel */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ y: 30, opacity: 0, scale: 0.96 }}
                        animate={{ y: 0,  opacity: 1, scale: 1 }}
                        exit={{ y: 30, opacity: 0, scale: 0.96 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 320 }}
                        className="fixed bottom-24 right-5 z-50 w-[min(380px,calc(100vw-2.5rem))] h-[min(560px,calc(100vh-7rem))] flex flex-col bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 ring-1 ring-cyan-500/25 rounded-2xl shadow-2xl shadow-cyan-500/10 overflow-hidden"
                        data-testid="mt5-coach-panel"
                    >
                        {/* Header */}
                        <div className="relative flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-800/80 bg-gradient-to-r from-cyan-500/10 via-slate-900/60 to-slate-900">
                            <div className="absolute inset-x-0 -top-12 h-24 opacity-30 blur-2xl bg-gradient-to-r from-cyan-500/40 to-transparent pointer-events-none" />
                            <div className="relative flex items-center gap-2.5 min-w-0">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500/30 to-cyan-700/20 ring-1 ring-cyan-400/40 flex items-center justify-center flex-shrink-0">
                                    <Bot className="w-4.5 h-4.5 text-cyan-200" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-white text-[13px] font-bold leading-tight">Leo · Asistente AI</p>
                                    <p className="text-[10px] text-emerald-300 inline-flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        En línea · Claude Sonnet 4.5
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={reset}
                                    data-no-hover
                                    data-testid="mt5-coach-reset"
                                    title="Nueva conversación"
                                    className="w-7 h-7 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-slate-800/60 flex items-center justify-center transition-colors"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    data-no-hover
                                    data-testid="mt5-coach-close"
                                    className="w-7 h-7 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/60 flex items-center justify-center transition-colors"
                                    aria-label="Cerrar"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5" data-testid="mt5-coach-messages">
                            {messages.map((m, i) => <Bubble key={i} role={m.role} text={m.text} />)}
                            {loading && (
                                <div className="flex justify-start">
                                    <div className="bg-slate-800/80 ring-1 ring-slate-700/60 rounded-2xl px-3.5 py-2.5 inline-flex items-center gap-2 text-cyan-300 text-[11.5px]">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        Leo está escribiendo…
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Suggestions (shown only when conversation just started) */}
                        {messages.length <= 1 && !loading && (
                            <div className="px-3.5 pb-2 flex flex-wrap gap-1.5">
                                {SUGGESTIONS.map(s => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => send(s)}
                                        data-no-hover
                                        data-testid={`mt5-coach-suggestion-${s.slice(0, 8)}`}
                                        className="text-[10.5px] px-2.5 py-1 rounded-full bg-slate-800/70 ring-1 ring-slate-700 text-slate-300 hover:bg-cyan-500/15 hover:text-cyan-200 hover:ring-cyan-500/30 transition-all"
                                    >
                                        <Sparkles className="w-2.5 h-2.5 inline mr-1 text-cyan-400" />
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Composer */}
                        <div className="border-t border-slate-800/80 bg-slate-950/80 p-2.5">
                            <div className="flex items-end gap-2">
                                <textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value.slice(0, 1500))}
                                    onKeyDown={handleKey}
                                    placeholder="Escribe tu pregunta…"
                                    rows={1}
                                    disabled={loading}
                                    data-testid="mt5-coach-input"
                                    className="flex-1 resize-none bg-slate-900 border border-slate-800 focus:border-cyan-500/50 rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-slate-600 focus:outline-none max-h-24 min-h-[36px]"
                                />
                                <Button
                                    onClick={() => send()}
                                    disabled={loading || !input.trim()}
                                    data-testid="mt5-coach-send"
                                    className="h-9 w-9 p-0 bg-cyan-600 hover:bg-cyan-500 text-white flex-shrink-0"
                                    aria-label="Enviar"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                </Button>
                            </div>
                            <p className="text-[9.5px] text-slate-600 mt-1.5 inline-flex items-center gap-1">
                                <MessageCircle className="w-2.5 h-2.5" />
                                Soporte AI educativo · No constituye asesoramiento financiero
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default MT5CoachWidget;
