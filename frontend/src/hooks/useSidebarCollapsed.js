import { useEffect, useState } from 'react';

const KEY = 'plb_sidebar_collapsed';
const EVT = 'plb-sidebar-collapsed';

const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

export const setSidebarCollapsed = (value) => {
    try { localStorage.setItem(KEY, value ? '1' : '0'); } catch { /* noop */ }
    window.dispatchEvent(new CustomEvent(EVT, { detail: value }));
};

export const useSidebarCollapsed = () => {
    const [collapsed, setCollapsed] = useState(read);
    useEffect(() => {
        const h = (e) => setCollapsed(!!e.detail);
        window.addEventListener(EVT, h);
        return () => window.removeEventListener(EVT, h);
    }, []);
    return [collapsed, setSidebarCollapsed];
};
