import { useEffect, useRef, useState } from 'react';
import { Volume2, Square, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';

/* Un solo reproductor global: al reproducir un texto se detiene cualquier otro. */
let current = { audio: null, stop: null };
const stopCurrent = () => { try { current.audio?.pause(); } catch { /* noop */ } current.stop?.(); current = { audio: null, stop: null }; };

export const SpeakButton = ({ text, voice, size = 'sm', className = '', label = 'Escuchar', testid = 'speak-btn' }) => {
    const [state, setState] = useState('idle'); // idle | loading | playing
    const urlRef = useRef(null);

    useEffect(() => () => { if (state === 'playing') stopCurrent(); if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const stop = () => { stopCurrent(); setState('idle'); };

    const play = async () => {
        if (!text?.trim()) return;
        stopCurrent();
        setState('loading');
        try {
            const r = await api.post('/tts/speak', { text: text.slice(0, 4000), voice }, { responseType: 'blob' });
            const url = URL.createObjectURL(r.data);
            urlRef.current = url;
            const audio = new Audio(url);
            current = { audio, stop: () => { setState('idle'); URL.revokeObjectURL(url); } };
            audio.onended = () => { setState('idle'); URL.revokeObjectURL(url); current = { audio: null, stop: null }; };
            audio.onerror = () => { setState('idle'); toast.error('No se pudo reproducir el audio'); };
            await audio.play();
            setState('playing');
        } catch (e) {
            setState('idle');
            const detail = e.response?.data instanceof Blob ? null : e.response?.data?.detail;
            toast.error(detail || 'No se pudo generar la voz');
        }
    };

    const dim = size === 'xs' ? 'h-6 px-1.5 text-[10.5px]' : 'h-7 px-2 text-[11.5px]';
    const Icon = state === 'loading' ? Loader2 : state === 'playing' ? Square : Volume2;
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); state === 'playing' ? stop() : play(); }}
            disabled={state === 'loading'}
            title={state === 'playing' ? 'Detener' : `${label} (voz)`}
            aria-label={state === 'playing' ? 'Detener lectura' : 'Escuchar en voz'}
            data-testid={testid}
            data-state={state}
            className={`inline-flex items-center gap-1.5 rounded-full border transition-colors ${dim} ${
                state === 'playing' ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-cyan-500/10 hover:text-cyan-200 hover:border-cyan-500/30'
            } disabled:opacity-60 ${className}`}
        >
            <Icon className={`w-3.5 h-3.5 ${state === 'loading' ? 'animate-spin' : ''}`} />
            {label && <span className="font-semibold">{state === 'playing' ? 'Detener' : label}</span>}
        </button>
    );
};
