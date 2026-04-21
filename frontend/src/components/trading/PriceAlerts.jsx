import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Bell, BellOff, Plus, Trash2, TrendingUp, TrendingDown, AlertCircle, Check } from 'lucide-react';
import { toast } from 'sonner';

const STORAGE_KEY = 'tradingDemoPriceAlerts_v1';

const SYMBOL_LABELS = {
    EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY',
    BTCUSD: 'BTC/USD', ETHUSD: 'ETH/USD', XAUUSD: 'XAU/USD',
};

const loadAlerts = () => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
};
const saveAlerts = (alerts) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts)); } catch { /* noop */ }
};

export const PriceAlerts = ({ open, onClose, symbol, currentPrice, prices, formatPrice }) => {
    const [alerts, setAlerts] = useState(loadAlerts);
    const [newPrice, setNewPrice] = useState('');
    const [newDirection, setNewDirection] = useState('above');
    const lastPricesRef = useRef({});

    useEffect(() => { saveAlerts(alerts); }, [alerts]);

    // Check all alerts against new prices
    useEffect(() => {
        if (!prices) return;
        const updated = [];
        let changed = false;
        alerts.forEach(a => {
            if (a.triggered) {
                updated.push(a);
                return;
            }
            const cur = prices[a.symbol];
            const prev = lastPricesRef.current[a.symbol];
            if (cur == null) {
                updated.push(a);
                return;
            }
            const curPrice = typeof cur === 'object' ? (cur.bid + cur.ask) / 2 : cur;
            const prevPrice = typeof prev === 'object' ? (prev.bid + prev.ask) / 2 : prev;
            let crossed = false;
            if (prevPrice != null) {
                if (a.direction === 'above' && prevPrice < a.price && curPrice >= a.price) crossed = true;
                if (a.direction === 'below' && prevPrice > a.price && curPrice <= a.price) crossed = true;
            }
            if (crossed) {
                toast.success(
                    `Alerta ${SYMBOL_LABELS[a.symbol] || a.symbol}: precio ${a.direction === 'above' ? 'subio' : 'bajo'} ${a.price}`,
                    { icon: a.direction === 'above' ? '📈' : '📉', duration: 7000 }
                );
                try {
                    if ('Notification' in window && Notification.permission === 'granted') {
                        new Notification('Alerta de precio Trading Demo', {
                            body: `${SYMBOL_LABELS[a.symbol] || a.symbol} ${a.direction === 'above' ? 'supero' : 'cayo bajo'} ${a.price}`,
                        });
                    }
                } catch { /* noop */ }
                updated.push({ ...a, triggered: true, triggeredAt: Date.now() });
                changed = true;
            } else {
                updated.push(a);
            }
        });
        lastPricesRef.current = { ...prices };
        if (changed) setAlerts(updated);
    }, [prices, alerts]);

    // Request browser notification permission once on first open
    useEffect(() => {
        if (open && 'Notification' in window && Notification.permission === 'default') {
            try { Notification.requestPermission(); } catch { /* noop */ }
        }
    }, [open]);

    const addAlert = useCallback(() => {
        const priceNum = parseFloat(newPrice);
        if (!priceNum || priceNum <= 0) { toast.error('Ingrese un precio valido'); return; }
        const a = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            symbol,
            price: priceNum,
            direction: newDirection,
            createdAt: Date.now(),
            triggered: false,
        };
        setAlerts(prev => [a, ...prev]);
        setNewPrice('');
        toast.success(`Alerta creada: ${SYMBOL_LABELS[symbol] || symbol} ${newDirection === 'above' ? '>=' : '<='} ${priceNum}`);
    }, [newPrice, newDirection, symbol]);

    const removeAlert = useCallback((id) => {
        setAlerts(prev => prev.filter(a => a.id !== id));
    }, []);

    const clearTriggered = useCallback(() => {
        setAlerts(prev => prev.filter(a => !a.triggered));
    }, []);

    const active = alerts.filter(a => !a.triggered);
    const triggered = alerts.filter(a => a.triggered);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-[#14181d] border-[#1e2329] max-w-lg p-0 overflow-hidden" data-testid="price-alerts-dialog">
                <DialogHeader className="px-5 py-4 border-b border-[#1e2329]">
                    <DialogTitle className="text-white text-base flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#F0B90B]/15 flex items-center justify-center">
                            <Bell className="w-4 h-4 text-[#F0B90B]" />
                        </div>
                        Alertas de Precio
                        <span className="ml-auto text-[10px] text-slate-500 font-mono">{active.length} activas</span>
                    </DialogTitle>
                </DialogHeader>

                {/* Create new alert */}
                <div className="p-5 border-b border-[#1e2329] bg-[#0b0e11]">
                    <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-3">
                        Nueva alerta para <span className="text-[#F0B90B] font-bold">{SYMBOL_LABELS[symbol] || symbol}</span>
                        {currentPrice != null && (
                            <span className="ml-2 text-slate-400 font-mono">
                                · Actual: {formatPrice ? formatPrice(currentPrice, symbol) : currentPrice.toFixed(5)}
                            </span>
                        )}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setNewDirection('above')}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors ${
                                newDirection === 'above'
                                    ? 'bg-[#0ecb81]/15 border-[#0ecb81]/40 text-[#0ecb81]'
                                    : 'bg-[#1e2329] border-[#2b3139] text-slate-500 hover:text-slate-300'
                            }`}
                            data-testid="alert-direction-above"
                        >
                            <TrendingUp className="w-3.5 h-3.5" /> Sube por encima
                        </button>
                        <button
                            onClick={() => setNewDirection('below')}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors ${
                                newDirection === 'below'
                                    ? 'bg-[#f6465d]/15 border-[#f6465d]/40 text-[#f6465d]'
                                    : 'bg-[#1e2329] border-[#2b3139] text-slate-500 hover:text-slate-300'
                            }`}
                            data-testid="alert-direction-below"
                        >
                            <TrendingDown className="w-3.5 h-3.5" /> Baja por debajo
                        </button>
                    </div>
                    <div className="flex gap-2 mt-3">
                        <Input
                            type="number"
                            step="any"
                            placeholder="Precio objetivo"
                            value={newPrice}
                            onChange={(e) => setNewPrice(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addAlert()}
                            className="bg-[#1e2329] border-[#2b3139] text-white text-sm font-mono flex-1"
                            data-testid="alert-price-input"
                        />
                        <Button
                            onClick={addAlert}
                            className="bg-[#F0B90B] hover:bg-[#F0B90B]/90 text-black font-bold px-4"
                            data-testid="alert-add-btn"
                        >
                            <Plus className="w-4 h-4 mr-1" /> Crear
                        </Button>
                    </div>
                    {currentPrice != null && newPrice && !isNaN(parseFloat(newPrice)) && (
                        <p className="text-[10px] text-slate-500 mt-2 font-mono">
                            Distancia: {(((parseFloat(newPrice) - currentPrice) / currentPrice) * 100).toFixed(3)}%
                        </p>
                    )}
                </div>

                {/* Alert list */}
                <div className="max-h-80 overflow-y-auto p-3">
                    {active.length === 0 && triggered.length === 0 ? (
                        <div className="py-10 text-center">
                            <BellOff className="w-8 h-8 text-[#2b3139] mx-auto mb-2" />
                            <p className="text-slate-600 text-xs">Sin alertas configuradas</p>
                        </div>
                    ) : (
                        <div className="space-y-2" data-testid="alerts-list">
                            {active.map(a => (
                                <motion.div
                                    key={a.id}
                                    layout
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex items-center gap-3 bg-[#1e2329]/60 rounded-lg p-3 border border-[#2b3139]/50"
                                >
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                        a.direction === 'above' ? 'bg-[#0ecb81]/15' : 'bg-[#f6465d]/15'
                                    }`}>
                                        {a.direction === 'above'
                                            ? <TrendingUp className="w-3.5 h-3.5 text-[#0ecb81]" />
                                            : <TrendingDown className="w-3.5 h-3.5 text-[#f6465d]" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-xs font-semibold">
                                            {SYMBOL_LABELS[a.symbol] || a.symbol}
                                            <span className="text-slate-500 font-normal mx-1.5">
                                                {a.direction === 'above' ? '>=' : '<='}
                                            </span>
                                            <span className="font-mono text-[#F0B90B]">{formatPrice ? formatPrice(a.price, a.symbol) : a.price}</span>
                                        </p>
                                        <p className="text-[10px] text-slate-600 mt-0.5">
                                            {prices && prices[a.symbol]
                                                ? <>Actual: <span className="font-mono text-slate-400">{formatPrice ? formatPrice((prices[a.symbol].bid + prices[a.symbol].ask) / 2, a.symbol) : ((prices[a.symbol].bid + prices[a.symbol].ask) / 2).toFixed(5)}</span></>
                                                : 'Esperando precio...'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => removeAlert(a.id)}
                                        className="p-1.5 rounded-md hover:bg-[#f6465d]/10 text-slate-600 hover:text-[#f6465d] transition-colors"
                                        data-testid={`alert-remove-${a.id}`}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </motion.div>
                            ))}

                            {triggered.length > 0 && (
                                <>
                                    <div className="flex items-center justify-between pt-3 pb-1">
                                        <span className="text-[10px] text-slate-600 uppercase tracking-wider">Historial ({triggered.length})</span>
                                        <button
                                            onClick={clearTriggered}
                                            className="text-[10px] text-slate-500 hover:text-[#f6465d] transition-colors"
                                            data-testid="alerts-clear-triggered"
                                        >Limpiar</button>
                                    </div>
                                    <AnimatePresence>
                                        {triggered.map(a => (
                                            <motion.div
                                                key={a.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 0.6 }}
                                                className="flex items-center gap-3 bg-[#1e2329]/30 rounded-lg p-2.5 border border-[#2b3139]/30"
                                            >
                                                <div className="w-6 h-6 rounded-lg bg-[#F0B90B]/10 flex items-center justify-center flex-shrink-0">
                                                    <Check className="w-3 h-3 text-[#F0B90B]" />
                                                </div>
                                                <p className="text-slate-400 text-[11px] flex-1 min-w-0 truncate">
                                                    {SYMBOL_LABELS[a.symbol] || a.symbol} {a.direction === 'above' ? 'supero' : 'cayo bajo'} {a.price}
                                                </p>
                                                <span className="text-[10px] text-slate-600 font-mono flex-shrink-0">
                                                    {a.triggeredAt ? new Date(a.triggeredAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''}
                                                </span>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer info */}
                <div className="px-5 py-2.5 border-t border-[#1e2329] bg-[#0b0e11] flex items-center gap-2">
                    <AlertCircle className="w-3 h-3 text-slate-600 flex-shrink-0" />
                    <p className="text-[10px] text-slate-600 leading-relaxed">
                        Las alertas se guardan localmente en este navegador. Las notificaciones del escritorio requieren permiso.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default PriceAlerts;
