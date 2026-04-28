import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import api from '../../lib/api';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
    Upload, FileSpreadsheet, Loader2, Users, UserCheck, UserPlus, Copy, XCircle,
    AlertTriangle, CheckCircle2, RefreshCw, ArrowRight, PlayCircle,
    Sparkles, Clock, Mail, Shield, Eye, ChevronRight, ChevronDown,
} from 'lucide-react';

const GROUPS = [
    { id: 'recuperar', label: 'Recuperar', color: '#22d3ee', priority: true },
    { id: 'espanoles', label: 'Españoles', color: '#0ea5e9', priority: true },
    { id: 'latinos',   label: 'Latinos',   color: '#f0b90b' },
    { id: 'bfx',       label: 'BFX',       color: '#a855f7' },
    { id: 'pa',        label: 'P&A',       color: '#ec4899' },
];
const GROUP_LABEL = Object.fromEntries(GROUPS.map(g => [g.id, g.label]));
const GROUP_COLOR = Object.fromEntries(GROUPS.map(g => [g.id, g.color]));

const ACTION_STYLE = {
    create:            { label: 'Nuevo perfil',        color: '#0ecb81', bg: 'bg-emerald-500/12', ring: 'ring-emerald-500/40', Icon: UserPlus },
    reactivate:        { label: 'Reactivar',           color: '#22d3ee', bg: 'bg-cyan-500/12',    ring: 'ring-cyan-500/40',    Icon: UserCheck },
    duplicate_in_file: { label: 'Duplicado evitado',   color: '#94a3b8', bg: 'bg-slate-500/15',   ring: 'ring-slate-500/30',   Icon: Copy },
    error:             { label: 'Error',               color: '#f6465d', bg: 'bg-rose-500/12',    ring: 'ring-rose-500/40',    Icon: XCircle },
};

const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const KpiCard = ({ Icon, label, value, color, testId }) => (
    <Card className="p-4 bg-gradient-to-br from-slate-900/90 to-slate-950 border-slate-800/80" data-testid={testId}>
        <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center ring-1"
                style={{ backgroundColor: color + '22', color, borderColor: color + '55' }}>
                <Icon className="w-4 h-4" />
            </div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-bold">{label}</p>
        </div>
        <p className="text-white text-2xl font-mono tabular-nums font-bold" style={{ letterSpacing: '-0.02em' }}>
            {value}
        </p>
    </Card>
);


