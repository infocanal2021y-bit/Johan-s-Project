import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../../lib/api';
import { MessageCircleQuestion, Loader2, Send, CornerDownRight, ChevronDown, Star } from 'lucide-react';

// Q&A público por retiro (Retiros Recientes). Máx 3 preguntas por usuario/retiro.
// Las respuestas se muestran solo como "Respuesta" (sin identidad admin).
export const WithdrawalQuestions = ({ withdrawalId }) => {
    const [searchParams] = useSearchParams();
    const deepLinked = searchParams.get('withdrawal') === withdrawalId;
    const [open, setOpen] = useState(deepLinked);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const boxRef = useRef(null);

    const load = async () => {
        setLoading(true);
        try {
            const { data: d } = await api.get(`/recent-withdrawals/${withdrawalId}/questions`);
            setData(d);
        } catch { /* silencioso */ } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open && withdrawalId && !data) load();
        if (open && deepLinked && boxRef.current) {
            setTimeout(() => boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, withdrawalId]);

    if (!withdrawalId) return null;

    const ask = async () => {
        if (!message.trim()) { toast.error('Escriba su pregunta'); return; }
        setSending(true);
        try {
            await api.post('/recent-withdrawals/questions', { withdrawal_id: withdrawalId, message: message.trim() });
            toast.success('Pregunta enviada');
            setMessage('');
            load();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'No se pudo enviar la pregunta');
        } finally {
            setSending(false);
        }
    };

    const highlightQ = searchParams.get('question');

    return (
        <div ref={boxRef} className="mt-3 pt-3 border-t border-[#F1F4F8]" data-testid={`questions-section-${withdrawalId}`}>
            <button type="button" onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between text-[11px] font-semibold text-[#1E3A8A] hover:text-[#1973B8]"
                data-testid={`questions-toggle-${withdrawalId}`}>
                <span className="flex items-center gap-1.5">
                    <MessageCircleQuestion className="w-3.5 h-3.5" /> Preguntas y respuestas
                    {data ? ` (${data.questions.length})` : ''}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="mt-2.5 space-y-2.5">
                    {loading && !data ? (
                        <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 text-[#1E3A8A] animate-spin" /></div>
                    ) : (
                        <>
                            {(data?.questions || []).map((q) => (
                                <div key={q.question_id}
                                    className={`rounded-lg bg-[#F8FAFB] border p-2.5 ${highlightQ === q.question_id ? 'border-[#1973B8]' : 'border-[#EDF1F5]'}`}
                                    data-testid={`question-${q.question_id}`}>
                                    {q.featured && (
                                        <p className="text-[10px] font-bold text-[#B45309] flex items-center gap-1 mb-0.5" data-testid={`featured-badge-${q.question_id}`}>
                                            <Star className="w-3 h-3 fill-[#F59E0B] text-[#F59E0B]" /> Pregunta destacada
                                        </p>
                                    )}
                                    <p className="text-[12px] text-[#072146] font-semibold">{q.user_public_name}</p>
                                    <p className="text-[12px] text-[#374151]">{q.message}</p>
                                    {q.reply ? (
                                        <div className="mt-1.5 pl-3 border-l-2 border-[#1973B8]/40">
                                            <p className="text-[11px] font-bold text-[#1973B8] flex items-center gap-1">
                                                <CornerDownRight className="w-3 h-3" /> Respuesta
                                            </p>
                                            <p className="text-[12px] text-[#374151]" data-testid={`reply-${q.question_id}`}>{q.reply.message}</p>
                                        </div>
                                    ) : (
                                        <p className="text-[10.5px] text-[#9CA3AF] mt-1">Pendiente de respuesta</p>
                                    )}
                                </div>
                            ))}
                            {(data?.questions || []).length === 0 && (
                                <p className="text-[11.5px] text-[#9CA3AF] text-center py-1.5">Aún no hay preguntas sobre este retiro.</p>
                            )}

                            {data && data.my_remaining > 0 ? (
                                <div className="flex gap-1.5">
                                    <input
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value.slice(0, 500))}
                                        placeholder="Escriba su pregunta..."
                                        className="flex-1 h-9 px-3 rounded-lg border border-[#E5EAF0] bg-white text-[12px] text-[#072146] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#1973B8]"
                                        data-testid={`question-input-${withdrawalId}`}
                                    />
                                    <button type="button" onClick={ask} disabled={sending}
                                        className="h-9 px-3 rounded-lg bg-[#1973B8] text-white text-[12px] font-semibold hover:bg-[#155f99] disabled:opacity-50 flex items-center gap-1"
                                        data-testid={`question-send-${withdrawalId}`}>
                                        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            ) : data && (
                                <p className="text-[10.5px] text-[#B45309] text-center font-semibold" data-testid={`questions-limit-msg-${withdrawalId}`}>Has alcanzado el límite de 3 preguntas para este retiro.</p>
                            )}
                            {data && data.my_remaining > 0 && (
                                <p className="text-[10px] text-[#9CA3AF] text-right" data-testid={`questions-counter-${withdrawalId}`}>Preguntas realizadas: {data.my_count} de 3</p>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
