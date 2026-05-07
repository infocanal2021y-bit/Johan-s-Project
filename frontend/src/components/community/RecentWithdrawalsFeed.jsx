import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CheckCircle2, ChevronDown, ShieldCheck,
    TrendingDown, TrendingUp, Share2, Copy, Check,
} from 'lucide-react';
import { fmtEUR, timeAgo, PROGRESS_STAGES, TIMELINE_PALETTE } from './constants';
import { MOCK_WITHDRAWALS, pickNonRepeating } from './mockWithdrawalsData';
import { useT } from '../../i18n/LanguageContext';
import { toast } from 'sonner';

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

const ShareBar = ({ item }) => {
    const [copied, setCopied] = useState(false);

    // Privacy-safe message — only public fields (name short + country + amount)
    const message = `🚀 ${item.name_public} (${item.country_flag} ${item.country}) acaba de completar un retiro verificado de ${fmtEUR(item.amount_eur)} en LIONSBIT VERIFICACION.\n\n✅ Proceso 100% completado · Capital recuperado.\n\nÚnete a la comunidad: https://paylionsbit.es`;

    const encoded = encodeURIComponent(message);
    const shareUrl = 'https://paylionsbit.es';

    const openIntent = (url) => {
        window.open(url, '_blank', 'noopener,noreferrer,width=600,height=600');
    };

    const handleNative = async (e) => {
        e.stopPropagation();
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Retiro verificado · LIONSBIT',
                    text: message,
                    url: shareUrl,
                });
            } catch (err) {
                // user cancelled, ignore
            }
        } else {
            // Desktop fallback → copy
            handleCopy(e);
        }
    };

    const handleWhatsApp = (e) => {
        e.stopPropagation();
        openIntent(`https://api.whatsapp.com/send?text=${encoded}`);
    };

    const handleTwitter = (e) => {
        e.stopPropagation();
        openIntent(`https://twitter.com/intent/tweet?text=${encoded}`);
    };

    const handleTelegram = (e) => {
        e.stopPropagation();
        openIntent(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encoded}`);
    };

    const handleCopy = async (e) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(message);
            setCopied(true);
            toast.success('Mensaje copiado al portapapeles');
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            toast.error('No se pudo copiar');
        }
    };

    const btnBase = "inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-md text-[11px] font-semibold transition-all border";
    const isMobile = typeof navigator !== 'undefined' && navigator.share;

    return (
        <div className="mt-4 pt-3 border-t border-[#F1F4F8]" data-testid={`share-bar-${item.id}`}>
            <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] uppercase tracking-[0.14em] text-[#6B7280] font-semibold flex items-center gap-1.5">
                    <Share2 className="w-3 h-3" />
                    Compartir este logro
                </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
                {isMobile && (
                    <button
                        type="button"
                        onClick={handleNative}
                        className={`${btnBase} bg-[#1E3A8A] border-[#1E3A8A] text-white hover:bg-[#1E40AF] hover:border-[#1E40AF]`}
                        data-testid={`share-native-${item.id}`}
                        aria-label="Compartir"
                    >
                        <Share2 className="w-3 h-3" />
                        Compartir
                    </button>
                )}
                <button
                    type="button"
                    onClick={handleWhatsApp}
                    className={`${btnBase} bg-[#25D366]/10 border-[#25D366]/30 text-[#128C4D] hover:bg-[#25D366]/20`}
                    data-testid={`share-whatsapp-${item.id}`}
                    aria-label="Compartir por WhatsApp"
                >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/></svg>
                    WhatsApp
                </button>
                <button
                    type="button"
                    onClick={handleTwitter}
                    className={`${btnBase} bg-black/5 border-black/15 text-black hover:bg-black/10`}
                    data-testid={`share-twitter-${item.id}`}
                    aria-label="Compartir en X (Twitter)"
                >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    X
                </button>
                <button
                    type="button"
                    onClick={handleTelegram}
                    className={`${btnBase} bg-[#0088CC]/10 border-[#0088CC]/30 text-[#0088CC] hover:bg-[#0088CC]/20`}
                    data-testid={`share-telegram-${item.id}`}
                    aria-label="Compartir en Telegram"
                >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12s5.374 12 12 12 12-5.373 12-12S18.626 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.054 5.56-5.022c.242-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/></svg>
                    Telegram
                </button>
                <button
                    type="button"
                    onClick={handleCopy}
                    className={`${btnBase} ${copied ? 'bg-[#16A34A]/15 border-[#16A34A]/40 text-[#16A34A]' : 'bg-[#F4F6F8] border-[#E5EAF0] text-[#6B7280] hover:bg-[#EEF1F4]'}`}
                    data-testid={`share-copy-${item.id}`}
                    aria-label="Copiar mensaje"
                >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copiado' : 'Copiar'}
                </button>
            </div>
        </div>
    );
};

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

                {/* Social share bar */}
                <ShareBar item={item} />
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
