import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, TrendingDown, TrendingUp } from 'lucide-react';
import { STATUS_LABELS, BADGE_DEFS, fmtEUR } from './constants';
import { ProgressBar } from './ProgressBar';
import { ActionButtons } from './ActionButtons';

// =============================================================================
// MemberCard — BBVA Premium Banking expandable account card
// =============================================================================
// Closed:   header row (avatar · name+ID · status pill · amount · chevron)
// Expanded: ID + país, depositado / retirado grid, full timeline, progress %,
//           compliance badges and self-only action buttons.
// =============================================================================
export const MemberCard = ({ member }) => {
    const [expanded, setExpanded] = useState(false);
    const status = STATUS_LABELS[member.account_status] || STATUS_LABELS.activo;
    const accountId = `LB-${(member.id || '').slice(0, 8).toUpperCase()}`;
    const completed = member.progress_step >= 5
        || member.estado_actual === 'retirado'
        || member.estado_actual === 'completado';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            data-testid={`community-member-${member.id}`}
            data-self={member.is_self ? 'true' : 'false'}
            data-expanded={expanded ? 'true' : 'false'}
            className={`relative bg-white rounded-[14px] overflow-hidden transition-all duration-200
                        shadow-[0_1px_3px_rgba(7,33,70,0.05),_0_4px_14px_rgba(7,33,70,0.05)]
                        hover:shadow-[0_4px_18px_rgba(7,33,70,0.1)] hover:-translate-y-[1px]
                        ${member.is_self ? 'ring-2 ring-[#1E3A8A]/20' : ''}`}
        >
            {/* Self-account accent strip */}
            {member.is_self && (
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#1E3A8A]" />
            )}

            {/* === Click target: header row === */}
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="w-full text-left px-4 py-3.5 flex items-center gap-3
                           hover:bg-[#F8FAFB] transition-colors duration-150
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A]/30"
            >
                {/* Avatar — initial */}
                <div
                    className={`w-10 h-10 rounded-[10px] flex items-center justify-center text-sm font-semibold flex-shrink-0 border
                        ${member.is_self
                            ? 'bg-[#1E3A8A]/10 text-[#1E3A8A] border-[#1E3A8A]/30'
                            : 'bg-[#F4F6F8] text-[#6B7280] border-[#E5EAF0]'}`}
                >
                    {(member.name || '?').charAt(0).toUpperCase()}
                </div>

                {/* Name + meta */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="text-[#111827] text-[14px] font-semibold truncate leading-tight">
                            {member.name}
                        </h3>
                        {member.is_self && (
                            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#1E3A8A] px-1.5 py-0.5 rounded bg-[#1E3A8A]/10">
                                Tú
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#6B7280]">
                        <span className="inline-flex items-center gap-1">
                            <span className="text-sm leading-none">{member.country_flag}</span>
                            {member.country}
                        </span>
                        <span className="text-[#C8D3DE]">·</span>
                        <span className="font-mono text-[10px] tabular-nums text-[#6B7280]">{accountId}</span>
                    </div>
                </div>

                {/* Right side: amount summary + status pill */}
                <div className="text-right flex-shrink-0 hidden sm:block">
                    {completed ? (
                        <p className="text-[14px] font-semibold font-mono tabular-nums text-[#16A34A] leading-tight" data-testid="community-member-withdrawn">
                            {fmtEUR(member.withdrawn_eur)}
                        </p>
                    ) : (
                        <p className="text-[14px] font-semibold font-mono tabular-nums text-[#111827] leading-tight" data-testid="community-member-available">
                            {fmtEUR(member.available_balance_eur)}
                        </p>
                    )}
                    <span
                        className={`inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-[0.08em] border ${status.cls}`}
                    >
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                    </span>
                </div>

                <ChevronDown
                    className={`w-4 h-4 text-[#6B7280] flex-shrink-0 transition-transform duration-200 ${
                        expanded ? 'rotate-180' : ''
                    }`}
                />
            </button>

            {/* === Mobile-only summary row (sm:hidden) — keeps closed card readable on small screens */}
            <div className="sm:hidden px-4 pb-3 -mt-1 flex items-center justify-between">
                <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-[0.08em] border ${status.cls}`}
                >
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                </span>
                <p className={`text-[13px] font-semibold font-mono tabular-nums leading-tight ${
                    completed ? 'text-[#16A34A]' : 'text-[#111827]'
                }`}>
                    {fmtEUR(completed ? member.withdrawn_eur : member.available_balance_eur)}
                </p>
            </div>

            {/* === Expanded detail === */}
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        className="overflow-hidden border-t border-[#F1F4F8]"
                    >
                        <div className="px-4 pt-3 pb-4">
                            {/* ID + country row */}
                            <div className="flex items-center justify-between text-[11px] mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-[#6B7280] font-medium uppercase tracking-[0.12em] text-[9px]">ID Cuenta</span>
                                    <span className="font-mono tabular-nums text-[#111827] font-semibold">{accountId}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[#6B7280]">
                                    <span className="text-sm leading-none">{member.country_flag}</span>
                                    <span>{member.country}</span>
                                </div>
                            </div>

                            {/* Amounts grid — banking ledger */}
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="rounded-lg bg-[#F4F6F8] px-3 py-3">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <TrendingDown className="w-3 h-3 text-[#6B7280]" />
                                        <p className="text-[9px] uppercase tracking-[0.12em] text-[#6B7280] font-semibold">Depositado</p>
                                    </div>
                                    <p
                                        className="font-mono tabular-nums text-[15px] font-semibold text-[#111827] text-right"
                                        data-testid="community-member-deposited"
                                    >
                                        {fmtEUR(member.deposited_eur)}
                                    </p>
                                </div>
                                <div className="rounded-lg px-3 py-3" style={{ background: 'rgba(22, 163, 74, 0.08)' }}>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <TrendingUp className="w-3 h-3 text-[#16A34A]" />
                                        <p className="text-[9px] uppercase tracking-[0.12em] text-[#16A34A] font-semibold">
                                            {completed ? 'Retirado' : 'Disponible'}
                                        </p>
                                    </div>
                                    <p className="font-mono tabular-nums text-[15px] font-semibold text-[#16A34A] text-right">
                                        {fmtEUR(completed ? member.withdrawn_eur : member.available_balance_eur)}
                                    </p>
                                </div>
                            </div>

                            {/* Compliance markers */}
                            {member.badges?.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    {member.badges.map((b) => {
                                        const def = BADGE_DEFS[b];
                                        if (!def) return null;
                                        const Icon = def.icon;
                                        return (
                                            <div
                                                key={b}
                                                data-testid={`community-badge-${b}`}
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${def.cls} text-[10px] font-semibold tracking-wide`}
                                            >
                                                <Icon className="w-2.5 h-2.5" />
                                                {def.label}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Process timeline */}
                            <p className="text-[9px] uppercase tracking-[0.14em] text-[#6B7280] font-semibold mb-1">
                                Recorrido del proceso
                            </p>
                            <ProgressBar
                                step={member.progress_step}
                                estado={member.estado_actual}
                                progressPct={member.progress_pct}
                            />

                            {/* Self-only action buttons */}
                            {member.is_self && (
                                <div className="mt-4 pt-3 border-t border-[#F1F4F8]">
                                    <ActionButtons member={member} />
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
