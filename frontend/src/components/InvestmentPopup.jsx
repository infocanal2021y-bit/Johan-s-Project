import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, ArrowRight, X, AlertTriangle, CheckCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { accountsAPI } from '../lib/api';
import { toast } from 'sonner';

/**
 * Investment Popup - appears when user clicks "Solicitar Retiro".
 * Offers optional investment before continuing with withdrawal.
 */
export const InvestmentPopup = ({ show, onClose, onContinueWithdraw, accountId, balance, currency, onInvested }) => {
    const [step, setStep] = useState('offer'); // offer | amount | confirm | success
    const [investAmount, setInvestAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const numAmount = parseFloat(investAmount) || 0;

    const validate = (val) => {
        const n = parseFloat(val) || 0;
        if (n > 0 && n < 300) return 'El monto minimo de inversion es €300';
        if (n > balance) return 'Saldo insuficiente';
        return '';
    };

    const handleAmountChange = (e) => {
        const val = e.target.value;
        setInvestAmount(val);
        setError(validate(val));
    };

    const handleConfirm = async () => {
        setLoading(true);
        try {
            await accountsAPI.invest({
                account_id: accountId,
                amount: numAmount,
                currency,
            });
            setStep('success');
            if (onInvested) onInvested(numAmount);
            toast.success(`€${numAmount.toLocaleString()} reservados para inversion`);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Error al reservar fondos');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setStep('offer');
        setInvestAmount('');
        setError('');
        onClose();
    };

    if (!show) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                data-testid="investment-popup-overlay"
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
                    data-testid="investment-popup"
                >
                    {/* Header */}
                    <div className="p-5 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border-b border-slate-800">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                                </div>
                                <h3 className="text-white font-semibold text-lg">Oportunidad de Inversion</h3>
                            </div>
                            <button onClick={handleClose} className="text-slate-500 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    <div className="p-6">
                        {/* Step: Offer */}
                        {step === 'offer' && (
                            <div className="space-y-5">
                                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                                    <p className="text-slate-300 text-sm leading-relaxed">
                                        Proximamente estara disponible la seccion de inversion en el mercado financiero.
                                    </p>
                                    <p className="text-white text-sm mt-3 font-medium">
                                        Puede mantener un saldo minimo de <span className="text-emerald-400">€300</span> en su cuenta para participar en la apertura.
                                    </p>
                                    <p className="text-cyan-400 text-sm mt-2 font-medium">
                                        Desea formar parte?
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Button
                                        onClick={() => setStep('amount')}
                                        className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-5"
                                        data-testid="invest-yes-btn"
                                    >
                                        SI, PARTICIPAR
                                    </Button>
                                    <Button
                                        onClick={() => { handleClose(); onContinueWithdraw(); }}
                                        variant="outline"
                                        className="border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold py-5"
                                        data-testid="invest-no-btn"
                                    >
                                        NO, CONTINUAR RETIRO
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Step: Amount Input */}
                        {step === 'amount' && (
                            <div className="space-y-5">
                                <div>
                                    <p className="text-slate-400 text-sm mb-1">Saldo disponible</p>
                                    <p className="text-2xl font-bold text-white">
                                        {currency === 'EUR' ? '€' : '$'}{balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-slate-300 text-sm font-medium">Monto a invertir (min. €300)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">€</span>
                                        <Input
                                            type="number"
                                            min="300"
                                            max={balance}
                                            step="0.01"
                                            placeholder="300.00"
                                            value={investAmount}
                                            onChange={handleAmountChange}
                                            className="pl-8 bg-slate-950/50 border-slate-800 text-white text-lg h-12"
                                            data-testid="invest-amount-input"
                                        />
                                    </div>
                                    {error && (
                                        <p className="text-red-400 text-sm flex items-center gap-1" data-testid="invest-error">
                                            <AlertTriangle className="w-3 h-3" />
                                            {error}
                                        </p>
                                    )}
                                </div>
                                {numAmount >= 300 && numAmount <= balance && (
                                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                                        <p className="text-emerald-400 text-sm">
                                            Saldo restante despues de la inversion: <strong>€{(balance - numAmount).toLocaleString('es-ES', { minimumFractionDigits: 2 })}</strong>
                                        </p>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                    <Button
                                        onClick={() => setStep('confirm')}
                                        disabled={!investAmount || numAmount < 300 || numAmount > balance}
                                        className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-5"
                                        data-testid="invest-continue-btn"
                                    >
                                        Continuar <ArrowRight className="w-4 h-4 ml-1" />
                                    </Button>
                                    <Button
                                        onClick={() => setStep('offer')}
                                        variant="outline"
                                        className="border-slate-700 text-slate-300 hover:bg-slate-800 py-5"
                                    >
                                        Volver
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Step: Confirmation */}
                        {step === 'confirm' && (
                            <div className="space-y-5">
                                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                    <p className="text-amber-400 text-sm font-medium mb-2 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4" /> Confirmar Inversion
                                    </p>
                                    <p className="text-slate-300 text-sm">
                                        Esta a punto de asignar <strong className="text-white">€{numAmount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</strong> a la seccion de inversion.
                                    </p>
                                    <p className="text-slate-400 text-xs mt-2">
                                        Los fondos se moveran a su cuenta de inversion y estaran disponibles cuando se active la seccion.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Button
                                        onClick={handleConfirm}
                                        disabled={loading}
                                        className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-5"
                                        data-testid="invest-confirm-btn"
                                    >
                                        {loading ? 'Procesando...' : 'CONFIRMAR'}
                                    </Button>
                                    <Button
                                        onClick={() => setStep('amount')}
                                        variant="outline"
                                        className="border-slate-700 text-slate-300 hover:bg-slate-800 py-5"
                                    >
                                        CANCELAR
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Step: Success */}
                        {step === 'success' && (
                            <div className="space-y-5 text-center py-4">
                                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                                </div>
                                <div>
                                    <p className="text-white font-semibold text-lg">Fondos Reservados</p>
                                    <p className="text-slate-400 text-sm mt-1">
                                        €{numAmount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} han sido asignados a la seccion de inversion.
                                    </p>
                                </div>
                                <div className="p-3 rounded-lg bg-slate-800/50 text-sm">
                                    <p className="text-slate-400">Estado: <span className="text-emerald-400 font-medium">Fondos reservados para inversion futura</span></p>
                                </div>
                                <Button
                                    onClick={() => { handleClose(); onContinueWithdraw(); }}
                                    className="bg-cyan-500 hover:bg-cyan-600 text-white font-semibold py-5 w-full"
                                    data-testid="invest-continue-withdraw-btn"
                                >
                                    Continuar con el Retiro
                                </Button>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
