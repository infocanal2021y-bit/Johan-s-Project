import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Receipt } from 'lucide-react';
import { fmtEUR } from './constants';
import { useUserActivity } from '../../hooks/useUserActivity';

// =============================================================================
// LiveWithdrawalNotifier — ADAPTIVE notification system.
// =============================================================================
//
// The schedule + content of every toast is computed from THREE signals:
//
//   1. Daily budget (max 4/day, persisted in localStorage)
//   2. User activity     — useUserActivity hook (active/idle by interaction)
//   3. User community state — fetched from /community/self at mount
//
// Adaptation rules:
//
//   • Active user, normal state    → spec interval 4-6h, neutral copy
//   • Idle user (no interaction)   → ramp UP frequency to 60-120s, urgency copy
//   • User in `impuesto` state     → bias 100% to €4.850 events ("acaba de
//                                     pagar el impuesto"), faster cadence,
//                                     extra emphasis to nudge them to convert
//   • User retirado/completado     → slow DOWN to 6-10h, celebratory copy
//
// =============================================================================

const STORAGE_KEY = 'lionsbit:mock-withdrawal-state';
const MAX_PER_DAY = 4;

const todayKey = () => new Date().toISOString().slice(0, 10);

const NAMES = [
    'Eduardo C.', 'Joaquín H.', 'Ramón F.', 'Gonzalo N.', 'Hugo M.', 'Enrique C.',
    'Óscar D.', 'Vicente R.', 'Orlando P.', 'Leonardo P.', 'Carlos M.', 'Luis G.',
    'Miguel R.', 'José T.', 'Antonio B.', 'Pedro L.', 'Francisco D.', 'Daniel S.',
    'Javier F.', 'Alejandro C.', 'Sergio M.', 'David P.', 'Rubén H.', 'Iván V.',
];

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const loadState = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
};
const saveState = (s) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) { /* silent */ }
};

// Translate the 3 signals into (delayMs, eventBracket, variant)
const computeNextDelayMs = ({ isActive, estadoActual }) => {
    // Highest-priority special states
    if (estadoActual === 'impuesto') {
        // Heavy nudge — user has a tax pending. Show similar events fast.
        return randInt(45, 90) * 1000;
    }
    if (estadoActual === 'retirado' || estadoActual === 'completado') {
        // User already finished — slow cadence, only celebratory pings
        return randInt(6, 10) * 60 * 60 * 1000;
    }
    if (!isActive) {
        // Tab hidden / no interaction — ramp UP frequency
        return randInt(60, 120) * 1000;
    }
    // Default spec: 4-6 hours
    return randInt(4 * 60 * 60 * 1000, 6 * 60 * 60 * 1000);
};

const pickBracket = ({ estadoActual, count }) => {
    // Impuesto → 100% €4.850 (peer-pressure: "others paying their tax")
    if (estadoActual === 'impuesto') return 4850;
    // Default — alternate 2x4850 + 2x2660 over 4 daily firings
    return [4850, 4850, 2660, 2660][count % 4];
};

const buildToastCopy = ({ name, amount, tax, estadoActual, isActive }) => {
    if (estadoActual === 'impuesto') {
        return {
            badge: 'Impuesto pagado · Como tú',
            badgeColor: '#B45309',
            badgeBg: '#F59E0B',
            iconBg: '#F59E0B',
            iconColor: '#FFFFFF',
            icon: Receipt,
            title: `${name} · 🇪🇸 España`,
            line1: 'Acaba de completar el pago del impuesto.',
            line2Strong: fmtEUR(amount),
            line2Suffix: ` · Retirado · hace unos segundos`,
        };
    }
    if (!isActive) {
        return {
            badge: 'Actividad en vivo',
            badgeColor: '#1E3A8A',
            badgeBg: '#1E3A8A',
            iconBg: '#1E3A8A',
            iconColor: '#FFFFFF',
            icon: CheckCircle2,
            title: `${name} · 🇪🇸 España`,
            line1: `Realizó un retiro de`,
            line2Strong: fmtEUR(amount),
            line2Suffix: ` · Impuesto ${fmtEUR(tax)}`,
        };
    }
    return {
        badge: 'Retiro verificado',
        badgeColor: '#16A34A',
        badgeBg: '#16A34A',
        iconBg: '#16A34A',
        iconColor: '#FFFFFF',
        icon: CheckCircle2,
        title: `${name} · 🇪🇸 España`,
        line1: 'Realizó un retiro de',
        line2Strong: fmtEUR(amount),
        line2Suffix: ` · Impuesto ${fmtEUR(tax)} · hace unos segundos`,
    };
};

