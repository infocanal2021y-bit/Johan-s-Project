import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { accountsAPI, transactionsAPI, authAPI, engagementAPI } from '../lib/api';
import { OdometerValue } from '../components/dashboard/OdometerValue';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
    Upload, Loader2, Clock, AlertCircle, CheckCircle, Building2, 
    CreditCard, Globe, User, AlertTriangle, Shield, BadgeCheck, Hourglass, Bitcoin, DollarSign,
    Landmark, Receipt, FileCheck, Copy, Check, Lock
} from 'lucide-react';
import { toast } from 'sonner';
import { CryptoPaymentSection } from '../components/crypto/CryptoPaymentSection';
import { InvestmentPopup } from '../components/InvestmentPopup';
import { PartialUnlockPanel } from '../components/withdraw/PartialUnlockPanel';

// Banks grouped by country
const BANKS_BY_COUNTRY = {
    'ES': [
        { code: '0049', name: 'Santander' }, { code: '0182', name: 'BBVA' },
        { code: '2100', name: 'CaixaBank' }, { code: '0081', name: 'Banco Sabadell' },
        { code: '0128', name: 'Bankinter' }, { code: '2103', name: 'Unicaja Banco' },
        { code: '2095', name: 'Kutxabank' }, { code: '2080', name: 'Abanca' },
        { code: '2085', name: 'Ibercaja' }, { code: '3058', name: 'Cajamar' },
        { code: '0239', name: 'EVO Banco' }, { code: '0073', name: 'Openbank' },
        { code: '1465', name: 'ING España' }, { code: '0019', name: 'Deutsche Bank España' },
    ],
    'MX': [
        { code: 'MX01', name: 'BBVA México' }, { code: 'MX02', name: 'Banorte' },
        { code: 'MX03', name: 'Santander México' }, { code: 'MX04', name: 'Citibanamex' },
        { code: 'MX05', name: 'HSBC México' }, { code: 'MX06', name: 'Scotiabank México' },
        { code: 'MX07', name: 'Banco Azteca' }, { code: 'MX08', name: 'Inbursa' },
        { code: 'MX09', name: 'BanCoppel' }, { code: 'MX10', name: 'Nu México' },
    ],
    'CO': [
        { code: 'CO01', name: 'Bancolombia' }, { code: 'CO02', name: 'Banco de Bogotá' },
        { code: 'CO03', name: 'Davivienda' }, { code: 'CO04', name: 'BBVA Colombia' },
        { code: 'CO05', name: 'Banco de Occidente' }, { code: 'CO06', name: 'Nequi' },
    ],
    'AR': [
        { code: 'AR01', name: 'Banco Nación' }, { code: 'AR02', name: 'Banco Galicia' },
        { code: 'AR03', name: 'Banco Santander Río' }, { code: 'AR04', name: 'BBVA Argentina' },
        { code: 'AR05', name: 'Banco Macro' }, { code: 'AR06', name: 'Mercado Pago' },
    ],
    'CL': [
        { code: 'CL01', name: 'Banco de Chile' }, { code: 'CL02', name: 'BancoEstado' },
        { code: 'CL03', name: 'Santander Chile' }, { code: 'CL04', name: 'BCI' },
    ],
    'PE': [
        { code: 'PE01', name: 'BCP' }, { code: 'PE02', name: 'Interbank' },
        { code: 'PE03', name: 'BBVA Perú' }, { code: 'PE04', name: 'Scotiabank Perú' },
    ],
    'EC': [
        { code: 'EC01', name: 'Banco Pichincha' }, { code: 'EC02', name: 'Banco del Pacífico' },
        { code: 'EC03', name: 'Produbanco' },
    ],
    'US': [
        { code: 'US01', name: 'Bank of America' }, { code: 'US02', name: 'Chase (JPMorgan)' },
        { code: 'US03', name: 'Wells Fargo' }, { code: 'US04', name: 'Citibank' },
        { code: 'US05', name: 'Capital One' },
    ],
    'BR': [
        { code: 'BR01', name: 'Banco do Brasil' }, { code: 'BR02', name: 'Itaú Unibanco' },
        { code: 'BR03', name: 'Bradesco' }, { code: 'BR04', name: 'Nubank' },
    ],
    'GB': [
        { code: 'GB01', name: 'HSBC' }, { code: 'GB02', name: 'Barclays' },
        { code: 'GB03', name: 'Lloyds Bank' }, { code: 'GB04', name: 'Revolut' },
    ],
    'DE': [
        { code: 'DE01', name: 'Deutsche Bank' }, { code: 'DE02', name: 'Commerzbank' }, { code: 'DE03', name: 'N26' },
    ],
    'FR': [
        { code: 'FR01', name: 'BNP Paribas' }, { code: 'FR02', name: 'Société Générale' },
        { code: 'FR03', name: 'Crédit Agricole' },
    ],
    'IT': [
        { code: 'IT01', name: 'UniCredit' }, { code: 'IT02', name: 'Intesa Sanpaolo' },
    ],
    'PT': [
        { code: 'PT01', name: 'Millennium BCP' }, { code: 'PT02', name: 'Caixa Geral de Depósitos' },
    ],
};

