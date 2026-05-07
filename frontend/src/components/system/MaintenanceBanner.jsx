import { useEffect, useState } from 'react';
import { AlertOctagon } from 'lucide-react';
import { probeHealth } from '../../lib/diagnostics';

/**
 * Site-wide maintenance banner.
 * Reads /api/health/full every 60s. When `maintenance.enabled === true`,
 * shows a sticky amber banner above all content.
 */
export const MaintenanceBanner = () => {
    const [maint, setMaint] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const check = async () => {
            const r = await probeHealth({ full: true, timeoutMs: 5000 });
            if (cancelled) return;
            const m = r.ok ? r.data?.maintenance : null;
            setMaint(m && m.enabled ? m : null);
        };
        check();
        const id = setInterval(check, 60000);
        return () => { cancelled = true; clearInterval(id); };
    }, []);

    if (!maint || !maint.enabled) return null;

    return (
        <div
            className="sticky top-0 z-[9999] w-full bg-amber-500/15 border-b border-amber-500/40 backdrop-blur-md"
            data-testid="maintenance-banner"
            role="alert"
        >
            <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3 text-amber-200">
                <AlertOctagon className="w-4 h-4 flex-shrink-0 animate-pulse" />
                <p className="text-xs sm:text-sm font-medium flex-1">
                    <span className="font-bold uppercase tracking-wider mr-2">Mantenimiento:</span>
                    {maint.message}
                    {maint.estimated_end && (
                        <span className="text-amber-300/70 ml-2">· Estimado: {maint.estimated_end}</span>
                    )}
                </p>
            </div>
        </div>
    );
};

export default MaintenanceBanner;
