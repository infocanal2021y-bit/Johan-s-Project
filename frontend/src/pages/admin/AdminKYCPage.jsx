import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table';
import { BadgeCheck, CheckCircle, XCircle, Loader2, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { toast } from 'sonner';

export const AdminKYCPage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [viewDialog, setViewDialog] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);

    const fetchUsers = async () => {
        try {
            const response = await adminAPI.getPendingKYC();
            setUsers(response.data);
        } catch (error) {
            toast.error('Failed to load KYC requests');
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
            toast.success('KYC approved');
            fetchUsers();
        } catch (error) {
            toast.error('Failed to approve KYC');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (userId) => {
        setProcessingId(userId);
        try {
            await adminAPI.kycAction({ user_id: userId, action: 'reject' });
            toast.success('KYC rejected');
            fetchUsers();
        } catch (error) {
            toast.error('Failed to reject KYC');
        } finally {
            setProcessingId(null);
        }
    };

    const handleViewDocuments = (user) => {
        setSelectedUser(user);
        setViewDialog(true);
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8" data-testid="admin-kyc-page">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl font-heading font-bold text-white">KYC Verification Requests</h1>
                    <p className="text-slate-500 mt-1">Review and approve identity verification documents</p>
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
                                Pending Requests ({users.length})
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
                                    <p className="text-slate-500">No pending KYC requests</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-slate-800 hover:bg-transparent">
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">User</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Email</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Document Type</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase">Submitted</TableHead>
                                                <TableHead className="text-slate-500 font-mono text-xs uppercase text-right">Actions</TableHead>
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
                                                        <span className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs capitalize">
                                                            {user.kyc_documents?.document_type?.replace('_', ' ') || 'N/A'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-slate-500 text-sm">
                                                        {user.kyc_documents?.submitted_at ? formatDate(user.kyc_documents.submitted_at) : 'N/A'}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleViewDocuments(user)}
                                                                className="border-slate-700 hover:bg-slate-800"
                                                                data-testid={`view-docs-${user.id}`}
                                                            >
                                                                <Eye className="w-4 h-4 mr-1" />
                                                                View
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleApprove(user.id)}
                                                                disabled={processingId === user.id}
                                                                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                                                                data-testid={`approve-kyc-${user.id}`}
                                                            >
                                                                {processingId === user.id ? (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <CheckCircle className="w-4 h-4 mr-1" />
                                                                        Approve
                                                                    </>
                                                                )}
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleReject(user.id)}
                                                                disabled={processingId === user.id}
                                                                className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                                                                data-testid={`reject-kyc-${user.id}`}
                                                            >
                                                                <XCircle className="w-4 h-4 mr-1" />
                                                                Reject
                                                            </Button>
                                                        </div>
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
                    <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
                        <DialogHeader>
                            <DialogTitle className="text-white">
                                KYC Documents - {selectedUser?.name}
                            </DialogTitle>
                        </DialogHeader>
                        {selectedUser?.kyc_documents && (
                            <div className="space-y-4 pt-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-slate-400 mb-2">Identity Document</p>
                                        <div className="border border-slate-700 rounded-lg overflow-hidden">
                                            {selectedUser.kyc_documents.document_data && (
                                                <img 
                                                    src={selectedUser.kyc_documents.document_data} 
                                                    alt="ID Document" 
                                                    className="w-full h-48 object-cover"
                                                />
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-400 mb-2">Selfie</p>
                                        <div className="border border-slate-700 rounded-lg overflow-hidden">
                                            {selectedUser.kyc_documents.selfie_data && (
                                                <img 
                                                    src={selectedUser.kyc_documents.selfie_data} 
                                                    alt="Selfie" 
                                                    className="w-full h-48 object-cover"
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="p-3 rounded-lg bg-slate-800/50">
                                    <p className="text-sm text-slate-400">
                                        Document Type: <span className="text-white capitalize">{selectedUser.kyc_documents.document_type?.replace('_', ' ')}</span>
                                    </p>
                                </div>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </Layout>
    );
};

export default AdminKYCPage;
