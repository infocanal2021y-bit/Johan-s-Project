import { motion } from 'framer-motion';
import { Building2, FileText, Landmark, Phone, Mail } from 'lucide-react';

const ITEMS = [
    { icon: Building2, label: 'Company Name', value: 'Lions Advisory Group LLC', testid: 'corp-company' },
    { icon: FileText, label: 'Filing ID', value: '2026-001987773', mono: true, testid: 'corp-filing' },
    { icon: Landmark, label: 'State of Formation', value: 'Wyoming', testid: 'corp-state' },
    { icon: Phone, label: 'Phone Number', value: '+1 814-399-7566', mono: true, testid: 'corp-phone', href: 'tel:+18143997566' },
    { icon: Mail, label: 'Email Address', value: 'info@paylionsbit.es', testid: 'corp-email', href: 'mailto:info@paylionsbit.es' },
];

export const CorporateInfoCard = () => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28 }}
        className="rounded-2xl bg-slate-900/70 border border-slate-800 overflow-hidden"
        data-testid="corporate-info-card"
    >
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-800 bg-slate-800/30">
            <div className="w-9 h-9 rounded-xl bg-[#1973B8]/15 border border-[#1973B8]/30 flex items-center justify-center">
                <Building2 className="w-4.5 h-4.5 text-[#7CB1E5]" style={{ width: 18, height: 18 }} />
            </div>
            <div>
                <h2 className="text-white font-semibold text-base">Información corporativa</h2>
                <p className="text-slate-500 text-xs">Datos oficiales de registro de la entidad</p>
            </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y lg:divide-y-0 lg:divide-x divide-slate-800/60">
            {ITEMS.map(({ icon: Icon, label, value, mono, testid, href }) => (
                <div key={label} className="px-5 py-4 flex flex-col gap-1" data-testid={testid}>
                    <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                        <Icon className="w-3.5 h-3.5 text-[#7CB1E5]" /> {label}
                    </span>
                    {href ? (
                        <a href={href} className={`text-white text-sm font-medium hover:text-[#7CB1E5] transition-colors ${mono ? 'font-mono' : ''}`}>
                            {value}
                        </a>
                    ) : (
                        <span className={`text-white text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</span>
                    )}
                </div>
            ))}
        </div>
    </motion.div>
);
