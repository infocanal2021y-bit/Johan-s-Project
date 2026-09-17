import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import api from '../lib/api';
import { toast } from 'sonner';
import { PhoneCall, Clock, CalendarDays, Loader2, XCircle, CheckCircle2, Info } from 'lucide-react';

const STATUS_STYLE = {
    pendiente: 'bg-amber-500/15 text-amber-300',
    llamado: 'bg-emerald-500/15 text-emerald-300',
    no_contesta: 'bg-rose-500/15 text-rose-300',
    reprogramada: 'bg-sky-500/15 text-sky-300',
    cancelada: 'bg-slate-600/20 text-slate-400',
};

const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

const ActiveCard = ({ appt, onRefresh }) => {
    const [busy, setBusy] = useState(false);
    const cancel = async () => {
        setBusy(true);
        try {
            await api.post(`/callbacks/${appt.id}/cancel`);
            toast.success('Cita cancelada');
            onRefresh();
        } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
        finally { setBusy(false); }
    };
    return (
        <div className="rounded-xl bg-slate-900/70 border border-[#1973B8]/30 p-5 space-y-3" data-testid="callback-active-card">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-white font-bold flex items-center gap-2"><PhoneCall className="w-4 h-4 text-sky-300" /> Su cita de llamada</p>
                <span className={`px-2 py-1 rounded-md text-[11px] font-bold ${STATUS_STYLE[appt.status] || ''}`} data-testid="callback-status">
                    {appt.status_label}
                </span>
            </div>
            <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Teléfono</span><span className="text-white font-mono font-semibold">{appt.phone}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Fecha</span><span className="text-white font-semibold capitalize">{fmtDate(appt.date)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Hora (España)</span><span className="text-white font-mono font-semibold">{appt.time}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Motivo</span><span className="text-white font-semibold">{appt.reason}</span></div>
                {appt.notes && <div className="flex justify-between gap-3"><span className="text-slate-500">Nota</span><span className="text-slate-300 text-right">{appt.notes}</span></div>}
            </div>
            <div className="rounded-lg bg-sky-500/10 border border-sky-500/25 p-3 text-[11.5px] text-sky-200 flex gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Un agente le llamará en la fecha y hora indicadas. Mantenga su teléfono disponible. Si no puede atender, cancele y programe una nueva cita.</span>
            </div>
            <Button variant="outline" disabled={busy} onClick={cancel}
                className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 h-9 text-xs" data-testid="callback-cancel-btn">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><XCircle className="w-3.5 h-3.5 mr-1.5" /> Cancelar cita</>}
            </Button>
        </div>
    );
};

const RequestForm = ({ config, onCreated }) => {
    const [phone, setPhone] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [reason, setReason] = useState(config.reasons[0]);
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const today = new Date().toISOString().slice(0, 10);

    const submit = async () => {
        if (!phone.trim() || !date || !time) { toast.error('Complete teléfono, fecha y hora'); return; }
        setBusy(true);
        try {
            await api.post('/callbacks/request', { phone, date, time, reason, notes });
            toast.success('Cita registrada. Un agente le llamará en el horario elegido.');
            onCreated();
        } catch (e) { toast.error(e.response?.data?.detail || 'No se pudo registrar la cita'); }
        finally { setBusy(false); }
    };

    return (
        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-5 space-y-4" data-testid="callback-form">
            <div>
                <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Teléfono de contacto</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+34 600 123 456"
                    className="mt-1.5 w-full h-10 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm font-mono"
                    data-testid="callback-phone-input" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5" /> Fecha (L-V)
                    </label>
                    <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)}
                        className="mt-1.5 w-full h-10 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm"
                        data-testid="callback-date-input" />
                </div>
                <div>
                    <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> Hora (España)
                    </label>
                    <select value={time} onChange={(e) => setTime(e.target.value)}
                        className="mt-1.5 w-full h-10 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm"
                        data-testid="callback-time-select">
                        <option value="">Elegir hora…</option>
                        {config.slots.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
            </div>
            <div>
                <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Motivo de la llamada</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)}
                    className="mt-1.5 w-full h-10 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm"
                    data-testid="callback-reason-select">
                    {config.reasons.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
            </div>
            <div>
                <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Nota para el agente (opcional)</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500}
                    placeholder="Cuéntenos brevemente su consulta…"
                    className="mt-1.5 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm resize-none"
                    data-testid="callback-notes-input" />
            </div>
            <Button disabled={busy} onClick={submit}
                className="w-full bg-[#1973B8] hover:bg-[#1F89D8] text-white font-bold h-11" data-testid="callback-submit-btn">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><PhoneCall className="w-4 h-4 mr-2" /> Programar llamada</>}
            </Button>
            <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 flex-shrink-0" /> {config.hours}. Solo puede tener una cita activa a la vez.
            </p>
        </div>
    );
};

export default function CallbackPage() {
    const [config, setConfig] = useState(null);
    const [history, setHistory] = useState([]);

    const load = useCallback(async () => {
        try {
            const [c, m] = await Promise.all([api.get('/callbacks/config'), api.get('/callbacks/mine')]);
            setConfig(c.data);
            setHistory(m.data.appointments);
        } catch { toast.error('No se pudo cargar'); }
    }, []);
    useEffect(() => { load(); }, [load]);

    if (!config) return <Layout><div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div></Layout>;

    const past = history.filter((a) => !config.active_appointment || a.id !== config.active_appointment.id);

    return (
        <Layout>
            <div className="max-w-2xl mx-auto space-y-5 p-3 sm:p-5" data-testid="callback-page">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#1973B8]/15 ring-1 ring-[#1973B8]/40 flex items-center justify-center">
                        <PhoneCall className="w-5 h-5 text-sky-300" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-white">Solicitar Llamada</h1>
                        <p className="text-slate-400 text-xs">Deje su número y un agente le llamará · {config.hours}</p>
                    </div>
                </div>

                {config.active_appointment
                    ? <ActiveCard appt={{ ...config.active_appointment, status_label: config.active_appointment.status_label || config.active_appointment.status }} onRefresh={load} />
                    : <RequestForm config={config} onCreated={load} />}

                {past.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Historial de citas</p>
                        {past.map((a) => (
                            <div key={a.id} className="rounded-lg bg-slate-900/50 border border-slate-800 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs" data-testid={`callback-history-${a.id}`}>
                                <div className="min-w-0">
                                    <p className="text-white font-semibold">{a.date} · {a.time} · {a.reason}</p>
                                    <p className="text-slate-500 font-mono text-[10.5px]">{a.phone}</p>
                                </div>
                                <span className={`px-2 py-1 rounded-md text-[10.5px] font-bold flex-shrink-0 ${STATUS_STYLE[a.status] || ''}`}>
                                    {a.status === 'llamado' && <CheckCircle2 className="w-3 h-3 inline mr-1" />}{a.status_label}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Layout>
    );
}
