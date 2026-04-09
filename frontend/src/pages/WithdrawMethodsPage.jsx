import { useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Shield, Clock, X } from 'lucide-react';

const VisaLogo = () => (
    <svg viewBox="0 0 780 500" className="w-full h-full">
        <rect width="780" height="500" rx="40" fill="#1A1F71" />
        <path d="M293.2 348.7l33.4-195.8h53.3l-33.4 195.8H293.2zM540.7 157.2c-10.5-4-27.1-8.3-47.7-8.3-52.6 0-89.7 26.5-89.9 64.5-.3 28.1 26.5 43.7 46.7 53.1 20.8 9.6 27.8 15.7 27.7 24.3-.1 13.1-16.6 19.1-31.9 19.1-21.4 0-32.7-3-50.3-10.2l-6.9-3.1-7.5 43.8c12.5 5.5 35.5 10.2 59.5 10.5 56 0 92.3-26.2 92.6-66.8.2-22.3-14-39.2-44.8-53.2-18.6-9.1-30.1-15.1-30-24.3 0-8.1 9.7-16.8 30.6-16.8 17.4-.3 30.1 3.5 39.9 7.5l4.8 2.3 7.2-42.4zM645.4 152.9h-41.2c-12.7 0-22.3 3.5-27.9 16.2l-79 179.6h55.9s9.1-24.1 11.2-29.4c6.1 0 60.3.1 68 .1 1.6 6.9 6.5 29.3 6.5 29.3h49.5L645.4 152.9zm-65.4 126c4.4-11.3 21.2-54.7 21.2-54.7-.3.5 4.4-11.3 7-18.6l3.6 16.8s10.2 46.6 12.3 56.5h-44.1zM231.4 152.9l-52.2 133.5-5.6-27c-9.7-31.2-39.8-65-73.5-81.9l47.7 171.8h56.4l83.9-196.4h-56.8z" fill="white"/>
        <path d="M146.9 152.9H60.9l-.7 4c66.9 16.2 111.2 55.3 129.6 102.3L171.5 169c-3.2-12.4-12.6-15.7-24.6-16.1z" fill="#F9A533"/>
    </svg>
);

const MastercardLogo = () => (
    <svg viewBox="0 0 780 500" className="w-full h-full">
        <rect width="780" height="500" rx="40" fill="#252525" />
        <circle cx="310" cy="250" r="130" fill="#EB001B" />
        <circle cx="470" cy="250" r="130" fill="#F79E1B" />
        <path d="M390 150.7c-33.1 26.3-54.3 66.8-54.3 112.3s21.2 86 54.3 112.3c33.1-26.3 54.3-66.8 54.3-112.3s-21.2-86-54.3-112.3z" fill="#FF5F00" />
    </svg>
);

const SkrillLogo = () => (
    <svg viewBox="0 0 780 500" className="w-full h-full">
        <rect width="780" height="500" rx="40" fill="#862165" />
        <text x="390" y="270" textAnchor="middle" dominantBaseline="central" fill="white" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="140">Skrill</text>
    </svg>
);

const CryptoLogo = () => (
    <svg viewBox="0 0 780 500" className="w-full h-full">
        <rect width="780" height="500" rx="40" fill="#1a1a2e" />
        <circle cx="270" cy="250" r="90" fill="#F7931A" />
        <text x="270" y="265" textAnchor="middle" dominantBaseline="central" fill="white" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="100">B</text>
        <circle cx="430" cy="200" r="55" fill="#627EEA" />
        <text x="430" y="212" textAnchor="middle" dominantBaseline="central" fill="white" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="48">E</text>
        <circle cx="540" cy="300" r="55" fill="#26A17B" />
        <text x="540" y="312" textAnchor="middle" dominantBaseline="central" fill="white" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="42">T</text>
    </svg>
);

const BankLogo = () => (
    <svg viewBox="0 0 780 500" className="w-full h-full">
        <rect width="780" height="500" rx="40" fill="#0A2540" />
        <path d="M390 100l-180 90v20h360v-20L390 100z" fill="#00D4AA" />
        <rect x="250" y="230" width="40" height="130" rx="4" fill="#00D4AA" />
        <rect x="330" y="230" width="40" height="130" rx="4" fill="#00D4AA" />
        <rect x="410" y="230" width="40" height="130" rx="4" fill="#00D4AA" />
        <rect x="490" y="230" width="40" height="130" rx="4" fill="#00D4AA" />
        <rect x="220" y="370" width="340" height="30" rx="4" fill="#00D4AA" />
    </svg>
);

const METHODS = [
    { id: 'visa', name: 'Visa', Logo: VisaLogo },
    { id: 'mastercard', name: 'Mastercard', Logo: MastercardLogo },
    { id: 'skrill', name: 'Skrill', Logo: SkrillLogo },
    { id: 'crypto', name: 'Criptomonedas', Logo: CryptoLogo },
    { id: 'bank', name: 'Transferencia Bancaria', Logo: BankLogo },
];

export default function WithdrawMethodsPage() {
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedMethod, setSelectedMethod] = useState('');

    const handleClick = (name) => {
        setSelectedMethod(name);
        setModalOpen(true);
    };

    return (
        <Layout>
            <div className="max-w-5xl mx-auto space-y-8" data-testid="withdraw-methods-page">
                {/* Header */}
                <div className="text-center space-y-2">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">
                        Metodos de retiro
                    </h1>
                    <p className="text-slate-400 text-sm max-w-xl mx-auto">
                        Seleccione el metodo de retiro de su preferencia para gestionar sus fondos de forma segura.
                    </p>
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-5" data-testid="methods-grid">
                    {METHODS.map((m) => (
                        <button
                            key={m.id}
                            onClick={() => handleClick(m.name)}
                            data-testid={`method-card-${m.id}`}
                            className="group flex flex-col items-center rounded-2xl bg-white/[0.04] border border-slate-700/60 hover:border-slate-500 hover:bg-white/[0.07] p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                        >
                            <div className="w-full aspect-[1.6] rounded-xl overflow-hidden mb-4 shadow-md group-hover:shadow-lg transition-shadow">
                                <m.Logo />
                            </div>
                            <span className="text-white text-sm font-medium text-center leading-tight">{m.name}</span>
                        </button>
                    ))}
                </div>

                {/* Trust bar */}
                <div className="flex items-center justify-center gap-6 py-3">
                    <div className="flex items-center gap-2 text-slate-500 text-xs">
                        <Shield className="w-4 h-4 text-emerald-500" />
                        <span>Conexion segura SSL</span>
                    </div>
                    <div className="w-px h-4 bg-slate-700" />
                    <div className="flex items-center gap-2 text-slate-500 text-xs">
                        <Clock className="w-4 h-4 text-cyan-500" />
                        <span>Procesamiento rapido</span>
                    </div>
                </div>
            </div>

            {/* Modal */}
            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="bg-slate-900 border-slate-700 max-w-sm" data-testid="method-modal">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <Clock className="w-5 h-5 text-amber-400" />
                            Metodo no disponible
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-slate-300 text-sm">
                            El metodo de retiro <strong className="text-white">{selectedMethod}</strong> estara habilitado proximamente.
                        </p>
                        <Button onClick={() => setModalOpen(false)} className="w-full bg-slate-800 hover:bg-slate-700 text-white" data-testid="modal-close-btn">
                            <X className="w-4 h-4 mr-2" /> Cerrar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </Layout>
    );
}
