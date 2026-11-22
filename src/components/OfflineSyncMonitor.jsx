// src/components/OfflineSyncMonitor.jsx
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, AlertCircle, CheckCircle, Loader2, Database, ChevronUp, ChevronDown, Radio } from 'lucide-react';
import { countPendingOperations } from '@/sync/syncService';
import { isOnline as checkIsOnline, setOfflineMode, getOfflineMode, setupNetworkSync } from '@/lib/network';

/**
 * Monitor visual de estado de sincronización (Minimizado)
 */
export default function OfflineSyncMonitor() {
    const [pendingCount, setPendingCount] = useState(0);
    const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | success | error
    const [isOnline, setIsOnline] = useState(true);
    const [isExpanded, setIsExpanded] = useState(false);
    const [lastError, setLastError] = useState(null);
    const [manualOffline, setManualOffline] = useState(false);

    // Inicializar estado offline manual
    useEffect(() => {
        (async () => {
            const mode = await getOfflineMode();
            setManualOffline(mode);
            const online = await checkIsOnline();
            setIsOnline(online);
        })();
    }, []);

    useEffect(() => {
        const openMonitor = () => setIsExpanded(true);
        window.addEventListener('open-offline-monitor', openMonitor);
        return () => window.removeEventListener('open-offline-monitor', openMonitor);
    }, []);

    // Toggle Offline Mode
    // Toggle Offline Mode
    const toggleOfflineMode = async () => {
        const newValue = !manualOffline;
        await setOfflineMode(newValue);
        setManualOffline(newValue);

        // Force re-check
        const online = await checkIsOnline();
        setIsOnline(online);

        console.log('[OfflineSyncMonitor] Manual Offline toggled:', newValue);

        try {
            const { toast } = await import('@/components/ui/use-toast').then(m => ({ toast: m.toast }));
            toast({
                title: newValue ? "Modo Offline: ACTIVADO" : "Modo Online: RESTAURADO",
                description: newValue
                    ? "La aplicación no buscará internet. Los datos se guardarán localmente."
                    : "La aplicación intentará conectarse a internet.",
                className: newValue ? "bg-orange-600 text-white border-none" : "bg-emerald-600 text-white border-none",
                duration: 3000,
            });
        } catch (e) { console.error('Toast error', e); }

        // If going back online, trigger sync
        if (!newValue) {
            setupNetworkSync();
        }
    };

    // Verificar operaciones pendientes periódicamente
    useEffect(() => {
        const checkPending = async () => {
            try {
                const count = await countPendingOperations();
                setPendingCount(count);
            } catch (e) {
                console.error('[OfflineSyncMonitor] Error checking pending:', e);
            }
        };
        checkPending();
        const interval = setInterval(checkPending, 5000);
        return () => clearInterval(interval);
    }, []);

    // Listeners
    useEffect(() => {
        const handleSyncStart = () => { setSyncStatus('syncing'); setLastError(null); };
        const handleSyncComplete = (e) => {
            const { synced, failed } = e.detail || {};
            if (failed > 0) {
                setSyncStatus('error');
                setLastError(`${failed} fallo(s)`);
            } else if (synced > 0) {
                setSyncStatus('success');
                setTimeout(() => setSyncStatus('idle'), 3000);
            }
        };
        const handleSyncError = (e) => {
            setSyncStatus('error');
            setLastError(e.detail?.message || 'Error');
        };
        const handleNetworkChange = async () => {
            const online = await checkIsOnline();
            setIsOnline(online);
        };

        window.addEventListener('sync-start', handleSyncStart);
        window.addEventListener('sync-completed', handleSyncComplete);
        window.addEventListener('sync-error', handleSyncError);
        window.addEventListener('online', handleNetworkChange);
        window.addEventListener('offline', handleNetworkChange);
        // Custom event for offline mode toggle
        window.addEventListener('network-status-changed', handleNetworkChange);

        return () => {
            window.removeEventListener('sync-start', handleSyncStart);
            window.removeEventListener('sync-completed', handleSyncComplete);
            window.removeEventListener('sync-error', handleSyncError);
            window.removeEventListener('online', handleNetworkChange);
            window.removeEventListener('offline', handleNetworkChange);
            window.removeEventListener('network-status-changed', handleNetworkChange);
        };
    }, []);

    // Safety Timeout
    useEffect(() => {
        let timeout;
        if (syncStatus === 'syncing') {
            timeout = setTimeout(() => {
                setSyncStatus('idle');
            }, 45000);
        }
        return () => clearTimeout(timeout);
    }, [syncStatus]);

    // Calcular estado global para mostrar icono resumen
    const hasIssues = !isOnline || pendingCount > 0 || syncStatus === 'error' || manualOffline;

    // Si no hay nada que mostrar y no estamos offline manual, ocultar
    // if (!hasIssues && syncStatus === 'idle') return null; // DISABLED: Always visible as requested

    const summaryIcon = () => {
        if (syncStatus === 'syncing') return <Loader2 className="w-5 h-5 animate-spin text-indigo-200" />;
        if (syncStatus === 'error') return <AlertCircle className="w-5 h-5 text-red-300 animate-pulse" />;
        if (!isOnline) return <WifiOff className="w-5 h-5 text-slate-300" />;
        if (pendingCount > 0) return <Database className="w-5 h-5 text-blue-300" />;
        return <Wifi className="w-5 h-5 text-emerald-300" />;
    };

    const summaryColor = () => {
        if (syncStatus === 'error') return 'bg-red-900/90 border-red-700';
        if (manualOffline) return 'bg-slate-800/90 border-slate-600';
        if (!isOnline) return 'bg-orange-800/90 border-orange-700'; // Real offline
        if (syncStatus === 'syncing') return 'bg-indigo-900/90 border-indigo-700';
        if (pendingCount > 0) return 'bg-blue-900/90 border-blue-700';
        return 'bg-emerald-900/90 border-emerald-700';
    };

    return (
        <AnimatePresence>
            {isExpanded && <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                className="fixed bottom-24 right-6 z-[9998]"
            >
                <div className="w-72 overflow-hidden rounded-2xl border shadow-2xl ring-4 ring-slate-900/50 backdrop-blur-md transition-all duration-300">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className={`flex w-full items-center justify-start gap-3 px-4 py-3 text-white transition-colors ${summaryColor()}`}
                    >
                        {summaryIcon()}
                        {isExpanded ? (
                            <div className="flex-1 text-left">
                                <p className="font-bold text-sm">
                                    {manualOffline ? 'Modo Offline Activado' :
                                        !isOnline ? 'Sin Conexión' :
                                            syncStatus === 'syncing' ? 'Sincronizando...' :
                                                syncStatus === 'error' ? 'Error Sincronización' :
                                                    pendingCount > 0 ? 'Datos Pendientes' :
                                                        'Conectado'}
                                </p>
                            </div>
                        ) : (
                            // Minimized: Show counts if any
                            (pendingCount > 0 || !isOnline) && (
                                <span className="text-xs font-bold leading-none">
                                    {!isOnline ? 'OFF' : pendingCount}
                                </span>
                            )
                        )}
                        {isExpanded && (isExpanded ? <ChevronDown className="w-4 h-4 opacity-50" /> : <ChevronUp className="w-4 h-4 opacity-50" />)}
                    </button>

                    {/* Expanded Content */}
                    <AnimatePresence>
                        {isExpanded && (
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: 'auto' }}
                                exit={{ height: 0 }}
                                className="bg-slate-900/95 text-white"
                            >
                                <div className="p-4 space-y-4">

                                    {/* Manual Offline Toggle */}
                                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                                        <div className="flex items-center gap-2">
                                            <Radio className={`w-4 h-4 ${manualOffline ? 'text-orange-400' : 'text-slate-400'}`} />
                                            <span className="text-sm">Forzar Offline</span>
                                        </div>
                                        <button
                                            onClick={toggleOfflineMode}
                                            className={`w-10 h-5 rounded-full relative transition-colors ${manualOffline ? 'bg-orange-500' : 'bg-slate-600'}`}
                                        >
                                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${manualOffline ? 'left-6' : 'left-1'}`} />
                                        </button>
                                    </div>

                                    {/* Real Status */}
                                    <div className="space-y-2 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">Estado de red</span>
                                            <span className={isOnline ? 'text-emerald-400' : 'text-orange-400'}>
                                                {isOnline ? 'Online' : 'Offline'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">Pendientes</span>
                                            <span className={pendingCount > 0 ? 'text-blue-400' : 'text-slate-200'}>
                                                {pendingCount} registros
                                            </span>
                                        </div>
                                        {lastError && (
                                            <div className="bg-red-500/20 p-2 rounded text-red-200 border border-red-500/30">
                                                {lastError}
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    {(pendingCount > 0 || lastError) && (
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const { syncPendingOperations } = await import('@/sync/syncService');
                                                    await syncPendingOperations();
                                                } catch (e) { console.error(e); }
                                            }}
                                            disabled={!isOnline}
                                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-bold transition-all"
                                        >
                                            {isOnline ? 'Sincronizar Ahora' : 'Conecta para Sincronizar'}
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>}
        </AnimatePresence>
    );
}
