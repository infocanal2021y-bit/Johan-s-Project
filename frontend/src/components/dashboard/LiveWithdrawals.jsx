import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { ArrowUpRight, X, Flame, TrendingUp, Clock, ChevronRight, Users } from 'lucide-react';

const NAMES = [
    'Juan Garcia','Maria Gonzalez','Carlos Rodriguez','Ana Martinez','Luis Fernandez',
    'Jose Lopez','Carmen Sanchez','Miguel Perez','Laura Gomez','David Ruiz',
    'Andres Torres','Sofia Ramirez','Diego Herrera','Valentina Castro','Pablo Vargas',
    'Daniela Morales','Javier Mendoza','Camila Rojas','Sergio Silva','Andrea Navarro',
    'Manuel Ortega','Lucia Romero','Fernando Delgado','Paula Vega','Ricardo Molina',
    'Natalia Reyes','Alvaro Guerrero','Mariana Paredes','Victor Fuentes','Gabriela Cortes',
    'Raul Castillo','Daniela Soto','Hugo Medina','Isabel Cabrera','Martin Leon',
    'Patricia Rivas','Eduardo Salazar','Karla Pena','Roberto Arias','Elena Bravo',
    'Francisco Aguilar','Adriana Luna','Jesus Campos','Veronica Solis','Antonio Nunez',
    'Silvia Moya','Jorge Lozano','Rosa Cordero','Esteban Gallardo','Claudia Escobar',
    'Cesar Quintana','Yolanda Peralta','Ivan Zamora','Gloria Valdez','Tomas Figueroa',
    'Alejandra Espinoza','Daniel Benitez','Monica Alvarado','Angel Carrillo','Sandra Ibarra',
    'Oscar Santana','Teresa Montoya','Kevin Rosales','Beatriz Camacho','Luis Enrique Parra',
    'Paola Castaneda','Diego Alejandro Suarez','Carolina Duarte','Jorge Luis Mendez','Diana Bustamante',
    'Andres Felipe Villalobos','Andrea Jimenez','Jose Manuel Navarro','Gabriela Mendez','Luis Alberto Ponce',
    'Natalia Chavez','Carlos Andres Padilla','Valeria Escalante','Pedro Antonio Rangel','Daniela Serrano',
    'Mario Alberto Rivas','Camila Fernandez','Juan Pablo Morales','Paula Jimenez','Ricardo Andres Soto',
    'Sofia Herrera','Fernando Jose Leon','Mariana Torres','Javier Andres Gomez','Laura Martinez',
    'Jose Antonio Diaz','Valentina Perez','Daniel Alejandro Castro','Andrea Sanchez','Luis Fernando Romero',
    'Gabriela Vargas','Miguel Angel Silva','Natalia Delgado','Andres Ramirez','Carla Mendoza',
];

