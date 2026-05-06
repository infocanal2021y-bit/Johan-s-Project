import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Clock, X } from 'lucide-react';
import api from '../../lib/api';

const SESSION_TOAST_KEY = 'lionsbit:journey-toast-shown';

// =============================================================================
// IncompleteWithdrawBanner — shown on the dashboard when the user has an
// incomplete withdrawal journey (modality picked, no completed transaction,
// recent activity).
//
// Behaviour:
//   • Pings GET /api/withdraw/journey-status on mount
//   • Renders a single calm BBVA-style banner if status === 'incomplete'
//   • Records `banner_shown` once per page load and `banner_click` when the
//     user follows the CTA — both POSTed to /api/withdraw/journey-status/event
//   • Auto-hides the moment the user completes the withdrawal (the next
//     fetch returns 'completed')
//   • Discreet X dismiss — local-only, doesn't tell the server (the user may
//     reopen the page and we'll show it again, which is the desired behaviour
//     until the journey is genuinely completed)
// =============================================================================
export const IncompleteWithdrawBanner = () => {
    const [snap, setSnap] = useState(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        api.get('/withdraw/journey-status')
            .then((r) => {
                if (cancelled) return;
                setSnap(r.data);
                if (r.data?.status === 'incomplete') {
                    api.post('/withdraw/journey-status/event', { event: 'banner_shown' })
                        .catch(() => {});
                }
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    if (!snap || snap.status !== 'incomplete' || dismissed) return null;

    const isPartial = snap.withdrawal_type === 'partial';

    const handleClickCta = () => {
        api.post('/withdraw/journey-status/event', { event: 'banner_click' }).catch(() => {});
    };

    const handleDismiss = () => {
        setDismissed(true);
        api.post('/withdraw/journey-status/event', { event: 'banner_dismissed' }).catch(() => {});
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            data-testid="incomplete-withdraw-banner"
            data-withdrawal-type={snap.withdrawal_type || ''}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b2a4e] via-[#0e2d50] to-slate-900 border border-amber-500/30 shadow-xl"
        >
            <div className="absolute -right-4 -top-4 w-48 h-48 rounded-full opacity-20 blur-3xl"
                 style={{ background: 'radial-gradient(circle, #F59E0B, transparent 70%)' }} />

            <button
                type="button"
                onClick={handleDismiss}
                aria-label="Cerrar aviso"
                data-testid="incomplete-banner-close"
                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors z-10"
            >
                <X className="w-3.5 h-3.5" />
            </button>

            <div className="relative p-5 sm:p-6 flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-400 mb-1">
                        Solicitud de retiro en proceso
                    </p>
                    <h3 className="text-white text-lg font-semibold leading-tight tracking-tight"
                        style={{ fontFamily: 'Poppins' }}>
                        Tiene un retiro {isPartial ? 'parcial (40%)' : 'total (100%)'} sin completar
                    </h3>
                    <p className="text-slate-300 text-[13px] mt-1.5 max-w-2xl leading-relaxed">
                        Su solicitud está pausada a la espera de los pasos finales. Cuando le venga
                        bien, puede continuar desde donde lo dejó — su selección y los datos ya
                        introducidos se han guardado.
                    </p>
                </div>
                <Link
                    to="/withdraw"
                    onClick={handleClickCta}
                    data-testid="incomplete-banner-cta"
                    className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-900 text-[13px] font-semibold shadow-lg transition-colors flex-shrink-0"
                >
                    Continuar mi retiro
                    <ArrowRight className="w-3.5 h-3.5" />
                </Link>
            </div>
        </motion.div>
    );
};

// Small helper exposed to other components (e.g. Layout) that want to fire the
// per-session toast. Returns true if the toast was shown (caller should call
// `toast.message(...)` itself), false if it was already shown this session.
export const consumeJourneyToastSlot = () => {
    try {
        if (sessionStorage.getItem(SESSION_TOAST_KEY) === '1') return false;
        sessionStorage.setItem(SESSION_TOAST_KEY, '1');
        return true;
    } catch (e) {
        return true;
    }
};
