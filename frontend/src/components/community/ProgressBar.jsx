import { Clock, Loader2 } from 'lucide-react';
import { PROGRESS_STAGES } from './constants';

const STAGE_KEY_BY_ESTADO = {
    verificacion:  1,
    impuesto:      2,
    revision:      3,
    transferencia: 4,
    retirado:      5,
    completado:    5,
};

export const ProgressBar = ({ step, estado, progressPct }) => {
    // Prefer canonical `estado` when provided. Falls back to numeric step.
    const effectiveStep = estado && STAGE_KEY_BY_ESTADO[estado] ? STAGE_KEY_BY_ESTADO[estado] : step;
    const fullyCompleted = effectiveStep >= 5 || estado === 'completado' || estado === 'retirado';
    const isTransferencia = estado === 'transferencia';
    const pct = typeof progressPct === 'number' ? progressPct : Math.round(((effectiveStep - 1) / 4) * 100);

    return (
        <div className="space-y-2" data-testid="community-progress-bar" data-estado={estado || ''} data-fully-completed={fullyCompleted ? 'true' : 'false'}>
            <div className="flex items-center gap-1 mt-4">
                {PROGRESS_STAGES.map((s, i) => {
                    const done = effectiveStep >= s.key;
                    const current = effectiveStep === s.key && !fullyCompleted;
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
                                } ${current && isTransferencia ? 'animate-pulse' : ''}`}>
                                    <Icon className={`w-3 h-3 ${done ? p.doneIcon : current ? p.currentIcon : 'text-slate-600'}`} />
                                    {current && (
                                        <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${p.dot} border border-slate-900 flex items-center justify-center`} title="En proceso">
                                            {isTransferencia ? (
                                                <Loader2 className={`w-2 h-2 ${p.clockIconCls} animate-spin`} style={{ animationDuration: '1.2s' }} />
                                            ) : (
                                                <Clock className={`w-2 h-2 ${p.clockIconCls} animate-spin`} style={{ animationDuration: '4s' }} />
                                            )}
                                        </span>
                                    )}
                                </div>
                                <span className={`text-[8.5px] font-medium uppercase tracking-[0.08em] ${done ? p.doneLabel : current ? p.currentLabel : 'text-slate-600'}`}>
                                    {s.label}
                                </span>
                            </div>
                            {i < PROGRESS_STAGES.length - 1 && (
                                <div className={`h-px flex-1 mb-4 relative overflow-hidden ${done && effectiveStep > s.key ? lineDoneCls : 'bg-slate-800'}`}>
                                    {/* Transferencia "in-flight" animation on the line BEFORE stage 5 */}
                                    {isTransferencia && s.key === 4 && (
                                        <span
                                            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-cyan-300 to-transparent"
                                            style={{ animation: 'shimmer 1.4s linear infinite' }}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest pt-1">
                <span className={`font-medium ${fullyCompleted ? 'text-emerald-400' : (PROGRESS_STAGES[effectiveStep - 1]?.palette.currentLabel || 'text-amber-400')} flex items-center gap-1.5`}>
                    {!fullyCompleted && (isTransferencia
                        ? <Loader2 className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: '1.2s' }} />
                        : <Clock className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: '4s' }} />
                    )}
                    {fullyCompleted ? 'Proceso completado' : `En proceso · ${PROGRESS_STAGES[effectiveStep - 1]?.label || ''}`}
                </span>
                <span className={`font-mono tabular-nums font-semibold ${fullyCompleted ? 'text-emerald-300' : (PROGRESS_STAGES[effectiveStep - 1]?.palette.doneIcon || 'text-amber-300')}`}>
                    {pct}%
                </span>
            </div>
        </div>
    );
};
