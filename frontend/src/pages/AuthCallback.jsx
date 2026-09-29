import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../lib/api';
import { Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
    const location = useLocation();
    const navigate = useNavigate();
    const { setSession, verify2fa } = useAuth();
    const hasProcessed = useRef(false);
    const [error, setError] = useState(null);
    const [twoFA, setTwoFA] = useState(null);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (hasProcessed.current) return;
        hasProcessed.current = true;
        const params = new URLSearchParams(location.hash.replace(/^#/, ''));
        const sessionId = params.get('session_id');
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        if (!sessionId) { navigate('/login', { replace: true }); return; }
        (async () => {
            try {
                const r = await authAPI.googleSession(sessionId);
                if (r.data?.requires_2fa) { setTwoFA({ challenge_id: r.data.challenge_id, email: r.data.email }); return; }
                setSession(r.data.token, { ...r.data.user, must_change_password: !!r.data.must_change_password });
                navigate(r.data.must_change_password ? '/force-password-change' : '/dashboard', { replace: true, state: { user: r.data.user } });
            } catch (e) {
                setError(e.response?.data?.detail || 'No se pudo completar el acceso con Google.');
            }
        })();
    }, [location.hash, navigate, setSession]);

    const submit2fa = async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await verify2fa(twoFA.challenge_id, code.trim());
        setBusy(false);
        if (res.success) navigate(res.must_change_password ? '/force-password-change' : '/dashboard', { replace: true });
        else setError(res.error);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#050505] px-4" data-testid="auth-callback">
            <div className="w-full max-w-sm rounded-2xl ring-1 ring-white/10 bg-[#0a0f1a] p-8 text-center">
                <img src="/lionsbit-logo.jpg" alt="Lionsbit" className="w-14 h-14 rounded-xl mx-auto mb-4 ring-1 ring-white/15 object-cover" />
                {twoFA ? (
                    <form onSubmit={submit2fa} className="space-y-4 text-left" data-testid="auth-callback-2fa">
                        <div className="text-center">
                            <ShieldCheck className="w-8 h-8 text-[#7CB1E5] mx-auto mb-2" />
                            <h1 className="text-white text-lg font-bold">Verificación en dos pasos</h1>
                            <p className="text-slate-400 text-[12.5px] mt-1">Hemos enviado un código de 6 dígitos a <span className="text-white">{twoFA.email}</span></p>
                        </div>
                        <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="000000"
                            className="bg-slate-950 border-slate-700 text-white text-center text-xl tracking-[0.4em] font-mono" data-testid="auth-callback-2fa-input" />
                        {error && <p className="text-rose-300 text-[12px] flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {error}</p>}
                        <Button type="submit" disabled={busy || code.length !== 6} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white" data-testid="auth-callback-2fa-submit">
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verificar y entrar'}
                        </Button>
                    </form>
                ) : error ? (
                    <div className="space-y-4" data-testid="auth-callback-error">
                        <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
                        <p className="text-white font-semibold">No se pudo iniciar sesión</p>
                        <p className="text-slate-400 text-[12.5px]">{error}</p>
                        <Button onClick={() => navigate('/login', { replace: true })} className="w-full bg-[#1973B8] hover:bg-[#1F89D8] text-white" data-testid="auth-callback-back">Volver al inicio de sesión</Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <Loader2 className="w-7 h-7 text-[#7CB1E5] mx-auto animate-spin" />
                        <p className="text-slate-300 text-[13px]">Completando acceso con Google…</p>
                    </div>
                )}
            </div>
        </div>
    );
}
