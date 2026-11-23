import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, RotateCcw, Check, SwitchCamera, AlertCircle } from 'lucide-react';

export default function DirectCameraModal({ isOpen, onClose, onCapture, title = 'Tomar Foto del Enfriador' }) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);

    const [facingMode, setFacingMode] = useState('environment');
    const [starting, setStarting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [capturedDataUrl, setCapturedDataUrl] = useState(null);
    const [capturedFile, setCapturedFile] = useState(null);

    const stopStream = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => {
                try { track.stop(); } catch {}
            });
            streamRef.current = null;
        }
        if (videoRef.current) {
            try { videoRef.current.srcObject = null; } catch {}
        }
    };

    const startCamera = async (mode = facingMode) => {
        stopStream();
        setErrorMsg('');
        setStarting(true);
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Tu dispositivo o navegador no soporta cámara en vivo. Verifica los permisos de cámara.');
            }
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { exact: mode },
                        width: { ideal: 1280 },
                        height: { ideal: 1920 }
                    },
                    audio: false
                });
            } catch {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: mode },
                        width: { ideal: 1280 },
                        height: { ideal: 1920 }
                    },
                    audio: false
                });
            }

            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play().catch(() => {});
            }
        } catch (err) {
            console.error('[DirectCameraModal] Camera error:', err);
            setErrorMsg(
                err?.name === 'NotAllowedError'
                    ? 'Permiso de cámara denegado. Activa el permiso de cámara en tu teléfono para tomar la foto en vivo.'
                    : (err?.message || 'No se pudo abrir la cámara. Verifica que ninguna otra app la esté usando.')
            );
        } finally {
            setStarting(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            setCapturedDataUrl(null);
            setCapturedFile(null);
            startCamera(facingMode);
        } else {
            stopStream();
        }
        return () => stopStream();
    }, [isOpen, facingMode]);

    if (!isOpen) return null;

    const handleTakePhoto = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;

        const maxDim = 1280;
        let width = video.videoWidth;
        let height = video.videoHeight;
        if (width > maxDim || height > maxDim) {
            if (width >= height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
            } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
            }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        canvas.toBlob(
            (blob) => {
                if (!blob) return;
                const file = new File([blob], `enfriador_${Date.now()}.jpg`, {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                });
                setCapturedFile(file);
                setCapturedDataUrl(dataUrl);
                stopStream();
            },
            'image/jpeg',
            0.82
        );
    };

    const handleRetake = () => {
        setCapturedDataUrl(null);
        setCapturedFile(null);
        startCamera(facingMode);
    };

    const handleConfirm = () => {
        if (!capturedFile) return;
        stopStream();
        onCapture(capturedFile, capturedDataUrl);
        onClose();
    };

    const handleSwitchCamera = () => {
        setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
            {/* Barra superior */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/80 text-white border-b border-white/10">
                <div className="flex items-center gap-2 min-w-0">
                    <Camera className="w-5 h-5 text-emerald-400 shrink-0" />
                    <span className="font-bold text-sm truncate">{title}</span>
                </div>
                <div className="flex items-center gap-2">
                    {!capturedDataUrl && !errorMsg && (
                        <button
                            type="button"
                            onClick={handleSwitchCamera}
                            title="Cambiar cámara"
                            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                        >
                            <SwitchCamera className="w-5 h-5" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => { stopStream(); onClose(); }}
                        title="Cerrar cámara"
                        className="p-2 rounded-full bg-white/10 hover:bg-rose-600 text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Visor de cámara o foto capturada */}
            <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
                {errorMsg ? (
                    <div className="max-w-sm mx-auto p-6 text-center text-white space-y-4">
                        <AlertCircle className="w-12 h-12 text-amber-400 mx-auto" />
                        <p className="text-sm font-medium text-gray-200">{errorMsg}</p>
                        <button
                            type="button"
                            onClick={() => startCamera(facingMode)}
                            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm"
                        >
                            Reintentar Cámara
                        </button>
                    </div>
                ) : capturedDataUrl ? (
                    <img
                        src={capturedDataUrl}
                        alt="Foto capturada"
                        className="w-full h-full object-contain"
                    />
                ) : (
                    <>
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover"
                        />
                        {starting && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-sm font-semibold">
                                Abriendo cámara...
                            </div>
                        )}
                        {/* Guía sutil de encuadre del enfriador */}
                        <div className="pointer-events-none absolute inset-6 sm:inset-10 border-2 border-white/40 rounded-2xl">
                            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-black/70 text-emerald-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap">
                                Encuadra tu enfriador de frente
                            </span>
                        </div>
                    </>
                )}
                <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Controles inferiores */}
            <div className="px-6 py-5 bg-black/90 border-t border-white/10 flex items-center justify-center gap-6">
                {capturedDataUrl ? (
                    <>
                        <button
                            type="button"
                            onClick={handleRetake}
                            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-sm transition-colors"
                        >
                            <RotateCcw className="w-4 h-4" />
                            <span>Repetir</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm shadow-lg shadow-emerald-900/40 transition-colors"
                        >
                            <Check className="w-5 h-5 stroke-[2.5]" />
                            <span>Usar esta Foto</span>
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        disabled={starting || !!errorMsg}
                        onClick={handleTakePhoto}
                        aria-label="Tomar foto"
                        className="w-18 h-18 rounded-full bg-white border-4 border-emerald-500 shadow-2xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40"
                    >
                        <div className="w-14 h-14 rounded-full bg-emerald-600 flex items-center justify-center text-white">
                            <Camera className="w-7 h-7" />
                        </div>
                    </button>
                )}
            </div>
        </div>
    );
}
