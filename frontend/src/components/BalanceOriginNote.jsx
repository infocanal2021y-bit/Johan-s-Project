import { Info } from 'lucide-react';

const NOTE_TEXT = 'Este saldo corresponde a una acreditación histórica del período 2017–2022, calculada a partir de los registros disponibles y la evolución de los activos asociados, como parte del proceso de actualización y conciliación de saldos.';

export const BalanceOriginNote = ({ className = '', variant = 'dark', compact = false }) => {
    const light = variant === 'light';

    if (compact) {
        return (
            <p
                className={`flex items-start gap-1.5 text-[10px] leading-snug ${light ? 'text-slate-500' : 'text-slate-400'} ${className}`}
                data-testid="balance-origin-note"
            >
                <Info className={`w-3 h-3 mt-px flex-shrink-0 ${light ? 'text-[#1973B8]' : 'text-amber-400'}`} />
                <span><span className="font-semibold">Nota:</span> Acreditación histórica 2017–2022 (proceso de actualización y conciliación de saldos).</span>
            </p>
        );
    }

    return (
        <div
            className={`flex items-start gap-2.5 p-3 rounded-xl border ${light ? 'border-slate-200 bg-slate-50' : 'border-slate-700/60 bg-slate-900/60'} ${className}`}
            data-testid="balance-origin-note"
        >
            <Info className={`w-4 h-4 mt-0.5 flex-shrink-0 ${light ? 'text-[#1973B8]' : 'text-amber-400'}`} />
            <p className={`text-[11.5px] leading-relaxed ${light ? 'text-slate-600' : 'text-slate-400'}`}>
                <span className={`font-semibold ${light ? 'text-slate-800' : 'text-slate-300'}`}>Nota:</span> {NOTE_TEXT}
            </p>
        </div>
    );
};
