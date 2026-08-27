import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../lib/api';
import { AlertTriangle, ArrowRight, Clock } from 'lucide-react';

const CHARGE_EUR = 4850;

export const PendingAbonoBanner = () => {
    const [pending, setPending] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        api.get('/transactions')
            .then((r) => {
                const txs = Array.isArray(r.data) ? r.data : (r.data.transactions || []);
                setPending(txs.filter((t) => t.transaction_type === 'withdraw' && t.status === 'pending_tax'));
            })
            .catch(() => setPending([]));
    }, []);

    if (pending.length === 0) return null;

    const tx = pending[0];
    const created = tx.created_at ? new Date(tx.created_at) : null;
    const hoursLeft = created ? Math.max(0, 72 - (Date.now() - created.getTime()) / 36e5) : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/[0.08] via-amber-500/[0.04] to-transparent p-4 sm:p-5"
            data-testid="pending-abono-banner"
        >
            <div className="flex items-start gap-3 flex-wrap">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm">
                        Tiene un retiro con abono pendiente
                    </p>
                    <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                        Su retiro {tx.transaction_reference ? <span className="font-mono text-amber-300">{tx.transaction_reference}</span> : null} requiere el <strong className="text-white">Cargo de autorización y procesamiento del retiro de {CHARGE_EUR.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</strong> para ser autorizado.
                        {hoursLeft != null && (
                            <span className="inline-flex items-center gap-1 text-rose-300 ml-1">
                                <Clock className="w-3 h-3" /> quedan ~{Math.floor(hoursLeft)} h
                            </span>
                        )}
                    </p>
                </div>
                <button
                    onClick={() => navigate('/withdraw-methods#crypto-payments')}
                    className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-200 text-xs font-semibold hover:bg-amber-500/30 transition-colors"
                    data-testid="pending-abono-cta"
                >
                    Completar abono <ArrowRight className="w-3.5 h-3.5" />
                </button>
            </div>
        </motion.div>
    );
};
