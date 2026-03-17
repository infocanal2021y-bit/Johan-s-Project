import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { accountsAPI, transactionsAPI, authAPI } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
    Upload, Loader2, Clock, AlertCircle, CheckCircle, Building2, 
    CreditCard, Globe, User, AlertTriangle, Shield, BadgeCheck, Hourglass, Bitcoin, DollarSign
} from 'lucide-react';
import { toast } from 'sonner';
import { CryptoPaymentSection } from '../components/crypto/CryptoPaymentSection';

// Spanish banks with their BIC codes
const SPANISH_BANKS = [
    { code: '0049', name: 'Santander', bic: 'BSCHESMMXXX' },
    { code: '0182', name: 'BBVA', bic: 'BBVAESMMXXX' },
    { code: '2100', name: 'CaixaBank', bic: 'CABORAESXXX' },
    { code: '0081', name: 'Banco Sabadell', bic: 'BSABESBBXXX' },
    { code: '0128', name: 'Bankinter', bic: 'BKBKESMMXXX' },
    { code: '2103', name: 'Unicaja Banco', bic: 'UCJAES2MXXX' },
    { code: '2095', name: 'Kutxabank', bic: 'BASABOREXXX' },
    { code: '2080', name: 'Abanca', bic: 'CAABOREXXX' },
    { code: '2085', name: 'Ibercaja', bic: 'CAZABOREXXX' },
    { code: '3058', name: 'Cajamar', bic: 'CCABOREXXX' },
    { code: '0239', name: 'EVO Banco', bic: 'ABORAES2XXX' },
    { code: '0073', name: 'Openbank', bic: 'OPENESMMXXX' },
    { code: '1465', name: 'ING España', bic: 'INGDESMMXXX' },
    { code: '0019', name: 'Deutsche Bank España', bic: 'DEUTESBBXXX' },
    { code: '0237', name: 'WiZink Bank', bic: 'WABORXXXXX' },
    { code: '0186', name: 'Banco Mediolanum', bic: 'BABORXXXXX' },
];

// Country codes for IBAN
const COUNTRY_CODES = {
    'ES': { name: 'España', flag: '🇪🇸' },
    'FR': { name: 'Francia', flag: '🇫🇷' },
    'DE': { name: 'Alemania', flag: '🇩🇪' },
    'IT': { name: 'Italia', flag: '🇮🇹' },
    'PT': { name: 'Portugal', flag: '🇵🇹' },
    'GB': { name: 'Reino Unido', flag: '🇬🇧' },
    'NL': { name: 'Países Bajos', flag: '🇳🇱' },
    'BE': { name: 'Bélgica', flag: '🇧🇪' },
    'AT': { name: 'Austria', flag: '🇦🇹' },
    'CH': { name: 'Suiza', flag: '🇨🇭' },
    'PL': { name: 'Polonia', flag: '🇵🇱' },
    'CZ': { name: 'República Checa', flag: '🇨🇿' },
    'SE': { name: 'Suecia', flag: '🇸🇪' },
    'NO': { name: 'Noruega', flag: '🇳🇴' },
    'DK': { name: 'Dinamarca', flag: '🇩🇰' },
    'FI': { name: 'Finlandia', flag: '🇫🇮' },
    'IE': { name: 'Irlanda', flag: '🇮🇪' },
    'LU': { name: 'Luxemburgo', flag: '🇱🇺' },
    'GR': { name: 'Grecia', flag: '🇬🇷' },
    'RO': { name: 'Rumanía', flag: '🇷🇴' },
    'HU': { name: 'Hungría', flag: '🇭🇺' },
    'SK': { name: 'Eslovaquia', flag: '🇸🇰' },
    'BG': { name: 'Bulgaria', flag: '🇧🇬' },
    'HR': { name: 'Croacia', flag: '🇭🇷' },
    'SI': { name: 'Eslovenia', flag: '🇸🇮' },
    'EE': { name: 'Estonia', flag: '🇪🇪' },
    'LV': { name: 'Letonia', flag: '🇱🇻' },
    'LT': { name: 'Lituania', flag: '🇱🇹' },
    'CY': { name: 'Chipre', flag: '🇨🇾' },
    'MT': { name: 'Malta', flag: '🇲🇹' },
};

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

