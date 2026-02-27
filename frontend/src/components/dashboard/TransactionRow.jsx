import { motion } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from 'lucide-react';

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
};

const statusConfig = {
    completed: 'bg-emerald-500',
    pending: 'bg-amber-500',
    pending_tax: 'bg-orange-500',
    rejected: 'bg-red-500',
};

export const TransactionRow = ({ transaction, index = 0 }) => {
    const config = typeConfig[transaction.transaction_type] || typeConfig.deposit;
    const Icon = config.icon;

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
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
                        <p className="font-medium text-white capitalize">
                            {transaction.transaction_type}
                        </p>
                        <p className="text-xs text-slate-500 truncate max-w-[200px]">
                            {transaction.description || `${transaction.transaction_type} transaction`}
                        </p>
                    </div>
                </div>
            </td>
            <td className="py-4 px-4">
                <span className={`font-mono text-sm font-medium ${config.color}`}>
                    {config.sign}{formatAmount(transaction.amount, transaction.currency)}
                </span>
            </td>
            <td className="py-4 px-4">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${statusConfig[transaction.status]}`} />
                    <span className="text-sm text-slate-400 capitalize">{transaction.status}</span>
                </div>
            </td>
            <td className="py-4 px-4 text-right">
                <span className="text-sm text-slate-500">{formatDate(transaction.created_at)}</span>
            </td>
        </motion.tr>
    );
};
