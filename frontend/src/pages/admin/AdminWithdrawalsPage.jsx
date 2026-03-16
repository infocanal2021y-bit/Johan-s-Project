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
import { Progress } from '../../components/ui/progress';
import { Clock, CheckCircle, XCircle, Loader2, RefreshCw, Plus, DollarSign, AlertTriangle, Timer, Bitcoin } from 'lucide-react';
import { toast } from 'sonner';

export const AdminWithdrawalsPage = () => {
    const [withdrawals, setWithdrawals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [selectedWithdrawal, setSelectedWithdrawal] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('crypto');
    const [cryptoType, setCryptoType] = useState('');
    const [txid, setTxid] = useState('');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchWithdrawals = async () => {
        setLoading(true);
        try {
            const response = await adminAPI.getPendingWithdrawalsDetailed();
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

    const handleApprove = async (transactionId) => {
        setProcessingId(transactionId);
        try {
            await adminAPI.approveWithdrawal(transactionId);
            toast.success('Retiro aprobado y completado');
            fetchWithdrawals();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Error al aprobar retiro');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (transactionId) => {
        setProcessingId(transactionId);
        try {
            await adminAPI.rejectWithdrawal(transactionId);
            toast.success('Retiro rechazado');
            fetchWithdrawals();
        } catch (error) {
            toast.error('Error al rechazar retiro');
        } finally {
            setProcessingId(null);
        }
    };

    const handleStatusChange = async (transactionId, newStatus) => {
        setProcessingId(transactionId);
        try {
            await adminAPI.updateTransactionStatus({ transaction_id: transactionId, status: newStatus });
            toast.success(`Estado actualizado a: ${statusLabels[newStatus]}`);
            fetchWithdrawals();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Error al actualizar estado');
        } finally {
            setProcessingId(null);
        }
    };

    const openPaymentDialog = (withdrawal) => {
        setSelectedWithdrawal(withdrawal);
        setPaymentAmount('');
        setPaymentMethod('crypto');
        setCryptoType('');
        setTxid('');
        setNotes('');
        setPaymentDialogOpen(true);
    };

    const handleAddPayment = async () => {
        if (!paymentAmount || parseFloat(paymentAmount) < 200) {
            toast.error('El monto mínimo es $200 USD');
            return;
        }

        setSubmitting(true);
        try {
            await adminAPI.addManualTaxPayment({
                transaction_id: selectedWithdrawal.id,
                amount: parseFloat(paymentAmount),
                payment_method: paymentMethod,
                crypto_type: paymentMethod === 'crypto' ? cryptoType : null,
                txid: paymentMethod === 'crypto' ? txid : null,
                notes: notes
            });
            toast.success('Pago registrado exitosamente');
            setPaymentDialogOpen(false);
            fetchWithdrawals();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Error al registrar pago');
        } finally {
            setSubmitting(false);
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
        pending_tax: 'Impuesto Pendiente',
        under_review: 'En Revisión',
        processing: 'Procesando',
        completed: 'Completado',
        rejected: 'Rechazado'
    };

    const statusColors = {
        pending: 'text-amber-400 bg-amber-500/20',
        pending_tax: 'text-orange-400 bg-orange-500/20',
        under_review: 'text-purple-400 bg-purple-500/20',
        processing: 'text-cyan-400 bg-cyan-500/20',
        completed: 'text-emerald-400 bg-emerald-500/20',
        rejected: 'text-red-400 bg-red-500/20'
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
                        <h1 className="text-3xl font-heading font-bold text-white">Retiros Pendientes</h1>
                        <p className="text-slate-500 mt-1">Gestión de retiros y pagos de impuestos</p>
                    </div>
                    <Button
                        onClick={fetchWithdrawals}
                        variant="outline"
                        className="border-slate-700 hover:bg-slate-800"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Actualizar
                    </Button>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader className="border-b border-slate-800">
                            <CardTitle className="text-white font-heading flex items-center gap-2">
                                <Clock className="w-5 h-5 text-amber-400" />
                                Retiros ({withdrawals.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-8 space-y-4">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="h-20 bg-slate-800/50 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : withdrawals.length === 0 ? (
                                <div className="py-16 text-center">
                                    <CheckCircle className="w-12 h-12 mx-auto text-emerald-400 mb-4" />
                                    <p className="text-slate-500">No hay retiros pendientes</p>
                                    <p className="text-sm text-slate-600 mt-1">Todos los retiros han sido procesados</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-800 hover:bg-transparent">
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Usuario</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Monto Retiro</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Impuesto</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Pagos Realizados</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Estado</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Tiempo</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase text-right">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {withdrawals.map((w) => {
                                                const currentStatus = w.status || 'pending';
                                                const statusColor = statusColors[currentStatus] || statusColors.pending;
                                                const taxPaid = w.tax_paid || 0;
                                                const taxRequired = w.tax_required || 4850;
                                                const taxProgress = (taxPaid / taxRequired) * 100;
                                                const remaining = Math.max(0, taxRequired - taxPaid);
                                                
                                                return (
                                                    <TableRow key={w.id} className="border-slate-800/50 hover:bg-slate-800/30" data-testid={`withdrawal-row-${w.id}`}>
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
                                                        <TableCell className="font-mono font-medium text-red-400">
                                                            -{w.currency === 'USD' ? '$' : '€'}{w.amount?.toFixed(2)}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="space-y-2 min-w-[200px]">
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-slate-500">Requerido:</span>
                                                                    <span className="text-orange-400">${taxRequired.toFixed(0)}</span>
                                                                </div>
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-slate-500">Pagado:</span>
                                                                    <span className="text-emerald-400">${taxPaid.toFixed(0)}</span>
                                                                </div>
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-slate-500">Restante:</span>
                                                                    <span className={remaining > 0 ? 'text-red-400 font-bold' : 'text-emerald-400'}>${remaining.toFixed(0)}</span>
                                                                </div>
                                                                <Progress value={taxProgress} className="h-2" />
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="text-xs space-y-1">
                                                                <div className="flex items-center gap-1">
                                                                    <DollarSign className="w-3 h-3 text-slate-500" />
                                                                    <span className="text-slate-400">{w.total_payments_count || 0} pagos</span>
                                                                </div>
                                                                {w.manual_payments?.length > 0 && (
                                                                    <div className="text-slate-500">
                                                                        {w.manual_payments.length} manuales
                                                                    </div>
                                                                )}
                                                                {w.crypto_payments?.length > 0 && (
                                                                    <div className="text-slate-500">
                                                                        {w.crypto_payments.length} crypto
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Select
                                                                value={currentStatus}
                                                                onValueChange={(value) => handleStatusChange(w.id, value)}
                                                                disabled={processingId === w.id}
                                                            >
                                                                <SelectTrigger className={`w-40 ${statusColor} border-0 text-xs`}>
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent className="bg-slate-900 border-slate-700">
                                                                    <SelectItem value="pending_tax" className="text-orange-400">Impuesto Pendiente</SelectItem>
                                                                    <SelectItem value="under_review" className="text-purple-400">En Revisión</SelectItem>
                                                                    <SelectItem value="pending" className="text-amber-400">Pendiente Aprobación</SelectItem>
                                                                    <SelectItem value="processing" className="text-cyan-400">Procesando</SelectItem>
                                                                    <SelectItem value="completed" className="text-emerald-400">Completado</SelectItem>
                                                                    <SelectItem value="rejected" className="text-red-400">Rechazado</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="text-xs space-y-1">
                                                                <div className="text-slate-500">
                                                                    {formatDate(w.created_at)}
                                                                </div>
                                                                {w.is_expiring_soon && currentStatus === 'pending_tax' && (
                                                                    <div className="flex items-center gap-1 text-red-400">
                                                                        <AlertTriangle className="w-3 h-3" />
                                                                        <span>{w.hours_remaining?.toFixed(0)}h restantes</span>
                                                                    </div>
                                                                )}
                                                                {!w.is_expiring_soon && currentStatus === 'pending_tax' && (
                                                                    <div className="flex items-center gap-1 text-amber-400">
                                                                        <Timer className="w-3 h-3" />
                                                                        <span>{w.hours_remaining?.toFixed(0)}h restantes</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex flex-col items-end gap-2">
                                                                {currentStatus === 'pending_tax' && (
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={() => openPaymentDialog(w)}
                                                                        className="bg-orange-500 hover:bg-orange-600 text-white w-full"
                                                                        data-testid={`add-payment-btn-${w.id}`}
                                                                    >
                                                                        <Plus className="w-4 h-4 mr-1" />
                                                                        Agregar Pago
                                                                    </Button>
                                                                )}
                                                                <div className="flex gap-2">
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={() => handleApprove(w.id)}
                                                                        disabled={processingId === w.id || currentStatus === 'pending_tax'}
                                                                        className="bg-emerald-500 hover:bg-emerald-600 text-white"
                                                                        data-testid={`approve-btn-${w.id}`}
                                                                        title={currentStatus === 'pending_tax' ? 'El impuesto debe pagarse primero' : 'Aprobar retiro'}
                                                                    >
                                                                        {processingId === w.id ? (
                                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                                        ) : (
                                                                            <>
                                                                                <CheckCircle className="w-4 h-4 mr-1" />
                                                                                Completar
                                                                            </>
                                                                        )}
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => handleReject(w.id)}
                                                                        disabled={processingId === w.id}
                                                                        className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                                                                        data-testid={`reject-btn-${w.id}`}
                                                                    >
                                                                        {processingId === w.id ? (
                                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                                        ) : (
                                                                            <>
                                                                                <XCircle className="w-4 h-4 mr-1" />
                                                                                Rechazar
                                                                            </>
                                                                        )}
                                                                    </Button>
                                                                </div>
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

            {/* Manual Payment Dialog */}
            <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-emerald-400" />
                            Registrar Pago Manual
                        </DialogTitle>
                    </DialogHeader>
                    {selectedWithdrawal && (
                        <div className="space-y-4 pt-4">
                            {/* Withdrawal Info */}
                            <div className="p-3 rounded-lg bg-slate-800/50 space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Usuario:</span>
                                    <span className="text-white">{selectedWithdrawal.user?.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Email:</span>
                                    <span className="text-slate-300">{selectedWithdrawal.user?.email}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Monto Retiro:</span>
                                    <span className="text-red-400">${selectedWithdrawal.amount?.toFixed(2)}</span>
                                </div>
                                <hr className="border-slate-700" />
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Impuesto Requerido:</span>
                                    <span className="text-orange-400">${(selectedWithdrawal.tax_required || 4850).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Pagado:</span>
                                    <span className="text-emerald-400">${(selectedWithdrawal.tax_paid || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-white font-medium">Restante:</span>
                                    <span className="text-red-400 font-bold">
                                        ${Math.max(0, (selectedWithdrawal.tax_required || 4850) - (selectedWithdrawal.tax_paid || 0)).toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            {/* Payment Form */}
                            <div className="space-y-3">
                                <div className="space-y-2">
                                    <Label className="text-slate-300">Monto del Pago (USD) *</Label>
                                    <Input
                                        type="number"
                                        step="1"
                                        min="200"
                                        placeholder="Mínimo $200"
                                        value={paymentAmount}
                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-white font-mono"
                                        data-testid="manual-payment-amount"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-slate-300">Método de Pago</Label>
                                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                                        <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-slate-700">
                                            <SelectItem value="crypto">Criptomoneda</SelectItem>
                                            <SelectItem value="wire_transfer">Transferencia Bancaria</SelectItem>
                                            <SelectItem value="other">Otro</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {paymentMethod === 'crypto' && (
                                    <>
                                        <div className="space-y-2">
                                            <Label className="text-slate-300">Tipo de Crypto</Label>
                                            <Select value={cryptoType} onValueChange={setCryptoType}>
                                                <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                                                    <SelectValue placeholder="Seleccionar..." />
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-900 border-slate-700">
                                                    <SelectItem value="BTC">Bitcoin (BTC)</SelectItem>
                                                    <SelectItem value="ETH">Ethereum (ETH)</SelectItem>
                                                    <SelectItem value="USDT">Tether (USDT)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-slate-300">TXID (Opcional)</Label>
                                            <Input
                                                placeholder="Transaction ID del blockchain"
                                                value={txid}
                                                onChange={(e) => setTxid(e.target.value)}
                                                className="bg-slate-950 border-slate-800 text-white font-mono text-sm"
                                            />
                                        </div>
                                    </>
                                )}

                                <div className="space-y-2">
                                    <Label className="text-slate-300">Notas (Opcional)</Label>
                                    <Input
                                        placeholder="Notas adicionales..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-white"
                                    />
                                </div>
                            </div>

                            <Button
                                onClick={handleAddPayment}
                                disabled={submitting || !paymentAmount || parseFloat(paymentAmount) < 200}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                                data-testid="confirm-manual-payment-btn"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Procesando...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        Registrar Pago
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </Layout>
    );
};

export default AdminWithdrawalsPage;
