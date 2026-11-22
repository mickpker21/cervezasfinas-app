import { useEffect, useState } from 'react';
import { countPendingOperations } from '@/sync/syncService';
import { AlertCircle } from 'lucide-react';

export default function PendingOperationsBadge() {
    const [count, setCount] = useState(0);

    useEffect(() => {
        const load = async () => {
            try {
                const c = await countPendingOperations();
                setCount(c);
            } catch (err) {
                console.warn('[PendingBadge] Error loading count:', err);
            }
        };

        load();

        // Recargar cada 10 segundos
        const interval = setInterval(load, 10000);
        return () => clearInterval(interval);
    }, []);

    if (count === 0) return null;

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full text-xs font-medium border border-amber-200">
            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            <AlertCircle className="w-3 h-3" />
            <span>{count} por sincronizar</span>
        </div>
    );
}
