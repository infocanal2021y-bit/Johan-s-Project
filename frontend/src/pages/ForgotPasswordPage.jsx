import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { authAPI } from '../lib/api';
import { toast } from 'sonner';
import { Mail, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import { AuthBackground } from '../components/auth/AuthBackground';
import { AuthLogo } from '../components/auth/AuthLogo';
import { SUPPORT_EMAIL } from '../config/branding';

export const ForgotPasswordPage = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!email) {
            toast.error('Por favor ingresa tu email');
            return;
        }
        
        setLoading(true);
        try {
            await authAPI.requestPasswordReset({ email });
            setSubmitted(true);
            toast.success('Instrucciones de recuperación enviadas');
        } catch (error) {
            // Always show success to prevent email enumeration
            setSubmitted(true);
            toast.success('Si este email existe, te hemos enviado instrucciones');
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
                    <AuthLogo subtitle="Recupera el acceso a tu cuenta" />
                </div>

                <Card className="bg-slate-900/70 backdrop-blur-2xl border-slate-800/80 shadow-2xl shadow-black/40 ring-1 ring-white/5">
                    <CardHeader className="text-center pb-2">
                        <CardTitle className="text-2xl font-bold text-white">
                            {submitted ? 'Revisa tu email' : '¿Olvidaste tu contraseña?'}
                        </CardTitle>
                        <CardDescription className="text-slate-400">
                            {submitted 
                                ? 'Enviamos instrucciones de recuperación a tu email'
                                : 'Ingresa tu email para recibir instrucciones de recuperación'
                            }
                        </CardDescription>
                    </CardHeader>
                    
                    <CardContent className="pt-6">
                        {submitted ? (
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
                                        Si existe una cuenta asociada a <span className="text-emerald-400 font-medium">{email}</span>, 
                                        recibirás un email con instrucciones para restablecer tu contraseña.
                                    </p>
                                    <p className="text-sm text-slate-500">
                                        Revisa tu bandeja de entrada y la carpeta de spam.
                                    </p>
                                </div>

                                <div className="pt-4 space-y-3">
                                    <Button
                                        onClick={() => setSubmitted(false)}
                                        variant="outline"
                                        className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                                    >
                                        Probar otro email
                                    </Button>
                                    
                                    <Link to="/login" className="block">
                                        <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white">
                                            <ArrowLeft className="w-4 h-4 mr-2" />
                                            Volver a Iniciar Sesión
                                        </Button>
                                    </Link>
                                </div>
                            </motion.div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-slate-300">Dirección de email</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="tu@correo.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="pl-10 bg-slate-950 border-slate-800 text-white placeholder:text-slate-600 focus:border-emerald-500"
                                            data-testid="forgot-password-email-input"
                                        />
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-6"
                                    data-testid="forgot-password-submit-btn"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Enviando...
                                        </>
                                    ) : (
                                        'Enviar email de recuperación'
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
                    ¿Necesitas ayuda? Contacta {SUPPORT_EMAIL}
                </p>
            </motion.div>
        </div>
    );
};

export default ForgotPasswordPage;
