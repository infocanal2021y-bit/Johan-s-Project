import { useState, useRef, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Shield, Clock, X, ChevronDown, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

const MexicoLogo = () => (
    <svg viewBox="0 0 780 500" className="w-full h-full">
        <rect width="780" height="500" rx="40" fill="#006847" />
        <rect x="260" y="0" width="260" height="500" fill="white" />
        <rect x="520" y="0" width="260" height="500" fill="#CE1126" />
        <rect x="520" y="0" width="220" height="500" fill="#CE1126" />
        <rect x="740" y="0" width="40" height="500" rx="40" fill="#CE1126" />
        <circle cx="390" cy="250" r="50" fill="#006847" opacity="0.3" />
        <text x="390" y="260" textAnchor="middle" dominantBaseline="central" fill="#006847" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="40">MX</text>
    </svg>
);

const ChileLogo = () => (
    <svg viewBox="0 0 780 500" className="w-full h-full">
        <rect width="780" height="500" rx="40" fill="#D52B1E" />
        <rect y="0" width="780" height="250" fill="white" />
        <rect x="0" y="0" width="40" height="250" rx="40" fill="white" />
        <rect x="0" y="0" width="260" height="250" fill="#0039A6" />
        <polygon points="130,70 143,115 190,115 152,142 165,187 130,160 95,187 108,142 70,115 117,115" fill="white" />
        <rect x="0" y="0" width="40" height="500" rx="40" fill="#0039A6" />
        <rect x="0" y="250" width="40" height="250" fill="#D52B1E" />
    </svg>
);

const BANKS = {
    mexico: [
        { name: 'BBVA Mexico', color: '#004B93' },
        { name: 'Banorte', color: '#E3000B' },
        { name: 'Santander Mexico', color: '#EC0000' },
        { name: 'Citibanamex', color: '#056DAE' },
        { name: 'HSBC Mexico', color: '#DB0011' },
    ],
    chile: [
        { name: 'Banco de Chile', color: '#002D72' },
        { name: 'BancoEstado', color: '#009A3B' },
        { name: 'Banco BCI', color: '#E87722' },
        { name: 'Scotiabank Chile', color: '#EC111A' },
        { name: 'Itau Chile', color: '#003A70' },
    ],
};

const SIMPLE_METHODS = [
    { id: 'visa', name: 'Visa', Logo: VisaLogo },
    { id: 'mastercard', name: 'Mastercard', Logo: MastercardLogo },
    { id: 'skrill', name: 'Skrill', Logo: SkrillLogo },
    { id: 'bank', name: 'Transferencia Bancaria', Logo: BankLogo },
];

const COUNTRY_METHODS = [
    { id: 'mexico', name: 'Bancos de Mexico', Logo: MexicoLogo, banks: BANKS.mexico },
    { id: 'chile', name: 'Bancos de Chile', Logo: ChileLogo, banks: BANKS.chile },
];

export default function WithdrawMethodsPage() {
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedMethod, setSelectedMethod] = useState('');
    const [openDropdown, setOpenDropdown] = useState(null);
    const dropdownRef = useRef(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpenDropdown(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSimpleClick = (name) => {
        setSelectedMethod(name);
        setModalOpen(true);
    };

    const handleCountryClick = (id) => {
        setOpenDropdown(openDropdown === id ? null : id);
    };

    const handleBankClick = (bankName) => {
        setOpenDropdown(null);
        setSelectedMethod(bankName);
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

                {/* Simple Methods */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5">
                    {SIMPLE_METHODS.map((m) => (
                        <button
                            key={m.id}
                            onClick={() => handleSimpleClick(m.name)}
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

                {/* Country Bank Methods with Dropdowns */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5" ref={dropdownRef}>
                    {COUNTRY_METHODS.map((cm) => (
                        <div key={cm.id} className="relative" data-testid={`country-method-${cm.id}`}>
                            <button
                                onClick={() => handleCountryClick(cm.id)}
                                data-testid={`method-card-${cm.id}`}
                                className={`group w-full flex items-center gap-4 rounded-2xl border p-4 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
                                    openDropdown === cm.id
                                        ? 'bg-white/[0.07] border-slate-500 shadow-xl shadow-black/20'
                                        : 'bg-white/[0.04] border-slate-700/60 hover:border-slate-500 hover:bg-white/[0.07]'
                                }`}
                            >
                                <div className="w-16 h-10 rounded-lg overflow-hidden shadow-md flex-shrink-0">
                                    <cm.Logo />
                                </div>
                                <span className="text-white font-medium text-sm flex-1 text-left">{cm.name}</span>
                                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${openDropdown === cm.id ? 'rotate-180 text-white' : ''}`} />
                            </button>

                            <AnimatePresence>
                                {openDropdown === cm.id && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                                        className="overflow-hidden"
                                    >
                                        <div className="mt-2 rounded-xl border border-slate-700/60 bg-slate-900/90 backdrop-blur-sm overflow-hidden max-h-[280px] overflow-y-auto" data-testid={`bank-list-${cm.id}`}>
                                            {cm.banks.map((bank, i) => (
                                                <button
                                                    key={bank.name}
                                                    onClick={() => handleBankClick(bank.name)}
                                                    data-testid={`bank-item-${cm.id}-${i}`}
                                                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.06] transition-colors border-b border-slate-800/50 last:border-b-0"
                                                >
                                                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${bank.color}20` }}>
                                                        <Building2 className="w-4 h-4" style={{ color: bank.color }} />
                                                    </div>
                                                    <span className="text-slate-200 text-sm font-medium text-left">{bank.name}</span>
                                                    <span className="ml-auto text-slate-600 text-xs">Seleccionar</span>
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
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
