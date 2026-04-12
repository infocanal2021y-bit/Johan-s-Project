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
import { Users, Edit, Shield, User, BadgeCheck, AlertTriangle, Ban, CheckCircle, Flame, Snowflake, TrendingUp, DollarSign, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

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

const getVerificationBadge = (status) => {
    switch (status) {
        case 'verified':
            return <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400 flex items-center gap-1"><BadgeCheck className="w-3 h-3" /> Verificado</span>;
        case 'pending_verification':
            return <span className="px-2 py-1 rounded text-xs bg-cyan-500/20 text-cyan-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Pendiente</span>;
        default:
            return <span className="px-2 py-1 rounded text-xs bg-slate-700 text-slate-400">Sin verificar</span>;
    }
};

const getAccountStatusBadge = (status) => {
    switch (status) {
        case 'suspended':
            return <span className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400">Suspendido</span>;
        case 'under_review':
            return <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-400">En revision</span>;
        default:
            return <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400">Activo</span>;
    }
};

export const AdminUsersPage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [balanceUsd, setBalanceUsd] = useState('');
    const [balanceEur, setBalanceEur] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [roleDialogOpen, setRoleDialogOpen] = useState(false);
    const [newRole, setNewRole] = useState('');
    // Add balance dialog
    const [addBalanceOpen, setAddBalanceOpen] = useState(false);
    const [addBalanceUser, setAddBalanceUser] = useState(null);
    const [addAmount, setAddAmount] = useState('');
    const [addCurrency, setAddCurrency] = useState('USD');
    const [addDesc, setAddDesc] = useState('');
    const [addingBalance, setAddingBalance] = useState(false);

    const fetchUsers = async () => {
        try {
            const response = await adminAPI.getUsers();
            setUsers(response.data);
        } catch (error) {
            toast.error('Error al cargar usuarios');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchUsers(); }, []);

    const filteredUsers = users.filter(u => {
        if (!search) return true;
        const q = search.toLowerCase();
        return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    });

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
            toast.success('Saldo actualizado correctamente');
            setDialogOpen(false);
            fetchUsers();
        } catch (error) {
            toast.error('Error al actualizar saldo');
        }
    };

    const handleOpenAddBalance = (user) => {
        setAddBalanceUser(user);
        setAddAmount('');
        setAddCurrency('USD');
        setAddDesc('');
        setAddBalanceOpen(true);
    };

    const handleAddBalance = async () => {
        const amount = parseFloat(addAmount);
        if (!amount || amount <= 0) { toast.error('Ingrese un monto valido'); return; }
        setAddingBalance(true);
        try {
            const token = localStorage.getItem('token');
            const resp = await fetch(`${API_URL}/api/admin/add-balance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    user_id: addBalanceUser.id,
                    amount,
                    currency: addCurrency,
                    description: addDesc || `Saldo agregado por administrador`
                })
            });
            const data = await resp.json();
            if (resp.ok) {
                toast.success(`$${amount.toLocaleString()} ${addCurrency} agregados a ${addBalanceUser.name}`);
                setAddBalanceOpen(false);
                fetchUsers();
            } else {
                toast.error(data.detail || 'Error al agregar saldo');
            }
        } catch (e) {
            toast.error('Error de conexion');
        } finally {
            setAddingBalance(false);
        }
    };

    const handleEditRole = (user) => {
        setSelectedUser(user);
        setNewRole(user.role);
        setRoleDialogOpen(true);
    };

    const handleSaveRole = async () => {
        try {
            await adminAPI.updateUserRole({ user_id: selectedUser.id, role: newRole });
            toast.success('Rol actualizado correctamente');
            setRoleDialogOpen(false);
            fetchUsers();
        } catch (error) {
            toast.error('Error al actualizar rol');
        }
    };

    const handleSuspendUser = async (userId, action) => {
        try {
            await adminAPI.suspendUser({ user_id: userId, action });
            toast.success(action === 'suspend' ? 'Usuario suspendido' : 'Usuario activado');
            fetchUsers();
        } catch (error) {
            toast.error('Error al actualizar estado');
        }
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-6" data-testid="admin-users-page">
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                    <h1 className="text-2xl sm:text-3xl font-heading font-bold text-white">Usuarios Registrados</h1>
                    <p className="text-slate-500 mt-1">Gestionar usuarios, saldos y puntuacion de interes</p>
                </motion.div>

                {/* Search */}
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                        placeholder="Buscar por nombre o email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10 bg-slate-900 border-slate-800 text-white"
                        data-testid="users-search"
                    />
                </div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader className="border-b border-slate-800">
                            <CardTitle className="text-white font-heading flex items-center gap-2">
                                <Users className="w-5 h-5 text-emerald-400" />
                                Usuarios Registrados ({filteredUsers.length})
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
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Usuario</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Interes</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Rol</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">KYC</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Estado</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Saldos</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase text-right">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredUsers.map((user) => {
                                                const checkingAcc = user.accounts?.find(a => a.account_type === 'checking');
                                                const savingsAcc = user.accounts?.find(a => a.account_type === 'savings');
                                                return (
                                                    <TableRow key={user.id} className="border-slate-800/50 hover:bg-slate-800/30" data-testid={`user-row-${user.id}`}>
                                                        <TableCell>
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                                                                    <span className="text-sm font-medium text-white">{user.name?.charAt(0).toUpperCase()}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="font-medium text-white">{user.name}</span>
                                                                    <p className="text-xs text-slate-500">{user.email}</p>
                                                                    {user.phone && <p className="text-[10px] text-slate-600">{user.phone}</p>}
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>{getScoreBadge(user.interest_score)}</TableCell>
                                                        <TableCell>
                                                            <span className={`px-2 py-1 rounded text-xs font-medium ${user.role === 'admin' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300'}`}>
                                                                {user.role === 'admin' ? 'Admin' : 'Usuario'}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>{getVerificationBadge(user.verification_status)}</TableCell>
                                                        <TableCell>{getAccountStatusBadge(user.account_status)}</TableCell>
                                                        <TableCell>
                                                            <div className="space-y-1 text-xs font-mono">
                                                                <p className="text-slate-400">
                                                                    Corriente: <span className="text-white">${checkingAcc?.balance_usd?.toFixed(2) || '0.00'}</span>
                                                                    {checkingAcc && (
                                                                        <Button variant="ghost" size="icon" className="h-5 w-5 ml-1" onClick={() => handleEditBalance(user, checkingAcc)}>
                                                                            <Edit className="w-3 h-3 text-slate-400" />
                                                                        </Button>
                                                                    )}
                                                                </p>
                                                                <p className="text-slate-400">
                                                                    Ahorro: <span className="text-white">${savingsAcc?.balance_usd?.toFixed(2) || '0.00'}</span>
                                                                    {savingsAcc && (
                                                                        <Button variant="ghost" size="icon" className="h-5 w-5 ml-1" onClick={() => handleEditBalance(user, savingsAcc)}>
                                                                            <Edit className="w-3 h-3 text-slate-400" />
                                                                        </Button>
                                                                    )}
                                                                </p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-2.5 text-xs"
                                                                    onClick={() => handleOpenAddBalance(user)} data-testid={`add-balance-${user.id}`}>
                                                                    <DollarSign className="w-3.5 h-3.5 mr-1" />Saldo
                                                                </Button>
                                                                <Button size="sm" variant="outline" className="border-slate-700 hover:bg-slate-800 h-8 px-2.5 text-xs"
                                                                    onClick={() => handleEditRole(user)} data-testid={`edit-role-${user.id}`}>
                                                                    {user.role === 'admin' ? <Shield className="w-3.5 h-3.5 mr-1" /> : <User className="w-3.5 h-3.5 mr-1" />}Rol
                                                                </Button>
                                                                {user.account_status === 'active' || user.account_status === 'under_review' ? (
                                                                    <Button size="sm" variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10 h-8 px-2.5 text-xs"
                                                                        onClick={() => handleSuspendUser(user.id, 'suspend')} data-testid={`suspend-${user.id}`}>
                                                                        <Ban className="w-3.5 h-3.5 mr-1" />Susp.
                                                                    </Button>
                                                                ) : (
                                                                    <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 h-8 px-2.5 text-xs"
                                                                        onClick={() => handleSuspendUser(user.id, 'activate')} data-testid={`activate-${user.id}`}>
                                                                        <CheckCircle className="w-3.5 h-3.5 mr-1" />Act.
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
                                    {filteredUsers.map((user) => {
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
                                                    <div><span className="text-slate-500">Rol:</span> <span className={`ml-1 ${user.role === 'admin' ? 'text-amber-400' : 'text-slate-300'}`}>{user.role === 'admin' ? 'Admin' : 'Usuario'}</span></div>
                                                    <div><span className="text-slate-500">KYC:</span> <span className="ml-1">{getVerificationBadge(user.verification_status)}</span></div>
                                                    <div><span className="text-slate-500">USD:</span> <span className="text-emerald-400 ml-1">${checkingAcc?.balance_usd?.toFixed(2) || '0.00'}</span></div>
                                                    <div><span className="text-slate-500">EUR:</span> <span className="text-emerald-400 ml-1">{checkingAcc?.balance_eur?.toFixed(2) || '0.00'}</span></div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9" onClick={() => handleOpenAddBalance(user)}>
                                                        <DollarSign className="w-3 h-3 mr-1" />Agregar Saldo
                                                    </Button>
                                                    {checkingAcc && <Button size="sm" variant="outline" className="flex-1 border-slate-700 text-xs h-9" onClick={() => handleEditBalance(user, checkingAcc)}><Edit className="w-3 h-3 mr-1" />Editar</Button>}
                                                    <Button size="sm" variant="outline" className="border-slate-700 text-xs h-9" onClick={() => handleEditRole(user)}><Shield className="w-3 h-3 mr-1" />Rol</Button>
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

                {/* Add Balance Dialog */}
                <Dialog open={addBalanceOpen} onOpenChange={setAddBalanceOpen}>
                    <DialogContent className="bg-slate-900 border-slate-800" data-testid="add-balance-dialog">
                        <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                                <DollarSign className="w-5 h-5 text-emerald-400" />
                                Agregar Saldo - {addBalanceUser?.name}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                            <p className="text-sm text-slate-400">{addBalanceUser?.email}</p>
                            <div className="flex gap-2">
                                <div className="flex-1 space-y-1.5">
                                    <Label className="text-slate-300 text-sm">Monto</Label>
                                    <Input type="number" step="0.01" placeholder="0.00" value={addAmount}
                                        onChange={(e) => setAddAmount(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-white" data-testid="add-balance-amount" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-slate-300 text-sm">Moneda</Label>
                                    <select value={addCurrency} onChange={(e) => setAddCurrency(e.target.value)}
                                        className="h-10 bg-slate-950 border border-slate-800 text-white rounded-md px-3 text-sm"
                                        data-testid="add-balance-currency">
                                        <option value="USD">USD</option>
                                        <option value="EUR">EUR</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-slate-300 text-sm">Descripcion (opcional)</Label>
                                <Input placeholder="Motivo del deposito..." value={addDesc}
                                    onChange={(e) => setAddDesc(e.target.value)}
                                    className="bg-slate-950 border-slate-800 text-white" data-testid="add-balance-desc" />
                            </div>
                            <Button onClick={handleAddBalance} disabled={addingBalance}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white" data-testid="add-balance-submit">
                                {addingBalance ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DollarSign className="w-4 h-4 mr-2" />}
                                Agregar Saldo
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Edit Balance Dialog */}
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogContent className="bg-slate-900 border-slate-800">
                        <DialogHeader>
                            <DialogTitle className="text-white">
                                Editar Saldo - {selectedUser?.name} ({selectedAccount?.account_type === 'checking' ? 'Corriente' : 'Ahorro'})
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label className="text-slate-300">Saldo USD</Label>
                                <Input type="number" step="0.01" value={balanceUsd} onChange={(e) => setBalanceUsd(e.target.value)}
                                    className="bg-slate-950 border-slate-800 text-white" data-testid="edit-balance-usd" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-slate-300">Saldo EUR</Label>
                                <Input type="number" step="0.01" value={balanceEur} onChange={(e) => setBalanceEur(e.target.value)}
                                    className="bg-slate-950 border-slate-800 text-white" data-testid="edit-balance-eur" />
                            </div>
                            <Button onClick={handleSaveBalance} className="w-full bg-emerald-500 hover:bg-emerald-600" data-testid="save-balance-btn">
                                Guardar Cambios
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Edit Role Dialog */}
                <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
                    <DialogContent className="bg-slate-900 border-slate-800">
                        <DialogHeader>
                            <DialogTitle className="text-white">Cambiar Rol - {selectedUser?.name}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label className="text-slate-300">Rol</Label>
                                <Select value={newRole} onValueChange={setNewRole}>
                                    <SelectTrigger className="bg-slate-950 border-slate-800 text-white" data-testid="role-selector">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-800">
                                        <SelectItem value="user" className="text-white">Usuario</SelectItem>
                                        <SelectItem value="admin" className="text-white">Administrador</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button onClick={handleSaveRole} className="w-full bg-emerald-500 hover:bg-emerald-600" data-testid="save-role-btn">
                                Actualizar Rol
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </Layout>
    );
};

export default AdminUsersPage;
