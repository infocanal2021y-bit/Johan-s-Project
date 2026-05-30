import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { Button } from '../ui/button';
import {
    LayoutDashboard, Wallet, Send, Boxes, Sparkles, Bell,
    ChevronLeft, ChevronRight, X, Check, Rocket, ShieldCheck,
} from 'lucide-react';
import { SUPPORT_EMAIL } from '../../config/branding';


const STEPS = [
    {
        id: 'welcome',
        icon: Rocket,
        title: '¡Bienvenido a LIONSBIT!',
        subtitle: 'Tu plataforma financiera institucional',
        body: 'Has llegado a una experiencia bancaria moderna con cuenta multidivisa, retiros internacionales, custodia blockchain y asistente IA 24/7. Te mostramos lo esencial en 1 minuto.',
        color: '#1973B8',
        cta: null,
    },
    {
        id: 'command-center',
        icon: LayoutDashboard,
        title: 'Financial Command Center',
        subtitle: 'Tu vista unificada',
        body: 'Un solo dashboard con todos tus saldos, retiros activos, conversiones recientes, documentos del Vault, estado del expediente y notificaciones. Es tu primer destino cada día.',
        color: '#06b6d4',
        cta: { label: 'Abrir Command Center', to: '/command-center' },
    },
    {
        id: 'multi-currency',
        icon: Wallet,
        title: 'Cuenta multidivisa',
        subtitle: '7 monedas en un solo lugar',
        body: 'EUR, USD, GBP, DOP, MXN, COP y BTC. Convierte al instante con tasas institucionales y comisión del 0.5%. Cada moneda tiene su propio saldo separado.',
        color: '#1973B8',
        cta: { label: 'Ver mis divisas', to: '/wallet/multi-currency' },
    },
    {
        id: 'bank-withdrawal',
        icon: Send,
        title: 'Retiro a banco local',
        subtitle: 'Transfiere a tu cuenta bancaria',
        body: 'Elige país (ES/US/GB/DO/MX/CO), banco y monto. Confirmamos con código por email. Tu retiro pasa por 5 etapas con timeline visual en tiempo real.',
        color: '#10b981',
        cta: { label: 'Iniciar retiro', to: '/wallet/bank-withdrawal' },
    },
    {
        id: 'vault',
        icon: Boxes,
        title: 'Vault Blockchain',
        subtitle: 'Custodia inmutable de documentos',
        body: 'Sube cualquier documento (KYC, contratos, comprobantes). Generamos un hash SHA-256 único + timestamp + cadena criptográfica. Verifica integridad en cualquier momento.',
        color: '#06b6d4',
        cta: { label: 'Abrir Vault', to: '/wallet/vault' },
    },
    {
        id: 'ai-assistant',
        icon: Sparkles,
        title: 'LIONS Assistant 24/7',
        subtitle: 'Tu experto financiero personal',
        body: 'Pregunta sobre SWIFT, IBAN, MT103, KYC, estado de tu expediente o cualquier duda bancaria. Toca el icono ✨ flotante abajo a la derecha en cualquier momento.',
        color: '#a78bfa',
        cta: null,
    },
    {
        id: 'finish',
        icon: ShieldCheck,
        title: '¡Listo para empezar!',
        subtitle: 'Tu cuenta está activa',
        body: `Recuerda que puedes acceder al asistente IA en cualquier momento y todos los movimientos se registran de forma auditable. Si tienes dudas, contáctanos en ${SUPPORT_EMAIL}.`,
        color: '#10b981',
        cta: null,
    },
];


