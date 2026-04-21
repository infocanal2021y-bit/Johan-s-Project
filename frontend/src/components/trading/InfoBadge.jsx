import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card';
import { HelpCircle, Lightbulb, Info } from 'lucide-react';

/**
 * InfoBadge — tiny help icon that reveals a rich explanation panel on hover.
 *
 * Props:
 *  - title: short label
 *  - what: concise description of "what it is"
 *  - how:  (optional) how to use it
 *  - tip:  (optional) actionable tip / example
 *  - size: 'sm' | 'md' (default 'sm')
 *  - iconColor: tailwind color class (default 'text-[#F0B90B]')
 */
export const InfoBadge = ({ title, what, how, tip, size = 'sm', iconColor = 'text-[#F0B90B]/70', className = '', testId }) => {
    const Icon = HelpCircle;
    const iconSize = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3';
    return (
        <HoverCard openDelay={120} closeDelay={100}>
            <HoverCardTrigger asChild>
                <button
                    type="button"
                    className={`inline-flex items-center justify-center rounded-full hover:bg-[#2b3139] transition-colors p-0.5 ${iconColor} hover:text-[#F0B90B] ${className}`}
                    aria-label={`Info ${title}`}
                    data-testid={testId || 'info-badge'}
                    onClick={(e) => e.stopPropagation()}
                >
                    <Icon className={iconSize} />
                </button>
            </HoverCardTrigger>
            <HoverCardContent
                side="top"
                align="center"
                className="w-72 bg-[#14181d] border-[#2b3139] text-slate-200 p-0 overflow-hidden shadow-2xl shadow-black/60"
            >
                <div className="px-4 py-2.5 bg-gradient-to-r from-[#F0B90B]/10 to-transparent border-b border-[#2b3139] flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-[#F0B90B]/15 flex items-center justify-center flex-shrink-0">
                        <Lightbulb className="w-3 h-3 text-[#F0B90B]" />
                    </div>
                    <p className="text-white font-semibold text-[13px] leading-tight">{title}</p>
                </div>
                <div className="p-4 space-y-2.5 text-[12px] leading-relaxed">
                    {what && (
                        <div>
                            <p className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold mb-1">Que es</p>
                            <p className="text-slate-300">{what}</p>
                        </div>
                    )}
                    {how && (
                        <div>
                            <p className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold mb-1">Como se usa</p>
                            <p className="text-slate-300">{how}</p>
                        </div>
                    )}
                    {tip && (
                        <div className="mt-2 pt-2 border-t border-[#2b3139] flex items-start gap-2">
                            <Info className="w-3 h-3 text-[#22d3ee] mt-0.5 flex-shrink-0" />
                            <p className="text-cyan-300/90 text-[11px] italic">{tip}</p>
                        </div>
                    )}
                </div>
            </HoverCardContent>
        </HoverCard>
    );
};

export default InfoBadge;
