import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/button';
import { X, ChevronRight, ChevronLeft, GraduationCap, Rocket, Sparkles, Check } from 'lucide-react';

const STORAGE_KEY = 'tradingDemoTour_v1';

/**
 * Each step:
 * { target: CSS selector, title, content, side?: 'top'|'bottom'|'left'|'right', icon?, action? }
 *  - action: optional label to highlight (e.g. "Haz clic para continuar") and onAction callback
 */
export const TRAINING_STEPS = [
    {
        target: null,
        title: '¡Bienvenido al Trading Demo!',
        icon: '🎓',
        content: 'En los proximos pasos aprenderas las herramientas esenciales de una plataforma profesional. Todo es 100% simulado — practica sin riesgos.',
        sub: 'Duracion estimada: 2 minutos',
    },
    {
        target: '[data-testid="asset-BTCUSD"]',
        title: '1. Selector de pares',
        icon: '🪙',
        content: 'Aqui eliges que activo quieres operar. Cada par tiene su propio precio y volatilidad. Ejemplos: BTC/USD es muy volatil, EUR/USD es mas estable.',
        tip: 'Empieza con EUR/USD si eres principiante: movimientos menores = menos estres.',
        side: 'bottom',
    },
    {
        target: '[data-testid="tf-1h"]',
        title: '2. Temporalidad (timeframe)',
        icon: '⏱️',
        content: 'Cada vela representa un intervalo de tiempo. 1M = 1 minuto, 1H = 1 hora, 1D = 1 dia. Cuanto mayor el timeframe, mas estables las tendencias.',
        tip: 'Los principiantes suelen empezar en 1H o 4H — hay menos ruido.',
        side: 'bottom',
    },
    {
        target: '[data-testid="candlestick-chart"]',
        title: '3. Las velas japonesas',
        icon: '🕯️',
        content: 'Cada vela muestra 4 datos: Apertura, Cierre, Maximo y Minimo del periodo. Verde = subio. Rojo = bajo. El cuerpo es entre apertura y cierre, las "mechas" son maximos/minimos.',
        tip: 'Varias velas verdes seguidas = tendencia alcista. Varias rojas = bajista.',
        side: 'bottom',
    },
    {
        target: '[data-testid="indicator-sma"]',
        title: '4. Indicadores tecnicos',
        icon: '📊',
        content: 'Son formulas que analizan el precio para ayudarte a decidir. SMA/EMA suavizan la tendencia. Bollinger mide volatilidad. RSI detecta sobrecompra/sobreventa. MACD detecta cruces.',
        tip: 'No actives todos a la vez: empieza con 1-2 indicadores simples.',
        side: 'bottom',
    },
    {
        target: '[data-testid="orderbook"]',
        title: '5. Libro de ordenes',
        icon: '📖',
        content: 'Muestra las ordenes de compra (verdes, debajo del precio) y venta (rojas, encima). Las barras laterales indican la cantidad acumulada. Los "iceberg" ambar son ordenes grandes de profesionales.',
        tip: 'Mucha demanda concentrada = posible soporte/resistencia.',
        side: 'left',
    },
    {
        target: '[data-testid="lot-input"]',
        title: '6. Volumen (Lotes)',
        icon: '📏',
        content: 'Define cuanto dinero arriesgas. 1 lote estandar = 100,000 unidades de la moneda base. 0.10 lotes = 10,000 unidades (mini lote). 0.01 = micro lote.',
        tip: 'Regla de oro: no arriesgues mas del 1-2% de tu balance por operacion.',
        side: 'left',
    },
    {
        target: '[data-testid="sl-input"]',
        title: '7. Stop Loss (proteccion)',
        icon: '🛡️',
        content: 'Tu red de seguridad. Precio al que la operacion se cerrara automaticamente si va en tu contra, limitando la perdida maxima. Sin Stop Loss = sin control de riesgo.',
        tip: 'Si compras a 1.0850, pon el SL en 1.0820 (pierdes max 30 pips).',
        side: 'left',
    },
    {
        target: '[data-testid="tp-input"]',
        title: '8. Take Profit (objetivo)',
        icon: '🎯',
        content: 'Precio al que la operacion se cerrara automaticamente cuando alcance tu objetivo de ganancia. Asegura los beneficios cuando no puedes vigilar el grafico.',
        tip: 'Buena practica: TP al menos 2x la distancia del SL (ratio 1:2).',
        side: 'left',
    },
    {
        target: '[data-testid="buy-btn"]',
        title: '9. Comprar (Long)',
        icon: '📈',
        content: 'Abre una posicion esperando que el precio SUBA. Ganas si el precio sube, pierdes si baja. Tu profit/loss flota hasta que cierras la operacion.',
        tip: 'Solo compra si el analisis tecnico apoya una subida probable.',
        side: 'left',
    },
    {
        target: '[data-testid="sell-btn"]',
        title: '10. Vender (Short)',
        icon: '📉',
        content: 'Abre una posicion esperando que el precio BAJE. En trading puedes ganar en ambas direcciones, no solo cuando sube.',
        tip: 'En crypto, los cortos son muy riesgosos — empieza solo con largos.',
        side: 'left',
    },
    {
        target: '[data-testid="price-alerts-btn"]',
        title: '11. Alertas de precio',
        icon: '🔔',
        content: 'Configura notificaciones cuando el precio cruce niveles clave. No necesitas mirar el grafico todo el dia — la plataforma te avisa.',
        tip: 'Util para niveles de soporte/resistencia importantes.',
        side: 'bottom',
    },
    {
        target: '[data-testid="tab-positions"]',
        title: '12. Tus posiciones',
        icon: '💼',
        content: 'Aqui veras todas tus operaciones abiertas en tiempo real. Puedes cerrarlas manualmente o dejar que el SL/TP lo hagan automaticamente.',
        tip: 'Revisa el P/L flotante: verde = ganando, rojo = perdiendo.',
        side: 'top',
    },
    {
        target: null,
        title: '¡Estas listo!',
        icon: '🚀',
        content: 'Ahora tienes las bases. Prueba el "Modo Replay" para practicar con datos historicos, completa los "Retos" para ganar XP, y explora el centro "Aprende" para profundizar.',
        sub: 'Recuerda: este es un entorno seguro. Equivocarse es parte de aprender.',
        final: true,
    },
];

