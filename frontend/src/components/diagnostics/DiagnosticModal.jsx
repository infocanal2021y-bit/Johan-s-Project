import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HeartPulse } from 'lucide-react';
import { DiagnosticPanel } from './DiagnosticPanel';

// Standalone host for the DiagnosticPanel. Listens for the global
// `open-diagnostic` event (dispatched by the dashboard CTA and the sidebar
// health ring) and shows the panel in a right-side sheet.
export const DiagnosticModal = () => {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const handler = () => setOpen(true);
        window.addEventListener('open-diagnostic', handler);
        return () => window.removeEventListener('open-diagnostic', handler);
    }, []);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        if (open) window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm"
                    onClick={() => setOpen(false)}
                    data-testid="diagnostic-modal-overlay"
                >
                    <motion.div
                        initial={{ x: 480 }}
                        animate={{ x: 0 }}
                        exit={{ x: 480 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-0 h-full w-full sm:w-[440px] bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col"
                        data-testid="diagnostic-modal"
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 flex-shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                                    <HeartPulse className="w-4 h-4 text-cyan-400" />
                                </div>
                                <div>
                                    <p className="text-white font-bold text-sm leading-tight">Salud de cuenta</p>
                                    <p className="text-slate-500 text-[10.5px]">Diagnóstico automático con acciones para resolver</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                                data-testid="diagnostic-modal-close"
                                aria-label="Cerrar"
                            >
                                <X className="w-4.5 h-4.5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-5 py-4">
                            <DiagnosticPanel autoRun onClose={() => setOpen(false)} />
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default DiagnosticModal;
