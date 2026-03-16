import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table';
import { BadgeCheck, CheckCircle, XCircle, Loader2, Eye, Camera, FileText, User, Clock, MapPin, Globe, Shield, RefreshCw, Download, ZoomIn } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { toast } from 'sonner';

export const AdminKYCPage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [viewDialog, setViewDialog] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [imagePreview, setImagePreview] = useState(null);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const response = await adminAPI.getPendingKYC();
            setUsers(response.data);
        } catch (error) {
            toast.error('Error al cargar solicitudes KYC');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleApprove = async (userId) => {
        setProcessingId(userId);
        try {
            await adminAPI.kycAction({ user_id: userId, action: 'approve' });
            toast.success('KYC aprobado exitosamente');
            setViewDialog(false);
            fetchUsers();
        } catch (error) {
            toast.error('Error al aprobar KYC');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (userId) => {
        if (!rejectionReason.trim()) {
            toast.error('Por favor ingrese un motivo de rechazo');
            return;
        }
        setProcessingId(userId);
        try {
            await adminAPI.kycAction({ user_id: userId, action: 'reject', rejection_reason: rejectionReason });
            toast.success('KYC rechazado');
            setViewDialog(false);
            setRejectionReason('');
            fetchUsers();
        } catch (error) {
            toast.error('Error al rechazar KYC');
        } finally {
            setProcessingId(null);
        }
    };

    const handleViewDocuments = (user) => {
        setSelectedUser(user);
        setRejectionReason('');
        setViewDialog(true);
    };

    const openImagePreview = (imageSrc, title) => {
        setImagePreview({ src: imageSrc, title });
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('es-ES', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const documentTypeLabels = {
        'passport': 'Pasaporte',
        'id_card': 'DNI / Cédula',
        'driver_license': 'Licencia de Conducir'
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="admin-kyc-page">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between"
                >
                    <div>
                        <h1 className="text-3xl font-heading font-bold text-white">Verificación KYC</h1>
                        <p className="text-slate-500 mt-1">Revisar y aprobar documentos de verificación de identidad</p>
                    </div>
                    <Button
                        onClick={fetchUsers}
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
                                <BadgeCheck className="w-5 h-5 text-cyan-400" />
                                Solicitudes Pendientes ({users.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-8 space-y-4">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="h-16 bg-slate-800/50 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : users.length === 0 ? (
                                <div className="py-16 text-center">
                                    <CheckCircle className="w-12 h-12 mx-auto text-emerald-400 mb-4" />
                                    <p className="text-slate-500">No hay solicitudes KYC pendientes</p>
                                    <p className="text-sm text-slate-600 mt-1">Todas las verificaciones han sido procesadas</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-800 hover:bg-transparent">
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Usuario</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Email</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Tipo Documento</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Documentos</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Enviado</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase text-right">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {users.map((user) => (
                                                <TableRow key={user.id} className="border-slate-800/50 hover:bg-slate-800/30" data-testid={`kyc-row-${user.id}`}>
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
                                                        <span className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs">
                                                            {documentTypeLabels[user.kyc_documents?.document_type] || user.kyc_documents?.document_type?.replace('_', ' ') || 'N/A'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2 text-xs">
                                                            <span className={`px-2 py-1 rounded ${user.kyc_documents?.document_front ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                                Frente {user.kyc_documents?.document_front ? '✓' : '✗'}
                                                            </span>
                                                            <span className={`px-2 py-1 rounded ${user.kyc_documents?.document_back ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                                Reverso {user.kyc_documents?.document_back ? '✓' : '✗'}
                                                            </span>
                                                            <span className={`px-2 py-1 rounded ${user.kyc_documents?.selfie_with_document ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                                Selfie {user.kyc_documents?.selfie_with_document ? '✓' : '✗'}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-slate-500 text-sm">
                                                        {user.kyc_documents?.submitted_at ? formatDate(user.kyc_documents.submitted_at) : 'N/A'}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleViewDocuments(user)}
                                                            className="bg-cyan-500 hover:bg-cyan-600 text-white"
                                                            data-testid={`view-docs-${user.id}`}
                                                        >
                                                            <Eye className="w-4 h-4 mr-1" />
                                                            Revisar
                                                        </Button>
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

                {/* View Documents Dialog */}
                <Dialog open={viewDialog} onOpenChange={setViewDialog}>
                    <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                                <Shield className="w-5 h-5 text-cyan-400" />
                                Verificación KYC - {selectedUser?.name}
                            </DialogTitle>
                        </DialogHeader>
                        {selectedUser?.kyc_documents && (
                            <div className="space-y-6 pt-4">
                                {/* User Info */}
                                <div className="p-4 rounded-lg bg-slate-800/50 space-y-2">
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <span className="text-slate-500">Nombre:</span>
                                            <p className="text-white font-medium">{selectedUser.name}</p>
                                        </div>
                                        <div>
                                            <span className="text-slate-500">Email:</span>
                                            <p className="text-white">{selectedUser.email}</p>
                                        </div>
                                        <div>
                                            <span className="text-slate-500">Tipo de Documento:</span>
                                            <p className="text-white capitalize">
                                                {documentTypeLabels[selectedUser.kyc_documents.document_type] || selectedUser.kyc_documents.document_type?.replace('_', ' ')}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="text-slate-500">Firma Digital:</span>
                                            <p className="text-white font-medium">{selectedUser.kyc_documents.digital_signature}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Documents Grid */}
                                <div className="space-y-4">
                                    <h3 className="text-white font-medium flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-cyan-400" />
                                        Documentos Subidos
                                    </h3>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Document Front */}
                                        <div className="space-y-2">
                                            <Label className="text-slate-400 text-sm">Documento - Lado Frontal</Label>
                                            <div 
                                                className="relative border border-slate-700 rounded-lg overflow-hidden cursor-pointer hover:border-cyan-500/50 transition-colors group"
                                                onClick={() => selectedUser.kyc_documents.document_front && openImagePreview(selectedUser.kyc_documents.document_front, 'Documento - Lado Frontal')}
                                            >
                                                {selectedUser.kyc_documents.document_front ? (
                                                    <>
                                                        <img 
                                                            src={selectedUser.kyc_documents.document_front} 
                                                            alt="Documento Frontal" 
                                                            className="w-full h-40 object-cover"
                                                        />
                                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <ZoomIn className="w-8 h-8 text-white" />
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="w-full h-40 flex items-center justify-center bg-slate-800">
                                                        <span className="text-slate-500">No disponible</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Document Back */}
                                        <div className="space-y-2">
                                            <Label className="text-slate-400 text-sm">Documento - Lado Trasero</Label>
                                            <div 
                                                className="relative border border-slate-700 rounded-lg overflow-hidden cursor-pointer hover:border-cyan-500/50 transition-colors group"
                                                onClick={() => selectedUser.kyc_documents.document_back && openImagePreview(selectedUser.kyc_documents.document_back, 'Documento - Lado Trasero')}
                                            >
                                                {selectedUser.kyc_documents.document_back ? (
                                                    <>
                                                        <img 
                                                            src={selectedUser.kyc_documents.document_back} 
                                                            alt="Documento Trasero" 
                                                            className="w-full h-40 object-cover"
                                                        />
                                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <ZoomIn className="w-8 h-8 text-white" />
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="w-full h-40 flex items-center justify-center bg-slate-800">
                                                        <span className="text-slate-500">No disponible</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Selfie with Document */}
                                        <div className="space-y-2">
                                            <Label className="text-slate-400 text-sm flex items-center gap-1">
                                                <Camera className="w-3 h-3" />
                                                Selfie con Documento
                                            </Label>
                                            <div 
                                                className="relative border border-purple-500/30 rounded-lg overflow-hidden cursor-pointer hover:border-purple-500/50 transition-colors group"
                                                onClick={() => selectedUser.kyc_documents.selfie_with_document && openImagePreview(selectedUser.kyc_documents.selfie_with_document, 'Selfie con Documento')}
                                            >
                                                {selectedUser.kyc_documents.selfie_with_document ? (
                                                    <>
                                                        <img 
                                                            src={selectedUser.kyc_documents.selfie_with_document} 
                                                            alt="Selfie con Documento" 
                                                            className="w-full h-40 object-cover"
                                                        />
                                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <ZoomIn className="w-8 h-8 text-white" />
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="w-full h-40 flex items-center justify-center bg-slate-800">
                                                        <span className="text-slate-500">No disponible</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Legal Record */}
                                {selectedUser.kyc_documents.legal_record && (
                                    <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-3">
                                        <h3 className="text-amber-400 font-medium flex items-center gap-2">
                                            <Globe className="w-4 h-4" />
                                            Registro Legal
                                        </h3>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                            <div>
                                                <span className="text-slate-500 flex items-center gap-1">
                                                    <MapPin className="w-3 h-3" /> IP:
                                                </span>
                                                <p className="text-white font-mono text-xs">{selectedUser.kyc_documents.legal_record.ip_address}</p>
                                            </div>
                                            <div>
                                                <span className="text-slate-500">País (aprox.):</span>
                                                <p className="text-white">{selectedUser.kyc_documents.legal_record.country_approximate || 'Desconocido'}</p>
                                            </div>
                                            <div>
                                                <span className="text-slate-500">Navegador:</span>
                                                <p className="text-white">{selectedUser.kyc_documents.legal_record.browser || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> Fecha:
                                                </span>
                                                <p className="text-white text-xs">{formatDate(selectedUser.kyc_documents.legal_record.timestamp)}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Investment Info (if provided) */}
                                {(selectedUser.kyc_documents.investment_period || selectedUser.kyc_documents.investment_details) && (
                                    <div className="p-4 rounded-lg bg-slate-800/50 space-y-2">
                                        <h3 className="text-white font-medium">Información de Inversiones</h3>
                                        {selectedUser.kyc_documents.investment_period && (
                                            <p className="text-sm text-slate-400">
                                                Período: <span className="text-white">{selectedUser.kyc_documents.investment_period}</span>
                                            </p>
                                        )}
                                        {selectedUser.kyc_documents.investment_details && (
                                            <p className="text-sm text-slate-400">
                                                Detalles: <span className="text-white">{selectedUser.kyc_documents.investment_details}</span>
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Rejection Reason Input */}
                                <div className="space-y-2">
                                    <Label className="text-slate-300">Motivo de Rechazo (requerido para rechazar)</Label>
                                    <Textarea
                                        placeholder="Ingrese el motivo si va a rechazar esta solicitud..."
                                        value={rejectionReason}
                                        onChange={(e) => setRejectionReason(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-white min-h-[80px]"
                                    />
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-3 pt-4">
                                    <Button
                                        onClick={() => handleApprove(selectedUser.id)}
                                        disabled={processingId === selectedUser.id}
                                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                                        data-testid="approve-kyc-btn"
                                    >
                                        {processingId === selectedUser.id ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                        )}
                                        Aprobar Verificación
                                    </Button>
                                    <Button
                                        onClick={() => handleReject(selectedUser.id)}
                                        disabled={processingId === selectedUser.id}
                                        variant="outline"
                                        className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
                                        data-testid="reject-kyc-btn"
                                    >
                                        {processingId === selectedUser.id ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                            <XCircle className="w-4 h-4 mr-2" />
                                        )}
                                        Rechazar
                                    </Button>
                                </div>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

                {/* Image Preview Dialog */}
                <Dialog open={!!imagePreview} onOpenChange={() => setImagePreview(null)}>
                    <DialogContent className="bg-slate-900 border-slate-800 max-w-3xl">
                        <DialogHeader>
                            <DialogTitle className="text-white">{imagePreview?.title}</DialogTitle>
                        </DialogHeader>
                        <div className="pt-4">
                            {imagePreview?.src && (
                                <img 
                                    src={imagePreview.src} 
                                    alt={imagePreview.title}
                                    className="w-full rounded-lg"
                                />
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </Layout>
    );
};

export default AdminKYCPage;
