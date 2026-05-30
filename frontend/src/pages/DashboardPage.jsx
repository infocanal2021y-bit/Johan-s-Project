import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { BalanceCard } from '../components/dashboard/BalanceCard';
import { RecentTransactions } from '../components/dashboard/RecentTransactions';
import { OdometerValue } from '../components/dashboard/OdometerValue';
import { TransactionChart } from '../components/dashboard/TransactionChart';
import { UserLevelCard } from '../components/dashboard/UserLevelCard';
import { MT5SummaryWidget } from '../components/dashboard/MT5SummaryWidget';
import { WithdrawTypeSuggestionWidget } from '../components/dashboard/WithdrawTypeSuggestionWidget';
import { IncompleteWithdrawBanner } from '../components/dashboard/IncompleteWithdrawBanner';
import { accountsAPI, transactionsAPI, kycAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { RefreshCw, AlertTriangle, BadgeCheck, ShieldAlert, Wallet, Clock, TrendingUp, ArrowRight, ArrowUpRight, ArrowDownLeft, ExternalLink, Shield, Rocket, LineChart, X } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { WithdrawalToast, LiveWithdrawalsPanel } from '../components/dashboard/LiveWithdrawals';
import { MobileAppBanner } from '../components/dashboard/MobileAppBanner';

const BlockchainTransactions = () => {
    const [active, setActive] = useState(null); // 'paid' | 'received' | null
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="bg-slate-900/70 border-slate-800" data-testid="blockchain-tx-section">
                <CardHeader className="pb-3">
                    <CardTitle className="text-white text-base flex items-center gap-2">
                        <Shield className="w-4 h-4 text-cyan-400" />
                        Transacciones en Blockchain
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            variant={active === 'paid' ? 'default' : 'outline'}
                            onClick={() => setActive(active === 'paid' ? null : 'paid')}
                            className={active === 'paid'
                                ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white py-5'
                                : 'border-slate-700 text-slate-300 hover:bg-slate-800 py-5'}
                            data-testid="btn-tx-paid"
                        >
                            <ArrowUpRight className="w-4 h-4 mr-2" />
                            Transacciones pagadas
                        </Button>
                        <Button
                            variant={active === 'received' ? 'default' : 'outline'}
                            onClick={() => setActive(active === 'received' ? null : 'received')}
                            className={active === 'received'
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-5'
                                : 'border-slate-700 text-slate-300 hover:bg-slate-800 py-5'}
                            data-testid="btn-tx-received"
                        >
                            <ArrowDownLeft className="w-4 h-4 mr-2" />
                            Transacciones recibidas
                        </Button>
                    </div>

                    {active && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="p-4 rounded-xl bg-slate-800/40 border border-slate-700 space-y-3"
                            data-testid={`tx-link-${active}`}
                        >
                            <p className="text-slate-400 text-sm">
                                {active === 'paid' ? 'Registro publico de transacciones pagadas (inputs):' : 'Registro publico de transacciones recibidas (outputs):'}
                            </p>
                            <a
                                href={active === 'paid'
                                    ? 'https://gz.blockchair.com/bitcoin/inputs/'
                                    : 'https://gz.blockchair.com/bitcoin/outputs/'}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid={`tx-link-href-${active}`}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-sm font-medium hover:bg-cyan-500/20 transition-colors"
                            >
                                <ExternalLink className="w-4 h-4" />
                                {active === 'paid'
                                    ? 'gz.blockchair.com/bitcoin/inputs'
                                    : 'gz.blockchair.com/bitcoin/outputs'}
                            </a>
                        </motion.div>
                    )}

                    <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
                        <p className="text-slate-500 text-xs text-center leading-relaxed">
                            Las transacciones mostradas corresponden a registros publicos de la red blockchain y pueden ser verificadas externamente para garantizar transparencia.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
};

