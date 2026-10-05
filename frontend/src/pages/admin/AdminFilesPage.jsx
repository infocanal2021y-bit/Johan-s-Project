import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import api from '../../lib/api';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { FolderOpen, Loader2, RefreshCw, Trash2, Eye, Download, X, HardDrive, FileText, Image as ImageIcon, Search } from 'lucide-react';

const KINDS = [
    { id: '', label: 'Todos' }, { id: 'kyc', label: 'KYC' }, { id: 'payment_proofs', label: 'Comprobantes cripto' },
    { id: 'bank_transfer_proofs', label: 'Justificantes bancarios' }, { id: 'vault', label: 'Vault' },
];
const fmtSize = (b) => b == null ? '—' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`;
const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const isImage = (ct = '') => ct.startsWith('image/');
const fileUrl = (id, download = false) => `${process.env.REACT_APP_BACKEND_URL}/api/files/${id}?auth=${encodeURIComponent(localStorage.getItem('token') || '')}${download ? '&download=1' : ''}`;

const Preview = ({ file, onClose }) => (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={onClose} data-testid="admin-file-preview">
        <div className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl bg-slate-950 ring-1 ring-[#1973B8]/40" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800">
                <div className="min-w-0">
                    <p className="text-white text-[13px] font-semibold truncate">{file.original_filename}</p>
                    <p className="text-slate-500 text-[11px] font-mono">{file.content_type} · {fmtSize(file.size)} · {file.kind}</p>
                </div>
                <div className="flex items-center gap-2">
                    <a href={fileUrl(file.id, true)} className="inline-flex items-center h-8 px-3 rounded-md bg-white/5 border border-white/10 text-white text-[12px] hover:bg-white/10" data-testid="admin-file-download"><Download className="w-3.5 h-3.5 mr-1.5" /> Descargar</a>
                    <button onClick={onClose} className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-white/10" data-testid="admin-file-preview-close"><X className="w-5 h-5" /></button>
                </div>
            </div>
            <div className="p-4 flex items-center justify-center bg-slate-900/40 min-h-[300px]">
                {isImage(file.content_type) ? <img src={fileUrl(file.id)} alt={file.original_filename} className="max-h-[70vh] max-w-full rounded-lg" />
                    : file.content_type === 'application/pdf' ? <iframe title="pdf" src={fileUrl(file.id)} className="w-full h-[70vh] rounded-lg bg-white" />
                    : <div className="text-center text-slate-400 text-[13px]"><FileText className="w-10 h-10 mx-auto mb-2 text-slate-500" /> Sin vista previa para este tipo. Usa Descargar.</div>}
            </div>
        </div>
    </div>
);

export const AdminFilesPage = () => {
    const [kind, setKind] = useState('');
    const [q, setQ] = useState('');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [preview, setPreview] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try { const r = await api.get('/admin/files', { params: { kind: kind || undefined, limit: 300 } }); setData(r.data); }
        catch { toast.error('No se pudieron cargar los archivos'); }
        finally { setLoading(false); }
    }, [kind]);
    useEffect(() => { load(); }, [load]);

    const items = useMemo(() => {
        const list = data?.items || [];
        const nq = q.trim().toLowerCase();
        return nq ? list.filter((f) => [f.original_filename, f.user_id, f.id, f.source, f.content_type].some((v) => (v || '').toLowerCase().includes(nq))) : list;
    }, [data, q]);

    const remove = async (f) => {
        if (!window.confirm(`¿Eliminar "${f.original_filename}"? Dejará de estar disponible en la plataforma.`)) return;
        try { await api.delete(`/admin/files/${f.id}`); toast.success('Archivo eliminado'); load(); }
        catch (e) { toast.error(e.response?.data?.detail || 'No se pudo eliminar'); }
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5" data-testid="admin-files-page">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-[10.5px] uppercase tracking-[0.14em] text-amber-300 font-bold">Administración · Sistema</p>
                        <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1 flex items-center gap-2"><FolderOpen className="w-7 h-7 text-amber-300" /> Archivos y Multimedia</h1>
                        <p className="text-slate-400 text-[13px] mt-1.5">Archivos almacenados en el almacenamiento gestionado (Emergent Object Storage)</p>
                    </div>
                    <Button onClick={load} variant="outline" className="bg-white/5 border-white/15 text-white hover:bg-white/10" data-testid="admin-files-refresh"><RefreshCw className="w-4 h-4 mr-1.5" /> Refrescar</Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Card className="p-4 bg-gradient-to-br from-[#072146] to-[#004481] border-0"><p className="text-[9.5px] uppercase tracking-wider text-[#7CB1E5] font-bold">Archivos</p><p className="text-white text-2xl font-bold mt-1 tabular-nums" data-testid="admin-files-count">{data?.count ?? 0}</p></Card>
                    <Card className="p-4 bg-white/5 border-white/10"><p className="text-[9.5px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1"><HardDrive className="w-3 h-3" /> Tamaño total</p><p className="text-white text-2xl font-bold mt-1 tabular-nums">{fmtSize(data?.total_size)}</p></Card>
                    <Card className="p-4 bg-white/5 border-white/10 col-span-2 sm:col-span-1"><p className="text-[9.5px] uppercase tracking-wider text-slate-400 font-bold">Imágenes</p><p className="text-white text-2xl font-bold mt-1 tabular-nums">{(data?.items || []).filter((f) => isImage(f.content_type)).length}</p></Card>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {KINDS.map((k) => (
                        <button key={k.id} onClick={() => setKind(k.id)} data-testid={`admin-files-kind-${k.id || 'all'}`}
                            className={`px-3 py-1.5 rounded-full text-[11.5px] font-semibold border transition-colors ${kind === k.id ? 'bg-amber-500/15 text-amber-200 border-amber-500/40' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}>{k.label}</button>
                    ))}
                    <div className="ml-auto flex items-center gap-2 h-9 px-3 rounded-md bg-white/5 border border-white/10 min-w-[220px]">
                        <Search className="w-3.5 h-3.5 text-slate-500" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre, usuario, id…" className="flex-1 bg-transparent outline-none text-[12.5px] text-white placeholder:text-slate-500" data-testid="admin-files-search" />
                    </div>
                </div>

                <Card className="bg-slate-900/60 border border-slate-800 overflow-hidden">
                    {loading ? <div className="py-12 text-center text-slate-400"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
                        : items.length === 0 ? <p className="py-12 text-center text-slate-500 text-[13px]" data-testid="admin-files-empty">No hay archivos para este filtro.</p> : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12.5px]" data-testid="admin-files-table">
                                <thead><tr className="bg-slate-950/60 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                                    <th className="text-left px-4 py-3 font-bold">Archivo</th><th className="text-left px-4 py-3 font-bold">Tipo</th><th className="text-left px-4 py-3 font-bold">Usuario</th><th className="text-right px-4 py-3 font-bold">Tamaño</th><th className="text-left px-4 py-3 font-bold">Fecha</th><th className="px-4 py-3" />
                                </tr></thead>
                                <tbody>{items.map((f) => (
                                    <tr key={f.id} className="border-t border-slate-800/80 hover:bg-slate-800/40" data-testid={`admin-file-row-${f.id}`}>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-9 h-9 rounded-md bg-slate-800 ring-1 ring-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                    {isImage(f.content_type) ? <img src={fileUrl(f.id)} alt="" className="w-full h-full object-cover" loading="lazy" /> : <FileText className="w-4 h-4 text-slate-400" />}
                                                </div>
                                                <div className="min-w-0"><p className="text-white font-semibold truncate max-w-[260px]">{f.original_filename}</p><p className="text-slate-500 text-[10.5px] font-mono truncate">{f.content_type} · {f.source || f.kind}</p></div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300 text-[10.5px] font-semibold">{f.kind}</span></td>
                                        <td className="px-4 py-2.5 font-mono text-slate-300 text-[11px]"><a href={`/admin/users/${f.user_id}`} className="hover:text-cyan-300">{f.user_id?.slice(0, 8)}…</a></td>
                                        <td className="px-4 py-2.5 text-right font-mono text-slate-200">{fmtSize(f.size)}</td>
                                        <td className="px-4 py-2.5 text-slate-400 font-mono text-[11px] whitespace-nowrap">{fmtDate(f.created_at)}</td>
                                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                            <button onClick={() => setPreview(f)} className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/5" title="Vista previa" data-testid={`admin-file-preview-${f.id}`}><Eye className="w-4 h-4" /></button>
                                            <a href={fileUrl(f.id, true)} className="inline-flex p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/5" title="Descargar"><Download className="w-4 h-4" /></a>
                                            <button onClick={() => remove(f)} className="p-1.5 rounded text-slate-400 hover:text-rose-300 hover:bg-rose-500/10" title="Eliminar" data-testid={`admin-file-delete-${f.id}`}><Trash2 className="w-4 h-4" /></button>
                                        </td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>
            {preview && <Preview file={preview} onClose={() => setPreview(null)} />}
        </Layout>
    );
};

export default AdminFilesPage;
