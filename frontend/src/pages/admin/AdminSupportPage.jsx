import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { 
    MessageSquare, 
    Send, 
    Clock, 
    CheckCircle, 
    AlertCircle,
    Loader2,
    User
} from 'lucide-react';
import { toast } from 'sonner';

const statusConfig = {
    open: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Open' },
    in_progress: { color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'In Progress' },
    resolved: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Resolved' },
    closed: { color: 'text-slate-400', bg: 'bg-slate-500/20', label: 'Closed' },
};

export const AdminSupportPage = () => {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [viewDialogOpen, setViewDialogOpen] = useState(false);
    const [replyMessage, setReplyMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchTickets = async () => {
        try {
            const response = await adminAPI.getAllTickets();
            setTickets(response.data);
        } catch (error) {
            toast.error('Failed to load tickets');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTickets();
    }, []);

    const handleViewTicket = (ticket) => {
        setSelectedTicket(ticket);
        setViewDialogOpen(true);
    };

    const handleReply = async () => {
        if (!replyMessage.trim()) return;
        
        setSubmitting(true);
        try {
            await adminAPI.replyToTicket(selectedTicket.id, {
                ticket_id: selectedTicket.id,
                message: replyMessage
            });
            toast.success('Reply sent');
            setReplyMessage('');
            fetchTickets();
            // Update selected ticket
            const updated = tickets.find(t => t.id === selectedTicket.id);
            if (updated) {
                setSelectedTicket({
                    ...updated,
                    replies: [...(updated.replies || []), {
                        id: Date.now().toString(),
                        message: replyMessage,
                        from_admin: true,
                        author_name: 'Support',
                        created_at: new Date().toISOString()
                    }]
                });
            }
        } catch (error) {
            toast.error('Failed to send reply');
        } finally {
            setSubmitting(false);
        }
    };

    const handleStatusChange = async (ticketId, newStatus) => {
        try {
            await adminAPI.updateTicketStatus(ticketId, newStatus);
            toast.success('Status updated');
            fetchTickets();
            if (selectedTicket?.id === ticketId) {
                setSelectedTicket({ ...selectedTicket, status: newStatus });
            }
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    const openTickets = tickets.filter(t => t.status === 'open').length;
    const inProgressTickets = tickets.filter(t => t.status === 'in_progress').length;

    return (
        <Layout>
            <div className="max-w-7xl mx-auto space-y-8">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl font-heading font-bold text-white flex items-center gap-3">
                        <MessageSquare className="w-8 h-8 text-emerald-400" />
                        Support Tickets
                    </h1>
                    <p className="text-slate-500 mt-1">Manage customer support requests</p>
                </motion.div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="bg-slate-900/70 border-slate-800">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                <AlertCircle className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-blue-400">{openTickets}</p>
                                <p className="text-xs text-slate-500">Open</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-slate-900/70 border-slate-800">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                                <Clock className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-amber-400">{inProgressTickets}</p>
                                <p className="text-xs text-slate-500">In Progress</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-slate-900/70 border-slate-800">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                <CheckCircle className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-emerald-400">
                                    {tickets.filter(t => t.status === 'resolved').length}
                                </p>
                                <p className="text-xs text-slate-500">Resolved</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-slate-900/70 border-slate-800">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-slate-500/20 flex items-center justify-center">
                                <MessageSquare className="w-5 h-5 text-slate-400" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-white">{tickets.length}</p>
                                <p className="text-xs text-slate-500">Total</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Tickets Table */}
                <Card className="bg-slate-900/70 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white font-heading">All Tickets</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="p-8 flex justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                            </div>
                        ) : tickets.length === 0 ? (
                            <div className="py-16 text-center">
                                <MessageSquare className="w-12 h-12 mx-auto text-slate-600 mb-4" />
                                <p className="text-slate-400">No tickets yet</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-slate-800">
                                        <TableHead className="text-slate-500">Ticket</TableHead>
                                        <TableHead className="text-slate-500">User</TableHead>
                                        <TableHead className="text-slate-500">Subject</TableHead>
                                        <TableHead className="text-slate-500">Category</TableHead>
                                        <TableHead className="text-slate-500">Status</TableHead>
                                        <TableHead className="text-slate-500">Date</TableHead>
                                        <TableHead className="text-slate-500">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {tickets.map((ticket) => {
                                        const status = statusConfig[ticket.status] || statusConfig.open;
                                        return (
                                            <TableRow key={ticket.id} className="border-slate-800 hover:bg-slate-800/30">
                                                <TableCell className="font-mono text-xs text-slate-400">
                                                    {ticket.ticket_number}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                                                            <User className="w-4 h-4 text-slate-400" />
                                                        </div>
                                                        <div>
                                                            <p className="text-white text-sm">{ticket.user_name}</p>
                                                            <p className="text-xs text-slate-500">{ticket.user_email}</p>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-white max-w-[200px] truncate">
                                                    {ticket.subject}
                                                </TableCell>
                                                <TableCell className="text-slate-400 capitalize">
                                                    {ticket.category}
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`px-2 py-1 rounded text-xs ${status.bg} ${status.color}`}>
                                                        {status.label}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-slate-400 text-sm">
                                                    {new Date(ticket.created_at).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleViewTicket(ticket)}
                                                        className="bg-emerald-500 hover:bg-emerald-600"
                                                    >
                                                        View
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* View/Reply Dialog */}
            <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-emerald-400" />
                                {selectedTicket?.ticket_number}
                            </span>
                            <Select
                                value={selectedTicket?.status}
                                onValueChange={(v) => handleStatusChange(selectedTicket.id, v)}
                            >
                                <SelectTrigger className="w-[140px] bg-slate-800 border-slate-700">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800">
                                    <SelectItem value="open">Open</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="resolved">Resolved</SelectItem>
                                    <SelectItem value="closed">Closed</SelectItem>
                                </SelectContent>
                            </Select>
                        </DialogTitle>
                    </DialogHeader>
                    {selectedTicket && (
                        <div className="space-y-4 pt-4">
                            {/* User info */}
                            <div className="p-3 rounded-lg bg-slate-800/50 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                                    <User className="w-5 h-5 text-slate-400" />
                                </div>
                                <div>
                                    <p className="text-white font-medium">{selectedTicket.user_name}</p>
                                    <p className="text-xs text-slate-500">{selectedTicket.user_email}</p>
                                </div>
                            </div>

                            {/* Original message */}
                            <div className="p-4 rounded-lg bg-slate-800/50">
                                <h3 className="text-white font-medium mb-2">{selectedTicket.subject}</h3>
                                <p className="text-slate-400 text-sm">{selectedTicket.message}</p>
                                <p className="text-xs text-slate-600 mt-2">
                                    {new Date(selectedTicket.created_at).toLocaleString()}
                                </p>
                            </div>

                            {/* Replies */}
                            {selectedTicket.replies?.length > 0 && (
                                <div className="space-y-3">
                                    {selectedTicket.replies.map((reply) => (
                                        <div
                                            key={reply.id}
                                            className={`p-3 rounded-lg ${reply.from_admin ? 'bg-emerald-500/10 border border-emerald-500/30 ml-4' : 'bg-slate-800/50'}`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className={`text-sm font-medium ${reply.from_admin ? 'text-emerald-400' : 'text-white'}`}>
                                                    {reply.author_name}
                                                </span>
                                                <span className="text-xs text-slate-500">
                                                    {new Date(reply.created_at).toLocaleString()}
                                                </span>
                                            </div>
                                            <p className="text-slate-300 text-sm">{reply.message}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Reply form */}
                            {selectedTicket.status !== 'closed' && (
                                <div className="pt-4 border-t border-slate-800">
                                    <div className="flex gap-2">
                                        <Input
                                            value={replyMessage}
                                            onChange={(e) => setReplyMessage(e.target.value)}
                                            placeholder="Type your reply..."
                                            className="bg-slate-950 border-slate-800 text-white"
                                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleReply()}
                                        />
                                        <Button
                                            onClick={handleReply}
                                            disabled={submitting || !replyMessage.trim()}
                                            className="bg-emerald-500 hover:bg-emerald-600"
                                        >
                                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </Layout>
    );
};

export default AdminSupportPage;
