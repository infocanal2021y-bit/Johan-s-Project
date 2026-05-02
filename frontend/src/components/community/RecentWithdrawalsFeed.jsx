import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Sparkles, CheckCircle2, ChevronDown, ShieldCheck, Receipt,
    FileCheck, Truck, Trophy, TrendingDown, TrendingUp,
} from 'lucide-react';
import { fmtEUR, timeAgo, PROGRESS_STAGES } from './constants';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const StaticTimeline = () => (
    <div className="flex items-center gap-1 mt-3 mb-2">
        {PROGRESS_STAGES.map((s, i) => {
            const Icon = s.icon;
            const p = s.palette;
            const isLast = i === PROGRESS_STAGES.length - 1;
            return (
                <div key={s.key} className="flex-1 flex items-center gap-1">
                    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center border ${p.doneRing}`}>
                            <Icon className={`w-3.5 h-3.5 ${p.doneIcon}`} />
                        </div>
                        <span className={`text-[8px] font-semibold uppercase tracking-[0.05em] ${p.doneLabel} text-center leading-tight`}>
                            {s.label}
                        </span>
                    </div>
                    {!isLast && (
                        <div className={`h-[2px] flex-1 mb-4 rounded-full`} style={{ background: 'rgba(22, 163, 74, 0.6)' }} />
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
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [highlightIdx, setHighlightIdx] = useState(0);  // rotating live highlight

    const fetchFeed = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const r = await fetch(`${API_URL}/api/community/recent-withdrawals?limit=14`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await r.json();
            setItems(d.items || []);
        } catch (e) { /* silent */ }
        finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFeed();
        const id = setInterval(fetchFeed, 30000);
        return () => clearInterval(id);
    }, [fetchFeed]);

    // Live rotation highlight every 12s — calls attention to a different
    // card without re-fetching.
    useEffect(() => {
        if (items.length <= 1) return;
        const id = setInterval(() => {
            setHighlightIdx((prev) => (prev + 1) % items.length);
        }, 12000);
        return () => clearInterval(id);
    }, [items.length]);

    const toggle = (id) => setExpandedId((cur) => (cur === id ? null : id));

    return (
        <div
            className="rounded-[14px] bg-white border border-[#E5EAF0] shadow-[0_1px_3px_rgba(7,33,70,0.04),_0_6px_20px_rgba(7,33,70,0.06)]"
            data-testid="community-recent-withdrawals"
        >
            <div className="px-5 py-4 border-b border-[#F1F4F8] flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6B7280] mb-1">
                        Libro de transacciones
                    </p>
                    <h3 className="text-[14px] font-semibold text-[#111827]" style={{ fontFamily: 'Poppins' }}>
                        Retiros verificados
                    </h3>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: '#16A34A' }}>
                    <span className="relative flex w-1.5 h-1.5">
                        <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: '#16A34A' }} />
                        <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: '#16A34A' }} />
                    </span>
                    Live · 12s
                </div>
            </div>
            <div className="p-3">
                {loading ? (
                    <div className="space-y-2">
                        {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-[#F4F6F8] rounded-[12px] animate-pulse" />)}
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-10 text-[#6B7280] text-xs">
                        <Sparkles className="w-5 h-5 mx-auto mb-2 text-[#C8D3DE]" />
                        Sin retiros verificados aún.<br />
                        <span className="text-[11px] text-[#8A95A5]">El libro se actualizará en cuanto haya transacciones completadas.</span>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1" data-testid="withdrawals-feed-list">
                        <AnimatePresence>
                            {items.map((it, idx) => (
                                <div
                                    key={it.id}
                                    className={`transition-all duration-300 ${
                                        idx === highlightIdx && expandedId !== it.id
                                            ? 'ring-1 ring-[#16A34A]/30 rounded-[12px] scale-[1.005]'
                                            : ''
                                    }`}
                                >
                                    <WithdrawalCard
                                        item={it}
                                        expanded={expandedId === it.id}
                                        onToggle={() => toggle(it.id)}
                                    />
                                </div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    );
};