export const OnboardingTour = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(true);

    // Auto-show on first login (when not completed AND not dismissed)
    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        (async () => {
            try {
                const r = await api.get('/user/onboarding/status');
                if (cancelled) return;
                const { completed, dismissed, last_step } = r.data;
                if (!completed && !dismissed) {
                    setStep(last_step || 0);
                    setOpen(true);
                }
            } catch (e) {
                console.error('[onboarding] status error', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [user]);

    // Allow re-opening from anywhere via custom event
    useEffect(() => {
        const handler = () => { setStep(0); setOpen(true); };
        window.addEventListener('lionsbit:open-onboarding', handler);
        return () => window.removeEventListener('lionsbit:open-onboarding', handler);
    }, []);

    const persistStep = useCallback(async (newStep) => {
        try { await api.post('/user/onboarding/progress', { step: newStep }); } catch (e) { /* silent */ }
    }, []);

    const next = () => {
        const n = step + 1;
        if (n >= STEPS.length) {
            finish();
        } else {
            setStep(n);
            persistStep(n);
        }
    };

    const prev = () => {
        const p = Math.max(0, step - 1);
        setStep(p);
        persistStep(p);
    };

    const finish = async () => {
        try { await api.post('/user/onboarding/complete'); } catch (e) { /* silent */ }
        setOpen(false);
    };

    const dismiss = async () => {
        try { await api.post('/user/onboarding/dismiss'); } catch (e) { /* silent */ }
        setOpen(false);
    };

    const handleCTA = (to) => {
        finish();
        navigate(to);
    };

    if (loading || !user) return null;
    const current = STEPS[step];
    const Icon = current.icon;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="ob-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
                    data-testid="onboarding-tour"
                    onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
                >
                    <motion.div
                        key={`ob-step-${step}`}
                        initial={{ opacity: 0, scale: 0.94, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                        className="w-full max-w-md bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 rounded-2xl ring-1 ring-cyan-500/30 shadow-2xl overflow-hidden relative"
                    >
                        {/* Top blob */}
                        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full opacity-25 blur-3xl pointer-events-none"
                            style={{ background: current.color }} />

                        {/* Close X */}
                        <button
                            onClick={dismiss}
                            className="absolute top-3 right-3 text-slate-500 hover:text-white p-1.5 rounded-md hover:bg-white/5 z-10"
                            aria-label="Cerrar tour"
                            data-testid="onboarding-skip"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="relative p-7 text-center">
                            {/* Icon */}
                            <motion.div
                                key={`ob-icon-${step}`}
                                initial={{ scale: 0.6, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.05 }}
                                className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ring-2"
                                style={{
                                    background: `linear-gradient(135deg, ${current.color}30, ${current.color}10)`,
                                    boxShadow: `0 8px 32px ${current.color}50`,
                                    borderColor: current.color + '60',
                                }}
                            >
                                <Icon className="w-7 h-7" style={{ color: current.color }} />
                            </motion.div>

                            {/* Title */}
                            <p className="text-[10.5px] uppercase tracking-[0.18em] font-bold mb-1" style={{ color: current.color }}>
                                {current.subtitle}
                            </p>
                            <h2 className="text-white text-2xl font-bold leading-tight" data-testid={`onboarding-title-${current.id}`}>
                                {current.title}
                            </h2>

                            {/* Body */}
                            <p className="text-slate-300 text-[13px] leading-relaxed mt-3.5 px-2">
                                {current.body}
                            </p>

                            {/* CTA if available */}
                            {current.cta && (
                                <Button
                                    onClick={() => handleCTA(current.cta.to)}
                                    variant="outline"
                                    className="mt-4 border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 hover:border-cyan-400"
                                    data-testid={`onboarding-cta-${current.id}`}
                                >
                                    {current.cta.label} <ChevronRight className="w-3.5 h-3.5 ml-1" />
                                </Button>
                            )}
                        </div>

                        {/* Step indicators */}
                        <div className="px-7 pb-3 flex items-center justify-center gap-1.5">
                            {STEPS.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => { setStep(i); persistStep(i); }}
                                    className={`h-1.5 rounded-full transition-all ${
                                        i === step ? 'w-6 bg-cyan-400' : i < step ? 'w-1.5 bg-cyan-700' : 'w-1.5 bg-slate-700 hover:bg-slate-600'
                                    }`}
                                    aria-label={`Ir al paso ${i + 1}`}
                                    data-testid={`onboarding-dot-${i}`}
                                />
                            ))}
                        </div>

                        {/* Footer nav */}
                        <div className="bg-slate-950/80 border-t border-slate-800 px-5 py-3 flex items-center justify-between gap-2">
                            <button
                                onClick={dismiss}
                                className="text-[11.5px] text-slate-500 hover:text-slate-300 font-semibold"
                                data-testid="onboarding-dismiss"
                            >
                                Saltar
                            </button>
                            <div className="flex items-center gap-2">
                                {step > 0 && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={prev}
                                        className="h-8 px-3 text-[11.5px] text-slate-400 hover:text-white"
                                        data-testid="onboarding-prev"
                                    >
                                        <ChevronLeft className="w-3.5 h-3.5 mr-0.5" /> Atrás
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    onClick={next}
                                    className="h-8 px-4 text-[11.5px] bg-[#1973B8] hover:bg-[#1F89D8] text-white font-bold"
                                    data-testid="onboarding-next"
                                >
                                    {step === STEPS.length - 1 ? (
                                        <>Finalizar <Check className="w-3.5 h-3.5 ml-1" /></>
                                    ) : (
                                        <>Siguiente <ChevronRight className="w-3.5 h-3.5 ml-0.5" /></>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};


/** Programmatic helper so other components can trigger the tour. */
export const triggerOnboardingTour = async () => {
    try {
        await api.post('/user/onboarding/reset');
    } catch (e) { /* silent */ }
    window.dispatchEvent(new CustomEvent('lionsbit:open-onboarding'));
};


export default OnboardingTour;
