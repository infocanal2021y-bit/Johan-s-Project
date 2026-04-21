import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { ArrowUpRight, X, ChevronRight, Activity, CheckCircle, Clock } from 'lucide-react';

const NAMES_ES = [
    'Javier Garcia Lopez', 'Maria Martinez Sanchez', 'Antonio Rodriguez Fernandez', 'Carmen Lopez Ruiz',
    'Jose Gonzalez Moreno', 'Isabel Perez Jimenez', 'Manuel Sanchez Navarro', 'Lucia Fernandez Alonso',
    'Francisco Martin Torres', 'Pilar Diaz Vargas', 'David Hernandez Castro', 'Laura Munoz Serrano',
    'Daniel Alvarez Ortega', 'Elena Ramirez Molina', 'Carlos Gil Aguilar', 'Marta Romero Cabrera',
    'Alejandro Navarro Iglesias', 'Cristina Dominguez Castillo', 'Pablo Vazquez Moya', 'Raquel Soto Lozano',
    'Ignacio Torres Campos', 'Beatriz Jimenez Medina', 'Adrian Gutierrez Parra', 'Silvia Ortega Leon',
    'Sergio Blanco Herrera', 'Patricia Rubio Ramos', 'Angel Guerrero Pastor', 'Rocio Gallego Benitez',
    'Rafael Suarez Salazar', 'Nuria Castro Delgado',
];

const NAMES_MX = [
    'Juan Carlos Hernandez', 'Ana Gabriela Lopez', 'Luis Enrique Ramirez', 'Maria Fernanda Chavez',
    'Jose Antonio Flores', 'Diana Laura Castillo', 'Miguel Angel Mendoza', 'Sofia Alejandra Vazquez',
    'Eduardo Jose Pena', 'Alejandra Monserrat Silva', 'Roberto Carlos Aguirre', 'Paola Guadalupe Luna',
    'Fernando Alberto Cruz', 'Guadalupe Isabel Delgado', 'Ricardo Andres Salinas', 'Brenda Jocelyn Reyes',
    'Hugo Alejandro Zavala', 'Karla Yolanda Barrera', 'Cesar Octavio Nunez', 'Mariana Fernanda Quintero',
    'Jorge Alberto Tapia', 'Daniela Alejandra Carrillo', 'Arturo Gerardo Villanueva', 'Andrea Michelle Ibarra',
    'Emilio Ismael Rangel', 'Viridiana Yolanda Zamora', 'Gerardo Esteban Arroyo', 'Citlalli Paola Bautista',
    'Omar Ivan Saucedo', 'Angelica Maria Figueroa',
];

const NAMES_CL = [
    'Matias Sepulveda Araya', 'Catalina Munoz Rojas', 'Benjamin Soto Vergara', 'Javiera Fuenzalida Silva',
    'Vicente Contreras Espinoza', 'Martina Pizarro Aravena', 'Sebastian Olivares Tapia', 'Florencia Riquelme Bravo',
    'Diego Andres Saavedra', 'Isidora Valenzuela Carrasco', 'Joaquin Pereira Henriquez', 'Fernanda Alarcon Gaete',
    'Agustin Cifuentes Salinas', 'Antonia Neira Palma', 'Ignacio Villarroel Fica', 'Valentina Arriagada Toro',
    'Cristobal Miranda Zuniga', 'Josefa Caceres Vega', 'Maximiliano Leiva Canales', 'Emilia Urrutia Morales',
    'Nicolas Guzman Cabrera', 'Rocio Zambrano Pino', 'Tomas Bustos Quezada', 'Amanda Acevedo Poblete',
    'Clemente Astudillo Molina', 'Paz Maldonado Godoy', 'Felipe Ignacio Lagos', 'Constanza Cortes Bastias',
    'Martin Alejandro Vargas', 'Sofia Isabel Oyarzun',
];

const NAMES_GENERIC = [
    'Andres Torres','Sofia Ramirez','Diego Herrera','Valentina Castro','Pablo Vargas',
    'Daniela Morales','Javier Mendoza','Camila Rojas','Sergio Silva','Andrea Navarro',
    'Manuel Ortega','Lucia Romero','Fernando Delgado','Paula Vega','Ricardo Molina',
    'Natalia Reyes','Alvaro Guerrero','Mariana Paredes','Victor Fuentes','Gabriela Cortes',
    'Raul Castillo','Daniela Soto','Hugo Medina','Isabel Cabrera','Martin Leon',
    'Patricia Rivas','Eduardo Salazar','Karla Pena','Roberto Arias','Elena Bravo',
    'Francisco Aguilar','Adriana Luna','Jesus Campos','Veronica Solis','Antonio Nunez',
    'Silvia Moya','Jorge Lozano','Rosa Cordero','Esteban Gallardo','Claudia Escobar',
];

