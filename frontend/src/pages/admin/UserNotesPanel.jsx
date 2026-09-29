import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { StickyNote, Pin, PinOff, Pencil, Trash2, Loader2, Lock, Send, X, Check } from 'lucide-react';

const fmt = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const NoteCard = ({ note, canEdit, onPin, onDelete, onSave }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(note.content);
    return (
        <Card className={`p-4 border ${note.pinned ? 'bg-amber-500/[0.06] border-amber-500/30' : 'bg-slate-900/60 border-slate-800'}`} data-testid={`user-note-${note.id}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[12px] text-white font-semibold flex items-center gap-1.5 flex-wrap">
                        {note.pinned && <Pin className="w-3 h-3 text-amber-300" />}
                        <span data-testid={`user-note-author-${note.id}`}>{note.author_name}</span>
                        <span className="text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10">{note.author_role}</span>
                    </p>
                    <p className="text-[10.5px] text-slate-500 font-mono mt-0.5" data-testid={`user-note-date-${note.id}`}>
                        {fmt(note.created_at)}{note.updated_at && <span className="italic"> · editada {fmt(note.updated_at)}{note.edited_by ? ` por ${note.edited_by}` : ''}</span>}
                    </p>
                </div>
                {canEdit && !editing && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => onPin(note)} className="p-1.5 rounded text-slate-400 hover:text-amber-300 hover:bg-white/5" title={note.pinned ? 'Desfijar' : 'Fijar'} data-testid={`user-note-pin-${note.id}`}>{note.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}</button>
                        <button onClick={() => { setDraft(note.content); setEditing(true); }} className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/5" title="Editar" data-testid={`user-note-edit-${note.id}`}><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => onDelete(note)} className="p-1.5 rounded text-slate-400 hover:text-rose-300 hover:bg-rose-500/10" title="Eliminar" data-testid={`user-note-delete-${note.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                )}
            </div>
            {editing ? (
                <div className="mt-3 space-y-2">
                    <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={2000}
                        className="w-full rounded-md bg-slate-950 border border-slate-700 text-white text-[12.5px] p-2.5 outline-none focus:border-cyan-500/60" data-testid={`user-note-edit-input-${note.id}`} />
                    <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 text-slate-300" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5 mr-1" /> Cancelar</Button>
                        <Button size="sm" className="h-7 bg-[#1973B8] hover:bg-[#1F89D8] text-white" disabled={!draft.trim()} onClick={async () => { await onSave(note, draft); setEditing(false); }} data-testid={`user-note-save-${note.id}`}><Check className="w-3.5 h-3.5 mr-1" /> Guardar</Button>
                    </div>
                </div>
            ) : (
                <p className="mt-2.5 text-[13px] text-slate-200 whitespace-pre-wrap break-words" data-testid={`user-note-content-${note.id}`}>{note.content}</p>
            )}
        </Card>
    );
};

export const UserNotesPanel = ({ userId, onCountChange }) => {
    const { user: me } = useAuth();
    const [notes, setNotes] = useState(null);
    const [content, setContent] = useState('');
    const [pinned, setPinned] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const r = await api.get(`/admin/users/${userId}/notes`);
            setNotes(r.data.notes);
            onCountChange?.(r.data.count);
        } catch { toast.error('No se pudieron cargar las notas'); setNotes([]); }
    }, [userId, onCountChange]);

    useEffect(() => { load(); }, [load]);

    const canEdit = (n) => me?.role === 'superadmin' || n.author_id === me?.id;

    const add = async () => {
        if (!content.trim()) return;
        setBusy(true);
        try {
            await api.post(`/admin/users/${userId}/notes`, { content: content.trim(), pinned });
            setContent(''); setPinned(false);
            toast.success('Nota guardada');
            load();
        } catch (e) { toast.error(e.response?.data?.detail || 'No se pudo guardar la nota'); }
        finally { setBusy(false); }
    };
    const patch = async (n, body, ok) => {
        try { await api.put(`/admin/users/${userId}/notes/${n.id}`, body); toast.success(ok); load(); }
        catch (e) { toast.error(e.response?.data?.detail || 'Operación no permitida'); }
    };
    const remove = async (n) => {
        if (!window.confirm('¿Eliminar esta nota interna?')) return;
        try { await api.delete(`/admin/users/${userId}/notes/${n.id}`); toast.success('Nota eliminada'); load(); }
        catch (e) { toast.error(e.response?.data?.detail || 'Operación no permitida'); }
    };

    return (
        <div className="space-y-4" data-testid="user-notes-panel">
            <Card className="p-4 bg-slate-900/60 border border-slate-800">
                <p className="text-[10.5px] uppercase tracking-[0.14em] text-[#7CB1E5] font-bold flex items-center gap-1.5 mb-2"><StickyNote className="w-3.5 h-3.5" /> Nueva nota interna <span className="inline-flex items-center gap-1 text-slate-500 normal-case tracking-normal font-normal"><Lock className="w-3 h-3" /> sólo visible para administradores</span></p>
                <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} maxLength={2000}
                    placeholder="Escribe una observación privada sobre este usuario…"
                    className="w-full rounded-md bg-slate-950 border border-slate-700 text-white text-[13px] p-3 outline-none focus:border-cyan-500/60 placeholder:text-slate-600" data-testid="user-note-input" />
                <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                    <label className="inline-flex items-center gap-2 text-[12px] text-slate-300 cursor-pointer">
                        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="accent-amber-400" data-testid="user-note-pin-checkbox" /> <Pin className="w-3.5 h-3.5 text-amber-300" /> Fijar arriba
                    </label>
                    <div className="flex items-center gap-3">
                        <span className="text-[10.5px] text-slate-500 font-mono">{content.length}/2000</span>
                        <Button size="sm" disabled={busy || !content.trim()} onClick={add} className="bg-[#1973B8] hover:bg-[#1F89D8] text-white font-bold" data-testid="user-note-submit">
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-3.5 h-3.5 mr-1.5" /> Guardar nota</>}
                        </Button>
                    </div>
                </div>
            </Card>

            {notes === null ? <div className="py-8 text-center text-slate-500"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>
                : notes.length === 0 ? <p className="text-center text-slate-500 text-[12.5px] py-6" data-testid="user-notes-empty">Aún no hay notas internas para este usuario.</p>
                : <div className="space-y-3" data-testid="user-notes-list">{notes.map((n) => (
                    <NoteCard key={n.id} note={n} canEdit={canEdit(n)}
                        onPin={(x) => patch(x, { pinned: !x.pinned }, x.pinned ? 'Nota desfijada' : 'Nota fijada')}
                        onSave={(x, c) => patch(x, { content: c }, 'Nota actualizada')}
                        onDelete={remove} />
                ))}</div>}
        </div>
    );
};
