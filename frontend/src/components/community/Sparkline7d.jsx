/**
 * Sparkline7d — minimalist inline SVG line chart for the BBVA banking KPI cards.
 *
 * Renders a 7-point cumulative trend below a metric. No chart library — a single
 * <svg> with a polyline, a soft area-fill underneath, and a dot on the latest
 * value. Designed to read well at 80–120px wide on white cards.
 *
 * Props:
 *   • data        — array of { date: 'YYYY-MM-DD', tax_paid_eur: number }
 *   • color       — stroke + dot colour (defaults to BBVA blue #1E3A8A)
 *   • height      — px height (default 28)
 *   • width       — px width  (default 120)
 *   • testId      — optional data-testid
 */
export const Sparkline7d = ({
    data,
    color = '#1E3A8A',
    height = 28,
    width = 120,
    testId,
}) => {
    if (!data || data.length < 2) return null;

    const values = data.map((d) => Number(d?.tax_paid_eur) || 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    // Add a small vertical padding so the line never touches the edges
    const padY = 3;
    const innerH = height - padY * 2;
    const stepX = width / (values.length - 1);

    const points = values.map((v, i) => {
        const x = i * stepX;
        const y = padY + innerH - ((v - min) / range) * innerH;
        return [x, y];
    });

    const pathD = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    // Closed area path for the soft fill underneath the line
    const areaD = `${pathD} L ${width.toFixed(2)} ${height} L 0 ${height} Z`;
    const [lastX, lastY] = points[points.length - 1];

    const gradientId = `spark-grad-${color.replace('#', '')}`;

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            data-testid={testId}
            aria-hidden="true"
            className="block"
        >
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={areaD} fill={`url(#${gradientId})`} />
            <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* Subtle pulsing dot on the latest value */}
            <circle cx={lastX} cy={lastY} r="2.4" fill={color} />
            <circle cx={lastX} cy={lastY} r="4.2" fill={color} fillOpacity="0.18">
                <animate attributeName="r" values="3.4;5.6;3.4" dur="2.2s" repeatCount="indefinite" />
                <animate attributeName="fill-opacity" values="0.28;0;0.28" dur="2.2s" repeatCount="indefinite" />
            </circle>
        </svg>
    );
};
