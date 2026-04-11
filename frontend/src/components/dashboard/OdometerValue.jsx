import { useEffect, useState, useRef } from 'react';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const SlotDigit = ({ digit, delay = 0, duration = 1.2 }) => {
    const [currentDigit, setCurrentDigit] = useState(0);
    const [animated, setAnimated] = useState(false);
    const colRef = useRef(null);

    useEffect(() => {
        const num = parseInt(digit, 10);
        if (isNaN(num)) return;
        const timer = setTimeout(() => {
            setCurrentDigit(num);
            setAnimated(true);
        }, delay);
        return () => clearTimeout(timer);
    }, [digit, delay]);

    return (
        <span
            className="inline-block overflow-hidden relative"
            style={{ height: '1em', width: '0.62em' }}
        >
            <span
                ref={colRef}
                className="inline-flex flex-col"
                style={{
                    transform: `translateY(-${currentDigit * 10}%)`,
                    transition: animated
                        ? `transform ${duration}s cubic-bezier(0.16, 1, 0.3, 1)`
                        : 'none',
                }}
            >
                {DIGITS.map((d) => (
                    <span
                        key={d}
                        className="block text-center"
                        style={{ height: '1em', lineHeight: '1em' }}
                    >
                        {d}
                    </span>
                ))}
            </span>
        </span>
    );
};

const StaticChar = ({ char, delay = 0 }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setVisible(true), delay);
        return () => clearTimeout(timer);
    }, [delay]);

    return (
        <span
            className="inline-block transition-opacity"
            style={{
                opacity: visible ? 1 : 0,
                transitionDuration: '0.4s',
                width: char === ',' ? '0.35em' : char === '.' ? '0.3em' : char === ' ' ? '0.25em' : undefined,
            }}
        >
            {char}
        </span>
    );
};

export const OdometerValue = ({ value, className = '', staggerMs = 60, duration = 1.2 }) => {
    const chars = value.split('');

    let digitIndex = 0;
    return (
        <span className={`inline-flex items-baseline ${className}`} aria-label={value}>
            {chars.map((char, i) => {
                const isDigit = /\d/.test(char);
                if (isDigit) {
                    const idx = digitIndex++;
                    return (
                        <SlotDigit
                            key={`${i}-${char}`}
                            digit={char}
                            delay={idx * staggerMs + 200}
                            duration={duration}
                        />
                    );
                }
                return (
                    <StaticChar
                        key={`${i}-${char}`}
                        char={char}
                        delay={150}
                    />
                );
            })}
        </span>
    );
};
