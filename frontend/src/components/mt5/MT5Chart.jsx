import { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import api from '../../lib/api';
import { Button } from '../ui/button';
import { Activity, ArrowUpRight, ArrowDownRight, Maximize2, X, Loader2 } from 'lucide-react';

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

    const [timeframe, setTimeframe] = useState('H1');
    const [loading, setLoading] = useState(true);
    const [candles, setCandles] = useState([]);
    const [quote, setQuote] = useState({ bid: null, ask: null, pip: null });

    // Build chart once
    useEffect(() => {
        if (!containerRef.current) return;

        const chart = createChart(containerRef.current, {
            width: containerRef.current.clientWidth,
            height: variant === 'modal' ? 440 : 280,
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

        // Resize via ResizeObserver (safer than window resize for layout-driven sizing)
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
        };
    }, [variant]);

    // Fetch candles on symbol / timeframe change (and live refresh every 5s)
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
        const id = setInterval(fetchCandles, 5000);
        return () => { cancelled = true; clearInterval(id); };
    }, [symbol?.symbol, timeframe]);

    // Apply EMA when candles update
    const emaData = useMemo(() => calcEMA(candles, 21), [candles]);
    useEffect(() => { emaSeriesRef.current?.setData(emaData); }, [emaData]);

    // Derived stats
    const latest = candles.length ? candles[candles.length - 1] : null;
    const first = candles.length ? candles[0] : null;
    const deltaPct = (latest && first) ? ((latest.close - first.open) / first.open) * 100 : 0;
    const isUp = deltaPct >= 0;
    const high = candles.reduce((m, c) => Math.max(m, c.high), -Infinity);
    const low = candles.reduce((m, c) => Math.min(m, c.low), Infinity);

    const isModal = variant === 'modal';

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
                            <Activity className="w-3 h-3" /> Live
                        </span>
                        <h3 className="text-white text-base sm:text-lg font-bold font-mono tabular-nums tracking-wider" data-testid="mt5-chart-symbol">
                            {symbol?.symbol}
                        </h3>
                        <span className="text-slate-500 text-[11px] truncate">· {symbol?.name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {latest && (
                            <p className="text-xl sm:text-2xl text-white font-mono tabular-nums font-bold leading-none">
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
                            {isModal ? <X className="w-4 h-4" /> : <Maximize2 className="w-3.5 h-3.5 rotate-180" />}
                        </button>
                    )}
                </div>
            </div>

            {/* Timeframe pills */}
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

                <div className="flex items-center gap-2 text-[10px]">
                    {loading && (
                        <span className="inline-flex items-center gap-1 text-cyan-300/80">
                            <Loader2 className="w-3 h-3 animate-spin" /> Cargando velas
                        </span>
                    )}
                    {quote.bid != null && (
                        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950/70 ring-1 ring-slate-800">
                            <span className="text-slate-500">BID</span>
                            <span className="text-rose-300 font-mono tabular-nums font-bold">{fmtPrice(quote.bid)}</span>
                            <span className="text-slate-700">·</span>
                            <span className="text-slate-500">ASK</span>
                            <span className="text-emerald-300 font-mono tabular-nums font-bold">{fmtPrice(quote.ask)}</span>
                        </span>
                    )}
                </div>
            </div>

            {/* Chart canvas */}
            <div
                ref={containerRef}
                className="relative w-full rounded-lg overflow-hidden"
                style={{ minHeight: isModal ? 440 : 280 }}
            />

            {/* Quick trade actions */}
            {onOpenTrade && symbol && (
                <div className="relative mt-3 grid grid-cols-2 gap-2">
                    <Button
                        onClick={() => onOpenTrade(symbol, 'sell')}
                        data-testid="mt5-chart-sell-btn"
                        className="h-10 bg-rose-600/90 hover:bg-rose-600 text-white font-bold tracking-wider"
                    >
                        <ArrowDownRight className="w-4 h-4 mr-1.5" /> SELL · {fmtPrice(quote.bid || latest?.close)}
                    </Button>
                    <Button
                        onClick={() => onOpenTrade(symbol, 'buy')}
                        data-testid="mt5-chart-buy-btn"
                        className="h-10 bg-emerald-600/90 hover:bg-emerald-600 text-white font-bold tracking-wider"
                    >
                        <ArrowUpRight className="w-4 h-4 mr-1.5" /> BUY · {fmtPrice(quote.ask || latest?.close)}
                    </Button>
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
