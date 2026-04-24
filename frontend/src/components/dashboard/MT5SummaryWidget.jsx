import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card } from '../ui/card';
import { OdometerValue } from './OdometerValue';
import api from '../../lib/api';
import { Landmark, ArrowUpRight, ShieldCheck, Activity } from 'lucide-react';

const fmtMoney = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * MT5SummaryWidget — compact MT5 account health card for the main dashboard.
 * Uses the existing /mt5/summary endpoint (cheap, single call).
 */
export const MT5SummaryWidget = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchSummary = useCallback(async () => {
        try {
            const res = await api.get('/mt5/summary');
            setData(res.data);
        } catch (e) { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        fetchSummary();
        const id = setInterval(fetchSummary, 20000);
        return () => clearInterval(id);
    }, [fetchSummary]);

    if (loading && !data) {
        return (
            <Card className="p-4 bg-slate-900/70 border-slate-800/80 min-h-[150px]">
                <p className="text-slate-500 text-xs">Conectando con MT5...</p>
            </Card>
        );
    }

    const acc = data?.account || {};
    const broker = data?.broker || {};
    const counts = data?.counts || { open: 0, closed: 0 };
    const growthPct = acc.initial_balance
        ? ((acc.equity - acc.initial_balance) / acc.initial_balance) * 100
        : 0;

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Link to="/mt5" data-no-hover data-testid="mt5-dashboard-widget" className="block group">
                <Card className="relative overflow-hidden bg-gradient-to-br from-[#0b1b34] via-[#0c1f3d]/90 to-slate-950 border-[#14549C]/30 p-5">
                    <div
                        aria-hidden="true"
                        className="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-40 blur-2xl"
                        style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.22), transparent 70%)' }}
                    />
                    <div className="relative">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#14549C] to-[#0b3f75] ring-1 ring-white/10 flex items-center justify-center flex-shrink-0">
                                    <Landmark className="w-5 h-5 text-white" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#4a9eff] font-bold">
                                        Cuenta MT5 · {broker.name || 'Broker'}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                        <span className="text-white text-sm font-mono tabular-nums font-bold">#{acc.login}</span>
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[9px] font-bold tracking-wider uppercase ring-1 ring-emerald-500/30">
                                            <ShieldCheck className="w-2.5 h-2.5" /> Verificada
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <ArrowUpRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all flex-shrink-0" />
                        </div>

                        {/* 3 metrics row */}
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Balance</p>
                                <p className="text-lg text-white font-numbers tabular-nums font-bold mt-1" style={{ letterSpacing: '-0.01em' }}>
                                    <OdometerValue value={fmtMoney(acc.balance)} staggerMs={40} />
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Equity</p>
                                <p className="text-lg text-cyan-300 font-numbers tabular-nums font-bold mt-1" style={{ letterSpacing: '-0.01em' }}>
                                    <OdometerValue value={fmtMoney(acc.equity)} staggerMs={40} />
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Rendimiento</p>
                                <p className={`text-lg font-numbers tabular-nums font-bold mt-1 ${growthPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`} style={{ letterSpacing: '-0.01em' }}>
                                    {growthPct >= 0 ? '+' : ''}{growthPct.toFixed(2)}%
                                </p>
                            </div>
                        </div>

                        {/* Footer status */}
                        <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-800/60 text-[11px]">
                            <div className="inline-flex items-center gap-1.5 text-slate-500">
                                <Activity className="w-3 h-3 text-amber-300" />
                                <span>{counts.open} abierta{counts.open !== 1 ? 's' : ''}</span>
                                <span className="text-slate-700">·</span>
                                <span>{counts.closed} cerradas</span>
                            </div>
                            <span className="text-cyan-300 text-[11px] font-semibold inline-flex items-center gap-1">
                                Abrir MT5 <ArrowUpRight className="w-3 h-3" />
                            </span>
                        </div>
                    </div>
                </Card>
            </Link>
        </motion.div>
    );
};

export default MT5SummaryWidget;
