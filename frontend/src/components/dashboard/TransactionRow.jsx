import { motion } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const typeConfig = {
    deposit: {
        icon: ArrowDownLeft,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/20',
        sign: '+',
    },
    withdraw: {
        icon: ArrowUpRight,
        color: 'text-red-400',
        bg: 'bg-red-500/20',
        sign: '-',
    },
    transfer: {
        icon: ArrowLeftRight,
        color: 'text-cyan-400',
        bg: 'bg-cyan-500/20',
        sign: '-',
    },
    admin_credit: {
        icon: ArrowDownLeft,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/20',
        sign: '+',
    },
};

const statusConfig = {
    completed: 'bg-emerald-500',
    pending: 'bg-amber-500',
    pending_tax: 'bg-orange-500',
    under_review: 'bg-purple-500',
    processing: 'bg-cyan-500',
    rejected: 'bg-red-500',
};

export const TransactionRow = ({ transaction, index = 0 }) => {
    const navigate = useNavigate();
    const config = typeConfig[transaction.transaction_type] || typeConfig.deposit;
    const Icon = config.icon;
    const showCompleteBtn = transaction.transaction_type === 'withdraw' && transaction.status === 'processing';

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-ES', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatAmount = (amount, currency) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
        }).format(amount);
    };

    return (
        <motion.tr
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className="table-row-hover border-b border-slate-800/50 last:border-0"
            data-testid={`transaction-row-${transaction.id}`}
        >
            <td className="py-4 px-4">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 ${config.color}`} />
                    </div>
                    <div>
                        <p className="font-medium text-white capitalize" style={{ fontWeight: 500 }}>
                            {transaction.transaction_type === 'admin_credit' ? 'Depósito' : transaction.transaction_type}
                        </p>
                        <p className="text-xs text-slate-500 truncate max-w-[200px] font-light">
                            {transaction.description || `${transaction.transaction_type} transaction`}
                        </p>
                    </div>
                </div>
            </td>
            <td className="py-4 px-4">
                <span 
                    className={`text-sm font-numbers ${config.color}`}
                    style={{ 
                        fontWeight: 500, 
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: '-0.01em'
                    }}
                >
                    {config.sign}{formatAmount(transaction.amount, transaction.currency)}
                </span>
            </td>
            <td className="py-4 px-4">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${statusConfig[transaction.status] || 'bg-slate-500'}`} />
                    <span className="text-sm text-slate-400 capitalize font-normal">{transaction.status?.replace('_', ' ')}</span>
                </div>
                {showCompleteBtn && (
                    <button
                        onClick={() => navigate(`/complete-withdrawal/${transaction.id}`)}
                        className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
                        data-testid={`complete-process-btn-${transaction.id}`}
                    >
                        Completar proceso <ChevronRight className="w-3 h-3" />
                    </button>
                )}
            </td>
            <td className="py-4 px-4 text-right">
                <span 
                    className="text-sm text-slate-500"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                    {formatDate(transaction.created_at)}
                </span>
            </td>
        </motion.tr>
    );
};
