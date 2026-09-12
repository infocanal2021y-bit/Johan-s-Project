import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../../components/layout/Layout';
import { Button } from '../../components/ui/button';
import api from '../../lib/api';
import { toast } from 'sonner';
import { Award, ShieldCheck, ShieldX, Loader2, ChevronDown, ChevronUp, IdCard, CheckCircle2, XCircle, Maximize2 } from 'lucide-react';

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

const DOC_LABELS = { document_front: 'Anverso', document_back: 'Reverso', selfie_with_document: 'Selfie con documento' };

const DniQuickVerify = ({ req, onAction }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [zoom, setZoom] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const r = await api.get(`/admin/special45/${req.id}/kyc`);
            setData(r.data);
        } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
        finally { setLoading(false); }
    };

    const verify = async (verified) => {
        setBusy(true);
        try {
            await api.post(`/admin/special45/${req.id}/verify-dob`, { verified });
            toast.success(verified ? 'Edad confirmada contra el DNI ✓' : 'Marcado: la fecha no coincide');
            onAction();
        } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
        finally { setBusy(false); }
    };

    return (
        <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3.5" data-testid={`s45-dni-verify-${req.id}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-[10.5px] uppercase tracking-wider text-[#E5C158] font-bold flex items-center gap-1.5">
                    <IdCard className="w-4 h-4" /> Verificación DNI rápida
                </p>
                {req.dob_verified
                    ? <span className="text-emerald-400 text-[10.5px] font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Edad confirmada</span>
                    : !data && (
                        <Button size="sm" variant="outline" onClick={load} disabled={loading}
                            className="h-7 text-[11px] border-slate-700 text-slate-300" data-testid={`s45-load-kyc-${req.id}`}>
                            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Ver documento KYC'}
                        </Button>
                    )}
            </div>

            <div className="flex items-center gap-4 mt-2 text-[11.5px] flex-wrap">
                <div><span className="text-slate-500">Fecha declarada:</span> <span className="text-white font-mono font-bold">{req.date_of_birth}</span></div>
                <div><span className="text-slate-500">Edad declarada:</span> <span className="text-white font-mono font-bold">{req.declared_age} años</span></div>
            </div>

            {data && (
                <div className="mt-3">
                    {data.kyc ? (
                        <>
                            <div className="grid grid-cols-3 gap-2">
                                {['document_front', 'document_back', 'selfie_with_document'].map((k) => data.kyc[k] && (
                                    <button key={k} type="button" onClick={() => setZoom(zoom === k ? null : k)}
                                        className="relative rounded-lg overflow-hidden border border-slate-700 hover:border-[#D4AF37]/50 transition-colors group bg-slate-900"
                                        data-testid={`s45-kyc-${k}-${req.id}`}>
                                        <img src={data.kyc[k]} alt={DOC_LABELS[k]} className="w-full h-20 object-cover" />
                                        <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-slate-200 py-0.5 text-center font-semibold">
                                            {DOC_LABELS[k]} <Maximize2 className="w-2.5 h-2.5 inline ml-0.5" />
                                        </span>
                                    </button>
                                ))}
                            </div>
                            {zoom && data.kyc[zoom] && (
                                <div className="mt-2 rounded-lg border border-[#D4AF37]/30 overflow-hidden">
                                    <img src={data.kyc[zoom]} alt={DOC_LABELS[zoom]} className="w-full max-h-96 object-contain bg-black" />
                                </div>
                            )}
                            <p className="text-[10.5px] text-slate-500 mt-2">
                                KYC {data.kyc.status} · enviado {data.kyc.submitted_at ? new Date(data.kyc.submitted_at).toLocaleDateString('es-ES') : '—'} ·
                                compare la fecha de nacimiento del documento con la declarada
                            </p>
                        </>
                    ) : (
                        <p className="text-amber-300 text-[11.5px] bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
                            Este usuario no tiene documentos KYC subidos. Solicite el documento antes de confirmar la edad.
                        </p>
                    )}
                    {!req.dob_verified && (
                        <div className="flex gap-2 mt-3">
                            <Button size="sm" disabled={busy} onClick={() => verify(true)}
                                className="bg-emerald-600 hover:bg-emerald-500 h-8 text-xs" data-testid={`s45-dob-confirm-${req.id}`}>
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Confirmar edad ✓
                            </Button>
                            <Button size="sm" disabled={busy} onClick={() => verify(false)}
                                variant="outline" className="border-rose-500/40 text-rose-300 h-8 text-xs" data-testid={`s45-dob-reject-${req.id}`}>
                                <XCircle className="w-3.5 h-3.5 mr-1" /> No coincide
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
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

                    <DniQuickVerify req={req} onAction={onAction} />

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
