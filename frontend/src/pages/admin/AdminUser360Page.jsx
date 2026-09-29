import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import api from '../../lib/api';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
    ArrowLeft, Copy, Check, Loader2, UserCircle2, Wallet, ClipboardList, Upload, CreditCard, FileCheck,
    MessageSquare, KeyRound, ShieldCheck, Mail, BadgeCheck, Clock, ExternalLink, Search, StickyNote,
} from 'lucide-react';
import { UserNotesPanel } from './UserNotesPanel';

const fmtDate = (iso) => !iso ? '—' : new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtMoney = (n, cur = 'EUR') => `${cur === 'USD' ? '$' : '€'}${Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const short = (s, a = 10, b = 6) => !s ? '—' : s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : s;

const STATUS_TONE = (s = '') => {
    const v = s.toLowerCase();
    if (/(completed|verified|active|approved|certified|confirmed|paid|closed|resolved|llamado)/.test(v)) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    if (/(pending|review|processing|submitted|received|open|pendiente)/.test(v)) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    if (/(rejected|failed|cancel|archived|expired|blocked)/.test(v)) return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
};
const Pill = ({ value, testid }) => (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${STATUS_TONE(value)}`} data-testid={testid}>{value || '—'}</span>
);

const CopyBtn = ({ value }) => {
    const [ok, setOk] = useState(false);
    return (
        <button onClick={async () => { try { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1200); } catch { /* noop */ } }}
            className="text-slate-500 hover:text-white" title="Copiar" data-testid="u360-copy-id">
            {ok ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
    );
};

const Kpi = ({ label, value, sub, accent = 'text-white', testid }) => (
    <Card className="p-3.5 bg-white/5 border-white/10">
        <p className="text-[9.5px] uppercase tracking-wider text-slate-400 font-bold">{label}</p>
        <p className={`text-lg font-bold mt-1 tabular-nums ${accent}`} data-testid={testid}>{value}</p>
        {sub && <p className="text-[10.5px] text-slate-500 mt-0.5 truncate">{sub}</p>}
    </Card>
);

const Table = ({ cols, rows, empty = 'Sin registros', testid }) => (
    <div className="overflow-x-auto rounded-xl ring-1 ring-slate-800 bg-slate-900/50" data-testid={testid}>
        {rows.length === 0 ? <p className="px-4 py-6 text-center text-slate-500 text-[12px]">{empty}</p> : (
            <table className="w-full text-[12px]">
                <thead><tr className="bg-slate-950/60 text-[9.5px] uppercase tracking-[0.1em] text-slate-400">{cols.map((c) => <th key={c.k} className={`px-3 py-2.5 font-bold text-left whitespace-nowrap ${c.right ? 'text-right' : ''}`}>{c.h}</th>)}</tr></thead>
                <tbody>{rows.map((r, i) => (
                    <tr key={r.id || r.code || r.session_id || i} className="border-t border-slate-800/80 hover:bg-slate-800/40">
                        {cols.map((c) => <td key={c.k} className={`px-3 py-2.5 text-slate-200 ${c.mono ? 'font-mono' : ''} ${c.right ? 'text-right' : ''} whitespace-nowrap`}>{c.render ? c.render(r) : (r[c.k] ?? '—')}</td>)}
                    </tr>
                ))}</tbody>
            </table>
        )}
    </div>
);

const Section = ({ title, icon: Icon, children, count }) => (
    <section className="space-y-2.5">
        <h3 className="text-[10.5px] uppercase tracking-[0.14em] text-[#7CB1E5] font-bold flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {title}{count != null && <span className="text-slate-500">· {count}</span>}</h3>
        {children}
    </section>
);

const TABS = [
    { id: 'resumen', label: 'Resumen', icon: UserCircle2 },
    { id: 'transacciones', label: 'Transacciones', icon: ClipboardList },
    { id: 'retiros', label: 'Retiros', icon: Upload },
    { id: 'pagos', label: 'Pagos', icon: CreditCard },
    { id: 'documentos', label: 'Documentos', icon: FileCheck },
    { id: 'soporte', label: 'Soporte', icon: MessageSquare },
    { id: 'accesos', label: 'Accesos', icon: KeyRound },
    { id: 'notas', label: 'Notas internas', icon: StickyNote },
];

