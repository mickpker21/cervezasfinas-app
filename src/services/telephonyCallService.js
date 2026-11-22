import { supabase } from '../supabaseClient';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

const HOSTINGER_UPLOAD_ENDPOINT = 'https://cervezasfinas.com/api/upload-call-audio.php';
const PENDING_CALL_AUDIOS_KEY = 'televenta_pending_call_audios';

class TelephonyCallService {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.currentRecordingCallId = null;
    this.recordingStartTime = null;

    // Escuchar cambios de red para sincronizar automáticamente al recuperar conexión
    window.addEventListener('online', () => {
      console.log('[TelephonyService] Conexión recuperada. Sincronizando audios pendientes...');
      this.syncPendingAudios();
    });
  }

  /**
   * Llamada directa automática sin confirmar botón verde (uso interno, no Play Store).
   * Usa el plugin nativo DirectCallPlugin (ACTION_CALL) cuando está en APK.
   * Fallback a tel: si el plugin no está disponible.
   */
  async executeDirectPhoneCall(phoneNumber) {
    const cleanPhone = String(phoneNumber || '').replace(/[^0-9+]/g, '');
    if (!cleanPhone) return;

    if (Capacitor.isNativePlatform()) {
      try {
        // Carga diferida del plugin para evitar crash al iniciar el módulo
        const { registerPlugin } = await import('@capacitor/core');
        const DirectCall = registerPlugin('DirectCall');
        if (DirectCall && typeof DirectCall.makeDirectCall === 'function') {
          await DirectCall.makeDirectCall({ phoneNumber: cleanPhone });
          return;
        }
      } catch (e) {
        console.warn('[TelephonyService] DirectCallPlugin no disponible, usando tel: fallback:', e.message);
      }
    }
    // Fallback: abre marcador con número pegado
    window.location.href = `tel:${cleanPhone}`;
  }

  /**
   * Suscribir la APK al canal de llamadas remotos emitidos desde la Web
   */
  listenToRemoteCallTriggers(userId) {
    if (!userId || !Capacitor.isNativePlatform()) return;

    try {
      const channel = supabase.channel(`televenta_calls_${userId}`);
      channel.on('broadcast', { event: 'TRIGGER_DIAL' }, (payload) => {
        console.log('[TelephonyService] Evento de llamada remota recibido desde la Web:', payload);
        const phone = payload?.payload?.phone;
        const clientId = payload?.payload?.clientId;

        if (phone) {
          const callId = 'call_' + Date.now();
          this.startRecording(callId);
          this.executeDirectPhoneCall(phone);
        }
      }).subscribe();
    } catch (e) {
      console.warn('[TelephonyService] Error suscribiendo a canal Realtime:', e);
    }
  }

  /**
   * Emitir llamada desde el navegador Web al teléfono celular APK
   */
  async triggerRemoteCallFromWeb(userId, phone, clientId) {
    if (!userId || !phone) return;
    try {
      const channel = supabase.channel(`televenta_calls_${userId}`);
      await channel.subscribe();
      await channel.send({
        type: 'broadcast',
        event: 'TRIGGER_DIAL',
        payload: { phone, clientId, timestamp: new Date().toISOString() }
      });
      console.log('[TelephonyService] Señal de llamada remota enviada al celular del televenta.');
    } catch (e) {
      console.warn('[TelephonyService] Error al emitir llamada remota:', e);
    }
  }

  /**
   * Registrar Notificaciones Push para recibir alertas del Admin
   */
  async registerPushNotifications(userId) {
    if (!Capacitor.isNativePlatform()) {
      console.log('[TelephonyService] Entorno Web: Notificaciones Push omitidas.');
      return;
    }

    try {
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        console.warn('[TelephonyService] Permiso de Notificaciones Push denegado.');
        return;
      }

      await PushNotifications.register();

      PushNotifications.addListener('registration', async (token) => {
        console.log('[TelephonyService] Push Token recibido:', token.value);
        if (userId) {
          try {
            await supabase.from('profiles').update({
              fcm_token: token.value,
              last_active_apk: new Date().toISOString()
            }).eq('id', userId);
          } catch (e) {
            console.warn('[TelephonyService] Error al guardar FCM token en Supabase:', e);
          }
        }
      });

      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[TelephonyService] Notificación Admin recibida:', notification);
      });
    } catch (err) {
      console.error('[TelephonyService] Error al configurar Push Notifications:', err);
    }
  }

  /**
   * Iniciar seguimiento de tiempo de la llamada.
   * Nota: Android no permite grabar audio de llamadas telefónicas desde apps de usuario.
   * La duración se calcula con timestamps guardados en localStorage antes de marcar.
   */
  startRecording(callId) {
    this.currentRecordingCallId = callId;
    this.recordingStartTime = new Date();
    console.log('[TelephonyService] Seguimiento de llamada iniciado para callId:', callId);
  }

  /**
   * Finalizar seguimiento de llamada y devolver duración calculada.
   * El audioBlob será siempre null ya que Android no permite grabar llamadas telefónicas.
   */
  async stopRecording() {
    const durationSeconds = this.recordingStartTime
      ? Math.round((new Date() - this.recordingStartTime) / 1000)
      : 0;
    this.recordingStartTime = null;
    this.currentRecordingCallId = null;
    return { durationSeconds, audioBlob: null };
  }

  /**
   * Subir archivo de audio a Hostinger (o guardar offline en cola si falla)
   */
  async uploadAudioToHostinger(audioBlob, callId, clientId) {
    if (!audioBlob) return null;

    const formData = new FormData();
    formData.append('audio', audioBlob, `call_${callId}.m4a`);
    formData.append('call_id', callId);
    formData.append('client_id', clientId || 'unknown');
    formData.append('api_key', 'CF_TELEVENTA_AUDIO_SECURE_2026');

    try {
      const response = await fetch(HOSTINGER_UPLOAD_ENDPOINT, {
        method: 'POST',
        headers: {
          'X-API-KEY': 'CF_TELEVENTA_AUDIO_SECURE_2026'
        },
        body: formData
      });

      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
      const data = await response.json();
      
      if (data.success && data.audio_url) {
        console.log('[TelephonyService] Audio subido exitosamente a Hostinger:', data.audio_url);
        return data.audio_url;
      }
    } catch (err) {
      console.warn('[TelephonyService] Error al subir audio a Hostinger (modo offline activo):', err);
      // Guardar en cola offline de localStorage
      this.enqueueOfflineAudio(callId, clientId, audioBlob);
    }
    return null;
  }

  /**
   * Encolar audio offline para sincronización posterior
   */
  enqueueOfflineAudio(callId, clientId, audioBlob) {
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Audio = reader.result;
        const raw = localStorage.getItem(PENDING_CALL_AUDIOS_KEY);
        const pending = raw ? JSON.parse(raw) : [];
        pending.push({
          callId,
          clientId,
          base64Audio,
          timestamp: new Date().toISOString()
        });
        localStorage.setItem(PENDING_CALL_AUDIOS_KEY, JSON.stringify(pending.slice(-50)));
      };
      reader.readAsDataURL(audioBlob);
    } catch (e) {
      console.warn('[TelephonyService] Error guardando audio offline:', e);
    }
  }

  /**
   * Sincronizar cola de audios pendientes
   */
  async syncPendingAudios() {
    if (!navigator.onLine) return;
    try {
      const raw = localStorage.getItem(PENDING_CALL_AUDIOS_KEY);
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (!pending.length) return;

      const remaining = [];
      for (const item of pending) {
        try {
          const res = await fetch(item.base64Audio);
          const blob = await res.blob();
          const audioUrl = await this.uploadAudioToHostinger(blob, item.callId, item.clientId);
          
          if (audioUrl) {
            // Actualizar Supabase con la URL del audio
            await supabase.from('telesales_calls')
              .update({ audio_url: audioUrl, verified_by_apk: true })
              .eq('id', item.callId);
          } else {
            remaining.push(item);
          }
        } catch (e) {
          remaining.push(item);
        }
      }

      localStorage.setItem(PENDING_CALL_AUDIOS_KEY, JSON.stringify(remaining));
    } catch (e) {
      console.warn('[TelephonyService] Error durante sincronización de audios:', e);
    }
  }
}

export const telephonyCallService = new TelephonyCallService();
