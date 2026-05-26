import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Loader2, ArrowRight, Radio } from 'lucide-react';
import { safeApiCall } from '../../lib/diagnostics';

/**
 * GlobalTransfersMap
 * ------------------
 * Self-contained SWIFT-style world map showing recent verified transfers
 * across España, Chile, México, Costa Rica, Argentina.
 *
 * - Pure SVG (no map library dependency) using equirectangular projection
 * - Animated arc lines (origin -> destination) with framer-motion path draw
 * - Live ticker on the right showing the active corridor
 * - Polls /api/community/global-transfers every 45s
 */

const VIEW_W = 1000;
const VIEW_H = 520;

// Equirectangular projection: lat [-60, 60] mapped to height, lng [-180, 180] to width.
// We crop to the relevant region (LATAM + Iberia) by shifting.
const LNG_MIN = -120;
const LNG_MAX = 10;
const LAT_MIN = -55;
const LAT_MAX = 55;

const project = (lat, lng) => {
    const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * VIEW_W;
    const y = VIEW_H - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * VIEW_H;
    return { x, y };
};

const COUNTRY_HUBS = {
    'España':     { lat: 40.4168, lng: -3.7038, code: 'ES' },
    'Chile':      { lat: -33.4489, lng: -70.6693, code: 'CL' },
    'México':     { lat: 19.4326, lng: -99.1332, code: 'MX' },
    'Costa Rica': { lat: 9.9281, lng: -84.0907, code: 'CR' },
    'Argentina':  { lat: -34.6037, lng: -58.3816, code: 'AR' },
};

