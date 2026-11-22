import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { kvStorage } from '@/services/kvStorage';

export default function Logout() {
  const { signOut } = useSupabaseAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const doLogout = async () => {
      try {
        // Limpiar notificaciones push
        const { NotificationService } = await import("@/services/NotificationService");
        await NotificationService.logout();
        
        await signOut();
      } catch (_) { }

      try {
        await kvStorage.removeItem('cf_auth_session_v1');
      } catch (_) { }

      // Limpieza forzada de tokens de Supabase en localStorage
      try {
        const keys = Object.keys(window.localStorage);
        keys.forEach((k) => {
          if (k.includes('sb-') && k.includes('-auth-token')) {
            window.localStorage.removeItem(k);
          }
          if (k.toLowerCase().includes('supabase') && k.toLowerCase().includes('auth')) {
            window.localStorage.removeItem(k);
          }
        });
      } catch (_) { }
      navigate('/login', { replace: true });
    };
    doLogout();
  }, [signOut, navigate]);

  return null;
}
