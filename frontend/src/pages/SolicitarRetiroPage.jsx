import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { motion } from 'framer-motion';
import { Building2, Bitcoin, ChevronRight, Banknote } from 'lucide-react';

const MethodCard = ({ icon: Icon, iconColor, iconBg, title, desc, tags, onClick, testId }) => (
    <motion.button
        type="button" onClick={onClick} whileHover={{ y: -3 }}
        className="w-full text-left rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-600 transition-colors p-6 flex items-start gap-4 group"
        data-testid={testId}>
        <div className={`w-14 h-14 rounded-2xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
            <Icon className={`w-7 h-7 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-white text-lg font-bold flex items-center gap-2">
                {title}
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:translate-x-1 transition-transform" />
            </p>
            <p className="text-slate-400 text-sm mt-1 leading-relaxed">{desc}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
                {tags.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-semibold uppercase tracking-wide">{t}</span>
                ))}
            </div>
        </div>
    </motion.button>
);

export default function SolicitarRetiroPage() {
    const navigate = useNavigate();
    return (
        <Layout>
            <div className="max-w-2xl mx-auto space-y-6" data-testid="solicitar-retiro-page">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
                        <Banknote className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Solicitar retiro</h1>
                        <p className="text-sm text-slate-400 font-light">Elija el método para recibir sus fondos</p>
                    </div>
                </div>
                <div className="space-y-3">
                    <MethodCard icon={Building2} iconColor="text-sky-400" iconBg="bg-sky-500/10 border border-sky-500/25"
                        title="Transferencia bancaria"
                        desc="Reciba sus fondos directamente en su cuenta bancaria mediante transferencia SEPA/SWIFT con verificación IBAN."
                        tags={['SEPA / SWIFT', 'EUR', 'IBAN verificado']}
                        onClick={() => navigate('/wallet/bank-withdrawal')}
                        testId="method-bank-transfer" />
                    <MethodCard icon={Bitcoin} iconColor="text-amber-400" iconBg="bg-amber-500/10 border border-amber-500/25"
                        title="Bitcoin (BTC)"
                        desc="Reciba el equivalente en Bitcoin en su propia billetera. Validación automática de la dirección y TXID verificable en el explorador público."
                        tags={['Red Bitcoin', '1 / 3 / bc1q / bc1p', 'TXID verificable']}
                        onClick={() => navigate('/wallet/retiro-btc')}
                        testId="method-btc" />
                </div>
            </div>
        </Layout>
    );
}
