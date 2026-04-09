import { useState, useRef, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Shield, Clock, X, ChevronDown, Building2, Globe, CreditCard, Banknote } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/* ─── SVG Logos ─── */
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

const BankTransferLogo = () => (
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

const CryptoLogo = () => (
    <svg viewBox="0 0 780 500" className="w-full h-full">
        <rect width="780" height="500" rx="40" fill="#0D1117" />
        <circle cx="280" cy="250" r="80" fill="#F7931A" />
        <text x="280" y="265" textAnchor="middle" dominantBaseline="central" fill="white" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="80">B</text>
        <circle cx="500" cy="250" r="80" fill="#627EEA" />
        <text x="500" y="258" textAnchor="middle" dominantBaseline="central" fill="white" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="70">E</text>
    </svg>
);

const PayPalLogo = () => (
    <svg viewBox="0 0 780 500" className="w-full h-full">
        <rect width="780" height="500" rx="40" fill="#003087" />
        <text x="390" y="260" textAnchor="middle" dominantBaseline="central" fill="#009CDE" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="110">Pay</text>
        <text x="390" y="260" textAnchor="middle" dominantBaseline="central" fill="white" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="110" dx="95">Pal</text>
    </svg>
);

const WiseLogo = () => (
    <svg viewBox="0 0 780 500" className="w-full h-full">
        <rect width="780" height="500" rx="40" fill="#9FE870" />
        <text x="390" y="270" textAnchor="middle" dominantBaseline="central" fill="#163300" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="150">Wise</text>
    </svg>
);

const SwiftLogo = () => (
    <svg viewBox="0 0 780 500" className="w-full h-full">
        <rect width="780" height="500" rx="40" fill="#E31837" />
        <text x="390" y="270" textAnchor="middle" dominantBaseline="central" fill="white" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="130">SWIFT</text>
    </svg>
);

const MexicoFlag = () => (
    <svg viewBox="0 0 60 40" className="w-full h-full rounded">
        <rect width="20" height="40" fill="#006847" />
        <rect x="20" width="20" height="40" fill="white" />
        <rect x="40" width="20" height="40" fill="#CE1126" />
        <circle cx="30" cy="20" r="6" fill="#006847" opacity="0.4" />
    </svg>
);

const ChileFlag = () => (
    <svg viewBox="0 0 60 40" className="w-full h-full rounded">
        <rect y="0" width="60" height="20" fill="white" />
        <rect y="20" width="60" height="20" fill="#D52B1E" />
        <rect x="0" y="0" width="20" height="20" fill="#0039A6" />
        <polygon points="10,4 12,9 17,9 13,12 14,17 10,14 6,17 7,12 3,9 8,9" fill="white" />
    </svg>
);

const ColombiaFlag = () => (
    <svg viewBox="0 0 60 40" className="w-full h-full rounded">
        <rect width="60" height="20" fill="#FCD116" />
        <rect y="20" width="60" height="10" fill="#003893" />
        <rect y="30" width="60" height="10" fill="#CE1126" />
    </svg>
);

/* ─── Data ─── */
const PAYMENT_METHODS = [
    { id: 'visa', name: 'Visa', desc: 'Tarjeta de credito / debito', Logo: VisaLogo },
    { id: 'mastercard', name: 'Mastercard', desc: 'Tarjeta de credito / debito', Logo: MastercardLogo },
    { id: 'skrill', name: 'Skrill', desc: 'Monedero electronico', Logo: SkrillLogo },
    { id: 'bank-transfer', name: 'Transferencia Bancaria', desc: 'Transferencia directa', Logo: BankTransferLogo },
];

const INTERNATIONAL_METHODS = [
    { id: 'crypto', name: 'Criptomonedas', desc: 'Bitcoin / USDT / ETH', Logo: CryptoLogo },
    { id: 'paypal', name: 'PayPal', desc: 'Pago digital global', Logo: PayPalLogo },
    { id: 'wise', name: 'Wise', desc: 'Transferencia internacional', Logo: WiseLogo },
    { id: 'swift', name: 'SWIFT', desc: 'Transferencia interbancaria', Logo: SwiftLogo },
];

const COUNTRY_BANKS = [
    {
        id: 'mexico',
        name: 'Bancos de Mexico',
        Flag: MexicoFlag,
        accent: '#006847',
        banks: [
            { name: 'BBVA Mexico', color: '#004B93' },
            { name: 'Banorte', color: '#E3000B' },
            { name: 'Santander Mexico', color: '#EC0000' },
            { name: 'Citibanamex', color: '#056DAE' },
            { name: 'HSBC Mexico', color: '#DB0011' },
        ],
    },
    {
        id: 'chile',
        name: 'Bancos de Chile',
        Flag: ChileFlag,
        accent: '#0039A6',
        banks: [
            { name: 'Banco de Chile', color: '#002D72' },
            { name: 'BancoEstado', color: '#009A3B' },
            { name: 'Banco BCI', color: '#E87722' },
            { name: 'Scotiabank Chile', color: '#EC111A' },
            { name: 'Itau Chile', color: '#003A70' },
        ],
    },
    {
        id: 'colombia',
        name: 'Bancos de Colombia',
        Flag: ColombiaFlag,
        accent: '#FCD116',
        banks: [
            { name: 'Bancolombia', color: '#FDDA24' },
            { name: 'Banco de Bogota', color: '#00529B' },
            { name: 'Davivienda', color: '#ED1C24' },
            { name: 'BBVA Colombia', color: '#004B93' },
            { name: 'Banco de Occidente', color: '#003F72' },
        ],
    },
];

/* ─── Card component ─── */
const MethodCard = ({ name, desc, Logo, onClick, testId }) => (
    <button
        onClick={onClick}
        data-testid={testId}
        className="group flex flex-col items-center rounded-2xl bg-slate-800/60 border border-slate-700/50 p-5 transition-all duration-300 hover:border-slate-500/70 hover:bg-slate-800/90 hover:-translate-y-1.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.35)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
    >
        <div className="w-full aspect-[1.6] rounded-xl overflow-hidden mb-4 shadow-md group-hover:shadow-lg transition-shadow">
            <Logo />
        </div>
        <span className="text-white text-sm font-semibold text-center leading-tight">{name}</span>
        <span className="text-slate-500 text-xs mt-1 text-center leading-snug">{desc}</span>
    </button>
);

/* ─── Section title ─── */
const SectionTitle = ({ icon: Icon, title, iconColor }) => (
    <div className="flex items-center gap-3 mb-5">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconColor}`}>
            <Icon className="w-4.5 h-4.5" />
        </div>
        <h2 className="text-white text-lg font-bold tracking-tight">{title}</h2>
    </div>
);

/* ─── Main Page ─── */
export default function WithdrawMethodsPage() {
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedMethod, setSelectedMethod] = useState('');
    const [openDropdown, setOpenDropdown] = useState(null);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpenDropdown(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const openModal = (name) => {
        setSelectedMethod(name);
        setModalOpen(true);
    };

    const toggleDropdown = (id) => {
        setOpenDropdown(openDropdown === id ? null : id);
    };

    const handleBankClick = (bankName) => {
        setOpenDropdown(null);
        openModal(bankName);
    };

    return (
        <Layout>
            <div className="max-w-5xl mx-auto space-y-10" data-testid="withdraw-methods-page">
                {/* Header */}
                <div className="text-center space-y-2">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                        Metodos de Pago
                    </h1>
                    <p className="text-slate-400 text-sm max-w-xl mx-auto">
                        Seleccione su metodo preferido para gestionar sus fondos de forma segura y rapida.
                    </p>
                </div>

                {/* ── Section 1: Métodos de pago ── */}
                <section>
                    <SectionTitle icon={CreditCard} title="Metodos de Pago" iconColor="bg-cyan-500/20 text-cyan-400" />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" data-testid="payment-methods-grid">
                        {PAYMENT_METHODS.map((m) => (
                            <MethodCard key={m.id} name={m.name} desc={m.desc} Logo={m.Logo} onClick={() => openModal(m.name)} testId={`method-card-${m.id}`} />
                        ))}
                    </div>
                </section>

                {/* ── Section 2: Pagos internacionales ── */}
                <section>
                    <SectionTitle icon={Globe} title="Pagos Internacionales" iconColor="bg-violet-500/20 text-violet-400" />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" data-testid="international-methods-grid">
                        {INTERNATIONAL_METHODS.map((m) => (
                            <MethodCard key={m.id} name={m.name} desc={m.desc} Logo={m.Logo} onClick={() => openModal(m.name)} testId={`method-card-${m.id}`} />
                        ))}
                    </div>
                </section>

                {/* ── Section 3: Bancos por país ── */}
                <section>
                    <SectionTitle icon={Banknote} title="Bancos por Pais" iconColor="bg-emerald-500/20 text-emerald-400" />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" ref={dropdownRef} data-testid="country-banks-grid">
                        {COUNTRY_BANKS.map((country) => (
                            <div key={country.id} className="relative" data-testid={`country-method-${country.id}`}>
                                {/* Country toggle */}
                                <button
                                    onClick={() => toggleDropdown(country.id)}
                                    data-testid={`method-card-${country.id}`}
                                    className={`w-full flex items-center gap-3.5 rounded-2xl border p-4 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
                                        openDropdown === country.id
                                            ? 'bg-slate-800/90 border-slate-500/70 shadow-[0_8px_30px_rgba(0,0,0,0.35)]'
                                            : 'bg-slate-800/60 border-slate-700/50 hover:border-slate-500/70 hover:bg-slate-800/90'
                                    }`}
                                >
                                    <div className="w-10 h-7 rounded overflow-hidden shadow flex-shrink-0">
                                        <country.Flag />
                                    </div>
                                    <span className="text-white font-semibold text-sm flex-1 text-left">{country.name}</span>
                                    <ChevronDown className={`w-4.5 h-4.5 text-slate-400 transition-transform duration-300 ${openDropdown === country.id ? 'rotate-180 text-white' : ''}`} />
                                </button>

                                {/* Bank list dropdown */}
                                <AnimatePresence>
                                    {openDropdown === country.id && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.25, ease: 'easeInOut' }}
                                            className="overflow-hidden"
                                        >
                                            <div className="mt-2 rounded-xl border border-slate-700/60 bg-slate-900/95 backdrop-blur-md overflow-hidden" data-testid={`bank-list-${country.id}`}>
                                                {country.banks.map((bank, i) => (
                                                    <button
                                                        key={bank.name}
                                                        onClick={() => handleBankClick(bank.name)}
                                                        data-testid={`bank-item-${country.id}-${i}`}
                                                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.05] transition-colors border-b border-slate-800/50 last:border-b-0"
                                                    >
                                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${bank.color}18` }}>
                                                            <Building2 className="w-3.5 h-3.5" style={{ color: bank.color }} />
                                                        </div>
                                                        <span className="text-slate-200 text-sm font-medium text-left flex-1">{bank.name}</span>
                                                        <span className="text-slate-600 text-[11px]">Seleccionar</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Trust bar */}
                <div className="flex items-center justify-center gap-6 pt-2 pb-4">
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
                            El metodo <strong className="text-white">{selectedMethod}</strong> estara habilitado proximamente.
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
