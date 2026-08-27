import { Info } from 'lucide-react';

export const BalanceOriginNote = ({ className = '' }) => (
    <div
        className={`flex items-start gap-2.5 p-3 rounded-xl border border-slate-700/60 bg-slate-900/60 ${className}`}
        data-testid="balance-origin-note"
    >
        <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
        <p className="text-slate-400 text-[11.5px] leading-relaxed">
            <span className="text-slate-300 font-semibold">Nota:</span> Este saldo corresponde a una acreditación histórica del período 2017–2022, calculada a partir de los registros disponibles y la evolución de los activos asociados, como parte del proceso de actualización y conciliación de saldos.
        </p>
    </div>
);
