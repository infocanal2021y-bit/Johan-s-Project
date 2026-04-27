import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../lib/api';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import {
    CalendarClock, X, Loader2, CheckCircle2, Clock, Sparkles,
} from 'lucide-react';

const fmtEUR = (n) => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Reserve future investment modal — extracted from MT5HubSections.jsx
export const ReserveInvestmentModal = ({ open, onClose }) => {
    const [amount, setAmount] = useState(500);
    const [method, setMethod] = useState('usdt_trc20');
    const [date, setDate] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(null);

    useEffect(() => {
        if (!open) return;
        const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // default +7 days
        setDate(d.toISOString().slice(0, 10));
        setAmount(500);
        setMethod('usdt_trc20');
        setSuccess(null);
    }, [open]);

    const submit = async () => {
        if (amount < 300) { toast.error('Monto mínimo: 300 EUR'); return; }
        if (!date) { toast.error('Selecciona una fecha'); return; }
        setSubmitting(true);
        try {
            const r = await api.post('/mt5-invest/reserve', {
                amount_eur: Number(amount),
                method,
                target_date: new Date(date + 'T12:00:00Z').toISOString(),
            });
            setSuccess(r.data.reservation);
            toast.success('Reserva creada · tasa bloqueada 24h');
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al crear la reserva');
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;
    const methods = [
        { id: 'usdt_trc20', label: 'USDT (TRC20)', color: '#26A17B' },
        { id: 'btc',        label: 'Bitcoin',       color: '#F7931A' },
        { id: 'eth',        label: 'Ethereum',      color: '#627EEA' },
    ];

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
                onClick={onClose}
                data-testid="mt5-reserve-modal"
            >
                <motion.div
                    initial={{ y: 24, opacity: 0, scale: 0.96 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: 24, opacity: 0, scale: 0.96 }}
                    transition={{ type: 'spring', damping: 22, stiffness: 320 }}
                    className="relative w-full max-w-md max-h-[92vh] overflow-y-auto bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 ring-1 ring-cyan-500/25 rounded-2xl shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-800/80">
                        <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-lg bg-cyan-500/15 ring-1 ring-cyan-500/30 flex items-center justify-center">
                                <CalendarClock className="w-4.5 h-4.5 text-cyan-300" />
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-300 font-bold">Reservar inversión</p>
                                <h3 className="text-white text-base font-bold">Bloqueo de tasa hasta 180 días</h3>
                            </div>
                        </div>
                        <button type="button" onClick={onClose} data-testid="mt5-reserve-close" className="w-8 h-8 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="px-5 py-5 space-y-3.5">
                        {success ? (
                            <div className="text-center py-4" data-testid="mt5-reserve-success">
                                <div className="inline-flex w-12 h-12 rounded-full bg-emerald-500/20 ring-1 ring-emerald-400/50 items-center justify-center mx-auto">
                                    <CheckCircle2 className="w-6 h-6 text-emerald-200" />
                                </div>
                                <p className="text-emerald-200 text-sm font-bold mt-3">Reserva confirmada</p>
                                <p className="text-slate-400 text-[12px] mt-1">
                                    €{fmtEUR(success.amount_eur)} en {success.method.replace('_', ' ').toUpperCase()}<br />
                                    para el <span className="text-white font-mono">{fmtDate(success.target_date)}</span>
                                </p>
                                <p className="text-slate-500 text-[10.5px] mt-2 font-mono">Ref. {success.id.slice(0, 8)}</p>
                                <p className="text-amber-300/80 text-[10.5px] mt-3 inline-flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Confirma el pago antes de 24h para mantener la tasa
                                </p>
                                <Button onClick={onClose} className="mt-4 bg-cyan-600 hover:bg-cyan-500 text-white">Listo</Button>
                            </div>
                        ) : (
                            <>
                                <label className="block">
                                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Monto (EUR)</span>
                                    <input
                                        type="number"
                                        min={300}
                                        max={500000}
                                        step="50"
                                        value={amount}
                                        onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                                        data-testid="mt5-reserve-amount"
                                        className="w-full h-11 mt-1 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-lg font-mono tabular-nums font-bold focus:outline-none focus:border-cyan-500/50"
                                    />
                                </label>

                                <div>
                                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Método</span>
                                    <div className="grid grid-cols-3 gap-2 mt-1">
                                        {methods.map(m => (
                                            <button
                                                key={m.id}
                                                type="button"
                                                onClick={() => setMethod(m.id)}
                                                data-no-hover
                                                data-testid={`mt5-reserve-method-${m.id}`}
                                                className={`h-10 rounded-lg text-[11.5px] font-bold transition-all ring-1 ${
                                                    method === m.id
                                                        ? 'text-white shadow-md'
                                                        : 'bg-slate-900 text-slate-400 ring-slate-800 hover:text-slate-200'
                                                }`}
                                                style={method === m.id ? { backgroundColor: m.color + '22', borderColor: m.color, color: m.color } : {}}
                                            >{m.label}</button>
                                        ))}
                                    </div>
                                </div>

                                <label className="block">
                                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Fecha objetivo</span>
                                    <input
                                        type="date"
                                        value={date}
                                        min={new Date(Date.now() + 24*60*60*1000).toISOString().slice(0, 10)}
                                        max={new Date(Date.now() + 180*24*60*60*1000).toISOString().slice(0, 10)}
                                        onChange={(e) => setDate(e.target.value)}
                                        data-testid="mt5-reserve-date"
                                        className="w-full h-11 mt-1 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500/50"
                                    />
                                </label>

                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/25 text-amber-200 text-[10.5px]">
                                    <Sparkles className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                    Bloquea la tasa actual del activo. Tienes <span className="font-bold">24 horas</span> para enviar el pago una vez creada la reserva.
                                </div>

                                <Button
                                    onClick={submit}
                                    disabled={submitting || amount < 300}
                                    data-testid="mt5-reserve-submit"
                                    className="w-full h-11 bg-gradient-to-r from-cyan-600 to-cyan-500 text-white font-bold tracking-wider"
                                >
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CalendarClock className="w-4 h-4 mr-2" />}
                                    Crear reserva · €{fmtEUR(amount)}
                                </Button>
                            </>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
