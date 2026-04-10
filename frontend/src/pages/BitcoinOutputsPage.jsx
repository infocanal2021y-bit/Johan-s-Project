import { useState, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import {
    Bitcoin, RefreshCw, ExternalLink, Copy, Check, Search,
    TrendingUp, Clock, Shield, Loader2, ChevronDown, ChevronUp,
    Hash, ArrowUpRight
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const formatHash = (hash, len = 10) => hash ? `${hash.slice(0, len)}...${hash.slice(-len)}` : '-';
const formatBTC = (v) => v?.toFixed(8) ?? '-';
const formatUSD = (v) => v ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';
const timeAgo = (iso) => {
    if (!iso) return '-';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
};

const CopyBtn = ({ text }) => {
    const [copied, setCopied] = useState(false);
    const handle = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success('Copiado');
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button onClick={handle} className="p-1 rounded hover:bg-slate-700 transition-colors" data-testid="copy-hash-btn">
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-500" />}
        </button>
    );
};

const OutputRow = ({ output, index }) => {
    const [expanded, setExpanded] = useState(false);
    const isLarge = output.value_usd >= 80000;

    return (
        <>
            <tr
                className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors cursor-pointer ${isLarge ? 'bg-orange-500/[0.03]' : ''}`}
                onClick={() => setExpanded(!expanded)}
                data-testid={`output-row-${index}`}
            >
                <td className="py-3 px-3 sm:px-4">
                    <span className="text-slate-500 text-xs font-mono">{output.block_id}</span>
                </td>
                <td className="py-3 px-3 sm:px-4">
                    <div className="flex items-center gap-1.5">
                        <span className="text-cyan-300 font-mono text-xs hidden sm:inline">{formatHash(output.transaction_hash, 8)}</span>
                        <span className="text-cyan-300 font-mono text-xs sm:hidden">{formatHash(output.transaction_hash, 4)}</span>
                        <CopyBtn text={output.transaction_hash} />
                    </div>
                </td>
                <td className="py-3 px-3 sm:px-4 text-right">
                    <span className="text-orange-400 font-mono text-xs font-semibold">{formatBTC(output.value_btc)}</span>
                </td>
                <td className="py-3 px-3 sm:px-4 text-right">
                    <span className={`font-mono text-xs font-bold ${isLarge ? 'text-emerald-400' : 'text-white'}`}>
                        {formatUSD(output.value_usd)}
                    </span>
                </td>
                <td className="py-3 px-3 sm:px-4 text-right hidden md:table-cell">
                    <span className="text-slate-500 text-xs">{timeAgo(output.time)}</span>
                </td>
                <td className="py-3 px-2 text-center">
                    {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                </td>
            </tr>
            {expanded && (
                <tr className="bg-slate-900/80 border-b border-slate-800/50">
                    <td colSpan={6} className="px-4 py-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div>
                                <p className="text-slate-500 mb-1 uppercase tracking-wider text-[10px]">Transaction Hash</p>
                                <div className="flex items-center gap-2">
                                    <p className="text-cyan-300 font-mono break-all">{output.transaction_hash}</p>
                                    <a
                                        href={`https://blockchair.com/bitcoin/transaction/${output.transaction_hash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-shrink-0 p-1 rounded hover:bg-slate-700"
                                        data-testid={`verify-link-${index}`}
                                    >
                                        <ExternalLink className="w-3.5 h-3.5 text-cyan-500" />
                                    </a>
                                </div>
                            </div>
                            <div>
                                <p className="text-slate-500 mb-1 uppercase tracking-wider text-[10px]">Destinatario</p>
                                <div className="flex items-center gap-2">
                                    <p className="text-slate-300 font-mono break-all">{output.recipient || 'Script Output'}</p>
                                    {output.recipient && <CopyBtn text={output.recipient} />}
                                </div>
                            </div>
                            <div>
                                <p className="text-slate-500 mb-1 uppercase tracking-wider text-[10px]">Bloque / Index</p>
                                <p className="text-slate-300 font-mono">#{output.block_id} / Output {output.index}</p>
                            </div>
                            <div>
                                <p className="text-slate-500 mb-1 uppercase tracking-wider text-[10px]">Estado</p>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                    output.is_spent ? 'bg-slate-700 text-slate-400' : 'bg-emerald-500/15 text-emerald-400'
                                }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${output.is_spent ? 'bg-slate-500' : 'bg-emerald-400'}`} />
                                    {output.is_spent ? 'Gastado' : 'No gastado'}
                                </span>
                            </div>
                        </div>
                        <div className="mt-3 flex justify-end">
                            <a
                                href={`https://blockchair.com/bitcoin/transaction/${output.transaction_hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                                data-testid={`blockchair-link-${index}`}
                            >
                                Verificar en Blockchair <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};

export default function BitcoinOutputsPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchData = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        try {
            const res = await api.get('/bitcoin/outputs');
            setData(res.data);
        } catch {
            toast.error('Error al cargar datos de Bitcoin');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const filtered = data?.outputs?.filter(o =>
        !searchTerm ||
        o.transaction_hash?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.recipient?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(o.block_id).includes(searchTerm)
    ) || [];

    return (
        <Layout>
            <div className="max-w-6xl mx-auto" data-testid="bitcoin-outputs-page">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-orange-500/20 flex items-center justify-center">
                            <Bitcoin className="w-5 h-5 text-orange-400" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-white">Bitcoin Outputs</h1>
                            <p className="text-slate-500 text-sm">Verificacion de transacciones en la blockchain</p>
                        </div>
                    </div>
                    <Button
                        onClick={() => fetchData(true)}
                        disabled={refreshing}
                        className="bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
                        data-testid="refresh-outputs-btn"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                        Actualizar
                    </Button>
                </div>

                {/* Stats Cards */}
                {data && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                            <p className="text-slate-500 text-[10px] uppercase tracking-wider">Precio BTC</p>
                            <p className="text-orange-400 text-lg font-bold font-mono mt-1">{formatUSD(data.btc_price)}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                            <p className="text-slate-500 text-[10px] uppercase tracking-wider">Ultimo Bloque</p>
                            <p className="text-white text-lg font-bold font-mono mt-1">#{data.block_height?.toLocaleString()}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                            <p className="text-slate-500 text-[10px] uppercase tracking-wider">Outputs Encontrados</p>
                            <p className="text-emerald-400 text-lg font-bold font-mono mt-1">{data.total_found}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                            <p className="text-slate-500 text-[10px] uppercase tracking-wider">Rango USD</p>
                            <p className="text-cyan-400 text-lg font-bold font-mono mt-1">$40K-$110K</p>
                        </div>
                    </div>
                )}

                {/* Info banner */}
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 mb-6">
                    <div className="flex items-start gap-2">
                        <Shield className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                        <p className="text-slate-400 text-xs leading-relaxed">
                            Datos obtenidos en tiempo real de la blockchain de Bitcoin. Haga clic en cualquier fila para ver los detalles completos y verificar la transaccion directamente en <span className="text-cyan-400 font-medium">Blockchair</span>.
                        </p>
                    </div>
                </div>

                {/* Search */}
                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Buscar por hash, direccion o bloque..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-900/80 border border-slate-800 rounded-xl text-white text-sm pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500/30 placeholder:text-slate-600"
                        data-testid="search-outputs"
                    />
                </div>

                {/* Table */}
                <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/50">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
                            <p className="text-slate-500 text-sm">Cargando outputs de Bitcoin...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <Hash className="w-10 h-10 text-slate-600" />
                            <p className="text-slate-500 text-sm">No se encontraron outputs</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-slate-900/80 border-b border-slate-800">
                                        <th className="py-3 px-3 sm:px-4 text-left text-[10px] text-slate-500 uppercase tracking-wider font-medium">Bloque</th>
                                        <th className="py-3 px-3 sm:px-4 text-left text-[10px] text-slate-500 uppercase tracking-wider font-medium">Hash</th>
                                        <th className="py-3 px-3 sm:px-4 text-right text-[10px] text-slate-500 uppercase tracking-wider font-medium">Valor (BTC)</th>
                                        <th className="py-3 px-3 sm:px-4 text-right text-[10px] text-slate-500 uppercase tracking-wider font-medium">Valor (USD)</th>
                                        <th className="py-3 px-3 sm:px-4 text-right text-[10px] text-slate-500 uppercase tracking-wider font-medium hidden md:table-cell">Tiempo</th>
                                        <th className="py-3 px-2 w-8"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((output, i) => (
                                        <OutputRow key={`${output.transaction_hash}-${output.index}`} output={output} index={i} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {data && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-4 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Actualizado: {new Date(data.updated_at).toLocaleString('es-ES')}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span>Fuente: blockchain.info</span>
                            <span className="text-slate-700">|</span>
                            <span>Mostrando {filtered.length} de {data.total_found} outputs</span>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
