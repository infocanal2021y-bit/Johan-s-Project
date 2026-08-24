import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, Landmark } from 'lucide-react';

export const NewAdministrationModal = () => {
    const [open, setOpen] = useState(true);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                    data-testid="new-admin-modal-overlay"
                >
                    <motion.div
                        initial={{ opacity: 0, y: 24, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24, scale: 0.97 }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                        className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-amber-500/20 bg-[#0a0a0a] shadow-2xl shadow-black/60 ring-1 ring-white/5"
                        data-testid="new-admin-modal"
                    >
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-amber-500/70 to-transparent" />

                        <button
                            onClick={() => setOpen(false)}
                            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                            aria-label="Cerrar aviso"
                            data-testid="new-admin-modal-close-btn"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="px-6 sm:px-8 pt-8 pb-4 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/25">
                                    <Landmark className="w-5 h-5 text-amber-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight" data-testid="new-admin-modal-title">
                                        Nueva administración PayLionsbit
                                    </h2>
                                    <p className="text-xs text-amber-400/90 font-medium mt-0.5">Comunicado oficial · Desde el 03/02/2026</p>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 sm:px-8 py-6 overflow-y-auto max-h-[50vh] space-y-4 text-sm leading-relaxed text-slate-300" data-testid="new-admin-modal-body">
                            <p>
                                Desde el <span className="text-white font-medium">03/02/2026</span>, PayLionsbit se encuentra bajo una nueva administración, enfocada en revisar, organizar y dar continuidad a procesos que habían quedado pendientes dentro de la plataforma.
                            </p>
                            <p>
                                Entendemos que algunos usuarios han atravesado situaciones difíciles o prolongadas anteriormente, y lamentamos sinceramente cualquier inconveniente relacionado con esas etapas previas.
                            </p>
                            <p>
                                Esta nueva administración tiene como objetivo acompañar a cada usuario hasta completar correctamente su proceso, brindando información clara, seguimiento y asistencia durante cada etapa de la operación.
                            </p>
                            <p>
                                Nuestro equipo de agentes está disponible para ofrecerle el mejor servicio posible, orientarle ante cualquier duda y ayudarle a gestionar correctamente los procedimientos reflejados dentro de su cuenta.
                            </p>
                            <p>
                                Los importes, cargos o comisiones que correspondan a una operación serán mostrados directamente dentro de la plataforma, junto con la información aplicable al proceso. Recomendamos revisar siempre estos datos antes de confirmar cualquier operación.
                            </p>
                            <p>
                                Nuestro compromiso es trabajar de manera organizada y transparente para que los usuarios puedan completar sus procesos pendientes y acceder a los fondos o cantidades que correspondan conforme al estado real de su cuenta y a las condiciones aplicables.
                            </p>
                        </div>

                        <div className="px-6 sm:px-8 py-4 border-t border-white/5 bg-white/[0.02] flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <ShieldCheck className="w-4 h-4 text-amber-500/80" />
                                <span>PayLionsbit — Nueva Administración · Desde el 03/02/2026</span>
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="shrink-0 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-colors"
                                data-testid="new-admin-modal-understood-btn"
                            >
                                Entendido
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
