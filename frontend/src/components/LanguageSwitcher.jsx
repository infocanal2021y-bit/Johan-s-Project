import { useEffect, useRef, useState } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

// =============================================================================
// LanguageSwitcher — compact dropdown shown in the sidebar footer / topbar.
// Variant 'sidebar': dark BBVA-friendly style (used inside Sidebar.jsx).
// Variant 'inline':  generic light style for any other surface.
// =============================================================================
export const LanguageSwitcher = ({ variant = 'sidebar' }) => {
    const { lang, setLang, languages } = useLanguage();
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);

    useEffect(() => {
        const onClickOutside = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

    const current = languages.find((l) => l.code === lang) || languages[0];

    const isSidebar = variant === 'sidebar';
    const triggerCls = isSidebar
        ? 'w-full flex items-center gap-2 px-3 h-9 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-slate-200 text-[12px] font-semibold border border-slate-700/60 transition-colors'
        : 'inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-white hover:bg-[#F4F6F8] text-[#111827] text-[12px] font-semibold border border-[#E5EAF0] transition-colors';
    const menuCls = isSidebar
        ? 'absolute bottom-full left-0 right-0 mb-2 rounded-lg bg-slate-900 border border-slate-700/60 shadow-2xl overflow-hidden z-30'
        : 'absolute top-full right-0 mt-2 rounded-lg bg-white border border-[#E5EAF0] shadow-xl overflow-hidden z-30 min-w-[160px]';
    const itemCls = isSidebar
        ? 'w-full flex items-center justify-between gap-3 px-3 py-2 text-slate-200 hover:bg-slate-800 text-[12px] transition-colors text-left'
        : 'w-full flex items-center justify-between gap-3 px-3 py-2 text-[#111827] hover:bg-[#F4F6F8] text-[12px] transition-colors text-left';

    return (
        <div ref={wrapRef} className="relative" data-testid="language-switcher" data-active-lang={lang}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={triggerCls}
                aria-haspopup="menu"
                aria-expanded={open}
                data-testid="language-switcher-trigger"
            >
                <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-base leading-none">{current.flag}</span>
                <span className="flex-1 text-left">{current.label}</span>
                <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {open && (
                <div
                    role="menu"
                    className={menuCls}
                    data-testid="language-switcher-menu"
                >
                    {languages.map((l) => (
                        <button
                            key={l.code}
                            type="button"
                            role="menuitem"
                            onClick={() => { setLang(l.code); setOpen(false); }}
                            data-testid={`language-option-${l.code}`}
                            data-selected={l.code === lang ? 'true' : 'false'}
                            className={itemCls}
                        >
                            <span className="flex items-center gap-2">
                                <span className="text-base leading-none">{l.flag}</span>
                                <span className="font-semibold">{l.label}</span>
                            </span>
                            {l.code === lang && <Check className="w-3.5 h-3.5 text-[#16A34A]" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