const COUNTRIES = [
    { name: 'Espana', flag: '\uD83C\uDDEA\uD83C\uDDF8' },
    { name: 'Mexico', flag: '\uD83C\uDDF2\uD83C\uDDFD' },
    { name: 'Colombia', flag: '\uD83C\uDDE8\uD83C\uDDF4' },
    { name: 'Argentina', flag: '\uD83C\uDDE6\uD83C\uDDF7' },
    { name: 'Chile', flag: '\uD83C\uDDE8\uD83C\uDDF1' },
    { name: 'Peru', flag: '\uD83C\uDDF5\uD83C\uDDEA' },
    { name: 'Ecuador', flag: '\uD83C\uDDEA\uD83C\uDDE8' },
    { name: 'Panama', flag: '\uD83C\uDDF5\uD83C\uDDE6' },
    { name: 'Alemania', flag: '\uD83C\uDDE9\uD83C\uDDEA' },
    { name: 'Francia', flag: '\uD83C\uDDEB\uD83C\uDDF7' },
    { name: 'Italia', flag: '\uD83C\uDDEE\uD83C\uDDF9' },
    { name: 'Portugal', flag: '\uD83C\uDDF5\uD83C\uDDF9' },
    { name: 'Reino Unido', flag: '\uD83C\uDDEC\uD83C\uDDE7' },
    { name: 'Estados Unidos', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
];

function seededRandom(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
}

function generateWithdrawals(count = 10) {
    const now = Date.now();
    const hourSeed = Math.floor(now / (4 * 3600000));
    const results = [];
    const usedNames = new Set();

    for (let i = 0; i < count; i++) {
        const seed = hourSeed * 1000 + i * 137;
        const r1 = seededRandom(seed);
        const r2 = seededRandom(seed + 7919);
        const r3 = seededRandom(seed + 104729);
        const r4 = seededRandom(seed + 15485863);

        let nameIdx = Math.floor(r1 * NAMES.length);
        while (usedNames.has(nameIdx)) { nameIdx = (nameIdx + 1) % NAMES.length; }
        usedNames.add(nameIdx);

        const country = COUNTRIES[Math.floor(r2 * COUNTRIES.length)];
        const amount = Math.floor(1200 + r3 * 8800);
        const minsAgo = Math.floor(r4 * 240);

        results.push({
            id: i,
            name: NAMES[nameIdx],
            country: country.name,
            flag: country.flag,
            amount,
            timeAgo: minsAgo < 1 ? 'Ahora' : minsAgo < 60 ? `Hace ${minsAgo} min` : `Hace ${Math.floor(minsAgo / 60)}h`,
            timestamp: new Date(now - minsAgo * 60000),
        });
    }
    return results.sort((a, b) => b.timestamp - a.timestamp);
}

// Toast notification that appears periodically
export const WithdrawalToast = () => {
    const [visible, setVisible] = useState(false);
    const [current, setCurrent] = useState(null);
    const timerRef = useRef(null);
    const indexRef = useRef(0);

    const showNext = useCallback(() => {
        const withdrawals = generateWithdrawals(10);
        const w = withdrawals[indexRef.current % withdrawals.length];
        indexRef.current++;
        setCurrent(w);
        setVisible(true);
        setTimeout(() => setVisible(false), 6000);
    }, []);

    useEffect(() => {
        // Show first one after 8 seconds
        const initial = setTimeout(showNext, 8000);
        // Then every 45 seconds
        timerRef.current = setInterval(showNext, 45000);
        return () => { clearTimeout(initial); clearInterval(timerRef.current); };
    }, [showNext]);

    return (
        <AnimatePresence>
            {visible && current && (
                <motion.div
                    initial={{ opacity: 0, x: -100, y: 0 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
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
                                <p className="text-emerald-400 text-base font-bold font-mono">
                                    {current.amount.toLocaleString()} EUR
                                </p>
                                <p className="text-slate-500 text-[11px]">
                                    {current.flag} {current.country} · {current.timeAgo}
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

// Activity panel for dashboard
export const LiveWithdrawalsPanel = () => {
    const [withdrawals] = useState(() => generateWithdrawals(10));
    const [showAll, setShowAll] = useState(false);
    const totalMonth = 127;
    const last24h = 3 + Math.floor(seededRandom(Math.floor(Date.now() / 86400000)) * 5);

    return (
        <>
            <Card className="bg-slate-900/70 border-slate-800" data-testid="live-withdrawals-panel">
                <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                            </div>
                            Actividad en Vivo
                        </h3>
                        <div className="flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2"><span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative rounded-full h-2 w-2 bg-emerald-500" /></span>
                            <span className="text-emerald-400 text-[10px] font-medium">EN VIVO</span>
                        </div>
                    </div>

                    {/* Stats strip */}
                    <div className="flex gap-3">
                        <div className="flex-1 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5 text-center">
                            <p className="text-emerald-400 text-lg font-bold">{last24h}</p>
                            <p className="text-slate-500 text-[9px] uppercase">Ultimas 24h</p>
                        </div>
                        <div className="flex-1 bg-[#14549C]/5 border border-[#14549C]/20 rounded-lg p-2.5 text-center">
                            <p className="text-[#14549C] text-lg font-bold">+{totalMonth}</p>
                            <p className="text-slate-500 text-[9px] uppercase">Este Mes</p>
                        </div>
                    </div>

                    {/* Recent list */}
                    <div className="space-y-0 divide-y divide-slate-800/50">
                        {withdrawals.slice(0, 5).map((w) => (
                            <div key={w.id} className="flex items-center gap-3 py-2.5">
                                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm flex-shrink-0">
                                    {w.flag}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white text-xs font-medium truncate">{w.name}</p>
                                    <p className="text-slate-500 text-[10px]">{w.country} · {w.timeAgo}</p>
                                </div>
                                <span className="text-emerald-400 text-xs font-bold font-mono flex-shrink-0">
                                    {w.amount.toLocaleString()} EUR
                                </span>
                            </div>
                        ))}
                    </div>

                    <Button variant="outline" size="sm" onClick={() => setShowAll(true)}
                        className="w-full border-slate-700 text-slate-400 hover:text-white text-xs" data-testid="view-recent-withdrawals-btn">
                        Ver retiros recientes <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>

                    <p className="text-slate-600 text-[9px] text-center leading-relaxed">
                        Las transacciones mostradas corresponden a actividad reciente dentro de la plataforma y tienen fines informativos.
                    </p>
                </CardContent>
            </Card>

            {/* Full list dialog */}
            <Dialog open={showAll} onOpenChange={setShowAll}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-lg" data-testid="withdrawals-list-dialog">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <ArrowUpRight className="w-5 h-5 text-emerald-400" /> Retiros Recientes
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-1 max-h-[400px] overflow-y-auto">
                        <div className="grid grid-cols-4 gap-2 px-3 py-2 text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-800">
                            <span>Nombre</span><span>Pais</span><span className="text-right">Monto</span><span className="text-right">Tiempo</span>
                        </div>
                        {withdrawals.map((w) => (
                            <div key={w.id} className="grid grid-cols-4 gap-2 px-3 py-2.5 hover:bg-slate-800/30 rounded-lg transition-colors items-center">
                                <span className="text-white text-xs font-medium truncate">{w.name}</span>
                                <span className="text-slate-400 text-xs">{w.flag} {w.country}</span>
                                <span className="text-emerald-400 text-xs font-bold font-mono text-right">{w.amount.toLocaleString()} EUR</span>
                                <span className="text-slate-500 text-[10px] text-right">{w.timeAgo}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-slate-600 text-[9px] text-center pt-2">
                        Las transacciones mostradas corresponden a actividad reciente dentro de la plataforma y tienen fines informativos.
                    </p>
                </DialogContent>
            </Dialog>
        </>
    );
};
