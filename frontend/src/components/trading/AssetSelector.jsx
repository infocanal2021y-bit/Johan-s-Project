import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../lib/api';
import { Input } from '../ui/input';
import {
    Search, X, Globe, BarChart3, Gem, Bitcoin, Building2, Building, ChevronDown, Loader2, TrendingUp, TrendingDown
} from 'lucide-react';

const CATEGORY_ICONS = {
    forex: Globe,
    index: BarChart3,
    commodity: Gem,
    crypto: Bitcoin,
    stock_us: Building2,
    stock_eu: Building,
    stock_latam: Building,
};

const CATEGORY_ORDER = ['all', 'forex', 'index', 'commodity', 'crypto', 'stock_us', 'stock_eu', 'stock_latam'];

const formatPriceSmart = (p, pip) => {
    if (p == null) return '—';
    if (pip <= 1e-7) return p.toFixed(8);
    if (pip <= 1e-5) return p.toFixed(5);
    if (pip <= 0.001) return p.toFixed(3);
    if (pip <= 0.01) return p.toFixed(2);
    return p.toFixed(1);
};

/**
 * AssetSelector — searchable catalog of all 170+ trading instruments.
 *
 * Props:
 *  - selectedSymbol: currently active symbol
 *  - onSelect: callback(symbol)
 *  - prices: price dict keyed by symbol (from /api/trading/prices)
 */
