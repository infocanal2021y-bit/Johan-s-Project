import { motion } from 'framer-motion';
import { STATUS_LABELS, BADGE_DEFS, fmtEUR } from './constants';
import { ProgressBar } from './ProgressBar';
import { ActionButtons } from './ActionButtons';

export const MemberCard = ({ member }) => {
    const status = STATUS_LABELS[member.account_status] || STATUS_LABELS.activo;
    const accountId = `LB-${(member.id || '').slice(0, 8).toUpperCase()}`;
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            data-testid={`community-member-${member.id}`}
            data-self={member.is_self ? 'true' : 'false'}
            className={`relative rounded-lg border bg-slate-900/40 transition-colors ${
                member.is_self
                    ? 'border-blue-500/40 ring-1 ring-blue-500/20'
                    : 'border-slate-800 hover:border-slate-700'
            }`}
        >
            {member.is_self && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-lg" />
            )}

            {/* Header row: avatar · name + ID · status pill */}
            <div className="flex items-start justify-between gap-3 p-4 pb-3 border-b border-slate-800/60">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={`w-10 h-10 rounded-md flex items-center justify-center text-sm font-semibold flex-shrink-0 border ${
                        member.is_self ? 'bg-blue-500/10 text-blue-200 border-blue-500/30' : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}>
                        {(member.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-white text-sm font-semibold truncate leading-tight">{member.name}</h3>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                            <span className="inline-flex items-center gap-1">
                                <span className="text-sm leading-none">{member.country_flag}</span>
                                {member.country}
                            </span>
                            <span className="text-slate-700">·</span>
                            <span className="font-mono text-[10px] tracking-wide">{accountId}</span>
                            {member.is_self && (
                                <span className="ml-auto text-[9px] font-medium uppercase tracking-widest text-blue-300">Su cuenta</span>
                            )}
                        </div>
                    </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium tracking-wide border ${status.cls} flex-shrink-0`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                </span>
            </div>

            {/* Financial summary row — banking ledger style */}
            <div className="grid grid-cols-2 divide-x divide-slate-800/60">
                <div className="px-4 py-3">
                    <p className="text-[9px] font-medium uppercase tracking-[0.1em] text-slate-500">Depositado</p>
                    <p className="text-base font-semibold text-white font-mono tabular-nums mt-0.5" data-testid="community-member-deposited">
                        {fmtEUR(member.deposited_eur)}
                    </p>
                </div>
                {member.progress_step >= 5 ? (
                    <div className="px-4 py-3 bg-emerald-500/[0.05]">
                        <p className="text-[9px] font-medium uppercase tracking-[0.1em] text-emerald-300/80">Retirado</p>
                        <p className="text-base font-semibold text-emerald-300 font-mono tabular-nums mt-0.5" data-testid="community-member-withdrawn">
                            {fmtEUR(member.withdrawn_eur)}
                        </p>
                    </div>
                ) : (
                    <div className="px-4 py-3">
                        <p className="text-[9px] font-medium uppercase tracking-[0.1em] text-slate-500">Disponible</p>
                        <p className="text-base font-semibold text-slate-100 font-mono tabular-nums mt-0.5" data-testid="community-member-available">
                            {fmtEUR(member.available_balance_eur)}
                        </p>
                    </div>
                )}
            </div>

            {/* Compliance markers + progress timeline */}
            <div className="px-4 pt-3 pb-4 space-y-3 border-t border-slate-800/60">
                <div className="flex flex-wrap gap-1.5">
                    {member.badges?.length > 0 && member.badges.map(b => {
                        const def = BADGE_DEFS[b];
                        if (!def) return null;
                        const Icon = def.icon;
                        return (
                            <div key={b}
                                data-testid={`community-badge-${b}`}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${def.cls} text-[10px] font-medium tracking-wide`}
                            >
                                <Icon className="w-2.5 h-2.5" />
                                {def.label}
                            </div>
                        );
                    })}
                </div>
                <ProgressBar step={member.progress_step} estado={member.estado_actual} progressPct={member.progress_pct} />
            </div>

            {/* Self-only action buttons (footer) */}
            {member.is_self && (
                <div className="px-4 pb-4">
                    <ActionButtons member={member} />
                </div>
            )}
        </motion.div>
    );
};
