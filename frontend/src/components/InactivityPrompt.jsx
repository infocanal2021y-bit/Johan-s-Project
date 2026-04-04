import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, X, MessageCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useNavigate } from 'react-router-dom';

export const InactivityPrompt = ({ show, onDismiss }) => {
    const navigate = useNavigate();

    if (!show) return null;

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 30, scale: 0.95 }}
                    className="fixed bottom-24 right-6 z-[90] max-w-sm"
                    data-testid="inactivity-prompt"
                >
                    <div className="bg-slate-900 border border-cyan-500/30 rounded-xl shadow-2xl shadow-cyan-500/10 p-5">
                        <button
                            onClick={onDismiss}
                            className="absolute top-3 right-3 text-slate-500 hover:text-slate-300 transition-colors"
                            data-testid="inactivity-dismiss"
                        >
                            <X className="w-4 h-4" />
                        </button>
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                                <HelpCircle className="w-5 h-5 text-cyan-400" />
                            </div>
                            <div className="space-y-2">
                                <p className="text-white font-medium text-sm">Necesitas ayuda para completar tu proceso?</p>
                                <p className="text-slate-400 text-xs leading-relaxed">
                                    Nuestro equipo esta disponible para asistirte en cualquier momento.
                                </p>
                                <div className="flex gap-2 pt-1">
                                    <Button
                                        size="sm"
                                        className="bg-cyan-500 hover:bg-cyan-600 text-black text-xs h-8"
                                        onClick={() => { onDismiss(); navigate('/support'); }}
                                        data-testid="inactivity-support-btn"
                                    >
                                        <MessageCircle className="w-3 h-3 mr-1" />
                                        Soporte
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-slate-700 text-slate-300 text-xs h-8"
                                        onClick={onDismiss}
                                    >
                                        Estoy bien
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