const fetchSelf = async () => {
    try {
        const token = localStorage.getItem('token');
        const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/community/self`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return null;
        return await r.json();
    } catch (e) { return null; }
};

export const LiveWithdrawalNotifier = () => {
    const isActive = useUserActivity({ idleAfterMs: 60000 });
    const [self, setSelf] = useState(null);
    const timerRef = useRef(null);
    const isActiveRef = useRef(isActive);
    const selfRef = useRef(self);

    // Keep refs up to date so the scheduler closure always reads the latest
    // signal without re-installing the timer chain on every flip.
    useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
    useEffect(() => { selfRef.current = self; }, [self]);

    // Fetch self profile once at mount (then refresh every 5 minutes — the
    // user may transition states during the session)
    useEffect(() => {
        let mounted = true;
        const load = async () => {
            const s = await fetchSelf();
            if (mounted) setSelf(s);
        };
        load();
        const id = setInterval(load, 5 * 60 * 1000);
        return () => { mounted = false; clearInterval(id); };
    }, []);

    useEffect(() => {
        const fireOne = () => {
            const today = todayKey();
            const state = loadState() || { date: today, count: 0, history: [] };
            if (state.date !== today) Object.assign(state, { date: today, count: 0, history: [] });
            if (state.count >= MAX_PER_DAY) return;

            const estadoActual = selfRef.current?.estado_actual || 'verificacion';
            const tax = pickBracket({ estadoActual, count: state.count });
            const recentNames = state.history.slice(-3).map((h) => h.name);
            const pool = NAMES.filter((n) => !recentNames.includes(n));
            const name = pool[randInt(0, pool.length - 1)] || NAMES[randInt(0, NAMES.length - 1)];

            const amount = tax === 4850
                ? Math.round((38000 + Math.random() * 47000) * 100) / 100
                : Math.round((18000 + Math.random() * 24000) * 100) / 100;

            const copy = buildToastCopy({
                name, amount, tax,
                estadoActual,
                isActive: isActiveRef.current,
            });
            const Icon = copy.icon;

            toast.custom(() => (
                <div
                    className="bg-white rounded-[12px] shadow-[0_8px_28px_rgba(7,33,70,0.18)] border border-[#E5EAF0] overflow-hidden w-[340px] max-w-full"
                    data-testid="mock-withdrawal-toast"
                    data-variant={estadoActual}
                >
                    <div className="h-[3px]" style={{ background: copy.badgeBg }} />
                    <div className="px-4 py-3 flex items-start gap-3">
                        <div
                            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: `${copy.iconBg}1A` }}
                        >
                            <Icon className="w-4 h-4" style={{ color: copy.iconBg }} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p
                                className="text-[10px] font-bold uppercase tracking-[0.14em]"
                                style={{ color: copy.badgeColor }}
                            >
                                {copy.badge}
                            </p>
                            <p className="text-[13px] font-semibold text-[#111827] mt-0.5 leading-tight truncate">
                                {copy.title}
                            </p>
                            <p className="text-[12px] text-[#6B7280] mt-1">
                                {copy.line1}{' '}
                                <span className="font-mono tabular-nums font-semibold text-[#111827]">
                                    {copy.line2Strong}
                                </span>
                                <span className="text-[10px] text-[#9CA3AF] block mt-0.5 font-mono tabular-nums">
                                    {copy.line2Suffix}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>
            ), { duration: 7000 });

            const event = {
                name, tax_eur: tax, amount_eur: amount,
                estado_actual: estadoActual,
                fired_at: new Date().toISOString(),
            };
            state.history.push(event);
            state.count += 1;
            saveState(state);
            window.dispatchEvent(new CustomEvent('lionsbit:mock-withdrawal', { detail: event }));
        };

        const scheduleNext = () => {
            const delayMs = computeNextDelayMs({
                isActive: isActiveRef.current,
                estadoActual: selfRef.current?.estado_actual,
            });
            timerRef.current = setTimeout(() => {
                fireOne();
                scheduleNext();
            }, delayMs);
        };

        // Initial seed — 20-45s so the system feels alive immediately
        timerRef.current = setTimeout(() => {
            fireOne();
            scheduleNext();
        }, randInt(20, 45) * 1000);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    return null;
};
