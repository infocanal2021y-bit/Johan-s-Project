import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Calendar, ArrowRight } from 'lucide-react';

const SESSION_KEY = 'lbit_institutional_notice_seen_v1';

// Check whether any other modal / dialog / sonner toast / tour step is currently open
const isAnotherOverlayOpen = () => {
    if (typeof document === 'undefined') return false;
    // shadcn / radix dialogs
    if (document.querySelector('[role="dialog"][data-state="open"]')) return true;
    if (document.querySelector('[role="alertdialog"][data-state="open"]')) return true;
    // Generic fixed full-screen modals with a darkening backdrop (used across PartialUnlockPanel, etc.)
    const overlays = document.querySelectorAll('.fixed.inset-0');
    for (const el of overlays) {
        // ignore our own backdrop
        if (el.getAttribute('data-testid') === 'institutional-notice-backdrop') continue;
        // ignore decorative background layers (AppBackground, Sidebar mobile-overlay closed, etc.)
        if (el.classList.contains('pointer-events-none')) continue;
        // skip hidden
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
        // Only block if element has a dark backdrop (modal pattern: bg-black/.. + backdrop-blur)
        const cls = el.className || '';
        if (typeof cls === 'string' && (cls.includes('bg-black/') || cls.includes('backdrop-blur'))) {
            return true;
        }
    }
    // onboarding tour
    if (document.querySelector('[data-tour-step]')) return true;
    return false;
};

export const InstitutionalNoticePopup = () => {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        if (sessionStorage.getItem(SESSION_KEY) === '1') return undefined;

        let cancelled = false;
        let intervalId = null;
        let stableCount = 0;

        const tryShow = () => {
            if (cancelled) return;
            if (!isAnotherOverlayOpen()) {
                stableCount += 1;
                // require 2 consecutive checks clear (≈ 1.6s) to avoid flashing right between modal transitions
                if (stableCount >= 2) {
                    setShow(true);
                    sessionStorage.setItem(SESSION_KEY, '1');
                    if (intervalId) clearInterval(intervalId);
                }
            } else {
                stableCount = 0;
            }
        };

        // start polling after a short delay so the dashboard settles
        const startTimeout = setTimeout(() => {
            tryShow();
            intervalId = setInterval(tryShow, 800);
        }, 1200);

        return () => {
            cancelled = true;
            clearTimeout(startTimeout);
            if (intervalId) clearInterval(intervalId);
        };
    }, []);

    const close = () => setShow(false);

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[3px]"
                    onClick={close}
                    data-testid="institutional-notice-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="institutional-notice-title"
                >
                    <motion.div
                        initial={{ y: 28, scale: 0.96, opacity: 0 }}
                        animate={{ y: 0, scale: 1, opacity: 1 }}
                        exit={{ y: 20, scale: 0.97, opacity: 0 }}
                        transition={{ type: 'spring', damping: 26, stiffness: 280 }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full max-w-2xl bg-slate-950 ring-1 ring-cyan-500/25 rounded-2xl shadow-2xl shadow-cyan-500/10 overflow-hidden"
                        data-testid="institutional-notice-modal"
                    >
                        {/* Decorative top gradient */}
                        <div className="relative bg-gradient-to-br from-[#072146] via-[#0a1c3d] to-slate-950 px-7 py-5 border-b border-slate-800/80">
                            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-cyan-500/20 blur-3xl pointer-events-none" />
                            <div className="absolute -bottom-20 -left-10 w-48 h-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
                            <div className="relative flex items-start gap-3.5">
                                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-400 flex items-center justify-center shadow-[0_6px_24px_-4px_rgba(6,182,212,0.55)] flex-shrink-0">
                                    <ShieldCheck className="w-5 h-5 text-slate-950" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-cyan-300 text-[10.5px] font-bold uppercase tracking-[0.18em]">
                                        Aviso institucional · LIONSBIT
                                    </p>
                                    <h2
                                        id="institutional-notice-title"
                                        className="text-white text-xl sm:text-2xl font-bold tracking-tight mt-1 leading-tight"
                                    >
                                        Comunicado oficial a clientes
                                    </h2>
                                </div>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="px-7 py-6 space-y-4">
                            {/* Highlighted date strip */}
                            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30">
                                <Calendar className="w-4 h-4 text-amber-300 flex-shrink-0" />
                                <p className="text-amber-200 text-[12.5px] leading-snug">
                                    Funcionalidades de <span className="font-bold text-white">pagos y retiros</span> disponibles hasta el{' '}
                                    <span className="font-bold text-white font-mono">03/01/2027</span>.
                                </p>
                            </div>

                            <p className="text-slate-200 text-[13.5px] leading-relaxed">
                                Las funcionalidades de pagos y retiros permanecerán disponibles hasta el{' '}
                                <span className="text-white font-semibold">03/01/2027</span>. A partir de esa fecha, la plataforma
                                iniciará una <span className="text-cyan-300 font-semibold">nueva etapa operativa</span> con una infraestructura
                                tecnológica renovada, una nueva base de datos y nuevos servicios relacionados con inversiones
                                y gestión financiera.
                            </p>

                            <p className="text-slate-300 text-[13px] leading-relaxed">
                                Recomendamos a todos los usuarios <span className="text-white font-semibold">completar cualquier trámite pendiente</span>{' '}
                                antes de la fecha indicada. Las solicitudes registradas dentro del período habilitado
                                continuarán siendo procesadas conforme a las políticas vigentes.
                            </p>

                            <p className="text-slate-400 text-[13px] leading-relaxed italic">
                                Agradecemos su confianza y les mantendremos informados sobre las próximas actualizaciones y
                                servicios que formarán parte de la nueva versión de la plataforma.
                            </p>

                            {/* Signature line */}
                            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                                <p className="text-slate-500 text-[11px]">
                                    Atentamente,{' '}
                                    <span className="text-slate-300 font-semibold">Dirección Operativa LIONSBIT</span>
                                </p>
                                <p className="text-slate-600 text-[10px] font-mono">REF · COM-2026-01</p>
                            </div>
                        </div>

                        {/* Footer with CTA */}
                        <div className="px-7 py-4 bg-slate-900/40 border-t border-slate-800/80 flex justify-end">
                            <button
                                onClick={close}
                                data-testid="institutional-notice-close-btn"
                                className="group inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 font-bold text-[13.5px] shadow-[0_8px_24px_-6px_rgba(6,182,212,0.55)] hover:shadow-[0_12px_30px_-6px_rgba(6,182,212,0.75)] transition-shadow"
                            >
                                Entendido
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default InstitutionalNoticePopup;
