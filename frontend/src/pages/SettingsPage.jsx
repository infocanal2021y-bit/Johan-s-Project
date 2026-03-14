import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { authAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { 
    Settings, 
    Lock, 
    History, 
    Monitor,
    Globe,
    Clock,
    Loader2,
    Eye,
    EyeOff,
    CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';

export const SettingsPage = () => {
    const { user } = useAuth();
    const [loginHistory, setLoginHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [passwords, setPasswords] = useState({
        current: '',
        new: '',
        confirm: ''
    });
    const [showPasswords, setShowPasswords] = useState({
        current: false,
        new: false,
        confirm: false
    });
    const [changingPassword, setChangingPassword] = useState(false);

    useEffect(() => {
        const fetchLoginHistory = async () => {
            try {
                const response = await authAPI.getLoginHistory();
                setLoginHistory(response.data);
            } catch (error) {
                console.error('Failed to load login history');
            } finally {
                setLoading(false);
            }
        };
        fetchLoginHistory();
    }, []);

    const handleChangePassword = async () => {
        if (!passwords.current || !passwords.new || !passwords.confirm) {
            toast.error('Please fill in all password fields');
            return;
        }
        
        if (passwords.new.length < 6) {
            toast.error('New password must be at least 6 characters');
            return;
        }
        
        if (passwords.new !== passwords.confirm) {
            toast.error('New passwords do not match');
            return;
        }

        setChangingPassword(true);
        try {
            await authAPI.changePassword({
                current_password: passwords.current,
                new_password: passwords.new
            });
            toast.success('Password changed successfully');
            setPasswords({ current: '', new: '', confirm: '' });
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to change password');
        } finally {
            setChangingPassword(false);
        }
    };

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-8">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl font-heading font-bold text-white flex items-center gap-3">
                        <Settings className="w-8 h-8 text-emerald-400" />
                        Account Settings
                    </h1>
                    <p className="text-slate-500 mt-1">Manage your account security and preferences</p>
                </motion.div>

                {/* Login Info Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white font-heading flex items-center gap-2">
                                <History className="w-5 h-5 text-cyan-400" />
                                Recent Login Activity
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="space-y-3">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="h-16 bg-slate-800/50 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : loginHistory.length === 0 ? (
                                <p className="text-slate-400 text-center py-8">No login history available</p>
                            ) : (
                                <div className="space-y-3">
                                    {loginHistory.map((login, index) => (
                                        <div
                                            key={login.id}
                                            className={`p-4 rounded-lg ${index === 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/50'}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${index === 0 ? 'bg-emerald-500/20' : 'bg-slate-700'}`}>
                                                        <Monitor className={`w-5 h-5 ${index === 0 ? 'text-emerald-400' : 'text-slate-400'}`} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-white font-medium">
                                                                {login.browser} on {login.device}
                                                            </p>
                                                            {index === 0 && (
                                                                <span className="text-xs text-emerald-400 px-2 py-0.5 bg-emerald-500/20 rounded">
                                                                    Current Session
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                                                            <span className="flex items-center gap-1">
                                                                <Globe className="w-3 h-3" />
                                                                {login.ip_address}
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <Clock className="w-3 h-3" />
                                                                {login.location}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm text-slate-400">
                                                        {new Date(login.logged_in_at).toLocaleDateString()}
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        {new Date(login.logged_in_at).toLocaleTimeString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Change Password Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white font-heading flex items-center gap-2">
                                <Lock className="w-5 h-5 text-amber-400" />
                                Change Password
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-slate-300">Current Password</Label>
                                <div className="relative">
                                    <Input
                                        type={showPasswords.current ? 'text' : 'password'}
                                        value={passwords.current}
                                        onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                                        className="bg-slate-950 border-slate-800 text-white pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                    >
                                        {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <Label className="text-slate-300">New Password</Label>
                                <div className="relative">
                                    <Input
                                        type={showPasswords.new ? 'text' : 'password'}
                                        value={passwords.new}
                                        onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                                        className="bg-slate-950 border-slate-800 text-white pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                    >
                                        {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <Label className="text-slate-300">Confirm New Password</Label>
                                <div className="relative">
                                    <Input
                                        type={showPasswords.confirm ? 'text' : 'password'}
                                        value={passwords.confirm}
                                        onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                                        className="bg-slate-950 border-slate-800 text-white pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                    >
                                        {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <Button
                                onClick={handleChangePassword}
                                disabled={changingPassword}
                                className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                            >
                                {changingPassword ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                )}
                                Update Password
                            </Button>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Account Info Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white font-heading">Account Information</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-slate-500">Name</p>
                                    <p className="text-white">{user?.name}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500">Email</p>
                                    <p className="text-white">{user?.email}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500">Role</p>
                                    <p className="text-white capitalize">{user?.role}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500">Verification Status</p>
                                    <p className={`capitalize ${user?.verification_status === 'verified' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        {user?.verification_status}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </Layout>
    );
};

export default SettingsPage;
