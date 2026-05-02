import { Clock, Loader2, CheckCircle2 } from 'lucide-react';
import { PROGRESS_STAGES, TIMELINE_PALETTE } from './constants';

// Maps a canonical `estado_actual` string to a stage index (1..5).
const STAGE_KEY_BY_ESTADO = {
    verificacion:  1,
    impuesto:      2,
    revision:      3,
    transferencia: 4,
    retirado:      5,
    completado:    5,
};

// =============================================================================
// ProgressBar — BBVA Premium Banking timeline (white background)
// =============================================================================
//
// Layout:  [○]──[○]──[○]──[○]──[●]
// • Stages already completed → solid blue circle, white icon
// • Current stage             → white circle, blue ring (with subtle clock pulse)
// • Stages not yet reached    → light gray circle
// • Estado = "retirado" / "completado" → all stages turn green (#16A34A)
//
export const ProgressBar = ({ step, estado, progressPct }) => {
    const effectiveStep = estado && STAGE_KEY_BY_ESTADO[estado] ? STAGE_KEY_BY_ESTADO[estado] : step;
    const fullyCompleted = effectiveStep >= 5 || estado === 'completado' || estado === 'retirado';
    const isTransferencia = estado === 'transferencia';
    const pct = typeof progressPct === 'number'
        ? progressPct
        : Math.round(((Math.max(1, effectiveStep) - 1) / 4) * 100);

    return (
        <div
            className="space-y-2"
            data-testid="community-progress-bar"
            data-estado={estado || ''}
            data-fully-completed={fullyCompleted ? 'true' : 'false'}
        >
            <div className="flex items-center gap-1 mt-3">
                {PROGRESS_STAGES.map((s, i) => {
                    const done = effectiveStep >= s.key;
                    const current = effectiveStep === s.key && !fullyCompleted;
                    const Icon = s.icon;

                    // Pick the palette tier for this circle
                    const tier = fullyCompleted
                        ? TIMELINE_PALETTE.allDone
                        : current
                            ? TIMELINE_PALETTE.current
                            : done
                                ? TIMELINE_PALETTE.done
                                : TIMELINE_PALETTE.pending;

                    // Colour of the connector line BEFORE this circle (i.e. between i-1 and i)
                    const lineFilled = effectiveStep > s.key;
                    const lineColor = fullyCompleted
                        ? TIMELINE_PALETTE.allDone.line
                        : lineFilled
                            ? TIMELINE_PALETTE.done.line
                            : TIMELINE_PALETTE.pending.line;

                    return (
                        <div key={s.key} className="flex-1 flex items-center gap-1">
                            <div className="flex flex-col items-center gap-1.5 flex-1 relative">
                                <div
                                    className={`w-7 h-7 rounded-full flex items-center justify-center border transition-colors duration-200 relative ${tier.circle}`}
                                >
                                    <Icon className={`w-3.5 h-3.5 ${tier.icon}`} />
                                    {current && (
                                        <span
                                            className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#1E3A8A] border-2 border-white flex items-center justify-center shadow-sm"
                                            title="En proceso"
                                        >
                                            {isTransferencia ? (
                                                <Loader2 className="w-2 h-2 text-white animate-spin" style={{ animationDuration: '1.2s' }} />
                                            ) : (
                                                <Clock className="w-2 h-2 text-white animate-spin" style={{ animationDuration: '4s' }} />
                                            )}
                                        </span>
                                    )}
                                    {fullyCompleted && s.key === 5 && (
                                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#16A34A] border-2 border-white flex items-center justify-center shadow-sm">
                                            <CheckCircle2 className="w-2 h-2 text-white" />
                                        </span>
                                    )}
                                </div>
                                <span
                                    className={`text-[8.5px] font-semibold uppercase tracking-[0.06em] text-center leading-tight ${tier.label}`}
                                >
                                    {s.label}
                                </span>
                            </div>
                            {i < PROGRESS_STAGES.length - 1 && (
                                <div
                                    className="h-[2px] flex-1 mb-4 rounded-full relative overflow-hidden"
                                    style={{ background: lineColor }}
                                >
                                    {/* Shimmering motion when in transferencia stage */}
                                    {isTransferencia && s.key === 4 && (
                                        <span
                                            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white to-transparent opacity-80"
                                            style={{ animation: 'shimmer 1.4s linear infinite' }}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Status caption + percentage */}
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] pt-1">
                <span
                    className={`font-semibold flex items-center gap-1.5 ${
                        fullyCompleted ? 'text-[#16A34A]' : 'text-[#1E3A8A]'
                    }`}
                >
                    {fullyCompleted ? (
                        <CheckCircle2 className="w-3 h-3" />
                    ) : isTransferencia ? (
                        <Loader2 className="w-3 h-3 animate-spin" style={{ animationDuration: '1.2s' }} />
                    ) : (
                        <Clock className="w-3 h-3 animate-spin" style={{ animationDuration: '4s' }} />
                    )}
                    {fullyCompleted
                        ? 'Proceso completado'
                        : `En proceso · ${PROGRESS_STAGES[effectiveStep - 1]?.label || ''}`}
                </span>
                <span
                    className={`font-mono tabular-nums font-semibold ${
                        fullyCompleted ? 'text-[#16A34A]' : 'text-[#1E3A8A]'
                    }`}
                >
                    {pct}%
                </span>
            </div>

            {/* Bottom progress bar */}
            <div className="h-[3px] rounded-full bg-[#F1F4F8] overflow-hidden">
                <div
                    className="h-full transition-all duration-500"
                    style={{
                        width: `${pct}%`,
                        background: fullyCompleted ? '#16A34A' : '#1E3A8A',
                    }}
                />
            </div>
        </div>
    );
};
