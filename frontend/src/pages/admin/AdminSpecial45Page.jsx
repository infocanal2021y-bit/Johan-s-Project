import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../../components/layout/Layout';
import { Button } from '../../components/ui/button';
import api from '../../lib/api';
import { toast } from 'sonner';
import { Award, ShieldCheck, ShieldX, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

const fmtEur = (n) => {
    const [int, dec] = Number(n || 0).toFixed(2).split('.');
    return `€${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
};
const STATUS_STYLE = {
    solicitado: 'bg-sky-500/15 text-sky-300',
    pendiente_validacion: 'bg-amber-500/15 text-amber-300',
    en_revision: 'bg-indigo-500/15 text-indigo-300',
    aprobado: 'bg-emerald-500/15 text-emerald-300',
    procesando: 'bg-cyan-500/15 text-cyan-300',
    completado: 'bg-emerald-600/20 text-emerald-300',
    rechazado: 'bg-rose-500/15 text-rose-300',
};

const RequestCard = ({ req, statuses, onAction }) => {
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState('');
    const [newStatus, setNewStatus] = useState(req.status);
    const [busy, setBusy] = useState(false);

    const validateOwnership = async (validated) => {
        setBusy(true);
        try {
            await api.post(`/admin/special45/${req.id}/validate-ownership`, { validated, note, dob_verified: validated || undefined });
            toast.success(validated ? 'Titularidad validada' : 'Titularidad rechazada — queda pendiente');
            onAction();
        } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
        finally { setBusy(false); }
    };

    const changeStatus = async () => {
        setBusy(true);
        try {
            await api.post(`/admin/special45/${req.id}/status`, { status: newStatus, note });
            toast.success('Estado actualizado');
            onAction();
        } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
        finally { setBusy(false); }
    };

    return (
        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4" data-testid={`s45-admin-req-${req.id}`}>
            <button type="button" className="w-full flex items-center justify-between gap-2 flex-wrap text-left" onClick={() => setOpen((v) => !v)}>
                <div className="min-w-0">
                    <p className="text-white text-sm font-bold truncate">{req.user_name} <span className="text-slate-500 font-normal text-xs">· {req.user_email}</span></p>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                        {fmtEur(req.amount_eur)} · {req.destination_type === 'bank' ? `IBAN ${req.bank_iban?.slice(0, 4)}…${req.bank_iban?.slice(-4)}` : `BTC ${req.btc_address_masked}`}
                        · {req.declared_age} años declarados · {new Date(req.created_at).toLocaleDateString('es-ES')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-md text-[10.5px] font-bold ${STATUS_STYLE[req.status] || ''}`}>{req.status_label}</span>
                    {req.ownership_validated
                        ? <span className="text-emerald-400 text-[10px] font-bold">TITULARIDAD ✓</span>
                        : <span className="text-amber-300 text-[10px] font-bold">SIN VALIDAR</span>}
                    {req.fee_informed && <span className="text-sky-300 text-[10px] font-bold">ABONO INFORMADO</span>}
                    {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </div>
            </button>

            {open && (
                <div className="mt-3 pt-3 border-t border-slate-800 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-[11.5px]">
                        <div><p className="text-slate-500">Fecha nacimiento</p><p className="text-white font-mono">{req.date_of_birth} ({req.declared_age} años)</p></div>
                        <div><p className="text-slate-500">DNI verificado</p><p className={req.dob_verified ? 'text-emerald-400 font-bold' : 'text-amber-300'}>{req.dob_verified ? 'Sí ✓' : 'Pendiente'}</p></div>
                        <div><p className="text-slate-500">Abono €1.800</p><p className={req.fee_informed ? 'text-emerald-400' : 'text-slate-400'}>{req.fee_informed ? `Informado${req.fee_info?.txid ? ` · ${req.fee_info.txid.slice(0, 16)}…` : ''}` : 'No informado'}</p></div>
                        {req.destination_type === 'bank' ? (
                            <>
                                <div><p className="text-slate-500">Titular</p><p className="text-white">{req.bank_holder}</p></div>
                                <div><p className="text-slate-500">IBAN</p><p className="text-white font-mono text-[10.5px]">{req.bank_iban}</p></div>
                                <div><p className="text-slate-500">Banco</p><p className="text-white">{req.bank_name || '—'}</p></div>
                            </>
                        ) : (
                            <div className="col-span-2"><p className="text-slate-500">Wallet BTC ({req.btc_address_type})</p><p className="text-white font-mono text-[10.5px] break-all">{req.btc_address}</p></div>
                        )}
                        <div className="col-span-2 sm:col-span-3"><p className="text-slate-500">Nota de titularidad</p><p className="text-slate-300">{req.ownership_note}</p></div>
                    </div>

                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota para el usuario (opcional)"
                        className="w-full h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs" data-testid={`s45-note-${req.id}`} />

                    <div className="flex items-center gap-2 flex-wrap">
                        {!req.ownership_validated && (
                            <>
                                <Button size="sm" disabled={busy} onClick={() => validateOwnership(true)}
                                    className="bg-emerald-600 hover:bg-emerald-500 h-8 text-xs" data-testid={`s45-validate-yes-${req.id}`}>
                                    <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Validar titularidad
                                </Button>
                                <Button size="sm" disabled={busy} onClick={() => validateOwnership(false)}
                                    variant="outline" className="border-amber-500/40 text-amber-300 h-8 text-xs" data-testid={`s45-validate-no-${req.id}`}>
                                    <ShieldX className="w-3.5 h-3.5 mr-1" /> No coincide
                                </Button>
                            </>
                        )}
                        <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                            className="h-8 px-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs" data-testid={`s45-status-select-${req.id}`}>
                            {Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <Button size="sm" disabled={busy || newStatus === req.status} onClick={changeStatus}
                            className="bg-[#1973B8] hover:bg-[#1F89D8] h-8 text-xs" data-testid={`s45-status-save-${req.id}`}>
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Cambiar estado'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default function AdminSpecial45Page() {
    const [data, setData] = useState(null);
    const [filter, setFilter] = useState('');

    const load = useCallback(async () => {
        try {
            const r = await api.get('/admin/special45');
            setData(r.data);
        } catch { toast.error('No se pudo cargar'); }
    }, []);
    useEffect(() => { load(); }, [load]);

    if (!data) return <Layout><div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div></Layout>;

    const rows = data.requests.filter((r) => !filter || r.status === filter);
    const totalActive = Object.entries(data.counts).filter(([k]) => !['completado', 'rechazado'].includes(k)).reduce((s, [, v]) => s + v, 0);

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-4 p-3 sm:p-5" data-testid="admin-special45-page">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#D4AF37]/15 ring-1 ring-[#D4AF37]/40 flex items-center justify-center">
                        <Award className="w-5 h-5 text-[#F3D372]" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-white">Retiros Especiales +45</h1>
                        <p className="text-slate-400 text-xs">{totalActive} solicitudes activas · abono €1.800 · máx €10.000 por solicitud</p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                    <button type="button" onClick={() => setFilter('')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold ${!filter ? 'bg-[#D4AF37]/15 text-[#F3D372] ring-1 ring-[#D4AF37]/30' : 'text-slate-500 hover:text-white'}`}>
                        Todas ({data.requests.length})
                    </button>
                    {Object.entries(data.statuses).map(([k, v]) => (
                        <button key={k} type="button" onClick={() => setFilter(k)} data-testid={`s45-filter-${k}`}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === k ? 'bg-[#D4AF37]/15 text-[#F3D372] ring-1 ring-[#D4AF37]/30' : 'text-slate-500 hover:text-white'}`}>
                            {v} ({data.counts[k] || 0})
                        </button>
                    ))}
                </div>

                <div className="space-y-3">
                    {rows.length === 0 && <p className="text-slate-500 text-sm text-center py-10">Sin solicitudes en este filtro.</p>}
                    {rows.map((r) => <RequestCard key={r.id} req={r} statuses={data.statuses} onAction={load} />)}
                </div>
            </div>
        </Layout>
    );
}
