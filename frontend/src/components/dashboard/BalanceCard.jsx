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

    const accentByType = {
        total:     { iconBg: 'rgba(0, 68, 129, 0.10)',  iconColor: '#004481', bar: '#004481' },
        available: { iconBg: 'rgba(25, 115, 184, 0.12)', iconColor: '#1973B8', bar: '#1973B8' },
        invested:  { iconBg: 'rgba(16, 185, 129, 0.12)', iconColor: '#10B981', bar: '#10B981' },
    };
    const accent = accentByType[type] || accentByType.total;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay }}
        >
            <Card
                className="relative overflow-hidden p-0 border-0 transition-shadow duration-300 hover:shadow-[0_8px_32px_rgba(7,33,70,0.12)]"
                style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    boxShadow: '0 1px 3px rgba(7, 33, 70, 0.04), 0 6px 20px rgba(7, 33, 70, 0.06)',
                }}
                data-testid={`balance-card-${type}`}
            >
                {/* Top accent bar */}
                <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent.bar }} />

                <div className="p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-lg flex items-center justify-center"
                                style={{ background: accent.iconBg }}
                            >
                                <Icon className="w-5 h-5" style={{ color: accent.iconColor }} />
                            </div>
                            <span
                                className="tracking-[0.06em] uppercase"
                                style={{ fontSize: '11px', fontWeight: 600, color: '#5B5B5B' }}
                            >
                                {title}
                            </span>
                        </div>
                        {trend !== null && (
                            <div
                                className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md`}
                                style={{
                                    fontVariantNumeric: 'tabular-nums',
                                    background: trend >= 0 ? 'rgba(16, 185, 129, 0.10)' : 'rgba(239, 68, 68, 0.10)',
                                    color: trend >= 0 ? '#047857' : '#B91C1C',
                                }}
                            >
                                {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {Math.abs(trend)}%
                            </div>
                        )}
                    </div>

                    <div
                        className="font-numbers"
                        data-testid={`balance-${type}-amount`}
                        style={{
                            fontSize: '34px',
                            fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums',
                            letterSpacing: '-0.025em',
                            lineHeight: 1.1,
                            color: '#072146',
                        }}
                    >
                        <OdometerValue
                            value={formatAmount(amount)}
                            staggerMs={50}
                            duration={1.4}
                        />
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: '#EEF1F4' }}>
                        <p className="text-[11px] tracking-[0.06em]" style={{ color: '#8A95A5', fontWeight: 500 }}>
                            {currency === 'USD' ? 'US Dollar' : 'Euro'}
                        </p>
                        <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: '#B0BAC6', fontWeight: 600 }}>
                            {currency}
                        </span>
                    </div>
                </div>
            </Card>
        </motion.div>
    );
};