export const AdminUser360Page = () => {
    const { userId } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('resumen');
    const [notesCount, setNotesCount] = useState(null);
    const onNotesCount = useCallback((n) => setNotesCount(n), []);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        api.get(`/admin/users/${userId}/360`).then((r) => { if (alive) setData(r.data); })
            .catch((e) => toast.error(e.response?.data?.detail || 'No se pudo cargar la ficha'))
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [userId]);

    const u = data?.user;
    const s = data?.summary || {};
    const counts = useMemo(() => !data ? {} : {
        transacciones: data.transactions.length,
        retiros: s.withdrawals,
        pagos: s.payments,
        documentos: s.documents,
        soporte: s.tickets + data.support.callbacks.length + data.support.cases.length,
        accesos: data.access.logins.length,
        notas: notesCount ?? s.notes,
    }, [data, s, notesCount]);

    return (
        <Layout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5" data-testid="admin-user360-page">
                <div className="flex items-center gap-2 text-[12px]">
                    <Link to="/admin/users" className="inline-flex items-center gap-1 text-slate-400 hover:text-white"><ArrowLeft className="w-3.5 h-3.5" /> Usuarios</Link>
                    <span className="text-slate-600">/</span><span className="text-[#7CB1E5] font-bold">Ficha 360°</span>
                </div>

                {loading ? <div className="py-20 text-center text-slate-400"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div> : !u ? (
                    <Card className="p-10 text-center bg-slate-900/60 border-slate-800 text-slate-400">Usuario no encontrado.</Card>
                ) : (
                    <>
                        {/* Header */}
                        <Card className="p-5 bg-gradient-to-br from-[#072146] to-[#04152e] border-0">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="flex items-start gap-4 min-w-0">
                                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1973B8, #004481)' }}>
                                        {(u.name || u.email || '?').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <h1 className="text-white text-xl sm:text-2xl font-bold truncate" data-testid="u360-name">{u.name || '—'}</h1>
                                        <p className="text-[#7CB1E5] text-[13px] flex items-center gap-1.5 truncate"><Mail className="w-3.5 h-3.5" /> <span data-testid="u360-email">{u.email}</span></p>
                                        <p className="text-slate-400 text-[11px] font-mono mt-1 flex items-center gap-1.5">ID <span className="text-slate-200" data-testid="u360-id">{u.id}</span> <CopyBtn value={u.id} /></p>
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            <Pill value={u.role} /><Pill value={u.verification_status} testid="u360-verification" /><Pill value={u.account_status || 'active'} />
                                            {u.is_online && <Pill value="online" />}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Link to={`/admin/users?q=${encodeURIComponent(u.email)}`} data-testid="u360-manage-link" className="inline-flex items-center h-8 px-3 rounded-md border border-white/15 bg-white/5 text-white text-[12px] font-semibold hover:bg-white/10 transition-colors"><ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Gestionar en Usuarios</Link>
                                    <Link to={`/admin/kyc?q=${encodeURIComponent(u.email)}`} className="inline-flex items-center h-8 px-3 rounded-md border border-white/15 bg-white/5 text-white text-[12px] font-semibold hover:bg-white/10 transition-colors"><BadgeCheck className="w-3.5 h-3.5 mr-1.5" /> KYC</Link>
                                    <Button size="sm" className="bg-[#1973B8] hover:bg-[#1F89D8] text-white" onClick={() => window.dispatchEvent(new CustomEvent('plb-open-global-search'))} data-testid="u360-open-search"><Search className="w-3.5 h-3.5 mr-1.5" /> Buscar otro</Button>
                                </div>
                            </div>
                        </Card>

                        {/* KPIs */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            <Kpi label="Saldo EUR" value={fmtMoney(s.balance_eur)} accent="text-emerald-300" testid="u360-balance-eur" />
                            <Kpi label="Saldo USD" value={fmtMoney(s.balance_usd, 'USD')} />
                            <Kpi label="Transacciones" value={s.transactions} />
                            <Kpi label="Retiros" value={s.withdrawals} accent="text-amber-300" />
                            <Kpi label="Tickets abiertos" value={s.tickets_open} sub={`${s.tickets} en total`} />
                            <Kpi label="Último acceso" value={s.last_login ? fmtDate(s.last_login) : '—'} accent="text-slate-200 text-[13px]" sub={`Registrado ${fmtDate(u.created_at)}`} />
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-1 overflow-x-auto pb-1 border-b border-slate-800" data-testid="u360-tabs">
                            {TABS.map((t) => (
                                <button key={t.id} onClick={() => setTab(t.id)} data-testid={`u360-tab-${t.id}`}
                                    className={`inline-flex flex-shrink-0 items-center gap-1.5 px-3 py-2 text-[12px] font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-cyan-400 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}>
                                    <t.icon className="w-3.5 h-3.5" /> {t.label}{counts[t.id] != null && <span className="text-[10px] text-slate-500 font-mono">{counts[t.id]}</span>}
                                </button>
                            ))}
                        </div>

                        {tab === 'resumen' && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                <Section title="Cuentas" icon={Wallet} count={data.accounts.length}>
                                    <Table testid="u360-accounts" rows={data.accounts} cols={[
                                        { k: 'account_type', h: 'Tipo' }, { k: 'account_number', h: 'Nº cuenta', mono: true },
                                        { k: 'balance_eur', h: 'EUR', right: true, mono: true, render: (r) => fmtMoney(r.balance_eur) },
                                        { k: 'balance_usd', h: 'USD', right: true, mono: true, render: (r) => fmtMoney(r.balance_usd, 'USD') },
                                    ]} />
                                    {data.multi_currency_wallet && (
                                        <div className="flex flex-wrap gap-2 text-[11px]">{Object.entries(data.multi_currency_wallet.balances || {}).map(([c, v]) => <span key={c} className="px-2 py-1 rounded bg-slate-800/60 text-slate-200 font-mono">{c} {Number(v).toLocaleString('de-DE')}</span>)}</div>
                                    )}
                                </Section>
                                <Section title="Identidad y estado" icon={ShieldCheck}>
                                    <Card className="p-4 bg-slate-900/50 border-slate-800 grid grid-cols-2 gap-3 text-[12px]">
                                        {[['Verificación', u.verification_status], ['Estado cuenta', u.account_status || 'active'], ['Rol', u.role], ['País', u.country_name || u.country], ['Teléfono', u.phone], ['Nacimiento', u.date_of_birth || u.birth_date], ['Alta', fmtDate(u.created_at)], ['Primer acceso', fmtDate(u.first_login_at)], ['Última actividad', fmtDate(u.last_active)]].map(([k, v]) => (
                                            <div key={k}><p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">{k}</p><p className="text-slate-100 mt-0.5 break-words">{v || '—'}</p></div>
                                        ))}
                                        {u.banking_info?.iban && <div className="col-span-2"><p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">IBAN</p><p className="text-slate-100 font-mono mt-0.5">{u.banking_info.iban}</p></div>}
                                    </Card>
                                    {data.mt5_account && <Card className="p-3 bg-slate-900/50 border-slate-800 text-[12px] flex flex-wrap gap-4"><span className="text-slate-400">MT5 login <b className="text-white font-mono">{data.mt5_account.login}</b></span><span className="text-slate-400">Balance <b className="text-white font-mono">{fmtMoney(data.mt5_account.balance)}</b></span><Pill value={data.mt5_account.account_status} /></Card>}
                                </Section>
                                <Section title="Últimas transacciones" icon={ClipboardList} count={data.transactions.length}>
                                    <Table testid="u360-recent-tx" rows={data.transactions.slice(0, 6)} cols={[
                                        { k: 'created_at', h: 'Fecha', render: (r) => fmtDate(r.created_at) }, { k: 'transaction_type', h: 'Tipo' },
                                        { k: 'amount', h: 'Importe', right: true, mono: true, render: (r) => fmtMoney(r.amount, r.currency) }, { k: 'status', h: 'Estado', render: (r) => <Pill value={r.status} /> },
                                    ]} />
                                </Section>
                                <Section title="Expedientes y tickets recientes" icon={MessageSquare}>
                                    <Table testid="u360-recent-support" rows={[...data.support.cases.slice(0, 3), ...data.support.tickets.slice(0, 3)]} cols={[
                                        { k: 'ref', h: 'Ref.', mono: true, render: (r) => r.code || r.ticket_number }, { k: 'summary', h: 'Asunto', render: (r) => <span className="truncate inline-block max-w-[220px]">{r.summary || r.subject}</span> },
                                        { k: 'status', h: 'Estado', render: (r) => <Pill value={r.status} /> }, { k: 'created_at', h: 'Fecha', render: (r) => fmtDate(r.created_at) },
                                    ]} />
                                </Section>
                            </div>
                        )}

                        {tab === 'transacciones' && (
                            <Section title="Movimientos" icon={ClipboardList} count={data.transactions.length}>
                                <Table testid="u360-transactions" rows={data.transactions} cols={[
                                    { k: 'created_at', h: 'Fecha', render: (r) => fmtDate(r.created_at) }, { k: 'transaction_reference', h: 'Referencia', mono: true, render: (r) => r.transaction_reference || short(r.id) },
                                    { k: 'transaction_type', h: 'Tipo' }, { k: 'description', h: 'Descripción', render: (r) => <span className="truncate inline-block max-w-[260px]">{r.description || '—'}</span> },
                                    { k: 'amount', h: 'Importe', right: true, mono: true, render: (r) => fmtMoney(r.amount, r.currency) }, { k: 'status', h: 'Estado', render: (r) => <Pill value={r.status} /> },
                                ]} />
                            </Section>
                        )}

                        {tab === 'retiros' && (
                            <div className="space-y-6">
                                <Section title="Retiros (flujo completo)" icon={Upload} count={data.withdrawals.full.length}>
                                    <Table testid="u360-wd-full" rows={data.withdrawals.full} cols={[
                                        { k: 'created_at', h: 'Fecha', render: (r) => fmtDate(r.created_at) }, { k: 'transaction_reference', h: 'Referencia', mono: true },
                                        { k: 'amount', h: 'Importe', right: true, mono: true, render: (r) => fmtMoney(r.amount, r.currency) }, { k: 'status', h: 'Estado', render: (r) => <Pill value={r.status} /> },
                                        { k: 'go', h: '', render: (r) => <Link to="/admin/withdrawals" className="text-cyan-300 hover:underline text-[11px]">Gestionar</Link> },
                                    ]} />
                                </Section>
                                <Section title="Retiros bancarios" icon={Upload} count={data.withdrawals.bank.length}>
                                    <Table testid="u360-wd-bank" rows={data.withdrawals.bank} cols={[
                                        { k: 'created_at', h: 'Fecha', render: (r) => fmtDate(r.created_at) }, { k: 'reference', h: 'Referencia', mono: true }, { k: 'bank_name', h: 'Banco' },
                                        { k: 'bank_account', h: 'IBAN / Cuenta', mono: true, render: (r) => short(r.bank_account, 8, 4) },
                                        { k: 'from_amount', h: 'Importe', right: true, mono: true, render: (r) => fmtMoney(r.from_amount, r.from_currency) }, { k: 'status', h: 'Estado', render: (r) => <Pill value={r.status} /> },
                                    ]} />
                                </Section>
                                <Section title="Retiros BTC" icon={Upload} count={data.withdrawals.btc.length}>
                                    <Table testid="u360-wd-btc" rows={data.withdrawals.btc} cols={[
                                        { k: 'created_at', h: 'Fecha', render: (r) => fmtDate(r.created_at) }, { k: 'reference', h: 'Referencia', mono: true, render: (r) => r.reference || short(r.id) },
                                        { k: 'amount_eur', h: 'EUR', right: true, mono: true, render: (r) => fmtMoney(r.amount_eur) }, { k: 'txid', h: 'TXID', mono: true, render: (r) => short(r.txid || r.send_txid, 10, 6) }, { k: 'status', h: 'Estado', render: (r) => <Pill value={r.status} /> },
                                    ]} />
                                </Section>
                                {(data.withdrawals.special45.length > 0 || data.withdrawals.plans.length > 0) && (
                                    <Section title="Especiales +45 · Planes" icon={Upload} count={data.withdrawals.special45.length + data.withdrawals.plans.length}>
                                        <Table rows={[...data.withdrawals.special45, ...data.withdrawals.plans]} cols={[
                                            { k: 'created_at', h: 'Fecha', render: (r) => fmtDate(r.created_at) }, { k: 'id', h: 'ID', mono: true, render: (r) => short(r.id) },
                                            { k: 'amount', h: 'Importe', right: true, mono: true, render: (r) => fmtMoney(r.amount ?? r.total_amount) }, { k: 'status', h: 'Estado', render: (r) => <Pill value={r.status} /> },
                                        ]} />
                                    </Section>
                                )}
                            </div>
                        )}

                        {tab === 'pagos' && (
                            <div className="space-y-6">
                                <Section title="Pagos cripto (abonos)" icon={CreditCard} count={data.payments.crypto.length + data.payments.intents.length}>
                                    <Table testid="u360-pay-crypto" rows={[...data.payments.crypto, ...data.payments.intents]} cols={[
                                        { k: 'submitted_at', h: 'Fecha', render: (r) => fmtDate(r.submitted_at || r.created_at) }, { k: 'crypto_type', h: 'Moneda', render: (r) => r.crypto_type || r.coin || '—' },
                                        { k: 'txid', h: 'TXID', mono: true, render: (r) => short(r.txid, 10, 6) }, { k: 'amount_sent', h: 'Enviado', right: true, mono: true, render: (r) => r.amount_sent ?? r.amount ?? '—' }, { k: 'status', h: 'Estado', render: (r) => <Pill value={r.status} /> },
                                    ]} />
                                </Section>
                                <Section title="Pagos Stripe" icon={CreditCard} count={data.payments.stripe.length}>
                                    <Table testid="u360-pay-stripe" rows={data.payments.stripe} cols={[
                                        { k: 'created_at', h: 'Fecha', render: (r) => fmtDate(r.created_at) }, { k: 'service_name', h: 'Servicio' }, { k: 'session_id', h: 'Sesión', mono: true, render: (r) => short(r.session_id, 12, 6) },
                                        { k: 'amount', h: 'Importe', right: true, mono: true, render: (r) => fmtMoney(r.amount, (r.currency || 'eur').toUpperCase()) }, { k: 'payment_status', h: 'Estado', render: (r) => <Pill value={r.payment_status || r.status} /> },
                                    ]} />
                                </Section>
                                <Section title="Transferencias bancarias · MT5 Invest · Abonos manuales" icon={CreditCard} count={data.payments.bank_transfers.length + data.payments.mt5_deposits.length + data.payments.manual_tax.length}>
                                    <Table testid="u360-pay-other" rows={[...data.payments.bank_transfers, ...data.payments.mt5_deposits, ...data.payments.manual_tax]} cols={[
                                        { k: 'created_at', h: 'Fecha', render: (r) => fmtDate(r.created_at) }, { k: 'kind', h: 'Tipo', render: (r) => r.method_name || r.type || r.payment_method || '—' },
                                        { k: 'ref', h: 'Referencia / TXID', mono: true, render: (r) => short(r.reference || r.tx_hash || r.txid || r.id, 10, 6) },
                                        { k: 'amount', h: 'Importe', right: true, mono: true, render: (r) => fmtMoney(r.amount ?? r.amount_eur, r.currency || 'EUR') }, { k: 'status', h: 'Estado', render: (r) => <Pill value={r.status || 'registered'} /> },
                                    ]} />
                                </Section>
                            </div>
                        )}

                        {tab === 'documentos' && (
                            <div className="space-y-6">
                                <Section title="KYC" icon={BadgeCheck} count={data.documents.kyc.length}>
                                    <Table testid="u360-doc-kyc" rows={data.documents.kyc} cols={[
                                        { k: 'submitted_at', h: 'Enviado', render: (r) => fmtDate(r.submitted_at) }, { k: 'document_type', h: 'Documento' }, { k: 'status', h: 'Estado', render: (r) => <Pill value={r.status} /> },
                                        { k: 'reviewed_at', h: 'Revisado', render: (r) => fmtDate(r.reviewed_at) }, { k: 'go', h: '', render: () => <Link to={`/admin/kyc?q=${encodeURIComponent(u.email)}`} className="text-cyan-300 hover:underline text-[11px]">Abrir en KYC</Link> },
                                    ]} />
                                </Section>
                                <Section title="Documentos fiscales · Justificantes bancarios" icon={FileCheck} count={data.documents.fiscal.length + data.documents.bank_certificates.length}>
                                    <Table testid="u360-doc-fiscal" rows={[...data.documents.fiscal, ...data.documents.bank_certificates]} cols={[
                                        { k: 'created_at', h: 'Fecha', render: (r) => fmtDate(r.created_at) }, { k: 'name', h: 'Documento', render: (r) => r.name || r.type || r.certificate_type || '—' }, { k: 'status', h: 'Estado', render: (r) => <Pill value={r.status} /> }, { k: 'observation', h: 'Nota', render: (r) => <span className="truncate inline-block max-w-[240px]">{r.observation || r.note || r.admin_note || '—'}</span> },
                                    ]} />
                                </Section>
                                <Section title="Vault Blockchain" icon={FileCheck} count={data.documents.vault.length}>
                                    <Table testid="u360-doc-vault" rows={data.documents.vault} cols={[
                                        { k: 'created_at', h: 'Fecha', render: (r) => fmtDate(r.created_at) }, { k: 'name', h: 'Documento' }, { k: 'category', h: 'Categoría' }, { k: 'sha256', h: 'SHA-256', mono: true, render: (r) => short(r.sha256, 10, 6) },
                                        { k: 'btc', h: 'Bloque BTC', mono: true, render: (r) => r.btc_anchor ? `#${r.btc_anchor.block_height}` : '—' }, { k: 'status', h: 'Estado', render: (r) => <Pill value={r.status} /> },
                                    ]} />
                                </Section>
                            </div>
                        )}

                        {tab === 'soporte' && (
                            <div className="space-y-6">
                                <Section title="Tickets" icon={MessageSquare} count={data.support.tickets.length}>
                                    <Table testid="u360-tickets" rows={data.support.tickets} cols={[
                                        { k: 'created_at', h: 'Fecha', render: (r) => fmtDate(r.created_at) }, { k: 'ticket_number', h: 'Nº', mono: true }, { k: 'subject', h: 'Asunto', render: (r) => <span className="truncate inline-block max-w-[280px]">{r.subject}</span> }, { k: 'category', h: 'Categoría' }, { k: 'status', h: 'Estado', render: (r) => <Pill value={r.status} /> },
                                        { k: 'go', h: '', render: () => <Link to="/admin/support" className="text-cyan-300 hover:underline text-[11px]">Abrir</Link> },
                                    ]} />
                                </Section>
                                <Section title="Citas de llamada" icon={Clock} count={data.support.callbacks.length}>
                                    <Table testid="u360-callbacks" rows={data.support.callbacks} cols={[
                                        { k: 'scheduled_at', h: 'Programada', render: (r) => fmtDate(r.scheduled_at) }, { k: 'phone', h: 'Teléfono', mono: true }, { k: 'reason', h: 'Motivo' }, { k: 'status', h: 'Estado', render: (r) => <Pill value={r.status} /> },
                                    ]} />
                                </Section>
                                <Section title="Expedientes PLB" icon={FileCheck} count={data.support.cases.length}>
                                    <Table testid="u360-cases" rows={data.support.cases} cols={[
                                        { k: 'created_at', h: 'Fecha', render: (r) => fmtDate(r.created_at) }, { k: 'code', h: 'Código', mono: true }, { k: 'entity_type', h: 'Tipo' }, { k: 'summary', h: 'Resumen', render: (r) => <span className="truncate inline-block max-w-[280px]">{r.summary}</span> }, { k: 'status', h: 'Estado', render: (r) => <Pill value={r.status} /> },
                                    ]} />
                                </Section>
                            </div>
                        )}

                        {tab === 'notas' && <UserNotesPanel userId={u.id} onCountChange={onNotesCount} />}

                        {tab === 'accesos' && (
                            <Section title="Historial de accesos" icon={KeyRound} count={data.access.logins.length}>
                                <Table testid="u360-logins" rows={data.access.logins} cols={[
                                    { k: 'logged_in_at', h: 'Fecha', render: (r) => fmtDate(r.logged_in_at) }, { k: 'ip_address', h: 'IP', mono: true }, { k: 'location', h: 'Ubicación' }, { k: 'device', h: 'Dispositivo' }, { k: 'browser', h: 'Navegador' },
                                ]} />
                            </Section>
                        )}
                    </>
                )}
            </div>
        </Layout>
    );
};

export default AdminUser360Page;
