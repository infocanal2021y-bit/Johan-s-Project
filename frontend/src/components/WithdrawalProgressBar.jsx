import { motion } from 'framer-motion';
import { Progress } from './ui/progress';
import { CheckCircle, Clock, Loader2, ArrowRight, Shield } from 'lucide-react';

const STATUS_CONFIG = {
    pending_tax: {
        progress: 10,
        label: 'Impuesto Pendiente',
        description: 'Esperando pago del impuesto',
        color: 'orange'
    },
    pending: {
        progress: 20,
        label: 'Pendiente',
        description: 'Solicitud recibida',
        color: 'amber'
    },
    under_review: {
        progress: 50,
        label: 'En Revisión',
        description: 'Verificando información',
        color: 'purple'
    },
    processing: {
        progress: 50,
        label: 'En Revisión',
        description: 'Verificando información',
        color: 'cyan'
    },
    transfer_in_progress: {
        progress: 80,
        label: 'En Proceso',
        description: 'Procesando transferencia',
        color: 'blue'
    },
    completed: {
        progress: 100,
        label: 'Completado',
        description: 'Retiro exitoso',
        color: 'emerald'
    },
    rejected: {
        progress: 0,
        label: 'Rechazado',
        description: 'Solicitud rechazada',
        color: 'red'
    }
};

const STEPS = [
    { key: 'pending', label: 'Pendiente', progress: 20 },
    { key: 'under_review', label: 'En Revisión', progress: 50 },
    { key: 'transfer_in_progress', label: 'En Proceso', progress: 80 },
    { key: 'completed', label: 'Completado', progress: 100 }
];

export const WithdrawalProgressBar = ({ status, showSteps = true }) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    const currentProgress = config.progress;
    
    // Determine which step is active
    const getStepStatus = (stepProgress) => {
        if (status === 'rejected') return 'inactive';
        if (currentProgress >= stepProgress) return 'completed';
        if (currentProgress >= stepProgress - 30) return 'active';
        return 'inactive';
    };

    const getProgressColor = () => {
        switch (config.color) {
            case 'orange': return 'bg-orange-500';
            case 'amber': return 'bg-amber-500';
            case 'purple': return 'bg-purple-500';
            case 'cyan': return 'bg-cyan-500';
            case 'blue': return 'bg-blue-500';
            case 'emerald': return 'bg-emerald-500';
            case 'red': return 'bg-red-500';
            default: return 'bg-emerald-500';
        }
    };

    if (status === 'rejected') {
        return (
            <div className="space-y-4">
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                            <Shield className="w-5 h-5 text-red-400" />
                        </div>
                        <div>
                            <p className="text-red-400 font-medium">Solicitud Rechazada</p>
                            <p className="text-red-400/70 text-sm">Esta solicitud ha sido rechazada</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4" data-testid="withdrawal-progress-bar">
            {/* Progress Bar */}
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Progreso del Retiro</span>
                    <span className="text-sm font-medium text-white">{currentProgress}%</span>
                </div>
                <div className="relative">
                    <Progress 
                        value={currentProgress} 
                        className="h-3 bg-slate-700"
                    />
                    <motion.div 
                        className={`absolute top-0 left-0 h-3 rounded-full ${getProgressColor()}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${currentProgress}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        style={{ position: 'absolute', top: 0 }}
                    />
                </div>
            </div>

            {/* Steps */}
            {showSteps && (
                <div className="relative pt-2">
                    {/* Connection Line */}
                    <div className="absolute top-6 left-0 right-0 h-0.5 bg-slate-700" />
                    
                    {/* Steps */}
                    <div className="relative flex justify-between">
                        {STEPS.map((step, index) => {
                            const stepStatus = getStepStatus(step.progress);
                            const isCompleted = stepStatus === 'completed';
                            const isActive = stepStatus === 'active';
                            
                            return (
                                <div key={step.key} className="flex flex-col items-center z-10">
                                    <motion.div
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ delay: index * 0.1 }}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                            isCompleted 
                                                ? 'bg-emerald-500' 
                                                : isActive 
                                                    ? `bg-${config.color}-500 animate-pulse`
                                                    : 'bg-slate-700'
                                        }`}
                                        style={{
                                            backgroundColor: isActive ? 
                                                (config.color === 'orange' ? '#f97316' : 
                                                 config.color === 'cyan' ? '#06b6d4' : 
                                                 config.color === 'blue' ? '#3b82f6' : '#1973B8') : undefined
                                        }}
                                    >
                                        {isCompleted ? (
                                            <CheckCircle className="w-4 h-4 text-white" />
                                        ) : isActive ? (
                                            <Loader2 className="w-4 h-4 text-white animate-spin" />
                                        ) : (
                                            <Clock className="w-4 h-4 text-slate-500" />
                                        )}
                                    </motion.div>
                                    <span className={`mt-2 text-xs text-center ${
                                        isCompleted || isActive ? 'text-white' : 'text-slate-500'
                                    }`}>
                                        {step.label}
                                    </span>
                                    <span className="text-xs text-slate-600">{step.progress}%</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Current Status */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${getProgressColor()} animate-pulse`} />
                    <div>
                        <p className="text-white font-medium text-sm">{config.label}</p>
                        <p className="text-slate-500 text-xs">{config.description}</p>
                    </div>
                </div>
                {status !== 'completed' && (
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                )}
            </div>

            {/* Processed By */}
            <div className="text-center pt-2 border-t border-slate-800">
                <p className="text-xs text-slate-600">
                    Procesado por: <span className="text-slate-500 font-medium">Lionsbit Financial System</span>
                </p>
            </div>
        </div>
    );
};

export default WithdrawalProgressBar;
