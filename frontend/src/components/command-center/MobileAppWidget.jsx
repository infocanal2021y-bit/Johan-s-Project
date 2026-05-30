import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Card } from '../ui/card';
import api from '../../lib/api';
import { toast } from 'sonner';
import {
    Smartphone, Apple, BellRing, CheckCircle2, Loader2, ChevronRight,
    TrendingUp, Wallet, FolderKanban,
} from 'lucide-react';


// Compact premium widget for the right column of /command-center
export const MobileAppWidget = () => {
    const [status, setStatus] = useState({ registered: false, since: null });
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        let alive = true;
        api.get('/mobile-app/waitlist/status')
            .then((r) => { if (alive) setStatus(r.data); })
            .catch(() => { /* silent */ })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    const handleNotify = async () => {
        if (submitting || status.registered) return;
        setSubmitting(true);
        try {
            const r = await api.post('/mobile-app/waitlist/register', { source: 'command_center' });
            setStatus({ registered: true, since: r.data.since });
            toast.success(r.data.already_registered
                ? 'Ya estabas en la lista de espera'
                : '¡Te avisaremos cuando esté disponible!');
        } catch (err) {
            toast.error('No se pudo registrar el interés. Intenta de nuevo.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Card
            className="relative overflow-hidden bg-gradient-to-br from-[#072146] via-[#0a1c3d] to-slate-950 ring-1 ring-cyan-500/25 border-0 p-4"
            data-testid="cc-mobile-app-widget"
        >
            {/* Background blobs */}
            <div className="pointer-events-none absolute -top-12 -right-12 w-32 h-32 rounded-full bg-cyan-500/15 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-12 -left-8 w-32 h-32 rounded-full bg-emerald-500/10 blur-2xl" />

            <div className="relative">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-lg bg-cyan-500/15 ring-1 ring-cyan-500/30 flex items-center justify-center">
                            <Smartphone className="w-4 h-4 text-cyan-300" />
                        </div>
                        <div>
                            <p className="text-cyan-300 text-[9.5px] uppercase tracking-[0.15em] font-bold">PayLionsBit</p>
                            <p className="text-white font-bold text-[13px] leading-tight">Mobile</p>
                        </div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/40">
                        Próximamente
                    </span>
                </div>

                <p className="text-slate-300 text-[11.5px] mt-3 leading-relaxed">
                    Próximamente en <span className="text-white font-semibold">App Store</span> y
                    {' '}<span className="text-white font-semibold">Google Play</span>.
                </p>

                {/* Features list */}
                <ul className="mt-3 space-y-1.5 text-[11.5px]" data-testid="cc-mobile-features">
                    {[
                        { icon: TrendingUp, label: 'Inversiones', color: '#10b981' },
                        { icon: Wallet, label: 'Multidivisa', color: '#06b6d4' },
                        { icon: BellRing, label: 'Alertas Push', color: '#f59e0b' },
                        { icon: FolderKanban, label: 'Seguimiento de expedientes', color: '#a78bfa' },
                    ].map((f) => (
                        <li key={f.label} className="flex items-center gap-2 text-slate-300">
                            <CheckCircle2 className="w-3 h-3 flex-shrink-0" style={{ color: f.color }} />
                            <f.icon className="w-3 h-3 opacity-70" style={{ color: f.color }} />
                            <span>{f.label}</span>
                        </li>
                    ))}
                </ul>

                {/* Store badges (visual only) */}
                <div className="grid grid-cols-2 gap-1.5 mt-3.5">
                    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-black/70 ring-1 ring-slate-700 cursor-not-allowed select-none" title="Próximamente">
                        <Apple className="w-3.5 h-3.5 text-white" />
                        <div className="leading-tight">
                            <p className="text-slate-400 text-[7.5px] uppercase tracking-wider font-semibold">Pronto en</p>
                            <p className="text-white text-[10px] font-bold">App Store</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-black/70 ring-1 ring-slate-700 cursor-not-allowed select-none" title="Próximamente">
                        <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                        <div className="leading-tight">
                            <p className="text-slate-400 text-[7.5px] uppercase tracking-wider font-semibold">Pronto en</p>
                            <p className="text-white text-[10px] font-bold">Google Play</p>
                        </div>
                    </div>
                </div>

                {/* Notify CTA */}
                <div className="mt-3.5">
                    <AnimatePresence mode="wait">
                        {status.registered ? (
                            <motion.div
                                key="registered"
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/40 text-emerald-300 text-[11.5px] font-bold"
                                data-testid="cc-mobile-notify-confirmed"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Ya estás en la lista
                            </motion.div>
                        ) : (
                            <motion.button
                                key="cta"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                onClick={handleNotify}
                                disabled={submitting || loading}
                                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 text-cyan-950 font-bold text-[11.5px] transition-colors shadow-[0_4px_14px_-2px_rgba(34,211,238,0.45)]"
                                data-testid="cc-mobile-notify-btn"
                            >
                                {submitting
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <BellRing className="w-3.5 h-3.5" />}
                                Notifícame cuando esté disponible
                            </motion.button>
                        )}
                    </AnimatePresence>

                    <Link
                        to="/mobile-app"
                        className="mt-2 inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 text-[10.5px] font-semibold transition-colors"
                        data-testid="cc-mobile-more"
                    >
                        Conocer más detalles <ChevronRight className="w-3 h-3" />
                    </Link>
                </div>
            </div>
        </Card>
    );
};

export default MobileAppWidget;
