import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ShieldCheck, Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { authAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';

// Mandatory password change for reactivated accounts (imported from legacy base)
export default function ForcePasswordChangePage() {
    const { user, logout, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showNext, setShowNext] = useState(false);
    const [busy, setBusy] = useState(false);

    // Password strength
    const len = next.length;
    const hasLetter = /[a-zA-Z]/.test(next);
    const hasNumber = /\d/.test(next);
    const strong = len >= 8 && hasLetter && hasNumber;

    const submit = async (e) => {
        e.preventDefault();
        if (!strong) {
            toast.error('La nueva contraseña debe tener al menos 8 caracteres, incluir letras y números');
            return;
        }
        if (next !== confirm) {
            toast.error('Las contraseñas no coinciden');
            return;
        }
        if (next === current) {
            toast.error('La nueva contraseña debe ser diferente a la actual');
            return;
        }
        setBusy(true);
        try {
            await authAPI.changePassword({ current_password: current, new_password: next });
            toast.success('Contraseña actualizada · bienvenido de vuelta');
            await refreshUser();
            navigate('/dashboard', { replace: true });
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo actualizar la contraseña');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 flex items-center justify-center p-4 relative overflow-hidden" data-testid="force-password-change-page">
            {/* Decorative */}
            <div aria-hidden="true" className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full opacity-20 blur-3xl"
                style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.5), transparent 65%)' }} />
            <div aria-hidden="true" className="absolute -bottom-32 -right-32 w-[460px] h-[460px] rounded-full opacity-15 blur-3xl"
                style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.45), transparent 65%)' }} />
            <div aria-hidden="true" className="absolute inset-0 opacity-[0.04]"
                style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 18px, #14549C 18px, #14549C 19px)' }} />

            <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="relative w-full max-w-md bg-slate-950/70 ring-1 ring-slate-800/80 backdrop-blur-md rounded-2xl shadow-2xl"
            >
                <div className="px-6 pt-6 pb-4 border-b border-slate-800/80">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/25 to-amber-700/15 ring-1 ring-amber-500/40 flex items-center justify-center shadow-lg shadow-amber-500/20">
                            <ShieldCheck className="w-5 h-5 text-amber-200" strokeWidth={2.4} />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-amber-300 font-bold">Seguridad · Obligatorio</p>
                            <h1 className="text-xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>
                                Actualiza tu contraseña
                            </h1>
                        </div>
                    </div>
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 text-amber-200 text-[12px] leading-relaxed" data-testid="force-password-change-banner">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>
                            Por motivos de seguridad, debe actualizar su contraseña antes de continuar.
                        </span>
                    </div>
                </div>

                <form onSubmit={submit} className="px-6 py-5 space-y-4" data-testid="force-password-change-form">
                    {user?.email && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/60 ring-1 ring-slate-800 text-[12px]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-slate-400">Cuenta reactivada:</span>
                            <span className="text-white font-mono truncate">{user.email}</span>
                        </div>
                    )}

                    <label className="block">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Contraseña temporal actual</span>
                        <div className="relative mt-1">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type="password"
                                required
                                value={current}
                                onChange={(e) => setCurrent(e.target.value)}
                                placeholder="lionsbit2.0"
                                autoComplete="current-password"
                                data-testid="force-password-current-input"
                                className="w-full h-11 pl-9 pr-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-[13px] focus:outline-none focus:border-cyan-500/50"
                            />
                        </div>
                    </label>

                    <label className="block">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Nueva contraseña</span>
                        <div className="relative mt-1">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type={showNext ? 'text' : 'password'}
                                required
                                value={next}
                                onChange={(e) => setNext(e.target.value)}
                                placeholder="Mínimo 8 caracteres"
                                autoComplete="new-password"
                                data-testid="force-password-new-input"
                                className="w-full h-11 pl-9 pr-10 rounded-lg bg-slate-950 border border-slate-800 text-white text-[13px] focus:outline-none focus:border-cyan-500/50"
                            />
                            <button
                                type="button"
                                data-no-hover
                                onClick={() => setShowNext(s => !s)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300"
                                tabIndex={-1}
                            >
                                {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {/* Strength meter */}
                        {next.length > 0 && (
                            <div className="mt-2 space-y-1.5" data-testid="force-password-strength">
                                <div className="flex items-center gap-1.5">
                                    {[1, 2, 3].map((n) => {
                                        const active = (n === 1 && len >= 4) || (n === 2 && len >= 8) || (n === 3 && strong);
                                        const color = strong ? 'bg-emerald-400' : len >= 8 ? 'bg-amber-400' : 'bg-rose-400';
                                        return <span key={n} className={`h-1 flex-1 rounded-full transition-colors ${active ? color : 'bg-slate-800'}`} />;
                                    })}
                                </div>
                                <div className="flex items-center gap-3 text-[10.5px]">
                                    <span className={len >= 8 ? 'text-emerald-400' : 'text-slate-500'}>✓ 8+ caracteres</span>
                                    <span className={hasLetter ? 'text-emerald-400' : 'text-slate-500'}>✓ Letras</span>
                                    <span className={hasNumber ? 'text-emerald-400' : 'text-slate-500'}>✓ Números</span>
                                </div>
                            </div>
                        )}
                    </label>

                    <label className="block">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Confirmar nueva contraseña</span>
                        <div className="relative mt-1">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type={showNext ? 'text' : 'password'}
                                required
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                placeholder="Repite la nueva contraseña"
                                autoComplete="new-password"
                                data-testid="force-password-confirm-input"
                                className="w-full h-11 pl-9 pr-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-[13px] focus:outline-none focus:border-cyan-500/50"
                            />
                        </div>
                        {confirm && next !== confirm && (
                            <p className="text-rose-300 text-[10.5px] mt-1">Las contraseñas no coinciden</p>
                        )}
                    </label>

                    <Button
                        type="submit"
                        disabled={busy || !strong || next !== confirm || !current}
                        data-testid="force-password-change-submit"
                        className="w-full h-11 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold tracking-wider shadow-lg shadow-cyan-500/20"
                    >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                        Actualizar y continuar
                    </Button>

                    <button
                        type="button"
                        data-no-hover
                        onClick={async () => { await logout(); navigate('/login'); }}
                        className="w-full text-center text-[11px] text-slate-500 hover:text-slate-300"
                    >
                        Cerrar sesión
                    </button>
                </form>
            </motion.div>
        </div>
    );
}