const fmtEUR = (n) => `€${(Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const timeAgo = (iso) => {
    if (!iso) return 'ahora';
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `hace ${hr}h`;
    return `hace ${Math.floor(hr / 24)}d`;
};

// Compute SVG quadratic-curve path between two projected points (arc up)
const arcPath = (p1, p2) => {
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Control point pulled perpendicular for an arc (max 90px lift)
    const lift = Math.min(140, 30 + dist * 0.25);
    const nx = -dy / (dist || 1);
    const ny = dx / (dist || 1);
    const cx = mx + nx * lift;
    const cy = my + ny * lift - lift * 0.6; // pull upward visually
    return `M ${p1.x},${p1.y} Q ${cx},${cy} ${p2.x},${p2.y}`;
};

// Country dot data with built-in flag emoji + label
const COUNTRY_LABEL_OFFSET = {
    'España':     { dx: 16, dy: -8 },
    'Chile':      { dx: -55, dy: 4 },
    'México':     { dx: -68, dy: -4 },
    'Costa Rica': { dx: -85, dy: 14 },
    'Argentina':  { dx: -75, dy: 20 },
};

export const GlobalTransfersMap = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeIdx, setActiveIdx] = useState(0);
    const [hoverItem, setHoverItem] = useState(null);
    const rotateRef = useRef(null);

    const fetchData = async () => {
        const result = await safeApiCall({
            url: '/api/community/global-transfers?limit=24',
            method: 'GET',
            timeoutMs: 15000,
        });
        setLoading(false);
        if (result.ok) {
            setItems(result.data?.items || []);
        }
    };

    useEffect(() => {
        fetchData();
        const t = setInterval(fetchData, 45000);
        return () => clearInterval(t);
    }, []);

    // Auto-rotate active corridor every 4s
    useEffect(() => {
        if (items.length === 0) return;
        rotateRef.current = setInterval(() => {
            setActiveIdx((i) => (i + 1) % items.length);
        }, 4000);
        return () => clearInterval(rotateRef.current);
    }, [items.length]);

    const active = hoverItem || items[activeIdx] || null;

    // Group items by country for the country dot pulse counts
    const countByCountry = useMemo(() => {
        const m = {};
        items.forEach((i) => { m[i.country] = (m[i.country] || 0) + 1; });
        return m;
    }, [items]);

    const crossCount = useMemo(
        () => items.filter((i) => i.is_cross_border).length,
        [items]
    );

    return (
        <div className="bg-[#0B1A2D] rounded-2xl border border-[#1973B8]/20 overflow-hidden shadow-2xl shadow-[#072146]/40" data-testid="global-transfers-map">
            {/* Header */}
            <div className="px-5 py-4 border-b border-[#1973B8]/15 bg-gradient-to-r from-[#072146] to-[#0B1A2D] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#1973B8]/15 ring-1 ring-[#1973B8]/40 flex items-center justify-center">
                        <Globe className="w-5 h-5 text-[#7CB1E5]" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-base tracking-tight">Mapa de Transferencias · LIVE</h3>
                        <p className="text-[#7CB1E5]/70 text-xs">Red SWIFT institucional · 5 corredores activos</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {crossCount > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                            <span className="text-amber-300 text-[11px] font-bold uppercase tracking-wider" data-testid="cross-border-pill">
                                {crossCount} INTL
                            </span>
                        </div>
                    )}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="text-emerald-300 text-[11px] font-bold uppercase tracking-wider">{items.length} transacciones</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px]">
                {/* Map */}
                <div className="relative bg-[#061021] overflow-hidden">
                    {loading ? (
                        <div className="h-[420px] flex items-center justify-center">
                            <Loader2 className="w-7 h-7 animate-spin text-[#1973B8]" />
                        </div>
                    ) : (
                        <svg
                            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                            className="w-full h-auto block"
                            preserveAspectRatio="xMidYMid meet"
                            data-testid="global-transfers-svg"
                        >
                            <defs>
                                <radialGradient id="gtm-glow" cx="50%" cy="50%" r="50%">
                                    <stop offset="0%" stopColor="#1973B8" stopOpacity="0.5" />
                                    <stop offset="100%" stopColor="#1973B8" stopOpacity="0" />
                                </radialGradient>
                                <linearGradient id="gtm-arc" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#7CB1E5" stopOpacity="0.1" />
                                    <stop offset="50%" stopColor="#7CB1E5" stopOpacity="0.95" />
                                    <stop offset="100%" stopColor="#10B981" stopOpacity="0.9" />
                                </linearGradient>
                                <linearGradient id="gtm-arc-active" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#10B981" />
                                    <stop offset="100%" stopColor="#7CB1E5" />
                                </linearGradient>
                                <linearGradient id="gtm-arc-cross" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.85" />
                                    <stop offset="100%" stopColor="#F97316" stopOpacity="0.9" />
                                </linearGradient>
                                <pattern id="gtm-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1973B8" strokeOpacity="0.04" strokeWidth="1" />
                                </pattern>
                            </defs>

                            {/* Background grid */}
                            <rect width={VIEW_W} height={VIEW_H} fill="url(#gtm-grid)" />

                            {/* Simplified country shapes — abstract blobs as visual anchors */}
                            <g opacity="0.18" fill="#1973B8" stroke="#7CB1E5" strokeWidth="0.6" strokeOpacity="0.35">
                                {/* Iberia / Spain blob */}
                                <ellipse cx={project(40.5, -3.7).x} cy={project(40.5, -3.7).y} rx="32" ry="22" />
                                {/* Mexico blob */}
                                <ellipse cx={project(23.5, -102).x} cy={project(23.5, -102).y} rx="46" ry="32" />
                                {/* Costa Rica blob */}
                                <ellipse cx={project(10, -84).x} cy={project(10, -84).y} rx="12" ry="9" />
                                {/* Chile blob (long thin) */}
                                <ellipse cx={project(-33, -71).x} cy={project(-33, -71).y} rx="13" ry="60" />
                                {/* Argentina blob */}
                                <ellipse cx={project(-35, -64).x} cy={project(-35, -64).y} rx="38" ry="62" />
                            </g>

                            {/* Arc lines */}
                            <g>
                                {items.slice(0, 18).map((tx, idx) => {
                                    const p1 = project(tx.origin_lat, tx.origin_lng);
                                    const p2 = project(tx.dest_lat, tx.dest_lng);
                                    const isActive = active?.id === tx.id;
                                    const cross = tx.is_cross_border;
                                    return (
                                        <g key={tx.id}>
                                            <motion.path
                                                d={arcPath(p1, p2)}
                                                fill="none"
                                                stroke={isActive
                                                    ? 'url(#gtm-arc-active)'
                                                    : cross
                                                        ? 'url(#gtm-arc-cross)'
                                                        : 'url(#gtm-arc)'}
                                                strokeWidth={isActive ? 2.4 : cross ? 1.4 : 1.1}
                                                strokeOpacity={isActive ? 1 : cross ? 0.55 : 0.4}
                                                strokeDasharray={cross && !isActive ? '4 3' : undefined}
                                                initial={{ pathLength: 0 }}
                                                animate={{ pathLength: 1 }}
                                                transition={{ duration: 1.2, delay: idx * 0.05, ease: 'easeOut' }}
                                            />
                                            {isActive && (
                                                <motion.circle
                                                    r="3.5"
                                                    fill="#10B981"
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                >
                                                    <animateMotion dur="1.6s" repeatCount="indefinite" path={arcPath(p1, p2)} />
                                                </motion.circle>
                                            )}
                                        </g>
                                    );
                                })}
                            </g>

                            {/* Country hubs */}
                            <g>
                                {Object.entries(COUNTRY_HUBS).map(([country, hub]) => {
                                    const p = project(hub.lat, hub.lng);
                                    const count = countByCountry[country] || 0;
                                    const off = COUNTRY_LABEL_OFFSET[country] || { dx: 12, dy: 0 };
                                    return (
                                        <g key={country}>
                                            {/* glow */}
                                            <circle cx={p.x} cy={p.y} r="22" fill="url(#gtm-glow)" />
                                            {/* pulse */}
                                            <circle cx={p.x} cy={p.y} r="6" fill="#7CB1E5" opacity="0.4">
                                                <animate attributeName="r" values="6;14;6" dur="2.4s" repeatCount="indefinite" />
                                                <animate attributeName="opacity" values="0.6;0;0.6" dur="2.4s" repeatCount="indefinite" />
                                            </circle>
                                            {/* core */}
                                            <circle cx={p.x} cy={p.y} r="5" fill="#1973B8" stroke="#7CB1E5" strokeWidth="1.5" />
                                            {/* Label */}
                                            <g transform={`translate(${p.x + off.dx}, ${p.y + off.dy})`}>
                                                <rect x="-4" y="-12" rx="4" ry="4" width={country.length * 6.5 + 30} height="20" fill="#0B1A2D" stroke="#1973B8" strokeOpacity="0.4" strokeWidth="0.8" />
                                                <text x="2" y="2" fill="#7CB1E5" fontSize="11" fontWeight="600" fontFamily="Inter, sans-serif">{country}</text>
                                                <text x={country.length * 6.5 + 10} y="2" fill="#10B981" fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif">{count}</text>
                                            </g>
                                        </g>
                                    );
                                })}
                            </g>
                        </svg>
                    )}

                    {/* Bottom-left active corridor banner overlay */}
                    <AnimatePresence mode="wait">
                        {active && (
                            <motion.div
                                key={active.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                transition={{ duration: 0.35 }}
                                className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-md bg-[#0B1A2D]/95 backdrop-blur border border-emerald-500/40 rounded-lg px-3 py-2.5 shadow-lg shadow-emerald-500/10"
                                data-testid="active-corridor-banner"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <Radio className="w-3 h-3 text-emerald-400" />
                                    <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest">Transferencia verificada</span>
                                    {active.is_cross_border && (
                                        <span className="text-amber-300 text-[9px] font-bold uppercase tracking-widest bg-amber-500/15 px-1.5 py-0.5 rounded">SWIFT INTL</span>
                                    )}
                                </div>
                                <p className="text-white text-sm font-semibold flex items-center gap-1.5 flex-wrap">
                                    <span>{active.country_flag}</span>
                                    <span>{active.origin_city}</span>
                                    <ArrowRight className="w-3.5 h-3.5 text-[#7CB1E5]" />
                                    {active.is_cross_border && active.dest_country_flag && <span>{active.dest_country_flag}</span>}
                                    <span>{active.dest_city}</span>
                                    <span className="text-emerald-300 font-bold tabular-nums ml-auto">{fmtEUR(active.amount_eur)}</span>
                                </p>
                                <p className="text-slate-500 text-[10px] mt-0.5">{active.name_public} · {timeAgo(active.date)}{active.is_cross_border && active.dest_country ? ` · destino: ${active.dest_country}` : ''}</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Side ticker */}
                <div className="border-t lg:border-t-0 lg:border-l border-[#1973B8]/15 bg-[#0B1A2D]/70 max-h-[420px] lg:h-full overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#1973B8]/15 sticky top-0 bg-[#0B1A2D]/95 backdrop-blur">
                        <p className="text-[#7CB1E5] text-[10px] font-bold uppercase tracking-widest">Flujo en tiempo real</p>
                    </div>
                    <div className="overflow-y-auto h-[360px] divide-y divide-[#1973B8]/10" data-testid="global-transfers-ticker">
                        {items.slice(0, 18).map((tx) => {
                            const isActive = active?.id === tx.id;
                            return (
                                <button
                                    key={tx.id}
                                    type="button"
                                    onMouseEnter={() => setHoverItem(tx)}
                                    onMouseLeave={() => setHoverItem(null)}
                                    onClick={() => setHoverItem(tx)}
                                    className={`w-full text-left px-4 py-2.5 transition-colors ${isActive ? 'bg-[#1973B8]/15' : 'hover:bg-[#1973B8]/8'}`}
                                    data-testid={`ticker-row-${tx.id}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-white text-xs font-medium flex items-center gap-1 truncate">
                                            <span>{tx.country_flag}</span>
                                            <span className="truncate">{tx.origin_city}</span>
                                            <span className="text-slate-600">→</span>
                                            {tx.is_cross_border && tx.dest_country_flag && <span>{tx.dest_country_flag}</span>}
                                            <span className="truncate">{tx.dest_city}</span>
                                        </p>
                                        <span className="text-emerald-300 text-xs font-bold tabular-nums whitespace-nowrap">{fmtEUR(tx.amount_eur)}</span>
                                    </div>
                                    <p className="text-slate-500 text-[10px] mt-0.5 flex items-center gap-1.5">
                                        <span>{tx.name_public}</span>
                                        <span>·</span>
                                        <span>{timeAgo(tx.date)}</span>
                                        {tx.is_cross_border && (
                                            <span className="ml-auto text-amber-300 font-bold uppercase tracking-wider text-[9px]">INTL</span>
                                        )}
                                    </p>
                                </button>
                            );
                        })}
                        {!loading && items.length === 0 && (
                            <p className="px-4 py-8 text-slate-500 text-xs text-center">Sin transferencias recientes para mostrar.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GlobalTransfersMap;
