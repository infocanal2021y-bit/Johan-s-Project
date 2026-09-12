import { useState, useCallback } from 'react';
import { Layout } from '../../components/layout/Layout';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { toast } from 'sonner';
import {
    Crown, Search, Loader2, Pencil, Check, X, History, ShieldOff, Plus, User,
} from 'lucide-react';

const isComplex = (v) => v !== null && typeof v === 'object';
const renderVal = (v) => {
    if (v === null || v === undefined) return <span className="text-slate-600 italic">null</span>;
    if (typeof v === 'boolean') return <span className={v ? 'text-emerald-400' : 'text-rose-400'}>{String(v)}</span>;
    if (isComplex(v)) return <span className="text-slate-400 font-mono text-[10px] break-all">{JSON.stringify(v).slice(0, 120)}{JSON.stringify(v).length > 120 ? '…' : ''}</span>;
    return <span className="text-white break-all">{String(v)}</span>;
};

const FieldRow = ({ field, value, onSave }) => {
    const [editing, setEditing] = useState(false);
    const [raw, setRaw] = useState('');
    const [busy, setBusy] = useState(false);

    const startEdit = () => {
        setRaw(isComplex(value) ? JSON.stringify(value, null, 2) : value === null || value === undefined ? '' : String(value));
        setEditing(true);
    };
    const save = async () => {
        let parsed = raw;
        const t = raw.trim();
        if (t === '') parsed = '';
        else if (t === 'null') parsed = null;
        else if (t === 'true') parsed = true;
        else if (t === 'false') parsed = false;
        else if (isComplex(value) || t.startsWith('{') || t.startsWith('[')) {
            try { parsed = JSON.parse(t); } catch { toast.error('JSON inválido'); return; }
        } else if (typeof value === 'number' && !Number.isNaN(Number(t))) parsed = Number(t);
        setBusy(true);
        const ok = await onSave(field, parsed);
        setBusy(false);
        if (ok) setEditing(false);
    };

    return (
        <div className="flex items-start gap-2 py-2 border-b border-slate-800/50 last:border-0" data-testid={`sa-field-${field}`}>
            <div className="w-48 flex-shrink-0">
                <p className="text-[11px] font-mono font-bold text-[#F3D372] break-all">{field}</p>
            </div>
            <div className="flex-1 min-w-0 text-[12px]">
                {editing ? (
                    isComplex(value) || raw.length > 60 ? (
                        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={4}
                            className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-[#D4AF37]/40 text-white text-[11px] font-mono" />
                    ) : (
                        <input value={raw} onChange={(e) => setRaw(e.target.value)}
                            className="w-full h-8 px-2 rounded-lg bg-slate-950 border border-[#D4AF37]/40 text-white text-[12px]"
                            data-testid={`sa-input-${field}`} />
                    )
                ) : renderVal(value)}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
                {editing ? (
                    <>
                        <button type="button" disabled={busy} onClick={save} className="p-1.5 rounded-md bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40" data-testid={`sa-save-${field}`}>
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button type="button" onClick={() => setEditing(false)} className="p-1.5 rounded-md bg-slate-800 text-slate-400 hover:text-white">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </>
                ) : (
                    <button type="button" onClick={startEdit} className="p-1.5 rounded-md bg-slate-800/70 text-slate-400 hover:text-[#F3D372]" data-testid={`sa-edit-${field}`}>
                        <Pencil className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
};

export default function AdminSuperEditorPage() {
    const { user } = useAuth();
    const [q, setQ] = useState('');
    const [results, setResults] = useState([]);
    const [target, setTarget] = useState(null);
    const [audit, setAudit] = useState([]);
    const [showAudit, setShowAudit] = useState(false);
    const [newField, setNewField] = useState('');
    const [newValue, setNewValue] = useState('');

    const search = async () => {
        try {
            const r = await api.get(`/superadmin/users?q=${encodeURIComponent(q)}`);
            setResults(r.data.users || []);
        } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    };

    const openUser = async (uid) => {
        try {
            const [f, a] = await Promise.all([
                api.get(`/superadmin/users/${uid}/full`),
                api.get(`/superadmin/audit-log?user_id=${uid}`),
            ]);
            setTarget(f.data.user);
            setAudit(a.data.entries || []);
        } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    };

    const saveField = useCallback(async (field, value) => {
        try {
            const r = await api.put(`/superadmin/users/${target.id}`, { updates: { [field]: value } });
            toast.success(`Campo '${field}' actualizado (sin avisos al usuario)`);
            if (r.data.user) setTarget(r.data.user);
            api.get(`/superadmin/audit-log?user_id=${target.id}`).then((a) => setAudit(a.data.entries || []));
            return true;
        } catch (e) { toast.error(e.response?.data?.detail || 'Error'); return false; }
    }, [target]);

    if (user?.role !== 'superadmin') {
        return (
            <Layout>
                <div className="max-w-lg mx-auto p-6 rounded-xl bg-slate-900/70 border border-rose-500/30 mt-10 text-center" data-testid="sa-denied">
                    <ShieldOff className="w-8 h-8 text-rose-400 mx-auto" />
                    <p className="text-white font-bold mt-2">Acceso restringido</p>
                    <p className="text-slate-400 text-xs mt-1">Esta sección es exclusiva del Superadministrador.</p>
                </div>
            </Layout>
        );
    }

    const fields = target ? Object.entries(target).filter(([k]) => k !== 'id') : [];

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-4 p-3 sm:p-5" data-testid="super-editor-page">
                <div className="relative overflow-hidden rounded-2xl border border-[#D4AF37]/30 bg-gradient-to-br from-[#0A111F] via-[#0E182A] to-[#080E1A] p-5">
                    <div aria-hidden="true" className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />
                    <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-xl bg-[#D4AF37]/15 ring-1 ring-[#D4AF37]/40 flex items-center justify-center">
                            <Crown className="w-5 h-5 text-[#F3D372]" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-[#E5C158] font-bold">Superadministrador</p>
                            <h1 className="text-xl sm:text-2xl font-bold text-white">Editor de perfiles sin restricciones</h1>
                            <p className="text-slate-400 text-xs mt-1">
                                Los cambios se aplican en silencio: <span className="text-white font-semibold">no se envían correos ni notificaciones al usuario</span>.
                                Toda modificación queda en la auditoría interna.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()}
                            placeholder="Buscar usuario por email, nombre o ID…"
                            className="w-full h-10 pl-9 pr-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm"
                            data-testid="sa-search-input" />
                    </div>
                    <Button onClick={search} className="bg-[#1973B8] hover:bg-[#1F89D8] h-10" data-testid="sa-search-btn">Buscar</Button>
                </div>

                {results.length > 0 && !target && (
                    <div className="rounded-xl bg-slate-900/70 border border-slate-800 divide-y divide-slate-800/60">
                        {results.map((u) => (
                            <button key={u.id} type="button" onClick={() => openUser(u.id)}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/40 text-left" data-testid={`sa-result-${u.id}`}>
                                <User className="w-4 h-4 text-slate-500" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-white text-sm font-semibold truncate">{u.name} <span className="text-slate-500 text-xs">· {u.email}</span></p>
                                    <p className="text-slate-500 text-[10px]">{u.role} · {u.account_status} · {u.verification_status}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {target && (
                    <>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <p className="text-white font-bold text-sm">{target.name} <span className="text-slate-500 font-normal text-xs">· {target.email} · {fields.length} campos</span></p>
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => setShowAudit((v) => !v)}
                                    className="border-slate-700 text-slate-300 h-8 text-xs" data-testid="sa-audit-toggle">
                                    <History className="w-3.5 h-3.5 mr-1" /> Auditoría ({audit.length})
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setTarget(null); setShowAudit(false); }}
                                    className="border-slate-700 text-slate-300 h-8 text-xs">Cambiar usuario</Button>
                            </div>
                        </div>

                        {showAudit && (
                            <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 max-h-72 overflow-y-auto" data-testid="sa-audit-panel">
                                <p className="text-[10px] uppercase tracking-wider text-[#E5C158] font-bold mb-2">Historial de auditoría interno</p>
                                {audit.length === 0 && <p className="text-slate-500 text-xs">Sin modificaciones registradas.</p>}
                                {audit.map((e) => (
                                    <div key={e.id} className="py-2 border-b border-slate-800/50 last:border-0 text-[11.5px]">
                                        <p className="text-slate-400">
                                            <span className="text-white font-semibold">{e.actor_email}</span> · {new Date(e.at).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            {e.note ? ` · ${e.note}` : ''}
                                        </p>
                                        {(e.changes || []).map((c, i) => (
                                            <p key={i} className="text-slate-500 font-mono text-[10.5px] ml-2 break-all">
                                                {c.field}: <span className="text-rose-300">{JSON.stringify(c.old)}</span> → <span className="text-emerald-300">{JSON.stringify(c.new)}</span>
                                            </p>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4" data-testid="sa-fields-panel">
                            {fields.map(([k, v]) => <FieldRow key={k} field={k} value={v} onSave={saveField} />)}
                        </div>

                        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 flex items-end gap-2 flex-wrap" data-testid="sa-new-field">
                            <label className="block flex-1 min-w-[140px]">
                                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Nuevo campo</span>
                                <input value={newField} onChange={(e) => setNewField(e.target.value)} placeholder="nombre_del_campo"
                                    className="block w-full h-9 px-3 mt-1 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs font-mono" />
                            </label>
                            <label className="block flex-[2] min-w-[180px]">
                                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Valor</span>
                                <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="valor (texto, número, true/false o JSON)"
                                    className="block w-full h-9 px-3 mt-1 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs" />
                            </label>
                            <Button size="sm" disabled={!newField.trim()} className="bg-[#D4AF37] hover:bg-[#c6a230] text-slate-950 h-9 text-xs font-bold"
                                onClick={async () => {
                                    let v = newValue;
                                    const t = newValue.trim();
                                    if (t === 'true') v = true; else if (t === 'false') v = false;
                                    else if (t !== '' && !Number.isNaN(Number(t))) v = Number(t);
                                    else if (t.startsWith('{') || t.startsWith('[')) { try { v = JSON.parse(t); } catch { toast.error('JSON inválido'); return; } }
                                    const ok = await saveField(newField.trim(), v);
                                    if (ok) { setNewField(''); setNewValue(''); }
                                }}>
                                <Plus className="w-3.5 h-3.5 mr-1" /> Añadir
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </Layout>
    );
}
