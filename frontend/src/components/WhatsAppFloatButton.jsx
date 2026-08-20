import { useState } from 'react';

const WA_URL = 'https://wa.me/447400757168';

export const WhatsAppFloatButton = () => {
    const [hover, setHover] = useState(false);
    return (
        <a
            href={WA_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="whatsapp-float-btn"
            aria-label="Soporte por WhatsApp"
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            className="fixed bottom-5 right-5 z-[60] flex items-center gap-2.5 rounded-full bg-[#25D366] shadow-[0_8px_24px_rgba(37,211,102,0.45)]
                       hover:shadow-[0_10px_30px_rgba(37,211,102,0.6)] transition-shadow duration-300 group"
            style={{ padding: hover ? '12px 20px 12px 14px' : '13px' }}
        >
            <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-20 pointer-events-none" />
            <svg viewBox="0 0 32 32" width="28" height="28" fill="white" className="relative flex-shrink-0">
                <path d="M16 .667C7.54.667.667 7.54.667 16c0 2.706.71 5.346 2.057 7.667L.667 31.333l7.87-2.023A15.26 15.26 0 0 0 16 31.333c8.46 0 15.333-6.873 15.333-15.333S24.46.667 16 .667zm0 28.11a12.7 12.7 0 0 1-6.48-1.77l-.464-.276-4.67 1.2 1.247-4.553-.303-.483A12.72 12.72 0 0 1 3.222 16C3.222 8.953 8.953 3.222 16 3.222S28.778 8.953 28.778 16 23.047 28.778 16 28.778zm7.01-9.55c-.384-.192-2.272-1.12-2.624-1.248-.352-.128-.608-.192-.864.192s-.992 1.248-1.216 1.504c-.224.256-.448.288-.832.096-.384-.192-1.622-.598-3.09-1.906-1.142-1.018-1.913-2.276-2.137-2.66-.224-.384-.024-.592.168-.783.173-.172.384-.448.577-.672.192-.224.256-.384.384-.64.128-.256.064-.48-.032-.672-.096-.192-.864-2.08-1.184-2.848-.312-.748-.63-.647-.864-.66l-.736-.012c-.256 0-.672.096-1.024.48-.352.384-1.344 1.312-1.344 3.2s1.376 3.712 1.568 3.968c.192.256 2.708 4.134 6.56 5.798.916.396 1.632.632 2.19.81.92.292 1.758.25 2.42.152.738-.11 2.272-.928 2.592-1.824.32-.896.32-1.664.224-1.824-.096-.16-.352-.256-.736-.448z" />
            </svg>
            {hover && (
                <span className="relative text-white text-sm font-semibold whitespace-nowrap">
                    WhatsApp · +44 7400 757168
                </span>
            )}
        </a>
    );
};
