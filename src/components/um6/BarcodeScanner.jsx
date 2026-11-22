import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

/**
 * Minimal barcode scanner using the device camera.
 */
const stopReader = (instance) => {
  if (!instance) return;
  if (typeof instance.reset === 'function') {
    instance.reset();
    return;
  }
  if (typeof instance.stopContinuousDecode === 'function') {
    instance.stopContinuousDecode();
  }
};

export function BarcodeScanner({ active, onDetected, onError }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [permissionError, setPermissionError] = useState(null);

  useEffect(() => {
    if (!active) {
      stopReader(readerRef.current);
      readerRef.current = null;
      return undefined;
    }

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
        if (result?.getText()) {
          onDetected?.(result.getText());
        } else if (
          err &&
          !(err instanceof Error && err.name === 'NotFoundException')
        ) {
          onError?.(err);
        }
      })
      .catch((error) => {
        setPermissionError(error?.message || 'No pudimos acceder a la cámara');
        onError?.(error);
      });

    return () => {
      stopReader(reader);
      readerRef.current = null;
    };
  }, [active, onDetected, onError]);

  return (
    <div className="space-y-2">
      {permissionError && (
        <p className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-200">
          {permissionError}
        </p>
      )}
      <video
        ref={videoRef}
        className="h-64 w-full rounded-2xl border border-white/10 bg-black object-cover"
        muted
        autoPlay
        playsInline
      />
    </div>
  );
}

BarcodeScanner.defaultProps = {
  active: false,
  onDetected: undefined,
  onError: undefined
};
