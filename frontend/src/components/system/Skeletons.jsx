/**
 * Professional skeleton loader components with shimmer animation.
 * Use these instead of generic spinners while initial data loads.
 */

const shimmer = `
    relative overflow-hidden
    before:absolute before:inset-0
    before:bg-gradient-to-r
    before:from-transparent before:via-white/5 before:to-transparent
    before:-translate-x-full before:animate-[shimmer_1.6s_infinite]
`;

export const SkeletonLine = ({ className = '', width = 'w-full' }) => (
    <div className={`h-3 rounded bg-slate-800/80 ${shimmer} ${width} ${className}`} />
);

export const SkeletonCard = ({ rows = 3, className = '' }) => (
    <div className={`p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-3 ${className}`}>
        <SkeletonLine width="w-1/3" />
        {Array.from({ length: rows }).map((_, i) => (
            <SkeletonLine key={i} width={i === rows - 1 ? 'w-2/3' : 'w-full'} />
        ))}
    </div>
);

export const SkeletonStat = () => (
    <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2">
        <SkeletonLine width="w-1/2" className="h-2" />
        <SkeletonLine width="w-3/4" className="h-6" />
        <SkeletonLine width="w-1/3" className="h-2" />
    </div>
);

export const SkeletonTableRow = ({ cols = 5 }) => (
    <div className="flex items-center gap-3 p-3 border-b border-slate-800/50">
        {Array.from({ length: cols }).map((_, i) => (
            <SkeletonLine key={i} width={i === 0 ? 'w-32' : 'flex-1'} />
        ))}
    </div>
);

export const SkeletonTable = ({ rows = 6, cols = 5 }) => (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-3 p-3 border-b border-slate-700">
            {Array.from({ length: cols }).map((_, i) => (
                <SkeletonLine key={i} width={i === 0 ? 'w-32' : 'flex-1'} className="h-2 bg-slate-700/80" />
            ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} cols={cols} />
        ))}
    </div>
);

export default SkeletonCard;
