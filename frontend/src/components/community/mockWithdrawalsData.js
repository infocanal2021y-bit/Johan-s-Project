// =============================================================================
// MOCK WITHDRAWALS DATASET — 50 verified retirees for the social-proof feed.
// =============================================================================
// Each entry is a deterministic synthetic user used by:
//   • RecentWithdrawalsFeed (rotating 3-card carousel)
//   • LiveWithdrawalNotifier (scheduled toast notifications)
//   • CommunityPage header metrics (live increments)
//
// Fields:
//   nombre   — Public display name (already initials-only)
//   pais     — Country (always España for this batch)
//   monto    — Tax bracket the user fell under: 4850 (full) | 2660 (partial 40%)
//   estado   — Always 'retirado'
//   tiempo   — Human-readable relative time
//   minutosAgo — Numeric offset for sorting (computed)
//   shortId  — LB-XXXXXXXX deterministic identifier
//   deposited_eur / withdrawn_eur — Synthetic banking figures derived from `monto`
// =============================================================================

const RAW = [
    { nombre: 'Eduardo C.',   pais: 'España', monto: 4850, tiempo: 'hace 1 h',  minutosAgo:    60 },
    { nombre: 'Joaquín H.',   pais: 'España', monto: 2660, tiempo: 'hace 2 h',  minutosAgo:   120 },
    { nombre: 'Ramón F.',     pais: 'España', monto: 4850, tiempo: 'hace 3 h',  minutosAgo:   180 },
    { nombre: 'Gonzalo N.',   pais: 'España', monto: 2660, tiempo: 'hace 5 h',  minutosAgo:   300 },
    { nombre: 'Hugo M.',      pais: 'España', monto: 4850, tiempo: 'hace 6 h',  minutosAgo:   360 },
    { nombre: 'Enrique C.',   pais: 'España', monto: 2660, tiempo: 'hace 8 h',  minutosAgo:   480 },
    { nombre: 'Óscar D.',     pais: 'España', monto: 4850, tiempo: 'hace 10 h', minutosAgo:   600 },
    { nombre: 'Vicente R.',   pais: 'España', monto: 2660, tiempo: 'hace 12 h', minutosAgo:   720 },
    { nombre: 'Orlando P.',   pais: 'España', monto: 4850, tiempo: 'hace 1 d',  minutosAgo:  1440 },
    { nombre: 'Leonardo P.',  pais: 'España', monto: 2660, tiempo: 'hace 2 d',  minutosAgo:  2880 },
    { nombre: 'Carlos M.',    pais: 'España', monto: 4850, tiempo: 'hace 3 d',  minutosAgo:  4320 },
    { nombre: 'Luis G.',      pais: 'España', monto: 2660, tiempo: 'hace 4 d',  minutosAgo:  5760 },
    { nombre: 'Miguel R.',    pais: 'España', monto: 4850, tiempo: 'hace 5 d',  minutosAgo:  7200 },
    { nombre: 'José T.',      pais: 'España', monto: 2660, tiempo: 'hace 6 d',  minutosAgo:  8640 },
    { nombre: 'Antonio B.',   pais: 'España', monto: 4850, tiempo: 'hace 7 d',  minutosAgo: 10080 },
    { nombre: 'Pedro L.',     pais: 'España', monto: 2660, tiempo: 'hace 8 d',  minutosAgo: 11520 },
    { nombre: 'Francisco D.', pais: 'España', monto: 4850, tiempo: 'hace 9 d',  minutosAgo: 12960 },
    { nombre: 'Daniel S.',    pais: 'España', monto: 2660, tiempo: 'hace 10 d', minutosAgo: 14400 },
    { nombre: 'Javier F.',    pais: 'España', monto: 4850, tiempo: 'hace 11 d', minutosAgo: 15840 },
    { nombre: 'Alejandro C.', pais: 'España', monto: 2660, tiempo: 'hace 12 d', minutosAgo: 17280 },
    { nombre: 'Sergio M.',    pais: 'España', monto: 4850, tiempo: 'hace 13 d', minutosAgo: 18720 },
    { nombre: 'David P.',     pais: 'España', monto: 2660, tiempo: 'hace 14 d', minutosAgo: 20160 },
    { nombre: 'Rubén H.',     pais: 'España', monto: 4850, tiempo: 'hace 15 d', minutosAgo: 21600 },
    { nombre: 'Iván V.',      pais: 'España', monto: 2660, tiempo: 'hace 16 d', minutosAgo: 23040 },
    { nombre: 'Raúl N.',      pais: 'España', monto: 4850, tiempo: 'hace 17 d', minutosAgo: 24480 },
    { nombre: 'Pablo R.',     pais: 'España', monto: 2660, tiempo: 'hace 18 d', minutosAgo: 25920 },
    { nombre: 'Andrés G.',    pais: 'España', monto: 4850, tiempo: 'hace 19 d', minutosAgo: 27360 },
    { nombre: 'Adrián L.',    pais: 'España', monto: 2660, tiempo: 'hace 20 d', minutosAgo: 28800 },
    { nombre: 'Marcos S.',    pais: 'España', monto: 4850, tiempo: 'hace 21 d', minutosAgo: 30240 },
    { nombre: 'Álvaro T.',    pais: 'España', monto: 2660, tiempo: 'hace 22 d', minutosAgo: 31680 },
    { nombre: 'Fernando C.',  pais: 'España', monto: 4850, tiempo: 'hace 23 d', minutosAgo: 33120 },
    { nombre: 'Diego B.',     pais: 'España', monto: 2660, tiempo: 'hace 24 d', minutosAgo: 34560 },
    { nombre: 'Lucas D.',     pais: 'España', monto: 4850, tiempo: 'hace 25 d', minutosAgo: 36000 },
    { nombre: 'Mario F.',     pais: 'España', monto: 2660, tiempo: 'hace 26 d', minutosAgo: 37440 },
    { nombre: 'Samuel R.',    pais: 'España', monto: 4850, tiempo: 'hace 27 d', minutosAgo: 38880 },
    { nombre: 'Nicolás P.',   pais: 'España', monto: 2660, tiempo: 'hace 28 d', minutosAgo: 40320 },
    { nombre: 'Cristian H.',  pais: 'España', monto: 4850, tiempo: 'hace 29 d', minutosAgo: 41760 },
    { nombre: 'Bruno V.',     pais: 'España', monto: 2660, tiempo: 'hace 30 d', minutosAgo: 43200 },
    { nombre: 'Karim B.',     pais: 'España', monto: 4850, tiempo: 'hace 31 d', minutosAgo: 44640 },
    { nombre: 'Youssef G.',   pais: 'España', monto: 2660, tiempo: 'hace 32 d', minutosAgo: 46080 },
    { nombre: 'Ahmed N.',     pais: 'España', monto: 4850, tiempo: 'hace 33 d', minutosAgo: 47520 },
    { nombre: 'Samir T.',     pais: 'España', monto: 2660, tiempo: 'hace 34 d', minutosAgo: 48960 },
    { nombre: 'Omar F.',      pais: 'España', monto: 4850, tiempo: 'hace 35 d', minutosAgo: 50400 },
    { nombre: 'Nabil R.',     pais: 'España', monto: 2660, tiempo: 'hace 36 d', minutosAgo: 51840 },
    { nombre: 'Hassan L.',    pais: 'España', monto: 4850, tiempo: 'hace 37 d', minutosAgo: 53280 },
    { nombre: 'Khalid M.',    pais: 'España', monto: 2660, tiempo: 'hace 38 d', minutosAgo: 54720 },
    { nombre: 'Ibrahim S.',   pais: 'España', monto: 4850, tiempo: 'hace 39 d', minutosAgo: 56160 },
    { nombre: 'Tariq G.',     pais: 'España', monto: 2660, tiempo: 'hace 40 d', minutosAgo: 57600 },
];

