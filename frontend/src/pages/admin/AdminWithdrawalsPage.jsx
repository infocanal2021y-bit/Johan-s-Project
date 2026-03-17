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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { 
    Clock, CheckCircle, XCircle, Loader2, RefreshCw, 
    Building2, CreditCard, Globe, User, ArrowRight, Ban,
    Banknote, FileText
} from 'lucide-react';
import { toast } from 'sonner';

export const AdminWithdrawalsPage = () => {
    const [withdrawals, setWithdrawals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
    const [selectedWithdrawal, setSelectedWithdrawal] = useState(null);
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [activeTab, setActiveTab] = useState('pending');

    const fetchWithdrawals = async () => {
        setLoading(true);
        try {
            const response = await adminAPI.getAllWithdrawals();
            setWithdrawals(response.data);
        } catch (error) {
            toast.error('Error al cargar retiros');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWithdrawals();
    }, []);

    const handleStatusChange = async (transactionId, newStatus) => {
        setProcessingId(transactionId);
        try {
            await adminAPI.updateWithdrawalStatus({ 
                transaction_id: transactionId, 
                status: newStatus,
                rejection_reason: newStatus === 'rejected' ? rejectionReason : null
            });
            toast.success(`Estado actualizado a: ${statusLabels[newStatus]}`);
            setRejectDialogOpen(false);
            setRejectionReason('');
            fetchWithdrawals();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Error al actualizar estado');
        } finally {
            setProcessingId(null);
        }
    };

    const openDetailsDialog = (withdrawal) => {
        setSelectedWithdrawal(withdrawal);
        setDetailsDialogOpen(true);
    };

    const openRejectDialog = (withdrawal) => {
        setSelectedWithdrawal(withdrawal);
        setRejectionReason('');
        setRejectDialogOpen(true);
    };

    const handleReject = () => {
        if (selectedWithdrawal) {
            handleStatusChange(selectedWithdrawal.id, 'rejected');
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('es-ES', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const statusLabels = {
        pending: 'Pendiente de Aprobación',
        processing: 'Procesando',
        transfer_in_progress: 'Transferencia en Proceso',
        completed: 'Completado',
        rejected: 'Rechazado',
        pending_tax: 'Impuesto Pendiente',
        under_review: 'En Revisión'
    };

    const statusColors = {
        pending: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
        processing: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30',
        transfer_in_progress: 'text-blue-400 bg-blue-500/20 border-blue-500/30',
        completed: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
        rejected: 'text-red-400 bg-red-500/20 border-red-500/30',
        pending_tax: 'text-orange-400 bg-orange-500/20 border-orange-500/30',
        under_review: 'text-purple-400 bg-purple-500/20 border-purple-500/30'
    };

    // Filter withdrawals by status
    const filteredWithdrawals = withdrawals.filter(w => {
        if (activeTab === 'pending') return w.status === 'pending';
        if (activeTab === 'pending_tax') return w.status === 'pending_tax';
        if (activeTab === 'processing') return w.status === 'processing' || w.status === 'transfer_in_progress';
        if (activeTab === 'completed') return w.status === 'completed';
        if (activeTab === 'rejected') return w.status === 'rejected';
        return true; // 'all' tab
    });

    const getNextStatus = (currentStatus) => {
        const flow = {
            'pending': 'processing',
            'processing': 'transfer_in_progress',
            'transfer_in_progress': 'completed'
        };
        return flow[currentStatus] || null;
    };

    const getNextStatusLabel = (currentStatus) => {
        const labels = {
            'pending': 'Aprobar → Procesando',
            'processing': 'Transferencia en Proceso',
            'transfer_in_progress': 'Marcar Completado'
        };
        return labels[currentStatus] || null;
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="admin-withdrawals-page">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between"
                >
                    <div>
                        <h1 className="text-3xl text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                            Gestión de Retiros
                        </h1>
                        <p className="text-slate-500 mt-1 font-light">Administrar solicitudes de retiro de usuarios</p>
                    </div>
                    <Button
                        onClick={fetchWithdrawals}
                        variant="outline"
                        className="border-slate-700 hover:bg-slate-800 text-slate-300"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Actualizar
                    </Button>
                </motion.div>

                {/* Stats Cards */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="grid grid-cols-2 md:grid-cols-6 gap-4"
                >
                    <Card className="bg-orange-500/10 border-orange-500/30">
                        <CardContent className="p-4 text-center">
                            <p className="text-3xl text-orange-400" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                {withdrawals.filter(w => w.status === 'pending_tax').length}
                            </p>
                            <p className="text-xs text-orange-400/70 mt-1">Impuesto Pendiente</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-amber-500/10 border-amber-500/30">
                        <CardContent className="p-4 text-center">
                            <p className="text-3xl text-amber-400" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                {withdrawals.filter(w => w.status === 'pending').length}
                            </p>
                            <p className="text-xs text-amber-400/70 mt-1">Pendientes</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-cyan-500/10 border-cyan-500/30">
                        <CardContent className="p-4 text-center">
                            <p className="text-3xl text-cyan-400" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                {withdrawals.filter(w => w.status === 'processing').length}
                            </p>
                            <p className="text-xs text-cyan-400/70 mt-1">Procesando</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-blue-500/10 border-blue-500/30">
                        <CardContent className="p-4 text-center">
                            <p className="text-3xl text-blue-400" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                {withdrawals.filter(w => w.status === 'transfer_in_progress').length}
                            </p>
                            <p className="text-xs text-blue-400/70 mt-1">En Transferencia</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-emerald-500/10 border-emerald-500/30">
                        <CardContent className="p-4 text-center">
                            <p className="text-3xl text-emerald-400" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                {withdrawals.filter(w => w.status === 'completed').length}
                            </p>
                            <p className="text-xs text-emerald-400/70 mt-1">Completados</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-red-500/10 border-red-500/30">
                        <CardContent className="p-4 text-center">
                            <p className="text-3xl text-red-400" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                {withdrawals.filter(w => w.status === 'rejected').length}
                            </p>
                            <p className="text-xs text-red-400/70 mt-1">Rechazados</p>
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader className="border-b border-slate-800">
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                                <TabsList className="bg-slate-800/50 w-full justify-start flex-wrap">
                                    <TabsTrigger value="pending_tax" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400">
                                        Impuesto Pendiente ({withdrawals.filter(w => w.status === 'pending_tax').length})
                                    </TabsTrigger>
                                    <TabsTrigger value="pending" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
                                        Pendientes ({withdrawals.filter(w => w.status === 'pending').length})
                                    </TabsTrigger>
                                    <TabsTrigger value="processing" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                                        En Proceso ({withdrawals.filter(w => w.status === 'processing' || w.status === 'transfer_in_progress').length})
                                    </TabsTrigger>
                                    <TabsTrigger value="completed" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
                                        Completados ({withdrawals.filter(w => w.status === 'completed').length})
                                    </TabsTrigger>
                                    <TabsTrigger value="rejected" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400">
                                        Rechazados ({withdrawals.filter(w => w.status === 'rejected').length})
                                    </TabsTrigger>
                                    <TabsTrigger value="all" className="data-[state=active]:bg-slate-600">
                                        Todos ({withdrawals.length})
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-8 space-y-4">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="h-20 bg-slate-800/50 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : filteredWithdrawals.length === 0 ? (
                                <div className="py-16 text-center">
                                    <Banknote className="w-12 h-12 mx-auto text-slate-600 mb-4" />
                                    <p className="text-slate-500">No hay retiros en esta categoría</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-800 hover:bg-transparent">
                                                <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Usuario</TableHead>
                                                <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Monto</TableHead>
                                                <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Banco</TableHead>
                                                <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Estado</TableHead>
                                                <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Fecha</TableHead>
                                                <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium text-right">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredWithdrawals.map((w) => {
                                                const currentStatus = w.status || 'pending';
                                                const statusColor = statusColors[currentStatus] || statusColors.pending;
                                                const nextStatus = getNextStatus(currentStatus);
                                                const nextStatusLabel = getNextStatusLabel(currentStatus);
                                                const bankingInfo = w.banking_info || {};
                                                
                                                return (
                                                    <TableRow 
                                                        key={w.id} 
                                                        className="border-slate-800/50 hover:bg-slate-800/30" 
                                                        data-testid={`withdrawal-row-${w.id}`}
                                                    >
                                                        <TableCell>
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                                                                    <span className="text-sm font-medium text-white">
                                                                        {w.user?.name?.charAt(0).toUpperCase() || '?'}
                                                                    </span>
                                                                </div>
                                                                <div>
                                                                    <p className="font-medium text-white">{w.user?.name || 'Desconocido'}</p>
                                                                    <p className="text-xs text-slate-500">{w.user?.email || ''}</p>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span 
                                                                className="text-red-400"
                                                                style={{ 
                                                                    fontSize: '18px',
                                                                    fontWeight: 600, 
                                                                    fontVariantNumeric: 'tabular-nums' 
                                                                }}
                                                            >
                                                                -{w.currency === 'USD' ? '$' : '€'}{w.amount?.toFixed(2)}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="space-y-1">
                                                                <p className="text-white text-sm font-medium">
                                                                    {bankingInfo.bank_name || 'No especificado'}
                                                                </p>
                                                                <p className="text-xs text-slate-500">
                                                                    {bankingInfo.iban ? `****${bankingInfo.iban.slice(-4)}` : 'Sin IBAN'}
                                                                </p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className={`px-3 py-1 rounded-full text-xs border ${statusColor}`} style={{ fontWeight: 500 }}>
                                                                {statusLabels[currentStatus]}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <p className="text-slate-400 text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                                {formatDate(w.created_at)}
                                                            </p>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => openDetailsDialog(w)}
                                                                    className="border-slate-700 hover:bg-slate-800 text-slate-300"
                                                                    data-testid={`details-btn-${w.id}`}
                                                                >
                                                                    <FileText className="w-4 h-4" />
                                                                </Button>
                                                                
                                                                {nextStatus && (
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={() => handleStatusChange(w.id, nextStatus)}
                                                                        disabled={processingId === w.id}
                                                                        className="bg-emerald-500 hover:bg-emerald-600 text-white"
                                                                        data-testid={`advance-btn-${w.id}`}
                                                                    >
                                                                        {processingId === w.id ? (
                                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                                        ) : (
                                                                            <>
                                                                                <ArrowRight className="w-4 h-4 mr-1" />
                                                                                {nextStatusLabel}
                                                                            </>
                                                                        )}
                                                                    </Button>
                                                                )}
                                                                
                                                                {currentStatus !== 'completed' && currentStatus !== 'rejected' && (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => openRejectDialog(w)}
                                                                        disabled={processingId === w.id}
                                                                        className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                                                                        data-testid={`reject-btn-${w.id}`}
                                                                    >
                                                                        <Ban className="w-4 h-4" />
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
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* Withdrawal Details Dialog */}
            <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <Banknote className="w-5 h-5 text-emerald-400" />
                            Detalles del Retiro
                        </DialogTitle>
                    </DialogHeader>
                    {selectedWithdrawal && (
                        <div className="space-y-4 pt-4">
                            {/* User Info */}
                            <div className="p-4 rounded-lg bg-slate-800/50 space-y-3">
                                <h3 className="text-white font-medium flex items-center gap-2">
                                    <User className="w-4 h-4 text-cyan-400" />
                                    Información del Usuario
                                </h3>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <span className="text-slate-400">Nombre:</span>
                                    <span className="text-white">{selectedWithdrawal.user?.name}</span>
                                    <span className="text-slate-400">Email:</span>
                                    <span className="text-white">{selectedWithdrawal.user?.email}</span>
                                    <span className="text-slate-400">Verificación:</span>
                                    <span className={selectedWithdrawal.user?.verification_status === 'verified' ? 'text-emerald-400' : 'text-amber-400'}>
                                        {selectedWithdrawal.user?.verification_status === 'verified' ? 'Verificado' : 'No verificado'}
                                    </span>
                                </div>
                            </div>

                            {/* Amount Info */}
                            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 space-y-2">
                                <h3 className="text-red-400 font-medium flex items-center gap-2">
                                    <CreditCard className="w-4 h-4" />
                                    Monto a Retirar
                                </h3>
                                <p className="text-3xl text-red-400" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                    -{selectedWithdrawal.currency === 'USD' ? '$' : '€'}{selectedWithdrawal.amount?.toFixed(2)} {selectedWithdrawal.currency}
                                </p>
                                {selectedWithdrawal.transaction_reference && (
                                    <p className="text-xs text-slate-500">
                                        Ref: {selectedWithdrawal.transaction_reference}
                                    </p>
                                )}
                            </div>

                            {/* Banking Info */}
                            {selectedWithdrawal.banking_info && (
                                <div className="p-4 rounded-lg bg-slate-800/50 space-y-3">
                                    <h3 className="text-white font-medium flex items-center gap-2">
                                        <Building2 className="w-4 h-4 text-cyan-400" />
                                        Datos Bancarios
                                    </h3>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <span className="text-slate-400">Titular:</span>
                                        <span className="text-white">{selectedWithdrawal.banking_info.account_holder}</span>
                                        <span className="text-slate-400">IBAN:</span>
                                        <span className="text-white font-mono text-xs">{selectedWithdrawal.banking_info.iban}</span>
                                        <span className="text-slate-400">Banco:</span>
                                        <span className="text-white">{selectedWithdrawal.banking_info.bank_name}</span>
                                        <span className="text-slate-400">País:</span>
                                        <span className="text-white flex items-center gap-1">
                                            <Globe className="w-3 h-3" />
                                            {selectedWithdrawal.banking_info.bank_country}
                                        </span>
                                        {selectedWithdrawal.banking_info.bank_city && (
                                            <>
                                                <span className="text-slate-400">Ciudad:</span>
                                                <span className="text-white">{selectedWithdrawal.banking_info.bank_city}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Status */}
                            <div className="p-4 rounded-lg bg-slate-800/50 space-y-3">
                                <h3 className="text-white font-medium flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-cyan-400" />
                                    Estado Actual
                                </h3>
                                <span className={`inline-block px-3 py-1 rounded-full text-sm border ${statusColors[selectedWithdrawal.status]}`}>
                                    {statusLabels[selectedWithdrawal.status]}
                                </span>
                                <p className="text-xs text-slate-500">
                                    Solicitado: {formatDate(selectedWithdrawal.created_at)}
                                </p>
                                {selectedWithdrawal.completed_at && (
                                    <p className="text-xs text-emerald-400">
                                        Completado: {formatDate(selectedWithdrawal.completed_at)}
                                    </p>
                                )}
                                {selectedWithdrawal.rejection_reason && (
                                    <p className="text-xs text-red-400">
                                        Razón de rechazo: {selectedWithdrawal.rejection_reason}
                                    </p>
                                )}
                            </div>

                            {/* Quick Actions */}
                            {selectedWithdrawal.status !== 'completed' && selectedWithdrawal.status !== 'rejected' && (
                                <div className="flex gap-2">
                                    {getNextStatus(selectedWithdrawal.status) && (
                                        <Button
                                            onClick={() => {
                                                handleStatusChange(selectedWithdrawal.id, getNextStatus(selectedWithdrawal.status));
                                                setDetailsDialogOpen(false);
                                            }}
                                            disabled={processingId === selectedWithdrawal.id}
                                            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                                        >
                                            {processingId === selectedWithdrawal.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <>
                                                    <CheckCircle className="w-4 h-4 mr-2" />
                                                    {getNextStatusLabel(selectedWithdrawal.status)}
                                                </>
                                            )}
                                        </Button>
                                    )}
                                    <Button
                                        onClick={() => {
                                            setDetailsDialogOpen(false);
                                            openRejectDialog(selectedWithdrawal);
                                        }}
                                        variant="outline"
                                        className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                                    >
                                        <XCircle className="w-4 h-4 mr-2" />
                                        Rechazar
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Reject Dialog */}
            <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <XCircle className="w-5 h-5 text-red-400" />
                            Rechazar Retiro
                        </DialogTitle>
                    </DialogHeader>
                    {selectedWithdrawal && (
                        <div className="space-y-4 pt-4">
                            <div className="p-3 rounded-lg bg-slate-800/50">
                                <p className="text-sm text-slate-400">
                                    Está a punto de rechazar el retiro de <span className="text-white font-medium">{selectedWithdrawal.user?.name}</span> por{' '}
                                    <span className="text-red-400 font-mono">${selectedWithdrawal.amount?.toFixed(2)}</span>
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-slate-300">Razón del rechazo (opcional)</Label>
                                <Input
                                    placeholder="Ej: Información bancaria incorrecta..."
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    className="bg-slate-950 border-slate-800 text-white"
                                />
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    onClick={() => setRejectDialogOpen(false)}
                                    variant="outline"
                                    className="flex-1 border-slate-700 text-slate-300"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleReject}
                                    disabled={processingId === selectedWithdrawal.id}
                                    className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                                >
                                    {processingId === selectedWithdrawal.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            <XCircle className="w-4 h-4 mr-2" />
                                            Confirmar Rechazo
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </Layout>
    );
};

export default AdminWithdrawalsPage;
