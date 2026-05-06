import { useEffect } from 'react';
import { toast } from 'sonner';
import { Clock } from 'lucide-react';
import api from '../lib/api';
import { consumeJourneyToastSlot } from './dashboard/IncompleteWithdrawBanner';

// =============================================================================
// JourneyToastNotifier — fires ONE in-app toast per session if the user has
// an incomplete withdrawal journey. Mounted globally inside Layout.
//
// • Pings GET /api/withdraw/journey-status once at mount.
// • If status === 'incomplete' AND the per-session slot is still free,
//   shows a calm BBVA-style toast with a "Ver detalle" action.
// • Records `notification_shown` for analytics.
// • Auto-dismisses on any user interaction (sonner default behaviour).
// =============================================================================
export const JourneyToastNotifier = () => {
    useEffect(() => {
        let cancelled = false;
        const id = setTimeout(() => {
            if (cancelled) return;
            api.get('/withdraw/journey-status').then((r) => {
                if (cancelled || r?.data?.status !== 'incomplete') return;
                if (!consumeJourneyToastSlot()) return;

                api.post('/withdraw/journey-status/event', {
                    event: 'notification_shown',
                }).catch(() => {});

                const t = toast.message('Solicitud de retiro pendiente', {
                    description:
                        'Tiene un proceso iniciado. Puede continuar desde su panel cuando guste.',
                    icon: <Clock className="w-4 h-4 text-amber-500" />,
                    duration: 8000,
                    action: {
                        label: 'Ir al retiro',
                        onClick: () => {
                            try { window.location.assign('/withdraw'); } catch (e) {}
                        },
                    },
                });
                // Sonner returns nothing usable here; reference t to keep eslint quiet
                void t;
            }).catch(() => {});
        }, 1800); // small delay so the dashboard renders first

        return () => { cancelled = true; clearTimeout(id); };
    }, []);

    return null;
};
