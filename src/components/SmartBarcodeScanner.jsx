import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { X, Keyboard, Camera, Loader2 } from 'lucide-react';

/**
 * SmartBarcodeScanner
 *
 * - On APK/native: uses @capacitor-mlkit/barcode-scanning (native camera overlay)
 * - On web: shows a full-screen camera overlay using react-qr-barcode-scanner
 *           with a manual fallback input if camera fails
 *
 * Props:
 *  - open: boolean  — controls visibility
 *  - onDetected: (text: string) => void  — called with scanned value
 *  - onClose: () => void
 */
// Simple animated scan line using CSS class
function ScanLine() {
  return (
    <div
      className="absolute left-1 right-1 h-0.5 bg-cyan-400/80"
      style={{
        animation: 'scanLine 2s ease-in-out infinite',
        top: '0',
      }}
    />
  );
}

export default function SmartBarcodeScanner({ open, onDetected, onClose }) {
  const [error, setError] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [manualSerial, setManualSerial] = useState('');
  const [ScannerComponent, setScannerComponent] = useState(null);
  const [loadingLib, setLoadingLib] = useState(false);
  const inputRef = useRef(null);

  // Load the web scanner library lazily
  useEffect(() => {
    if (!open || Capacitor.isNativePlatform()) return;
    setLoadingLib(true);
    setError('');
    import('react-qr-barcode-scanner')
      .then((mod) => {
        setScannerComponent(() => mod.default);
      })
      .catch(() => {
        setError('No se pudo cargar el lector. Usa ingreso manual.');
        setManualMode(true);
      })
      .finally(() => setLoadingLib(false));
  }, [open]);

  // Auto-trigger native scan when component opens on native platform
  useEffect(() => {
    if (!open || !Capacitor.isNativePlatform()) return;
    const startNativeScan = async () => {
      try {
        const { BarcodeScanner: MLKit } = await import('@capacitor-mlkit/barcode-scanning');
        const check = await MLKit.checkPermissions();
        let status = check.camera;
        if (status !== 'granted') {
          const request = await MLKit.requestPermissions();
          status = request.camera;
        }
        if (status !== 'granted') {
          setError('No se concedió permiso para usar la cámara.');
          return;
        }
        const { barcodes } = await MLKit.scan();
        if (barcodes?.[0]?.rawValue) {
          onDetected(barcodes[0].rawValue);
          onClose();
        } else {
          onClose();
        }
      } catch (e) {
        console.error('[SmartBarcodeScanner] MLKit error:', e);
        setError('Error al iniciar el escáner nativo');
      }
    };
    startNativeScan();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (manualMode && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [manualMode]);

  if (!open) return null;

  // ── NATIVE APK PATH ── (scan is triggered by the useEffect above)
  if (Capacitor.isNativePlatform()) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
        <div className="bg-slate-900 rounded-2xl p-6 text-center space-y-3 max-w-xs w-full mx-4">
          {error ? (
            <>
              <p className="text-red-400 text-sm">{error}</p>
              <button onClick={onClose} className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm">Cerrar</button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={28} className="animate-spin text-cyan-400" />
              <p className="text-slate-300 text-sm">Abriendo cámara…</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── WEB PATH — Full-screen overlay ───────────────────────────────
  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900/90 backdrop-blur-sm border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <Camera size={18} className="text-cyan-400" />
          <span className="text-sm font-bold text-white">Escanear Código</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setManualMode(m => !m)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              manualMode
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <Keyboard size={14} />
            Manual
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center">
        {manualMode ? (
          /* Manual fallback */
          <div className="w-full max-w-sm px-6 space-y-4">
            <p className="text-gray-400 text-sm text-center">Ingresa el número de serie manualmente</p>
            <input
              ref={inputRef}
              type="text"
              value={manualSerial}
              onChange={e => setManualSerial(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && manualSerial.trim()) {
                  onDetected(manualSerial.trim());
                  onClose();
                }
              }}
              placeholder="Ej: SN-00123456"
              className="w-full bg-gray-900 border-2 border-cyan-500/40 rounded-2xl px-5 py-4 text-white text-center text-lg font-mono focus:border-cyan-500 outline-none tracking-widest"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
            />
            <button
              onClick={() => {
                if (manualSerial.trim()) {
                  onDetected(manualSerial.trim());
                  onClose();
                }
              }}
              disabled={!manualSerial.trim()}
              className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-30 text-white rounded-2xl font-black uppercase text-sm tracking-wider transition-all"
            >
              Confirmar Serie
            </button>
          </div>
        ) : loadingLib ? (
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <Loader2 size={32} className="animate-spin text-cyan-400" />
            <p className="text-sm">Iniciando cámara…</p>
          </div>
        ) : error ? (
          <div className="text-center px-6 space-y-4">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => setManualMode(true)}
              className="px-6 py-3 bg-cyan-700 text-white rounded-xl font-bold text-sm"
            >
              Usar Ingreso Manual
            </button>
          </div>
        ) : ScannerComponent ? (
          <>
            {/* Scanner fills entire area */}
            <ScannerComponent
              width="100%"
              height="100%"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              facingMode="environment"
              onUpdate={(err, result) => {
                if (result?.getText()) {
                  onDetected(result.getText());
                  onClose();
                }
                if (err && err?.name !== 'NotFoundException') {
                  console.warn('[Scanner]', err);
                }
              }}
            />
            {/* Targeting overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-64 h-40">
                {/* Corner markers */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-cyan-400 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-cyan-400 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-cyan-400 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-cyan-400 rounded-br-lg" />
                {/* Scan line */}
                <ScanLine />
              </div>
              <p className="absolute bottom-28 text-xs text-cyan-300/80 font-bold tracking-widest uppercase">
                Apunta al código de barras
              </p>
            </div>
          </>
        ) : null}
      </div>

      <style>{`
        @keyframes scanLine {
          0%, 100% { top: 4px; }
          50% { top: calc(100% - 4px); }
        }
      `}</style>
    </div>
  );
}
