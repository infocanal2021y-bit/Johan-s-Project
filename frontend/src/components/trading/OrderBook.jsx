import { useEffect, useMemo, useState } from 'react';

/**
 * Mock order book simulator.
 * Generates deterministic-ish ladders of bids and asks around the current bid/ask.
 * Re-shuffles every ~1.5s to feel alive.
 */
function hashSeed(str, salt = 0) {
    let h = 2166136261 ^ salt;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
}

function buildLadder(symbol, basePrice, side, tick, depth, tickNum) {
    const rows = [];
    for (let i = 1; i <= depth; i++) {
        const price = side === 'bid' ? basePrice - tick * i : basePrice + tick * i;
        const seed = hashSeed(`${symbol}-${side}-${i}-${tickNum}`);
        const seed2 = hashSeed(`${symbol}-${side}-${i}-size-${tickNum}`, 7);
        const baseSize = 0.1 + seed * 2.8 + Math.pow(i / depth, 0.6) * 3;
        const spike = seed2 > 0.92 ? 8 + seed2 * 12 : 0;
        const size = baseSize + spike;
        rows.push({ price, size, isLarge: spike > 0 });
    }

    // Inject iceberg — huge order that appears briefly (every ~12 ticks) at a random depth
    const icebergSeed = hashSeed(`${symbol}-${side}-iceberg-${Math.floor(tickNum / 4)}`, 13);
    if (icebergSeed > 0.68) {
        const idx = Math.min(depth - 1, Math.floor(icebergSeed * depth));
        const icebergSize = 35 + hashSeed(`${symbol}-${side}-ice-size-${tickNum}`, 21) * 50;
        rows[idx] = {
            ...rows[idx],
            size: icebergSize,
            isLarge: true,
            isIceberg: true,
        };
    }
    return rows;
}

