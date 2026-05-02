import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { Receipt, ArrowUpRight, Wallet } from 'lucide-react';

// =============================================================================
// ActionButtons — BBVA Premium Banking primary actions for own account.
// Sits inside the expanded MemberCard; only visible when `member.is_self`.
// =============================================================================
export const ActionButtons = ({ member, onAction }) => {
    if (!member.is_self) return null;
    const hasTax = member.has_pending_tax;
    const unlocked = member.partial_withdraw_unlocked;

    return (
        <div className="flex flex-wrap gap-2" data-testid="community-self-actions">
            {hasTax && (
                <Link to="/transactions" className="flex-1 min-w-[140px]">
                    <Button
                        size="sm"
                        className="w-full bg-[#F59E0B] hover:bg-[#D97706] text-white font-semibold shadow-sm transition-colors"
                        data-testid="community-pay-tax-btn"
                    >
                        <Receipt className="w-3.5 h-3.5 mr-1.5" />
                        Pagar Impuesto
                    </Button>
                </Link>
            )}
            <Link
                to="/withdraw"
                className="flex-1 min-w-[120px]"
                onClick={() => onAction?.('withdraw')}
            >
                <Button
                    size="sm"
                    className={`w-full font-semibold shadow-sm transition-colors ${
                        unlocked
                            ? 'bg-[#16A34A] hover:bg-[#15803D] text-white'
                            : 'bg-[#F4F6F8] hover:bg-[#E5EAF0] text-[#6B7280] border border-[#E5EAF0]'
                    }`}
                    data-testid="community-withdraw-btn"
                >
                    <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
                    {unlocked ? 'Retirar' : 'Activar Retiro'}
                </Button>
            </Link>
            <Link to="/withdraw" className="flex-1 min-w-[120px]">
                <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-[#1E3A8A]/30 hover:bg-[#1E3A8A]/[0.06] text-[#1E3A8A] font-semibold transition-colors"
                    data-testid="community-pay-tax-partial-btn"
                >
                    <Wallet className="w-3.5 h-3.5 mr-1.5" />
                    Abonar Impuesto
                </Button>
            </Link>
        </div>
    );
};
