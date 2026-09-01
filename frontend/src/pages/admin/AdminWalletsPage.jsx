import { useState, useEffect } from 'react';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { toast } from 'sonner';
import { Wallet, Loader2, ShieldCheck, AlertTriangle, Save, Network, Hash, Bitcoin } from 'lucide-react';

const COIN_ACCENT = {
    BTC: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
    ETH: 'text-indigo-400 border-indigo-500/40 bg-indigo-500/10',
    BNB: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
    USDT: 'text-teal-400 border-teal-500/40 bg-teal-500/10',
};

const WalletCard = ({ wallet, onSaved }) => {
    const [enabled, setEnabled] = useState(wallet.enabled);
    const [address, setAddress] = useState(wallet.address || '');
    const [network, setNetwork] = useState(wallet.network || '');
    const [conf, setConf] = useState(wallet.required_confirmations ?? 1);
    const [saving, setSaving] = useState(false);

    const dirty = enabled !== wallet.enabled || address !== (wallet.address || '') ||
        network !== (wallet.network || '') || conf !== (wallet.required_confirmations ?? 1);

    const accent = COIN_ACCENT[wallet.coin] || 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10';

    const save = async () => {
        if (enabled && !address.trim()) {
            toast.error('No se puede habilitar una moneda sin dirección pública.');
            return;
        }
        setSaving(true);
        try {
            const { data } = await adminAPI.updatePlatformWallet(wallet.coin, {
                enabled, address: address.trim(), network: network.trim(), required_confirmations: Number(conf),
            });
            toast.success(`${wallet.coin} actualizado`);
            onSaved?.(data.wallet);
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={`rounded-2xl bg-slate-900/70 border ${enabled ? 'border-slate-700' : 'border-slate-800 opacity-70'} p-5 space-y-4`} data-testid={`wallet-card-${wallet.coin}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${accent}`}>
                        <Bitcoin className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-white font-bold text-lg leading-tight">{wallet.coin}</p>
                        <p className="text-slate-500 text-xs">{wallet.name}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {enabled ? 'Activa' : 'Desactivada'}
                    </span>
                    <Switch checked={enabled} onCheckedChange={setEnabled} data-testid={`wallet-toggle-${wallet.coin}`} />
                </div>
            </div>

            <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Dirección pública</Label>
                <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Dirección de recepción"
                    className="bg-slate-950 border-slate-800 text-white font-mono text-[13px]"
                    data-testid={`wallet-address-${wallet.coin}`}
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label className="text-slate-400 text-xs flex items-center gap-1.5"><Network className="w-3.5 h-3.5" /> Red</Label>
                    <Input
                        value={network}
                        onChange={(e) => setNetwork(e.target.value)}
                        placeholder="Ej: Tron (TRC20)"
                        className="bg-slate-950 border-slate-800 text-white text-[13px]"
                        data-testid={`wallet-network-${wallet.coin}`}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-slate-400 text-xs flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" /> Confirmaciones</Label>
                    <Input
                        type="number" min="0" max="200"
                        value={conf}
                        onChange={(e) => setConf(e.target.value)}
                        className="bg-slate-950 border-slate-800 text-white text-[13px] font-mono"
                        data-testid={`wallet-conf-${wallet.coin}`}
                    />
                </div>
            </div>

            <Button
                onClick={save}
                disabled={!dirty || saving}
                className="w-full bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50"
                data-testid={`wallet-save-${wallet.coin}`}
            >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Guardar cambios
            </Button>
            {wallet.updated_by && (
                <p className="text-[10.5px] text-slate-600">Última edición: {wallet.updated_by}</p>
            )}
        </div>
    );
};

const AdminWalletsPage = () => {
    const [wallets, setWallets] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        try {
            const { data } = await adminAPI.getPlatformWallets();
            setWallets(data.wallets || []);
        } catch {
            toast.error('Error al cargar las wallets');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const onSaved = (updated) => {
        setWallets((prev) => prev.map((w) => (w.coin === updated.coin ? updated : w)));
    };

    return (
        <Layout>
            <div className="max-w-5xl mx-auto space-y-6" data-testid="admin-wallets-page">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/25">
                        <Wallet className="w-6 h-6 text-cyan-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Wallets de Plataforma</h1>
                        <p className="text-sm text-slate-400 font-light">Configuración · Direcciones de recepción para el cargo de retiro</p>
                    </div>
                </div>

                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <p className="text-emerald-200 text-[13px] leading-relaxed">
                        Este panel gestiona <strong>únicamente direcciones públicas</strong> de recepción. Nunca se almacenan ni se solicitan
                        seed phrases ni claves privadas. Las monedas desactivadas o sin dirección no se muestran a los usuarios.
                    </p>
                </div>

                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-amber-200 text-[13px] leading-relaxed">
                        Verifique cuidadosamente cada dirección y su red. Un cambio incorrecto puede provocar la pérdida de fondos de los pagos entrantes.
                    </p>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-cyan-400 animate-spin" /></div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {wallets.map((w) => <WalletCard key={w.coin} wallet={w} onSaved={onSaved} />)}
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default AdminWalletsPage;
