import { Clock } from 'lucide-react';
import { PROGRESS_STAGES } from './constants';

export const ProgressBar = ({ step }) => {
    const fullyCompleted = step >= 5;
    const pct = Math.round(((step - 1) / 4) * 100);  // 0/25/50/75/100
    return (
        <div className="space-y-2" data-testid="community-progress-bar" data-fully-completed={fullyCompleted ? 'true' : 'false'}>
            <div className="flex items-center gap-1 mt-4">
                {PROGRESS_STAGES.map((s, i) => {
                    const done = step >= s.key;
                    const current = step === s.key && !fullyCompleted;
                    const Icon = s.icon;
                    const p = s.palette;
                    const nextPalette = PROGRESS_STAGES[i + 1]?.palette;
                    const lineDoneCls = nextPalette?.line || 'bg-slate-700';
                    return (
                        <div key={s.key} className="flex-1 flex items-center gap-1">
                            <div className="flex flex-col items-center gap-1.5 flex-1 relative">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors relative ${
                                    done ? p.doneRing :
                                    current ? p.currentRing :
                                    'bg-slate-900 border-slate-700'
                                }`}>
                                    <Icon className={`w-3 h-3 ${done ? p.doneIcon : current ? p.currentIcon : 'text-slate-600'}`} />
                                    {current && (
                                        <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${p.dot} border border-slate-900 flex items-center justify-center`} title="En proceso">
                                            <Clock className={`w-2 h-2 ${p.clockIconCls} animate-spin`} style={{ animationDuration: '4s' }} />
                                        </span>
                                    )}
                                </div>
                                <span className={`text-[8.5px] font-medium uppercase tracking-[0.08em] ${done ? p.doneLabel : current ? p.currentLabel : 'text-slate-600'}`}>
                                    {s.label}
                                </span>
                            </div>
                            {i < PROGRESS_STAGES.length - 1 && (
                                <div className={`h-px flex-1 mb-4 ${done && step > s.key ? lineDoneCls : 'bg-slate-800'}`} />
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest pt-1">
                <span className={`font-medium ${fullyCompleted ? 'text-emerald-400' : (PROGRESS_STAGES[step - 1]?.palette.currentLabel || 'text-amber-400')} flex items-center gap-1.5`}>
                    {!fullyCompleted && <Clock className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: '4s' }} />}
                    {fullyCompleted ? 'Proceso completado' : `En proceso · ${PROGRESS_STAGES[step - 1]?.label || ''}`}
                </span>
                <span className={`font-mono tabular-nums font-semibold ${fullyCompleted ? 'text-emerald-300' : (PROGRESS_STAGES[step - 1]?.palette.doneIcon || 'text-amber-300')}`}>
                    {pct}%
                </span>
            </div>
        </div>
    );
};
