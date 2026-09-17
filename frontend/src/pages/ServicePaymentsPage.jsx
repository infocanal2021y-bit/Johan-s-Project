import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import api from '../lib/api';
import { toast } from 'sonner';
import { CreditCard, ShieldCheck, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

export default function ServicePaymentsPage() {
    const [services, setServices] = useState(null);
    const [paying, setPaying] = useState(null);

    useEffect(() => {
        api.get('/service-payments/catalog').then((r) => setServices(r.data.services || [])).catch(() => setServices([]));
    }, []);

    const pay = async (lookup_key) => {
        setPaying(lookup_key);
        try {
            const r = await api.post('/service-payments/checkout', { lookup_key, origin_url: window.location.origin });
            window.location.href = r.data.checkout_url;
        } catch (e) {
            toast.error(e.response?.data?.detail || 'No se pudo iniciar el pago');
            setPaying(null);
        }
    };

    return (
        <Layout>
            <div className="max-w-3xl mx-auto space-y-4 p-3 sm:p-5" data-testid="service-payments-page">
                <div className="relative overflow-hidden rounded-2xl border border-[#635BFF]/30 bg-gradient-to-br from-[#0A111F] via-[#0E182A] to-[#080E1A] p-5">
                    <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-xl bg-[#635BFF]/15 ring-1 ring-[#635BFF]/40 flex items-center justify-center">
                            <CreditCard className="w-5 h-5 text-[#8f89ff]" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-[#8f89ff] font-bold">Pago seguro con tarjeta · Stripe</p>
                            <h1 className="text-xl sm:text-2xl font-bold text-white">Pagos de Servicios</h1>
                            <p className="text-slate-400 text-xs mt-1">Servicios autorizados y abonos de la plataforma. Precios fijados por el servidor; pago procesado por Stripe.</p>
                        </div>
                    </div>
                </div>

                {!services && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div>}
                {services && services.length === 0 && <p className="text-slate-500 text-sm text-center py-8">No hay servicios disponibles.</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(services || []).map((s) => (
                        <div key={s.lookup_key} className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 flex flex-col gap-3" data-testid={`service-${s.lookup_key}`}>
                            <div>
                                <p className="text-white text-sm font-bold leading-snug">{s.name}</p>
                                <p className="text-2xl font-bold text-[#8f89ff] font-mono mt-1">{s.amount_label}
                                    <span className="text-[11px] text-slate-500 ml-1.5 uppercase">{s.currency}</span></p>
                            </div>
                            <Button onClick={() => pay(s.lookup_key)} disabled={paying === s.lookup_key}
                                className="w-full bg-[#635BFF] hover:bg-[#7a73ff] text-white font-bold h-10 mt-auto"
                                data-testid={`pay-${s.lookup_key}`}>
                                {paying === s.lookup_key ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1.5" />}
                                Pagar con tarjeta
                            </Button>
                        </div>
                    ))}
                </div>
                <p className="text-[10.5px] text-slate-500 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> Checkout cifrado de Stripe · no almacenamos datos de su tarjeta · recibo por email al confirmarse.
                </p>
            </div>
        </Layout>
    );
}

export const PaymentSuccessPage = () => {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const sessionId = params.get('session_id');
    const [state, setState] = useState('checking');

    useEffect(() => {
        if (!sessionId) { setState('error'); return; }
        let tries = 0;
        const poll = async () => {
            tries += 1;
            try {
                const r = await api.get(`/payments/status/${sessionId}`);
                if (r.data.payment_status === 'paid') { setState('paid'); return; }
                if (['failed', 'expired'].includes(r.data.payment_status)) { setState('failed'); return; }
            } catch { /* keep polling */ }
            if (tries < 10) setTimeout(poll, 2000); else setState('timeout');
        };
        poll();
    }, [sessionId]);

    return (
        <Layout>
            <div className="max-w-md mx-auto mt-12 rounded-2xl bg-slate-900/70 border border-slate-800 p-8 text-center" data-testid="payment-success-page">
                {state === 'checking' && (<><Loader2 className="w-10 h-10 text-[#8f89ff] animate-spin mx-auto" /><p className="text-white font-bold mt-4">Confirmando su pago…</p><p className="text-slate-400 text-xs mt-1">No cierre esta página.</p></>)}
                {state === 'paid' && (<><CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" /><p className="text-white font-bold text-lg mt-4" data-testid="payment-confirmed">¡Pago confirmado!</p><p className="text-slate-400 text-xs mt-1">Le hemos enviado el recibo por email.</p></>)}
                {state === 'failed' && (<><XCircle className="w-12 h-12 text-rose-400 mx-auto" /><p className="text-white font-bold mt-4">El pago no se completó</p></>)}
                {(state === 'timeout' || state === 'error') && (<><Clock className="w-12 h-12 text-amber-400 mx-auto" /><p className="text-white font-bold mt-4">Verificación en curso</p><p className="text-slate-400 text-xs mt-1">Su pago se está procesando; revise sus notificaciones en unos minutos.</p></>)}
                <Button onClick={() => navigate('/pagos-servicios')} variant="outline" className="mt-6 border-slate-700 text-slate-300">Volver a Pagos de Servicios</Button>
            </div>
        </Layout>
    );
};

export const PaymentCancelPage = () => {
    const navigate = useNavigate();
    return (
        <Layout>
            <div className="max-w-md mx-auto mt-12 rounded-2xl bg-slate-900/70 border border-slate-800 p-8 text-center" data-testid="payment-cancel-page">
                <XCircle className="w-12 h-12 text-amber-400 mx-auto" />
                <p className="text-white font-bold mt-4">Pago cancelado</p>
                <p className="text-slate-400 text-xs mt-1">No se realizó ningún cargo.</p>
                <Button onClick={() => navigate('/pagos-servicios')} variant="outline" className="mt-6 border-slate-700 text-slate-300">Volver</Button>
            </div>
        </Layout>
    );
};
