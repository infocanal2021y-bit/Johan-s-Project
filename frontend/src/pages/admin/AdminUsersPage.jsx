import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { adminAPI } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Users, Edit, Shield, User } from 'lucide-react';
import { toast } from 'sonner';

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

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="admin-users-page">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl font-heading font-bold text-white">User Management</h1>
                    <p className="text-slate-500 mt-1">View and manage all users</p>
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
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-800 hover:bg-transparent">
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">User</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Email</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Role</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Checking (USD/EUR)</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Savings (USD/EUR)</TableHead>
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
                                                                <span className="font-medium text-white">{user.name}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-slate-400">{user.email}</TableCell>
                                                        <TableCell>
                                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                                user.role === 'admin' 
                                                                    ? 'bg-emerald-500/20 text-emerald-400' 
                                                                    : 'bg-slate-700 text-slate-300'
                                                            }`}>
                                                                {user.role}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="font-mono text-sm">
                                                            ${checkingAcc?.balance_usd.toFixed(2) || '0.00'} / €{checkingAcc?.balance_eur.toFixed(2) || '0.00'}
                                                            {checkingAcc && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="ml-2 h-6 w-6"
                                                                    onClick={() => handleEditBalance(user, checkingAcc)}
                                                                    data-testid={`edit-checking-${user.id}`}
                                                                >
                                                                    <Edit className="w-3 h-3 text-slate-400" />
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="font-mono text-sm">
                                                            ${savingsAcc?.balance_usd.toFixed(2) || '0.00'} / €{savingsAcc?.balance_eur.toFixed(2) || '0.00'}
                                                            {savingsAcc && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="ml-2 h-6 w-6"
                                                                    onClick={() => handleEditBalance(user, savingsAcc)}
                                                                    data-testid={`edit-savings-${user.id}`}
                                                                >
                                                                    <Edit className="w-3 h-3 text-slate-400" />
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="border-slate-700 hover:bg-slate-800"
                                                                onClick={() => handleEditRole(user)}
                                                                data-testid={`edit-role-${user.id}`}
                                                            >
                                                                {user.role === 'admin' ? <Shield className="w-4 h-4 mr-1" /> : <User className="w-4 h-4 mr-1" />}
                                                                Change Role
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
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