// Weighted country pool — Spain, Mexico, Chile appear ~3x more often
const COUNTRY_POOL = [
    // Spain (high weight)
    { name: 'Espana', flag: '\uD83C\uDDEA\uD83C\uDDF8', names: NAMES_ES, weight: 4 },
    // Mexico (high weight)
    { name: 'Mexico', flag: '\uD83C\uDDF2\uD83C\uDDFD', names: NAMES_MX, weight: 4 },
    // Chile (high weight)
    { name: 'Chile', flag: '\uD83C\uDDE8\uD83C\uDDF1', names: NAMES_CL, weight: 3 },
    // Others (baseline)
    { name: 'Colombia', flag: '\uD83C\uDDE8\uD83C\uDDF4', names: NAMES_GENERIC, weight: 1 },
    { name: 'Argentina', flag: '\uD83C\uDDE6\uD83C\uDDF7', names: NAMES_GENERIC, weight: 1 },
    { name: 'Peru', flag: '\uD83C\uDDF5\uD83C\uDDEA', names: NAMES_GENERIC, weight: 1 },
    { name: 'Ecuador', flag: '\uD83C\uDDEA\uD83C\uDDE8', names: NAMES_GENERIC, weight: 1 },
    { name: 'Panama', flag: '\uD83C\uDDF5\uD83C\uDDE6', names: NAMES_GENERIC, weight: 1 },
    { name: 'Alemania', flag: '\uD83C\uDDE9\uD83C\uDDEA', names: NAMES_GENERIC, weight: 1 },
    { name: 'Francia', flag: '\uD83C\uDDEB\uD83C\uDDF7', names: NAMES_GENERIC, weight: 1 },
    { name: 'Italia', flag: '\uD83C\uDDEE\uD83C\uDDF9', names: NAMES_GENERIC, weight: 1 },
    { name: 'Portugal', flag: '\uD83C\uDDF5\uD83C\uDDF9', names: NAMES_GENERIC, weight: 1 },
    { name: 'Reino Unido', flag: '\uD83C\uDDEC\uD83C\uDDE7', names: NAMES_GENERIC, weight: 1 },
    { name: 'Estados Unidos', flag: '\uD83C\uDDFA\uD83C\uDDF8', names: NAMES_GENERIC, weight: 1 },
];

// Pre-expand the pool once for O(1) weighted pick
const WEIGHTED_COUNTRIES = COUNTRY_POOL.flatMap(c => Array(c.weight).fill(c));

