import { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, AreaSeries } from 'lightweight-charts';
import api from '../../lib/api';

const TIMEFRAMES = [
    { key: '1m', label: '1M' },
    { key: '5m', label: '5M' },
    { key: '15m', label: '15M' },
    { key: '1h', label: '1H' },
    { key: '4h', label: '4H' },
    { key: '1d', label: '1D' },
];

// ────────── Technical indicator helpers ──────────
function calcSMA(candles, period) {
    if (!candles || candles.length < period) return [];
    const out = [];
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
        sum += candles[i].close;
        if (i >= period) sum -= candles[i - period].close;
        if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period });
    }
    return out;
}

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

function calcEMAValues(values, period) {
    if (!values || values.length < period) return [];
    const out = [];
    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += values[i];
    let ema = sum / period;
    out.push(ema);
    for (let i = period; i < values.length; i++) {
        ema = values[i] * k + ema * (1 - k);
        out.push(ema);
    }
    return out; // length = values.length - period + 1
}

function calcRSI(candles, period = 14) {
    if (!candles || candles.length < period + 1) return [];
    const out = [];
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = candles[i].close - candles[i - 1].close;
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out.push({ time: candles[period].time, value: avgLoss === 0 ? 100 : 100 - 100 / (1 + rs) });

    for (let i = period + 1; i < candles.length; i++) {
        const diff = candles[i].close - candles[i - 1].close;
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        out.push({ time: candles[i].time, value: avgLoss === 0 ? 100 : 100 - 100 / (1 + rs) });
    }
    return out;
}

function calcBollinger(candles, period = 20, stdMult = 2) {
    if (!candles || candles.length < period) return { upper: [], middle: [], lower: [] };
    const upper = [], middle = [], lower = [];
    for (let i = period - 1; i < candles.length; i++) {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
        const mean = sum / period;
        let sq = 0;
        for (let j = i - period + 1; j <= i; j++) sq += (candles[j].close - mean) ** 2;
        const std = Math.sqrt(sq / period);
        const t = candles[i].time;
        upper.push({ time: t, value: mean + stdMult * std });
        middle.push({ time: t, value: mean });
        lower.push({ time: t, value: mean - stdMult * std });
    }
    return { upper, middle, lower };
}

function calcMACD(candles, fast = 12, slow = 26, signal = 9) {
    if (!candles || candles.length < slow + signal) return { macd: [], signal: [], hist: [] };
    const closes = candles.map(c => c.close);
    const emaFast = calcEMAValues(closes, fast); // starts at index fast-1
    const emaSlow = calcEMAValues(closes, slow); // starts at index slow-1
    // Align: emaSlow starts later. Shift by (slow - fast)
    const offset = slow - fast;
    const macdArr = [];
    for (let i = 0; i < emaSlow.length; i++) {
        macdArr.push(emaFast[i + offset] - emaSlow[i]);
    }
    // macdArr aligns to index (slow-1..end)
    const signalArr = calcEMAValues(macdArr, signal); // starts at index signal-1 of macdArr
    // Build output points
    const macd = [];
    const sig = [];
    const hist = [];
    for (let i = 0; i < macdArr.length; i++) {
        const t = candles[i + slow - 1].time;
        macd.push({ time: t, value: macdArr[i] });
    }
    for (let i = 0; i < signalArr.length; i++) {
        const idx = i + signal - 1;
        const t = candles[idx + slow - 1].time;
        sig.push({ time: t, value: signalArr[i] });
        const h = macdArr[idx] - signalArr[i];
        hist.push({ time: t, value: h, color: h >= 0 ? 'rgba(14,203,129,0.6)' : 'rgba(246,70,93,0.6)' });
    }
    return { macd, signal: sig, hist };
}