export const DashboardPage = () => {
    const { user } = useAuth();
    const [summary, setSummary] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currency, setCurrency] = useState('USD');
    const [kycStatus, setKycStatus] = useState(null);
    const [investHistory, setInvestHistory] = useState(null);
    const [showWelcome, setShowWelcome] = useState(() => {
        return !localStorage.getItem('lionsbit_2_dismissed');
    });

    const fetchData = async () => {
        try {
            setLoading(true);
            const [summaryRes, txRes, kycRes, investRes] = await Promise.all([
                accountsAPI.getSummary(),
                transactionsAPI.getAll({ limit: 10 }),
                kycAPI.getStatus(),
                accountsAPI.getInvestmentHistory().catch(() => ({ data: null })),
            ]);
            setSummary(summaryRes.data);
            setTransactions(txRes.data);
            setKycStatus(kycRes.data);
            setInvestHistory(investRes.data);
        } catch (error) {
            toast.error('Error al cargar  dashboard data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const getBalanceForCurrency = (balanceObj) => {
        if (!balanceObj) return 0;
        return currency === 'USD' ? balanceObj.usd : balanceObj.eur;
    };

    const getKYCBanner = () => {
        if (!kycStatus) return null;
        
        if (kycStatus.verification_status === 'unverified') {
            return (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start gap-3"
                >
                    <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-amber-400 font-medium">Cuenta No Verificada</p>
                        <p className="text-sm text-amber-400/70 mt-1">
                            Complete su verificación de identidad para desbloquear límites más altos (hasta €10,000/día).
                            Actualmente limitado a €1,000 por transferencia.
                        </p>
                    </div>
                    <Link to="/kyc" className="w-full sm:w-auto">
                        <Button size="sm" className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-black min-h-[44px]">
                            Verificar Ahora
                        </Button>
                    </Link>
                </motion.div>
            );
        }
        
        if (kycStatus.verification_status === 'pending_verification') {
            return (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center gap-3"
                >
                    <AlertTriangle className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                    <p className="text-cyan-400 text-sm sm:text-base">
                        <span className="font-medium">Verificación Pendiente</span> - Sus documentos están siendo revisados.
                    </p>
                </motion.div>
            );
        }
        
        if (kycStatus.verification_status === 'verified') {
            return (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3"
                >
                    <BadgeCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <p className="text-emerald-400 text-sm sm:text-base">
                        <span className="font-medium">Cuenta Verificada</span> - Tiene acceso completo a todas las funciones.
                    </p>
                </motion.div>
            );
        }
        
        return null;
    };

    const getAccountStatusBanner = () => {
        if (user?.account_status === 'suspended') {
            return (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-3"
                >
                    <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <p className="text-red-400 text-sm sm:text-base">
                        <span className="font-medium">Cuenta Suspendida</span> - Por favor contacte a soporte para asistencia.
                    </p>
                </motion.div>
            );
        }
        
        if (user?.account_status === 'under_review') {
            return (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-3"
                >
                    <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <p className="text-red-400 text-sm sm:text-base">
                        <span className="font-medium">Cuenta En Revisión</span> - Las transferencias están temporalmente deshabilitadas.
                    </p>
                </motion.div>
            );
        }
        
        return null;
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="dashboard-page">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                    <div>
                        <h1 className="text-3xl text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                            Bienvenido, {user?.name?.split(' ')[0]}
                        </h1>
                        <p className="text-slate-500 mt-1 font-light">Resumen de tu cuenta financiera</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Select value={currency} onValueChange={setCurrency}>
                            <SelectTrigger className="w-24 bg-slate-900 border-slate-800 text-white" data-testid="currency-selector">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800">
                                <SelectItem value="USD" className="text-white">USD</SelectItem>
                                <SelectItem value="EUR" className="text-white">EUR</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={fetchData}
                            disabled={loading}
                            className="border-slate-800 hover:bg-slate-800"
                            data-testid="refresh-btn"
                        >
                            <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </motion.div>

                {/* Status Banners */}
                {getAccountStatusBanner()}
                {getKYCBanner()}

                {/* Mobile App "Coming Soon" promotional banner */}
                <MobileAppBanner />

                {/* Incomplete withdrawal journey banner (auto-hides if not applicable) */}
                <IncompleteWithdrawBanner />

                {/* Dashboard next-action nudge — verified users who haven't picked a modality yet */}
                <WithdrawTypeSuggestionWidget user={kycStatus} />

                {/* LIONSBIT 2.0 Welcome Card */}
                <AnimatePresence>
                    {showWelcome && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -20 }}
                            transition={{ duration: 0.3 }}
                            data-testid="welcome-card"
                        >
                            <Card className="bg-gradient-to-br from-slate-900 via-slate-900 to-[#14549C]/20 border-[#14549C]/30 overflow-hidden relative">
                                <button
                                    onClick={() => { setShowWelcome(false); localStorage.setItem('lionsbit_2_dismissed', '1'); }}
                                    className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors z-10"
                                    data-testid="welcome-close-btn"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                                <div className="absolute top-0 right-0 w-64 h-64 bg-[#14549C]/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3" />
                                <CardContent className="p-6 md:p-8 relative">
                                    <div className="flex flex-col md:flex-row gap-6 items-start">
                                        <div className="flex-1 space-y-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-11 h-11 rounded-xl bg-[#14549C]/20 flex items-center justify-center">
                                                    <Rocket className="w-6 h-6 text-[#14549C]" />
                                                </div>
                                                <div>
                                                    <h2 className="text-white text-xl font-bold tracking-tight">Proximamente: LIONSBIT 2.0</h2>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-slate-400 text-xs">En colaboracion con</span>
                                                        <a href="https://www.etoro.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#6cca98] text-xs font-bold hover:underline">
                                                            eToro
                                                            <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-3 text-slate-300 text-sm leading-relaxed">
                                                <p>
                                                    Estamos preparando la nueva version de la plataforma, <strong className="text-white">LIONSBIT 2.0</strong> en colaboracion con <a href="https://www.etoro.com" target="_blank" rel="noopener noreferrer" className="text-[#6cca98] font-bold hover:underline">eToro</a>, que incorporara herramientas avanzadas en metodos de inversion, analisis y gestion financiera.
                                                </p>
                                                <p>
                                                    El <strong className="text-emerald-400">metodo real de inversion</strong> sera habilitado proximamente, marcando el inicio de una nueva etapa dentro de la plataforma.
                                                </p>
                                                <p className="text-slate-400">
                                                    Mientras tanto, ya puedes acceder al <strong className="text-[#F0B90B]">modo demo de trading</strong>, donde podras practicar, abrir operaciones y familiarizarte con el sistema en un entorno simulado.
                                                </p>
                                            </div>

                                            <p className="text-xs text-slate-500 italic">Preparate para una nueva generacion de inversion digital con LIONSBIT y <a href="https://www.etoro.com" target="_blank" rel="noopener noreferrer" className="text-[#6cca98] hover:underline">eToro</a>.</p>

                                            <div className="flex flex-wrap gap-3 pt-1">
                                                <Link to="/trading-demo">
                                                    <Button className="bg-[#F0B90B] hover:bg-[#F0B90B]/90 text-black font-bold shadow-lg shadow-[#F0B90B]/10" data-testid="welcome-trading-btn">
                                                        <LineChart className="w-4 h-4 mr-2" /> Probar Trading Demo
                                                    </Button>
                                                </Link>
                                                <a href="https://www.etoro.com" target="_blank" rel="noopener noreferrer">
                                                    <Button variant="outline" className="border-[#6cca98]/30 text-[#6cca98] hover:bg-[#6cca98]/10" data-testid="welcome-etoro-btn">
                                                        <ExternalLink className="w-4 h-4 mr-2" /> Visitar eToro
                                                    </Button>
                                                </a>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => { setShowWelcome(false); localStorage.setItem('lionsbit_2_dismissed', '1'); }}
                                                    className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                                                    data-testid="welcome-dismiss-btn"
                                                >
                                                    Entendido
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Balance Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <BalanceCard
                        title="Saldo Total"
                        amount={getBalanceForCurrency(summary?.total)}
                        currency={currency}
                        type="total"
                        delay={0}
                    />
                    <BalanceCard
                        title="Saldo Disponible"
                        amount={getBalanceForCurrency(summary?.available)}
                        currency={currency}
                        type="available"
                        delay={0.1}
                    />
                    <BalanceCard
                        title="Saldo en Inversion"
                        amount={getBalanceForCurrency(summary?.invested)}
                        currency={currency}
                        type="invested"
                        delay={0.2}
                    />
                </div>

                {/* Wallet de Inversion */}
                <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <Card className="bg-slate-900/70 border-slate-800" data-testid="investment-wallet-card">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-white text-base flex items-center gap-2">
                                <Wallet className="w-5 h-5 text-emerald-400" />
                                Wallet de Inversion
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Investment Balance */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                                    <p className="text-xs text-slate-500">Saldo Invertido</p>
                                    <p className="text-xl font-bold text-emerald-400 font-numbers mt-1" data-testid="invested-balance">
                                        <OdometerValue value={`${currency === 'EUR' ? '€' : '$'}${(currency === 'EUR'
                                            ? (investHistory?.total_invested_eur || 0)
                                            : (investHistory?.total_invested_usd || 0)
                                        ).toLocaleString('es-ES', { minimumFractionDigits: 2 })}`} staggerMs={40} />
                                    </p>
                                </div>
                                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                                    <p className="text-xs text-slate-500">Estado</p>
                                    <p className="text-sm font-medium text-amber-400 mt-1 flex items-center gap-1.5" data-testid="investment-status">
                                        <Clock className="w-3.5 h-3.5" />
                                        {investHistory?.status || 'Sin inversiones'}
                                    </p>
                                </div>
                                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                                    <p className="text-xs text-slate-500">Operaciones</p>
                                    <p className="text-xl font-bold text-white font-numbers mt-1" data-testid="investment-count">
                                        <OdometerValue value={String(investHistory?.count || 0)} staggerMs={40} />
                                    </p>
                                </div>
                            </div>

                            {/* Status Message */}
                            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
                                <TrendingUp className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-emerald-400 text-sm font-medium">
                                        {(investHistory?.total_invested_eur > 0 || investHistory?.total_invested_usd > 0)
                                            ? 'Fondos reservados'
                                            : 'Invierta desde la seccion de retiro'}
                                    </p>
                                    <p className="text-emerald-400/60 text-xs mt-0.5">
                                        Disponible proximamente para inversion en mercado financiero
                                    </p>
                                </div>
                            </div>

                            {/* Recent Investment History */}
                            {investHistory?.history?.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Historial de Inversiones</p>
                                    <div className="space-y-1.5">
                                        {investHistory.history.slice(0, 5).map((inv) => (
                                            <div key={inv.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors" data-testid={`invest-history-${inv.id}`}>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                                        <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                                                    </div>
                                                    <div>
                                                        <p className="text-slate-300 text-sm font-medium">{inv.type}</p>
                                                        <p className="text-slate-500 text-xs">
                                                            {new Date(inv.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-emerald-400 font-mono text-sm font-medium">
                                                        +{inv.currency === 'EUR' ? '€' : '$'}{inv.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                                                    </p>
                                                    <p className="text-xs text-emerald-500/60">Completado</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* CTA if no investments */}
                            {(!investHistory?.history || investHistory.history.length === 0) && (
                                <Link to="/withdraw">
                                    <Button variant="outline" className="w-full border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" data-testid="invest-cta-btn">
                                        <Wallet className="w-4 h-4 mr-2" />
                                        Invertir desde la seccion de retiro
                                    </Button>
                                </Link>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* User Level Card */}
                <UserLevelCard />

                {/* MT5 Account Summary */}
                <MT5SummaryWidget />

                {/* Transaction Chart */}
                <TransactionChart />

                {/* Recent Transactions */}
                <RecentTransactions transactions={transactions} loading={loading} />

                {/* Live Withdrawals Activity */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                    <LiveWithdrawalsPanel />
                </motion.div>

                {/* Legal Disclaimer */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30"
                >
                    <p className="text-amber-400 text-xs text-center">
                        <strong>Aviso Legal:</strong> Los datos mostrados en esta plataforma relacionados con mercados financieros y criptomonedas son unicamente informativos. 
                        No constituyen asesoramiento financiero ni representan una invitacion a invertir. 
                        La plataforma no esta habilitada para realizar inversiones .
                    </p>
                </motion.div>

                {/* Withdrawal Toast Notifications */}
                <WithdrawalToast />
            </div>
        </Layout>
    );
};

export default DashboardPage;
