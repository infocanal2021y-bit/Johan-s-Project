import { useEffect, useState } from 'react';

// Animated number counter — counts up from 0 to value over `duration` ms
export const AnimatedCounter = ({ value = 0, duration = 1400, prefix = '€', testid }) => {
    const [n, setN] = useState(0);
    useEffect(() => {
        if (!value) return;
        let start;
        let frame;
        const step = (ts) => {
            if (!start) start = ts;
            const t = Math.min(1, (ts - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            setN(value * eased);
            if (t < 1) frame = requestAnimationFrame(step);
            else setN(value);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [value, duration]);
    return (
        <span className="font-mono tabular-nums" data-testid={testid}>
            {prefix}{n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </span>
    );
};
