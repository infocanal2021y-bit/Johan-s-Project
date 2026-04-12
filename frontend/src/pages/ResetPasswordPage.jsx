import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { authAPI } from '../lib/api';
import { toast } from 'sonner';
import { Lock, ArrowLeft, Loader2, CheckCircle, Shield, Eye, EyeOff, AlertTriangle } from 'lucide-react';

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
            setError('Invalid reset link. Please request a new password reset.');
        }
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!newPassword || newPassword.length < 6) {
            toast.error('La contrasena debe tener al menos 6 caracteres');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            toast.error('Las contrasenas no coinciden');
            return;
        }
        
        setLoading(true);
        setError('');
        
        try {
            await authAPI.resetPassword({ token, new_password: newPassword });
            setSuccess(true);
            toast.success('Password reset successfully!');
        } catch (err) {
            const message = err.response?.data?.detail || 'Failed to reset password. The link may have expired.';
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
            {/* Background effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md relative z-10"
            >
                <Card className="bg-slate-900/80 backdrop-blur-xl border-slate-800 shadow-2xl">
                    <CardHeader className="text-center pb-2">
                        <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                            <Shield className="w-8 h-8 text-white" />
                        </div>
                        <CardTitle className="text-2xl font-bold text-white">
                            {success ? 'Password Reset!' : 'Create New Password'}
                        </CardTitle>
                        <CardDescription className="text-slate-400">
                            {success 
                                ? 'Your password has been updated successfully'
                                : 'Enter your new password below'
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
                                        Your password has been reset successfully. You can now log in with your new password.
                                    </p>
                                </div>

                                <Link to="/login" className="block">
                                    <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white">
                                        Go to Login
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
                                    <p className="text-red-400 font-medium">Invalid Reset Link</p>
                                    <p className="text-slate-400 text-sm">
                                        This password reset link is invalid or has expired. Please request a new one.
                                    </p>
                                </div>

                                <Link to="/forgot-password" className="block">
                                    <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white">
                                        Request New Link
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
                                    <Label htmlFor="newPassword" className="text-slate-300">New Password</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                        <Input
                                            id="newPassword"
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Enter new password"
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
                                    <Label htmlFor="confirmPassword" className="text-slate-300">Confirm Password</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                        <Input
                                            id="confirmPassword"
                                            type={showConfirmPassword ? "text" : "password"}
                                            placeholder="Confirm new password"
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
                                            Resetting...
                                        </>
                                    ) : (
                                        'Reset Password'
                                    )}
                                </Button>

                                <div className="text-center">
                                    <Link 
                                        to="/login" 
                                        className="text-sm text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-2"
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                        Back to Login
                                    </Link>
                                </div>
                            </form>
                        )}
                    </CardContent>
                </Card>

                <p className="text-center text-slate-600 text-sm mt-6">
                    LIONSBIT VERIFICACION - Secure Banking
                </p>
            </motion.div>
        </div>
    );
};

export default ResetPasswordPage;