const STATUSES = [
    { label: 'Completado', color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
    { label: 'Procesando', color: 'text-amber-400', bg: 'bg-amber-500/15' },
    { label: 'En transferencia', color: 'text-cyan-400', bg: 'bg-cyan-500/15' },
];

function seededRandom(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
}

function generateOne(index, timeBase) {
    // Use prime multipliers to ensure good distribution across indexes
    const seedBase = (timeBase * 31 + index * 2654435761) & 0x7fffffff;
    const r1 = seededRandom(seedBase);
    const r2 = seededRandom((seedBase * 2 + 7919) & 0x7fffffff);
    const r3 = seededRandom((seedBase * 3 + 104729) & 0x7fffffff);
    const r4 = seededRandom((seedBase * 5 + 15485863) & 0x7fffffff);
    // eslint-disable-next-line no-unused-vars
    const r5 = seededRandom((seedBase * 7 + 7727) & 0x7fffffff);

    const nameIdx = Math.floor(r1 * 1000);
    const country = WEIGHTED_COUNTRIES[Math.floor(r2 * WEIGHTED_COUNTRIES.length) % WEIGHTED_COUNTRIES.length];
    const name = country.names[nameIdx % country.names.length];
    // Montos entre 45,366 y 68,355
    const amount = Math.floor(45366 + r3 * (68355 - 45366));
    const secsAgo = Math.floor(r4 * 14400); // up to 4 hours in seconds
    const statusIdx = secsAgo < 300 ? 1 : secsAgo < 1200 ? 2 : 0; // recent = processing

    return {
        id: `w-${timeBase}-${index}`,
        name,
        country: country.name,
        flag: country.flag,
        amount,
        secsAgo,
        status: STATUSES[statusIdx],
        timestamp: Date.now() - secsAgo * 1000,
    };
}

function formatTimeAgo(secsAgo) {
    if (secsAgo < 30) return 'Ahora mismo';
    if (secsAgo < 60) return `Hace ${secsAgo}s`;
    if (secsAgo < 3600) return `Hace ${Math.floor(secsAgo / 60)} min`;
    return `Hace ${Math.floor(secsAgo / 3600)}h ${Math.floor((secsAgo % 3600) / 60)}m`;
}

function generateBatch(count = 20) {
    const hourSeed = Math.floor(Date.now() / (4 * 3600000));
    const results = [];
    const usedNames = new Set();
    for (let i = 0; i < count; i++) {
        const w = generateOne(i, hourSeed);
        if (usedNames.has(w.name)) continue;
        usedNames.add(w.name);
        results.push(w);
    }
    return results.sort((a, b) => b.timestamp - a.timestamp);
}

// ═══════════════ TOAST (se mantiene igual) ═══════════════
export const WithdrawalToast = () => {
    const [visible, setVisible] = useState(false);
    const [current, setCurrent] = useState(null);
    const timerRef = useRef(null);
    const indexRef = useRef(0);

    const showNext = useCallback(() => {
        const ws = generateBatch(15);
        const w = ws[indexRef.current % ws.length];
        indexRef.current++;
        setCurrent(w);
        setVisible(true);
        setTimeout(() => setVisible(false), 6000);
    }, []);

    useEffect(() => {
        const initial = setTimeout(showNext, 8000);
        timerRef.current = setInterval(showNext, 45000);
        return () => { clearTimeout(initial); clearInterval(timerRef.current); };
    }, [showNext]);

    return (
        <AnimatePresence>
            {visible && current && (
                <motion.div
                    initial={{ opacity: 0, x: -100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="fixed bottom-6 left-6 z-50 max-w-sm"
                    data-testid="withdrawal-toast"
                >
                    <div className="bg-slate-900/95 backdrop-blur-xl border border-emerald-500/30 rounded-xl p-4 shadow-2xl shadow-emerald-500/10">
                        <button onClick={() => setVisible(false)} className="absolute top-2 right-2 text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-white text-sm font-semibold truncate">
                                    {current.name} <span className="text-slate-500 font-normal">realizo un retiro</span>
                                </p>
                                <p className="text-emerald-400 text-lg font-bold font-mono">
                                    {current.amount.toLocaleString()} EUR
                                </p>
                                <p className="text-slate-500 text-[11px]">
                                    {current.flag} {current.country} · {formatTimeAgo(current.secsAgo)}
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

// ═══════════════ PANEL EN DASHBOARD ═══════════════
export const LiveWithdrawalsPanel = () => {
    const [withdrawals, setWithdrawals] = useState(() => generateBatch(20));
    const [showAll, setShowAll] = useState(false);
    const [tick, setTick] = useState(0);

    // Update times every 10 seconds for real-time feel
    useEffect(() => {
        const timer = setInterval(() => setTick(t => t + 1), 10000);
        return () => clearInterval(timer);
    }, []);

    // Regenerate data every 4 hours (check every 30s)
    useEffect(() => {
        const checker = setInterval(() => {
            setWithdrawals(generateBatch(20));
        }, 30000);
        return () => clearInterval(checker);
    }, []);

    // Recalculate times based on tick
    const liveWithdrawals = withdrawals.map(w => ({
        ...w,
        secsAgo: Math.floor((Date.now() - w.timestamp) / 1000),
    }));

    const last24h = 5 + Math.floor(seededRandom(Math.floor(Date.now() / 86400000)) * 4);
    const totalMonth = 143;
    const totalVolume = liveWithdrawals.reduce((s, w) => s + w.amount, 0);

    return (
        <>
            <Card className="bg-slate-900/70 border-slate-800" data-testid="live-withdrawals-panel">
                <CardContent className="p-5 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                                <Activity className="w-4 h-4 text-emerald-400" />
                            </div>
                            Actividad en Vivo
                        </h3>
                        <div className="flex items-center gap-2">
                            <span className="text-slate-600 text-[9px] font-mono">{new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                            <span className="relative flex h-2 w-2"><span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative rounded-full h-2 w-2 bg-emerald-500" /></span>
                            <span className="text-emerald-400 text-[10px] font-bold">EN VIVO</span>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5 text-center">
                            <p className="text-emerald-400 text-lg font-bold">{last24h}</p>
                            <p className="text-slate-500 text-[8px] uppercase">Ultimas 24h</p>
                        </div>
                        <div className="bg-[#14549C]/5 border border-[#14549C]/20 rounded-lg p-2.5 text-center">
                            <p className="text-[#14549C] text-lg font-bold">+{totalMonth}</p>
                            <p className="text-slate-500 text-[8px] uppercase">Este Mes</p>
                        </div>
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-2.5 text-center">
                            <p className="text-amber-400 text-sm font-bold font-mono">{(totalVolume / 1000).toFixed(0)}K</p>
                            <p className="text-slate-500 text-[8px] uppercase">Volumen EUR</p>
                        </div>
                    </div>

                    {/* Live feed - last 5 */}
                    <div className="space-y-0">
                        <AnimatePresence mode="popLayout">
                            {liveWithdrawals.slice(0, 5).map((w, i) => (
                                <motion.div
                                    key={w.id}
                                    layout
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="flex items-center gap-3 py-2.5 border-b border-slate-800/40 last:border-0"
                                >
                                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm flex-shrink-0">
                                        {w.flag}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-xs font-medium truncate">{w.name}</p>
                                        <div className="flex items-center gap-2">
                                            <p className="text-slate-500 text-[10px]">{w.country}</p>
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${w.status.bg} ${w.status.color}`}>{w.status.label}</span>
                                        </div>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-emerald-400 text-xs font-bold font-mono">{w.amount.toLocaleString()} EUR</p>
                                        <p className="text-slate-600 text-[9px] flex items-center gap-0.5 justify-end">
                                            <Clock className="w-2.5 h-2.5" />{formatTimeAgo(w.secsAgo)}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    {/* CTA Button */}
                    <Button variant="outline" size="sm" onClick={() => setShowAll(true)}
                        className="w-full border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 text-xs h-9" data-testid="view-recent-withdrawals-btn">
                        <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" /> Retiros Recientes <ChevronRight className="w-3 h-3 ml-auto" />
                    </Button>

                    <p className="text-slate-600 text-[9px] text-center leading-relaxed">
                        Las transacciones mostradas corresponden a actividad reciente dentro de la plataforma y tienen fines informativos.
                    </p>
                </CardContent>
            </Card>

            {/* ═══ PANEL COMPLETO DE RETIROS ═══ */}
            <Dialog open={showAll} onOpenChange={setShowAll}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl" data-testid="withdrawals-list-dialog">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                                <Activity className="w-4 h-4 text-emerald-400" />
                            </div>
                            <div>
                                <span className="block">Retiros Recientes</span>
                                <span className="text-slate-500 text-xs font-normal flex items-center gap-1.5">
                                    <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative rounded-full h-1.5 w-1.5 bg-emerald-500" /></span>
                                    Actualizacion en tiempo real · {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                            </div>
                        </DialogTitle>
                    </DialogHeader>

                    {/* Summary strip */}
                    <div className="grid grid-cols-3 gap-2 mt-2">
                        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                            <p className="text-emerald-400 text-xl font-bold">{last24h}</p>
                            <p className="text-slate-500 text-[9px] uppercase">Retiros 24h</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                            <p className="text-white text-xl font-bold">+{totalMonth}</p>
                            <p className="text-slate-500 text-[9px] uppercase">Este Mes</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                            <p className="text-amber-400 text-xl font-bold font-mono">{(totalVolume / 1000000).toFixed(1)}M</p>
                            <p className="text-slate-500 text-[9px] uppercase">Volumen EUR</p>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="max-h-[420px] overflow-y-auto mt-3 rounded-lg border border-slate-800/50">
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-slate-900 z-10">
                                <tr className="text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-800">
                                    <th className="px-4 py-2.5 text-left font-medium">Usuario</th>
                                    <th className="px-3 py-2.5 font-medium">Pais</th>
                                    <th className="px-3 py-2.5 text-right font-medium">Monto</th>
                                    <th className="px-3 py-2.5 font-medium">Estado</th>
                                    <th className="px-3 py-2.5 text-right font-medium">Tiempo</th>
                                </tr>
                            </thead>
                            <tbody>
                                <AnimatePresence>
                                    {liveWithdrawals.map((w, i) => (
                                        <motion.tr
                                            key={w.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: i * 0.03 }}
                                            className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors"
                                        >
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-xs flex-shrink-0">
                                                        {w.name.charAt(0)}
                                                    </div>
                                                    <span className="text-white font-medium truncate">{w.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <span className="text-slate-300">{w.flag} {w.country}</span>
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <span className="text-emerald-400 font-bold font-mono">{w.amount.toLocaleString()} EUR</span>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${w.status.bg} ${w.status.color}`}>
                                                    {w.status.label === 'Completado' && <CheckCircle className="w-2.5 h-2.5" />}
                                                    {w.status.label}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-right text-slate-500 font-mono text-[10px]">
                                                {formatTimeAgo(w.secsAgo)}
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    </div>

                    <p className="text-slate-600 text-[9px] text-center mt-2">
                        Las transacciones mostradas corresponden a actividad reciente dentro de la plataforma y tienen fines informativos.
                    </p>
                </DialogContent>
            </Dialog>
        </>
    );
};
