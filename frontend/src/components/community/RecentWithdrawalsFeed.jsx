import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { fmtEUR, timeAgo } from './constants';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export const RecentWithdrawalsFeed = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchFeed = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const r = await fetch(`${API_URL}/api/community/recent-withdrawals?limit=12`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await r.json();
            setItems(d.items || []);
        } catch (e) {
            // silent
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFeed();
        const id = setInterval(fetchFeed, 30000);
        return () => clearInterval(id);
    }, [fetchFeed]);

    return (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40" data-testid="community-recent-withdrawals">
            <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500 mb-1">Libro de transacciones</p>
                    <h3 className="text-white text-sm font-semibold">Retiros verificados</h3>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-widest text-emerald-400">
                    <span className="relative flex w-1.5 h-1.5">
                        <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
                        <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    </span>
                    Live · 30s
                </div>
            </div>
            <div className="p-3">
                {loading ? (
                    <div className="space-y-2">
                        {[...Array(3)].map((_, i) => <div key={i} className="h-11 bg-slate-800/40 rounded-md animate-pulse" />)}
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-xs">
                        <Sparkles className="w-5 h-5 mx-auto mb-2 text-slate-600" />
                        Sin retiros verificados aún.<br />
                        <span className="text-[11px] text-slate-600">El libro se actualizará en cuanto haya transacciones completadas.</span>
                    </div>
                ) : (
                    <div className="space-y-px max-h-[520px] overflow-y-auto pr-1">
                        <AnimatePresence>
                            {items.map(it => (
                                <motion.div
                                    key={it.id}
                                    initial={{ opacity: 0, x: -6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-slate-800/30 transition-colors"
                                >
                                    <div className="text-base leading-none">{it.country_flag}</div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] text-slate-200 font-medium truncate leading-tight">{it.name_public}</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">{it.country} · {timeAgo(it.date)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[13px] font-semibold text-emerald-300 font-mono tabular-nums leading-tight">{fmtEUR(it.amount_eur)}</p>
                                        <p className="text-[9px] text-emerald-400/80 uppercase tracking-widest mt-0.5 flex items-center gap-1 justify-end">
                                            <CheckCircle2 className="w-2.5 h-2.5" />
                                            {it.status === 'completed' ? 'Retirado' : 'En transferencia'}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    );
};
