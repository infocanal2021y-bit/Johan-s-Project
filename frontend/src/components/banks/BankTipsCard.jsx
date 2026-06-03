import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../lib/api';
import {
    Info, Building2, Clock, Hash, ShieldCheck, AlertTriangle,
    CheckCircle2, Loader2,
} from 'lucide-react';


/**
 * Shows curated tips + IBAN/BIC/reliability for a Spanish bank.
 * Lazy-fetches from `/api/banks/tips/{bankId}` and caches in memory.
 *
 * Props:
 *   - bankName: string  (e.g. 'CaixaBank', 'BBVA', 'Santander')
 */
const CACHE = new Map();

export const BankTipsCard = ({ bankName }) => {
    const [info, setInfo] = useState(CACHE.get(bankName) || null);
    const [loading, setLoading] = useState(!info);

    useEffect(() => {
        if (!bankName) return;
        if (CACHE.has(bankName)) {
            setInfo(CACHE.get(bankName));
            setLoading(false);
            return;
        }
        let alive = true;
        setLoading(true);
        api.get(`/banks/tips/${encodeURIComponent(bankName)}`)
            .then((r) => {
                CACHE.set(bankName, r.data);
                if (alive) setInfo(r.data);
            })
            .catch(() => { /* unsupported bank — show nothing */ if (alive) setInfo(null); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [bankName]);

    if (!bankName) return null;
    if (loading) {
        return (
            <div className="rounded-lg bg-slate-900/60 ring-1 ring-slate-800 p-2.5 my-2 flex items-center justify-center gap-2" data-testid="bank-tips-loading">
                <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                <span className="text-slate-400 text-[10.5px]">Cargando información del banco…</span>
            </div>
        );
    }
    if (!info) return null;

    return (
        <AnimatePresence>
            <motion.div
                key={bankName}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden my-2"
                data-testid={`bank-tips-card-${info.id}`}
            >
                <div
                    className="rounded-lg p-3 ring-1"
                    style={{
                        background: `linear-gradient(135deg, ${info.logo_color}18, transparent)`,
                        boxShadow: `inset 0 0 0 1px ${info.logo_color}30`,
                        borderColor: `${info.logo_color}40`,
                    }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: info.logo_color + '25' }}>
                                <Building2 className="w-3.5 h-3.5" style={{ color: info.logo_color }} />
                            </div>
                            <div>
                                <p className="text-[11.5px] font-bold leading-tight" style={{ color: info.logo_color }}>
                                    {info.name}
                                </p>
                                <p className="text-slate-400 text-[9px] flex items-center gap-1">
                                    <ShieldCheck className="w-2.5 h-2.5" />
                                    Fiabilidad {info.reliability_score}/100
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-slate-500 text-[8.5px] uppercase tracking-wider font-bold">Tiempo medio</p>
                            <p className="text-white text-[10px] font-bold flex items-center gap-1 justify-end">
                                <Clock className="w-2.5 h-2.5 text-emerald-400" />
                                {info.avg_processing_label}
                            </p>
                        </div>
                    </div>

                    {/* IBAN/SWIFT row */}
                    <div className="grid grid-cols-2 gap-1.5 mb-2">
                        <div className="bg-slate-950/40 rounded px-2 py-1.5">
                            <p className="text-slate-500 text-[8px] uppercase tracking-wider font-bold">IBAN empieza por</p>
                            <p className="text-slate-200 font-mono text-[10px] font-bold tracking-wide">{info.iban_prefix}</p>
                        </div>
                        <div className="bg-slate-950/40 rounded px-2 py-1.5">
                            <p className="text-slate-500 text-[8px] uppercase tracking-wider font-bold">SWIFT / BIC</p>
                            <p className="text-slate-200 font-mono text-[10px] font-bold tracking-wide">{info.swift}</p>
                        </div>
                    </div>

                    {/* Tips */}
                    {info.tips?.length > 0 && (
                        <ul className="space-y-1 mb-2" data-testid="bank-tips-tips">
                            {info.tips.slice(0, 3).map((tip, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-[10.5px] text-slate-300 leading-relaxed">
                                    <CheckCircle2 className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" style={{ color: info.logo_color }} />
                                    <span>{tip}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* Warnings */}
                    {info.warnings?.length > 0 && (
                        <div className="bg-amber-500/10 ring-1 ring-amber-500/30 rounded p-2 mt-2" data-testid="bank-tips-warnings">
                            {info.warnings.map((w, i) => (
                                <div key={i} className="flex items-start gap-1.5 text-[10px] text-amber-200 leading-relaxed">
                                    <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0 text-amber-400" />
                                    <span>{w}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
};


export default BankTipsCard;
