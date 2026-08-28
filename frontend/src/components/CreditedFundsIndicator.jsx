import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Users, Clock } from 'lucide-react';
import api from '../lib/api';

const fmtEur = (n) =>
    Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CreditedFundsIndicator = ({ variant = 'auth' }) => {
    const [data, setData] = useState(null);

    useEffect(() => {
        api.get('/public/credited-funds').then((r) => setData(r.data)).catch(() => {});
    }, []);

    if (!data) return null;

    const lastUpdated = data.last_updated
        ? new Date(data.last_updated).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';

    if (variant === 'dashboard') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/[0.07] to-transparent p-4 sm:p-5"
                data-testid="credited-funds-indicator"
            >
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex-shrink-0">
                            <TrendingUp className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-[11px] uppercase tracking-wider text-emerald-400/80 font-semibold">Fondos acreditados a favor de nuestros usuarios</p>
                            <p className="text-white text-2xl font-bold tabular-nums" data-testid="credited-funds-total">{fmtEur(data.total_credited)} €</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                        <Users className="w-3.5 h-3.5 text-cyan-400" />
                        <span data-testid="credited-funds-users"><span className="text-white font-semibold">{Number(data.users_count || 0).toLocaleString('es-ES')}</span> usuarios beneficiados</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 text-xs">
                        <Clock className="w-3.5 h-3.5" />
                        <span data-testid="credited-funds-updated">Actualizado: {lastUpdated}</span>
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-4 p-4 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20"
            data-testid="credited-funds-indicator"
        >
            <div className="flex items-center justify-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <p className="text-emerald-400/90 text-[11px] uppercase tracking-wider font-semibold">Fondos acreditados a favor de nuestros usuarios</p>
            </div>
            <p className="text-white text-xl font-bold text-center tabular-nums" data-testid="credited-funds-total">{fmtEur(data.total_credited)} €</p>
            <div className="flex items-center justify-center gap-4 mt-1.5 text-[11px] text-slate-500">
                <span className="flex items-center gap-1" data-testid="credited-funds-users">
                    <Users className="w-3 h-3 text-cyan-400" />
                    {Number(data.users_count || 0).toLocaleString('es-ES')} usuarios
                </span>
                <span className="flex items-center gap-1" data-testid="credited-funds-updated">
                    <Clock className="w-3 h-3" />
                    {lastUpdated}
                </span>
            </div>
        </motion.div>
    );
};
