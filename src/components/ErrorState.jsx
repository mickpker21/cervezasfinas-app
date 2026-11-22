import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Componente reutilizable para estados de error en páginas.
 * @param {Object} props
 * @param {string} props.title - Título del error
 * @param {string} props.message - Mensaje de error
 * @param {Function} props.onRetry - Función para reintentar
 * @param {string} props.className - Clases adicionales
 */
export default function ErrorState({ title = 'Error al cargar datos', message, onRetry, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-4 text-center ${className}`}>
      <div className="mb-4 p-4 rounded-full bg-red-50 dark:bg-red-950/30">
        <AlertTriangle className="h-10 w-10 text-red-500" />
      </div>
      <h3 className="mt-2 text-base font-semibold text-slate-700 dark:text-slate-300">
        {title}
      </h3>
      {message && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-xs">
          {message}
        </p>
      )}
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="outline"
          size="sm"
          className="mt-6 gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </Button>
      )}
    </div>
  );
}
