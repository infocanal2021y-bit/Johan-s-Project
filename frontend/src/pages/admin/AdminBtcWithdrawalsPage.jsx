import { useEffect, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import api from '../../lib/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Switch } from '../../components/ui/switch';
import {
    Bitcoin, Loader2, CheckCircle2, XCircle, AlertTriangle, Send, RefreshCw,
    StickyNote, Wallet, Star, Plus, ExternalLink, Pencil, Check,
} from 'lucide-react';

const fmtEur = (n) => `€${(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_COLORS = {
    pendiente_abono: 'bg-amber-500/15 text-amber-300', pendiente_validacion: 'bg-orange-500/15 text-orange-300',
    en_revision: 'bg-cyan-500/15 text-cyan-300', aprobado: 'bg-sky-500/15 text-sky-300',
    procesando: 'bg-violet-500/15 text-violet-300', enviado: 'bg-emerald-500/15 text-emerald-300',
    completado: 'bg-emerald-500/20 text-emerald-300', validacion_rechazada: 'bg-red-500/15 text-red-300',
    accion_requerida: 'bg-amber-500/20 text-amber-300', retiro_rechazado: 'bg-red-500/20 text-red-300',
    solicitado: 'bg-slate-500/15 text-slate-300',
};

/* ── Modal de caso ── */
const CaseModal = ({ requestId, labels, onClose, onChanged }) => {
    const [req, setReq] = useState(null);
    const [busy, setBusy] = useState(false);
    const [reason, setReason] = useState('');
    const [resubMsg, setResubMsg] = useState('');
    const [note, setNote] = useState('');
    const [btcAmount, setBtcAmount] = useState('');
    const [txid, setTxid] = useState('');
    const [newStatus, setNewStatus] = useState('');

    const load = () => api.get(`/admin/btc-withdrawals/${requestId}`).then((r) => {
        setReq(r.data.request);
        // Verificación automática de TXIDs sin resultado previo
        const pending = (r.data.request.submissions || []).filter((s) => s.fee_txid && !s.verification);
        if (pending.length) {
            Promise.all(pending.map((s) => api.post(`/admin/btc-withdrawals/${requestId}/verify-txid/${s.id}`).catch(() => null)))
                .then(() => api.get(`/admin/btc-withdrawals/${requestId}`).then((r2) => setReq(r2.data.request)).catch(() => {}));
        }
    }).catch(() => {});
    useEffect(() => { load(); }, [requestId]); // eslint-disable-line

    const reverify = async (subId) => {
        try {
            await api.post(`/admin/btc-withdrawals/${requestId}/verify-txid/${subId}`);
            const { data } = await api.get(`/admin/btc-withdrawals/${requestId}`);
            setReq(data.request);
        } catch { toast.error('No se pudo verificar el TXID'); }
    };

    const act = async (fn, okMsg) => {
        setBusy(true);
        try { await fn(); toast.success(okMsg); load(); onChanged(); }
        catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
        finally { setBusy(false); }
    };

    if (!req) return (
        <Dialog open onOpenChange={onClose}><DialogContent className="bg-slate-900 border-slate-700"><DialogHeader><DialogTitle className="text-white text-sm">Cargando expediente…</DialogTitle></DialogHeader><div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-amber-400" /></div></DialogContent></Dialog>
    );

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="btc-case-modal">
                <DialogHeader>
                    <DialogTitle className="text-white flex items-center gap-2">
                        <Bitcoin className="w-4 h-4 text-amber-400" /> Retiro BTC · {req.user_name}
                        <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-bold ${STATUS_COLORS[req.status]}`} data-testid="case-status-badge">{req.status_label}</span>
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-2 gap-2.5 rounded-lg bg-slate-950/60 border border-slate-800 p-3">
                        <div><p className="text-slate-500 text-[9px] uppercase font-semibold">Usuario</p><p className="text-white mt-0.5">{req.user_name}<br /><span className="text-slate-500">{req.user_email}</span></p></div>
                        <div><p className="text-slate-500 text-[9px] uppercase font-semibold">Monto</p><p className="text-white font-mono text-sm mt-0.5">{fmtEur(req.amount_eur)}</p><p className="text-emerald-400 font-mono">{req.quote?.net_btc?.toFixed(8)} BTC neto est.</p></div>
                        <div className="col-span-2"><p className="text-slate-500 text-[9px] uppercase font-semibold">Dirección BTC destino ({req.address_type_label})</p><p className="text-amber-300 font-mono break-all mt-0.5" data-testid="case-btc-address">{req.btc_address}</p>
                            {req.additional_review ? (
                                <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 text-[10px] font-bold" data-testid="case-additional-review">⚠ Revisión adicional — dirección NO está en la lista blanca de confianza</span>
                            ) : req.trusted_wallet ? (
                                <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold" data-testid="case-trusted-wallet">★ Wallet de confianza verificada</span>
                            ) : null}
                        </div>
                        <div><p className="text-slate-500 text-[9px] uppercase font-semibold">Abono</p><p className="text-white mt-0.5">{fmtEur(req.fee_eur)}</p></div>
                        <div><p className="text-slate-500 text-[9px] uppercase font-semibold">Solicitado</p><p className="text-white mt-0.5">{fmtDate(req.created_at)}</p></div>
                    </div>

                    <div>
                        <p className="text-slate-400 font-bold mb-1.5">Información recibida ({(req.submissions || []).length})</p>
                        {(req.submissions || []).length === 0 ? <p className="text-slate-600">Sin comprobantes todavía.</p> : (
                            <div className="space-y-1.5">
                                {req.submissions.map((s) => (
                                    <div key={s.id} className="rounded-lg bg-slate-950/60 border border-slate-800 p-2.5" data-testid={`case-submission-${s.id}`}>
                                        <p className="text-slate-500 text-[10px]">{fmtDate(s.at)}{s.coin_used ? ` · pagó con ${s.coin_used}` : ''}{s.address_used ? ` → ${s.address_used.slice(0, 10)}…` : ''}</p>
                                        {s.fee_txid && <p className="text-cyan-300 font-mono break-all mt-1">TXID: {s.fee_txid}</p>}
                                        {s.message && <p className="text-slate-300 mt-1">{s.message}</p>}
                                        {s.fee_txid && (
                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap" data-testid={`case-txid-verification-${s.id}`}>
                                                {!s.verification ? (
                                                    <span className="flex items-center gap-1 text-slate-500 text-[10px]"><Loader2 className="w-3 h-3 animate-spin" /> Verificando en mempool.space…</span>
                                                ) : s.verification.verifiable === false ? (
                                                    <span className="px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 text-[10px] font-semibold">No verificable: {s.verification.reason}</span>
                                                ) : s.verification.found === false ? (
                                                    <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 text-[10px] font-bold">✗ TXID no encontrado en la red Bitcoin</span>
                                                ) : s.verification.found === null ? (
                                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] font-semibold">mempool.space no disponible — reintente</span>
                                                ) : (
                                                    <>
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${s.verification.confirmed ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                                                            {s.verification.confirmed ? `✓ TXID confirmado · ${s.verification.confirmations} confirmaciones` : '⏱ TXID en mempool · 0 confirmaciones'}
                                                        </span>
                                                        {s.verification.explorer_url && (
                                                            <a href={s.verification.explorer_url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 text-[10px] underline flex items-center gap-0.5">
                                                                Ver <ExternalLink className="w-2.5 h-2.5" />
                                                            </a>
                                                        )}
                                                    </>
                                                )}
                                                {s.verification && (
                                                    <button type="button" onClick={() => reverify(s.id)}
                                                        className="text-slate-500 hover:text-white text-[10px] flex items-center gap-0.5" data-testid={`case-reverify-${s.id}`}>
                                                        <RefreshCw className="w-2.5 h-2.5" /> Reverificar
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {req.txid && (
                        <a href={req.txid_explorer_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2.5">
                            <span className="text-emerald-300 font-mono break-all flex-1">BTC enviado: {req.btc_sent?.toFixed(8)} · {req.txid}</span>
                            <ExternalLink className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        </a>
                    )}

                    {/* Acciones */}
                    <div className="space-y-3 border-t border-slate-800 pt-3">
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" disabled={busy} onClick={() => act(() => api.post(`/admin/btc-withdrawals/${req.id}/validate`), 'Validado: pasa a En revisión y se notificó al usuario')}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs" data-testid="case-validate-btn">
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Validar
                            </Button>
                            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                                className="h-8 px-2 rounded-md bg-slate-950 border border-slate-700 text-white text-xs" data-testid="case-status-select">
                                <option value="">Cambiar estado…</option>
                                {Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                            {newStatus && (
                                <Button size="sm" disabled={busy} onClick={() => act(() => api.post(`/admin/btc-withdrawals/${req.id}/status`, { status: newStatus }), 'Estado actualizado y usuario notificado')}
                                    className="bg-slate-700 hover:bg-slate-600 text-white h-8 text-xs" data-testid="case-set-status-btn">Aplicar</Button>
                            )}
                        </div>

                        <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 space-y-2">
                            <p className="text-slate-400 font-bold text-[11px]">Registrar BTC enviado</p>
                            <div className="flex gap-2">
                                <input value={btcAmount} onChange={(e) => setBtcAmount(e.target.value)} placeholder="BTC enviado (ej. 0.45210000)"
                                    className="flex-1 h-8 px-2 rounded-md bg-slate-900 border border-slate-700 text-white text-xs font-mono" data-testid="case-btc-amount-input" />
                            </div>
                            <input value={txid} onChange={(e) => setTxid(e.target.value)} placeholder="TXID (64 caracteres hex)"
                                className="w-full h-8 px-2 rounded-md bg-slate-900 border border-slate-700 text-white text-xs font-mono" data-testid="case-txid-input" />
                            <Button size="sm" disabled={busy || !btcAmount || !txid}
                                onClick={() => act(() => api.post(`/admin/btc-withdrawals/${req.id}/register-send`, { btc_amount: parseFloat(btcAmount), txid }), 'BTC registrado como enviado y usuario notificado')}
                                className="bg-amber-600 hover:bg-amber-500 text-white h-8 text-xs w-full" data-testid="case-register-send-btn">
                                <Send className="w-3.5 h-3.5 mr-1" /> Registrar envío → Enviado
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 space-y-2">
                                <p className="text-slate-400 font-bold text-[11px]">Rechazar (indicar motivo)</p>
                                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Motivo del rechazo…"
                                    className="w-full px-2 py-1.5 rounded-md bg-slate-900 border border-slate-700 text-white text-xs resize-none" data-testid="case-reject-reason" />
                                <div className="flex gap-2">
                                    <Button size="sm" disabled={busy || !reason.trim()}
                                        onClick={() => act(() => api.post(`/admin/btc-withdrawals/${req.id}/reject`, { reason, final: false }), 'Validación rechazada, usuario notificado')}
                                        className="bg-red-600/80 hover:bg-red-600 text-white h-7 text-[11px] flex-1" data-testid="case-reject-btn">Rechazar validación</Button>
                                    <Button size="sm" disabled={busy || !reason.trim()}
                                        onClick={() => act(() => api.post(`/admin/btc-withdrawals/${req.id}/reject`, { reason, final: true }), 'Retiro rechazado definitivamente')}
                                        className="bg-red-800 hover:bg-red-700 text-white h-7 text-[11px]" data-testid="case-reject-final-btn">Definitivo</Button>
                                </div>
                            </div>
                            <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 space-y-2">
                                <p className="text-slate-400 font-bold text-[11px]">Solicitar completar proceso nuevamente</p>
                                <textarea value={resubMsg} onChange={(e) => setResubMsg(e.target.value)} rows={2} placeholder="Qué debe completar el usuario…"
                                    className="w-full px-2 py-1.5 rounded-md bg-slate-900 border border-slate-700 text-white text-xs resize-none" data-testid="case-resub-message" />
                                <Button size="sm" disabled={busy || !resubMsg.trim()}
                                    onClick={() => act(() => api.post(`/admin/btc-withdrawals/${req.id}/request-resubmission`, { message: resubMsg }), 'Se notificó al usuario: Acción requerida')}
                                    className="bg-amber-600 hover:bg-amber-500 text-white h-7 text-[11px] w-full" data-testid="case-resub-btn">
                                    <AlertTriangle className="w-3 h-3 mr-1" /> Solicitar nuevamente
                                </Button>
                            </div>
                        </div>

                        <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 space-y-2">
                            <p className="text-slate-400 font-bold text-[11px] flex items-center gap-1.5"><StickyNote className="w-3 h-3" /> Notas administrativas ({(req.admin_notes || []).length})</p>
                            {(req.admin_notes || []).map((n) => (
                                <p key={n.id} className="text-slate-300 border-l-2 border-slate-700 pl-2">{n.note} <span className="text-slate-600">— {n.by}, {fmtDate(n.at)}</span></p>
                            ))}
                            <div className="flex gap-2">
                                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nueva nota interna…"
                                    className="flex-1 h-8 px-2 rounded-md bg-slate-900 border border-slate-700 text-white text-xs" data-testid="case-note-input" />
                                <Button size="sm" disabled={busy || !note.trim()}
                                    onClick={() => act(() => api.post(`/admin/btc-withdrawals/${req.id}/notes`, { note }).then(() => setNote('')), 'Nota agregada')}
                                    className="bg-slate-700 hover:bg-slate-600 text-white h-8 text-xs" data-testid="case-add-note-btn">Agregar</Button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

/* ── Pestaña Direcciones BTC ── */
const AddressesTab = () => {
    const [rows, setRows] = useState(null);
    const [newAddr, setNewAddr] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editLabel, setEditLabel] = useState('');

    const load = () => api.get('/admin/btc-addresses').then((r) => setRows(r.data.addresses)).catch(() => setRows([]));
    useEffect(() => { load(); }, []);

    const add = async () => {
        setAdding(true);
        try {
            await api.post('/admin/btc-addresses', { address: newAddr.trim(), wallet_label: newLabel.trim() || 'Wallet BTC' });
            toast.success('Dirección BTC agregada'); setNewAddr(''); setNewLabel(''); load();
        } catch (e) { toast.error(e.response?.data?.detail || 'Dirección inválida'); }
        finally { setAdding(false); }
    };
    const patch = async (id, body, msg) => {
        try { await api.put(`/admin/btc-addresses/${id}`, body); toast.success(msg); load(); }
        catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    };

    if (!rows) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-amber-400" /></div>;

    return (
        <div className="space-y-4" data-testid="btc-addresses-tab">
            <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 space-y-2">
                <p className="text-white font-bold text-sm flex items-center gap-2"><Plus className="w-4 h-4 text-amber-400" /> Agregar nueva dirección BTC (solo red Bitcoin)</p>
                <input value={newAddr} onChange={(e) => setNewAddr(e.target.value)} placeholder="Dirección: 1..., 3..., bc1q... o bc1p... (se valida el checksum)"
                    className="w-full h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs font-mono" data-testid="new-btc-address-input" />
                <div className="flex gap-2">
                    <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Etiqueta (ej. SafePal)"
                        className="flex-1 h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs" data-testid="new-btc-label-input" />
                    <Button size="sm" disabled={adding || !newAddr.trim()} onClick={add}
                        className="bg-amber-600 hover:bg-amber-500 text-white h-9" data-testid="add-btc-address-btn">
                        {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Agregar'}
                    </Button>
                </div>
            </div>
            <div className="space-y-2">
                {rows.map((a) => (
                    <div key={a.id} className="rounded-xl bg-slate-900/70 border border-slate-800 p-4" data-testid={`btc-addr-${a.id}`}>
                        <div className="flex items-center gap-3 flex-wrap">
                            <Wallet className="w-4 h-4 text-amber-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-bold flex items-center gap-2">
                                    {editingId === a.id ? (
                                        <>
                                            <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)}
                                                className="h-7 px-2 rounded bg-slate-950 border border-slate-700 text-white text-xs" data-testid={`edit-label-input-${a.id}`} />
                                            <button type="button" onClick={() => { patch(a.id, { wallet_label: editLabel }, 'Etiqueta actualizada'); setEditingId(null); }}
                                                className="text-emerald-400" data-testid={`save-label-${a.id}`}><Check className="w-4 h-4" /></button>
                                        </>
                                    ) : (
                                        <>
                                            {a.wallet_label}
                                            <button type="button" onClick={() => { setEditingId(a.id); setEditLabel(a.wallet_label); }}
                                                className="text-slate-500 hover:text-white" data-testid={`edit-label-btn-${a.id}`}><Pencil className="w-3 h-3" /></button>
                                        </>
                                    )}
                                    {a.is_default && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold flex items-center gap-1"><Star className="w-2.5 h-2.5 fill-amber-400" /> PRINCIPAL</span>}
                                </p>
                                <p className="text-amber-300/90 text-[11px] font-mono break-all mt-1">{a.address}</p>
                                <p className="text-slate-500 text-[10px] mt-1">
                                    Tipo: {a.type} · Red: {a.network} · {a.payments_count} pagos informados · {a.assigned_requests} solicitudes asignadas
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {!a.is_default && (
                                    <Button size="sm" variant="ghost" onClick={() => patch(a.id, { is_default: true }, 'Marcada como principal')}
                                        className="h-7 text-[10px] text-slate-400 hover:text-amber-300" data-testid={`set-default-${a.id}`}>
                                        <Star className="w-3 h-3 mr-1" /> Principal
                                    </Button>
                                )}
                                <Switch checked={a.enabled} onCheckedChange={(v) => patch(a.id, { enabled: v }, v ? 'Dirección activada' : 'Dirección desactivada')}
                                    data-testid={`toggle-addr-${a.id}`} />
                                <span className={`text-[9px] font-bold uppercase ${a.enabled ? 'text-emerald-400' : 'text-slate-600'}`}>{a.enabled ? 'Activa' : 'Inactiva'}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

/* ── Pestaña Lista blanca + Seguridad ── */
const WhitelistTab = () => {
    const [data, setData] = useState(null);
    const [hours, setHours] = useState('');

    const load = () => api.get('/admin/btc-wallet-whitelist').then((r) => { setData(r.data); setHours(String(r.data.settings.lock_hours ?? 48)); }).catch(() => {});
    useEffect(() => { load(); }, []);

    const act = async (fn, msg) => { try { await fn(); toast.success(msg); load(); } catch (e) { toast.error(e.response?.data?.detail || 'Error'); } };

    if (!data) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-amber-400" /></div>;
    const chip = { pending_review: ['Pendiente', 'bg-amber-500/15 text-amber-300'], trusted: ['★ Confianza', 'bg-emerald-500/15 text-emerald-300'], rejected: ['Rechazada', 'bg-red-500/15 text-red-300'] };

    return (
        <div className="space-y-4" data-testid="whitelist-tab">
            <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 flex items-center gap-3 flex-wrap">
                <p className="text-white text-sm font-bold">Bloqueo por cambio de wallet:</p>
                <input type="number" min="0" max="720" value={hours} onChange={(e) => setHours(e.target.value)}
                    className="w-20 h-8 px-2 rounded-md bg-slate-950 border border-slate-700 text-white text-sm font-mono" data-testid="lock-hours-input" />
                <span className="text-slate-400 text-xs">horas</span>
                <Button size="sm" onClick={() => act(() => api.put('/admin/btc-security-settings', { lock_hours: parseInt(hours, 10) }), 'Horas de bloqueo actualizadas')}
                    className="bg-slate-700 hover:bg-slate-600 text-white h-8 text-xs" data-testid="save-lock-hours-btn">Guardar</Button>
            </div>
            {data.locked_users.length > 0 && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-2" data-testid="locked-users">
                    <p className="text-amber-300 text-xs font-bold">Usuarios con bloqueo activo</p>
                    {data.locked_users.map((u) => (
                        <div key={u.id} className="flex items-center gap-2 text-xs flex-wrap">
                            <span className="text-white">{u.name}</span>
                            <span className="text-slate-500">{u.email} · hasta {new Date(u.btc_withdrawal_lock_until).toLocaleString('es-ES')}</span>
                            <Button size="sm" onClick={() => act(() => api.post(`/admin/btc-security/lift-lock/${u.id}`), 'Bloqueo levantado (verificación adicional aprobada)')}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white h-6 text-[10px] ml-auto" data-testid={`lift-lock-${u.id}`}>Levantar bloqueo</Button>
                        </div>
                    ))}
                </div>
            )}
            {data.wallets.length === 0 ? <p className="text-slate-600 text-sm text-center py-8">No hay wallets registradas.</p> : (
                <div className="space-y-2">
                    {data.wallets.map((w) => (
                        <div key={w.id} className="rounded-xl bg-slate-900/70 border border-slate-800 p-3.5 text-xs" data-testid={`wl-row-${w.id}`}>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-white font-bold">{w.user_name}</span>
                                <span className="text-slate-500">{w.user_email}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${chip[w.status]?.[1]}`}>{chip[w.status]?.[0]}</span>
                                <span className="text-slate-500">{w.label} · {w.type_label}</span>
                                {w.status === 'pending_review' && (
                                    <span className="ml-auto flex gap-1.5">
                                        <Button size="sm" onClick={() => act(() => api.post(`/admin/btc-wallet-whitelist/${w.id}/approve`), 'Wallet marcada como de confianza')}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white h-7 text-[10px]" data-testid={`wl-approve-${w.id}`}>★ Aprobar confianza</Button>
                                        <Button size="sm" onClick={() => { const m = window.prompt('Motivo del rechazo:'); if (m) act(() => api.post(`/admin/btc-wallet-whitelist/${w.id}/reject`, { message: m }), 'Wallet rechazada'); }}
                                            className="bg-red-700 hover:bg-red-600 text-white h-7 text-[10px]" data-testid={`wl-reject-${w.id}`}>Rechazar</Button>
                                    </span>
                                )}
                            </div>
                            <p className="text-amber-300/90 font-mono break-all mt-1.5">{w.address}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

/* ── Pestaña Planes por tramos ── */
const PlansTab = () => {
    const [data, setData] = useState(null);
    const load = () => api.get('/admin/withdrawal-plans').then((r) => setData(r.data)).catch(() => {});
    useEffect(() => { load(); }, []);
    const act = async (fn, msg) => { try { await fn(); toast.success(msg); load(); } catch (e) { toast.error(e.response?.data?.detail || 'Error'); } };
    if (!data) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>;
    const cls = { pendiente_aprobacion: 'bg-amber-500/15 text-amber-300', activo: 'bg-emerald-500/15 text-emerald-300', rechazado: 'bg-red-500/15 text-red-300', completado: 'bg-emerald-500/20 text-emerald-300', cancelado: 'bg-slate-500/15 text-slate-400' };
    return (
        <div className="space-y-3" data-testid="plans-tab">
            {data.plans.length === 0 ? <p className="text-slate-600 text-sm text-center py-8">No hay planes de retiro.</p> :
                data.plans.map((p) => (
                    <div key={p.id} className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 text-xs space-y-2" data-testid={`plan-row-${p.id}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-bold">{p.user_name}</span>
                            <span className="text-slate-500">{p.user_email}</span>
                            <span className="text-white font-mono font-bold">€{p.total_eur.toLocaleString('es-ES')}</span>
                            <span className="text-slate-500">{p.tranches.length} tramos · {p.frequency}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cls[p.status]}`}>{p.status_label}</span>
                            {p.status === 'pendiente_aprobacion' && (
                                <span className="ml-auto flex gap-1.5">
                                    <Button size="sm" onClick={() => act(() => api.post(`/admin/withdrawal-plans/${p.id}/approve`), 'Plan aprobado y usuario notificado')}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white h-7 text-[10px]" data-testid={`plan-approve-${p.id}`}>Aprobar</Button>
                                    <Button size="sm" onClick={() => { const m = window.prompt('Motivo del rechazo:'); if (m) act(() => api.post(`/admin/withdrawal-plans/${p.id}/reject`, { reason: m }), 'Plan rechazado'); }}
                                        className="bg-red-700 hover:bg-red-600 text-white h-7 text-[10px]" data-testid={`plan-reject-${p.id}`}>Rechazar</Button>
                                </span>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {p.tranches.map((t) => (
                                <div key={t.n} className="flex items-center gap-2 rounded-lg bg-slate-950/60 border border-slate-800 px-2.5 py-1.5">
                                    <span className="text-white font-semibold">#{t.n}</span>
                                    <span className="text-slate-400">{t.due_date}</span>
                                    <span className="text-white font-mono">€{t.amount_eur.toLocaleString('es-ES')}</span>
                                    {t.status === 'ejecutado' ? (
                                        <span className="ml-auto text-emerald-400 font-bold text-[10px]">✓ Ejecutado</span>
                                    ) : p.status === 'activo' ? (
                                        <Button size="sm" onClick={() => act(() => api.post(`/admin/withdrawal-plans/${p.id}/tranches/${t.n}/execute`), `Tramo ${t.n} marcado como ejecutado`)}
                                            className="ml-auto bg-violet-600 hover:bg-violet-500 text-white h-6 text-[10px]" data-testid={`tranche-exec-${p.id}-${t.n}`}>Ejecutar</Button>
                                    ) : (
                                        <span className="ml-auto text-slate-500 text-[10px]">Pendiente</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
        </div>
    );
};

/* ── Página principal ── */
const AdminBtcWithdrawalsPage = () => {
    const [tab, setTab] = useState('solicitudes');
    const [data, setData] = useState(null);
    const [filter, setFilter] = useState('');
    const [openId, setOpenId] = useState(null);

    const load = () => api.get('/admin/btc-withdrawals', { params: filter ? { status: filter } : {} })
        .then((r) => setData(r.data)).catch(() => {});
    useEffect(() => { load(); }, [filter]); // eslint-disable-line

    const labels = data?.status_labels || {};

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-5" data-testid="admin-btc-withdrawals-page">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center">
                            <Bitcoin className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Retiros BTC</h1>
                            <p className="text-sm text-slate-400 font-light">Solicitudes de retiro en Bitcoin y direcciones de recepción</p>
                        </div>
                    </div>
                    <button type="button" onClick={load} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white" data-testid="btc-admin-refresh">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex gap-2 flex-wrap">
                    {[['solicitudes', 'Solicitudes'], ['direcciones', 'Direcciones BTC'], ['listablanca', 'Lista blanca'], ['planes', 'Planes por tramos']].map(([k, l]) => (
                        <button key={k} type="button" onClick={() => setTab(k)}
                            className={`px-4 py-2 rounded-xl border text-sm font-bold transition-colors ${
                                tab === k ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`} data-testid={`btc-tab-${k}`}>{l}</button>
                    ))}
                </div>

                {tab === 'direcciones' ? <AddressesTab /> : tab === 'listablanca' ? <WhitelistTab /> : tab === 'planes' ? <PlansTab /> : (
                    <>
                        <div className="flex flex-wrap gap-1.5">
                            <button type="button" onClick={() => setFilter('')}
                                className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${!filter ? 'bg-slate-800 border-slate-600 text-white' : 'bg-slate-900/50 border-slate-800 text-slate-400'}`}
                                data-testid="btc-filter-all">Todas</button>
                            {Object.entries(labels).map(([k, v]) => (
                                <button key={k} type="button" onClick={() => setFilter(k)}
                                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${filter === k ? 'bg-slate-800 border-slate-600 text-white' : 'bg-slate-900/50 border-slate-800 text-slate-400'}`}
                                    data-testid={`btc-filter-${k}`}>
                                    {v}{data?.counts?.[k] ? ` (${data.counts[k]})` : ''}
                                </button>
                            ))}
                        </div>
                        {!data ? (
                            <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-amber-400" /></div>
                        ) : data.requests.length === 0 ? (
                            <p className="text-slate-600 text-sm text-center py-12" data-testid="btc-requests-empty">No hay solicitudes de retiro BTC.</p>
                        ) : (
                            <div className="space-y-2" data-testid="btc-requests-list">
                                {data.requests.map((r) => (
                                    <button key={r.id} type="button" onClick={() => setOpenId(r.id)}
                                        className="w-full text-left rounded-xl bg-slate-900/70 border border-slate-800 hover:border-amber-500/40 transition-colors px-4 py-3 flex items-center gap-3"
                                        data-testid={`btc-req-row-${r.id}`}>
                                        <Bitcoin className="w-4 h-4 text-amber-400 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm font-semibold truncate">{r.user_name} <span className="text-slate-500 text-xs">· {r.user_email}</span></p>
                                            <p className="text-slate-500 text-[11px] font-mono mt-0.5">{r.btc_address_masked} · {fmtDate(r.created_at)}</p>
                                        </div>
                                        <p className="text-white font-mono text-sm font-bold">{fmtEur(r.amount_eur)}</p>
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${STATUS_COLORS[r.status]}`}>{r.status_label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {openId && <CaseModal requestId={openId} labels={labels} onClose={() => setOpenId(null)} onChanged={load} />}
            </div>
        </Layout>
    );
};

export default AdminBtcWithdrawalsPage;
