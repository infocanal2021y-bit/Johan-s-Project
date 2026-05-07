import { forwardRef, useState, useRef } from 'react';
import { Button } from '../ui/button';
import { Loader2, Check } from 'lucide-react';

/**
 * Drop-in replacement for <Button> with built-in double-click protection.
 *
 * - While onClick (which can be async) is pending, the button is disabled and shows a spinner.
 * - Optional `confirmedFlash` prop shows a green checkmark for 1.2s after success.
 * - `lockMs` (default 600) ensures even sync onClicks can't be re-triggered too quickly.
 *
 * Usage:
 *   <SafeButton onClick={async () => await handleDebit()} confirmedFlash>
 *     Confirmar débito
 *   </SafeButton>
 */
export const SafeButton = forwardRef(function SafeButton(
    { children, onClick, disabled, confirmedFlash = false, lockMs = 600, loadingLabel = null, className = '', ...rest },
    ref
) {
    const [busy, setBusy] = useState(false);
    const [flashed, setFlashed] = useState(false);
    const lockUntil = useRef(0);

    const handleClick = async (e) => {
        // Hard guard against accidental double clicks (sync re-trigger)
        const now = Date.now();
        if (busy || now < lockUntil.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        lockUntil.current = now + lockMs;

        if (typeof onClick !== 'function') return;
        setBusy(true);
        try {
            const result = await onClick(e);
            if (confirmedFlash && result !== false) {
                setFlashed(true);
                setTimeout(() => setFlashed(false), 1200);
            }
        } catch (err) {
            // Let parent's catch handle it; we only manage UI state
            // eslint-disable-next-line no-console
            console.error('[SafeButton] onClick threw', err);
        } finally {
            setBusy(false);
        }
    };

    const isDisabled = disabled || busy;

    return (
        <Button
            ref={ref}
            onClick={handleClick}
            disabled={isDisabled}
            aria-busy={busy}
            data-flashed={flashed ? 'true' : undefined}
            className={`relative ${className} ${flashed ? 'ring-2 ring-emerald-400 transition-all' : ''}`}
            {...rest}
        >
            {busy ? (
                <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {loadingLabel || 'Procesando...'}
                </span>
            ) : flashed ? (
                <span className="inline-flex items-center gap-2 text-emerald-300">
                    <Check className="w-4 h-4" />
                    Guardado
                </span>
            ) : (
                children
            )}
        </Button>
    );
});

export default SafeButton;
