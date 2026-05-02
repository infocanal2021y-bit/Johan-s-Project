import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CheckCircle2, ChevronDown, ShieldCheck,
    TrendingDown, TrendingUp,
} from 'lucide-react';
import { fmtEUR, timeAgo, PROGRESS_STAGES, TIMELINE_PALETTE } from './constants';
import { MOCK_WITHDRAWALS, pickNonRepeating } from './mockWithdrawalsData';
import { useT } from '../../i18n/LanguageContext';

// How long each set of 3 cards stays before being swapped out (ms).
const ROTATION_INTERVAL_MS = 12000;
// How many cards are visible at the same time.
const VISIBLE_COUNT = 3;

// Static "all-completed" timeline for verified withdrawals — every stage is
// rendered in BBVA green (#16A34A) since the journey ended successfully.
const StaticTimeline = () => (
    <div className="flex items-center gap-1 mt-3 mb-2">
        {PROGRESS_STAGES.map((s, i) => {
            const Icon = s.icon;
            const isLast = i === PROGRESS_STAGES.length - 1;
            const tier = TIMELINE_PALETTE.allDone;
            return (
                <div key={s.key} className="flex-1 flex items-center gap-1">
                    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center border ${tier.circle}`}>
                            <Icon className={`w-3.5 h-3.5 ${tier.icon}`} />
                        </div>
                        <span className={`text-[8px] font-semibold uppercase tracking-[0.05em] ${tier.label} text-center leading-tight`}>
                            {s.label}
                        </span>
                    </div>
                    {!isLast && (
                        <div className="h-[2px] flex-1 mb-4 rounded-full" style={{ background: tier.line }} />
                    )}
                </div>
            );
        })}
    </div>
);

const ExpandedDetail = ({ item }) => {
    const ratio = item.deposited_eur > 0 ? (item.total_withdrawn_eur / item.deposited_eur) : 0;
    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
        >
            <div className="px-4 pb-4 pt-1 border-t border-[#F1F4F8]">
                {/* ID + país row */}
                <div className="flex items-center justify-between text-[11px] py-3">
                    <div className="flex items-center gap-2">
                        <span className="text-[#6B7280] font-medium">ID</span>
                        <span className="font-mono tabular-nums text-[#111827] font-semibold">{item.user_short_id}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[#6B7280]">
                        <span>{item.country_flag}</span>
                        <span>{item.country}</span>
                    </div>
                </div>

                {/* Amounts grid */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="rounded-lg bg-[#F4F6F8] px-3 py-3">
                        <div className="flex items-center gap-1.5 mb-1">
                            <TrendingDown className="w-3 h-3 text-[#6B7280]" />
                            <p className="text-[9px] uppercase tracking-[0.12em] text-[#6B7280] font-semibold">Depositado</p>
                        </div>
                        <p className="font-mono tabular-nums text-[14px] font-semibold text-[#111827] text-right">
                            {fmtEUR(item.deposited_eur)}
                        </p>
                    </div>
                    <div className="rounded-lg px-3 py-3" style={{ background: 'rgba(22, 163, 74, 0.08)' }}>
                        <div className="flex items-center gap-1.5 mb-1">
                            <TrendingUp className="w-3 h-3 text-[#16A34A]" />
                            <p className="text-[9px] uppercase tracking-[0.12em] text-[#16A34A] font-semibold">Retirado</p>
                        </div>
                        <p className="font-mono tabular-nums text-[14px] font-semibold text-[#16A34A] text-right">
                            {fmtEUR(item.total_withdrawn_eur)}
                        </p>
                    </div>
                </div>

                {/* Static all-completed timeline */}
                <p className="text-[9px] uppercase tracking-[0.14em] text-[#6B7280] font-semibold mb-1">Recorrido del proceso</p>
                <StaticTimeline />

                {/* 100% bar + label */}
                <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                        <span className="text-[#16A34A] font-semibold flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3" />
                            Proceso completado
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-[#16A34A]">100%</span>
                    </div>
                    <div className="mt-1.5 h-[3px] rounded-full bg-[#F1F4F8] overflow-hidden">
                        <div className="h-full" style={{ width: '100%', background: '#16A34A' }} />
                    </div>
                </div>

                {/* ROI hint badge if recovered well */}
                {ratio >= 0.65 && (
                    <div className="mt-3 flex items-center gap-1.5 text-[11px]">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[#16A34A] bg-[#16A34A]/10 border border-[#16A34A]/30 text-[10px] font-semibold">
                            <ShieldCheck className="w-2.5 h-2.5" />
                            Capital recuperado
                        </span>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

const WithdrawalCard = ({ item, expanded, onToggle }) => (
    <motion.div
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="bg-white rounded-[12px] shadow-[0_1px_3px_rgba(7,33,70,0.05),_0_4px_14px_rgba(7,33,70,0.05)] hover:shadow-[0_4px_16px_rgba(7,33,70,0.1)] transition-shadow duration-200 overflow-hidden"
        data-testid={`withdrawal-card-${item.id}`}
        data-expanded={expanded ? 'true' : 'false'}
    >
        <button
            type="button"
            onClick={onToggle}
            className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[#F8FAFB] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A]/30"
        >
            <div className="text-lg leading-none flex-shrink-0">{item.country_flag}</div>
            <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[#111827] font-semibold truncate leading-tight">{item.name_public}</p>
                <p className="text-[11px] text-[#6B7280] mt-0.5">
                    {item.country} · {timeAgo(item.date)}
                </p>
            </div>
            <div className="text-right flex-shrink-0">
                <p className="text-[14px] font-semibold font-mono tabular-nums text-[#111827] leading-tight">
                    {fmtEUR(item.amount_eur)}
                </p>
                <span
                    className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[0.08em]"
                    style={{ background: 'rgba(22, 163, 74, 0.12)', color: '#16A34A' }}
                >
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    {item.status === 'completed' ? 'Retirado' : 'En transferencia'}
                </span>
            </div>
            <ChevronDown
                className={`w-4 h-4 text-[#6B7280] flex-shrink-0 transition-transform duration-200 ${
                    expanded ? 'rotate-180' : ''
                }`}
            />
        </button>
        <AnimatePresence initial={false}>
            {expanded && <ExpandedDetail item={item} />}
        </AnimatePresence>
    </motion.div>
);

export const RecentWithdrawalsFeed = () => {
    const t = useT();
    const [expandedId, setExpandedId] = useState(null);
    const [tick, setTick] = useState(0);

    // Pick 3 non-repeating cards on every tick. We exclude the previous trio
    // so consecutive rotations always show fresh users (no repeat-back-to-back).
    const previousIds = useMemo(() => {
        // Lazily memoised — rebuilt each render but doesn't drive state
        return [];
    }, []);

    const visible = useMemo(() => {
        if (tick === 0) {
            // First paint: show the 3 most-recent verified withdrawals so the
            // user sees real-looking activity immediately.
            return MOCK_WITHDRAWALS.slice(0, VISIBLE_COUNT);
        }
        return pickNonRepeating(MOCK_WITHDRAWALS, VISIBLE_COUNT, previousIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tick]);

    // Auto-rotate every ROTATION_INTERVAL_MS — paused while any card is
    // expanded so the reader keeps full context until they close the detail.
    useEffect(() => {
        if (expandedId) return undefined;
        const id = setInterval(() => setTick((t) => t + 1), ROTATION_INTERVAL_MS);
        return () => clearInterval(id);
    }, [expandedId]);

    const toggle = (id) => setExpandedId((cur) => (cur === id ? null : id));

    return (
        <div
            className="rounded-[14px] bg-white border border-[#E5EAF0] shadow-[0_1px_3px_rgba(7,33,70,0.04),_0_6px_20px_rgba(7,33,70,0.06)]"
            data-testid="community-recent-withdrawals"
        >
            <div className="px-5 py-4 border-b border-[#F1F4F8] flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6B7280] mb-1">
                        {t('Libro de transacciones')}
                    </p>
                    <h3 className="text-[14px] font-semibold text-[#111827]" style={{ fontFamily: 'Poppins' }}>
                        {t('Retiros verificados')}
                    </h3>
                </div>
                <div
                    className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] transition-colors"
                    style={{ color: expandedId ? '#6B7280' : '#16A34A' }}
                    data-testid="recent-withdrawals-live-indicator"
                    data-paused={expandedId ? 'true' : 'false'}
                >
                    <span className="relative flex w-1.5 h-1.5">
                        {!expandedId && (
                            <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: '#16A34A' }} />
                        )}
                        <span
                            className="relative w-1.5 h-1.5 rounded-full"
                            style={{ background: expandedId ? '#9CA3AF' : '#16A34A' }}
                        />
                    </span>
                    {expandedId ? t('En pausa') : t('Live · 12s')}
                </div>
            </div>
            <div className="p-3">
                <div className="space-y-2 min-h-[280px]" data-testid="withdrawals-feed-list">
                    <AnimatePresence mode="popLayout" initial={false}>
                        {visible.map((it) => (
                            <motion.div
                                key={`${tick}-${it.id}`}
                                layout
                                initial={{ opacity: 0, y: 10, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -10, scale: 0.97 }}
                                transition={{ duration: 0.45, ease: 'easeOut' }}
                            >
                                <WithdrawalCard
                                    item={it}
                                    expanded={expandedId === it.id}
                                    onToggle={() => toggle(it.id)}
                                />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};
