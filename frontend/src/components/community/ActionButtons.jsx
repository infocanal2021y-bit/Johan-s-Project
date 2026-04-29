import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { Receipt, ArrowUpRight, Wallet } from 'lucide-react';

export const ActionButtons = ({ member, onAction }) => {
    if (!member.is_self) return null;
    const hasTax = member.has_pending_tax;
    const unlocked = member.partial_withdraw_unlocked;

    return (
        <div className="flex flex-wrap gap-2 mt-3" data-testid="community-self-actions">
            {hasTax && (
                <Link to="/transactions" className="flex-1 min-w-[140px]">
                    <Button size="sm" className="w-full bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold shadow-[0_0_14px_rgba(245,158,11,0.4)]" data-testid="community-pay-tax-btn">
                        <Receipt className="w-3.5 h-3.5 mr-1.5" />
                        Pagar Impuesto
                    </Button>
                </Link>
            )}
            <Link to="/withdraw" className="flex-1 min-w-[120px]" onClick={() => onAction?.('withdraw')}>
                <Button size="sm" className={`w-full ${unlocked
                    ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-[0_0_14px_rgba(16,185,129,0.45)]'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                } font-semibold`} data-testid="community-withdraw-btn">
                    <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
                    {unlocked ? 'Retirar' : 'Activar Retiro'}
                </Button>
            </Link>
            <Link to="/withdraw" className="flex-1 min-w-[120px]">
                <Button size="sm" variant="outline" className="w-full border-cyan-500/40 hover:bg-cyan-500/10 text-cyan-300" data-testid="community-pay-tax-partial-btn">
                    <Wallet className="w-3.5 h-3.5 mr-1.5" />
                    Abonar Impuesto
                </Button>
            </Link>
        </div>
    );
};
