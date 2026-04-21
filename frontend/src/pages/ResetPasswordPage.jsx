import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { authAPI } from '../lib/api';
import { toast } from 'sonner';
import { Lock, ArrowLeft, Loader2, CheckCircle, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { AuthBackground } from '../components/auth/AuthBackground';
import { AuthLogo } from '../components/auth/AuthLogo';

export const ResetPasswordPage = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();
    
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!token) {
            setError('Enlace de restablecimiento inválido. Por favor solicita uno nuevo.');
        }
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!newPassword || newPassword.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            toast.error('Las contraseñas no coinciden');
            return;
        }
        
        setLoading(true);
        setError('');
        
        try {
            await authAPI.resetPassword({ token, new_password: newPassword });
            setSuccess(true);
            toast.success('¡Contraseña restablecida correctamente!');
        } catch (err) {
            const message = err.response?.data?.detail || 'No se pudo restablecer la contraseña. El enlace puede haber expirado.';
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen flex items-center justify-center p-4 bg-[#040914]">
            <AuthBackground />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md relative"
                style={{ zIndex: 10 }}
            >
                <div className="mb-6">
                    <AuthLogo subtitle="Seguridad y protección de tu cuenta" />
                </div>

                <Card className="bg-slate-900/70 backdrop-blur-2xl border-slate-800/80 shadow-2xl shadow-black/40 ring-1 ring-white/5">
                    <CardHeader className="text-center pb-2">
                        <CardTitle className="text-2xl font-bold text-white">
                            {success ? '¡Contraseña actualizada!' : 'Nueva contraseña'}
                        </CardTitle>
                        <CardDescription className="text-slate-400">
                            {success 
                                ? 'Tu contraseña ha sido actualizada correctamente'
                                : 'Ingresa tu nueva contraseña a continuación'
                            }
                        </CardDescription>
                    </CardHeader>
                    
                    <CardContent className="pt-6">
                        {success ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="text-center space-y-6"
                            >
                                <div className="w-20 h-20 bg-emerald-500/20 rounded-full mx-auto flex items-center justify-center">
                                    <CheckCircle className="w-10 h-10 text-emerald-400" />
                                </div>
                                
                                <div className="space-y-2">
                                    <p className="text-slate-300">
                                        Tu contraseña ha sido restablecida correctamente. Ya puedes iniciar sesión con tu nueva contraseña.
                                    </p>
                                </div>

                                <Link to="/login" className="block">
                                    <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white">
                                        Ir a Iniciar Sesión
                                    </Button>
                                </Link>
                            </motion.div>
                        ) : error && !token ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="text-center space-y-6"
                            >
                                <div className="w-20 h-20 bg-red-500/20 rounded-full mx-auto flex items-center justify-center">
                                    <AlertTriangle className="w-10 h-10 text-red-400" />
                                </div>
                                
                                <div className="space-y-2">
                                    <p className="text-red-400 font-medium">Enlace no válido</p>
                                    <p className="text-slate-400 text-sm">
                                        Este enlace de restablecimiento es inválido o ha expirado. Por favor solicita uno nuevo.
                                    </p>
                                </div>

                                <Link to="/forgot-password" className="block">
                                    <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white">
                                        Solicitar nuevo enlace
                                    </Button>
                                </Link>
                            </motion.div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-6">
                                {error && (
                                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                                        <p className="text-red-400 text-sm">{error}</p>
                                    </div>
                                )}
                                
                                <div className="space-y-2">
                                    <Label htmlFor="newPassword" className="text-slate-300">Nueva contraseña</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                        <Input
                                            id="newPassword"
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Ingresa tu nueva contraseña"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            className="pl-10 pr-10 bg-slate-950 border-slate-800 text-white placeholder:text-slate-600 focus:border-emerald-500"
                                            data-testid="new-password-input"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="confirmPassword" className="text-slate-300">Confirmar contraseña</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                        <Input
                                            id="confirmPassword"
                                            type={showConfirmPassword ? "text" : "password"}
                                            placeholder="Confirma tu nueva contraseña"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="pl-10 pr-10 bg-slate-950 border-slate-800 text-white placeholder:text-slate-600 focus:border-emerald-500"
                                            data-testid="confirm-password-input"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                                        >
                                            {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-6"
                                    data-testid="reset-password-submit-btn"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Restableciendo...
                                        </>
                                    ) : (
                                        'Restablecer contraseña'
                                    )}
                                </Button>

                                <div className="text-center">
                                    <Link 
                                        to="/login" 
                                        className="text-sm text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-2"
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                        Volver a Iniciar Sesión
                                    </Link>
                                </div>
                            </form>
                        )}
                    </CardContent>
                </Card>

                <p className="text-center text-slate-500 text-sm mt-6" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>
                    LIONSBIT VERIFICACIÓN — Banca segura
                </p>
            </motion.div>
        </div>
    );
};

export default ResetPasswordPage;
