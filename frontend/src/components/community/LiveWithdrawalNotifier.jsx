import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { fmtEUR } from './constants';

// =============================================================================
// LiveWithdrawalNotifier — schedules 4 mock withdrawal toasts per day.
// =============================================================================
//   • 2 toasts × €4.850   (full tax bracket — counts toward TOTAL PAGADO)
//   • 2 toasts × €2.660   (partial 40% bracket)
//   • Intervals 4-6h between firings (randomised per cycle)
//   • Persists daily count in localStorage so refresh doesn't spam the user
//   • Dispatches `lionsbit:mock-withdrawal` window event so other components
//     (e.g. CommunityPage header) can update their live counters
// =============================================================================

const STORAGE_KEY = 'lionsbit:mock-withdrawal-state';
const MAX_PER_DAY = 4;
const TAX_AMOUNTS = [4850, 4850, 2660, 2660];

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
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
};

const saveState = (state) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* silent */ }
};

export const LiveWithdrawalNotifier = () => {
    const timerRef = useRef(null);

    useEffect(() => {
        const fireOne = () => {
            const today = todayKey();
            const state = loadState() || { date: today, count: 0, history: [] };
            // Reset if day flipped
            if (state.date !== today) {
                state.date = today;
                state.count = 0;
                state.history = [];
            }
            if (state.count >= MAX_PER_DAY) return;  // budget exhausted

            // Pick the next tax bracket — alternate full/partial pattern
            const tax = TAX_AMOUNTS[state.count % TAX_AMOUNTS.length];
            // Pick a name not used in the last 3 firings
            const recentNames = state.history.slice(-3).map((h) => h.name);
            const pool = NAMES.filter((n) => !recentNames.includes(n));
            const name = pool[randInt(0, pool.length - 1)] || NAMES[randInt(0, NAMES.length - 1)];

            // Synthesise a believable withdrawal amount aligned with the bracket
            const amount = tax === 4850
                ? Math.round((38000 + Math.random() * 47000) * 100) / 100
                : Math.round((18000 + Math.random() * 24000) * 100) / 100;

            // Fire the toast — banking-grade, no emoji clutter, soft green accent
            toast.custom((t) => (
                <div
                    className="bg-white rounded-[12px] shadow-[0_8px_28px_rgba(7,33,70,0.18)] border border-[#E5EAF0] overflow-hidden w-[340px] max-w-full"
                    data-testid="mock-withdrawal-toast"
                >
                    <div className="h-[3px] bg-[#16A34A]" />
                    <div className="px-4 py-3 flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#16A34A]/10 flex items-center justify-center flex-shrink-0">
                            <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#16A34A]">
                                Retiro verificado
                            </p>
                            <p className="text-[13px] font-semibold text-[#111827] mt-0.5 leading-tight truncate">
                                {name} · 🇪🇸 España
                            </p>
                            <p className="text-[12px] text-[#6B7280] mt-1">
                                Realizó un retiro de{' '}
                                <span className="font-mono tabular-nums font-semibold text-[#111827]">
                                    {fmtEUR(amount)}
                                </span>
                            </p>
                            <p className="text-[10px] text-[#9CA3AF] mt-1 font-mono tabular-nums">
                                Impuesto pagado: {fmtEUR(tax)} · hace unos segundos
                            </p>
                        </div>
                    </div>
                </div>
            ), {
                duration: 7000,
            });

            // Persist + broadcast event for header counters
            const event = {
                name,
                tax_eur: tax,
                amount_eur: amount,
                fired_at: new Date().toISOString(),
            };
            state.history.push(event);
            state.count += 1;
            saveState(state);

            window.dispatchEvent(new CustomEvent('lionsbit:mock-withdrawal', { detail: event }));
        };

        const scheduleNext = () => {
            // Spec: cada 4-6 horas entre notificaciones, máximo 4 por día.
            const fourHoursMs = 4 * 60 * 60 * 1000;
            const sixHoursMs = 6 * 60 * 60 * 1000;
            const delayMs = randInt(fourHoursMs, sixHoursMs);
            timerRef.current = setTimeout(() => {
                fireOne();
                scheduleNext();
            }, delayMs);
        };

        // Seed firing 20-45s after mount so the user sees the system is alive
        // without waiting 4 hours. Subsequent firings honour the 4-6h spec.
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
