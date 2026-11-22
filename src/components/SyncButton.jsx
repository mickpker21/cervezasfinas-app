// src/components/SyncButton.jsx
import React, { useState } from 'react';
import { RefreshCw, Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { fullSync, getLastSyncTime } from '@/sync/fullSyncService';
import { isOnline } from '@/lib/network';

export default function SyncButton({ variant = 'ghost', size = 'sm', showLabel = true, className, iconClassName, ...props }) {
    const [syncing, setSyncing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
    const { user } = useSupabaseAuth();
    const { toast } = useToast();

    const handleSync = async () => {
        if (syncing) return;

        const online = await isOnline();
        if (!online) {
            toast({
                title: 'Sin conexión',
                description: 'Necesitas internet para sincronizar.',
                variant: 'destructive',
            });
            return;
        }

        if (!user) {
            toast({
                title: 'Error',
                description: 'No hay usuario autenticado.',
                variant: 'destructive',
            });
            return;
        }

        setSyncing(true);
        setProgress({ current: 0, total: 2, status: 'Iniciando...' });

        try {
            const meta = user?.user_metadata || {};
            const userRole = meta.type || meta.role || 'user';

            await fullSync(
                user.id,
                userRole,
                (current, total, status) => {
                    setProgress({ current, total, status });
                }
            );

            const lastSync = await getLastSyncTime();
            toast({
                title: '✓ Sincronización completa',
                description: lastSync
                    ? `Última actualización: ${lastSync.toLocaleTimeString()}`
                    : 'Datos actualizados exitosamente',
            });
        } catch (e) {
            console.error('[SyncButton] Error:', e);
            toast({
                title: 'Error en sincronización',
                description: e.message || 'No se pudieron sincronizar todos los datos.',
                variant: 'destructive',
            });
        } finally {
            setSyncing(false);
            setProgress({ current: 0, total: 0, status: '' });
        }
    };

    const Icon = syncing ? Loader2 : RefreshCw;
    const defaultIconClass = syncing ? 'animate-spin' : '';
    const finalIconClass = iconClassName || `w-4 h-4 ${defaultIconClass}`;

    return (
        <Button
            variant={variant}
            size={size}
            onClick={handleSync}
            disabled={syncing}
            className={`gap-2 ${className || ''}`}
            title={syncing ? progress.status : 'Sincronizar datos'}
            {...props}
        >
            <Icon className={finalIconClass} />
            {showLabel && (
                <span className="truncate">
                    {syncing
                        ? `${Math.round((progress.current / progress.total) * 100)}%`
                        : 'Sincronizar'}
                </span>
            )}
        </Button>
    );
}