// All countries worldwide
const ALL_COUNTRIES = {
    // Europe (IBAN)
    'ES': { name: 'España', flag: '🇪🇸', iban: true },
    'FR': { name: 'Francia', flag: '🇫🇷', iban: true },
    'DE': { name: 'Alemania', flag: '🇩🇪', iban: true },
    'IT': { name: 'Italia', flag: '🇮🇹', iban: true },
    'PT': { name: 'Portugal', flag: '🇵🇹', iban: true },
    'GB': { name: 'Reino Unido', flag: '🇬🇧', iban: true },
    'NL': { name: 'Países Bajos', flag: '🇳🇱', iban: true },
    'BE': { name: 'Bélgica', flag: '🇧🇪', iban: true },
    'AT': { name: 'Austria', flag: '🇦🇹', iban: true },
    'CH': { name: 'Suiza', flag: '🇨🇭', iban: true },
    'PL': { name: 'Polonia', flag: '🇵🇱', iban: true },
    'CZ': { name: 'República Checa', flag: '🇨🇿', iban: true },
    'SE': { name: 'Suecia', flag: '🇸🇪', iban: true },
    'NO': { name: 'Noruega', flag: '🇳🇴', iban: true },
    'DK': { name: 'Dinamarca', flag: '🇩🇰', iban: true },
    'FI': { name: 'Finlandia', flag: '🇫🇮', iban: true },
    'IE': { name: 'Irlanda', flag: '🇮🇪', iban: true },
    'LU': { name: 'Luxemburgo', flag: '🇱🇺', iban: true },
    'GR': { name: 'Grecia', flag: '🇬🇷', iban: true },
    'RO': { name: 'Rumanía', flag: '🇷🇴', iban: true },
    'HU': { name: 'Hungría', flag: '🇭🇺', iban: true },
    'SK': { name: 'Eslovaquia', flag: '🇸🇰', iban: true },
    'BG': { name: 'Bulgaria', flag: '🇧🇬', iban: true },
    'HR': { name: 'Croacia', flag: '🇭🇷', iban: true },
    'SI': { name: 'Eslovenia', flag: '🇸🇮', iban: true },
    'EE': { name: 'Estonia', flag: '🇪🇪', iban: true },
    'LV': { name: 'Letonia', flag: '🇱🇻', iban: true },
    'LT': { name: 'Lituania', flag: '🇱🇹', iban: true },
    'CY': { name: 'Chipre', flag: '🇨🇾', iban: true },
    'MT': { name: 'Malta', flag: '🇲🇹', iban: true },
    'AE': { name: 'Emiratos Árabes', flag: '🇦🇪', iban: true },
    'SA': { name: 'Arabia Saudita', flag: '🇸🇦', iban: true },
    'MA': { name: 'Marruecos', flag: '🇲🇦', iban: true },
    // Americas (No IBAN)
    'US': { name: 'Estados Unidos', flag: '🇺🇸', iban: false },
    'MX': { name: 'México', flag: '🇲🇽', iban: false },
    'CO': { name: 'Colombia', flag: '🇨🇴', iban: false },
    'AR': { name: 'Argentina', flag: '🇦🇷', iban: false },
    'CL': { name: 'Chile', flag: '🇨🇱', iban: false },
    'PE': { name: 'Perú', flag: '🇵🇪', iban: false },
    'EC': { name: 'Ecuador', flag: '🇪🇨', iban: false },
    'VE': { name: 'Venezuela', flag: '🇻🇪', iban: false },
    'BO': { name: 'Bolivia', flag: '🇧🇴', iban: false },
    'PY': { name: 'Paraguay', flag: '🇵🇾', iban: false },
    'UY': { name: 'Uruguay', flag: '🇺🇾', iban: false },
    'PA': { name: 'Panamá', flag: '🇵🇦', iban: false },
    'CR': { name: 'Costa Rica', flag: '🇨🇷', iban: false },
    'DO': { name: 'Rep. Dominicana', flag: '🇩🇴', iban: false },
    'GT': { name: 'Guatemala', flag: '🇬🇹', iban: false },
    'HN': { name: 'Honduras', flag: '🇭🇳', iban: false },
    'SV': { name: 'El Salvador', flag: '🇸🇻', iban: false },
    'NI': { name: 'Nicaragua', flag: '🇳🇮', iban: false },
    'CU': { name: 'Cuba', flag: '🇨🇺', iban: false },
    'BR': { name: 'Brasil', flag: '🇧🇷', iban: false },
    'CA': { name: 'Canadá', flag: '🇨🇦', iban: false },
    // Asia & Oceania
    'CN': { name: 'China', flag: '🇨🇳', iban: false },
    'JP': { name: 'Japón', flag: '🇯🇵', iban: false },
    'IN': { name: 'India', flag: '🇮🇳', iban: false },
    'KR': { name: 'Corea del Sur', flag: '🇰🇷', iban: false },
    'PH': { name: 'Filipinas', flag: '🇵🇭', iban: false },
    'AU': { name: 'Australia', flag: '🇦🇺', iban: false },
    'NZ': { name: 'Nueva Zelanda', flag: '🇳🇿', iban: false },
    // Africa
    'NG': { name: 'Nigeria', flag: '🇳🇬', iban: false },
    'ZA': { name: 'Sudáfrica', flag: '🇿🇦', iban: false },
};

// IBAN country codes for validation
const COUNTRY_CODES = Object.fromEntries(
    Object.entries(ALL_COUNTRIES).filter(([, v]) => v.iban).map(([k, v]) => [k, { name: v.name, flag: v.flag }])
);

// IBAN lengths by country
const IBAN_LENGTHS = {
    'ES': 24, 'FR': 27, 'DE': 22, 'IT': 27, 'PT': 25, 'GB': 22, 'NL': 18,
    'BE': 16, 'AT': 20, 'CH': 21, 'PL': 28, 'CZ': 24, 'SE': 24, 'NO': 15,
    'DK': 18, 'FI': 18, 'IE': 22, 'LU': 20, 'GR': 27, 'RO': 24, 'HU': 28,
    'SK': 24, 'BG': 22, 'HR': 21, 'SI': 19, 'EE': 20, 'LV': 21, 'LT': 20,
    'CY': 28, 'MT': 31
};

// Validate IBAN using MOD 97 algorithm
const validateIBAN = (iban) => {
    const cleanIban = iban.replace(/\s/g, '').toUpperCase();
    
    if (cleanIban.length < 15 || cleanIban.length > 34) {
        return { valid: false, error: 'Longitud de IBAN inválida' };
    }
    
    const countryCode = cleanIban.substring(0, 2);
    if (!COUNTRY_CODES[countryCode]) {
        return { valid: false, error: 'Código de país no reconocido' };
    }
    
    const expectedLength = IBAN_LENGTHS[countryCode];
    if (expectedLength && cleanIban.length !== expectedLength) {
        return { valid: false, error: `El IBAN de ${COUNTRY_CODES[countryCode].name} debe tener ${expectedLength} caracteres` };
    }
    
    // Rearrange IBAN: move first 4 chars to end
    const rearranged = cleanIban.slice(4) + cleanIban.slice(0, 4);
    
    // Convert letters to numbers (A=10, B=11, etc.)
    let numericIban = '';
    for (const char of rearranged) {
        if (char >= 'A' && char <= 'Z') {
            numericIban += (char.charCodeAt(0) - 55).toString();
        } else {
            numericIban += char;
        }
    }
    
    // MOD 97 calculation
    let remainder = 0;
    for (let i = 0; i < numericIban.length; i++) {
        remainder = (remainder * 10 + parseInt(numericIban[i])) % 97;
    }
    
    if (remainder !== 1) {
        return { valid: false, error: 'El IBAN ingresado no es válido. Por favor verifique la información bancaria.' };
    }
    
    return { valid: true, error: null };
};

// Detect bank from IBAN
const detectBankFromIBAN = (iban) => {
    const cleanIban = iban.replace(/\s/g, '').toUpperCase();
    
    if (cleanIban.length < 4) return null;
    
    const countryCode = cleanIban.substring(0, 2);
    const countryInfo = ALL_COUNTRIES[countryCode];
    if (!countryInfo) return null;
    
    let detectedBank = null;
    
    // For Spanish IBANs, detect the bank from code
    if (countryCode === 'ES' && cleanIban.length >= 8) {
        const bankCode = cleanIban.substring(4, 8);
        const banks = BANKS_BY_COUNTRY['ES'] || [];
        detectedBank = banks.find(bank => bank.code === bankCode);
    }
    
    return {
        country: { name: countryInfo.name, flag: countryInfo.flag },
        countryCode,
        bank: detectedBank,
        usesIban: countryInfo.iban
    };
};