export const AdminClientImportPage = () => {
    const fileRef = useRef(null);
    const [file, setFile] = useState(null);
    const [defaultGroup, setDefaultGroup] = useState('latinos');
    const [dragActive, setDragActive] = useState(false);

    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState(null);   // { job_id, summary, rows, job }
    const [executing, setExecuting] = useState(false);
    const [showAllRows, setShowAllRows] = useState(false);
    const [groupFilter, setGroupFilter] = useState('all');

    const [jobs, setJobs] = useState([]);
    const [openJob, setOpenJob] = useState(null);

    const loadJobs = useCallback(async () => {
        try {
            const r = await api.get('/admin/client-import/jobs');
            setJobs(r.data.items || []);
        } catch { /* silent */ }
    }, []);
    useEffect(() => { loadJobs(); }, [loadJobs]);

    const handleFile = (f) => {
        if (!f) return;
        const ok = /\.(csv|xlsx?|xlsm)$/i.test(f.name);
        if (!ok) { toast.error('Formato no soportado. Usa .csv, .xlsx o .xls'); return; }
        if (f.size > 10 * 1024 * 1024) { toast.error('Archivo demasiado grande (>10 MB)'); return; }
        setFile(f);
        setPreview(null);
    };

    const onUpload = async () => {
        if (!file) { toast.error('Selecciona un archivo'); return; }
        setUploading(true);
        const fd = new FormData();
        fd.append('file', file);
        fd.append('default_group', defaultGroup);
        try {
            const r = await api.post('/admin/client-import/preview', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setPreview(r.data);
            toast.success(`Vista previa lista · ${r.data.summary?.total_rows || 0} filas`);
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al procesar el archivo');
        } finally {
            setUploading(false);
        }
    };

    const onExecute = async () => {
        if (!preview?.job_id) return;
        const toCreate = preview.summary.new_profiles;
        const toReactivate = preview.summary.reactivated;
        const msg = `¿Confirmas la importación?\n\n• ${toCreate} perfiles nuevos\n• ${toReactivate} reactivaciones\n• ${preview.summary.duplicates_in_file} duplicados evitados\n• ${preview.summary.errors} errores\n\nSe enviará el correo de reactivación a todos los perfiles afectados.`;
        if (!window.confirm(msg)) return;
        setExecuting(true);
        try {
            const r = await api.post(`/admin/client-import/execute/${preview.job_id}`);
            toast.success(`Importación ejecutada · ${r.data.summary.executed_created} nuevos + ${r.data.summary.executed_reactivated} reactivados`);
            setPreview(null);
            setFile(null);
            if (fileRef.current) fileRef.current.value = '';
            await loadJobs();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Error al ejecutar la importación');
        } finally {
            setExecuting(false);
        }
    };

    const openJobDetail = async (jobId) => {
        try {
            const r = await api.get(`/admin/client-import/jobs/${jobId}`);
            setOpenJob(r.data);
        } catch { toast.error('Error al cargar detalle'); }
    };

    // Filter preview rows
    const filteredRows = (preview?.rows || []).filter(r => {
        if (groupFilter === 'all') return true;
        if (groupFilter === 'errors') return r.action === 'error' || r.action === 'duplicate_in_file';
        return r.group === groupFilter;
    });
    const rowsToShow = showAllRows ? filteredRows : filteredRows.slice(0, 50);

    return (
        <Layout>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto p-3 sm:p-5 space-y-5" data-testid="admin-client-import-page">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/25 to-cyan-700/15 ring-1 ring-cyan-500/40 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                            <FileSpreadsheet className="w-5 h-5 text-cyan-200" strokeWidth={2.4} />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300 font-bold">
                                <Sparkles className="w-3 h-3 inline mr-1 -mt-0.5" /> Reactivación de cuentas
                            </p>
                            <h1 className="text-2xl sm:text-3xl text-white font-bold" style={{ letterSpacing: '-0.02em' }}>
                                Importación de clientes
                            </h1>
                            <p className="text-slate-400 text-[12px] sm:text-sm mt-1 max-w-2xl">
                                Excel/CSV con clientes históricos. Dedup automática por email y teléfono, reactivación segura, correo profesional con contraseña temporal <span className="font-mono text-cyan-300">lionsbit2.0</span>.
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={loadJobs} className="border-slate-700 text-slate-300 hover:bg-slate-800 h-9" data-testid="client-import-refresh">
                        <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refrescar
                    </Button>
                </div>

                {/* ── Upload zone ── */}
                <Card className="p-5 bg-gradient-to-br from-[#0a1628] via-slate-950/95 to-slate-950 border-slate-800/80 relative overflow-hidden" data-testid="client-import-upload-card">
                    <div aria-hidden="true" className="absolute -top-16 -right-16 w-60 h-60 rounded-full opacity-20 blur-3xl"
                        style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.35), transparent 70%)' }} />

                    <div className="relative">
                        <div
                            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                            onDragLeave={() => setDragActive(false)}
                            onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFile(e.dataTransfer.files?.[0]); }}
                            className={`rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
                                dragActive
                                    ? 'border-cyan-400 bg-cyan-500/10'
                                    : file
                                        ? 'border-emerald-500/50 bg-emerald-500/5'
                                        : 'border-slate-700 bg-slate-900/30 hover:border-slate-600'
                            }`}
                            onClick={() => fileRef.current?.click()}
                            data-testid="client-import-dropzone"
                        >
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".csv,.xlsx,.xls,.xlsm"
                                className="hidden"
                                onChange={(e) => handleFile(e.target.files?.[0])}
                                data-testid="client-import-file-input"
                            />
                            {file ? (
                                <>
                                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                                    <p className="text-white text-sm font-semibold mt-2">{file.name}</p>
                                    <p className="text-slate-500 text-[11px]">{(file.size / 1024).toFixed(0)} KB · Click para cambiar</p>
                                </>
                            ) : (
                                <>
                                    <Upload className="w-10 h-10 text-slate-500 mx-auto" />
                                    <p className="text-white text-sm font-semibold mt-2">Arrastra tu archivo aquí</p>
                                    <p className="text-slate-500 text-[11px] mt-0.5">
                                        Excel (.xlsx, .xls) o CSV · Máx 10 MB, 20.000 filas
                                    </p>
                                </>
                            )}
                        </div>

                        {/* Options */}
                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Grupo por defecto</span>
                                <p className="text-slate-500 text-[10.5px] mt-0.5 mb-1.5">Se aplica a filas sin columna "Grupo". En Excel multi-hoja, cada hoja se auto-asigna por nombre.</p>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {GROUPS.map(g => (
                                        <button
                                            key={g.id}
                                            type="button"
                                            onClick={() => setDefaultGroup(g.id)}
                                            data-no-hover
                                            data-testid={`client-import-group-${g.id}`}
                                            className="px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ring-1"
                                            style={defaultGroup === g.id
                                                ? { backgroundColor: g.color + '22', color: g.color, borderColor: g.color }
                                                : { backgroundColor: 'rgba(15,23,42,0.6)', color: '#94a3b8', borderColor: 'rgba(51,65,85,0.8)' }}
                                        >
                                            {g.label}{g.priority && <Sparkles className="w-2.5 h-2.5 inline ml-1 -mt-0.5" />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-end justify-end gap-2">
                                <Button
                                    onClick={onUpload}
                                    disabled={!file || uploading}
                                    data-testid="client-import-preview-btn"
                                    className="h-10 bg-gradient-to-r from-cyan-600 to-cyan-500 text-white font-bold tracking-wider shadow-md"
                                >
                                    {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                                    Generar vista previa
                                </Button>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* ── Preview + Execute ── */}
                <AnimatePresence>
                    {preview && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4" data-testid="client-import-preview">
                            {/* KPI strip */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                <KpiCard Icon={Users}       label="Total filas"   color="#94a3b8" value={preview.summary.total_rows}                testId="kpi-total" />
                                <KpiCard Icon={UserPlus}    label="Nuevos"        color="#0ecb81" value={preview.summary.new_profiles}              testId="kpi-new" />
                                <KpiCard Icon={UserCheck}   label="Reactivar"     color="#22d3ee" value={preview.summary.reactivated}               testId="kpi-reactivate" />
                                <KpiCard Icon={Copy}        label="Dup. evitados" color="#f0b90b" value={preview.summary.duplicates_in_file}        testId="kpi-duplicates" />
                                <KpiCard Icon={XCircle}     label="Errores"       color="#f6465d" value={preview.summary.errors}                    testId="kpi-errors" />
                            </div>

                            {/* Group breakdown */}
                            <Card className="p-4 bg-slate-900/60 border-slate-800/80">
                                <div className="flex items-center gap-2 mb-3">
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-bold">Distribución por grupo (procesables)</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {GROUPS.map(g => {
                                        const n = preview.summary.by_group?.[g.id] || 0;
                                        const isPriority = g.priority;
                                        return (
                                            <span key={g.id}
                                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11.5px] font-bold ring-1"
                                                style={{ backgroundColor: g.color + '15', color: g.color, borderColor: g.color + '45' }}
                                                data-testid={`preview-group-${g.id}`}
                                            >
                                                {g.label} <span className="text-white font-mono">{n}</span>
                                                {isPriority && n > 0 && <Sparkles className="w-2.5 h-2.5" />}
                                            </span>
                                        );
                                    })}
                                </div>
                            </Card>

                            {/* Execute banner */}
                            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30">
                                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-amber-200 text-[13px] font-bold">Revisa antes de ejecutar</p>
                                    <p className="text-amber-300/80 text-[11.5px] mt-0.5 leading-relaxed">
                                        Se crearán <span className="text-white font-mono font-bold">{preview.summary.new_profiles}</span> perfiles nuevos y se reactivarán <span className="text-white font-mono font-bold">{preview.summary.reactivated}</span>. Se enviará el correo oficial con la contraseña temporal <span className="font-mono text-cyan-300">lionsbit2.0</span>. Las filas marcadas como duplicado o error no se procesan. Prioridad de envío: <strong>Recuperar + Españoles</strong>.
                                    </p>
                                </div>
                                <Button
                                    onClick={onExecute}
                                    disabled={executing || (preview.summary.new_profiles + preview.summary.reactivated === 0)}
                                    data-testid="client-import-execute-btn"
                                    className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold tracking-wider shadow-lg shadow-emerald-500/20"
                                >
                                    {executing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                                    Ejecutar importación
                                </Button>
                            </div>

                            {/* Preview table */}
                            <Card className="bg-slate-900/60 border-slate-800/80 overflow-hidden">
                                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-800/80 flex-wrap">
                                    <p className="text-[11px] text-slate-400 font-semibold">
                                        Mostrando {rowsToShow.length} de {filteredRows.length} filas
                                    </p>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <button type="button" data-no-hover onClick={() => setGroupFilter('all')} className={`px-2 py-0.5 rounded text-[10.5px] font-bold ring-1 ${groupFilter === 'all' ? 'bg-cyan-500/20 text-cyan-200 ring-cyan-500/40' : 'bg-slate-900 text-slate-400 ring-slate-800'}`}>
                                            Todos
                                        </button>
                                        {GROUPS.map(g => (
                                            <button key={g.id} type="button" data-no-hover onClick={() => setGroupFilter(g.id)}
                                                className="px-2 py-0.5 rounded text-[10.5px] font-bold ring-1"
                                                style={groupFilter === g.id
                                                    ? { backgroundColor: g.color + '22', color: g.color, borderColor: g.color }
                                                    : { backgroundColor: 'rgba(15,23,42,0.6)', color: '#94a3b8', borderColor: 'rgba(51,65,85,0.8)' }}
                                            >{g.label}</button>
                                        ))}
                                        <button type="button" data-no-hover onClick={() => setGroupFilter('errors')} className={`px-2 py-0.5 rounded text-[10.5px] font-bold ring-1 ${groupFilter === 'errors' ? 'bg-rose-500/20 text-rose-200 ring-rose-500/40' : 'bg-slate-900 text-slate-400 ring-slate-800'}`}>
                                            Solo problemas
                                        </button>
                                    </div>
                                </div>
                                <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                                    <table className="w-full text-[12px]">
                                        <thead className="sticky top-0 bg-slate-950/95 border-b border-slate-800/80">
                                            <tr className="text-slate-500 text-left">
                                                <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wider">#</th>
                                                <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wider">Nombre</th>
                                                <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wider">Email</th>
                                                <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wider">Teléfono</th>
                                                <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wider">Grupo</th>
                                                <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wider">Saldo</th>
                                                <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wider">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rowsToShow.map((r) => {
                                                const a = ACTION_STYLE[r.action] || ACTION_STYLE.error;
                                                const AI = a.Icon;
                                                return (
                                                    <tr key={`${r.row_number}-${r.email || r.sheet}`} className="border-b border-slate-800/40">
                                                        <td className="py-1.5 px-3 text-slate-600 font-mono text-[10.5px]">{r.row_number}</td>
                                                        <td className="py-1.5 px-3 text-white font-semibold">{r.name || '—'}</td>
                                                        <td className="py-1.5 px-3 text-slate-300 font-mono text-[11px]">{r.email || <span className="text-rose-400 italic">{r.error}</span>}</td>
                                                        <td className="py-1.5 px-3 text-slate-400 font-mono text-[11px]">{r.phone || '—'}</td>
                                                        <td className="py-1.5 px-3">
                                                            {r.group && (
                                                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold"
                                                                    style={{ backgroundColor: (GROUP_COLOR[r.group] || '#94a3b8') + '22', color: GROUP_COLOR[r.group] || '#94a3b8' }}>
                                                                    {GROUP_LABEL[r.group] || r.group}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-1.5 px-3 text-slate-400 font-mono tabular-nums text-right">
                                                            {r.balance ? `€${Number(r.balance).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                                                        </td>
                                                        <td className="py-1.5 px-3">
                                                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${a.bg} ring-1 ${a.ring} text-[10.5px] font-bold`} style={{ color: a.color }}>
                                                                <AI className="w-3 h-3" /> {a.label}
                                                            </span>
                                                            {r.conflict && <p className="text-slate-600 text-[9.5px] mt-0.5 italic truncate max-w-[180px]">{r.conflict}</p>}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {filteredRows.length > 50 && !showAllRows && (
                                    <div className="p-3 text-center border-t border-slate-800/80">
                                        <button type="button" data-no-hover onClick={() => setShowAllRows(true)} className="text-cyan-300 hover:text-cyan-200 text-[12px] font-semibold">
                                            Mostrar las {filteredRows.length} filas →
                                        </button>
                                    </div>
                                )}
                            </Card>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── History ── */}
                <Card className="bg-slate-900/60 border-slate-800/80 overflow-hidden" data-testid="client-import-history">
                    <div className="px-4 py-3 border-b border-slate-800/80">
                        <p className="text-white text-sm font-bold">Historial de importaciones</p>
                        <p className="text-slate-500 text-[11px]">Últimas {jobs.length} · click para ver detalle + engagement</p>
                    </div>
                    {jobs.length === 0 ? (
                        <p className="text-slate-500 text-sm py-10 text-center">Aún no hay importaciones.</p>
                    ) : (
                        <div className="divide-y divide-slate-800/60">
                            {jobs.map((j) => {
                                const s = j.summary || {};
                                const created = s.executed_created ?? s.new_profiles ?? 0;
                                const react = s.executed_reactivated ?? s.reactivated ?? 0;
                                return (
                                    <button
                                        key={j.id}
                                        type="button"
                                        data-no-hover
                                        onClick={() => openJobDetail(j.id)}
                                        data-testid={`job-row-${j.id}`}
                                        className="w-full text-left px-4 py-3 hover:bg-slate-900 transition-colors flex items-center gap-3 flex-wrap"
                                    >
                                        <FileSpreadsheet className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-white text-[12.5px] font-semibold truncate">{j.filename || 'Sin nombre'}</p>
                                            <p className="text-slate-500 text-[10.5px] font-mono">{fmtDate(j.executed_at || j.created_at)} · {j.executed_by || j.created_by}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10.5px] flex-wrap">
                                            <span className={`px-1.5 py-0.5 rounded font-bold ${j.status === 'executed' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                                                {j.status === 'executed' ? 'Ejecutada' : 'Preview'}
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono font-bold">+{created} nuevos</span>
                                            <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono font-bold">+{react} reactivados</span>
                                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">{s.duplicates_in_file || 0} dup</span>
                                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">{s.errors || 0} err</span>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </Card>
            </motion.div>

            {/* Job detail modal with engagement */}
            <JobDetailModal job={openJob} onClose={() => setOpenJob(null)} />
        </Layout>
    );
};


const JobDetailModal = ({ job, onClose }) => {
    if (!job) return null;
    const rows = job.rows || [];
    const s = job.summary || {};

    // Engagement tallies
    const tally = rows.reduce((acc, r) => {
        const live = r.live || {};
        const eng = live.engagement || {};
        if (eng.email_opened_at) acc.opened++;
        if (live.first_login_at) acc.logged_in++;
        if (eng.password_changed_at) acc.pwd_changed++;
        if (live.verification_status === 'pending' || live.verification_status === 'verified') acc.started_kyc++;
        if (eng.last_withdraw_request_at) acc.withdraw++;
        if (!live.first_login_at && (r.action === 'create' || r.action === 'reactivate')) acc.no_access++;
        return acc;
    }, { opened: 0, logged_in: 0, pwd_changed: 0, started_kyc: 0, withdraw: 0, no_access: 0 });

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose} data-testid="job-detail-modal">
            <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 ring-1 ring-slate-800 rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 bg-slate-950/95 backdrop-blur px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3 z-10">
                    <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-300 font-bold">Detalle de importación</p>
                        <h3 className="text-white text-base font-bold truncate">{job.filename}</h3>
                    </div>
                    <Button variant="outline" size="sm" onClick={onClose} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                        Cerrar
                    </Button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Engagement KPIs */}
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                        <KpiCard Icon={Mail}           label="Correo abierto"  color="#a855f7" value={tally.opened}       testId="engage-opened" />
                        <KpiCard Icon={UserCheck}      label="Inició sesión"   color="#0ecb81" value={tally.logged_in}    testId="engage-login" />
                        <KpiCard Icon={Shield}         label="Cambió password" color="#22d3ee" value={tally.pwd_changed}  testId="engage-pwd" />
                        <KpiCard Icon={CheckCircle2}   label="KYC iniciado"    color="#f0b90b" value={tally.started_kyc}  testId="engage-kyc" />
                        <KpiCard Icon={ArrowRight}     label="Pidió retiro"    color="#ec4899" value={tally.withdraw}     testId="engage-withdraw" />
                        <KpiCard Icon={Clock}          label="Sin acceso"      color="#f6465d" value={tally.no_access}    testId="engage-no-access" />
                    </div>

                    <Card className="bg-slate-950/60 border-slate-800 overflow-hidden">
                        <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                            <table className="w-full text-[11.5px]">
                                <thead className="sticky top-0 bg-slate-950/95 border-b border-slate-800">
                                    <tr className="text-slate-500 text-left">
                                        <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wider">Cliente</th>
                                        <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wider">Grupo</th>
                                        <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wider">Acción</th>
                                        <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-center">📧</th>
                                        <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-center">🔑</th>
                                        <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-center">🔒</th>
                                        <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-center">🛡️</th>
                                        <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-wider">Último acceso</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.slice(0, 500).map((r) => {
                                        const live = r.live || {};
                                        const eng = live.engagement || {};
                                        const a = ACTION_STYLE[r.action] || ACTION_STYLE.error;
                                        const tick = (v) => v ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" /> : <span className="text-slate-700">—</span>;
                                        return (
                                            <tr key={`${r.row_number}-${r.email}`} className="border-b border-slate-800/40">
                                                <td className="py-1.5 px-3">
                                                    <p className="text-white truncate max-w-[200px]">{r.name}</p>
                                                    <p className="text-slate-500 text-[10px] font-mono truncate max-w-[200px]">{r.email}</p>
                                                </td>
                                                <td className="py-1.5 px-3">
                                                    {r.group && <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold"
                                                        style={{ backgroundColor: (GROUP_COLOR[r.group] || '#94a3b8') + '22', color: GROUP_COLOR[r.group] || '#94a3b8' }}>
                                                        {GROUP_LABEL[r.group] || r.group}
                                                    </span>}
                                                </td>
                                                <td className="py-1.5 px-3">
                                                    <span className="text-[10.5px] font-bold" style={{ color: a.color }}>{a.label}</span>
                                                </td>
                                                <td className="py-1.5 px-3 text-center">{tick(eng.email_opened_at)}</td>
                                                <td className="py-1.5 px-3 text-center">{tick(live.first_login_at)}</td>
                                                <td className="py-1.5 px-3 text-center">{tick(eng.password_changed_at)}</td>
                                                <td className="py-1.5 px-3 text-center">{tick(live.verification_status === 'verified' || live.verification_status === 'pending')}</td>
                                                <td className="py-1.5 px-3 text-slate-500 font-mono text-[10.5px]">{fmtDate(live.last_active || live.first_login_at)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                    <p className="text-slate-600 text-[10.5px] text-center">
                        📧 Correo abierto · 🔑 Inició sesión · 🔒 Cambió contraseña · 🛡️ KYC iniciado/verificado
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AdminClientImportPage;
