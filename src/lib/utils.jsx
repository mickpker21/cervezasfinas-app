import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Wrench, Trash2, ArrowRightLeft, Briefcase, RefreshCw } from 'lucide-react';

export function cn(...inputs) {
	return twMerge(clsx(inputs));
}

/**
 * Devuelve el texto formateado y una clase de estilo para un estado de orden.
 * @param {string} status - El estado de la orden (ej. 'COMPLETADA', 'EN_RUTA').
 * @returns {{text: string, className: string}}
 */
export const getStatusStyle = (status) => {
  if (!status) return { text: 'Indefinido', className: 'bg-gray-500/20 text-gray-300' };
  
  const formattedText = status.replace('_', ' ');

  switch (status) {
    case 'COMPLETADA':
      return { text: formattedText, className: 'bg-green-500/20 text-green-300' };
    case 'APROBADA':
    case 'EN_RUTA':
    case 'EN_PROCESO':
      return { text: formattedText, className: 'bg-blue-500/20 text-blue-300' };
    case 'PENDIENTE':
      return { text: formattedText, className: 'bg-yellow-500/20 text-yellow-300' };
    case 'RECHAZADA':
    case 'CANCELADA':
      return { text: formattedText, className: 'bg-red-500/20 text-red-300' };
    default:
      return { text: formattedText, className: 'bg-gray-500/20 text-gray-300' };
  }
};

/**
 * Devuelve una etiqueta, un icono y un estilo para un tipo de acción de orden.
 * @param {string} action - La acción de la orden (ej. 'INSTALAR', 'RETIRO').
 * @returns {{label: string, icon: React.ElementType, style: string}}
 */
export const getActionInfo = (action) => {
  const normalizedAction = String(action || '').toUpperCase().trim();

  const info = {
    INSTALAR: { label: 'Instalación', icon: Wrench, style: 'bg-blue-600/20 text-blue-300' },
    RETIRO: { label: 'Retiro', icon: Trash2, style: 'bg-red-600/20 text-red-300' },
    RETIRAR: { label: 'Retiro', icon: Trash2, style: 'bg-red-600/20 text-red-300' },
    DESINSTALAR: { label: 'Desinstalación', icon: Trash2, style: 'bg-red-600/20 text-red-300' },
    MOVER: { label: 'Movimiento', icon: ArrowRightLeft, style: 'bg-purple-600/20 text-purple-300' },
    REPARACION: { label: 'Reparación', icon: Wrench, style: 'bg-yellow-600/20 text-yellow-300' },
    CAMBIO_EQUIPO: { label: 'Cambio de Equipo', icon: RefreshCw, style: 'bg-emerald-600/20 text-emerald-300' },
  };

  const actionInfo = info[normalizedAction];
  
  return actionInfo || { 
    label: action ? String(action).charAt(0).toUpperCase() + String(action).slice(1).toLowerCase().replace(/_/g, ' ') : 'Desconocido', 
    icon: Briefcase,
    style: 'bg-gray-500/20 text-gray-300' 
  };
};
