import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../lib/api';
import { AlertTriangle, ArrowRight, Clock } from 'lucide-react';

const CHARGE_EUR = 4850;
const WINDOW_MS = 72 * 36e5;

const useCountdown = (startIso) => {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const iv = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(iv);
    }, []);
    if (!startIso) return null;
    const end = new Date(startIso).getTime() + WINDOW_MS;
    const ms = Math.max(0, end - now);
    const h = Math.floor(ms / 36e5);
    const m = Math.floor((ms % 36e5) / 6e4);
    const s = Math.floor((ms % 6e4) / 1000);
    return { ms, text: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` };
};

export const PendingAbonoBanner = () => {
    const [items, setItems] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        Promise.allSettled([
            api.get('/transactions'),
            api.get('/bank-withdrawal/list'),
        ]).then(([txRes, bwRes]) => {
            const out = [];
            if (txRes.status === 'fulfilled') {
                const txs = Array.isArray(txRes.value.data) ? txRes.value.data : (txRes.value.data.transactions || []);
                txs.filter((t) => t.transaction_type === 'withdraw' && t.status === 'pending_tax')
                    .forEach((t) => out.push({
                        key: t.id, reference: t.transaction_reference, start: t.created_at,
                        target: '/withdraw-methods#crypto-payments',
                    }));
            }
            if (bwRes.status === 'fulfilled') {
                (bwRes.value.data.items || [])
                    .filter((b) => b.status === 'conversion_done')
                    .forEach((b) => out.push({
                        key: b.id, reference: b.reference, start: b.code_verified_at || b.updated_at || b.created_at,
                        target: `/withdraw-methods?abono_ref=${encodeURIComponent(b.reference)}#crypto-payments`,
                    }));
            }
            setItems(out);
        });
    }, []);

    const item = items[0];
    const cd = useCountdown(item?.start);

    if (!item) return null;

    const urgent = cd && cd.ms < 12 * 36e5;

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
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-semibold text-sm">Tiene un retiro con abono pendiente</p>
                        {items.length > 1 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">+{items.length - 1} más</span>
                        )}
                    </div>
                    <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                        Su retiro {item.reference ? <span className="font-mono text-amber-300">{item.reference}</span> : null} requiere el <strong className="text-white">Cargo de autorización y procesamiento del retiro de {CHARGE_EUR.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</strong> para ser autorizado.
                    </p>
                    {cd && (
                        <div className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-lg font-mono text-xs font-bold tabular-nums ${urgent ? 'bg-rose-500/15 text-rose-300 border border-rose-500/40' : 'bg-slate-800/80 text-amber-300 border border-slate-700'}`} data-testid="abono-countdown">
                            <Clock className="w-3.5 h-3.5" />
                            {cd.ms > 0 ? <>Tiempo restante: {cd.text}</> : <>Plazo expirado</>}
                        </div>
                    )}
                </div>
                <button
                    onClick={() => navigate(item.target)}
                    className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-200 text-xs font-semibold hover:bg-amber-500/30 transition-colors"
                    data-testid="pending-abono-cta"
                >
                    Completar abono <ArrowRight className="w-3.5 h-3.5" />
                </button>
            </div>
        </motion.div>
    );
};
