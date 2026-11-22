import React from 'react';

/**
 * Componente reutilizable para estados vacíos en listas y páginas.
 * @param {Object} props
 * @param {React.ReactNode} props.icon - Ícono a mostrar (componente Lucide o SVG)
 * @param {string} props.title - Título del empty state
 * @param {string} props.description - Descripción opcional
 * @param {React.ReactNode} props.action - Botón o acción opcional
 * @param {string} props.className - Clases adicionales
 */
export default function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-4 text-center ${className}`}>
      {Icon && (
        <div className="mb-4 p-4 rounded-full bg-slate-100 dark:bg-slate-800">
          <Icon className="h-10 w-10 text-slate-400 dark:text-slate-500" />
        </div>
      )}
      {title && (
        <h3 className="mt-2 text-base font-semibold text-slate-700 dark:text-slate-300">
          {title}
        </h3>
      )}
      {description && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-xs">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-6">
          {action}
        </div>
      )}
    </div>
  );
}
