import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Capacitor } from '@capacitor/core';
import { Camera, RefreshCw, X, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';

/**
 * DirectCameraModal
 * Usa DialogPrimitive (@radix-ui/react-dialog) para integrarse nativamente con la pila
 * de FocusScope y DismissableLayer de Radix cuando se abre dentro de otro Dialog,
 * sin bloquear los eventos sintéticos de React.
 */
export function DirectCameraModal({ open, onClose, onCapture, title = 'Tomar Fotografía' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const lastTriggerRef = useRef(0);
  const [facingMode, setFacingMode] = useState('environment');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [capturing, setCapturing] = useState(false);

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

  const attachStreamToVideo = useCallback(async (videoEl) => {
    if (!videoEl || !streamRef.current) return;
    try {
      if (videoEl.srcObject !== streamRef.current) {
        videoEl.srcObject = streamRef.current;
      }
      await videoEl.play().catch(() => {});
    } catch (e) {}
  }, []);

  const setVideoElementRef = useCallback(
    (node) => {
      videoRef.current = node;
      if (node && streamRef.current) {
        attachStreamToVideo(node);
      }
    },
    [attachStreamToVideo]
  );

  const startCamera = useCallback(
    async (mode) => {
      setLoading(true);
      setError('');
      stopStream();

      try {
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
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;
        if (videoRef.current) {
          await attachStreamToVideo(videoRef.current);
        }
      } catch (err) {
        console.error('[DirectCamera] Error starting camera:', err);
        setError(
          err?.message ||
            'No se pudo acceder a la cámara. Verifica permisos o usa el botón Cámara Nativa.'
        );
      } finally {
        setLoading(false);
      }
    },
    [stopStream, attachStreamToVideo]
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
    }
    // Evitar doble disparo cuando se activa por onTouchEnd + onClick
    const now = Date.now();
    if (now - lastTriggerRef.current < 450) return;
    lastTriggerRef.current = now;

    const video = videoRef.current;
    if (!video || capturing) return;
    setCapturing(true);

    try {
      let attempts = 0;
      while ((!video.videoWidth || !video.videoHeight) && attempts < 8) {
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
          blob.name = fileName;
          blob.lastModified = Date.now();
          file = blob;
        }
        stopStream();
        onCapture(file);
        onClose();
      } else {
        setError('No se pudo capturar la imagen desde el video. Usa el botón Cámara Nativa.');
      }
    } catch (err) {
      console.error('[DirectCamera] Capture error:', err);
      setError('Error al capturar la foto. Usa el botón Cámara Nativa.');
    } finally {
      setCapturing(false);
    }
  };

  return (
    <DialogPrimitive.Root
      open={!!open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          stopStream();
          onClose();
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[20000] bg-black/95" />
        <DialogPrimitive.Content
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-[20001] bg-black flex flex-col select-none outline-none"
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Captura directa de fotografía con cámara
          </DialogPrimitive.Description>

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
                className="px-3 py-1.5 rounded-xl bg-white/10 active:bg-white/25 text-xs font-bold flex items-center gap-1.5 text-white transition touch-manipulation"
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
                className="p-2 rounded-xl bg-rose-500/20 text-rose-300 active:bg-rose-500/40 transition touch-manipulation"
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
                <div className="flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={() => startCamera(facingMode)}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 active:bg-emerald-500 text-white text-xs font-bold touch-manipulation"
                  >
                    Reintentar Cámara
                  </button>
                  <label className="px-4 py-2.5 rounded-xl bg-white/15 active:bg-white/30 text-white text-xs font-bold cursor-pointer inline-block touch-manipulation">
                    Usar Cámara Nativa
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleNativeFileChange}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <video
                ref={setVideoElementRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={(e) => {
                  try {
                    e.currentTarget.play().catch(() => {});
                  } catch {}
                }}
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
              onTouchEnd={(e) => {
                if (!loading && !error && !capturing) {
                  handleTakePhoto(e);
                }
              }}
              className="group flex flex-col items-center gap-1.5 disabled:opacity-40 touch-manipulation cursor-pointer"
            >
              <div className="w-20 h-20 p-1.5 rounded-full border-4 border-emerald-400 flex items-center justify-center active:scale-90 transition-transform">
                <div className="w-16 h-16 rounded-full bg-white active:bg-emerald-400 transition-colors flex items-center justify-center">
                  <Camera className="w-7 h-7 text-slate-950" />
                </div>
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400">
                {capturing ? 'Capturando...' : 'Tomar Foto'}
              </span>
            </button>

            <label className="absolute right-4 px-3 py-2.5 rounded-xl bg-white/10 active:bg-white/25 text-[11px] font-bold text-slate-200 cursor-pointer touch-manipulation">
              Cámara nativa
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleNativeFileChange}
                className="sr-only"
              />
            </label>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
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
