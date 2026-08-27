import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
    ShieldCheck, Zap, CheckCircle2, ArrowRight,
    Lock, Loader2, Pencil,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import api from '../../lib/api';

// =============================================================================
// WithdrawTypeSelector — BBVA Premium Banking two-option gate.
// =============================================================================
//
// Entry screen of the Withdraw flow. Shows two cards:
//
//   (A) Retiro parcial (40%)   fee €2.660
//   (B) Retiro total (100%)    fee €4.850
//
// UX:
//   • On click → dialog confirmation "Ha seleccionado retiro …"
//   • Once confirmed → POST /api/withdraw-type { type }
//   • The OTHER card visually locks (dimmed + Lock icon) but stays visible
//     so the user understands the option still exists globally.
//   • A discreet "Cambiar selección" button lets the user reset the choice.
// =============================================================================
export const WithdrawTypeSelector = ({ onSelected }) => {
    const [current, setCurrent] = useState(null);  // 'partial' | 'full' | null
    const [loading, setLoading] = useState(true);
    const [confirming, setConfirming] = useState(null); // pending choice during dialog
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancel = false;
        api.get('/withdraw-type')
            .then((r) => { if (!cancel) setCurrent(r.data.withdrawal_type || null); })
            .catch(() => {})
            .finally(() => { if (!cancel) setLoading(false); });
        return () => { cancel = true; };
    }, []);

    const selectType = async (type) => {
        setSaving(true);
        try {
            const r = await api.post('/withdraw-type', { type });
            setCurrent(r.data.withdrawal_type);
            setConfirming(null);
            toast.success(
                type === 'partial'
                    ? 'Ha seleccionado retiro parcial del 40%.'
                    : 'Ha seleccionado retiro total.'
            );
            if (onSelected) onSelected(type);
        } catch (e) {
            toast.error('No se pudo guardar la selección. Intente nuevamente.');
        } finally {
            setSaving(false);
        }
    };

    const resetSelection = async () => {
        setSaving(true);
        try {
            await api.post('/withdraw-type', { type: 'reset' });
            setCurrent(null);
            toast.info('Puede elegir el tipo de retiro nuevamente.');
        } catch (e) { /* silent */ }
        finally { setSaving(false); }
    };

    if (loading) {
        return (
            <div className="rounded-2xl bg-white border border-[#E5EAF0] p-8 flex items-center justify-center" data-testid="withdraw-type-selector-loading">
                <Loader2 className="w-5 h-5 text-[#1E3A8A] animate-spin" />
            </div>
        );
    }

    return (
        <div data-testid="withdraw-type-selector">
            {/* Section header */}
            <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1E3A8A] mb-1">
                        Lionsbit · Paso 1 de 2
                    </p>
                    <h2 className="text-xl font-semibold text-white" style={{ fontFamily: 'Poppins' }}>
                        Elija la modalidad de retiro
                    </h2>
                    <p className="text-slate-400 text-[13px] mt-1 max-w-2xl leading-relaxed">
                        Dos opciones claras y transparentes. Puede elegir entre un desbloqueo
                        parcial (40% del saldo) o un retiro total del 100%.
                        La otra opción quedará bloqueada durante este proceso.
                    </p>
                </div>
                {current && (
                    <button
                        type="button"
                        onClick={resetSelection}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-semibold text-[#1E3A8A] bg-white hover:bg-[#E6EEF9] border border-[#E5EAF0] transition-colors disabled:opacity-60"
                        data-testid="withdraw-type-reset-btn"
                    >
                        <Pencil className="w-3 h-3" />
                        Cambiar selección
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="withdraw-type-grid">
                <OptionCard
                    type="partial"
                    title="Desbloqueo de retiro parcial"
                    pct="40%"
                    subtitle="Hasta 40% del saldo disponible"
                    fee="€4.850"
                    benefits={[
                        'Activación rápida del saldo parcial',
                        'Mismo cargo de autorización',
                        'Ideal para retiros moderados',
                    ]}
                    accentColor="#1E3A8A"
                    accentSoft="#1E3A8A14"
                    icon={Zap}
                    selected={current === 'partial'}
                    locked={current === 'full'}
                    onPick={() => setConfirming('partial')}
                />
                <OptionCard
                    type="full"
                    title="Retiro total"
                    pct="100%"
                    subtitle="Acceso al 100% del saldo"
                    fee="€4.850"
                    benefits={[
                        'Acceso completo al 100% del saldo',
                        'Proceso en un solo paso',
                        'Recomendado para retiros grandes',
                    ]}
                    accentColor="#16A34A"
                    accentSoft="#16A34A14"
                    icon={ShieldCheck}
                    selected={current === 'full'}
                    locked={current === 'partial'}
                    onPick={() => setConfirming('full')}
                />
            </div>

            {/* Confirmation dialog */}
            <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
                <DialogContent
                    className="max-w-md bg-white border-[#E5EAF0]"
                    data-testid="withdraw-type-confirm-dialog"
                >
                    <DialogHeader>
                        <DialogTitle className="text-[#111827] flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-[#16A34A]" />
                            Confirme su selección
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-[#374151] text-sm leading-relaxed">
                        {confirming === 'partial' ? (
                            <>
                                Ha seleccionado <strong>retiro parcial del 40%</strong> con un Cargo de autorización y procesamiento del retiro de <strong className="font-mono tabular-nums">€4.850</strong>. La otra opción quedará bloqueada durante este proceso. Puede cambiarla más tarde si lo necesita.
                            </>
                        ) : (
                            <>
                                Ha seleccionado <strong>retiro total (100%)</strong> con un Cargo de autorización y procesamiento del retiro de <strong className="font-mono tabular-nums">€4.850</strong>. La otra opción quedará bloqueada durante este proceso. Puede cambiarla más tarde si lo necesita.
                            </>
                        )}
                    </p>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setConfirming(null)}
                            data-testid="withdraw-type-cancel-btn"
                            className="border-[#E5EAF0] text-[#6B7280] hover:bg-[#F4F6F8]"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={() => selectType(confirming)}
                            disabled={saving}
                            data-testid="withdraw-type-confirm-btn"
                            className="bg-[#1E3A8A] hover:bg-[#162d6b] text-white"
                        >
                            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                            Confirmar y continuar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};


const OptionCard = ({
    type, title, pct, subtitle, fee, benefits,
    accentColor, accentSoft, icon: Icon,
    selected, locked, onPick,
}) => {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            data-testid={`withdraw-type-card-${type}`}
            data-selected={selected ? 'true' : 'false'}
            data-locked={locked ? 'true' : 'false'}
            className={`relative rounded-[14px] bg-white overflow-hidden transition-all duration-200
                        shadow-[0_1px_3px_rgba(7,33,70,0.05),_0_8px_24px_rgba(7,33,70,0.06)]
                        ${selected ? 'ring-2' : ''}
                        ${locked ? 'opacity-55 grayscale-[0.4]' : 'hover:-translate-y-[1px] hover:shadow-[0_4px_18px_rgba(7,33,70,0.12)]'}`}
            style={selected ? { '--ring-col': accentColor, boxShadow: `0 0 0 2px ${accentColor}` } : undefined}
        >
            {/* Top accent strip */}
            <div className="h-[3px]" style={{ background: accentColor }} />

            {/* Locked overlay hint */}
            {locked && (
                <div className="absolute inset-0 bg-white/30 pointer-events-none flex items-center justify-center z-10">
                    <div className="bg-white border border-[#E5EAF0] px-3 py-1.5 rounded-full flex items-center gap-2 shadow-sm">
                        <Lock className="w-3.5 h-3.5 text-[#6B7280]" />
                        <span className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-[0.14em]">
                            Bloqueado · otra opción seleccionada
                        </span>
                    </div>
                </div>
            )}

            <div className="p-5">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: accentSoft }}
                        >
                            <Icon className="w-5 h-5" style={{ color: accentColor }} />
                        </div>
                        <div>
                            <p
                                className="text-[9px] font-bold uppercase tracking-[0.16em]"
                                style={{ color: accentColor }}
                            >
                                Modalidad {type === 'partial' ? 'parcial' : 'total'}
                            </p>
                            <h3
                                className="text-[15px] font-semibold text-[#111827] leading-tight mt-0.5"
                                style={{ fontFamily: 'Poppins' }}
                            >
                                {title}
                            </h3>
                        </div>
                    </div>
                    <span
                        className="text-[22px] font-mono tabular-nums font-bold leading-none flex-shrink-0"
                        style={{ color: accentColor, letterSpacing: '-0.02em' }}
                    >
                        {pct}
                    </span>
                </div>

                {/* Subtitle */}
                <p className="text-[12px] text-[#6B7280] mb-4">{subtitle}</p>

                {/* Benefits */}
                <ul className="space-y-1.5 mb-4">
                    {benefits.map((b) => (
                        <li key={b} className="flex items-start gap-2 text-[12px] text-[#374151]">
                            <CheckCircle2
                                className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                                style={{ color: accentColor }}
                            />
                            <span>{b}</span>
                        </li>
                    ))}
                </ul>

                {/* Fee pill */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-[#F4F6F8] mb-4">
                    <div>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">Coste</p>
                        <p
                            className="text-[17px] font-semibold font-mono tabular-nums mt-0.5"
                            style={{ color: accentColor }}
                        >
                            {fee}
                        </p>
                    </div>
                    <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider font-semibold">
                        Pago único
                    </span>
                </div>

                {/* CTA */}
                {selected ? (
                    <div
                        className="w-full flex items-center justify-center gap-2 h-10 rounded-lg text-[12px] font-semibold"
                        style={{ background: accentSoft, color: accentColor }}
                        data-testid={`withdraw-type-card-${type}-selected-badge`}
                    >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Opción seleccionada
                    </div>
                ) : (
                    <Button
                        type="button"
                        disabled={locked}
                        onClick={onPick}
                        className="w-full h-10 text-white font-semibold shadow-sm transition-colors"
                        style={{
                            background: locked ? '#9CA3AF' : accentColor,
                        }}
                        data-testid={`withdraw-type-card-${type}-btn`}
                    >
                        Elegir esta opción
                        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                )}
            </div>
        </motion.div>
    );
};
