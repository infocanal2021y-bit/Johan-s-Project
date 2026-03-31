import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { supportAPI } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { 
    MessageSquare, 
    Plus, 
    Clock, 
    CheckCircle, 
    AlertCircle,
    Send,
    Loader2
} from 'lucide-react';
import { toast } from 'sonner';

const statusConfig = {
    open: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Open' },
    in_progress: { color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'In Progress' },
    resolved: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Resolved' },
    closed: { color: 'text-slate-400', bg: 'bg-slate-500/20', label: 'Closed' },
};

export const SupportPage = () => {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [viewDialogOpen, setViewDialogOpen] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [newTicket, setNewTicket] = useState({ subject: '', message: '', category: 'general' });
    const [replyMessage, setReplyMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchTickets = async () => {
        try {
            const response = await supportAPI.getMyTickets();
            setTickets(response.data);
        } catch (error) {
            toast.error('Error al cargar tickets');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTickets();
    }, []);

    const handleCreateTicket = async () => {
        if (!newTicket.subject || !newTicket.message) {
            toast.error('Por favor complete todos los campos');
            return;
        }
        
        setSubmitting(true);
        try {
            await supportAPI.createTicket(newTicket);
            toast.success('Tu solicitud ha sido enviada correctamente');
            setCreateDialogOpen(false);
            setNewTicket({ subject: '', message: '', category: 'general' });
            fetchTickets();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Error al crear ticket');
        } finally {
            setSubmitting(false);
        }
    };

    const handleViewTicket = async (ticket) => {
        try {
            const response = await supportAPI.getTicket(ticket.id);
            setSelectedTicket(response.data);
            setViewDialogOpen(true);
        } catch (error) {
            toast.error('Error al cargar ticket');
        }
    };

    const handleReply = async () => {
        if (!replyMessage.trim()) return;
        
        setSubmitting(true);
        try {
            await supportAPI.replyToTicket(selectedTicket.id, { 
                ticket_id: selectedTicket.id,
                message: replyMessage 
            });
            toast.success('Respuesta enviada');
            setReplyMessage('');
            // Refresh ticket
            const response = await supportAPI.getTicket(selectedTicket.id);
            setSelectedTicket(response.data);
            fetchTickets();
        } catch (error) {
            toast.error('Error al enviar respuesta');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-8">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between"
                >
                    <div>
                        <h1 className="text-3xl font-heading font-bold text-white flex items-center gap-3">
                            <MessageSquare className="w-8 h-8 text-emerald-400" />
                            Support Center
                        </h1>
                        <p className="text-slate-500 mt-1">Get help from our support team</p>
                    </div>
                    <Button
                        onClick={() => setCreateDialogOpen(true)}
                        className="bg-emerald-500 hover:bg-emerald-600"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        New Ticket
                    </Button>
                </motion.div>

                {/* Tickets List */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white font-heading">My Tickets</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="space-y-4">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="h-20 bg-slate-800/50 rounded animate-pulse" />
                                    ))}
                                </div>
                            ) : tickets.length === 0 ? (
                                <div className="text-center py-12">
                                    <MessageSquare className="w-12 h-12 mx-auto text-slate-600 mb-4" />
                                    <p className="text-slate-400">No tickets yet</p>
                                    <p className="text-sm text-slate-600">Create a ticket if you need help</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {tickets.map((ticket) => {
                                        const status = statusConfig[ticket.status] || statusConfig.open;
                                        return (
                                            <div
                                                key={ticket.id}
                                                onClick={() => handleViewTicket(ticket)}
                                                className="p-4 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-xs text-slate-500 font-mono">
                                                                {ticket.ticket_number}
                                                            </span>
                                                            <span className={`px-2 py-0.5 rounded text-xs ${status.bg} ${status.color}`}>
                                                                {status.label}
                                                            </span>
                                                        </div>
                                                        <h3 className="text-white font-medium">{ticket.subject}</h3>
                                                        <p className="text-sm text-slate-400 mt-1 line-clamp-1">
                                                            {ticket.message}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs text-slate-500">
                                                            {new Date(ticket.created_at).toLocaleDateString()}
                                                        </p>
                                                        {ticket.replies?.length > 0 && (
                                                            <p className="text-xs text-emerald-400 mt-1">
                                                                {ticket.replies.length} replies
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* Create Ticket Dialog */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800">
                    <DialogHeader>
                        <DialogTitle className="text-white">Create Support Ticket</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label className="text-slate-300">Category</Label>
                            <Select
                                value={newTicket.category}
                                onValueChange={(v) => setNewTicket({ ...newTicket, category: v })}
                            >
                                <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800">
                                    <SelectItem value="general">General Question</SelectItem>
                                    <SelectItem value="transfer">Transfer Issue</SelectItem>
                                    <SelectItem value="account">Account Problem</SelectItem>
                                    <SelectItem value="technical">Technical Support</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-slate-300">Subject</Label>
                            <Input
                                value={newTicket.subject}
                                onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                                placeholder="Brief description of your issue"
                                className="bg-slate-950 border-slate-800 text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-slate-300">Message</Label>
                            <Textarea
                                value={newTicket.message}
                                onChange={(e) => setNewTicket({ ...newTicket, message: e.target.value })}
                                placeholder="Describe your issue in detail..."
                                rows={5}
                                className="bg-slate-950 border-slate-800 text-white"
                            />
                        </div>
                        <Button
                            onClick={handleCreateTicket}
                            disabled={submitting}
                            className="w-full bg-emerald-500 hover:bg-emerald-600"
                        >
                            {submitting ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <Send className="w-4 h-4 mr-2" />
                            )}
                            Submit Ticket
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* View Ticket Dialog */}
            <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-emerald-400" />
                            {selectedTicket?.ticket_number}
                        </DialogTitle>
                    </DialogHeader>
                    {selectedTicket && (
                        <div className="space-y-4 pt-4">
                            <div className="p-4 rounded-lg bg-slate-800/50">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-white font-medium">{selectedTicket.subject}</h3>
                                    <span className={`px-2 py-0.5 rounded text-xs ${statusConfig[selectedTicket.status]?.bg} ${statusConfig[selectedTicket.status]?.color}`}>
                                        {statusConfig[selectedTicket.status]?.label}
                                    </span>
                                </div>
                                <p className="text-slate-400 text-sm">{selectedTicket.message}</p>
                                <p className="text-xs text-slate-600 mt-2">
                                    {new Date(selectedTicket.created_at).toLocaleString()}
                                </p>
                            </div>

                            {/* Replies */}
                            {selectedTicket.replies?.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="text-sm text-slate-400 font-medium">Conversation</h4>
                                    {selectedTicket.replies.map((reply) => (
                                        <div
                                            key={reply.id}
                                            className={`p-3 rounded-lg ${reply.from_admin ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/50'}`}
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

                            {/* Reply Form */}
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

export default SupportPage;
