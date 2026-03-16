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
    FileText, PenTool, Scale, AlertTriangle, XCircle, Eye
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
    const [documentFrontName, setDocumentFrontName] = useState('');
    const [documentBackName, setDocumentBackName] = useState('');
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
            toast.error('Please upload front side of your document');
            return;
        }
        
        if (!documentBack) {
            toast.error('Please upload back side of your document');
            return;
        }
        
        if (!digitalSignature || digitalSignature.trim().length < 3) {
            toast.error('Please enter your full name as digital signature');
            return;
        }
        
        if (!legalConsent) {
            toast.error('You must accept the legal declaration to continue');
            return;
        }

        setSubmitting(true);
        try {
            await kycAPI.submit({
                document_type: documentType,
                document_front: documentFront,
                document_back: documentBack,
                digital_signature: digitalSignature.trim(),
                legal_consent: legalConsent,
                investment_period: investmentPeriod || null,
                investment_details: investmentDetails || null,
            });
            toast.success('Verification documents submitted successfully');
            const response = await kycAPI.getStatus();
            setKycStatus(response.data);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to submit documents');
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
                label: 'Verified' 
            },
            'pending_verification': { 
                icon: Clock, 
                color: 'text-amber-400', 
                bg: 'bg-amber-500/20',
                border: 'border-amber-500/30',
                label: 'Pending Review' 
            },
            'pending': { 
                icon: Clock, 
                color: 'text-amber-400', 
                bg: 'bg-amber-500/20',
                border: 'border-amber-500/30',
                label: 'Pending' 
            },
            'under_review': { 
                icon: Eye, 
                color: 'text-purple-400', 
                bg: 'bg-purple-500/20',
                border: 'border-purple-500/30',
                label: 'Under Review' 
            },
            'rejected': { 
                icon: XCircle, 
                color: 'text-red-400', 
                bg: 'bg-red-500/20',
                border: 'border-red-500/30',
                label: 'Rejected' 
            },
            'unverified': { 
                icon: AlertCircle, 
                color: 'text-slate-400', 
                bg: 'bg-slate-500/20',
                border: 'border-slate-500/30',
                label: 'Not Verified' 
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
                        <h1 className="text-3xl font-bold text-white mb-2">Identity Verification</h1>
                        <p className="text-slate-400">Complete verification to unlock all features</p>
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
                                <h2 className="text-2xl font-bold text-white mb-2">Identity Verified</h2>
                                <p className="text-slate-400">Your account is fully verified. You have access to all features.</p>
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
                                <h2 className="text-2xl font-bold text-white mb-2">Verification In Progress</h2>
                                <p className="text-slate-400">Your documents are being reviewed. This usually takes 24-48 hours.</p>
                                {kycStatus?.submitted_at && (
                                    <p className="text-sm text-slate-500 mt-2">
                                        Submitted: {new Date(kycStatus.submitted_at).toLocaleDateString()}
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
                                <h2 className="text-2xl font-bold text-white mb-2">Verification Rejected</h2>
                                <p className="text-slate-400 mb-4">
                                    {kycStatus?.rejection_reason || 'Your documents did not meet our verification requirements.'}
                                </p>
                                <p className="text-slate-500">Please submit new documents below.</p>
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
                                    Verification Form
                                </CardTitle>
                                <CardDescription className="text-slate-400">
                                    Complete all fields to verify your identity
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleSubmit} className="space-y-8">
                                    {/* Document Type */}
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Document Type</Label>
                                        <Select value={documentType} onValueChange={setDocumentType}>
                                            <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-900 border-slate-700">
                                                <SelectItem value="passport">Passport</SelectItem>
                                                <SelectItem value="id_card">National ID Card</SelectItem>
                                                <SelectItem value="driver_license">Driver's License</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Document Upload - Front */}
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Document - Front Side</Label>
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
                                                className={`flex items-center justify-center gap-3 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                                                    documentFront 
                                                        ? 'border-emerald-500/50 bg-emerald-500/10' 
                                                        : 'border-slate-700 hover:border-slate-600 bg-slate-950/50'
                                                }`}
                                            >
                                                {documentFront ? (
                                                    <>
                                                        <CheckCircle className="w-6 h-6 text-emerald-400" />
                                                        <span className="text-emerald-400">{documentFrontName}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Upload className="w-6 h-6 text-slate-500" />
                                                        <span className="text-slate-500">Upload front side (JPG, PNG, PDF)</span>
                                                    </>
                                                )}
                                            </label>
                                        </div>
                                    </div>

                                    {/* Document Upload - Back */}
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Document - Back Side</Label>
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
                                                className={`flex items-center justify-center gap-3 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                                                    documentBack 
                                                        ? 'border-emerald-500/50 bg-emerald-500/10' 
                                                        : 'border-slate-700 hover:border-slate-600 bg-slate-950/50'
                                                }`}
                                            >
                                                {documentBack ? (
                                                    <>
                                                        <CheckCircle className="w-6 h-6 text-emerald-400" />
                                                        <span className="text-emerald-400">{documentBackName}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Upload className="w-6 h-6 text-slate-500" />
                                                        <span className="text-slate-500">Upload back side (JPG, PNG, PDF)</span>
                                                    </>
                                                )}
                                            </label>
                                        </div>
                                    </div>

                                    {/* Investment History Section */}
                                    <div className="p-4 rounded-lg bg-slate-800/30 border border-slate-700 space-y-4">
                                        <h3 className="text-white font-medium flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-cyan-400" />
                                            Investment History (2017-2023)
                                        </h3>
                                        <p className="text-sm text-slate-500">
                                            If you made investments between 2017 and 2023, please provide details below.
                                        </p>
                                        
                                        <div className="space-y-2">
                                            <Label className="text-slate-400">Investment Period</Label>
                                            <Input
                                                placeholder="e.g., 2017-2023"
                                                value={investmentPeriod}
                                                onChange={(e) => setInvestmentPeriod(e.target.value)}
                                                className="bg-slate-950 border-slate-800 text-white"
                                            />
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <Label className="text-slate-400">Investment Details</Label>
                                            <Textarea
                                                placeholder="Describe your investments..."
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
                                            Digital Signature
                                        </h3>
                                        <p className="text-sm text-slate-400">
                                            Type your full legal name as digital signature to confirm your identity.
                                        </p>
                                        <div className="space-y-2">
                                            <Label className="text-slate-300">Full Legal Name</Label>
                                            <Input
                                                placeholder="e.g., Manuel Pérez"
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
                                            Legal Declaration
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
                                                <span className="font-medium text-red-400">I declare under my responsibility</span> that I am the legitimate owner of the information and documents submitted. 
                                                I understand that providing false data or using another person's identity without authorization may constitute fraud and lead to legal actions, 
                                                including reports to financial institutions and corresponding judicial authorities.
                                            </label>
                                        </div>
                                        
                                        {!legalConsent && (
                                            <p className="text-xs text-red-400 flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3" />
                                                You must accept this declaration to submit your verification
                                            </p>
                                        )}
                                    </div>

                                    {/* Submit Button */}
                                    <Button
                                        type="submit"
                                        disabled={submitting || !documentFront || !documentBack || !digitalSignature || !legalConsent}
                                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-6 text-lg"
                                        data-testid="kyc-submit-btn"
                                    >
                                        {submitting ? (
                                            <>
                                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                                Submitting...
                                            </>
                                        ) : (
                                            <>
                                                <BadgeCheck className="w-5 h-5 mr-2" />
                                                Submit Verification
                                            </>
                                        )}
                                    </Button>

                                    <p className="text-center text-xs text-slate-500">
                                        Your IP address, browser information, and submission timestamp will be recorded for legal purposes.
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
