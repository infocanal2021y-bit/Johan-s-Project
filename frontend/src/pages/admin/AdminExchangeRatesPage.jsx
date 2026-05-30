import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../../components/layout/Layout';
import api from '../../lib/api';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
    TrendingUp, RefreshCw, Edit3, Save, X, RotateCcw, History as HistoryIcon, Loader2,
    AlertTriangle, CheckCircle2, Filter,
} from 'lucide-react';

const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const CURRENCY_FLAGS = {
    USD: '🇺🇸', GBP: '🇬🇧', DOP: '🇩🇴', MXN: '🇲🇽', COP: '🇨🇴', BTC: '🪙',
};


export const AdminExchangeRatesPage = () => {
    const [rates, setRates] = useState([]);
    const [conversions, setConversions] = useState([]);
    const [feeDefault, setFeeDefault] = useState(0.5);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null); // {currency, rate}
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [filterCurrency, setFilterCurrency] = useState('all');

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [r1, r2] = await Promise.all([
                api.get('/admin/multi-currency/rates'),
                api.get('/admin/multi-currency/conversions?limit=100'),
            ]);
            setRates(r1.data.items || []);
            setFeeDefault(r1.data.fee_pct_default);
            setConversions(r2.data.items || []);
        } catch (err) {
            console.error('[admin/multi-currency] load failed', err);
            toast.error('No se pudieron cargar las tasas');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleSave = async () => {
        if (!editing) return;
        const rate = parseFloat(editing.rate);
        if (!rate || rate <= 0) {
            toast.error('La tasa debe ser mayor a 0');
            return;
        }
        setSaving(true);
        try {
            await api.put(`/admin/multi-currency/rates/${editing.currency}`, { rate });
            toast.success(`Tasa EUR → ${editing.currency} actualizada a ${rate}`);
            setEditing(null);
            load(true);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo guardar la tasa');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async (currency) => {
        if (!window.confirm(`¿Restablecer la tasa de EUR → ${currency} al valor por defecto?`)) return;
        try {
            await api.delete(`/admin/multi-currency/rates/${currency}`);
            toast.success(`Override eliminado · usando tasa por defecto para ${currency}`);
            load(true);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo restablecer');
        }
    };

    const filteredConv = conversions.filter(c =>
        filterCurrency === 'all'
        || c.from_currency === filterCurrency
        || c.to_currency === filterCurrency
    );

    return (
        <Layout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-[10.5px] uppercase tracking-[0.14em] text-[#7CB1E5] font-bold">Admin · Multidivisa</p>
                        <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1" data-testid="admin-rates-title">
                            Tasas de cambio · Conversiones
                        </h1>
                        <p className="text-slate-400 text-[13px] mt-1.5">
                            Edita las tasas EUR → moneda manualmente. Comisión por conversión: <span className="text-amber-300 font-bold">{feeDefault}%</span>
                        </p>
                    </div>
                    <Button
                        onClick={() => { setRefreshing(true); load(true); }}
                        variant="outline"
                        className="bg-white/5 border-white/15 text-white hover:bg-white/10"
                        data-testid="admin-rates-refresh"
                    >
                        <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} /> Refrescar
                    </Button>
                </div>

                {/* Rates editor */}
                <Card className="bg-white border-slate-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-[#1973B8]" />
                        <h2 className="text-[#072146] font-bold text-[14px]">Tasas activas (base EUR)</h2>
                    </div>
                    {loading ? (
                        <div className="p-12 text-center text-slate-500">
                            <Loader2 className="w-6 h-6 mx-auto animate-spin" />
                        </div>
                    ) : (
                        <table className="w-full text-[13px]">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr className="text-slate-500 text-left">
                                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-[10px]">Moneda</th>
                                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-[10px]">Par</th>
                                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-[10px] text-right">Tasa actual</th>
                                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-[10px] text-right">Default</th>
                                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-[10px]">Override</th>
                                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-[10px]">Actualizado</th>
                                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-[10px] text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rates.map(r => (
                                    <tr key={r.currency} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`rate-row-${r.currency}`}>
                                        <td className="py-3 px-4 font-bold text-[#072146]">
                                            <span className="text-base mr-2">{CURRENCY_FLAGS[r.currency] || ''}</span>
                                            {r.currency}
                                        </td>
                                        <td className="py-3 px-4 text-slate-500 font-mono">{r.pair}</td>
                                        <td className="py-3 px-4 text-right">
                                            {editing?.currency === r.currency ? (
                                                <input
                                                    type="number"
                                                    step="0.000001"
                                                    autoFocus
                                                    value={editing.rate}
                                                    onChange={(e) => setEditing({ ...editing, rate: e.target.value })}
                                                    className="w-32 h-9 px-3 rounded-md border border-[#1973B8] focus:ring-1 focus:ring-[#1973B8] outline-none text-right font-mono font-bold text-[#072146]"
                                                    data-testid={`rate-input-${r.currency}`}
                                                />
                                            ) : (
                                                <span className="font-mono font-bold text-[#072146] tabular-nums">
                                                    {Number(r.rate).toLocaleString('es-ES', { maximumFractionDigits: 8 })}
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-right text-slate-400 font-mono text-[11.5px]">
                                            {Number(r.default_rate).toLocaleString('es-ES', { maximumFractionDigits: 8 })}
                                        </td>
                                        <td className="py-3 px-4">
                                            {r.is_override ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-bold uppercase">
                                                    <AlertTriangle className="w-2.5 h-2.5" /> Manual
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase">
                                                    <CheckCircle2 className="w-2.5 h-2.5" /> Default
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-slate-500 text-[11px]">
                                            {fmtDate(r.updated_at)}
                                            {r.updated_by && (
                                                <p className="text-[10px] text-slate-400 mt-0.5">por {r.updated_by}</p>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            {editing?.currency === r.currency ? (
                                                <div className="inline-flex gap-1.5">
                                                    <Button
                                                        size="sm"
                                                        onClick={handleSave}
                                                        disabled={saving}
                                                        className="h-7 px-2.5 text-[10.5px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                                                        data-testid={`rate-save-${r.currency}`}
                                                    >
                                                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Save className="w-3 h-3 mr-1" /> Guardar</>}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setEditing(null)}
                                                        className="h-7 px-2.5 text-[10.5px]"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="inline-flex gap-1.5">
                                                    <Button
                                                        size="sm"
                                                        onClick={() => setEditing({ currency: r.currency, rate: String(r.rate) })}
                                                        className="h-7 px-2.5 text-[10.5px] bg-[#1973B8] hover:bg-[#1F89D8] text-white font-bold"
                                                        data-testid={`rate-edit-${r.currency}`}
                                                    >
                                                        <Edit3 className="w-3 h-3 mr-1" /> Editar
                                                    </Button>
                                                    {r.is_override && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleReset(r.currency)}
                                                            className="h-7 px-2.5 text-[10.5px] border-amber-300 text-amber-700 hover:bg-amber-50"
                                                            data-testid={`rate-reset-${r.currency}`}
                                                        >
                                                            <RotateCcw className="w-3 h-3" />
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </Card>

                {/* Conversion log */}
                <Card className="bg-white border-slate-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <HistoryIcon className="w-4 h-4 text-[#1973B8]" />
                            <h2 className="text-[#072146] font-bold text-[14px]">
                                Log de conversiones · todos los usuarios
                            </h2>
                            <span className="text-[10.5px] text-slate-400 font-mono">{filteredConv.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Filter className="w-3.5 h-3.5 text-slate-400" />
                            <select
                                value={filterCurrency}
                                onChange={(e) => setFilterCurrency(e.target.value)}
                                className="h-8 px-2 rounded-md border border-slate-200 text-[12px] font-bold text-[#072146]"
                                data-testid="conv-filter-currency"
                            >
                                <option value="all">Todas las monedas</option>
                                {['EUR', 'USD', 'GBP', 'DOP', 'MXN', 'COP', 'BTC'].map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr className="text-slate-500 text-left">
                                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-[10px]">Fecha</th>
                                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-[10px]">Usuario</th>
                                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-[10px]">Origen</th>
                                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-[10px]">Destino</th>
                                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-[10px] text-right">Tasa</th>
                                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-[10px] text-right">Comisión</th>
                                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-[10px]">Ref</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredConv.length === 0 ? (
                                    <tr><td colSpan={7} className="py-8 text-center text-slate-400 text-[12px]">Sin conversiones</td></tr>
                                ) : filteredConv.map(c => (
                                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="py-2 px-4 text-slate-500 text-[11px]">{fmtDate(c.created_at)}</td>
                                        <td className="py-2 px-4">
                                            <p className="text-[#072146] font-semibold text-[12px]">{c.user_name || c.user_email}</p>
                                            <p className="text-slate-400 text-[10px]">{c.user_email}</p>
                                        </td>
                                        <td className="py-2 px-4 font-mono font-bold text-[#072146]">
                                            {Number(c.amount_in || 0).toLocaleString('es-ES')} {c.from_currency || '—'}
                                        </td>
                                        <td className="py-2 px-4 font-mono font-bold text-emerald-600">
                                            {Number(c.amount_out || 0).toLocaleString('es-ES')} {c.to_currency}
                                        </td>
                                        <td className="py-2 px-4 text-right font-mono text-slate-600">
                                            {c.rate ? Number(c.rate).toFixed(6) : '—'}
                                        </td>
                                        <td className="py-2 px-4 text-right font-mono text-amber-700">
                                            {c.fee_amount ? `${Number(c.fee_amount).toLocaleString('es-ES')} ${c.to_currency}` : '—'}
                                        </td>
                                        <td className="py-2 px-4 font-mono text-cyan-700 text-[10.5px]">{c.reference}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </Layout>
    );
};

export default AdminExchangeRatesPage;
