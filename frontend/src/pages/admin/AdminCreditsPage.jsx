import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { PlusCircle, DollarSign, Users, History, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export const AdminCreditsPage = () => {
    const [users, setUsers] = useState([]);
    const [credits, setCredits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState('USD');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchData = async () => {
        try {
            const [usersRes, creditsRes] = await Promise.all([
                adminAPI.getUsers(),
                adminAPI.getCredits(),
            ]);
            setUsers(usersRes.data);
            setCredits(creditsRes.data);
        } catch (error) {
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleAddBalance = async () => {
        if (!selectedUserId || !amount || parseFloat(amount) <= 0) {
            toast.error('Please select a user and enter a valid amount');
            return;
        }

        setSubmitting(true);
        try {
            await adminAPI.addBalance({
                user_id: selectedUserId,
                amount: parseFloat(amount),
                currency,
                description: description || undefined,
            });
            toast.success('Balance added successfully');
            setAddDialogOpen(false);
            setSelectedUserId('');
            setAmount('');
            setDescription('');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to add balance');
        } finally {
            setSubmitting(false);
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatAmount = (amount, currency) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
        }).format(amount);
    };

    // Calculate totals
    const totalCreditsUSD = credits
        .filter(c => c.currency === 'USD')
        .reduce((sum, c) => sum + c.amount, 0);
    const totalCreditsEUR = credits
        .filter(c => c.currency === 'EUR')
        .reduce((sum, c) => sum + c.amount, 0);

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="admin-credits-page">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                    <div>
                        <h1 className="text-3xl font-heading font-bold text-white">Balance Management</h1>
                        <p className="text-slate-500 mt-1">Add balance to user accounts</p>
                    </div>
                    <Button
                        onClick={() => setAddDialogOpen(true)}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white"
                        data-testid="add-balance-btn"
                    >
                        <PlusCircle className="w-4 h-4 mr-2" />
                        Add Balance
                    </Button>
                </motion.div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-500">Total Users</p>
                                        <p className="text-3xl font-heading font-bold text-white mt-2">
                                            {users.length}
                                        </p>
                                    </div>
                                    <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                                        <Users className="w-6 h-6 text-cyan-400" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-500">Credits Issued (USD)</p>
                                        <p className="text-3xl font-heading font-bold text-emerald-400 mt-2">
                                            ${totalCreditsUSD.toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                        <DollarSign className="w-6 h-6 text-emerald-400" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-500">Total Credits</p>
                                        <p className="text-3xl font-heading font-bold text-white mt-2">
                                            {credits.length}
                                        </p>
                                    </div>
                                    <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center">
                                        <History className="w-6 h-6 text-violet-400" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>

                {/* Users List with Quick Add */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader className="border-b border-slate-800">
                            <CardTitle className="text-white font-heading flex items-center gap-2">
                                <Users className="w-5 h-5 text-emerald-400" />
                                Users ({users.length})
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
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Checking Balance</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Total Balance</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {users.filter(u => u.role !== 'admin').map((user) => {
                                                const checking = user.accounts?.find(a => a.account_type === 'checking');
                                                return (
                                                    <TableRow key={user.id} className="border-slate-800/50 hover:bg-slate-800/30">
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
                                                        <TableCell className="font-mono text-emerald-400">
                                                            ${checking?.balance_usd?.toFixed(2) || '0.00'}
                                                        </TableCell>
                                                        <TableCell className="font-mono text-white">
                                                            ${user.total_balance_usd?.toFixed(2) || '0.00'}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                size="sm"
                                                                onClick={() => {
                                                                    setSelectedUserId(user.id);
                                                                    setAddDialogOpen(true);
                                                                }}
                                                                className="bg-emerald-500 hover:bg-emerald-600"
                                                                data-testid={`add-balance-${user.id}`}
                                                            >
                                                                <PlusCircle className="w-4 h-4 mr-1" />
                                                                Add Balance
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

                {/* Credits History */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader className="border-b border-slate-800">
                            <CardTitle className="text-white font-heading flex items-center gap-2">
                                <History className="w-5 h-5 text-violet-400" />
                                Admin Credits History
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {credits.length === 0 ? (
                                <div className="py-16 text-center">
                                    <History className="w-12 h-12 mx-auto text-slate-600 mb-4" />
                                    <p className="text-slate-500">No admin credits yet</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-800 hover:bg-transparent">
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Reference</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">User</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Amount</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Admin</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Description</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase text-right">Date</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {credits.map((credit) => (
                                                <TableRow key={credit.id} className="border-slate-800/50 hover:bg-slate-800/30">
                                                    <TableCell className="font-mono text-xs text-slate-400">
                                                        {credit.transaction_reference || credit.id.slice(0, 12)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div>
                                                            <p className="text-white text-sm">{credit.user?.name || 'Unknown'}</p>
                                                            <p className="text-xs text-slate-500">{credit.user?.email}</p>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="font-mono font-medium text-emerald-400">
                                                        +{formatAmount(credit.amount, credit.currency)}
                                                    </TableCell>
                                                    <TableCell className="text-slate-400 text-sm">
                                                        {credit.admin_name || 'Admin'}
                                                    </TableCell>
                                                    <TableCell className="text-slate-400 text-sm max-w-[200px] truncate">
                                                        {credit.description || '-'}
                                                    </TableCell>
                                                    <TableCell className="text-right text-slate-500 text-sm">
                                                        {formatDate(credit.created_at)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* Add Balance Dialog */}
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <PlusCircle className="w-5 h-5 text-emerald-400" />
                            Add Balance to User
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 pt-4">
                        <div className="space-y-2">
                            <Label className="text-slate-300">Select User</Label>
                            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                                <SelectTrigger className="bg-slate-950 border-slate-800 text-white" data-testid="user-selector">
                                    <SelectValue placeholder="Choose a user" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800 max-h-[200px]">
                                    {users.filter(u => u.role !== 'admin').map((user) => (
                                        <SelectItem key={user.id} value={user.id} className="text-white">
                                            {user.name} ({user.email})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-slate-300">Amount</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    placeholder="0.00"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="bg-slate-950 border-slate-800 text-white font-mono"
                                    data-testid="amount-input"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-slate-300">Currency</Label>
                                <Select value={currency} onValueChange={setCurrency}>
                                    <SelectTrigger className="bg-slate-950 border-slate-800 text-white" data-testid="currency-selector">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-800">
                                        <SelectItem value="USD" className="text-white">USD</SelectItem>
                                        <SelectItem value="EUR" className="text-white">EUR</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-slate-300">Description (Optional)</Label>
                            <Input
                                type="text"
                                placeholder="e.g., Initial deposit, Bonus credit..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="bg-slate-950 border-slate-800 text-white"
                                data-testid="description-input"
                            />
                        </div>

                        <Button
                            onClick={handleAddBalance}
                            disabled={submitting || !selectedUserId || !amount}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                            data-testid="confirm-add-balance-btn"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Add Balance
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </Layout>
    );
};

export default AdminCreditsPage;
