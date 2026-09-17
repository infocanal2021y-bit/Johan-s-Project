import { Link } from 'react-router-dom';
import { PhoneCall, ArrowRight } from 'lucide-react';

export const CallbackQuickCard = ({ compact = false }) => {
    if (compact) {
        return (
            <Link to="/solicitar-llamada" data-testid="callback-quick-btn"
                className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-[#1973B8]/15 ring-1 ring-[#1973B8]/40 text-sky-300 hover:bg-[#1973B8]/25 hover:text-white transition-colors text-sm font-semibold">
                <PhoneCall className="w-4 h-4" /> Solicitar llamada
            </Link>
        );
    }
    return (
        <Link to="/solicitar-llamada" data-testid="callback-quick-card"
            className="group flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-[#1973B8]/20 via-slate-900/70 to-slate-900/70 border border-[#1973B8]/30 hover:border-[#1973B8]/60 transition-colors p-4">
            <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-[#1973B8]/20 ring-1 ring-[#1973B8]/40 flex items-center justify-center flex-shrink-0">
                    <PhoneCall className="w-5 h-5 text-sky-300" />
                </div>
                <div className="min-w-0">
                    <p className="text-white text-sm font-bold">¿Prefiere que le llamemos?</p>
                    <p className="text-slate-400 text-xs truncate">Programe una cita y un agente le llamará · L-V 09:00–18:00 (España)</p>
                </div>
            </div>
            <ArrowRight className="w-4 h-4 text-sky-300 group-hover:translate-x-1 transition-transform flex-shrink-0" />
        </Link>
    );
};
