import { useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';


/**
 * Animated 0-100 ring with gradient stroke. Auto-counts up on mount.
 *
 * Props:
 *   - score: 0-100 number
 *   - color: hex string (matches the score band)
 *   - label: 'Excelente' | 'Bueno' | 'Atención' | 'Crítico'
 *   - size?: 'sm' | 'md' | 'lg'  (default 'md')
 *   - subtitle?: string  (small text under the number)
 */
export const HealthScoreRing = ({ score = 0, color = '#10b981', label = '', size = 'md', subtitle, showNumber = true }) => {
    const sizes = {
        sm: { d: 64, stroke: 5, fontSize: 'text-lg', labelSize: 'text-[8.5px]', subSize: 'text-[8px]' },
        md: { d: 96, stroke: 7, fontSize: 'text-2xl', labelSize: 'text-[9.5px]', subSize: 'text-[9px]' },
        lg: { d: 128, stroke: 9, fontSize: 'text-3xl', labelSize: 'text-[10px]', subSize: 'text-[10px]' },
    };
    const { d, stroke, fontSize, labelSize, subSize } = sizes[size] || sizes.md;
    const radius = (d - stroke) / 2;
    const circumference = 2 * Math.PI * radius;

    const motionValue = useMotionValue(0);
    const rounded = useTransform(motionValue, (v) => Math.round(v));
    const [displayed, setDisplayed] = useState(0);
    const [dash, setDash] = useState(circumference);

    useEffect(() => {
        const controls = animate(motionValue, score, {
            duration: 1.4,
            ease: [0.16, 1, 0.3, 1],
            onUpdate: (v) => {
                setDisplayed(Math.round(v));
                setDash(circumference - (v / 100) * circumference);
            },
        });
        return () => controls.stop();
    }, [score, motionValue, circumference]);

    const gradId = `hs-grad-${color.replace('#', '')}`;

    return (
        <div
            className="relative inline-flex items-center justify-center"
            style={{ width: d, height: d }}
            data-testid="health-score-ring"
        >
            <svg width={d} height={d} className="transform -rotate-90">
                <defs>
                    <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={color} stopOpacity="0.5" />
                        <stop offset="100%" stopColor={color} stopOpacity="1" />
                    </linearGradient>
                </defs>
                {/* Track */}
                <circle
                    cx={d / 2}
                    cy={d / 2}
                    r={radius}
                    fill="none"
                    stroke="rgba(148,163,184,0.12)"
                    strokeWidth={stroke}
                />
                {/* Progress */}
                <circle
                    cx={d / 2}
                    cy={d / 2}
                    r={radius}
                    fill="none"
                    stroke={`url(#${gradId})`}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dash}
                    style={{
                        filter: `drop-shadow(0 0 8px ${color}55)`,
                        transition: 'stroke-dashoffset 0.05s linear',
                    }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                {showNumber && (
                    <>
                        <motion.span className={`${fontSize} font-bold tabular-nums leading-none`} style={{ color }} data-testid="health-score-value">
                            {displayed}
                        </motion.span>
                        <span className={`${labelSize} font-bold uppercase tracking-wider mt-0.5`} style={{ color }}>
                            {label || '\u00A0'}
                        </span>
                        {subtitle && (
                            <span className={`${subSize} text-slate-500 mt-0.5`}>{subtitle}</span>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};


export default HealthScoreRing;
