import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Wallet, PiggyBank, DollarSign } from 'lucide-react';
import { Card } from '../ui/card';
import { useEffect, useState } from 'react';

const iconMap = {
    total: Wallet,
    available: DollarSign,
    invested: PiggyBank,
};

export const BalanceCard = ({ title, amount, currency = 'USD', type = 'total', trend = null, delay = 0 }) => {
    const [displayAmount, setDisplayAmount] = useState(0);
    const Icon = iconMap[type] || Wallet;

    // Animated counter
    useEffect(() => {
        const duration = 1000;
        const steps = 60;
        const increment = amount / steps;
        let current = 0;
        
        const timer = setInterval(() => {
            current += increment;
            if (current >= amount) {
                setDisplayAmount(amount);
                clearInterval(timer);
            } else {
                setDisplayAmount(current);
            }
        }, duration / steps);

        return () => clearInterval(timer);
    }, [amount]);

    const formatAmount = (value) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
        }).format(value);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay }}
        >
            <Card className="relative overflow-hidden bg-slate-900/70 backdrop-blur-xl border-slate-800 p-6 tracing-beam card-hover">
                {/* Glow orb */}
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl" />
                
                <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                <Icon className="w-5 h-5 text-emerald-400" />
                            </div>
                            <span className="text-sm font-medium text-slate-400">{title}</span>
                        </div>
                        {trend !== null && (
                            <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                                trend >= 0 
                                    ? 'bg-emerald-500/20 text-emerald-400' 
                                    : 'bg-red-500/20 text-red-400'
                            }`}>
                                {trend >= 0 ? (
                                    <TrendingUp className="w-3 h-3" />
                                ) : (
                                    <TrendingDown className="w-3 h-3" />
                                )}
                                {Math.abs(trend)}%
                            </div>
                        )}
                    </div>
                    
                    <p className="font-mono text-3xl font-bold text-white tabular-nums animate-count">
                        {formatAmount(displayAmount)}
                    </p>
                    
                    <p className="text-xs text-slate-500 mt-2">
                        {currency === 'USD' ? 'US Dollar' : 'Euro'}
                    </p>
                </div>
            </Card>
        </motion.div>
    );
};
