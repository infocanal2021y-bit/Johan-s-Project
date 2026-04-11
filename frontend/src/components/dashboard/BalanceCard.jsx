import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Wallet, PiggyBank, DollarSign } from 'lucide-react';
import { Card } from '../ui/card';
import { OdometerValue } from './OdometerValue';

const iconMap = {
    total: Wallet,
    available: DollarSign,
    invested: PiggyBank,
};

export const BalanceCard = ({ title, amount, currency = 'USD', type = 'total', trend = null, delay = 0 }) => {
    const Icon = iconMap[type] || Wallet;

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
                            <span className="text-sm font-normal text-slate-400 tracking-wide">{title}</span>
                        </div>
                        {trend !== null && (
                            <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                                trend >= 0 
                                    ? 'bg-emerald-500/20 text-emerald-400' 
                                    : 'bg-red-500/20 text-red-400'
                            }`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {trend >= 0 ? (
                                    <TrendingUp className="w-3 h-3" />
                                ) : (
                                    <TrendingDown className="w-3 h-3" />
                                )}
                                {Math.abs(trend)}%
                            </div>
                        )}
                    </div>
                    
                    <div 
                        className="text-white font-numbers"
                        data-testid={`balance-${type}-amount`}
                        style={{ 
                            fontSize: '36px', 
                            fontWeight: 500, 
                            fontVariantNumeric: 'tabular-nums',
                            letterSpacing: '-0.02em',
                            lineHeight: 1.1
                        }}
                    >
                        <OdometerValue 
                            value={formatAmount(amount)} 
                            staggerMs={50}
                            duration={1.4}
                        />
                    </div>
                    
                    <p className="text-xs text-slate-500 mt-2 font-light tracking-wide">
                        {currency === 'USD' ? 'US Dollar' : 'Euro'}
                    </p>
                </div>
            </Card>
        </motion.div>
    );
};
