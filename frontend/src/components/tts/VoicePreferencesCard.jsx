import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Volume2, Loader2 } from 'lucide-react';
import { SpeakButton } from './SpeakButton';

const SAMPLE = 'Hola, soy la voz de Lionsbit Verificación. Así sonarán tus notificaciones y comunicaciones.';

export const VoicePreferencesCard = () => {
    const [data, setData] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => { api.get('/tts/voices').then((r) => setData(r.data)).catch(() => setData({ voices: [], prefs: {} })); }, []);

    const save = async (patch) => {
        setSaving(true);
        try {
            const r = await api.put('/tts/preferences', patch);
            setData((d) => ({ ...d, prefs: r.data.prefs }));
            toast.success('Preferencias de voz guardadas');
        } catch (e) { toast.error(e.response?.data?.detail || 'No se pudo guardar'); }
        finally { setSaving(false); }
    };

    const prefs = data?.prefs || {};
    return (
        <Card id="voice" className="bg-slate-900/70 backdrop-blur-xl border-slate-800 scroll-mt-24" data-testid="voice-prefs-card">
            <CardHeader>
                <CardTitle className="text-white font-heading flex items-center gap-2"><Volume2 className="w-5 h-5 text-cyan-300" /> Lectura en voz (Texto a voz)</CardTitle>
            </CardHeader>
            <CardContent>
                {!data ? <Loader2 className="w-5 h-5 text-slate-400 animate-spin" /> : (
                    <div className="space-y-4">
                        <p className="text-slate-400 text-[12.5px]">Elige la voz con la que se leerán tus notificaciones, comunicaciones y respuestas del asistente.</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="voice-options">
                            {data.voices.map((v) => (
                                <button key={v.id} type="button" disabled={saving} onClick={() => save({ voice: v.id })} data-testid={`voice-option-${v.id}`}
                                    className={`text-left rounded-lg px-3 py-2.5 border transition-colors ${prefs.voice === v.id ? 'bg-cyan-500/15 border-cyan-500/40 text-white' : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-600'}`}>
                                    <p className="text-[13px] font-semibold">{v.label}</p>
                                    <p className="text-[11px] text-slate-500">{v.desc}</p>
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <label className="flex items-center gap-2 text-[12.5px] text-slate-300">Velocidad
                                <select value={prefs.speed || 1} onChange={(e) => save({ speed: Number(e.target.value) })} disabled={saving}
                                    className="h-8 rounded-md bg-slate-950 border border-slate-700 text-white text-[12.5px] px-2" data-testid="voice-speed-select">
                                    {[0.8, 0.9, 1, 1.1, 1.25, 1.5].map((s) => <option key={s} value={s}>{s}×</option>)}
                                </select>
                            </label>
                            <SpeakButton text={SAMPLE} voice={prefs.voice} label="Probar voz" testid="voice-test-btn" />
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
