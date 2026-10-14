import { useState } from 'react';
import { Wallet, Pencil, Trash2, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';

const inputCls = 'h-10 w-full px-3 rounded-lg bg-slate-950/70 border border-slate-800 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-[#009cde]/70';

export const PayPalAccountCard = ({ account, onChange }) => {
    const [editing, setEditing] = useState(!account);
    const [form, setForm] = useState({ email: account?.email || '', confirm_email: '', holder_name: account?.holder_name || '' });
    const [busy, setBusy] = useState(false);

    const save = async () => {
        setBusy(true);
        try {
            const { data } = await api.post('/paypal-withdrawal/account', form);
            toast.success('Cuenta PayPal vinculada');
            onChange(data.account); setEditing(false);
        } catch (e) { toast.error(e.response?.data?.detail || 'No se pudo guardar la cuenta'); }
        finally { setBusy(false); }
    };
    const remove = async () => {
        if (!window.confirm('¿Desvincular tu cuenta PayPal?')) return;
        try { await api.delete('/paypal-withdrawal/account'); onChange(null); setEditing(true); setForm({ email: '', confirm_email: '', holder_name: '' }); toast.success('Cuenta desvinculada'); }
        catch (e) { toast.error(e.response?.data?.detail || 'No se pudo desvincular'); }
    };

    return (
        <div className="rounded-2xl border border-[#009cde]/25 bg-gradient-to-br from-[#003087]/30 to-slate-900/70 p-5" data-testid="paypal-account-card">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#009cde]/15 flex items-center justify-center"><Wallet className="w-5 h-5 text-[#009cde]" /></div>
                <div className="flex-1">
                    <p className="text-white font-semibold text-sm">Tu cuenta PayPal</p>
                    <p className="text-slate-400 text-xs">Destino de tus retiros · solo tú puedes modificarla</p>
                </div>
                {account && !editing && (
                    <div className="flex gap-1.5">
                        <button onClick={() => setEditing(true)} className="h-8 w-8 rounded-lg border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center" data-testid="paypal-account-edit"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={remove} className="h-8 w-8 rounded-lg border border-slate-700 text-slate-400 hover:text-rose-300 flex items-center justify-center" data-testid="paypal-account-remove"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                )}
            </div>
            {!editing ? (
                <div className="flex items-center gap-3 rounded-xl bg-slate-950/60 border border-slate-800 px-4 py-3">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <div>
                        <p className="text-white font-mono text-sm" data-testid="paypal-account-email">{account.email}</p>
                        <p className="text-slate-400 text-xs">{account.holder_name}</p>
                    </div>
                </div>
            ) : (
                <div className="space-y-2.5">
                    <input value={form.holder_name} onChange={(e) => setForm({ ...form, holder_name: e.target.value })} placeholder="Nombre del titular en PayPal" className={inputCls} data-testid="paypal-holder-input" />
                    <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Correo de tu cuenta PayPal" type="email" className={inputCls} data-testid="paypal-email-input" />
                    <input value={form.confirm_email} onChange={(e) => setForm({ ...form, confirm_email: e.target.value })} placeholder="Confirma el correo de PayPal" type="email" className={inputCls} data-testid="paypal-confirm-email-input" />
                    <div className="flex gap-2 justify-end pt-1">
                        {account && <button onClick={() => setEditing(false)} className="h-9 px-3 rounded-lg border border-slate-700 text-slate-300 text-xs font-semibold" data-testid="paypal-account-cancel-edit">Cancelar</button>}
                        <button onClick={save} disabled={busy} className="h-9 px-4 rounded-lg bg-[#009cde] hover:bg-[#0088c4] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50" data-testid="paypal-account-save">
                            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar cuenta
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
