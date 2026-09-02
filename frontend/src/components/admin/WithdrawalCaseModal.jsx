import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import api from '../../lib/api';
import {
    FolderOpen, Loader2, ExternalLink, HandCoins, FileSearch, StickyNote,
    XCircle, CheckCircle, Send, History, FileText, Coins,
} from 'lucide-react';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtEur = (n) => `€${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Row = ({ k, v, mono, cls = 'text-white' }) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
        <span className="text-[12px] text-slate-500">{k}</span>
        <span className={`text-[12.5px] text-right ${mono ? 'font-mono' : ''} ${cls}`}>{v}</span>
    </div>
);

export const WithdrawalCaseModal = ({ reference, open, onClose }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [panel, setPanel] = useState(null); // abono | doc | note | reject
    const [submitting, setSubmitting] = useState(false);
    const navigate = useNavigate();

    // Abono form
    const [amount, setAmount] = useState('');
    const [concept, setConcept] = useState('Cargo de autorización y procesamiento del retiro');
    const [deadline, setDeadline] = useState('');
    const [observation, setObservation] = useState('');
    // Doc / note / reject
    const [message, setMessage] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const { data: d } = await api.get(`/admin/withdrawal-case/${reference}`);
            setData(d);
            setAmount(String(Math.max(0, (d.tax_required || 4850) - (d.tax_paid || 0)).toFixed(2)));
        } catch (e) {
            toast.error(e.response?.data?.detail || 'No se pudo cargar el expediente');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        if (open && reference) { setPanel(null); setMessage(''); setObservation(''); load(); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, reference]);

    const act = async (fn, okMsg) => {
        setSubmitting(true);
        try {
            await fn();
            toast.success(okMsg);
            setPanel(null); setMessage(''); setObservation('');
            load();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al ejecutar la acción');
        } finally {
            setSubmitting(false);
        }
    };

    const sendAbono = () => {
        const amt = parseFloat(amount);
        if (!amt || amt <= 0) { toast.error('Indique un importe válido'); return; }
        if (!concept.trim()) { toast.error('El concepto es obligatorio'); return; }
        act(() => api.post(`/admin/withdrawal-case/${data.id}/request-payment`, {
            amount: amt, concept: concept.trim(),
            deadline_hours: deadline ? parseInt(deadline, 10) : null,
            observation: observation.trim() || null,
        }), 'Solicitud de abono enviada al usuario (notificación + email)');
    };

    const remaining = data ? Math.max(0, (data.tax_required || 4850) - (data.tax_paid || 0)) : 0;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-2xl bg-slate-900 border-slate-700 text-white max-h-[88vh] overflow-y-auto" data-testid="withdrawal-case-modal">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-white text-base">
                        <FolderOpen className="w-5 h-5 text-cyan-400" />
                        Expediente de Retiro · <span className="font-mono text-cyan-300">{reference}</span>
                    </DialogTitle>
                </DialogHeader>

                {loading || !data ? (
                    <div className="flex justify-center py-14"><Loader2 className="w-6 h-6 text-cyan-400 animate-spin" /></div>
                ) : (
                    <div className="space-y-4">
                        {/* Datos principales */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="rounded-xl bg-slate-950/60 border border-slate-800 divide-y divide-slate-800/60" data-testid="case-info">
                                <Row k="Usuario" v={data.user.name} />
                                <Row k="Email" v={data.user.email} />
                                <Row k="Importe solicitado" v={`${Number(data.amount).toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${data.currency}`} cls="text-emerald-400 font-bold" />
                                <Row k="Fecha y hora" v={fmtDate(data.created_at)} />
                            </div>
                            <div className="rounded-xl bg-slate-950/60 border border-slate-800 divide-y divide-slate-800/60">
                                <Row k="Banco de destino" v={data.bank_name} />
                                <Row k="IBAN" v={data.iban_masked} mono />
                                <Row k="Estado actual" v={data.status_label} cls="text-amber-300 font-semibold" />
                                <Row k="Estado administrativo" v={data.admin_stage === 'abono_solicitado_al_usuario' ? 'Abono solicitado al usuario' : (data.admin_stage || '—')} cls="text-cyan-300" />
                            </div>
                        </div>

                        {/* Progreso del cargo */}
                        <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5 space-y-2">
                            <div className="flex justify-between text-[12px]">
                                <span className="text-slate-400">Cargo de autorización</span>
                                <span className="text-slate-300 font-mono">{fmtEur(data.tax_paid)} / {fmtEur(data.tax_required || 4850)} · Restante <span className="text-amber-300">{fmtEur(remaining)}</span></span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-2">
                                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(100, ((data.tax_paid || 0) / (data.tax_required || 4850)) * 100)}%` }} />
                            </div>
                        </div>

                        {/* Documentación relacionada */}
                        <div className="rounded-xl bg-slate-950/60 border border-slate-800" data-testid="case-docs">
                            <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Documentación relacionada</p>
                            <div className="divide-y divide-slate-800/60 max-h-36 overflow-y-auto">
                                {(data.payments || []).map((p, i) => (
                                    <div key={i} className="px-3 py-2 flex items-center justify-between gap-2 text-[12px]">
                                        <span className="text-slate-300 flex items-center gap-1.5"><Coins className="w-3.5 h-3.5 text-violet-400" /> Abono {p.crypto_type || p.coin || ''} · {p.amount ? fmtEur(p.amount) : ''}</span>
                                        <span className="text-slate-500">{p.status || '—'} · {fmtDate(p.submitted_at)}</span>
                                    </div>
                                ))}
                                {(data.fiscal_documents || []).map((d) => (
                                    <div key={d.id} className="px-3 py-2 flex items-center justify-between gap-2 text-[12px]">
                                        <span className="text-slate-300 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-cyan-400" /> {d.name}</span>
                                        <span className="text-slate-500">{d.status} · {fmtDate(d.created_at)}</span>
                                    </div>
                                ))}
                                {(data.payments || []).length === 0 && (data.fiscal_documents || []).length === 0 && (
                                    <p className="px-3 py-4 text-slate-600 text-[12px] text-center">Sin documentación aportada todavía.</p>
                                )}
                            </div>
                        </div>

                        {/* Historial */}
                        <div className="rounded-xl bg-slate-950/60 border border-slate-800" data-testid="case-history">
                            <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Historial de acciones</p>
                            <div className="divide-y divide-slate-800/60 max-h-40 overflow-y-auto">
                                {(data.audit || []).length === 0 ? (
                                    <p className="px-3 py-4 text-slate-600 text-[12px] text-center">Sin acciones registradas.</p>
                                ) : data.audit.map((a) => (
                                    <div key={a.id} className="px-3 py-2 text-[12px]">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-slate-200 font-semibold">{a.action}</span>
                                            <span className="text-slate-600 text-[10.5px]">{fmtDate(a.created_at)}</span>
                                        </div>
                                        <p className="text-slate-500 text-[11px]">
                                            {a.admin_name ? `Admin: ${a.admin_name} · ` : ''}
                                            {a.old_status ? `${a.old_status} → ${a.new_status || ''}` : ''}
                                            {a.notes ? ` · ${a.notes}` : ''}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Paneles de acción */}
                        {panel === 'abono' && (
                            <div className="rounded-xl bg-slate-800/70 border border-emerald-500/25 p-4 space-y-3" data-testid="case-abono-panel">
                                <p className="text-emerald-300 text-xs font-bold uppercase tracking-wider">Solicitar abono al usuario</p>
                                <div className="grid grid-cols-3 gap-2 text-[11.5px]">
                                    <div className="rounded-lg bg-slate-950/60 p-2 text-center"><p className="text-slate-500">Total requerido</p><p className="text-white font-mono font-bold">{fmtEur(data.tax_required || 4850)}</p></div>
                                    <div className="rounded-lg bg-slate-950/60 p-2 text-center"><p className="text-slate-500">Ya completado</p><p className="text-emerald-400 font-mono font-bold">{fmtEur(data.tax_paid)}</p></div>
                                    <div className="rounded-lg bg-slate-950/60 p-2 text-center"><p className="text-slate-500">Restante</p><p className="text-amber-300 font-mono font-bold">{fmtEur(remaining)}</p></div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Importe solicitado (€)"
                                        className="bg-slate-950 border-slate-700 text-white text-sm" data-testid="abono-amount-input" />
                                    <Input type="number" value={deadline} onChange={(e) => setDeadline(e.target.value)} placeholder="Plazo (horas, opcional)"
                                        className="bg-slate-950 border-slate-700 text-white text-sm" data-testid="abono-deadline-input" />
                                </div>
                                <Input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Concepto"
                                    className="bg-slate-950 border-slate-700 text-white text-sm" data-testid="abono-concept-input" />
                                <Textarea value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="Observación / mensaje para el usuario (opcional)"
                                    className="bg-slate-950 border-slate-700 text-white text-sm min-h-[70px]" data-testid="abono-observation-input" />
                                <div className="flex gap-2">
                                    <Button onClick={sendAbono} disabled={submitting} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white" data-testid="abono-send-btn">
                                        {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
                                        Enviar solicitud de abono al usuario
                                    </Button>
                                    <Button variant="outline" onClick={() => setPanel(null)} className="border-slate-700 text-slate-400">Cancelar</Button>
                                </div>
                            </div>
                        )}

                        {(panel === 'doc' || panel === 'note' || panel === 'reject') && (
                            <div className={`rounded-xl bg-slate-800/70 border p-4 space-y-3 ${panel === 'reject' ? 'border-red-500/30' : 'border-cyan-500/25'}`} data-testid={`case-${panel}-panel`}>
                                <p className={`text-xs font-bold uppercase tracking-wider ${panel === 'reject' ? 'text-red-300' : 'text-cyan-300'}`}>
                                    {panel === 'doc' ? 'Solicitar documentación' : panel === 'note' ? 'Añadir nota interna' : 'Rechazar solicitud (motivo obligatorio)'}
                                </p>
                                <Textarea value={message} onChange={(e) => setMessage(e.target.value)}
                                    placeholder={panel === 'doc' ? 'Mensaje al usuario sobre la documentación requerida' : panel === 'note' ? 'Nota visible solo para administradores' : 'Motivo del rechazo (se notificará al usuario)'}
                                    className="bg-slate-950 border-slate-700 text-white text-sm min-h-[80px]" data-testid="case-panel-input" />
                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => {
                                            if (!message.trim()) { toast.error('El texto es obligatorio'); return; }
                                            if (panel === 'doc') act(() => api.post(`/admin/withdrawals/${data.id}/request-documentation`, { message: message.trim() }), 'Solicitud de documentación enviada');
                                            else if (panel === 'note') act(() => api.post(`/admin/withdrawals/${data.id}/note`, { note: message.trim() }), 'Nota interna añadida');
                                            else act(() => api.post(`/admin/withdrawal-case/${data.id}/reject`, { reason: message.trim() }), 'Solicitud rechazada y usuario notificado');
                                        }}
                                        disabled={submitting}
                                        className={`flex-1 text-white ${panel === 'reject' ? 'bg-red-500 hover:bg-red-600' : 'bg-cyan-600 hover:bg-cyan-700'}`}
                                        data-testid="case-panel-confirm-btn"
                                    >
                                        {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1.5" />}
                                        Confirmar
                                    </Button>
                                    <Button variant="outline" onClick={() => setPanel(null)} className="border-slate-700 text-slate-400">Cancelar</Button>
                                </div>
                            </div>
                        )}

                        {/* Acciones */}
                        {!panel && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="case-actions">
                                <Button onClick={() => { onClose(); navigate('/admin/withdrawals'); }} variant="outline"
                                    className="border-slate-700 text-slate-300 hover:bg-slate-800" data-testid="case-open-full-btn">
                                    <ExternalLink className="w-4 h-4 mr-1.5" /> Ver solicitud completa
                                </Button>
                                <Button onClick={() => setPanel('abono')}
                                    className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25" data-testid="case-request-abono-btn">
                                    <HandCoins className="w-4 h-4 mr-1.5" /> Solicitar abono
                                </Button>
                                <Button onClick={() => setPanel('doc')}
                                    className="bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25" data-testid="case-request-doc-btn">
                                    <FileSearch className="w-4 h-4 mr-1.5" /> Solicitar documentación
                                </Button>
                                <Button onClick={() => setPanel('note')}
                                    className="bg-slate-500/15 border border-slate-500/40 text-slate-300 hover:bg-slate-500/25" data-testid="case-note-btn">
                                    <StickyNote className="w-4 h-4 mr-1.5" /> Añadir nota interna
                                </Button>
                                <Button onClick={() => setPanel('reject')}
                                    className="bg-red-500/15 border border-red-500/40 text-red-300 hover:bg-red-500/25" data-testid="case-reject-btn">
                                    <XCircle className="w-4 h-4 mr-1.5" /> Rechazar solicitud
                                </Button>
                                <Button onClick={onClose} variant="outline"
                                    className="border-slate-700 text-slate-400 hover:text-white" data-testid="case-close-btn">
                                    Cerrar
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
