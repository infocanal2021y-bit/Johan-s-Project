import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { kycAPI } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { BadgeCheck, Shield, Upload, Camera, Loader2, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export const KYCPage = () => {
    const [kycStatus, setKycStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [documentType, setDocumentType] = useState('passport');
    const [documentFile, setDocumentFile] = useState(null);
    const [selfieFile, setSelfieFile] = useState(null);

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

    const handleFileChange = (e, setFile) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFile(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!documentFile || !selfieFile) {
            toast.error('Please upload both document and selfie');
            return;
        }

        setSubmitting(true);
        try {
            await kycAPI.submit({
                document_type: documentType,
                document_data: documentFile,
                selfie_data: selfieFile,
            });
            toast.success('KYC documents submitted successfully');
            const response = await kycAPI.getStatus();
            setKycStatus(response.data);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to submit documents');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <Layout>
                <div className="max-w-2xl mx-auto flex items-center justify-center h-64">
                    <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
            </Layout>
        );
    }

    const renderStatusCard = () => {
        const status = kycStatus?.verification_status;

        if (status === 'verified') {
            return (
                <Card className="bg-emerald-500/10 border-emerald-500/30">
                    <CardContent className="p-8 text-center">
                        <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                        <h2 className="text-2xl font-heading font-bold text-emerald-400 mb-2">
                            Identity Verified
                        </h2>
                        <p className="text-emerald-400/70">
                            Your account has been verified. You have full access to all features including 
                            unlimited transfers up to €10,000 daily.
                        </p>
                    </CardContent>
                </Card>
            );
        }

        if (status === 'pending_verification') {
            return (
                <Card className="bg-cyan-500/10 border-cyan-500/30">
                    <CardContent className="p-8 text-center">
                        <Clock className="w-16 h-16 text-cyan-400 mx-auto mb-4" />
                        <h2 className="text-2xl font-heading font-bold text-cyan-400 mb-2">
                            Verification Pending
                        </h2>
                        <p className="text-cyan-400/70">
                            Your documents are being reviewed by our team. This usually takes 1-2 business days.
                            You'll receive a notification once the review is complete.
                        </p>
                    </CardContent>
                </Card>
            );
        }

        return null;
    };

    if (kycStatus?.verification_status !== 'unverified') {
        return (
            <Layout>
                <div className="max-w-2xl mx-auto space-y-8" data-testid="kyc-page">
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <h1 className="text-3xl font-heading font-bold text-white">Identity Verification</h1>
                        <p className="text-slate-500 mt-1">Verify your identity to unlock all features</p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        {renderStatusCard()}
                    </motion.div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="max-w-2xl mx-auto space-y-8" data-testid="kyc-page">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl font-heading font-bold text-white">Identity Verification</h1>
                    <p className="text-slate-500 mt-1">Complete KYC to unlock all features</p>
                </motion.div>

                {/* Benefits Banner */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30"
                >
                    <div className="flex items-start gap-3">
                        <BadgeCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-emerald-400 font-medium">Benefits of Verification</p>
                            <ul className="text-sm text-emerald-400/70 mt-2 space-y-1">
                                <li>• Transfer up to €10,000 per day (vs €1,000 unverified)</li>
                                <li>• Higher single transaction limits</li>
                                <li>• Priority customer support</li>
                                <li>• Access to premium features</li>
                            </ul>
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                    <Shield className="w-6 h-6 text-emerald-400" />
                                </div>
                                <div>
                                    <CardTitle className="text-white font-heading">Submit Documents</CardTitle>
                                    <CardDescription className="text-slate-500">
                                        Upload your ID and selfie for verification
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-6">
                                {/* Document Type */}
                                <div className="space-y-2">
                                    <Label className="text-slate-300">Document Type</Label>
                                    <Select value={documentType} onValueChange={setDocumentType}>
                                        <SelectTrigger className="bg-slate-950/50 border-slate-800 text-white" data-testid="document-type-selector">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-slate-800">
                                            <SelectItem value="passport" className="text-white">Passport</SelectItem>
                                            <SelectItem value="id_card" className="text-white">National ID Card</SelectItem>
                                            <SelectItem value="driver_license" className="text-white">Driver's License</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Document Upload */}
                                <div className="space-y-2">
                                    <Label className="text-slate-300">Identity Document</Label>
                                    <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                                        documentFile ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-700 hover:border-slate-600'
                                    }`}>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => handleFileChange(e, setDocumentFile)}
                                            className="hidden"
                                            id="document-upload"
                                            data-testid="document-upload"
                                        />
                                        <label htmlFor="document-upload" className="cursor-pointer">
                                            {documentFile ? (
                                                <div className="space-y-2">
                                                    <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
                                                    <p className="text-emerald-400">Document uploaded</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <Upload className="w-10 h-10 text-slate-500 mx-auto" />
                                                    <p className="text-slate-400">Click to upload document</p>
                                                    <p className="text-xs text-slate-600">JPG, PNG up to 10MB</p>
                                                </div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                {/* Selfie Upload */}
                                <div className="space-y-2">
                                    <Label className="text-slate-300">Selfie with Document</Label>
                                    <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                                        selfieFile ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-700 hover:border-slate-600'
                                    }`}>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => handleFileChange(e, setSelfieFile)}
                                            className="hidden"
                                            id="selfie-upload"
                                            data-testid="selfie-upload"
                                        />
                                        <label htmlFor="selfie-upload" className="cursor-pointer">
                                            {selfieFile ? (
                                                <div className="space-y-2">
                                                    <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
                                                    <p className="text-emerald-400">Selfie uploaded</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <Camera className="w-10 h-10 text-slate-500 mx-auto" />
                                                    <p className="text-slate-400">Click to upload selfie</p>
                                                    <p className="text-xs text-slate-600">Hold your document next to your face</p>
                                                </div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={submitting || !documentFile || !selfieFile}
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium"
                                    data-testid="submit-kyc-btn"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        'Submit for Verification'
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </Layout>
    );
};

export default KYCPage;
