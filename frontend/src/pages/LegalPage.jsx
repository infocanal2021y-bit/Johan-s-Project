import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    Building2, FileText, Landmark, Phone, Mail, Scale, ShieldCheck, ArrowLeft, MapPin, BadgeCheck,
} from 'lucide-react';

const REGISTRY = [
    { icon: Building2, label: 'Company Name', value: 'Lions Advisory Group LLC' },
    { icon: FileText, label: 'Filing ID', value: '2026-001987773', mono: true },
    { icon: Landmark, label: 'State of Formation', value: 'Wyoming, USA' },
    { icon: Phone, label: 'Phone Number', value: '+1 814-399-7566', mono: true, href: 'tel:+18143997566' },
    { icon: Mail, label: 'Email Address', value: 'info@paylionsbit.es', href: 'mailto:info@paylionsbit.es' },
];

const LegalPage = () => (
    <div className="min-h-screen bg-[#050505] text-white">
        <div className="max-w-3xl mx-auto px-5 py-10 sm:py-14 space-y-8" data-testid="legal-page">
            <Link to="/login" className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors" data-testid="legal-back-link">
                <ArrowLeft className="w-4 h-4" /> Volver al inicio de sesión
            </Link>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#1973B8]/15 border border-[#1973B8]/30 flex items-center justify-center">
                        <Scale className="w-6 h-6 text-[#7CB1E5]" />
                    </div>
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Aviso legal · Sobre la entidad</h1>
                        <p className="text-slate-400 text-sm font-light">LIONSBIT VERIFICACION · Información oficial de registro</p>
                    </div>
                </div>
            </motion.div>

            {/* Datos registrales */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
                className="rounded-2xl bg-slate-900/70 border border-slate-800 overflow-hidden" data-testid="legal-registry-card">
                <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-800/30 flex items-center gap-2">
                    <BadgeCheck className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-white font-semibold text-base">Datos registrales</h2>
                </div>
                <div className="divide-y divide-slate-800/60">
                    {REGISTRY.map(({ icon: Icon, label, value, mono, href }) => (
                        <div key={label} className="px-5 py-3.5 flex items-center justify-between gap-4">
                            <span className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-slate-500">
                                <Icon className="w-4 h-4 text-[#7CB1E5]" /> {label}
                            </span>
                            {href ? (
                                <a href={href} className={`text-white text-sm font-medium hover:text-[#7CB1E5] text-right ${mono ? 'font-mono' : ''}`}>{value}</a>
                            ) : (
                                <span className={`text-white text-sm font-medium text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
                            )}
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Registered Agent */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
                className="rounded-2xl bg-slate-900/70 border border-slate-800 overflow-hidden" data-testid="legal-agent-card">
                <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-800/30 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-cyan-400" />
                    <h2 className="text-white font-semibold text-base">Registered Agent</h2>
                </div>
                <div className="px-5 py-4 space-y-1.5">
                    <p className="text-white text-sm font-medium">Northwest Registered Agent Service Inc</p>
                    <p className="text-slate-400 text-sm">30 N Gould St Ste N</p>
                    <p className="text-slate-400 text-sm">Sheridan, WY 82801 USA</p>
                    <div className="flex flex-wrap gap-2 pt-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold">
                            <BadgeCheck className="w-3.5 h-3.5" /> Latest AR/Year: AR Exempt
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold">
                            <BadgeCheck className="w-3.5 h-3.5" /> License Tax Paid
                        </span>
                    </div>
                </div>
            </motion.div>

            {/* Aviso legal */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="rounded-2xl bg-amber-500/5 border border-amber-500/25 p-5 space-y-3" data-testid="legal-notice-card">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <h2 className="text-amber-300 font-semibold text-base">Aviso legal</h2>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">
                    Los datos mostrados en esta plataforma relacionados con mercados financieros y criptomonedas son únicamente
                    informativos. No constituyen asesoramiento financiero ni representan una invitación a invertir.
                    La plataforma no está habilitada para realizar inversiones.
                </p>
                <p className="text-slate-400 text-sm leading-relaxed">
                    LIONSBIT VERIFICACION es una plataforma operada por Lions Advisory Group LLC. Toda comunicación oficial se
                    realiza exclusivamente desde los canales indicados en esta página. Ante cualquier duda sobre la autenticidad
                    de un mensaje, contacte con <a href="mailto:info@paylionsbit.es" className="text-[#7CB1E5] hover:underline">info@paylionsbit.es</a>.
                </p>
            </motion.div>

            <p className="text-slate-600 text-xs text-center pt-2">© 2026 LIONSBIT VERIFICACION · Lions Advisory Group LLC. Todos los derechos reservados.</p>
        </div>
    </div>
);

export default LegalPage;
