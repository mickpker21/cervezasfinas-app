import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { downloadAllData } from '@/sync/fullSyncService';
import { isOnline } from '@/lib/network';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress'; // Assuming you have a Progress component, or I'll use a simple div
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function DataSyncPage() {
    const { user, session } = useSupabaseAuth();
    const navigate = useNavigate();
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('Iniciando...');
    const [details, setDetails] = useState([]);
    const [error, setError] = useState(null);
    const [completed, setCompleted] = useState(false);

    useEffect(() => {
        let mounted = true;

        const runSync = async () => {
            if (!user) return;

            try {
                const online = await isOnline().catch(() => false);
                if (!online) {
                    console.log('[DataSyncPage] Modo offline detectado: usando datos locales inmediatamente.');
                    if (!mounted) return;
                    setStatus('Modo offline: cargando datos locales...');
                    setCompleted(true);
                    setTimeout(() => {
                        if (mounted) navigate('/', { replace: true });
                    }, 500);
                    return;
                }

                setStatus('Preparando descarga...');

                const result = await downloadAllData(
                    user.id,
                    user.user_metadata?.role || 'user',
                    (curr, total, msg) => {
                        if (!mounted) return;
                        const pct = Math.round((curr / total) * 100);
                        setProgress(pct);
                        setStatus(msg);
                    }
                );

                if (!mounted) return;

                if (result.success) {
                    setCompleted(true);
                    setStatus('¡Todo listo!');
                    // Pequeña pausa para que el usuario vea el 100%
                    setTimeout(() => {
                        if (mounted) navigate('/', { replace: true });
                    }, 1000);
                } else {
                    setError('Algunos datos no se pudieron descargar. Puedes intentar de nuevo o continuar.');
                    setDetails(result.results);
                }
            } catch (e) {
                if (!mounted) return;
                console.error('Sync error:', e);
                setError('Error crítico en la sincronización.');
            }
        };

        // Pequeño delay para permitir que la UI monte bien
        const timer = setTimeout(runSync, 500);

        return () => {
            mounted = false;
            clearTimeout(timer);
        };
    }, [user, navigate]);

    const handleRetry = () => {
        setError(null);
        setProgress(0);
        setDetails([]);
        window.location.reload();
    };

    const handleContinue = () => {
        navigate('/', { replace: true });
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-green-950 p-6">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md"
            >
                <Card className="bg-green-900/80 border-green-800 text-white backdrop-blur-sm shadow-xl">
                    <CardContent className="pt-6 flex flex-col items-center text-center space-y-6">

                        {!completed && !error && (
                            <div className="relative">
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                                >
                                    <Loader2 className="h-16 w-16 text-green-400" />
                                </motion.div>
                            </div>
                        )}

                        {completed && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="bg-green-500 rounded-full p-3"
                            >
                                <CheckCircle2 className="h-10 w-10 text-white" />
                            </motion.div>
                        )}

                        {error && (
                            <div className="bg-red-500/20 rounded-full p-3">
                                <AlertCircle className="h-10 w-10 text-red-400" />
                            </div>
                        )}

                        <div className="space-y-2 w-full">
                            <h2 className="text-2xl font-bold">
                                {completed ? '¡Sincronización Completa!' : error ? 'Hubo un problema' : 'Sincronizando Datos'}
                            </h2>
                            <p className="text-green-200/80 text-sm">
                                {status}
                            </p>
                        </div>

                        {!error && (
                            <div className="w-full space-y-2">
                                <div className="h-3 w-full bg-green-950 rounded-full overflow-hidden border border-green-800">
                                    <motion.div
                                        className="h-full bg-green-500"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        transition={{ duration: 0.3 }}
                                    />
                                </div>
                                <p className="text-right text-xs text-green-400 font-mono">{progress}%</p>
                            </div>
                        )}

                        {(completed || error) && (
                            <div className="w-full space-y-3">
                                <div className="bg-black/20 p-3 rounded text-left text-xs text-green-100 max-h-48 overflow-y-auto">
                                    {details.map((d, i) => (
                                        <div key={i} className="flex justify-between border-b border-green-800/30 last:border-0 py-1">
                                            <span>{d.name}</span>
                                            <div className="flex gap-2">
                                                <span className="text-green-300">{d.info || ''}</span>
                                                <span className={d.success ? 'text-green-400' : 'text-red-400'}>
                                                    {d.success ? 'OK' : 'FALLÓ'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {error && (
                                    <div className="flex gap-3 pt-2">
                                        <button
                                            onClick={handleRetry}
                                            className="flex-1 bg-green-700 hover:bg-green-600 py-2 rounded font-medium transition-colors"
                                        >
                                            Reintentar
                                        </button>
                                        <button
                                            onClick={handleContinue}
                                            className="flex-1 bg-transparent border border-green-700 hover:bg-green-800/50 py-2 rounded font-medium transition-colors"
                                        >
                                            Continuar así
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        <p className="text-xs text-green-200/40 pt-4">
                            Por favor no cierres la aplicación
                        </p>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
}
