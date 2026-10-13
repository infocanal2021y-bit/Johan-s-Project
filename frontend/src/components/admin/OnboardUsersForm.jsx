import { useState } from 'react';
import { Plus, Trash2, Loader2, UserPlus, Send } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import api from '../../lib/api';

const emptyRow = () => ({ name: '', email: '', phone: '' });
const inputCls = 'h-9 px-3 rounded-md bg-slate-950/70 border border-slate-800 text-white text-[12.5px] placeholder:text-slate-600 focus:outline-none focus:border-cyan-600/60 w-full';

const ResultLine = ({ tone, label, value, sub }) => (
    <div className="flex items-start gap-2 text-[12px]">
        <span className={`mt-0.5 px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase ${tone}`}>{label}</span>
        <div className="min-w-0"><p className="text-slate-200 truncate">{value}</p>{sub && <p className="text-slate-500 text-[11px]">{sub}</p>}</div>
    </div>
);

export const OnboardUsersForm = ({ onDone }) => {
    const [rows, setRows] = useState([emptyRow()]);
    const [policy, setPolicy] = useState('activation_link');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    const update = (i, k, v) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));
    const valid = rows.filter((r) => r.email.trim() && /\S+@\S+\.\S+/.test(r.email.trim()));

    const submit = async () => {
        if (valid.length === 0) return toast.error('Añade al menos un correo válido');
        setBusy(true); setResult(null);
        try {
            const { data } = await api.post('/admin/users/quick-onboard', {
                users: valid.map((r) => ({ name: r.name.trim() || r.email.split('@')[0], email: r.email.trim().toLowerCase(), phone: r.phone.trim() || null })),
                send_email: true, existing_policy: policy,
            });
            setResult(data);
            toast.success(`Creados ${data.summary.created} · Existentes ${data.summary.existing} · Errores ${data.summary.errors}`);
            setRows([emptyRow()]);
            onDone?.();
        } catch (e) { toast.error(e.response?.data?.detail || 'No se pudo completar el alta'); }
        finally { setBusy(false); }
    };

    return (
        <Card className="p-5 bg-slate-900/60 border border-slate-800 space-y-4" data-testid="onboard-form">
            <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-cyan-500/15 flex items-center justify-center"><UserPlus className="w-4.5 h-4.5 text-cyan-300" /></div>
                <div>
                    <p className="text-white font-semibold text-sm">Alta e invitación de usuarios</p>
                    <p className="text-slate-500 text-xs">Credenciales temporales + enlace seguro de activación (7 días) · sin saldos ni operaciones</p>
                </div>
            </div>
            <div className="space-y-2">
                {rows.map((r, i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr_0.8fr_auto] gap-2" data-testid={`onboard-row-${i}`}>
                        <input value={r.name} onChange={(e) => update(i, 'name', e.target.value)} placeholder="Nombre completo" className={inputCls} data-testid={`onboard-name-${i}`} />
                        <input value={r.email} onChange={(e) => update(i, 'email', e.target.value)} placeholder="correo@dominio.com" type="email" className={inputCls} data-testid={`onboard-email-${i}`} />
                        <input value={r.phone} onChange={(e) => update(i, 'phone', e.target.value)} placeholder="Teléfono (opcional)" className={inputCls} data-testid={`onboard-phone-${i}`} />
                        <button type="button" onClick={() => setRows((rs) => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : [emptyRow()])}
                            className="h-9 w-9 rounded-md border border-slate-800 text-slate-500 hover:text-rose-300 hover:border-rose-500/40 flex items-center justify-center" data-testid={`onboard-remove-${i}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ))}
                <button type="button" onClick={() => setRows((rs) => [...rs, emptyRow()])} className="text-[12px] text-cyan-300 hover:text-cyan-200 flex items-center gap-1" data-testid="onboard-add-row">
                    <Plus className="w-3.5 h-3.5" /> Añadir otra fila
                </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <label className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Si el correo ya existe:</label>
                <select value={policy} onChange={(e) => setPolicy(e.target.value)} className="h-9 px-3 rounded-md bg-slate-950/70 border border-slate-800 text-white text-[12.5px]" data-testid="onboard-policy">
                    <option value="activation_link">Enviar enlace de activación (no modifica el registro)</option>
                    <option value="reset_if_unchanged">Nueva contraseña temporal si nunca la cambió</option>
                    <option value="notice">Solo aviso de acceso activo</option>
                    <option value="skip">Omitir</option>
                </select>
                <Button onClick={submit} disabled={busy || valid.length === 0} className="ml-auto bg-cyan-600 hover:bg-cyan-700 h-9" data-testid="onboard-submit">
                    {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
                    Crear e invitar ({valid.length})
                </Button>
            </div>
            {result && (
                <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 space-y-2" data-testid="onboard-result">
                    {result.created.map((c) => <ResultLine key={c.id} tone="bg-emerald-500/15 text-emerald-300" label="Creado" value={`${c.name} · ${c.email}`} sub={`Temporal ${c.temp_password} · correo: ${c.email_status}`} />)}
                    {result.existing.map((e) => <ResultLine key={e.email} tone="bg-amber-500/15 text-amber-300" label="Existente" value={`${e.name || ''} · ${e.email}`} sub={`Acción: ${e.action} · correo: ${e.email_status}`} />)}
                    {result.errors.map((e) => <ResultLine key={e.email} tone="bg-red-500/15 text-red-300" label="Error" value={e.email} sub={e.reason} />)}
                    <p className="text-[11px] text-slate-500">Informe enviado al administrador: {result.admin_report_email?.status}</p>
                </div>
            )}
        </Card>
    );
};
