import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import api, { transactionsAPI } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Progress } from '../components/ui/progress';
import { Download, FileText, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Filter, AlertTriangle, Loader2, FileDown, Bitcoin, Clock, ChevronRight, History, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { CryptoPaymentSection } from '../components/crypto/CryptoPaymentSection';
import { WithdrawalProgressBar } from '../components/WithdrawalProgressBar';

const WD_STAGES = [
    { status: 'pending_tax', label: 'Retiro solicitado · Pendiente de abono', color: '#f97316' },
    { status: 'crypto_payment_under_review', label: 'Comprobante enviado · En revisión', color: '#06b6d4' },
    { status: 'pending', label: 'Abono verificado · Retiro autorizado', color: '#1973B8' },
    { status: 'transfer_in_progress', label: 'Transferencia en proceso', color: '#f59e0b' },
    { status: 'completed', label: 'Retiro completado', color: '#10b981' },
];

const fmtExact = (iso) => !iso ? null : new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

const ProofBlock = ({ txId }) => {
    const [proof, setProof] = useState(undefined);
    useEffect(() => {
        let active = true;
        api.get(`/transactions/${txId}/proof`)
            .then((r) => { if (active) setProof(r.data); })
            .catch(() => { if (active) setProof(null); });
        return () => { active = false; };
    }, [txId]);

    if (proof === undefined) return null;
    if (!proof || !proof.has_proof) return null;

    const isPdf = (proof.proof_image || '').startsWith('data:application/pdf');
    return (
        <div className="pt-4 border-t border-slate-800" data-testid="proof-block">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Comprobante enviado
            </p>
            {isPdf ? (
                <a href={proof.proof_image} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-cyan-300 text-xs hover:bg-slate-800"
                    data-testid="proof-pdf-link">
                    <FileText className="w-4 h-4" /> Ver comprobante (PDF)
                </a>
            ) : (
                <a href={proof.proof_image} target="_blank" rel="noopener noreferrer" data-testid="proof-image-link">
                    <img src={proof.proof_image} alt="Comprobante" className="max-h-48 rounded-lg border border-slate-700" />
                </a>
            )}
            <div className="mt-2 space-y-0.5 text-[11px] text-slate-400">
                {proof.submitted_at && (
                    <p data-testid="proof-date">Enviado: <span className="text-slate-300">{new Date(proof.submitted_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></p>
                )}
                {proof.crypto_type && <p>Método: <span className="text-slate-300">{proof.crypto_type}</span>{proof.amount_sent ? ` · ${proof.amount_sent}` : ''}</p>}
                {proof.txid && <p className="font-mono break-all">TXID: <span className="text-slate-300">{proof.txid}</span></p>}
            </div>
        </div>
    );
};

const WithdrawTimeline = ({ tx }) => {
    let entries = tx.status_timeline || [];
    if (entries.length === 0) {
        entries = [{ at: tx.created_at, status: 'pending_tax' }];
        if (tx.tax_completed_at) entries.push({ at: tx.tax_completed_at, status: 'pending' });
        if (tx.status === 'completed') entries.push({ at: tx.completed_at || tx.released_at, status: 'completed' });
        if (tx.status === 'rejected') entries.push({ at: tx.completed_at, status: 'rejected' });
    }
    const isRejected = tx.status === 'rejected';
    const currentIdx = WD_STAGES.findIndex((s) => s.status === tx.status);

    return (
        <div className="space-y-3" data-testid="withdraw-timeline">
            {WD_STAGES.map((stage, i) => {
                const entry = entries.find((e) => e.status === stage.status);
                const reached = !isRejected && (Boolean(entry) || (currentIdx >= 0 && i <= currentIdx));
                const isCurrent = !isRejected && i === currentIdx;
                return (
                    <div key={stage.status} className="flex items-start gap-3" data-testid={`wd-timeline-step-${stage.status}`}>
                        <div className="flex flex-col items-center">
                            <div
                                className={`w-3.5 h-3.5 rounded-full mt-1 ring-2 ${reached ? '' : 'ring-slate-700 bg-slate-800'}`}
                                style={reached ? { background: stage.color, boxShadow: `0 0 0 3px ${stage.color}33` } : {}}
                            />
                            {i < WD_STAGES.length - 1 && <div className={`w-px h-6 mt-1 ${reached ? 'bg-slate-500' : 'bg-slate-800'}`} />}
                        </div>
                        <div className="-mt-0.5">
                            <p className={`text-[13px] font-bold ${reached ? 'text-white' : 'text-slate-600'}`}>
                                {stage.label}
                                {isCurrent && <Clock className="inline w-3 h-3 ml-1.5 text-amber-400" style={{ animation: 'spin 4s linear infinite' }} />}
                            </p>
                            {entry?.at && (
                                <p className="text-[11px] text-amber-400/90 mt-0.5 tabular-nums" data-testid={`wd-timeline-time-${stage.status}`}>
                                    {fmtExact(entry.at)}
                                </p>
                            )}
                            {entry?.note && <p className="text-[11px] text-slate-400 italic mt-0.5">"{entry.note}"</p>}
                        </div>
                    </div>
                );
            })}
            {isRejected && (
                <div className="flex items-start gap-3 pt-3 border-t border-slate-800">
                    <XCircle className="w-4 h-4 text-rose-400 mt-0.5" />
                    <div>
                        <p className="text-rose-300 text-[13px] font-bold">Rechazado</p>
                        {entries.filter((e) => e.status === 'rejected').map((e, i) => (
                            <div key={i}>
                                {e.at && <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">{fmtExact(e.at)}</p>}
                                {(e.note || tx.rejection_reason) && (
                                    <p className="text-[11px] text-slate-400 italic mt-0.5">"{e.note || tx.rejection_reason}"</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export const TransactionsPage = () => {
    const navigate = useNavigate();
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [taxDialogOpen, setTaxDialogOpen] = useState(false);
    const [timelineTx, setTimelineTx] = useState(null);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [downloadingReceipt, setDownloadingReceipt] = useState(null);

    const fetchTransactions = async () => {
        try {
            const response = await transactionsAPI.getAllHistory();
            setTransactions(response.data);
        } catch (error) {
            toast.error('Error al cargar transacciones');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTransactions();
    }, []);

    // Download receipt function
    const handleDownloadReceipt = async (transaction) => {
        if (transaction.status !== 'completed') {
            toast.error('El comprobante solo está disponible para transacciones completadas');
            return;
        }
        
        setDownloadingReceipt(transaction.id);
        try {
            const response = await transactionsAPI.downloadReceipt(transaction.id);
            
            // Create blob and download
            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `comprobante_${transaction.transaction_reference || transaction.id.slice(0, 8)}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            toast.success('Comprobante descargado correctamente');
        } catch (error) {
            toast.error('Error al descargar el comprobante');
        } finally {
            setDownloadingReceipt(null);
        }
    };

    const handleExportCSV = async () => {
        try {
            const response = await transactionsAPI.exportCSV();
            const blob = new Blob([response.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            // Use window.open or direct link click without DOM manipulation
            const link = Object.assign(document.createElement('a'), {
                href: url,
                download: 'transactions.csv',
                style: 'display: none'
            });
            link.click();
            // Cleanup after a delay to ensure download starts
            setTimeout(() => window.URL.revokeObjectURL(url), 100);
            toast.success('Transactions exported successfully');
        } catch (error) {
            toast.error('Failed to export transactions');
        }
    };

    const handleOpenTaxDialog = (tx) => {
        setSelectedTransaction(tx);
        setTaxDialogOpen(true);
    };

    const filteredTransactions = transactions.filter((tx) => {
        if (filter === 'all') return true;
        return tx.transaction_type === filter;
    });

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
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

    const typeConfig = {
        deposit: { icon: ArrowDownLeft, color: 'text-emerald-400', bg: 'bg-emerald-500/20', sign: '+' },
        withdraw: { icon: ArrowUpRight, color: 'text-red-400', bg: 'bg-red-500/20', sign: '-' },
        transfer: { icon: ArrowLeftRight, color: 'text-cyan-400', bg: 'bg-cyan-500/20', sign: '-' },
    };

    const statusConfig = {
        completed: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Completado' },
        pending: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', label: 'Pendiente de Aprobación' },
        pending_tax: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', label: 'Impuesto Pendiente' },
        under_review: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', label: 'En Revisión' },
        processing: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', label: 'Procesando' },
        transfer_in_progress: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', label: 'Transferencia en Proceso' },
        rejected: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', label: 'Rechazado' },
        crypto_payment_under_review: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', label: 'Crypto en Revisión' },
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="transactions-page">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                    <div>
                        <h1 className="text-3xl text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                            Historial de Transacciones
                        </h1>
                        <p className="text-slate-500 mt-1 font-light">Ver todas las transacciones anteriores</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Select value={filter} onValueChange={setFilter}>
                            <SelectTrigger className="w-36 bg-slate-900 border-slate-800 text-white" data-testid="filter-selector">
                                <Filter className="w-4 h-4 mr-2" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800">
                                <SelectItem value="all" className="text-white">Todos</SelectItem>
                                <SelectItem value="deposit" className="text-white">Depósitos</SelectItem>
                                <SelectItem value="withdraw" className="text-white">Retiros</SelectItem>
                                <SelectItem value="transfer" className="text-white">Transferencias</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            onClick={handleExportCSV}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white"
                            data-testid="export-csv-btn"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Exportar CSV
                        </Button>
                    </div>
                </motion.div>

                {/* Transactions Table */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader className="border-b border-slate-800">
                            <CardTitle className="text-white flex items-center gap-2" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                                <FileText className="w-5 h-5 text-emerald-400" />
                                Todas las Transacciones ({filteredTransactions.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-8 space-y-4">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className="h-16 bg-slate-800/50 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : filteredTransactions.length === 0 ? (
                                <div className="py-16 text-center">
                                    <FileText className="w-12 h-12 mx-auto text-slate-600 mb-4" />
                                    <p className="text-slate-500 font-normal">No se encontraron transacciones</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-800 hover:bg-transparent">
                                                <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Referencia</TableHead>
                                                <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Tipo</TableHead>
                                                <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Monto</TableHead>
                                                <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Estado</TableHead>
                                                <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium">Detalles</TableHead>
                                                <TableHead className="text-slate-500 text-xs uppercase tracking-wider font-medium text-right">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredTransactions.map((tx) => {
                                                const config = typeConfig[tx.transaction_type] || typeConfig.deposit;
                                                const Icon = config.icon;
                                                const isPendingTax = tx.status === 'pending_tax';
                                                const isCompleted = tx.status === 'completed';
                                                const taxRequired = tx.tax_required || 0;
                                                const taxPaid = tx.tax_paid || 0;
                                                const taxProgress = taxRequired > 0 ? (taxPaid / taxRequired) * 100 : 0;
                                                const statusCfg = statusConfig[tx.status] || statusConfig.pending;

                                                return (
                                                    <TableRow
                                                        key={tx.id}
                                                        className="border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                                                        data-testid={`transaction-row-${tx.id}`}
                                                    >
                                                        <TableCell className="py-4">
                                                            <span 
                                                                className="text-sm text-slate-300"
                                                                style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}
                                                            >
                                                                {tx.transaction_reference || tx.id.slice(0, 12)}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center`}>
                                                                    <Icon className={`w-5 h-5 ${config.color}`} />
                                                                </div>
                                                                <div>
                                                                    <span className="text-white capitalize" style={{ fontWeight: 500 }}>
                                                                        {tx.transaction_type === 'admin_credit' ? 'Depósito' : tx.transaction_type}
                                                                    </span>
                                                                    <p 
                                                                        className="text-xs text-slate-500 font-light"
                                                                        style={{ fontVariantNumeric: 'tabular-nums' }}
                                                                    >
                                                                        {formatDate(tx.created_at)}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span 
                                                                className={config.color}
                                                                style={{ 
                                                                    fontSize: '20px',
                                                                    fontWeight: 600, 
                                                                    fontVariantNumeric: 'tabular-nums',
                                                                    letterSpacing: '0.02em'
                                                                }}
                                                            >
                                                                {config.sign}{formatAmount(tx.amount, tx.currency)}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className={`px-3 py-1 rounded-full text-xs border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`} style={{ fontWeight: 500 }}>
                                                                {statusCfg.label}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>
                                                            {/* Show tax progress for transfers and withdrawals with tax_required */}
                                                            {(tx.transaction_type === 'transfer' || tx.transaction_type === 'withdraw') && taxRequired > 0 ? (
                                                                <div className="space-y-2 min-w-[180px]">
                                                                    <div className="flex justify-between text-xs">
                                                                        <span className="text-slate-500 font-normal">Impuesto</span>
                                                                        <span 
                                                                            className={isPendingTax ? 'text-orange-400' : 'text-emerald-400'}
                                                                            style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                                                                        >
                                                                            ${taxPaid.toFixed(0)} / ${taxRequired.toFixed(0)}
                                                                        </span>
                                                                    </div>
                                                                    <Progress 
                                                                        value={taxProgress} 
                                                                        className="h-2 bg-slate-700"
                                                                    />
                                                                    {isPendingTax && (
                                                                        <Button
                                                                            size="sm"
                                                                            onClick={() => handleOpenTaxDialog(tx)}
                                                                            className="w-full bg-orange-500 hover:bg-orange-600 text-white text-xs"
                                                                            data-testid={`pay-tax-btn-${tx.id}`}
                                                                        >
                                                                            <AlertTriangle className="w-3 h-3 mr-1" />
                                                                            Abonar Impuesto (${(taxRequired - taxPaid).toFixed(0)} restante)
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            ) : tx.transaction_type === 'withdraw' && tx.banking_info ? (
                                                                <div className="text-xs space-y-1">
                                                                    <p className="text-white">{tx.banking_info.bank_name}</p>
                                                                    <p className="text-slate-500">****{tx.banking_info.iban?.slice(-4)}</p>
                                                                </div>
                                                            ) : (
                                                                <span className="text-slate-600">-</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center gap-2 justify-end">
                                                                {/* Timeline button - for withdrawals */}
                                                                {tx.transaction_type === 'withdraw' && (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => setTimelineTx(tx)}
                                                                        className="border-amber-500/40 hover:bg-amber-500/10 text-amber-400"
                                                                        data-testid={`view-timeline-btn-${tx.id}`}
                                                                    >
                                                                        <History className="w-4 h-4" />
                                                                    </Button>
                                                                )}
                                                                {/* Complete Process Button - for processing withdrawals */}
                                                                {tx.status === 'processing' && tx.transaction_type === 'withdraw' && (
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={() => navigate(`/complete-withdrawal/${tx.id}`)}
                                                                        className="bg-cyan-500 hover:bg-cyan-600 text-white text-xs"
                                                                        data-testid={`complete-process-btn-${tx.id}`}
                                                                    >
                                                                        Completar proceso <ChevronRight className="w-3 h-3 ml-1" />
                                                                    </Button>
                                                                )}
                                                                {/* Download Receipt Button - for completed transactions */}
                                                                {isCompleted && (tx.transaction_type === 'transfer' || tx.transaction_type === 'withdraw') && (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => handleDownloadReceipt(tx)}
                                                                        disabled={downloadingReceipt === tx.id}
                                                                        className="border-emerald-500/50 hover:bg-emerald-500/10 text-emerald-400"
                                                                        data-testid={`download-receipt-${tx.id}`}
                                                                    >
                                                                        {downloadingReceipt === tx.id ? (
                                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                                        ) : (
                                                                            <>
                                                                                <FileDown className="w-4 h-4 mr-1" />
                                                                                Comprobante
                                                                            </>
                                                                        )}
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

            {/* Withdrawal Timeline Dialog */}
            <Dialog open={Boolean(timelineTx)} onOpenChange={(o) => !o && setTimelineTx(null)}>
                <DialogContent className="bg-[#0a0a0a] border-amber-500/20 max-w-md" data-testid="withdraw-timeline-dialog">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <History className="w-5 h-5 text-amber-400" />
                            Línea de tiempo del retiro
                        </DialogTitle>
                    </DialogHeader>
                    {timelineTx && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-mono text-cyan-400 text-xs">{timelineTx.transaction_reference || timelineTx.id.slice(0, 12)}</span>
                                <span className="text-white font-bold tabular-nums">
                                    {Number(timelineTx.amount).toLocaleString('es-ES', { minimumFractionDigits: 2 })} {timelineTx.currency}
                                </span>
                            </div>
                            <WithdrawTimeline tx={timelineTx} />
                            <ProofBlock txId={timelineTx.id} />
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Tax Payment Dialog - ONLY CRYPTO */}
            <Dialog open={taxDialogOpen} onOpenChange={setTaxDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <Bitcoin className="w-5 h-5 text-orange-400" />
                            Abonar al Impuesto / Pay Tax
                        </DialogTitle>
                    </DialogHeader>
                    {selectedTransaction && (
                        <div className="space-y-6 pt-4">
                            {/* Tax Summary */}
                            <div className="p-4 rounded-lg bg-slate-800/50 space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Referencia:</span>
                                    <span className="text-white font-mono">
                                        {selectedTransaction.transaction_reference || selectedTransaction.id.slice(0, 12)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Monto del Retiro:</span>
                                    <span className="text-white font-mono">
                                        ${selectedTransaction.amount?.toFixed(2)} {selectedTransaction.currency}
                                    </span>
                                </div>
                                <hr className="border-slate-700" />
                                <div className="flex justify-between">
                                    <span className="text-orange-400 font-medium">Impuesto Requerido:</span>
                                    <span className="text-orange-400 font-mono font-bold text-lg">
                                        ${(selectedTransaction.tax_required || 4850).toFixed(2)} USD
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-emerald-400">Pagado:</span>
                                    <span className="text-emerald-400 font-mono">
                                        ${(selectedTransaction.tax_paid || 0).toFixed(2)} USD
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-red-400 font-medium">Restante:</span>
                                    <span className="text-red-400 font-mono font-bold text-lg">
                                        ${Math.max(0, (selectedTransaction.tax_required || 4850) - (selectedTransaction.tax_paid || 0)).toFixed(2)} USD
                                    </span>
                                </div>
                                
                                {/* Progress Bar */}
                                <div className="pt-2">
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-slate-500">Progreso del pago</span>
                                        <span className="text-emerald-400">
                                            {(((selectedTransaction.tax_paid || 0) / (selectedTransaction.tax_required || 4850)) * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                    <Progress 
                                        value={((selectedTransaction.tax_paid || 0) / (selectedTransaction.tax_required || 4850)) * 100} 
                                        className="h-3 bg-slate-700"
                                    />
                                </div>
                                
                                {/* Info about minimum payment */}
                                <div className="mt-3 p-3 rounded bg-cyan-500/10 border border-cyan-500/30">
                                    <p className="text-cyan-400 text-sm">
                                        <Clock className="w-4 h-4 inline mr-2" />
                                        Abono mínimo: <strong>$200 USD</strong>. Puede realizar abonos parciales hasta completar el total.
                                    </p>
                                </div>
                                
                                {/* Warning about 72 hours */}
                                <div className="p-3 rounded bg-red-500/10 border border-red-500/30">
                                    <p className="text-red-400 text-sm">
                                        <AlertTriangle className="w-4 h-4 inline mr-2" />
                                        <strong>Importante:</strong> Si el impuesto no se paga dentro de 72 horas, el retiro será rechazado automáticamente.
                                    </p>
                                </div>
                            </div>

                            {/* Withdrawal Progress Bar */}
                            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                                <h3 className="text-white font-medium mb-4">Progreso del Retiro</h3>
                                <WithdrawalProgressBar 
                                    status={selectedTransaction.status}
                                    showSteps={true}
                                />
                            </div>

                            {/* ONLY Crypto Payment - No "Pay with Balance" option */}
                            <div className="space-y-4">
                                <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30">
                                    <h3 className="text-orange-400 font-medium flex items-center gap-2 mb-2">
                                        <Bitcoin className="w-5 h-5" />
                                        Pago con Criptomonedas
                                    </h3>
                                    <p className="text-sm text-orange-400/80">
                                        Seleccione una criptomoneda y envíe el monto correspondiente a la dirección indicada. 
                                        Un administrador verificará su pago manualmente.
                                    </p>
                                </div>
                                
                                <CryptoPaymentSection 
                                    transaction={selectedTransaction}
                                    onPaymentSubmitted={() => {
                                        setTaxDialogOpen(false);
                                        fetchTransactions();
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </Layout>
    );
};

export default TransactionsPage;
