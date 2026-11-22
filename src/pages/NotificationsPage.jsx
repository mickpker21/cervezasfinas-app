import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, Circle, Loader2 } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/supabaseClient';

export default function NotificationsPage() {
  const { user } = useSupabaseAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError('');

    if (!user?.id) {
      setError('No se encontró una sesión de usuario válida. Cierra sesión e inicia de nuevo.');
      setLoading(false);
      return;
    }

    try {
      const { data, error: queryError } = await supabase
        .from('system_notifications')
        .select('id, title, message, type, read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (queryError) {
        console.error('[NotificationsPage] Error cargando historial:', queryError);
        if (queryError.code === '42P01' || queryError.code === 'PGRST205') {
          setError('El historial de notificaciones aún no está configurado en Supabase. Falta aplicar la migración de la tabla.');
        } else if (queryError.code === '42501') {
          setError('Tu usuario no tiene permiso para consultar sus notificaciones. Revisa las políticas de acceso de Supabase.');
        } else {
          setError(`No se pudo cargar el historial de notificaciones${queryError.message ? `: ${queryError.message}` : '.'}`);
        }
      } else {
        setNotifications(data || []);
      }
    } catch (queryError) {
      console.error('[NotificationsPage] Falló la consulta de notificaciones:', queryError);
      setError('No se pudo conectar con el historial de notificaciones. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const markRead = async (notification) => {
    if (notification.read) return;
    const { error: updateError } = await supabase
      .from('system_notifications')
      .update({ read: true })
      .eq('id', notification.id)
      .eq('user_id', user.id);

    if (updateError) {
      setError('No se pudo actualizar el estado de la notificación.');
      return;
    }
    setNotifications((current) => current.map((item) =>
      item.id === notification.id ? { ...item, read: true } : item
    ));
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((item) => !item.read).map((item) => item.id);
    if (!unreadIds.length) return;
    const { error: updateError } = await supabase
      .from('system_notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .in('id', unreadIds);

    if (updateError) {
      setError('No se pudieron marcar todas como leídas.');
      return;
    }
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
  };

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const unreadCount = notifications.filter((item) => !item.read).length;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Bell className="h-6 w-6 text-emerald-400" />
            Mis notificaciones
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Historial de avisos dirigidos a tu usuario.
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            <CheckCheck className="h-4 w-4" />
            Marcar todo como leído
          </button>
        )}
      </header>

      {error && (
        <div role="alert" className="rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando notificaciones...
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center">
          <Bell className="mx-auto mb-3 h-8 w-8 text-slate-500" />
          <p className="font-medium text-slate-200">Aún no tienes notificaciones</p>
          <p className="mt-1 text-sm text-slate-400">Los avisos que recibas aparecerán aquí.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <button
                type="button"
                onClick={() => markRead(notification)}
                className={`w-full rounded-xl border p-4 text-left transition-colors ${
                  notification.read
                    ? 'border-slate-800 bg-slate-900/50 hover:bg-slate-900'
                    : 'border-emerald-900/70 bg-emerald-950/30 hover:bg-emerald-950/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Circle className={`mt-1 h-3 w-3 shrink-0 ${notification.read ? 'fill-transparent text-slate-600' : 'fill-emerald-400 text-emerald-400'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="font-semibold text-white">{notification.title || 'Notificación'}</span>
                      <time className="text-xs text-slate-400">{formatDate(notification.created_at)}</time>
                    </div>
                    {notification.message && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{notification.message}</p>
                    )}
                    {notification.type && (
                      <span className="mt-2 inline-block text-[11px] uppercase tracking-wide text-slate-500">
                        {notification.type.replaceAll('_', ' ')}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
