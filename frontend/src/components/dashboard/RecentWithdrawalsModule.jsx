import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../../lib/api';
import { Banknote, ChevronRight, MessageCircleQuestion } from 'lucide-react';
import { timeAgo } from '../community/constants';

const fmtMoney = (n, cur) => cur === 'USD'
    ? `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : `€${(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;

const STAGE_LABEL = {
    solicitado: ['Solicitado', 'text-slate-400 bg-slate-500/15'],
    en_revision: ['En revisión', 'text-amber-300 bg-amber-500/15'],
    procesado: ['Procesado', 'text-cyan-300 bg-cyan-500/15'],
    completado: ['Completado', 'text-emerald-300 bg-emerald-500/15'],
};

export const RecentWithdrawalsModule = () => {
    const navigate = useNavigate();
    const [data, setData] = useState(null);

    useEffect(() => {
        api.get('/community/recent-withdrawals/detailed', { params: { limit: 4 } })
            .then((r) => setData(r.data))
            .catch(() => {});
    }, []);

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <button type="button"
                onClick={() => navigate('/retiros-recientes')}
                className="w-full text-left rounded-xl bg-slate-900/70 border border-slate-800 hover:border-emerald-500/40 transition-colors overflow-hidden group"
                data-testid="recent-withdrawals-module">
                <div className="px-5 py-4 flex items-center justify-between border-b border-slate-800/70">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
                            <Banknote className="w-4.5 h-4.5 text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-white text-[15px] font-semibold">Retiros Recientes</p>
                            <p className="text-slate-500 text-[11px]">Actividad verificada · Preguntas y respuestas</p>
                        </div>
                    </div>
                    <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold group-hover:gap-2 transition-all">
                        Ver todos <ChevronRight className="w-4 h-4" />
                    </span>
                </div>
                <div className="divide-y divide-slate-800/60">
                    {(data?.items || []).slice(0, 4).map((it) => {
                        const [label, cls] = STAGE_LABEL[it.stage] || STAGE_LABEL.solicitado;
                        return (
                            <div key={it.withdrawal_id} className="px-5 py-2.5 flex items-center gap-3" data-testid={`rw-module-row-${it.withdrawal_id}`}>
                                <span className="text-base leading-none">{it.country_flag}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[12.5px] text-slate-200 font-medium truncate">{it.name_public}</p>
                                    <p className="text-[10.5px] text-slate-500">{it.country} · {timeAgo(it.date)}</p>
                                </div>
                                {it.questions_count > 0 && (
                                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                                        <MessageCircleQuestion className="w-3 h-3" />{it.questions_count}
                                    </span>
                                )}
                                <div className="text-right">
                                    <p className="text-[12.5px] font-mono font-semibold text-white">{fmtMoney(it.amount, it.currency)}</p>
                                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${cls}`}>{label}</span>
                                </div>
                            </div>
                        );
                    })}
                    {!data && (
                        <div className="px-5 py-4 text-slate-600 text-xs">Cargando actividad...</div>
                    )}
                </div>
            </button>
        </motion.div>
    );
};
