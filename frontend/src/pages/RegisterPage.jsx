import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Mail, Lock, User, Loader2, Eye, EyeOff, Phone, Calendar, Users } from 'lucide-react';
import { toast } from 'sonner';
import { AuthBackground } from '../components/auth/AuthBackground';
import { AuthLogo } from '../components/auth/AuthLogo';

const COUNTRIES = [
    { code: '+34', name: 'Espana', flag: 'ES' },
    { code: '+52', name: 'Mexico', flag: 'MX' },
    { code: '+57', name: 'Colombia', flag: 'CO' },
    { code: '+56', name: 'Chile', flag: 'CL' },
    { code: '+54', name: 'Argentina', flag: 'AR' },
    { code: '+51', name: 'Peru', flag: 'PE' },
    { code: '+593', name: 'Ecuador', flag: 'EC' },
    { code: '+58', name: 'Venezuela', flag: 'VE' },
    { code: '+502', name: 'Guatemala', flag: 'GT' },
    { code: '+507', name: 'Panama', flag: 'PA' },
    { code: '+506', name: 'Costa Rica', flag: 'CR' },
    { code: '+1', name: 'Estados Unidos', flag: 'US' },
    { code: '+44', name: 'Reino Unido', flag: 'GB' },
    { code: '+49', name: 'Alemania', flag: 'DE' },
    { code: '+33', name: 'Francia', flag: 'FR' },
    { code: '+39', name: 'Italia', flag: 'IT' },
    { code: '+351', name: 'Portugal', flag: 'PT' },
    { code: '+55', name: 'Brasil', flag: 'BR' },
    { code: '+591', name: 'Bolivia', flag: 'BO' },
    { code: '+595', name: 'Paraguay', flag: 'PY' },
    { code: '+598', name: 'Uruguay', flag: 'UY' },
    { code: '+503', name: 'El Salvador', flag: 'SV' },
    { code: '+504', name: 'Honduras', flag: 'HN' },
    { code: '+505', name: 'Nicaragua', flag: 'NI' },
    { code: '+53', name: 'Cuba', flag: 'CU' },
    { code: '+1-809', name: 'Rep. Dominicana', flag: 'DO' },
];

