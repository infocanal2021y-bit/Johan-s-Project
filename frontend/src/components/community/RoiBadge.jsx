import { TrendingUp, CheckCircle2 } from 'lucide-react';

// ROI badge for completed profiles only
export const RoiBadge = ({ deposited, withdrawn }) => {
    if (!deposited || !withdrawn) return null;
    const ratio = withdrawn / deposited;
    if (ratio >= 1.05) {
        const pct = Math.round((ratio - 1) * 100);
        return (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-emerald-500/40 text-emerald-300 bg-emerald-500/[0.07] text-[10px] font-medium tracking-wide" data-testid="community-roi-badge">
                <TrendingUp className="w-2.5 h-2.5" />
                ROI +{pct}%
            </div>
        );
    }
    if (ratio >= 0.65) {
        return (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-emerald-500/40 text-emerald-300 bg-emerald-500/[0.07] text-[10px] font-medium tracking-wide" data-testid="community-roi-badge">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Capital recuperado
            </div>
        );
    }
    return null;
};