// Bank selector component that shows banks for the relevant country
const BankSelector = ({ accountMode, selectedCountry, detectedCountryCode, selectedBank, setSelectedBank, setManualBank }) => {
    // Determine which country's banks to show
    const countryCode = accountMode === 'account' ? selectedCountry : detectedCountryCode;
    const countryBanks = BANKS_BY_COUNTRY[countryCode] || [];
    
    // If no banks for this country, show all available grouped
    if (countryBanks.length === 0 && !countryCode) {
        // Show all banks grouped by country
        const allBanks = [];
        Object.entries(BANKS_BY_COUNTRY).forEach(([cc, banks]) => {
            const country = ALL_COUNTRIES[cc];
            banks.forEach(b => allBanks.push({ ...b, countryFlag: country?.flag, countryName: country?.name }));
        });
        
        return (
            <div className="space-y-2">
                <Select value={selectedBank} onValueChange={setSelectedBank}>
                    <SelectTrigger className="bg-slate-950/50 border-slate-800 text-white" data-testid="bank-selector">
                        <SelectValue placeholder="Seleccione su banco" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 max-h-72">
                        {Object.entries(BANKS_BY_COUNTRY).map(([cc, banks]) => {
                            const country = ALL_COUNTRIES[cc];
                            return banks.map((bank) => (
                                <SelectItem key={bank.code} value={bank.code} className="text-white">
                                    {country?.flag} {bank.name}
                                </SelectItem>
                            ));
                        })}
                    </SelectContent>
                </Select>
                <button type="button" onClick={() => setManualBank(true)} className="text-xs text-cyan-400 hover:text-cyan-300 underline">
                    Mi banco no aparece en la lista
                </button>
            </div>
        );
    }
    
    if (countryBanks.length === 0) {
        // No banks for selected country, go directly to manual
        setManualBank(true);
        return null;
    }

    return (
        <div className="space-y-2">
            <Select value={selectedBank} onValueChange={setSelectedBank}>
                <SelectTrigger className="bg-slate-950/50 border-slate-800 text-white" data-testid="bank-selector">
                    <SelectValue placeholder={`Seleccione banco de ${ALL_COUNTRIES[countryCode]?.name || 'su pais'}`} />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 max-h-60">
                    {countryBanks.map((bank) => (
                        <SelectItem key={bank.code} value={bank.code} className="text-white">
                            {bank.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <button type="button" onClick={() => setManualBank(true)} className="text-xs text-cyan-400 hover:text-cyan-300 underline">
                Mi banco no aparece en la lista
            </button>
        </div>
    );
};

export const WithdrawPage = () => {
    const navigate = useNavigate();
    const [accounts, setAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState('');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState('EUR');
    const [loading, setLoading] = useState(false);
    const [checkingKYC, setCheckingKYC] = useState(true);
    const [success, setSuccess] = useState(false);
    const [kycVerified, setKycVerified] = useState(false);
    const [kycPending, setKycPending] = useState(false);
    
    // Tax payment state
    const [createdTransaction, setCreatedTransaction] = useState(null);
    const [showTaxPayment, setShowTaxPayment] = useState(false);
    
    // Banking info
    const [accountHolder, setAccountHolder] = useState('');
    const [iban, setIban] = useState('');
    const [ibanValid, setIbanValid] = useState(null);
    const [ibanError, setIbanError] = useState('');
    const [selectedBank, setSelectedBank] = useState('');
    const [manualBank, setManualBank] = useState(false);
    const [customBankName, setCustomBankName] = useState('');
    const [customBankCountry, setCustomBankCountry] = useState('');
    const [customBankCity, setCustomBankCity] = useState('');
    
    // International account fields
    const [accountMode, setAccountMode] = useState('iban'); // 'iban' or 'account'
    const [selectedCountry, setSelectedCountry] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [swiftCode, setSwiftCode] = useState('');
    const [routingNumber, setRoutingNumber] = useState('');
    
    // Detected info
    const [detectedCountry, setDetectedCountry] = useState(null);
    const [detectedBank, setDetectedBank] = useState(null);
    
    // Investment popup
    const [showInvestPopup, setShowInvestPopup] = useState(false);
    const [skipInvestment, setSkipInvestment] = useState(false);
    
    // Intent detection
    const [activityScore, setActivityScore] = useState(null);
    const [withdrawVisits, setWithdrawVisits] = useState(0);

    // Check KYC status on load
    useEffect(() => {
        const checkKYC = async () => {
            try {
                const response = await authAPI.getMe();
                const user = response.data;
                const verificationStatus = user.verification_status;
                setKycVerified(verificationStatus === 'verified');
                setKycPending(verificationStatus === 'pending_verification');
            } catch (error) {
                console.error('Error checking KYC:', error);
            } finally {
                setCheckingKYC(false);
            }
        };
        checkKYC();
    }, []);

    // Track page visit and get activity score
    useEffect(() => {
        engagementAPI.trackActivity({ event_type: 'page_visit', page: '/withdraw' }).catch(() => {});
        engagementAPI.markIncomplete().catch(() => {});
        engagementAPI.getActivityScore().then(res => {
            setActivityScore(res.data?.score || 'low');
            setWithdrawVisits(res.data?.withdraw_visits || 0);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const response = await accountsAPI.getAll();
                setAccounts(response.data);
                if (response.data.length > 0) {
                    setSelectedAccount(response.data[0].id);
                }
            } catch (error) {
                toast.error('Error al cargar cuentas');
            }
        };
        fetchAccounts();
    }, []);

    // Validate IBAN on change
    useEffect(() => {
        if (iban.length >= 15) {
            const validation = validateIBAN(iban);
            setIbanValid(validation.valid);
            setIbanError(validation.error || '');
            
            if (validation.valid) {
                const detection = detectBankFromIBAN(iban);
                setDetectedCountry(detection?.country);
                setDetectedBank(detection?.bank);
                
                // Auto-select bank if detected
                if (detection?.bank) {
                    setSelectedBank(detection.bank.code);
                    setManualBank(false);
                }
            }
        } else {
            setIbanValid(null);
            setIbanError('');
            setDetectedCountry(null);
            setDetectedBank(null);
        }
    }, [iban]);

    // Intercept submit to show investment popup first
    const handleFormSubmit = (e) => {
        e.preventDefault();
        if (!skipInvestment) {
            setShowInvestPopup(true);
        } else {
            handleSubmit(e);
        }
    };

    const handleContinueWithdraw = () => {
        setSkipInvestment(true);
        // Let React re-render with skipInvestment=true, then submit
        setTimeout(() => {
            const form = document.getElementById('withdraw-form');
            if (form) form.requestSubmit();
        }, 100);
    };

    const handleInvested = async (investedAmount) => {
        // Refresh accounts after investment
        try {
            const response = await accountsAPI.getAll();
            setAccounts(response.data);
        } catch {}
    };

    // Dynamic CTA message based on activity
    const getCtaMessage = () => {
        if (withdrawVisits >= 3) return 'Esta muy cerca de finalizar su proceso. Completelo ahora.';
        if (activityScore === 'high') return 'Esta a un paso de completar su proceso';
        if (activityScore === 'medium') return 'Continue su proceso de retiro';
        return null;
    };

    const ctaMessage = getCtaMessage();

    const getSelectedAccountBalance = () => {
        const account = accounts.find(acc => acc.id === selectedAccount);
        if (!account) return 0;
        return currency === 'USD' ? account.balance_usd : account.balance_eur;
    };

    const formatIBAN = (value) => {
        const clean = value.replace(/\s/g, '').toUpperCase();
        const groups = clean.match(/.{1,4}/g) || [];
        return groups.join(' ');
    };

    const handleIBANChange = (e) => {
        const formatted = formatIBAN(e.target.value);
        setIban(formatted);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validate common fields
        if (!accountHolder.trim()) {
            toast.error('Ingrese el nombre del titular de la cuenta');
            return;
        }
        
        // Validate based on account mode
        if (accountMode === 'iban') {
            if (!ibanValid) {
                toast.error('El IBAN ingresado no es válido');
                return;
            }
        } else {
            if (!accountNumber.trim()) {
                toast.error('Ingrese el número de cuenta');
                return;
            }
            if (!selectedCountry) {
                toast.error('Seleccione el país del banco');
                return;
            }
        }
        
        // Determine bank name
        const bankName = manualBank ? customBankName : (detectedBank?.name || (
            selectedBank ? (
                Object.values(BANKS_BY_COUNTRY).flat().find(b => b.code === selectedBank)?.name
            ) : null
        ));
        if (!bankName) {
            toast.error('Seleccione o ingrese el nombre del banco');
            return;
        }
        
        const numAmount = parseFloat(amount);
        if (!selectedAccount || !amount || numAmount <= 0) {
            toast.error('Complete todos los campos requeridos');
            return;
        }

        if (numAmount > getSelectedAccountBalance()) {
            toast.error('Fondos insuficientes en esta cuenta');
            return;
        }

        setLoading(true);
        try {
            const bankCountry = accountMode === 'iban'
                ? (detectedCountry?.name || (manualBank ? customBankCountry : 'España'))
                : (ALL_COUNTRIES[selectedCountry]?.name || customBankCountry);
            
            const bankingInfo = {
                account_holder: accountHolder.trim(),
                iban: accountMode === 'iban' ? iban.replace(/\s/g, '').toUpperCase() : null,
                account_number: accountMode === 'account' ? accountNumber.trim() : null,
                swift_code: swiftCode.trim() || null,
                routing_number: routingNumber.trim() || null,
                bank_name: bankName,
                bank_country: bankCountry,
                bank_city: customBankCity || null,
                detected_bank: detectedBank,
                detected_country: detectedCountry,
                account_type: accountMode,
            };
            
            const accountRef = accountMode === 'iban' ? iban.slice(-8) : accountNumber.slice(-4);
            
            const response = await transactionsAPI.create({
                account_id: selectedAccount,
                transaction_type: 'withdraw',
                amount: numAmount,
                currency,
                description: `Retiro a ${bankingInfo.bank_name} - ${accountMode === 'iban' ? 'IBAN' : 'Cuenta'}: ${accountRef}`,
                banking_info: bankingInfo
            });
            
            // Save the created transaction and show tax payment screen
            setCreatedTransaction(response.data);
            setShowTaxPayment(true);
            engagementAPI.resolveIncomplete().catch(() => {});
            toast.success('Solicitud de retiro creada. Debe pagar el impuesto para continuar.');
            
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Error al procesar el retiro');
        } finally {
            setLoading(false);
        }
    };

    const currentBalance = getSelectedAccountBalance();

    // Cargando...ate
    if (checkingKYC) {
        return (
            <Layout>
                <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[60vh]">
                    <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                </div>
            </Layout>
        );
    }

    // KYC pending approval - user already submitted but waiting for admin
    if (kycPending) {
        return (
            <Layout>
                <div className="max-w-2xl mx-auto space-y-8" data-testid="withdraw-page-kyc-pending">
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <h1 className="text-3xl text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                            Solicitar Retiro
                        </h1>
                        <p className="text-slate-500 mt-1 font-light">Retirar fondos de su cuenta</p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1 }}
                    >
                        <Card className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/30">
                            <CardContent className="p-8 text-center">
                                <div className="w-20 h-20 bg-cyan-500/20 rounded-full mx-auto mb-6 flex items-center justify-center">
                                    <Hourglass className="w-10 h-10 text-cyan-400 animate-pulse" />
                                </div>
                                <h2 className="text-2xl text-white mb-4" style={{ fontWeight: 700 }}>
                                    Verificación en Proceso
                                </h2>
                                <p className="text-slate-400 mb-6 max-w-md mx-auto">
                                    Su documentación KYC ha sido enviada y está siendo revisada por nuestro equipo. 
                                    Una vez aprobada, podrá realizar solicitudes de retiro.
                                </p>
                                
                                <div className="space-y-4">
                                    <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 text-left">
                                        <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                                            <Clock className="w-5 h-5 text-cyan-400" />
                                            Estado de su Verificación
                                        </h3>
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                                                </div>
                                                <div>
                                                    <p className="text-white text-sm font-medium">Documentos Enviados</p>
                                                    <p className="text-slate-500 text-xs">Su documentación fue recibida correctamente</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
                                                    <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                                                </div>
                                                <div>
                                                    <p className="text-white text-sm font-medium">En Revisión</p>
                                                    <p className="text-slate-500 text-xs">Un administrador está verificando su información</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-700/50 flex items-center justify-center">
                                                    <BadgeCheck className="w-4 h-4 text-slate-500" />
                                                </div>
                                                <div>
                                                    <p className="text-slate-500 text-sm font-medium">Aprobación Pendiente</p>
                                                    <p className="text-slate-600 text-xs">Recibirá una notificación cuando sea aprobado</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                                        <p className="text-cyan-400 text-sm">
                                            <Clock className="w-4 h-4 inline mr-2" />
                                            Tiempo estimado de revisión: <strong>24-48 horas</strong>
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>
            </Layout>
        );
    }

    // KYC not verified - show warning
    if (!kycVerified) {
        return (
            <Layout>
                <div className="max-w-2xl mx-auto space-y-8" data-testid="withdraw-page-kyc-required">
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <h1 className="text-3xl text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                            Solicitar Retiro
                        </h1>
                        <p className="text-slate-500 mt-1 font-light">Retirar fondos de su cuenta</p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1 }}
                    >
                        <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30">
                            <CardContent className="p-8 text-center">
                                <div className="w-20 h-20 bg-amber-500/20 rounded-full mx-auto mb-6 flex items-center justify-center">
                                    <Shield className="w-10 h-10 text-amber-400" />
                                </div>
                                <h2 className="text-2xl text-white mb-4" style={{ fontWeight: 700 }}>
                                    Verificación de Identidad Requerida
                                </h2>
                                <p className="text-slate-400 mb-6 max-w-md mx-auto">
                                    Para continuar con la solicitud de retiro debe completar primero la verificación de identidad (KYC).
                                </p>
                                
                                <div className="space-y-4">
                                    <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 text-left">
                                        <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                                            <BadgeCheck className="w-5 h-5 text-emerald-400" />
                                            ¿Por qué es necesaria la verificación?
                                        </h3>
                                        <ul className="text-sm text-slate-400 space-y-1">
                                            <li>• Proteger su cuenta contra fraudes</li>
                                            <li>• Cumplir con regulaciones financieras</li>
                                            <li>• Asegurar que los fondos lleguen al titular correcto</li>
                                        </ul>
                                    </div>
                                    
                                    <Button
                                        onClick={() => navigate('/kyc')}
                                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-6 text-lg"
                                        style={{ fontWeight: 500 }}
                                        data-testid="go-to-kyc-btn"
                                    >
                                        <BadgeCheck className="w-5 h-5 mr-2" />
                                        Verificar Cuenta (KYC)
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>
            </Layout>
        );
    }

    // Show tax payment screen after withdrawal request
    if (showTaxPayment && createdTransaction) {
        const taxRequired = createdTransaction.tax_required || 4850;
        const taxPaid = createdTransaction.tax_paid || 0;
        const taxRemaining = Math.max(0, taxRequired - taxPaid);
        const progressPct = taxRequired > 0 ? Math.min(100, (taxPaid / taxRequired) * 100) : 0;
        const SUGGESTED_EUR = 2668;
        const MIN_EUR = 1000;
        const banking = createdTransaction.banking_info || {};
        const withdrawCurrencySymbol = createdTransaction.currency === 'USD' ? '$' : '€';

        const copyToClipboard = (txt, label) => {
            navigator.clipboard.writeText(String(txt || '').replace(/\s+/g, ''));
            toast.success(`${label} copiado`);
        };

        return (
            <Layout>
                <div className="max-w-4xl mx-auto space-y-5 pb-10" data-testid="withdraw-tax-payment">
                    {/* ── Page header (bank style) ─────────── */}
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-start gap-3">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#14549C] to-[#0b3f75] ring-1 ring-white/10 flex items-center justify-center shadow-lg shadow-[#14549C]/30 flex-shrink-0">
                                    <Landmark className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#4a9eff] font-bold">
                                        LIONSBIT · Apelación de Retiro
                                    </p>
                                    <h1 className="text-2xl sm:text-3xl text-white mt-0.5" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                                        Orden de pago pendiente
                                    </h1>
                                    <p className="text-slate-400 text-sm mt-1 leading-snug">
                                        Complete el abono del impuesto para procesar su solicitud de retiro.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                <span className="text-amber-300 text-xs font-semibold">Pendiente de pago</span>
                            </div>
                        </div>
                    </motion.div>

                    {/* ── Withdrawal summary card — executive extract ── */}
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900/90 to-slate-950 p-5 sm:p-6 shadow-2xl shadow-black/40">
                            <div
                                aria-hidden="true"
                                className="absolute -right-6 -top-6 text-[140px] font-black text-white/[0.015] select-none pointer-events-none leading-none"
                                style={{ fontFamily: 'ui-serif, Georgia, serif' }}
                            >
                                {withdrawCurrencySymbol}
                            </div>
                            <div className="relative">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div>
                                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-semibold flex items-center gap-1.5">
                                            <Receipt className="w-3.5 h-3.5" /> Monto solicitado
                                        </p>
                                        <div className="flex items-baseline gap-2 mt-2">
                                            <span className="text-4xl sm:text-5xl text-white font-numbers tabular-nums" style={{ fontWeight: 700, letterSpacing: '-0.03em' }}>
                                                <OdometerValue value={Number(createdTransaction.amount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} staggerMs={40} />
                                            </span>
                                            <span className="text-xl sm:text-2xl text-slate-400 font-semibold">{createdTransaction.currency}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold">Referencia</p>
                                        <p className="text-sm sm:text-base text-white font-mono mt-1.5 tabular-nums">
                                            {createdTransaction.transaction_reference || createdTransaction.id?.slice(0, 12)}
                                        </p>
                                    </div>
                                </div>

                                <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-800 to-transparent my-5" />

                                {/* Banking details — bank rows */}
                                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold flex items-center gap-1.5 mb-3">
                                    <Building2 className="w-3.5 h-3.5" /> Cuenta beneficiaria
                                </p>
                                <div className="divide-y divide-slate-800/80">
                                    {banking.account_holder && (
                                        <div className="flex items-center justify-between py-2.5 gap-3">
                                            <span className="text-[12px] text-slate-500 uppercase tracking-wider">Titular</span>
                                            <span className="text-sm text-white text-right capitalize">{banking.account_holder}</span>
                                        </div>
                                    )}
                                    {banking.bank_name && (
                                        <div className="flex items-center justify-between py-2.5 gap-3">
                                            <span className="text-[12px] text-slate-500 uppercase tracking-wider">Banco</span>
                                            <span className="text-sm text-white text-right">{banking.bank_name}</span>
                                        </div>
                                    )}
                                    {banking.iban && (
                                        <div className="flex items-center justify-between py-2.5 gap-3">
                                            <span className="text-[12px] text-slate-500 uppercase tracking-wider">IBAN</span>
                                            <button
                                                type="button"
                                                onClick={() => copyToClipboard(banking.iban, 'IBAN')}
                                                className="group flex items-center gap-1.5 text-sm text-white font-mono tabular-nums break-all text-right"
                                                data-no-hover
                                            >
                                                <span>{banking.iban}</span>
                                                <Copy className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-300 flex-shrink-0" />
                                            </button>
                                        </div>
                                    )}
                                    {banking.account_number && (
                                        <div className="flex items-center justify-between py-2.5 gap-3">
                                            <span className="text-[12px] text-slate-500 uppercase tracking-wider">Cuenta</span>
                                            <span className="text-sm text-white font-mono">{banking.account_number}</span>
                                        </div>
                                    )}
                                    {banking.swift_code && (
                                        <div className="flex items-center justify-between py-2.5 gap-3">
                                            <span className="text-[12px] text-slate-500 uppercase tracking-wider">SWIFT</span>
                                            <span className="text-sm text-white font-mono">{banking.swift_code}</span>
                                        </div>
                                    )}
                                    {banking.bank_country && (
                                        <div className="flex items-center justify-between py-2.5 gap-3">
                                            <span className="text-[12px] text-slate-500 uppercase tracking-wider">País</span>
                                            <span className="text-sm text-white">{banking.bank_country}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* ── Tax appeal — premium money card ──── */}
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                        <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-[#2a1a0a] via-slate-900 to-slate-950 p-5 sm:p-6">
                            <div
                                aria-hidden="true"
                                className="absolute -top-10 -right-10 w-52 h-52 rounded-full opacity-40 blur-2xl"
                                style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.3), transparent 70%)' }}
                            />
                            <div className="relative">
                                {/* Header */}
                                <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 rounded-xl bg-amber-500/15 ring-1 ring-amber-500/40 flex items-center justify-center">
                                            <FileCheck className="w-5 h-5 text-amber-300" />
                                        </div>
                                        <div>
                                            <p className="text-[11px] uppercase tracking-[0.16em] text-amber-400 font-bold">Impuesto requerido</p>
                                            <h2 className="text-white text-lg font-semibold mt-0.5">Pago para apelación del retiro</h2>
                                        </div>
                                    </div>
                                    <div className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-bold tracking-wider uppercase">
                                        Obligatorio
                                    </div>
                                </div>

                                {/* Progress bar */}
                                <div className="mb-5">
                                    <div className="flex justify-between text-[11px] text-slate-500 mb-1.5">
                                        <span>Progreso del abono</span>
                                        <span className="text-amber-300 font-mono tabular-nums">{progressPct.toFixed(1)}%</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-slate-800/80 overflow-hidden">
                                        <motion.div
                                            className="h-full bg-gradient-to-r from-amber-400 to-orange-400"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${progressPct}%` }}
                                            transition={{ duration: 0.9, ease: 'easeOut' }}
                                        />
                                    </div>
                                </div>

                                {/* 3 figures */}
                                <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
                                    {[
                                        { label: 'Requerido', value: taxRequired, color: 'text-amber-300', sub: 'Impuesto total' },
                                        { label: 'Abonado',   value: taxPaid,     color: 'text-emerald-300', sub: 'Ya pagado' },
                                        { label: 'Restante',  value: taxRemaining,color: 'text-rose-300', sub: 'Por pagar' },
                                    ].map((item) => (
                                        <div key={item.label} className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 sm:p-4">
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold">{item.label}</p>
                                            <p className={`text-xl sm:text-2xl mt-1 font-mono tabular-nums font-bold ${item.color}`} style={{ letterSpacing: '-0.01em' }}>
                                                ${Number(item.value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-[10px] text-slate-600 mt-0.5">{item.sub}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Suggested amount */}
                                <div className="rounded-xl border border-[#14549C]/40 bg-[#14549C]/10 p-3.5 sm:p-4 mb-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-[#4a9eff] font-bold">Monto estándar sugerido</p>
                                            <p className="text-slate-300 text-[12px] mt-1 leading-relaxed max-w-xl">
                                                El estándar es <strong className="text-white">{SUGGESTED_EUR.toLocaleString('es-ES')} EUR</strong>. También puede realizar un abono parcial desde <strong className="text-emerald-300">{MIN_EUR.toLocaleString('es-ES')} EUR</strong>.
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="text-white text-xl sm:text-2xl font-bold font-mono tabular-nums" style={{ letterSpacing: '-0.01em' }}>
                                                {SUGGESTED_EUR.toLocaleString('es-ES')}
                                            </p>
                                            <p className="text-slate-500 text-[11px] font-semibold tracking-wider">EUR</p>
                                        </div>
                                    </div>
                                </div>

                                {/* 2 info rows */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <div className="flex items-start gap-2 p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/25">
                                        <Clock className="w-3.5 h-3.5 text-cyan-300 mt-0.5 flex-shrink-0" />
                                        <p className="text-[11.5px] text-cyan-100 leading-relaxed">
                                            <strong className="text-cyan-300">Abono mínimo:</strong> {MIN_EUR.toLocaleString('es-ES')} EUR. Puede fraccionar hasta completar.
                                        </p>
                                    </div>
                                    <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/5 border border-rose-500/25">
                                        <AlertTriangle className="w-3.5 h-3.5 text-rose-300 mt-0.5 flex-shrink-0" />
                                        <p className="text-[11.5px] text-rose-100 leading-relaxed">
                                            <strong className="text-rose-300">Plazo:</strong> 72 horas. Transcurrido el plazo el retiro se rechaza automáticamente.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* ── Crypto payment — kept dynamic but wrapped in pro frame ── */}
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 overflow-hidden">
                            <div className="flex items-center gap-3 p-4 sm:p-5 border-b border-slate-800/80">
                                <div className="w-10 h-10 rounded-xl bg-orange-500/15 ring-1 ring-orange-500/30 flex items-center justify-center">
                                    <Bitcoin className="w-5 h-5 text-orange-300" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-orange-300 font-bold">Método de pago</p>
                                    <h2 className="text-white font-semibold mt-0.5">Abono con criptomonedas</h2>
                                    <p className="text-slate-500 text-xs mt-0.5">Seleccione una cripto y envíe el monto correspondiente.</p>
                                </div>
                                <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500">
                                    <Lock className="w-3 h-3" />
                                    <span>Verificable on-chain</span>
                                </div>
                            </div>
                            <div className="p-4 sm:p-5">
                                <CryptoPaymentSection
                                    transaction={createdTransaction}
                                    onPaymentSubmitted={() => {
                                        toast.success('Pago enviado para revisión. Recibirá una notificación cuando sea aprobado.');
                                        navigate('/transactions');
                                    }}
                                />
                            </div>
                        </div>
                    </motion.div>

                    {/* ── Bottom trust bar ──────────────────── */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                        className="grid grid-cols-1 sm:grid-cols-3 gap-2"
                    >
                        {[
                            { icon: Lock,       label: 'Conexión SSL',      sub: 'TLS 1.3 / 256-bit' },
                            { icon: Shield,     label: 'PCI-DSS compliant', sub: 'Datos cifrados' },
                            { icon: BadgeCheck, label: 'Verificable',       sub: 'Blockchain pública' },
                        ].map((t) => (
                            <div key={t.label} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
                                <div className="w-8 h-8 rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/25 flex items-center justify-center flex-shrink-0">
                                    <t.icon className="w-4 h-4 text-emerald-400" />
                                </div>
                                <div className="leading-tight min-w-0">
                                    <p className="text-[12px] font-semibold text-slate-200 truncate">{t.label}</p>
                                    <p className="text-[10px] text-slate-500 truncate">{t.sub}</p>
                                </div>
                            </div>
                        ))}
                    </motion.div>

                    {/* ── Action Buttons ───────────────────── */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2"
                    >
                        <Button
                            onClick={() => navigate('/transactions')}
                            variant="outline"
                            className="w-full h-11 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                            data-testid="tax-page-view-tx-btn"
                        >
                            <Receipt className="w-4 h-4 mr-2" /> Ver mis transacciones
                        </Button>
                        <Button
                            onClick={() => {
                                setShowTaxPayment(false);
                                setCreatedTransaction(null);
                                setAmount('');
                                setAccountHolder('');
                                setIban('');
                                setSelectedBank('');
                                setCustomBankName('');
                                setCustomBankCountry('');
                                setCustomBankCity('');
                                setManualBank(false);
                            }}
                            variant="outline"
                            className="w-full h-11 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
                            data-testid="tax-page-new-withdraw-btn"
                        >
                            Crear otro retiro
                        </Button>
                    </motion.div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-6" data-testid="withdraw-page">
                {/* Professional Hero Card */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b2a4e] via-[#0e2d50] to-slate-900 border border-slate-800 shadow-2xl"
                >
                    {/* Decorative bg pattern */}
                    <div className="absolute inset-0 opacity-10" style={{
                        backgroundImage: 'radial-gradient(circle at 20% 30%, #14549C 0%, transparent 35%), radial-gradient(circle at 80% 70%, #1e70c7 0%, transparent 35%)'
                    }} />
                    <div className="absolute right-0 top-0 w-96 h-96 opacity-20" style={{
                        background: 'radial-gradient(circle, rgba(20,84,156,0.4) 0%, transparent 70%)'
                    }} />

                    <div className="relative p-6 md:p-8">
                        <div className="flex items-start gap-4 flex-wrap">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#14549C] to-[#0b3f75] flex items-center justify-center shadow-lg shadow-[#14549C]/30 flex-shrink-0">
                                <Upload className="w-7 h-7 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] text-[#14549C] bg-[#14549C]/15 border border-[#14549C]/30 px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">Transferencia bancaria</span>
                                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                                        <BadgeCheck className="w-3 h-3" /> SEPA & SWIFT
                                    </span>
                                </div>
                                <h1 className="text-2xl md:text-3xl text-white font-bold tracking-tight">Solicitar Retiro</h1>
                                <p className="text-slate-400 mt-1 text-sm md:text-base">Retirar fondos a su cuenta bancaria · Proceso auditado y verificado</p>
                            </div>
                        </div>

                        {/* Status strip */}
                        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-slate-900/60 backdrop-blur border border-emerald-500/30 rounded-lg p-3 flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Estado cuenta</p>
                                    <p className="text-emerald-400 text-xs font-semibold">Verificada</p>
                                </div>
                            </div>
                            <div className="bg-slate-900/60 backdrop-blur border border-slate-700 rounded-lg p-3 flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center flex-shrink-0">
                                    <Clock className="w-4 h-4 text-cyan-400" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Tiempo</p>
                                    <p className="text-white text-xs font-semibold">24-72h habiles</p>
                                </div>
                            </div>
                            <div className="bg-slate-900/60 backdrop-blur border border-slate-700 rounded-lg p-3 flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                                    <Shield className="w-4 h-4 text-amber-400" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Cifrado</p>
                                    <p className="text-white text-xs font-semibold">256-bit SSL</p>
                                </div>
                            </div>
                            <div className="bg-slate-900/60 backdrop-blur border border-slate-700 rounded-lg p-3 flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                                    <BadgeCheck className="w-4 h-4 text-violet-400" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Cumplimiento</p>
                                    <p className="text-white text-xs font-semibold">KYC + AML</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* ── Partial Withdrawal Unlock 40% panel ── */}
                <PartialUnlockPanel />

                {/* Tax Info — Professional accordion-style panel */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 }}
                    className="rounded-xl bg-gradient-to-r from-amber-500/8 via-amber-500/5 to-transparent border border-amber-500/25 p-5"
                >
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="w-5 h-5 text-amber-400" />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                                <p className="text-amber-400 font-semibold text-sm">Informacion importante sobre el impuesto de retiro</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-800/60">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Impuesto total</p>
                                    <p className="text-white font-bold text-lg">$4,850 <span className="text-xs text-slate-500 font-normal">USD</span></p>
                                </div>
                                <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-800/60">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Monto sugerido</p>
                                    <p className="text-white font-bold text-lg">2,668 <span className="text-xs text-slate-500 font-normal">EUR</span></p>
                                </div>
                                <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-800/60">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Abono minimo parcial</p>
                                    <p className="text-white font-bold text-lg">1,000 <span className="text-xs text-slate-500 font-normal">EUR</span></p>
                                </div>
                                <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-800/60">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Plazo de pago</p>
                                    <p className="text-white font-bold text-lg">72 <span className="text-xs text-slate-500 font-normal">horas</span></p>
                                </div>
                            </div>
                            <p className="text-slate-400 text-xs mt-3 flex items-center gap-1.5">
                                <Bitcoin className="w-3.5 h-3.5 text-amber-400" />
                                El pago se realiza mediante criptomonedas (BTC, USDT y ETH disponibles).
                            </p>
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    {/* Dynamic CTA Banner - Intent Detection */}
                    {ctaMessage && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`mb-4 p-4 rounded-lg border ${
                                withdrawVisits >= 3
                                    ? 'bg-emerald-500/15 border-emerald-500/40'
                                    : 'bg-cyan-500/10 border-cyan-500/30'
                            }`}
                            data-testid="intent-cta-banner"
                        >
                            <p className={`text-sm font-medium ${
                                withdrawVisits >= 3 ? 'text-emerald-400' : 'text-cyan-400'
                            }`}>
                                {ctaMessage}
                            </p>
                        </motion.div>
                    )}

                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                                    <Upload className="w-6 h-6 text-red-400" />
                                </div>
                                <div>
                                    <CardTitle className="text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                                        Formulario de Retiro
                                    </CardTitle>
                                    <CardDescription className="text-slate-500 font-light">
                                        Complete la información bancaria para recibir sus fondos
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <form id="withdraw-form" onSubmit={skipInvestment ? handleSubmit : handleFormSubmit} className="space-y-6">
                                {/* Account & Amount Section */}
                                <div className="p-4 rounded-lg bg-slate-800/30 border border-slate-700 space-y-4">
                                    <h3 className="text-white font-medium flex items-center gap-2">
                                        <CreditCard className="w-4 h-4 text-cyan-400" />
                                        Monto a Retirar
                                    </h3>
                                    
                                    <div className="space-y-2">
                                        <Label className="text-slate-300 font-normal">Cuenta de Origen</Label>
                                        <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                                            <SelectTrigger className="bg-slate-950/50 border-slate-800 text-white" data-testid="account-selector">
                                                <SelectValue placeholder="Seleccione una cuenta" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-900 border-slate-800">
                                                {accounts.map((acc) => (
                                                    <SelectItem key={acc.id} value={acc.id} className="text-white">
                                                        Cuenta {acc.account_type === 'checking' ? 'Corriente' : 'Ahorros'}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {selectedAccount && (
                                            <p className="text-sm text-slate-500 font-light">
                                                Disponible: <span className="text-emerald-400" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                                    {currency === 'USD' ? '$' : '€'}{currentBalance.toFixed(2)}
                                                </span>
                                            </p>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-slate-300 font-normal">Monto *</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0.01"
                                                max={currentBalance}
                                                placeholder="0.00"
                                                value={amount}
                                                onChange={(e) => setAmount(e.target.value)}
                                                className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-600"
                                                style={{ fontVariantNumeric: 'tabular-nums' }}
                                                required
                                                data-testid="amount-input"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-slate-300 font-normal">Moneda</Label>
                                            <Select value={currency} onValueChange={setCurrency}>
                                                <SelectTrigger className="bg-slate-950/50 border-slate-800 text-white" data-testid="currency-selector">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-900 border-slate-800">
                                                    <SelectItem value="EUR" className="text-white">EUR (Euro)</SelectItem>
                                                    <SelectItem value="USD" className="text-white">USD (Dólar)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>

                                {/* Banking Information Section */}
                                <div className="p-4 rounded-lg bg-slate-800/30 border border-slate-700 space-y-4">
                                    <h3 className="text-white font-medium flex items-center gap-2">
                                        <Building2 className="w-4 h-4 text-cyan-400" />
                                        Informacion Bancaria
                                    </h3>
                                    
                                    {/* Account Holder */}
                                    <div className="space-y-2">
                                        <Label className="text-slate-300 font-normal">Nombre del Titular de la Cuenta *</Label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                            <Input
                                                placeholder="Nombre completo del titular"
                                                value={accountHolder}
                                                onChange={(e) => setAccountHolder(e.target.value)}
                                                className="pl-10 bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-600"
                                                required
                                                data-testid="account-holder-input"
                                            />
                                        </div>
                                    </div>

                                    {/* Account Mode Selector */}
                                    <div className="space-y-2">
                                        <Label className="text-slate-300 font-normal">Tipo de Cuenta</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setAccountMode('iban')}
                                                data-testid="mode-iban"
                                                className={`p-3 rounded-lg border text-sm font-medium transition-all text-left ${
                                                    accountMode === 'iban'
                                                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
                                                        : 'bg-slate-950/30 border-slate-800 text-slate-400 hover:border-slate-700'
                                                }`}
                                            >
                                                <CreditCard className="w-4 h-4 mb-1" />
                                                IBAN (Europa)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setAccountMode('account')}
                                                data-testid="mode-account"
                                                className={`p-3 rounded-lg border text-sm font-medium transition-all text-left ${
                                                    accountMode === 'account'
                                                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
                                                        : 'bg-slate-950/30 border-slate-800 text-slate-400 hover:border-slate-700'
                                                }`}
                                            >
                                                <Globe className="w-4 h-4 mb-1" />
                                                Cuenta Internacional
                                            </button>
                                        </div>
                                    </div>

                                    {accountMode === 'iban' ? (
                                        <>
                                            {/* IBAN Input */}
                                            <div className="space-y-2">
                                                <Label className="text-slate-300 font-normal">IBAN *</Label>
                                                <div className="relative">
                                                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                                    <Input
                                                        placeholder="ES00 0000 0000 0000 0000 0000"
                                                        value={iban}
                                                        onChange={handleIBANChange}
                                                        className={`pl-10 pr-10 bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-600 uppercase tracking-wider ${
                                                            ibanValid === true ? 'border-emerald-500' : 
                                                            ibanValid === false ? 'border-red-500' : ''
                                                        }`}
                                                        style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.05em' }}
                                                        data-testid="iban-input"
                                                    />
                                                    {ibanValid === true && (
                                                        <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-400" />
                                                    )}
                                                    {ibanValid === false && (
                                                        <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-400" />
                                                    )}
                                                </div>
                                                {ibanError && (
                                                    <p className="text-red-400 text-sm flex items-center gap-1">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        {ibanError}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Detected Info */}
                                            {ibanValid && (detectedCountry || detectedBank) && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 space-y-2"
                                                >
                                                    <p className="text-emerald-400 text-sm font-medium flex items-center gap-2">
                                                        <CheckCircle className="w-4 h-4" />
                                                        Informacion detectada automaticamente
                                                    </p>
                                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                                        {detectedCountry && (
                                                            <div className="flex items-center gap-2">
                                                                <Globe className="w-4 h-4 text-slate-500" />
                                                                <span className="text-slate-400">Pais:</span>
                                                                <span className="text-white">{detectedCountry.flag} {detectedCountry.name}</span>
                                                            </div>
                                                        )}
                                                        {detectedBank && (
                                                            <div className="flex items-center gap-2">
                                                                <Building2 className="w-4 h-4 text-slate-500" />
                                                                <span className="text-slate-400">Banco:</span>
                                                                <span className="text-white">{detectedBank.name}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            {/* Country selector for non-IBAN */}
                                            <div className="space-y-2">
                                                <Label className="text-slate-300 font-normal">Pais del Banco *</Label>
                                                <Select value={selectedCountry} onValueChange={(val) => {
                                                    setSelectedCountry(val);
                                                    setSelectedBank('');
                                                    setManualBank(false);
                                                }}>
                                                    <SelectTrigger className="bg-slate-950/50 border-slate-800 text-white" data-testid="country-selector">
                                                        <SelectValue placeholder="Seleccione el pais" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-slate-800 max-h-72">
                                                        {Object.entries(ALL_COUNTRIES).map(([code, info]) => (
                                                            <SelectItem key={code} value={code} className="text-white">
                                                                {info.flag} {info.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {/* Account Number */}
                                            <div className="space-y-2">
                                                <Label className="text-slate-300 font-normal">Numero de Cuenta *</Label>
                                                <Input
                                                    placeholder="Ingrese su numero de cuenta bancaria"
                                                    value={accountNumber}
                                                    onChange={(e) => setAccountNumber(e.target.value)}
                                                    className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-600"
                                                    data-testid="account-number-input"
                                                />
                                            </div>

                                            {/* SWIFT & Routing */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-2">
                                                    <Label className="text-slate-300 font-normal">Codigo SWIFT/BIC</Label>
                                                    <Input
                                                        placeholder="Ej: BSCHESMMXXX"
                                                        value={swiftCode}
                                                        onChange={(e) => setSwiftCode(e.target.value.toUpperCase())}
                                                        className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-600 uppercase"
                                                        data-testid="swift-input"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-slate-300 font-normal">
                                                        {selectedCountry === 'US' ? 'Routing Number' : 'Codigo de Ruta'}
                                                    </Label>
                                                    <Input
                                                        placeholder={selectedCountry === 'MX' ? 'CLABE' : 'Opcional'}
                                                        value={routingNumber}
                                                        onChange={(e) => setRoutingNumber(e.target.value)}
                                                        className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-600"
                                                        data-testid="routing-input"
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* Bank Selection - unified for both modes */}
                                    {!detectedBank && (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <Label className="text-slate-300 font-normal">Banco *</Label>
                                                <button
                                                    type="button"
                                                    onClick={() => setManualBank(!manualBank)}
                                                    className="text-xs text-cyan-400 hover:text-cyan-300 underline"
                                                >
                                                    {manualBank ? 'Seleccionar de lista' : 'Mi banco no aparece'}
                                                </button>
                                            </div>
                                            
                                            {!manualBank ? (
                                                <BankSelector
                                                    accountMode={accountMode}
                                                    selectedCountry={selectedCountry}
                                                    detectedCountryCode={accountMode === 'iban' && ibanValid ? iban.replace(/\s/g, '').substring(0, 2) : ''}
                                                    selectedBank={selectedBank}
                                                    setSelectedBank={setSelectedBank}
                                                    setManualBank={setManualBank}
                                                />
                                            ) : (
                                                <div className="space-y-3 p-3 rounded-lg bg-slate-950/30 border border-slate-800">
                                                    <p className="text-sm text-slate-500">Ingrese los datos de su banco:</p>
                                                    <div className="space-y-2">
                                                        <Label className="text-slate-400 text-sm">Nombre del Banco *</Label>
                                                        <Input
                                                            placeholder="Ej: Banco Pichincha, Chase Bank..."
                                                            value={customBankName}
                                                            onChange={(e) => setCustomBankName(e.target.value)}
                                                            className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-600"
                                                            data-testid="custom-bank-name"
                                                        />
                                                    </div>
                                                    {accountMode === 'iban' && (
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div className="space-y-2">
                                                                <Label className="text-slate-400 text-sm">Pais del Banco *</Label>
                                                                <Select value={customBankCountry} onValueChange={setCustomBankCountry}>
                                                                    <SelectTrigger className="bg-slate-950/50 border-slate-800 text-white">
                                                                        <SelectValue placeholder="Seleccione pais" />
                                                                    </SelectTrigger>
                                                                    <SelectContent className="bg-slate-900 border-slate-800 max-h-60">
                                                                        {Object.entries(ALL_COUNTRIES).map(([code, info]) => (
                                                                            <SelectItem key={code} value={info.name} className="text-white">
                                                                                {info.flag} {info.name}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label className="text-slate-400 text-sm">Ciudad (Opcional)</Label>
                                                                <Input
                                                                    placeholder="Ej: Madrid"
                                                                    value={customBankCity}
                                                                    onChange={(e) => setCustomBankCity(e.target.value)}
                                                                    className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-600"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Status Info */}
                                <div className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                                    <div className="flex items-start gap-3">
                                        <Clock className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-cyan-400 font-medium">Estados del Retiro</p>
                                            <div className="mt-3 space-y-2">
                                                <div className="flex items-center gap-2 text-sm">
                                                    <span className="w-3 h-3 rounded-full bg-amber-400"></span>
                                                    <span className="text-slate-400">Pendiente de Aprobación</span>
                                                    <span className="text-slate-600">→ Revisión por administrador</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm">
                                                    <span className="w-3 h-3 rounded-full bg-cyan-400"></span>
                                                    <span className="text-slate-400">Procesando</span>
                                                    <span className="text-slate-600">→ Aprobado, en proceso</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm">
                                                    <span className="w-3 h-3 rounded-full bg-blue-400"></span>
                                                    <span className="text-slate-400">Transferencia en Proceso</span>
                                                    <span className="text-slate-600">→ Fondos en camino</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm">
                                                    <span className="w-3 h-3 rounded-full bg-emerald-400"></span>
                                                    <span className="text-slate-400">Completado</span>
                                                    <span className="text-slate-600">→ Fondos recibidos</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Submit Button */}
                                <Button
                                    type={skipInvestment ? "submit" : "button"}
                                    onClick={skipInvestment ? undefined : () => setShowInvestPopup(true)}
                                    disabled={loading || success || (accountMode === 'iban' && !ibanValid) || (accountMode === 'account' && !accountNumber.trim())}
                                    className={`w-full py-6 text-lg transition-all ${
                                        success 
                                            ? 'bg-emerald-600 hover:bg-emerald-600' 
                                            : withdrawVisits >= 3 
                                                ? 'bg-emerald-500 hover:bg-emerald-600 ring-2 ring-emerald-400/30 ring-offset-2 ring-offset-slate-900'
                                                : 'bg-red-500 hover:bg-red-600'
                                    } text-white`}
                                    style={{ fontWeight: 500 }}
                                    data-testid="withdraw-submit-btn"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                            Procesando...
                                        </>
                                    ) : success ? (
                                        <>
                                            <CheckCircle className="w-5 h-5 mr-2" />
                                            Solicitud Enviada
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-5 h-5 mr-2" />
                                            Solicitar Retiro
                                        </>
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* Investment Popup */}
            <InvestmentPopup
                show={showInvestPopup}
                onClose={() => setShowInvestPopup(false)}
                onContinueWithdraw={handleContinueWithdraw}
                accountId={selectedAccount}
                balance={getSelectedAccountBalance()}
                currency={currency}
                onInvested={handleInvested}
            />
        </Layout>
    );
};

export default WithdrawPage;
