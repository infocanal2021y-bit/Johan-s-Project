import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { kycAPI } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
    BadgeCheck, Shield, Upload, Loader2, CheckCircle, Clock, AlertCircle, 
    FileText, PenTool, Scale, AlertTriangle, XCircle, Eye, Camera, User
} from 'lucide-react';
import { toast } from 'sonner';

export const KYCPage = () => {
    const [kycStatus, setKycStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    
    // Form fields
    const [documentType, setDocumentType] = useState('passport');
    const [documentFront, setDocumentFront] = useState(null);
    const [documentBack, setDocumentBack] = useState(null);
    const [selfieWithDocument, setSelfieWithDocument] = useState(null);
    const [documentFrontName, setDocumentFrontName] = useState('');
    const [documentBackName, setDocumentBackName] = useState('');
    const [selfieWithDocumentName, setSelfieWithDocumentName] = useState('');
    const [digitalSignature, setDigitalSignature] = useState('');
    const [legalConsent, setLegalConsent] = useState(false);
    const [investmentPeriod, setInvestmentPeriod] = useState('');
    const [investmentDetails, setInvestmentDetails] = useState('');

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const response = await kycAPI.getStatus();
                setKycStatus(response.data);
            } catch (error) {
                toast.error('Failed to load KYC status');
            } finally {
                setLoading(false);
            }
        };
        fetchStatus();
    }, []);

    const handleFileChange = (e, setFile, setFileName) => {
        const file = e.target.files[0];
        if (file) {
            // Validate file type
            const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
            if (!validTypes.includes(file.type)) {
                toast.error('Invalid file type. Please upload JPG, PNG, or PDF');
                return;
            }
            
            // Validate file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                toast.error('File too large. Maximum size is 10MB');
                return;
            }
            
            setFileName(file.name);
            const reader = new FileReader();
            reader.onloadend = () => {
                setFile(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validations
        if (!documentFront) {
            toast.error('Por favor suba el lado frontal de su documento');
            return;
        }
        
        if (!documentBack) {
            toast.error('Por favor suba el lado trasero de su documento');
            return;
        }
        
        if (!selfieWithDocument) {
            toast.error('Por favor suba una selfie sosteniendo su documento');
            return;
        }
        
        if (!digitalSignature || digitalSignature.trim().length < 3) {
            toast.error('Por favor ingrese su nombre completo como firma digital');
            return;
        }
        
        if (!legalConsent) {
            toast.error('Debe aceptar la declaración legal para continuar');
            return;
        }

        setSubmitting(true);
        try {
            await kycAPI.submit({
                document_type: documentType,
                document_front: documentFront,
                document_back: documentBack,
                selfie_with_document: selfieWithDocument,
                digital_signature: digitalSignature.trim(),
                legal_consent: legalConsent,
                investment_period: investmentPeriod || null,
                investment_details: investmentDetails || null,
            });
            toast.success('Documentos de verificación enviados exitosamente');
            const response = await kycAPI.getStatus();
            setKycStatus(response.data);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Error al enviar documentos');
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusConfig = (status) => {
        const configs = {
            'verified': { 
                icon: CheckCircle, 
                color: 'text-emerald-400', 
                bg: 'bg-emerald-500/20',
                border: 'border-emerald-500/30',
                label: 'Verificado' 
            },
            'pending_verification': { 
                icon: Clock, 
                color: 'text-amber-400', 
                bg: 'bg-amber-500/20',
                border: 'border-amber-500/30',
                label: 'En Revisión' 
            },
            'pending': { 
                icon: Clock, 
                color: 'text-amber-400', 
                bg: 'bg-amber-500/20',
                border: 'border-amber-500/30',
                label: 'Pendiente' 
            },
            'under_review': { 
                icon: Eye, 
                color: 'text-purple-400', 
                bg: 'bg-purple-500/20',
                border: 'border-purple-500/30',
                label: 'En Revisión' 
            },
            'rejected': { 
                icon: XCircle, 
                color: 'text-red-400', 
                bg: 'bg-red-500/20',
                border: 'border-red-500/30',
                label: 'Rechazado' 
            },
            'unverified': { 
                icon: AlertCircle, 
                color: 'text-slate-400', 
                bg: 'bg-slate-500/20',
                border: 'border-slate-500/30',
                label: 'No Verificado' 
            },
        };
        return configs[status] || configs['unverified'];
    };

    if (loading) {
        return (
            <Layout>
                <div className="max-w-4xl mx-auto flex items-center justify-center h-64">
                    <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
            </Layout>
        );
    }

    const statusConfig = getStatusConfig(kycStatus?.verification_status);
    const StatusIcon = statusConfig.icon;
    const isVerified = kycStatus?.verification_status === 'verified';
    const isPending = ['pending_verification', 'pending', 'under_review'].includes(kycStatus?.verification_status);
    const isRejected = kycStatus?.verification_status === 'rejected';

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between"
                >
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">Verificación de Identidad</h1>
                        <p className="text-slate-400">Complete la verificación para desbloquear todas las funciones</p>
                    </div>
                    <div className={`px-4 py-2 rounded-full ${statusConfig.bg} ${statusConfig.border} border flex items-center gap-2`}>
                        <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
                        <span className={`font-medium ${statusConfig.color}`}>{statusConfig.label}</span>
                    </div>
                </motion.div>

                {/* Verified Status */}
                {isVerified && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <Card className="bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border-emerald-500/30">
                            <CardContent className="p-8 text-center">
                                <div className="w-20 h-20 bg-emerald-500/20 rounded-full mx-auto mb-4 flex items-center justify-center">
                                    <BadgeCheck className="w-10 h-10 text-emerald-400" />
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-2">Identidad Verificada</h2>
                                <p className="text-slate-400">Su cuenta está completamente verificada. Tiene acceso a todas las funciones.</p>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}

                {/* Pending Status */}
                {isPending && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30">
                            <CardContent className="p-8 text-center">
                                <div className="w-20 h-20 bg-amber-500/20 rounded-full mx-auto mb-4 flex items-center justify-center">
                                    <Clock className="w-10 h-10 text-amber-400 animate-pulse" />
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-2">Verificación en Progreso</h2>
                                <p className="text-slate-400">Sus documentos están siendo revisados. Esto normalmente toma 24-48 horas.</p>
                                {kycStatus?.submitted_at && (
                                    <p className="text-sm text-slate-500 mt-2">
                                        Enviado: {new Date(kycStatus.submitted_at).toLocaleDateString('es-ES')}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                )}

                {/* Rejected Status */}
                {isRejected && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <Card className="bg-gradient-to-br from-red-500/10 to-orange-500/10 border-red-500/30">
                            <CardContent className="p-8 text-center">
                                <div className="w-20 h-20 bg-red-500/20 rounded-full mx-auto mb-4 flex items-center justify-center">
                                    <XCircle className="w-10 h-10 text-red-400" />
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-2">Verificación Rechazada</h2>
                                <p className="text-slate-400 mb-4">
                                    {kycStatus?.rejection_reason || 'Sus documentos no cumplieron con nuestros requisitos de verificación.'}
                                </p>
                                <p className="text-slate-500">Por favor envíe nuevos documentos a continuación.</p>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}

                {/* Verification Form - Show if not verified and not pending */}
                {!isVerified && !isPending && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <Card className="bg-slate-900/50 border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white flex items-center gap-2">
                                    <Shield className="w-5 h-5 text-emerald-400" />
                                    Formulario de Verificación
                                </CardTitle>
                                <CardDescription className="text-slate-400">
                                    Complete todos los campos para verificar su identidad
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleSubmit} className="space-y-8">
                                    {/* Document Type */}
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Tipo de Documento</Label>
                                        <Select value={documentType} onValueChange={setDocumentType}>
                                            <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-900 border-slate-700">
                                                <SelectItem value="passport">Pasaporte</SelectItem>
                                                <SelectItem value="id_card">DNI / Cédula de Identidad</SelectItem>
                                                <SelectItem value="driver_license">Licencia de Conducir</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Document Upload Section */}
                                    <div className="p-4 rounded-lg bg-slate-800/30 border border-slate-700 space-y-4">
                                        <h3 className="text-white font-medium flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-cyan-400" />
                                            Documento de Identidad (Ambos Lados)
                                        </h3>
                                        <p className="text-sm text-slate-500">
                                            Suba fotos claras de ambos lados de su documento de identidad (DNI, pasaporte o licencia).
                                        </p>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Document Upload - Front */}
                                            <div className="space-y-2">
                                                <Label className="text-slate-300">Lado Frontal *</Label>
                                                <div className="relative">
                                                    <input
                                                        type="file"
                                                        accept=".jpg,.jpeg,.png,.pdf"
                                                        onChange={(e) => handleFileChange(e, setDocumentFront, setDocumentFrontName)}
                                                        className="hidden"
                                                        id="document-front"
                                                        data-testid="document-front-input"
                                                    />
                                                    <label
                                                        htmlFor="document-front"
                                                        className={`flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                                                            documentFront 
                                                                ? 'border-emerald-500/50 bg-emerald-500/10' 
                                                                : 'border-slate-700 hover:border-slate-600 bg-slate-950/50'
                                                        }`}
                                                    >
                                                        {documentFront ? (
                                                            <>
                                                                <CheckCircle className="w-8 h-8 text-emerald-400" />
                                                                <span className="text-emerald-400 text-sm text-center">{documentFrontName}</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Upload className="w-8 h-8 text-slate-500" />
                                                                <span className="text-slate-500 text-sm text-center">Subir lado frontal</span>
                                                            </>
                                                        )}
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Document Upload - Back */}
                                            <div className="space-y-2">
                                                <Label className="text-slate-300">Lado Trasero *</Label>
                                                <div className="relative">
                                                    <input
                                                        type="file"
                                                        accept=".jpg,.jpeg,.png,.pdf"
                                                        onChange={(e) => handleFileChange(e, setDocumentBack, setDocumentBackName)}
                                                        className="hidden"
                                                        id="document-back"
                                                        data-testid="document-back-input"
                                                    />
                                                    <label
                                                        htmlFor="document-back"
                                                        className={`flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                                                            documentBack 
                                                                ? 'border-emerald-500/50 bg-emerald-500/10' 
                                                                : 'border-slate-700 hover:border-slate-600 bg-slate-950/50'
                                                        }`}
                                                    >
                                                        {documentBack ? (
                                                            <>
                                                                <CheckCircle className="w-8 h-8 text-emerald-400" />
                                                                <span className="text-emerald-400 text-sm text-center">{documentBackName}</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Upload className="w-8 h-8 text-slate-500" />
                                                                <span className="text-slate-500 text-sm text-center">Subir lado trasero</span>
                                                            </>
                                                        )}
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Selfie with Document */}
                                    <div className="p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 space-y-4">
                                        <h3 className="text-white font-medium flex items-center gap-2">
                                            <Camera className="w-4 h-4 text-purple-400" />
                                            Selfie con Documento
                                        </h3>
                                        <p className="text-sm text-slate-400">
                                            Suba una foto de su rostro sosteniendo el documento de identidad al lado de su cara. 
                                            Asegúrese de que tanto su rostro como el documento sean claramente visibles.
                                        </p>
                                        
                                        <div className="relative">
                                            <input
                                                type="file"
                                                accept=".jpg,.jpeg,.png"
                                                onChange={(e) => handleFileChange(e, setSelfieWithDocument, setSelfieWithDocumentName)}
                                                className="hidden"
                                                id="selfie-document"
                                                data-testid="selfie-document-input"
                                            />
                                            <label
                                                htmlFor="selfie-document"
                                                className={`flex items-center justify-center gap-3 p-8 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                                                    selfieWithDocument 
                                                        ? 'border-purple-500/50 bg-purple-500/10' 
                                                        : 'border-purple-500/30 hover:border-purple-500/50 bg-slate-950/50'
                                                }`}
                                            >
                                                {selfieWithDocument ? (
                                                    <>
                                                        <CheckCircle className="w-8 h-8 text-purple-400" />
                                                        <div className="text-center">
                                                            <span className="text-purple-400 font-medium">Selfie subida</span>
                                                            <p className="text-purple-400/70 text-sm">{selfieWithDocumentName}</p>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center">
                                                            <User className="w-8 h-8 text-purple-400" />
                                                        </div>
                                                        <div className="text-center">
                                                            <span className="text-purple-400 font-medium">Subir selfie con documento</span>
                                                            <p className="text-slate-500 text-sm">JPG o PNG, máx. 10MB</p>
                                                        </div>
                                                    </>
                                                )}
                                            </label>
                                        </div>
                                        
                                        <div className="flex items-start gap-2 p-3 rounded bg-purple-500/10">
                                            <AlertTriangle className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                                            <p className="text-xs text-purple-300">
                                                <strong>Importante:</strong> La selfie debe mostrar claramente su rostro y el documento de identidad 
                                                sostenido al lado de su cara. Esto es necesario para verificar que usted es el propietario del documento.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Investment History Section */}
                                    <div className="p-4 rounded-lg bg-slate-800/30 border border-slate-700 space-y-4">
                                        <h3 className="text-white font-medium flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-cyan-400" />
                                            Historial de Inversiones (2017-2023)
                                        </h3>
                                        <p className="text-sm text-slate-500">
                                            Si realizó inversiones entre 2017 y 2023, proporcione detalles a continuación.
                                        </p>
                                        
                                        <div className="space-y-2">
                                            <Label className="text-slate-400">Período de Inversión</Label>
                                            <Input
                                                placeholder="ej., 2017-2023"
                                                value={investmentPeriod}
                                                onChange={(e) => setInvestmentPeriod(e.target.value)}
                                                className="bg-slate-950 border-slate-800 text-white"
                                            />
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <Label className="text-slate-400">Detalles de la Inversión</Label>
                                            <Textarea
                                                placeholder="Describa sus inversiones..."
                                                value={investmentDetails}
                                                onChange={(e) => setInvestmentDetails(e.target.value)}
                                                className="bg-slate-950 border-slate-800 text-white min-h-[100px]"
                                            />
                                        </div>
                                    </div>

                                    {/* Digital Signature */}
                                    <div className="p-4 rounded-lg bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 border border-cyan-500/30 space-y-4">
                                        <h3 className="text-white font-medium flex items-center gap-2">
                                            <PenTool className="w-4 h-4 text-cyan-400" />
                                            Firma Digital
                                        </h3>
                                        <p className="text-sm text-slate-400">
                                            Escriba su nombre legal completo como firma digital para confirmar su identidad.
                                        </p>
                                        <div className="space-y-2">
                                            <Label className="text-slate-300">Nombre Legal Completo</Label>
                                            <Input
                                                placeholder="ej., Manuel Pérez García"
                                                value={digitalSignature}
                                                onChange={(e) => setDigitalSignature(e.target.value)}
                                                className="bg-slate-950 border-slate-800 text-white font-medium text-lg"
                                                data-testid="digital-signature-input"
                                            />
                                        </div>
                                    </div>

                                    {/* Legal Declaration */}
                                    <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/30 space-y-4">
                                        <h3 className="text-white font-medium flex items-center gap-2">
                                            <Scale className="w-4 h-4 text-red-400" />
                                            Declaración Legal
                                        </h3>
                                        
                                        <div className="flex items-start gap-3">
                                            <Checkbox
                                                id="legal-consent"
                                                checked={legalConsent}
                                                onCheckedChange={setLegalConsent}
                                                className="mt-1 border-red-500/50 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                                                data-testid="legal-consent-checkbox"
                                            />
                                            <label htmlFor="legal-consent" className="text-sm text-slate-300 leading-relaxed cursor-pointer">
                                                <span className="font-medium text-red-400">Declaro bajo mi responsabilidad</span> que soy el propietario legítimo de la información y documentos presentados. 
                                                Entiendo que proporcionar datos falsos o usar la identidad de otra persona sin autorización puede constituir fraude y dar lugar a acciones legales, 
                                                incluyendo denuncias ante instituciones financieras y autoridades judiciales correspondientes.
                                            </label>
                                        </div>
                                        
                                        {!legalConsent && (
                                            <p className="text-xs text-red-400 flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3" />
                                                Debe aceptar esta declaración para enviar su verificación
                                            </p>
                                        )}
                                    </div>

                                    {/* Submit Button */}
                                    <Button
                                        type="submit"
                                        disabled={submitting || !documentFront || !documentBack || !selfieWithDocument || !digitalSignature || !legalConsent}
                                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-6 text-lg"
                                        data-testid="kyc-submit-btn"
                                    >
                                        {submitting ? (
                                            <>
                                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                                Enviando...
                                            </>
                                        ) : (
                                            <>
                                                <BadgeCheck className="w-5 h-5 mr-2" />
                                                Enviar Verificación
                                            </>
                                        )}
                                    </Button>

                                    <p className="text-center text-xs text-slate-500">
                                        Su dirección IP, información del navegador y marca de tiempo serán registradas con fines legales.
                                    </p>
                                </form>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </div>
        </Layout>
    );
};

export default KYCPage;
