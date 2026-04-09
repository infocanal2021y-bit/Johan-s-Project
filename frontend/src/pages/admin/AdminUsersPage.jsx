import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Users, Edit, Shield, User, BadgeCheck, AlertTriangle, Ban, CheckCircle, Flame, Snowflake, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

const getScoreBadge = (score) => {
    switch (score) {
        case 'hot':
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30"><Flame className="w-3 h-3" />Alto</span>;
        case 'warm':
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30"><TrendingUp className="w-3 h-3" />Medio</span>;
        case 'cold':
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30"><Snowflake className="w-3 h-3" />Frio</span>;
        default:
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-700 text-slate-500">Sin datos</span>;
    }
};

export const AdminUsersPage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [balanceUsd, setBalanceUsd] = useState('');
    const [balanceEur, setBalanceEur] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [roleDialogOpen, setRoleDialogOpen] = useState(false);
    const [newRole, setNewRole] = useState('');

    const fetchUsers = async () => {
        try {
            const response = await adminAPI.getUsers();
            setUsers(response.data);
        } catch (error) {
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleEditBalance = (user, account) => {
        setSelectedUser(user);
        setSelectedAccount(account);
        setBalanceUsd(account.balance_usd.toString());
        setBalanceEur(account.balance_eur.toString());
        setDialogOpen(true);
    };

    const handleSaveBalance = async () => {
        try {
            await adminAPI.updateBalance({
                account_id: selectedAccount.id,
                balance_usd: parseFloat(balanceUsd),
                balance_eur: parseFloat(balanceEur),
            });
            toast.success('Balance updated successfully');
            setDialogOpen(false);
            fetchUsers();
        } catch (error) {
            toast.error('Failed to update balance');
        }
    };

    const handleEditRole = (user) => {
        setSelectedUser(user);
        setNewRole(user.role);
        setRoleDialogOpen(true);
    };

    const handleSaveRole = async () => {
        try {
            await adminAPI.updateUserRole({
                user_id: selectedUser.id,
                role: newRole,
            });
            toast.success('User role updated');
            setRoleDialogOpen(false);
            fetchUsers();
        } catch (error) {
            toast.error('Failed to update role');
        }
    };

    const handleSuspendUser = async (userId, action) => {
        try {
            await adminAPI.suspendUser({ user_id: userId, action });
            toast.success(action === 'suspend' ? 'User suspended' : 'User activated');
            fetchUsers();
        } catch (error) {
            toast.error('Failed to update user status');
        }
    };

    const getVerificationBadge = (status) => {
        switch (status) {
            case 'verified':
                return <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400 flex items-center gap-1"><BadgeCheck className="w-3 h-3" /> Verified</span>;
            case 'pending_verification':
                return <span className="px-2 py-1 rounded text-xs bg-cyan-500/20 text-cyan-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Pending</span>;
            default:
                return <span className="px-2 py-1 rounded text-xs bg-slate-700 text-slate-400">Unverified</span>;
        }
    };

    const getAccountStatusBadge = (status) => {
        switch (status) {
            case 'suspended':
                return <span className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400">Suspended</span>;
            case 'under_review':
                return <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-400">Under Review</span>;
            default:
                return <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400">Active</span>;
        }
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="admin-users-page">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-2xl sm:text-3xl font-heading font-bold text-white">Gestion de Usuarios</h1>
                    <p className="text-slate-500 mt-1">Administrar usuarios y puntuacion de interes</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader className="border-b border-slate-800">
                            <CardTitle className="text-white font-heading flex items-center gap-2">
                                <Users className="w-5 h-5 text-emerald-400" />
                                All Users ({users.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-8 space-y-4">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="h-16 bg-slate-800/50 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : (
                                <>
                                {/* Desktop Table */}
                                <div className="hidden md:block overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-800 hover:bg-transparent">
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">User</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Score</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Role</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">KYC Status</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Account Status</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Balances</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {users.map((user) => {
                                                const checkingAcc = user.accounts?.find(a => a.account_type === 'checking');
                                                const savingsAcc = user.accounts?.find(a => a.account_type === 'savings');

                                                return (
                                                    <TableRow key={user.id} className="border-slate-800/50 hover:bg-slate-800/30" data-testid={`user-row-${user.id}`}>
                                                        <TableCell>
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                                                                    <span className="text-sm font-medium text-white">
                                                                        {user.name?.charAt(0).toUpperCase()}
                                                                    </span>
                                                                </div>
                                                                <div>
                                                                    <span className="font-medium text-white">{user.name}</span>
                                                                    <p className="text-xs text-slate-500">{user.email}</p>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell data-testid={`user-score-${user.id}`}>
                                                            {getScoreBadge(user.interest_score)}
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                                user.role === 'admin' 
                                                                    ? 'bg-emerald-500/20 text-emerald-400' 
                                                                    : 'bg-slate-700 text-slate-300'
                                                            }`}>
                                                                {user.role}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>
                                                            {getVerificationBadge(user.verification_status)}
                                                        </TableCell>
                                                        <TableCell>
                                                            {getAccountStatusBadge(user.account_status)}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="space-y-1 text-xs font-mono">
                                                                <p className="text-slate-400">
                                                                    Checking: <span className="text-white">${checkingAcc?.balance_usd.toFixed(2) || '0.00'}</span>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-5 w-5 ml-1"
                                                                        onClick={() => handleEditBalance(user, checkingAcc)}
                                                                        data-testid={`edit-checking-${user.id}`}
                                                                    >
                                                                        <Edit className="w-3 h-3 text-slate-400" />
                                                                    </Button>
                                                                </p>
                                                                <p className="text-slate-400">
                                                                    Savings: <span className="text-white">${savingsAcc?.balance_usd.toFixed(2) || '0.00'}</span>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-5 w-5 ml-1"
                                                                        onClick={() => handleEditBalance(user, savingsAcc)}
                                                                        data-testid={`edit-savings-${user.id}`}
                                                                    >
                                                                        <Edit className="w-3 h-3 text-slate-400" />
                                                                    </Button>
                                                                </p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="border-slate-700 hover:bg-slate-800"
                                                                    onClick={() => handleEditRole(user)}
                                                                    data-testid={`edit-role-${user.id}`}
                                                                >
                                                                    {user.role === 'admin' ? <Shield className="w-4 h-4 mr-1" /> : <User className="w-4 h-4 mr-1" />}
                                                                    Role
                                                                </Button>
                                                                {user.account_status === 'active' || user.account_status === 'under_review' ? (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                                                                        onClick={() => handleSuspendUser(user.id, 'suspend')}
                                                                        data-testid={`suspend-${user.id}`}
                                                                    >
                                                                        <Ban className="w-4 h-4 mr-1" />
                                                                        Suspend
                                                                    </Button>
                                                                ) : (
                                                                    <Button
                                                                        size="sm"
                                                                        className="bg-emerald-500 hover:bg-emerald-600"
                                                                        onClick={() => handleSuspendUser(user.id, 'activate')}
                                                                        data-testid={`activate-${user.id}`}
                                                                    >
                                                                        <CheckCircle className="w-4 h-4 mr-1" />
                                                                        Activate
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                                {/* Mobile Cards */}
                                <div className="md:hidden divide-y divide-slate-800/50">
                                    {users.map((user) => {
                                        const checkingAcc = user.accounts?.find(a => a.account_type === 'checking');
                                        return (
                                            <div key={user.id} className="p-4 space-y-3" data-testid={`mobile-user-${user.id}`}>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                                                            <span className="text-sm font-medium text-white">{user.name?.charAt(0).toUpperCase()}</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium text-white text-sm">{user.name}</span>
                                                            <p className="text-xs text-slate-500">{user.email}</p>
                                                        </div>
                                                    </div>
                                                    {getScoreBadge(user.interest_score)}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                    <div><span className="text-slate-500">Rol:</span> <span className={`ml-1 ${user.role === 'admin' ? 'text-amber-400' : 'text-slate-300'}`}>{user.role}</span></div>
                                                    <div><span className="text-slate-500">KYC:</span> <span className="ml-1">{getVerificationBadge(user.verification_status)}</span></div>
                                                    <div><span className="text-slate-500">USD:</span> <span className="text-emerald-400 ml-1">${checkingAcc?.balance_usd?.toFixed(2) || '0.00'}</span></div>
                                                    <div><span className="text-slate-500">EUR:</span> <span className="text-emerald-400 ml-1">{checkingAcc?.balance_eur?.toFixed(2) || '0.00'}</span></div>
                                                </div>
                                                <div className="flex gap-2">
                                                    {checkingAcc && <Button size="sm" variant="outline" className="flex-1 border-slate-700 text-xs h-9" onClick={() => handleEditBalance(user, checkingAcc)}><Edit className="w-3 h-3 mr-1" />Saldo</Button>}
                                                    <Button size="sm" variant="outline" className="flex-1 border-slate-700 text-xs h-9" onClick={() => handleEditRole(user)}><Shield className="w-3 h-3 mr-1" />Rol</Button>
                                                    {user.account_status === 'active' ? (
                                                        <Button size="sm" className="flex-1 border-red-500/50 text-red-400 text-xs h-9" variant="outline" onClick={() => handleSuspendUser(user.id, 'suspend')}><Ban className="w-3 h-3 mr-1" />Susp.</Button>
                                                    ) : (
                                                        <Button size="sm" className="flex-1 bg-emerald-500 text-white text-xs h-9" onClick={() => handleSuspendUser(user.id, 'activate')}><CheckCircle className="w-3 h-3 mr-1" />Act.</Button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Edit Balance Dialog */}
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogContent className="bg-slate-900 border-slate-800">
                        <DialogHeader>
                            <DialogTitle className="text-white">
                                Edit Balance - {selectedUser?.name} ({selectedAccount?.account_type})
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label className="text-slate-300">USD Balance</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={balanceUsd}
                                    onChange={(e) => setBalanceUsd(e.target.value)}
                                    className="bg-slate-950 border-slate-800 text-white"
                                    data-testid="edit-balance-usd"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-slate-300">EUR Balance</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={balanceEur}
                                    onChange={(e) => setBalanceEur(e.target.value)}
                                    className="bg-slate-950 border-slate-800 text-white"
                                    data-testid="edit-balance-eur"
                                />
                            </div>
                            <Button
                                onClick={handleSaveBalance}
                                className="w-full bg-emerald-500 hover:bg-emerald-600"
                                data-testid="save-balance-btn"
                            >
                                Save Changes
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Edit Role Dialog */}
                <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
                    <DialogContent className="bg-slate-900 border-slate-800">
                        <DialogHeader>
                            <DialogTitle className="text-white">
                                Change Role - {selectedUser?.name}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label className="text-slate-300">Role</Label>
                                <Select value={newRole} onValueChange={setNewRole}>
                                    <SelectTrigger className="bg-slate-950 border-slate-800 text-white" data-testid="role-selector">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-800">
                                        <SelectItem value="user" className="text-white">User</SelectItem>
                                        <SelectItem value="admin" className="text-white">Admin</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button
                                onClick={handleSaveRole}
                                className="w-full bg-emerald-500 hover:bg-emerald-600"
                                data-testid="save-role-btn"
                            >
                                Update Role
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </Layout>
    );
};

export default AdminUsersPage;
