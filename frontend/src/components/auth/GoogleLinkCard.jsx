import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { authAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Link2, Unlink, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export const startGoogleLink = () => {
    const redirectUrl = window.location.origin + '/settings?link=google';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
};

const fmt = (iso) => !iso ? '' : new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const GoogleLinkCard = () => {
    const [st, setSt] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try { const r = await authAPI.googleStatus(); setSt(r.data); } catch { setSt({ linked: false, has_password: true }); }
    };
    useEffect(() => { load(); }, []);

    const unlink = async () => {
        if (!window.confirm('¿Desvincular tu cuenta de Google? Seguirás pudiendo entrar con tu contraseña.')) return;
        setBusy(true);
        try { await authAPI.googleUnlink(); toast.success('Cuenta de Google desvinculada'); load(); }
        catch (e) { toast.error(e.response?.data?.detail || 'No se pudo desvincular'); }
        finally { setBusy(false); }
    };

    return (
        <Card id="google" className="bg-slate-900/70 backdrop-blur-xl border-slate-800 scroll-mt-24" data-testid="google-link-card">
            <CardHeader>
                <CardTitle className="text-white font-heading flex items-center gap-2">
                    <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.8-.4-4H24v8.1h12.7c-.3 2.1-1.7 5.3-4.8 7.4l7.4 5.7c4.4-4.1 7.2-10.1 7.2-17.2z" /><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2 1.4-4.7 2.4-8.5 2.4-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>
                    Acceso con Google
                </CardTitle>
            </CardHeader>
            <CardContent>
                {!st ? <Loader2 className="w-5 h-5 text-slate-400 animate-spin" /> : st.linked ? (
                    <div className="flex flex-wrap items-center justify-between gap-3" data-testid="google-linked-state">
                        <div className="flex items-center gap-3 min-w-0">
                            {st.picture ? <img src={st.picture} alt="" className="w-10 h-10 rounded-full ring-1 ring-white/15" referrerPolicy="no-referrer" /> : <CheckCircle2 className="w-8 h-8 text-emerald-400" />}
                            <div className="min-w-0">
                                <p className="text-white text-[13px] font-semibold flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Vinculada</p>
                                <p className="text-slate-400 text-[12px] truncate" data-testid="google-linked-email">{st.google_email}{st.linked_at ? ` · desde ${fmt(st.linked_at)}` : ''}</p>
                            </div>
                        </div>
                        <Button variant="outline" size="sm" disabled={busy || !st.has_password} onClick={unlink}
                            className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" data-testid="google-unlink-btn">
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Unlink className="w-4 h-4 mr-1.5" /> Desvincular</>}
                        </Button>
                        {!st.has_password && (
                            <p className="w-full text-[11.5px] text-amber-300 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Establece una contraseña antes de desvincular Google para no perder el acceso.</p>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3" data-testid="google-unlinked-state">
                        <p className="text-slate-400 text-[13px]">Conecta tu cuenta de Google para iniciar sesión con un clic, sin contraseña.</p>
                        <Button size="sm" onClick={startGoogleLink} className="bg-white text-slate-900 hover:bg-slate-100 font-semibold" data-testid="google-link-btn">
                            <Link2 className="w-4 h-4 mr-1.5" /> Vincular Google
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
