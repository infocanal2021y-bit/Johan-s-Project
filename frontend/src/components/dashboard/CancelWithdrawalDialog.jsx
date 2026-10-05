import { useState } from 'react';
import { Loader2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import api from '../../lib/api';

const REASONS = [
    'Datos bancarios incorrectos',
    'Solicitud duplicada',
    'Petición del cliente',
    'Verificación pendiente',
    'Otro',
];

export const CancelWithdrawalDialog = ({ item, open, onClose, onCancelled }) => {
    const [reason, setReason] = useState(REASONS[0]);
    const [detail, setDetail] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const fullReason = reason === 'Otro' ? detail.trim() : (detail.trim() ? `${reason}: ${detail.trim()}` : reason);
    const canSubmit = fullReason.length >= 3 && !busy;

    const submit = async () => {
        if (!canSubmit) return;
        setBusy(true); setError('');
        try {
            await api.post(`/admin/recent-withdrawals/${item.withdrawal_id}/cancel`, { reason: fullReason });
            onCancelled();
            onClose();
            setDetail(''); setReason(REASONS[0]);
        } catch (e) {
            setError(e?.response?.data?.detail || 'No se pudo cancelar el retiro');
        } finally { setBusy(false); }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
            <DialogContent className="bg-slate-950 border-slate-800 text-white sm:max-w-md" data-testid="rw-cancel-dialog">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-white">
                        <XCircle className="w-5 h-5 text-red-400" /> Cancelar solicitud de retiro
                    </DialogTitle>
                    <DialogDescription className="text-slate-400 text-xs">
                        {item?.name_full} · <span className="font-mono">{item?.reference}</span>. Esta acción es definitiva y el usuario será notificado.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div>
                        <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500 font-semibold mb-1.5">Motivo de cancelación</p>
                        <div className="flex flex-wrap gap-1.5">
                            {REASONS.map((r) => (
                                <button key={r} type="button" onClick={() => setReason(r)}
                                    className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-colors ${
                                        reason === r
                                            ? 'bg-red-500/15 border-red-500/50 text-red-300'
                                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
                                    }`}
                                    data-testid={`rw-cancel-reason-${r.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>
                    <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3}
                        placeholder={reason === 'Otro' ? 'Describe el motivo (obligatorio)...' : 'Detalle adicional (opcional)...'}
                        className="bg-slate-900 border-slate-800 text-white text-sm placeholder:text-slate-600 resize-none"
                        data-testid="rw-cancel-detail-input" />
                    {error && <p className="text-xs text-red-400" data-testid="rw-cancel-error">{error}</p>}
                    <div className="flex justify-end gap-2 pt-1">
                        <button type="button" onClick={onClose} disabled={busy}
                            className="px-3 py-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 text-xs font-semibold hover:text-white transition-colors"
                            data-testid="rw-cancel-dismiss-btn">
                            Volver
                        </button>
                        <button type="button" onClick={submit} disabled={!canSubmit}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-200 text-xs font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            data-testid="rw-cancel-confirm-btn">
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                            Confirmar cancelación
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
