import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { PayPalAccountCard } from '../components/paypal/PayPalAccountCard';
import { PayPalWithdrawForm } from '../components/paypal/PayPalWithdrawForm';
import { PayPalWithdrawalHistory } from '../components/paypal/PayPalWithdrawalHistory';

export default function PayPalWithdrawalPage() {
    const [config, setConfig] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const [cfg, acc, hist] = await Promise.all([api.get('/paypal-withdrawal/config'), api.get('/multi-currency/accounts'), api.get('/paypal-withdrawal/list')]);
            setConfig(cfg.data); setAccounts(acc.data.accounts || []); setHistory(hist.data.items || []);
        } catch { toast.error('No se pudo cargar la página de retiros PayPal'); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    return (
        <Layout>
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5" data-testid="paypal-withdrawal-page">
                <div>
                    <p className="text-[10.5px] uppercase tracking-[0.14em] text-[#009cde] font-bold">Retiros</p>
                    <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1 flex items-center gap-2"><Wallet className="w-7 h-7 text-[#009cde]" /> Retiro a PayPal</h1>
                    <p className="text-slate-400 text-[13px] mt-1.5">Envía tu saldo EUR o USD a tu cuenta PayPal. Sin comisión · mínimo {config?.min_amount ?? 50} · confirmación por código de seguridad.</p>
                </div>
                {loading ? <div className="py-16 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin text-slate-400" /></div> : (
                    <>
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-5 items-start">
                            <PayPalAccountCard account={config?.account} onChange={(account) => setConfig((c) => ({ ...c, account }))} />
                            <PayPalWithdrawForm accounts={accounts} config={config} onDone={load} />
                        </div>
                        <PayPalWithdrawalHistory items={history} onChange={load} />
                    </>
                )}
            </div>
        </Layout>
    );
}
