import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { Camera, RefreshCw, X, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';

/**
 * DirectCameraModal
 * Opens the device's live camera directly via WebRTC (getUserMedia),
 * bypassing the OS File Picker / Photo Gallery so users must take a real-time photo.
 */
export function DirectCameraModal({ open, onClose, onCapture, title = 'Tomar Fotografía' }) {
  const overlayRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const nativeInputRef = useRef(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [capturing, setCapturing] = useState(false);

  // Evitar que Radix Dialog (DismissableLayer en document) interprete los toques
  // dentro del portal de cámara como "click afuera" y cierre el modal padre.
  useEffect(() => {
    if (!open) return;
    const el = overlayRef.current;
    if (!el) return;
    const stopNativeBubble = (e) => {
      e.stopPropagation();
    };
    const events = ['pointerdown', 'mousedown', 'touchstart', 'click', 'focusin'];
    events.forEach((evt) => el.addEventListener(evt, stopNativeBubble, false));
    return () => {
      events.forEach((evt) => el.removeEventListener(evt, stopNativeBubble, false));
    };
  }, [open]);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch (e) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(
    async (mode) => {
      setLoading(true);
      setError('');
      stopStream();

      try {
        // Ensure native OS camera permission is granted on Android/iOS APK/IPA
        if (Capacitor.isNativePlatform()) {
          try {
            const { BarcodeScanner: MLKit } = await import('@capacitor-mlkit/barcode-scanning');
            const perm = await MLKit.checkPermissions();
            if (perm.camera !== 'granted') {
              await MLKit.requestPermissions();
            }
          } catch (e) {
            console.warn('[DirectCamera] Native permission check warning:', e);
          }
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Tu navegador o dispositivo no soporta apertura directa de cámara.');
        }

        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: mode },
              width: { ideal: 1280 },
              height: { ideal: 960 },
            },
            audio: false,
          });
        } catch (firstErr) {
          // Fallback to any available video camera
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.error('[DirectCamera] Error starting camera:', err);
        setError(
          err?.message ||
            'No se pudo acceder a la cámara. Verifica que hayas otorgado permisos de cámara.'
        );
      } finally {
        setLoading(false);
      }
    },
    [stopStream]
  );

  useEffect(() => {
    if (open) {
      startCamera(facingMode);
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [open, facingMode, startCamera, stopStream]);

  const dataUrlToBlob = (dataUrl) => {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
  };

  const handleNativeFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    stopStream();
    onCapture(file);
    onClose();
  };

  const handleTakePhoto = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const video = videoRef.current;
    if (!video || capturing) return;
    setCapturing(true);

    try {
      // Si el stream acaba de arrancar, dar hasta 600ms para que reporte dimensiones reales
      let attempts = 0;
      while ((!video.videoWidth || !video.videoHeight) && attempts < 6) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }

      const maxDim = 1280;
      let w = video.videoWidth || video.clientWidth || 1280;
      let h = video.videoHeight || video.clientHeight || 960;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, w, h);

      let blob = await new Promise((resolve) => {
        try {
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85);
        } catch {
          resolve(null);
        }
      });

      // Fallback si Android WebView devuelve null en canvas.toBlob()
      if (!blob) {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        if (dataUrl && dataUrl.startsWith('data:image')) {
          blob = dataUrlToBlob(dataUrl);
        }
      }

      if (blob) {
        const fileName = `evidencia_${Date.now()}.jpg`;
        let file;
        try {
          file = new File([blob], fileName, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
        } catch {
          // Algunos WebViews antiguos no soportan constructor File
          blob.name = fileName;
          blob.lastModified = Date.now();
          file = blob;
        }
        stopStream();
        onCapture(file);
        onClose();
      } else {
        setError('No se pudo capturar la imagen desde el video. Intenta con Cámara Nativa.');
      }
    } catch (err) {
      console.error('[DirectCamera] Capture error:', err);
      setError('Error al capturar la foto. Intenta nuevamente o usa Cámara Nativa.');
    } finally {
      setCapturing(false);
    }
  };

  if (!open) return null;

  const modalContent = (
    <div
      ref={overlayRef}
      style={{ pointerEvents: 'auto' }}
      className="fixed inset-0 z-[20000] pointer-events-auto bg-black flex flex-col select-none"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={nativeInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleNativeFileChange}
        className="hidden"
      />
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950/90 border-b border-white/10 text-white shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Camera className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-bold truncate">{title}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
            }
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1.5 text-white transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {facingMode === 'environment' ? 'Trasera' : 'Frontal'}
          </button>

          <button
            type="button"
            onClick={() => {
              stopStream();
              onClose();
            }}
            className="p-2 rounded-xl bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition"
            aria-label="Cerrar cámara"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Live Video Area */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 text-white gap-2">
            <Loader2 className="w-9 h-9 animate-spin text-emerald-400" />
            <span className="text-xs text-slate-300 font-semibold">Abriendo cámara...</span>
          </div>
        )}

        {error ? (
          <div className="p-6 max-w-xs text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
            <p className="text-sm text-white font-bold">{error}</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => startCamera(facingMode)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold"
              >
                Reintentar Cámara
              </button>
              <button
                type="button"
                onClick={() => nativeInputRef.current?.click()}
                className="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold"
              >
                Usar Cámara Nativa
              </button>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Bottom Shutter Bar */}
      <div className="py-5 px-6 bg-slate-950/95 border-t border-white/10 flex items-center justify-center relative shrink-0">
        <button
          type="button"
          disabled={loading || !!error || capturing}
          onClick={handleTakePhoto}
          className="group flex flex-col items-center gap-1.5 disabled:opacity-40 touch-manipulation pointer-events-auto"
        >
          <div className="w-20 h-20 p-1.5 rounded-full border-4 border-emerald-400 flex items-center justify-center active:scale-90 transition-transform">
            <div className="w-16 h-16 rounded-full bg-white group-hover:bg-emerald-400 transition-colors flex items-center justify-center">
              <Camera className="w-7 h-7 text-slate-950" />
            </div>
          </div>
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400">
            {capturing ? 'Capturando...' : 'Tomar Foto'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => nativeInputRef.current?.click()}
          className="absolute right-4 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold text-slate-200 touch-manipulation"
        >
          Cámara nativa
        </button>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
}