// Toggle pill
const IndicatorToggle = ({ active, onClick, label, color, testId }) => (
    <button
        onClick={onClick}
        data-testid={testId}
        className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all border ${
            active ? 'text-white border-transparent' : 'text-slate-500 border-[#2b3139] hover:text-slate-300'
        }`}
        style={active ? { backgroundColor: color + '22', borderColor: color + '66', color } : {}}
    >
        {label}
    </button>
);

export const CandlestickChart = ({ symbol, onPriceUpdate }) => {
    const chartRef = useRef(null);
    const rsiChartRef = useRef(null);
    const macdChartRef = useRef(null);
    const chartInstance = useRef(null);
    const rsiInstance = useRef(null);
    const macdInstance = useRef(null);
    const seriesRef = useRef(null);
    const smaSeriesRef = useRef(null);
    const emaSeriesRef = useRef(null);
    const bbUpperRef = useRef(null);
    const bbMidRef = useRef(null);
    const bbLowerRef = useRef(null);
    const volumeSeriesRef = useRef(null);
    const rsiSeriesRef = useRef(null);
    const macdLineRef = useRef(null);
    const macdSignalRef = useRef(null);
    const macdHistRef = useRef(null);

    const [timeframe, setTimeframe] = useState('1h');
    const [loading, setLoading] = useState(true);
    const [candles, setCandles] = useState([]);
    const [showSMA, setShowSMA] = useState(true);
    const [showEMA, setShowEMA] = useState(true);
    const [showBB, setShowBB] = useState(false);
    const [showVolume, setShowVolume] = useState(true);
    const [showRSI, setShowRSI] = useState(true);
    const [showMACD, setShowMACD] = useState(false);

    // ── Main chart (candles + SMA + EMA + BB + Volume) ──
    useEffect(() => {
        if (!chartRef.current) return;

        const chart = createChart(chartRef.current, {
            width: chartRef.current.clientWidth,
            height: 360,
            layout: { background: { color: '#0b0e11' }, textColor: '#848e9c', fontSize: 11 },
            grid: { vertLines: { color: 'rgba(30, 35, 41, 0.8)' }, horzLines: { color: 'rgba(30, 35, 41, 0.8)' } },
            crosshair: {
                mode: 0,
                vertLine: { color: 'rgba(240, 185, 11, 0.3)', width: 1, style: 2, labelBackgroundColor: '#F0B90B' },
                horzLine: { color: 'rgba(240, 185, 11, 0.3)', width: 1, style: 2, labelBackgroundColor: '#F0B90B' },
            },
            rightPriceScale: { borderColor: '#1e2329', scaleMargins: { top: 0.05, bottom: 0.25 } },
            timeScale: { borderColor: '#1e2329', timeVisible: true, secondsVisible: false },
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#0ecb81', downColor: '#f6465d',
            borderUpColor: '#0ecb81', borderDownColor: '#f6465d',
            wickUpColor: '#0ecb81', wickDownColor: '#f6465d',
        });
        const smaSeries = chart.addSeries(LineSeries, { color: '#F0B90B', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: 'SMA 20' });
        const emaSeries = chart.addSeries(LineSeries, { color: '#22d3ee', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: 'EMA 50' });
        const bbUpper = chart.addSeries(LineSeries, { color: 'rgba(167, 139, 250, 0.85)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: 'BB Upper' });
        const bbMid = chart.addSeries(LineSeries, { color: 'rgba(167, 139, 250, 0.45)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, title: 'BB Mid' });
        const bbLower = chart.addSeries(LineSeries, { color: 'rgba(167, 139, 250, 0.85)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: 'BB Lower' });

        // Volume histogram as its own price scale below candles
        const volSeries = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
            color: 'rgba(100, 116, 139, 0.5)',
        });
        chart.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.80, bottom: 0 },
            borderVisible: false,
        });

        chartInstance.current = chart;
        seriesRef.current = candleSeries;
        smaSeriesRef.current = smaSeries;
        emaSeriesRef.current = emaSeries;
        bbUpperRef.current = bbUpper;
        bbMidRef.current = bbMid;
        bbLowerRef.current = bbLower;
        volumeSeriesRef.current = volSeries;

        const handleResize = () => {
            if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
            chartInstance.current = null;
        };
    }, []);

    // ── RSI sub-chart ──
    useEffect(() => {
        if (!rsiChartRef.current) return;
        const rsiChart = createChart(rsiChartRef.current, {
            width: rsiChartRef.current.clientWidth,
            height: 110,
            layout: { background: { color: '#0b0e11' }, textColor: '#848e9c', fontSize: 10 },
            grid: { vertLines: { color: 'rgba(30, 35, 41, 0.8)' }, horzLines: { color: 'rgba(30, 35, 41, 0.4)' } },
            rightPriceScale: { borderColor: '#1e2329', scaleMargins: { top: 0.1, bottom: 0.1 } },
            timeScale: { borderColor: '#1e2329', visible: false },
            crosshair: { mode: 0, vertLine: { color: 'rgba(240, 185, 11, 0.2)', width: 1, style: 2 }, horzLine: { visible: false } },
        });
        const rsi = rsiChart.addSeries(LineSeries, {
            color: '#c084fc', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'RSI 14',
        });
        rsi.createPriceLine({ price: 70, color: '#f6465d', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '70' });
        rsi.createPriceLine({ price: 30, color: '#0ecb81', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '30' });
        rsi.createPriceLine({ price: 50, color: '#475569', lineWidth: 1, lineStyle: 3, axisLabelVisible: false });
        rsiInstance.current = rsiChart;
        rsiSeriesRef.current = rsi;

        const handleResize = () => {
            if (rsiChartRef.current) rsiChart.applyOptions({ width: rsiChartRef.current.clientWidth });
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            rsiChart.remove();
            rsiInstance.current = null;
        };
    }, []);

    // ── MACD sub-chart ──
    useEffect(() => {
        if (!macdChartRef.current) return;
        const macdChart = createChart(macdChartRef.current, {
            width: macdChartRef.current.clientWidth,
            height: 120,
            layout: { background: { color: '#0b0e11' }, textColor: '#848e9c', fontSize: 10 },
            grid: { vertLines: { color: 'rgba(30, 35, 41, 0.8)' }, horzLines: { color: 'rgba(30, 35, 41, 0.4)' } },
            rightPriceScale: { borderColor: '#1e2329', scaleMargins: { top: 0.15, bottom: 0.15 } },
            timeScale: { borderColor: '#1e2329', visible: false },
            crosshair: { mode: 0, vertLine: { color: 'rgba(240, 185, 11, 0.2)', width: 1, style: 2 }, horzLine: { visible: false } },
        });
        const hist = macdChart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, title: 'Hist' });
        const macdLine = macdChart.addSeries(LineSeries, { color: '#22d3ee', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'MACD' });
        const sigLine = macdChart.addSeries(LineSeries, { color: '#F0B90B', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'Signal' });
        macdLine.createPriceLine({ price: 0, color: '#475569', lineWidth: 1, lineStyle: 3, axisLabelVisible: false });

        macdInstance.current = macdChart;
        macdLineRef.current = macdLine;
        macdSignalRef.current = sigLine;
        macdHistRef.current = hist;

        const handleResize = () => {
            if (macdChartRef.current) macdChart.applyOptions({ width: macdChartRef.current.clientWidth });
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            macdChart.remove();
            macdInstance.current = null;
        };
    }, []);

    // ── Sync time scales of all 3 charts ──
    useEffect(() => {
        if (!chartInstance.current) return;
        const mainTS = chartInstance.current.timeScale();

        const syncTo = (targetInstance) => (range) => {
            if (range && targetInstance.current) {
                try { targetInstance.current.timeScale().setVisibleLogicalRange(range); } catch { /* noop */ }
            }
        };

        const toRSI = syncTo(rsiInstance);
        const toMACD = syncTo(macdInstance);
        mainTS.subscribeVisibleLogicalRangeChange(toRSI);
        mainTS.subscribeVisibleLogicalRangeChange(toMACD);

        return () => {
            try { mainTS.unsubscribeVisibleLogicalRangeChange(toRSI); } catch { /* noop */ }
            try { mainTS.unsubscribeVisibleLogicalRangeChange(toMACD); } catch { /* noop */ }
        };
    }, []);

    // ── Fetch candles ──
    useEffect(() => {
        let cancelled = false;
        const fetchCandles = async () => {
            setLoading(true);
            try {
                const res = await api.get('/trading/candles', { params: { symbol, timeframe } });
                if (cancelled || !res.data?.candles) return;
                const data = res.data.candles;
                setCandles(data);
                if (seriesRef.current) seriesRef.current.setData(data);
                if (chartInstance.current) chartInstance.current.timeScale().fitContent();
                // Notify parent of latest close for price alerts
                if (onPriceUpdate && data.length) onPriceUpdate(symbol, data[data.length - 1].close);
            } catch (e) { /* silent */ }
            finally { if (!cancelled) setLoading(false); }
        };
        fetchCandles();
        const interval = setInterval(fetchCandles, 5000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [symbol, timeframe, onPriceUpdate]);

    // ── Compute indicators ──
    const smaData = useMemo(() => calcSMA(candles, 20), [candles]);
    const emaData = useMemo(() => calcEMA(candles, 50), [candles]);
    const bbData = useMemo(() => calcBollinger(candles, 20, 2), [candles]);
    const rsiData = useMemo(() => calcRSI(candles, 14), [candles]);
    const macdData = useMemo(() => calcMACD(candles, 12, 26, 9), [candles]);
    const volumeData = useMemo(
        () => candles.map(c => ({
            time: c.time,
            value: c.volume || 0,
            color: c.close >= c.open ? 'rgba(14,203,129,0.35)' : 'rgba(246,70,93,0.35)',
        })),
        [candles]
    );

    // ── Apply/clear indicator data ──
    useEffect(() => { smaSeriesRef.current?.setData(showSMA ? smaData : []); }, [smaData, showSMA]);
    useEffect(() => { emaSeriesRef.current?.setData(showEMA ? emaData : []); }, [emaData, showEMA]);
    useEffect(() => {
        bbUpperRef.current?.setData(showBB ? bbData.upper : []);
        bbMidRef.current?.setData(showBB ? bbData.middle : []);
        bbLowerRef.current?.setData(showBB ? bbData.lower : []);
    }, [bbData, showBB]);
    useEffect(() => { volumeSeriesRef.current?.setData(showVolume ? volumeData : []); }, [volumeData, showVolume]);
    useEffect(() => { rsiSeriesRef.current?.setData(rsiData); }, [rsiData]);
    useEffect(() => {
        macdLineRef.current?.setData(macdData.macd);
        macdSignalRef.current?.setData(macdData.signal);
        macdHistRef.current?.setData(macdData.hist);
    }, [macdData]);

    // Latest RSI/MACD for badges
    const latestRSI = rsiData.length ? rsiData[rsiData.length - 1].value : null;
    const rsiLabel = latestRSI == null ? '—' : latestRSI >= 70 ? 'Sobrecompra' : latestRSI <= 30 ? 'Sobreventa' : 'Neutral';
    const rsiColor = latestRSI == null ? '#64748b' : latestRSI >= 70 ? '#f6465d' : latestRSI <= 30 ? '#0ecb81' : '#c084fc';

    const latestMACD = macdData.macd.length ? macdData.macd[macdData.macd.length - 1].value : null;
    const latestSignal = macdData.signal.length ? macdData.signal[macdData.signal.length - 1].value : null;
    const macdCross = (latestMACD != null && latestSignal != null)
        ? (latestMACD > latestSignal ? 'Alcista' : 'Bajista')
        : '—';
    const macdColor = latestMACD == null || latestSignal == null
        ? '#64748b'
        : latestMACD > latestSignal ? '#0ecb81' : '#f6465d';

    return (
        <div className="relative" data-testid="candlestick-chart">
            {/* Top bar */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
                <div className="flex items-center gap-1">
                    {TIMEFRAMES.map(tf => (
                        <button
                            key={tf.key} onClick={() => setTimeframe(tf.key)} data-testid={`tf-${tf.key}`}
                            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                                timeframe === tf.key
                                    ? 'bg-[#F0B90B]/15 text-[#F0B90B] border border-[#F0B90B]/40'
                                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                            }`}
                        >{tf.label}</button>
                    ))}
                </div>
                <div className="mx-2 h-4 w-px bg-[#2b3139]" />
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-slate-600 text-[10px] uppercase tracking-wider">Indicadores</span>
                    <IndicatorToggle active={showSMA} onClick={() => setShowSMA(v => !v)} label="SMA 20" color="#F0B90B" testId="indicator-sma" />
                    <IndicatorToggle active={showEMA} onClick={() => setShowEMA(v => !v)} label="EMA 50" color="#22d3ee" testId="indicator-ema" />
                    <IndicatorToggle active={showBB} onClick={() => setShowBB(v => !v)} label="Bollinger" color="#a78bfa" testId="indicator-bb" />
                    <IndicatorToggle active={showVolume} onClick={() => setShowVolume(v => !v)} label="Volumen" color="#94a3b8" testId="indicator-volume" />
                    <IndicatorToggle active={showRSI} onClick={() => setShowRSI(v => !v)} label="RSI 14" color="#c084fc" testId="indicator-rsi" />
                    <IndicatorToggle active={showMACD} onClick={() => setShowMACD(v => !v)} label="MACD" color="#22d3ee" testId="indicator-macd" />
                </div>
                {loading && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-600">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        Actualizando
                    </span>
                )}
            </div>

            {/* Main chart */}
            <div ref={chartRef} className="w-full rounded-lg overflow-hidden" style={{ minHeight: 360 }} />

            {/* RSI panel */}
            <div className={`mt-2 transition-all duration-200 ${showRSI ? 'opacity-100 max-h-40' : 'opacity-0 max-h-0 overflow-hidden'}`}>
                <div className="flex items-center justify-between px-1 mb-1">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                        RSI (14) <span className="text-[#c084fc]">·</span> Indice de Fuerza Relativa
                    </span>
                    {latestRSI != null && (
                        <span className="text-[10px] font-mono font-bold flex items-center gap-1.5" style={{ color: rsiColor }} data-testid="rsi-value-badge">
                            <span className="text-slate-500 font-sans font-normal">Actual:</span>
                            {latestRSI.toFixed(1)}
                            <span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: rsiColor + '22' }}>{rsiLabel}</span>
                        </span>
                    )}
                </div>
                <div ref={rsiChartRef} className="w-full rounded-lg overflow-hidden border border-[#1e2329]" style={{ minHeight: 110 }} />
            </div>

            {/* MACD panel */}
            <div className={`mt-2 transition-all duration-200 ${showMACD ? 'opacity-100 max-h-48' : 'opacity-0 max-h-0 overflow-hidden'}`}>
                <div className="flex items-center justify-between px-1 mb-1">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                        MACD (12, 26, 9) <span className="text-[#22d3ee]">·</span> Convergencia/Divergencia
                    </span>
                    {latestMACD != null && (
                        <span className="text-[10px] font-mono font-bold flex items-center gap-1.5" style={{ color: macdColor }} data-testid="macd-value-badge">
                            <span className="text-slate-500 font-sans font-normal">Cruce:</span>
                            <span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: macdColor + '22' }}>{macdCross}</span>
                        </span>
                    )}
                </div>
                <div ref={macdChartRef} className="w-full rounded-lg overflow-hidden border border-[#1e2329]" style={{ minHeight: 120 }} />
            </div>
        </div>
    );
};

export default CandlestickChart;
