import { useState, useEffect, useRef } from 'react';
import { Layout } from '../components/layout/Layout';
import { fiscalAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import {
    FileText, UploadCloud, Loader2, CheckCircle, XCircle, Clock, RefreshCw, Eye,
} from 'lucide-react';

const STATUS_STYLE = {
    pending_review: { label: 'Pendiente de revisión', cls: 'bg-amber-500/15 text-amber-300', Icon: Clock },
    accepted: { label: 'Aceptado', cls: 'bg-emerald-500/15 text-emerald-300', Icon: CheckCircle },
    rejected: { label: 'Rechazado', cls: 'bg-red-500/15 text-red-300', Icon: XCircle },
    resubmission_requested: { label: 'Se solicita nuevamente', cls: 'bg-cyan-500/15 text-cyan-300', Icon: RefreshCw },
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const openFiscalDoc = async (id) => {
    try {
        const { data } = await fiscalAPI.content(id);
        const win = window.open('', '_blank');
        if (data.mime === 'application/pdf') {
            win.document.write(`<iframe src="data:application/pdf;base64,${data.content_b64}" style="width:100%;height:100vh;border:0"></iframe>`);
        } else {
            win.document.write(`<img src="data:${data.mime};base64,${data.content_b64}" style="max-width:100%" alt="${data.name}"/>`);
        }
        win.document.title = data.name;
    } catch {
        toast.error('No se pudo abrir el documento');
    }
};

const FiscalDocumentsPage = () => {
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [note, setNote] = useState('');
    const fileRef = useRef(null);

    const load = async () => {
        try {
            const { data } = await fiscalAPI.mine();
            setDocs(data.documents || []);
        } catch {
            toast.error('Error al cargar sus documentos');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const handleUpload = async () => {
        const file = fileRef.current?.files?.[0];
        if (!file) { toast.error('Seleccione un archivo'); return; }
        if (file.size > 8 * 1024 * 1024) { toast.error('Archivo demasiado grande (máx 8 MB)'); return; }
        setUploading(true);
        try {
            const b64 = await new Promise((res, rej) => {
                const r = new FileReader();
                r.onload = () => res(r.result);
                r.onerror = rej;
                r.readAsDataURL(file);
            });
            await fiscalAPI.upload({ name: file.name, mime: file.type, content_b64: b64, note });
            toast.success('Documento enviado. Recibirá una notificación tras la revisión.');
            setNote('');
            fileRef.current.value = '';
            load();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al subir el documento');
        } finally {
            setUploading(false);
        }
    };

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-6" data-testid="fiscal-documents-page">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/25">
                        <FileText className="w-6 h-6 text-cyan-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Documentación Fiscal</h1>
                        <p className="text-sm text-slate-400 font-light">Suba la documentación fiscal cuando le sea requerida · Revisión administrativa</p>
                    </div>
                </div>

                {/* Upload */}
                <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 space-y-4" data-testid="fiscal-upload-card">
                    <p className="text-white font-semibold text-sm flex items-center gap-2"><UploadCloud className="w-4 h-4 text-cyan-400" /> Subir documento</p>
                    <div className="space-y-1.5">
                        <Label className="text-slate-400 text-xs">Archivo (PDF, PNG, JPG · máx 8 MB)</Label>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="application/pdf,image/png,image/jpeg,image/webp"
                            className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-cyan-500/15 file:text-cyan-300 file:text-sm file:font-semibold hover:file:bg-cyan-500/25 cursor-pointer"
                            data-testid="fiscal-file-input"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-slate-400 text-xs">Nota (opcional)</Label>
                        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: Certificado fiscal 2026"
                            className="bg-slate-950 border-slate-800 text-white text-sm" data-testid="fiscal-note-input" />
                    </div>
                    <Button onClick={handleUpload} disabled={uploading}
                        className="bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25"
                        data-testid="fiscal-upload-btn">
                        {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
                        Enviar para revisión
                    </Button>
                </div>

                {/* List */}
                <div className="rounded-2xl bg-slate-900/70 border border-slate-800 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800">
                        <p className="text-white font-semibold text-sm">Mis documentos</p>
                    </div>
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-cyan-400 animate-spin" /></div>
                    ) : docs.length === 0 ? (
                        <p className="text-slate-600 text-sm text-center py-10">Aún no ha subido documentación fiscal.</p>
                    ) : (
                        <div className="divide-y divide-slate-800/60">
                            {docs.map((d) => {
                                const st = STATUS_STYLE[d.status] || STATUS_STYLE.pending_review;
                                return (
                                    <div key={d.id} className="px-4 py-3 flex items-start gap-3" data-testid={`fiscal-doc-${d.id}`}>
                                        <FileText className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm font-medium truncate">{d.name}</p>
                                            <p className="text-slate-500 text-[11px]">{fmtDate(d.created_at)} · {(d.size_bytes / 1024).toFixed(0)} KB</p>
                                            {d.observation && (
                                                <p className="text-amber-300 text-xs mt-1 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-1.5" data-testid={`fiscal-observation-${d.id}`}>
                                                    Observación del revisor: {d.observation}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold ${st.cls}`}>
                                                <st.Icon className="w-3 h-3" /> {st.label}
                                            </span>
                                            <button onClick={() => openFiscalDoc(d.id)} className="text-slate-400 hover:text-white" title="Ver documento" data-testid={`fiscal-view-${d.id}`}>
                                                <Eye className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
};

export default FiscalDocumentsPage;
