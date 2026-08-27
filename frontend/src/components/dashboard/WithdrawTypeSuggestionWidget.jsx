import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ShieldCheck, Zap, Sparkles, X } from 'lucide-react';
import api from '../../lib/api';

// =============================================================================
// WithdrawTypeSuggestionWidget — Dashboard next-action nudge.
// =============================================================================
//
// Appears only when:
//   • user.verification_status === 'verified'
//   • no `withdrawal_type` selected yet (server-side)
//   • user hasn't dismissed the widget this session
//
// Behaviour:
//   • Single banner with the 2 side-by-side mini cards (partial / full)
//   • CTA → /withdraw (full selector)
//   • Discreet close button stores `lionsbit:withdraw-suggestion-dismissed`
//     in localStorage so it doesn't re-appear every time the user reloads.
// =============================================================================
export const WithdrawTypeSuggestionWidget = ({ user }) => {
    const [show, setShow] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        // Respect local dismissal
        try {
            if (localStorage.getItem('lionsbit:withdraw-suggestion-dismissed') === '1') {
                setDismissed(true);
                return;
            }
        } catch (e) { /* ignore */ }

        // Only relevant for verified users
        if (!user || user.verification_status !== 'verified') return;

        let cancel = false;
        api.get('/withdraw-type')
            .then((r) => {
                if (cancel) return;
                const type = r.data?.withdrawal_type;
                if (!type) setShow(true);
            })
            .catch(() => {});
        return () => { cancel = true; };
    }, [user]);

    const close = () => {
        try { localStorage.setItem('lionsbit:withdraw-suggestion-dismissed', '1'); } catch (e) { /* ignore */ }
        setDismissed(true);
    };

    if (!show || dismissed) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            data-testid="withdraw-type-suggestion-widget"
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b2a4e] via-[#0e2d50] to-slate-900 border border-[#14549C]/30 shadow-xl"
        >
            <div className="absolute -right-4 -top-4 w-48 h-48 rounded-full opacity-20 blur-3xl" style={{ background: 'radial-gradient(circle, #1973B8, transparent 70%)' }} />

            <button
                type="button"
                onClick={close}
                aria-label="Cerrar sugerencia"
                data-testid="withdraw-suggestion-close-btn"
                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors z-10"
            >
                <X className="w-3.5 h-3.5" />
            </button>

            <div className="relative p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#4a9eff]" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#4a9eff]">
                        Próxima acción sugerida
                    </p>
                </div>
                <h3 className="text-white text-lg sm:text-xl font-semibold tracking-tight" style={{ fontFamily: 'Poppins' }}>
                    Elija su modalidad de retiro
                </h3>
                <p className="text-slate-400 text-[13px] mt-1 max-w-2xl leading-relaxed">
                    Su cuenta está verificada. Para activar el flujo de retiro, elija entre
                    desbloqueo parcial del <strong className="text-white">40%</strong> o retiro
                    total del <strong className="text-white">100%</strong>.
                </p>

                {/* Mini option row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                    <MiniOption
                        icon={Zap}
                        color="#4a9eff"
                        title="Parcial · 40%"
                        fee="€4.850"
                        sub="Menor coste de activación"
                        testId="widget-option-partial"
                    />
                    <MiniOption
                        icon={ShieldCheck}
                        color="#16A34A"
                        title="Total · 100%"
                        fee="€4.850"
                        sub="Acceso completo al saldo"
                        testId="widget-option-full"
                    />
                </div>

                <Link
                    to="/withdraw"
                    data-testid="widget-cta-continue"
                    className="mt-4 inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-[#1973B8] hover:bg-[#14549C] text-white text-[13px] font-semibold shadow-lg shadow-[#14549C]/25 transition-colors"
                >
                    Continuar al selector
                    <ArrowRight className="w-3.5 h-3.5" />
                </Link>
            </div>
        </motion.div>
    );
};


const MiniOption = ({ icon: Icon, color, title, fee, sub, testId }) => (
    <div
        className="flex items-center gap-3 rounded-xl bg-slate-900/70 border border-slate-800 px-3.5 py-3"
        data-testid={testId}
    >
        <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}1F` }}
        >
            <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-white text-[13px] font-semibold leading-tight">{title}</p>
            <p className="text-slate-500 text-[11px] mt-0.5 leading-tight truncate">{sub}</p>
        </div>
        <p className="text-[14px] font-mono tabular-nums font-bold" style={{ color }}>
            {fee}
        </p>
    </div>
);
