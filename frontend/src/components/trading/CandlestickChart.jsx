import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import api from '../../lib/api';

const TIMEFRAMES = [
    { key: '1m', label: '1M' },
    { key: '5m', label: '5M' },
    { key: '15m', label: '15M' },
    { key: '1h', label: '1H' },
    { key: '4h', label: '4H' },
    { key: '1d', label: '1D' },
];

export const CandlestickChart = ({ symbol }) => {
    const chartRef = useRef(null);
    const chartInstance = useRef(null);
    const seriesRef = useRef(null);
    const [timeframe, setTimeframe] = useState('1h');
    const [loading, setLoading] = useState(true);

    // Create chart once
    useEffect(() => {
        if (!chartRef.current) return;

        const chart = createChart(chartRef.current, {
            width: chartRef.current.clientWidth,
            height: 420,
            layout: {
                background: { color: '#0b0e11' },
                textColor: '#848e9c',
                fontSize: 11,
            },
            grid: {
                vertLines: { color: 'rgba(30, 35, 41, 0.8)' },
                horzLines: { color: 'rgba(30, 35, 41, 0.8)' },
            },
            crosshair: {
                mode: 0,
                vertLine: { color: 'rgba(240, 185, 11, 0.3)', width: 1, style: 2, labelBackgroundColor: '#F0B90B' },
                horzLine: { color: 'rgba(240, 185, 11, 0.3)', width: 1, style: 2, labelBackgroundColor: '#F0B90B' },
            },
            rightPriceScale: {
                borderColor: '#1e2329',
                scaleMargins: { top: 0.05, bottom: 0.05 },
            },
            timeScale: {
                borderColor: '#1e2329',
                timeVisible: true,
                secondsVisible: false,
            },
        });

        const series = chart.addSeries(CandlestickSeries, {
            upColor: '#0ecb81',
            downColor: '#f6465d',
            borderUpColor: '#0ecb81',
            borderDownColor: '#f6465d',
            wickUpColor: '#0ecb81',
            wickDownColor: '#f6465d',
        });

        chartInstance.current = chart;
        seriesRef.current = series;

        const handleResize = () => {
            if (chartRef.current) {
                chart.applyOptions({ width: chartRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
            chartInstance.current = null;
            seriesRef.current = null;
        };
    }, []);

    // Fetch and update data
    useEffect(() => {
        let cancelled = false;

        const fetchCandles = async () => {
            setLoading(true);
            try {
                const res = await api.get('/trading/candles', { params: { symbol, timeframe } });
                if (!cancelled && seriesRef.current && res.data?.candles) {
                    seriesRef.current.setData(res.data.candles);
                    if (chartInstance.current) {
                        chartInstance.current.timeScale().fitContent();
                    }
                }
            } catch (e) {
                // silent
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchCandles();
        const interval = setInterval(fetchCandles, 5000);

        return () => { cancelled = true; clearInterval(interval); };
    }, [symbol, timeframe]);

    return (
        <div className="relative" data-testid="candlestick-chart">
            {/* Timeframe selector */}
            <div className="flex items-center gap-1 mb-2">
                {TIMEFRAMES.map(tf => (
                    <button
                        key={tf.key}
                        onClick={() => setTimeframe(tf.key)}
                        data-testid={`tf-${tf.key}`}
                        className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                            timeframe === tf.key
                                ? 'bg-[#F0B90B]/15 text-[#F0B90B] border border-[#F0B90B]/40'
                                : 'text-slate-500 hover:text-slate-300 border border-transparent'
                        }`}
                    >
                        {tf.label}
                    </button>
                ))}
                {loading && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-600">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        Actualizando
                    </span>
                )}
            </div>

            {/* Chart container */}
            <div ref={chartRef} className="w-full rounded-lg overflow-hidden" style={{ minHeight: 420 }} />
        </div>
    );
};

export default CandlestickChart;
