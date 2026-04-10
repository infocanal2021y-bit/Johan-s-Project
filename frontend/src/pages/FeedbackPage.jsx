import { useState, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { Star, Send, Loader2, CheckCircle, MessageSquare, Clock } from 'lucide-react';
import { feedbackAPI } from '../lib/api';
import { toast } from 'sonner';

const CATEGORIES = [
    { id: 'general', label: 'General' },
    { id: 'retiros', label: 'Retiros' },
    { id: 'soporte', label: 'Soporte' },
    { id: 'interfaz', label: 'Interfaz' },
    { id: 'pagos', label: 'Pagos' },
];

const StarRating = ({ rating, setRating, readonly = false }) => {
    const [hover, setHover] = useState(0);
    return (
        <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    disabled={readonly}
                    onClick={() => !readonly && setRating(star)}
                    onMouseEnter={() => !readonly && setHover(star)}
                    onMouseLeave={() => !readonly && setHover(0)}
                    className={`transition-transform ${readonly ? '' : 'hover:scale-110 active:scale-95'}`}
                    data-testid={`star-${star}`}
                >
                    <Star
                        className={`w-8 h-8 transition-colors ${
                            star <= (hover || rating)
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-slate-700'
                        }`}
                    />
                </button>
            ))}
        </div>
    );
};

export default function FeedbackPage() {
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [category, setCategory] = useState('general');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(true);

    useEffect(() => {
        feedbackAPI.getMine()
            .then(res => setHistory(res.data))
            .catch(() => {})
            .finally(() => setLoadingHistory(false));
    }, []);

    const handleSubmit = async () => {
        if (rating === 0) { toast.error('Seleccione una calificacion'); return; }
        setSubmitting(true);
        try {
            await feedbackAPI.submit({ rating, comment: comment.trim() || null, category });
            setSubmitted(true);
            toast.success('Gracias por su feedback');
            // Add to history
            setHistory(prev => [{
                rating, comment: comment.trim(), category,
                created_at: new Date().toISOString()
            }, ...prev]);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Error al enviar feedback');
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setRating(0);
        setComment('');
        setCategory('general');
        setSubmitted(false);
    };

    const ratingLabels = ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'];

    return (
        <Layout>
            <div className="max-w-2xl mx-auto" data-testid="feedback-page">
                {/* Header */}
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-11 h-11 rounded-xl bg-amber-500/20 flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-white">Feedback</h1>
                        <p className="text-slate-500 text-sm">Su opinion nos ayuda a mejorar</p>
                    </div>
                </div>

                {/* Form / Success */}
                {submitted ? (
                    <div className="p-8 rounded-2xl bg-slate-900/80 border border-slate-800 text-center mb-8" data-testid="feedback-success">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="w-8 h-8 text-emerald-400" />
                        </div>
                        <h2 className="text-white text-lg font-bold mb-2">Gracias por su feedback</h2>
                        <p className="text-slate-400 text-sm mb-6">Su opinion es muy importante para nosotros y nos ayuda a mejorar continuamente.</p>
                        <Button onClick={resetForm} className="bg-slate-800 hover:bg-slate-700 text-white" data-testid="send-another-btn">
                            Enviar otro feedback
                        </Button>
                    </div>
                ) : (
                    <div className="p-6 sm:p-8 rounded-2xl bg-slate-900/80 border border-slate-800 mb-8" data-testid="feedback-form">
                        {/* Rating */}
                        <div className="mb-6">
                            <p className="text-white text-sm font-semibold mb-3">Como califica su experiencia?</p>
                            <div className="flex items-center gap-4">
                                <StarRating rating={rating} setRating={setRating} />
                                {rating > 0 && (
                                    <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                                        rating >= 4 ? 'bg-emerald-500/15 text-emerald-400' :
                                        rating >= 3 ? 'bg-amber-500/15 text-amber-400' :
                                        'bg-red-500/15 text-red-400'
                                    }`}>
                                        {ratingLabels[rating]}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Category */}
                        <div className="mb-5">
                            <p className="text-white text-sm font-semibold mb-2">Categoria</p>
                            <div className="flex flex-wrap gap-2">
                                {CATEGORIES.map(cat => (
                                    <button
                                        key={cat.id}
                                        onClick={() => setCategory(cat.id)}
                                        className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                            category === cat.id
                                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                                                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                                        }`}
                                        data-testid={`category-${cat.id}`}
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Comment */}
                        <div className="mb-6">
                            <p className="text-white text-sm font-semibold mb-2">Comentario <span className="text-slate-600 font-normal">(opcional)</span></p>
                            <textarea
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="Cuentenos su experiencia, sugerencias o lo que podemos mejorar..."
                                className="w-full bg-slate-950/50 border border-slate-800 rounded-xl text-white text-sm p-4 min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30 placeholder:text-slate-600"
                                data-testid="feedback-comment"
                            />
                        </div>

                        {/* Submit */}
                        <Button
                            onClick={handleSubmit}
                            disabled={submitting || rating === 0}
                            className="w-full bg-amber-600 hover:bg-amber-700 text-white py-5 text-base disabled:opacity-40"
                            data-testid="submit-feedback-btn"
                        >
                            {submitting
                                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                                : <><Send className="w-4 h-4 mr-2" /> Enviar Feedback</>
                            }
                        </Button>
                    </div>
                )}

                {/* Feedback History */}
                {history.length > 0 && (
                    <div data-testid="feedback-history">
                        <h3 className="text-white text-base font-semibold mb-4 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-500" />
                            Mis feedbacks anteriores
                        </h3>
                        <div className="space-y-3">
                            {history.map((fb, i) => (
                                <div key={i} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <StarRating rating={fb.rating} setRating={() => {}} readonly />
                                            <span className="text-slate-500 text-xs capitalize bg-slate-800 px-2 py-0.5 rounded">{fb.category}</span>
                                        </div>
                                        <span className="text-slate-600 text-xs">
                                            {new Date(fb.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </span>
                                    </div>
                                    {fb.comment && <p className="text-slate-400 text-sm mt-1">{fb.comment}</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
