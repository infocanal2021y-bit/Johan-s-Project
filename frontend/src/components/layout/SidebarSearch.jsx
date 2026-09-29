import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, CornerDownLeft } from 'lucide-react';

const norm = (s) => (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const SidebarSearch = ({ groups, t, onNavigate, accentAdmin = 'adm-' }) => {
    const navigate = useNavigate();
    const [q, setQ] = useState('');
    const [idx, setIdx] = useState(0);
    const inputRef = useRef(null);

    const entries = useMemo(() => groups.flatMap((g) =>
        [...(g.items || []), ...(g.tools || [])].filter((it) => it.to).map((it) => ({ ...it, group: g.label, groupId: g.id }))
    ), [groups]);

    const results = useMemo(() => {
        const nq = norm(q.trim());
        if (!nq) return [];
        const scored = entries.map((e) => {
            const label = norm(t(e.label));
            const group = norm(t(e.group));
            let score = -1;
            if (label.startsWith(nq)) score = 3;
            else if (label.split(/\s+/).some((w) => w.startsWith(nq))) score = 2;
            else if (label.includes(nq)) score = 1;
            else if (group.includes(nq)) score = 0;
            return { ...e, score };
        }).filter((e) => e.score >= 0);
        scored.sort((a, b) => b.score - a.score);
        const seen = new Set();
        return scored.filter((e) => (seen.has(e.to) ? false : seen.add(e.to))).slice(0, 8);
    }, [q, entries, t]);

    useEffect(() => { setIdx(0); }, [q]);

    useEffect(() => {
        const h = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') { e.preventDefault(); inputRef.current?.focus(); }
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, []);

    const go = (item) => {
        if (!item) return;
        navigate(item.to);
        setQ('');
        onNavigate?.();
    };

    const onKey = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); go(results[idx]); }
        else if (e.key === 'Escape') { setQ(''); inputRef.current?.blur(); }
    };

    return (
        <div className="relative mb-2" data-testid="sidebar-search">
            <div className="flex items-center gap-2 h-9 px-2.5 rounded-md border transition-colors focus-within:border-cyan-500/60"
                style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }}>
                <Search className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                <input
                    ref={inputRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={onKey}
                    placeholder={t('Buscar sección…')}
                    aria-label="Buscar en el menú"
                    className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px] text-white placeholder:text-slate-500"
                    data-testid="sidebar-search-input"
                />
                {q ? (
                    <button onClick={() => setQ('')} className="text-slate-500 hover:text-white" aria-label="Limpiar" data-testid="sidebar-search-clear"><X className="w-3.5 h-3.5" /></button>
                ) : (
                    <kbd className="hidden lg:inline text-[9px] text-slate-600 font-mono border border-white/10 rounded px-1">⇧⌘M</kbd>
                )}
            </div>

            {q.trim() && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border shadow-2xl overflow-hidden"
                    style={{ background: '#0a0f1a', borderColor: 'rgba(124,177,229,0.25)' }} data-testid="sidebar-search-results">
                    {results.length === 0 ? (
                        <p className="px-3 py-2.5 text-[11.5px] text-slate-500" data-testid="sidebar-search-empty">{t('Sin coincidencias')}</p>
                    ) : results.map((r, i) => {
                        const isAdmin = r.groupId.startsWith(accentAdmin);
                        return (
                            <button
                                key={`${r.to}-${r.groupId}`}
                                onMouseEnter={() => setIdx(i)}
                                onClick={() => go(r)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${i === idx ? 'bg-cyan-500/15' : 'hover:bg-white/5'}`}
                                data-testid={`sidebar-search-result-${i}`}
                            >
                                <r.icon className={`w-3.5 h-3.5 flex-shrink-0 ${isAdmin ? 'text-amber-300' : 'text-cyan-300'}`} />
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[12.5px] text-white truncate">{t(r.label)}</span>
                                    <span className={`block text-[9.5px] uppercase tracking-wider truncate ${isAdmin ? 'text-amber-400/80' : 'text-slate-500'}`}>{isAdmin ? `${t('Administración')} · ` : ''}{t(r.group)}</span>
                                </span>
                                {i === idx && <CornerDownLeft className="w-3 h-3 text-slate-500 flex-shrink-0" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