export const RegisterPage = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [phone, setPhone] = useState('');
    const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
    const [investmentYear, setInvestmentYear] = useState('');
    const [ownerDeceased, setOwnerDeceased] = useState(false);
    const [relationship, setRelationship] = useState('');
    const [loading, setLoading] = useState(false);
    const { register } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            toast.error('Las contrasenas no coinciden');
            return;
        }
        if (password.length < 6) {
            toast.error('La contrasena debe tener al menos 6 caracteres');
            return;
        }

        setLoading(true);
        const fullPhone = phone ? `${selectedCountry.code} ${phone}` : '';
        const result = await register(name, email, password, {
            phone: fullPhone,
            country_code: selectedCountry.code,
            country_name: selectedCountry.name,
            investment_year: investmentYear || null,
            owner_deceased: ownerDeceased,
            relationship: ownerDeceased ? relationship : null,
        });

        if (result.success) {
            toast.success('Cuenta creada exitosamente!');
            navigate('/dashboard');
        } else {
            toast.error(result.error);
        }
        setLoading(false);
    };

    const inputCls = "pl-10 bg-slate-950/50 border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 text-white placeholder:text-slate-600";

    return (
        <div className="relative min-h-screen flex items-center justify-center p-4 bg-[#040914]">
            <AuthBackground />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative w-full max-w-lg"
                style={{ zIndex: 10 }}
            >
                {/* Logo */}
                <div className="mb-6">
                    <AuthLogo subtitle="Plataforma de Verificación Digital Privada" />
                </div>

                <Card className="bg-slate-900/70 backdrop-blur-2xl border-slate-800/80 shadow-2xl shadow-black/40 ring-1 ring-white/5">
                    <CardHeader className="text-center pb-4">
                        <CardTitle className="text-xl font-heading text-white">Crear Cuenta</CardTitle>
                        <CardDescription className="text-slate-400">
                            Complete el formulario para registrarse
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Name */}
                            <div className="space-y-1.5">
                                <Label htmlFor="name" className="text-slate-300 text-sm">Nombre Completo</Label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <Input id="name" type="text" placeholder="Nombre y apellidos" value={name}
                                        onChange={(e) => setName(e.target.value)} className={inputCls} required data-testid="register-name-input" />
                                </div>
                            </div>

                            {/* Email */}
                            <div className="space-y-1.5">
                                <Label htmlFor="email" className="text-slate-300 text-sm">Email</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <Input id="email" type="email" placeholder="correo@ejemplo.com" value={email}
                                        onChange={(e) => setEmail(e.target.value)} className={inputCls} required data-testid="register-email-input" />
                                </div>
                            </div>

                            {/* Phone + Country */}
                            <div className="space-y-1.5">
                                <Label className="text-slate-300 text-sm">Telefono y Pais</Label>
                                <div className="flex gap-2">
                                    <select
                                        value={selectedCountry.code}
                                        onChange={(e) => setSelectedCountry(COUNTRIES.find(c => c.code === e.target.value) || COUNTRIES[0])}
                                        className="bg-slate-950/50 border border-slate-800 text-white rounded-md px-2 text-sm w-[130px] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50"
                                        data-testid="register-country-select"
                                    >
                                        {COUNTRIES.map(c => (
                                            <option key={c.code} value={c.code}>{c.flag} {c.code} {c.name}</option>
                                        ))}
                                    </select>
                                    <div className="relative flex-1">
                                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                        <Input type="tel" placeholder="Numero de telefono" value={phone}
                                            onChange={(e) => setPhone(e.target.value)} className={inputCls} data-testid="register-phone-input" />
                                    </div>
                                </div>
                            </div>

                            {/* Passwords */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="password" className="text-slate-300 text-sm">Contrasena</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                        <Input id="password" type={showPassword ? "text" : "password"} placeholder="Min. 6 caracteres"
                                            value={password} onChange={(e) => setPassword(e.target.value)}
                                            className="pl-10 pr-9 bg-slate-950/50 border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 text-white placeholder:text-slate-600"
                                            required data-testid="register-password-input" />
                                        <button type="button" onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="confirmPassword" className="text-slate-300 text-sm">Confirmar</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                        <Input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="Repetir"
                                            value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="pl-10 pr-9 bg-slate-950/50 border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 text-white placeholder:text-slate-600"
                                            required data-testid="register-confirm-password-input" />
                                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Divider - Investment info */}
                            <div className="border-t border-slate-800 pt-4 mt-2">
                                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3 flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5" /> Informacion de Inversion
                                </p>
                            </div>

                            {/* Investment Year */}
                            <div className="space-y-1.5">
                                <Label className="text-slate-300 text-sm">Ano de Inversion</Label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <Input type="text" placeholder="Ej: 2020" value={investmentYear}
                                        onChange={(e) => setInvestmentYear(e.target.value)} className={inputCls}
                                        data-testid="register-investment-year" />
                                </div>
                            </div>

                            {/* Owner Deceased */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="ownerDeceased"
                                        checked={ownerDeceased}
                                        onChange={(e) => setOwnerDeceased(e.target.checked)}
                                        className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500/50"
                                        data-testid="register-deceased-check"
                                    />
                                    <Label htmlFor="ownerDeceased" className="text-slate-300 text-sm cursor-pointer">
                                        El titular de la inversion ha fallecido
                                    </Label>
                                </div>

                                {ownerDeceased && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-1.5"
                                    >
                                        <Label className="text-slate-300 text-sm">Parentesco con el titular</Label>
                                        <div className="relative">
                                            <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                            <select
                                                value={relationship}
                                                onChange={(e) => setRelationship(e.target.value)}
                                                className="w-full pl-10 h-10 bg-slate-950/50 border border-slate-800 text-white rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50"
                                                data-testid="register-relationship-select"
                                            >
                                                <option value="">Seleccione parentesco</option>
                                                <option value="Conyuge">Conyuge</option>
                                                <option value="Hijo/a">Hijo/a</option>
                                                <option value="Padre/Madre">Padre/Madre</option>
                                                <option value="Hermano/a">Hermano/a</option>
                                                <option value="Nieto/a">Nieto/a</option>
                                                <option value="Sobrino/a">Sobrino/a</option>
                                                <option value="Otro familiar">Otro familiar</option>
                                                <option value="Apoderado legal">Apoderado legal</option>
                                            </select>
                                        </div>
                                    </motion.div>
                                )}
                            </div>

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium shadow-[0_0_15px_rgba(25,115,184,0.4)] transition-shadow hover:shadow-[0_0_25px_rgba(25,115,184,0.5)] mt-2"
                                data-testid="register-submit-btn"
                            >
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creando cuenta...</>
                                ) : (
                                    'Crear Cuenta'
                                )}
                            </Button>
                        </form>

                        <div className="mt-5 text-center">
                            <p className="text-slate-500 text-sm">
                                Ya tiene una cuenta?{' '}
                                <Link to="/login" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors" data-testid="login-link">
                                    Iniciar sesion
                                </Link>
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
};

export default RegisterPage;
