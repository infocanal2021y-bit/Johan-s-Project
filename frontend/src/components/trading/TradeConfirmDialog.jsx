import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { ArrowUpCircle, ArrowDownCircle, Shield, Target, TrendingUp, AlertTriangle, Loader2, Lightbulb } from 'lucide-react';

/**
 * Educational confirmation dialog for Buy / Sell.
 * Explains what the user is about to do and surfaces risk/reward context.
 */
export const TradeConfirmDialog = ({
    open, onClose, onConfirm,
    tradeType, symbol, symbolLabel,
    lotSize, currentPrice, stopLoss, takeProfit,
    accountBalance, loading,
    formatPrice,
}) => {
    if (!open) return null;
    const isBuy = tradeType === 'buy';
    const sideColor = isBuy ? '#0ecb81' : '#f6465d';
    const sideBg = isBuy ? 'bg-[#0ecb81]/10' : 'bg-[#f6465d]/10';
    const sideBorder = isBuy ? 'border-[#0ecb81]/40' : 'border-[#f6465d]/40';
    const IconSide = isBuy ? ArrowUpCircle : ArrowDownCircle;
    const sideLabel = isBuy ? 'Comprar (Long)' : 'Vender (Short)';
    const expectation = isBuy ? 'subira' : 'bajara';

    const lotNum = parseFloat(lotSize) || 0;
    const price = parseFloat(currentPrice) || 0;
    const sl = parseFloat(stopLoss) || null;
    const tp = parseFloat(takeProfit) || null;

    // Rough P/L estimates (assume 1 lot = 100,000 units, pip value = 10 per standard lot on USD pairs)
    // For display only — backend does real math
    let slRisk = null, tpReward = null;
    if (sl && price) {
        const diff = isBuy ? price - sl : sl - price;
        slRisk = diff * lotNum * (symbol && (symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('XAU')) ? 1 : 10000);
    }
    if (tp && price) {
        const diff = isBuy ? tp - price : price - tp;
        tpReward = diff * lotNum * (symbol && (symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('XAU')) ? 1 : 10000);
    }
    const rr = (slRisk && tpReward && slRisk > 0) ? (tpReward / slRisk).toFixed(2) : null;
    const riskPct = (slRisk && accountBalance) ? ((slRisk / accountBalance) * 100).toFixed(2) : null;

    const hasProtection = sl || tp;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-[#14181d] border-[#2b3139] max-w-md p-0 overflow-hidden" data-testid="trade-confirm-dialog">
                {/* Header */}
                <DialogHeader className={`px-5 py-4 border-b border-[#2b3139] ${sideBg}`}>
                    <DialogTitle className="text-white flex items-center gap-3 text-base">
                        <div className={`w-10 h-10 rounded-lg ${sideBg} border ${sideBorder} flex items-center justify-center`} style={{ color: sideColor }}>
                            <IconSide className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-white font-bold">{sideLabel}</p>
                            <p className="text-slate-400 text-xs font-normal">
                                {symbolLabel || symbol} · Estas a punto de abrir una posicion
                            </p>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                {/* Educational explainer */}
                <div className="px-5 py-4 bg-[#0b0e11] border-b border-[#2b3139]">
                    <div className="flex items-start gap-2.5">
                        <div className="w-6 h-6 rounded-lg bg-[#F0B90B]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Lightbulb className="w-3 h-3 text-[#F0B90B]" />
                        </div>
                        <p className="text-slate-300 text-[13px] leading-relaxed">
                            Abriras una posicion <strong style={{ color: sideColor }}>{isBuy ? 'larga' : 'corta'}</strong> esperando que el precio de <strong className="text-white">{symbolLabel || symbol}</strong> <strong>{expectation}</strong>. Tu ganancia o perdida flotara hasta que la cierres manualmente o se active SL/TP.
                        </p>
                    </div>
                </div>

                {/* Trade details */}
                <div className="p-5 space-y-3" data-testid="trade-confirm-details">
                    <div className="grid grid-cols-2 gap-3 text-[12px]">
                        <div className="bg-[#1e2329]/70 rounded-lg p-3">
                            <p className="text-slate-500 text-[10px] uppercase tracking-wider">Par</p>
                            <p className="text-white font-bold text-sm mt-1">{symbolLabel || symbol}</p>
                        </div>
                        <div className="bg-[#1e2329]/70 rounded-lg p-3">
                            <p className="text-slate-500 text-[10px] uppercase tracking-wider">Direccion</p>
                            <p className="font-bold text-sm mt-1" style={{ color: sideColor }}>{sideLabel}</p>
                        </div>
                        <div className="bg-[#1e2329]/70 rounded-lg p-3">
                            <p className="text-slate-500 text-[10px] uppercase tracking-wider">Volumen</p>
                            <p className="text-white font-mono font-bold text-sm mt-1">{lotSize} lotes</p>
                        </div>
                        <div className="bg-[#1e2329]/70 rounded-lg p-3">
                            <p className="text-slate-500 text-[10px] uppercase tracking-wider">Precio entrada</p>
                            <p className="text-[#F0B90B] font-mono font-bold text-sm mt-1">{formatPrice ? formatPrice(price, symbol) : price.toFixed(5)}</p>
                        </div>
                    </div>

                    {/* SL / TP or warning */}
                    {hasProtection ? (
                        <div className="space-y-2">
                            {sl && (
                                <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#f6465d]/5 border border-[#f6465d]/20">
                                    <Shield className="w-4 h-4 text-[#f6465d] flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Stop Loss · Proteccion</p>
                                        <p className="text-white text-[12px] font-mono">
                                            Cierre automatico en <span className="text-[#f6465d] font-bold">{formatPrice ? formatPrice(sl, symbol) : sl}</span>
                                            {slRisk != null && <> · Perdida max <span className="text-[#f6465d] font-bold">${Math.abs(slRisk).toFixed(2)}</span></>}
                                        </p>
                                    </div>
                                </div>
                            )}
                            {tp && (
                                <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#0ecb81]/5 border border-[#0ecb81]/20">
                                    <Target className="w-4 h-4 text-[#0ecb81] flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Take Profit · Objetivo</p>
                                        <p className="text-white text-[12px] font-mono">
                                            Cierre automatico en <span className="text-[#0ecb81] font-bold">{formatPrice ? formatPrice(tp, symbol) : tp}</span>
                                            {tpReward != null && <> · Ganancia obj <span className="text-[#0ecb81] font-bold">${Math.abs(tpReward).toFixed(2)}</span></>}
                                        </p>
                                    </div>
                                </div>
                            )}
                            {rr && (
                                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#F0B90B]/5 border border-[#F0B90B]/20">
                                    <div className="flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-[#F0B90B]" />
                                        <p className="text-[11px] text-slate-300">Ratio Riesgo : Recompensa</p>
                                    </div>
                                    <p className="text-[#F0B90B] font-bold text-sm">1 : {rr}</p>
                                </div>
                            )}
                            {riskPct && parseFloat(riskPct) > 2 && (
                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[#f6465d]/10 border border-[#f6465d]/30">
                                    <AlertTriangle className="w-4 h-4 text-[#f6465d] flex-shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-[#f6465d] leading-relaxed">
                                        <strong>Riesgo alto:</strong> esta operacion arriesga {riskPct}% de tu balance. Los profesionales no suelen arriesgar mas de 1-2% por trade.
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                            <p className="text-[11px] text-amber-300 leading-relaxed">
                                <strong>Sin proteccion:</strong> no has configurado Stop Loss ni Take Profit. Recomendamos siempre usar Stop Loss para limitar perdidas automaticamente. Puedes cancelar y anadirlos antes de abrir.
                            </p>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="px-5 py-4 border-t border-[#2b3139] bg-[#0b0e11] flex gap-2">
                    <Button
                        onClick={onClose}
                        variant="outline"
                        className="flex-1 border-[#2b3139] text-slate-400 hover:text-white hover:bg-[#1e2329]"
                        data-testid="trade-confirm-cancel"
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={loading}
                        className="flex-1 text-white font-bold"
                        style={{ backgroundColor: sideColor }}
                        data-testid="trade-confirm-ok"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <IconSide className="w-4 h-4 mr-1" />}
                        Confirmar {isBuy ? 'Compra' : 'Venta'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default TradeConfirmDialog;
