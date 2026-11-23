import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { isOnline } from "@/lib/network";
import { kvStorage } from "@/services/kvStorage";

const SupabaseAuthContext = createContext(null);

const STORAGE_KEY = "cf_auth_session_v1";

async function hashPassword(pwd) {
  if (!pwd) return '';
  try {
    const enc = new TextEncoder().encode(String(pwd));
    const hashBuf = await crypto.subtle.digest('SHA-256', enc);
    const hashArr = Array.from(new Uint8Array(hashBuf));
    return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    let hash = 0;
    const str = String(pwd);
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
  }
}

export const useSupabaseAuth = () => {
  const context = useContext(SupabaseAuthContext);
  if (!context) {
    throw new Error("useSupabaseAuth debe ser usado dentro de SupabaseAuthProvider");
  }
  return context;
};

export const SupabaseAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offlineSession, setOfflineSession] = useState(false);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const online = await isOnline().catch(() => false);

        if (online) {
          // ðŸŒ  ONLINE: intentamos obtener sesión fresca de Supabase
          const { data, error } = await supabase.auth.getSession();

          if (!mounted) return;

          const currentSession = data?.session ?? null;

          if (currentSession) {
            // Fetch profile data to get role, route, branch_id and assigned_zones
            const { data: profileData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', currentSession.user.id)
              .maybeSingle();

            if (profileData && currentSession.user) {
              if (profileData.is_active === false) {
                await supabase.auth.signOut();
                setSession(null);
                setUser(null);
                setOfflineSession(false);
                alert("Esta cuenta está desactivada temporalmente (Empleado dado de baja). Por favor contacte a RH.");
                return;
              }
              
              currentSession.user.profile = profileData;
              currentSession.user.user_metadata = {
                ...(currentSession.user.user_metadata || {}),
                // Propagar nombre de profiles → user_metadata para que todos los componentes lo lean sin re-login
                name: profileData.name || currentSession.user.user_metadata?.name,
                nombre: profileData.name || currentSession.user.user_metadata?.nombre,
                full_name: profileData.name || currentSession.user.user_metadata?.full_name,
                role: profileData.role || currentSession.user.user_metadata?.role,
                route: profileData.route || currentSession.user.user_metadata?.route,
                zona: profileData.zona || currentSession.user.user_metadata?.zona,
                assigned_zones: profileData.assigned_zones,
                warehouse_ids: profileData.warehouse_ids
              };
            }

            // Sesión válida online -> Actualizamos todo
            localStorage.removeItem('cf_explicit_logout');
            kvStorage.removeItem('cf_explicit_logout').catch(() => { });
            setSession(currentSession);
            setUser(currentSession.user ?? null);
            setOfflineSession(false);
            // Guardamos persistencia manual
            kvStorage.setItem(STORAGE_KEY, currentSession).catch(() => { });
          } else {
            const wasExplicitLogout =
              localStorage.getItem('cf_explicit_logout') === '1' ||
              (await kvStorage.getItem('cf_explicit_logout').catch(() => null)) === '1';

            // Si el usuario cerró sesión explícitamente o getSession() respondió sin error que no hay sesión activa online,
            // NO revivir la sesión automáticamente.
            if (wasExplicitLogout || !error) {
              setSession(null);
              setUser(null);
              setOfflineSession(false);
              await kvStorage.removeItem(STORAGE_KEY).catch(() => { });
              await kvStorage.removeItem('last_known_user').catch(() => { });
            } else {
              console.warn('[Auth] Error de red en getSession. Intentando fallback local...', error);
              let cachedSession = null;
              try {
                cachedSession = await kvStorage.getItem(STORAGE_KEY);
              } catch (e) { }

              if (cachedSession) {
                setSession(cachedSession);
                setUser(cachedSession.user ?? null);
                setOfflineSession(true);
              } else {
                setSession(null);
                setUser(null);
                setOfflineSession(false);
              }
            }
          }
        } else {
          // 📴 OFFLINE: intentamos kvStorage solo si NO hubo cierre de sesión explícito
          const wasExplicitLogout =
            localStorage.getItem('cf_explicit_logout') === '1' ||
            (await kvStorage.getItem('cf_explicit_logout').catch(() => null)) === '1';

          let cachedSession = null;
          if (!wasExplicitLogout) {
            try {
              cachedSession = await kvStorage.getItem(STORAGE_KEY);
            } catch (e) { }

            if (!cachedSession) {
              try {
                const lastUser = await kvStorage.getItem('last_known_user');
                if (lastUser) {
                  cachedSession = { user: lastUser, access_token: 'offline_token' };
                }
              } catch (e) { }
            }
          }

          if (cachedSession) {
            if (!mounted) return;
            setSession(cachedSession);
            setUser(cachedSession.user ?? null);
            setOfflineSession(true);
          } else {
            if (!mounted) return;
            setSession(null);
            setUser(null);
            setOfflineSession(false);
          }
        }

        // Setup network listener para auto-sync
        try {
          const { setupNetworkSync } = await import('@/lib/network');
          await setupNetworkSync();
        } catch (e) {
          console.warn('[Auth] Error configurando network sync:', e);
        }

        // Suscripción a cambios
        const { data: authSub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
          if (!mounted) return;

          if (!newSession) {
            // 🛡️ PROTECCIÓN CRÍTICA OFFLINE:
            // Si Supabase emite sesión nula (por fallo de refresh de token o al arrancar offline),
            // NUNCA borrar la sesión ni el usuario si estamos offline.
            const online = await isOnline().catch(() => false);
            if (!online) {
              console.warn(`[Auth] 🛡️ Ignorando evento de sesión nula (${_event}) porque el dispositivo está OFFLINE. Preservando sesión activa.`);
              setOfflineSession(true);
              return;
            }

            // Si estamos online pero no es un SIGNED_OUT explícito (ej. fallo temporal de Supabase),
            // verificar si tenemos respaldo local antes de desloguear
            if (_event !== 'SIGNED_OUT') {
              console.warn(`[Auth] Evento ${_event} con sesión nula estando online. Preservando estado local.`);
              return;
            }

            // Solo si estamos ONLINE y el evento fue SIGNED_OUT explícito:
            console.log('[Auth] Cierre de sesión confirmado online.');
            localStorage.setItem('cf_explicit_logout', '1');
            kvStorage.setItem('cf_explicit_logout', '1').catch(() => { });
            setSession(null);
            setUser(null);
            setOfflineSession(false);
            kvStorage.removeItem(STORAGE_KEY).catch(() => { });
            kvStorage.removeItem('last_known_user').catch(() => { });
            return;
          }
          
          let newUser = newSession?.user ?? null;

          if (newUser) {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', newUser.id)
              .maybeSingle();
            
            if (profileData) {
              if (profileData.is_active === false) {
                await supabase.auth.signOut();
                setSession(null);
                setUser(null);
                setOfflineSession(false);
                alert("Esta cuenta está desactivada temporalmente (Empleado dado de baja). Por favor contacte a RH.");
                return;
              }

              newUser.profile = profileData;
              newUser.user_metadata = {
                ...(newUser.user_metadata || {}),
                // Propagar nombre de profiles → user_metadata para que todos los componentes lo lean sin re-login
                name: profileData.name || newUser.user_metadata?.name,
                nombre: profileData.name || newUser.user_metadata?.nombre,
                full_name: profileData.name || newUser.user_metadata?.full_name,
                role: profileData.role || newUser.user_metadata?.role,
                route: profileData.route || newUser.user_metadata?.route,
                zona: profileData.zona || newUser.user_metadata?.zona,
                assigned_zones: profileData.assigned_zones,
                warehouse_ids: profileData.warehouse_ids
              };
              // update local session with profile so it's persisted correctly
              newSession.user = newUser;
            }
          }
          
          setSession(prevSession => {
            if (newSession?.access_token === prevSession?.access_token && 
                newSession?.refresh_token === prevSession?.refresh_token) {
              return prevSession;
            }
            return newSession;
          });

          setUser(prevUser => {
            if (!newUser && !prevUser) return null;
            if (!newUser || !prevUser) return newUser;
            
            // Comparación profunda simplificada para evitar re-renders
            if (newUser.id === prevUser.id && 
                newUser.email === prevUser.email &&
                newUser.last_sign_in_at === prevUser.last_sign_in_at &&
                JSON.stringify(newUser.user_metadata) === JSON.stringify(prevUser.user_metadata)) {
              return prevUser;
            }
            return newUser;
          });

          setOfflineSession(false);

          kvStorage.setItem(STORAGE_KEY, newSession).catch(() => { });

          if (newUser) {
            kvStorage.setItem('last_known_user', newUser).catch(() => { });
            const r = newUser.user_metadata?.route || newUser.user_metadata?.sales_route || newUser.profile?.route;
            if (r) {
              kvStorage.setItem('last_known_route', String(r)).catch(() => { });
            }
          }

          if (_event === 'PASSWORD_RECOVERY' || _event === 'SIGNED_IN') {
            // Si el usuario viene de un proceso de recuperación, Supabase lo loguea automáticamente
            // pero debemos forzarlo a cambiar la contraseña.
            const isRecovery = _event === 'PASSWORD_RECOVERY' || window.location.hash.includes('type=recovery');
            if (isRecovery) {
              console.log('[Auth] Password recovery detected! Redirecting to change password...');
              setTimeout(() => {
                window.location.href = '/force-password-change';
              }, 500);
            }
          }
        });

        return () => {
          authSub?.subscription?.unsubscribe();
        };

      } finally {
        if (mounted) setLoading(false);
      }
    };

    const cleanupPromise = init();

    return () => {
      mounted = false;
      cleanupPromise.then(cleanup => cleanup && cleanup());
    };
  }, []);

  // Window focus listener to re-verify session (important for PWA/Localhost stay-alive)
  useEffect(() => {
    let lastCheckTime = 0;
    const CHECK_INTERVAL = 300000; // 5 minutos (300,000ms)

    const onFocus = async () => {
      const now = Date.now();
      if (now - lastCheckTime < CHECK_INTERVAL) {
        return; // Throttled
      }
      
      // 🛡️ OFFLINE GUARD: Si no hay internet, no re-verificar con Supabase para no provocar falsos deslogueos
      const online = await isOnline().catch(() => false);
      if (!online) {
        console.log('[Auth] Reanudación en modo OFFLINE: preservando usuario y sesión activa intactos.');
        return;
      }

      console.log('[Auth] Window focus: re-verifying session (throttled)...');
      lastCheckTime = now;
      
      try {
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        
        if (currentSession?.user) {
          if (currentSession.user.id !== user?.id) {
            console.log('[Auth] Session user changed or recovered on focus.');
            setUser(currentSession.user);
          }
        } else if (user) {
          // Doble verificación de conectividad real antes de desloguear
          const stillOnline = await isOnline().catch(() => false);
          if (stillOnline) {
            const cached = await kvStorage.getItem(STORAGE_KEY);
            if (cached?.user) {
              console.warn('[Auth] Session lost on focus re-check pero existe sesión local. Manteniendo usuario.');
              return;
            }
            console.warn('[Auth] Session lost on focus re-check estando online.');
            setUser(null);
          } else {
            console.warn('[Auth] Fallo de sesión pero se detectó offline: manteniendo usuario.');
          }
        }
      } catch (err) {
        console.error('[Auth] Error re-checking session on focus:', err);
      }
    };

    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user]);

  const performOfflineSignIn = async (normEmail, password) => {
    try {
      let matchedUser = null;
      let matchedSession = null;
      let expectedHash = null;

      const cache = (await kvStorage.getItem('offline_users_cache')) || {};
      if (cache[normEmail]) {
        matchedUser = cache[normEmail].user;
        matchedSession = cache[normEmail].session;
        expectedHash = cache[normEmail].passwordHash;
      }

      if (!matchedUser) {
        const lastUser = await kvStorage.getItem('last_known_user');
        if (lastUser && (lastUser.email || '').toLowerCase().trim() === normEmail) {
          matchedUser = lastUser;
          matchedSession = (await kvStorage.getItem(STORAGE_KEY)) || {
            user: lastUser,
            access_token: 'offline_token'
          };
        }
      }

      if (!matchedUser) {
        const savedSession = await kvStorage.getItem(STORAGE_KEY);
        if (savedSession?.user && (savedSession.user.email || '').toLowerCase().trim() === normEmail) {
          matchedUser = savedSession.user;
          matchedSession = savedSession;
        }
      }

      if (!matchedUser) {
        return {
          data: null,
          error: {
            message: "No hay conexión a internet y este usuario no ha iniciado sesión previamente en este dispositivo."
          }
        };
      }

      if (expectedHash) {
        const enteredHash = await hashPassword(password);
        if (enteredHash !== expectedHash) {
          return {
            data: null,
            error: { message: "Contraseña incorrecta." }
          };
        }
      }

      console.log('[Auth] ✅ Inicio de sesión OFFLINE exitoso para:', normEmail);
      const validSession = matchedSession || { user: matchedUser, access_token: 'offline_token' };
      localStorage.removeItem('cf_explicit_logout');
      kvStorage.removeItem('cf_explicit_logout').catch(() => {});
      setSession(validSession);
      setUser(matchedUser);
      setOfflineSession(true);

      kvStorage.setItem('last_known_user', matchedUser).catch(() => {});
      kvStorage.setItem(STORAGE_KEY, validSession).catch(() => {});

      return {
        data: {
          user: matchedUser,
          session: validSession
        },
        error: null
      };
    } catch (err) {
      console.error('[Auth] Error en performOfflineSignIn:', err);
      return {
        data: null,
        error: { message: "Error interno al verificar credenciales offline." }
      };
    }
  };

  // ✅ useCallback: stable references prevent unnecessary re-renders in all consumers
  const signIn = useCallback(async ({ email, password }) => {
    try {
      const normEmail = (email || '').toLowerCase().trim();
      const online = await isOnline().catch(() => false);

      if (!online) {
        console.log('[Auth] Dispositivo OFFLINE: iniciando sesión local para:', normEmail);
        return await performOfflineSignIn(normEmail, password);
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normEmail,
        password,
      });

      if (!error && data?.session) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle();

        let newUser = data.user;
        if (profileData) {
          newUser.profile = profileData;
          newUser.user_metadata = {
            ...(newUser.user_metadata || {}),
            name: profileData.name || newUser.user_metadata?.name,
            nombre: profileData.name || newUser.user_metadata?.nombre,
            full_name: profileData.name || newUser.user_metadata?.full_name,
            role: profileData.role || newUser.user_metadata?.role,
            route: profileData.route || newUser.user_metadata?.route,
            zona: profileData.zona || newUser.user_metadata?.zona,
            assigned_zones: profileData.assigned_zones,
            warehouse_ids: profileData.warehouse_ids
          };
          data.session.user = newUser;
        }

        localStorage.removeItem('cf_explicit_logout');
        kvStorage.removeItem('cf_explicit_logout').catch(() => {});
        setSession(data.session);
        setUser(newUser);
        setOfflineSession(false);

        kvStorage.setItem(STORAGE_KEY, data.session).catch(() => {});
        kvStorage.setItem('last_known_user', newUser).catch(() => {});
        const r = newUser.user_metadata?.route || newUser.user_metadata?.sales_route || newUser.profile?.route;
        if (r) kvStorage.setItem('last_known_route', String(r)).catch(() => {});

        try {
          const pwdHash = await hashPassword(password);
          const cache = (await kvStorage.getItem('offline_users_cache')) || {};
          cache[normEmail] = {
            user: newUser,
            session: data.session,
            passwordHash: pwdHash,
            updatedAt: new Date().toISOString()
          };
          await kvStorage.setItem('offline_users_cache', cache);
        } catch (e) {
          console.warn('[Auth] Error guardando offline_users_cache:', e);
        }
      } else if (error) {
        const isNetworkErr = error.message?.includes('Failed to fetch') || 
                            error.message?.includes('NetworkError') || 
                            error.status === 0;
        if (isNetworkErr) {
          console.warn('[Auth] Error de red Supabase. Probando autenticación offline local...');
          return await performOfflineSignIn(normEmail, password);
        }
      }

      return { data, error };
    } catch (error) {
      console.warn('[Auth] Excepción en signIn, probando login offline:', error);
      try {
        const normEmail = (email || '').toLowerCase().trim();
        return await performOfflineSignIn(normEmail, password);
      } catch (e) {
        return { data: null, error };
      }
    }
  }, []);

  const signUp = useCallback(async ({ email, password, options }) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options,
      });
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  }, []);

  const resetPassword = useCallback(async (email) => {
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email);
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  }, []);

  const verifyOtpRecovery = useCallback(async (email, token) => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'recovery',
      });
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      localStorage.setItem('cf_explicit_logout', '1');
      setUser(null);
      setSession(null);
      setOfflineSession(false);
      try {
        await Promise.all([
          kvStorage.setItem('cf_explicit_logout', '1'),
          kvStorage.removeItem(STORAGE_KEY),
          kvStorage.removeItem('last_known_user'),
          kvStorage.removeItem('last_known_route'),
        ]);
      } catch (e) {
        console.error('Error clearing kvStorage:', e);
      }
      try {
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith('sb-') || k === STORAGE_KEY || k === 'last_known_user') {
            localStorage.removeItem(k);
          }
        });
      } catch (e) {}
      const { error } = await supabase.auth.signOut();
      return { error };
    } catch (error) {
      console.error('Error during signOut:', error);
      return { error };
    }
  }, []);

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }, []);

  // Computed roleType so all consumers (Layout, ProtectedRoute, etc.) get a consistent, normalized role string
  const roleType = user?.profile?.role
    || user?.user_metadata?.role
    || user?.user_metadata?.type
    || user?.app_metadata?.roles?.[0]
    || user?.raw_app_meta_data?.role
    || user?.raw_user_meta_data?.type
    || user?.role
    || null;

  // ✅ useMemo: the context value object is only recreated when actual dependencies change,
  // not on every render. This prevents the entire app tree from re-rendering on window focus.
  const value = useMemo(() => ({
    user,
    session,
    loading,
    offlineSession,
    roleType,
    signIn,
    signUp,
    signOut,
    resetPassword,
    supabase,
    getAccessToken,
    verifyOtpRecovery
  }), [user, session, loading, offlineSession, roleType, signIn, signUp, signOut, resetPassword, getAccessToken, verifyOtpRecovery]);

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  );
};

export default SupabaseAuthContext;
