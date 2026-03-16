import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { authAPI } from '../lib/api';
import { toast } from 'sonner';
import { Mail, ArrowLeft, Loader2, CheckCircle, Shield } from 'lucide-react';

export const ForgotPasswordPage = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!email) {
            toast.error('Please enter your email');
            return;
        }
        
        setLoading(true);
        try {
            await authAPI.requestPasswordReset({ email });
            setSubmitted(true);
            toast.success('Recovery instructions sent');
        } catch (error) {
            // Always show success to prevent email enumeration
            setSubmitted(true);
            toast.success('If this email exists, recovery instructions have been sent');
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
                            {submitted ? 'Check Your Email' : 'Forgot Password?'}
                        </CardTitle>
                        <CardDescription className="text-slate-400">
                            {submitted 
                                ? 'We sent recovery instructions to your email'
                                : 'Enter your email to receive recovery instructions'
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
                                        If an account exists with <span className="text-emerald-400 font-medium">{email}</span>, 
                                        you will receive an email with instructions to reset your password.
                                    </p>
                                    <p className="text-sm text-slate-500">
                                        Please check your inbox and spam folder.
                                    </p>
                                </div>

                                <div className="pt-4 space-y-3">
                                    <Button
                                        onClick={() => setSubmitted(false)}
                                        variant="outline"
                                        className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                                    >
                                        Try another email
                                    </Button>
                                    
                                    <Link to="/login" className="block">
                                        <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white">
                                            <ArrowLeft className="w-4 h-4 mr-2" />
                                            Back to Login
                                        </Button>
                                    </Link>
                                </div>
                            </motion.div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-slate-300">Email Address</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="Enter your email"
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
                                            Sending...
                                        </>
                                    ) : (
                                        'Send Recovery Email'
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
                    Need help? Contact support@paylionsbit.es
                </p>
            </motion.div>
        </div>
    );
};

export default ForgotPasswordPage;
