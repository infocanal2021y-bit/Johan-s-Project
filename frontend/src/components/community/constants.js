import { BadgeCheck, Crown, Flame, ShieldCheck, Receipt, FileCheck, Truck, Trophy } from 'lucide-react';

// =============================================================================
// BBVA PREMIUM BANKING — LIGHT THEME PALETTES
// All community surfaces sit on white cards over a navy app background.
// Colours follow the spec:
//   • Texto principal ........ #111827
//   • Texto secundario ....... #6B7280
//   • Verde éxito ............ #16A34A
//   • Azul acento ............ #1E3A8A
// =============================================================================

// Account-level status badges (Activo, En revisión, etc.) — pill style, light bg.
export const STATUS_LABELS = {
    activo: {
        label: 'Activo',
        cls: 'bg-[#16A34A]/10 text-[#16A34A] border-[#16A34A]/30',
        dot: 'bg-[#16A34A]',
    },
    en_revision: {
        label: 'En revisión',
        cls: 'bg-[#F59E0B]/10 text-[#B45309] border-[#F59E0B]/30',
        dot: 'bg-[#F59E0B]',
    },
    retiro_pendiente: {
        label: 'Retiro pendiente',
        cls: 'bg-[#1E3A8A]/10 text-[#1E3A8A] border-[#1E3A8A]/30',
        dot: 'bg-[#1E3A8A]',
    },
    completado: {
        label: 'Retirado',
        cls: 'bg-[#16A34A]/10 text-[#16A34A] border-[#16A34A]/30',
        dot: 'bg-[#16A34A]',
    },
};

// Compliance / achievement badges that float on top of member cards.
export const BADGE_DEFS = {
    verified: {
        label: 'Verificado',
        icon: BadgeCheck,
        cls: 'border-[#1E3A8A]/30 text-[#1E3A8A] bg-[#1E3A8A]/[0.06]',
    },
    withdrawal_processed: {
        label: 'Retiro Procesado',
        icon: ShieldCheck,
        cls: 'border-[#16A34A]/30 text-[#16A34A] bg-[#16A34A]/[0.06]',
    },
    capital_recovered: {
        label: 'Capital recuperado',
        icon: ShieldCheck,
        cls: 'border-[#16A34A]/30 text-[#16A34A] bg-[#16A34A]/[0.06]',
    },
    premium: {
        label: 'Premium',
        icon: Crown,
        cls: 'border-[#F59E0B]/30 text-[#B45309] bg-[#F59E0B]/[0.07]',
    },
    high_priority: {
        label: 'Prioritario',
        icon: Flame,
        cls: 'border-[#DC2626]/30 text-[#DC2626] bg-[#DC2626]/[0.06]',
    },
};

// Verification timeline — order is canonical:
//   Verificación → Impuesto → Revisión → Transferencia → Retirado
export const PROGRESS_STAGES = [
    { key: 1, label: 'Verificación',  icon: ShieldCheck },
    { key: 2, label: 'Impuesto',      icon: Receipt },
    { key: 3, label: 'Revisión',      icon: FileCheck },
    { key: 4, label: 'Transferencia', icon: Truck },
    { key: 5, label: 'Retirado',      icon: Trophy },
];

// Unified BBVA palette for the timeline. The same colours are reused across
// MemberCard, ProgressBar, and RecentWithdrawalsFeed so the institutional look
// stays consistent everywhere.
export const TIMELINE_PALETTE = {
    // Stage already completed before the current one (filled blue)
    done: {
        circle: 'bg-[#1E3A8A] border-[#1E3A8A]',
        icon: 'text-white',
        label: 'text-[#1E3A8A]',
        line: '#1E3A8A',
    },
    // Current stage in progress (white circle, blue ring)
    current: {
        circle: 'bg-white border-[#1E3A8A] ring-2 ring-[#1E3A8A]/20',
        icon: 'text-[#1E3A8A]',
        label: 'text-[#1E3A8A]',
    },
    // Stage not yet reached
    pending: {
        circle: 'bg-[#F1F4F8] border-[#E5EAF0]',
        icon: 'text-[#9CA3AF]',
        label: 'text-[#9CA3AF]',
        line: '#E5EAF0',
    },
    // Whole journey finished (estado = retirado / completado) → switch to green
    allDone: {
        circle: 'bg-[#16A34A] border-[#16A34A]',
        icon: 'text-white',
        label: 'text-[#16A34A]',
        line: '#16A34A',
    },
};

// European banking number format: € 39.813,03
export const fmtEUR = (n) =>
    `€${(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
