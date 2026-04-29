import { BadgeCheck, Crown, Flame, ShieldCheck, Receipt, FileCheck, Truck, Trophy } from 'lucide-react';

export const STATUS_LABELS = {
    activo:           { label: 'Activo',            cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
    en_revision:      { label: 'En revisión',       cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',         dot: 'bg-amber-400'   },
    retiro_pendiente: { label: 'Retiro pendiente',  cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',         dot: 'bg-amber-400'   },
    completado:       { label: 'Retirado',          cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',   dot: 'bg-emerald-400' },
};

export const BADGE_DEFS = {
    verified:             { label: 'Verificado',     icon: BadgeCheck,  cls: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/[0.07]' },
    withdrawal_processed: { label: 'Retiro Procesado', icon: ShieldCheck, cls: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/[0.07]' },
    premium:              { label: 'Premium',        icon: Crown,       cls: 'border-amber-500/40 text-amber-300 bg-amber-500/[0.07]' },
    high_priority:        { label: 'Prioritario',    icon: Flame,       cls: 'border-rose-500/40 text-rose-300 bg-rose-500/[0.07]' },
};

export const PROGRESS_STAGES = [
    { key: 1, label: 'Verificación', icon: ShieldCheck, palette: {
        doneRing: 'border-sky-500 bg-sky-500/20', doneIcon: 'text-sky-300', doneLabel: 'text-sky-300/90',
        currentRing: 'bg-sky-500/15 border-sky-400 ring-2 ring-sky-400/30', currentIcon: 'text-sky-300', currentLabel: 'text-sky-300',
        line: 'bg-sky-500/70', dot: 'bg-sky-400', clockIconCls: 'text-slate-900',
    }},
    { key: 2, label: 'Impuesto', icon: Receipt, palette: {
        doneRing: 'border-amber-500 bg-amber-500/20', doneIcon: 'text-amber-300', doneLabel: 'text-amber-300/90',
        currentRing: 'bg-amber-500/15 border-amber-400 ring-2 ring-amber-400/30', currentIcon: 'text-amber-300', currentLabel: 'text-amber-300',
        line: 'bg-amber-500/70', dot: 'bg-amber-400', clockIconCls: 'text-slate-900',
    }},
    { key: 3, label: 'Revisión', icon: FileCheck, palette: {
        doneRing: 'border-violet-500 bg-violet-500/20', doneIcon: 'text-violet-300', doneLabel: 'text-violet-300/90',
        currentRing: 'bg-violet-500/15 border-violet-400 ring-2 ring-violet-400/30', currentIcon: 'text-violet-300', currentLabel: 'text-violet-300',
        line: 'bg-violet-500/70', dot: 'bg-violet-400', clockIconCls: 'text-slate-900',
    }},
    { key: 4, label: 'Transferencia', icon: Truck, palette: {
        doneRing: 'border-cyan-500 bg-cyan-500/20', doneIcon: 'text-cyan-300', doneLabel: 'text-cyan-300/90',
        currentRing: 'bg-cyan-500/15 border-cyan-400 ring-2 ring-cyan-400/30', currentIcon: 'text-cyan-300', currentLabel: 'text-cyan-300',
        line: 'bg-cyan-500/70', dot: 'bg-cyan-400', clockIconCls: 'text-slate-900',
    }},
    { key: 5, label: 'Retirado', icon: Trophy, palette: {
        doneRing: 'border-emerald-500 bg-emerald-500/20', doneIcon: 'text-emerald-300', doneLabel: 'text-emerald-300/90',
        currentRing: 'bg-emerald-500/15 border-emerald-400 ring-2 ring-emerald-400/30', currentIcon: 'text-emerald-300', currentLabel: 'text-emerald-300',
        line: 'bg-emerald-500/70', dot: 'bg-emerald-400', clockIconCls: 'text-slate-900',
    }},
];

export const fmtEUR = (n) => `€${(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const timeAgo = (iso) => {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.max(1, Math.floor(ms / 60000));
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    return `hace ${d} d`;
};
