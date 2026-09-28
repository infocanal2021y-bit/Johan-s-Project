import { useEffect, useState } from 'react';
import { Bitcoin, Box, Gauge, Layers, ExternalLink, Wifi, WifiOff } from 'lucide-react';
import api from '../../lib/api';

const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('es-ES'));
const fmtEur = (n) => (n == null ? '—' : Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }));

const ago = (ts) => {
    if (!ts) return '—';
    const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
    if (s < 60) return `hace ${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `hace ${m} min`;
    return `hace ${Math.floor(m / 60)}h ${m % 60}m`;
};

const Stat = ({ icon: Icon, label, value, sub, testid, accent = 'text-white' }) => (
    <div className="flex items-start gap-2.5 min-w-0" data-testid={testid}>
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 ring-1 ring-orange-500/20 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-orange-300" />
        </div>
        <div className="min-w-0">
            <p className="text-[9.5px] uppercase tracking-wider text-slate-400 font-bold">{label}</p>
            <p className={`text-[14px] font-bold tabular-nums truncate ${accent}`}>{value}</p>
            {sub && <p className="text-[10px] text-slate-500 truncate">{sub}</p>}
        </div>
    </div>
);

export const BitcoinNetworkBar = () => {
    const [st, setSt] = useState(null);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const r = await api.get('/vault/network/status');
                if (alive) setSt(r.data);
            } catch { if (alive) setSt({ ok: false }); }
        };
        load();
        const iv = setInterval(load, 60000);
        const tk = setInterval(() => setTick(t => t + 1), 15000);
        return () => { alive = false; clearInterval(iv); clearInterval(tk); };
    }, []);

    const ok = st?.ok;
    return (
        <div className="rounded-xl ring-1 ring-orange-500/25 bg-gradient-to-r from-[#1a0f05] via-slate-950 to-slate-950 p-4" data-testid="btc-network-bar">
            <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <Bitcoin className="w-4 h-4 text-orange-400" />
                    <p className="text-[10.5px] uppercase tracking-[0.14em] text-orange-300 font-bold">Red Bitcoin · Mainnet en vivo</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${ok ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30' : 'bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/30'}`} data-testid="btc-network-status">
                    {ok ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {st === null ? 'Conectando…' : ok ? (st.stale ? 'Datos en caché' : 'Conectado') : 'Sin conexión'}
                </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4" key={tick}>
                <Stat icon={Box} label="Último bloque" value={ok ? `#${fmtNum(st.tip.height)}` : '—'} sub={ok ? ago(st.tip.timestamp) : ''} testid="btc-tip-height" accent="text-orange-200" />
                <Stat icon={Layers} label="Transacciones" value={ok ? fmtNum(st.tip.tx_count) : '—'} sub="en el último bloque" testid="btc-tip-txs" />
                <Stat icon={Gauge} label="Comisión red" value={ok ? `${st.fees.half_hour} sat/vB` : '—'} sub={ok ? `rápida ${st.fees.fastest} · económica ${st.fees.economy}` : ''} testid="btc-fees" />
                <Stat icon={Layers} label="Mempool" value={ok ? fmtNum(st.mempool.count) : '—'} sub="tx sin confirmar" testid="btc-mempool" />
                <Stat icon={Bitcoin} label="Precio BTC" value={ok ? fmtEur(st.prices.EUR) : '—'} sub={ok ? `$${fmtNum(st.prices.USD)}` : ''} testid="btc-price" accent="text-emerald-300" />
            </div>
            {ok && (
                <a href={st.tip.explorer_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 hover:text-orange-300 transition-colors" data-testid="btc-tip-link">
                    {st.tip.hash.slice(0, 20)}…{st.tip.hash.slice(-8)} <ExternalLink className="w-3 h-3" />
                </a>
            )}
        </div>
    );
};