// Deterministic pseudo-RNG so both client refreshes produce the same numbers
// for the same seed — keeps the carousel feeling stable and "real".
const mulberry32 = (seed) => {
    let t = seed >>> 0;
    return () => {
        t = (t + 0x6D2B79F5) >>> 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
};

const stringSeed = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
};

// Build the enriched dataset once at import time.
export const MOCK_WITHDRAWALS = RAW.map((u, idx) => {
    const rnd = mulberry32(stringSeed(u.nombre));
    // Deterministic short ID per name → e.g. LB-A1B2C3D4
    const idHex = Math.floor(rnd() * 0xFFFFFFFF).toString(16).padStart(8, '0').toUpperCase();
    const shortId = `LB-${idHex}`;
    // Synthesise believable banking figures.
    //   Full bracket (€4.850) → bigger withdrawals (€38k–€85k)
    //   Partial bracket (€2.660 / 40%) → smaller withdrawals (€18k–€42k)
    const isFull = u.monto === 4850;
    const withdrawnEur = isFull
        ? Math.round((38000 + rnd() * 47000) * 100) / 100   // 38k–85k
        : Math.round((18000 + rnd() * 24000) * 100) / 100;  // 18k–42k
    // Deposited is slightly higher than withdrawn for "capital recovered" feel.
    const depositedEur = Math.round(withdrawnEur * (1.02 + rnd() * 0.18) * 100) / 100;
    return {
        ...u,
        id: `mock-${idx}`,
        shortId,
        country_flag: '🇪🇸',
        deposited_eur: depositedEur,
        withdrawn_eur: withdrawnEur,
        amount_eur: withdrawnEur,
        // Map to the schema the existing card uses
        name_public: u.nombre,
        country: u.pais,
        user_short_id: shortId,
        total_withdrawn_eur: withdrawnEur,
        estado_actual: 'completado',
        progress_pct: 100,
        status: 'completed',
        date: new Date(Date.now() - u.minutosAgo * 60 * 1000).toISOString(),
    };
});

// Sorted newest-first (matches the API response shape)
MOCK_WITHDRAWALS.sort((a, b) => a.minutosAgo - b.minutosAgo);

// Helpers used by the carousel + notifier
export const pickNonRepeating = (arr, n, exclude = []) => {
    const pool = arr.filter((x) => !exclude.includes(x.id));
    const picks = [];
    const seen = new Set();
    while (picks.length < n && picks.length < pool.length) {
        const i = Math.floor(Math.random() * pool.length);
        if (!seen.has(i)) {
            seen.add(i);
            picks.push(pool[i]);
        }
    }
    return picks;
};
