import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import api from '../../lib/api';
import { Button } from '../ui/button';
import {
    Activity, ArrowUpRight, ArrowDownRight, X, Loader2,
    Shield, Target, Radio, Move,
} from 'lucide-react';

const TIMEFRAMES = [
    { key: 'M1',  label: 'M1',  hint: '1 min' },
    { key: 'M15', label: 'M15', hint: '15 min' },
    { key: 'H1',  label: 'H1',  hint: '1 hora' },
    { key: 'D1',  label: 'D1',  hint: '1 día' },
];

const fmtPrice = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 });

// Simple EMA for the mini overlay line
function calcEMA(candles, period) {
    if (!candles || candles.length < period) return [];
    const out = [];
    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += candles[i].close;
    let ema = sum / period;
    out.push({ time: candles[period - 1].time, value: ema });
    for (let i = period; i < candles.length; i++) {
        ema = candles[i].close * k + ema * (1 - k);
        out.push({ time: candles[i].time, value: ema });
    }
    return out;
}

export const MT5Chart = ({ symbol, onClose, onOpenTrade, variant = 'inline' }) => {
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const candleSeriesRef = useRef(null);
    const volumeSeriesRef = useRef(null);
    const emaSeriesRef = useRef(null);
    // Price lines for SL/TP
    const slLineRef = useRef(null);
    const tpLineRef = useRef(null);
    // Refs mirror state for event handlers (avoid stale closures)
    const slPriceRef = useRef(null);
    const tpPriceRef = useRef(null);
    const draggingRef = useRef(null);
    const latestCandleRef = useRef(null);

    const [timeframe, setTimeframe] = useState('H1');
    const [loading, setLoading] = useState(true);
    const [candles, setCandles] = useState([]);
    const [liveBar, setLiveBar] = useState(null); // latest tick-updated bar
    const [quote, setQuote] = useState({ bid: null, ask: null, pip: null });
    const [slPrice, setSlPrice] = useState(null);
    const [tpPrice, setTpPrice] = useState(null);
    const [isDragging, setIsDragging] = useState(null); // 'sl' | 'tp' | null
    const [flash, setFlash] = useState(null); // 'up' | 'down' | null

    // Reset SL/TP when the symbol changes (different instrument)
    useEffect(() => {
        setSlPrice(null);
        setTpPrice(null);
    }, [symbol?.symbol]);

    // Keep refs in sync
    useEffect(() => { slPriceRef.current = slPrice; }, [slPrice]);
    useEffect(() => { tpPriceRef.current = tpPrice; }, [tpPrice]);

    // ── Build chart once ──
    useEffect(() => {
        if (!containerRef.current) return;

        const chart = createChart(containerRef.current, {
            width: containerRef.current.clientWidth,
            height: variant === 'modal' ? 440 : 300,
            layout: {
                background: { color: 'transparent' },
                textColor: '#94a3b8',
                fontSize: 10,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
            },
            grid: {
                vertLines: { color: 'rgba(30, 41, 59, 0.45)' },
                horzLines: { color: 'rgba(30, 41, 59, 0.45)' },
            },
            crosshair: {
                mode: 0,
                vertLine: { color: 'rgba(34, 211, 238, 0.35)', width: 1, style: 2, labelBackgroundColor: '#0891b2' },
                horzLine: { color: 'rgba(34, 211, 238, 0.35)', width: 1, style: 2, labelBackgroundColor: '#0891b2' },
            },
            rightPriceScale: {
                borderColor: 'rgba(30, 41, 59, 0.9)',
                scaleMargins: { top: 0.08, bottom: 0.28 },
            },
            timeScale: {
                borderColor: 'rgba(30, 41, 59, 0.9)',
                timeVisible: true,
                secondsVisible: false,
            },
            handleScroll: true,
            handleScale: true,
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#0ecb81',
            downColor: '#f6465d',
            borderUpColor: '#0ecb81',
            borderDownColor: '#f6465d',
            wickUpColor: '#0ecb81',
            wickDownColor: '#f6465d',
        });

        const emaSeries = chart.addSeries(LineSeries, {
            color: '#22d3ee',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            title: 'EMA 21',
        });

        const volumeSeries = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
            color: 'rgba(100, 116, 139, 0.4)',
        });
        chart.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.82, bottom: 0 },
            borderVisible: false,
        });

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;
        volumeSeriesRef.current = volumeSeries;
        emaSeriesRef.current = emaSeries;

        // Responsive resize
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                const cr = entry.contentRect;
                if (cr.width > 0 && chartRef.current) {
                    try { chartRef.current.applyOptions({ width: Math.floor(cr.width) }); } catch { /* noop */ }
                }
            }
        });
        ro.observe(containerRef.current);

        return () => {
            try { ro.disconnect(); } catch { /* noop */ }
            try { chart.remove(); } catch { /* noop */ }
            chartRef.current = null;
            candleSeriesRef.current = null;
            volumeSeriesRef.current = null;
            emaSeriesRef.current = null;
            slLineRef.current = null;
            tpLineRef.current = null;
        };
    }, [variant]);

    // ── Fetch full candle history on symbol / timeframe change ──
    useEffect(() => {
        if (!symbol?.symbol) return;
        let cancelled = false;
        const fetchCandles = async () => {
            try {
                const res = await api.get('/mt5/candles', {
                    params: { symbol: symbol.symbol, timeframe },
                });
                if (cancelled) return;
                const data = res.data?.candles || [];
                setCandles(data);
                setQuote({ bid: res.data?.bid, ask: res.data?.ask, pip: res.data?.pip });
                if (data.length) latestCandleRef.current = data[data.length - 1];
                if (candleSeriesRef.current) candleSeriesRef.current.setData(data);
                if (volumeSeriesRef.current) {
                    volumeSeriesRef.current.setData(data.map(c => ({
                        time: c.time,
                        value: c.volume || 0,
                        color: c.close >= c.open ? 'rgba(14,203,129,0.35)' : 'rgba(246,70,93,0.35)',
                    })));
                }
                if (chartRef.current) chartRef.current.timeScale().fitContent();
            } catch (e) { /* silent */ }
            finally { if (!cancelled) setLoading(false); }
        };
        setLoading(true);
        fetchCandles();
        const id = setInterval(fetchCandles, 20000); // full resync every 20 s
        return () => { cancelled = true; clearInterval(id); };
    }, [symbol?.symbol, timeframe]);

    // ── Live tick polling (every 1 s) — updates last bar + BID/ASK ──
    useEffect(() => {
        if (!symbol?.symbol) return;
        let cancelled = false;
        const fetchTick = async () => {
            try {
                const res = await api.get('/mt5/tick', {
                    params: { symbol: symbol.symbol, timeframe },
                });
                if (cancelled) return;
                const bar = res.data?.bar;
                if (!bar || !candleSeriesRef.current) return;

                const prev = latestCandleRef.current;
                const updated = { ...bar };
                latestCandleRef.current = updated;
                candleSeriesRef.current.update(updated);
                setLiveBar(updated);

                // Flash direction based on close movement
                if (prev && prev.time === updated.time) {
                    if (updated.close > prev.close) setFlash('up');
                    else if (updated.close < prev.close) setFlash('down');
                }

                setQuote(q => ({
                    ...q,
                    bid: res.data?.bid ?? q.bid,
                    ask: res.data?.ask ?? q.ask,
                }));
            } catch (e) { /* silent */ }
        };
        fetchTick();
        const id = setInterval(fetchTick, 1000);
        return () => { cancelled = true; clearInterval(id); };
    }, [symbol?.symbol, timeframe]);

    // Clear flash after animation
    useEffect(() => {
        if (!flash) return;
        const t = setTimeout(() => setFlash(null), 400);
        return () => clearTimeout(t);
    }, [flash]);

    // ── EMA overlay ──
    const emaData = useMemo(() => calcEMA(candles, 21), [candles]);
    useEffect(() => { emaSeriesRef.current?.setData(emaData); }, [emaData]);

    // ── Sync SL price line ──
    useEffect(() => {
        const series = candleSeriesRef.current;
        if (!series) return;
        if (slPrice != null) {
            if (!slLineRef.current) {
                slLineRef.current = series.createPriceLine({
                    price: slPrice,
                    color: '#f6465d',
                    lineWidth: 2,
                    lineStyle: 2,
                    axisLabelVisible: true,
                    title: 'SL',
                });
            } else {
                slLineRef.current.applyOptions({ price: slPrice });
            }
        } else if (slLineRef.current) {
            try { series.removePriceLine(slLineRef.current); } catch { /* noop */ }
            slLineRef.current = null;
        }
    }, [slPrice]);

    // ── Sync TP price line ──
    useEffect(() => {
        const series = candleSeriesRef.current;
        if (!series) return;
        if (tpPrice != null) {
            if (!tpLineRef.current) {
                tpLineRef.current = series.createPriceLine({
                    price: tpPrice,
                    color: '#0ecb81',
                    lineWidth: 2,
                    lineStyle: 2,
                    axisLabelVisible: true,
                    title: 'TP',
                });
            } else {
                tpLineRef.current.applyOptions({ price: tpPrice });
            }
        } else if (tpLineRef.current) {
            try { series.removePriceLine(tpLineRef.current); } catch { /* noop */ }
            tpLineRef.current = null;
        }
    }, [tpPrice]);

    // ── Drag SL/TP lines with mouse / touch ──
    useEffect(() => {
        const container = containerRef.current;
        const series = candleSeriesRef.current;
        if (!container || !series) return;

        const TOLERANCE_PX = 8;

        const getY = (ev) => {
            const rect = container.getBoundingClientRect();
            const clientY = ev.touches ? ev.touches[0]?.clientY : ev.clientY;
            return clientY - rect.top;
        };

        const onDown = (ev) => {
            const y = getY(ev);
            if (y == null) return;
            const slY = slPriceRef.current != null ? series.priceToCoordinate(slPriceRef.current) : null;
            const tpY = tpPriceRef.current != null ? series.priceToCoordinate(tpPriceRef.current) : null;
            if (slY != null && Math.abs(y - slY) <= TOLERANCE_PX) {
                draggingRef.current = 'sl';
                setIsDragging('sl');
                ev.preventDefault();
            } else if (tpY != null && Math.abs(y - tpY) <= TOLERANCE_PX) {
                draggingRef.current = 'tp';
                setIsDragging('tp');
                ev.preventDefault();
            }
        };

        const onMove = (ev) => {
            if (!draggingRef.current) {
                // Update cursor if hovering a line
                const y = getY(ev);
                if (y != null) {
                    const slY = slPriceRef.current != null ? series.priceToCoordinate(slPriceRef.current) : null;
                    const tpY = tpPriceRef.current != null ? series.priceToCoordinate(tpPriceRef.current) : null;
                    const near = (slY != null && Math.abs(y - slY) <= TOLERANCE_PX) || (tpY != null && Math.abs(y - tpY) <= TOLERANCE_PX);
                    container.style.cursor = near ? 'ns-resize' : '';
                }
                return;
            }
            const y = getY(ev);
            if (y == null) return;
            const price = series.coordinateToPrice(y);
            if (price == null) return;
            if (draggingRef.current === 'sl') setSlPrice(Number(price));
            else if (draggingRef.current === 'tp') setTpPrice(Number(price));
            ev.preventDefault();
        };

        const onUp = () => {
            if (draggingRef.current) {
                draggingRef.current = null;
                setIsDragging(null);
                container.style.cursor = '';
            }
        };

        container.addEventListener('mousedown', onDown);
        container.addEventListener('touchstart', onDown, { passive: false });
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
        container.addEventListener('mousemove', onMove);

        return () => {
            container.removeEventListener('mousedown', onDown);
            container.removeEventListener('touchstart', onDown);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchend', onUp);
            container.removeEventListener('mousemove', onMove);
        };
    }, []);

    // Helpers to seed SL/TP near current price when user clicks "Set SL"
    const currentPrice = liveBar?.close ?? candles[candles.length - 1]?.close ?? 0;
    const placeSL = useCallback((direction = 'buy') => {
        const delta = currentPrice * 0.01;
        const price = direction === 'buy' ? currentPrice - delta : currentPrice + delta;
        setSlPrice(Number(price.toFixed(5)));
    }, [currentPrice]);
    const placeTP = useCallback((direction = 'buy') => {
        const delta = currentPrice * 0.02;
        const price = direction === 'buy' ? currentPrice + delta : currentPrice - delta;
        setTpPrice(Number(price.toFixed(5)));
    }, [currentPrice]);

    // Submit trade with SL/TP prefilled
    const submitTrade = (dir) => {
        if (onOpenTrade) {
            onOpenTrade(symbol, dir, {
                sl: slPrice != null ? slPrice : undefined,
                tp: tpPrice != null ? tpPrice : undefined,
            });
        }
    };

    // Derived stats
    const latest = liveBar || (candles.length ? candles[candles.length - 1] : null);
    const first = candles.length ? candles[0] : null;
    const deltaPct = (latest && first) ? ((latest.close - first.open) / first.open) * 100 : 0;
    const isUp = deltaPct >= 0;
    const high = candles.reduce((m, c) => Math.max(m, c.high), latest?.high ?? -Infinity);
    const low = candles.reduce((m, c) => Math.min(m, c.low), latest?.low ?? Infinity);

    const isModal = variant === 'modal';

    // Risk preview (USD loss/gain if SL/TP hit) — simplified display only
    const pricePrecision = (quote.pip && quote.pip < 0.01) ? 5 : 2;
    const slDelta = slPrice != null && latest ? latest.close - slPrice : null;
    const tpDelta = tpPrice != null && latest ? tpPrice - latest.close : null;

    return (
        <div
            className={`relative rounded-xl border border-slate-800/80 bg-gradient-to-br from-[#0a1628]/95 via-slate-950/95 to-slate-950 overflow-hidden ${
                isModal ? 'p-4 sm:p-5' : 'p-3 sm:p-4'
            }`}
            data-testid="mt5-chart"
        >
            {/* Ambient glow */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-16 -right-16 w-60 h-60 rounded-full opacity-25 blur-3xl"
                style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.35), transparent 70%)' }}
            />

            {/* Header */}
            <div className="relative flex items-start justify-between gap-3 flex-wrap mb-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/15 ring-1 ring-cyan-500/30 text-cyan-300 text-[10px] font-bold tracking-wider uppercase">
                            <Radio className="w-3 h-3 animate-pulse" /> Tick 1s
                        </span>
                        <h3 className="text-white text-base sm:text-lg font-bold font-mono tabular-nums tracking-wider" data-testid="mt5-chart-symbol">
                            {symbol?.symbol}
                        </h3>
                        <span className="text-slate-500 text-[11px] truncate">· {symbol?.name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {latest && (
                            <p
                                className={`text-xl sm:text-2xl font-mono tabular-nums font-bold leading-none transition-colors duration-300 ${
                                    flash === 'up' ? 'text-emerald-300' : flash === 'down' ? 'text-rose-300' : 'text-white'
                                }`}
                                data-testid="mt5-chart-last-price"
                            >
                                {fmtPrice(latest.close)}
                            </p>
                        )}
                        <span className={`inline-flex items-center gap-0.5 text-xs font-mono font-bold ${
                            isUp ? 'text-emerald-300' : 'text-rose-300'
                        }`}>
                            {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                            {isUp ? '+' : ''}{deltaPct.toFixed(2)}%
                        </span>
                        <span className="text-[10px] text-slate-500 hidden sm:inline">
                            H <span className="text-slate-300 font-mono tabular-nums">{fmtPrice(high)}</span>
                            <span className="mx-1.5">·</span>
                            L <span className="text-slate-300 font-mono tabular-nums">{fmtPrice(low)}</span>
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            data-no-hover
                            data-testid="mt5-chart-close"
                            className="w-8 h-8 rounded-md bg-slate-800/70 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center ring-1 ring-slate-700/80 transition-colors"
                            aria-label="Cerrar"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Timeframe + SL/TP controls */}
            <div className="relative flex items-center justify-between gap-2 mb-2 flex-wrap">
                <div className="inline-flex items-center gap-1 rounded-lg bg-slate-950/70 ring-1 ring-slate-800 p-1">
                    {TIMEFRAMES.map(tf => (
                        <button
                            key={tf.key}
                            type="button"
                            onClick={() => setTimeframe(tf.key)}
                            data-no-hover
                            data-testid={`mt5-tf-${tf.key}`}
                            title={tf.hint}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wider transition-all ${
                                timeframe === tf.key
                                    ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                                    : 'text-slate-500 hover:text-slate-200'
                            }`}
                        >{tf.label}</button>
                    ))}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                    {/* SL toggle/remove */}
                    <button
                        type="button"
                        onClick={() => slPrice == null ? placeSL('buy') : setSlPrice(null)}
                        data-no-hover
                        data-testid="mt5-chart-toggle-sl"
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold tracking-wider ring-1 transition-all ${
                            slPrice != null
                                ? 'bg-rose-500/20 text-rose-200 ring-rose-400/40'
                                : 'bg-slate-950/70 text-slate-400 ring-slate-800 hover:text-rose-300'
                        }`}
                    >
                        <Shield className="w-3 h-3" />
                        {slPrice != null ? `SL ${Number(slPrice).toFixed(pricePrecision)}` : 'Colocar SL'}
                    </button>
                    {/* TP toggle/remove */}
                    <button
                        type="button"
                        onClick={() => tpPrice == null ? placeTP('buy') : setTpPrice(null)}
                        data-no-hover
                        data-testid="mt5-chart-toggle-tp"
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold tracking-wider ring-1 transition-all ${
                            tpPrice != null
                                ? 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40'
                                : 'bg-slate-950/70 text-slate-400 ring-slate-800 hover:text-emerald-300'
                        }`}
                    >
                        <Target className="w-3 h-3" />
                        {tpPrice != null ? `TP ${Number(tpPrice).toFixed(pricePrecision)}` : 'Colocar TP'}
                    </button>
                    {loading && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-cyan-300/80">
                            <Loader2 className="w-3 h-3 animate-spin" /> Cargando
                        </span>
                    )}
                </div>
            </div>

            {/* Hint about dragging */}
            {(slPrice != null || tpPrice != null) && (
                <div className="relative mb-2 flex items-center gap-1.5 text-[10px] text-slate-500">
                    <Move className="w-3 h-3 text-cyan-400" />
                    <span>Arrastra las líneas <span className="text-rose-300 font-semibold">SL</span> / <span className="text-emerald-300 font-semibold">TP</span> para ajustar el nivel. Se precargan al abrir la orden.</span>
                </div>
            )}

            {/* Chart canvas */}
            <div
                ref={containerRef}
                className={`relative w-full rounded-lg overflow-hidden ${isDragging ? 'ring-1 ring-cyan-500/50' : ''}`}
                style={{ minHeight: isModal ? 440 : 300, userSelect: 'none', touchAction: isDragging ? 'none' : 'auto' }}
                data-testid="mt5-chart-canvas"
            />

            {/* Risk preview */}
            {(slPrice != null || tpPrice != null) && latest && (
                <div className="relative mt-2 grid grid-cols-2 gap-2 text-[10px]">
                    <div className="px-2 py-1.5 rounded-md bg-rose-500/10 ring-1 ring-rose-500/25">
                        <p className="text-rose-300/70 font-semibold uppercase tracking-wider">Distancia SL</p>
                        <p className="text-rose-200 font-mono tabular-nums font-bold">
                            {slDelta == null ? '—' : `${slDelta >= 0 ? '+' : ''}${Math.abs(slDelta).toFixed(pricePrecision)}`}
                        </p>
                    </div>
                    <div className="px-2 py-1.5 rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/25">
                        <p className="text-emerald-300/70 font-semibold uppercase tracking-wider">Distancia TP</p>
                        <p className="text-emerald-200 font-mono tabular-nums font-bold">
                            {tpDelta == null ? '—' : `${tpDelta >= 0 ? '+' : ''}${Math.abs(tpDelta).toFixed(pricePrecision)}`}
                        </p>
                    </div>
                </div>
            )}

            {/* Quote + quick-trade */}
            {onOpenTrade && symbol && (
                <div className="relative mt-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px]">
                        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950/70 ring-1 ring-slate-800">
                            <span className="text-slate-500">BID</span>
                            <span className="text-rose-300 font-mono tabular-nums font-bold">{fmtPrice(quote.bid)}</span>
                            <span className="text-slate-700">·</span>
                            <span className="text-slate-500">ASK</span>
                            <span className="text-emerald-300 font-mono tabular-nums font-bold">{fmtPrice(quote.ask)}</span>
                        </span>
                        {(slPrice != null || tpPrice != null) && (
                            <span className="text-[10px] text-cyan-300/80">
                                SL/TP se precargarán en el panel de orden
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            onClick={() => submitTrade('sell')}
                            data-testid="mt5-chart-sell-btn"
                            className="h-10 bg-rose-600/90 hover:bg-rose-600 text-white font-bold tracking-wider"
                        >
                            <ArrowDownRight className="w-4 h-4 mr-1.5" /> SELL · {fmtPrice(quote.bid || latest?.close)}
                        </Button>
                        <Button
                            onClick={() => submitTrade('buy')}
                            data-testid="mt5-chart-buy-btn"
                            className="h-10 bg-emerald-600/90 hover:bg-emerald-600 text-white font-bold tracking-wider"
                        >
                            <ArrowUpRight className="w-4 h-4 mr-1.5" /> BUY · {fmtPrice(quote.ask || latest?.close)}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Fullscreen-ish modal wrapper for a dedicated chart view
export const MT5ChartModal = ({ symbol, open, onClose, onOpenTrade }) => {
    if (!open || !symbol) return null;
    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="w-full sm:max-w-4xl max-h-[94vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <MT5Chart
                    symbol={symbol}
                    onClose={onClose}
                    onOpenTrade={onOpenTrade}
                    variant="modal"
                />
            </div>
        </div>
    );
};

export default MT5Chart;