export const useGuidedTour = () => {
    const [open, setOpen] = useState(false);
    const [completed, setCompleted] = useState(false);

    useEffect(() => {
        try {
            setCompleted(localStorage.getItem(STORAGE_KEY) === 'done');
        } catch { /* noop */ }
    }, []);

    const start = useCallback(() => setOpen(true), []);
    const close = useCallback((markDone = false) => {
        setOpen(false);
        if (markDone) {
            try { localStorage.setItem(STORAGE_KEY, 'done'); } catch { /* noop */ }
            setCompleted(true);
        }
    }, []);

    return { open, completed, start, close };
};

export const GuidedTour = ({ open, onClose }) => {
    const [stepIdx, setStepIdx] = useState(0);
    const [targetRect, setTargetRect] = useState(null);
    const scrollRestoreRef = useRef(null);
    const step = TRAINING_STEPS[stepIdx];

    // Position target on every step change
    useEffect(() => {
        if (!open || !step) {
            setTargetRect(null);
            return;
        }
        if (!step.target) {
            setTargetRect(null);
            return;
        }
        const updateRect = () => {
            const el = document.querySelector(step.target);
            if (!el) { setTargetRect(null); return; }
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            setTimeout(() => {
                const rect = el.getBoundingClientRect();
                setTargetRect({
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                });
            }, 400);
        };
        updateRect();
        window.addEventListener('resize', updateRect);
        window.addEventListener('scroll', updateRect, true);
        return () => {
            window.removeEventListener('resize', updateRect);
            window.removeEventListener('scroll', updateRect, true);
        };
    }, [open, step]);

    useEffect(() => {
        if (open) {
            scrollRestoreRef.current = window.scrollY;
            setStepIdx(0);
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    const next = () => {
        if (stepIdx < TRAINING_STEPS.length - 1) setStepIdx(i => i + 1);
        else onClose(true);
    };
    const prev = () => setStepIdx(i => Math.max(0, i - 1));
    const skip = () => onClose(false);

    if (!open || !step) return null;

    // Calculate tooltip position
    const pad = 12;
    const tipWidth = 360;
    const tipHeight = 240;
    let tipStyle = {};

    if (!targetRect) {
        // Centered (for intro/outro steps)
        tipStyle = {
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
        };
    } else {
        const side = step.side || 'bottom';
        let top, left;
        switch (side) {
            case 'top':
                top = targetRect.top - tipHeight - pad;
                left = targetRect.left + targetRect.width / 2 - tipWidth / 2;
                break;
            case 'left':
                top = targetRect.top + targetRect.height / 2 - tipHeight / 2;
                left = targetRect.left - tipWidth - pad;
                break;
            case 'right':
                top = targetRect.top + targetRect.height / 2 - tipHeight / 2;
                left = targetRect.left + targetRect.width + pad;
                break;
            default: // bottom
                top = targetRect.top + targetRect.height + pad;
                left = targetRect.left + targetRect.width / 2 - tipWidth / 2;
        }
        // Clamp to viewport
        top = Math.max(16, Math.min(window.innerHeight - tipHeight - 16, top));
        left = Math.max(16, Math.min(window.innerWidth - tipWidth - 16, left));
        tipStyle = { top, left };
    }

    return (
        <AnimatePresence>
            <motion.div
                key="tour-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60]"
                data-testid="guided-tour-overlay"
            >
                {/* Dark backdrop */}
                <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={skip} />

                {/* Spotlight hole */}
                {targetRect && (
                    <motion.div
                        key={`spotlight-${stepIdx}`}
                        initial={{ opacity: 0, scale: 1.1 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="absolute rounded-xl pointer-events-none"
                        style={{
                            top: targetRect.top - 6,
                            left: targetRect.left - 6,
                            width: targetRect.width + 12,
                            height: targetRect.height + 12,
                            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.72), 0 0 0 3px #F0B90B, 0 0 40px rgba(240, 185, 11, 0.5)',
                            background: 'transparent',
                        }}
                    />
                )}

                {/* Floating tooltip card */}
                <motion.div
                    key={`tip-${stepIdx}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute w-[360px] bg-[#14181d] border-2 border-[#F0B90B]/40 rounded-xl shadow-2xl overflow-hidden"
                    style={tipStyle}
                    data-testid="guided-tour-tip"
                >
                    {/* Header */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-[#F0B90B]/15 to-transparent border-b border-[#2b3139]">
                        <span className="text-2xl flex-shrink-0">{step.icon || '💡'}</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-[13px] leading-tight truncate">{step.title}</p>
                            <p className="text-[#F0B90B]/70 text-[10px] font-mono">
                                Paso {stepIdx + 1} / {TRAINING_STEPS.length}
                            </p>
                        </div>
                        <button onClick={skip} className="text-slate-500 hover:text-white transition-colors" data-testid="tour-close">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-4 space-y-3">
                        <p className="text-slate-200 text-[13px] leading-relaxed">{step.content}</p>
                        {step.tip && (
                            <div className="p-2.5 rounded-lg bg-[#22d3ee]/10 border border-[#22d3ee]/20 flex items-start gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-[#22d3ee] mt-0.5 flex-shrink-0" />
                                <p className="text-cyan-300 text-[11px] leading-relaxed italic">{step.tip}</p>
                            </div>
                        )}
                        {step.sub && (
                            <p className="text-slate-500 text-[11px] text-center italic">{step.sub}</p>
                        )}
                    </div>

                    {/* Progress bar */}
                    <div className="h-1 bg-[#2b3139] relative">
                        <motion.div
                            className="absolute inset-y-0 left-0 bg-[#F0B90B]"
                            initial={false}
                            animate={{ width: `${((stepIdx + 1) / TRAINING_STEPS.length) * 100}%` }}
                            transition={{ duration: 0.3 }}
                        />
                    </div>

                    {/* Footer buttons */}
                    <div className="px-4 py-3 flex items-center justify-between bg-[#0b0e11]">
                        <Button
                            onClick={prev}
                            disabled={stepIdx === 0}
                            variant="ghost"
                            size="sm"
                            className="text-slate-500 hover:text-white hover:bg-[#1e2329] text-xs disabled:opacity-30"
                            data-testid="tour-prev"
                        >
                            <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Atras
                        </Button>
                        <button onClick={skip} className="text-slate-600 hover:text-slate-400 text-[11px] underline underline-offset-2" data-testid="tour-skip">
                            Saltar tour
                        </button>
                        <Button
                            onClick={next}
                            size="sm"
                            className="bg-[#F0B90B] hover:bg-[#F0B90B]/90 text-black font-bold text-xs"
                            data-testid="tour-next"
                        >
                            {step.final ? (<><Check className="w-3.5 h-3.5 mr-1" /> Terminar</>)
                                : stepIdx === 0 ? (<><Rocket className="w-3.5 h-3.5 mr-1" /> Empezar</>)
                                : (<>Siguiente <ChevronRight className="w-3.5 h-3.5 ml-1" /></>)}
                        </Button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export const GuidedTourLauncher = ({ onStart, completed }) => (
    <button
        onClick={onStart}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#F0B90B]/10 border border-[#F0B90B]/30 text-[#F0B90B] hover:bg-[#F0B90B]/20 transition-colors text-[10px] font-bold tracking-wider"
        data-testid="tour-launcher"
    >
        <GraduationCap className="w-3.5 h-3.5" />
        {completed ? 'Repetir tour' : 'Modo Guia'}
        {!completed && <span className="w-1.5 h-1.5 rounded-full bg-[#F0B90B] animate-pulse" />}
    </button>
);

export default GuidedTour;
