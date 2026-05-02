import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { TRANSLATIONS, SUPPORTED_LANGUAGES, DEFAULT_LANG } from './translations';

const STORAGE_KEY = 'lionsbit:lang';

const LanguageContext = createContext({
    lang: DEFAULT_LANG,
    setLang: () => {},
    t: (k) => k,
    languages: SUPPORTED_LANGUAGES,
});

const isValidLang = (l) => SUPPORTED_LANGUAGES.some((x) => x.code === l);

export const LanguageProvider = ({ children }) => {
    const [lang, setLangState] = useState(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored && isValidLang(stored)) return stored;
        } catch (e) { /* ignore */ }
        return DEFAULT_LANG;
    });

    const setLang = useCallback((next) => {
        if (!isValidLang(next)) return;
        setLangState(next);
        try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* ignore */ }
    }, []);

    // Reflect the active language on <html lang="..."> for accessibility/SEO
    useEffect(() => {
        try { document.documentElement.lang = lang; } catch (e) { /* ignore */ }
    }, [lang]);

    // The translation function — falls back to the key (Spanish) when
    // (a) we're already on Spanish, (b) no entry exists, or (c) no entry for
    // the active language. Never returns undefined.
    const t = useCallback(
        (key) => {
            if (key == null) return key;
            if (lang === DEFAULT_LANG) return key;
            const entry = TRANSLATIONS[key];
            if (!entry) return key;
            return entry[lang] || key;
        },
        [lang],
    );

    const value = useMemo(
        () => ({ lang, setLang, t, languages: SUPPORTED_LANGUAGES }),
        [lang, setLang, t],
    );

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => useContext(LanguageContext);

// Convenience hook that returns just the t() function (most common use case)
export const useT = () => useContext(LanguageContext).t;
