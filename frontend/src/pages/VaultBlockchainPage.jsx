import { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import api from '../lib/api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import {
    ShieldCheck, Upload, FileText, Hash, Clock, CheckCircle2, XCircle,
    Loader2, AlertTriangle, Copy, Check, Eye, Smartphone, Apple, Bell,
    Lock, Link2, RefreshCw, Boxes,
} from 'lucide-react';


const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const fmtBytes = (n) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const CATEGORIES = [
    { id: 'kyc', label: 'KYC / Identidad' },
    { id: 'contract', label: 'Contrato' },
    { id: 'proof', label: 'Comprobante' },
    { id: 'invoice', label: 'Factura' },
    { id: 'statement', label: 'Estado de cuenta' },
    { id: 'other', label: 'Otro' },
];

const STATUS_META = {
    pending:   { label: 'Pendiente certificación', color: '#f59e0b', icon: Clock },
    certified: { label: 'Certificado',              color: '#10b981', icon: CheckCircle2 },
    rejected:  { label: 'Rechazado',                color: '#ef4444', icon: XCircle },
};


// ─── Copyable hash chip ──────────────────────────────────────────
const HashChip = ({ value, short, accent = 'cyan' }) => {
    const [c, setC] = useState(false);
    if (!value) return null;
    const accents = {
        cyan: 'text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 ring-cyan-500/20',
        amber: 'text-amber-300 hover:text-amber-200 bg-amber-500/10 ring-amber-500/20',
        slate: 'text-slate-400 hover:text-slate-300 bg-slate-800/60 ring-slate-700',
    };
    return (
        <button
            type="button"
            onClick={async (e) => {
                e.stopPropagation();
                try { await navigator.clipboard.writeText(value); setC(true); setTimeout(() => setC(false), 1500); toast.success('Hash copiado'); } catch (err) { console.error(err); }
            }}
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded ring-1 font-mono text-[10.5px] font-bold transition-colors ${accents[accent]}`}
            title={value}
        >
            <Hash className="w-2.5 h-2.5 opacity-70" />
            {short || value.slice(0, 8) + '…' + value.slice(-4)}
            {c ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 opacity-50" />}
        </button>
    );
};


// ─── Upload modal ────────────────────────────────────────────────
const UploadModal = ({ onClose, onUploaded }) => {
    const [name, setName] = useState('');
    const [category, setCategory] = useState('kyc');
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef(null);

    const handleFile = (f) => {
        if (!f) return;
        if (f.size > 8 * 1024 * 1024) {
            toast.error('Archivo demasiado grande (máx 8 MB)');
            return;
        }
        setFile(f);
        if (!name) setName(f.name);
    };

    const handleUpload = async () => {
        if (!file || !name.trim()) {
            toast.error('Selecciona un archivo e ingresa un nombre');
            return;
        }
        setUploading(true);
        try {
            const b64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const r = await api.post('/vault/documents/upload', {
                name: name.trim(),
                category,
                mime: file.type || 'application/octet-stream',
                content_b64: b64,
            });
            toast.success(`Documento añadido al Vault · Hash: ${r.data.document.sha256_short}`);
            onUploaded();
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo subir el documento');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose} data-testid="vault-upload-modal">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-md bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 rounded-2xl ring-1 ring-cyan-500/30 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-5 py-4 border-b border-slate-800 bg-gradient-to-r from-[#072146] to-[#004481]">
                    <p className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold">Subir al Vault Blockchain</p>
                    <h3 className="text-white text-base font-bold mt-0.5">Nuevo documento certificado</h3>
                </div>
                <div className="p-5 space-y-4">
                    <label className="block">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5 block">Nombre</span>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Pasaporte 2026.pdf"
                            className="w-full h-10 px-3 rounded-md border border-slate-700 bg-slate-900 text-white focus:border-cyan-500 outline-none text-[13px]"
                            data-testid="vault-name-input"
                        />
                    </label>
                    <label className="block">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5 block">Categoría</span>
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full h-10 px-3 rounded-md border border-slate-700 bg-slate-900 text-white focus:border-cyan-500 outline-none text-[13px] font-bold"
                            data-testid="vault-category-select"
                        >
                            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                    </label>

                    <label className="block">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5 block">Archivo (máx 8 MB)</span>
                        <input
                            ref={inputRef}
                            type="file"
                            onChange={(e) => handleFile(e.target.files?.[0])}
                            className="hidden"
                            data-testid="vault-file-input"
                        />
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            className="w-full border-2 border-dashed border-slate-700 hover:border-cyan-500/60 rounded-lg p-4 text-center transition-colors"
                            data-testid="vault-file-pick"
                        >
                            {file ? (
                                <div>
                                    <FileText className="w-6 h-6 mx-auto text-cyan-400 mb-1.5" />
                                    <p className="text-white text-[12px] font-bold truncate">{file.name}</p>
                                    <p className="text-slate-400 text-[10.5px] mt-0.5">{fmtBytes(file.size)} · {file.type || 'desconocido'}</p>
                                </div>
                            ) : (
                                <div>
                                    <Upload className="w-6 h-6 mx-auto text-slate-500 mb-1.5" />
                                    <p className="text-slate-300 text-[12px]">Click para seleccionar archivo</p>
                                </div>
                            )}
                        </button>
                    </label>

                    <div className="rounded-lg bg-cyan-500/10 ring-1 ring-cyan-500/20 p-3 text-[11px] text-cyan-200">
                        <ShieldCheck className="w-3.5 h-3.5 inline mr-1" />
                        Al subir, generaremos un <strong>hash SHA-256</strong> inmutable + timestamp UTC. La integridad puede verificarse en cualquier momento.
                    </div>

                    <div className="flex gap-3">
                        <Button variant="outline" onClick={onClose} className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800">
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleUpload}
                            disabled={!file || !name.trim() || uploading}
                            className="flex-1 bg-[#1973B8] hover:bg-[#1F89D8] text-white font-bold"
                            data-testid="vault-upload-confirm"
                        >
                            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Lock className="w-3.5 h-3.5 mr-1.5" /> Certificar y subir</>}
                        </Button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};


// ─── Document Card ───────────────────────────────────────────────
const DocCard = ({ doc, onVerify, onDownload }) => {
    const meta = STATUS_META[doc.status] || STATUS_META.pending;
    const SI = meta.icon;
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -2 }}
            className="bg-gradient-to-br from-slate-900/70 to-slate-950 ring-1 ring-slate-800 rounded-xl p-4 hover:ring-cyan-500/40 hover:shadow-[0_8px_30px_rgba(6,182,212,0.15)] transition-all"
            data-testid={`vault-doc-${doc.id}`}
        >
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-cyan-500/10 ring-1 ring-cyan-500/20 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-cyan-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-[13px] truncate">{doc.name}</p>
                        <p className="text-slate-500 text-[10.5px] mt-0.5">
                            {doc.category} · {fmtBytes(doc.size_bytes)} · #{doc.chain_index}
                        </p>
                    </div>
                </div>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase whitespace-nowrap" style={{ background: meta.color + '20', color: meta.color }}>
                    <SI className="w-2.5 h-2.5" /> {meta.label}
                </span>
            </div>

            <div className="space-y-1.5 mb-3">
                <div className="flex items-center justify-between text-[10.5px]">
                    <span className="text-slate-500">SHA-256</span>
                    <HashChip value={doc.sha256} short={doc.sha256_short} accent="cyan" />
                </div>
                <div className="flex items-center justify-between text-[10.5px]">
                    <span className="text-slate-500">Eslabón anterior</span>
                    <HashChip value={doc.chain_prev_hash} short={doc.chain_prev_hash_short} accent="slate" />
                </div>
                <div className="flex items-center justify-between text-[10.5px]">
                    <span className="text-slate-500">Registrado</span>
                    <span className="text-slate-300 font-mono">{fmtDate(doc.created_at)}</span>
                </div>
                {doc.certified_at && (
                    <div className="flex items-center justify-between text-[10.5px]">
                        <span className="text-slate-500">Certificado</span>
                        <span className="text-emerald-400 font-mono">{fmtDate(doc.certified_at)}</span>
                    </div>
                )}
                {doc.admin_note && doc.status === 'rejected' && (
                    <p className="text-rose-400 text-[10.5px] italic mt-1.5 border-l-2 border-rose-500/40 pl-2">
                        "{doc.admin_note}"
                    </p>
                )}
            </div>

            <div className="flex gap-1.5 pt-2 border-t border-slate-800">
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onVerify(doc)}
                    className="h-7 px-2 text-[10.5px] flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                    data-testid={`vault-verify-${doc.id}`}
                >
                    <ShieldCheck className="w-3 h-3 mr-1" /> Verificar
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDownload(doc)}
                    className="h-7 px-2 text-[10.5px] flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                    data-testid={`vault-download-${doc.id}`}
                >
                    <Eye className="w-3 h-3 mr-1" /> Ver / Descargar
                </Button>
            </div>
        </motion.div>
    );
};


// ─── Mobile app coming-soon cards ────────────────────────────────
const MobileAppSection = () => {
    const cards = [
        { icon: Apple, name: 'iPhone & iPad', tag: 'App Store · iOS 16+', color: '#ffffff' },
        { icon: Smartphone, name: 'Android', tag: 'Google Play · Android 10+', color: '#10b981' },
        { icon: Bell, name: 'Notificaciones Push', tag: 'Alertas en tiempo real', color: '#f59e0b' },
    ];
    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-white text-lg font-bold flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-cyan-300" />
                    Aplicación móvil <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold uppercase tracking-wider">Próximamente</span>
                </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {cards.map((c, i) => (
                    <motion.div
                        key={c.name}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900/80 to-slate-950 ring-1 ring-slate-800 hover:ring-cyan-500/40 p-5 transition-all group"
                        data-testid={`mobile-card-${c.name.toLowerCase().split(' ')[0]}`}
                    >
                        <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-30" style={{ background: c.color }} />
                        <div className="relative">
                            <c.icon className="w-9 h-9 mb-3" style={{ color: c.color }} />
                            <p className="text-white font-bold text-[15px]">{c.name}</p>
                            <p className="text-slate-400 text-[11.5px] mt-1">{c.tag}</p>
                            <div className="mt-4 inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/80 text-slate-300 text-[10px] font-bold uppercase tracking-wider">
                                <Clock className="w-2.5 h-2.5" /> Próximamente
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};


// ─── Main Page ────────────────────────────────────────────────────
const VaultBlockchainPage = () => {
    const [docs, setDocs] = useState([]);
    const [chain, setChain] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showUpload, setShowUpload] = useState(false);
    const [verifyFor, setVerifyFor] = useState(null);

    const load = useCallback(async () => {
        try {
            const [r1, r2] = await Promise.all([
                api.get('/vault/documents'),
                api.get('/vault/chain/audit'),
            ]);
            setDocs(r1.data.items || []);
            setChain(r2.data.chain || []);
        } catch (err) {
            toast.error('No se pudo cargar el Vault');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleVerify = async (doc) => {
        setVerifyFor({ doc, result: null, loading: true });
        try {
            const r = await api.get(`/vault/documents/${doc.id}/verify`);
            setVerifyFor({ doc, result: r.data, loading: false });
        } catch (err) {
            toast.error('No se pudo verificar');
            setVerifyFor(null);
        }
    };

    const handleDownload = async (doc) => {
        try {
            const r = await api.get(`/vault/documents/${doc.id}/download`);
            // Open in new tab as data URI
            const a = document.createElement('a');
            a.href = r.data.data_uri;
            a.download = r.data.name;
            a.target = '_blank';
            a.click();
        } catch (err) {
            toast.error('No se pudo descargar');
        }
    };

    return (
        <Layout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-[10.5px] uppercase tracking-[0.14em] text-[#7CB1E5] font-bold">Banking · Custody</p>
                        <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1 flex items-center gap-2" data-testid="vault-title">
                            <Boxes className="w-7 h-7 text-cyan-300" />
                            Vault Blockchain
                        </h1>
                        <p className="text-slate-400 text-[13px] mt-1.5">
                            Documentos certificados con hash SHA-256 inmutable · cadena criptográfica de integridad
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            onClick={() => load()}
                            variant="outline"
                            className="bg-white/5 border-white/15 text-white hover:bg-white/10"
                            data-testid="vault-refresh"
                        >
                            <RefreshCw className="w-4 h-4 mr-1.5" /> Refrescar
                        </Button>
                        <Button
                            onClick={() => setShowUpload(true)}
                            className="bg-[#1973B8] hover:bg-[#1F89D8] text-white font-bold"
                            data-testid="vault-upload-open"
                        >
                            <Upload className="w-4 h-4 mr-1.5" /> Subir documento
                        </Button>
                    </div>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card className="p-4 bg-gradient-to-br from-[#072146] to-[#004481] border-0">
                        <p className="text-[9.5px] uppercase tracking-wider text-[#7CB1E5] font-bold">Total documentos</p>
                        <p className="text-white text-2xl font-bold mt-1 tabular-nums">{docs.length}</p>
                    </Card>
                    <Card className="p-4 bg-white/5 border-white/10">
                        <p className="text-[9.5px] uppercase tracking-wider text-emerald-300 font-bold">Certificados</p>
                        <p className="text-emerald-300 text-2xl font-bold mt-1 tabular-nums">{docs.filter(d => d.status === 'certified').length}</p>
                    </Card>
                    <Card className="p-4 bg-white/5 border-white/10">
                        <p className="text-[9.5px] uppercase tracking-wider text-amber-300 font-bold">Pendientes</p>
                        <p className="text-amber-300 text-2xl font-bold mt-1 tabular-nums">{docs.filter(d => d.status === 'pending').length}</p>
                    </Card>
                    <Card className="p-4 bg-white/5 border-white/10">
                        <p className="text-[9.5px] uppercase tracking-wider text-cyan-300 font-bold">Eslabones cadena</p>
                        <p className="text-cyan-300 text-2xl font-bold mt-1 tabular-nums">{chain.length}</p>
                    </Card>
                </div>

                {/* Documents grid */}
                {loading ? (
                    <div className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
                ) : docs.length === 0 ? (
                    <Card className="p-10 bg-slate-900/50 ring-1 ring-slate-800 border-0 text-center">
                        <Boxes className="w-12 h-12 mx-auto text-cyan-500/40 mb-3" />
                        <p className="text-white text-[14px] font-bold mb-1">Vault vacío</p>
                        <p className="text-slate-400 text-[12px] mb-4">Sube tu primer documento para iniciar la cadena de certificación.</p>
                        <Button onClick={() => setShowUpload(true)} className="bg-[#1973B8] hover:bg-[#1F89D8] text-white">
                            <Upload className="w-4 h-4 mr-1.5" /> Subir primer documento
                        </Button>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="vault-docs-grid">
                        {docs.map(d => (
                            <DocCard key={d.id} doc={d} onVerify={handleVerify} onDownload={handleDownload} />
                        ))}
                    </div>
                )}

                {/* Mobile app section */}
                <MobileAppSection />
            </div>

            {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUploaded={load} />}

            {/* Verify result modal */}
            {verifyFor && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setVerifyFor(null)} data-testid="vault-verify-modal">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full max-w-lg bg-gradient-to-br from-[#0a1628] via-slate-950 to-slate-950 rounded-2xl ring-1 ring-cyan-500/30 shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-slate-800">
                            <p className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold">Verificación de integridad</p>
                            <h3 className="text-white text-base font-bold mt-0.5">{verifyFor.doc.name}</h3>
                        </div>
                        <div className="p-5 space-y-3">
                            {verifyFor.loading ? (
                                <div className="text-center py-8 text-slate-400"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
                            ) : verifyFor.result && (
                                <>
                                    <div className={`rounded-lg p-4 ring-1 ${verifyFor.result.integrity_ok ? 'bg-emerald-500/10 ring-emerald-500/30' : 'bg-rose-500/10 ring-rose-500/30'}`}>
                                        <div className="flex items-center gap-2">
                                            {verifyFor.result.integrity_ok ? (
                                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                            ) : (
                                                <AlertTriangle className="w-5 h-5 text-rose-400" />
                                            )}
                                            <p className={`font-bold text-[14px] ${verifyFor.result.integrity_ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                                                {verifyFor.result.integrity_ok ? 'Integridad verificada ✓' : '⚠ Manipulación detectada'}
                                            </p>
                                        </div>
                                        <p className="text-slate-300 text-[11.5px] mt-1.5">
                                            {verifyFor.result.integrity_ok
                                                ? 'El hash recalculado coincide exactamente con el almacenado. El documento no ha sido alterado.'
                                                : 'El hash recalculado NO coincide con el almacenado. El documento ha sido manipulado o el almacenamiento está corrupto.'}
                                        </p>
                                    </div>

                                    <div className="space-y-2 text-[11.5px]">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-slate-400">Hash almacenado</span>
                                            <HashChip value={verifyFor.result.stored_hash} accent="cyan" />
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-slate-400">Hash recalculado</span>
                                            <HashChip value={verifyFor.result.computed_hash} accent={verifyFor.result.integrity_ok ? 'cyan' : 'amber'} />
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-slate-400">Eslabón cadena #{verifyFor.result.chain_index}</span>
                                            <HashChip value={verifyFor.result.chain_prev_hash} accent="slate" />
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-slate-400">Verificado en</span>
                                            <span className="text-slate-300 font-mono text-[10.5px]">{fmtDate(verifyFor.result.verified_at)}</span>
                                        </div>
                                    </div>
                                </>
                            )}
                            <Button onClick={() => setVerifyFor(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-white">
                                Cerrar
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </Layout>
    );
};

export default VaultBlockchainPage;
