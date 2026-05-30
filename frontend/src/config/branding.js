/**
 * Single source of truth for user-facing corporate constants.
 *
 * To change any of these values across the platform, edit only this file.
 * The backend mirrors these via `config.py::BRANDING` and exposes them at
 * `GET /api/branding` — but for synchronous render we keep static defaults
 * here so components never have to wait for a network round-trip.
 *
 * If the team wants to switch values without redeploying the React bundle,
 * use the `useBranding()` hook below, which hydrates from the API and falls
 * back to these constants instantly on first paint.
 */
import { useEffect, useState } from 'react';
import api from '../lib/api';


export const SUPPORT_EMAIL    = 'info@paylionsbit.es';
export const SUPPORT_PHONE    = '+447400757168';
export const SUPPORT_WHATSAPP = 'https://wa.me/447400757168';
export const COMPANY_NAME     = 'PayLionsBit';
export const COMPANY_WEBSITE  = 'https://paylionsbit.es';

export const BRANDING = {
    support_email:    SUPPORT_EMAIL,
    support_phone:    SUPPORT_PHONE,
    support_whatsapp: SUPPORT_WHATSAPP,
    company_name:     COMPANY_NAME,
    company_website:  COMPANY_WEBSITE,
};


/** Convenience: ready-to-paste `mailto:` href. */
export const supportMailto = (subject) =>
    `mailto:${SUPPORT_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;


/**
 * React hook that returns the current branding payload.
 *
 * - Returns the static defaults immediately (no Suspense, no flicker).
 * - In the background, fetches `/api/branding` once and replaces them if the
 *   server reports a different value (allows runtime override via env).
 */
export const useBranding = () => {
    const [branding, setBranding] = useState(BRANDING);

    useEffect(() => {
        let alive = true;
        api.get('/branding')
            .then((r) => {
                if (!alive || !r?.data) return;
                // Only update if at least one value differs from the static defaults
                const next = { ...BRANDING, ...r.data };
                if (Object.keys(next).some((k) => next[k] !== branding[k])) {
                    setBranding(next);
                }
            })
            .catch(() => { /* fall back to defaults; never throw */ });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return branding;
};


export default BRANDING;
