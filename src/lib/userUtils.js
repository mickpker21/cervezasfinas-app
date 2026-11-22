/**
 * getUserDisplayName — Helper centralizado para obtener el nombre de display del usuario.
 * Prioriza: profile.name (tabla profiles) → user_metadata.nombre → user_metadata.name 
 * → user_metadata.full_name → parte del email → fallback
 * 
 * Usage: import { getUserDisplayName } from '@/lib/userUtils';
 *        const name = getUserDisplayName(user); 
 */
export function getUserDisplayName(user, fallback = 'Usuario') {
  return (
    user?.profile?.name ||
    user?.user_metadata?.nombre ||
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    fallback
  );
}

/**
 * getFirstName — Obtiene sólo el primer nombre del usuario.
 */
export function getUserFirstName(user, fallback = 'Usuario') {
  const full = getUserDisplayName(user, fallback);
  return full.split(' ')[0];
}

/**
 * Formatea el nombre completo de un empleado de hr_employees.
 */
export function getEmployeeFullName(employee) {
  if (!employee) return 'Sin nombre';
  const first = (employee.first_name || '').trim();
  const last = (employee.last_name || '').trim();
  return [first, last].filter(Boolean).join(' ') || 'Sin nombre';
}
