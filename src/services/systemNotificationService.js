/**
 * systemNotificationService.js
 * Servicio de alertas y notificaciones internas del sistema Cervezas Finas
 */

import { supabase } from '@/supabaseClient';

/**
 * Notifica al chofer/repartidor que su carga de camión ha sido confirmada por almacenista.
 */
export async function notifyDriverLoadConfirmed(driverId, routeName, itemCount) {
  try {
    await supabase.from('system_notifications').insert({
      user_id: driverId,
      title: '🚛 Carga de Camión Confirmada',
      message: `Tu camión ha sido cargado con ${itemCount} SKUs para la ruta ${routeName}. ¡Buen viaje!`,
      type: 'TRUCK_LOAD',
      read: false,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[systemNotification] Error insertando notif carga:', e);
  }
}

/**
 * Alerta a supervisores/administradores cuando una liquidación cierra con faltantes.
 */
export async function notifyLiquidationDifference(driverName, routeName, cashDiff, missingBottles) {
  try {
    // Buscar usuarios admin/supervisor
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'sistemas', 'supervisor']);

    if (!admins || admins.length === 0) return;

    const notifs = admins.map(a => ({
      user_id: a.id,
      title: '⚠️ Liquidación con Diferencias',
      message: `Ruta ${routeName} (${driverName}): Faltante Efectivo $${Math.abs(cashDiff).toFixed(2)}, Faltante Envases: ${missingBottles}.`,
      type: 'LIQUIDATION_ALERT',
      read: false,
      created_at: new Date().toISOString(),
    }));

    await supabase.from('system_notifications').insert(notifs);
  } catch (e) {
    console.warn('[systemNotification] Error insertando alerta liquidacion:', e);
  }
}