/**
 * DirectCameraField
 * Drop-in photo capture field that opens the live camera directly (never the gallery).
 */
export function DirectCameraField({
  label,
  file,
  previewUrl: externalPreviewUrl,
  onCapture,
  required = false,
  helper = '',
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [localPreview, setLocalPreview] = useState(null);

  useEffect(() => {
    if (file instanceof File || file instanceof Blob) {
      const url = URL.createObjectURL(file);
      setLocalPreview(url);
      return () => URL.revokeObjectURL(url);
    } else if (typeof file === 'string' && file) {
      setLocalPreview(file);
    } else {
      setLocalPreview(null);
    }
  }, [file]);

  const preview = externalPreviewUrl || localPreview;

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-200">
            {label} {required && <span className="text-rose-400">*</span>}
          </span>
          {preview && (
            <button
              type="button"
              onClick={() => onCapture(null)}
              className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold"
            >
              Quitar
            </button>
          )}
        </div>
      )}
      {helper && <p className="text-[11px] text-slate-400">{helper}</p>}

      {preview ? (
        <div
          onClick={() => setOpen(true)}
          className={`relative rounded-xl overflow-hidden border border-emerald-500/40 bg-slate-900 cursor-pointer group ${
            compact ? 'h-28' : 'h-32'
          }`}
        >
          <img src={preview} alt={label || 'Evidencia'} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-1.5 text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="w-4 h-4 text-emerald-400" />
            <span>Tomar de nuevo</span>
          </div>
          <div className="absolute top-2 right-2 bg-emerald-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Capturada
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`w-full rounded-xl border-2 border-dashed border-emerald-500/35 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-400 text-emerald-300 flex flex-col items-center justify-center gap-1.5 transition ${
            compact ? 'py-4 px-3' : 'py-6 px-4'
          }`}
        >
          <Camera className="w-6 h-6 text-emerald-400" />
          <span className="text-xs font-bold">
            Abrir Cámara ({label || 'Tomar Foto'})
          </span>
        </button>
      )}

      <DirectCameraModal
        open={open}
        onClose={() => setOpen(false)}
        title={label || 'Tomar Fotografía'}
        onCapture={(capturedFile) => onCapture(capturedFile)}
      />
    </div>
  );
}

export default DirectCameraField;