export const OrderBook = ({ symbol, bid, ask, formatPrice, onPriceClick }) => {
    const [tickNum, setTickNum] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => setTickNum(t => t + 1), 1500);
        return () => clearInterval(timer);
    }, []);

    // Determine tick size based on symbol
    const tick = useMemo(() => {
        if (!symbol) return 0.0001;
        if (symbol.includes('JPY')) return 0.01;
        if (symbol.includes('BTC')) return 10;
        if (symbol.includes('ETH')) return 0.5;
        if (symbol.includes('XAU')) return 0.05;
        return 0.0001;
    }, [symbol]);

    const depth = 10;
    const asks = useMemo(
        () => (ask ? buildLadder(symbol, ask, 'ask', tick, depth, tickNum) : []),
        [symbol, ask, tick, tickNum]
    );
    const bids = useMemo(
        () => (bid ? buildLadder(symbol, bid, 'bid', tick, depth, tickNum) : []),
        [symbol, bid, tick, tickNum]
    );

    const maxSize = useMemo(() => {
        const all = [...asks, ...bids].map(r => r.size);
        return all.length ? Math.max(...all) : 1;
    }, [asks, bids]);

    const spread = bid && ask ? ask - bid : 0;
    const spreadPct = bid ? ((spread / bid) * 100).toFixed(3) : '0.000';

    if (!bid || !ask) {
        return (
            <div className="p-3 text-center text-[10px] text-slate-600" data-testid="orderbook-empty">
                Cargando libro de ordenes...
            </div>
        );
    }

    return (
        <div className="flex flex-col text-[11px] font-mono" data-testid="orderbook">
            {/* Header */}
            <div className="px-3 py-2 border-b border-[#1e2329] flex items-center justify-between">
                <span className="text-white text-[11px] font-sans font-semibold tracking-wide">Libro de Ordenes</span>
                <span className="text-slate-500 text-[9px]">Profundidad x{depth}</span>
            </div>

            {/* Column headers */}
            <div className="px-3 py-1.5 grid grid-cols-3 gap-1 text-slate-600 text-[9px] uppercase tracking-wider border-b border-[#1e2329]">
                <span className="text-left">Precio</span>
                <span className="text-right">Volumen</span>
                <span className="text-right">Total</span>
            </div>

            {/* Asks (reversed: best ask closest to spread) */}
            <div className="flex flex-col-reverse" data-testid="orderbook-asks">
                {asks.map((row, i) => {
                    const total = asks.slice(0, i + 1).reduce((s, r) => s + r.size, 0);
                    const pct = (row.size / maxSize) * 100;
                    return (
                        <button
                            key={`ask-${i}`}
                            onClick={() => onPriceClick && onPriceClick(row.price, 'sell')}
                            data-testid={`ask-row-${i}`}
                            className={`relative px-3 py-0.5 grid grid-cols-3 gap-1 items-center hover:bg-[#f6465d]/10 transition-colors cursor-pointer group ${row.isIceberg ? 'animate-pulse-slow' : ''}`}
                        >
                            <div
                                className="absolute inset-y-0 right-0 bg-[#f6465d]/10"
                                style={{ width: `${pct}%` }}
                            />
                            {row.isIceberg && (
                                <div className="absolute inset-0 bg-amber-400/10 border-l-2 border-amber-400 pointer-events-none" />
                            )}
                            <span className="relative text-left text-[#f6465d] flex items-center gap-1">
                                {row.isIceberg && <span className="inline-block w-1 h-1 rounded-full bg-amber-400 animate-ping" />}
                                {formatPrice ? formatPrice(row.price, symbol) : row.price.toFixed(5)}
                            </span>
                            <span className={`relative text-right ${row.isIceberg ? 'text-amber-300 font-extrabold' : row.isLarge ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>{row.size.toFixed(2)}</span>
                            <span className="relative text-right text-slate-500">{total.toFixed(2)}</span>
                        </button>
                    );
                })}
            </div>

            {/* Spread bar */}
            <div className="px-3 py-2 bg-[#0b0e11] border-y border-[#1e2329] flex items-center justify-between">
                <div>
                    <span className="text-slate-600 text-[9px] uppercase block">Spread</span>
                    <span className="text-white text-[11px] font-bold">{formatPrice ? formatPrice(spread, symbol) : spread.toFixed(5)}</span>
                </div>
                <span className="text-[#F0B90B] text-[10px] font-bold">{spreadPct}%</span>
                <div className="text-right">
                    <span className="text-slate-600 text-[9px] uppercase block">Mid</span>
                    <span className="text-[#F0B90B] text-[11px] font-bold">{formatPrice ? formatPrice((bid + ask) / 2, symbol) : ((bid + ask) / 2).toFixed(5)}</span>
                </div>
            </div>

            {/* Bids */}
            <div className="flex flex-col" data-testid="orderbook-bids">
                {bids.map((row, i) => {
                    const total = bids.slice(0, i + 1).reduce((s, r) => s + r.size, 0);
                    const pct = (row.size / maxSize) * 100;
                    return (
                        <button
                            key={`bid-${i}`}
                            onClick={() => onPriceClick && onPriceClick(row.price, 'buy')}
                            data-testid={`bid-row-${i}`}
                            className={`relative px-3 py-0.5 grid grid-cols-3 gap-1 items-center hover:bg-[#0ecb81]/10 transition-colors cursor-pointer group ${row.isIceberg ? 'animate-pulse-slow' : ''}`}
                        >
                            <div
                                className="absolute inset-y-0 right-0 bg-[#0ecb81]/10"
                                style={{ width: `${pct}%` }}
                            />
                            {row.isIceberg && (
                                <div className="absolute inset-0 bg-amber-400/10 border-l-2 border-amber-400 pointer-events-none" />
                            )}
                            <span className="relative text-left text-[#0ecb81] flex items-center gap-1">
                                {row.isIceberg && <span className="inline-block w-1 h-1 rounded-full bg-amber-400 animate-ping" />}
                                {formatPrice ? formatPrice(row.price, symbol) : row.price.toFixed(5)}
                            </span>
                            <span className={`relative text-right ${row.isIceberg ? 'text-amber-300 font-extrabold' : row.isLarge ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>{row.size.toFixed(2)}</span>
                            <span className="relative text-right text-slate-500">{total.toFixed(2)}</span>
                        </button>
                    );
                })}
            </div>

            {/* Footer info */}
            <div className="px-3 py-2 border-t border-[#1e2329] flex items-center justify-between text-[9px] text-slate-600">
                <span className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    Simulado en tiempo real
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span className="text-amber-300/70">Iceberg</span>
                    <span className="text-slate-700">·</span>
                    <span>Click precio para pre-cargar</span>
                </span>
            </div>
        </div>
    );
};

export default OrderBook;