export const AssetSelector = ({ selectedSymbol, onSelect, prices = {} }) => {
    const [open, setOpen] = useState(false);
    const [catalog, setCatalog] = useState(null);
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');
    const [loading, setLoading] = useState(false);
    const searchInputRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        const fetchCatalog = async () => {
            setLoading(true);
            try {
                const res = await api.get('/trading/assets');
                if (!cancelled) setCatalog(res.data);
            } catch { /* silent */ }
            finally { if (!cancelled) setLoading(false); }
        };
        if (!catalog) fetchCatalog();
        return () => { cancelled = true; };
    }, [catalog]);

    // Auto-focus search when dialog opens
    useEffect(() => {
        if (open && searchInputRef.current) {
            setTimeout(() => searchInputRef.current?.focus(), 80);
        }
    }, [open]);

    // Keyboard shortcut: Cmd/Ctrl+K
    useEffect(() => {
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setOpen(true);
            }
            if (e.key === 'Escape' && open) setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    const filtered = useMemo(() => {
        if (!catalog) return [];
        const s = search.trim().toLowerCase();
        return catalog.assets.filter(a => {
            if (activeCategory !== 'all' && a.category !== activeCategory) return false;
            if (!s) return true;
            return a.symbol.toLowerCase().includes(s) || (a.name || '').toLowerCase().includes(s);
        });
    }, [catalog, search, activeCategory]);

    const selectedInfo = catalog?.assets.find(a => a.symbol === selectedSymbol);
    const selectedPrice = prices[selectedSymbol];

    return (
        <>
            {/* Compact trigger button */}
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#1e2329] hover:bg-[#2b3139] border border-[#2b3139] rounded-lg transition-colors min-w-[160px]"
                data-testid="asset-selector-trigger"
            >
                <div className="flex-1 text-left min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{selectedInfo?.label || selectedSymbol}</p>
                    <p className="text-slate-500 text-[10px] truncate">{selectedInfo?.name || ''}</p>
                </div>
                {selectedPrice && (
                    <span className={`text-[11px] font-mono font-bold ${selectedPrice.change_pct >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                        {selectedPrice.change_pct >= 0 ? '+' : ''}{selectedPrice.change_pct?.toFixed(2)}%
                    </span>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            </button>

            {/* Full-screen catalog dialog */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-16"
                        onClick={() => setOpen(false)}
                        data-testid="asset-selector-dialog"
                    >
                        <motion.div
                            initial={{ y: -20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -20, opacity: 0 }}
                            className="bg-[#14181d] border border-[#2b3139] rounded-xl w-full max-w-3xl mx-4 overflow-hidden shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#2b3139]">
                                <Search className="w-4 h-4 text-slate-500" />
                                <Input
                                    ref={searchInputRef}
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Busca por simbolo o nombre (ej. AAPL, Apple, S&P, Bitcoin)..."
                                    className="flex-1 bg-transparent border-0 text-white text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-slate-600"
                                    data-testid="asset-selector-search"
                                />
                                <span className="text-[10px] text-slate-600 font-mono bg-[#1e2329] px-2 py-0.5 rounded">ESC</span>
                                <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Category pills */}
                            {catalog && (
                                <div className="flex items-center gap-1.5 px-5 py-3 border-b border-[#2b3139] overflow-x-auto">
                                    {CATEGORY_ORDER.map(cat => {
                                        if (cat !== 'all' && !catalog.categories[cat]) return null;
                                        const count = cat === 'all' ? catalog.total : catalog.categories[cat].count;
                                        const label = cat === 'all' ? 'Todos' : catalog.categories[cat].label;
                                        const Icon = CATEGORY_ICONS[cat] || Globe;
                                        const active = activeCategory === cat;
                                        return (
                                            <button
                                                key={cat}
                                                onClick={() => setActiveCategory(cat)}
                                                data-testid={`category-${cat}`}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${
                                                    active
                                                        ? 'bg-[#F0B90B]/15 text-[#F0B90B] border border-[#F0B90B]/40'
                                                        : 'bg-[#1e2329] text-slate-500 border border-transparent hover:text-slate-300'
                                                }`}
                                            >
                                                {cat !== 'all' && <Icon className="w-3 h-3" />}
                                                {label}
                                                <span className={`text-[10px] font-mono ${active ? 'text-[#F0B90B]/60' : 'text-slate-600'}`}>{count}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* List */}
                            <div className="max-h-[60vh] overflow-y-auto">
                                {loading ? (
                                    <div className="py-16 flex items-center justify-center">
                                        <Loader2 className="w-6 h-6 animate-spin text-[#F0B90B]" />
                                    </div>
                                ) : filtered.length === 0 ? (
                                    <div className="py-16 text-center">
                                        <Search className="w-8 h-8 text-[#2b3139] mx-auto mb-2" />
                                        <p className="text-slate-500 text-sm">No se encontraron activos</p>
                                    </div>
                                ) : (
                                    <div className="py-1">
                                        {filtered.map(a => {
                                            const p = prices[a.symbol];
                                            const isSelected = a.symbol === selectedSymbol;
                                            const change = p?.change_pct || 0;
                                            const Icon = CATEGORY_ICONS[a.category] || Globe;
                                            return (
                                                <button
                                                    key={a.symbol}
                                                    onClick={() => { onSelect(a.symbol); setOpen(false); }}
                                                    data-testid={`asset-option-${a.symbol}`}
                                                    className={`w-full flex items-center gap-3 px-5 py-2.5 hover:bg-[#1e2329] transition-colors ${
                                                        isSelected ? 'bg-[#F0B90B]/5' : ''
                                                    }`}
                                                >
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                                        isSelected ? 'bg-[#F0B90B]/15' : 'bg-[#1e2329]'
                                                    }`}>
                                                        <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-[#F0B90B]' : 'text-slate-500'}`} />
                                                    </div>
                                                    <div className="flex-1 min-w-0 text-left">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`font-semibold text-sm ${isSelected ? 'text-[#F0B90B]' : 'text-white'}`}>{a.label}</span>
                                                            <span className="text-slate-600 text-[10px] uppercase">{a.category.replace('_', ' ')}</span>
                                                        </div>
                                                        <p className="text-slate-500 text-[11px] truncate">{a.name}</p>
                                                    </div>
                                                    {p && (
                                                        <div className="text-right flex-shrink-0">
                                                            <p className="text-white font-mono text-xs font-semibold">
                                                                {formatPriceSmart(p.bid, p.pip)}
                                                            </p>
                                                            <p className={`text-[10px] font-mono font-bold flex items-center justify-end gap-0.5 ${
                                                                change >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'
                                                            }`}>
                                                                {change >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                                                                {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                                                            </p>
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="px-5 py-2 border-t border-[#2b3139] flex items-center justify-between text-[10px] text-slate-600">
                                <span>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
                                <span className="flex items-center gap-3">
                                    <span>Total catalogo: <span className="text-white">{catalog?.total || 0}</span></span>
                                    <span className="hidden sm:flex items-center gap-1">
                                        <kbd className="bg-[#1e2329] px-1.5 py-0.5 rounded text-[9px]">Ctrl</kbd>+
                                        <kbd className="bg-[#1e2329] px-1.5 py-0.5 rounded text-[9px]">K</kbd>
                                        <span>para abrir</span>
                                    </span>
                                </span>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default AssetSelector;
