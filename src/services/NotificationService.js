import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/supabaseClient';

let currentUserId = null;

export const NotificationService = {
    listeners: [],

    /**
     * Inicializa las Push Notifications.
     */
    async init(userId) {
        if (!Capacitor.isNativePlatform()) {
            console.log('[NotificationService] Not native platform, skipping push init.');
            return;
        }

        // 1. Configurar listeners PRIMERO
        this.setupListeners();

        // 2. Obtener/Actualizar userId
        if (userId) {
            currentUserId = userId;
        } else {
            const { data } = await supabase.auth.getUser();
            if (data?.user?.id) currentUserId = data.user.id;
        }

        console.log('[NotificationService] Initializing for user:', currentUserId);

        // 3. Verificar y solicitar permisos
        try {
            let permStatus = await PushNotifications.checkPermissions();
            
            if (permStatus.receive === 'prompt') {
                permStatus = await PushNotifications.requestPermissions();
            }

            if (permStatus.receive === 'granted') {
                console.log('[NotificationService] Permission granted, registering...');
                await PushNotifications.register();
            } else {
                console.error('[NotificationService] Push permission denied:', permStatus.receive);
            }
        } catch (e) {
            console.error('[NotificationService] Error in permission/registration flow:', e);
        }
    },

    async setupListeners() {
        try {
            await PushNotifications.removeAllListeners();
        } catch (e) {}

        await PushNotifications.addListener('registration', async (token) => {
            console.log('[NotificationService] Token received:', token.value);
            await this.saveTokenToBackend(token.value);
        });

        await PushNotifications.addListener('registrationError', (error) => {
            console.error('[NotificationService] Registration Error:', error);
        });

        await PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('[NotificationService] Push received in foreground:', notification);
        });

        await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            const data = notification.notification?.data;
            if (data?.url) {
                window.location.href = data.url;
            }
        });
    },

    /**
     * Guarda el FCM token en Supabase.
     * Implementa lógica de "Limpieza de Dispositivo Compartido": un token solo pertenece a un usuario.
     */
    async saveTokenToBackend(token) {
        if (!currentUserId) {
            console.warn('[NotificationService] No currentUserId, retrying fetch...');
            const { data } = await supabase.auth.getUser();
            if (data?.user?.id) {
                currentUserId = data.user.id;
            } else {
                console.error('[NotificationService] Cannot save token: User not authenticated.');
                return;
            }
        }

        try {
            console.log(`[NotificationService] Syncing token for user ${currentUserId}...`);
            
            // 1. LIMPIEZA: Quitar este token de cualquier otro perfil (Dispositivos compartidos)
            // Esto asegura que si el usuario anterior no cerró sesión, deje de recibir notificaciones aquí.
            const { error: cleanError } = await supabase
                .from('profiles')
                .update({ fcm_token: null })
                .eq('fcm_token', token)
                .neq('id', currentUserId); // No quitárselo a uno mismo si ya lo tenía

            if (cleanError) {
                console.warn('[NotificationService] Non-critical error during token cleanup:', cleanError.message);
            }

            // 2. REGISTRO: Asignar el token al usuario actual
            const { error: saveError, status } = await supabase
                .from('profiles')
                .update({ fcm_token: token })
                .eq('id', currentUserId);

            if (saveError) {
                console.error(`[NotificationService] Supabase Error (${status}):`, saveError.message);
            } else {
                console.log('[NotificationService] Token registered successfully to current user.');
            }
        } catch (e) {
            console.error('[NotificationService] Unexpected error during token sync:', e);
        }
    },

    /**
     * Limpia el token del usuario actual al cerrar sesión.
     */
    async logout() {
        if (!Capacitor.isNativePlatform()) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Borrar el token de este perfil en Supabase
            await supabase
                .from('profiles')
                .update({ fcm_token: null })
                .eq('id', user.id);

            console.log('[NotificationService] Token limpiado correctamente.');
        } catch (e) {
            console.error('[NotificationService] Error limpiando token:', e);
        }
    }
};
