import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { adminAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Switch } from '../../components/ui/switch';
import { Megaphone, Mail, Bell, Users, Send, Loader2, CheckCircle, Clock, AlertTriangle, Sparkles, FileText, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

const TEMPLATES = [
    {
        id: 'bank_verification',
        label: 'Verificacion de origen de fondos',
        icon: ShieldAlert,
        title: 'Aviso importante sobre la verificacion de su transferencia',
        message: `Estimado cliente,

Le informamos que, en algunos casos, las entidades bancarias estan solicitando a ciertos usuarios un justificante o documento que acredite el origen de los fondos al momento de recibir la transferencia.

Esto forma parte de los controles habituales de verificacion de los bancos. En caso de que su entidad retenga el dinero o le solicite informacion adicional, le recomendamos contactarnos de inmediato para poder proporcionarle la documentacion necesaria que respalde el origen de los fondos.

Nuestro equipo esta disponible para asistirle y facilitarle toda la evidencia requerida, con el fin de que pueda completar el proceso sin inconvenientes.

Quedamos atentos a cualquier solicitud.

Atentamente,
Equipo de Soporte`,
    },
    {
        id: 'blank',
        label: 'Mensaje en blanco',
        icon: FileText,
        title: '',
        message: '',
    },
];

const AUDIENCES = [
    { value: 'all', label: 'Todos los usuarios registrados', desc: 'Excluyendo administradores' },
    { value: 'kyc_verified', label: 'Solo usuarios con KYC aprobado', desc: 'Clientes verificados' },
    { value: 'withdrawers', label: 'Usuarios con al menos un retiro', desc: 'Clientes activos' },
];

export const AdminBroadcastPage = () => {
    const [title, setTitle] = useState(TEMPLATES[0].title);
    const [message, setMessage] = useState(TEMPLATES[0].message);
    const [sendInApp, setSendInApp] = useState(true);
    const [sendEmail, setSendEmail] = useState(true);
    const [audience, setAudience] = useState('all');
    const [selectedTemplate, setSelectedTemplate] = useState('bank_verification');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [sending, setSending] = useState(false);
    const [lastResult, setLastResult] = useState(null);
    const [history, setHistory] = useState([]);
    const [userCount, setUserCount] = useState(null);

    const fetchHistory = async () => {
        try {
            const res = await adminAPI.getBroadcastHistory();
            setHistory(res.data || []);
        } catch (e) { /* silent */ }
    };

    const fetchUserCount = async () => {
        try {
            const res = await adminAPI.getUsers();
            const total = (res.data || []).filter(u => u.role !== 'admin').length;
            setUserCount(total);
        } catch (e) { /* silent */ }
    };

    useEffect(() => {
        fetchHistory();
        fetchUserCount();
    }, []);

    const applyTemplate = (id) => {
        const tpl = TEMPLATES.find(t => t.id === id);
        if (!tpl) return;
        setSelectedTemplate(id);
        setTitle(tpl.title);
        setMessage(tpl.message);
    };

    const validate = () => {
        if (!title.trim()) { toast.error('Ingrese un titulo'); return false; }
        if (!message.trim()) { toast.error('Ingrese un mensaje'); return false; }
        if (!sendInApp && !sendEmail) { toast.error('Debe seleccionar al menos un canal'); return false; }
        return true;
    };

    const handleSend = async () => {
        if (!validate()) return;
        setSending(true);
        try {
            const res = await adminAPI.broadcast({
                title: title.trim(),
                message: message.trim(),
                send_in_app: sendInApp,
                send_email: sendEmail,
                audience,
            });
            setLastResult(res.data);
            toast.success(`Difusion enviada: ${res.data.recipients} destinatarios`);
            setConfirmOpen(false);
            fetchHistory();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Error al enviar la difusion');
        } finally {
            setSending(false);
        }
    };

    const formatDate = (iso) => {
        if (!iso) return '';
        return new Date(iso).toLocaleString('es-ES', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    const audienceLabel = AUDIENCES.find(a => a.value === audience)?.label || audience;

    return (
        <Layout>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto"
                data-testid="admin-broadcast-page"
            >
                {/* Header */}
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#14549C] to-[#0b3f75] flex items-center justify-center shadow-lg shadow-[#14549C]/20">
                        <Megaphone className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Difusion a Usuarios</h1>
                        <p className="text-slate-400 text-sm">Envia avisos masivos por notificacion in-app y/o correo electronico</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Composer */}
                    <div className="lg:col-span-2 space-y-4">
                        <Card className="bg-slate-900/70 border-slate-800">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-white text-base flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-amber-400" /> Plantilla rapida
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {TEMPLATES.map(tpl => {
                                        const Icon = tpl.icon;
                                        const active = selectedTemplate === tpl.id;
                                        return (
                                            <button
                                                key={tpl.id}
                                                onClick={() => applyTemplate(tpl.id)}
                                                data-testid={`template-${tpl.id}`}
                                                className={`text-left p-3 rounded-lg border transition-all flex items-start gap-3 ${
                                                    active
                                                        ? 'bg-[#14549C]/10 border-[#14549C]/50 ring-1 ring-[#14549C]/30'
                                                        : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80'
                                                }`}
                                            >
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                                    active ? 'bg-[#14549C]/20' : 'bg-slate-700/50'
                                                }`}>
                                                    <Icon className={`w-4 h-4 ${active ? 'text-[#14549C]' : 'text-slate-400'}`} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className={`text-sm font-medium ${active ? 'text-white' : 'text-slate-300'}`}>{tpl.label}</p>
                                                    {tpl.title && <p className="text-slate-500 text-xs truncate mt-0.5">{tpl.title}</p>}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-slate-900/70 border-slate-800">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-white text-base">Redactar mensaje</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-slate-300 text-xs uppercase tracking-wider">Titulo</Label>
                                    <Input
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="Ej. Aviso importante sobre su transferencia"
                                        className="bg-slate-950 border-slate-700 text-white"
                                        maxLength={200}
                                        data-testid="broadcast-title-input"
                                    />
                                    <p className="text-slate-600 text-[11px] text-right">{title.length}/200</p>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-slate-300 text-xs uppercase tracking-wider">Mensaje</Label>
                                    <Textarea
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        placeholder="Redacte aqui el cuerpo del mensaje..."
                                        rows={12}
                                        className="bg-slate-950 border-slate-700 text-white font-mono text-sm leading-relaxed"
                                        maxLength={5000}
                                        data-testid="broadcast-message-input"
                                    />
                                    <p className="text-slate-600 text-[11px] text-right">{message.length}/5000</p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Preview */}
                        <Card className="bg-slate-900/70 border-slate-800">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-white text-base flex items-center gap-2">
                                    <Bell className="w-4 h-4 text-emerald-400" /> Vista previa (notificacion in-app)
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/50">
                                    <div className="flex items-start gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-[#14549C]/20 flex items-center justify-center flex-shrink-0">
                                            <Bell className="w-4 h-4 text-[#14549C]" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white font-semibold text-sm">{title || '(sin titulo)'}</p>
                                            <p className="text-slate-400 text-xs whitespace-pre-wrap line-clamp-6 mt-1.5 leading-relaxed">
                                                {message || '(sin mensaje)'}
                                            </p>
                                            <p className="text-slate-600 text-[10px] mt-2 flex items-center gap-1">
                                                <Clock className="w-3 h-3" /> Ahora · LIONSBIT VERIFICACION
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Sidebar - Channels + Audience + Send */}
                    <div className="space-y-4">
                        <Card className="bg-slate-900/70 border-slate-800">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-white text-base flex items-center gap-2">
                                    <Send className="w-4 h-4 text-[#14549C]" /> Canales de envio
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <label className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 cursor-pointer hover:bg-slate-800/80 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                                            <Bell className="w-4 h-4 text-emerald-400" />
                                        </div>
                                        <div>
                                            <p className="text-white text-sm font-medium">Notificacion in-app</p>
                                            <p className="text-slate-500 text-xs">Aparece en la campana del usuario</p>
                                        </div>
                                    </div>
                                    <Switch checked={sendInApp} onCheckedChange={setSendInApp} data-testid="channel-in-app" />
                                </label>
                                <label className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 cursor-pointer hover:bg-slate-800/80 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                                            <Mail className="w-4 h-4 text-blue-400" />
                                        </div>
                                        <div>
                                            <p className="text-white text-sm font-medium">Correo electronico</p>
                                            <p className="text-slate-500 text-xs">Via Resend al email de cada usuario</p>
                                        </div>
                                    </div>
                                    <Switch checked={sendEmail} onCheckedChange={setSendEmail} data-testid="channel-email" />
                                </label>
                            </CardContent>
                        </Card>

                        <Card className="bg-slate-900/70 border-slate-800">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-white text-base flex items-center gap-2">
                                    <Users className="w-4 h-4 text-violet-400" /> Audiencia
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Select value={audience} onValueChange={setAudience}>
                                    <SelectTrigger className="bg-slate-950 border-slate-700 text-white" data-testid="audience-select">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-700">
                                        {AUDIENCES.map(a => (
                                            <SelectItem key={a.value} value={a.value} className="text-white">
                                                <div>
                                                    <p className="text-sm">{a.label}</p>
                                                    <p className="text-slate-500 text-[11px]">{a.desc}</p>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {userCount !== null && audience === 'all' && (
                                    <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 flex items-center gap-2">
                                        <Users className="w-4 h-4 text-slate-400" />
                                        <p className="text-slate-300 text-xs">
                                            <span className="text-white font-bold">{userCount}</span> usuarios recibiran este mensaje
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Button
                            onClick={() => validate() && setConfirmOpen(true)}
                            disabled={sending}
                            className="w-full bg-gradient-to-r from-[#14549C] to-[#0b3f75] hover:from-[#0b3f75] hover:to-[#14549C] text-white h-12 text-sm font-semibold shadow-lg shadow-[#14549C]/20"
                            data-testid="broadcast-send-btn"
                        >
                            {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                            Enviar difusion
                        </Button>

                        {lastResult && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30"
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                                    <p className="text-emerald-400 text-sm font-semibold">Envio exitoso</p>
                                </div>
                                <div className="space-y-1 text-xs">
                                    <p className="text-slate-300">Destinatarios: <span className="text-white font-bold">{lastResult.recipients}</span></p>
                                    <p className="text-slate-300">In-app enviadas: <span className="text-white font-bold">{lastResult.in_app_sent}</span></p>
                                    <p className="text-slate-300">Emails en cola: <span className="text-white font-bold">{lastResult.emails_queued}</span></p>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </div>

                {/* History */}
                {history.length > 0 && (
                    <Card className="bg-slate-900/70 border-slate-800">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-white text-base flex items-center gap-2">
                                <Clock className="w-4 h-4 text-slate-400" /> Historial de difusiones
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2" data-testid="broadcast-history">
                                {history.slice(0, 10).map((h, i) => (
                                    <div key={i} className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-[#14549C]/15 flex items-center justify-center flex-shrink-0">
                                            <Megaphone className="w-4 h-4 text-[#14549C]" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm font-medium truncate">{h.metadata?.title || h.description}</p>
                                            <p className="text-slate-500 text-xs mt-0.5">
                                                {h.metadata?.recipients || 0} destinatarios · {h.metadata?.in_app_sent || 0} in-app · {h.metadata?.emails_queued || 0} emails
                                            </p>
                                            <p className="text-slate-600 text-[11px] mt-1">
                                                {formatDate(h.created_at)} · Por {h.user_name || 'admin'}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Confirmation Modal */}
                <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                    <DialogContent className="bg-slate-900 border-slate-700 max-w-md" data-testid="broadcast-confirm-dialog">
                        <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-400" />
                                Confirmar envio masivo
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
                                <p className="text-slate-300 text-sm leading-relaxed">
                                    Esta accion enviara el mensaje a <span className="text-white font-bold">{audienceLabel.toLowerCase()}</span> por
                                    {sendInApp && ' notificacion in-app'}{sendInApp && sendEmail && ' y'}{sendEmail && ' correo electronico'}.
                                    <br/><br/>
                                    <span className="text-amber-400 font-medium">Esta accion no se puede revertir.</span>
                                </p>
                            </div>
                            <div className="bg-slate-800/60 rounded-lg p-3 space-y-1">
                                <p className="text-slate-500 text-xs uppercase tracking-wider">Vista previa</p>
                                <p className="text-white font-semibold text-sm">{title}</p>
                                <p className="text-slate-400 text-xs whitespace-pre-wrap line-clamp-4 leading-relaxed">{message}</p>
                            </div>
                        </div>
                        <DialogFooter className="gap-2">
                            <Button variant="outline" onClick={() => setConfirmOpen(false)} className="border-slate-700 text-slate-300" data-testid="broadcast-cancel-btn">
                                Cancelar
                            </Button>
                            <Button onClick={handleSend} disabled={sending} className="bg-[#14549C] hover:bg-[#0b3f75] text-white" data-testid="broadcast-confirm-btn">
                                {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                                Confirmar y enviar
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </motion.div>
        </Layout>
    );
};

export default AdminBroadcastPage;
