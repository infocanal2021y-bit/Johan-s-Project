import { History } from 'lucide-react';

const DOT = {
    solicitado: 'bg-slate-400',
    en_revision: 'bg-amber-400',
    procesado: 'bg-cyan-400',
    completado: 'bg-emerald-400',
    cancelado: 'bg-red-400',
};

const LABEL = {
    solicitado: 'Solicitado',
    en_revision: 'En revisión',
    procesado: 'Procesado',
    completado: 'Completado',
    cancelado: 'Cancelado',
};

const fmt = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export const WithdrawalHistoryTimeline = ({ history = [], withdrawalId }) => (
    <div className="mt-4" data-testid={`rw-history-${withdrawalId}`}>
        <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500 font-semibold flex items-center gap-1.5">
            <History className="w-3 h-3" /> Historial de cambios
        </p>
        <ol className="mt-2 relative border-l border-slate-800 ml-1.5 space-y-2.5">
            {history.map((h, i) => (
                <li key={`${h.stage}-${h.at}-${i}`} className="pl-4 relative" data-testid={`rw-history-item-${withdrawalId}-${i}`}>
                    <span className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-slate-950 ${DOT[h.stage] || DOT.solicitado}`} />
                    <div className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
                        <span className="text-slate-200 font-semibold">{LABEL[h.stage] || h.stage}</span>
                        <span className="text-slate-500">· {h.actor || 'Sistema'}</span>
                        <span className="text-slate-500 font-mono text-[10px] ml-auto">{fmt(h.at)}</span>
                    </div>
                    {h.reason && <p className="text-[10.5px] text-slate-400 mt-0.5">Motivo: {h.reason}</p>}
                </li>
            ))}
        </ol>
    </div>
);
