import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Shield, Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        const result = await login(email, password);
        
        if (result.success) {
            toast.success('¡Bienvenido de nuevo!');
            navigate('/dashboard');
        } else {
            toast.error(result.error);
        }
        
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 noise-overlay">
            {/* Background glow */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px]" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative w-full max-w-md"
            >
                {/* Logo */}
                <div className="text-center mb-8">
                    <motion.div
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="inline-flex items-center gap-3 mb-4"
                    >
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center glow-emerald">
                            <Shield className="w-7 h-7 text-emerald-400" />
                        </div>
                        <h1 className="text-2xl text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>LIONSBIT VERIFICACION</h1>
                    </motion.div>
                    <p className="text-slate-500 font-light">Plataforma de Verificación Digital</p>
                </div>

                <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>Bienvenido</CardTitle>
                        <CardDescription className="text-slate-400 font-light">
                            Inicia sesión para acceder a tus cuentas
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-slate-300 font-normal">Email</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="Ingresa tu email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="pl-10 bg-slate-950/50 border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 text-white placeholder:text-slate-600"
                                        required
                                        data-testid="login-email-input"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-slate-300 font-normal">Contraseña</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                    <Input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Ingresa tu contraseña"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="pl-10 pr-10 bg-slate-950/50 border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 text-white placeholder:text-slate-600"
                                        required
                                        data-testid="login-password-input"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                                        data-testid="toggle-password-visibility"
                                    >
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_0_15px_rgba(25,115,184,0.4)] transition-shadow hover:shadow-[0_0_25px_rgba(25,115,184,0.5)]"
                                style={{ fontWeight: 500 }}
                                data-testid="login-submit-btn"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Iniciando sesión...
                                    </>
                                ) : (
                                    'Iniciar Sesión'
                                )}
                            </Button>

                            <div className="text-right">
                                <Link
                                    to="/forgot-password"
                                    className="text-sm text-slate-500 hover:text-emerald-400 transition-colors font-normal"
                                    data-testid="forgot-password-link"
                                >
                                    ¿Olvidaste tu contraseña?
                                </Link>
                            </div>
                        </form>

                        <div className="mt-6 text-center">
                            <p className="text-slate-500 font-light">
                                ¿No tienes cuenta?{' '}
                                <Link
                                    to="/register"
                                    className="text-emerald-400 hover:text-emerald-300 transition-colors"
                                    style={{ fontWeight: 500 }}
                                    data-testid="register-link"
                                >
                                    Crear una
                                </Link>
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Legal Disclaimer */}
                <div className="mt-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <p className="text-amber-400 text-xs text-center">
                        <strong>⚠️ Aviso Legal:</strong> Los datos mostrados en esta plataforma relacionados con mercados financieros y criptomonedas son únicamente informativos. 
                        No constituyen asesoramiento financiero ni representan una invitación a invertir. 
                        La plataforma no está habilitada para realizar inversiones .
                    </p>
                </div>
            </motion.div>
        </div>
    );
};

export default LoginPage;