// Detect bank from Spanish IBAN
const detectBankFromIBAN = (iban) => {
    const cleanIban = iban.replace(/\s/g, '').toUpperCase();
    
    if (cleanIban.length < 8) return null;
    
    const countryCode = cleanIban.substring(0, 2);
    const country = COUNTRY_CODES[countryCode];
    
    let detectedBank = null;
    
    // For Spanish IBANs, detect the bank
    if (countryCode === 'ES' && cleanIban.length >= 8) {
        const bankCode = cleanIban.substring(4, 8);
        detectedBank = SPANISH_BANKS.find(bank => bank.code === bankCode);
    }
    
    return {
        country,
        countryCode,
        bank: detectedBank
    };
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
    
    // Detected info
    const [detectedCountry, setDetectedCountry] = useState(null);
    const [detectedBank, setDetectedBank] = useState(null);

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
        
        // Validate all fields
        if (!accountHolder.trim()) {
            toast.error('Ingrese el nombre del titular de la cuenta');
            return;
        }
        
        if (!ibanValid) {
            toast.error('El IBAN ingresado no es válido');
            return;
        }
        
        const bankName = manualBank ? customBankName : (detectedBank?.name || selectedBank);
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
            const bankingInfo = {
                account_holder: accountHolder.trim(),
                iban: iban.replace(/\s/g, '').toUpperCase(),
                bank_name: manualBank ? customBankName : (detectedBank?.name || SPANISH_BANKS.find(b => b.code === selectedBank)?.name),
                bank_country: manualBank ? customBankCountry : (detectedCountry?.name || 'España'),
                bank_city: manualBank ? customBankCity : null,
                detected_bank: detectedBank,
                detected_country: detectedCountry
            };
            
            const response = await transactionsAPI.create({
                account_id: selectedAccount,
                transaction_type: 'withdraw',
                amount: numAmount,
                currency,
                description: `Retiro a ${bankingInfo.bank_name} - IBAN: ${iban.slice(-8)}`,
                banking_info: bankingInfo
            });
            
            // Save the created transaction and show tax payment screen
            setCreatedTransaction(response.data);
            setShowTaxPayment(true);
            toast.success('Solicitud de retiro creada. Debe pagar el impuesto para continuar.');
            
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Error al procesar el retiro');
        } finally {
            setLoading(false);
        }
    };

    const currentBalance = getSelectedAccountBalance();

    // Loading state
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
        
        return (
            <Layout>
                <div className="max-w-3xl mx-auto space-y-8" data-testid="withdraw-tax-payment">
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <h1 className="text-3xl text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                            Solicitud de Retiro Creada
                        </h1>
                        <p className="text-slate-500 mt-1 font-light">Pendiente de aprobación - Pago de impuesto requerido</p>
                    </motion.div>

                    {/* Status Badge */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30"
                    >
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                        <span className="text-amber-400 text-sm" style={{ fontWeight: 500 }}>
                            Pendiente de Aprobación - Favor pagar impuesto para procesar su retiro
                        </span>
                    </motion.div>

                    {/* Withdrawal Summary */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white flex items-center gap-2" style={{ fontWeight: 700 }}>
                                    <DollarSign className="w-5 h-5 text-emerald-400" />
                                    Resumen de su Solicitud
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-lg bg-slate-800/50">
                                        <p className="text-slate-400 text-sm">Monto del Retiro</p>
                                        <p className="text-2xl text-white" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                            {createdTransaction.currency === 'USD' ? '$' : '€'}{createdTransaction.amount?.toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="p-4 rounded-lg bg-slate-800/50">
                                        <p className="text-slate-400 text-sm">Referencia</p>
                                        <p className="text-lg text-white font-mono">
                                            {createdTransaction.transaction_reference || createdTransaction.id?.slice(0, 12)}
                                        </p>
                                    </div>
                                </div>
                                
                                {/* Banking Info */}
                                {createdTransaction.banking_info && (
                                    <div className="p-4 rounded-lg bg-slate-800/50 space-y-2">
                                        <p className="text-slate-400 text-sm flex items-center gap-2">
                                            <Building2 className="w-4 h-4" />
                                            Datos Bancarios
                                        </p>
                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <span className="text-slate-500">Titular:</span>
                                            <span className="text-white">{createdTransaction.banking_info.account_holder}</span>
                                            <span className="text-slate-500">Banco:</span>
                                            <span className="text-white">{createdTransaction.banking_info.bank_name}</span>
                                            <span className="text-slate-500">IBAN:</span>
                                            <span className="text-white font-mono text-xs">{createdTransaction.banking_info.iban}</span>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Tax Payment Required */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <Card className="bg-gradient-to-br from-orange-500/10 to-amber-500/10 border-orange-500/30">
                            <CardHeader>
                                <CardTitle className="text-orange-400 flex items-center gap-2" style={{ fontWeight: 700 }}>
                                    <AlertTriangle className="w-5 h-5" />
                                    Pago de Impuesto Requerido
                                </CardTitle>
                                <CardDescription className="text-orange-400/70">
                                    Para procesar su solicitud de retiro, debe abonar el impuesto correspondiente
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="p-4 rounded-lg bg-slate-900/50 text-center">
                                        <p className="text-slate-400 text-xs">Impuesto Requerido</p>
                                        <p className="text-2xl text-orange-400" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                            ${taxRequired.toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="p-4 rounded-lg bg-slate-900/50 text-center">
                                        <p className="text-slate-400 text-xs">Pagado</p>
                                        <p className="text-2xl text-emerald-400" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                            ${taxPaid.toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="p-4 rounded-lg bg-slate-900/50 text-center">
                                        <p className="text-slate-400 text-xs">Restante</p>
                                        <p className="text-2xl text-red-400" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                            ${taxRemaining.toFixed(2)}
                                        </p>
                                    </div>
                                </div>

                                <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                                    <p className="text-cyan-400 text-sm">
                                        <Clock className="w-4 h-4 inline mr-2" />
                                        Abono mínimo: <strong>$200 USD</strong>. Puede realizar abonos parciales hasta completar el total.
                                    </p>
                                </div>

                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                                    <p className="text-red-400 text-sm">
                                        <AlertTriangle className="w-4 h-4 inline mr-2" />
                                        <strong>Importante:</strong> Si el impuesto no se paga dentro de 72 horas, el retiro será rechazado automáticamente.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Crypto Payment Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white flex items-center gap-2" style={{ fontWeight: 700 }}>
                                    <Bitcoin className="w-5 h-5 text-orange-400" />
                                    Pagar con Criptomonedas
                                </CardTitle>
                                <CardDescription className="text-slate-500">
                                    Seleccione una criptomoneda y envíe el monto correspondiente
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <CryptoPaymentSection 
                                    transaction={createdTransaction}
                                    onPaymentSubmitted={() => {
                                        toast.success('Pago enviado para revisión. Recibirá una notificación cuando sea aprobado.');
                                        navigate('/transactions');
                                    }}
                                />
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Action Buttons */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="flex gap-4"
                    >
                        <Button
                            onClick={() => navigate('/transactions')}
                            variant="outline"
                            className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                        >
                            Ver Mis Transacciones
                        </Button>
                        <Button
                            onClick={() => {
                                setShowTaxPayment(false);
                                setCreatedTransaction(null);
                                // Reset form
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
                            className="flex-1 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                        >
                            Crear Otro Retiro
                        </Button>
                    </motion.div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="max-w-3xl mx-auto space-y-8" data-testid="withdraw-page">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                        Solicitar Retiro
                    </h1>
                    <p className="text-slate-500 mt-1 font-light">Retirar fondos a su cuenta bancaria</p>
                </motion.div>

                {/* Verification Badge */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30"
                >
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    <span className="text-emerald-400 text-sm" style={{ fontWeight: 500 }}>
                        Cuenta verificada - Puede realizar retiros
                    </span>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
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
                            <form onSubmit={handleSubmit} className="space-y-6">
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
                                        Información Bancaria
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

                                    {/* IBAN */}
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
                                                required
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
                                                Información detectada automáticamente
                                            </p>
                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                {detectedCountry && (
                                                    <div className="flex items-center gap-2">
                                                        <Globe className="w-4 h-4 text-slate-500" />
                                                        <span className="text-slate-400">País:</span>
                                                        <span className="text-white">
                                                            {detectedCountry.flag} {detectedCountry.name}
                                                        </span>
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

                                    {/* Bank Selection */}
                                    {!detectedBank && (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <Label className="text-slate-300 font-normal">Banco *</Label>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setManualBank(!manualBank)}
                                                    className="text-xs text-cyan-400 hover:text-cyan-300"
                                                >
                                                    {manualBank ? 'Seleccionar de lista' : 'Agregar banco'}
                                                </Button>
                                            </div>
                                            
                                            {!manualBank ? (
                                                <Select value={selectedBank} onValueChange={setSelectedBank}>
                                                    <SelectTrigger className="bg-slate-950/50 border-slate-800 text-white" data-testid="bank-selector">
                                                        <SelectValue placeholder="Seleccione su banco" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-slate-800 max-h-60">
                                                        {SPANISH_BANKS.map((bank) => (
                                                            <SelectItem key={bank.code} value={bank.code} className="text-white">
                                                                {bank.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <div className="space-y-3 p-3 rounded-lg bg-slate-950/30 border border-slate-800">
                                                    <p className="text-sm text-slate-500">Ingrese los datos de su banco manualmente:</p>
                                                    
                                                    <div className="space-y-2">
                                                        <Label className="text-slate-400 text-sm">Nombre del Banco *</Label>
                                                        <Input
                                                            placeholder="Ej: Banco Nacional"
                                                            value={customBankName}
                                                            onChange={(e) => setCustomBankName(e.target.value)}
                                                            className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-600"
                                                            data-testid="custom-bank-name"
                                                        />
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="space-y-2">
                                                            <Label className="text-slate-400 text-sm">País del Banco *</Label>
                                                            <Select value={customBankCountry} onValueChange={setCustomBankCountry}>
                                                                <SelectTrigger className="bg-slate-950/50 border-slate-800 text-white">
                                                                    <SelectValue placeholder="Seleccione país" />
                                                                </SelectTrigger>
                                                                <SelectContent className="bg-slate-900 border-slate-800 max-h-60">
                                                                    {Object.entries(COUNTRY_CODES).map(([code, info]) => (
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
                                    type="submit"
                                    disabled={loading || success || !ibanValid}
                                    className={`w-full py-6 text-lg transition-all ${
                                        success 
                                            ? 'bg-emerald-600 hover:bg-emerald-600' 
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
        </Layout>
    );
};

export default WithdrawPage;
