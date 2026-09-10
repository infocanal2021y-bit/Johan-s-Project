import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { ShieldCheck, Pin, CornerDownRight, Megaphone } from 'lucide-react';

const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} · ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
};

const OfficialBadge = () => (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#1973B8]/10 text-[#1973B8] text-[10px] font-bold">
        <ShieldCheck className="w-3 h-3" /> Soporte oficial
    </span>
);

export const OfficialPostsFeed = () => {
    const [posts, setPosts] = useState(null);
    const [shown, setShown] = useState(6);

    useEffect(() => {
        api.get('/community/posts').then((r) => setPosts(r.data.posts || [])).catch(() => setPosts([]));
    }, []);

    if (!posts || posts.length === 0) return null;

    return (
        <div className="rounded-[14px] bg-white border border-[#E5EAF0] shadow-[0_1px_3px_rgba(7,33,70,0.04)] overflow-hidden" data-testid="official-posts-feed">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#F1F4F8]">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#072146] flex items-center justify-center">
                        <Megaphone className="w-4 h-4 text-[#F3D372]" />
                    </div>
                    <div>
                        <p className="text-[#072146] text-sm font-bold leading-tight">Publicaciones oficiales</p>
                        <p className="text-[11px] text-slate-500">Canal informativo de Supports Lionsbit · solo lectura</p>
                    </div>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">{posts.length} publicaciones</span>
            </div>

            <div className="divide-y divide-[#F1F4F8]">
                {posts.slice(0, shown).map((p) => (
                    <div key={p.id} className="px-4 py-3.5" data-testid={`official-post-${p.id}`}>
                        <div className="flex items-start gap-2.5">
                            <div className="w-9 h-9 rounded-full bg-[#072146] flex items-center justify-center flex-shrink-0">
                                <ShieldCheck className="w-4.5 h-4.5 text-[#F3D372]" style={{ width: 18, height: 18 }} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[#072146] text-[13px] font-bold">Supports Lionsbit</span>
                                    <OfficialBadge />
                                    {p.pinned && (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-bold">
                                            <Pin className="w-3 h-3" /> Fijado
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5">{fmtDate(p.published_at)}</p>
                                <p className="text-[13px] text-slate-700 mt-1.5 leading-relaxed">{p.body}</p>

                                {(p.replies || []).map((r) => (
                                    <div key={r.id} className="mt-2.5 ml-1 pl-3 border-l-2 border-[#E5EAF0]">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <CornerDownRight className="w-3 h-3 text-slate-400" />
                                            <span className="text-[#072146] text-[12px] font-bold">Supports Lionsbit</span>
                                            <OfficialBadge />
                                        </div>
                                        <p className="text-[12.5px] text-slate-600 mt-1 leading-relaxed">{r.body}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {posts.length > shown && (
                <button
                    type="button"
                    onClick={() => setShown((s) => s + 6)}
                    className="w-full py-2.5 text-[12px] font-bold text-[#1973B8] hover:bg-[#F6F9FC] transition-colors border-t border-[#F1F4F8]"
                    data-testid="official-posts-more"
                >
                    Ver más publicaciones
                </button>
            )}
        </div>
    );
};
