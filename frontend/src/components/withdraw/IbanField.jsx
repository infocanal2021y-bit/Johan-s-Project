import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, CheckCircle, AlertCircle, AlertTriangle, Loader2, Building2, Globe } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import api from '../../lib/api';

// Formats an IBAN into groups of 4 (uppercase, no diacritics).
const formatIban = (value) => {
    const clean = (value || '').replace(/\s/g, '').toUpperCase();
    return (clean.match(/.{1,4}/g) || []).join(' ');
};

// Professional IBAN input with server-side MOD-97 validation + bank/BIC detection.
// Reports validity + parsed data to the parent via onResult.
export const IbanField = ({ value, onChange, onResult, label = 'IBAN', required = true, testId = 'iban-field' }) => {
    const [status, setStatus] = useState('idle'); // idle | checking | valid | invalid
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);
    const timer = useRef(null);

    const runValidate = useCallback(async (raw) => {
        const clean = (raw || '').replace(/\s/g, '');
        if (clean.length < 15) {
            setStatus('idle'); setError(''); setResult(null);
            onResult && onResult(null);
            return;
        }
        setStatus('checking');
        try {
            const { data } = await api.post('/iban/validate', { iban: clean });
            if (data.valid) {
                setStatus('valid'); setError(''); setResult(data);
                onResult && onResult(data);
            } else {
                setStatus('invalid'); setError(data.error || 'IBAN inválido'); setResult(null);
                onResult && onResult(null);
            }
        } catch {
            setStatus('invalid'); setError('No se pudo validar el IBAN. Intente nuevamente.'); setResult(null);
            onResult && onResult(null);
        }
    }, [onResult]);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => runValidate(value), 500);
        return () => timer.current && clearTimeout(timer.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const handleChange = (e) => {
        onChange(formatIban(e.target.value));
    };

    return (
        <div className="space-y-2" data-testid={testId}>
            <Label className="text-slate-300 font-normal">{label} {required && '*'}</Label>
            <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                    placeholder="ES00 0000 0000 0000 0000 0000"
                    value={value}
                    onChange={handleChange}
                    className={`pl-10 pr-10 bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-600 uppercase tracking-wider ${
                        status === 'valid' ? 'border-emerald-500' : status === 'invalid' ? 'border-red-500' : ''
                    }`}
                    style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.05em' }}
                    data-testid={`${testId}-input`}
                />
                {status === 'checking' && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 animate-spin" />}
                {status === 'valid' && <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-400" data-testid={`${testId}-valid-icon`} />}
                {status === 'invalid' && <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-400" data-testid={`${testId}-invalid-icon`} />}
            </div>

            {status === 'invalid' && error && (
                <p className="text-red-400 text-sm flex items-center gap-1" data-testid={`${testId}-error`}>
                    <AlertTriangle className="w-3 h-3" /> {error}
                </p>
            )}

            {status === 'valid' && result && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 space-y-1.5"
                    data-testid={`${testId}-detected`}
                >
                    <p className="text-emerald-400 text-sm font-medium flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" /> {result.message}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4 text-slate-500" />
                            <span className="text-slate-400">País:</span>
                            <span className="text-white">{result.country_name}</span>
                        </div>
                        {result.bank_detected && (
                            <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-slate-500" />
                                <span className="text-slate-400">Banco:</span>
                                <span className="text-white">{result.bank_name}</span>
                            </div>
                        )}
                        {result.bic && (
                            <div className="flex items-center gap-2">
                                <CreditCard className="w-4 h-4 text-slate-500" />
                                <span className="text-slate-400">BIC:</span>
                                <span className="text-white font-mono">{result.bic}</span>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </div>
    );
};
