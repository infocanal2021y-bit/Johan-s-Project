import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../../components/layout/Layout';
import { Button } from '../../components/ui/button';
import api from '../../lib/api';
import { toast } from 'sonner';
import { PhoneCall, Loader2, CheckCircle2, PhoneMissed, CalendarClock, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

const STATUS_STYLE = {
    pendiente: 'bg-amber-500/15 text-amber-300',
    llamado: 'bg-emerald-500/15 text-emerald-300',
    no_contesta: 'bg-rose-500/15 text-rose-300',
    reprogramada: 'bg-sky-500/15 text-sky-300',
    cancelada: 'bg-slate-600/20 text-slate-400',
};

const AppointmentCard = ({ appt, onAction }) => {
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState('');
    const [newDate, setNewDate] = useState('');
    const [newTime, setNewTime] = useState('');
    const [busy, setBusy] = useState(false);

    const setStatus = async (status, extra = {}) => {
        setBusy(true);
        try {
            await api.post(`/admin/callbacks/${appt.id}/status`, { status, note, ...extra });
            toast.success('Cita actualizada');
            onAction();
        } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
        finally { setBusy(false); }
    };

    const active = ['pendiente', 'reprogramada', 'no_contesta'].includes(appt.status);

    return (
        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4" data-testid={`admin-callback-${appt.id}`}>
            <button type="button" className="w-full flex items-center justify-between gap-2 flex-wrap text-left" onClick={() => setOpen((v) => !v)}>
                <div className="min-w-0">
                    <p className="text-white text-sm font-bold truncate">{appt.user_name} <span className="text-slate-500 font-normal text-xs">· {appt.user_email}</span></p>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                        📅 {appt.date} · {appt.time}h (España) · <a href={`tel:${appt.phone}`} className="text-sky-300 font-mono hover:underline" onClick={(e) => e.stopPropagation()}>{appt.phone}</a> · {appt.reason}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-md text-[10.5px] font-bold ${STATUS_STYLE[appt.status] || ''}`}>{appt.status_label}</span>
                    {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </div>
            </button>

            {open && (
                <div className="mt-3 pt-3 border-t border-slate-800 space-y-3">
                    {appt.notes && <p className="text-[11.5px] text-slate-300 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">Nota del usuario: {appt.notes}</p>}
                    <div className="space-y-1">
                        {(appt.timeline || []).slice().reverse().map((t, i) => (
                            <p key={i} className="text-[10.5px] text-slate-500">
                                <span className="text-slate-300 font-semibold">{t.label}</span>{t.note ? ` — ${t.note}` : ''} · {new Date(t.at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                        ))}
                    </div>
                    {active && (
                        <>
                            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota para el usuario (opcional)"
                                className="w-full h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs" data-testid={`callback-note-${appt.id}`} />
                            <div className="flex items-center gap-2 flex-wrap">
                                <Button size="sm" disabled={busy} onClick={() => setStatus('llamado')}
                                    className="bg-emerald-600 hover:bg-emerald-500 h-8 text-xs" data-testid={`callback-done-${appt.id}`}>
                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Llamado ✓
                                </Button>
                                <Button size="sm" disabled={busy} onClick={() => setStatus('no_contesta')}
                                    variant="outline" className="border-rose-500/40 text-rose-300 h-8 text-xs" data-testid={`callback-noanswer-${appt.id}`}>
                                    <PhoneMissed className="w-3.5 h-3.5 mr-1" /> No contesta
                                </Button>
                                <Button size="sm" disabled={busy} onClick={() => setStatus('cancelada')}
                                    variant="outline" className="border-slate-600 text-slate-400 h-8 text-xs" data-testid={`callback-cancel-${appt.id}`}>
                                    <XCircle className="w-3.5 h-3.5 mr-1" /> Cancelar
                                </Button>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
                                    className="h-8 px-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs" data-testid={`callback-redate-${appt.id}`} />
                                <input type="time" step="1800" value={newTime} onChange={(e) => setNewTime(e.target.value)}
                                    className="h-8 px-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs" data-testid={`callback-retime-${appt.id}`} />
                                <Button size="sm" disabled={busy || !newDate || !newTime}
                                    onClick={() => setStatus('reprogramada', { new_date: newDate, new_time: newTime })}
                                    className="bg-[#1973B8] hover:bg-[#1F89D8] h-8 text-xs" data-testid={`callback-reschedule-${appt.id}`}>
                                    <CalendarClock className="w-3.5 h-3.5 mr-1" /> Reprogramar
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default function AdminCallbacksPage() {
    const [data, setData] = useState(null);
    const [filter, setFilter] = useState('');

    const load = useCallback(async () => {
        try {
            const r = await api.get('/admin/callbacks');
            setData(r.data);
        } catch { toast.error('No se pudo cargar'); }
    }, []);
    useEffect(() => { load(); }, [load]);

    if (!data) return <Layout><div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div></Layout>;

    const rows = data.appointments.filter((a) => !filter || a.status === filter);
    const pending = (data.counts.pendiente || 0) + (data.counts.reprogramada || 0) + (data.counts.no_contesta || 0);

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-4 p-3 sm:p-5" data-testid="admin-callbacks-page">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#1973B8]/15 ring-1 ring-[#1973B8]/40 flex items-center justify-center">
                        <PhoneCall className="w-5 h-5 text-sky-300" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-white">Citas de Llamada</h1>
                        <p className="text-slate-400 text-xs">{pending} citas por atender · horario L-V 09:00–18:00 (España)</p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                    <button type="button" onClick={() => setFilter('')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold ${!filter ? 'bg-[#1973B8]/15 text-sky-300 ring-1 ring-[#1973B8]/30' : 'text-slate-500 hover:text-white'}`}>
                        Todas ({data.appointments.length})
                    </button>
                    {Object.entries(data.statuses).map(([k, v]) => (
                        <button key={k} type="button" onClick={() => setFilter(k)} data-testid={`callback-filter-${k}`}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === k ? 'bg-[#1973B8]/15 text-sky-300 ring-1 ring-[#1973B8]/30' : 'text-slate-500 hover:text-white'}`}>
                            {v} ({data.counts[k] || 0})
                        </button>
                    ))}
                </div>

                <div className="space-y-3">
                    {rows.length === 0 && <p className="text-slate-500 text-sm text-center py-10">Sin citas en este filtro.</p>}
                    {rows.map((a) => <AppointmentCard key={a.id} appt={a} onAction={load} />)}
                </div>
            </div>
        </Layout>
    );
}
